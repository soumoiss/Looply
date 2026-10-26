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
  assert.match(stories, /bindStoryStudio\(root, client, userId, refresh\)/);
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
    "data-studio-flip", "data-studio-filter", "data-studio-face",
    "data-studio-flash", "data-studio-grid-toggle", "data-studio-boomerang",
    "data-studio-caption", "data-studio-music-open", "data-studio-add-text",
    "data-studio-stickers", "data-studio-enhance", "data-studio-publicar",
    "data-studio-friends", "data-studio-people", "data-studio-send"
  ]) assert.ok(studio.includes(selector), selector);
});

test("Output applies edits to exported media, not just CSS preview", () => {
  assert.match(studio, /drawStoryLens\(ctx, lens/);
  assert.match(studio, /paintLayers\(ctx, overlayRoot/);
  assert.match(studio, /makeSynthBuffer\(audioCtx, music\)/);
  assert.match(studio, /canvas\.captureStream\(24\)/);
  assert.match(studio, /renderBoomerang\(savedFrames/);
  assert.match(studio, /ctx\.putImageData\(image/);
});

test("Camera is mirrored only in front mode and mobile layout is isolated", () => {
  assert.match(studio, /facing === "user" \? "scaleX\(-1\)" : "none"/);
  assert.match(styles, /\.studio-camera[^{}]*\{[^{}]*transform:scaleX\(-1\)/);
  assert.match(styles, /height:100dvh/);
  assert.match(styles, /safe-area-inset-bottom/);
});

test("Options without a migrated backend are not misleading clickable actions", () => {
  assert.match(studio, /REEL<\/span>/);
  assert.match(studio, /LIVE<\/span>/);
  assert.match(studio, /aria-disabled="true"/);
});
