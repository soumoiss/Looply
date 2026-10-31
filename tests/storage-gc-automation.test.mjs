import test from 'node:test';
import assert from 'node:assert/strict';
import {safeDeleteCandidate,runMaintenance} from '../backend/neon-storage-gc/index.mjs';
const uuid='12345678-1234-4234-9234-123456789abc';
const key='stories/'+uuid+'/'+uuid+'.jpg';
test('only generated production keys can be garbage collected',()=>{
  assert.equal(safeDeleteCandidate('looply-media',key),true);
  assert.equal(safeDeleteCandidate('looply-gallery','gallery/'+uuid+'/'+uuid+'.webp'),true);
  assert.equal(safeDeleteCandidate('looply-chat','conversations/'+uuid+'/'+uuid+'/'+uuid+'.webm'),true);
  for(const path of ['recovered/'+uuid+'/'+uuid+'.jpg','legacy-archive/midia/a.jpg',
    'recovery-20261025/a.jpg','../stories/'+uuid+'/'+uuid+'.jpg',
    'posts/'+uuid+'/../../secret.jpg']) {
    assert.equal(safeDeleteCandidate('looply-media',path),false,path);
  }
  assert.equal(safeDeleteCandidate('looply-stickers','stickers/'+uuid+'/'+uuid+'.webp'),false);
  assert.equal(safeDeleteCandidate('looply-media','posts/not-a-valid-uuid/media.jpg'),false);
});
test('expiry cleanup enqueues via database then deletes only unreferenced storage objects',async()=>{
  const calls=[],removed=[];
  const query=async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes('gc_expired_stories'))return [{removed:1}];
    if(sql.includes('gc_claim_jobs'))return [{id:12,bucket:'looply-media',object_key:key,attempts:1}];
    if(sql.includes('gc_reference_count'))return [{n:0}];
    return [];
  };
  const output=await runMaintenance({query,remove:async(bucket,object)=>removed.push([bucket,object])});
  assert.deepEqual(output,{expired:1,cleaned:1,protected:0,retry:0});
  assert.deepEqual(removed,[['looply-media',key]]);
  assert.ok(calls.some(c=>c.sql.includes('gc_finish_job')&&c.params[1]==='done'));
});
test('an active reference protects the media even after a deletion request',async()=>{
  const removed=[],logs=[];
  const query=async(sql,params=[])=>{
    if(sql.includes('gc_expired_stories'))return [{removed:0}];
    if(sql.includes('gc_claim_jobs'))return [{id:20,bucket:'looply-media',object_key:key,attempts:1}];
    if(sql.includes('gc_reference_count'))return [{n:1}];
    logs.push(params);return [];
  };
  const output=await runMaintenance({query,remove:async(...p)=>removed.push(p)});
  assert.equal(output.protected,1);
  assert.equal(removed.length,0);
  assert.equal(logs[0][1],'protected');
});
test('failed deletes remain queued for retry without claiming success',async()=>{
  const changes=[];
  const query=async(sql,params=[])=>{
    if(sql.includes('gc_expired_stories'))return [{removed:0}];
    if(sql.includes('gc_claim_jobs'))return [{id:22,bucket:'looply-media',object_key:key,attempts:2}];
    if(sql.includes('gc_reference_count'))return [{n:0}];
    changes.push(params);return [];
  };
  const output=await runMaintenance({query,remove:async()=>{throw Error('storage outage')}});
  assert.equal(output.retry,1);
  assert.equal(changes[0][1],'pending');
});
