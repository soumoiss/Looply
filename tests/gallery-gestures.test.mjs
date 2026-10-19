import assert from "node:assert/strict";
import test from "node:test";
import { createGalleryGestureController } from "../assets/js/gallery-gestures.js";

const bounds = () => ({ stageWidth: 320, stageHeight: 240, mediaWidth: 240, mediaHeight: 180 });

test("pinch keeps its midpoint anchored while scale changes", () => {
  const gestures = createGalleryGestureController({ getBounds: bounds });
  gestures.beginPointer(1, 100, 120);
  gestures.beginPointer(2, 220, 120);
  gestures.movePointer(1, 70, 120);
  gestures.movePointer(2, 250, 120);

  const state = gestures.getState();
  assert.equal(state.scale, 1.5);
  assert.equal(state.x, 0);
  assert.equal(state.y, 0);
  assert.equal(state.mode, "pinch");
});

test("one-finger pan is clamped and scale-one drag remains a swipe", () => {
  const gestures = createGalleryGestureController({ getBounds: bounds });
  gestures.beginPointer(1, 100, 100);
  gestures.movePointer(1, 260, 100);
  assert.equal(gestures.getState().mode, "swipe");
  gestures.endPointer(1);

  gestures.beginPointer(1, 100, 100);
  gestures.beginPointer(2, 180, 100);
  gestures.movePointer(2, 260, 100);
  gestures.endPointer(2);
  gestures.movePointer(1, 400, 400);
  const state = gestures.getState();
  assert.equal(state.mode, "pan");
  assert.equal(state.x, 80);
  assert.equal(state.y, 60);
});

test("reset returns to the neutral transform", () => {
  const gestures = createGalleryGestureController({ getBounds: bounds });
  gestures.beginPointer(1, 100, 100);
  gestures.beginPointer(2, 180, 100);
  gestures.movePointer(2, 260, 100);
  gestures.reset();
  assert.deepEqual(gestures.getTransform(), { x: 0, y: 0, scale: 1 });
});

test("swipe deltas are scoped to one gesture", () => {
  const gestures = createGalleryGestureController({ getBounds: bounds });
  gestures.beginPointer(1, 0, 0);
  gestures.movePointer(1, 100, 0);
  assert.equal(gestures.endPointer(1).swipeX, 100);

  gestures.beginPointer(2, 0, 0);
  assert.equal(gestures.endPointer(2).swipeX, 0);
});
