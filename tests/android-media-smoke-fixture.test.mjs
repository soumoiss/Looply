import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Android media acceptance uses a real bundled HTTPS document, not transient data",async()=>{
  const [html,probe,manifest,activity] = await Promise.all([
    readFile(new URL("../dist/assets/test/android-media-acceptance.html",import.meta.url),"utf8"),
    readFile(new URL("../android/app/src/androidTest/java/com/soumoiss/looply/RealWebViewIntegrationTest.kt",import.meta.url),"utf8"),
    readFile(new URL("../android/app/src/main/AndroidManifest.xml",import.meta.url),"utf8"),
    readFile(new URL("../android/app/src/main/java/com/soumoiss/looply/MainActivity.kt",import.meta.url),"utf8")
  ]);
  assert.match(html,/Looply Android WebView camera and microphone acceptance/);
  assert.match(activity,/webView\.loadUrl\(DEBUG_CAMERA_FIXTURE_URL\)/);
  assert.match(activity,/appassets\.androidplatform\.net\/Looply\/assets\/test\/android-media-acceptance\.html/);
  assert.match(activity,/BuildConfig\.DEBUG/);
  assert.match(probe,/putExtra\("looply\.debug\.MEDIA_ACCEPTANCE", true\)/);
  assert.doesNotMatch(probe,/loadDataWithBaseURL/);
  assert.match(probe,/navigator\.mediaDevices\.getUserMedia/);
  assert.match(probe,/new MediaRecorder\(stream/);
  assert.match(manifest,/android\.permission\.MODIFY_AUDIO_SETTINGS/);
  assert.match(manifest,/android\.permission\.RECORD_AUDIO/);
});
