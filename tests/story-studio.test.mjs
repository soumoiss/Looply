import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const studio = read("src/story-studio.js");
const stories = read("src/stories.js");
const home = read("home.html");
const homeEntrypoint = read("assets/js/home.js");
const styles = read("assets/css/pages/story-studio.css");

test("Stories Studio and original controller parse as ES modules", () => {
  for (const path of ["src/story-studio.js", "src/stories.js"]) {
    const file = new URL("../" + path, import.meta.url);
    const result = spawnSync(process.execPath, ["--check", file.pathname], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("Home loads the new editor and cache-busted controller", () => {
  assert.match(home, /story-studio\.css/);
  assert.match(homeEntrypoint, /stories\.js\?v=studio-neon-20261026/);
  assert.match(stories, /storyStudioMarkup\(recipientOptions\)/);
  assert.match(stories, /bindStoryStudio\(root, client, userId, refresh, isAdmin\)/);
  assert.doesNotMatch(stories, /story-create-dialog"/);
});

test("No new story backend uses Spotify or Supabase", () => {
  assert.doesNotMatch(studio, /spotify|supabase/i);
  assert.doesNotMatch(stories, /spotify|supabase/i);
  assert.match(studio, /v5_create_story/);
  assert.match(studio, /v5_attach_story_media/);
  assert.match(studio, /uploadResumable/);
  assert.match(studio, /client\.storage\.from\("looply-media"\)/);
});

test("UI presents camera, gallery, edit tools, and private audience", () => {
  for (const selector of [
    "data-studio-video", "data-studio-file", "data-studio-shutter",
    "data-studio-flip", "data-studio-lens", "data-studio-lens-chooser",
    "data-studio-flash", "data-studio-grid-toggle", "data-studio-boomerang",
    "data-studio-caption", "data-studio-music-open", "data-studio-add-text",
    "data-studio-stickers", "data-studio-publicar",
    "data-studio-friends", "data-studio-people", "data-studio-send"
  ]) assert.ok(studio.includes(selector), selector);
});

test("Output applies edits without cropping the original media", () => {
  assert.match(studio, /const contain = Math\.min\(w \/ sw, h \/ sh\)/);
  assert.match(studio, /complete source image\/video/);
  assert.match(styles, /studio-edited-media>img,.studio-edited-media>video[^{}]*object-fit:contain/);

  assert.match(studio, /drawLiveFrame\(ctx, canvas\)/);
  assert.match(studio, /ctx\.drawImage\(lens, x, y/);
  assert.match(studio, /paintLayers\(ctx, overlayRoot/);
  assert.match(studio, /makeSynthBuffer\(audioCtx, music\)/);
  assert.match(studio, /canvas\.captureStream\(24\)/);
  assert.match(studio, /renderBoomerang\(savedFrames/);
  assert.match(studio, /ctx\.putImageData\(image/);
});

test("Front mirror, real torch, screen flash and pinch zoom use supported camera APIs", () => {
  assert.match(studio, /facing: "user"/);
  assert.match(studio, /"scaleX\(-1\) "/);
  assert.match(studio, /data-studio-screen-light/);
  assert.match(studio, /stage\.dataset\.screenFlash = "firing"/);
  assert.match(studio, /await track\.applyConstraints\(\{ advanced: \[\{ torch: turnOn \}\] \}\)/);
  assert.match(studio, /track\.getSettings\?\.\(\)\.torch/);
  assert.match(studio, /resizeMode: \{ ideal: "none" \}/);
  assert.match(studio, /zoomBase \* settings\.zoom/);
  assert.match(studio, /stage\.addEventListener\("touchstart"/);
  assert.match(studio, /stage\.addEventListener\("touchmove"/);
  assert.match(studio, /const cropW = sourceW \/ factor/);
  assert.match(styles, /\.studio-camera[^{}]*\{[^{}]*object-fit:contain/);
  assert.match(styles, /data-screen-flash=firing/);
  assert.match(styles, /height:100dvh/);
  assert.match(styles, /safe-area-inset-bottom/);
});

test("Only POST and STORY modes are visible", async () => {
  const { storyStudioMarkup } = await import("../src/story-studio.js");
  const markup = storyStudioMarkup("");
  assert.match(markup, /data-studio-post/);
  assert.match(markup, /<b>STORY<\/b>/);
  assert.doesNotMatch(markup, /\bREEL\b|\bLIVE\b|data-studio-reel|data-studio-live/);
});
