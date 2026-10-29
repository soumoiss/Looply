import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isExplicitStoryPublishGesture,preventImplicitStorySubmit} from "../src/story-publish-intent.js";
import {officialStorySongEmbed,encodeStorySong,decodeStorySong} from "../src/story-music-catalog.js";
import {storyMusicCanPublish} from "../src/story-music-picker.js";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const fakeClick=(selector,disabled=false)=>({
 type:"click",target:{closest(query){
  return query.includes(selector)?{disabled}:null;
 }}
});
test("Enter, IME submit, music selection and change cannot authorize Story publishing",()=>{
 const calls={prevent:0,stop:0};
 const submit={type:"submit",target:{closest:()=>({disabled:false})},preventDefault(){calls.prevent++},stopPropagation(){calls.stop++}};
 assert.equal(isExplicitStoryPublishGesture(submit),false);
 assert.equal(preventImplicitStorySubmit(submit),false);
 assert.deepEqual(calls,{prevent:1,stop:1});
 for(const action of ["change","input","focus","keydown","submit"]){
  assert.equal(isExplicitStoryPublishGesture({type:action,target:{closest:()=>({disabled:false})}}),false,action);
 }
 const unrelated={type:"click",target:{closest:()=>null}};
 assert.equal(isExplicitStoryPublishGesture(unrelated),false);
});
test("only distinct explicit Publish buttons authorize submission; disabled buttons never do",()=>{
 for(const selector of ["data-studio-publicar","data-studio-publish-friends","data-share-public"]){
  assert.equal(isExplicitStoryPublishGesture(fakeClick(selector)),true,selector);
  assert.equal(isExplicitStoryPublishGesture(fakeClick(selector,true)),false,selector);
 }
});
test("live studio does not call publish from form submit or friends-selection confirmation",()=>{
 const source=read("src/story-studio.js");
 const formBlock=source.slice(source.indexOf('$("[data-studio-form]").addEventListener("submit"'),source.indexOf('dialog.addEventListener("cancel"'));
 assert.match(formBlock,/preventImplicitStorySubmit\(e\)/);
 assert.doesNotMatch(formBlock,/publish\(/);
 const audience=source.slice(source.indexOf('const openAudience ='),source.indexOf('const openMentions ='));
 assert.doesNotMatch(audience,/publish\(/);
 assert.match(audience,/data-studio-publish-friends/);
 assert.match(source,/authorization !== explicitStoryPublication/);
 assert.match(source,/requestStoryPublish=event=>/);
 assert.match(source,/isExplicitStoryPublishGesture\(event\)/);
 assert.match(source,/data-studio-publish-friends/);
});
test("Apple and Deezer widgets remain valid previews but cannot publish a metadata-only silent Story",()=>{
 const apple={kind:"catalog",provider:"apple",title:"Exemplo",artist:"Artista",url:"https://music.apple.com/br/album/album/123?i=456",id:"456"};
 const deezer={kind:"catalog",provider:"deezer",title:"Exemplo",artist:"Artista",url:"https://www.deezer.com/br/track/777",id:"777"};
 assert.deepEqual(officialStorySongEmbed(apple),{kind:"embed",provider:"apple",src:"https://embed.music.apple.com/br/album/album/123?i=456"});
 assert.deepEqual(officialStorySongEmbed(deezer),{kind:"embed",provider:"deezer",src:"https://widget.deezer.com/widget/dark/track/777"});
 assert.equal(storyMusicCanPublish(apple),false);
 assert.equal(storyMusicCanPublish(deezer),false);
 for(const song of [apple,deezer]){
  const after=decodeStorySong(encodeStorySong("Texto no Story",song));
  assert.equal(after.text,"Texto no Story");
  assert.equal(after.song.provider,song.provider);
  assert.deepEqual(officialStorySongEmbed(after.song),officialStorySongEmbed(song));
 }
 assert.equal(officialStorySongEmbed({...apple,url:"https://music.apple.com.evil.com/song/123"}),null);
 assert.equal(officialStorySongEmbed({...deezer,url:"http://www.deezer.com/track/777"}),null);
});
test("provider music stays user-initiated inside the Story without a modal or hidden iframe",()=>{
 const viewer=read("src/stories.js");
 const css=read("assets/css/pages/stories-instagram.css");
 assert.doesNotMatch(viewer,/data-story-official-audio|data-story-official-toggle|data-story-official-panel/);
 assert.ok(viewer.includes("officialStorySongEmbed(catalogSong.song)"));
 assert.match(viewer,/data-story-provider-dock/);
 assert.match(viewer,/data-story-provider-content/);
 assert.ok(viewer.includes("openOfficialProvider()"));
 assert.match(viewer,/player.allow="autoplay; encrypted-media"/);
 assert.doesNotMatch(viewer,/story-official-music-iframe|story-start-audio|data-story-sound-unlock/);
 assert.doesNotMatch(css,/story-official-audio/);
 assert.match(viewer,/openStoryDialog\(viewer\);\s*renderSlide\(\);/);
 assert.match(viewer,/playStoryAudio\(music\)/);
 assert.match(viewer,/startStoryMediaPlayback\(video\)/);
 const picker=read("src/story-music-picker.js");
 assert.doesNotMatch(picker,/open\.spotify\.com|spotify:\/\//);
});
