import test from "node:test";
import assert from "node:assert/strict";
import { socialMarkup } from "../src/social.js";

test("real feed videos have an explicit full-screen entry point", () => {
  const post = {
    id: "post-1",
    author_id: "author-1",
    body: "Vídeo do feed",
    visibility: "public",
    created_at: "2026-10-26T12:00:00.000Z",
    author: { username: "membro", display_name: "Membro" },
    media: [{ id: "media-1", kind: "video", signedUrl: "https://storage.example/video.mp4", mime_type: "video/mp4", alt_text: "Vídeo" }],
    comments: [],
    likeCount: 2
  };
  const html = socialMarkup({ people: [], posts: [post], postsError: null }, "viewer-1");
  assert.match(html, /data-feed-reel-id="post-1-0"/);
  assert.match(html, /data-open-reel="post-1-0"/);
  assert.match(html, /Abrir vídeo em tela cheia/);
});

test("Reels viewer navigates authorized feed media and routes actions through real post controls", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const source = await readFile(resolve("src/social.js"), "utf8");
  for (const selector of ["data-reels-viewer", "data-reel-active", "data-reel-previous", "data-reel-next", "data-reel-like", "data-reel-comments", "data-reel-share", "data-reel-send"]) {
    assert.ok(source.includes(selector), "missing Reels control " + selector);
  }
  assert.match(source, /current\.card\.querySelector\("\[data-toggle-like\]"\)\?\.click\(\)/);
  assert.match(source, /current\.card\.querySelector\("\[data-share-in-app\]"\)\?\.click\(\)/);
  assert.match(source, /player\.pause\(\); player\.removeAttribute\("src"\)/);
  assert.match(source, /if \(feed\) bindFeedVideoAutoplay\(feed\)/);
});
