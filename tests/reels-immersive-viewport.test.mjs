import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const contains=(content,fragment)=>assert.ok(content.includes(fragment),"Expected: "+fragment);

test("Reels embeds are correctly sized without stretching or cropping the media",()=>{
  const src=read("src/home-hybrid-reels.js");
  const css=read("assets/css/pages/reels-immersive-fix.css");
  for(const anchor of ["looply-reel-media-stage","is-portrait-player","is-landscape-player",
      'source.kind === "embed"', 'source.frame.removeAttribute("src")']){
    contains(src,anchor);
  }
  for(const anchor of ["is-landscape-player .looply-reel-embed","aspect-ratio:9/16",
      "aspect-ratio:16/9","object-fit:contain!important"]){
    contains(css,anchor);
  }
  contains(css,".looply-reels-scroll .looply-reel-video");
  assert.ok(!css.includes("transform:scale("),"Never zoom an external iframe");
});

test("Immersive dark Reels have no pale author box and show real profile/date",()=>{
  const css=read("assets/css/pages/reels-immersive-fix.css");
  for(const anchor of ["[data-reels-creator] .post-author-profile",
      "background-color:transparent!important","[data-reels-creator] strong",
      "[data-reels-creator] time",".post-avatar img","color:#fff!important"]){
    contains(css,anchor);
  }
  const src=read("src/home-hybrid-reels.js");
  for(const anchor of ["author.cloneNode(true)","data-reels-caption",
      "data-reels-provider-original","Áudio original"]){
    contains(src,anchor);
  }
  assert.ok(!src.includes("Player oficial · áudio controlado pelo provedor"));
});

test("Original Reel actions and both entrypoints remain wired to the same viewer",()=>{
  for(const page of ["home.html","reels.html"])
    contains(read(page),"assets/css/pages/reels-immersive-fix.css");
  const src=read("src/home-hybrid-reels.js");
  for(const anchor of ["data-reel-action","data-reels-comments","data-share-in-app",
      "data-share-post","data-toggle-like","source.frame.removeAttribute"]){
    contains(src,anchor);
  }
  const checked=spawnSync(process.execPath,
    ["--check",fileURLToPath(new URL("../src/home-hybrid-reels.js",import.meta.url))],
    {encoding:"utf8"});
  assert.equal(checked.status,0,checked.stderr);
});
