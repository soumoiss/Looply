import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler from "../backend/neon-storage/index.mjs";

const read = path => readFile(new URL("../" + path, import.meta.url),"utf8");
const uuidA="11111111-1111-4111-8111-111111111111";
const uuidB="22222222-2222-4222-8222-222222222222";
const mediaId="33333333-3333-4333-8333-333333333333";
const env={NEON_DATA_API_URL:"https://data.example",AWS_ENDPOINT_URL_S3:"https://objects.example",AWS_ACCESS_KEY_ID:"dummy",AWS_SECRET_ACCESS_KEY:"dummy",AWS_REGION:"us-east-1"};

test("storage function authorizes deletion by actual media path owner, not the display name",async()=>{
  const previousFetch=globalThis.fetch;
  const oldEnv={...process.env};Object.assign(process.env,env);
  let objectDeletes=0,checks=0;
  globalThis.fetch=async(url,opts={})=>{
    if(String(url).includes("/v3_self_profile?"))return Response.json([{id:uuidA}]);
    if(String(url).includes("/rpc/v7_gallery_storage_delete_allowed")){
      checks++;return Response.json(false);
    }
    if(String(url).startsWith("https://objects.example/")){
      objectDeletes++;assert.equal(opts.method,"DELETE");return new Response(null,{status:204});
    }
    throw Error("Unexpected URL "+url);
  };
  try {
    const req=path=>new Request("https://storage.example/storage/remove",{method:"POST",headers:{origin:"https://soumoiss.github.io",authorization:"Bearer validated-by-neon", "x-looply-bucket":"looply-gallery","x-looply-path":path}});
    const own=await handler.fetch(req(`gallery/${uuidA}/${mediaId}.jpg`));
    assert.equal(own.status,200);
    const someoneElse=await handler.fetch(req(`gallery/${uuidB}/${mediaId}.jpg`));
    assert.equal(someoneElse.status,403);
    assert.equal(objectDeletes,1);
    assert.equal(checks,1);
  }finally{
    globalThis.fetch=previousFetch;
    for(const key of Object.keys(env))if(oldEnv[key]===undefined)delete process.env[key];else process.env[key]=oldEnv[key];
  }
});

test("owner and verified admin gallery deletion is authorized in SQL, with relational cleanup",async()=>{
  const [sql,bridge,source]=await Promise.all([
    read("migration/20261028_gallery_owner_admin_album_cleanup.sql"),
    read("src/neon-production-client.js"),read("assets/js/gallery.js")
  ]);
  assert.match(sql,/m\.owner_id=actor OR administrator/);
  assert.match(sql,/IF NOT administrator THEN RAISE EXCEPTION/);
  assert.match(sql,/m\.owner_id=public\.looply_legacy_uid\(\) OR COALESCE\(public\.v3_self_is_admin\(\),false\)/);
  for(const table of ["gallery_album_items","gallery_media_people","gallery_media_descriptions","gallery_media_adjustments","gallery_media_pins","gallery_private_items"]){
    assert.match(sql,new RegExp("DELETE FROM public\\."+table));
  }
  assert.match(sql,/RETURN true/);
  assert.match(bridge,/v8_delete_gallery_media/);
  assert.match(source,/isAdmin \|\| \(x\.source === "community" && x\.owner_id === user\.id\)/);
  assert.match(source,/client\.rpc\("v8_delete_gallery_media"/);
  assert.match(source,/const \{ data: check, error: checkError \}/);
  assert.match(source,/if \(storageError\) throw storageError/);
  assert.match(source,/fileDeleted/);
});

test("viewer uses source owner avatar and comments on active media key",async()=>{
  const [gallery,css]=await Promise.all([read("assets/js/gallery.js"),read("assets/css/pages/gallery.css")]);
  assert.match(gallery,/owner:profiles!community_gallery_media_owner_id_fkey\(id,username,display_name,avatar_path\)/);
  assert.match(gallery,/\$\("\[data-viewer-author\]"\)\?\.replaceWith\(uploaderInfo\)/);
  assert.match(gallery,/data-open-comments aria-label="Comentários desta mídia"/);
  assert.match(gallery,/commentKey = key/);
  assert.match(gallery,/const request = \+\+commentRequest/);
  assert.match(gallery,/commentKey !== key/);
  assert.match(gallery,/const key = commentKey, x = getItem\(key\)/);
  assert.match(gallery,/const confirmed = await loadComments\(key\)/);
  assert.match(css,/gallery-viewer-top \.gallery-viewer-uploader/);
});

test("album picker writes one association, rereads Neon, and navigates to chosen album",async()=>{
  const gallery=await read("assets/js/gallery.js");
  assert.match(gallery,/data-album-picker-modal/);
  assert.match(gallery,/data-album-picker-select/);
  assert.match(gallery,/showAlbumPicker\(add\.dataset\.albumAdd\)/);
  assert.match(gallery,/gallery_album_items"\)\.upsert\(\{album_id:albumId,source:x\.source,media_id:x\.id\}/);
  assert.match(gallery,/\.eq\("album_id",albumId\)\.eq\("source",x\.source\)\.eq\("media_id",x\.id\)/);
  assert.match(gallery,/activeAlbumId=albumId;kind="album"/);
});

test("media tags keep stable user IDs and viewer links survive reload",async()=>{
  const [gallery,sql]=await Promise.all([
    read("assets/js/gallery.js"),read("migration/20261028_gallery_owner_admin_album_cleanup.sql")
  ]);
  assert.match(gallery,/x\.peopleIds=\[\.\.\.actual\]/);
  assert.match(gallery,/\.select\("person_id"\)\.eq\("source",x\.source\)\.eq\("media_id",x\.id\)/);
  assert.match(gallery,/perfil\.html\?usuario=/);
  assert.match(sql,/v8_gallery_people_manage_delete/);
  assert.match(sql,/v8_gallery_people_admin_insert/);
});

test("video navigation avoids native controls and stops the previous player",async()=>{
  const [gallery,css]=await Promise.all([read("assets/js/gallery.js"),read("assets/css/pages/gallery.css")]);
  assert.match(gallery,/const video = viewerMedia\.querySelector\("video"\)/);
  assert.match(gallery,/e\.clientY > box\.bottom - Math\.max\(68, box\.height \* \.23\)/);
  assert.match(gallery,/if \(img\) viewerMedia\.setPointerCapture/);
  assert.match(gallery,/media\.pause\(\); media\.removeAttribute\("src"\); media\.load\(\)/);
  assert.match(gallery,/request !== viewerRequest/);
  assert.match(css,/gallery-viewer-media video \{ touch-action:pan-y/);
});

test("gallery filters retain format dropdown, remove duplicates and provide a close X",async()=>{
  const gallery=await read("assets/js/gallery.js");
  assert.match(gallery,/data-title-filter/);
  assert.match(gallery,/data-close-filters aria-label="Fechar filtros"/);
  assert.match(gallery,/data-filter-panel/);
  assert.match(gallery,/data-main="favoritos"/);
  assert.doesNotMatch(gallery,/data-kind="image"/);
  assert.equal((gallery.match(/data-main="favoritos"/g)||[]).length,1);
});
