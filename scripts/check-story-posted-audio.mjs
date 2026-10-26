import {writeFile,mkdtemp,rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {join} from "node:path";
import {tmpdir} from "node:os";
import assert from "node:assert/strict";
const browser=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync(x,["--version"],{timeout:4000}).status===0);
if(!browser)throw Error("Chromium needed for audio");
const script=`
(async()=>{
const out={error:"",mime:"",size:0,audioTracks:0,videoTracks:0,base64:""};
try{
const canvas=document.createElement("canvas");canvas.width=320;canvas.height=240;
const ctx=canvas.getContext("2d");ctx.fillStyle="#95387a";ctx.fillRect(0,0,320,240);
const stream=canvas.captureStream(24);
const audio=new AudioContext();await audio.resume();
const oscillator=audio.createOscillator();const gain=audio.createGain();gain.gain.value=.3;
const destination=audio.createMediaStreamDestination();
oscillator.frequency.value=440;oscillator.connect(gain).connect(destination);
destination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
out.audioTracks=stream.getAudioTracks().length;out.videoTracks=stream.getVideoTracks().length;
const mime=["video/webm;codecs=vp8,opus","video/webm;codecs=vp9,opus","video/mp4"].find(t=>MediaRecorder.isTypeSupported(t));
if(!mime)throw Error("No audio+video recorder codec");out.mime=mime;
const recorder=new MediaRecorder(stream,{mimeType:mime}),chunks=[];
recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
const done=new Promise(resolve=>{recorder.onstop=resolve;});
recorder.start();oscillator.start();
for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,180));ctx.fillStyle=i%2?"#bea3d5":"#242d5f";ctx.fillRect(i*40,10,50,65);}
recorder.stop();await done;oscillator.stop();
const blob=new Blob(chunks,{type:recorder.mimeType});out.size=blob.size;
const bytes=new Uint8Array(await blob.arrayBuffer());let binary="";
for(const b of bytes)binary+=String.fromCharCode(b);out.base64=btoa(binary);
stream.getTracks().forEach(t=>t.stop());await audio.close();
}catch(e){out.error=String(e);}
document.querySelector("#audio-result").textContent=JSON.stringify(out);
})();
`;
const dir=await mkdtemp(join(tmpdir(),"looply-story-audio-"));
try{
const file=join(dir,"check.html");
await writeFile(file,'<!doctype html><html><body><pre id="audio-result">WAIT</pre><script>'+script+'</script></body></html>');
const run=spawnSync(browser,["--headless=new","--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required","--virtual-time-budget=7000","--dump-dom","file://"+file],{encoding:"utf8",timeout:20000,maxBuffer:2*1024*1024});
assert.equal(run.status,0,run.stderr.slice(-1200));
const match=run.stdout.match(/<pre id="audio-result">([^<]+)<\/pre>/);
assert.ok(match,"Browser did not finish video+audio recording");
const result=JSON.parse(match[1]);
console.log("RECORDER DIAGNOSTICS",JSON.stringify({error:result.error,mime:result.mime,size:result.size,audioTracks:result.audioTracks,videoTracks:result.videoTracks}));
assert.equal(result.error,"",result.error);assert.equal(result.audioTracks,1);
assert.equal(result.videoTracks,1);assert.ok(result.size>1800,"Empty video/audio");
const clip=join(dir,result.mime.includes("mp4")?"recording.mp4":"recording.webm");
await writeFile(clip,Buffer.from(result.base64,"base64"));
const probe=spawnSync("ffprobe",["-v","error","-show_entries","stream=codec_type,codec_name","-of","csv=p=0",clip],{encoding:"utf8",timeout:12000});
assert.equal(probe.status,0,"ffprobe error: "+probe.stderr);
assert.match(probe.stdout,/audio/,"No encoded audio track!");
assert.match(probe.stdout,/video/,"No encoded video track!");
console.log("CHROME RECORDED MUSIC SUCCESS",result.mime,result.size,probe.stdout.trim());
}finally{await rm(dir,{recursive:true,force:true});}
