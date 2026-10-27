import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {storyStudioMarkup} from "../src/story-studio.js";
import {storiesMarkup} from "../src/stories.js";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Story visual overhaul includes the four real layouts and does not duplicate the underlying application",()=>{
  const studio=storyStudioMarkup("");
  const viewer=storiesMarkup([],null,[],null,"test-user",{username:"test"});
  for(const control of [
    "data-studio-close","data-studio-flash","data-studio-settings",
    "data-studio-text-mode","data-studio-boomerang","data-studio-grid-toggle",
    "data-studio-camera-more","data-studio-timer","data-studio-handsfree",
    "data-studio-lens-chooser","data-studio-file","data-studio-shutter","data-studio-flip",
    "data-studio-add-text","data-studio-music-open",
    "data-studio-effects-open","data-studio-editor-more","data-studio-mentions-open",
    "data-studio-caption","data-studio-publicar","data-studio-friends","data-studio-send",
    "data-studio-visibility"
  ]) assert.ok(studio.includes(control),"Missing actual controller selector "+control);
  for(const control of [
    "data-story-viewer-avatar","data-story-viewer-name","data-story-viewer-time",
    "data-story-viewer-music-label","data-story-close-friends","data-story-progress-list",
    "data-story-viewer-media","data-story-play-toggle","data-story-close",
    "data-story-insights-open","data-story-share",
    "data-story-mention-add","data-story-more",
    "data-story-save","data-story-delete","data-story-like",
    "data-story-reply","data-story-quick-reactions-toggle","data-story-quick-reaction","data-story-action-status"
  ])assert.ok(viewer.includes(control),"Missing viewer action "+control);
  assert.doesNotMatch(viewer,/data-story-boost|data-story-highlight/);
  assert.match(viewer,/data-story-owner-actions[^>]*hidden/);
  assert.match(viewer,/data-story-reply-actions[^>]*hidden/);
});

test("Editor and viewer new actions have production handlers instead of dead demonstration HTML",()=>{
  const studio=read("src/story-studio.js"),viewer=read("src/stories.js");
  for(const selector of [
    "data-studio-camera-more","data-studio-editor-more","data-studio-effects-open",
    "data-studio-timer","data-studio-handsfree","data-studio-send","data-studio-friends"
  ])assert.ok(studio.includes('["'+selector+'"]') || studio.includes('"['+selector+']"'),selector);
  for(const selector of [
    "data-story-share","data-story-save","data-story-more",
    "data-story-mention-confirm","data-story-quick-reactions-toggle"
  ])assert.ok(viewer.includes('['+selector+']'),selector);
  assert.match(viewer,/navigator\.share/);
  assert.match(viewer,/navigator\.clipboard/);
  assert.match(viewer,/v5_add_story_mentions/);
  assert.match(viewer,/send_story_reply/);
  assert.match(studio,/data-studio-filter/);
  assert.match(studio,/FILTERS\[editFilter\]/);
  assert.match(studio,/cameraTimerSeconds/);
  assert.match(studio,/beginRecording\(\)/);
  assert.doesNotMatch(studio,/fetch\(\s*["']https?:\/\/api\.deezer\.com\/search/);
});

test("Visual system loads last with full-screen contain media, owner and reply toolbars",()=>{
  const css=read("assets/css/pages/stories-four-screens.css");
  const home=read("home.html");
  assert.match(home,/stories-four-screens\.css/);
  assert.ok(home.indexOf("stories-four-screens.css") > home.indexOf("story-studio.css"));
  assert.match(css,/\.story-viewer-dialog \.story-viewer-owner-actions/);
  assert.match(css,/\.story-viewer-dialog \.story-viewer-reply-actions/);
  assert.match(css,/\.story-studio \.studio-capture-row/);
  assert.match(css,/\.story-studio \.studio-edit-top/);
  for(const path of ["src/story-studio.js","src/stories.js"]){
    const run=spawnSync(process.execPath,["--check",fileURLToPath(new URL("../"+path,import.meta.url))],{encoding:"utf8"});
    assert.equal(run.status,0,run.stderr);
  }
});

test("Layout button truly composes four camera captures into a 9:16 2×2 image",()=>{
  const studio=read("src/story-studio.js");
  const css=read("assets/css/pages/stories-four-screens.css");
  assert.match(studio,/let collageCanvas = null, collageShots = 0/);
  assert.match(studio,/const cellWidth = collageCanvas.width\/2/);
  assert.match(studio,/const cellX=\(collageShots%2\)\*cellWidth/);
  assert.match(studio,/collageCanvas\.getContext\("2d"\)\.drawImage\(canvas,cellX,cellY,cellWidth,cellHeight\)/);
  assert.match(studio,/if \(collageShots<4\)/);
  assert.match(studio,/story-layout-/);
  assert.match(css,/2×2 collage guides match the actual/);
});

test("Only the edit-sidebar music button remains; its sheet can remove the selected track", () => {
  const markup = storyStudioMarkup("");
  const triggers = markup.match(/data-studio-music-open/g) || [];
  assert.equal(triggers.length, 1, "There must be one edit music trigger, not a header duplicate");
  const top = markup.slice(markup.indexOf('class="studio-edit-top'), markup.indexOf('class="studio-edit-tools'));
  assert.doesNotMatch(top, /data-studio-music-open|data-studio-music-remove|studio-audio-pill/);
  assert.match(markup, /studio-music-side-button" data-studio-music-open/);
  const controller = read("src/story-studio.js");
  assert.match(controller, /remove\.dataset\.studioMusicRemove = ""/);
  assert.match(controller, /remove\.textContent = "Remover música selecionada"/);
  assert.match(controller, /\$\("\[data-studio-music-indicator\]"\)\.hidden = true/);
  assert.match(controller, /stopMusicPreview\(\)/);
});
