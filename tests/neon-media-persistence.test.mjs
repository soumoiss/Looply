import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createNeonRestQuery} from "../src/neon-rest-bridge.js";

const URL_PREFIX = "https://neon.example/rest/v1";
const TOKEN="eyJhbGciOiJIUzI1NiJ9.payload.signature";
function mock(table,fn){
  const sent=[];
  const query=createNeonRestQuery(table,{
    dataApiUrl:URL_PREFIX,
    getAccessToken:async()=>TOKEN,
    fetchImpl:async(url,req)=>{
      const destination=new URL(url);
      assert.equal(req.headers.authorization,"Bearer "+TOKEN);
      assert.equal(destination.pathname,"/rest/v1/"+table);
      sent.push({url:destination,req});
      return fn?.(destination,req)||Response.json([{id:"record"}]);
    }
  });
  return {query,sent};
}

test("Neon feed upload metadata POST sends the historical author explicitly with bearer",async()=>{
  const m=mock("posts");
  const {data,error}=await m.query.insert({author_id:"legacy-uuid",body:"Foto",visibility:"public",external_url:null}).select("id").single();
  assert.equal(error,null);
  assert.equal(data.id,"record");
  assert.equal(m.sent[0].req.method,"POST");
  assert.equal(JSON.parse(m.sent[0].req.body).author_id,"legacy-uuid");
  assert.match(m.sent[0].req.headers.prefer,/return=representation/);
});

test("stories, posts and chat metadata use authenticated Neon queries",async()=>{
  for (const table of ["stories","story_media","post_media","chat_messages","chat_media","community_letters","gallery_media_viewers"]) {
    const m=mock(table);
    const allowed={
      stories:{author_id:"actor",body:"Vida",visibility:"public"},
      story_media:{story_id:"story",storage_path:"stories/abc/image.jpg"},
      post_media:{post_id:"post",storage_path:"posts/abc/image.jpg"},
      chat_messages:{conversation_id:"conv",sender_id:"actor",body:"Oi"},
      chat_media:{conversation_id:"conv",message_id:"msg",created_by:"actor"},
      community_letters:{sender_id:"actor",recipient_id:"friend",subject:"Hi",body:"Olá"},
      gallery_media_viewers:{media_id:"media",user_id:"friend"}
    };
    const result=await m.query.insert(allowed[table]).select("id");
    assert.equal(result.error,null,table);
    assert.equal(m.sent[0].req.method,"POST");
  }
});

test("RLS denials and missing JWT fail closed with explicit response",async()=>{
  const denied=mock("posts",()=>Response.json({message:"permission denied",code:"42501"},{status:403}));
  const res=await denied.query.insert({author_id:"actor",body:"Hi"}).select("id");
  assert.equal(res.error?.status,403);
  assert.equal(res.error?.code,"42501");
  const missing=createNeonRestQuery("posts",{dataApiUrl:URL_PREFIX,getAccessToken:async()=>null,fetchImpl:()=>{throw Error("must not run");}});
  const unauthed=await missing.select("*");
  assert.equal(unauthed.error?.status,401);
});

test("restore gallery community media view and room ownership filtered reads",async()=>{
  const m=mock("community_gallery_media");
  const result=await m.query.select("id,owner_id,publication_state").eq("owner_id","legacy-owner").order("created_at",{ascending:false}).range(0,49);
  assert.equal(result.error,null);
  const url=m.sent[0].url;
  assert.equal(url.searchParams.get("owner_id"),"eq.legacy-owner");
  assert.equal(url.searchParams.get("order"),"created_at.desc");
  assert.equal(url.searchParams.get("limit"),"50");
});

test("gallery description upsert uses native Neon conflict resolution",async()=>{
  const m=mock("gallery_media_descriptions");
  const result=await m.query.upsert({user_id:"actor",source:"community",media_id:"media",description:"Foto"},{onConflict:"user_id,source,media_id"}).select("*");
  assert.equal(result.error,null);
  assert.equal(m.sent[0].url.searchParams.get("on_conflict"),"user_id,source,media_id");
  assert.match(m.sent[0].req.headers.prefer,/resolution=merge-duplicates/);
});

test("writes with unknown fields and unfiltered deletes never reach Neon",async()=>{
  const wrong=mock("stories");
  assert.equal((await wrong.query.insert({superuser:true})).error?.message,"neon_unpermitted_fields");
  assert.equal(wrong.sent.length,0);
  const unfiltered=mock("posts");
  assert.equal((await unfiltered.query.delete()).error?.message,"neon_update_requires_owner_filter");
  assert.equal(unfiltered.sent.length,0);
});

test("production media controllers do not call legacy Supabase upload endpoints",async()=>{
  for(const path of ["src/social.js","src/chat.js"]){
    const source=await readFile(new URL("../"+path,import.meta.url),"utf8");
    assert.doesNotMatch(source,/supabase\.co|publishableKey|tus-js-client|\/storage\/v1\/upload\/resumable/);
  }
  const backend=await readFile(new URL("../backend/neon-storage/index.mjs",import.meta.url),"utf8");
  assert.match(backend,/looply-media/);
  assert.match(backend,/looply-chat/);
  assert.match(backend,/looply-letters/);
  assert.match(backend,/canSignObject/);
});

test("Neon letters filter encodes grouped OR to recover sent and received archives",async()=>{
  const m=mock("community_letters");
  const result=await m.query.select("id,sender_id,recipient_id").or("sender_id.eq.owner,recipient_id.eq.owner").order("created_at",{ascending:false});
  assert.equal(result.error,null);
  assert.equal(m.sent[0].url.searchParams.get("or"),"(sender_id.eq.owner,recipient_id.eq.owner)");
});
