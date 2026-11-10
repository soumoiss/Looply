import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("all feed images, videos and individual carousel slides keep intrinsic aspect ratio",async()=>{
  const [css,html,source]=await Promise.all([
    read("assets/css/pages/home-reels.css"),
    read("home.html"),read("src/social.js")
  ]);
  assert.ok(css.includes(".post-media"));
  assert.ok(css.includes(".post-media video"));
  assert.ok(css.includes("object-fit:contain"));
  assert.ok(css.includes("height:auto"));
  assert.ok(css.includes("object-fit:contain"));
  assert.ok(css.includes(".post-media-grid"));
  assert.ok(css.includes("flex:0 0 100%"));
  assert.ok(html.includes("home-reels.css"));
  assert.ok(source.includes('data-feed-carousel'));
  assert.ok(source.includes('figure.dataset.aspect'));
});
