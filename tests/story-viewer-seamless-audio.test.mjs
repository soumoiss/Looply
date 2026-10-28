import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {startStoryMediaPlayback,stopStoryMediaPlayback} from "../src/story-viewer-playback.js";

const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const makeMedia=()=>({
 isConnected:true,paused:true,dataset:{},attempts:0,
 play(){this.attempts++;this.paused=false;return Promise.resolve();},
 pause(){this.paused=true;}
});

test("opening a Story requests audible media playback directly and reports only actual success",async()=>{
 const media=makeMedia();
 const result=await startStoryMediaPlayback(media);
 assert.equal(result,true);
 assert.equal(media.attempts,1);
 assert.equal(media.dataset.playback,"playing");
 stopStoryMediaPlayback(media);
 assert.equal(media.paused,true);
 assert.equal(media.dataset.playback,"paused");
});

test("browser autoplay rejection stays observable and the next user's gesture can retry without a popup",async()=>{
 const media=makeMedia();
 media.play=()=>{media.attempts++;return Promise.reject(Object.assign(Error("Not allowed"),{name:"NotAllowedError"}));};
 assert.equal(await startStoryMediaPlayback(media),false);
 assert.equal(media.dataset.playback,"gesture-required");
 assert.equal(media.attempts,1);
 media.play=()=>{media.attempts++;media.paused=false;return Promise.resolve();};
 assert.equal(await startStoryMediaPlayback(media),true);
 assert.equal(media.attempts,2);
 assert.equal(media.dataset.playback,"playing");
});
test("nonpolicy media errors are not silently reported as playing",async()=>{
 const media=makeMedia();
 media.play=()=>Promise.reject(Object.assign(Error("Stream failed"),{name:"NotSupportedError"}));
 assert.equal(await startStoryMediaPlayback(media),false);
 assert.equal(media.dataset.playback,"unavailable");
});
test("cannot start detached media or mark it as playing after the viewer closes",async()=>{
 const media=makeMedia();media.isConnected=false;
 assert.equal(await startStoryMediaPlayback(media),false);assert.equal(media.attempts,0);
 media.isConnected=true;
 let resolve;
 media.play=()=>new Promise(res=>{resolve=res;});
 const pending=startStoryMediaPlayback(media);
 media.isConnected=false;resolve();
 assert.equal(await pending,false);
 assert.notEqual(media.dataset.playback,"playing");
});
test("published viewer has no music box, popup, or fake audio activation control",()=>{
 const src=file("src/stories.js"),css=file("assets/css/pages/stories-instagram.css");
 assert.doesNotMatch(src,/data-story-official-(?:audio|toggle|panel)/);
 assert.doesNotMatch(src,/data-story-sound-unlock/);
 assert.doesNotMatch(src,/story-start-audio/);
 assert.doesNotMatch(src,/story-official-music-iframe/);
 assert.doesNotMatch(css,/story-official-audio/);
 assert.match(src,/openStoryDialog\(viewer\);\s*renderSlide\(\);/);
 assert.match(src,/startStoryMediaPlayback\(music\)/);
 assert.match(src,/startStoryMediaPlayback\(video\)/);
 assert.match(src,/touchSurface\.addEventListener\("pointerdown"/);
 assert.match(src,/backgroundAudio\?\.dataset\.playback==="gesture-required"/);
 assert.match(src,/retryAudio\)void startStoryMediaPlayback\(backgroundAudio\)/);
 assert.match(src,/video\.addEventListener\("pause"/);
 assert.match(src,/viewer\.addEventListener\("close"/);
});
test("story creation and publishing are untouched by this view-only sound change",()=>{
 const studio=file("src/story-studio.js");
 assert.match(studio,/requestStoryPublish=event=>/);
 assert.match(studio,/isExplicitStoryPublishGesture\(event\)/);
 assert.match(studio,/authorization !== explicitStoryPublication/);
});
