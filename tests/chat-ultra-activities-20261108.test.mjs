import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {setupUltraActivities} from "../src/chat-ultra-activities.js";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Chat Ultra activity panel does not render local mock notifications",()=>{
  const js=read("src/chat-ultra-activities.js");
  const adapter=read("assets/js/chat-ultra-live.js");
  for(const html of ["chat.html","conversa.html"]){
    const source=read(html);
    assert.match(source,/showServerActivities\(items,filter,handlers\)/);
    assert.match(source,/data-ultra-activity-filter/);
    assert.match(source,/#activityBtn,\[data-fan='events'\]/);
  }
  assert.match(adapter,/setupUltraActivities/);
  assert.match(adapter,/activities:\(\)=>activityService\?\.open\(\)/);
  assert.match(js,/\.from\("chat_notifications"\)/);
  assert.match(js,/\.eq\("user_id",userId\)/);
  assert.doesNotMatch(js,/localStorage|simulateEventSelector/);
});

test("remote notifications show real unread count and filter from trusted user data",async()=>{
  const userId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const messageId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const conversationId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const rendered=[],badges=[],opened=[];
  const notifications=[
    {id:messageId,conversation_id:conversationId,kind:"message",
     preview:"Mensagem de verdade",created_at:"2026-11-08T01:00:00Z",read_at:null}
  ];
  const client={rpc:async name=>{
    if(name==="v46_chat_unread_activity_count")return {data:1,error:null};
    if(name==="v46_chat_mark_all_activity_seen")return {data:1,error:null};
    return {data:null,error:Error("unexpected_rpc")};
  },from(table){
    assert.equal(table,"chat_notifications");
    const q={
      select(){return q;},eq(key,value){if(key==="user_id")assert.equal(value,userId);return q;},
      order(){return q;},is(){return q;},in(){return q;},
      range(){return Promise.resolve({data:notifications,error:null});},
      update(){return q;},maybeSingle(){return Promise.resolve({data:{id:messageId},error:null});}
    };
    return q;
  }};
  const visual={
    showServerActivities(items,filter,callbacks){rendered.push({items,filter,callbacks});},
    updateActivityBadge(n){badges.push(n);},closeActivityPanel(){},notice(){}
  };
  const win={setInterval(){return 1;},clearInterval(){}};
  const state=setupUltraActivities({client,userId,visual,win,onOpen:id=>opened.push(id)});
  await state.open("unread");
  assert.equal(rendered.at(-1).items.length,1);
  assert.equal(rendered.at(-1).filter,"unread");
  assert.equal(rendered.at(-1).items[0].preview,"Mensagem de verdade");
  await state.refreshBadge();
  assert.equal(badges.at(-1),1);
  state.dispose();
});
