import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {openStoryMusicPicker} from "../src/story-music-picker.js";
const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const studio=file("src/story-studio.js");
const viewer=file("src/stories.js");
const picker=file("src/story-music-picker.js");

test("Catalog music selection stays in app and never opens the device picker automatically",()=>{
 assert.match(studio,/if\(music\?\.kind==="catalog"\)/);
 assert.match(studio,/não pode ser incorporada ao Story/);
 assert.doesNotMatch(picker,/const needsOwnAudio=track=>track\.kind==="catalog"/);
 assert.match(picker,/onSelect\(track\)/);
 assert.doesNotMatch(picker,/fileInput\.click\(\)/);
  assert.doesNotMatch(picker,/catalogAwaitingUserAudio=track/);
 assert.doesNotMatch(picker,/data-studio-audio-file/);
 assert.doesNotMatch(picker,/Áudio próprio/);
 assert.match(studio,/music\.kind === "file"/);
});

test("Pre-arm WebAudio synchronously in publish handler, keep audio until the recorded output is finalized",()=>{
 assert.match(studio,/armedAudioContext = new AudioEngine\(\)/);
 assert.match(studio,/void armedAudioContext\.resume\(\)/);
 assert.match(studio,/const media = await exportFinal\(armedAudioContext\)/);
 assert.match(studio,/audioCtx = armedAudioContext \|\| new AudioEngine\(\)/);
 assert.match(studio,/withAudio\?audioFirst:videoFirst/);
 assert.match(studio,/attachStoryMusic\(audioCtx, destination, buffer, \{/);
 assert.match(studio,/framesStream\.addTrack\(t\)/);
 assert.match(studio,/audioCtx\.state !== "running"/);
 assert.match(studio,/if\s*\(source\) source\.start\(\)/);
});

test("Story player unblocks sound without auto-pausing it on same tap, and pauses with entire Story",()=>{
 assert.doesNotMatch(viewer,/audiusStoryStreamUrl/);
 assert.match(viewer,/video\.addEventListener\("playing", \(\) => \{/);
 assert.match(viewer,/playStoryAudio\(songAudio\)/);
 assert.match(viewer,/video\.muted = false/);
 assert.match(viewer,/video\.volume = 1/);
 assert.match(viewer,/state\.ignoreTapUntil=Date\.now\(\)\+450/);
 assert.match(viewer,/if \(audio && !audio\.paused\) stopStoryMediaPlayback\(audio/);
 assert.match(viewer,/if \(audio && audio\.paused\) void playStoryAudio\(audio\)/);
 assert.doesNotMatch(viewer,/data-story-sound-unlock/);
 assert.doesNotMatch(viewer,/data-story-official-toggle/);
 assert.match(viewer,/startStoryMediaPlayback\(video\)/);
 assert.doesNotMatch(viewer,/audiusStoryStreamUrl/);
 assert.match(viewer,/resumeStoryTimer\(\);/);
});

test("Catalog limitations are clear to members without exposing provider diagnostics",()=>{
 assert.match(studio,/feedback\.textContent = message/);
 assert.match(studio,/Não foi possível concluir essa ação/);
 assert.match(studio,/onStatus: status, isAdmin/);
 assert.match(viewer,/bindStoryStudio\(root, client, userId, refresh, isAdmin\)/);
 assert.match(picker,/A prévia desta plataforma serve para conhecer a faixa/);
 assert.doesNotMatch(picker,/Prévia promocional/);
 assert.match(picker,/some? fontes indisponíveis|algumas fontes indisponíveis/);
 assert.doesNotMatch(picker,/data-studio-provider="spotify"/);
});


test("Story song picker has no local file chooser and preserves catalog search",()=>{
  assert.doesNotMatch(picker,/fileInput|data-studio-audio-file|studio-audio-upload/);
  assert.match(picker,/searchCatalog\\(term/);
  assert.match(picker,/downloadLicensedStorySong\\(track/);
});

test("Story viewer floats its controls over uncropped media",()=>{
  const css=file("assets/css/pages/home.css");
  assert.match(css,/Stories immersive overlay v3/);
  assert.match(css,/\.story-viewer-dialog \.story-viewer-stage \{[\s\S]*?position: absolute !important/);
  assert.match(css,/object-fit: contain !important/);
  assert.match(css,/\.story-viewer-dialog \.story-viewer-actions,[\s\S]*?position: absolute !important/);
  assert.match(viewer,/video\.isConnected && mediaHost\.querySelector\("video"\) === video && !state\.paused/);
});
