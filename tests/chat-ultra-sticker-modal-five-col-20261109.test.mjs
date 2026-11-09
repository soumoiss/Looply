import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("the online picker is a standalone modal, not a composer-height panel",()=>{
  const js=read("assets/js/chat-ultra-stickers.js");
  assert.match(js,/document\.createElement\("dialog"\)/);
  assert.match(js,/document\.body\.append\(dialog\)/);
  assert.match(js,/dialog\.showModal\(\)/);
  assert.match(js,/panel\.classList\.remove\("open"\)/);
  assert.match(js,/dialog\.addEventListener\("cancel"/);
  assert.match(js,/setAttribute\("aria-modal","true"\)/);
  assert.match(js,/data-ultra-sticker-close/);
  assert.match(js,/form\.addEventListener\("submit",event=>event\.preventDefault\(\)\)/);
  assert.doesNotMatch(js,/tabs\.after\(nativeHost\)/);
});

test("mobile sticker previews are precisely five columns, bounded, scrollable and never full-size",()=>{
  const js=read("assets/js/chat-ultra-stickers.js");
  assert.match(js,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
  assert.match(js,/\.chat-catalog-item\{\s*position:relative!important;width:100%!important;aspect-ratio:1!important/);
  assert.match(js,/\.chat-catalog-item img\{\s*display:block!important;width:100%!important;height:100%!important;/);
  assert.match(js,/object-fit:contain!important/);
  assert.match(js,/overflow-y:auto!important/);
  assert.match(js,/scrollTop\+catalogGrid\.clientHeight>=catalogGrid\.scrollHeight-70/);
});

test("real preview, favorites, catalog pagination and import stay connected",()=>{
  const picker=read("assets/js/chat-ultra-stickers.js");
  const catalog=read("src/chat-sticker-catalog.js");
  assert.match(picker,/stickerCatalogMarkup\(\)/);
  assert.match(picker,/bindStickerCatalog\(dialog,client,getUserId\)/);
  assert.match(picker,/data-chat-catalog-pack/);
  assert.match(picker,/data-chat-catalog-grid/);
  assert.match(picker,/data-chat-sticker-import-rights/);
  assert.match(picker,/data-chat-sticker-import-files/);
  assert.match(catalog,/sticker_favorites/);
  assert.match(catalog,/sticker_catalog/);
  assert.match(catalog,/createSignedUrl\(row\.storage_path,1800\)/);
  assert.match(catalog,/data-chat-sticker-favorite/);
  assert.match(catalog,/data-chat-sticker-item/);
});

test("both chat routes force a fresh sticker module, including APK WebView caches",()=>{
  const adapter=read("assets/js/chat-ultra-live.js");
  assert.match(adapter,/chat-ultra-stickers\.js\?v=sticker-dialog-five-col-20261109/);
  for(const page of ["chat.html","conversa.html"]){
    const html=read(page);
    assert.match(html,/chat-ultra-live\.js\?v=sticker-dialog-five-col-20261109/);
  }
});

test("new sticker module compiles as JavaScript",()=>{
  const path=new URL("../assets/js/chat-ultra-stickers.js",import.meta.url).pathname;
  const result=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
});
