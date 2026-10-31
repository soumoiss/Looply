import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {storyMusicStartSeconds,withStoryMusicStart} from "../src/story-music-clip.js";
import {attachStoryMusic} from "../src/story-audio-mixer.js";
import {storyMusicCanPublish} from "../src/story-music-picker.js";

test("licensed clip positions are safe and cannot seek past the track",()=>{
  assert.equal(storyMusicStartSeconds(12,60),12);
  assert.equal(storyMusicStartSeconds(9.95,10),9.9);
  assert.equal(storyMusicStartSeconds(12,10),9.9);
  assert.equal(storyMusicStartSeconds(-1,10),0);
  assert.equal(storyMusicStartSeconds("not-a-number",10),0);
  assert.equal(storyMusicStartSeconds(8,0),0);
  assert.equal(storyMusicStartSeconds(99999),3600);
  assert.equal(withStoryMusicStart({kind:"file",title:"Canção"},18.5).startSeconds,18.5);
  assert.equal(withStoryMusicStart({kind:"openverse"},2).startSeconds,2);
  assert.equal(withStoryMusicStart({kind:"catalog",provider:"apple"},60).startSeconds,undefined);
});

test("commercial catalog and video proxy audio do not bypass publication rights",()=>{
  assert.equal(storyMusicCanPublish({kind:"catalog",provider:"apple"}),false);
  assert.equal(storyMusicCanPublish({kind:"catalog",provider:"spotify"}),false);
  assert.equal(storyMusicCanPublish({kind:"catalog",provider:"deezer"}),false);
  assert.equal(storyMusicCanPublish({kind:"piped",audioUrl:"https://example.com/streams/123"}),false);
  assert.equal(storyMusicCanPublish({kind:"openverse"}),true);
  assert.equal(storyMusicCanPublish({kind:"file"}),true);
});

test("recording uses loopStart of the selected second rather than original intro",()=>{
  const channel=new Float32Array(44100*10);
  channel[1000]=0.2;
  const buffer={duration:10,numberOfChannels:1,getChannelData:()=>channel};
  const source={buffer:null,loop:false,loopStart:0,connect(){}};
  const ctx={createBufferSource:()=>source};
  assert.equal(attachStoryMusic(ctx,{},buffer,{startSeconds:3.5}),source);
  assert.equal(source.loop,true);
  assert.equal(source.loopStart,3.5);
  assert.equal(attachStoryMusic(ctx,{},buffer,{startSeconds:30}).loopStart,9.9);
});

test("music picker allows time seek in the same UI and studio encodes from that offset",async()=>{
  const [picker,studio,style]=await Promise.all([
    readFile(new URL("../src/story-music-picker.js",import.meta.url),"utf8"),
    readFile(new URL("../src/story-studio.js",import.meta.url),"utf8"),
    readFile(new URL("../assets/css/pages/story-studio.css",import.meta.url),"utf8")
  ]);
  assert.match(picker,/data-studio-music-preview/);
  assert.match(picker,/data-studio-music-query/);
  assert.match(picker,/clipRange\.type="range"/);
  assert.match(picker,/trackAudio\.currentTime=previewStartSeconds/);
  assert.match(picker,/onSelect\(withStoryMusicStart\(imported,startSeconds\)\)/);
  assert.match(picker,/licenseLabel\.className="studio-music-license-check"/);
  assert.doesNotMatch(picker,/window\.confirm/);
  assert.match(studio,/startSeconds:storyMusicStartSeconds\(music\.startSeconds,buffer\.duration\)/);
  assert.match(studio,/source\.start\(0, source\.loopStart \|\| 0\)/);
  assert.match(style,/\.studio-music-preview > audio\s*\{\s*display:none/);
  assert.doesNotMatch(picker,/pipedapi|invidious|youtube-dl|yt-dlp/);
});
