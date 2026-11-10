import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const fixture=[
 '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<link rel="stylesheet" href="/assets/css/pages/home-reels.css"></head><body class="looply-premium"><main id="fixture">',
 '<article data-post-card="post-a"><header class="post-header"><button class="post-author-profile"><span class="post-avatar">A</span><strong>Primeiro autor</strong></button></header><video data-feed-video data-feed-reel-id="reel-a" src="https://media.example.invalid/a.mp4"></video><button data-toggle-like="post-a">♥<span>1</span></button><p class="post-body">Primeiro vídeo</p></article>',
 '<article data-post-card="post-b"><header class="post-header"><button class="post-author-profile"><span class="post-avatar">B</span><strong>Segundo autor</strong></button></header><video data-feed-video data-feed-reel-id="reel-b" src="https://media.example.invalid/b.mp4"></video><button data-toggle-like="post-b">♥<span>2</span></button><p class="post-body">Segundo vídeo</p></article>',
 '<article data-post-card="post-t"><header class="post-header"><button class="post-author-profile"><span class="post-avatar">T</span><strong>TikTok</strong></button></header><section class="post-external"><div class="post-external-embed"><iframe src="https://www.tiktok.com/player/v1/6718335390845095173?autoplay=1&controls=0"></iframe></div><button data-open-external-reel="tt-reel">Reel</button></section></article>',
 '<article data-post-card="post-i"><header class="post-header"><button class="post-author-profile"><span class="post-avatar">I</span><strong>Instagram</strong></button></header><section class="post-external"><div class="post-external-embed"><iframe src="https://www.instagram.com/reel/ABC123xyz/embed/"></iframe></div><button data-open-external-reel="ig-reel">Reel</button></section></article>',
 '</main><script type="module">',
 'import {openHybridReels} from "/src/home-hybrid-reels.js";',
 'window.embedMessages=[];window.addEventListener("message",event=>{if(event.data?.testEmbedReceived)window.embedMessages.push(event.data.testEmbedReceived)});',
 'window.openTest=()=>{window.viewer=openHybridReels(document.querySelector("#fixture"));return !!window.viewer};',
 'window.testReady=true;',
 '</script></body></html>'
 ].join("");
const embedHtml=[
 '<style>html,body{margin:0;background:#08080a;color:#fff;height:100%}</style>',
 '<div>Official player API fixture</div>',
 '<script>window.addEventListener("message",event=>parent.postMessage({testEmbedReceived:event.data},"*"));',
 'parent.postMessage({"x-tiktok-player":true,type:"onPlayerReady",value:null},"*");',
 '</script>'
].join("");
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,"http://localhost").pathname;
  if(path==="/__reels_playback__"){res.writeHead(200,{"content-type":"text/html"});res.end(fixture);return;}
  if(path==="/src/home-hybrid-reels.js"){res.writeHead(200,{"content-type":"text/javascript"});res.end(await readFile(join(ROOT,path.slice(1))));return;}
  if(path==="/assets/css/pages/home-reels.css"){res.writeHead(200,{"content-type":"text/css"});res.end(await readFile(join(ROOT,path.slice(1))));return;}
  res.writeHead(404);res.end();
 }catch(err){res.writeHead(500);res.end(String(err));}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const [width,height] of [[320,712],[390,844]]){
  const context=await browser.newContext({viewport:{width,height}});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",err=>errors.push(err.message));
  await page.addInitScript(()=>{
   window.mediaCalls=[];
   HTMLMediaElement.prototype.play=function(){window.mediaCalls.push({action:"play",src:this.getAttribute("src"),muted:this.muted});return Promise.resolve();};
   HTMLMediaElement.prototype.pause=function(){window.mediaCalls.push({action:"pause",src:this.getAttribute("src"),muted:this.muted});};
   HTMLMediaElement.prototype.load=function(){};
  });
  await page.route("https://media.example.invalid/**",route=>route.abort());
  await page.route("https://www.tiktok.com/**",route=>route.fulfill({status:200,contentType:"text/html",body:embedHtml}));
  await page.route("https://www.instagram.com/**",route=>route.fulfill({status:200,contentType:"text/html",body:embedHtml}));
  await page.goto("http://127.0.0.1:"+server.address().port+"/__reels_playback__");
  await page.waitForFunction(()=>window.testReady);
  assert.equal(await page.evaluate(()=>window.openTest()),true);
  await page.waitForFunction(()=>window.mediaCalls.some(e=>e.action==="play"&&e.src?.includes("a.mp4")));
  let state=await page.evaluate(()=>({calls:window.mediaCalls,muted:document.querySelector('[data-reels-key="reel-a"] video').muted}));
  assert.equal(state.muted,false,"first video should request sound");
  const scrollTo=async index=>{
   await page.evaluate(i=>{const track=document.querySelector("[data-reels-track]");track.scrollTop=i*track.clientHeight;track.dispatchEvent(new Event("scroll"));},index);
   await page.waitForTimeout(350);
  };
  await scrollTo(1);
  state=await page.evaluate(()=>({calls:window.mediaCalls,creator:document.querySelector("[data-reels-creator]")?.textContent}));
  assert.ok(state.creator.includes("Segundo autor"),"creator must follow the active video");
  const pauseA=state.calls.findIndex(e=>e.action==="pause"&&e.src?.includes("a.mp4"));
  const playB=state.calls.findIndex(e=>e.action==="play"&&e.src?.includes("b.mp4"));
  assert.ok(pauseA>=0&&playB>pauseA,"previous video must pause before the next starts");
  await scrollTo(2);
  await page.waitForFunction(()=>document.querySelector('[data-reels-key="tt-reel"] iframe')?.hasAttribute("src"));
  await page.waitForFunction(()=>window.embedMessages.some(e=>e.type==="play"));
  state=await page.evaluate(()=>({calls:window.mediaCalls,frames:[...document.querySelectorAll(".looply-reel-embed")].map(x=>x.hasAttribute("src")),commands:window.embedMessages}));
  assert.deepEqual(state.frames,[true,false],"only the active external iframe may load");
  assert.ok(state.calls.some(e=>e.action==="pause"&&e.src?.includes("b.mp4")));
  assert.ok(state.commands.some(e=>e.type==="unMute"),"TikTok should receive audio control");
  await scrollTo(3);
  state=await page.evaluate(()=>({frames:[...document.querySelectorAll(".looply-reel-embed")].map(x=>x.hasAttribute("src")),stage:!!document.querySelector('[data-reels-key="ig-reel"] .looply-instagram-video-window')}));
  assert.deepEqual(state.frames,[false,true],"TikTok must unload when Instagram begins");
  assert.ok(state.stage,"Instagram video-only window");
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));});
  assert.equal(await page.locator('[data-reels-key="ig-reel"] iframe[src]').count(),0,"hidden app must stop external audio");
  await page.locator("[data-reels-close]").click();
  assert.equal(await page.locator("dialog[data-reels-scroll]").count(),0);
  assert.deepEqual(errors,[],"browser errors");
  console.log("REELS_PLAYBACK_LIFECYCLE_OK",width);
  await context.close();
 }
}finally{await browser?.close();await new Promise(done=>server.close(done));}
