// Profile-only Neon Data API + Neon Object Storage adapter.
// The legacy profile UUID is obtained from the authenticated self-profile view.
// No Supabase client, storage endpoint, credentials, or user-controlled owner ID.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = Object.freeze({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" });
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const EDITABLE = ["display_name", "bio", "profile_visibility", "playlist_url"];

function fail(message, status = 0) {
  const error = new Error(message);
  if (status) error.status = status;
  return error;
}

function tokenFrom(session) {
  const token = typeof session?.access_token === "string" ? session.access_token.trim() : "";
  if (!token || token.split(".").length !== 3) throw fail("session expired", 401);
  return token;
}

async function profileRequest({ dataApiUrl, token, profileId, fetchImpl, method = "GET", changes = null, expectedAvatarPath }) {
  const url = new URL(String(dataApiUrl).replace(/\/$/, "") + "/profiles");
  url.searchParams.set("id", "eq." + profileId);
  if (expectedAvatarPath !== undefined) {
    url.searchParams.set("avatar_path", expectedAvatarPath === null ? "is.null" : "eq." + expectedAvatarPath);
  }
  url.searchParams.set("select", "id,avatar_path,display_name,bio,profile_visibility,playlist_url");
  if (method === "GET") url.searchParams.set("limit", "2");
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method,
      cache: "no-store",
      headers: {
        authorization: "Bearer " + token,
        accept: "application/json",
        ...(method === "PATCH" ? { "content-type": "application/json", prefer: "return=representation" } : {})
      },
      ...(method === "PATCH" ? { body: JSON.stringify(changes) } : {})
    });
  } catch {
    throw fail("neon_profile_network_unavailable");
  }
  if (!response.ok) {
    let problem = {};
    try { problem = await response.json(); } catch { /* No external error body required */ }
    const err = fail(response.status === 401 ? "session expired" :
      response.status === 403 ? "profile_permission_denied" :
      "neon_profile_request_failed", response.status);
    if (typeof problem?.code === "string") err.code = problem.code;
    throw err;
  }
  let records;
  try { records = await response.json(); } catch { throw fail("neon_profile_invalid_response"); }
  if (!Array.isArray(records) || records.length !== 1 || records[0]?.id !== profileId) {
    throw fail(method === "PATCH" ? "profile-update-not-confirmed" : "profile-not-owned");
  }
  return records[0];
}

// Neon Data API RPC executes as a tightly scoped database function.
// Authentication is derived exclusively from the verified Neon bearer, not a user ID.
async function saveOwnerProfile({ dataApiUrl, token, profileId, fetchImpl, previousPath, nextPath, replacingAvatar, fields }) {
  const url = String(dataApiUrl).replace(/\/$/, "") + "/rpc/v3_save_self_profile";
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        p_previous_avatar: previousPath,
        p_next_avatar: nextPath,
        p_replace_avatar: Boolean(replacingAvatar),
        p_display_name: fields.display_name,
        p_bio: fields.bio,
        p_profile_visibility: fields.profile_visibility,
        p_playlist_url: fields.playlist_url
      })
    });
  } catch {
    throw fail("neon_profile_network_unavailable");
  }
  if (!response.ok) {
    let issue = {};
    try { issue = await response.json(); } catch { /* No secrets from error responses */ }
    const err = fail(response.status === 401 ? "session expired"
      : response.status === 403 ? "profile_permission_denied"
      : response.status === 409 ? "profile-update-conflict"
      : response.status === 404 ? "neon_profile_rpc_not_deployed"
      : "neon_profile_request_failed", response.status);
    if (typeof issue?.code === "string") err.code = issue.code;
    throw err;
  }
  let rows;
  try { rows = await response.json(); }
  catch { throw fail("neon_profile_invalid_response"); }
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== profileId) {
    throw fail("profile-update-not-confirmed");
  }
  return rows[0];
}

export async function readOwnNeonProfile({ profileId, session, dataApiUrl, fetchImpl = fetch }) {
  if (!UUID.test(profileId || "")) throw fail("profile-not-owned");
  return profileRequest({ dataApiUrl, token: tokenFrom(session), profileId, fetchImpl });
}

export function validateAvatarFile(file) {
  if (!file || !(file.type in TYPES) || !(Number(file.size) > 0 && file.size <= MAX_IMAGE_BYTES)) {
    throw fail("unsupported avatar");
  }
}

export async function verifySignedAvatar(url, ImageClass = Image) {
  if (typeof url !== "string" || !url.startsWith("https://")) throw fail("avatar-upload-validation-failed");
  const image = new ImageClass();
  image.referrerPolicy = "no-referrer";
  const loaded = new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => finish(false), 15000);
    const finish = success => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (success) resolve(true);
      else reject(fail("avatar-upload-validation-failed"));
    };
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
  await loaded;
  if (image.naturalWidth === 0 || image.naturalHeight === 0) throw fail("avatar-upload-validation-failed");
  return true;
}

