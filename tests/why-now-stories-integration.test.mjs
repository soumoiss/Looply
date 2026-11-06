import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Why Now v3 ships as a complete source without replacing the Feed or profile controller", () => {
  const html = read("why-now.html");
  const home = read("assets/js/home.js");
  const build = read("scripts/build.mjs");
  assert.ok(html.length > 120_000);
  for (const id of ["id=\"camera\"","id=\"editor\"","id=\"viewer\"","id=\"native-image-picker\"",
    "id=\"native-video-picker\"","id=\"wn-music-studio\"","id=\"btn-publish\""])
    assert.ok(html.includes(id), "missing Why Now control: " + id);
  assert.match(html,/capture="environment"/);
  assert.match(html,/src="src\/why-now-embedded\.js/);
  assert.match(home,/mountWhyNowStories/);
  assert.match(home,/bindSocialEvents\(root, client/);
  assert.doesNotMatch(home,/bindStories\(root, client/);
  assert.match(home,/whyNow\.refresh\(\)/);
  assert.match(build,/"why-now\.html"/);
});

test("Why Now uses authenticated story RPCs and user-specific viewer receipts", () => {
  const bridge = read("src/why-now-integration.js");
  for (const rpc of ["v5_create_story","v5_attach_story_media","send_story_reply"])
    assert.ok(bridge.includes(rpc), "missing server RPC " + rpc);
  assert.match(bridge,/recordStoryView\(client, storyId, user\.id\)/);
  assert.match(read("src/story-view-receipt.js"),/client\.rpc\("record_story_view"/);
  assert.match(bridge,/story_likes/);
  assert.match(bridge,/story_views/);
  assert.match(bridge,/story_media/);
  assert.match(bridge,/storage\.from\("looply-media"\)/);
  assert.match(bridge,/loadStories\(client, user\.id\)/);
  assert.match(bridge,/story\.author_id !== user\.id/);
  assert.match(bridge,/event\.origin !== location\.origin/);
  assert.match(bridge,/event\.source !== frame\.contentWindow/);
  assert.match(bridge,/story\.expires_at|groupActiveStories\(records\)/);
});

test("Music selector reuses Looply music discovery, not local iTunes-only search", () => {
  const embedded = read("src/why-now-embedded.js");
  const original = read("src/story-music-picker.js");
  assert.match(embedded,/import\("\.\/story-music-picker\.js/);
  assert.match(embedded,/openStoryMusicPicker/);
  assert.match(original,/searchSpotify/);
  assert.match(original,/searchLicensed/);
  assert.match(original,/searchCatalog/);
  assert.match(embedded,/catalogTrack/);
  assert.match(embedded,/wnExportWithMusic/);
});

test("Bridge scripts and each original inline Why Now script are syntactically valid", () => {
  for (const path of ["src/why-now-embedded.js","src/why-now-integration.js","assets/js/home.js"]) {
    const result = spawnSync(process.execPath, ["--check", fileURLToPath(new URL("../" + path, import.meta.url))], { encoding:"utf8" });
    assert.equal(result.status,0,path + ": " + result.stderr);
  }
  const html = read("why-now.html");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
  assert.equal(scripts.length,3);
  for (const [index,code] of scripts.entries()) {
    const result = spawnSync(process.execPath, ["--check", "--input-type=commonjs"], { input:code, encoding:"utf8" });
    assert.equal(result.status,0,"Why Now inline script #" + index + ": " + result.stderr);
  }
});
