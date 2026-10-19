import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
const read = (p) => readFile(resolve(process.cwd(), p), "utf8");

test("publication composer starts collapsed and opens from plus", async () => {
  const source = await read("src/social.js");
  assert.match(source, /data-toggle-composer/);
  assert.match(source, /data-composer-fields hidden/);
  assert.match(source, /fields\.hidden = !fields\.hidden/);
});
test("external URLs are restricted to HTTPS provider hosts and YouTube has a safe embed fallback", async () => {
  const source = await read("src/social.js");
  assert.match(source, /allowedHosts/);
  assert.match(source, /youtube-nocookie\.com\/embed/);
  assert.match(source, /Abrir conteúdo original/);
  assert.match(source, /external_url/);
});
test("post and comment avatars use signed profile avatar URLs", async () => {
  const source = await read("src/social.js");
  assert.match(source, /signProfileAvatars/);
  assert.match(source, /avatar_path/);
  assert.match(source, /post\.author\?\.avatarUrl/);
});
test("likes use persistent unique post/user records and realtime updates", async () => {
  const source = await read("src/social.js");
  const migration = await read("supabase/migrations/20261019100000_feed_publication_interactions.sql");
  assert.match(migration, /primary key \(post_id, user_id\)/);
  assert.match(migration, /private\.can_view_post\(post_id\)/);
  assert.match(source, /from\("post_likes"\)/);
  assert.match(source, /table: "post_likes"/);
});

test("Instagram post, reel and TV links render a real provider embed with a safe shortcode", async () => {
  const source = await read("src/social.js");
  assert.match(source, /post-instagram-embed/);
  assert.match(source, /export function instagramEmbedDetails/);
  assert.match(source, /const shared = parts\[0\] === "share"/);
  assert.match(source, /const shortcode = parts\[shared \? 2 : 1\]/);
  assert.ok(source.includes("^[A-Za-z0-9_-]{5,30}$"));
  assert.match(source, /if \(!body && !externalUrl && !files\.length\)/);
});

test("private replies use the authenticated chat edge function and internal share offers recipient selection", async () => {
  const source = await read("src/social.js");
  assert.match(source, /action: "share_post", mode: "private_reply", targetId: authorId, postId, body:/);
  assert.match(source, /action: "share_post", mode: "share", targetId, postId/);
  assert.match(source, /data-share-in-app/);
  assert.match(source, /data-share-recipient/);
  assert.match(source, /data-share-in-app-send/);
  const edge = await read("supabase/functions/looply-chat/index.ts");
  assert.match(edge, /from\("chat_messages"\)\.insert/);
  assert.match(edge, /Publicação compartilhada no Looply/);
  assert.match(edge, /Publicação: /);
  assert.match(source, /conversa\.html\?id=/);
  assert.doesNotMatch(source, /client\.rpc\("create_direct_conversation", \{ p_target_id: authorId \}\)/);
});


test("shared external links are extracted from share_url, text and hash parameters", async () => {
  const { parseIncomingSharedLink } = await import("../src/shared-link.js");
  assert.equal(
    parseIncomingSharedLink("https://soumoiss.github.io/Looply/?share_url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC123%2F"),
    "https://www.instagram.com/reel/ABC123/"
  );
  assert.equal(
    parseIncomingSharedLink("https://soumoiss.github.io/Looply/?text=" + encodeURIComponent("Veja isso no TikTok! https://vm.tiktok.com/ZMabc123/")),
    "https://vm.tiktok.com/ZMabc123/"
  );
  assert.equal(
    parseIncomingSharedLink("https://soumoiss.github.io/Looply/#?title=" + encodeURIComponent("Vídeo https://youtu.be/abcdefghijk")),
    "https://youtu.be/abcdefghijk"
  );
});

test("shared external links unwrap Instagram redirects and reject unsafe or unsupported URLs", async () => {
  const { normalizeSharedExternalUrl, parseIncomingSharedLink } = await import("../src/shared-link.js");
  assert.equal(
    normalizeSharedExternalUrl("https://l.instagram.com/?u=" + encodeURIComponent("https://www.instagram.com/p/ABC123/")),
    "https://www.instagram.com/p/ABC123/"
  );
  assert.equal(normalizeSharedExternalUrl("http://www.youtube.com/watch?v=abcdefghijk"), null);
  assert.equal(normalizeSharedExternalUrl("https://example.com/post"), null);
  assert.equal(parseIncomingSharedLink("https://soumoiss.github.io/Looply/?text=sem%20link"), null);
});
