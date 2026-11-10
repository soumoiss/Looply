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
  assert.match(js,/Não foi possível salvar:/);
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
  assert.match(src,/data-premium-grid/);
  assert.match(src,/premiumReels/);
});

test("service worker e build referenciam os artefatos sem chaves no front",()=>{
  const sw=read("sw.js"),build=read("scripts/build.mjs");
  assert.match(sw,/const CACHE = "looply-shell-v\d+-reels-[a-z0-9-]+"/);
  assert.match(sw,/home-reels\.css/);
  assert.match(sw,/src\/home-reels-premium\.js/);
  assert.match(build,/await cp\(path\.join\(projectRoot, "src"\)/);
  assert.match(build,/await cp\(path\.join\(projectRoot, "assets"\)/);
  assert.match(build,/rtcIceServers: \[\]/);
});


test("modelo v3: preservar dock de seis destinos separado do cabeçalho",()=>{
  const css=read("assets/css/pages/home-reels.css");
  for(const rule of [".gh{",".dock{",".hero-panel{",".stories{",".comp1{",".ftool{",".feed{",".post{",".ph{",".pa{",".lb{",".lnk{",".rv{"])assert.ok(css.includes(rule),rule);
  assert.match(css,/body\.looply-premium \.page-header\.gh \.page-navigation\.dock\{/);
  assert.match(css,/-webkit-backdrop-filter:none!important;backdrop-filter:none!important/);
  assert.match(css,/position:fixed!important;left:50%!important;top:auto!important/);
  assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
});

test("modelo v3: componentes reais são transformados em markup do original",()=>{
 const src=read("src/home-reels-premium.js");
 for(const x of ["class=\"ftool\"","class=\"chips\"","class=\"vt\"","class=\"srch\"",
 "class=\"cardx\"","data-premium-stories","head.classList.add(\"comp1\")",
 "head.classList.add(\"ph\")","media?.classList.add(\"med\")",
 "actions.classList.add(\"pa\")","summary.dataset.premiumLikers",
 "element(\"div\",\"lnk\")","element(\"div\",\"qt\")",
 "element(\"div\",\"cap\")","element(\"div\",\"ts\",date)","element(\"div\",\"reels\")"])
  assert.ok(src.includes(x),x);
 assert.match(src,/social\?\.remove\(\)/);
 assert.match(src,/root\.__premiumBound/);
});

test("regressão v4: curtir alterna para descurtir e o teclado não cria recursão de eventos",()=>{
  const js=read("src/home-reels-premium.js");
  assert.match(js,/void react\(id,like\.getAttribute\("aria-pressed"\)/);
  assert.doesNotMatch(js,/void react\(id,emoji\|\|like\.dataset\.premiumEmoji/);
  assert.match(js,/track\?\.scrollBy\(\{top:/);
  assert.doesNotMatch(js,/dispatchEvent\(new KeyboardEvent\("keydown"/);
});

test("modelo original v3: sem controles nativos expostos nem embeds externos quebrando cards",()=>{
 const css=read("assets/css/pages/home-reels.css");
 const src=read("src/home-reels-premium.js");
 assert.match(css,/\.post-card \.post-controls\{display:none\}/);
 assert.match(css,/\.post-card \.post-external\{display:none!important\}/);
 assert.match(css,/\.post-card \.lnk\{/);
 assert.match(css,/\.post-card \.post-media-grid\.med\{/);
 assert.match(css,/\.post-card \.post-interactions\.pa\{/);
 assert.match(css,/\.premium-why-now \.why-now-people\.stories\{/);
 assert.match(src,/openPostMenu\(card\)/);
 assert.match(src,/target\.click\(\)/);
 assert.match(src,/strip\.append\(logo,body\)/);
 assert.match(src,/if\(caption&&\(media\|\|external\)\)/);
 assert.doesNotMatch(src,/Simular nova publicação/);
});


test("regressão: compositor premium abre dialog real sem remover form ou upload",()=>{
 const js=read("src/home-reels-premium.js"),css=read("assets/css/pages/home-reels.css");
 assert.match(js,/composeDialog\.showModal\(\)/);
 assert.match(js,/composeDialog\.append\(composeFields\)/);
 assert.match(js,/event\.stopImmediatePropagation\(\);openCompose\(\)/);
 assert.match(css,/dialog\.premium-compose-dialog\[open\]/);
 assert.match(css,/dialog\.premium-compose-dialog::backdrop/);
});
test("regressão: modal de compartilhamento envia múltiplos usuários com mensagem opcional",()=>{
 const js=read("src/home-reels-send.js"),css=read("assets/css/pages/home-reels.css");
 const neon=read("src/neon-production-client.js");
 assert.match(js,/selected=new Set\(\)/);
 assert.match(js,/looply-send-grid/);
 assert.match(js,/data-send-person/);
 assert.match(js,/data-send-message/);
 assert.match(js,/mode:"share",targetId:id,postId,body:message\|\|undefined/);
 assert.match(js,/event\.stopImmediatePropagation\(\)/);
 assert.match(css,/\.looply-send-grid\{display:grid/);
 assert.match(neon,/p_message:message/);
});
test("regressão: Reels exibe autor depois do reparenting visual do Feed",()=>{
 const js=read("src/home-hybrid-reels.js");
 assert.match(js,/\.post-header \.post-author-profile/);
 assert.match(js,/looply-reels-creator-profile/);
});

test("produção: RPCs de curtidas/salvos são permitidas no cliente Neon real",()=>{
 const src=read("src/neon-production-client.js");
 for(const name of ["v13_post_engagement_page","v13_set_post_reaction","v13_set_post_saved"])
   assert.ok(src.includes('"'+name+'"'));
 assert.match(src,/premiumPostRpcNames\.has\(name\) \? premiumPostRpc\(name,args\)/);
 assert.match(src,/if\(action==="share_post" && body\.mode==="share"\)return premiumSharePost\(options\)/);
 assert.match(src,/galleryRpc\("v52_share_post"/);
 const migration=read("migration/20261110_home_reels_share_post.sql");
 assert.match(migration,/public\.v52_share_post/);
 assert.match(migration,/public\.v3_can_view_post\(p_post_id\)/);
 assert.match(migration,/public\.chat_user_blocks/);
 assert.match(migration,/public\.post_recipients/);
 assert.match(migration,/public\.v4_create_conversation/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.v52_share_post/);
});


test("coleção Salvos consulta o Neon por páginas, sem depender de posts renderizados",()=>{
 const js=read("src/home-saved-library.js");
 const shell=read("src/home-reels-premium.js");
 const css=read("assets/css/pages/home-reels.css");
 for(const part of ['from("post_saves")','range(offset,offset+pageSize-1)','from("posts")','from("post_media")','signPeople(client','createSignedUrls','v13_set_post_saved','premium-saved-detail'])
  assert.ok(js.includes(part),part);
 assert.match(shell,/mountSavedLibrary\(\{root,client,userId:ownId\}\)/);
 assert.match(shell,/savedButton\.dataset\.premiumSaved/);
 assert.match(css,/dialog\.premium-saved-dialog\[open\]/);
 assert.match(css,/\.psaved-grid\{display:grid/);
});

test("compositor premium mantém FormData original e seleciona pessoas em grade",()=>{
 const js=read("src/home-composer-premium.js");
 const social=read("src/social.js");
 const style=read("assets/css/pages/home-reels.css");
 for(const token of ["cp-visibility","cp-recipient-grid","cp-recipient-check",
   "postRecipients","option","select.disabled","o.selected=selected.has(o.value)","signPeople","client.from"])
   assert.ok(js.includes(token),token);
 assert.match(js,/privacy\.dispatchEvent\(new Event\("change",\{bubbles:true\}\)\)/);
 assert.match(social,/formData\.getAll\("recipientIds"\)/);
 assert.match(style,/\.cp-recipient-grid\{display:grid/);
 assert.match(style,/\.cp-head/);
});

test("compartilhamento externo usa seletor do SO e jamais copia silenciosamente",()=>{
 const social=read("src/social.js"),android=read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
 assert.match(social,/navigator\.share\(/);
 assert.match(social,/looply-share:\/\/external\?url=/);
 assert.doesNotMatch(social,/navigator\.clipboard\?\.writeText\(url\)/);
 assert.doesNotMatch(social,/window\.prompt\("Copie o link da publicação"/);
 assert.match(android,/Intent\.ACTION_SEND/);
 assert.match(android,/Intent\.createChooser\(send, "Compartilhar publicação"\)/);
 assert.match(android,/uri\.scheme\.equals\("looply-share"/);
 assert.match(android,/isShareableLooplyPost\(target\)/);
 assert.match(android,/page\.path\?\.startsWith\("\/Looply\/"\)/);
});

test("Reels interrompe iframe externo anterior sem depender de API Instagram",()=>{
 const src=read("src/home-hybrid-reels.js");
 assert.match(src,/oldFrame\.src="about:blank"/);
 assert.match(src,/oldFrame\.removeAttribute\("src"\)/);
 assert.match(src,/commandEmbeddedPlayer\(oldFrame,"pause"\)/);
 assert.match(src,/if\(i===index\)continue/);
 assert.match(src,/activeIndex!==index \|\| document\.hidden/);
});
