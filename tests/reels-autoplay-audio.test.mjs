import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=path=>readFileSync(fileURLToPath(new URL("../"+path,import.meta.url)),"utf8");
const source=read("src/home-hybrid-reels.js");
const native=read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
const inject=native.match(/val script = """([\s\S]*?)"""\.trimIndent\(\)/)?.[1]?.trim();
test("instala script exclusivamente no iframe oficial do Instagram e já permite mídia sem gesto Android",()=>{
 assert.ok(inject?.includes("looply:reels-media"),"android injection script missing");
 assert.doesNotThrow(()=>new Function(inject));
 assert.match(native,/WebViewFeature\.isFeatureSupported\(WebViewFeature\.DOCUMENT_START_SCRIPT\)/);
 assert.match(native,/WebViewCompat\.addDocumentStartJavaScript\(/);
 assert.match(native,/setOf\("https:\/\/www\.instagram\.com"\)/);
 assert.match(native,/mediaPlaybackRequiresUserGesture = false/);
 assert.ok(native.indexOf("installInstagramReelAutoplayAdapter()")<native.indexOf("webView.webViewClient ="));
 assert.match(inject,/\/embed/);
});
function runInjected(pathname){
 const handlers={};
 let count=0,pauses=0;
 const video={
   paused:true,muted:true,defaultMuted:true,volume:0,autoplay:false,playsInline:false,
   addEventListener(){},play(){count++;this.paused=false;return Promise.resolve();},
   pause(){pauses++;this.paused=true;}
 };
 const document={hidden:false,querySelectorAll:()=>[video],addEventListener(){}};
 const window={parent:{},addEventListener:(event,fn)=>{handlers[event]=fn;}};
 function MutationObserver(fn){this.observe=()=>{};}
 new Function("document","location","window","MutationObserver",inject)(document,{pathname},window,MutationObserver);
 const send=(action,origin="https://soumoiss.github.io",source=window.parent)=>{
   handlers.message?.({origin,source,data:{type:"looply:reels-media",action}});
 };
 return {send,video,read:()=>({plays:count,pauses}),handlers};
}
test("Instagram WebView: play/unMute habilita som e autoplay, pause interrompe ao deslizar",()=>{
 const player=runInjected("/reel/C1abcd/embed/");
 assert.equal(typeof player.handlers.message,"function");
 player.send("play");
 assert.equal(player.read().plays,1);
 assert.equal(player.video.muted,false);
 assert.equal(player.video.defaultMuted,false);
 assert.equal(player.video.autoplay,true);
 assert.equal(player.video.volume,1);
 player.send("mute");
 assert.equal(player.video.muted,true);
 player.send("unMute");
 assert.equal(player.video.muted,false);
 player.send("pause");
 assert.equal(player.video.paused,true);
 assert.ok(player.read().pauses>=1);
});
test("Instagram WebView: comandos apenas do Looply, injeção inerte fora de /embed",()=>{
 const p=runInjected("/reel/ABC/embed/");
 p.send("play","https://evil.example");
 assert.equal(p.read().plays,0);
 p.send("play","https://soumoiss.github.io",{});
 assert.equal(p.read().plays,0);
 const other=runInjected("/accounts/login/");
 assert.equal(other.handlers.message,undefined);
});
const code=source.replaceAll("export function ","function ");
const getHelpers=new Function("URL","location",code+";return {activeEmbedUrl,commandEmbeddedPlayer};");
const {activeEmbedUrl,commandEmbeddedPlayer}=getHelpers(URL,{origin:"https://soumoiss.github.io",protocol:"https:",href:"https://soumoiss.github.io/Looply/reels.html"});
function frame(src){
 const sent=[];
 return {sent,getAttribute:k=>k==="src"?src:null,contentWindow:{postMessage:(payload,origin)=>sent.push({payload,origin})}};
}
test("Instagram: hospedeiro entrega evento playback ao adapter origin-scoped do APK",()=>{
 const f=frame("https://www.instagram.com/reel/Cabcdef/embed/");
 assert.equal(commandEmbeddedPlayer(f,"unMute"),true);
 assert.equal(commandEmbeddedPlayer(f,"play"),true);
 assert.deepEqual(f.sent,[{payload:{type:"looply:reels-media",action:"unMute"},origin:"https://www.instagram.com"},{payload:{type:"looply:reels-media",action:"play"},origin:"https://www.instagram.com"}]);
 assert.equal(commandEmbeddedPlayer(frame("https://malicious.com/a"),"play"),false);
 assert.equal(activeEmbedUrl("https://www.instagram.com/reel/ABC/embed/"),"https://www.instagram.com/reel/ABC/embed/");
});
test("TikTok e YouTube: embed carrega com autoplay sem mute forçado e aceita API play/pause",()=>{
 const tt=new URL(activeEmbedUrl("https://www.tiktok.com/player/v1/123?muted=1"));
 assert.equal(tt.searchParams.get("autoplay"),"1");
 assert.equal(tt.searchParams.get("muted"),"0");
 assert.equal(tt.searchParams.get("force_muted"),"0");
 assert.equal(tt.searchParams.get("loop"),"1");
 const yt=new URL(activeEmbedUrl("https://www.youtube-nocookie.com/embed/abc123"));
 assert.equal(yt.searchParams.get("autoplay"),"1");
 assert.equal(yt.searchParams.get("enablejsapi"),"1");
 assert.equal(yt.searchParams.get("mute"),"0");
 assert.equal(yt.searchParams.get("origin"),"https://soumoiss.github.io");
 const t=frame(tt.toString()),y=frame(yt.toString());
 assert.ok(commandEmbeddedPlayer(t,"play"));
 assert.deepEqual(t.sent[0].payload,{"x-tiktok-player":true,type:"play",value:null});
 assert.ok(commandEmbeddedPlayer(y,"play"));
 assert.equal(JSON.parse(y.sent[0].payload).func,"playVideo");
});
test("Reels sempre iniciam com intenção de som e interrompem frames anteriores",()=>{
 assert.match(source,/let activeIndex = -1, soundOn = true/);
 assert.match(source,/oldFrame\.src="about:blank"/);
 assert.match(source,/for\(let i=0;i<slides\.length;i\+\+\)/);
 assert.match(source,/frame\.removeAttribute\("src"\)/);
 assert.match(source,/document\.addEventListener\("visibilitychange",onVisibility\)/);
});
