import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Android Sharesheet advertises supported text, photos and videos without broad file permissions",async()=>{
  const manifest=await read("android/app/src/main/AndroidManifest.xml");
  for(const mime of ["text/plain","image/jpeg","image/png","image/webp","video/mp4","video/webm"])
    assert.match(manifest,new RegExp('android:mimeType="'+mime.replace("/","\\/")+'"'));
  assert.match(manifest,/android:name="\\.ShareReceiverActivity"/);
  assert.match(manifest,/android:exported="true"/);
  assert.doesNotMatch(manifest,/android\\.permission\\.MANAGE_EXTERNAL_STORAGE/);
});
test("shared Android URI is isolated and size limited, never an open file URI proxy",async()=>{
  const kotlin=await read("android/app/src/main/java/com/soumoiss/looply/ShareReceiverActivity.kt");
  assert.match(kotlin,/content\\.scheme == "content"/);
  assert.match(kotlin,/bytes in 1\\.\\.\\(100L \\* 1024L \\* 1024L\\)/);
  assert.match(kotlin,/path != "media"/);
  assert.match(kotlin,/contentResolver\\.openInputStream/);
  assert.match(kotlin,/allowFileAccess = false/);
  assert.match(kotlin,/mixedContentMode = WebSettings\\.MIXED_CONTENT_NEVER_ALLOW/);
});
test("share publishes only after user action and verifies the Neon / R2 media result",async()=>{
  const html=await read("share.html");
  assert.match(html,/addEventListener\\("submit",async event/);
  assert.match(html,/if\\(!session\\?\\.access_token\\)/);
  assert.match(html,/v5_create_post/);
  assert.match(html,/v5_attach_post_media/);
  assert.match(html,/storage\\.from\\("looply-media"\\)\\.upload/);
  assert.match(html,/mediaCheck\\.data\\?\\.some/);
  assert.match(html,/window\\.LooplyShare\\?\\.complete\\(\\)/);
});