// Two-phase replacement: put new object; PATCH owned row; GET signed image;
// only then remove the previous own object. Rollback restores the previous path.
export async function saveNeonProfile({
  profileId, session, dataApiUrl, storage, updates, avatarFile = null,
  fetchImpl = fetch, randomUUID = () => crypto.randomUUID(), imageCheck = verifySignedAvatar
}) {
  if (!UUID.test(profileId || "")) throw fail("profile-not-owned");
  const token = tokenFrom(session);
  if (!dataApiUrl || !/^https:\/\//.test(dataApiUrl)) throw fail("neon_profile_config_unavailable");
  const changes = {};
  for (const key of EDITABLE) if (Object.hasOwn(updates || {}, key)) changes[key] = updates[key];
  const current = await profileRequest({ dataApiUrl, token, profileId, fetchImpl });
  const fields = Object.fromEntries(EDITABLE.map(key => [key, changes[key] === undefined ? current[key] : changes[key]]));
  const oldPath = current.avatar_path || null;
  let newPath = null;
  let hasCommitted = false;
  const bucket = storage.from("looply-avatars");
  if (avatarFile) {
    validateAvatarFile(avatarFile);
    const objectId = randomUUID();
    if (!UUID.test(objectId)) throw fail("avatar-upload-invalid-result");
    newPath = `avatars/${profileId}/${objectId}.${TYPES[avatarFile.type]}`;
    changes.avatar_path = newPath;
  }
  try {
    if (newPath) {
      const { data, error } = await bucket.upload(newPath, avatarFile, {
        upsert: false, contentType: avatarFile.type
      });
      if (error) throw error;
      if (data?.path !== newPath) throw fail("avatar-upload-invalid-result");
    }
    const committed = await saveOwnerProfile({
      dataApiUrl, token, profileId, fetchImpl,
      previousPath: oldPath, nextPath: newPath,
      replacingAvatar: Boolean(newPath), fields
    });
    hasCommitted = true;
    if (newPath && committed.avatar_path !== newPath) throw fail("profile-update-not-confirmed");
    if (newPath) {
      try {
        const { data, error } = await bucket.createSignedUrl(newPath, 120);
        if (error || !data?.signedUrl) throw fail("avatar-upload-validation-failed");
        await imageCheck(data.signedUrl);
      } catch {
        let restored;
        try {
          restored = await saveOwnerProfile({
            dataApiUrl, token, profileId, fetchImpl,
            previousPath: newPath, nextPath: oldPath,
            replacingAvatar: true,
            fields: Object.fromEntries(EDITABLE.map(key => [key, current[key]]))
          });
        } catch {
          // Do not remove an object that may now be referenced by the profile.
          throw fail("avatar-rollback-failed");
        }
        if (restored.avatar_path !== oldPath) throw fail("avatar-rollback-failed");
        await bucket.remove([newPath]).catch(() => {});
        throw fail("avatar-upload-validation-failed");
      }
      // Never delete a historical recovery object or another person's file.
      if (oldPath && oldPath !== newPath && oldPath.startsWith(`avatars/${profileId}/`)) {
        try {
          const { error } = await bucket.remove([oldPath]);
          if (error) console.warn("Previous avatar cleanup unavailable", { code: error.code || error.status || "unknown" });
        } catch { console.warn("Previous avatar cleanup unavailable"); }
      }
    }
    return { profile: committed, avatarPath: newPath || oldPath };
  } catch (error) {
    if (newPath && !hasCommitted) {
      // A lost PATCH response may still mean that Neon committed the new path.
      // Read the row again; never delete an image whose database state is unknown.
      let safeToRemove = false;
      try {
        const observed = await profileRequest({ dataApiUrl, token, profileId, fetchImpl });
        safeToRemove = observed.avatar_path !== newPath;
      } catch { /* Unknown database state: preserve the object */ }
      if (safeToRemove) {
        try { await bucket.remove([newPath]); } catch { /* retry cleanup later */ }
      }
    }
    throw error;
  }
}


// Avatar-only flow: the crop dialog saves its own object and performs a Neon
// compare-and-swap on avatar_path. It never submits unsaved name/bio/playlist
// form inputs and cannot accidentally commit those edits.
async function writeOnlyAvatar({dataApiUrl,token,profileId,fetchImpl,previousPath,nextPath}) {
  let response;
  try {
    response = await fetchImpl(String(dataApiUrl).replace(/\/$/,"")+"/rpc/v9_save_self_avatar",{
      method:"POST",cache:"no-store",
      headers:{authorization:"Bearer "+token,accept:"application/json","content-type":"application/json"},
      body:JSON.stringify({p_previous_avatar:previousPath,p_next_avatar:nextPath})
    });
  }catch{throw fail("neon_profile_network_unavailable");}
  if(!response.ok){
    const issue=await response.json().catch(()=>null);
    const error=fail(issue?.code==="40001"?"profile-update-conflict":
      issue?.code==="42501"?"profile_permission_denied":
      response.status===401?"session expired":"profile-update-not-confirmed",response.status);
    if(issue?.code)error.code=issue.code;
    throw error;
  }
  const rows=await response.json().catch(()=>null);
  if(!Array.isArray(rows)||rows.length!==1||rows[0].id!==profileId||rows[0].avatar_path!==nextPath)
    throw fail("profile-update-not-confirmed");
  return rows[0];
}

export async function saveNeonAvatarOnly({
  profileId,session,dataApiUrl,storage,avatarFile,
  fetchImpl=fetch,randomUUID=()=>crypto.randomUUID(),imageCheck=verifySignedAvatar
}) {
  if(!UUID.test(profileId||""))throw fail("profile-not-owned");
  const token=tokenFrom(session);
  if(!dataApiUrl||!/^https:\/\//.test(dataApiUrl))throw fail("neon_profile_config_unavailable");
  validateAvatarFile(avatarFile);
  const previous=await profileRequest({dataApiUrl,token,profileId,fetchImpl});
  const previousPath=previous.avatar_path||null;
  const objectId=randomUUID();
  if(!UUID.test(objectId))throw fail("avatar-upload-invalid-result");
  const newPath=`avatars/${profileId}/${objectId}.${TYPES[avatarFile.type]}`;
  const bucket=storage.from("looply-avatars");
  let uploaded=false,committed=false;
  try {
    const {data,error}=await bucket.upload(newPath,avatarFile,{upsert:false,contentType:avatarFile.type});
    if(error)throw error;
    if(data?.path!==newPath)throw fail("avatar-upload-invalid-result");
    uploaded=true;
    await writeOnlyAvatar({dataApiUrl,token,profileId,fetchImpl,previousPath,nextPath:newPath});
    committed=true;
    const signed=await bucket.createSignedUrl(newPath,1800);
    if(signed.error||!signed.data?.signedUrl)throw fail("avatar-upload-validation-failed");
    await imageCheck(signed.data.signedUrl);
    const reread=await profileRequest({dataApiUrl,token,profileId,fetchImpl});
    if(reread.avatar_path!==newPath)throw fail("profile-update-not-confirmed");
    if(previousPath&&previousPath!==newPath&&previousPath.startsWith(`avatars/${profileId}/`)){
      try {
        const removed=await bucket.remove([previousPath]);
        if(removed.error)console.warn("Previous avatar cleanup unavailable",removed.error);
      }catch(error){console.warn("Previous avatar cleanup unavailable",error);}
    }
    return {profile:reread,avatarPath:newPath,avatarUrl:signed.data.signedUrl};
  }catch(error){
    // Network response loss may happen AFTER the database committed.
    // Do not remove the referenced object in that ambiguous situation.
    let observed=null;
    try { observed=await profileRequest({dataApiUrl,token,profileId,fetchImpl}); }
    catch { /* unknown database state: keep object rather than risk corruption */ }
    if(uploaded&&observed?.avatar_path===newPath){
      try {
        await writeOnlyAvatar({dataApiUrl,token,profileId,fetchImpl,previousPath:newPath,nextPath:previousPath});
        committed=false;
        observed=await profileRequest({dataApiUrl,token,profileId,fetchImpl});
        if(observed.avatar_path!==previousPath)throw fail("avatar-rollback-failed");
      }catch {throw fail("avatar-rollback-failed");}
    }
    if(uploaded&&observed&&observed.avatar_path!==newPath&&!committed){
      try{await bucket.remove([newPath]);}catch{/* Leave server-side cleanup for retry. */}
    }
    throw error;
  }
}


// Remove the profile image without submitting or changing general profile fields.
export async function removeNeonAvatarOnly({profileId,session,dataApiUrl,storage,fetchImpl=fetch}) {
  if(!UUID.test(profileId||""))throw fail("profile-not-owned");
  const token=tokenFrom(session);
  if(!dataApiUrl||!/^https:\/\//.test(dataApiUrl))throw fail("neon_profile_config_unavailable");
  const current=await profileRequest({dataApiUrl,token,profileId,fetchImpl});
  const oldPath=current.avatar_path||null;
  if(!oldPath)return {profile:current,avatarPath:null,avatarUrl:""};
  await writeOnlyAvatar({dataApiUrl,token,profileId,fetchImpl,previousPath:oldPath,nextPath:null});
  const verified=await profileRequest({dataApiUrl,token,profileId,fetchImpl});
  if(verified.avatar_path!==null)throw fail("profile-update-not-confirmed");
  // Historical recovery objects stay intact; current-owned paths can be cleaned.
  if(oldPath.startsWith(`avatars/${profileId}/`)){
    try{const result=await storage.from("looply-avatars").remove([oldPath]);if(result.error)console.warn("Old avatar object cleanup unavailable",result.error);}
    catch(error){console.warn("Old avatar object cleanup unavailable",error);}
  }
  return {profile:verified,avatarPath:null,avatarUrl:""};
}
