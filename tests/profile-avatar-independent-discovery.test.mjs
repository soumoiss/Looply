import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {saveNeonAvatarOnly,removeNeonAvatarOnly} from "../src/neon-avatar-profile.js";
import {avatarFileType,prepareAvatarSource,MAX_AVATAR_SOURCE_BYTES} from "../src/avatar-image-processing.js";

const id="96d65731-c815-4686-ab08-efeec005d38c";
const oldPath="avatars/"+id+"/11111111-1111-4111-8111-111111111111.jpg";
const newPath="avatars/"+id+"/22222222-2222-4222-8222-222222222222.jpg";
const session={access_token:"abc.def.sig"};
function fixture({badSign=false,patchDenied=false,initialPath=oldPath}={}){
 const profile={id,avatar_path:initialPath,display_name:"Nome anterior",bio:"Bio anterior",playlist_url:"https://www.youtube.com/playlist?list=abcdefg",profile_visibility:"private"};
 const history=[],objects=new Set(initialPath?[initialPath]:[]);
 const fetchImpl=async(url,options)=>{
  const u=new URL(url);
  assert.equal(options.headers.authorization,"Bearer "+session.access_token);
  if(options.method==="GET") {history.push("GET");return Response.json([profile]);}
  assert.equal(u.pathname,"/rest/v1/rpc/v9_save_self_avatar");
  history.push("AVATAR_RPC");
  if(patchDenied)return Response.json({code:"42501"},{status:403});
  const request=JSON.parse(options.body);
  assert.equal(request.p_previous_avatar,profile.avatar_path);
  profile.avatar_path=request.p_next_avatar;
  return Response.json([{id,avatar_path:profile.avatar_path}]);
 };
 const storage={from(name){
  assert.equal(name,"looply-avatars");
  return {
   async upload(path,file){history.push("UPLOAD");assert.equal(path,newPath);objects.add(path);return {data:{path}};},
   async createSignedUrl(path){history.push("SIGN");return badSign?{error:{message:"not found"}}:{data:{signedUrl:"https://img.example.com/"+path}};},
   async remove(paths){history.push("REMOVE");for(const p of paths)objects.delete(p);return {data:paths.map(name=>({name}))};}
  };
 }};
 const args={profileId:id,session,dataApiUrl:"https://data.example/rest/v1",storage,fetchImpl,randomUUID:()=> "22222222-2222-4222-8222-222222222222",imageCheck:async()=>{history.push("DECODE")}};
 return {profile,history,objects,args};
}
const image={type:"image/jpeg",size:1920};
test("photo-only confirm persists its own path and leaves unsaved metadata untouched",async()=>{
 const f=fixture();
 const saved=await saveNeonAvatarOnly({...f.args,avatarFile:image});
 assert.equal(saved.avatarPath,newPath);
 assert.match(saved.avatarUrl,/^https:/);
 assert.deepEqual(f.history,["GET","UPLOAD","AVATAR_RPC","SIGN","DECODE","GET","REMOVE"]);
 assert.deepEqual([...f.objects],[newPath]);
 assert.equal(f.profile.display_name,"Nome anterior");
 assert.equal(f.profile.bio,"Bio anterior");
 assert.equal(f.profile.profile_visibility,"private");
 assert.match(f.profile.playlist_url,/youtube/);
});
test("failed signing rolls back avatar path and retains previous object",async()=>{
 const f=fixture({badSign:true});
 await assert.rejects(saveNeonAvatarOnly({...f.args,avatarFile:image}),/avatar-upload-validation-failed/);
 assert.equal(f.profile.avatar_path,oldPath);
 assert.deepEqual([...f.objects],[oldPath]);
 assert.deepEqual(f.history,["GET","UPLOAD","AVATAR_RPC","SIGN","GET","AVATAR_RPC","GET","REMOVE"]);
});
test("server rejecting avatar CAS does not change other profile columns",async()=>{
 const f=fixture({patchDenied:true});
 await assert.rejects(saveNeonAvatarOnly({...f.args,avatarFile:image}),/profile_permission_denied/);
 assert.equal(f.profile.avatar_path,oldPath);
 assert.deepEqual([...f.objects],[oldPath]);
});
test("remove photo uses same separate Neon CAS and does not submit any profile settings",async()=>{
 const f=fixture();
 const result=await removeNeonAvatarOnly(f.args);
 assert.equal(result.avatarPath,null);
 assert.equal(f.profile.avatar_path,null);
 assert.deepEqual([...f.objects],[]);
 assert.deepEqual(f.history,["GET","AVATAR_RPC","GET","REMOVE"]);
 assert.equal(f.profile.display_name,"Nome anterior");
 assert.equal(f.profile.bio,"Bio anterior");
 assert.equal(f.profile.profile_visibility,"private");
});
test("photo can be added when previous avatar was null and rollback returns to null",async()=>{
 const f=fixture({initialPath:null,badSign:true});
 await assert.rejects(saveNeonAvatarOnly({...f.args,avatarFile:image}),/avatar-upload-validation-failed/);
 assert.equal(f.profile.avatar_path,null);
 assert.deepEqual([...f.objects],[]);
});
test("HEIC/HEIF, JPEG, PNG and WebP are classified and decoded as oriented bitmaps",async()=>{
 for (const [name,type] of [["pic.heic","image/heic"],["pic.heif","image/heif"],["pic.png","image/png"],["pic.jpeg","image/jpeg"],["pic.webp","image/webp"],["old.jpg",""]]){
  const file={name,type,size:1024};
  const expected=avatarFileType(file);
  assert.ok(expected);
  let converted=false;
  const prepared=await prepareAvatarSource(file,{
   heicConverter:async f=>{converted=true;return {name:"converted.jpg",type:"image/jpeg",size:500};},
   bitmapFactory:async(f,options)=>{assert.equal(options.imageOrientation,"from-image");return {width:2048,height:1536,close(){}};}
  });
  assert.equal(prepared.bitmap.width,2048);
  assert.equal(converted,/hei[cf]/.test(expected));
 }
});
test("input size and unsafe format rejected before decoding",async()=>{
 assert.equal(MAX_AVATAR_SOURCE_BYTES,35*1024*1024);
 assert.equal(avatarFileType({name:"shell.exe",type:"application/octet-stream"}),null);
 await assert.rejects(prepareAvatarSource({name:"photo.heif",type:"image/heif",size:MAX_AVATAR_SOURCE_BYTES+1}),/avatar-file-invalid/);
 await assert.rejects(prepareAvatarSource({name:"photo.png",type:"image/png",size:1024},{
  bitmapFactory:async()=>({width:25000,height:25000,close(){}})
 }),/avatar-dimensions-invalid/);
});
test("profile UI does not ask user to confirm photo in the general form or hide profiles",async()=>{
 const [profiles,runtime,chat,sql]=await Promise.all([
  readFile(new URL("../src/profiles.js",import.meta.url),"utf8"),
  readFile(new URL("../src/page-runtime.js",import.meta.url),"utf8"),
  readFile(new URL("../src/chat.js",import.meta.url),"utf8"),
  readFile(new URL("../migration/20261028_profile_avatar_save_discovery.sql",import.meta.url),"utf8")
 ]);
 assert.match(profiles,/>Salvar foto<\/button>/);
 assert.match(profiles,/await saveNeonAvatarOnly\(/);
 assert.match(profiles,/updates, avatarFile: null/);
 assert.doesNotMatch(profiles,/Quem pode encontrar seu perfil\?/);
 assert.doesNotMatch(profiles,/<select id="profileVisibility"/);
 assert.match(runtime,/looply:avatar-updated/);
 assert.match(runtime,/BroadcastChannel/);
 assert.match(chat,/data-profile-avatar-id/);
 assert.match(sql,/looply_v9_member_discovery/);
 assert.match(sql,/SET avatar_path=p_next_avatar/);
 assert.doesNotMatch(sql,/SET display_name/);
});
