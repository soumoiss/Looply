import {writeFile,mkdtemp,rm,readFile} from "node:fs/promises";
import {spawnSync,spawn} from "node:child_process";
import {join} from "node:path";
import {tmpdir} from "node:os";
import assert from "node:assert/strict";
const browser=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync(x,["--version"],{timeout:4000}).status===0);
if(!browser)throw Error("Chromium needed for audio");
// Inline exactly the same mixer source used by src/story-studio.js in production.
const mixerSource=(await readFile(new URL("../src/story-audio-mixer.js",import.meta.url),"utf8")).replaceAll("export ","");
const script=`
(async()=>{
const out={error:"",mime:"",size:0,audioTracks:0,videoTracks:0,base64:""};
try{
const canvas=document.createElement("canvas");canvas.width=360;canvas.height=640;
const ctx=canvas.getContext("2d");ctx.fillStyle="#95387a";ctx.fillRect(0,0,360,640);
const stream=canvas.captureStream(24);
const audio=new AudioContext();await audio.resume();
const destination=audio.createMediaStreamDestination();
const buffer=audio.createBuffer(1,audio.sampleRate*7,audio.sampleRate);
const samples=buffer.getChannelData(0);
for(let i=0;i<samples.length;i++)samples[i]=0.24*Math.sin(i*2*Math.PI*440/audio.sampleRate);
const soundtrack=attachStoryMusic(audio,destination,buffer);
destination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
out.audioTracks=stream.getAudioTracks().length;out.videoTracks=stream.getVideoTracks().length;
const mime=["video/webm;codecs=vp8,opus","video/webm;codecs=vp9,opus","video/mp4"].find(t=>MediaRecorder.isTypeSupported(t));
if(!mime)throw Error("No audio+video recorder codec");out.mime=mime;
const recorder=new MediaRecorder(stream,{mimeType:mime}),chunks=[];
recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
const done=new Promise(resolve=>{recorder.onstop=resolve;});
recorder.start();soundtrack.start();
for(let i=0;i<36;i++){await new Promise(r=>setTimeout(r,200));ctx.fillStyle=i%2?"#bea3d5":"#242d5f";ctx.fillRect((i*16)%360,10,34,65);}
recorder.stop();await done;soundtrack.stop();
const blob=new Blob(chunks,{type:recorder.mimeType});out.size=blob.size;
const bytes=new Uint8Array(await blob.arrayBuffer());let binary="";
for(const b of bytes)binary+=String.fromCharCode(b);out.base64=btoa(binary);
stream.getTracks().forEach(t=>t.stop());await audio.close();

// Reopen the actual recorded first clip as a video input and composite a
// second authorized soundtrack into another Story; this exercises video+music.
const inputVideo=document.createElement("video");
const url=URL.createObjectURL(blob);
inputVideo.src=url;inputVideo.playsInline=true;inputVideo.preload="auto";
await new Promise((resolve,reject)=>{
  inputVideo.addEventListener("loadedmetadata",resolve,{once:true});
  inputVideo.addEventListener("error",()=>reject(Error("Recorded source video did not decode")),{once:true});
});
const videoCanvas=document.createElement("canvas");videoCanvas.width=360;videoCanvas.height=640;
const videoContext=videoCanvas.getContext("2d");
const videoStream=videoCanvas.captureStream(24);
const context2=new AudioContext();await context2.resume();
const dest2=context2.createMediaStreamDestination();
context2.createMediaElementSource(inputVideo).connect(dest2);
const buffer2=context2.createBuffer(1,context2.sampleRate*3,context2.sampleRate);
const samples2=buffer2.getChannelData(0);
for(let i=0;i<samples2.length;i++)samples2[i]=0.18*Math.sin(i*2*Math.PI*330/context2.sampleRate);
const soundtrack2=attachStoryMusic(context2,dest2,buffer2);
dest2.stream.getAudioTracks().forEach(t=>videoStream.addTrack(t));
const recorder2=new MediaRecorder(videoStream,{mimeType:mime});
const chunks2=[];recorder2.ondataavailable=e=>{if(e.data.size)chunks2.push(e.data);};
const finished2=new Promise(resolve=>{recorder2.onstop=resolve;});
let paintLoop=0;
const paint=()=>{if(inputVideo.readyState>=2)videoContext.drawImage(inputVideo,0,0,360,640);paintLoop=requestAnimationFrame(paint);};
recorder2.start(250);
await inputVideo.play();
soundtrack2.start();
paint();
await new Promise(resolve=>setTimeout(resolve,2500));
recorder2.stop();await finished2;
cancelAnimationFrame(paintLoop);soundtrack2.stop();inputVideo.pause();
const result2=new Blob(chunks2,{type:recorder2.mimeType});
const bytes2=new Uint8Array(await result2.arrayBuffer());let binary2="";
for(const byte of bytes2)binary2+=String.fromCharCode(byte);
out.videoWithMusic={mime:recorder2.mimeType,size:result2.size,base64:btoa(binary2),
  audioTracks:videoStream.getAudioTracks().length,videoTracks:videoStream.getVideoTracks().length};
videoStream.getTracks().forEach(t=>t.stop());await context2.close();URL.revokeObjectURL(url);
}catch(e){out.error=String(e);}
document.querySelector("#audio-result").textContent=JSON.stringify(out);
})();
`;
const dir=await mkdtemp(join(tmpdir(),"looply-story-audio-"));
try{
const file=join(dir,"check.html");
await writeFile(file,'<!doctype html><html><body><pre id="audio-result">WAIT</pre><script>'+mixerSource+'\n'+script+'</script></body></html>');
// CDP keeps wall-clock timing: virtual-time-budget produces zero media frames.
const processChrome=spawn(browser,["--headless=new","--no-sandbox","--disable-dev-shm-usage",
  "--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required",
  "--remote-debugging-port=0","--user-data-dir="+join(dir,"profile"),"about:blank"],
  {stdio:"ignore"});
let socket=null;
try{
 let port=null;
 for(let i=0;i<80;i++){
   if(processChrome.exitCode!==null)throw Error("Browser exited before debugger");
   try{port=Number((await readFile(join(dir,"profile","DevToolsActivePort"),"utf8")).split("\n")[0]);if(port)break;}catch{}
   await new Promise(r=>setTimeout(r,125));
 }
 assert.ok(port,"Chromium debugging port unavailable");
 const targets=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
 const target=targets.find(t=>t.type==="page");
 assert.ok(target,"No Chrome page available");
 socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
 const pending=new Map();let next=0;
 socket.addEventListener("message",event=>{
   const response=JSON.parse(event.data);
   if(response.id&&pending.has(response.id)){
     const handlers=pending.get(response.id);pending.delete(response.id);
     if(response.error)handlers.reject(Error(response.error.message));else handlers.resolve(response.result);
   }
 });
 const rpc=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
 });
 await rpc("Page.enable");
 await rpc("Runtime.enable");
 await rpc("Page.navigate",{url:"file://"+file});
 let data=null;
 for(let i=0;i<130;i++){
   await new Promise(r=>setTimeout(r,170));
   const evaluated=await rpc("Runtime.evaluate",{expression:'document.querySelector("#audio-result")?.textContent',returnByValue:true});
   const value=evaluated?.result?.value;
   if(value&&value!=="WAIT"){data=value;break;}
 }
 assert.ok(data,"Chrome did not finish real-time recording");
 const result=JSON.parse(data);
