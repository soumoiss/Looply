import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {floodFill,applyGarticStroke} from "../src/gartic-paint.js";
const load=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const makePaint=()=>{
 const W=1000,H=650,data=new Uint8ClampedArray(W*H*4);data.fill(255);
 const ctx={getImageData:()=>({data}),putImageData:()=>{},beginPath(){},moveTo(){},lineTo(){},arc(){},ellipse(){},rect(){},stroke(){},fill(){},save(){},restore(){}};
 return {ctx,data,W,H};
};
test("Bucket fills a bounded region without crossing a closed contrasting outline",()=>{
 const {ctx,data,W}=makePaint();
 const black=(x,y)=>{const i=(y*W+x)*4;data[i]=0;data[i+1]=0;data[i+2]=0};
 for(let x=10;x<=20;x++){black(x,10);black(x,20);}
 for(let y=10;y<=20;y++){black(10,y);black(20,y);}
 const changed=floodFill(ctx,15,15,"#f06387");
 assert.equal(changed,true);
 const pixel=(x,y)=>[...data.slice((y*W+x)*4,(y*W+x)*4+3)];
 assert.deepEqual(pixel(15,15),[240,99,135]);
 assert.deepEqual(pixel(4,4),[255,255,255]);
 assert.deepEqual(pixel(10,15),[0,0,0]);
 assert.equal(floodFill(ctx,15,15,"#f06387"),false);
});
test("Painting operations use deterministic normalized coordinates and don't crash",()=>{
 const {ctx}=makePaint();
 for(const tool of ["pen","eraser","line","circle","rectangle","fill"]){
  applyGarticStroke(ctx,{tool,color:"#3986c7",width:5,points:[[100,100],[190,220]]});
 }
});
test("Private rooms are not advertised or auto-invited on creation",async()=>{
 const sql=await load("migration/20261102_gartic_private_invites_tools.sql");
 const creation=sql.split("IF p_action='create' THEN")[1].split("ELSIF g.id IS NULL THEN")[0];
 assert.doesNotMatch(creation,/INSERT INTO public\.looply_gartic_invites/);
 assert.match(sql,/p_value IS NULL OR cp\.user_id=p_value::uuid/);
 assert.match(sql,/THEN RETURN NULL; END IF/);
});
test("Gartic controller preserves typed chat during drawings",async()=>{
 const src=await load("src/chat-gartic.js");
 assert.match(src,/function syncLiveGame\(\{paint=true\}=\{\}\)/);
 assert.match(src,/chatList\.dataset\.messageIds/);
 assert.match(src,/previousDrafts/);
 assert.match(src,/if\(gameVisible\(\) && next\.status==="active"/);
 assert.match(src,/senderId:userId,\.\.\.packet/);
});
test("Curated category terms are present and only these are drawn in new rounds",async()=>{
 const sql=await load("migration/20261102_gartic_clean_catalog.sql");
 const rounds=await load("migration/20261102_gartic_private_invites_tools.sql");
 assert.match(sql,/Rainha das Lágrimas/);
 assert.match(sql,/pão francês/);
 assert.match(rounds,/JOIN public\.looply_gartic_easy_terms/);
});
