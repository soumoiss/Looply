import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {encodeStorySong,decodeStorySong,normalizeStorySong,searchStorySongs,storySongSearchLinks,searchAppleMusicPublic,officialSongPreview,STORY_MUSIC_ENDPOINT} from "../src/story-music-catalog.js";
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
test("Server-side discovery uses Apple and Deezer without removed providers",async()=>{
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
    return new Response("",{status:404});
  };
  try {
    const response=await worker.fetch(new Request("https://music.test/search?q=hello",{headers:{origin:"https://soumoiss.github.io"}}));
    assert.equal(response.status,200);
    assert.equal(response.headers.get("access-control-allow-origin"),"https://soumoiss.github.io");
    const body=await response.json();
    assert.equal(body.providers.length,2);
    assert.deepEqual(body.providers.map(p=>p.provider),["apple","deezer"]);
    assert.equal(body.providers.reduce((n,p)=>n+p.items.length,0),2);
    assert.ok(!JSON.stringify(body).includes("illegal-preview"),"previews must not be returned");
    assert.equal(accessed.length,2);
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
  assert.equal(response.items.length,1);
  assert.equal(response.providers[1].available,false);
  assert.match(STORY_MUSIC_ENDPOINT,/workers\.dev\/search$/);
});
test("Additional platforms are explicit official search links, not fake catalog/audio streams",()=>{
  const links=storySongSearchLinks("Hello Adele");
  assert.deepEqual(links.map(x=>x.name),["Apple Music","YouTube Music","SoundCloud","TIDAL"]);
  assert.ok(links.every(x=>x.url.startsWith("https://")));
});
test("Published Story does not try to decode Spotify, Apple or Deezer previews as audio files",()=>{
  const studio=readFileSync(new URL("../src/story-studio.js",import.meta.url),"utf8");
  const picker=readFileSync(new URL("../src/story-music-picker.js",import.meta.url),"utf8");
  const viewer=readFileSync(new URL("../src/stories.js",import.meta.url),"utf8");
  assert.match(studio,/music\.kind !== "catalog"/);
  assert.match(studio,/encodeStorySong\(caption\.value,music\)/);
  assert.match(picker,/searchCatalog\(term/);
  assert.match(viewer,/decodeStorySong\(story\.body/);
  assert.doesNotMatch(studio,/addLayer\("♪ " \+ track\.title/);
  assert.doesNotMatch(viewer,/story-viewer-song-credit|credit\.href = catalogSong/);
  assert.doesNotMatch(viewer,/audiusStoryStreamUrl/);
  assert.match(viewer,/if \(audio && !audio\.paused\) stopStoryMediaPlayback\(audio/);
  assert.doesNotMatch(viewer,/api\.audius\.co/);
  assert.match(picker,/▶ Ouvir/);
  assert.match(picker,/Selecionar para o Story/);
  assert.doesNotMatch(picker,/fileInput\\.click\\(\\)/);
  assert.doesNotMatch(picker,/Vincular meu áudio autorizado/);
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
test("Removed provider cannot be selected and old markers retain their captions",()=>{
  const old={provider:"audius",title:"Som",artist:"Banda",id:"AbC123",url:"https://audius.co/banda/som"};
  assert.equal(normalizeStorySong(old),null);
  const legacy="[[looply-music-v5|audius|Som|Banda|https%3A%2F%2Faudius.co%2Fbanda%2Fsom|AbC123]]Minha legenda";
  assert.equal(decodeStorySong(legacy).text,"Minha legenda");
  assert.equal(decodeStorySong(legacy).song,null);
  assert.equal(decodeStorySong(encodeStorySong("",fixture)).song.provider,"apple");
});

test("Official Apple and Deezer previews are URL-allowlisted and only used for audition",()=>{
  const apple=normalizeStorySong({...fixture,previewUrl:"https://audio-ssl.itunes.apple.com/itunes-assets/a.m4a"});
  assert.match(apple.previewUrl,/audio-ssl\.itunes\.apple\.com/);
  assert.deepEqual(officialSongPreview(apple),{
    kind:"audio",provider:"apple",src:"https://audio-ssl.itunes.apple.com/itunes-assets/a.m4a"
  });
  const deezer=normalizeStorySong({
    provider:"deezer",title:"Faixa",artist:"Artista",url:"https://www.deezer.com/track/123",
    previewUrl:"https://cdnt-preview.dzcdn.net/api/1/1.mp3"
  });
  assert.equal(officialSongPreview(deezer).kind,"audio");
  assert.equal(normalizeStorySong({...fixture,previewUrl:"https://evil.example/a.mp3"}).previewUrl,"");
  assert.equal(normalizeStorySong({...fixture,previewUrl:"http://audio-ssl.itunes.apple.com/a.mp3"}).previewUrl,"");
  const marker=encodeStorySong("texto",apple);
  assert.doesNotMatch(marker,/previewUrl|itunes-assets|a\.m4a/);
});

test("Android music cards have separate grid action row, readable text, and visible audio controls",()=>{
  const css=readFileSync(new URL("../assets/css/pages/story-studio.css",import.meta.url),"utf8");
  const picker=readFileSync(new URL("../src/story-music-picker.js",import.meta.url),"utf8");
  assert.match(css,/\.story-studio \.studio-catalog-song \{[\s\S]*?display:grid!important;/);
  assert.match(css,/\.story-studio \.studio-catalog-song > \.studio-music-row-actions \{[\s\S]*?grid-row:2;/);
  assert.match(css,/\.story-studio \.studio-catalog-select \{[\s\S]*?color:#18141d!important/);
  assert.match(picker,/el\.controls=true/);
  assert.match(picker,/void el\.play\(\)\.catch/);
  assert.match(picker,/el\.addEventListener\("error"/);
  assert.match(picker,/const listen=addText\(buttons,"button","▶ Ouvir prévia"/);
  assert.match(picker,/const choose=addText\(buttons,"button",/);
  assert.doesNotMatch(picker,/Usar streaming/);
  assert.doesNotMatch(picker,/Vincular streaming ao Story/);
  assert.match(picker,/providerLink\.href=track\.url/);
  assert.match(picker,/stopPreview/);
});
