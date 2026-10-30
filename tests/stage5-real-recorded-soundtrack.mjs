// Real Chromium + MediaRecorder + ffprobe test of an ORIGINAL synthetic
// sample, not a commercial music recording. Does not publish to Neon/R2.
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import path from "node:path";
const outputDir="smoke-results/stage5-audio";
await mkdir(outputDir,{recursive:true});
const source=await readFile(new URL("../src/story-audio-mixer.js",import.meta.url),"utf8");
const browser=await chromium.launch({headless:true,args:[
  "--no-sandbox","--autoplay-policy=no-user-gesture-required"
]});
let result;
try{
  const page=await browser.newPage();
  await page.setContent("<!doctype html><html><body><canvas id='frame' width='320' height='568'></canvas></body></html>");
  result=await page.evaluate(async mixerSource=>{
    const mixer=await import("data:text/javascript;charset=utf-8,"+encodeURIComponent(mixerSource));
    const AudioEngine=window.AudioContext||window.webkitAudioContext;
    const audio=new AudioEngine({sampleRate:48000});
    await audio.resume();
    const destination=audio.createMediaStreamDestination();
    const canvas=document.querySelector("canvas");
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#4c136c";ctx.fillRect(0,0,320,568);
    const frames=canvas.captureStream(20);
    destination.stream.getAudioTracks().forEach(track=>frames.addTrack(track));
    if(frames.getAudioTracks().length!==1||frames.getVideoTracks().length!==1)
      throw Error("No encoded audio+video tracks");
    const voice=audio.createOscillator();
    const voiceLevel=audio.createGain();voice.frequency.value=525;voiceLevel.gain.value=.09;
    voice.connect(voiceLevel);voiceLevel.connect(destination);
    const buffer=audio.createBuffer(1,48000,48000);
    const pcm=buffer.getChannelData(0);
    for(let i=0;i<pcm.length;i++)pcm[i]=.12*Math.sin(2*Math.PI*240*i/48000);
    const song=mixer.attachStoryMusic(audio,destination,buffer,{volume:.35});
    const mime=["video/webm;codecs=vp8,opus","video/webm"].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime)throw Error("Chromium cannot record WebM");
    const recorder=new MediaRecorder(frames,{mimeType:mime});
    const chunks=[];
    let resolveDone,rejectDone;
    const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
    recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
    recorder.onerror=e=>rejectDone(e.error||Error("MediaRecorder error"));
    recorder.onstop=()=>resolveDone(new Blob(chunks,{type:mime}));
    recorder.start(250);
    voice.start();song.start();
    let interval=setInterval(()=>{ctx.fillStyle="#4c136c";ctx.fillRect(0,0,320,568);},60);
    await new Promise(resolve=>setTimeout(resolve,1800));
    clearInterval(interval);voice.stop();song.stop();recorder.stop();
    const blob=await done;
    frames.getTracks().forEach(track=>track.stop());
    await audio.close();
    if(blob.size<1000)throw Error("MediaRecorder returned empty video/audio");
    const uint=new Uint8Array(await blob.arrayBuffer());
    let binary="";
    for(let i=0;i<uint.length;i+=8192)
      binary+=String.fromCharCode(...uint.subarray(i,i+8192));
    return {file:btoa(binary),mime,size:blob.size};
  },source);
  await page.close();
}finally{await browser.close();}
const file=path.join(outputDir,"original-licensed-mix.webm");
await writeFile(file,Buffer.from(result.file,"base64"));
const probe=spawnSync("ffprobe",["-v","error","-show_entries","stream=codec_type,codec_name","-of","json",file],{encoding:"utf8"});
if(probe.status!==0)throw Error("ffprobe failed: "+probe.stderr);
const streams=JSON.parse(probe.stdout).streams||[];
if(!streams.some(s=>s.codec_type==="audio")||!streams.some(s=>s.codec_type==="video"))
  throw Error("Actual encoded file lacks audio or video: "+JSON.stringify(streams));
const check=spawnSync("ffmpeg",["-hide_banner","-nostats","-i",file,"-vn","-af","volumedetect","-f","null","-"],{encoding:"utf8",maxBuffer:8e6});
if(check.status!==0)throw Error("ffmpeg could not decode encoded audio: "+check.stderr.slice(-800));
const sample=check.stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
if(!sample||Number(sample[1]) < -50)
  throw Error("Encoded audio is muted or too quiet: "+(sample?.[1]||"unknown"));
const evidence={mode:"synthetic-owned-audio-browser-fixture",file,resultBytes:result.size,mime:result.mime,
  streams,maxVolumeDb:Number(sample[1])};
await writeFile(path.join(outputDir,"proof.json"),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
