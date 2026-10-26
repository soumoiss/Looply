import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {encodeStorySong,decodeStorySong,normalizeStorySong,searchStorySongs,storySongSearchLinks,searchAppleMusicPublic,officialSongPreview,audiusStoryStreamUrl,STORY_MUSIC_ENDPOINT} from "../src/story-music-catalog.js";
import worker from "../backend/story-music-discovery/worker.mjs";

const fixture = {provider:"apple",title:"Música Legal",artist:"Artista",url:"https://music.apple.com/br/album/musica/123",artwork:""};
test("Story song marker is reversible, escaped and rejects forged links",()=>{
  const caption="Olá! 🎵";
  const encoded=encodeStorySong(caption,fixture);
  assert.equal(decodeStorySong(encoded).text,caption);
  assert.equal(decodeStorySong(encoded).song.title,fixture.title);
  assert.equal(decodeStorySong("simples").song,null);
  assert.equal(normalizeStorySong({...fixture,url:"https://apple.com.attacker.test/song"}),null);
  assert.equal(normalizeStorySong({...fixture,url:"http://music.apple.com/br/song"}),null);
  assert.equal(normalizeStorySong({...fixture,provider:"spotify"}),null);
  assert.equal(decodeStorySong("[[looply-music-v4|apple|x|y|https%3A%2F%2Fevil.test]]teste").song,null);
});
test("Server-side discovery integrates Apple, Deezer and Audius without streaming audio",async()=>{
  const previous=globalThis.fetch;
  const accessed=[];
  globalThis.fetch=async(url)=>{
    accessed.push(url);
    if(url.startsWith("https://itunes.apple.com/"))return new Response(JSON.stringify({results:[{
      kind:"song",trackId:123,trackName:"Hello",artistName:"Adele",trackViewUrl:"https://music.apple.com/br/album/hello/123",artworkUrl100:"https://is1-ssl.mzstatic.com/p/123"
    }]}),{status:200});
    if(url.startsWith("https://api.deezer.com/"))return new Response(JSON.stringify({data:[{
      id:456,title:"Hello",artist:{name:"Adele"},album:{cover_medium:"https://cdn-images.dzcdn.net/1"},link:"https://www.deezer.com/track/456",preview:"https://illegal-preview"
    }]}),{status:200});
    if(url.startsWith("https://api.audius.co/"))return new Response(JSON.stringify({data:[{
      id:"id789",title:"Hello",user:{name:"Adele"},permalink:"/adele/hello"
    }]}),{status:200});
    return new Response("",{status:404});
  };
  try {
    const response=await worker.fetch(new Request("https://music.test/search?q=hello",{headers:{origin:"https://soumoiss.github.io"}}));
    assert.equal(response.status,200);
    assert.equal(response.headers.get("access-control-allow-origin"),"https://soumoiss.github.io");
    const body=await response.json();
    assert.equal(body.providers.length,3);
    assert.deepEqual(body.providers.map(p=>p.provider),["apple","deezer","audius"]);
    assert.equal(body.providers.reduce((n,p)=>n+p.items.length,0),3);
    assert.ok(!JSON.stringify(body).includes("illegal-preview"),"previews must not be returned");
    assert.equal(accessed.length,3);
  } finally {globalThis.fetch=previous;}
});
test("Resilient catalog search: one unavailable provider does not lose other results",async()=>{
  const response=await searchStorySongs("hello",{
    fetcher:async()=>new Response(JSON.stringify({providers:[
      {provider:"apple",available:true,items:[fixture]},
      {provider:"deezer",available:false,items:[]},
      {provider:"audius",available:true,items:[{...fixture,provider:"audius",url:"https://audius.co/adele/hello"}]}
    ]}),{status:200})
  });
  assert.equal(response.items.length,2);
  assert.equal(response.providers[1].available,false);
  assert.match(STORY_MUSIC_ENDPOINT,/workers\.dev\/search$/);
});
test("Additional platforms are explicit official search links, not fake catalog/audio streams",()=>{
  const links=storySongSearchLinks("Hello Adele");
  assert.deepEqual(links.map(x=>x.name),["Apple Music","Spotify","YouTube Music","SoundCloud","TIDAL"]);
  assert.ok(links.every(x=>x.url.startsWith("https://")));
});
test("Published Story does not try to decode Spotify, Apple or Deezer previews as audio files",()=>{
  const studio=readFileSync(new URL("../src/story-studio.js",import.meta.url),"utf8");
  const picker=readFileSync(new URL("../src/story-music-picker.js",import.meta.url),"utf8");
  const viewer=readFileSync(new URL("../src/stories.js",import.meta.url),"utf8");
  assert.match(studio,/music\.kind !== "catalog"/);
  assert.match(studio,/encodeStorySong\(caption\.value,music\)/);
  assert.match(picker,/searchStorySongs\(term/);
  assert.match(viewer,/decodeStorySong\(story\.body/);
  assert.doesNotMatch(studio,/addLayer\("♪ " \+ track\.title/);
  assert.doesNotMatch(viewer,/story-viewer-song-credit|credit\.href = catalogSong/);
  assert.match(viewer,/audiusStoryStreamUrl\(catalogSong\.song\)/);
  assert.match(viewer,/if \(audio && !audio\.paused\) audio\.pause\(\)/);
  assert.match(viewer,/music\.autoplay = true/);
  assert.match(picker,/▶ Ouvir/);
  assert.match(picker,/Escolher esta música/);
  assert.match(picker,/stopPreview/);
});

test("Apple Music public fallback recovers songs when Cloudflare shared IP gets HTTP 429",async()=>{
  let appleRequested=false;
  const result=await searchStorySongs("anitta",{fetcher:async url=>{
    if(url.startsWith("https://itunes.apple.com/")){
      appleRequested=true;
      return new Response(JSON.stringify({results:[{
        kind:"song",trackId:124,trackName:"Envolver",artistName:"Anitta",
        trackViewUrl:"https://music.apple.com/br/album/envolver/124",
        artworkUrl100:"https://is1-ssl.mzstatic.com/image/124"
      }]}),{status:200});
    }
    return new Response(JSON.stringify({providers:[
      {provider:"apple",available:false,items:[],error:"apple HTTP 429"},
      {provider:"deezer",available:true,items:[]},
      {provider:"audius",available:true,items:[]}
    ]}),{status:200});
  }});
  assert.equal(appleRequested,true);
  assert.equal(result.providers[0].available,true);
  assert.equal(result.items[0].title,"Envolver");
});

test("Licensed audition uses official Apple and Deezer players, not stolen preview files",()=>{
  const apple=officialSongPreview({...fixture,id:"123"});
  assert.deepEqual(apple,{kind:"embed",provider:"apple",src:"https://embed.music.apple.com/br/album/musica/123"});
  const deezer=officialSongPreview({provider:"deezer",title:"Hit",artist:"Band",url:"https://www.deezer.com/br/track/456",id:"456"});
  assert.deepEqual(deezer,{kind:"embed",provider:"deezer",src:"https://widget.deezer.com/widget/dark/track/456"});
  assert.equal(officialSongPreview({provider:"deezer",title:"Hit",artist:"Band",url:"https://evil.invalid/br/track/456"}),null);
});
test("Audius stream metadata survives publication and controls invisible background playback",()=>{
  const track={provider:"audius",title:"Som",artist:"Banda",id:"AbC123",url:"https://audius.co/banda/som"};
  assert.match(audiusStoryStreamUrl(track),/\/tracks\/AbC123\/stream\?app_name=Looply$/);
  const value=encodeStorySong("Minha legenda",track);
  assert.match(value,/^\[\[looply-music-v5\|/);
  assert.equal(decodeStorySong(value).song.id,"AbC123");
  assert.equal(decodeStorySong(value).text,"Minha legenda");
  assert.equal(audiusStoryStreamUrl({...track,id:"../../passwd"}),"");
  assert.equal(decodeStorySong(encodeStorySong("",fixture)).song.provider,"apple");
});
