import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {primaryDestinations} from "../src/primary-navigation.js";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const pages=["home.html","reels.html"];
const legacy=["home-hybrid.css","feed-reels-refresh.css","feed-reels-experience.css",
  "reels-immersive-fix.css","reels-tab.css","story-reels-viewport-fix.css",
  "stories-four-screens.css","stories-instagram.css"];

test("os dois destinos carregam exclusivamente o novo CSS de página, sem modo antigo",()=>{
  for(const p of pages){
    const html=read(p);
    assert.match(html,/assets\/css\/pages\/home-reels\.css\?v=/);
    assert.match(html,/data-site-header/);
    assert.match(html,/src\/theme-bootstrap\.js/);
    for(const old of legacy)assert.ok(!html.includes(old),p+": "+old);
    assert.doesNotMatch(html, /looply-feed-nav|<nav class="dock"/);
  }
  assert.equal(primaryDestinations.length,6);
});

test("não existem perfis, publicações, curtidas ou imagens de demonstração no controlador novo",()=>{
  const files=["src/home-reels-premium.js","assets/js/home.js","assets/js/reels.js"];
  for(const path of files){
    const js=read(path);
    assert.doesNotMatch(js,/\bconst (?:USERS|ME|STO|REELS|hashStr|likersOf|PAL|TXT)\b/);
    assert.doesNotMatch(js,/\bart\s*\(/);
    assert.doesNotMatch(js,/Simular nova publicação|Simular recado secreto|Modelo: só a aba/);
    assert.doesNotMatch(js,/Bem-vindo ao Looply — Feed & Reels Aprimorados|Feed e Reels conectados ao vivo|Feed conectado com atualizações ao vivo/);
  }
});

test("reações preservam a regra de uma por pessoa, reversão otimista e os seis emojis",()=>{
  const source=read("src/home-reels-premium.js"),sql=read("migration/20261110_home_reels_premium.sql");
  for(const emoji of ["❤️","😂","😮","😢","🔥","👏"])assert.ok(source.includes(emoji)&&sql.includes(emoji),emoji);
  assert.match(sql,/PRIMARY KEY \(post_id,user_id\)/);
  assert.match(sql,/ON CONFLICT\(post_id,user_id\) DO UPDATE/);
  assert.match(sql,/v13_set_post_reaction/);
  assert.match(source,/pendingLikes/);
  assert.match(source,/updateLikeDisplay\(postId,wasLiked,prev,count\)/);
  assert.match(source,/pointerdown/);
  assert.match(source,/showPicker/);
});

test("folha de quem curtiu tem paginação, busca, abas, proteção de audiência e seguir persistido",()=>{
  const js=read("src/home-reels-premium.js"),sql=read("migration/20261110_home_reels_premium.sql");
  for(const fragment of ["v13_post_engagement_page","p_offset:likePage","p_limit:25",
    'p_following_only:likerTab==="following"',"data-like-search","data-like-summary",
    "data-like-tab","v11_set_follow","loadMoreLikes","signPeople(client,items)"])assert.ok(js.includes(fragment),fragment);
  assert.match(sql,/public\.v3_can_view_post\(p_post_id\)/);
  assert.match(sql,/public\.chat_user_blocks/);
  assert.match(sql,/public\.follows/);
  assert.match(sql,/LIMIT LEAST\(GREATEST\(p_limit,1\),50\)/);
  assert.doesNotMatch(sql,/SELECT.+email|access_token|secret_key/);
});

test("salvos são persistentes e idempotentes, com rollback visível",()=>{
  const js=read("src/home-reels-premium.js"),sql=read("migration/20261110_home_reels_premium.sql");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.post_saves/);
  assert.match(sql,/ON CONFLICT DO NOTHING/);
  assert.match(js,/v13_set_post_saved/);
  assert.match(js,/if\(before\)saved\.add\(postId\);else saved\.delete\(postId\)/);
  assert.match(js,/Não foi possível atualizar os salvos/);
});

