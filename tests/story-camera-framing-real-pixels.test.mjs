import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
 STORY_CANVAS_SIZE,storyCanvasSize,cameraCoverCrop,cameraCaptureCrop,
 cameraMediaConstraints,verifyStoryImagePixels,verifyStoryVideoPixels,setRearCameraTorch
} from "../src/story-studio.js";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("square and landscape camera frames are center cropped, never stretched or padded",()=>{
 const size=storyCanvasSize("9:16");
 assert.deepEqual(size,{width:1080,height:1920});
 assert.deepEqual(cameraCoverCrop(1080,1080,1080,1920),{x:236.25,y:0,width:607.5,height:1080});
 assert.deepEqual(cameraCoverCrop(1920,1080,1080,1920),{x:656.25,y:0,width:607.5,height:1080});
 assert.deepEqual(cameraCoverCrop(1080,1920,1080,1920),{x:0,y:0,width:1080,height:1920});
 for(const [w,h] of [[1080,1080],[1920,1080],[1080,1920],[1920,1440],[4032,3024]]){
  const crop=cameraCaptureCrop(w,h,1080,1920);
  assert.ok(crop.x>=0&&crop.y>=0);
  assert.ok(crop.x+crop.width<=w+1e-6);
  assert.ok(crop.y+crop.height<=h+1e-6);
  assert.ok(Math.abs(crop.width/crop.height-9/16)<1e-10);
 }
 assert.equal(cameraCaptureCrop(0,1080,1080,1920),null);
});
test("selected ratios produce actual encoder dimensions, not the previous square 16:9 export",async()=>{
 const source=await read("src/story-studio.js");
 const ratios={"9:16":[1080,1920],"16:9":[1920,1080],"3:4":[1440,1920],"2:5":[768,1920],"1:1":[1080,1080]};
 for(const [ratio,[w,h]]of Object.entries(ratios)){
  assert.deepEqual(storyCanvasSize(ratio),{width:w,height:h});
  const c=cameraMediaConstraints("environment",ratio);
  assert.equal(c.video.facingMode.ideal,"environment");
  assert.equal(c.audio,true);
  assert.equal(c.video.aspectRatio,undefined);
 }
 assert.match(source,/c.width = w; c.height = h/);
 assert.doesNotMatch(source,/c.width = Math.min\(1080, w\); c.height = Math.min\(1920, h\)/);
 assert.match(source,/await startCamera\(settings.facing\)/);
});
test("preview cover geometry and live draw use the same cropping rectangle",async()=>{
 const [source,css,markup]=await Promise.all([
  read("src/story-studio.js"),read("assets/css/pages/story-reels-viewport-fix.css"),read("src/stories.js")
 ]);
 assert.match(source,/studio-camera-framing studio-camera-only/);
 assert.match(source,/const fitted=containRect\(crop.width,crop.height,canvas.width,canvas.height\)/);
 assert.match(source,/ctx.drawImage\(layer,crop.x\*scaleX,crop.y\*scaleY,crop.width\*scaleX,crop.height\*scaleY,/);
 assert.match(source,/if\(settings.facing==="user"\)/);
 assert.match(css,/\.studio-camera-framing \.studio-camera[^{]*\{[^}]*object-fit:contain!important/);
 assert.match(css,/aspect-ratio:var\(--studio-camera-ratio,0.5625\)/);
 assert.match(source,/verifyStoryImagePixels\(normalized,expected\)/);
 assert.match(source,/verifyStoryVideoPixels\(normalized,expected\)/);
 assert.match(markup,/data-story-media-backdrop/);
});
test("pinch is the only extra digital zoom; video modes request actual sensor aspect",()=>{
 assert.deepEqual(cameraCaptureCrop(1080,1080,1080,1920),cameraCoverCrop(1080,1080,1080,1920));
 const pinched=cameraCaptureCrop(1080,1080,1080,1920,1.5);
 assert.equal(pinched.width,405);
 assert.equal(pinched.height,720);
 assert.equal(pinched.x,337.5);
 assert.equal(pinched.y,180);
 assert.equal(cameraMediaConstraints("user").video.facingMode.ideal,"user");
 assert.equal(cameraMediaConstraints("environment").video.facingMode.ideal,"environment");
});
test("captured JPEG is actually decoded and dimensions confirmed before opening editor",async()=>{
 let closed=0;
 const decoder=async()=>({width:1080,height:1920,close(){closed++;}});
 assert.deepEqual(await verifyStoryImagePixels(new Blob(["jpeg"]),STORY_CANVAS_SIZE,decoder),STORY_CANVAS_SIZE);
 assert.equal(closed,1);
 await assert.rejects(verifyStoryImagePixels(new Blob(["square"]),STORY_CANVAS_SIZE,
  async()=>({width:1080,height:1080,close(){closed++;}})),/proporção selecionada/);
 assert.equal(closed,2);
});
test("video recorded pixels, not an HTML label, determine success",async()=>{
 const fake=(w,h)=>({
  readyState:1,videoWidth:w,videoHeight:h,load(){},pause(){},removeAttribute(){},
 });
 const file=new Blob(["webm"],{type:"video/webm"});
 assert.deepEqual(await verifyStoryVideoPixels(file,STORY_CANVAS_SIZE,()=>fake(1080,1920)),STORY_CANVAS_SIZE);
 await assert.rejects(verifyStoryVideoPixels(file,STORY_CANVAS_SIZE,()=>fake(1080,1080)),/proporção selecionada/);
});
test("real rear torch is driven by applyConstraints and verified when the browser reports a state",async()=>{
 let state=false,calls=[];
 const track={
  readyState:"live",getCapabilities:()=>({torch:true}),
  getSettings:()=>({torch:state}),
  async applyConstraints(constraints){calls.push(constraints);state=constraints.advanced[0].torch;}
 };
 assert.deepEqual(await setRearCameraTorch(track,true),{requested:true,confirmed:true});
 assert.deepEqual(await setRearCameraTorch(track,false),{requested:false,confirmed:true});
 assert.deepEqual(calls,[{advanced:[{torch:true}]},{advanced:[{torch:false}]}]);
 await assert.rejects(setRearCameraTorch({...track,getCapabilities:()=>({torch:false})},true),/indisponível/);
 await assert.rejects(setRearCameraTorch({...track,applyConstraints:async()=>{}},true),/não confirmou/);
 const unavailable={...track,getCapabilities:()=>({torch:true}),getSettings:()=>({})};
 assert.deepEqual(await setRearCameraTorch(unavailable,true),{requested:true,confirmed:false});
});
test("closing or flipping cancels pending camera acquisition and shutter, without ghost playback",async()=>{
 const src=await read("src/story-studio.js");
 assert.match(src,/\+\+cameraRequestId/);
 assert.match(src,/ticket!==cameraRequestId\|\|!active/);
 assert.match(src,/acquired\?\.getTracks\(\)\.forEach\(track=>track.stop\(\)\)/);
 assert.match(src,/video.srcObject = null; backdropVideo.srcObject = null/);
 assert.match(src,/stream\?\.getTracks\(\)\.forEach\(t => t.stop\(\)\)/);
 assert.match(src,/if\(hold\)\{clearTimeout\(hold\);hold=null;\}/);
 assert.match(src,/photoPending=true/);
 assert.match(src,/timerPending=true/);
 assert.match(src,/recordingTicket===cameraRequestId/);
});
