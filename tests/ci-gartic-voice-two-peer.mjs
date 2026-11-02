// Real Chromium-to-Chromium audio test of the production Gartic controller.
// Neon state is replaced by a deterministic mock; RTP and ICE are browser-real.
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const room="2f3e4d5c-1111-4111-8111-222233334444";
const users=["ba38fc13-1234-4aaa-8123-1234567890ab","aa38fc13-1234-4aaa-8123-1234567890ac"];
const gameId="2f3e4d5c-2222-4222-8222-222233334444";
const browser=await chromium.launch({headless:true,args:[
 "--no-sandbox","--use-fake-ui-for-media-stream",
 "--use-fake-device-for-media-stream","--autoplay-policy=no-user-gesture-required"
]});
const context=await browser.newContext({permissions:["camera","microphone"]});
const pages=[await context.newPage(),await context.newPage()];
try{
 for(let i=0;i<2;i++){
  const page=pages[i];
  page.on("pageerror",e=>console.error("[peer "+i+"] "+e));
  page.on("console",msg=>{if(msg.type()==="error")console.error("[peer "+i+"] "+msg.text());});
  await page.route("**/src/*.js*",async route=>{
   const name=new URL(route.request().url()).pathname.split("/").at(-1);
   if(!["chat-gartic.js","gartic-paint.js","gartic-viewport.js"].includes(name))return route.abort();
   const body=await readFile(new URL("../src/"+name,import.meta.url),"utf8");
   return route.fulfill({status:200,contentType:"text/javascript",body});
  });
  await page.route("**/g-fixture",route=>route.fulfill({status:200,contentType:"text/html",
   body:'<!doctype html><meta charset=utf-8><div id="root"><header class="chat-thread-heading" data-chat-kind="direct" data-conversation-id="'+room+'">Game</header><button data-v2-game>Games</button><div data-chat-v2-modal></div></div>'
  }));
  await page.route("https://ep-test.apirest.c-13.us-east-1.aws.neon.tech/**",route=>{
   const state={
    gameId,conversationId:room,status:"waiting",hostId:users[0],
    category:"animais",duration:75,cycles:2,turn:0,drawerId:null,masked:"",word:null,
    serverNow:new Date().toISOString(),updatedAt:new Date().toISOString(),
    players:users.map((id,j)=>({id,name:"Jogador "+j,username:"jogador"+j,avatarPath:null,score:0})),
    invites:[],chat:[],strokes:[],correct:[],inviteStatus:"accepted"
   };
   route.fulfill({status:200,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization,content-type","content-type":"application/json"},body:JSON.stringify(state)});
  });
  await page.exposeBinding("__relayGartic",async({page:source},packet)=>{
   const target=pages.find(p=>p!==source);
   if(!target)return "error";
   await target.evaluate(msg=>window.__receiveGartic?.(msg),packet);
   return "ok";
  });
  await page.goto("http://localhost:8765/g-fixture");
  await page.evaluate(async ({userId,room})=>{
   const RTC=window.RTCPeerConnection;
   window.__testPeers=[];
   window.RTCPeerConnection=class extends RTC{
     constructor(...args){super(...args);window.__testPeers.push(this);}
   };
   let receive=null;
   window.__receiveGartic=packet=>receive?.({payload:packet});
   const client={
    dataApiUrl:"https://ep-test.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1",
    auth:{getSession:async()=>({data:{session:{access_token:"signed.mock.test.jwt"}}})},
    channel:()=>({
      on(_kind,filter,handler){if(filter?.event==="ttt")receive=handler;return this;},
      subscribe(cb){queueMicrotask(()=>cb("SUBSCRIBED"));return this;},
      async send(message){return window.__relayGartic({...message.payload,senderId:userId});},
      async unsubscribe(){}
    }),async removeChannel(){}
   };
   const {setupChatGartic}=await import("/src/chat-gartic.js");
   window.__game=setupChatGartic({
     root:document.querySelector("#root"),client,userId,selectedConversation:()=>room,
     openModal:html=>{document.querySelector("[data-chat-v2-modal]").innerHTML=html;},
     closeModal:()=>{},toast:message=>console.log("toast",message),
     openTtt:async()=>{}
   });
   await window.__game.handleClick(document.querySelector("[data-v2-game]"));
   await window.__game.handleClick(document.querySelector('[data-gartic-action="gartic"]'));
  },{userId:users[i],room});
  await page.waitForSelector('[data-gartic-action="join-voice"]');
  await page.waitForSelector('[data-gartic-chat] input');
  // The game input must remain editable and send through Neon without needing
  // the global game-action lock.
  await page.evaluate(()=>{
    window.__chatSendRequest=false;
    const original=window.fetch;
    window.fetch=(url,options)=>{
      try{
        const request=JSON.parse(options?.body||"{}");
        if(request.p_action==="chat")window.__chatSendRequest=request.p_value;
      }catch{}
      return original(url,options);
    };
  });
  await page.locator("[data-gartic-chat] input").fill("Olá, partida!");
  await page.evaluate(async()=>{
    const form=document.querySelector("[data-gartic-chat]");
    await window.__game.handleSubmit({target:form,preventDefault(){},stopPropagation(){}});
  });
  await page.waitForFunction(()=>window.__chatSendRequest==="Olá, partida!",null,{timeout:9000});
 }
 for(let i=0;i<2;i++)
   await pages[i].evaluate(async()=>window.__game.handleClick(document.querySelector('[data-gartic-action="join-voice"]')));
 // Only peer zero is allowed to open its microphone. Peer one must still hear.
 await pages[0].evaluate(async()=>window.__game.handleClick(document.querySelector('[data-gartic-action="mute"]')));
 for(const page of pages){
  await page.waitForFunction(()=>window.__testPeers.some(pc=>pc.connectionState==="connected"),null,{timeout:23000});
 }
 const incoming=async page=>page.evaluate(async()=>{
   const pc=window.__testPeers.find(x=>x.connectionState==="connected");
   const stats=[...(await pc.getStats()).values()];
   return {state:pc.connectionState,bytes:stats.filter(x=>x.type==="inbound-rtp"&&
     (x.kind||x.mediaType)==="audio").reduce((n,x)=>n+(x.bytesReceived||0),0)};
 });
 await pages[1].waitForFunction(async()=>{
   const pc=window.__testPeers.find(x=>x.connectionState==="connected");
   if(!pc)return false;
   const stats=[...(await pc.getStats()).values()];
   return stats.some(x=>x.type==="inbound-rtp"&&(x.kind||x.mediaType)==="audio"&&(x.bytesReceived||0)>0);
 },null,{timeout:24000});
 const listenResult=await incoming(pages[1]);
 if(listenResult.bytes<=0)throw Error("Listen-only peer received no audio");
 console.log("Gartic listen-only RTP",listenResult);

 // Now allow the listener to transmit; both peers must receive audio.
 await pages[1].evaluate(async()=>window.__game.handleClick(document.querySelector('[data-gartic-action="mute"]')));
 for(let i=0;i<2;i++){
  await pages[i].waitForFunction(async()=>{
    const pc=window.__testPeers.find(x=>x.connectionState==="connected");
    if(!pc)return false;
    const stats=[...(await pc.getStats()).values()];
    return stats.some(x=>x.type==="inbound-rtp"&&(x.kind||x.mediaType)==="audio"&&(x.bytesReceived||0)>0);
  },null,{timeout:24000});
  const results=await incoming(pages[i]);
  console.log("Gartic RTP peer "+i,results);
 }
}finally{await context.close();await browser.close();}
