import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dedupeStorySongRecordings,sameStoryRecording,songRecordingIdentity} from "../src/story-music-dedupe.js";
import {normalizeStorySong,encodeStorySong,decodeStorySong,searchStorySongs,audiusStoryStreamUrl} from "../src/story-music-catalog.js";
import {storyMusicCanPublish,openStoryMusicPicker} from "../src/story-music-picker.js";
import worker from "../backend/story-music-discovery/worker.mjs";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const recording=(provider,id,title="Coração Aberto",artist="Banda Azul",durationSec=212,other={})=>({
 provider,id,title,artist,durationSec,album:"Disco Azul",kind:"catalog",
 url:provider==="apple"?"https://music.apple.com/br/song/"+id:
    provider==="deezer"?"https://www.deezer.com/track/"+id:"https://audius.co/banda/song",
 ...other
});
test("same recording from Apple, Deezer and Audius collapses into one distinct, streamable result",()=>{
 const apple=normalizeStorySong(recording("apple","100"));
 const deezer=normalizeStorySong(recording("deezer","200"));
 const audius=normalizeStorySong(recording("audius","AbC123"));
 const combined=dedupeStorySongRecordings([apple,deezer,audius]);
 assert.equal(combined.length,1);
 assert.equal(combined[0].provider,"audius");
 assert.equal(combined[0].id,"AbC123");
 assert.equal(storyMusicCanPublish(combined[0]),true);
});
test("recording identity preserves artists, live/acoustic versions and significantly different durations",()=>{
 const base=recording("apple","1","Na Estrada","Cantora",190);
 const otherArtist=recording("deezer","2","Na Estrada","Outro cantor",190);
 const live=recording("deezer","3","Na Estrada (Live)","Cantora",190);
 const acoustic=recording("audius","4","Na Estrada (Acoustic)","Cantora",190);
 const studioDifferentDuration=recording("deezer","5","Na Estrada","Cantora",223);
 const originals=dedupeStorySongRecordings([base,otherArtist,live,acoustic,studioDifferentDuration]);
 assert.equal(originals.length,5);
 assert.equal(sameStoryRecording(base,otherArtist),false);
 assert.equal(sameStoryRecording(base,live),false);
 assert.equal(sameStoryRecording(base,acoustic),false);
 assert.equal(sameStoryRecording(base,studioDifferentDuration),false);
 assert.equal(songRecordingIdentity(live).version,"live");
});
test("trusted ISRC merges reissues with different albums but never unrelated ISRC",()=>{
 const a=recording("apple","1","Single","Banda",190,{album:"Album 1",isrc:"BRABC1234567"});
 const b=recording("deezer","2","Single","Banda",191,{album:"Reissue",isrc:"BRABC1234567"});
 const c=recording("audius","3","Single","Banda",191,{album:"Reissue",isrc:"USAAA9876543"});
 assert.equal(sameStoryRecording(a,b),true);
 assert.equal(sameStoryRecording(a,c),false);
 assert.equal(dedupeStorySongRecordings([a,b,c]).length,2);
});
test("without ISRC, duration or matching album, do not assume two songs are identical",()=>{
 const a=recording("apple","1","Luz","Banda",0,{album:""});
 const b=recording("deezer","2","Luz","Banda",0,{album:""});
 assert.equal(sameStoryRecording(a,b),false);
 assert.equal(dedupeStorySongRecordings([a,b]).length,2);
});
test("Apple and Deezer are for official previews; Audius and own/CC audio can be selected",()=>{
 assert.equal(storyMusicCanPublish(recording("apple","1")),true);
 assert.equal(storyMusicCanPublish(recording("deezer","2")),true);
 assert.equal(storyMusicCanPublish(recording("audius","A3")),true);
 assert.equal(storyMusicCanPublish({...recording("audius",""),id:""}),false);
 assert.equal(storyMusicCanPublish({kind:"file",file:new Blob(["x"])}),true);
 assert.equal(storyMusicCanPublish({kind:"openverse",id:"cc-1"}),true);
 assert.equal(storyMusicCanPublish({kind:"builtin",title:"Brisa"}),false);
});
test("Audius track ID survives storage in story caption and reload, preview links never do",()=>{
 const track=normalizeStorySong(recording("audius","Another_45"));
 const marker=encodeStorySong("Deu certo 🥳",track);
 const decoded=decodeStorySong(marker);
 assert.equal(decoded.text,"Deu certo 🥳");
 assert.equal(decoded.song.id,track.id);
 assert.equal(decoded.song.provider,"audius");
 assert.match(audiusStoryStreamUrl(decoded.song),/Another_45\/stream/);
 assert.equal(decodeStorySong(encodeStorySong("texto",recording("apple","10"))).song.provider,"apple");
});
test("the Cloudflare Worker carries recording identity fields without inventing audio permissions",async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
  const u=String(url);
  if(u.includes("itunes.apple.com"))return Response.json({results:[{kind:"song",trackId:123,trackName:"Exemplo",
   artistName:"Pessoa",collectionName:"Álbum",trackTimeMillis:213400,
   trackViewUrl:"https://music.apple.com/br/song/123",isrc:"BRABC1234567"}]});
  if(u.includes("api.deezer.com"))return Response.json({data:[{id:44,title:"Exemplo",duration:213,
   artist:{name:"Pessoa"},album:{title:"Álbum"},link:"https://deezer.com/track/44"}]});
  if(u.includes("api.audius.co"))return Response.json({data:[{id:"AaBb",title:"Exemplo",duration:214,
   user:{name:"Pessoa"},permalink:"/pessoa/exemplo"}]});
  throw Error("Unexpected URL "+u);
 };
 try{
  const response=await worker.fetch(new Request("https://music.test/search?q=exemplo",{
   headers:{origin:"https://soumoiss.github.io"}
  }));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.providers.reduce((n,p)=>n+p.items.length,0),3);
  assert.deepEqual(body.providers.map(p=>p.items[0].durationSec),[213,213,214]);
  assert.equal(body.providers[0].items[0].album,"Álbum");
  assert.equal(body.providers[0].items[0].isrc,"BRABC1234567");
  assert.equal(JSON.stringify(body).includes("/stream?"),false);
 }finally{globalThis.fetch=oldFetch;}
});
test("when Worker is unavailable, Apple browser endpoint can supply real partial results",async()=>{
 const calls=[];
 const result=await searchStorySongs("exemplo",{fetcher:async url=>{
   calls.push(String(url));
   if(String(url).includes("itunes.apple.com"))return Response.json({results:[{
     kind:"song",trackId:1,trackName:"Exemplo",artistName:"Pessoa",
     trackViewUrl:"https://music.apple.com/br/song/1",collectionName:"Álbum",
     trackTimeMillis:180000
   }]});
   return new Response("Service Unavailable",{status:503});
 }});
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].provider,"apple");
 assert.equal(result.providers.find(p=>p.provider==="audius").available,false);
 assert.equal(calls.length,2);
});
test("unified picker exposes only Todas and does not try a device Spotify redirect",async()=>{
 const [picker,studio,viewer,css]=await Promise.all([
  read("src/story-music-picker.js"),read("src/story-studio.js"),
  read("src/stories.js"),read("assets/css/pages/story-studio.css")
 ]);
 assert.match(picker,/data-studio-provider="all"/);
 assert.equal((picker.match(/data-studio-provider=/g)||[]).length,1);
 assert.doesNotMatch(picker,/data-studio-provider="(?:apple|deezer|audius|openverse|builtin|spotify)"/);
 assert.doesNotMatch(picker,/storySongSearchLinks|open\.spotify\.com|window\.location|spotify:|builtin\.filter/);
 assert.doesNotMatch(picker,/Pesquisar em várias plataformas|Escolha uma faixa para ouvir antes de publicar|Openverse, sem endosso/);
 assert.match(picker,/downloadLicensedStorySong\(track,/);
 assert.match(picker,/stopPreview\(\)/);
 assert.match(picker,/iframe\.src="about:blank"/);
 assert.match(studio,/if\(music\?\.kind==="catalog" && music\.provider!=="audius" && !officialStorySongEmbed\(music\)\)/);
 assert.match(viewer,/if \(!audiusStream && storyText\.music\?\.previewUrl\)/);
 assert.match(css,/\.studio-music-preview-limited/);
});
