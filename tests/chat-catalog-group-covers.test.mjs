import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createNeonRestQuery } from "../src/neon-rest-bridge.js";
import { stickerCatalogMarkup } from "../src/chat-sticker-catalog.js";
import { chatMarkup } from "../src/chat.js";

const read = path => readFile(new URL("../"+path,import.meta.url),"utf8");

test("only Todas stays in conversation tabs; search and group/user selection remain", () => {
  const markup = chatMarkup({conversations:[],profiles:[],notifications:[]},"profile-id");
  assert.match(markup,/data-chat-filter="all"/);
  assert.doesNotMatch(markup,/data-chat-filter="unread"|data-chat-filter="groups"|data-chat-filter="favorites"/);
  assert.match(markup,/data-chat-conversation-search/);
  assert.match(markup,/data-chat-group-create/);
  assert.match(markup,/data-chat-search/);
});

test("the same profile ID receives a signed photo in both sidebar and person picker", async () => {
  const source = await read("src/chat.js");
  assert.match(source,/const profileReferences = \[\.\.\.profiles, \.\.\.conversations\.flatMap/);
  assert.match(source,/paths\.set\(person\.id, person\.avatar_path\)/);
  assert.match(source,/person\.avatarUrl = avatarUrls\.get\(person\.id\) \|\| null/);
  assert.match(source,/cachedSignedUrl\(client, "looply-avatars", path, 1800\)/);
  assert.match(source,/data-profile-avatar-id/);
});

test("group covers refer to authorized chat media and require the creator", async () => {
  const sql=await read("migration/20261028_neon_chat_groups_stickers.sql");
  const source=await read("src/chat.js");
  assert.match(sql,/storage_path text NOT NULL REFERENCES public\.chat_media\(storage_path\)/);
  assert.match(sql,/c\.kind='group' AND c\.created_by=actor/);
  assert.match(sql,/m\.mime_type IN \('image\/jpeg','image\/png','image\/webp'\)/);
  assert.match(sql,/FOR SELECT TO authenticated USING \(public\.v3_is_conversation_participant\(conversation_id\)\)/);
  assert.match(source,/data-chat-group-cover-choose/);
  assert.match(source,/normalizeGroupCover\(file\)/);
  assert.match(source,/await uploadResumable\(client,uploadedPath,image\)/);
  assert.match(source,/v10_set_group_cover/);
  assert.match(source,/read\.data\?\.storage_path !== uploadedPath/);
});

test("catalog rejects arbitrary external URLs and has a clearly identified sample", async () => {
  const sql = await read("migration/20261028_neon_chat_groups_stickers.sql");
  const library = await read("src/chat-sticker-catalog.js");
  const sample = await read("assets/stickers/amostra-coracao.svg");
  assert.match(sql,/asset_path ~ '\^assets\/stickers\//);
  assert.match(sql,/Coração — amostra/);
  assert.match(library,/safeAsset/);
  assert.doesNotMatch(library,/fetch\(.*https?:\/\//);
  assert.match(sample,/<svg/);
  assert.match(stickerCatalogMarkup(),/data-chat-catalog-tab="favorites"/);
});

test("sticker sends are authenticated chat rows with a persistent separate relation", async () => {
  const sql = await read("migration/20261028_neon_chat_groups_stickers.sql");
  const picker = await read("src/chat-sticker-catalog.js");
  const chat = await read("src/chat.js");
  assert.match(sql,/chat_sticker_messages_chat_fk FOREIGN KEY \(message_id,conversation_id\)/);
  assert.match(sql,/sender_id=public\.looply_legacy_uid\(\)/);
  assert.match(sql,/public\.v3_is_conversation_participant\(conversation_id\)/);
  assert.match(picker,/from\("chat_messages"\)/);
  assert.match(picker,/from\("chat_sticker_messages"\)/);
  assert.match(picker,/state\.sending = true/);
  assert.match(chat,/chat-catalog-message/);
  assert.match(chat,/message\.sticker/);
});

test("favorites are per-user in Neon, and separate send and star controls", async () => {
  const sql = await read("migration/20261028_neon_chat_groups_stickers.sql");
  const picker = await read("src/chat-sticker-catalog.js");
  assert.match(sql,/PRIMARY KEY\(user_id,sticker_id\)/);
  assert.match(sql,/user_id=public\.looply_legacy_uid\(\)/);
  assert.match(picker,/favorite\.dataset\.chatStickerFavorite/);
  assert.match(picker,/favorite\.setAttribute\("aria-pressed"/);
  assert.match(picker,/event\.stopPropagation\(\)/);
});

test("Neon REST pagination requests 36 of 1200 catalog items, not the full collection", async () => {
  const items = Array.from({length:1200},(_,i)=>({id:"item-"+i}));
  const requests=[];
  const client = createNeonRestQuery("sticker_catalog",{
    dataApiUrl:"https://neon.example/rest/v1",
    getAccessToken:async()=>"test-token",
    fetchImpl:async(url,opts)=>{
      const u=new URL(url);
      requests.push({limit:Number(u.searchParams.get("limit")),offset:Number(u.searchParams.get("offset"))});
      const from=Number(u.searchParams.get("offset")||0);
      const limit=Number(u.searchParams.get("limit")||0);
      return Response.json(items.slice(from,from+limit));
    }
  });
  const first=await client.select("id").order("slug").range(0,35);
  assert.equal(first.data.length,36);
  assert.deepEqual(requests,[{limit:36,offset:0}]);
  const source=await read("src/chat-sticker-catalog.js");
  assert.match(source,/const PAGE_SIZE = 36/);
  assert.match(source,/\.range\(offset,offset\+PAGE_SIZE-1\)/);
  assert.match(source,/picture\.loading = "lazy"/);
  assert.match(source,/state\.queued/);
});

test("keyboard panel follows real viewport without forced scrolling on focus",async()=>{
  const [chat,css]=await Promise.all([
    read("src/chat.js"),read("assets/css/pages/chat-viewport-catalog.css")]);
  assert.match(chat,/viewport\.height \+ viewport\.offsetTop/);
  assert.match(chat,/area\?\.getBoundingClientRect\(\)\.top/);
  assert.match(chat,/--chat-panel-px/);
  assert.doesNotMatch(chat,/document\.activeElement\?\.matches\("\.chat-message-form textarea"\) && thread\) requestAnimationFrame\(\(\) => \{ thread\.scrollTop/);
  assert.match(css,/height:var\(--chat-panel-px/);
  assert.match(css,/padding-bottom:0!important/);
});
