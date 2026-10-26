import {createClient,SupabaseAuthAdapter} from "https://esm.sh/@neondatabase/neon-js@0.7.0-beta?bundle";
import { isExplicitAdminResult } from "./neon-admin-result.js";
const config=Object.freeze({auth:"https://ep-fancy-smoke-b7d6t1s6.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth",data:"https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1"});
export const neon=createClient({auth:{url:config.auth,adapter:SupabaseAuthAdapter()},dataApi:{url:config.data}});
export const accounts=Object.freeze({patati:"patati@loooply.app",gaberinjela:"gaberinjela@loooply.app",misol:"misol@loooply.app",yara:"yara@loooply.app",peixinho:"peixinho@loooply.app",eukeiliane:"keilageo@loooply.app"});
export function emailOf(value){const v=String(value||"").trim().toLowerCase();return accounts[v]||(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)?v:null)}
export const escapeText=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export async function selfProfile(){const res=await neon.from("v3_self_profile").select("id,username,display_name,bio,theme,avatar_path").limit(2);if(res.error)throw Error("Não foi possível consultar o perfil vinculado no Neon.");if(res.data?.length!==1)throw Error("A identidade foi autenticada, mas o perfil original ainda não está vinculado.");return res.data[0]}
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
  const state = { columns: "*", filters: [], ordering: [], max: null, range: null, mode: "select", head: false, count: null };
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
    insert() { state.mode = "insert"; return query; },
    upsert() { state.mode = "upsert"; return query; },
    update() { state.mode = "update"; return query; },
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
      if (state.mode !== "select") return { data: null, error: { message: "neon_feature_write_api_not_migrated" }, count: null };
      if (state.range?.error) return { data: null, error: { message: "invalid_range" }, count: null };
      let request = neon.from(table).select(state.columns, { head: state.head, count: state.count });
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
export const looplyClient = Object.freeze({
  // This adapter has no live event transport yet. Keep call features from
  // attaching to a pretend Realtime channel while the authenticated Worker
  // transport is being connected.
  supportsRealtime: false,
  realtime: Object.freeze({ setAuth: async () => { throw new Error("neon_realtime_not_migrated"); } }),
  auth: Object.freeze({
    getSession: async () => { const session = await activeSession(); return { data: { session }, error: null }; },
    getUser: async () => { const session = await activeSession(); return { data: { user: session?.user || null }, error: null }; },
    signOut: () => neon.auth.signOut(),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  }),
  from: table => createReadQuery(table),
  rpc: adminRpc,
  functions: Object.freeze({ invoke: blocked }),
  storage: Object.freeze({ from: () => ({ createSignedUrl: blocked, upload: blocked, remove: blocked, list: blocked }) }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => {},
});
