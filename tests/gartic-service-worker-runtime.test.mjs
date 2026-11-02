import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const source=await readFile(new URL("../sw.js",import.meta.url),"utf8");
const base="https://looply.test/Looply/";
const result=(name)=>({name,ok:true,type:"basic",clone(){return this;},headers:{get(){return "public,max-age=300";}}});

function createWorker({online=true}={}){
 const handlers={};
 const calls=[];
 const writes=[];
 const cached=result("stale");
 const cache={
  match:async()=>cached,
  put:async(req,res)=>{writes.push({url:req.url,name:res.name})}
 };
 const self={
  registration:{scope:base},
  location:{origin:"https://looply.test"},
  addEventListener(event,fn){handlers[event]=fn;}
 };
 runInNewContext(source,{
  self,URL,Promise,console,
  caches:{open:async()=>cache},
  fetch:async(req,opts)=>{
   calls.push({url:req.url,options:opts});
   if(!online)throw Error("offline");
   return result("fresh");
  },
  Response:{error:()=>result("offline-error")}
 });
 return {handlers,calls,writes,cache};
}
async function runFetch(worker,url,mode="cors"){
 let response;
 const event={
  request:{url:base+url,mode,method:"GET",cache:"default"},
  respondWith(p){response=p;},
  waitUntil(p){void p;}
 };
 worker.handlers.fetch(event);
 assert.ok(response,"intercepted request");
 return await response;
}

test("Active PWA fetch handler returns refreshed JS even if an old cached client exists",async()=>{
 const worker=createWorker();
 const reply=await runFetch(worker,"src/neon-production-client.js?build=obsolete");
 assert.equal(reply.name,"fresh");
 assert.equal(worker.calls.length,1);
 assert.equal(worker.calls[0].options.cache,"no-cache");
 assert.equal(worker.writes.length,1);
});
test("Chat HTML is fetched fresh and does not load an obsolete import graph",async()=>{
 const worker=createWorker();
 const reply=await runFetch(worker,"chat.html","navigate");
 assert.equal(reply.name,"fresh");
 assert.equal(worker.calls[0].options.cache,"no-cache");
});
test("Offline JS retains the last cached version rather than breaking the entire app",async()=>{
 const worker=createWorker({online:false});
 const reply=await runFetch(worker,"src/chat-gartic.js?build=older");
 assert.equal(reply.name,"stale");
});
test("Cached images avoid redundant network requests",async()=>{
 const worker=createWorker();
 const reply=await runFetch(worker,"assets/logo.png");
 assert.equal(reply.name,"stale");
 assert.equal(worker.calls.length,0);
});
