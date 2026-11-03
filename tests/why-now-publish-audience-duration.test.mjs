import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Why Now camera captures microphone audio up to ninety seconds",()=>{
  const html=source("why-now.html");
  assert.match(html,/micOn=true/);
  assert.match(html,/getUserMedia\(\{audio:\{echoCancellation:true,noiseSuppression:true\},video:false\}\)/);
  assert.match(html,/audio\?\.getAudioTracks\(\)/);
  assert.match(html,/if\(sec>=90\)finishRecording\(\)/);
  assert.match(html,/máximo 90 s/);
  assert.match(html,/Math\.min\(30,length,/);
});
test("Why Now publisher chooses the public or selected audience and confirms before upload",()=>{
  const ui=source("src/why-now-embedded.js");
  const api=source("src/why-now-integration.js");
  assert.match(ui,/function openPublishChoices\(\)/);
  assert.match(ui,/Pessoas específicas/);
  assert.match(ui,/Todos/);
  assert.match(ui,/Publicar agora/);
  assert.match(ui,/const chosen=new Set\(initial\|\|\[\]\)/);
  assert.match(ui,/Pesquisar|Buscar pessoas/);
  assert.match(ui,/recipientIds:\[\.\.\.publishAudience\]/);
  assert.match(api,/p_visibility: visibility, p_recipient_ids: audience/);
  assert.match(api,/!audience\.length\|\|audience\.length>20/);
  assert.match(api,/visibility==="selected"&&mentionIds\.some/);
});
test("prepublication mentions are saved after authenticated media association",()=>{
  const ui=source("src/why-now-embedded.js");
  const api=source("src/why-now-integration.js");
  assert.match(ui,/editorMentions=new Set/);
  assert.match(ui,/openEditorMentions/);
  assert.match(ui,/Mencionar no Why Now/);
  assert.match(ui,/mentionIds:\[\.\.\.editorMentions\]/);
  assert.ok(api.indexOf('client.rpc("v5_attach_story_media"')<
            api.indexOf('client.rpc("v5_add_story_mentions"'));
  assert.match(api,/p_story_id:createdId,p_user_ids:mentionIds/);
});
test("image playback lasts fifteen seconds or selected music preview length",()=>{
  const api=source("src/why-now-integration.js");
  const ui=source("src/why-now-embedded.js");
  assert.match(api,/WN-DURATION:\(15\|30\)/);
  assert.match(api,/message\.photoDuration/);
  assert.match(ui,/editorDuration=15/);
  assert.match(ui,/Foto com música/);
  assert.match(ui,/data-wn-duration="30"/);
  assert.match(ui,/draft\.music\.length=Math\.min\(duration,draft\.music\.length,30\)/);
  assert.match(ui,/viewProgress\+=dt\/\(Math\.max\(1,Number\(item\.duration\)\|\|15\)\*1000\)/);
});
test("group images can be selected at creation, cropped and bound to authorized group covers",()=>{
  const chat=source("src/chat.js");
  const css=source("assets/css/pages/chat.css");
  assert.match(chat,/name="groupCover"/);
  assert.match(chat,/chat-group-cover-preview/);
  assert.match(chat,/async function saveNewGroupCover/);
  assert.match(chat,/editGroupCover\(file\)/);
  assert.match(chat,/client\.rpc\("v10_set_group_cover"/);
  assert.match(chat,/await saveNewGroupCover\(data\.conversationId,userId,cover/);
  assert.match(css,/\.chat-group-cover-preview img/);
});
test("modified modules pass syntax checks",()=>{
  for(const path of ["src/why-now-integration.js","src/why-now-embedded.js","src/chat.js"]){
    const result=spawnSync(process.execPath,["--check",fileURLToPath(new URL("../"+path,import.meta.url))],{encoding:"utf8"});
    assert.equal(result.status,0,path+": "+result.stderr);
  }
});
