// Network smoke test of the deployed Cloudflare catalog discovery Worker.
// Run only in Actions (npm test uses deterministic mocked provider fixtures).
import assert from "node:assert/strict";
const endpoint="https://looply-story-music-search.s0upoetamoiss.workers.dev/search?q=anitta";
const response=await fetch(endpoint,{headers:{"Origin":"https://soumoiss.github.io"},signal:AbortSignal.timeout(20000)});
assert.equal(response.status,200,"Music discovery worker must be reachable: "+response.status);
assert.equal(response.headers.get("access-control-allow-origin"),"https://soumoiss.github.io");
const body=await response.json();
assert.deepEqual(body.providers.map(x=>x.provider),["apple","deezer"]);
assert.ok(body.providers.some(x=>x.available),"At least one public music catalog should respond.");
for(const item of body.providers.flatMap(p=>p.items||[])){
  assert.ok(item.title && item.artist && item.url, "Incomplete catalog item");
  assert.ok(!("preview" in item), "No licensed preview should be republished");
}
console.log("Music catalog live:",body.providers.map(x=>x.provider+": "+x.items.length+" results ("+(x.available?"online":"unavailable")+")"+(x.error?" "+x.error:"")).join(" | "));
try {
 const check=await fetch("https://itunes.apple.com/search?term=anitta&media=music&entity=song&country=br&limit=2",{signal:AbortSignal.timeout(10000)});
 console.log("Apple direct diagnostic: HTTP",check.status,"CORS",check.headers.get("access-control-allow-origin"),"Body start",(await check.text()).slice(0,120));
} catch(e) { console.log("Apple direct diagnostic:",e.message); }

const {searchStorySongs}=await import("../src/story-music-catalog.js");
const combined=await searchStorySongs("anitta");
const apple=combined.providers.find(p=>p.provider==="apple");
console.log("Apple direct fallback:",apple?.available?"online":"unavailable",apple?.items?.length||0,"songs");

const {officialSongPreview}=await import("../src/story-music-catalog.js");
const audition=combined.items.filter(song=>["apple","deezer"].includes(song.provider)&&song.previewUrl);
assert.ok(audition.length>0,"Provider must serve at least one transient preview audio URL for actual audition");
const validAudition=audition.map(officialSongPreview);
assert.ok(validAudition.some(x=>x?.kind==="audio"),"Native preview audio must be available");
console.log("Native preview audio:",audition.length,"tracks; sample provider",audition[0].provider,
  "sample media host",new URL(audition[0].previewUrl).hostname);
