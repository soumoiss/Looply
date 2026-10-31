import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  appleStoryTrackId,resolveAppleStoryPreview,encodeStorySong,decodeStorySong,
  searchAppleMusicPublic
} from "../src/story-music-catalog.js";
import {storyMusicCanPublish} from "../src/story-music-picker.js";

const song={
  kind:"catalog",provider:"apple",id:"1723456789",
  title:"Faixa de teste",artist:"Artista de teste",
  url:"https://music.apple.com/br/album/cancao/11111111?i=1723456789",
  previewUrl:"https://audio-ssl.itunes.apple.com/itunes-assets/temporary-preview.m4a"
};
const preview="https://audio-ssl.itunes.apple.com/itunes-assets/current-preview.m4a";

test("Apple track is selected by stable ID; layout stays unchanged",()=>{
  assert.equal(storyMusicCanPublish(song),true);
  assert.equal(appleStoryTrackId(song),song.id);
  assert.equal(storyMusicCanPublish({kind:"catalog",provider:"deezer"}),false);
  assert.equal(storyMusicCanPublish({kind:"catalog",provider:"spotify"}),false);
  assert.equal(storyMusicCanPublish({kind:"catalog",provider:"apple",title:"No ID",artist:"Artist",url:"https://music.apple.com/br/album/unknown/111"}),false);
});

test("new Story marker preserves track reference, not transient audio URL",()=>{
  const encoded=encodeStorySong("Minha foto",song);
  assert.match(encoded,/^\[\[looply-music-v6\|/);
  assert.ok(!encoded.includes("temporary-preview"));
  const restored=decodeStorySong(encoded);
  assert.equal(restored.text,"Minha foto");
  assert.equal(restored.song.id,song.id);
  assert.equal(restored.song.provider,"apple");
  assert.equal(appleStoryTrackId(restored.song),song.id);
});

test("legacy v4 Apple marker still derives iTunes track ID from music.apple.com link",()=>{
  const old="[[looply-music-v4|apple|Faixa|Artista|https%3A%2F%2Fmusic.apple.com%2Fbr%2Falbum%2Fcancao%2F11111111%3Fi%3D1723456789]]Legenda";
  const restored=decodeStorySong(old);
  assert.equal(restored.text,"Legenda");
  assert.equal(appleStoryTrackId(restored.song),song.id);
});

test("Apple preview is fetched only from its official lookup and matched by track ID",async()=>{
  const visited=[];
  const result=await resolveAppleStoryPreview(song,{
    fetcher:async(url,init)=>{
      visited.push(url);
      assert.equal(init.cache,"no-store");
      return {ok:true,json:async()=>({results:[
        {kind:"song",trackId:999,trackViewUrl:song.url,previewUrl:"https://evil.test/a.mp3"},
        {kind:"song",trackId:1723456789,trackViewUrl:song.url,previewUrl:preview}
      ]})};
    }
  });
  assert.equal(result,preview);
  assert.deepEqual(visited,["https://itunes.apple.com/lookup?id=1723456789&country=br&entity=song"]);
});

test("Apple lookup fails closed on mismatched IDs, foreign hosts, network outages and missing songs",async()=>{
  const bogus={kind:"song",trackId:1723456789,trackViewUrl:song.url,previewUrl:"https://evil.test/audio.mp3"};
  assert.equal(await resolveAppleStoryPreview(song,{fetcher:async()=>({
    ok:true,json:async()=>({results:[bogus]})
  })}),"");
  assert.equal(await resolveAppleStoryPreview(song,{fetcher:async()=>({
    ok:true,json:async()=>({results:[{...bogus,trackId:1,previewUrl:preview}]})
  })}),"");
  assert.equal(await resolveAppleStoryPreview(song,{fetcher:async()=>({ok:false})}),"");
  assert.equal(await resolveAppleStoryPreview({...song,provider:"spotify"},{fetcher:()=>{throw Error("should not fetch")}}),"");
});

test("Picker keeps existing DOM/layout and the viewer uses only hidden Apple audio",async()=>{
  const [picker,viewer,studio]=await Promise.all([
    readFile(new URL("../src/story-music-picker.js",import.meta.url),"utf8"),
    readFile(new URL("../src/stories.js",import.meta.url),"utf8"),
    readFile(new URL("../src/story-studio.js",import.meta.url),"utf8")
  ]);
  assert.match(picker,/appleStoryTrackId\(track\)/);
  assert.match(picker,/data-studio-music-query/);
  assert.doesNotMatch(picker,/fileInput\.click/);
  assert.match(studio,/encodeStorySong\(caption\.value,music\)/);
  assert.match(studio,/if\(music\?\.kind==="catalog" && !appleStoryTrackId\(music\)\)/);
  assert.match(viewer,/music\.className="story-viewer-music-hidden"/);
  assert.match(viewer,/void resolveAppleStoryPreview\(appleSong\)\.then/);
  assert.match(viewer,/if\(!current\(\)\)return/);
  assert.match(viewer,/music\.controls=false/);
  assert.match(viewer,/void playStoryAudio\(music\)/);
  assert.doesNotMatch(viewer,/data-story-official-audio|data-story-provider-dock/);
});

test("Apple official public search preserves the track ID needed for a published Story",async()=>{
  const rows=await searchAppleMusicPublic("teste",{
    fetcher:async()=>({ok:true,json:async()=>({results:[{
      kind:"song",trackId:1723456789,trackName:"Faixa de teste",
      artistName:"Artista de teste",trackViewUrl:song.url,
      previewUrl:preview
    }]})})
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,song.id);
  assert.equal(storyMusicCanPublish(rows[0]),true);
});
