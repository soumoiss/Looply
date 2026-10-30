import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Android media acceptance uses a real bundled HTTPS document, not transient data",async()=>{
  const [html,probe,manifest] = await Promise.all([
    readFile(new URL("../dist/assets/test/android-media-acceptance.html",import.meta.url),"utf8"),
    readFile(new URL("../android/app/src/androidTest/java/com/soumoiss/looply/RealWebViewIntegrationTest.kt",import.meta.url),"utf8"),
    readFile(new URL("../android/app/src/main/AndroidManifest.xml",import.meta.url),"utf8")
  ]);
  assert.match(html,/Looply Android WebView camera and microphone acceptance/);
  assert.match(probe,/loadUrl\("https:\/\/soumoiss\.github\.io\/Looply\/assets\/test\/android-media-acceptance\.html"\)/);
  assert.doesNotMatch(probe,/loadDataWithBaseURL/);
  assert.match(probe,/navigator\.mediaDevices\.getUserMedia/);
  assert.match(probe,/new MediaRecorder\(stream/);
  assert.match(manifest,/android\.permission\.MODIFY_AUDIO_SETTINGS/);
  assert.match(manifest,/android\.permission\.RECORD_AUDIO/);
});
