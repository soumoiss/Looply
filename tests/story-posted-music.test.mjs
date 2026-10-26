import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const studio=file("src/story-studio.js");
const viewer=file("src/stories.js");
const picker=file("src/story-music-picker.js");

test("Only publish catalog songs as guaranteed audio when the source is streamable",()=>{
 assert.match(studio,/if\(music\?\.kind==="catalog" && music\.provider!=="audius"\)/);
 assert.match(studio,/Selecione um arquivo de áudio próprio/);
 assert.match(picker,/const needsOwnAudio=track=>track\.kind==="catalog" && track\.provider!=="audius"/);
 assert.match(picker,/fileInput\.click\(\)/);
 assert.match(picker,/preview\(\{kind:"file",title:track\?\.title/);
 assert.match(studio,/music\.kind === "file"/);
});

test("Pre-arm WebAudio synchronously in publish handler, keep audio until the recorded output is finalized",()=>{
 assert.match(studio,/armedAudioContext = new AudioEngine\(\)/);
 assert.match(studio,/void armedAudioContext\.resume\(\)/);
 assert.match(studio,/const media = await exportFinal\(armedAudioContext\)/);
 assert.match(studio,/audioCtx = armedAudioContext \|\| new AudioEngine\(\)/);
 assert.match(studio,/withAudio\?audioFirst:videoFirst/);
 assert.match(studio,/source\.connect\(destination\)/);
 assert.match(studio,/framesStream\.addTrack\(t\)/);
 assert.match(studio,/audioCtx\.state !== "running"/);
 assert.match(studio,/if\(source\) source\.start\(\)/);
});

test("Story player unblocks sound without auto-pausing it on same tap, and pauses with entire Story",()=>{
 assert.match(viewer,/music\.autoplay = true/);
 assert.match(viewer,/video\.muted = false/);
 assert.match(viewer,/video\.volume = 1/);
 assert.match(viewer,/state\.ignoreTapUntil=Date\.now\(\)\+450/);
 assert.match(viewer,/if \(audio && !audio\.paused\) audio\.pause\(\)/);
 assert.match(viewer,/if \(audio && audio\.paused\) void audio\.play/);
 assert.match(viewer,/data-story-sound-unlock/);
 assert.match(viewer,/resumeStoryTimer\(\);/);
});

test("Operational/provider errors visible to ADM only; no promo banners to members",()=>{
 assert.match(studio,/feedback\.textContent = isAdmin \? text : ""/);
 assert.match(studio,/onStatus: status, isAdmin/);
 assert.match(viewer,/bindStoryStudio\(root, client, userId, refresh, isAdmin\)/);
 assert.match(picker,/isAdmin \? '<p class="studio-hint"/);
 assert.doesNotMatch(picker,/Prévia promocional/);
 assert.match(picker,/isAdmin&&down\.length/);
});
