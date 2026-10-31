import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCallIceGate } from "../src/call-ice-gate.js";

const candidate = n => ({ toJSON: () => ({ candidate: "candidate:" + n }) });
const flush = () => new Promise(resolve => setImmediate(resolve));

test("initial ICE candidates are carried by gathered SDP, not sent before the offer", async () => {
  const sent = [];
  const peer = {};
  const gate = createCallIceGate(value => { sent.push(value); return Promise.resolve("ok"); });
  gate.bind(peer);
  peer.onicecandidate({ candidate: candidate("host") });
  peer.onicecandidate({ candidate: candidate("srflx") });
  peer.onicecandidate({ candidate: null });
  await flush();
  assert.deepEqual(sent, [], "premature ICE flood would precede the actual offer");
  gate.markDescriptionSent(peer);
  peer.onicecandidate({ candidate: candidate("late-relay") });
  await flush();
  assert.deepEqual(sent, [{candidate:"candidate:late-relay"}], "late ICE must still reach the callee");
  gate.reset();
  peer.onicecandidate({ candidate: candidate("after-hangup") });
  await flush();
  assert.equal(sent.length, 1, "hanging up must stop ICE writes");
});

test("replaced peer cannot leak ICE candidates into a subsequent call", async () => {
  const sent = [];
  const gate = createCallIceGate(value => { sent.push(value); return "ok"; });
  const first = {}, second = {};
  gate.bind(first);
  gate.markDescriptionSent(first);
  gate.bind(second);
  gate.markDescriptionSent(first);
  first.onicecandidate({ candidate: candidate("stale") });
  second.onicecandidate({ candidate: candidate("initial") });
  await flush();
  assert.deepEqual(sent, []);
  gate.markDescriptionSent(second);
  second.onicecandidate({ candidate: candidate("new") });
  await flush();
  assert.deepEqual(sent, [{candidate:"candidate:new"}]);
});

test("production controller connects the gate to both negotiated offer and answer", async () => {
  const source = await readFile(new URL("../src/chat-calls.js", import.meta.url), "utf8");
  assert.match(source, /createCallIceGate\(candidate => send\("ice", \{ candidate \}\)\)/);
  assert.match(source, /iceGate\.bind\(pc\)/);
  assert.match(source, /if \(!sent\) throw new Error\("offer could not be sent"\);\s*iceGate\.markDescriptionSent\(pc\)/);
  assert.match(source, /if \(!sent\) throw new Error\("answer could not be sent"\);\s*iceGate\.markDescriptionSent\(pc\)/);
  assert.match(source, /const releaseMedia = \(\) => \{\s*iceGate\.reset\(\)/);
  assert.match(source, /waitForIceGatheringComplete\(pc\)/);
});
