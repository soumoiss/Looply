import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const read = (path) => readFile(resolve(process.cwd(), path), "utf8");

test("Stories viewer has theme-aware title and safe responsive media sizing", async () => {
  const css = await read("assets/css/pages/home.css");
  assert.match(css, /\.story-area-heading h2\s*\{\s*color:\s*var\(--text\)/);
  assert.match(css, /\.story-viewer-media img, \.story-viewer-media video[^{]*\{[^}]*object-fit:\s*contain/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.story-viewer-caption[^{}]*\{[^}]*overflow-y:\s*auto/);
});

test("Story creation can switch between front and rear cameras without replacing the upload backend", async () => {
  const source = await read("src/stories.js");
  assert.match(source, /data-story-camera-flip/);
  assert.match(source, /state\.cameraFacing === "environment" \? "user" : "environment"/);
  assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(source, /uploadResumable\(client, uploadedPath, media/);
  assert.match(source, /from\("story_media"\)/);
});

test("Story viewer supports tap-to-pause and resume without intercepting action buttons", async () => {
  const source = await read("src/stories.js");
  assert.match(source, /data-story-play-toggle/);
  assert.match(source, /const setStoryPaused = \(paused\)/);
  assert.match(source, /touchSurface\.addEventListener\("click"/);
  assert.match(source, /event\.target\.closest\("button, a, input, form/);
  assert.match(source, /setStoryPaused\(!state\.paused\)/);
});

test("Story likes and realtime synchronization remain server-backed", async () => {
  const source = await read("src/stories.js");
  assert.match(source, /from\("story_likes"\)\.insert/);
  assert.match(source, /from\("story_likes"\)\.delete/);
  assert.match(source, /setupStoriesRealtime/);
  assert.match(source, /postgres_changes/);
  assert.match(source, /table: "stories"/);
});
