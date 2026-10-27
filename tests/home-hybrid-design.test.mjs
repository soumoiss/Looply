import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { socialMarkup } from "../src/social.js";
const read = name => readFile(new URL("../" + name, import.meta.url), "utf8");
const post = {
  id:"post-real-22", author_id:"real-member-id", author:{username:"membro",display_name:"Membro Real"},
  created_at:"2026-10-27T11:00:00Z", visibility:"public", body:"Texto autêntico", comments:[],
  media:[], external_url:"https://www.instagram.com/reel/ABC123xyz_-/",
  likedByMe:false, likeCount:0
};
test("supplied hybrid layout is loaded ONLY on Home", async () => {
  const [home, chat, profile] = await Promise.all([read("home.html"),read("chat.html"),read("perfil.html")]);
  assert.match(home,/home-hybrid\.css/);
  assert.doesNotMatch(chat,/home-hybrid\.css/);
  assert.doesNotMatch(profile,/home-hybrid\.css/);
  assert.match(home,/data-site-header/);
});
test("original authenticated global Looply header stays mounted on Home", async () => {
  const [home, runtime] = await Promise.all([read("home.html"),read("src/page-runtime.js")]);
  assert.match(home,/data-site-header/);
  assert.match(runtime,/header\.innerHTML = headerMarkup/);
});
test("Home displays real user greeting and profile settings link", async () => {
  const file = await read("assets/js/home.js");
  assert.match(file,/"Bem-vindo, " \+ name/);
  assert.match(file,/href="perfil\.html">Meu perfil/);
  assert.match(file,/bindHomeProfilePreview/);
});
test("profile preview reads real scoped Neon records and post count", async () => {
  const file = await read("src/home-profile-preview.js");
  assert.match(file,/client\.from\("profiles"\)/);
  assert.match(file,/client\.from\("posts"\)\.select\("id", \{ count:"exact", head:true \}\)\.eq\("author_id", profileId\)/);
  assert.match(file,/Posts visíveis/);
  assert.doesNotMatch(file,/>2\.4k<|>340<|>128</);
});
test("missing follows table does not display imaginary counts", async () => {
  const file = await read("src/home-profile-preview.js");
  assert.match(file,/data-hybrid-follower-count/);
  assert.match(file,/textContent = "—"/);
  assert.match(file,/Seguir · em breve/);
});
test("posts expose real author's preview rather than fixed demo profile", () => {
  const html = socialMarkup({people:[],posts:[post]}, "visitor");
  assert.match(html,/data-profile-open="real-member-id"/);
  assert.match(html,/Membro Real/);
  assert.doesNotMatch(html,/Bielzinho|patati/);
});
test("Instagram player uses official embed and real fullscreen control", () => {
  const html = socialMarkup({people:[],posts:[post]}, "visitor");
  assert.match(html,/instagram\.com\/reel\/ABC123xyz_-\/embed\//);
  assert.match(html,/data-open-external-reel="external-post-real-22"/);
  assert.match(html,/data-toggle-like="post-real-22"/);
  assert.match(html,/data-share-in-app="post-real-22"/);
  assert.match(html,/data-private-reply="real-member-id"/);
});
test("Home maintains real post submit and local file preview", async () => {
  const [home, social] = await Promise.all([read("assets/js/home.js"),read("src/social.js")]);
  assert.match(social,/data-composer-fields hidden/);
  assert.match(social,/data-post-preview/);
  assert.match(social,/client\.rpc\("v5_create_post"/);
  assert.match(social,/client\.rpc\("v5_attach_post_media"/);
  assert.match(home,/bindHomeCommentsSheet/);
});
test("comments drawer moves existing real comments instead of mock entries", async () => {
  const file=await read("src/home-comments-sheet.js");
  assert.match(file,/append\(section\)/);
  assert.match(file,/\.post-comments/);
  assert.doesNotMatch(file,/Bielzinho|MH78|liz/);
});
test("immersive viewer supports official embeds, real videos, single active player", async () => {
  const file=await read("src/home-hybrid-reels.js");
  assert.match(file,/openHybridReels/);
  assert.match(file,/video\[data-feed-reel-id\]/);
  assert.match(file,/data-open-external-reel/);
  assert.match(file,/frame\.removeAttribute\("src"\)/);
  assert.match(file,/video\?\.pause\(\)/);
  assert.match(file,/post-external-embed iframe/);
});
test("home footer links only to existing tabs and carries all six reference labels", () => {
  const html = socialMarkup({people:[],posts:[]}, "viewer");
  for (const name of ["Início","Cartas","Músicas","Galeria","Chat","Avisos"]) assert.ok(html.includes("<small>"+name+"</small>"));
});
test("new CSS styles actual story list and existing viewer, not fake story media", async () => {
  const css = await read("assets/css/pages/home-hybrid.css");
  assert.match(css,/\.page-home \.story-list/);
  assert.match(css,/\.page-home \.story-viewer-dialog/);
  assert.match(css,/\.page-home \.ig-post-header/);
  assert.match(css,/\.page-home \.hybrid-external-watch/);
  assert.match(css,/\.page-home \.post-create-preview/);
});
