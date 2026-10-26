import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const studio=file("src/story-studio.js");
const viewer=file("src/stories.js");
const picker=file("src/story-music-picker.js");

test("Catalog music selection stays in app and never opens the device picker automatically",()=>{
 assert.match(studio,/if\(music\?\.kind==="catalog" && music\.provider!=="audius"\)/);
 assert.match(studio,/Este serviço não autoriza incorporar essa música ao Story/);
 assert.match(picker,/const needsOwnAudio=track=>track\.kind==="catalog" && track\.provider!=="audius"/);
 assert.match(picker,/onSelect\(track\)/);
 assert.doesNotMatch(picker,/fileInput\.click\(\)/);
 assert.match(picker,/data-studio-audio-file/);
 assert.match(picker,/Adicionar áudio próprio \(opcional\)/);
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
 assert.match(viewer,/music\.autoplay = !waitsForVideo/);
 assert.match(viewer,/video\.addEventListener\("playing", \(\) => \{/);
 assert.match(viewer,/songAudio\.play\(\)/);
 assert.match(viewer,/video\.muted = false/);
 assert.match(viewer,/video\.volume = 1/);
 assert.match(viewer,/state\.ignoreTapUntil=Date\.now\(\)\+450/);
 assert.match(viewer,/if \(audio && !audio\.paused\) audio\.pause\(\)/);
 assert.match(viewer,/if \(audio && audio\.paused && !video\) void audio\.play/);
 assert.match(viewer,/data-story-sound-unlock/);
 assert.match(viewer,/resumeStoryTimer\(\);/);
});

test("Catalog limitations are clear to members without exposing provider diagnostics",()=>{
 assert.match(studio,/feedback\.textContent = message/);
 assert.match(studio,/Não foi possível concluir essa ação/);
 assert.match(studio,/onStatus: status, isAdmin/);
 assert.match(viewer,/bindStoryStudio\(root, client, userId, refresh, isAdmin\)/);
 assert.match(picker,/Você pode ouvir esta faixa aqui/);
 assert.doesNotMatch(picker,/Prévia promocional/);
 assert.match(picker,/isAdmin&&down\.length/);
});
