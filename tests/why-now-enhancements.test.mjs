import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Why Now creation entry is first-class Looply UI, even with existing own moments",()=>{
  const parent=read("src/why-now-integration.js");
  assert.match(parent,/Criar Why Now/);
  assert.match(parent,/create\.addEventListener\("click"/);
  assert.match(parent,/if\(ownAccount\)/);
  assert.match(parent,/why-now-own-plus/);
  assert.match(parent,/why-now-people/);
  assert.match(parent,/open\("open-create"\)/);
  assert.match(parent,/document\.body\.append\(overlay\)/);
  assert.match(parent,/getComputedStyle\(document\.documentElement\)/);
  assert.doesNotMatch(parent,/height:141px/);
});
test("Why Now live viewer shares, mentions and repost rights are authenticated",()=>{
  const parent=read("src/why-now-integration.js");
  const embedded=read("src/why-now-embedded.js");
  for(const endpoint of ["v5_add_story_mentions","v5_create_story","v5_attach_story_media","record_story_view","send_story_reply"]){
    assert.match(parent,new RegExp(endpoint));
  }
  for(const feature of ["share-send","story_mentions","story_views","viewed_at","cachedSignedUrls","avatar_path","repost","permissions","people:listPeople"])
    assert.ok(parent.includes(feature),"missing "+feature);
  for(const feature of ["Compartilhar externamente","Copiar link","Enviar pelo Looply","Mencionar no Why Now","Viu em","Republicar","shareMoment","showOwnViewers"])
    assert.ok(embedded.includes(feature),"missing "+feature);
  assert.match(parent,/event\.source !== frame\.contentWindow/);
  assert.match(parent,/story\.author_id!==user\.id/);
  assert.match(parent,/Date\.parse\(story\.expires_at\)<=Date\.now\(\)/);
});
test("Why Now uses a click-bound same-origin entry to attempt audible autoplay",()=>{
  const parent=read("src/why-now-integration.js");
  const embedded=read("src/why-now-embedded.js");
  assert.match(parent,/frame\.contentWindow\.whyNowOpenStory/);
  assert.match(parent,/frame\.contentWindow\.whyNowOpenCreate/);
  assert.match(embedded,/vid\.muted = false/);
  assert.match(embedded,/audio\.play\(\)\.catch/);
  assert.match(embedded,/previewUrls/);
  assert.match(embedded,/resolveAppleStoryPreview/);
  assert.match(embedded,/NotAllowedError/);
  assert.match(embedded,/openStoryMusicPicker/);
});
test("Why Now updated controller source parses correctly",()=>{
  for(const file of ["src/why-now-embedded.js","src/why-now-integration.js","assets/js/home.js"]){
    const x=spawnSync(process.execPath,["--check",fileURLToPath(new URL("../"+file,import.meta.url))],{encoding:"utf8"});
    assert.equal(x.status,0,file+": "+x.stderr);
  }
});
