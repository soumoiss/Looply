import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { socialMarkup, instagramEmbedDetails, tiktokEmbedDetails, normalizeExternalUrl } from "../src/social.js";

const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
const author = { id:"author", username:"pessoa", display_name:"Uma pessoa" };
function mkpost(overrides = {}) {
  return { id:"p1", author_id:"author", author, body:"Legenda de verdade", visibility:"public",
    created_at:"2026-10-27T03:20:00Z", comments:[], media:[], likeCount:2, likedByMe:false, ...overrides };
}
const page = posts => socialMarkup({ people:[], posts, postsError:null }, "viewer");

test("feed uses actual provided Neon post data instead of hardcoded showcase", () => {
  const html = page([mkpost()]);
  assert.match(html, /Uma pessoa/);
  assert.match(html, /Legenda de verdade/);
  assert.match(html, /data-post-card="p1"/);
  assert.doesNotMatch(html, /anamirianbahia|jheysantos|Unsplash/);
});
test("media is shown before its caption in a native Looply post", () => {
  const html = page([mkpost({media:[{kind:"image",signedUrl:"https://cdn.example/photo.jpg"}]})]);
  assert.ok(html.indexOf("https://cdn.example/photo.jpg") < html.indexOf("Legenda de verdade"));
});
test("portrait video has real playable source and fullscreen entry", () => {
  const html = page([mkpost({media:[{kind:"video",signedUrl:"https://cdn.example/video.mp4"}]})]);
  assert.match(html,/src="https:\/\/cdn\.example\/video\.mp4" data-feed-video controls muted playsinline preload="metadata"/);
  assert.match(html,/data-open-reel="p1-0"/);
});
test("source image is initially lazy-loaded", () => {
  assert.match(page([mkpost({media:[{kind:"image",signedUrl:"https://cdn.example/one.png"}]})]), /loading="lazy"/);
});
test("comment count is drawn from actual post comments", () => {
  const comment = { id:"c1", post_id:"p1", author_id:"author", author, body:"Ótimo!", created_at:"2026-10-27T03:21:00Z" };
  assert.match(page([mkpost({comments:[comment]})]), /data-toggle-post-comments="p1"[^>]*>[\s\S]*?<span>1<\/span>/);
});
test("likes connect to real record IDs and accessibility states", () => {
  const html = page([mkpost({likedByMe:true,likeCount:3})]);
  assert.match(html,/data-toggle-like="p1" aria-pressed="true"/);
  assert.match(html,/>3<\/span><\/button>/);
});
test("composer starts hidden and has its real file input", () => {
  const html = page([]);
  assert.match(html,/data-composer-fields hidden/);
  assert.match(html,/id="postFiles" name="media" type="file" multiple/);
  assert.match(html,/data-select-post-media/);
  assert.match(html,/data-post-preview/);
});
test("composer provides publication scope options", () => {
  const html = page([]);
  assert.match(html,/value="public"/);
  assert.match(html,/value="private"/);
  assert.match(html,/value="selected"/);
});
test("composer has an actionable submit button inside the existing form", () => {
  const html = page([]);
  assert.match(html,/data-social-post>[\s\S]*?data-close-composer[\s\S]*?<button type="submit">Compartilhar/);
});
test("navigational destinations target real Looply routes", () => {
  const html = page([]);
  for (const path of ["home.html","cartas.html","musicas.html","galeria.html","chat.html","notificacoes.html"]) assert.ok(html.includes('href="' + path + '"'));
  assert.match(html,/aria-label="Navegação rápida"/);
});
test("licensed official Instagram embedding remains on-site", () => {
  assert.equal(instagramEmbedDetails("https://www.instagram.com/reel/ABCDE12345/").embedUrl,"https://www.instagram.com/reel/ABCDE12345/embed/");
});
test("TikTok embedding uses official provider API, never an invented MP4", () => {
  const embed = tiktokEmbedDetails("https://www.tiktok.com/@c/video/1234567890123456789").embedUrl;
  assert.match(embed,/tiktok.com\/player\/v1/);
  assert.match(embed,/controls=0/);
  assert.match(embed,/description=0/);
});
test("untrusted social URLs are restricted to supported HTTPS domains", () => {
  assert.equal(normalizeExternalUrl("http://instagram.com/reel/ABCDE12345"),null);
  assert.equal(normalizeExternalUrl("https://attacker.example.invalid/video"),null);
});
test("Reels module contains the mandatory vertical snap and IntersectionObserver", async () => {
  const [source,css] = await Promise.all([read("src/reels-scroll.js"),read("assets/css/pages/feed-reels-experience.css")]);
  assert.match(source,/IntersectionObserver/);
  assert.match(source,/entry\.intersectionRatio >= 0\.7/);
  assert.match(css,/scroll-snap-type:y mandatory/);
  assert.match(css,/height:100dvh/);
});
test("Reels limits one active audio playback and preserves a sound preference", async () => {
  const source = await read("src/reels-scroll.js");
  assert.match(source,/slides\[i\]\.video\.pause\(\)/);
  assert.match(source,/player\.muted = !soundOn/);
  assert.match(source,/soundOn = !soundOn/);
});
test("Reels delegates mutations through existing authenticated feed controls", async () => {
  const source = await read("src/reels-scroll.js");
  for (const action of ["[data-toggle-like]","[data-toggle-save]","[data-share-in-app]","[data-share-post]"]) assert.ok(source.includes(action));
  assert.match(source,/button\.click\(\)/);
});
test("Reels release video playback resources on exit", async () => {
  const source = await read("src/reels-scroll.js");
  assert.match(source,/source\.video\.pause\(\); source\.video\.removeAttribute\("src"\); source\.video\.load\(\)/);
});
test("original Neon/Cloudflare storage and RPC publication flow is retained", async () => {
  const source = await read("src/social.js");
  assert.match(source,/client\.rpc\("v5_create_post"/);
  assert.match(source,/client\.rpc\("v5_attach_post_media"/);
  assert.match(source,/await uploadResumable\(client, path, file/);
  assert.match(source,/client\.storage\.from\("looply-media"\)\.upload/);
});
test("Looply homepage loads the new styles without replacing the existing app", async () => {
  const source = await read("home.html");
  assert.match(source,/feed-reels-experience\.css/);
  assert.match(source,/assets\/js\/home\.js/);
});
test("images use loaded intrinsic dimensions and no fixed crop for every image", async () => {
  const source = await read("src/social.js");
  assert.match(source,/image\.naturalWidth \/ image\.naturalHeight/);
  assert.match(source,/figure\.dataset\.aspect/);
});
test("the picker previews local media without uploading prematurely", async () => {
  const source = await read("src/social.js");
  assert.match(source,/URL\.createObjectURL\(file\)/);
  assert.match(source,/URL\.revokeObjectURL\(url\)/);
  assert.match(source,/event\.target\.matches\("#postFiles"\)/);
});
