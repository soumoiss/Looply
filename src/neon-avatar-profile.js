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
  url.searchParams.set("limit", "2");
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
    image.onload = () => resolve(true);
    image.onerror = () => reject(fail("avatar-upload-validation-failed"));
  });
  image.src = url;
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
  const oldPath = current.avatar_path || null;
  let newPath = null;
  let hasCommitted = false;
  let uploaded = false;
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
      uploaded = true;
    }
    const committed = await profileRequest({
      dataApiUrl, token, profileId, fetchImpl, method: "PATCH", changes
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
          restored = await profileRequest({
            dataApiUrl, token, profileId, fetchImpl, method: "PATCH",
            changes: { avatar_path: oldPath }, expectedAvatarPath: newPath
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
      // If the PUT completed but its response was lost, avoid leaking a new orphan.
      try { await bucket.remove([newPath]); } catch { /* cleanup is best-effort */ }
    }
    throw error;
  }
}
