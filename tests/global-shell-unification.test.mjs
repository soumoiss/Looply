import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=path=>readFileSync(fileURLToPath(new URL("../"+path,import.meta.url)),"utf8");
const pages=["home.html","reels.html","cartas.html","musicas.html","galeria.html","perfil.html","usuarios.html","notificacoes.html","configuracoes.html"];
const css=read("assets/css/pages/global-shell.css");
const runtime=read("src/page-runtime.js");
const navigation=read("src/primary-navigation.js");
test("As nove páginas autenticadas carregam o mesmo CSS global por último",()=>{
 for(const page of pages){
  const html=read(page);
  const head=html.slice(0,html.indexOf("</head>"));
  const path="assets/css/pages/global-shell.css?v=20261110-unified-bold700";
  assert.equal(head.split(path).length-1,1,page);
  assert.ok(head.lastIndexOf(path)>head.lastIndexOf("ios-redesign.css"),page);
  assert.match(html,/data-site-header/,page);
 }
});
test("A barra global tem seis destinos reais e não repete Avisos",()=>{
 const links=[...navigation.matchAll(/\["(home|reels|letters|music|gallery|chat)","[^"]+","[^"]+","[^"]+"\]/g)];
 assert.equal(links.length,6);
 assert.doesNotMatch(navigation,/\["notifications"/);
 assert.match(css,/repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(css,/aria-current="page"/);
 assert.match(runtime,/header-notifications/);
});
test("Cabeçalho preserva as ações, fonte e animação de Músicas com cor do tema",()=>{
 assert.match(runtime,/brand-mark-animated/);
 assert.match(runtime,/header-notifications/);
 assert.match(runtime,/looply-account-menu/);
 assert.match(css,/Cabin Sketch/);
 assert.match(css,/font-weight:700!important;font-size:29px!important/);
 const chat=read("chat.html");
 assert.match(chat,/#gh \.brand strong\{[^}]*font-weight:700/);
 const homeCss=read("assets/css/pages/home-reels.css");
 assert.match(homeCss,/body\.looply-premium \.page-header\.gh \.brand-inline strong\{[^}]*font-weight:700/);
 assert.doesNotMatch(css,/font-weight:400!important;font-size:29px!important/);
 assert.match(css,/looply-global-brand-spin/);
 assert.match(css,/color:var\(--primary\)!important/);
 assert.match(css,/prefers-reduced-motion/);
 assert.doesNotMatch(css,/#7010b0/);
});
test("Dock fica fixo no viewport sem ser capturado pelo backdrop-filter do header",()=>{
 assert.match(css,/backdrop-filter:none!important/);
 assert.match(css,/\.page-header\[data-site-header\]::before/);
 assert.match(css,/position:fixed!important/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/max-width:560px!important/);
});
test("Chat usa os mesmos seis destinos funcionais, logo e botão Avisos",()=>{
 const chat=read("chat.html");
 assert.match(chat,/href="home.html" aria-label="Looply, início"/);
 assert.match(chat,/href="notificacoes.html" aria-label="Avisos"/);
 assert.match(chat,/const NAV=\[\["home","Início","home.html"\]/);
 assert.match(chat,/\["chat","Chat","chat.html"\]\]/);
 assert.match(chat,/const b=document.createElement\("a"\)/);
 assert.doesNotMatch(chat,/Modelo: só a aba Chat é interativa/);
 assert.match(chat,/looply-chat-brand-spin/);
 assert.match(chat,/querySelectorAll\("button,a"\)/);
});
