import test from "node:test";
import assert from "node:assert/strict";
import { createNeonRestQuery } from "../src/neon-rest-bridge.js";

function client(table,calls){
  return createNeonRestQuery(table,{
    dataApiUrl:"https://example.apirest.neon.tech/neondb/rest/v1",
    getAccessToken:async()=>"session-token",
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      return new Response(JSON.stringify([]),{status:200,headers:{"content-type":"application/json"}});
    }
  });
}

test("mark all unread notifications works only on the current RLS-scoped rows",async()=>{
  for(const table of ["notifications","chat_notifications"]){
    const calls=[];
    const result=await client(table,calls).update({read_at:"2026-10-30T23:00:00Z"}).is("read_at",null);
    assert.equal(result.error,null);
    assert.equal(calls.length,1);
    assert.equal(calls[0].options.method,"PATCH");
    assert.equal(new URL(calls[0].url).searchParams.get("read_at"),"is.null");
  }
});

test("bulk updates remain forbidden for other tables and arbitrary notification fields",async()=>{
  for(const [table,payload,filter] of [
    ["posts",{body:"attack"},"read_at"],
    ["notifications",{read_at:"2026-10-30T23:00:00Z"},"id"],
    ["notifications",{read_at:"2026-10-30T23:00:00Z",preview:"attack"},"read_at"]
  ]){
    const calls=[];
    const result=await client(table,calls).update(payload).is(filter,null);
    assert.ok(result.error,table);
    assert.equal(calls.length,0);
  }
});
