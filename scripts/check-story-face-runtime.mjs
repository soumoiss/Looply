import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import assert from "node:assert/strict";
const browser=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync(x,["--version"],{timeout:5000}).status===0);
if(!browser)throw new Error("Chromium is required to test face tracking");
const html=`<!doctype html><html><meta charset="utf-8"><body><pre id="result">LOADING</pre>
<script type="module">
const report={steps:[],error:""};
const reportStep=t=>{report.steps.push(t);document.getElementById("result").textContent=JSON.stringify(report);};
try {
const base="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34";
const vision=await import(base+"/vision_bundle.mjs");
reportStep("vision bundle imported: "+Boolean(vision.FaceLandmarker));
const fileset=await vision.FilesetResolver.forVisionTasks(base+"/wasm");
reportStep("wasm fileset: "+Boolean(fileset.wasmLoaderPath));
const model="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const landmarker=await vision.FaceLandmarker.createFromOptions(fileset,{baseOptions:{modelAssetPath:model,delegate:"CPU"},runningMode:"VIDEO",numFaces:1});
reportStep("FACE_TRACKING_READY");landmarker.close();
}catch(e){report.error=String(e?.message||e);reportStep("FAIL");}
document.getElementById("result").textContent="READY_RESULT:"+JSON.stringify(report);
</script></body></html>`;
const dir=await mkdtemp(join(tmpdir(),"looply-face-smoke-"));
try {const file=join(dir,"smoke.html");await writeFile(file,html);
const r=spawnSync(browser,["--headless=new","--no-sandbox","--enable-unsafe-swiftshader","--use-angle=swiftshader","--disable-dev-shm-usage","--disable-background-networking","--virtual-time-budget=25000","--dump-dom","file://"+file],{encoding:"utf8",timeout:35000,maxBuffer:1024*1024});
const m=r.stdout.match(/READY_RESULT:([^<]+)/);
if(m){const value=JSON.parse(m[1].replaceAll("&quot;",'"'));console.log("Face init smoke",value);
assert.ok(value.steps.includes("FACE_TRACKING_READY"),"Model did not initialize: "+JSON.stringify(value));}
else {console.log("Face init smoke no result",r.stderr.slice(-1000),r.stdout.slice(-500));throw Error("No result");}
}finally{await rm(dir,{recursive:true,force:true});}
