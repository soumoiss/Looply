// Automated Chromium WebRTC call across two browser tabs with actual
// ICE/SDP negotiation and synthetic camera/microphone devices.
// Tests the browser/WebRTC transport, not Neon-authenticated Looply signaling.
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";

const browser=await chromium.launch({headless:true,args:[
  "--no-sandbox","--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream","--autoplay-policy=no-user-gesture-required"
]});
const evidence={kind:"real-webrtc-2-tabs-fake-camera-mic",scenarios:[]};
try{
  for(const mode of ["audio","video"]){
    const context=await browser.newContext({
      permissions:["camera","microphone"],ignoreHTTPSErrors:true
    });
    const pages=await Promise.all([context.newPage(),context.newPage()]);
    for(const page of pages){
      await page.route("http://localhost:8765/webrtc-fixture",route=>
        route.fulfill({status:200,contentType:"text/html",
          body:"<!doctype html><meta charset=utf-8><title>Looply RTC transport test</title>"}));
      await page.goto("http://localhost:8765/webrtc-fixture");
    }
    const teardown=async()=>{
      for(const p of pages) await p.evaluate(()=>{
        window._looplyTestStream?.getTracks().forEach(t=>t.stop());
        window._looplyTestPeer?.close();
      }).catch(()=>{});
      await context.close();
    };
    try{
      await Promise.all(pages.map(p=>p.evaluate(async mode=>{
        window._looplyTestStream=await navigator.mediaDevices.getUserMedia({
          audio:true,video:mode==="video"
        });
        window._looplyTestPeer=new RTCPeerConnection({iceServers:[]});
        for(const track of window._looplyTestStream.getTracks())
          window._looplyTestPeer.addTrack(track,window._looplyTestStream);
        window._remoteTracks=[];
        window._looplyTestPeer.ontrack=e=>window._remoteTracks.push(e.track);
        window._candidateQueue=[];
        window._looplyTestPeer.onicecandidate=e=>{
          if(e.candidate)window._candidateQueue.push(e.candidate.toJSON());
        };
        return window._looplyTestStream.getTracks().map(t=>({kind:t.kind,ready:t.readyState}));
      },mode)));
      const offer=await pages[0].evaluate(async()=>{
        const pc=window._looplyTestPeer;const offer=await pc.createOffer();
        await pc.setLocalDescription(offer);
        return {type:pc.localDescription.type,sdp:pc.localDescription.sdp};
      });
      const answer=await pages[1].evaluate(async offer=>{
        const pc=window._looplyTestPeer;
        await pc.setRemoteDescription(offer);
        const answer=await pc.createAnswer();
        await pc.setLocalDescription(answer);
        return {type:pc.localDescription.type,sdp:pc.localDescription.sdp};
      },offer);
      await pages[0].evaluate(async answer=>window._looplyTestPeer.setRemoteDescription(answer),answer);
      const start=Date.now();
      let connected=false;
      while(Date.now()-start<17000){
        const candidates=await Promise.all(pages.map(p=>p.evaluate(()=>{
          const c=window._candidateQueue.splice(0);return c;
        })));
        for(const c of candidates[0]){
          await pages[1].evaluate(candidate=>window._looplyTestPeer.addIceCandidate(candidate),c);
        }
        for(const c of candidates[1]){
          await pages[0].evaluate(candidate=>window._looplyTestPeer.addIceCandidate(candidate),c);
        }
        const states=await Promise.all(pages.map(p=>p.evaluate(()=>{
          const pc=window._looplyTestPeer;return {
            state:pc.connectionState,ice:pc.iceConnectionState,
            tracks:window._remoteTracks.map(t=>({kind:t.kind,state:t.readyState,muted:t.muted}))
          };
        })));
        if(states.every(s=>s.state==="connected" &&
          s.tracks.some(t=>t.kind==="audio"&&t.state==="live") &&
          (mode==="audio"||s.tracks.some(t=>t.kind==="video"&&t.state==="live")))){
          connected=true;break;
        }
        await new Promise(r=>setTimeout(r,180));
      }
      if(!connected)throw Error("SDP/ICE transport did not connect for "+mode);
      await new Promise(r=>setTimeout(r,1600));
      const stats=await Promise.all(pages.map(p=>p.evaluate(async()=>{
        const pc=window._looplyTestPeer;
        const entries=[...(await pc.getStats()).values()];
        const outgoing=entries.filter(s=>s.type==="outbound-rtp").map(s=>({
          kind:s.kind||s.mediaType,bytesSent:s.bytesSent||0,framesEncoded:s.framesEncoded||0
        }));
        const incoming=entries.filter(s=>s.type==="inbound-rtp").map(s=>({
          kind:s.kind||s.mediaType,bytesReceived:s.bytesReceived||0,framesDecoded:s.framesDecoded||0
        }));
        return {state:pc.connectionState,outgoing,incoming};
      })));
      for(const [i,stat] of stats.entries()){
        if(!stat.incoming.some(s=>s.kind==="audio"&&s.bytesReceived>0))
          throw Error("Peer "+i+" did not receive encoded audio on "+mode+" call: "+JSON.stringify(stat));
        if(mode==="video"&&!stat.incoming.some(s=>s.kind==="video"&&s.bytesReceived>0))
          throw Error("Peer "+i+" did not receive encoded video on video call: "+JSON.stringify(stat));
      }
      evidence.scenarios.push({mode,connected:true,elapsedMs:Date.now()-start,stats});
    }finally{await teardown();}
  }
}finally{await browser.close();}
await mkdir("smoke-results/webrtc",{recursive:true});
await writeFile("smoke-results/webrtc/rtc-proof.json",JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
