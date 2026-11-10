import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const OUTPUT=join(ROOT,"smoke-results/reels-immersive-20261103");
const fixture=`<!doctype html><html lang="pt-BR" data-theme="lilas"><head>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/assets/css/app.css">
<link rel="stylesheet" href="/assets/css/pages/shared.css">
<link rel="stylesheet" href="/assets/css/theme-complete.css">
<link rel="stylesheet" href="/assets/css/pages/home-reels.css">
<style>html,body{padding:0;margin:0}.diagnostic{position:fixed;top:50%;left:50%;z-index:0}</style>
</head><body class="looply-page page-home page-reels looply-premium">
<dialog class="looply-reels-scroll" data-reels-scroll open>
<div class="looply-reels-track">
<section class="looply-reel-slide is-external-embed is-instagram-embed is-portrait-player">
<div class="looply-reel-media-stage"><iframe class="looply-reel-embed" title="Player de teste do Instagram"
srcdoc="&lt;style&gt;html,body{margin:0;height:100%;background:linear-gradient(160deg,#41334d,#201827);color:#fff;font-family:sans-serif} .mock{height:100%;display:grid;place-items:center;font-size:22px}&lt;/style&gt;&lt;div class=mock&gt;VIDEO 9:16&lt;/div&gt;"></iframe></div>
</section></div>
<header class="looply-reels-top"><button type="button" data-reels-close aria-label="Fechar">←</button><a href="#" class="looply-reels-original">Abrir original ↗</a></header>
<aside class="looply-reels-rail">
<button class="looply-reel-action" aria-label="Curtir"><span class="looply-reel-glyph">♡</span><small class="looply-reel-count">3</small></button>
<button class="looply-reel-action" aria-label="Comentários"><span class="looply-reel-glyph">♧</span><small class="looply-reel-count">2</small></button>
<button class="looply-reel-action" aria-label="Compartilhar"><span class="looply-reel-glyph">⇄</span></button>
<button class="looply-reel-action" aria-label="Enviar no Looply"><span class="looply-reel-glyph">➤</span></button>
</aside>
<footer class="looply-reels-bottom">
<div data-reels-creator><div class="post-author">
<button class="post-author-profile" type="button"><span class="post-avatar">M</span>
<div><strong data-profile-name-id="person-1">Moisés <span>@peixinho</span></strong>
<time datetime="2026-11-03T11:43:00Z">3 de nov. de 2026, 08:43</time></div></button></div></div>
<p data-reels-caption>Kkkkkksim</p><div class="looply-reels-audio">♫ <span>Áudio original · Instagram</span></div>
</footer>
</dialog>
</body></html>`;

const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,"http://127.0.0.1").pathname;
    if(path==="/__reels_fixture__"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(fixture);return;}
    if(!/^\/(?:assets\/css\/pages\/|assets\/css\/|assets\/css|)[$\w/-]+\.css$/.test(path)
      && !["/styles.css","/assets/css/app.css"].includes(path)){res.writeHead(404);res.end();return;}
    if(path.includes("..")){res.writeHead(404);res.end();return;}
    const file=join(ROOT,path.slice(1));
    res.writeHead(200,{"Content-Type":"text/css; charset=utf-8"});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await mkdir(OUTPUT,{recursive:true});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const url="http://127.0.0.1:"+server.address().port+"/__reels_fixture__";
let browser;
try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const [width,height] of [[320,712],[360,800],[390,844],[428,926],[709,1536],[1024,800]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
    const page=await context.newPage();
    const errors=[];page.on("pageerror",error=>errors.push(error.message));
    await page.goto(url,{waitUntil:"load"});
    for(const orientation of ["portrait","landscape"]){
      if(orientation==="landscape")await page.evaluate(()=>{
        const slide=document.querySelector(".looply-reel-slide");
        slide.classList.remove("is-portrait-player");slide.classList.add("is-landscape-player");
      });
      const result=await page.evaluate(()=>{
        const frame=document.querySelector(".looply-reel-embed");
        const creator=document.querySelector("[data-reels-creator] .post-author-profile");
        const name=document.querySelector("[data-reels-creator] strong");
        const time=document.querySelector("[data-reels-creator] time");
        const footer=document.querySelector(".looply-reels-bottom");
        const slide=document.querySelector(".looply-reel-slide");
        const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
        const color=el=>{const s=getComputedStyle(el);return {color:s.color,background:s.backgroundColor,bgImage:s.backgroundImage};};
        return {vw:innerWidth,vh:innerHeight,documentW:document.documentElement.scrollWidth,
          frame:box(frame),slide:box(slide),footer:box(footer),name:box(name),time:box(time),
          creator:color(creator),nameColor:color(name),timeColor:color(time),
          frameObjectFit:getComputedStyle(frame).objectFit,
          controls:[...document.querySelectorAll(".looply-reel-action")].map(box)};
      });
      const actual=result.frame.w/result.frame.h;
      const expected=orientation==="portrait"?9/16:16/9;
      console.log("REELS_VIEWPORT_DIAGNOSTIC",JSON.stringify({width,height,orientation,result,ratio:actual}));
      assert.ok(Math.abs(actual-expected)<.007,"wrong player ratio "+width+" "+orientation);
      assert.ok(result.frame.w<=width+2&&result.frame.h<=height+2,"media escapes viewport");
      assert.ok(result.frame.x>=-2&&result.frame.y>=-2,"player starts outside viewport");
      assert.ok(result.frame.right<=width+2&&result.frame.bottom<=height+2,"player clipped by viewport");
      assert.equal(result.creator.background,"rgba(0, 0, 0, 0)","white author card regressed");
      assert.equal(result.nameColor.color,"rgb(255, 255, 255)","username contrast regressed");
      assert.ok(result.footer.x>=-2&&result.footer.bottom<=height+2,"caption outside screen");
      assert.ok(result.time.w>0&&result.time.h>0,"author's date hidden");
      assert.ok(result.controls.every(control=>control.w>=42&&control.h>=44),"touch controls too small");
      assert.ok(result.documentW<=width+2,"horizontal overflow at "+width);
      assert.deepEqual(errors,[],"browser errors");
      if(orientation==="portrait")await page.screenshot({
        path:join(OUTPUT,"portrait-"+width+"x"+height+".png"),animations:"disabled"
      });
    }
    await context.close();
  }
}finally{await browser?.close();await new Promise(done=>server.close(done));}
console.log("Reels viewport and contrast smoke passed at 320, 360, 390, 428, 709 and 1024 CSS pixels.");
