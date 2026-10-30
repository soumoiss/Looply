import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = file => readFile(new URL("../"+file, import.meta.url),"utf8");

test("Reel-only video share with EXTRA_TEXT never requires an EXTRA_STREAM",async()=>{
  const native=await read("android/app/src/main/java/com/soumoiss/looply/ShareReceiverActivity.kt");
  const manifest=await read("android/app/src/main/AndroidManifest.xml");
  assert.match(native,/getCharSequenceExtra\(Intent\.EXTRA_TEXT\)/);
  assert.match(native,/getParcelableExtra<Uri>\(Intent\.EXTRA_STREAM\)/);
  assert.match(native,/intent\.clipData\?\.getItemAt\(0\)\?\.uri/);
  assert.match(native,/sharedUri == null && !hasSupportedExternalLink\(sharedText\)/);
  assert.doesNotMatch(native,/intent\.type != "text\/plain" \|\| sharedText\.isBlank\(\)/);
  assert.match(manifest,/android:mimeType="video\/\*"/);
});
test("Only HTTPS supported social platforms are treated as shareable links",async()=>{
  const native=await read("android/app/src/main/java/com/soumoiss/looply/ShareReceiverActivity.kt");
  assert.match(native,/private fun hasSupportedExternalLink\(value: String\): Boolean/);
  assert.match(native,/parsed\.scheme\.equals\("https", true\)/);
  assert.match(native,/parsed\.host\?\.lowercase\(\) in allowed/);
  assert.match(native,/instagram\.com/);
  assert.doesNotMatch(native,/startsWith\("instagram\.com"\)/);
});
test("APK share form uses packaged assets and never redirects to a remote 404",async()=>{
  const native=await read("android/app/src/main/java/com/soumoiss/looply/ShareReceiverActivity.kt");
  const build=await read("scripts/build.mjs");
  assert.match(native,/WebViewAssetLoader\.AssetsPathHandler\(this\)/);
  assert.match(native,/addPathHandler\("\/Looply\/"/);
  assert.match(native,/path != "media"/);
  assert.match(native,/onReceivedHttpError/);
  assert.match(native,/showLocalShareError/);
  assert.match(native,/loadDataWithBaseURL/);
  assert.match(native,/Não foi possível abrir o compartilhamento/);
  assert.match(build,/"share\.html"/);
});
test("Share form remains cancelable before the asynchronous client module is loaded",async()=>{
  const html=await read("share.html");
  const inline=html.indexOf('document.getElementById("cancel").addEventListener("click"');
  const module=html.indexOf('<script type="module">');
  assert.ok(inline>0 && inline<module);
  assert.match(html,/LooplyShare\?\.complete\(\)/);
  assert.match(html,/if\(!session\?\.access_token\)/);
  assert.match(html,/v5_create_post/);
  assert.match(html,/v5_attach_post_media/);
  assert.match(html,/mediaCheck\.data\?\.some/);
});
test("Admin playlist respects a narrow viewport, lazy player and no fixed large min-height",async()=>{
  const css=await read("assets/css/pages/music.css");
  const src=await read("src/music-admin-playlists.js");
  assert.match(src,/toggle\.addEventListener\("click"/);
  assert.match(src,/iframe\.loading="lazy"/);
  assert.match(css,/\.music-admin-playlists\{\s*width:100%; min-width:0; max-width:100%;/);
  assert.match(css,/\.music-admin-player-toggle\{\s*display:block; overflow-wrap:anywhere/);
  assert.match(css,/\.music-admin-playlist-player iframe\{aspect-ratio:16\/9; min-height:0/);
  assert.doesNotMatch(css,/\.music-admin-playlist-player iframe\{min-height:200px\}/);
  assert.match(css,/@media\(max-width:360px\)/);
});
test("White official icon is padded for adaptive circular masks",async()=>{
  const script=await read("android/tools/prepare_icon.py");
  assert.match(script,/SOURCE = .*Looply-official\.webp/);
  assert.match(script,/scaled_size = round\(size \* 0\.86\)/);
  assert.match(script,/outside the adaptive safe zone/);
  assert.match(script,/Image\.new\("RGBA", \(size, size\), \(255, 255, 255, 255\)\)/);
});
test("Native reload never masks the web settings control",async()=>{
  const main=await read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
  assert.match(main,/contentDescription = "Recarregar Looply"/);
  assert.doesNotMatch(main,/root\.addView\(reloadControl/);
  assert.match(main,/onRenderProcessGone/);
  assert.match(main,/private fun reloadCurrentPage\(\)/);
});
