import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {join,resolve,extname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const OUT=join(ROOT,"smoke-results/pull-refresh");
const fixture=`<!doctype html><html lang="pt-BR" data-theme="lilas">
<head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/assets/css/app.css">
<link rel="stylesheet" href="/assets/css/pages/shared.css">
<style>main{min-height:1150px;padding:22px 6px}section.demo{margin:16px 0;padding:10px;background:var(--surface);border-radius:14px}
.dialog-test{width:220px;height:220px;border:0;border-radius:20px;background:var(--surface)}
</style></head>
<body class="looply-page page-home">
<div class="container-page"><header class="page-header" data-site-header></header>
<main><h1>Looply</h1><p>Arraste para atualizar</p><section class="demo" data-refresh-view>Dados recebidos: 0</section>
<form id="edit"><label>Rascunho <textarea placeholder="Não perder texto"></textarea></label></form>
<p>Rolagem principal</p></main><footer class="looply-footer">Looply</footer></div>
<dialog class="dialog-test" aria-modal="true">Carta em leitura</dialog>
<script type="module">
import {mountPullToRefresh} from "/src/pull-to-refresh.js";
const root=document.querySelector("main");
window.refreshCount=0;
window.refreshBusy=false;
window.stopRefresh=mountPullToRefresh({root,page:"home",refresh:async()=>{
 window.refreshCount++;
 window.refreshBusy=true;
 await new Promise(resolve=>setTimeout(resolve,35));
 document.querySelector("[data-refresh-view]").textContent="Dados recebidos: "+window.refreshCount;
 window.refreshBusy=false;
 return true;
}});
window.refreshReady=true;
</script></body></html>`;
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,"http://localhost").pathname;
  if(path==="/pull-fixture"){
   res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});res.end(fixture);return;
  }
  if(!/^\/(?:src\/[A-Za-z0-9_./-]+\.js|assets\/css\/[A-Za-z0-9_./-]+\.css|styles\.css)$/.test(path)||path.includes("..")){
    res.writeHead(404);res.end();return;
  }
  const body=await readFile(join(ROOT,path.slice(1)));
  res.writeHead(200,{"content-type":extname(path)===".js"?"text/javascript":extname(path)===".css"?"text/css":"application/octet-stream"});
  res.end(body);
 }catch(error){res.writeHead(404);res.end();}
});
await mkdir(OUT,{recursive:true});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const origin="http://127.0.0.1:"+server.address().port;
 for(const width of [320,360,390,428]){
  const context=await browser.newContext({viewport:{width,height:790},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(origin+"/pull-fixture");
  await page.waitForFunction(()=>window.refreshReady===true);
  const cdp=await context.newCDPSession(page);
  const touch=async(type,x,y)=>cdp.send("Input.dispatchTouchEvent",{
    type,touchPoints:type==="touchEnd"?[]:[{x,y,id:1}]
  });
  async function swipe({x=width/2,from=185,to=425,steps=6,screenshot}={}){
    await touch("touchStart",x,from);
    for(let i=1;i<=steps;i++){await touch("touchMove",x,from+(to-from)*i/steps);await new Promise(r=>setTimeout(r,24));}
    if(screenshot)await page.screenshot({path:join(OUT,screenshot)});
    await touch("touchEnd",x,to);
    await new Promise(r=>setTimeout(r,110));
  }
  const count=()=>page.evaluate(()=>window.refreshCount);
  await swipe({to:220});
  assert.equal(await count(),0,"short drag must cancel at "+width);
  await swipe({to:440,screenshot:"pull-progress-"+width+".png"});
  assert.equal(await count(),1,"full drag must refresh once at "+width);
  assert.match(await page.locator("[data-refresh-view]").textContent(),/1/);
  await page.screenshot({path:join(OUT,"pull-finished-"+width+".png")});
  await page.evaluate(()=>window.scrollTo(0,170));
  await swipe({to:460});
  assert.equal(await count(),1,"scrolled page must not refresh "+width);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.locator("#edit textarea").fill("Não publicar nem apagar");
  await swipe({to:440});
  assert.equal(await count(),1,"unsent draft must block refresh "+width);
  assert.equal(await page.locator("#edit textarea").inputValue(),"Não publicar nem apagar");
  await page.locator("#edit textarea").fill("");
  await page.evaluate(()=>document.querySelector("dialog").showModal());
  await swipe({x:width/2,to:440});
  assert.equal(await count(),1,"open dialog must block refresh "+width);
  await page.evaluate(()=>document.querySelector("dialog").close());
  await context.setOffline(true);
  await swipe({to:440});
  assert.equal(await count(),1,"offline must reject refresh "+width);
  assert.match(await page.locator(".looply-pull-indicator").textContent(),/Verifique sua conexão/);
  await context.setOffline(false);
  await page.evaluate(()=>window.scrollTo(0,0));
  // Do not reuse a pressed indicator or a stale gesture from the rejected request.
  await swipe({to:440});
  assert.equal(await count(),2,"online reconnect should refresh "+width);
  assert.equal(errors.length,0,errors.join(" | "));
  const layout=await page.evaluate(()=>({
    horizontalOverflow:document.documentElement.scrollWidth-innerWidth,
    indicatorCount:document.querySelectorAll(".looply-pull-indicator").length,
    safeArea:getComputedStyle(document.querySelector(".looply-pull-indicator")).top
  }));
  assert.ok(layout.horizontalOverflow<=1,"horizontal overflow "+width+": "+layout.horizontalOverflow);
  assert.equal(layout.indicatorCount,1,"singleton indicator "+width);
  console.log("PULL_VISUAL_PASS",JSON.stringify({width,refreshCount:await count(),layout}));
  await context.close();
 }
 console.log("Pull-to-refresh Chromium mobile touch checks passed: 320/360/390/428.");
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
