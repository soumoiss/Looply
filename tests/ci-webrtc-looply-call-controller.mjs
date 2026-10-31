// Chromium executes the PRODUCTION Looply call controller in two real pages.
// Signaling is injected in-memory because production auth credentials are not
// available in CI; microphone/camera, WebRTC, ICE and bidirectional RTP are real
// browser implementations using Chromium synthetic media devices.
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const room = "2f3e4d5c-1111-4111-8111-222233334444";
const users = ["ba38fc13-1234-4aaa-8123-1234567890ab","aa38fc13-1234-4aaa-8123-1234567890ac"];
const browser = await chromium.launch({headless:true,args:[
  "--no-sandbox","--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream","--autoplay-policy=no-user-gesture-required"
]});
const scenarios=[];
try {
  for(const mode of ["audio","video"]) {
    const context=await browser.newContext({permissions:["camera","microphone"]});
    const pages=[await context.newPage(),await context.newPage()];
    try {
      for(let index=0;index<2;index++) {
        const page=pages[index];
        page.on("console", msg => console.log("[peer "+index+"] "+msg.type()+": "+msg.text()));
        page.on("pageerror",error=>console.error("[peer "+index+"] page-error:",String(error)));
        await page.route("**/src/*.js*", async route => {
          const file = new URL(route.request().url()).pathname.split("/").at(-1);
          if(!["chat-calls.js","call-ice-gate.js","call-ringtone.js","icons.js","media-playback-coordinator.js"].includes(file)) {
            return route.abort();
          }
          const body = await readFile(new URL("../src/"+file,import.meta.url),"utf8");
          await route.fulfill({status:200,contentType:"text/javascript",body});
        });
        await page.route("**/webrtc-fixture",route=>route.fulfill({
          status:200,contentType:"text/html",
          body:'<!doctype html><meta charset=utf-8><div id="root"><header class="chat-thread-heading" data-chat-kind="direct" data-conversation-id="'+room+'"><strong>Contato</strong></header><button data-chat-send data-conversation-id="'+room+'">Enviar</button></div>'
        }));
        await page.exposeBinding("__relaySignal",async ({page:source},packet)=>{
          const recipient=pages.find(p=>p!==source);
          if(!recipient) return "error";
          await recipient.evaluate(packet => window.__receiveTestSignal?.(packet), packet);
          return "ok";
        });
        await page.goto("http://localhost:8765/webrtc-fixture");
        await page.evaluate(({userId,room})=>{
          const RTC=window.RTCPeerConnection;
          window.__testPeerConnections=[];
          window.RTCPeerConnection=class extends RTC {
            constructor(...args){super(...args);window.__testPeerConnections.push(this);}
          };
          const channel={
            ready:false,signal:null,
            on(kind,filter,fn){if(kind==="broadcast"&&filter?.event==="signal")this.signal=fn;return this;},
            subscribe(cb){this.ready=true;queueMicrotask(()=>cb("SUBSCRIBED"));return this;},
            async send(packet) {
              return window.__relaySignal({...packet.payload,senderId:userId,conversationId:room});
            },
            async unsubscribe(){this.ready=false;return "ok";}
          };
          window.__testChannel=channel;
          window.__receiveTestSignal=packet=>{
            if(channel.ready) return channel.signal?.({payload:packet});
          };
          window.__testClient={
            auth:{getSession:async()=>({data:{session:{access_token:"signed.mock.test.jwt"}}})},
            realtime:{setAuth:async()=>{}},
            channel:()=>channel,removeChannel:async()=>channel.unsubscribe()
          };
          window.__testUserId=userId;
        },{userId:users[index],room});
        await page.evaluate(async()=>{
          const {setupChatCalls}=await import("/src/chat-calls.js");
          setupChatCalls(document.querySelector("#root"),window.__testClient,window.__testUserId);
          document.querySelector("#root").dispatchEvent(new Event("looply:chat-rendered"));
        });
        await page.waitForSelector(mode==="audio"?"[data-call-audio]":"[data-call-video]");
      }
      // Both channels must subscribe before caller publishes the first offer.
      await Promise.all(pages.map(p=>p.waitForFunction(()=>Boolean(window.__receiveTestSignal))));
      await pages[0].click(mode==="audio"?"[data-call-audio]":"[data-call-video]");
      try {
        await pages[1].waitForSelector("[data-call-accept]",{state:"visible",timeout:16000});
      } catch(error) {
        const diagnostic=await Promise.all(pages.map(p=>p.evaluate(()=>({
          secure:window.isSecureContext,
          channelReady:window.__testChannel?.ready,
          peerCount:window.__testPeerConnections?.length,
          connectionStates:window.__testPeerConnections?.map(x=>({signaling:x.signalingState,ice:x.iceConnectionState})),
          toast:document.querySelector("[data-call-toast]")?.textContent,
          status:document.querySelector("[data-call-status]")?.textContent,
          content:document.querySelector("#root")?.innerText?.slice(0,500)
        }))));
        console.error("LOOPLY E2E missing incoming call diagnostic",JSON.stringify(diagnostic));
        throw error;
      }
      await pages[1].click("[data-call-accept]");
      await Promise.all(pages.map(page=>page.waitForFunction(
        ()=>window.__testPeerConnections?.some(pc=>pc.connectionState==="connected"),
        {timeout:20000}
      )));
      await pages[0].waitForTimeout(1600);
      const stats=await Promise.all(pages.map(p=>p.evaluate(async()=>{
        const peer=window.__testPeerConnections.at(-1);
        const rtc=Array.from((await peer.getStats()).values());
        const inbound=rtc.filter(item=>item.type==="inbound-rtp").map(item=>({
          kind:item.kind||item.mediaType,bytes:item.bytesReceived||0,
          frames:item.framesDecoded||0
        }));
        const tracks=Array.from(document.querySelector("[data-call-remote]")?.srcObject?.getTracks()||[])
          .map(track=>({kind:track.kind,readyState:track.readyState}));
        return {state:peer.connectionState,inbound,tracks};
      })));
      for(const [index,s] of stats.entries()){
        if(s.state!=="connected" || !s.inbound.some(t=>t.kind==="audio"&&t.bytes>0))
          throw Error("Peer "+index+" did not receive WebRTC audio: "+JSON.stringify(s));
        if(mode==="video" && !s.inbound.some(t=>t.kind==="video"&&t.bytes>0))
          throw Error("Peer "+index+" did not receive WebRTC video: "+JSON.stringify(s));
      }
      scenarios.push({mode,connected:true,stats});
      await pages[0].click("[data-call-hangup]");
    }finally{
      await context.close();
    }
  }
}finally{await browser.close();}
await mkdir("smoke-results/webrtc-controller",{recursive:true});
await writeFile("smoke-results/webrtc-controller/controller-proof.json",JSON.stringify({
  kind:"production-controller-real-chromium-rtp-with-test-signaling",scenarios
},null,2));
console.log("PRODUCTION LOOPLY CONTROLLER audio+video RTP verification:",JSON.stringify(scenarios));
