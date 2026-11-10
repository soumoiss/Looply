import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { searchSpotifyPublicCatalog } from "../backend/neon-storage/index.mjs";
import { searchSpotifyStoryMetadata } from "../src/story-music-catalog.js";
import { musicMarkup, musicPlayerMarkup } from "../src/music.js";

const validId="3IAfUEeaXRX9s9UdKOJrFI";
const spotifyUrl="https://open.spotify.com/track/"+validId;
const sample={
  provider:"WOLF TECH",success:true,query:"Anitta",type:"track",results:[
    {id:validId,title:"Envolver",artist:"Anitta",thumbnail:"https://i.scdn.co/image/ab67616d0000b273a311e21ac3313c4c60135fe4"},
    {id:validId,title:"Envolver",artist:"Anitta",thumbnail:"https://i.scdn.co/image/ab67616d0000b273a311e21ac3313c4c60135fe4"},
    {id:"not-a-valid-id",title:"Invalid",artist:"No",thumbnail:"https://attacker.example/image.jpg"},
    {id:"05WVKTdZhlIMX4qqMLuo0f",title:"BELLAKEO",artist:"Peso Pluma, Anitta",thumbnail:"https://evil.example/photo.jpg"},
    {id:"1234567890123456789012",title:"",artist:"Missing title"}
  ]
};

test("Keyless Spotify metadata search returns only real individual Spotify track IDs",async()=>{
  let called="";
  let requestHeaders={};
  const response=await searchSpotifyPublicCatalog("Anitta",{},async(url,options)=>{
    called=url;
    requestHeaders=options.headers;
    return new Response(JSON.stringify(sample),{status:200});
  });
  assert.equal(response.status,200);
  assert.equal(response.headers.get("cache-control"),"private, max-age=45");
  const data=await response.json();
  assert.equal(data.source,"spotify_public_catalog");
  assert.equal(data.items.length,2);
  assert.deepEqual(data.items[0],{
    id:validId,name:"Envolver",artist:"Anitta",image:sample.results[0].thumbnail,previewUrl:null
  });
  assert.equal(data.items[1].image,"");
  assert.match(called,/^https:\/\/spotify\.xwolf\.space\/api\/search\?/);
  assert.match(called,/type=track/);
  assert.match(called,/limit=10/);
  assert.equal(requestHeaders.authorization,undefined);
  assert.equal(JSON.stringify(data).includes("access_token"),false);
  assert.equal(JSON.stringify(data).includes("spotify://"),false);
});

test("Malformed public catalog data or offline server fails closed",async()=>{
  const bad=await searchSpotifyPublicCatalog("Anitta",{},async()=>new Response(JSON.stringify({items:[]}),{status:200}));
  assert.equal(bad.status,503);
  assert.equal((await bad.json()).error,"spotify_public_catalog_unavailable");
  const offline=await searchSpotifyPublicCatalog("Anitta",{},async()=>{throw new Error("offline")});
  assert.equal(offline.status,503);
  assert.equal((await offline.json()).error,"spotify_public_catalog_unavailable");
  const invalid=await searchSpotifyPublicCatalog("x",{},async()=>{throw Error("Should not call")});
  assert.equal(invalid.status,400);
});

test("Keyless catalog output flows through Neon client to official single-track Spotify preview",async()=>{
  const catalog=await searchSpotifyPublicCatalog("Anitta",{},async()=>new Response(JSON.stringify(sample),{status:200}));
  const data=await catalog.json();
  const tracks=await searchSpotifyStoryMetadata("Anitta",{
    accessToken:"looply-session",endpoint:"https://example.neon.tech",
    fetcher:async()=>new Response(JSON.stringify(data),{status:200})
  });
  assert.equal(tracks.length,2);
  assert.equal(tracks[0].provider,"spotify");
  assert.equal(tracks[0].url,spotifyUrl);
  assert.match(musicPlayerMarkup({title:tracks[0].title,artist:tracks[0].artist,listen_url:tracks[0].url}),/open\.spotify\.com\/embed\/track\/3IAfUEeaXRX9s9UdKOJrFI/);
  const html=musicMarkup({people:[],peopleError:null,dedications:[],dedicationsError:null,library:[],libraryError:null,generalComments:[],generalCommentsError:null},"sender");
  assert.match(html,/data-music-provider="spotify"/);
  assert.match(html,/data-music-catalog-query/);
  assert.match(html,/data-music-search-preview/);
  assert.doesNotMatch(html,/data-music-spotify-url|Colar faixa do Spotify/);
});

test("Backend uses public Spotify catalog when missing credentials, never a fake Apple result",async()=>{
  const backend=await readFile(new URL("../backend/neon-storage/index.mjs",import.meta.url),"utf8");
  assert.match(backend,/if \(!token\) return searchSpotifyPublicCatalog\(query, headers\)/);
  assert.match(backend,/\/spotify\/catalog-health/);
  assert.doesNotMatch(backend,/if \(!token\) return json\(\{ error: "spotify_not_configured"/);
  assert.match(backend,/no anonymous Spotify tokens/i);
});
