import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {spawnSync} from "node:child_process";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Why Now editor scripts and scoped CSS are distributed",()=>{
  const html=source("why-now.html");
  assert.ok(html.includes('src="src/why-now-editor-premium.js?v=20261110"'));
  assert.ok(html.includes('href="assets/css/pages/why-now-editor-premium.css?v=20261110"'));
  assert.ok(html.indexOf('src="src/why-now-editor-premium.js')<
    html.indexOf('src="src/why-now-embedded.js'));
  for(const path of ["src/why-now-editor-premium.js",
    "assets/css/pages/why-now-editor-premium.css",
    "dist/src/why-now-editor-premium.js",
    "dist/assets/css/pages/why-now-editor-premium.css"])
    assert.ok(existsSync(new URL("../"+path,import.meta.url)),path);
  assert.ok(source("dist/why-now.html").includes("why-now-editor-premium.js"));
});

test("new editor script, bridge and original inline script have valid syntax",()=>{
  for(const path of ["src/why-now-editor-premium.js","src/why-now-embedded.js",
    "src/why-now-integration.js"]){
    const result=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});
    assert.equal(result.status,0,path+": "+result.stderr);
  }
  const inline=source("why-now.html").match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inline);
  const check=spawnSync(process.execPath,["--check","--input-type=commonjs"],
    {input:inline,encoding:"utf8"});
  assert.equal(check.status,0,check.stderr);
});

test("text layers can be moved, pinched, recolored, edited and removed",()=>{
  const js=source("src/why-now-editor-premium.js");
  for(const fragment of ["function makeDraggable(", "setPointerCapture",
    'element.addEventListener("pointerdown"', 'element.addEventListener("pointermove"',
    "originDistance", "originSize*distance/originDistance",
    'toolbar.querySelector("[data-wn-edit]")',
    'toolbar.querySelector("[data-wn-color]")',
    'toolbar.querySelector("[data-wn-delete]")',
    'toolbar.querySelector("[data-wn-shrink]")',
    'toolbar.querySelector("[data-wn-grow]")',
    'openTextTool=function(existing=null)', 'item.text=value', 'item.font=font',
    'item.color=color', 'item.size=keepSize(item,sizeInput.value)'])
    assert.ok(js.includes(fragment),fragment);
});

test("sticker picker comes from the actual chat catalog and favorites tables",()=>{
  const js=source("src/why-now-editor-premium.js");
  const parent=source("src/why-now-integration.js");
  const iframe=source("src/why-now-embedded.js");
  const catalog=source("src/chat-sticker-catalog.js");
  assert.ok(js.includes('new URL("src/chat-sticker-catalog.js",document.baseURI)'));
  assert.ok(js.includes("module.stickerCatalogMarkup()"));
  assert.ok(js.includes("module.CC0_STICKERS"));
  assert.ok(js.includes('"sticker-page"'));
  assert.ok(js.includes('"sticker-metadata"'));
  assert.ok(js.includes('"sticker-favorite"'));
  assert.ok(parent.includes('client.from("sticker_catalog")'));
  assert.ok(parent.includes('client.from("sticker_favorites")'));
  assert.ok(parent.includes('storage.from("looply-stickers")'));
  assert.ok(iframe.includes("window.whyNowStickerBridge"));
  assert.ok(catalog.includes("export function stickerCatalogMarkup()"));
  assert.ok(source("assets/css/pages/why-now-editor-premium.css")
    .includes("repeat(5,minmax(0,1fr))"));
});

test("sticker images are composited before publication rather than left as UI-only elements",()=>{
  const js=source("src/why-now-editor-premium.js");
  for(const fragment of ["canvas.toBlob(resolve,\"image/webp\"", 
    "reader.readAsDataURL(out)", "drawItemsOnCanvas=function(ctx,items,w,h)",
    "ctx.drawImage(image,", "exportPhotoBlob=async function()",
    "exportMomentImage=async function(item)",
    "exportEditedVideo=async function(item)",
    "wnExportWithMusic=async function(item)"])
    assert.ok(js.includes(fragment),fragment);
  assert.ok(source("src/why-now-embedded.js").includes('await request("publish"'));
});
