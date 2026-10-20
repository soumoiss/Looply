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
test("media uploads normalize Android content URIs and retain private RETURNING access while metadata is pending", async () => {
  const [social, stories, migration] = await Promise.all([
    read("src/social.js"), read("src/stories.js"), read("supabase/migrations/20261020131415_fix_story_media_upload_returning.sql")
  ]);
  assert.match(social, /export function normalizePublicationMedia\(file\)/);
  assert.match(social, /declaredType !== "application\/octet-stream"/);
  assert.match(social, /new File\(\[file\]/);
  assert.match(stories, /normalizePublicationMedia\(file\)/);
  assert.match(migration, /looply_media_read_own_unregistered_story_upload/);
  assert.match(migration, /looply_media_read_own_unregistered_comment_upload/);
  assert.match(migration, /story\.author_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /comment\.author_id = \(select auth\.uid\(\)\)/);
});
test("feed and story publication restore the previous upload transport and persistence sequence", async () => {
  const social = await read("src/social.js");
  const stories = await read("src/stories.js");
  assert.match(social, /if \(file\.size <= 6 \* 1024 \* 1024\)/);
  assert.doesNotMatch(social, /let publicationCommitted = false/);
  assert.doesNotMatch(stories, /let storyCommitted = false/);
  assert.match(social, /await client\.storage\.from\("looply-media"\)\.upload\(path, file/);
  assert.match(stories, /await uploadResumable\(client, uploadedPath, media/);
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
});

test("large media upload falls back to direct Storage upload if the remote TUS module cannot load", async () => {
  const source = await read("src/social.js");
  assert.match(source, /try \{\s*tus = await import\("https:\/\/esm\.sh\/tus-js-client@4\.3\.1"\)/);
  assert.match(source, /catch \(importError\)[\s\S]*?await uploadDirect\(\);\s*return;/);
  assert.match(source, /catch \(tusError\)[\s\S]*?await uploadDirect\(\);/);
  assert.match(source, /const uploadDirect = async \(\)[\s\S]*?client\.storage\.from\("looply-media"\)\.upload\(path, file/);
  assert.match(source, /onProgress\(100\);/);
});
