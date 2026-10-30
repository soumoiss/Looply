import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {cameraCaptureCrop, cameraMediaConstraints, containRect} from "../src/story-studio.js";
const src = await readFile(new URL("../src/story-studio.js", import.meta.url), "utf8");
const css = await readFile(new URL("../assets/css/pages/story-reels-viewport-fix.css", import.meta.url), "utf8");

test("default Story capture retains full sensor pixels at 1x for front and rear", () => {
  for (const facing of ["user", "environment"]) {
    const constraints = cameraMediaConstraints(facing);
    assert.equal(constraints.video.facingMode.ideal, facing);
    assert.equal(constraints.video.aspectRatio, undefined);
    for (const [width,height] of [[4032,3024],[1920,1080],[1080,1920],[1280,960],[1080,1080]]) {
      assert.deepEqual(cameraCaptureCrop(width,height,1080,1920,1),{x:0,y:0,width,height});
      const fit=containRect(width,height,1080,1920);
      assert.ok(fit.width<=1080 && fit.height<=1920);
      assert.ok(fit.x>=0 && fit.y>=0);
    }
  }
});
test("camera preview and encoded canvas are contain, not cover, at zoom 1", () => {
  const framed=css.slice(css.indexOf("/* Story camera shows"));
  assert.match(framed,/\\.studio-camera-framing \\.studio-camera[^\\{]*\\{[^}]*object-fit:contain!important/);
  assert.doesNotMatch(framed,/\\.studio-camera-framing \\.studio-camera[^\\{]*\\{[^}]*object-fit:cover!important/);
  assert.match(src,/const fit=containRect\\(crop.width,crop.height,canvas.width,canvas.height\\)/);
  assert.match(src,/fit.x,fit.y,fit.width,fit.height/);
  assert.doesNotMatch(src,/video:\\{facingMode:\\{ideal:facing\\},aspectRatio:/);
});
test("pinch alone causes an intentional symmetric camera crop", () => {
  const zoomed = cameraCaptureCrop(4032,3024,1080,1920,2);
  assert.deepEqual(zoomed,{x:1008,y:756,width:2016,height:1512});
  assert.match(src,/settings.zoom = 1; resetFlash\\(\\); updateZoomPreview\\(\\)/);
});
test("silent video recording is rejected before MediaRecorder begins", () => {
  const begin=src.slice(src.indexOf("const beginRecording ="),src.indexOf("const chooseFile ="));
  assert.match(begin,/const audioTracks=stream.getAudioTracks\\(\\).filter/);
  assert.match(begin,/if\\(!audioTracks.length\\) throw new Error/);
  assert.ok(begin.indexOf("if(!audioTracks.length)") < begin.indexOf("recorder = new MediaRecorder"));
});
