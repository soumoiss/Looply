import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import backend from "../backend/neon-storage/index.mjs";
import { searchSpotifyStoryMetadata } from "../src/story-music-catalog.js";

const base="https://br-round-fog-b7pseu7j-looplystorage.compute.c-13.us-east-1.aws.neon.tech";

test("Spotify configuration diagnostic exposes only a boolean to the trusted origin", async () => {
  const response=await backend.fetch(new Request(base+"/spotify/configuration",{
    headers:{origin:"https://soumoiss.github.io"}
  }));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data,{configured:Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)});
  assert.equal(JSON.stringify(data).includes("client_secret"),false);
  assert.equal(response.headers.get("access-control-allow-origin"),"https://soumoiss.github.io");
  const outsider=await backend.fetch(new Request(base+"/spotify/configuration",{
    headers:{origin:"https://untrusted.example"}
  }));
  assert.equal(outsider.status,200);
  assert.equal(outsider.headers.get("access-control-allow-origin"),"null");
  assert.deepEqual(await outsider.json(),data);
  const noOrigin=await backend.fetch(new Request(base+"/spotify/configuration"));
  assert.equal(noOrigin.status,200);
  assert.deepEqual(await noOrigin.json(),data);
});

test("Spotify backend failures keep distinct actionable messages in catalog UI", async () => {
  const cases=[
    ["spotify_not_configured",503,/credenciais de API no Neon/],
    ["spotify_credentials_rejected",503,/recusou as credenciais/],
    ["spotify_access_denied",502,/bloqueou o acesso/],
    ["spotify_rate_limited",429,/limite de consultas/],
    ["spotify_quota_exceeded",429,/cota da API Spotify/],
    ["unauthorized",401,/Sessão do Looply/],
    ["spotify_search_unavailable",503,/não respondeu/]
  ];
  for(const [code,status,expected] of cases){
    await assert.rejects(
      searchSpotifyStoryMetadata("música",{accessToken:"token",endpoint:base,fetcher:async()=>new Response(JSON.stringify({error:code}),{status})}),
      error=>error.code===code && error.status===status && expected.test(error.message)
    );
  }
});

test("Spotify invalid response is never presented as a valid empty catalog", async () => {
  await assert.rejects(
    searchSpotifyStoryMetadata("anitta",{
      accessToken:"token",endpoint:base,fetcher:async()=>new Response(JSON.stringify({tracks:[{id:"fake"}]}),{status:200})
    }),
    error=>error.code==="spotify_invalid_response"
  );
});

test("The music UI shows actionable error and retains Spotify search with no link field",async()=>{
  const music=await readFile(new URL("../src/music.js",import.meta.url),"utf8");
  assert.match(music,/error\?\.message \|\| "Não foi possível consultar o Spotify/);
  assert.doesNotMatch(music,/Busca do Spotify indisponível\. Tente novamente\./);
  assert.doesNotMatch(music,/data-music-spotify-url|data-music-spotify-link|spotifyTrackFromLink/);
  assert.match(music,/data-music-provider="spotify"/);
  assert.match(music,/data-music-song-preview/);
});
