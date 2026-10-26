import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("external share presentation keeps real media prominent and attribution secondary", async () => {
  const { socialMarkup } = await import("../src/social.js");
  const page = socialMarkup({
    people: [],
    posts: [{
      id: "p1", author_id: "u2", body: "Compartilhou uma publicação externa.",
      visibility: "public", external_url: "https://www.youtube.com/shorts/abcdefghijk",
      created_at: "2026-01-01T00:00:00Z", comments: [], media: [],
      author: { username: "autor" }
    }]
  }, "u1");
  assert.doesNotMatch(page, /Compartilhou uma publicação externa/);
  assert.match(page, /class="post-external-credit"/);
  assert.match(page, /class="post-external-embed" data-feed-embed/);
  assert.match(page, /Abrir original/);
  const css = await read("assets/css/pages/home.css");
  assert.match(css, /\.post-external\s*\{[^}]*padding:0/);
  assert.match(css, /\.post-external-embed\s*\{[^}]*aspect-ratio:9\/16/);
  assert.match(css, /\.post-instagram-embed\s*\{[^}]*aspect-ratio:4\/5/);
});
