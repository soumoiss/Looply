import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {join,resolve,extname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const OUT=join(ROOT,"smoke-results/model-v3-20261110");
const IMG="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 580"><rect width="480" height="580" fill="#a990be"/><circle cx="240" cy="220" r="110" fill="#dcc9ed"/></svg>');
function fixture(){
 return [
 '<!doctype html><html lang="pt-BR" data-theme="lilas"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
 '<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/assets/css/app.css"><link rel="stylesheet" href="/assets/css/pages/shared.css"><link rel="stylesheet" href="/assets/css/theme-complete.css"><link rel="stylesheet" href="/assets/css/pages/ios-redesign.css"><link rel="stylesheet" href="/assets/css/pages/home-reels.css"></head>',
 '<body class="looply-page page-home looply-premium"><div class="container-page"><header class="page-header gh glass" data-site-header>',
 '<a class="brand-inline" href="home.html"><span class="brand-mark"><span class="circle">◌</span></span><span><strong>Looply</strong><span>MoissWorld</span></span></a>',
 '<nav class="header-actions page-navigation" aria-label="Navegação principal">',
 ...[["Início","home.html"],["Reels","reels.html"],["Cartas","cartas.html"],["Músicas","musicas.html"],["Galeria","galeria.html"],["Chat","chat.html"]].map(([name,href],i)=>'<a class="header-action" href="'+href+'"'+(!i?' aria-current="page"':'')+'><span class="page-navigation-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M7 12h10"/></svg></span><span class="page-navigation-label">'+name+'</span></a>'),
 '</nav><a class="header-action header-notifications" href="notificacoes.html">♧</a><details class="looply-account-menu"><summary class="looply-account"><span class="looply-user-initial">T</span></summary></details></header>',
 '<main><div id="pageContent" class="page-content shell">',
 '<section class="hero-panel home-welcome"><div class="home-welcome-avatar">T</div><div class="home-welcome-copy"><h1>Bem-vindo, Teste</h1></div><a class="header-action home-profile-shortcut" href="perfil.html">Meu perfil</a></section>',
 '<section class="story-area" id="stories"><div class="why-now-mount"><div class="why-now-header">Why Now</div><div class="why-now-people"><button class="why-now-person"><span class="why-now-person-ring"><span class="why-now-person-face">T</span></span><span class="why-now-person-label">Seu Why Now</span></button><button class="why-now-person"><span class="why-now-person-ring"><span class="why-now-person-face">A</span></span><span class="why-now-person-label">Amiga</span></button></div></div></section>',
 '<a class="looply-music-of-day" data-global-music href="musicas.html"><span class="looply-music-of-day-copy"><strong>Música do dia</strong></span></a>',
 '<section class="social-area"><div class="social-heading"><h2>Publicações</h2></div>',
 '<form class="post-composer" data-social-post><header class="post-composer-heading"><span class="post-compose-pen">✒</span><strong>Nova publicação</strong><button type="button" data-toggle-composer class="post-add-button">+</button></header><div class="post-composer-fields" data-composer-fields hidden><textarea name="body"></textarea></div></form>',
 '<div class="feed-list" data-social-feed><article class="post-card" data-post-card="post-a">',
 '<header class="post-header"><div class="post-author"><button type="button" class="post-author-profile" data-profile-open="me"><span class="post-avatar">T</span><div><strong>Teste @teste</strong><time>Hoje</time></div></button></div><div class="post-controls"><span class="visibility-pill">Público</span><button type="button" data-delete-post="post-a">Excluir</button></div></header>',
 '<div class="post-media-grid" data-feed-carousel><figure class="post-media"><img src="'+IMG+'" alt="Foto"></figure></div><p class="post-body">Legenda da publicação</p>',
 '<div class="post-interactions"><button type="button" class="post-icon-button post-like-button" data-toggle-like="post-a" aria-pressed="false"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 7l9 12 9-12" stroke="currentColor" fill="none"/></svg><span>1</span></button><button type="button" class="post-icon-button" data-toggle-post-comments="post-a">□<span>2</span></button><button type="button" class="post-icon-button" data-share-post="post-a">Compartilhar</button><button type="button" class="post-icon-button" data-share-in-app="post-a">Enviar no Looply</button></div><section class="post-comments"></section></article>',
 '<article class="post-card" data-post-card="post-b"><header class="post-header"><div class="post-author"><button type="button" class="post-author-profile" data-profile-open="other"><span class="post-avatar">A</span><div><strong>Amiga @amiga</strong><time>Ontem</time></div></button></div><div class="post-controls"><span class="visibility-pill">Público</span></div></header>',
 '<section class="post-external"><div class="post-external-credit"><span class="hybrid-provider-label">Instagram</span><div class="hybrid-provider-tools"><a href="https://www.instagram.com/reel/ABC123/">Abrir original</a></div></div><div class="hybrid-external-frame"><button type="button" data-open-external-reel="external-b">Assistir em Reels</button></div></section><p class="post-body">Reel externo</p>',
 '<div class="post-interactions"><button type="button" class="post-icon-button" data-toggle-like="post-b" aria-pressed="false">♡<span>2</span></button><button type="button" class="post-icon-button" data-toggle-post-comments="post-b">□<span>0</span></button><button type="button" class="post-icon-button" data-share-post="post-b">Compartilhar</button><button type="button" class="post-icon-button" data-share-in-app="post-b">Enviar</button></div></article></div></section>',
 '</div></main></div>',
 '<script type="module">',
 'import {mountPremiumSurface} from "/src/home-reels-premium.js";',
 'function q(table){const x={select(){return x},eq(){return x},neq(){return x},order(){return x},limit(){return x},in(){return Promise.resolve({data:[],error:null})},maybeSingle(){return Promise.resolve({data:null,error:null})},then(resolve,reject){return Promise.resolve({data:table==="profiles"?[{id:"friend-a",username:"amiga",display_name:"Amiga"},{id:"friend-b",username:"colega",display_name:"Colega"}]:[],error:null}).then(resolve,reject)}};return x;}',
 'window.shareCalls=[];const client={from:q,functions:{invoke:async(name,{body})=>{window.shareCalls.push(body);return {data:{conversationId:"conv-"+body.targetId},error:null}}},rpc:async(name,args)=>({data:name==="v13_set_post_reaction"?{emoji:args.p_emoji,count:args.p_emoji?2:1}:name==="v13_post_engagement_page"?{total:1,summary:{"❤️":1},items:[{id:"friend-a",username:"amiga",display_name:"Amiga",emoji:"❤️"}]}:{},error:null})};',
 'mountPremiumSurface({root:document.querySelector("#pageContent"),client,user:{id:"me"},profile:{username:"teste",display_name:"Teste"},mode:"native",refresh:async()=>true});',
 'window.modelFixtureReady=true;',
 '</script></body></html>'
 ].join("");
}
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(pathname==="/__model__"){res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(fixture());return;}
  if(pathname==="/src/profile-api.js"){res.writeHead(200,{"content-type":"text/javascript"});res.end("export async function signPeople(c,items){return items}");return;}
  if(pathname==="/src/secret-messages.js"){res.writeHead(200,{"content-type":"text/javascript"});res.end("export async function mountSecretMessages(){}");return;}
  if(!/^\/(?:src\/[a-zA-Z0-9_./-]+\.js|assets\/css\/[a-zA-Z0-9_./-]+\.css|styles\.css)$/.test(pathname)||pathname.includes("..")){res.writeHead(404);res.end();return;}
  const data=await readFile(join(ROOT,pathname.slice(1)));
  res.writeHead(200,{"content-type":extname(pathname)===".css"?"text/css":"text/javascript"});res.end(data);
 }catch(error){res.writeHead(404);res.end(String(error));}
});
await mkdir(OUT,{recursive:true});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const width of [320,360,390,428,768]){
  const ctx=await browser.newContext({viewport:{width,height:820},deviceScaleFactor:1,reducedMotion:"reduce"});
  const page=await ctx.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(origin+"/__model__");
  await page.waitForFunction(()=>window.modelFixtureReady===true);
  await page.waitForTimeout(90);
  const d=await page.evaluate(()=>{
   const rect=selector=>{const n=document.querySelector(selector)?.getBoundingClientRect();return n?{x:n.x,y:n.y,right:n.right,bottom:n.bottom,width:n.width,height:n.height}:null};
   return {header:rect(".page-header"),nav:rect("nav.page-navigation"),card:rect(".post-card.post"),composer:rect(".comp1"),
    posts:document.querySelectorAll(".post-card.post").length,links:document.querySelectorAll(".post-card .lnk").length,
    visuals:document.querySelectorAll(".post-card .ph, .post-card .pa").length,
    overflow:document.documentElement.scrollWidth-innerWidth,
    external:getComputedStyle(document.querySelector(".post-external")).display};
  });
  console.log("MODEL_V3_RUNTIME",JSON.stringify({width,...d}));
  assert.deepEqual(errors,[],"javascript errors");
  assert.equal(d.posts,2);
  assert.equal(d.links,1);
  assert.equal(d.visuals,4);
  assert.equal(d.external,"none");
  assert.ok(d.nav.y>d.header.bottom+25,"dock overlapping header");
  assert.ok(d.nav.bottom>760&&d.nav.bottom<=821,"dock must be bottom");
  assert.ok(d.card.width>270&&d.card.right<=width+1,"feed card must fit");
  assert.ok(d.composer.width>270&&d.composer.right<=width+1,"composer must fit");
  assert.ok(d.overflow<=1,"document horizontal overflow");
  await page.screenshot({path:join(OUT,"native-"+width+".png"),fullPage:true});
  if(width===390){
   await page.locator("[data-premium-grid]").click();
   assert.equal(await page.locator(".feed-list.feed.mos").count(),1);
   await page.locator("[data-premium-list]").click();
   await page.locator("[data-premium-search]").click();
   await page.locator("#q").fill("sem resultados");
   assert.equal(await page.locator(".post-card.post:visible").count(),0);
   await page.locator("#q").fill("");
   await page.locator("[data-premium-search]").click();
   await page.locator("[data-premium-menu=post-a]").click();
   assert.equal(await page.locator("dialog.premium-actions-sheet[open]").count(),1);
   await page.keyboard.press("Escape");
   await page.locator("[data-toggle-like=post-a]").click();
   await page.waitForTimeout(90);
   assert.equal(await page.locator("[data-toggle-like=post-a]").getAttribute("aria-pressed"),"true");
   await page.locator("[data-toggle-like=post-a]").click();
   await page.waitForTimeout(90);
   assert.equal(await page.locator("[data-toggle-like=post-a]").getAttribute("aria-pressed"),"false");
   // O formulário deve abrir em top layer, mas continuar ligado ao form original.
   await page.locator("[data-premium-compose]").click();
   assert.equal(await page.locator("dialog.premium-compose-dialog[open]").count(),1);
   assert.equal(await page.locator("dialog.premium-compose-dialog [data-composer-fields]:visible").count(),1);
   assert.equal(await page.locator("form[data-social-post] dialog.premium-compose-dialog").count(),1);
   await page.keyboard.press("Escape");
   assert.equal(await page.locator("dialog.premium-compose-dialog[open]").count(),0);
   // Quem curtiu, avatar e nome reais no modal.
   await page.locator("[data-premium-likers=post-a]").click();
   await page.locator(".premium-like-row").first().waitFor();
   assert.equal(await page.locator(".premium-like-row").count(),1);
   await page.locator("[data-close-likes]").click();
   // Envio interno: grade, seleção múltipla, mensagem e duas entregas.
   await page.locator("[data-share-in-app=post-a]").click();
   await page.locator(".looply-send-person").first().waitFor();
   assert.equal(await page.locator(".looply-send-person").count(),2);
   await page.locator('[data-send-person="friend-a"]').click();
   await page.locator('[data-send-person="friend-b"]').click();
   await page.locator("[data-send-message]").fill("Veja esta publicação");
   await page.locator("[data-send-submit]").click();
   await page.waitForFunction(()=>window.shareCalls.length===2);
   const shares=await page.evaluate(()=>window.shareCalls);
   assert.deepEqual(shares.map(x=>x.targetId),["friend-a","friend-b"]);
   assert.ok(shares.every(x=>x.body==="Veja esta publicação"));
   await page.locator("[data-send-close]").click();
   await page.locator("[data-premium-save=post-a]").click();
   await page.waitForTimeout(80);
   assert.equal(await page.locator("[data-premium-save=post-a]").getAttribute("aria-pressed"),"true");
   await page.screenshot({path:join(OUT,"native-390-interactions.png")});
  }
  await ctx.close();
 }
 console.log("MODEL_V3_RUNTIME_VISUAL_OK");
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
