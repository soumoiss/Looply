import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=path=>readFileSync(fileURLToPath(new URL("../"+path,import.meta.url)),"utf8");
const routes=["home.html","reels.html","cartas.html","musicas.html","galeria.html","chat.html","conversa.html","perfil.html","usuarios.html","configuracoes.html","notificacoes.html","admin.html"];
const six=[["Início","home.html"],["Reels","reels.html"],["Cartas","cartas.html"],["Músicas","musicas.html"],["Galeria","galeria.html"],["Chat","chat.html"]];
test("todas as seis abas e páginas secundárias carregam o MESMO shell após estilos locais",()=>{
 for(const path of routes){
  const html=read(path);
  assert.match(html,/assets\/css\/pages\/global-shell\.css\?v=global-shell-20261110/,path);
  const last=html.lastIndexOf('assets/css/pages/global-shell.css');
  assert.ok(last>html.lastIndexOf('assets/css/pages/ios-redesign.css')||["chat.html","conversa.html","admin.html"].includes(path),path);
 }
});
test("marca usa a mesma tipografia, rotação e cor dinâmica da aba Músicas",()=>{
 const css=read("assets/css/pages/global-shell.css");
 assert.match(css,/font-family:"Cabin Sketch",cursive!important/);
 assert.match(css,/font-weight:700!important/);
 assert.match(css,/animation:looply-global-mark-rotate 3s linear infinite!important/);
 assert.match(css,/color:var\(--primary\)!important/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.brand-mark-animated > \.circle/);
 const base=read("assets/css/app.css");
 assert.match(base,/\.brand-inline strong \{ font-family:'Cabin Sketch'/);
 assert.match(base,/\.brand-mark-animated \.circle \{ width:36px; height:36px/);
});
test("dock único de Início, fixo no rodapé em todas as larguras e seis destinos reais",()=>{
 const css=read("assets/css/pages/global-shell.css");
 assert.match(css,/nav\.page-navigation\{/);
 assert.match(css,/position:fixed!important;z-index:1000!important/);
 assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/);
 assert.match(css,/bottom:calc\(10px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
 assert.match(css,/-webkit-backdrop-filter:none!important/);
 assert.match(css,/body\.looply-page\.page-chat:has\(textarea:focus\)/);
 const nav=read("src/primary-navigation.js");
 for(const [label,href] of six){assert.ok(nav.includes('"'+label+'","'+href+'"'),href);}
 const runtime=read("src/page-runtime.js");
 assert.match(runtime,/primaryNavigationMarkup\(page, unreadCount\)/);
 assert.match(runtime,/header-notifications/);
 assert.match(runtime,/mountIosMotion\(header\)/);
});
test("Chat Ultra, sem botões falsos: seis links clicáveis e sino global",()=>{
 for(const p of ["chat.html","conversa.html"]){
  const src=read(p);
  assert.match(src,/href="home\.html" aria-label="Looply, início"/,p);
  assert.match(src,/class="global-chat-notification" href="notificacoes\.html"/,p);
  assert.match(src,/const NAV=\[\["home","Início","home\.html"\]/,p);
  assert.match(src,/\["chat","Chat","chat\.html"\]\]/,p);
  assert.match(src,/document\.createElement\("a"\);b\.className="header-action"/,p);
  assert.match(src,/b\.href=href;/,p);
  assert.doesNotMatch(src,/Modelo: só a aba Chat é interativa/);
  assert.match(src,/class="mark"><span class="circle"><svg/);
  assert.equal((src.match(/id="dock"/g)||[]).length,1);
 }
 const rt=read("src/page-runtime.js");
 assert.match(rt,/\.global-chat-notification/);
 assert.match(rt,/badge\.textContent=count>99\?"99\+":String\(count\)/);
});
test("ADM retém os quatro módulos internos, cria a barra global e inclui Avisos",()=>{
 const h=read("admin.html"),src=read("src/admin-model-live.js"),css=read("assets/css/pages/global-shell.css");
 assert.match(h,/body class="looply-admin-premium"/);
 assert.match(h,/class="global-chat-notification" href="notificacoes\.html"/);
 assert.match(h,/class="mark"><span class="circle"><svg/);
 assert.match(src,/import \{primaryNavigationMarkup\} from '\.\/primary-navigation\.js'/);
 assert.match(src,/primaryNavigationMarkup\('admin'\)/);
 assert.match(src,/globalDock\.classList\.add\('looply-adm-global-nav'\)/);
 assert.match(src,/for\(const \[id,label,icon\] of \[\['home','Painel','grid'\]/);
 assert.match(css,/body\.looply-admin-premium #dock:not\(\.looply-adm-global-nav\)/);
 assert.match(css,/body\.looply-admin-premium nav\.looply-adm-global-nav/);
});
test("renderizador alternativo não perde Reels e separa Avisos dos seis destinos",()=>{
 const src=read("src/neon-production-pages.js");
 assert.match(src,/primaryNavigationMarkup\(pageKey\)/);
 assert.match(src,/header-notifications/);
 assert.match(src,/mountIosMotion\(header\)/);
 assert.match(src,/\["reels", "Reels", "reels.html", "video"\]/);
});
