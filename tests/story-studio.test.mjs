import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { STORY_CANVAS_SIZE, containRect, storyCanvasSize } from "../src/story-studio.js";

const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const studio = read("src/story-studio.js");
const stories = read("src/stories.js");
const home = read("home.html");
const homeEntrypoint = read("assets/js/home.js");
const styles = read("assets/css/pages/story-studio.css");

test("Stories Studio and original controller parse as ES modules", () => {
  for (const path of ["src/story-studio.js", "src/stories.js"]) {
    const file = new URL("../" + path, import.meta.url);
    const result = spawnSync(process.execPath, ["--check", fileURLToPath(file)], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("Home loads the new editor and cache-busted controller", () => {
  assert.match(home, /story-studio\.css/);
  assert.match(homeEntrypoint, /stories\.js\?v=(portrait-capture-20261026|profile-discovery-20261028)/);
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
    "data-studio-publicar",
    "data-studio-friends", "data-studio-people", "data-studio-send"
  ]) assert.ok(studio.includes(selector), selector);
});

test("Output applies edits without cropping the original media", () => {
  assert.match(studio, /const contain = Math\.min\(w \/ sw, h \/ sh\)/);
  assert.match(studio, /Preserve the whole source frame/);
  assert.match(styles, /studio-edited-media>img,.studio-edited-media>video[^}]*object-fit:contain/);

  assert.match(studio, /drawLiveFrame\(ctx, canvas\)/);
  assert.match(studio, /drawLayer\(lens\)/);
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
  assert.match(read("assets/css/pages/story-reels-viewport-fix.css"), /object-fit:contain !important/);
  assert.match(styles, /\.studio-camera[^{}]*\{[^{}]*object-fit:contain/);
  assert.match(styles, /data-screen-flash=firing/);
  assert.match(styles, /height:100dvh/);
  assert.match(styles, /safe-area-inset-bottom/);
});

test("Only POST and STORY remain in camera mode navigation", async () => {
  const { storyStudioMarkup } = await import("../src/story-studio.js");
  const markup = storyStudioMarkup("");
  assert.match(markup,/data-studio-post/);
  assert.match(markup,/<b>STORY<\/b>/);
  assert.doesNotMatch(markup,/data-studio-reel|data-studio-live|>REEL<|>LIVE</);
  assert.doesNotMatch(markup,/data-studio-stickers/);
});

test("camera photo and recording output preserve the sensor inside portrait 9:16", () => {
  assert.deepEqual(STORY_CANVAS_SIZE, { width: 1080, height: 1920 });
  assert.deepEqual(containRect(1920, 1080, 1080, 1920), {
    x: 0, y: 656.25, width: 1080, height: 607.5
  });
  assert.deepEqual(containRect(1080, 1920, 1080, 1920), {
    x: 0, y: 0, width: 1080, height: 1920
  });
  assert.deepEqual(storyCanvasSize(), { width:1080, height:1920 });
  assert.deepEqual(storyCanvasSize("16:9"), { width:1920, height:1080 });
  assert.deepEqual(storyCanvasSize("3:4"), { width:1440, height:1920 });
  assert.deepEqual(storyCanvasSize("2:5"), { width:768, height:1920 });
  assert.deepEqual(storyCanvasSize("1:1"), { width:1080, height:1080 });
  assert.match(studio, /const captureSize = currentCanvasSize\(\)/);
  assert.match(studio, /layer\.videoWidth \|\| layer\.width \|\| sourceW/);
  assert.match(studio, /const frame = containRect\(sourceW, sourceH, canvas\.width, canvas\.height\)/);
  assert.match(studio, /settings\.face !== "none" && lensReady/);
    const cameraSegment = studio.slice(studio.indexOf("const drawLiveFrame ="),studio.indexOf("const stopCamera ="));
  assert.doesNotMatch(cameraSegment, /ctx\.filter = "blur\(28px\)/);
  assert.match(read("assets/css/pages/story-reels-viewport-fix.css"), /\.studio-camera-backdrop[^{}]*\{\s*display:none !important/);
  assert.match(studio, /const backdropVideo = \$\("\[data-studio-backdrop-video\]"\)/);
  assert.match(styles, /studio-camera-backdrop[^{}]*\{[^{}]*object-fit:cover[^{}]*filter:blur/);
});


test("Final 9:16 portrait capture and licensed audio export meet requested contracts",()=>{
  assert.match(studio,/width: \{ ideal: 1080 \}/);
  assert.match(studio,/height: \{ ideal: 1920 \}/);
  assert.match(studio,/aspectRatio: \{ ideal: 9 \/ 16 \}/);
  assert.match(studio,/withMusic \? 7000 : 15000/);
  assert.match(studio,/source\.start\(\)/);
  assert.match(studio,/recorded\.start\(250\)/);
  assert.match(studio,/attachStoryMusic\(audioCtx, destination, buffer\)/);
  assert.match(studio,/recorded\?\.state === "recording"/);
  assert.match(studio,/container\.dataset\.sheet = title === "Escolher música" \? "music"/);
  assert.match(styles,/Studio 9:16 final pass/);
  assert.match(styles,/studio-modal\[data-sheet="music"\]/);
  const viewerStyle=read("assets/css/pages/home.css");
  assert.match(viewerStyle,/Stories 9:16 immersive composition/);
  assert.match(viewerStyle,/story-media-backdrop/);
  assert.match(viewerStyle,/object-fit: contain !important/);
  assert.match(stories,/data-story-media-backdrop/);
  assert.match(stories,/story-viewer-header-controls/);
  assert.match(stories,/data-story-play-toggle/);
});
