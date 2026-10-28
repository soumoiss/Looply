import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { socialMarkup } from "../src/social.js";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const author = {id:"author-1",username:"pessoa",display_name:"Pessoa"};
const post = (overrides = {}) => ({
  id:"post-1", author_id:author.id, author, visibility:"public",
  body:"Linha 1\nLegenda com acentos: ação, café e emoji 😀",
  created_at:"2026-10-28T10:00:00Z", comments:[], media:[], ...overrides
});
const page = (posts,viewer = "viewer") => socialMarkup({people:[],posts,postsError:null},viewer);

test("author has a caption editor in the post menu, and a different account cannot see it", () => {
  const own = page([post()],author.id);
  const outsider = page([post()],"another-person");
  assert.match(own,/class="post-owner-menu"/);
  assert.match(own,/data-edit-post="post-1"/);
  assert.match(own,/data-post-edit-form="post-1" hidden/);
  assert.match(own,/Salvar edição/);
  assert.match(own,/data-cancel-post-edit/);
  assert.doesNotMatch(outsider,/data-edit-post|data-post-edit-form/);
});

test("the entire multiline accented and emoji caption stays in display and editor", () => {
  const html = page([post()],author.id);
  assert.ok(html.includes("Linha 1\nLegenda com acentos: ação, café e emoji 😀"));
  assert.match(html,/class="post-body"/);
  assert.match(html,/<textarea[^>]+name="body"[^>]*>Linha 1\nLegenda com acentos: ação, café e emoji 😀<\/textarea>/);
});

test("multiple photos remain inside a single publication with accessible carousel navigation", () => {
  const html = page([post({media:[
    {kind:"image",signedUrl:"https://example.test/first.jpg"},
    {kind:"image",signedUrl:"https://example.test/second.png"},
    {kind:"image",signedUrl:"https://example.test/third.webp"}
  ]})]);
  assert.equal((html.match(/data-post-card="post-1"/g)||[]).length,1);
  assert.equal((html.match(/class="post-media"/g)||[]).length,3);
  assert.ok(html.indexOf("first.jpg")<html.indexOf("second.png"));
  assert.ok(html.indexOf("second.png")<html.indexOf("third.webp"));
  assert.match(html,/data-feed-carousel/);
  assert.match(html,/data-carousel-step="-1"/);
  assert.match(html,/data-carousel-step="1"/);
  assert.match(html,/data-carousel-position/);
});

test("composer accepts named image formats, but hides removed controls", () => {
  const html = page([]);
  for (const format of ["image/jpeg","image/png","image/webp","image/heic","image/heif","video/mp4","video/webm"])
    assert.ok(html.includes(format));
  assert.match(html,/name="media" type="file" multiple/);
  assert.match(html,/name="body" maxlength="2200"/);
  assert.doesNotMatch(html,/name="altText"|mediaAlt|Descrição acessível das fotos|YouTube pode ser incorporado/);
  assert.doesNotMatch(html,/data-toggle-save|Salvar publicação/);
});

test("publishing retains the caption and verifies both the post and every media record before resetting", async () => {
  const source = await read("src/social.js");
  assert.match(source,/const postBody = body \? String\(formData\.get\("body"\) \?\? ""\) : null;/);
  assert.match(source,/await selectedMedia\(formData\)/);
  assert.match(source,/await uploadResumable\(client, path, file/);
  assert.match(source,/rpc\("v5_attach_post_media"/);
  assert.match(source,/persistedPost\.body \|\| null/);
  assert.match(source,/persistedMedia \|\| \[\]/);
  assert.ok(source.indexOf("published = true;") < source.indexOf("form.reset();"));
  assert.match(source,/form\.dataset\.submitting === "true"/);
  assert.match(source,/if \(createdPostId && !published\)/);
  assert.match(source,/new Date\(a\.created_at\) - new Date\(b\.created_at\)/);
});

test("caption edits require a verified owner-filtered PATCH before refreshing Feed", async () => {
  const source = await read("src/social.js");
  assert.match(source,/\.update\(\{ body: storedBody \}\)/);
  assert.match(source,/\.eq\("id", postId\)\.eq\("author_id", userId\)\.select\("id,body"\)\.single\(\)/);
  assert.match(source,/post_caption_unconfirmed/);
  const bridge = await read("src/neon-rest-bridge.js");
  assert.match(bridge,/posts: \["author_id","body"/);
  assert.match(bridge,/state\.mode==="update"\?"PATCH"/);
});
