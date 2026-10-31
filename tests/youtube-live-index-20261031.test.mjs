import test from "node:test";
import assert from "node:assert/strict";
import { extractPlaylist } from "../backend/cloudflare/playlist-index-worker.mjs";
import { fetchIndexedPlaylistItems } from "../src/youtube-playlist.js";

const playlist="PLUZFdmgmipvI";
const id="UWf68emToTU";
test("YouTube 2026 lockup format reconstructs genuine playlist tracks",()=>{
  const data={contents:[{lockupViewModel:{
    contentId:id,metadata:{lockupMetadataViewModel:{
      title:{content:"Pensando Em Você"},
      metadata:{contentMetadataViewModel:{metadataRows:[{metadataParts:[{text:{content:"Babado Novo"}}]}]}}
    }},
    rendererContext:{commandContext:{onTap:{innertubeCommand:{
      watchEndpoint:{playlistId:playlist,index:0}
    }}}}
  }}]};
  const html="<script>var ytInitialData = "+JSON.stringify(data)+";</script>";
  const tracks=extractPlaylist(html,playlist);
  assert.equal(tracks.length,1);
  assert.equal(tracks[0].videoId,id);
  assert.equal(tracks[0].title,"Pensando Em Você");
  assert.equal(tracks[0].channel,"Babado Novo");
  assert.deepEqual(extractPlaylist(html,"PLDifferentPlaylist"),[]);
});
test("public playlist index never receives JWT and returns validated songs",async()=>{
  let requests=0;
  const tracks=await fetchIndexedPlaylistItems(playlist,async(url,options)=>{
    requests++;
    assert.equal(options.method,"GET");
    assert.ok(url.startsWith("https://looply-playlist-index.s0upoetamoiss.workers.dev/playlist?"));
    assert.equal(options.headers.authorization,undefined);
    assert.equal(options.credentials,"omit");
    return {ok:true,json:async()=>({items:[
      {videoId:id,title:"Pensando Em Você",channel:"Babado Novo",position:0},
      {videoId:"bad",title:"Faixa inválida"}
    ]})};
  });
  assert.equal(requests,1);
  assert.deepEqual(tracks.map(t=>t.title),["Pensando Em Você"]);
});
