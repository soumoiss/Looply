import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { appendRecordedAudio, voiceRecordingElapsedMs } from "../src/chat.js";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Android WebView native reload never floats over the Looply settings menu", async () => {
  const activity = await read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
  assert.match(activity, /contentDescription = "Recarregar Looply"/);
  assert.match(activity, /errorPanel\.addView\(\s*retryButton/);
  assert.match(activity, /private fun reloadCurrentPage\(\)/);
  assert.match(activity, /mainHandler\.postDelayed/);
  assert.match(activity, /onRenderProcessGone/);
  assert.doesNotMatch(activity, /root\.addView\(reloadControl/);
  assert.doesNotMatch(activity, /Gravity\.TOP or Gravity\.END\)\.apply\s*\{\s*rightMargin = dp\(10\)/);
});

test("WebView media permission honors Android runtime and rejects untrusted origins", async () => {
  const activity = await read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
  assert.match(activity, /request\.origin\.host\?\.lowercase\(\) != GITHUB_PAGES_HOST/);
  assert.match(activity, /request\.origin\.port !in listOf\(-1, 443\)/);
  assert.match(activity, /PermissionRequest\.RESOURCE_AUDIO_CAPTURE/);
  assert.match(activity, /Manifest\.permission\.RECORD_AUDIO/);
  assert.match(activity, /PermissionRequest\.RESOURCE_VIDEO_CAPTURE/);
  assert.match(activity, /Manifest\.permission\.CAMERA/);
  assert.match(activity, /request\.deny\(\)/);
  assert.match(activity, /onPermissionRequestCanceled/);
  assert.match(activity, /pendingWebResources = emptyArray\(\)/);
  assert.match(activity, /shouldShowRequestPermissionRationale\(it\)/);
  assert.match(activity, /Settings\.ACTION_APPLICATION_DETAILS_SETTINGS/);
  assert.match(activity, /Abrir configurações/);
});

test("Recorded audio is appended to FormData when input.files is unavailable", () => {
  const recording = new File([new Uint8Array([0, 1, 2, 3])], "gravacao-teste.webm", {type:"audio/webm"});
  const form = { _looplyRecordedFile: recording };
  const data = new FormData();
  data.set("body", "");
  assert.equal(appendRecordedAudio(form, data), true);
  assert.equal(data.getAll("files").length, 1);
  assert.equal(data.getAll("files")[0].size, 4);
  assert.equal(data.getAll("files")[0].type, "audio/webm");
  assert.equal(appendRecordedAudio(form, data), false);
  assert.equal(data.getAll("files").length, 1);
});

test("Recording fallback handles missing audio, empty files and existing attachments", () => {
  const empty = new FormData();
  assert.equal(appendRecordedAudio({}, empty), false);
  const invalid = new File([], "empty.webm", {type:"audio/webm"});
  assert.equal(appendRecordedAudio({_looplyRecordedFile:invalid}, empty), false);
  assert.equal(empty.getAll("files").length, 0);
  const photo = new File([new Uint8Array([42])], "photo.png", {type:"image/png"});
  empty.append("files",photo);
  const audio = new File([new Uint8Array([1,2,3])], "voice.webm", {type:"audio/webm"});
  assert.equal(appendRecordedAudio({_looplyRecordedFile:audio}, empty), true);
  assert.deepEqual(empty.getAll("files").map(f=>f.name),["photo.png","voice.webm"]);
});

test("Pause and stop controls never discard a paused recording", async () => {
  const source = await read("src/chat.js");
  assert.match(source, /\["recording", "paused"\]\.includes\(state\.recorder\.state\)/);
  assert.match(source, /typeof DataTransfer !== "function"/);
  assert.match(source, /if \(!form\.isConnected\)/);
  assert.match(source, /appendRecordedAudio\(form, values\)/);
  assert.equal(voiceRecordingElapsedMs({startedAt:1000,pausedAt:3000,pausedTotal:0},5000),2000);
});

test("Calls on web and Android block duplicate capture and require an authenticated channel", async () => {
  const calls = await read("src/chat-calls.js");
  assert.match(calls,/if \(startingCall \|\| answeringCall \|\| pc \|\| localStream\) return/);
  assert.match(calls,/if \(!incomingOffer \|\| answeringCall \|\| pc\) return/);
  assert.match(calls,/if \(session\.error \|\| !session\.data\?\.session\?\.access_token\)/);
  assert.match(calls,/call_auth_required/);
  assert.match(calls,/finally \{\s*startingCall = false;/);
  assert.match(calls,/finally \{\s*answeringCall = false;/);
  assert.match(calls,/const liveChannel = await ensureChannel\(\)/);
  assert.match(calls,/await waitForIceGatheringComplete\(pc\)/);
});
