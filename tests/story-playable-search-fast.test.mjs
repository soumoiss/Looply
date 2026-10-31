import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { searchPlayableStorySongs } from "../src/story-music-catalog.js";
import { startStoryMediaPlayback, stopStoryMediaPlayback } from "../src/story-viewer-playback.js";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("fast Story discovery uses only supported metadata providers",async()=>{
  const requests=[];
  const result=await searchPlayableStorySongs("música",{
    fetcher:async url=>{
      requests.push(url);
      return Response.json({providers:[
        {provider:"apple",available:true,items:[{provider:"apple",id:"123",title:"Música",artist:"Artista",url:"https://music.apple.com/br/album/musica/123"}]},
        {provider:"audius",available:true,items:[{provider:"audius",id:"X9",title:"Retirado",artist:"Teste",url:"https://audius.co/a/b"}]}
      ]});
    }
  });
  assert.equal(requests.length,1);
  assert.ok(requests[0].includes("looply-story-music-search"));
  assert.deepEqual(result.items.map(x=>x.provider),["apple"]);
  assert.deepEqual(result.providers.map(x=>x.provider),["apple"]);
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
  assert.doesNotMatch(picker,/Vincular meu áudio autorizado/);
  assert.match(picker,/const catalogTask=settle\(/);
  assert.match(picker,/const licensedTask=settle\(/);
  assert.match(picker,/catalogTask\.then\(async/);
  assert.match(picker,/received\.push/);
  assert.match(picker,/searchCache\.set/);
  assert.doesNotMatch(picker,/checkAudiusStream/);
  assert.match(css,/max-height:min\(75dvh,730px\)!important/);
  assert.match(css,/width:auto!important/);
  assert.match(sw,/ignoreSearch: false/);
});
