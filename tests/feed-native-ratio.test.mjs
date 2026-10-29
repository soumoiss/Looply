import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("all feed images, videos and individual carousel slides keep intrinsic aspect ratio",async()=>{
  const [css,html,source]=await Promise.all([
    read("assets/css/pages/feed-reels-experience.css"),
    read("home.html"),read("src/social.js")
  ]);
  assert.ok(css.includes("Native media proportions"));
  assert.ok(css.includes(".post-media[data-aspect]"));
  assert.ok(css.includes("aspect-ratio:auto!important"));
  assert.ok(css.includes("height:auto!important"));
  assert.ok(css.includes("object-fit:contain!important"));
  assert.ok(css.includes("align-items:flex-start!important"));
  assert.ok(css.includes("flex:0 0 100%!important"));
  assert.ok(html.includes("feed-reels-experience.css"));
  assert.ok(source.includes('data-feed-carousel'));
  assert.ok(source.includes('figure.dataset.aspect'));
});
