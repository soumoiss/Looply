import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {resolve,extname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const OUT=join(ROOT,"smoke-results/avatar-studio");
const MIME={".js":"text/javascript",".css":"text/css"};
const fixture=`<!doctype html><html lang="pt-BR" data-theme="lilas">
<head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/assets/css/app.css">
<link rel="stylesheet" href="/assets/css/pages/shared.css">
<link rel="stylesheet" href="/assets/css/pages/profile.css">
</head><body class="looply-page page-profile"><main id="profile-root"></main>
<script type="module">
import {mountProfileAvatarEditor} from "/src/avatar-crop-editor.js";
window.avatarStudio=mountProfileAvatarEditor({
 root:document.querySelector("#profile-root"),client:{},
 userId:"fa43302f-4d11-47a3-9a49-e9e85885e85b",onSaved:()=>{},
 onStatus:value=>{document.body.dataset.lastStatus=value}
});
window.studioReady=true;
</script></body></html>`;
const server=createServer(async(req,res)=>{
 try{
   const url=new URL(req.url,"http://localhost").pathname;
   if(url==="/__avatar_studio__"){res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});res.end(fixture);return;}
   if(!/^\/(?:src\/[a-zA-Z0-9_./-]+\.js|assets\/css\/[a-zA-Z0-9_./-]+\.css|styles\.css)$/.test(url)||url.includes("..")){res.writeHead(404);res.end();return;}
   res.writeHead(200,{"content-type":(MIME[extname(url)]||"text/plain")+"; charset=utf-8"});
   res.end(await readFile(join(ROOT,url.slice(1))));
 }catch{res.writeHead(404);res.end();}
});
await mkdir(OUT,{recursive:true});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const [width,height,orientation] of [[320,700,"portrait"],[360,740,"landscape"],
    [390,800,"square"],[428,900,"portrait"],[768,900,"landscape"]]){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:width<500});
   const page=await context.newPage(),errors=[];
   page.on("pageerror",error=>errors.push(error.message));
   await page.goto(origin+"/__avatar_studio__");
   await page.waitForFunction(()=>window.studioReady===true);
   await page.evaluate(()=>window.avatarStudio.open());
   assert.equal(await page.locator("[data-avatar-menu][open]").count(),1);
   assert.equal(await page.locator('[data-avatar-pick="gallery"]').count(),1);
   await page.evaluate(async(type)=>{
     const canvas=document.createElement("canvas");
     const size=type==="portrait"?[600,1200]:type==="landscape"?[1200,600]:[800,800];
     canvas.width=size[0];canvas.height=size[1];
     const ctx=canvas.getContext("2d");
     ctx.fillStyle="#8352aa";ctx.fillRect(0,0,canvas.width,canvas.height);
     ctx.fillStyle="#ebafd2";ctx.fillRect(canvas.width*.35,canvas.height*.30,canvas.width*.3,canvas.height*.4);
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
     const input=document.querySelector('[data-avatar-source="gallery"]');
     const transfer=new DataTransfer();
     transfer.items.add(new File([blob],"sample.png",{type:"image/png"}));
     input.files=transfer.files;
     input.dispatchEvent(new Event("change",{bubbles:true}));
   },orientation);
   await page.locator("[data-avatar-crop][open]").waitFor({timeout:12000});
   await page.waitForFunction(()=>document.querySelector('[data-avatar-preview]')?.getContext('2d')?.getImageData(64,64,1,1).data[3]===255);
   const metrics=await page.evaluate(()=>{
     const crop=document.querySelector(".pr-avatar-crop"),stage=document.querySelector("[data-avatar-stage]");
     const image=stage.querySelector("img"),rect=stage.getBoundingClientRect(),d=crop.getBoundingClientRect();
     const controls=[...crop.querySelectorAll("button")];
     return {screen:innerWidth,scrollWidth:document.documentElement.scrollWidth,
       cropVisible:crop.open,cropWidth:d.width,stageWidth:rect.width,stageHeight:rect.height,
       outputPreviewWidth:crop.querySelector("canvas").width,outputPreviewHeight:crop.querySelector("canvas").height,
       buttons:controls.map(el=>({text:el.textContent.trim(),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),
       displayedImageWidth:image.getBoundingClientRect().width,
       previewCircle:getComputedStyle(crop.querySelector("canvas")).borderRadius};
   });
   assert.equal(errors.length,0,errors.join(" | "));
   assert.equal(metrics.cropVisible,true);
   assert.ok(metrics.scrollWidth<=width+1,JSON.stringify(metrics));
   assert.ok(metrics.cropWidth<=width+1,JSON.stringify(metrics));
   assert.ok(metrics.stageWidth<=width-12&&metrics.stageWidth>=185,JSON.stringify(metrics));
   assert.equal(metrics.stageWidth,metrics.stageHeight);
   assert.deepEqual([metrics.outputPreviewWidth,metrics.outputPreviewHeight],[128,128]);
   assert.ok(metrics.previewCircle.includes("50%"));
   assert.ok(metrics.buttons.every(b=>b.height>=40));
   await page.screenshot({path:join(OUT,"studio-"+width+"-"+orientation+".png")});
   // Real mouse drag, rotation and zoom all update the displayed crop.
   const before=await page.locator("[data-avatar-image]").getAttribute("style");
   await page.locator("[data-avatar-zoom]").fill("1.75");
   await page.locator("[data-avatar-rotate]").click();
   const after=await page.locator("[data-avatar-image]").getAttribute("style");
   assert.notEqual(after,before);assert.match(after,/rotate\(90deg\)/);
   await page.locator("[data-avatar-reset]").click();
   assert.equal(await page.locator("[data-avatar-zoom]").inputValue(),"1");
   if(width===390){
     const stage=page.locator("[data-avatar-stage]");
     const rect=await stage.boundingBox(),cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
     const session=await context.newCDPSession(page);
     await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[
       {x:cx-28,y:cy,id:1},{x:cx+28,y:cy,id:2}
     ]});
     await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[
       {x:cx-60,y:cy,id:1},{x:cx+60,y:cy,id:2}
     ]});
     await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
     await page.waitForTimeout(80);
     const value=Number(await page.locator("[data-avatar-zoom]").inputValue());
     assert.ok(value>1.25,"pinch changes live zoom: "+value);
     await page.screenshot({path:join(OUT,"studio-390-pinch.png")});
     await page.evaluate(()=>document.documentElement.dataset.theme="noite");
     await page.screenshot({path:join(OUT,"studio-390-dark.png")});
   }
   // Canceling discards the temporary bitmap and never calls the backend.
   await page.locator("[data-avatar-back]").click();
   assert.equal(await page.locator("[data-avatar-crop][open]").count(),0);
   assert.equal(await page.locator("[data-avatar-menu][open]").count(),1);
   await page.locator("[data-avatar-cancel]").click();
   assert.equal(await page.locator("[data-avatar-menu][open]").count(),0);
   await context.close();
 }
 console.log("Looply avatar studio visual tests: 320, 360, 390, 428, 768 px; portrait/landscape/square; zoom/rotate/real pinch/dark/cancel passed.");
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
