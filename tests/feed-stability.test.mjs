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
  assert.match(source, /externalHosts/);
  assert.match(source, /youtube-nocookie\.com\/embed/);
  assert.match(source, /Abrir conteúdo original/);
  assert.match(source, /external_url/);
});

test("feed videos autoplay muted on hover or visibility and pause when no longer active", async () => {
  const source = await read("src/social.js");
  assert.match(source, /data-feed-video controls muted playsinline preload="metadata"/);
  assert.match(source, /data-feed-embed data-video-provider="youtube"/);
  assert.match(source, /data-feed-embed data-video-provider="tiktok"/);
  assert.match(source, /addEventListener\("pointerenter", \(\) => \{ void play\(item\); \}/);
  assert.match(source, /intersectionRatio >= 0\.6/);
  assert.match(source, /pause\(active\)/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /enablejsapi=1/);
  assert.match(source, /iframe\.allow = "autoplay; encrypted-media/);
});

test("official external player control messages are limited to YouTube and TikTok embeds", async () => {
  const { externalPlayerMessage } = await import("../src/social.js");
  assert.deepEqual(externalPlayerMessage("youtube", "play"), {
    targetOrigin: "https://www.youtube-nocookie.com",
    payload: JSON.stringify({ event: "command", func: "playVideo", args: [] })
  });
  assert.deepEqual(externalPlayerMessage("tiktok", "mute"), {
    targetOrigin: "https://www.tiktok.com",
    payload: { "x-tiktok-player": true, type: "mute", value: null }
  });
  assert.equal(externalPlayerMessage("instagram", "play"), null);
});
test("media uploads normalize Android files and use authenticated private Neon Storage", async () => {
  const [social, studio, neonClient, rpc] = await Promise.all([
    read("src/social.js"), read("src/story-studio.js"),
    read("src/neon-production-client.js"), read("migration/20261026_owner_publication_rpc.sql")
  ]);
  assert.match(social, /export function normalizePublicationMedia\(file\)/);
  assert.match(social, /declaredType !== "application\/octet-stream"/);
  assert.match(social, /new File\(\[file\]/);
  assert.match(studio, /normalizePublicationMedia\(media\)/);
  assert.match(neonClient, /storageRequest\("upload-url", bucket, path/);
  assert.match(neonClient, /authorization: "Bearer " \+ session\.access_token/);
  assert.match(neonClient, /storage: Object\.freeze\(\{ from: storageBucket \}\)/);
  assert.match(rpc, /v5_attach_story_media[\s\S]*?author_id=owner_id/);
  assert.doesNotMatch(studio, /supabase|spotify/i);
});
test("feed and Stories Studio publish through Neon upload and owner-scoped RPC sequence", async () => {
  const [social, studio] = await Promise.all([read("src/social.js"), read("src/story-studio.js")]);
  assert.match(social, /client\.storage\.from\("looply-media"\)\.upload\(path, file/);
  assert.match(studio, /rpc\("v5_create_story"/);
  assert.match(studio, /await uploadResumable\(client, uploadedPath, normalized/);
  assert.match(studio, /rpc\("v5_attach_story_media"/);
  assert.match(studio, /p_visibility: visibility/);
  assert.match(studio, /p_recipient_ids: visibility === "selected"/);
  assert.doesNotMatch(studio, /let storyCommitted = false/);
});
test("post and comment avatars use signed profile avatar URLs", async () => {
  const source = await read("src/social.js");
  assert.match(source, /signProfileAvatars/);
  assert.match(source, /avatar_path/);
  assert.match(source, /post\.author\?\.avatarUrl/);
});

test("comments expose owner-only edit/delete controls backed by comments RLS", async () => {
  const [source, migration, css] = await Promise.all([
    read("src/social.js"), read("supabase/migrations/20261015231928_posts_comments_core.sql"), read("assets/css/pages/home.css")
  ]);
  assert.match(source, /data-edit-comment/);
  assert.match(source, /data-delete-comment/);
  assert.match(source, /data-comment-edit-form/);
  assert.match(source, /data-cancel-comment-edit/);
  assert.match(source, /root\.addEventListener\("submit", async \(event\) =>/);
  assert.doesNotMatch(source, /window\.prompt\("Edite seu comentário:/);
  assert.match(source, /\.update\(\{ body: nextBody \}\)\.eq\("id", commentId\)\.eq\("author_id", userId\)/);
  assert.match(source, /client\.from\("comment_media"\)\.select\("storage_path"\)/);
  assert.match(source, /\.in\("comment_id", commentIds\)/);
  assert.match(source, /\.delete\(\)\.eq\("id", commentId\)\.eq\("author_id", userId\)/);
  assert.match(migration, /comments_update_own_with_post[\s\S]*?author_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /comments_delete_own_with_post[\s\S]*?author_id = \(select auth\.uid\(\)\)/);
  assert.match(css, /\.comment-media-grid img[\s\S]*?object-fit:cover/);
  assert.match(css, /\.comment-media-grid video[\s\S]*?max-height:120px/);
});

test("comment owner controls render only for the matching signed-in author", async () => {
  const { socialMarkup } = await import("../src/social.js");
  const comment = { id: "c1", post_id: "p1", author_id: "u1", body: "Comentário próprio", created_at: "2026-01-01T00:00:00Z", author: { username: "u1" } };
  const post = { id: "p1", author_id: "u2", body: "Publicação", visibility: "public", created_at: "2026-01-01T00:00:00Z", comments: [comment] };
  const page = (userId) => socialMarkup({ people: [], posts: [post] }, userId);
  const ownerMarkup = page("u1");
  const otherMarkup = page("u3");
  assert.match(ownerMarkup, /data-edit-comment="c1"/);
  assert.match(ownerMarkup, /data-delete-comment="c1"/);
  assert.doesNotMatch(otherMarkup, /data-edit-comment="c1"|data-delete-comment="c1"/);
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


test("external-link posts have database INSERT permission for external_url", async () => {
  const migration = await read("supabase/migrations/20261020130000_fix_external_link_post_insert.sql");
  assert.match(migration, /grant insert\s*\(external_url\)\s*on public\.posts to authenticated/i);
  assert.match(migration, /posts/i);
});

test("canonical Instagram Reel URLs resolve to a valid embed URL", async () => {
  const { instagramEmbedDetails } = await import("../src/social.js");
  assert.deepEqual(instagramEmbedDetails("https://www.instagram.com/reel/ABC123xyz_-/"), {
    kind: "reel", shortcode: "ABC123xyz_-", embedUrl: "https://www.instagram.com/reel/ABC123xyz_-/embed/"
  });
});


test("external links pasted into post text are extracted and normalized before publication", async () => {
  const { extractExternalLinkFromText, normalizeExternalUrl } = await import("../src/social.js");
  assert.deepEqual(
    extractExternalLinkFromText("Veja este vídeo https://youtu.be/abcdefghijk!"),
    { text: "Veja este vídeo", url: "https://youtu.be/abcdefghijk" }
  );
  assert.deepEqual(
    extractExternalLinkFromText("https://www.instagram.com/reel/ABC123xyz_/"),
    { text: "", url: "https://www.instagram.com/reel/ABC123xyz_/" }
  );
  assert.equal(normalizeExternalUrl("https://vt.tiktok.com/ZSR123/"), "https://vt.tiktok.com/ZSR123/");
  assert.equal(normalizeExternalUrl("http://www.youtube.com/watch?v=abcdefghijk"), null);
});

test("canonical TikTok video URLs render a provider embed", async () => {
  const { tiktokEmbedDetails } = await import("../src/social.js");
  assert.deepEqual(
    tiktokEmbedDetails("https://www.tiktok.com/@sample/video/1234567890123456789"),
    { videoId: "1234567890123456789", embedUrl: "https://www.tiktok.com/player/v1/1234567890123456789?music_info=1&description=1" }
  );
});


test("TikTok share links use the official player and hydrate shortened URLs through oEmbed", async () => {
  const source = await read("src/social.js");
  assert.match(source, /https:\/\/www\.tiktok\.com\/oembed\?url=/);
  assert.match(source, /data-tiktok-preview/);
  assert.match(source, /https:\/\/www\.tiktok\.com\/player\/v1\//);
  assert.match(source, /export async function hydrateTikTokEmbeds/);
  assert.match(source, /Rebind after hydration, but never let feed media restart behind the viewer\.[\s\S]*?if \(root\.querySelector\("\[data-reels-viewer\]"\)\?\.open\)[\s\S]*?bindFeedVideoAutoplay\(root\);/);
});

test("large media upload falls back to direct Storage upload if the remote TUS module cannot load", async () => {
  const source = await read("src/social.js");
  assert.doesNotMatch(source, /tus-js-client|publishableKey|supabase\.co/);
  assert.match(source, /client\.auth\.getSession\(\)/);
  assert.match(source, /uploadError/);
  assert.match(source, /client\.storage\.from\("looply-media"\)\.upload\(path, file/);
  assert.match(source, /onProgress\?\.\(100\);/);
});
