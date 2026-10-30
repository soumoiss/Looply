import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {captionWithLicensedMusic} from "../src/story-licensed-music.js";
import {storyMusicCanPublish} from "../src/story-music-picker.js";
const source=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Selecting an Apple or Deezer track offers a separate licensed file; never records promotional snippets",async()=>{
  const picker=await source("src/story-music-picker.js");
  assert.match(picker,/catalogAwaitingUserAudio=track/);
  assert.match(picker,/fileInput\.click\(\)/);
  assert.match(picker,/Vincular meu áudio autorizado/);
  assert.match(picker,/Você confirma que possui autorização para sincronizar este arquivo/);
  assert.match(picker,/catalogProvider:catalog\.provider,catalogUrl:catalog\.url/);
  assert.match(picker,/licenseVerifiedByUser:true/);
  assert.doesNotMatch(picker,/fetch\(\s*track\.previewUrl/);
  assert.equal(storyMusicCanPublish({kind:"catalog",provider:"apple",id:"123"}),false);
  assert.equal(storyMusicCanPublish({kind:"catalog",provider:"deezer",id:"456"}),false);
  assert.equal(storyMusicCanPublish({kind:"file",file:{type:"audio/wav",size:1024},catalogProvider:"apple"}),true);
});

test("Selected catalog metadata survives as song/artist attribution when author's authorized file is exported",()=>{
  const song={kind:"file",title:"Uma composição do autor",artist:"Artista verificado",
    catalogProvider:"apple",catalogUrl:"https://music.apple.com/br/album/123",licenseVerifiedByUser:true};
  const caption=captionWithLicensedMusic("Minha legenda",song);
  assert.match(caption,/Minha legenda/);
  assert.match(caption,/🎵 "Uma composição do autor" — Artista verificado/);
  assert.match(caption,/áudio fornecido pelo autor do Story; catálogo: apple/);
  assert.doesNotMatch(caption,/previewUrl|cdn\.spotify/);
  assert.equal(captionWithLicensedMusic("Minha legenda",{...song,licenseVerifiedByUser:false}),"Minha legenda");
});

test("Story-open tap starts audio synchronously; pointerdown on stage provides no-modal retry",async()=>{
  const viewer=await source("src/stories.js");
  const start=viewer.indexOf('const storyButton = event.target.closest("[data-story-open]")');
  const click=viewer.slice(start,start+1200);
  assert.ok(click.indexOf("openStoryDialog(viewer)")<click.indexOf("renderSlide()"));
  const pointer=viewer.slice(viewer.indexOf('viewer.addEventListener("pointerdown"'));
  assert.match(pointer,/event\.target\.closest\("\[data-story-touch-surface\]"\)/);
  assert.match(pointer,/data-story-prev/);
  assert.match(pointer,/void playStoryAudio\(sound\)/);
  assert.match(pointer,/void startStoryMediaPlayback\(video,\{owner:viewer\}\)/);
  const renderer=viewer.slice(viewer.indexOf("const renderSlide ="),viewer.indexOf("const sharePanel ="));
  assert.doesNotMatch(renderer,/audiusStoryStreamUrl/);
  assert.match(renderer,/void startStoryMediaPlayback\(video\)/);
  assert.doesNotMatch(renderer,/window\.open\(/);
  assert.doesNotMatch(renderer,/story\.music\.previewUrl/);
});

test("Only actually encoded user audio or permitted streaming is represented as playing in a published Story",async()=>{
  const studio=await source("src/story-studio.js");
  const playback=await source("src/story-viewer-playback.js");
  assert.match(studio,/attachStoryMusic\(audioCtx, destination, buffer/);
  assert.match(studio,/source = attachStoryMusic\(/);
  assert.match(studio,/if \(!output\.size\) throw new Error\("A exportação gerou um vídeo vazio/);
  assert.match(playback,/media\.play\(\)/);
  assert.match(playback,/media\.dataset\.playback=error\?\.name==="NotAllowedError"\?"gesture-required":"unavailable"/);
  assert.match(playback,/nextAttempt\(media\)/);
});
