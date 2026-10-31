import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("published Story music UI hides gallery-file and attach controls while keeping preview",async()=>{
  const css=await readFile(new URL("../assets/css/pages/story-studio.css",import.meta.url),"utf8");
  const lastRules=css.slice(css.lastIndexOf("/* Product requirement: never offer attaching local music"));
  assert.ok(lastRules,"missing final product override");
  assert.match(lastRules,/\.studio-audio-upload/);
  assert.match(lastRules,/\.studio-catalog-select/);
  assert.match(lastRules,/input\[data-studio-audio-file\]/);
  assert.match(lastRules,/display:\s*none\s*!important/);
  assert.match(lastRules,/\.studio-music-preview-actions/);
  const picker=await readFile(new URL("../src/story-music-picker.js",import.meta.url),"utf8");
  assert.match(picker,/▶ Ouvir/);
});
