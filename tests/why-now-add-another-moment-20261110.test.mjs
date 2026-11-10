import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("owner avatar creates a new moment even when previously published", () => {
  const parent = read("src/why-now-integration.js");
  assert.match(parent, /if\(ownAccount\)\{open\("open-create"\);return;\}/);
  assert.doesNotMatch(parent, /if\(ownAccount&&!recent\.length\)/);
  // Other members still open their latest published moment.
  assert.match(parent, /if\(recent\.length\)open\("open-story",\{storyId:recent\[0\]\.id\}\)/);
  assert.match(parent, /create\.addEventListener\("click",\(\)=>open\("open-create"\)\)/);
});

test("embedded own-avatar retains the visible plus and opens the new source sheet", () => {
  const adapter = read("src/why-now-embedded.js");
  assert.match(adapter, /if \(own\) \{ const plus = document\.createElement\("span"\)/);
  assert.match(adapter, /if \(own\) \{ openCreateSourcePicker\(\); return; \}/);
  assert.match(adapter, /window\.whyNowOpenCreate=\(\)=>\{openCreateSourcePicker\(\);\};/);
  // It remains possible to watch already published moments.
  assert.match(adapter, /window\.whyNowOwnPublishedCount = \(\) => ownPublishedRecords\(\)\.length/);
  assert.match(adapter, /window\.whyNowShowOwnPublished = \(\) =>/);
  assert.match(adapter, /openViewer\(published, 0, "home"\)/);
});

test("new moment source sheet retains the original 4 sources plus existing-moments access", () => {
  const html = read("why-now.html");
  const start = html.indexOf("function openCreateSourcePicker()");
  const end = html.indexOf("function navCamera()", start);
  assert.ok(start >= 0 && end > start, "source picker must exist");
  const picker = html.slice(start, end);
  for (const key of ["wn-source-app", "wn-source-photo", "wn-source-video", "wn-source-gallery",
    "wn-source-existing", "wn-source-cancel"]) assert.ok(picker.includes(key), key);
  assert.match(picker, /window\.whyNowOwnPublishedCount/);
  assert.match(picker, /window\.whyNowShowOwnPublished/);
  assert.match(picker, /existingCount \?/);
  assert.match(html, /\$\{hasOwn\?'Seu Why Now':'Criar agora'\}/);
  assert.doesNotMatch(html, /hasOwn\?'':`<span class="own-plus"/);
  assert.match(html, /\$\{icon\('plus','ic'\) \}/);
  assert.match(html, /\$\('#story-self'\)\.onclick=\(\)=>openCreateSourcePicker\(\)/);
});

test("the correction changes no CSS stylesheets, camera internals or publishing handlers", () => {
  // Source contract: the existing visual classes and actual server-side creation are retained.
  const parent = read("src/why-now-integration.js");
  const source = read("why-now.html");
  assert.match(parent, /why-now-own-plus/);
  assert.match(parent, /v5_create_story/);
  assert.match(parent, /v5_attach_story_media/);
  assert.match(source, /function nativeCapture\(kind='image'\)/);
  assert.match(source, /function openCreateSourcePicker\(\)/);
  const check = spawnSync(process.execPath, ["--check", "--input-type=commonjs"], {
    encoding: "utf8",
    input: source.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1] || "",
  });
  assert.equal(check.status, 0, check.stderr);
});
