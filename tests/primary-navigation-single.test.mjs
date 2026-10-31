import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { primaryDestinations, primaryNavigationMarkup } from "../src/primary-navigation.js";
import { socialMarkup } from "../src/social.js";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const routes=["home.html","cartas.html","musicas.html","galeria.html","chat.html","notificacoes.html"];
const pages=["home","letters","music","gallery","chat","conversation","notifications","profile","settings","admin"];
const escape=val=>val.replace(/[.*+?^\\${}()|[\]\\]/g,"\\$&");

test("a single accessible primary navigation provides exactly six stable local SVG icons",()=>{
  assert.equal(primaryDestinations.length,6);
  assert.deepEqual(primaryDestinations.map(([, ,href])=>href),routes);
  for(const page of pages) {
    const nav=primaryNavigationMarkup(page,15);
    assert.equal((nav.match(/<nav /g)||[]).length,1,page);
    assert.equal((nav.match(/<a class="header-action"/g)||[]).length,6,page);
    assert.equal((nav.match(/<svg /g)||[]).length,6,page);
    assert.doesNotMatch(nav,/<img|<iframe|https?:\/\/|<script|\p{Extended_Pictographic}/u);
    for(const route of routes)assert.equal((nav.match(new RegExp('href="'+escape(route)+'"','g'))||[]).length,1,route);
    const expected=page==="conversation"?"chat":page;
    const active=primaryDestinations.find(([key])=>key===expected)?.[2];
    assert.equal((nav.match(/aria-current="page"/g)||[]).length,active?1:0,page);
    if(active)assert.match(nav,new RegExp('href="'+escape(active)+'"[^>]*aria-current="page"'),page);
    assert.match(nav,/aria-label="Navegação principal"/);
    assert.match(nav,/aria-label="Avisos"/);
    assert.match(nav,/page-navigation-icon/);
  }
});

test("badge is scoped to Avisos without duplicating notification links",()=>{
  assert.match(primaryNavigationMarkup("home",103),/aria-label="103 não lidas">99\+/);
  assert.equal((primaryNavigationMarkup("home",103).match(/class="navigation-badge"/g)||[]).length,1);
  assert.doesNotMatch(primaryNavigationMarkup("home",0),/navigation-badge/);
});

test("the feed never inserts its own bottom bar even after fresh render",()=>{
  for(let i=0;i<3;i++) {
    const feed=socialMarkup({people:[],posts:[],postsError:null},"sample-user");
    assert.doesNotMatch(feed,/<nav|looply-feed-nav|Navegação rápida/);
  }
});

test("no HTML page includes a second hardcoded primary navigation",async()=>{
  const files=["home.html","cartas.html","musicas.html","galeria.html","chat.html",
    "conversa.html","notificacoes.html","perfil.html","usuarios.html","configuracoes.html",
    "admin.html"];
  for(const path of files){
    const file=await read(path);
    assert.doesNotMatch(file,/<nav[^>]*class="[^"]*page-navigation/i,path);
    assert.match(file,/<header[^>]*data-site-header[^>]*><\/header>/,path);
  }
});

test("canonical renderer is the only runtime route source and badge stays intact",async()=>{
  const runtime=await read("src/page-runtime.js");
  assert.match(runtime,/import \{ primaryNavigationMarkup \} from "\.\/primary-navigation\.js"/);
  assert.match(runtime,/primaryNavigationMarkup\(page, unreadCount\)/);
  assert.match(runtime,/refreshUnreadBadge\(header, supabase\)/);
  assert.match(runtime,/page-navigation a\[href="notificacoes\.html"\]/);
  assert.doesNotMatch(runtime,/<nav class="header-actions page-navigation"/);
});

test("mobile layout fits all six links within 320px without horizontal scroll",async()=>{
  const [shared,hybrid,reels]=await Promise.all([
    read("assets/css/pages/shared.css"),read("assets/css/pages/home-hybrid.css"),
    read("assets/css/pages/feed-reels-experience.css")
  ]);
  assert.match(shared,/grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(shared,/\.page-navigation \{ position: fixed/);
  assert.match(shared,/bottom: calc\(7px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(shared,/\.page-navigation \.header-action \{ min-width: 0; width: 100%; min-height: 54px/);
  assert.match(shared,/\.page-navigation-icon \.looply-icon \{[^}]*margin: 0; color: inherit/);
  assert.doesNotMatch(shared,/flex: 1 0 52px; min-width: 52px/);
  assert.doesNotMatch(shared,/page-navigation-icon[^\n]*#000/);
  assert.doesNotMatch(hybrid,/looply-feed-nav/);
  assert.doesNotMatch(reels,/looply-feed-nav/);
});
