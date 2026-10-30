import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { searchPlayableStorySongs, audiusStoryStreamUrl } from "../src/story-music-catalog.js";
import { startStoryMediaPlayback, stopStoryMediaPlayback } from "../src/story-viewer-playback.js";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const entry=(id,options={})=>({
  id,title:"Música disponível",permalink:"/artista/musica",user:{name:"Artista"},
  duration:205,artwork:{_150x150:"https://cdn.audius.co/example.webp"},...options
});

test("fast Story search only returns streamable Audius tracks, not Apple/Deezer preview-only metadata",async()=>{
  let requests=[];
  const results=await searchPlayableStorySongs("música",{
    fetcher:async url=>{
      requests.push(url);
      return Response.json({data:[entry("A123"),entry("X12",{is_streamable:false}),
        entry("P444",{is_premium:true}),entry("K80",{access:{stream:false}})]});
    }
  });
  assert.equal(requests.length,1);
  assert.ok(requests[0].startsWith("https://api.audius.co/v1/tracks/search?query="));
  assert.equal(results.items.length,1);
  assert.equal(results.items[0].id,"A123");
  assert.equal(results.items[0].provider,"audius");
  assert.equal(results.providers.length,1);
  assert.match(audiusStoryStreamUrl(results.items[0]),/\/tracks\/A123\/stream/);
  assert.doesNotMatch(JSON.stringify(results),/"provider":"apple"|"provider":"deezer"/);
});

test("short search does not make a network request",async()=>{
  const r=await searchPlayableStorySongs("a",{fetcher:()=>{throw Error("should not run");}});
  assert.deepEqual(r.items,[]);
});

test("only confirmed playback of the current Story can remain playing after navigation",async()=>{
  let resolvePlay;
  const media={
    isConnected:true,paused:true,dataset:{},
    play(){return new Promise(resolve=>{resolvePlay=resolve;});},
    pause(){this.paused=true;}
  };
  const owner={};
  const pending=startStoryMediaPlayback(media,{owner});
  stopStoryMediaPlayback(media,{owner});
  resolvePlay();
  assert.equal(await pending,false);
  assert.equal(media.dataset.playback,"paused");
  assert.equal(media.paused,true);
});

test("published viewer cannot display a provider modal and music picker returns results progressively",async()=>{
  const [viewer,picker,css,sw]=await Promise.all([
    read("src/stories.js"),read("src/story-music-picker.js"),
    read("assets/css/pages/feed-reels-experience.css"),read("sw.js")
  ]);
  assert.doesNotMatch(viewer,/data-story-provider-dock|data-story-provider-content|openOfficialProvider/);
  assert.match(viewer,/songLabel\.setAttribute\("role","note"\)/);
  assert.match(picker,/searchCatalog=searchStorySongs/);
  assert.match(picker,/Vincular meu áudio autorizado/);
  assert.match(picker,/const catalogTask=settle\(/);
  assert.match(picker,/const licensedTask=settle\(/);
  assert.match(picker,/catalogTask\.then\(async/);
  assert.match(picker,/received\.push/);
  assert.match(picker,/searchCache\.set/);
  assert.match(picker,/checkAudiusStream\(track\)/);
  assert.match(css,/max-height:min\(75dvh,730px\)!important/);
  assert.match(css,/width:auto!important/);
  assert.match(sw,/ignoreSearch: false/);
});
