import test from "node:test";
import assert from "node:assert/strict";
import { createNeonRestQuery } from "../src/neon-rest-bridge.js";

const ID="11111111-1111-4111-8111-111111111111";
const CONVERSATION="22222222-2222-4222-8222-222222222222";
function connection(requests) {
  return createNeonRestQuery("conversation_nicknames", {
    dataApiUrl:"https://unit.apirest.neon.tech/neondb/rest/v1",
    getAccessToken:async()=>"test-token",
    fetchImpl:async(url,options)=>{
      requests.push({url,options});
      return new Response(JSON.stringify([{user_id:ID,conversation_id:CONVERSATION,nickname:"Novo nome"}]),
        {status:200,headers:{"content-type":"application/json"}});
    }
  });
}

test("nickname is upserted through Neon REST with the expected identity fields",async()=>{
  const requests=[];
  const value={user_id:ID,conversation_id:CONVERSATION,nickname:"Novo nome",updated_at:"2026-10-30T20:00:00Z"};
  const result=await connection(requests).upsert(value,{onConflict:"user_id,conversation_id"});
  assert.equal(result.error,null);
  assert.equal(requests.length,1);
  assert.equal(requests[0].options.method,"POST");
  assert.equal(requests[0].options.headers.authorization,"Bearer test-token");
  assert.match(requests[0].options.headers.prefer,/resolution=merge-duplicates/);
  assert.equal(new URL(requests[0].url).searchParams.get("on_conflict"),"user_id,conversation_id");
  assert.deepEqual(JSON.parse(requests[0].options.body),value);
});

test("nickname removal is scoped to user and conversation",async()=>{
  const requests=[];
  const result=await connection(requests).delete().eq("user_id",ID).eq("conversation_id",CONVERSATION);
  assert.equal(result.error,null);
  assert.equal(requests.length,1);
  assert.equal(requests[0].options.method,"DELETE");
  const u=new URL(requests[0].url);
  assert.equal(u.searchParams.get("user_id"),"eq."+ID);
  assert.equal(u.searchParams.get("conversation_id"),"eq."+CONVERSATION);
});

test("nickname write rejects unapproved fields before any network request",async()=>{
  const requests=[];
  const result=await connection(requests).upsert({user_id:ID,conversation_id:CONVERSATION,nickname:"Teste",role:"admin"});
  assert.equal(result.error?.message,"neon_unpermitted_fields");
  assert.equal(requests.length,0);
});
