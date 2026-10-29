import test from "node:test";
import assert from "node:assert/strict";
import {
  playbackCoordinatorState, releaseMediaPlayback, requestMediaPlayback, setCallPlaybackActive
} from "../src/media-playback-coordinator.js";

const media = () => ({ paused: false, pauses: 0, pause(){ this.paused = true; this.pauses++; } });

test("Story interrompe o Feed e uma chamada impede mídia concorrente", () => {
  const feedOwner = {}, storyOwner = {}, feed = media(), soundtrack = media();
  assert.equal(requestMediaPlayback("feed", feedOwner, feed), true);
  assert.equal(requestMediaPlayback("story", storyOwner, soundtrack), true);
  assert.equal(feed.pauses, 1);
  setCallPlaybackActive(true);
  assert.equal(soundtrack.pauses, 1);
  assert.equal(requestMediaPlayback("story", storyOwner, soundtrack), false);
  assert.deepEqual(playbackCoordinatorState(), { scope:"", mediaCount:0, callActive:true });
  setCallPlaybackActive(false);
  releaseMediaPlayback(storyOwner);
});

test("vídeo e trilha do mesmo Story podem tocar juntos, sem outro escopo", () => {
  const owner = {}, video = media(), soundtrack = media();
  assert.equal(requestMediaPlayback("story", owner, video), true);
  assert.equal(requestMediaPlayback("story", owner, soundtrack), true);
  assert.equal(playbackCoordinatorState().mediaCount, 2);
  releaseMediaPlayback(owner);
  assert.equal(video.pauses, 1);
  assert.equal(soundtrack.pauses, 1);
});
