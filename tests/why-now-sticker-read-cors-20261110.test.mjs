import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import handler from "../backend/neon-storage/index.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const file="22222222-2222-4222-8222-222222222222";
const storagePath="stickers/"+owner+"/"+file+".webp";
const origin="https://soumoiss.github.io";
const uri="https://looplystorage.example/storage/read";
const previous=Object.fromEntries(["NEON_DATA_API_URL","AWS_ENDPOINT_URL_S3",
  "AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY","AWS_REGION"].map(k=>[k,process.env[k]]));
function setup({allowed=true}={}){
  Object.assign(process.env,{
    NEON_DATA_API_URL:"https://data.example/rest/v1",
    AWS_ENDPOINT_URL_S3:"https://r2.example/account",
    AWS_ACCESS_KEY_ID:"test-access",
    AWS_SECRET_ACCESS_KEY:"test-secret",
    AWS_REGION:"auto",
  });
  const calls=[];
  globalThis.fetch=async (url,options={})=>{
    calls.push({url:String(url),method:options.method||"GET"});
    if(String(url).includes("/v3_self_profile?"))
      return Response.json([{id:owner}]);
    if(String(url).includes("/sticker_catalog?"))
      return Response.json(allowed?[{id:file}]:[]);
    if(String(url).startsWith("https://r2.example/")){
      const bytes=new Uint8Array([82,73,70,70,12,0,0,0,87,69,66,80,86,80,56,32]);
      return new Response(bytes,{status:200,headers:{"content-type":"image/webp","content-length":String(bytes.byteLength)}});
    }
    throw Error("Unexpected network: "+String(url));
  };
  return calls;
}
const originalFetch=globalThis.fetch;
const request=(path=storagePath,bucket="looply-stickers",domain=origin,authorization="Bearer token")=>
  new Request(uri,{method:"POST",headers:{
    "origin":domain,"authorization":authorization,"content-type":"application/json",
    "x-looply-bucket":bucket,"x-looply-path":path
  },body:"{}"});

test("private WebP is read through RLS-checked same-origin CORS gateway",async()=>{
  const calls=setup();
  try {
    const response=await handler.fetch(request());
    assert.equal(response.status,200,await response.clone().text());
    assert.equal(response.headers.get("access-control-allow-origin"),origin);
    assert.equal(response.headers.get("cache-control"),"private, no-store");
    assert.equal(response.headers.get("x-content-type-options"),"nosniff");
    assert.equal(response.headers.get("content-type"),"image/webp");
    assert.equal((await response.arrayBuffer()).byteLength,16);
    assert.ok(calls.some(c=>c.url.includes("/sticker_catalog?")));
    assert.ok(calls.some(c=>c.url.startsWith("https://r2.example/")));
  }finally{globalThis.fetch=originalFetch;}
});
test("non-visible sticker cannot be downloaded and never reaches R2",async()=>{
  const calls=setup({allowed:false});
  try {
    const response=await handler.fetch(request());
    assert.equal(response.status,403);
    assert.equal((await response.json()).error,"object_not_visible");
    assert.ok(!calls.some(c=>c.url.startsWith("https://r2.example/")));
  }finally{globalThis.fetch=originalFetch;}
});
test("invalid bucket, arbitrary URL, missing token and foreign Origin are denied",async()=>{
  setup();
  try{
    for(const [path,bucket,domain,token,status] of [
      [storagePath,"looply-media",origin,"Bearer token",400],
      ["https://evil.example/cat.webp","looply-stickers",origin,"Bearer token",400],
      [storagePath,"looply-stickers",origin,"",401],
      [storagePath,"looply-stickers","https://evil.example","Bearer token",403]
    ]){
      const response=await handler.fetch(request(path,bucket,domain,token));
      assert.equal(response.status,status);
    }
  }finally{globalThis.fetch=originalFetch;}
});
test("editor uses authenticated Blob handoff, never remote signed R2 fetch",()=>{
  const ui=readFileSync(new URL("../src/why-now-editor-premium.js",import.meta.url),"utf8");
  const parent=readFileSync(new URL("../src/why-now-integration.js",import.meta.url),"utf8");
  const embedded=readFileSync(new URL("../src/why-now-embedded.js",import.meta.url),"utf8");
  assert.match(ui,/whyNowStickerBridge\("sticker-image",\{id:row\.id\}\)/);
  assert.doesNotMatch(ui,/fetch\(row\.src,\{mode:"cors"/);
  assert.match(parent,/stickerImage\(_ignored,payload\)/);
  assert.match(parent,/neonFunctionsBase\+"\/storage\/read"/);
  assert.match(parent,/client\.from\("sticker_catalog"\)/);
  assert.match(embedded,/"sticker-image"/);
  assert.match(readFileSync(new URL("../why-now.html",import.meta.url),"utf8"),
    /why-now-editor-premium\.js\?v=20261110-sticker-read-fix/);
});
for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
