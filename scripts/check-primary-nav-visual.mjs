import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {resolve,extname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const OUT=join(ROOT,"smoke-results/navigation-20261031");
const MIME={".js":"text/javascript",".css":"text/css",".html":"text/html",".svg":"image/svg+xml"};
const fixture=`<!doctype html><html lang="pt-BR" data-theme="lilas"><head>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/assets/css/app.css">
<link rel="stylesheet" href="/assets/css/pages/shared.css">
<link rel="stylesheet" href="/assets/css/pages/home-hybrid.css">
<link rel="stylesheet" href="/assets/css/pages/chat-mobile-reference.css">
<link rel="stylesheet" href="/assets/css/theme-complete.css">
<style>main{min-height:900px;padding:24px 0} .fixture-modal{position:fixed;inset:0;z-index:1500;background:#110b1d99;display:none} .fixture-modal.is-open{display:block}</style>
</head><body class="looply-page page-home"><div class="container-page">
<header class="page-header" data-site-header></header>
<main><h1>Looply</h1><p>Visualização de navegação e áreas seguras</p>
<div class="chat-message-form" style="margin-top:300px"><textarea aria-label="Digitar"></textarea></div></main>
<footer class="looply-footer">Looply</footer></div><div class="fixture-modal"></div>
<script type="module">
import {primaryNavigationMarkup} from "/src/primary-navigation.js";
const page=new URLSearchParams(location.search).get("page")||"home";
document.querySelector("[data-site-header]").innerHTML=primaryNavigationMarkup(page,7);
window.navigationReady=true;
</script></body></html>`;
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,"http://localhost").pathname;
    if(pathname==="/__nav_fixture__"){
      res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
      res.end(fixture);return;
    }
    if(!/^\/(?:src\/[a-zA-Z0-9_./-]+\.js|assets\/css\/[a-zA-Z0-9_./-]+\.css|styles\.css)$/.test(pathname)
      ||pathname.includes("..")){res.writeHead(404);res.end();return;}
    const content=await readFile(join(ROOT,pathname.slice(1)));
    res.writeHead(200,{"content-type":(MIME[extname(pathname)]||"application/octet-stream")+"; charset=utf-8"});
    res.end(content);
  }catch{res.writeHead(404);res.end();}
});
await mkdir(OUT,{recursive:true});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const address=server.address(),origin="http://127.0.0.1:"+address.port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const width of [320,360,390,428,768,1024]){
   const context=await browser.newContext({viewport:{width,height:800},deviceScaleFactor:1});
   const page=await context.newPage();
   const errors=[];page.on("pageerror",error=>errors.push(error.message));
   await page.goto(origin+"/__nav_fixture__?page=home");
   await page.waitForFunction(()=>window.navigationReady===true);
   const data=await page.evaluate(()=>{
     const nav=document.querySelector(".page-navigation");
     const rect=nav.getBoundingClientRect();
     const links=[...nav.querySelectorAll("a")].map(a=>{
       const b=a.getBoundingClientRect(),svg=a.querySelector("svg"),v=svg?.getBoundingClientRect();
       return {name:a.getAttribute("aria-label"),href:a.getAttribute("href"),active:a.getAttribute("aria-current")==="page",
         x:b.x,right:b.right,width:b.width,height:b.height,svgWidth:v?.width||0,svgHeight:v?.height||0};
     });
     return {width:innerWidth,navs:document.querySelectorAll("nav.page-navigation").length,
       totalNavs:document.querySelectorAll('nav[aria-label="Navegação principal"]').length,
       rect:{x:rect.x,right:rect.right,width:rect.width,bottom:rect.bottom},
       overflow:document.documentElement.scrollWidth-innerWidth,links,
       positions:getComputedStyle(nav).position,
       active:links.filter(x=>x.active).map(x=>x.href)};
   });
   console.log("NAV_VIEWPORT_DIAGNOSTICS",JSON.stringify(data));
   const svgDebug=await page.evaluate(()=>{
     const el=document.querySelector(".page-navigation a svg");
     const parent=el?.parentElement;
     if(!el)return {found:false,nav:document.querySelector(".page-navigation")?.outerHTML.slice(0,550)};
     const x=el.getBoundingClientRect();
     return {found:true,outer:el.outerHTML.slice(0,220),width:x.width,height:x.height,display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,
       computedWidth:getComputedStyle(el).width,computedHeight:getComputedStyle(el).height,
       parentDisplay:getComputedStyle(parent).display,parentWidth:getComputedStyle(parent).width,
       navHTML:document.querySelector(".page-navigation")?.outerHTML.slice(0,600)};
   });
   console.log("SVG_STYLE_DIAGNOSTICS",JSON.stringify(svgDebug));
   await page.screenshot({path:join(OUT,"navigation-diagnostic-"+width+".png")});

   assert.equal(errors.length,0,errors.join(" | "));
   assert.equal(data.navs,1,"exactly one nav at "+width);
   assert.equal(data.totalNavs,1,"exactly one landmark at "+width);
   assert.equal(data.links.length,6,"exactly six tabs at "+width);
   assert.deepEqual(data.active,["home.html"]);
   assert.ok(data.overflow<=1,"no horizontal scroll at "+width+": "+data.overflow);
   assert.ok(data.rect.x>=-1 && data.rect.right<=width+1,"nav within viewport at "+width);
   for(const item of data.links){
     assert.ok(item.svgWidth>=16 && item.svgHeight>=16,"missing svg "+item.name+" at "+width);
     if(width<=760){
       assert.ok(item.x>=-1 && item.right<=width+1,"link outside viewport "+item.name+" at "+width);
       assert.ok(item.width>=40 && item.height>=44,"undersized button "+item.name+" at "+width);
     }
   }
   if(width<=760)assert.equal(data.positions,"fixed","bottom mobile nav at "+width);
   await page.screenshot({path:join(OUT,"navigation-"+width+".png")});
   if(width===390){
     await page.evaluate(()=>{document.documentElement.dataset.theme="noite";document.querySelector(".fixture-modal").classList.add("is-open");});
     const overlay=await page.evaluate(()=>{
       const modal=document.querySelector(".fixture-modal"),nav=document.querySelector(".page-navigation");
       return document.elementFromPoint(innerWidth/2,innerHeight/2)===modal &&
         Number(getComputedStyle(modal).zIndex)>Number(getComputedStyle(nav).zIndex);
     });
     assert.equal(overlay,true,"modal must remain above bottom bar");
     await page.screenshot({path:join(OUT,"navigation-390-dark-modal.png")});
     await page.evaluate(()=>{
       document.querySelector(".fixture-modal").classList.remove("is-open");
       document.body.classList.remove("page-home");
       document.body.classList.add("page-chat");
       document.querySelector("textarea").focus();
     });
     const hidden=await page.$eval(".page-navigation",el=>getComputedStyle(el).display==="none");
     assert.equal(hidden,true,"nav must not overlap focused chat textarea");
   }
   await context.close();
 }
 console.log("Navigation visual smoke passed at 320, 360, 390, 428, 768 and 1024px; dark theme, modal and chat keyboard checked.");
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
