import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Reels player is a centered provider iframe, not a cropped stretched third-party video",()=>{
  const src=read("src/home-hybrid-reels.js");
  const css=read("assets/css/pages/reels-immersive-fix.css");
  assert.match(src,/looply-reel-media-stage/);
  assert.match(src,/is-portrait-player/);
  assert.match(src,/is-landscape-player/);
  assert.match(css,/\\.is-landscape-player \\.looply-reel-embed/);
  assert.match(css,/aspect-ratio:9\\/16/);
  assert.match(css,/aspect-ratio:16\\/9/);
  assert.match(css,/object-fit:contain!important/);
  assert.doesNotMatch(css,/(?:\\{|;)\\s*object-fit:\\s*cover\\s*;/i);
  assert.doesNotMatch(css,/transform:\\s*scale\\(/);
  assert.match(src,/source\\.kind === "embed"/);
  assert.match(src,/frame\\.src = source\\.source/);
  assert.match(src,/\\["www\\.instagram\\.com","www\\.tiktok\\.com","www\\.youtube-nocookie\\.com"\\]/);
});

test("Author light-surface inheritance is explicitly neutralized for dark Reels",()=>{
  const css=read("assets/css/pages/reels-immersive-fix.css");
  assert.match(css,/\\[data-reels-creator\\].*\\.post-author-profile/s);
  assert.match(css,/background-color:transparent!important/);
  assert.match(css,/\\[data-reels-creator\\] strong/);
  assert.match(css,/\\[data-reels-creator\\] time/);
  assert.match(css,/\\.post-avatar img/);
  assert.match(css,/color:#fff!important/);
  const src=read("src/home-hybrid-reels.js");
  assert.match(src,/author\\.cloneNode\\(true\\)/);
  assert.match(src,/data-reels-caption/);
  assert.match(src,/data-reels-original|data-reels-provider-original/);
  assert.doesNotMatch(src,/Player oficial · áudio controlado pelo provedor/);
  assert.match(src,/Áudio original/);
});

test("Fullscreen style applies on both real entrypoints without touching native APK",()=>{
  for(const page of ["home.html","reels.html"])
    assert.match(read(page),/assets\\/css\\/pages\\/reels-immersive-fix\\.css/);
  const code=read("src/home-hybrid-reels.js");
  const checked=spawnSync(process.execPath,["--check",new URL("../src/home-hybrid-reels.js",import.meta.url).pathname],{encoding:"utf8"});
  assert.equal(checked.status,0,checked.stderr);
  assert.match(code,/data-reel-action/);
  assert.match(code,/data-reels-comments/);
  assert.match(code,/data-share-in-app/);
  assert.match(code,/data-share-post/);
  assert.match(code,/data-toggle-like/);
  assert.match(code,/source\\.frame\\.removeAttribute\\("src"\\)/);
});
