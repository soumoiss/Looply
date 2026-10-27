import test from "node:test";
import assert from "node:assert/strict";
import {attachStoryMusic,hasAudibleStorySamples} from "../src/story-audio-mixer.js";

const buffer = samples => ({
  duration: samples.length/44100,
  numberOfChannels: 1,
  getChannelData: () => Float32Array.from(samples)
});

test("Story soundtrack rejects silence, empty data, and invalid buffers",()=>{
  assert.equal(hasAudibleStorySamples(null),false);
  assert.equal(hasAudibleStorySamples(buffer([])),false);
  assert.equal(hasAudibleStorySamples(buffer([0,0,0,0])),false);
  const context={createBufferSource(){throw Error("Do not create an audio source from silence");}};
  assert.throws(()=>attachStoryMusic(context,{},buffer([0,0,0])),/silencioso/);
});

test("Story soundtrack connects audible samples to the real recorder destination",()=>{
  const events=[];
  const source={buffer:null,loop:false,connect(dest){events.push(["connect",dest]);},start(){events.push(["start"]);}};
  const context={createBufferSource(){return source;}};
  const destination={name:"recorder-audio-track"};
  const track=attachStoryMusic(context,destination,buffer([0,0.02,0]));
  assert.equal(track,source);
  assert.equal(track.loop,true);
  assert.deepEqual(events,[["connect",destination]]);
  track.start();
  assert.deepEqual(events[1],["start"]);
});
