import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {storyCameraCaptureAttempts,cameraCaptureCrop,containRect} from "../src/story-studio.js";
import {attachStoryMusic,hasAudibleStorySamples} from "../src/story-audio-mixer.js";
import {storyMusicCanPublish} from "../src/story-music-picker.js";
import {normalizeLicensedStorySong} from "../src/story-licensed-music.js";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Camera 1x first relaxes SENSOR settings without dropping the microphone",()=>{
  for(const facing of ["user","environment"]){
    const attempts=storyCameraCaptureAttempts(facing,"9:16");
    assert.equal(attempts.length,3);
    assert.equal(attempts[0].audio,true);
    assert.equal(attempts[1].audio,true);
    assert.equal(attempts[1].video.facingMode.ideal,facing);
    assert.equal(attempts[1].video.aspectRatio,undefined);
    assert.equal(attempts[1].video.resizeMode,undefined);
    assert.equal(attempts[2].audio,false);
    for(const [sw,sh] of [[4032,3024],[1920,1080],[1280,960]]){
      assert.deepEqual(cameraCaptureCrop(sw,sh,1080,1920,1),{x:0,y:0,width:sw,height:sh});
      const rect=containRect(sw,sh,1080,1920);
      assert.ok(rect.width<=1080 && rect.height<=1920);
    }
  }
});
test("Video capture with a denied mic is clearly blocked, never uploaded as if it has a soundtrack",async()=>{
  const studio=await read("src/story-studio.js");
  const begin=studio.slice(studio.indexOf("const beginRecording ="),studio.indexOf("const chooseFile ="));
  assert.match(begin,/const audioTracks=stream.getAudioTracks\(\).filter/);
  assert.match(begin,/if\(!audioTracks.length\) throw new Error\("Microfone indisponível/);
  assert.match(studio,/Câmera pronta para fotos\. Para gravar vídeo com voz/);
  assert.match(studio,/stream\.getAudioTracks\(\)\.some\(t=>t\.readyState==="live"\)/);
  assert.match(studio,/sourceFromCamera/);
  assert.match(studio,/verifyStoryVideoPixels\(normalized,expected\)/);
});
test("Soundtrack can be attenuated beneath recorded speech, without altering the original sound track",async()=>{
  const ev=[];
  const gain={gain:{value:0},connect(out){ev.push(["gainTo",out]);}};
  const source={connect(out){ev.push(["sourceTo",out]);},loop:false};
  const ctx={createBufferSource:()=>source,createGain:()=>gain};
  const dest={name:"encoded audio"};
  const buffer={duration:1,numberOfChannels:1,getChannelData:()=>new Float32Array([0,0.1,0])};
  assert.equal(hasAudibleStorySamples(buffer),true);
  assert.equal(attachStoryMusic(ctx,dest,buffer,{volume:.35}),source);
  assert.equal(gain.gain.value,.35);
  assert.deepEqual(ev,[["sourceTo",gain],["gainTo",dest]]);
  assert.throws(()=>attachStoryMusic(ctx,dest,buffer,{volume:0}),/Volume/);
  assert.throws(()=>attachStoryMusic(ctx,dest,buffer,{volume:2}),/Volume/);
  const studioSource=await read("src/story-studio.js");
  assert.match(studioSource,/volume:videoMedia \? 0\.35 : 0\.85/);
  assert.match(studioSource,/audioCtx\.createMediaElementSource\(videoMedia\)\.connect\(destination\)/);
});
test("Publishing does not synthesize fake audio from Apple, Deezer or Spotify metadata",async()=>{
  const picker=await read("src/story-music-picker.js");
  const studio=await read("src/story-studio.js");
  const viewer=await read("src/stories.js");
  for(const provider of ["apple","deezer","spotify"])
    assert.equal(storyMusicCanPublish({kind:"catalog",provider,id:"123"}),false);
  assert.equal(storyMusicCanPublish({kind:"catalog",provider:"audius",id:"A1"}),false);
  assert.equal(storyMusicCanPublish({kind:"file",file:{size:1}}),true);
  assert.doesNotMatch(picker,/Vincular meu áudio autorizado/);
  assert.match(studio,/if\(music\?\.kind==="catalog" && !appleStoryTrackId\(music\)\)/);
  assert.doesNotMatch(viewer,/music\.src = storyText\.music\.previewUrl/);
  assert.match(viewer,/storyText\.music\?\.provider\s*===\s*"itunes"/);
  assert.doesNotMatch(viewer,/audiusStoryStreamUrl/);
  assert.doesNotMatch(viewer,/story-viewer-music-hidden/);
});
test("Only tracks with stated, verifiable compatible licenses can be offered for imported soundtrack",()=>{
  const metadata={id:"valid-one",title:"Original",creator:"Author",url:"https://archive.org/file.mp3",
    foreign_landing_url:"https://archive.org/details/original",filetype:"mp3",license:"by",
    license_version:"4.0",license_url:"https://creativecommons.org/licenses/by/4.0/"};
  assert.ok(normalizeLicensedStorySong(metadata));
  assert.equal(normalizeLicensedStorySong({...metadata,license:"by-nc"}),null);
  assert.equal(normalizeLicensedStorySong({...metadata,license_url:"https://example.invalid/license"}),null);
});
test("Camera never autoshifts its digital zoom and story submission only occurs through an explicit click",async()=>{
  const studio=await read("src/story-studio.js");
  assert.match(studio,/settings.zoom = 1; resetFlash\(\); updateZoomPreview\(\)/);
  assert.match(studio,/const factor=zoomMode==="digital"\?Math\.max\(1,settings\.zoom\):1/);
  assert.match(studio,/isExplicitStoryPublishGesture\(event\)/);
  assert.match(studio,/authorization !== explicitStoryPublication/);
  assert.match(studio,/preventImplicitStorySubmit\(e\)/);
});
