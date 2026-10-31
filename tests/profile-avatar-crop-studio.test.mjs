import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {avatarCropLayout,paintAvatarSquare,AVATAR_OUTPUT_SIZE,AVATAR_MAX_ZOOM} from "../src/avatar-crop-editor.js";
import {profileShellMarkup} from "../src/profile-page.js";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const person={id:"d17bbcab-8723-498b-b925-3d9be59fc19d",username:"peixinho",display_name:"Peixinho",
  avatarUrl:"https://example.com/old-photo.jpg"};

test("real crop always fills a square and never exposes empty margins",()=>{
  for(const [w,h] of [[4000,1000],[1000,4000],[2000,2000],[128,128],[1600,900],[900,1600]]){
    for(const angle of [0,90,180,270]){
      for(const zoom of [1,1.31,3.5]){
        const p=avatarCropLayout(w,h,zoom,angle,Number.POSITIVE_INFINITY,-5000);
        const rw=angle%180?h:w,rh=angle%180?w:h;
        assert.ok(rw*p.scale>=AVATAR_OUTPUT_SIZE-1e-7,JSON.stringify([w,h,angle]));
        assert.ok(rh*p.scale>=AVATAR_OUTPUT_SIZE-1e-7,JSON.stringify([w,h,angle]));
        assert.ok(p.x<=p.maxX&&p.x>=-p.maxX);
        assert.ok(p.y<=p.maxY&&p.y>=-p.maxY);
        assert.ok(Math.abs(p.x)+AVATAR_OUTPUT_SIZE/2<=rw*p.scale/2+1e-7);
        assert.ok(Math.abs(p.y)+AVATAR_OUTPUT_SIZE/2<=rh*p.scale/2+1e-7);
      }
    }
  }
});

test("pinch zoom and 90-degree rotation adapt crop limits to source orientation",()=>{
  const initial=avatarCropLayout(1200,800);
  assert.ok(initial.maxX>0);
  assert.equal(initial.maxY,0);
  const rotated=avatarCropLayout(1200,800,1,90,100000,100000);
  assert.equal(rotated.maxX,0);
  assert.ok(rotated.maxY>0);
  assert.equal(rotated.x,0);
  assert.equal(rotated.y,rotated.maxY);
  assert.equal(avatarCropLayout(1200,800,1000,450).zoom,AVATAR_MAX_ZOOM);
  assert.equal(avatarCropLayout(1200,800,-2,-90).rotation,270);
});

test("export draws exactly the same transformed square at 512px as circular preview",()=>{
  for(const size of [128,512]){
    const log=[],ctx={
      save(){log.push(["save"])},restore(){log.push(["restore"])},
      fillRect(...a){log.push(["fillRect",...a])},
      translate(...a){log.push(["translate",...a])},
      rotate(...a){log.push(["rotate",...a])},
      scale(...a){log.push(["scale",...a])},
      drawImage(...a){log.push(["drawImage",...a])}
    };
    const image={width:500,height:1000};
    const p=avatarCropLayout(500,1000,2,270,23,-40);
    paintAvatarSquare({width:size,height:size,getContext:()=>ctx},image,p);
    const drawn=log.find(x=>x[0]==="drawImage");
    assert.deepEqual(drawn,["drawImage",image,-250,-500,500,1000]);
    const origin=log.find(x=>x[0]==="translate");
    assert.equal(origin[1],size/2+p.x*size/512);
    assert.equal(origin[2],size/2+p.y*size/512);
    assert.ok(log.some(x=>x[0]==="rotate"&&x[1]===270*Math.PI/180));
    assert.deepEqual(log.at(-1),["restore"]);
  }
});

test("real profile page exposes photo action only to owner and no automatic center crop",async()=>{
  const own=profileShellMarkup(true,false,person),other=profileShellMarkup(false,false,person);
  assert.match(own,/data-pr-avatar-change/);
  assert.match(own,/aria-label="Editar foto de perfil"/);
  assert.doesNotMatch(own,/type="file"/);
  assert.doesNotMatch(other,/data-pr-avatar-change/);
  const source=await read("src/profile-page.js");
  assert.match(source,/mountProfileAvatarEditor/);
  assert.match(source,/saveNeonProfile\(\{profileId:user\.id/);
  assert.match(source,/avatarFile:null/);
  assert.doesNotMatch(source,/prepareProfileAvatar\(/);
  assert.doesNotMatch(source,/pendingAvatar/);
  assert.match(source,/looply:avatar-updated/);
  assert.match(source,/bus\?\.postMessage/);
  assert.match(source,/avatarEditor\?\.dispose\(\)/);
});

test("the editor has real input choices, 2-pointer interaction, a 512px jpeg export, and verified R2 save",async()=>{
  const source=await read("src/avatar-crop-editor.js");
  for(const text of ["data-avatar-pick=\"gallery\"","data-avatar-pick=\"camera\"",
    "capture=\"user\"","data-avatar-cancel","data-avatar-stage","data-avatar-preview",
    "data-avatar-rotate","data-avatar-reset","data-avatar-zoom","pointerdown",
    "pointermove","pointercancel","pointerup","lostpointercapture","data-avatar-confirm",
    "prepareAvatarSource(file)","avatarPreviewFromBitmap(source.bitmap)",
    "saveNeonAvatarOnly({","onSaved(saved)","URL.revokeObjectURL","bitmap?.close"]){
      assert.ok(source.includes(text),text);
  }
  assert.match(source,/canvas\.width=canvas\.height=AVATAR_OUTPUT_SIZE/);
  assert.match(source,/new File\(\[jpeg\],"avatar-looply\.jpg",\{type:"image\/jpeg"/);
  assert.match(source,/const session=await client\.auth\.getSession\(\)/);
  assert.match(source,/root\.append\(host\)/);
  const css=await read("assets/css/pages/profile.css");
  assert.match(css,/\.pr-avatar-stage\{[^}]*touch-action:none/);
  assert.match(css,/\.pr-avatar-crop::backdrop/);
  assert.match(css,/@media\(max-width:480px\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test("R2 atomic save is established and never deletes old avatar before signed verification",async()=>{
  const s=await read("src/neon-avatar-profile.js");
  const fn=s.slice(s.indexOf("export async function saveNeonAvatarOnly("));
  assert.ok(fn.indexOf("bucket.upload(")<fn.indexOf("writeOnlyAvatar("));
  assert.ok(fn.indexOf("writeOnlyAvatar(")<fn.indexOf("bucket.createSignedUrl("));
  assert.ok(fn.indexOf("bucket.createSignedUrl(")<fn.indexOf("bucket.remove([previousPath])"));
  assert.match(fn,/profile-update-not-confirmed/);
  assert.match(fn,/avatar-rollback-failed/);
});
