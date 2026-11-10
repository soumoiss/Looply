import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (file) => readFile(new URL("../" + file, import.meta.url), "utf8");

test("Musicas entrypoint uses V6 UI and stylesheet in the deployable HTML", async () => {
  const [page, controller, styles, ui] = await Promise.all([
    source("musicas.html"),
    source("assets/js/music.js"),
    source("assets/css/pages/music-v6.css"),
    source("src/music-v6-ui.js")
  ]);
  assert.match(page, /music-v6\.css/);
  assert.match(page, /assets\/js\/music\.js/);
  assert.match(controller, /music-v6-ui\.js/);
  for (const tab of ["playlist", "dedications", "collection"]) {
    assert.ok(controller.includes('data-music-v6-tab="' + tab + '"'), "missing " + tab);
  }
  assert.match(controller, /bindMusicEvents\(root/);
  assert.match(controller, /bindYouTubePlaylist\(root/);
  assert.match(controller, /setupMusicRealtime\(client/);
  assert.match(controller, /mountMusicV6Ui\(root\)/);
  assert.match(styles, /\.page-music \.music-v6-tabs/);
  assert.match(styles, /\.music-v6-playlist-hero/);
  assert.match(ui, /data-music-v6-compose/);
});

test("GitHub Pages workflow includes Music V6 assets and never cancels active deployments", async () => {
  const yaml = await source(".github/workflows/pages.yml");
  assert.match(yaml, /cancel-in-progress: false/);
  for (const path of [
    "dist/musicas.html",
    "dist/assets/js/music.js",
    "dist/assets/css/pages/music-v6.css",
    "dist/src/music-v6-ui.js"
  ]) assert.ok(yaml.includes(path), "missing production validation for " + path);
});

test("Music receives a safe service worker refresh without deleting edits", async () => {
  const service = await source("src/service-worker.js");
  assert.match(service, /classList\.contains\("page-music"\)/);
  assert.match(service, /music-composer\[open\]/);
  assert.match(service, /audio\.paused/);
  assert.match(service, /location\.reload\(\)/);
});
