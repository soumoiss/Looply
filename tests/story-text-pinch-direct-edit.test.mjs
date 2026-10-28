import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
 STORY_TEXT_FONTS,storyTextNormalize,storyTextClampSize,storyTextPinchSize,
 storyTextClampPosition,storyTextFont,storyTextLayerLayout,storyTextWrap,
 storyTextPaintLayer,storyTextEnsureFonts,bindStoryTextGestures
} from "../src/story-text-layers.js";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
function gestureFixture(){
 const element=new EventTarget();let now=100;
 let position={x:.5,y:.44},size=34,selected=0,edited=0;
 const unsubscribe=bindStoryTextGestures(element,{
  getPosition:()=>position,setPosition:p=>{position=p},
  getSize:()=>size,setSize:value=>{size=value},
  getBounds:()=>({width:400,height:700}),
  select:()=>{selected++},edit:()=>{edited++},
  clock:()=>now
 });
 function fire(type,id,x,y){
  const event=new Event(type,{bubbles:true,cancelable:true});
  Object.assign(event,{pointerId:id,clientX:x,clientY:y});
  element.dispatchEvent(event);
  return event;
 }
 return {fire,unsubscribe,get position(){return position},get size(){return size},
  get selected(){return selected},get edited(){return edited},set time(value){now=value}};
}
test("real pointerdown/move/up handlers drag one layer without opening the keyboard",()=>{
 const g=gestureFixture();
 g.fire("pointerdown",1,100,120);
 g.fire("pointermove",1,140,190);
 g.fire("pointerup",1,140,190);
 assert.equal(g.position.x,.6);
 assert.equal(g.position.y,.54);
 assert.equal(g.edited,0);
 assert.ok(g.selected>0);
 g.unsubscribe();
});
test("two-finger pinch grows continuously and shrinks to a recoverable minimum without moving the text",()=>{
 const g=gestureFixture(),before=g.position;
 g.fire("pointerdown",1,100,100);
 g.fire("pointerdown",2,200,100);
 g.fire("pointermove",2,250,100);assert.equal(g.size,51);
 g.fire("pointermove",2,300,100);assert.equal(g.size,68);
 g.fire("pointermove",2,108,100);assert.equal(g.size,18);
 g.fire("pointerup",2,108,100);
 g.fire("pointerup",1,100,100);
 assert.deepEqual(g.position,before);
 assert.equal(g.edited,0);
});
test("a single tap selects, a deliberate second tap edits, and gestures do not emulate taps",()=>{
 const g=gestureFixture();
 g.time=100;g.fire("pointerdown",1,20,30);g.fire("pointerup",1,20,30);
 assert.equal(g.selected,1);assert.equal(g.edited,0);
 g.time=260;g.fire("pointerdown",1,20,30);g.fire("pointerup",1,20,30);
 assert.equal(g.edited,1);
 g.time=700;g.fire("pointerdown",1,20,30);g.fire("pointermove",1,180,30);g.fire("pointerup",1,180,30);
 assert.equal(g.edited,1);
});
test("pointercancel does not edit; long drags stay inside safe bounds",()=>{
 const g=gestureFixture();
 g.fire("pointerdown",1,100,100);
 g.fire("pointermove",1,-1800,3000);
 g.fire("pointercancel",1,-1800,3000);
 assert.ok(g.position.x>=.07&&g.position.y<=.93);
 assert.equal(g.edited,0);
});
test("Unicode normalization preserves line breaks, diacritics and emoji graphemes",()=>{
 const value="Olá, bênção!\r\n🎉🥳\nCoração 💜\nÚltima linha";
 assert.equal(storyTextNormalize(value),"Olá, bênção!\n🎉🥳\nCoração 💜\nÚltima linha");
 assert.equal(storyTextNormalize("A\u0000B\nC"),"AB\nC");
 assert.ok(storyTextClampSize(-900)>=18);
 assert.equal(storyTextClampSize(900),94);
 assert.equal(storyTextPinchSize(34,100,200),68);
 assert.equal(storyTextPinchSize(34,100,1),18);
 assert.deepEqual(storyTextClampPosition(Infinity,NaN),{x:.5,y:.5});
});
test("five clearly different font faces load before export",async()=>{
 const all=Object.values(STORY_TEXT_FONTS);
 assert.equal(all.length,5);
 assert.equal(new Set(all.map(f=>f.face)).size,5);
 assert.ok(all.some(f=>f.face==="Caveat"));
 assert.ok(all.some(f=>f.face==="Playfair Display"));
 assert.ok(all.some(f=>f.face==="Manrope"));
 const loaded=[];
 const fonts={load:async css=>{loaded.push(css);return [{family:css}]}};
 assert.equal(await storyTextEnsureFonts(["modern","handwritten","serif","bold","mono"],fonts),true);
 assert.equal(loaded.length,5);
 assert.ok(loaded.some(s=>s.includes("Caveat")));
 assert.equal(await storyTextEnsureFonts(["handwritten"],{load:async()=>[]}),false);
});
test("the exact same text model wraps and paints at mobile and 1080p canvas scales",()=>{
 const ctx={font:"",drawn:[],measureText(s){return {width:Array.from(s).length*(Number(this.font.match(/[\d.]+px/)?.[0].replace("px",""))||34)*.55}},save(){},restore(){},fillText(str,x,y){this.drawn.push({str,x,y})}};
 const model={text:"Olá, Moisés! 🥳\nParabéns pelo dia!\nTexto mais comprido que precisa quebrar em outra linha",
  x:.44,y:.51,size:34,font:"serif",color:"#ffccdd"};
 const layout=storyTextLayerLayout(ctx,model,1080,1920);
 const lines=storyTextWrap(ctx,model.text,1080*.85);
 assert.deepEqual(layout.lines,lines);
 assert.ok(layout.lines.length>=3);
 assert.ok(layout.lines.some(l=>l.includes("Moisés")));
 assert.ok(layout.lines.some(l=>l.includes("🥳")));
 const painted=storyTextPaintLayer(ctx,model,1080,1920);
 assert.equal(painted.startY,layout.startY);
 assert.equal(ctx.drawn.length,layout.lines.length);
 assert.ok(ctx.drawn.every(x=>x.x===model.x*1080));
 assert.equal(storyTextFont("serif").face,"Playfair Display");
});
test("existing story editor really imports gesture controller and embeds text into exported media",async()=>{
 const [studio,css,home]=await Promise.all([read("src/story-studio.js"),read("assets/css/pages/story-studio.css"),read("home.html")]);
 assert.match(studio,/bindStoryTextGestures\(el,/);
 assert.match(studio,/storyTextPaintLayer\(ctx,/);
 assert.match(studio,/await storyTextEnsureFonts\(fontIds\)/);
 assert.match(studio,/paintLayers\(ctx, overlayRoot/);
 assert.match(studio,/data-studio-edit-selected/);
 assert.match(studio,/data-layer-text rows="4" maxlength="500"/);
 assert.match(studio,/freezeEditorPlane\(\)/);
 assert.match(studio,/unfreezeEditorPlane\(\)/);
 assert.match(studio,/if\(createdNow\)\{el.remove\(\);selectLayer\(null\);\}/);
 assert.match(studio,/openLayerEditor\(addLayer\("", false\),true\)/);
 assert.match(css,/font-family/); // via Google import and specific font cards
 assert.match(css,/family=Caveat/);
 assert.match(css,/studio-overlays \.studio-overlay\.is-selected/);
 assert.match(home,/story-studio\.css/);
});
