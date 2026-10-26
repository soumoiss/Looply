import {readFile,mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import assert from "node:assert/strict";
const lib=(await readFile(new URL("../src/story-ar-warp.js",import.meta.url),"utf8")).replace(/\bexport (?=class|function)/g,"");
const browser=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync(x,["--version"],{timeout:4000}).status===0);
if(!browser)throw new Error("Chrome not installed for pixel test");
const script=lib+`
(()=>{
const w=320,h=240,source=document.createElement("canvas");source.width=w;source.height=h;
const ctx=source.getContext("2d");
for(let x=0;x<w;x++){ctx.fillStyle="rgb("+Math.round(x*255/w)+",50,"+((Math.floor(x/8)%2)*200)+")";ctx.fillRect(x,0,1,h);}
const points=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
points[33]={x:.36,y:.44};points[263]={x:.64,y:.44};
points[13]={x:.5,y:.64};points[14]={x:.5,y:.69};
const diff=canvas=>{const a=ctx.getImageData(0,0,w,h).data,b=canvas.getContext("2d").getImageData(0,0,w,h).data;
let n=0;for(let y=20;y<210;y+=3)for(let x=30;x<285;x+=3){let i=(y*w+x)*4;
if(Math.abs(a[i]-b[i])+Math.abs(a[i+2]-b[i+2])>12)n++;}return n;};
const output=document.createElement("canvas");output.width=w;output.height=h;
const dest=output.getContext("2d");dest.drawImage(source,0,0);
fallbackFaceWarp(dest,source,points,"big-eyes",.72,false);
const report={fallbackChanged:diff(output),webglSupported:false,eyesChanged:0,mouthChanged:0,error:""};
try{const gpu=new FaceWarpGPU();report.webglSupported=true;
gpu.draw(source,points,"big-eyes",.72,false);dest.clearRect(0,0,w,h);dest.drawImage(gpu.canvas,0,0);report.eyesChanged=diff(output);
gpu.draw(source,points,"big-mouth",.78,false);dest.clearRect(0,0,w,h);dest.drawImage(gpu.canvas,0,0);report.mouthChanged=diff(output);
gpu.dispose();}catch(e){report.error=String(e);}
document.getElementById("ar-report").textContent=JSON.stringify(report);
})();
`;
const dir=await mkdtemp(join(tmpdir(),"looply-ar-"));
try{
 const file=join(dir,"index.html");
 await writeFile(file,"<!doctype html><html><body><pre id=\"ar-report\"></pre><script>"+script+"</script></body></html>");
 const r=spawnSync(browser,["--headless=new","--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader","--disable-dev-shm-usage","--window-size=390,800","--virtual-time-budget=1800","--dump-dom","file://"+file],{encoding:"utf8",timeout:25000,maxBuffer:4*1024*1024});
 assert.equal(r.status,0,r.stderr.slice(-1000));
 const match=r.stdout.match(/<pre id="ar-report">([^<]+)<\/pre>/);
 assert.ok(match,"Chrome did not render AR report");
 const data=JSON.parse(match[1]);
 assert.ok(data.fallbackChanged>20,"Canvas face warp failed "+JSON.stringify(data));
 if(data.webglSupported){assert.ok(data.eyesChanged>20,"GPU eyes unchanged "+JSON.stringify(data));
 assert.ok(data.mouthChanged>20,"GPU mouth unchanged "+JSON.stringify(data));}
 console.log("AR CHROME PIXEL CHECK PASS",data);
}finally{await rm(dir,{recursive:true,force:true});}
