import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadStoryEffectCatalog,loadStoryEffectManifest,DEFAULT_STORY_EFFECTS} from "../src/story-ar-catalog.js";
import {StoryFaceLens} from "../src/story-ar.js";
const text=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Instagram-like lenses replace the old color-only filter carousel",async()=>{
  const studio=await import("../src/story-studio.js");
  const markup=studio.storyStudioMarkup("");
  const ids=["none","big-eyes","big-mouth","clown","sunglasses","skincare"];
  for(const id of ids)assert.ok(markup.includes('data-studio-lens="'+id+'"'),id);
  for(const old of ["Quente","Frio","P&B","Vivo","data-studio-filter","data-studio-face"])
    assert.ok(!markup.includes(old),"Removed legacy effect: "+old);
  assert.deepEqual(DEFAULT_STORY_EFFECTS.map(x=>x.id),ids);
  assert.match(markup,/data-studio-lens-chooser/);
});
test("All lens files are valid, self-hosted and safe to load from index",async()=>{
  const index=JSON.parse(text("assets/story-effects/index.json"));
  assert.equal(index.schemaVersion,1);
  assert.equal(index.effects.length,6);
  for(const effect of index.effects){
    assert.ok(/^[a-z0-9-]+\.json$/.test(effect.file));
    const file=JSON.parse(text("assets/story-effects/lenses/"+effect.file));
    assert.equal(file.id,effect.id);
    assert.equal(file.type,effect.type);
    assert.equal(file.license,"original-looply-procedural");
    if(file.type==="warp")assert.ok(file.strength>0&&file.strength<=.85);
  }
  const catalog=await loadStoryEffectCatalog(async()=>new Response(JSON.stringify(index),{status:200}));
  assert.equal(catalog.length,6);
  const clown=await loadStoryEffectManifest(catalog.find(x=>x.id==="clown"),
    async()=>new Response(text("assets/story-effects/lenses/clown.json"),{status:200}));
  assert.equal(clown.params.noseColor,"#f32c4c");
  assert.equal(clown.id,"clown");
});
test("Reject external, malformed or tampered lens packages",async()=>{
  await assert.rejects(
    loadStoryEffectManifest({id:"evil",type:"warp",name:"Attacker",file:"../../other.json"}),
    /inválido/i);
  await assert.rejects(
    loadStoryEffectManifest({id:"big-eyes",type:"warp",file:"big-eyes.json"},
      async()=>new Response('{"id":"clown","type":"paint"}')),
    /incompatível/i);
  const face=await loadStoryEffectManifest({id:"big-eyes",type:"warp",file:"big-eyes.json"},
    async()=>new Response('{"id":"big-eyes","type":"warp","strength":99,"params":{"x":"<script>","cheekColor":"#abcdef"}}'));
  assert.equal(face.strength,.85);
  assert.equal(face.params.x,undefined);
  assert.equal(face.params.cheekColor,"#abcdef");
});
test("AR uses real camera frame compositing, WebGL pixel deformation, 3D geometry and MediaPipe",()=>{
  const studio=text("src/story-studio.js"),ar=text("src/story-ar.js");
  const warp=text("src/story-ar-warp.js"),glasses=text("src/story-ar-3d.js"),paint=text("src/story-ar-paint.js");
  assert.match(ar,/FaceLandmarker\.createFromOptions/);
  assert.match(ar,/detectForVideo/);
  assert.match(ar,/FaceWarpGPU/);
  assert.match(ar,/ctx\.drawImage\(this\.warper\.canvas/);
  assert.match(warp,/gl\.texImage2D\(/);
  assert.match(warp,/gl\.uniform1f\(this\.u\.power,strength\)/);
  assert.match(glasses,/new THREE\.WebGLRenderer/);
  assert.match(glasses,/new THREE\.TorusGeometry/);
  assert.match(paint,/manifest\.id==="clown"/);
  assert.match(paint,/manifest\.id==="skincare"/);
  assert.match(studio,/loadStoryEffectManifest/);
  assert.match(studio,/drawLayer\(lens\)/);
  // Color corrections are separate from AR facial lenses and do not replace MediaPipe.
  assert.match(studio,/loadStoryEffectManifest/);
  assert.match(studio,/\[data-studio-effects-open\]/);
  assert.ok(StoryFaceLens.prototype.prepare instanceof Function);
});
