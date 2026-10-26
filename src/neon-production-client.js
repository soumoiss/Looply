import {createClient,SupabaseAuthAdapter} from "https://esm.sh/@neondatabase/neon-js@0.7.0-beta?bundle";
import { isExplicitAdminResult } from "./neon-admin-result.js";
import { fetchLinkedNeonProfile } from "./neon-identity.js";
import { readOwnNeonProfile } from "./neon-avatar-profile.js";
const config=Object.freeze({auth:"https://ep-fancy-smoke-b7d6t1s6.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth",data:"https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1"});
export const NEON_DATA_API_URL = config.data;
const storageFunction="https://br-round-fog-b7pseu7j-looplystorage.compute.c-13.us-east-1.aws.neon.tech";
export const neon=createClient({auth:{url:config.auth,adapter:SupabaseAuthAdapter()},dataApi:{url:config.data}});
export const accounts=Object.freeze({patati:"patati@loooply.app",gaberinjela:"gaberinjela@loooply.app",misol:"misol@loooply.app",yara:"yara@loooply.app",peixinho:"peixinho@loooply.app",eukeiliane:"keilageo@loooply.app"});
export function emailOf(value){const v=String(value||"").trim().toLowerCase();return accounts[v]||(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)?v:null)}
export const escapeText=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export async function selfProfile(session = null){const current=session || await activeSession();const linked=await fetchLinkedNeonProfile({session:current,dataApiUrl:config.data});const full=await readOwnNeonProfile({profileId:linked.id,session:current,dataApiUrl:config.data});return {...linked,...full}}
export async function activeSession(){const s=await neon.auth.getSession();if(s.error)throw Error("Não foi possível verificar a sessão no Neon.");return s.data?.session||null}

// Supabase-shaped, read-only bridge used only by the recovered legacy page
// controllers while each feature is ported. Writes, RPCs, storage and realtime
// deliberately fail closed until Neon/Cloudflare policies exist.
function filtersToParams(filters = []) {
  const params = new URLSearchParams();
  for (const [operator, column, value] of filters) {
    if (operator === "eq") params.set(column, `eq.${value}`);
    else if (operator === "neq") params.set(column, `neq.${value}`);
    else if (operator === "is") params.set(column, `is.${value}`);
    else if (operator === "in") params.set(column, `in.(${value.map(v => `"${String(v).replaceAll('"', '\\"')}"`).join(",")})`);
    else if (operator === "gt") params.set(column, `gt.${value}`);
  }
  return params;
}

function createReadQuery(table) {
  const state = { columns: "*", filters: [], ordering: [], max: null, range: null, mode: "select", payload: null, head: false, count: null };
  const query = {
    select(columns = "*", options = {}) { state.columns = columns; state.head = options.head === true; state.count = options.count || null; return query; },
    eq(column, value) { state.filters.push(["eq", column, value]); return query; },
    neq(column, value) { state.filters.push(["neq", column, value]); return query; },
    is(column, value) { state.filters.push(["is", column, value]); return query; },
    in(column, values) { state.filters.push(["in", column, values]); return query; },
    gt(column, value) { state.filters.push(["gt", column, value]); return query; },
    gte(column, value) { state.filters.push(["gte", column, value]); return query; },
    lt(column, value) { state.filters.push(["lt", column, value]); return query; },
    lte(column, value) { state.filters.push(["lte", column, value]); return query; },
    ilike(column, value) { state.filters.push(["ilike", column, value]); return query; },
    or(expression) { state.filters.push(["or", null, expression]); return query; },
    insert(payload) { state.mode = "insert"; state.payload = payload; return query; },
    upsert() { state.mode = "upsert"; return query; },
    update(payload) { state.mode = "update"; state.payload = payload; return query; },
    delete() { state.mode = "delete"; return query; },
    order(column, options = {}) { state.ordering.push(`${column}.${options.ascending === false ? "desc" : "asc"}`); return query; },
    limit(value) { state.max = value; return query; },
    range(from, to) {
      const start = Number(from), end = Number(to);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
        state.range = { error: true };
      } else {
        state.range = { from: start, to: end };
      }
      return query;
    },
    maybeSingle() { state.max = 2; return query.then(result => result.error ? result : result.data?.length > 1 ? { data: null, error: { message: "multiple_rows" } } : { data: result.data?.[0] || null, error: null }); },
    single() { state.max = 2; return query.then(result => result.error ? result : result.data?.length !== 1 ? { data: null, error: { message: "row_count_mismatch" } } : { data: result.data[0], error: null }); },
    then(resolve, reject) { return execute().then(resolve, reject); },
  };
  async function execute() {
    try {
      if (!(await activeSession())) return { data: null, error: { message: "neon_session_required" }, count: null };
      const allowedWrites = table === "profiles" && state.mode === "update"
        ? ["display_name", "bio", "profile_visibility", "playlist_url", "avatar_path"]
        : table === "community_gallery_media" && ["insert", "update"].includes(state.mode)
          ? ["owner_id", "storage_path", "file_name", "kind", "mime_type", "byte_size", "caption", "visibility", "comment_access", "private_owner_id", "publication_state"]
          : null;
      if (state.mode !== "select" && (!allowedWrites || (state.mode === "update" && !state.filters.some(([op, column]) => op === "eq" && column === "id")) || (state.mode === "insert" && !Array.isArray(state.payload) && table !== "community_gallery_media"))) return { data: null, error: { message: "neon_feature_write_api_not_migrated" }, count: null };
      if (state.range?.error) return { data: null, error: { message: "invalid_range" }, count: null };
      let request = state.mode === "select"
        ? neon.from(table).select(state.columns, { head: state.head, count: state.count })
        : state.mode === "insert"
          ? neon.from(table).insert(Array.isArray(state.payload) ? state.payload : [state.payload]).select(state.columns)
          : neon.from(table).update(state.payload).select(state.columns);
      for (const [operator, column, value] of state.filters) {
        if (operator === "or") request = request.or(value);
        else request = request[operator](column, value);
      }
      for (const ordering of state.ordering) { const [column, direction] = ordering.split("."); request = request.order(column, { ascending: direction !== "desc" }); }
      if (state.range) request = request.range(state.range.from, state.range.to);
      else if (state.max !== null) request = request.limit(state.max);
      const result = await request;
      return { ...result, data: Array.isArray(result.data) ? result.data : result.data ? [result.data] : [] };
    } catch { return { data: null, error: { message: "neon_read_unavailable" }, count: null }; }
  }
  return query;
}

