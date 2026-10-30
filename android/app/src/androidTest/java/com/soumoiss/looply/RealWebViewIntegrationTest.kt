package com.soumoiss.looply

import android.Manifest
import android.content.Context
import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.core.app.ActivityScenario
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Runtime tests run inside an Android Emulator, with an actual Android System
 * WebView, permissions and MediaRecorder. No fake backend and no mock APK.
 *
 * Real user login, remote R2, Firebase receipt and cross-device TURN still need
 * independent authenticated acceptance tests.
 */
@RunWith(AndroidJUnit4::class)
class RealWebViewIntegrationTest {
    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                val result = findWebView(view.getChildAt(i))
                if (result != null) return result
            }
        }
        return null
    }

    private fun eval(scenario: ActivityScenario<MainActivity>, js: String): String {
        val latch = CountDownLatch(1)
        val response = AtomicReference<String>("")
        scenario.onActivity { activity ->
            val web = findWebView(activity.window.decorView)
            if (web == null) {
                response.set("\"missing-webview\"")
                latch.countDown()
            } else {
                web.evaluateJavascript(js) { result ->
                    response.set(result)
                    latch.countDown()
                }
            }
        }
        assertTrue("Android WebView JS callback timed out", latch.await(7, TimeUnit.SECONDS))
        return response.get()
    }

    @Test fun bundledWebViewActuallyLoadsARealPage() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            var last = ""
            for (attempt in 0 until 20) {
                last = eval(scenario,
                    "JSON.stringify({url:location.href,ready:document.readyState,body:document.body?.textContent?.length||0})")
                if (last.contains("/Looply/")) break
                Thread.sleep(350)
            }
            assertFalse("WebView was not created", last.contains("missing-webview"))
            assertTrue("WebView did not load the embedded /Looply/ page: $last",
                last.contains("/Looply/"))
        }
    }

    @Test fun AndroidWebViewCanRecordCameraAndMicrophoneTogether() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = ApplicationProvider.getApplicationContext<Context>()
        instrumentation.uiAutomation.grantRuntimePermission(
            context.packageName, Manifest.permission.CAMERA)
        instrumentation.uiAutomation.grantRuntimePermission(
            context.packageName, Manifest.permission.RECORD_AUDIO)
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            // Wait for an HTTPS document from the local WebViewAssetLoader.
            var ready = false
            for (attempt in 0 until 25) {
                val state = eval(scenario,"JSON.stringify({secure:isSecureContext,ready:document.readyState,url:location.href})")
                if (state.contains("\\\"secure\\\":true") && state.contains("/Looply/")) {
                    ready = true
                    break
                }
                Thread.sleep(300)
            }
            assertTrue("Local WebView origin is not secure",ready)
            // The host CI audio injector observes this diagnostic marker and
            // starts gRPC PCM transfer only after the real WebView is loaded.
            android.util.Log.i("LooplyMicCapture", "LOOPLY_CAPTURE_READY")
            Thread.sleep(1800)
            eval(scenario, """
                (() => {
                  window.__looplyCaptureProof = {state:'pending'};
                  (async()=> {
                    let stream;
                    try {
                      stream=await navigator.mediaDevices.getUserMedia({
                        audio:true,video:{facingMode:{ideal:'environment'}}
                      });
                      const tracks=stream.getTracks();
                      const audio=tracks.filter(t=>t.kind==='audio'&&t.readyState==='live');
                      const video=tracks.filter(t=>t.kind==='video'&&t.readyState==='live');
                      if(!audio.length||!video.length)throw Error('camera_or_microphone_missing');
                      const mime=['video/webm;codecs=vp8,opus','video/webm']
                        .find(t=>MediaRecorder.isTypeSupported(t));
                      if(!mime)throw Error('android_webview_mediarecorder_unsupported');
                      const record=new MediaRecorder(stream,{mimeType:mime});
                      let bytes=0;
                      record.ondataavailable=e=>{bytes+=e.data?.size||0};
                      record.onstop=()=>{
                        window.__looplyCaptureProof={
                          state:bytes>100?'ok':'empty',
                          audio:audio.length,video:video.length,bytes
                        };
                        tracks.forEach(t=>t.stop());
                      };
                      record.onerror=e=>{
                        window.__looplyCaptureProof={
                          state:'error',reason:String(e.error?.name||'media_recorder_error')
                        };
                        tracks.forEach(t=>t.stop());
                      };
                      record.start(300);
                      setTimeout(()=>record.stop(),1200);
                    }catch(e){
                      stream?.getTracks().forEach(t=>t.stop());
                      window.__looplyCaptureProof={state:'error',
                        reason:String(e.name||'Error')+':'+String(e.message||'').slice(0,140)};
                    }
                  })();
                  return 'capture-started';
                })()
            """.trimIndent())
            var proof = ""
            for (attempt in 0 until 28) {
                Thread.sleep(500)
                proof=eval(scenario,"JSON.stringify(window.__looplyCaptureProof)")
                if(proof.contains("\\\"state\\\":\\\"ok\\\"")
                    ||proof.contains("\\\"state\\\":\\\"error\\\"")
                    ||proof.contains("\\\"state\\\":\\\"empty\\\""))
                    break
            }
            assertTrue("WebView audio+video MediaRecorder failed: $proof",
                proof.contains("\\\"state\\\":\\\"ok\\\""))
        }
    }

    @Test fun VideoMimeSharesheetWithOnlyInstagramUrlStaysInsideLooply() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val intent=Intent(context,ShareReceiverActivity::class.java).apply {
            action=Intent.ACTION_SEND
            type="video/mp4"
            putExtra(Intent.EXTRA_TEXT,"https://www.instagram.com/reel/C8Example/")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ActivityScenario.launch<ShareReceiverActivity>(intent).use { scenario ->
            scenario.onActivity { activity ->
                assertFalse("Valid shared Reel must not be rejected",activity.isFinishing)
                assertNotNull("ShareReceiverActivity content is missing",
                    findWebView(activity.window.decorView))
            }
        }
    }
}
