import test from "node:test";
import assert from "node:assert/strict";
import { requestMediaPlayback, setCallPlaybackActive, playbackCoordinatorState, releaseMediaPlayback } from "../src/media-playback-coordinator.js";

test("starting a first-ever audio/video call from idle never dereferences a null playback session", () => {
  setCallPlaybackActive(false);
  assert.doesNotThrow(() => setCallPlaybackActive(true));
  assert.equal(playbackCoordinatorState().callActive,true);
  setCallPlaybackActive(false);
  assert.equal(playbackCoordinatorState().callActive,false);
});

test("starting call pauses existing non-call media and releases playback owner", () => {
  setCallPlaybackActive(false);
  let paused=0;
  const media={paused:false,pause(){paused++;this.paused=true;}};
  const owner={};
  assert.equal(requestMediaPlayback("story",owner,media),true);
  setCallPlaybackActive(true);
  assert.equal(paused,1);
  assert.equal(playbackCoordinatorState().mediaCount,0);
  assert.equal(playbackCoordinatorState().callActive,true);
  assert.equal(requestMediaPlayback("story",owner,media),false);
  setCallPlaybackActive(false);
  releaseMediaPlayback(owner);
});