const blocked = async () => ({ data: null, error: { message: "neon_feature_not_migrated" } });
async function storageRequest(action, bucket, path, options = {}) {
  try {
    const session = await activeSession();
    if (!session?.access_token) return { data: null, error: { message: "neon_session_required", status: 401 } };
    const response = await fetch(storageFunction + "/storage/" + action, {
      method: action === "upload" ? "PUT" : "POST",
      headers: {
        authorization: "Bearer " + session.access_token,
        "content-type": options.contentType || "application/json",
        "x-looply-bucket": bucket,
        "x-looply-path": path
      },
      body: action === "upload" ? options.file : action === "remove" ? undefined : JSON.stringify({ expiresIn: options.expiresIn || 1800 })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { data: null, error: { message: payload.error || "neon_storage_request_failed", status: response.status } };
    return { data: payload, error: null };
  } catch { return { data: null, error: { message: "neon_storage_unavailable" } }; }
}
function storageBucket(bucket) {
  return Object.freeze({
    upload: async (path, file, options = {}) => {
      const result = await storageRequest("upload", bucket, path, { file, contentType: options.contentType || file?.type || "application/octet-stream" });
      return result.error ? result : { data: { path: result.data.path }, error: null };
    },
    createSignedUrl: async (path, expiresIn = 1800) => {
      const result = await storageRequest("sign", bucket, path, { expiresIn });
      return result.error ? result : { data: { signedUrl: result.data.signedUrl }, error: null };
    },
    createSignedUrls: async (paths, expiresIn = 1800) => {
      const values = await Promise.all(paths.map(path => storageBucket(bucket).createSignedUrl(path, expiresIn)));
      const error = values.find(value => value.error)?.error || null;
      return { data: values.map(value => value.data), error };
    },
    remove: async paths => {
      for (const path of paths) { const result = await storageRequest("remove", bucket, path); if (result.error) return result; }
      return { data: paths.map(name => ({ name })), error: null };
    }
  });
}
async function cleanupPendingGalleryMedia(name, args) {
  if (name !== "cleanup_pending_gallery_media" || !args?.p_media_id) return blocked();
  try {
    const response = await neon.rpc("v3_cleanup_pending_gallery_media", { p_media_id: args.p_media_id });
    return { data: response.data, error: response.error || null };
  } catch { return { data: null, error: { message: "neon_gallery_cleanup_failed" } }; }
}
async function adminRpc(name, args) {
  if (name !== "v3_self_is_admin" || Object.keys(args || {}).length !== 0) return blocked();
  try {
    const result = await neon.rpc(name);
    // Neon Data API versions may expose a scalar boolean as a bare value,
    // a one-row array, or a named RPC result. Accept only explicit true.
    return { data: isExplicitAdminResult(result.data), error: result.error || null };
  } catch {
    return { data: false, error: { message: "neon_admin_check_unavailable" } };
  }
}
// The restored page controllers use legacy profile UUIDs in all media FKs.
const principalCache = new Map();
async function legacyPageSession() {
  const session = await activeSession();
  if (!session?.access_token) return null;
  const token = session.access_token;
  let stored = principalCache.get(token);
  if (!stored || stored.expires < Date.now()) {
    const pending = selfProfile(session).then(profile => profile.id);
    stored = { promise: pending, expires: Date.now() + 30000 };
    principalCache.clear();
    principalCache.set(token, stored);
  }
  let legacyId;
  try { legacyId = await stored.promise; }
  catch (error) { principalCache.delete(token); throw error; }
  return { ...session, user: { ...session.user, id: legacyId, neonAuthId: session.user?.id } };
}
export const looplyClient = Object.freeze({
  dataApiUrl: config.data,
  // This adapter has no live event transport yet. Keep call features from
  // attaching to a pretend Realtime channel while the authenticated Worker
  // transport is being connected.
  supportsRealtime: false,
  realtime: Object.freeze({ setAuth: async () => { throw new Error("neon_realtime_not_migrated"); } }),
  auth: Object.freeze({
    getSession: async () => { try { const session = await legacyPageSession(); return { data: { session }, error: null }; } catch (error) { return { data: { session: null }, error }; } },
    getUser: async () => { try { const session = await legacyPageSession(); return { data: { user: session?.user || null }, error: null }; } catch (error) { return { data: { user: null }, error }; } },
    signOut: () => { principalCache.clear(); return neon.auth.signOut(); },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  }),
  from: table => createReadQuery(table),
  rpc: async (name, args) => name === "v3_self_is_admin" ? adminRpc(name, args) : cleanupPendingGalleryMedia(name, args),
  functions: Object.freeze({ invoke: blocked }),
  storage: Object.freeze({ from: storageBucket }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => {},
});
