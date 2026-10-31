import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {captureCallMedia,isRecoverableCallCaptureError} from "../src/call-media-capture.js";

const failure=name=>Object.assign(new Error(name),{name});
const makeStream=(audio=0,video=0)=>{
  const tracks=[...Array.from({length:audio},()=>({kind:"audio",stopped:false,stop(){this.stopped=true}})),
    ...Array.from({length:video},()=>({kind:"video",stopped:false,stop(){this.stopped=true}}))];
  return {getTracks:()=>tracks,getAudioTracks:()=>tracks.filter(t=>t.kind==="audio"),
    getVideoTracks:()=>tracks.filter(t=>t.kind==="video"),addTrack:t=>tracks.push(t)};
};
test("Normal video answer retains audio and camera",async()=>{
  const calls=[];
  const result=await captureCallMedia({getUserMedia:async c=>{calls.push(c);return makeStream(1,1)}},"video");
  assert.equal(result.videoUnavailable,false);
  assert.equal(result.stream.getVideoTracks().length,1);
  assert.deepEqual(calls,[{audio:true,video:true}]);
});
test("Temporary camera NotReadableError retries the full stream before falling back",async()=>{
  let count=0;
  const result=await captureCallMedia({getUserMedia:async()=>{
    if(++count===1)throw failure("NotReadableError");return makeStream(1,1);
  }},"video",{wait:async()=>{}});
  assert.equal(count,2);
  assert.equal(result.videoUnavailable,false);
});
test("Occupied video hardware still allows microphone answer with negotiated camera recovery",async()=>{
  const calls=[];
  const result=await captureCallMedia({getUserMedia:async c=>{
    calls.push(c);
    if(c.audio===true&&c.video===true)throw failure("NotReadableError");
    if(c.audio===false)throw failure("NotReadableError");
    return makeStream(1,0);
  }},"video",{wait:async()=>{}});
  assert.equal(result.videoUnavailable,true);
  assert.equal(result.stream.getAudioTracks().length,1);
  assert.equal(result.stream.getVideoTracks().length,0);
  assert.deepEqual(calls,[{audio:true,video:true},{audio:true,video:true},
    {audio:true,video:false},{audio:false,video:true}]);
});
test("If the combined stream fails but a separate camera is usable, combine tracks",async()=>{
  const video=makeStream(0,1);let count=0;
  const result=await captureCallMedia({getUserMedia:async c=>{
    if(c.video===true&&c.audio===true)throw failure("NotReadableError");
    if(c.audio===true)return makeStream(1);
    count++;return video;
  }},"video",{wait:async()=>{}});
  assert.equal(result.videoUnavailable,false);
  assert.equal(result.stream.getAudioTracks().length,1);
  assert.equal(result.stream.getVideoTracks().length,1);
  assert.equal(count,1);
});
test("A microphone capture failure remains recoverable and never fabricates a track",async()=>{
  await assert.rejects(()=>captureCallMedia({getUserMedia:async c=>{
    if(c.video===true)throw failure("NotReadableError");
    throw failure("NotReadableError");
  }},"video",{wait:async()=>{}}),{name:"NotReadableError"});
  assert.equal(isRecoverableCallCaptureError(failure("NotReadableError")),true);
  assert.equal(isRecoverableCallCaptureError(failure("NotAllowedError")),false);
});
test("Denied microphone permission is not bypassed by fallback",async()=>{
  let count=0;
  await assert.rejects(()=>captureCallMedia({getUserMedia:async()=>{
    count++;throw failure("NotAllowedError");
  }},"video",{wait:async()=>{}}),{name:"NotAllowedError"});
  assert.equal(count,1);
});
test("Capture recovery is wired to outgoing and answering calls without corrupting their signaling",async()=>{
  const src=await readFile(new URL("../src/chat-calls.js",import.meta.url),"utf8");
  assert.equal((src.match(/await captureCallMedia\(navigator\.mediaDevices,/g)||[]).length,2);
  assert.match(src,/data-call-retry-camera/);
  assert.match(src,/pc\.addTransceiver\("video",\{direction:"sendrecv"\}\)/);
  assert.match(src,/await sender\.replaceTrack\(track\)/);
  const acceptStart=src.indexOf("const acceptCall = async");
  const acceptEnd=src.indexOf("const restorePendingIncomingCall",acceptStart);
  const accept=src.slice(acceptStart,acceptEnd);
  const retry=accept.indexOf("isRecoverableCallCaptureError(error)");
  const failed=accept.indexOf('await send("failed"');
  assert.ok(retry>0&&failed>retry);
  assert.match(accept,/incomingOffer=offer/);
  assert.match(accept,/data-call-accept>Tentar atender novamente/);
});
