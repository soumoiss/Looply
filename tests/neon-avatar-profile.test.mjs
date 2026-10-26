import test from "node:test";
import assert from "node:assert/strict";
import { saveNeonProfile, readOwnNeonProfile, validateAvatarFile } from "../src/neon-avatar-profile.js";

const ID = "96d65731-c815-4686-ab08-efeec005d38c";
const OLD = "avatars/" + ID + "/11111111-1111-4111-8111-111111111111.jpg";
const NEW_UUID = "22222222-2222-4222-8222-222222222222";
const NEW = "avatars/" + ID + "/" + NEW_UUID + ".jpg";
const SESSION = { access_token: ["mock", "payload", "signature"].join(".") };
function fixture(options = {}) {
  const row = { id: ID, avatar_path: options.old ?? OLD, display_name:"Original",
    bio:"Old",profile_visibility:"members",playlist_url:"https://www.youtube.com/playlist?list=playlist" };
  const history = [];
  const objects = new Set(row.avatar_path ? [row.avatar_path] : []);
  const fetchImpl = async (url, request) => {
    assert.equal(request.headers.authorization, "Bearer " + SESSION.access_token);
    const parsed = new URL(url);
    history.push(request.method);
    if (request.method === "GET") {
      assert.equal(parsed.pathname, "/rest/v1/profiles");
      assert.equal(parsed.searchParams.get("id"), "eq." + ID);
      assert.equal(parsed.searchParams.get("limit"), "2");
      return Response.json([row]);
    }
    assert.equal(request.method, "POST");
    assert.equal(parsed.pathname, "/rest/v1/rpc/v3_save_self_profile");
    const body = JSON.parse(request.body);
    assert.equal(body.p_previous_avatar, row.avatar_path);
    assert.equal(body.p_display_name?.length > 0, true);
    if (options.denied) return new Response("{}", { status: 403 });
    if (body.p_replace_avatar) row.avatar_path = body.p_next_avatar;
    Object.assign(row, {
      display_name:body.p_display_name, bio:body.p_bio,
      profile_visibility:body.p_profile_visibility, playlist_url:body.p_playlist_url
    });
    return Response.json([row]);
  };
  const bucket = {
    async upload(path) {
      history.push("UPLOAD");
      if (options.uploadFailure) return {error:{message:"simulated upload failure"}};
      objects.add(path);return {data:{path}};
    },
    async createSignedUrl(path) {
      history.push("SIGN");
      return options.signFailure ? {error:{message:"not visible"}} :
        {data:{signedUrl:"https://example.invalid/photo.jpg"}};
    },
    async remove(paths) {
      history.push("REMOVE");
      paths.forEach(p=>objects.delete(p));
      return {data:paths.map(name=>({name}))};
    }
  };
  const args = {profileId:ID,session:SESSION,dataApiUrl:"https://example.invalid/rest/v1",
    fetchImpl,storage:{from:name=>{assert.equal(name,"looply-avatars");return bucket;}},
    randomUUID:()=>NEW_UUID,imageCheck:async()=>{history.push("IMAGE");}};
  return {row,history,objects,args};
}

test("Neon own profile retains visibility and playlist",async()=>{
  const {row,args}=fixture();
  assert.deepEqual(await readOwnNeonProfile(args),row);
});

test("replacement only removes previous own avatar after verified signed image",async()=>{
  const f=fixture();
  const result=await saveNeonProfile({...f.args,updates:{display_name:"Changed"},avatarFile:{type:"image/jpeg",size:1024}});
  assert.equal(result.avatarPath,NEW);
  assert.equal(f.row.avatar_path,NEW);
  assert.equal(f.row.profile_visibility,"members");
  assert.equal(f.row.display_name,"Changed");
  assert.deepEqual(f.history,["GET","UPLOAD","POST","SIGN","IMAGE","REMOVE"]);
  assert.deepEqual([...f.objects],[NEW]);
});

test("saving just profile metadata never changes existing avatar",async()=>{
  const f=fixture();
  await saveNeonProfile({...f.args,updates:{bio:"Changed"}});
  assert.equal(f.row.avatar_path,OLD);
  assert.deepEqual(f.history,["GET","POST"]);
});

test("signed URL failure restores old avatar and cleans new object",async()=>{
  const f=fixture({signFailure:true});
  await assert.rejects(saveNeonProfile({...f.args,updates:{},avatarFile:{type:"image/jpeg",size:128}}),/avatar-upload-validation-failed/);
  assert.equal(f.row.avatar_path,OLD);
  assert.deepEqual([...f.objects],[OLD]);
  assert.deepEqual(f.history,["GET","UPLOAD","POST","SIGN","POST","REMOVE"]);
});

test("rejected Neon RLS PATCH never destroys old image",async()=>{
  const f=fixture({denied:true});
  await assert.rejects(saveNeonProfile({...f.args,updates:{},avatarFile:{type:"image/jpeg",size:128}}),e=>e.status===403);
  assert.equal(f.row.avatar_path,OLD);
  assert.deepEqual([...f.objects],[OLD]);
});

test("failed upload stops before any database modification",async()=>{
  const f=fixture({uploadFailure:true});
  await assert.rejects(saveNeonProfile({...f.args,updates:{},avatarFile:{type:"image/jpeg",size:128}}));
  assert.equal(f.row.avatar_path,OLD);
  assert.equal(f.history.includes("POST"),false);
});

test("historical recovery object is preserved during an avatar change",async()=>{
  const f=fixture({old:"recovery-20261025/patati/avatar.png"});
  await saveNeonProfile({...f.args,updates:{},avatarFile:{type:"image/jpeg",size:128}});
  assert.equal(f.history.includes("REMOVE"),false);
});

test("ambiguous Neon PATCH response does not delete an image that was actually committed",async()=>{
  const f=fixture();
  const normalFetch=f.args.fetchImpl;
  f.args.fetchImpl=async (url,request)=>{
    if(request.method==="POST"){
      await normalFetch(url,request);
      throw new Error("simulated lost response");
    }
    return normalFetch(url,request);
  };
  await assert.rejects(saveNeonProfile({...f.args,updates:{},avatarFile:{type:"image/jpeg",size:128}}),/neon_profile_network_unavailable/);
  assert.equal(f.row.avatar_path,NEW);
  assert.equal(f.objects.has(NEW),true);
  assert.equal(f.history.includes("REMOVE"),false);
});

test("invalid image and missing bearer never cause an upload",async()=>{
  assert.throws(()=>validateAvatarFile({type:"image/png",size:10*1024*1024+1}),/unsupported avatar/);
  const f=fixture();
  await assert.rejects(saveNeonProfile({...f.args,session:{},updates:{},avatarFile:{type:"image/jpeg",size:128}}),/session expired/);
  assert.deepEqual(f.history,[]);
});