console.log("RECORDER DIAGNOSTICS",JSON.stringify({error:result.error,mime:result.mime,size:result.size,audioTracks:result.audioTracks,videoTracks:result.videoTracks}));
assert.equal(result.error,"",result.error);assert.equal(result.audioTracks,1);
assert.equal(result.videoTracks,1);assert.ok(result.size>1800,"Empty video/audio");
for(const entry of [
  {kind:"photo+music",data:result,minDuration:6.5},
  {kind:"video+music",data:result.videoWithMusic,minDuration:2.0}
]){
  assert.ok(entry.data && entry.data.size>1800,entry.kind+": missing recorded output");
  assert.equal(entry.data.audioTracks,1,entry.kind+": missing audio capture track");
  const clip=join(dir,entry.kind.replace("+","-")+
    (entry.data.mime.includes("mp4")?".mp4":".webm"));
  await writeFile(clip,Buffer.from(entry.data.base64,"base64"));
  const probe=spawnSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",clip],{encoding:"utf8",timeout:12000});
  assert.equal(probe.status,0,entry.kind+": ffprobe error: "+probe.stderr);
  const media=JSON.parse(probe.stdout);
  const audioStream=media.streams.find(s=>s.codec_type==="audio");
  const videoStream=media.streams.find(s=>s.codec_type==="video");
  assert.ok(audioStream,entry.kind+": no encoded audio track");
  assert.ok(videoStream,entry.kind+": no encoded video track");
  assert.ok(["aac","opus"].includes(audioStream.codec_name),entry.kind+": unsupported audio codec");
  assert.equal(videoStream.width,360);assert.equal(videoStream.height,640);
  assert.ok(Number(media.format.duration)>=entry.minDuration,entry.kind+": exported duration too short");
  const volume=spawnSync("ffmpeg",["-hide_banner","-i",clip,"-af","volumedetect","-vn","-f","null","-"],{encoding:"utf8",timeout:20000});
  const loudness=volume.stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
  assert.ok(loudness,entry.kind+": no measurable sound in file");
  assert.ok(Number(loudness[1])>-55,entry.kind+": effectively silent");
  console.log("RECORDED 9:16 STORY WITH AUDIBLE SOUNDTRACK",entry.kind,
    entry.data.mime,entry.data.size,audioStream.codec_name,
    media.format.duration,loudness[1]+"dB");
}
 } finally {
   socket?.close();
   processChrome.kill("SIGTERM");
   await new Promise(resolve=>{if(processChrome.exitCode!==null)resolve();else processChrome.once("exit",resolve);});
 }
}finally{await rm(dir,{recursive:true,force:true,maxRetries:15,retryDelay:250});}
