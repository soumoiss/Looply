import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("sticker catalog is mounted on the document, never in the expanding composer",()=>{
  const code=read("assets/js/chat-ultra-stickers.js");
  assert.match(code,/document\.body\.append\(nativeHost\)/);
  assert.doesNotMatch(code,/tabs\.after\(nativeHost\)|panel\.append\(nativeHost\)/);
  assert.match(code,/panel\.classList\.remove\("open"\)/);
  assert.match(code,/nativeHost\.hidden=false/);
  assert.match(code,/nativeHost\.hidden=true/);
  assert.match(code,/picker\.close=closePicker/);
});
test("mobile sticker picker has five columns, constrained thumbnails and scrolling",()=>{
  const css=read("assets/css/pages/chat-ultra-live-fixes.css");
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
  assert.match(css,/\.chat-catalog-item img\{[\s\S]*?object-fit:contain!important/);
  assert.match(css,/\.chat-catalog-grid\{[\s\S]*?overflow-y:auto!important/);
  assert.match(css,/ultra-sticker-modal-open\{overflow:hidden!important\}/);
  for(const html of ["chat.html","conversa.html"]){
    const file=read(html);
    assert.match(file,/chat-ultra-live-fixes\.css\?v=sticker-modal-5col-20261109/);
    assert.match(file,/chat-ultra-live\.js\?v=sticker-modal-5col-20261109/);
    assert.match(file,/#ultraStickerHost \.chat-catalog-grid\{display:grid!important;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important\}/);
  }
});
test("favorite and import flows remain connected to the authenticated catalog",()=>{
  const picker=read("assets/js/chat-ultra-stickers.js");
  const catalog=read("src/chat-sticker-catalog.js");
  assert.match(picker,/bindStickerCatalog\(nativeHost,client,getUserId\)/);
  assert.match(picker,/data-chat-sticker-import-rights/);
  assert.match(picker,/data-chat-sticker-import-files/);
  assert.match(picker,/data-ultra-sticker-import-toggle/);
  assert.match(picker,/data-ultra-sticker-import-select/);
  assert.match(picker,/data-chat-choose-sticker/);
  assert.match(picker,/data-chat-send/);
  assert.match(catalog,/data-chat-sticker-favorite/);
  assert.match(catalog,/client\.from\("sticker_favorites"\)/);
  assert.match(catalog,/prepareImages\(client,rows\)/);
  assert.match(catalog,/const PAGE_SIZE = 40/);
  assert.match(catalog,/chat-catalog-image-fallback/);
  assert.match(catalog,/Sticker preview temporarily unavailable/);
  assert.match(catalog,/client\.storage\.from\("looply-stickers"\)/);
});
test("modal closes safely and restores keyboard focus",()=>{
  const code=read("assets/js/chat-ultra-stickers.js");
  assert.match(code,/nativeHost\.setAttribute\("aria-hidden","false"\)/);
  assert.match(code,/nativeHost\.setAttribute\("aria-hidden","true"\)/);
  assert.match(code,/focusBefore\?\.focus\?\./);
  assert.match(code,/event\.key==="Escape"/);
  assert.match(code,/data-ultra-sticker-close/);
  assert.match(code,/panel\.addEventListener\("click",onPanelClick,true\)/);
});
test("sticker scripts are syntactically valid and runtime busts the old mobile cache",()=>{
  for(const file of ["assets/js/chat-ultra-stickers.js","assets/js/chat-ultra-live.js","src/chat-sticker-catalog.js"]){
    const result=spawnSync(process.execPath,["--check",new URL("../"+file,import.meta.url).pathname],{encoding:"utf8"});
    assert.equal(result.status,0,file+": "+result.stderr);
  }
  assert.match(read("assets/js/chat-ultra-live.js"),/chat-ultra-stickers\.js\?v=sticker-modal-5col-20261109/);
});
