import { createNeonRestQuery } from "./neon-rest-bridge.js";
import {createClient,SupabaseAuthAdapter} from "https://esm.sh/@neondatabase/neon-js@0.7.0-beta?bundle";
import { isExplicitAdminResult } from "./neon-admin-result.js";
import { fetchLinkedNeonProfile } from "./neon-identity.js";
import { readOwnNeonProfile } from "./neon-avatar-profile.js";
import { invokeChatReadReceiptRpc } from "./chat-read-receipts.js";
import { createNeonRealtimeBridge } from "./neon-realtime-bridge.js?v=fast-ring-20261027";
import { createNeonSignalFallback } from "./neon-call-fallback.js?v=fast-ring-20261027";
const config=Object.freeze({auth:"https://ep-fancy-smoke-b7d6t1s6.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth",data:"https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1"});
export const NEON_DATA_API_URL = config.data;
export const neonFunctionsBase="https://br-round-fog-b7pseu7j-looplystorage.compute.c-13.us-east-1.aws.neon.tech";
const storageFunction=neonFunctionsBase;
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
  return createNeonRestQuery(table,{
    dataApiUrl:config.data,
    getAccessToken:async()=>(await activeSession())?.access_token||null
  });
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
        "x-looply-path": path,
        ...(options.size ? { "x-looply-size": String(options.size) } : {})
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
      const contentType = options.contentType || file?.type || "application/octet-stream";
      const authorization = await storageRequest("upload-url", bucket, path, { contentType, size: file?.size });
      if (!authorization.error && authorization.data?.uploadUrl) {
        try {
          const response = await fetch(authorization.data.uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: file, signal: options.signal });
          if (response.ok) return { data: { path }, error: null };
          if (file?.size > 25 * 1024 * 1024) return { data: null, error: { message: "direct_storage_upload_failed", status: response.status } };
        } catch (error) {
          if (file?.size > 25 * 1024 * 1024) return { data: null, error: { message: "direct_storage_upload_failed", details: error?.message || "network" } };
        }
      }
      if (file?.size > 25 * 1024 * 1024) return authorization.error ? authorization : { data: null, error: { message: "direct_storage_upload_unavailable" } };
      const result = await storageRequest("upload", bucket, path, { file, contentType });
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
const galleryRpcNames = new Set(["set_gallery_media_adjustment","set_gallery_media_pinned","set_gallery_media_private","set_gallery_media_permissions","create_community_gallery_comment","create_archive_media_comment","v8_delete_gallery_media","v8_create_gallery_comment"]);
async function galleryRpc(name,args) {
  try {
    const session=await activeSession();
    if(!session?.access_token) return {data:null,error:{message:"Sessão expirada",status:401}};
    const response=await fetch(config.data+"/rpc/"+name,{method:"POST",cache:"no-store",headers:{authorization:"Bearer "+session.access_token,"content-type":"application/json"},body:JSON.stringify(args||{})});
    const data=await response.json().catch(()=>null);
    return response.ok ? {data,error:null} : {data:null,error:{message:data?.message||"Ação recusada",code:data?.code,status:response.status}};
  } catch {return {data:null,error:{message:"Falha de conexão"}};}
}
// Story engagement RPCs are backed by Neon functions with authenticated
// identity resolution, so callers cannot forge a viewer or a reply sender.
const storyEngagementRpcNames = new Set(["record_story_view", "send_story_reply"]);
async function storyEngagementRpc(name, args) {
  if (!storyEngagementRpcNames.has(name)) return blocked();
  try {
    const session = await activeSession();
    if (!session?.access_token) return { data: null, error: { message: "neon_session_required", status: 401 } };
    const response = await fetch(config.data + "/rpc/" + name, {
      method: "POST", cache: "no-store",
      headers: { authorization: "Bearer " + session.access_token,
        accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(args)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return { data: null, error: {
      message: data?.message || "neon_story_engagement_failed",
      status: response.status, code: data?.code || ""
    } };
    if (name === "record_story_view" && typeof data !== "boolean")
      return { data: null, error: { message: "neon_story_view_unconfirmed" } };
    if (name === "send_story_reply" && (!data?.conversation_id || !data?.message_id))
      return { data: null, error: { message: "neon_story_reply_unconfirmed" } };
    return { data, error: null };
  } catch (error) {
    return { data: null, error: { message: error?.message || "neon_story_engagement_unavailable" } };
  }
}
const publicationRpcNames = new Set(["v5_create_post","v5_create_story","v5_attach_post_media","v5_attach_story_media","v5_add_story_mentions"]);
async function ownerPublicationRpc(name,args) {
  if(!publicationRpcNames.has(name)) return blocked();
  try {
    const session=await activeSession();
    if(!session?.access_token) return {data:null,error:{message:"neon_session_required",status:401}};
    const response=await fetch(config.data+"/rpc/"+name,{
      method:"POST",cache:"no-store",
      headers:{authorization:"Bearer "+session.access_token,accept:"application/json","content-type":"application/json"},
      body:JSON.stringify(args||{})
    });
    const value=await response.json().catch(()=>null);
    if(!response.ok) return {data:null,error:{message:value?.message||"neon_publication_rejected",status:response.status,code:value?.code||""}};
    if(typeof value!=="string" && !(name==="v5_add_story_mentions" && Number.isInteger(value))) return {data:null,error:{message:"neon_publication_missing_id"}};
    return {data:value,error:null};
  } catch(error) {return {data:null,error:{message:"neon_publication_network_error",details:error?.message||""}};}
}
async function selectedPostRpc(name,args){
  if(name!=="create_selected_post" || typeof args?.p_body!=="string" || !Array.isArray(args?.p_recipient_ids)) return blocked();
  try{
    const session=await activeSession();
    if(!session?.access_token)return {data:null,error:{message:"neon_session_required",status:401}};
    const response=await fetch(config.data+"/rpc/v4_create_selected_post",{
      method:"POST",cache:"no-store",
      headers: {authorization:"Bearer "+session.access_token,accept:"application/json","content-type":"application/json"},
      body:JSON.stringify({p_body:args.p_body,p_recipient_ids:args.p_recipient_ids})
    });
    const payload=await response.json().catch(()=>null);
    if(!response.ok)return {data:null,error:{message:payload?.message||"neon_selected_post_failed",code:payload?.code||"",status:response.status}};
    if(typeof payload!=="string")return {data:null,error:{message:"neon_selected_post_invalid_result"}};
    return {data:payload,error:null};
  }catch{return {data:null,error:{message:"neon_selected_post_unavailable"}};}
}
async function chatReadReceiptRpc(name, args) {
  try {
    const session = await activeSession();
    return await invokeChatReadReceiptRpc(config.data, session?.access_token, name, args);
  } catch {
    return { data: null, error: { message: "neon_chat_receipt_unavailable" } };
  }
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
async function chatFunctionInvoke(name,options) {
  if(name!=="looply-chat")return blocked();
  const body=options?.body||{}, action=String(body.action||"");
  const types={create_direct:"direct",create_group:"group",create_letter:"letter"};
  const kind=types[action];
  if(!kind)return blocked();
  try{
    const session=await activeSession();
    if(!session?.access_token)return {data:null,error:{message:"neon_session_required",status:401}};
    const recipientIds=kind==="direct"?[body.targetId]:kind==="group"?body.targetIds:[];
    const response=await fetch(config.data+"/rpc/v4_create_conversation",{
      method:"POST",cache:"no-store",
      headers:{authorization:"Bearer "+session.access_token,accept:"application/json","content-type":"application/json"},
      body:JSON.stringify({p_kind:kind,p_target_ids:recipientIds,p_subject:body.subject||null,p_body:body.body||null})
    });
    const value=await response.json().catch(()=>null);
    if(!response.ok)return {data:null,error:{message:value?.message||"neon_chat_create_failed",code:value?.code||"",status:response.status}};
    if(typeof value!=="string")return {data:null,error:{message:"neon_chat_invalid_result"}};
    return {data:{conversationId:value},error:null};
  }catch{return {data:null,error:{message:"neon_chat_creation_unavailable"}};}
}
const realtimeBridge=createNeonRealtimeBridge({
  endpoint:"https://looply-original-realtime-staging.s0upoetamoiss.workers.dev",
  getSession:activeSession,
  fallback:createNeonSignalFallback({dataApiUrl:config.data,getSession:activeSession,delay:3200})
});
export const looplyClient = Object.freeze({
  dataApiUrl: config.data,
  // Only authenticated conversation-scoped signaling is available. This does
  // NOT synthesize a Postgres change feed or replace Neon as the source of truth.
  supportsRealtime: realtimeBridge.supportsRealtime,
  realtime: realtimeBridge.realtime,
  auth: Object.freeze({
    getSession: async () => { try { const session = await legacyPageSession(); return { data: { session }, error: null }; } catch (error) { return { data: { session: null }, error }; } },
    getUser: async () => { try { const session = await legacyPageSession(); return { data: { user: session?.user || null }, error: null }; } catch (error) { return { data: { user: null }, error }; } },
    signOut: () => { principalCache.clear(); return neon.auth.signOut(); },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  }),
  from: table => createReadQuery(table),
  rpc: async (name, args) => storyEngagementRpcNames.has(name) ? storyEngagementRpc(name,args) : galleryRpcNames.has(name) ? galleryRpc(name,args) : publicationRpcNames.has(name) ? ownerPublicationRpc(name,args) : name === "v3_self_is_admin" ? adminRpc(name, args) : name === "create_selected_post" ? selectedPostRpc(name,args) : name === "mark_conversation_read" || name === "mark_conversations_delivered" ? chatReadReceiptRpc(name,args) : cleanupPendingGalleryMedia(name, args),
  functions: Object.freeze({ invoke: chatFunctionInvoke }),
  storage: Object.freeze({ from: storageBucket }),
  channel: realtimeBridge.channel,
  removeChannel: realtimeBridge.removeChannel,
});
