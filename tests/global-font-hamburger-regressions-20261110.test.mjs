import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Global header restores a real three-bar menu with original destinations",()=>{
  const runtime=read("src/page-runtime.js");
  const css=read("assets/css/pages/global-shell.css");
  for(const destination of ['href="perfil.html"','href="usuarios.html"',
    'href="configuracoes.html"','href="admin.html"'])
    assert.ok(runtime.includes(destination),destination);
  assert.match(runtime,/account-menu-caret[^\n]+icon\("menu"\)/);
  assert.match(runtime,/looply-menu-identity/);
  assert.match(runtime,/admin \? \`<button/);
  assert.match(css,/account-menu-caret\s*\{/);
  assert.match(css,/display:grid!important/);
  assert.match(css,/account-menu-caret svg/);
  assert.match(css,/width:25px!important/);
  assert.match(css,/account-menu-popover/);
  assert.match(css,/overflow-y:auto/);
});

test("Standalone Chat offers the same destinations and hides ADM from nonadmins",()=>{
  const chat=read("chat.html");
  const adapter=read("assets/js/chat-ultra-live.js");
  for(const href of ['href="perfil.html"','href="usuarios.html"',
    'href="configuracoes.html"','href="admin.html"'])
    assert.ok(chat.includes(href),href);
  assert.ok(chat.includes('$("#accBtn").innerHTML=ic("menu")'));
  assert.ok(chat.includes('data-m="photo"'));
  assert.ok(chat.includes('document.body.dataset.looplyAdminAccess==="true"'));
  assert.ok(adapter.includes('isAdmin===true?"true":"false"'));
  assert.ok(!chat.includes('document.documentElement.dataset.theme=d?"light":"dark"'));
  assert.match(chat,/aria-expanded="false"/);
});

test("Account fonts cover legacy DIV and SPAN text but keep user-created media",()=>{
  const css=read("assets/css/global-theme-typography.css");
  const shell=read("assets/css/pages/global-shell.css");
  const theme=read("src/theme-bootstrap.js");
  assert.match(css,/div,span,section,article/);
  assert.ok(css.includes(":is(\n  div,span,section,article"));
  assert.match(css,/:not\(\.overlay-item\)/);
  assert.match(css,/:not\(\.sticker\)/);
  assert.match(css,/--looply-font-family/);
  assert.match(css,/Cabin Sketch/);
  assert.match(shell,/font-weight:700!important/);
  assert.match(theme,/root\.style\.setProperty\("--looply-font-family",family\)/);
});

test("All application pages receive font override stylesheet through build",()=>{
  const build=read("scripts/build.mjs");
  const css=read("assets/css/global-theme-typography.css");
  const bootstrap=read("src/theme-bootstrap.js");
  assert.ok(build.includes("assets/css/global-theme-typography.css"));
  assert.match(build,/data-looply-appearance-styles/);
  assert.match(css,/--looply-heading-font/);
  assert.match(bootstrap,/loadFont\(font\)/);
  for(const page of ["home.html","chat.html","musicas.html","cartas.html",
    "galeria.html","configuracoes.html","perfil.html","usuarios.html"]){
    assert.ok(read("dist/"+page).includes("global-theme-typography.css?build="),page);
  }
});
