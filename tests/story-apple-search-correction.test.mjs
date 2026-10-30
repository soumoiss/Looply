import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { foldStorySearch, suggestStoryQueryFromApple } from "../src/story-apple-search-correction.js";
import { storyMusicCanPublish } from "../src/story-music-picker.js";

const apple=(title,artist)=>({kind:"catalog",provider:"apple",title,artist});
test("Portuguese diacritics, spacing and common artist typos normalize safely",()=>{
 assert.equal(foldStorySearch("  MÚSICA  dÁ  Noite!  "),"musica da noite");
 assert.equal(suggestStoryQueryFromApple("anita envolver",[apple("Envolver","Anitta")]),"Envolver Anitta");
 assert.equal(suggestStoryQueryFromApple("envolver anita",[apple("Envolver","Anitta")]),"Envolver Anitta");
 assert.equal(suggestStoryQueryFromApple("envolver anitta",[apple("Envolver","Anitta")]),"");
 assert.equal(suggestStoryQueryFromApple("envover",[apple("Envolver","Anitta")]),"Envolver Anitta");
});
test("Apple searches cannot turn preview-only music into a licensed Story soundtrack",()=>{
 const song=apple("Envolver","Anitta");
 assert.equal(storyMusicCanPublish(song),false);
 assert.equal(storyMusicCanPublish({...song,previewUrl:"https://audio-ssl.itunes.apple.com/example.m4a"}),false);
 assert.equal(suggestStoryQueryFromApple("desconhecido",[song]),"");
 assert.equal(suggestStoryQueryFromApple("outra música",[song]),"");
 assert.equal(suggestStoryQueryFromApple("envolver",[{...song,provider:"spotify"}]),"");
});
test("picker uses Apple for typo correction and keeps multiple sources in initial results",()=>{
 const src=readFileSync(new URL("../src/story-music-picker.js",import.meta.url),"utf8");
 assert.match(src,/searchApple=searchAppleMusicPublic/);
 assert.match(src,/catalogTask\.then\(async/);
 assert.match(src,/suggestStoryQueryFromApple\(term,appleResults\)/);
 assert.match(src,/if\(closed\|\|ticket!==seq\|\|current\.signal\.aborted\|\|items\.length\)return/);
 assert.match(src,/update\(match\?\.items\|\|\[\]\)/);
 assert.match(src,/received\.push\(\.\.\.tracks\)/);
 assert.match(src,/searchCatalog=searchStorySongs/);
 assert.match(src,/items\.filter\(storyMusicCanPublish\)/);
 assert.doesNotMatch(src,/items\s*=\s*appleResults/);
});