test("Reels usam progresso real do vídeo, vídeo sem corte, gestos, teclado e som persistido",()=>{
  const js=read("src/home-reels-premium.js"),viewer=read("src/home-hybrid-reels.js"),css=read("assets/css/pages/home-reels.css");
  for(const fragment of ["timeupdate","video.currentTime/video.duration","arrowdown","arrowup",
     '"j"','"k"','key===" "', 'key==="l"', 'key==="m"', 'key==="escape"',
     "last<310","premiumViewerSave"])assert.ok(js.includes(fragment),fragment);
  assert.match(viewer,/localStorage\.setItem\('looply-premium-reels-sound-on'/);
  assert.match(viewer,/IntersectionObserver/);
  assert.match(viewer,/source\.frame\.removeAttribute\("src"\)/);
  assert.match(css,/\.looply-reels-scroll \.looply-reel-slide\{[^}]*scroll-snap-align:start/);
  assert.match(css,/\.looply-reels-scroll \.looply-reel-slide video\{[^}]*object-fit:contain/);
});

test("compositor original, live feed, tema e Why Now permanecem ligados aos dados reais",()=>{
  const home=read("assets/js/home.js"),reels=read("assets/js/reels.js");
  const src=read("src/home-reels-premium.js");
  for(const fragment of ["loadStories","mountWhyNowStories","mountSecretMessages","setupSocialRealtime",
    'client.from("app_settings")',"bindSocialEvents","bindHomeCommentsSheet"])assert.ok(home.includes(fragment),fragment);
  assert.match(reels,/loadSocialData\(client,"external"\)/);
  assert.match(home,/loadSocialData\(client,"native"\)/);
  assert.match(src,/data-social-post/);
  assert.match(src,/data-social-feed/);
  assert.match(src,/data-premium-filter/);
  assert.match(src,/premiumGrid/);
  assert.match(src,/premiumReels/);
});

test("service worker e build referenciam os artefatos sem chaves no front",()=>{
  const sw=read("sw.js"),build=read("scripts/build.mjs");
  assert.match(sw,/looply-shell-v50-home-reels-polish-20261110/);
  assert.match(sw,/home-reels\.css/);
  assert.match(sw,/src\/home-reels-premium\.js/);
  assert.match(build,/await cp\(path\.join\(projectRoot, "src"\)/);
  assert.match(build,/await cp\(path\.join\(projectRoot, "assets"\)/);
  assert.match(build,/rtcIceServers: \[\]/);
});


test("regressão v4: dock não pode ser capturado pelo backdrop-filter do cabeçalho",()=>{
  const css=read("assets/css/pages/home-reels.css");
  assert.match(css,/v4 — PARIDADE VISUAL MOBILE-FIRST/);
  assert.match(css,/\.page-header\.gh\{\s*-webkit-backdrop-filter:none!important;backdrop-filter:none!important/);
  assert.match(css,/\.page-header\.gh > \.page-navigation\{\s*position:fixed!important;top:auto!important/);
  assert.match(css,/bottom:calc\(9px \+ env\(safe-area-inset-bottom\)\)!important/);
  assert.match(css,/\.page-header\.gh::before\{[\s\S]{0,200}backdrop-filter/);
});

test("regressão v4: curtir alterna para descurtir e o teclado não cria recursão de eventos",()=>{
  const js=read("src/home-reels-premium.js");
  assert.match(js,/void react\(id,like\.dataset\.premiumEmoji\|\|"❤️"\)/);
  assert.doesNotMatch(js,/void react\(id,emoji\|\|like\.dataset\.premiumEmoji/);
  assert.match(js,/track\?\.scrollBy\(\{top:/);
  assert.doesNotMatch(js,/dispatchEvent\(new KeyboardEvent\("keydown"/);
});

test("regressão v4: controles e embeds são compactos, responsivos e não criam scroll horizontal",()=>{
  const css=read("assets/css/pages/home-reels.css"),src=read("src/home-reels-premium.js");
  assert.match(css,/\.premium-composer \.post-add-button\{[\s\S]{0,230}width:44px!important/);
  assert.match(css,/\.premium-filters\{[\s\S]{0,200}grid-template-columns:auto auto minmax\(0,1fr\) 44px/);
  assert.match(css,/\.post-instagram-embed,/);
  assert.match(css,/\.post-card \.post-external iframe,/);
  assert.match(css,/\.post-card \.post-interactions\{/);
  assert.match(css,/\.post-media-grid:has\(> \.post-media:only-child\)/);
  assert.match(src,/const del=by\(card,"\[data-delete-post\]"\)/);
  assert.match(src,/const shared=by\(card,"\[data-share-in-app\]"\)/);
});
