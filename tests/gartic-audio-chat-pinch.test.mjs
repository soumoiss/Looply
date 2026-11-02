import test from "node:test";
import assert from "node:assert/strict";
import {computeGarticViewport,attachGarticViewport,clampGarticZoom} from "../src/gartic-viewport.js";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Gartic pinch keeps the touched canvas location anchored while scaling",()=>{
 const output=computeGarticViewport({scale:1,x:0,y:0},
  {x:150,y:120,distance:100},{x:200,y:120,distance:200},400,260);
 assert.equal(output.scale,2);
 assert.equal(output.x,-100);
 assert.equal(output.y,-120);
 assert.equal(clampGarticZoom(99),5);
 assert.equal(clampGarticZoom(.05),1);
});
test("Two-finger pinch must cancel painting, allow pan and preserve draw coordinates",()=>{
 const state={scale:1,x:0,y:0},events=new Map(),viewportEvents=new Map(),strokes=[];
 const viewport={
  clientWidth:400,clientHeight:260,
  getBoundingClientRect:()=>({left:0,top:0,width:400,height:260}),
  querySelector:()=>null,
  addEventListener:(type,cb)=>viewportEvents.set(type,cb),
  removeEventListener:(type)=>viewportEvents.delete(type)
 };
 const canvas={
  parentElement:viewport,style:{},
  getBoundingClientRect:()=>({left:state.x,top:state.y,width:400*state.scale,height:260*state.scale}),
  setPointerCapture(){},
  addEventListener:(type,cb)=>events.set(type,cb),
  removeEventListener:(type)=>events.delete(type)
 };
 let draft=null;
 const controller=attachGarticViewport(canvas,{
  state,canDraw:()=>true,currentTool:()=>"pen",
  onPreview:stroke=>{draft=stroke;},onCommit:stroke=>strokes.push(stroke)
 });
 const call=(type,id,x,y)=>{
  const e={type,pointerId:id,pointerType:"touch",clientX:x,clientY:y,button:0,
   preventDefault(){}};
  events.get(type)(e);
 };
 call("pointerdown",1,100,120);
 assert.ok(draft);
 call("pointerdown",2,200,120);
 assert.equal(draft,null);
 call("pointermove",2,300,120);
 assert.equal(state.scale,2);
 assert.equal(strokes.length,0);
 call("pointerup",1,100,120);
 call("pointerup",2,300,120);
 call("pointerdown",3,140,130);
 call("pointermove",3,180,140);
 call("pointerup",3,180,140);
 assert.equal(strokes.length,1);
 assert.ok(strokes[0].points.length>=2);
 controller.reset();assert.equal(state.scale,1);
 controller.destroy();
 assert.equal(events.size,0);
});
test("Gartic one-way voice never requests microphone just to listen",async()=>{
 const src=await read("src/chat-gartic.js");
 assert.match(src,/function startVoiceListening\(\)/);
 const listenSection=src.split("function startVoiceListening(){")[1].split("async function joinVoice()")[0];
 assert.doesNotMatch(listenSection,/getUserMedia/);
 assert.match(src,/addTransceiver\("audio",\{direction:voiceStream&&!voiceMuted\?"sendrecv":"recvonly"\}\)/);
 assert.match(src,/async function toggleMicrophone\(\)/);
 assert.match(src,/replaceTrack\(track\)/);
});
test("Chat sends without perform() global lock and does not drop drafts",async()=>{
 const src=await read("src/chat-gartic.js");
 const section=src.split('if(form.matches("[data-gartic-chat]")){')[1].split('return true;',2)[0];
 assert.match(src,/chatBusy=true/);
 assert.match(src,/await rpc\("chat",text\)/);
 assert.match(src,/if\(input\.isConnected && input\.value\.trim\(\)===text\)input\.value=""/);
 assert.match(src,/Mensagem não enviada\. Tente novamente/);
});
