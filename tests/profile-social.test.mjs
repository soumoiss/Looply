import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PROFILE_TABS,profileRpc,optimisticFollow,isProfileId} from '../src/profile-api.js';
import {profileShellMarkup} from '../src/profile-page.js';
const person={id:'11111111-1111-4111-8111-111111111111',display_name:'Nome <teste>',username:'teste'};
test('profile editor exists only on self and playlist control only on verified admin self',()=>{
 const own=profileShellMarkup(true,false,person),other=profileShellMarkup(false,true,person),admin=profileShellMarkup(true,true,person);
 assert.match(own,/data-pr-edit-form/);assert.doesNotMatch(own,/name="playlistUrl"/);
 assert.doesNotMatch(other,/data-pr-edit-form|name="playlistUrl"/);assert.match(admin,/name="playlistUrl"/);
 assert.doesNotMatch(own,/Quem pode encontrar|onclick=|unsplash|tailwind/);
 assert.deepEqual(PROFILE_TABS,['fotos','videos','mencoes']);
 for(const tab of PROFILE_TABS)assert.match(own,new RegExp('id="grid-'+tab+'"'));
});
test('optimistic follow counts remain stable on duplicate intent and cannot become negative',()=>{
 assert.deepEqual(optimisticFollow({followers:2,isFollowing:false},true),{followers:3,isFollowing:true});
 assert.deepEqual(optimisticFollow({followers:2,isFollowing:true},true),{followers:2,isFollowing:true});
 assert.equal(optimisticFollow({followers:0,isFollowing:true},false).followers,0);
});
test('profile RPC uses verified session bearer and never accepts an arbitrary RPC name',async()=>{
 let calls=0;
 const client={dataApiUrl:'https://neon.test/rest/v1',auth:{getSession:async()=>({data:{session:{access_token:'verified-session'}}})}};
 const fetchImpl=async(url,options)=>{calls++;assert.equal(url,'https://neon.test/rest/v1/rpc/v11_set_follow');assert.equal(options.headers.authorization,'Bearer verified-session');assert.deepEqual(JSON.parse(options.body),{p_target_id:person.id,p_follow:true});return Response.json({isFollowing:true});};
 assert.deepEqual(await profileRpc(client,'v11_set_follow',{p_target_id:person.id,p_follow:true},fetchImpl),{isFollowing:true});
 await assert.rejects(profileRpc(client,'other_function',{},fetchImpl));assert.equal(calls,1);
});
test('expired sessions make no network calls; denied responses remain errors',async()=>{
 const client={dataApiUrl:'https://neon.test',auth:{getSession:async()=>({data:{session:null}})}};
 await assert.rejects(profileRpc(client,'v11_profile_overview',{},()=>assert.fail('unexpected fetch')),e=>e.status===401);
 client.auth.getSession=async()=>({data:{session:{access_token:'test'}}});
 await assert.rejects(profileRpc(client,'v11_profile_overview',{},async()=>Response.json({code:'42501'},{status:403})),e=>e.status===403&&e.code==='42501');
 assert.equal(isProfileId('bad-id'),false);assert.equal(isProfileId(person.id),true);
});
test('profile content projection keeps the database visibility checks and canonical mentions',async()=>{
 const sql=await readFile(new URL('../migration/20261029_profile_social.sql',import.meta.url),'utf8');
 assert.match(sql,/PRIMARY KEY \(follower_id,following_id\)/);assert.match(sql,/CHECK \(follower_id<>following_id\)/);
 assert.match(sql,/SECURITY INVOKER/);assert.match(sql,/post.author_id<>p_profile_id/);
 assert.match(sql,/publication_state='published'/);assert.match(sql,/public\.post_mentions/);
 assert.match(sql,/author_id=actor FOR UPDATE/);assert.match(sql,/owner_id=actor/);
 assert.doesNotMatch(sql,/GRANT (INSERT|UPDATE|DELETE).*follows/);
});
