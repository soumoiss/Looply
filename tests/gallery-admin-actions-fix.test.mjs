import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../backend/neon-storage/index.mjs';
import {createNeonRestQuery} from '../src/neon-rest-bridge.js';
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const env={NEON_DATA_API_URL:'https://data.example/rest/v1',AWS_ENDPOINT_URL_S3:'https://objects.example',AWS_ACCESS_KEY_ID:'test',AWS_SECRET_ACCESS_KEY:'test',AWS_REGION:'us-east-1'};
for (const [bucket,path] of [['looply-gallery',`gallery/${other}/33333333-3333-4333-8333-333333333333.jpg`],['looply-media','legacy-archive/midia/test.jpg']]) {
 for (const allowed of [true,false]) test(`storage deletion ${bucket} ADM authorization=${allowed}`,async()=>{
  const prevFetch=globalThis.fetch;const prevEnv={...process.env};Object.assign(process.env,env);let deletes=0,checks=0;
  globalThis.fetch=async(url,opts={})=>{
   if(String(url).includes('/v3_self_profile?')) return Response.json([{id:owner}]);
   if(String(url).endsWith('/rpc/v7_gallery_storage_delete_allowed')) {checks++;assert.deepEqual(JSON.parse(opts.body),{p_bucket:bucket,p_path:path});assert.equal(opts.headers.authorization,'Bearer test');return Response.json(allowed);}
   if(String(url).startsWith('https://objects.example/')){deletes++;assert.equal(opts.method,'DELETE');return new Response(null,{status:204});}
   throw Error('Unexpected '+url);
  };
  try{const res=await handler.fetch(new Request('https://storage.example/storage/remove',{method:'POST',headers:{origin:'https://soumoiss.github.io',authorization:'Bearer test','x-looply-bucket':bucket,'x-looply-path':path}}));assert.equal(res.status,allowed?200:403);assert.equal(checks,1);assert.equal(deletes,allowed?1:0);}
  finally{globalThis.fetch=prevFetch;for(const k of Object.keys(env)){if(prevEnv[k]===undefined)delete process.env[k];else process.env[k]=prevEnv[k];}}
 });
}
test('archive delete reaches authenticated API and returns the deleted id',async()=>{
 let called=false;const q=createNeonRestQuery('archive_media',{dataApiUrl:'https://data.example',getAccessToken:async()=>'test',fetchImpl:async(url,opts)=>{called=true;assert.equal(opts.method,'DELETE');assert.equal(new URL(url).searchParams.get('id'),'eq.'+other);assert.equal(opts.headers.prefer,'return=representation');return Response.json([{id:other}]);}});
 const r=await q.delete().eq('id',other).select('id');assert.equal(r.error,null);assert.equal(called,true);assert.equal(r.data[0].id,other);
});
