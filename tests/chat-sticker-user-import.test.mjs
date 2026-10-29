import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createNeonRestQuery} from "../src/neon-rest-bridge.js";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("reviewed CC0 sticker pack is bundled, with no external source links or remote image fetching",async()=>{
 const [code,chat]=await Promise.all([read("src/chat-sticker-catalog.js"),read("src/chat.js")]);
 assert.match(code,/export const CC0_STICKERS/);
 assert.match(code,/assets\/stickers\/cc0\//);
 assert.match(code,/CC0 1\.0/);
 assert.doesNotMatch(code,/https:\/\/(?:sticker\.ly|lovecell\.com\.br|zapfigurinhas\.com)/);
 assert.doesNotMatch(code,/chat-catalog-import/);
 assert.match(code,/\[\[looply-sticker:/);
 assert.match(chat,/cc0StickerFromMessage/);
});

test("sticker import is processed locally to WebP with format, size and pixel limits",async()=>{
 const code=await read("src/chat-sticker-catalog.js");
 assert.match(code,/normalizeImportedSticker/);
 assert.match(code,/image\/png","image\/jpeg","image\/webp/);
 assert.match(code,/file\.size > 10\*1024\*1024/);
 assert.match(code,/w\*h>24000000/);
 assert.match(code,/canvas\.toBlob\(resolve,"image\/webp"/);
 assert.match(code,/files\.length>30/);
 assert.match(code,/sticker_importing|stateFor\(picker\)\.importing/);
});

test("private storage accepts only owner-scoped WebP paths, never remote URL fetching",async()=>{
 const server=await read("backend/neon-storage/index.mjs");
 assert.match(server,/bucket === "looply-stickers"/);
 assert.ok(server.includes('const sticker = /^stickers\\/'));
 assert.match(server,/object\.type==="sticker"/);
 assert.match(server,/sticker:"sticker_catalog"/);
 assert.match(server,/object\.type==="sticker"\?\{storage_path:/);
 assert.match(server,/looply-stickers", "looply-gallery"/);
});

test("Neon allows own imports but existing chat messages stay participant-private",async()=>{
 const sql=await read("migration/20261028_neon_sticker_personal_import.sql");
 assert.match(sql,/owner_id=public\.looply_legacy_uid\(\)/);
 assert.match(sql,/v3_is_conversation_participant\(sm\.conversation_id\)/);
 assert.match(sql,/CREATE POLICY looply_v11_sticker_catalog_upload/);
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS sticker_catalog_owner_sha_v11/);
 assert.doesNotMatch(sql,/INSERT INTO public\.sticker_catalog.*https?:\/\//);
});

test("direct import persists verified metadata, deduplicates and signs images for both peers",async()=>{
 const [picker,chat]=await Promise.all([read("src/chat-sticker-catalog.js"),read("src/chat.js")]);
 assert.match(picker,/crypto\.subtle\.digest\("SHA-256"/);
 assert.match(picker,/content_sha256:hash/);
 assert.match(picker,/client\.storage\.from\("looply-stickers"\)\.upload/);
 assert.match(picker,/from\("sticker_catalog"\)\.insert/);
 assert.match(picker,/verified\.data\?\.storage_path!==path/);
 assert.match(picker,/createSignedUrl\(row\.storage_path,1800\)/);
 assert.match(chat,/cachedSignedUrl\(client,"looply-stickers",item\.storage_path,1800\)/);
 assert.match(chat,/message\.sticker\.imageUrl/);
});

test("Neon data adapter permits only metadata, not arbitrary asset URLs",async()=>{
 const read=await createNeonRestQuery("sticker_catalog",{dataApiUrl:"https://example.invalid",getAccessToken:async()=>"test-token"})
   .insert({owner_id:"uid",asset_path:"https://other.example/unsafe.webp"}).select("id");
 assert.equal(read.error?.message,"neon_unpermitted_fields");
});
