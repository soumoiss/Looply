import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const contains=(content,fragment)=>assert.ok(content.includes(fragment),"Expected: "+fragment);

test("Reels keep native videos uncropped and third-party embeds in their proportions",()=>{
  const src=read("src/home-hybrid-reels.js"),css=read("assets/css/pages/home-reels.css");
  for(const anchor of ["looply-reel-media-stage","is-portrait-player","is-landscape-player",
    'source.kind === "embed"', 'source.frame.removeAttribute("src")']) contains(src,anchor);
  for(const anchor of [".is-landscape-player .looply-reel-embed",".is-portrait-player .looply-reel-embed",
    "object-fit:contain","scroll-snap-type:y mandatory","height:100dvh"])contains(css,anchor);
  contains(css,".looply-reels-scroll .looply-reel-video");
  assert.doesNotMatch(css,/\.looply-reels-scroll \.looply-reel-embed[^}]*transform:scale\(/);
});

test("Immersive Reels preserve real profile, date, captions and audio",()=>{
  const css=read("assets/css/pages/home-reels.css"),src=read("src/home-hybrid-reels.js");
  for(const anchor of ["[data-reels-creator]","data-reels-caption",
    "data-reels-provider-original","Áudio original"]){
    assert.ok(src.includes(anchor)||css.includes(anchor),anchor);
  }
  contains(src,"author.cloneNode(true)");
  contains(css,".looply-reels-bottom");
  contains(css,"color:#fff");
});

test("Home and Reels load only the new stylesheet and wire authentic viewer controls",()=>{
  for(const page of ["home.html","reels.html"]){
    contains(read(page),"assets/css/pages/home-reels.css");
    assert.doesNotMatch(read(page),/href="[^"]*reels-immersive-fix\.css/);
  }
  const src=read("src/home-hybrid-reels.js"),premium=read("src/home-reels-premium.js");
  for(const anchor of ["data-reel-action","data-reels-comments","data-share-in-app",
    "data-share-post","data-toggle-like","source.frame.removeAttribute"])contains(src,anchor);
  for(const anchor of ["premiumViewerSave","v13_set_post_saved","v13_post_engagement_page","timeupdate"])contains(premium,anchor);
  const checked=spawnSync(process.execPath,
    ["--check",fileURLToPath(new URL("../src/home-hybrid-reels.js",import.meta.url))],
    {encoding:"utf8"});
  assert.equal(checked.status,0,checked.stderr);
});
