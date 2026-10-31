import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const get = async path => readFile(new URL("../"+path, import.meta.url), "utf8");

test("Music discovery includes all available catalogs, not only Audius", async () => {
  const picker = await get("src/story-music-picker.js");
  assert.match(picker, /searchCatalog=searchStorySongs/);
  assert.match(picker, /received\.push\(\.\.\.tracks\)/);
  assert.match(picker, /items\.filter\(storyMusicCanPublish\)/);
  assert.doesNotMatch(picker, /Vincular meu áudio autorizado/);
  assert.match(picker, /searchLicensed\(term/);
});

test("Admin player stays compact and loads only on user's deliberate click", async () => {
  const source = await get("src/music-admin-playlists.js");
  const styles = await get("assets/css/pages/music.css");
  assert.match(source, /toggle\.addEventListener\("click"/);
  assert.match(source, /iframe\.loading="lazy"/);
  assert.match(source, /toggle\.setAttribute\("aria-expanded"/);
  assert.match(styles, /\.music-admin-playlists[^\n]*min-width:0/);
  assert.match(styles, /\.music-admin-playlist-player iframe\{[^}]*aspect-ratio:16\/9/);
  assert.match(styles, /\.music-admin-playlists select[^\n]*max-width:100%/);
});

test("Android recovery remains native when JavaScript hangs or renderer crashes", async () => {
  const main = await get("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
  assert.match(main, /mainHandler\.postDelayed/);
  assert.match(main, /current\.endsWith\("\/index\.html"\)/);
  assert.match(main, /onRenderProcessGone/);
  assert.match(main, /webView = WebView\(this@MainActivity\)/);
  assert.match(main, /contentDescription = "Recarregar Looply"/);
  assert.match(main, /private fun reloadCurrentPage\(\)/);
  assert.match(main, /onPermissionRequestCanceled/);
});

test("Official owner's logo is used by generator with solid white adaptive background", async () => {
  const icon = await readFile(new URL("../android/icon-source/Looply-official.webp", import.meta.url));
  assert.equal(icon.toString("ascii", 0, 4), "RIFF");
  assert.ok(icon.length >= 1000);
  const script = await get("android/tools/prepare_icon.py");
  const colors = await get("android/app/src/main/res/values/colors.xml");
  assert.match(script, /SOURCE = .*Looply-official\.webp/);
  assert.doesNotMatch(script, /remove_black_backdrop/);
  assert.match(colors, /launcher_background">#FFFFFF/);
});
