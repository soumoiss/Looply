// Network smoke test of the deployed Cloudflare catalog discovery Worker.
// Run only in Actions (npm test uses deterministic mocked provider fixtures).
import assert from "node:assert/strict";
const endpoint="https://looply-story-music-search.s0upoetamoiss.workers.dev/search?q=anitta";
const response=await fetch(endpoint,{headers:{"Origin":"https://soumoiss.github.io"},signal:AbortSignal.timeout(20000)});
assert.equal(response.status,200,"Music discovery worker must be reachable: "+response.status);
assert.equal(response.headers.get("access-control-allow-origin"),"https://soumoiss.github.io");
const body=await response.json();
assert.deepEqual(body.providers.map(x=>x.provider),["apple","deezer","audius"]);
assert.ok(body.providers.some(x=>x.available),"At least one public music catalog should respond.");
for(const item of body.providers.flatMap(p=>p.items||[])){
  assert.ok(item.title && item.artist && item.url, "Incomplete catalog item");
  assert.ok(!("preview" in item), "No licensed preview should be republished");
}
console.log("Music catalog live:",body.providers.map(x=>x.provider+": "+x.items.length+" results ("+(x.available?"online":"unavailable")+")").join(" | "));
