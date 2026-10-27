import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { containRect, STORY_CANVAS_SIZE } from "../src/story-studio.js";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Stories canvas remains portrait 1080x1920", () => {
  assert.deepEqual(STORY_CANVAS_SIZE, { width:1080,height:1920 });
});
test("square sensor preserves its full frame without zoom", () => {
  assert.deepEqual(containRect(1080,1080,1080,1920), {x:0,y:420,width:1080,height:1080});
});
test("4:3 landscape sensor is contained without a blurred duplicate", () => {
  assert.deepEqual(containRect(1920,1440,1080,1920), {x:0,y:555,width:1080,height:810});
});
test("already 9:16 sensor remains uncropped", () => {
  assert.deepEqual(containRect(720,1280,1080,1920),{x:0,y:0,width:1080,height:1920});
});
test("invalid camera dimensions fail closed", () => {
  assert.equal(containRect(0,100,1080,1920),null);
  assert.equal(containRect(Infinity,100,1080,1920),null);
});
test("both front and rear camera use same cover preview with preserved facing", async () => {
  const [css, source] = await Promise.all([read("assets/css/pages/story-reels-viewport-fix.css"),read("src/story-studio.js")]);
  assert.match(css,/\.studio-stage\[data-mode="camera"\] \.studio-camera\s*\{/);
  assert.match(css,/object-fit:contain !important/);
  assert.match(source,/settings\.facing === "user" \? "scaleX\(-1\) "/);
  assert.match(source,/\[data-studio-flip\]/);
});
test("camera capture no longer duplicates a blurred background into the encoded photo or video", async () => {
  const source=await read("src/story-studio.js");
  assert.match(source,/const frame = containRect\(sourceW, sourceH, canvas\.width, canvas\.height\)/);
  const cameraSegment = source.slice(source.indexOf("const drawLiveFrame ="),source.indexOf("const stopCamera ="));
  assert.doesNotMatch(cameraSegment,/ctx\.filter = "blur\(28px\)/);
  assert.match(source,/backdropVideo\.srcObject = null/);
  assert.match(source,/drawCamera\(ctx, canvas\)/);
});
test("preview removes fallback blur and contains the complete camera frame", async () => {
  const css=await read("assets/css/pages/story-reels-viewport-fix.css");
  assert.match(css,/\.studio-camera-backdrop\s*\{\s*display:none !important/);
  assert.match(css,/\.studio-lens\s*\{[\s\S]*?object-fit:contain !important/);
});
test("Reels only expose like, comments, external share and chat, no save button", async () => {
  const js=await read("src/home-hybrid-reels.js");
  assert.match(js,/const actions = \["like", "comment", "external", "chat"\]/);
  assert.doesNotMatch(js,/data-reel-action="save"|const actions = \[[^\]]*?"save"/);
  assert.match(js,/\[data-toggle-like\]/);
  assert.match(js,/\[data-share-post\]/);
  assert.match(js,/\[data-share-in-app\]/);
});
test("comment control uses message icon, outside uses two arrows, chat uses paper plane", async () => {
  const js=await read("src/home-hybrid-reels.js");
  assert.match(js,/if \(name === "comment"\) symbol\.innerHTML = '<svg/);
  assert.match(js,/if \(name === "chat"\) symbol\.innerHTML = '<svg/);
  assert.match(js,/external: "⇄"/);
  assert.match(js,/external: "\[data-share-post\]"/);
  assert.match(js,/chat: "\[data-share-in-app\]"/);
});
test("immersive viewer stops former provider iframe audio and supports vertical swipe", async () => {
  const js=await read("src/home-hybrid-reels.js");
  assert.match(js,/for \(const item of feedFrames\) item\.frame\.removeAttribute\("src"\)/);
  assert.match(js,/else if \(source\.frame\.hasAttribute\("src"\)\) source\.frame\.removeAttribute\("src"\)/);
  assert.match(js,/IntersectionObserver/);
  assert.match(js,/track\.addEventListener\("scroll"/);
});
test("Home loads viewport corrections last but preserves its global header", async () => {
  const html=await read("home.html");
  assert.ok(html.indexOf("story-reels-viewport-fix.css")>html.indexOf("home-hybrid.css"));
  assert.match(html,/data-site-header/);
});
test("official Instagram iframe is not zoomed, cropped or scraped into a fake native video", async () => {
  const [js,css]=await Promise.all([read("src/home-hybrid-reels.js"),read("assets/css/pages/story-reels-viewport-fix.css")]);
  assert.match(js,/is-instagram-embed/);
  assert.match(js,/make\("iframe", "looply-reel-embed"\)/);
  assert.match(css,/\.is-instagram-embed \.looply-reel-embed/);
  assert.match(css,/\.is-instagram-embed \.looply-reel-embed\s*\{[^}]*transform:none/);
  assert.doesNotMatch(css,/scale\(2\.15\)/);
});
test("caption and user attribution remain without unnecessary top Reels branding", async () => {
  const [js,css] = await Promise.all([read("src/home-hybrid-reels.js"),read("assets/css/pages/story-reels-viewport-fix.css")]);
  assert.match(js,/<strong class="visually-hidden">Reels<\/strong>/);
  assert.match(js, /data-reels-creator/);
  assert.match(js, /data-reels-caption/);
  assert.match(css,/\.looply-reels-audio\s*\{\s*display:none/);
});

test("cross-origin Reel frame keeps playback center interactive and permits swipe from either edge", async () => {
  const [source,css]=await Promise.all([read("src/home-hybrid-reels.js"), read("assets/css/pages/story-reels-viewport-fix.css")]);
  assert.match(source,/for \(const edge of \["left", "right"\]\)/);
  assert.match(source,/lane\.addEventListener\("touchend"/);
  assert.match(source,/navigate\(current \+ \(diff > 0 \? 1 : -1\)\)/);
  assert.match(css,/\.looply-embed-swipe-lane \{/);
  assert.match(css,/width:13%/);
});
