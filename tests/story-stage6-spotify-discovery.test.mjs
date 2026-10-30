import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  normalizeStorySong, officialSongPreview, searchSpotifyStoryMetadata
} from "../src/story-music-catalog.js";
import {storyMusicCanPublish} from "../src/story-music-picker.js";
import {captionWithLicensedMusic} from "../src/story-licensed-music.js";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Spotify catalog uses only the existing authenticated Neon Function; never exposes private client credentials",async()=>{
  const calls=[],songId="5zQ1ZcG1rY5P64BvqsCfK1";
  const results=await searchSpotifyStoryMetadata("exemplo",{
    endpoint:"https://br-round-fog-b7pseu7j-looplystorage.compute.c-13.us-east-1.aws.neon.tech",
    accessToken:"test-only-jwt-not-real",
    fetcher:async(url,options)=>{
      calls.push({url,options});
      return Response.json({items:[{id:songId,name:"Música de teste",artist:"Compositor",image:"https://i.scdn.co/test",previewUrl:null}]});
    }
  });
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/spotify\/search\?q=exemplo$/);
  assert.equal(calls[0].options.headers.authorization,"Bearer test-only-jwt-not-real");
  assert.equal(results[0].provider,"spotify");
  assert.equal(results[0].url,"https://open.spotify.com/track/"+songId);
  assert.equal(results[0].previewUrl,"");
  assert.equal(storyMusicCanPublish(results[0]),false);
  assert.equal(officialSongPreview(results[0]).kind,"embed");
  const picker=await read("src/story-music-picker.js");
  assert.match(picker,/searchSpotifyAuthenticated/);
  assert.match(picker,/searchSpotifyStoryMetadata\(term,/);
  assert.match(picker,/Vincular meu áudio autorizado/);
  assert.doesNotMatch(picker,/SPOTIFY_CLIENT_SECRET|client_secret\s*:/i);
});
test("Unconfigured Spotify credentials and untrusted endpoints fail closed",async()=>{
  let calls=0;
  const opts={fetcher:()=>{calls++;throw Error("network should not run");}};
  assert.deepEqual(await searchSpotifyStoryMetadata("test",opts),[]);
  assert.deepEqual(await searchSpotifyStoryMetadata("test",{...opts,endpoint:"https://evil.test",accessToken:"abc"}),[]);
  assert.deepEqual(await searchSpotifyStoryMetadata("x",{...opts,endpoint:"https://br.example.neon.tech",accessToken:"abc"}),[]);
  assert.equal(calls,0);
  assert.equal(normalizeStorySong({provider:"spotify",title:"Fake",artist:"Fake",url:"https://open.spotify.com.evil.example/track/abcdef"}),null);
});
test("Spotify attribution refers to user's separately licensed audio, not a Spotify recording",()=>{
  const song={kind:"file",file:{type:"audio/wav",size:1000},catalogProvider:"spotify",
    catalogUrl:"https://open.spotify.com/track/5zQ1ZcG1rY5P64BvqsCfK1",
    licenseVerifiedByUser:true,title:"Minha gravação autorizada",artist:"Compositor"};
  const caption=captionWithLicensedMusic("Legenda",song);
  assert.match(caption,/áudio fornecido pelo autor do Story; catálogo: spotify/);
  assert.match(caption,/Minha gravação autorizada/);
  assert.equal(storyMusicCanPublish({kind:"catalog",provider:"spotify",id:"5zQ1ZcG1rY5P64BvqsCfK1"}),false);
});
