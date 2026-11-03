// Real Chromium-to-Chromium audio test of the production Gartic controller.
// Neon state is replaced by a deterministic mock; RTP and ICE are browser-real.
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const room="2f3e4d5c-1111-4111-8111-222233334444";
const ordered=["ba38fc13-1234-4aaa-8123-1234567890ab","aa38fc13-1234-4aaa-8123-1234567890ac"];
const users=process.env.GARTIC_REVERSE_PEERS==="1"?[...ordered].reverse():ordered;
const gameId="2f3e4d5c-2222-4222-8222-222233334444";
const browser=await chromium.launch({headless:true,args:[
 "--no-sandbox","--use-fake-ui-for-media-stream",
 "--use-fake-device-for-media-stream","--autoplay-policy=no-user-gesture-required"
]});
const context=await browser.newContext({permissions:["camera","microphone"]});
const pages=[await context.newPage(),await context.newPage()];
const savedMessages=[];
let droppedFirstOffer=false;
try{
 for(let i=0;i<2;i++){
  const page=pages[i];
  page.on("pageerror",e=>console.error("[peer "+i+"] "+e));
  page.on("console",msg=>{if(["error","warning"].includes(msg.type()))console.error("[peer "+i+"] "+msg.text());});
  await page.route("**/src/*.js*",async route=>{
   const name=new URL(route.request().url()).pathname.split("/").at(-1);
   if(!["chat-gartic.js","gartic-paint.js","gartic-viewport.js"].includes(name))return route.abort();
   const body=await readFile(new URL("../src/"+name,import.meta.url),"utf8");
   return route.fulfill({status:200,contentType:"text/javascript",body});
  });
  await page.route("**/g-fixture",route=>route.fulfill({status:200,contentType:"text/html",
   body:'<!doctype html><meta charset=utf-8><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/chat-gartic.css"><body class="page-chat"><div id="root"><header class="chat-thread-heading" data-chat-kind="direct" data-conversation-id="'+room+'">Game</header><button data-v2-game>Games</button><div data-chat-v2-modal class="chat-v2-modal-backdrop"><section class="chat-v2-modal"><div data-v2-modal-content></div></section></div></div></body>'
  }));
  await page.route("**/chat-gartic.css",async route=>route.fulfill({status:200,contentType:"text/css",
    body:await readFile(new URL("../assets/css/pages/chat-gartic.css",import.meta.url),"utf8")}));
  await page.route("https://ep-test.apirest.c-13.us-east-1.aws.neon.tech/**",route=>{
   const request=route.request().postDataJSON?.();
   if(request?.p_action==="chat")savedMessages.push({
     id:savedMessages.length+1,userId:users[i],name:"Jogador "+i,
     body:request.p_value,at:new Date().toISOString()
   });
   const state={
    gameId,conversationId:room,status:"waiting",hostId:users[0],
    category:"animais",duration:75,cycles:2,turn:0,drawerId:null,masked:"",word:null,
    serverNow:new Date().toISOString(),updatedAt:new Date().toISOString(),
    players:users.map((id,j)=>({id,name:"Jogador "+j,username:"jogador"+j,avatarPath:null,score:0})),
    invites:[],chat:[...savedMessages],strokes:[],correct:[],inviteStatus:"accepted"
   };
   route.fulfill({status:200,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization,content-type","content-type":"application/json"},body:JSON.stringify(state)});
  });
  await page.exposeBinding("__relayGartic",async({page:source},packet)=>{
   if(process.env.GARTIC_DROP_FIRST_OFFER==="1" && !droppedFirstOffer &&
      packet.kind==="voice-signal" && packet.signal?.type==="offer"){
     droppedFirstOffer=true;
     return "ok";
   }
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
     openModal:html=>{document.querySelector("[data-v2-modal-content]").innerHTML=html;},
     closeModal:()=>{},toast:message=>console.log("toast",message),
     openTtt:async()=>{}
   });
   await window.__game.handleClick(document.querySelector("[data-v2-game]"));
   await window.__game.handleClick(document.querySelector('[data-gartic-action="gartic"]'));
  },{userId:users[i],room});
  await page.waitForSelector('[data-gartic-action="mute"]');
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
 await pages[0].locator('[data-gartic-chat] input').fill('Mensagem em tempo real');
 await pages[0].evaluate(async()=>{
   const form=document.querySelector('[data-gartic-chat]');
   await window.__game.handleSubmit({target:form,preventDefault(){},stopPropagation(){}});
 });
 await pages[1].locator('.gartic-chat-list').getByText('Mensagem em tempo real').waitFor({timeout:3000});
 if(await pages[1].locator('.gartic-chat-list').getByText('Mensagem em tempo real').count()!==1)
   throw Error('Chat message was duplicated in the receiving room');
 await pages[1].setViewportSize({width:375,height:812});
 const mobile=await pages[1].evaluate(()=>({
   viewport:innerWidth,
   shell:document.querySelector('[data-looply-gartic]').getBoundingClientRect().width,
   modal:document.querySelector('.chat-v2-modal').getBoundingClientRect().width,
   chat:document.querySelector('.gartic-chat').getBoundingClientRect().width,
   mic:document.querySelector('[data-gartic-action="mute"]').getBoundingClientRect().width
 }));
 if(mobile.modal>mobile.viewport+1 || mobile.shell>mobile.viewport+1 ||
    mobile.chat>mobile.viewport+1 || mobile.mic<40)
   throw Error('Gartic controls overflow the mobile viewport: '+JSON.stringify(mobile));
 await pages[1].evaluate(()=>{
   window.__originalGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   window.__listenerMicRequests=0;
   navigator.mediaDevices.getUserMedia=()=>{
     window.__listenerMicRequests++;
     throw Error('Listener must not request microphone access');
   };
 });
 // Only peer zero is allowed to open its microphone. Peer one must still hear.
 await pages[0].evaluate(async()=>window.__game.handleClick(document.querySelector('[data-gartic-action="mute"]')));
 for(const page of pages){
  await page.waitForFunction(()=>window.__testPeers.some(pc=>pc.connectionState==="connected"),null,{timeout:23000});
 }
 const incoming=async page=>page.evaluate(async()=>{
   const peers=window.__testPeers.filter(x=>x.connectionState==="connected");
   const all=await Promise.all(peers.map(async pc=>{
     const stats=[...(await pc.getStats()).values()];
     return {state:pc.connectionState,
       negotiated:pc.getTransceivers().map(t=>({direction:t.direction,current:t.currentDirection,
         sending:Boolean(t.sender.track),receiving:t.receiver.track.readyState})),
       bytes:stats.filter(x=>x.type==="inbound-rtp"&&
         (x.kind||x.mediaType)==="audio").reduce((n,x)=>n+(x.bytesReceived||0),0)};
   }));
   return {state:peers[0]?.connectionState||"none",bytes:all.reduce((n,p)=>n+p.bytes,0),peers:all};
 });
 let firstReceive=false;
 for(let attempt=0;attempt<40;attempt++){
   await pages[1].waitForTimeout(350);
   if((await incoming(pages[1])).bytes>0){firstReceive=true;break;}
 }
 const senderState=await incoming(pages[0]);
 console.log("Microphone sender diagnostics",JSON.stringify(senderState));
 const listenResult=await incoming(pages[1]);
 console.log("Listen-only RTP diagnostics",JSON.stringify(listenResult));
 if(listenResult.bytes<=0)throw Error("Listen-only peer received no audio");
 if(await pages[1].evaluate(()=>window.__listenerMicRequests)!==0)
   throw Error('Listener requested microphone permission');
 if(!await pages[1].evaluate(()=>[...document.querySelectorAll('[data-gartic-remote-audio]')].some(a=>!a.paused)))
   throw Error('Remote audio element did not play');
 if(await pages[1].locator('[data-gartic-action="mute"]').textContent()!=='Ativar microfone')
   throw Error('Listener microphone was activated without permission');
 await pages[0].evaluate(async()=>window.__game.handleClick(document.querySelector('[data-gartic-action="mute"]')));
 if(await pages[0].locator('[data-gartic-action="mute"]').textContent()!=='Ativar microfone' ||
    await pages[0].evaluate(()=>window.__testPeers.some(pc=>pc.getSenders().some(s=>s.track?.enabled))))
   throw Error('Microphone did not deactivate');
 await pages[0].evaluate(async()=>window.__game.handleClick(document.querySelector('[data-gartic-action="mute"]')));
 if(await pages[0].locator('[data-gartic-action="mute"]').textContent()!=='Desativar microfone' ||
    !await pages[0].evaluate(()=>window.__testPeers.some(pc=>pc.getSenders().some(s=>s.track?.enabled))))
   throw Error('Microphone did not reactivate');
 console.log("Gartic listen-only RTP",listenResult);

 // Now allow the listener to transmit; both peers must receive audio.
 await pages[1].evaluate(()=>{navigator.mediaDevices.getUserMedia=window.__originalGetUserMedia;});
 await pages[1].evaluate(async()=>window.__game.handleClick(document.querySelector('[data-gartic-action="mute"]')));
 for(let i=0;i<2;i++){
  let results;
  for(let attempt=0;attempt<60;attempt++){
    results=await incoming(pages[i]);
    if(results.bytes>0)break;
    await pages[i].waitForTimeout(300);
  }
  console.log("Gartic RTP peer "+i,JSON.stringify(results));
  if(results.bytes<=0)throw Error("Peer "+i+" received no return audio");
 }
}finally{await context.close();await browser.close();}
