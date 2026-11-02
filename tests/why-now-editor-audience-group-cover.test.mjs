import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const read=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");

test("Why Now editor collects mentions and authenticated audience before upload",()=>{
  const ui=read("src/why-now-embedded.js"),api=read("src/why-now-integration.js");
  for(const text of ["Mencionar pessoas","Quem poderá ver?","Pessoas específicas","Escolher pessoas",
    "recipientIds:finalRecipients","mentionIds:[...editorMentions]","[data-wn-seconds]",
    "data-wn-seconds=\"15\"","data-wn-seconds=\"30\""]){
    assert.ok(ui.includes(text),"missing "+text);
  }
  assert.match(api,/p_visibility: visibility, p_recipient_ids:/);
  assert.match(api,/visibility==="selected"/);
  assert.match(api,/client\.rpc\("v5_add_story_mentions"/);
  const attach=api.indexOf('client.rpc("v5_attach_story_media"');
  const mentions=api.indexOf('const mentionResult=await client.rpc("v5_add_story_mentions"');
  assert.ok(attach>=0&&mentions>attach,"mentions should be created after media association");
  assert.match(api,/mentions\.some\(id=>!recipients\.includes\(id\)\)/);
});
test("Photo preview duration and 90-second camera videos have distinct limits",()=>{
  const html=read("why-now.html"),ui=read("src/why-now-embedded.js"),api=read("src/why-now-integration.js");
  assert.match(html,/máximo 90 s/);
  assert.match(html,/if\(sec>=90\)finishRecording\(\)/);
  assert.match(html,/source:'camera'/);
  assert.match(html,/source:'gallery'/);
  assert.match(ui,/it\.remoteUrl && it\.type==="image"/);
  assert.match(ui,/viewProgress\+=dt\/\(seconds\*1000\)/);
  assert.match(ui,/hasEditorMusic\(\)/);
  assert.match(ui,/exportEditedVideo\(draft,song\?clipSeconds/);
  assert.match(api,/durationMatch = raw\.match/);
  assert.match(api,/durationMarker=/);
  assert.match(api,/seconds>90/);
  assert.match(api,/p_body: text/);
});
test("Group photo may be selected during creation and persist with existing authorization",()=>{
  const chat=read("src/chat.js"),css=read("assets/css/pages/chat.css");
  for(const marker of ["data-chat-new-group-cover","data-chat-new-group-cover-preview",
    "editGroupCover(file)","persistNewGroupCover(client,data.conversationId,userId,newCover)",
    'client.rpc("v10_set_group_cover"', 'client.from("group_covers")',
    'client.from("chat_media")',"coverSaved"]){
      assert.ok(chat.includes(marker),"missing "+marker);
  }
  assert.match(css,/\.chat-group-cover-create/);
});
test("Changed web modules parse in Node",()=>{
  for(const path of ["src/why-now-integration.js","src/why-now-embedded.js","src/chat.js","assets/js/chat.js"]){
    const output=spawnSync(process.execPath,["--check",new URL("../"+path,import.meta.url).pathname],{encoding:"utf8"});
    assert.equal(output.status,0, path+" "+output.stderr);
  }
});
