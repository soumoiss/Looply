import { createNeonRestQuery } from "./neon-rest-bridge.js";
import { accounts, emailOf } from "./neon-login-identity.js";
export { accounts, emailOf };
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
export const escapeText=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export async function selfProfile(session = null){const current=session || await activeSession();const linked=await fetchLinkedNeonProfile({session:current,dataApiUrl:config.data});const full=await readOwnNeonProfile({profileId:linked.id,session:current,dataApiUrl:config.data});return {...linked,...full}}
export async function activeSession(){const s=await neon.auth.getSession();if(s.error)throw Error("Não foi possível verificar a sessão no Neon.");return s.data?.session||null}

let androidDeviceId = null;
let androidRegistrationPending = "";
let androidRegistrationConfirmed = "";
let androidRetryTimer = null;
// FCM registration must also survive a WebView splash/login race: the native
// token may arrive before Neon Auth has restored the user's session.
if (typeof window !== "undefined") {
  const registerFcm = (payload, attempt=0) => {
    const {deviceId,token}=payload||{};
    if(typeof token!=="string" || token.length<25 || token.length>4096 ||
       !/^[A-Za-z0-9._:~-]+$/.test(token) ||
       typeof deviceId!=="string" || !/^[0-9a-f-]{36}$/i.test(deviceId))return;
    androidDeviceId=deviceId;
    // The same phone can be used by different accounts. A token-only cache
    // leaves the device attached to the previous user after account switching.
    void (async()=>{
      let retry=false;
      let key="";
      try {
        const session=await activeSession();
        if(!session?.access_token || !session.user?.id){retry=true;return;}
        key=deviceId+":"+token+":"+session.user.id;
        if(key===androidRegistrationConfirmed || key===androidRegistrationPending)return;
        androidRegistrationPending=key;
        const response=await fetch(config.data+"/rpc/v16_register_android_fcm_token",{
          method:"POST",cache:"no-store",
          headers:{authorization:"Bearer "+session.access_token,accept:"application/json","content-type":"application/json"},
          body:JSON.stringify({p_device_id:deviceId,p_fcm_token:token})
        });
        const ok=await response.json().catch(()=>false);
        if(!response.ok||ok!==true){retry=true;throw Error("registration_http_"+response.status);}
        androidRegistrationConfirmed=key;
      }catch(error){
        retry=true;
        console.warn("Looply FCM registration unavailable",String(error?.message||"network").slice(0,100));
      }finally {
        if(key && androidRegistrationPending===key) androidRegistrationPending="";
        if(retry && attempt<6 && !androidRetryTimer){
          androidRetryTimer=window.setTimeout(()=>{
            androidRetryTimer=null;
            registerFcm(payload,attempt+1);
          },Math.min(12000,600*(2**attempt)));
        }
      }
    })();
  };
  window.addEventListener("looply:android-fcm-token",event=>registerFcm(event.detail));
  if(window.__looplyNativeFcmToken)registerFcm(window.__looplyNativeFcmToken);
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible" && window.__looplyNativeFcmToken &&
       !androidRegistrationConfirmed && !androidRetryTimer)
      registerFcm(window.__looplyNativeFcmToken);
  });
}
export async function unregisterAndroidFcmDevice() {
  if (!androidDeviceId) return false;
  const session = await activeSession();
  if (!session?.access_token) return false;
  const response = await fetch(config.data + "/rpc/v16_unregister_android_fcm_token", {
    method: "POST",cache:"no-store",
    headers:{authorization:"Bearer " + session.access_token,accept:"application/json","content-type":"application/json"},
    body:JSON.stringify({p_device_id:androidDeviceId})
  });
  const removed = response.ok && (await response.json().catch(()=>false)) === true;
  if(removed) {
    androidDeviceId = null;
    androidRegistrationConfirmed = "";
    androidRegistrationPending = "";
    if(androidRetryTimer) window.clearTimeout(androidRetryTimer);
    androidRetryTimer = null;
  }
  return removed;
}

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
    verify: async path => {
      if (bucket !== "looply-media" || !path.startsWith("legacy-archive/midia/")) return blocked();
      return storageRequest("verify",bucket,path);
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
const protectedArchiveRpcNames = new Set([
  "v13_unlock_archived_card","v13_admin_change_archived_card_password",
  "v14_admin_recover_archived_card","looply_register_recipient_unlock",
  "v23_mark_global_announcement_read","v23_mark_community_letter_read",
  "v23_register_app_open"
]);
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
// Group cover writes must pass the creator-only Neon RPC.
async function setGroupCoverRpc(args) {
  try {
    const session = await activeSession();
    if (!session?.access_token) return {data:null,error:{message:"neon_session_required",status:401}};
    const response = await fetch(config.data + "/rpc/v10_set_group_cover", {
      method:"POST",cache:"no-store",
      headers:{authorization:"Bearer "+session.access_token,
        "content-type":"application/json",accept:"application/json"},
      body:JSON.stringify(args)
    });
    const data = await response.json().catch(()=>null);
    if (!response.ok) return {data:null,error:{
      message:data?.message||"group_cover_rejected",code:data?.code||"",status:response.status
    }};
    if (data !== args?.p_storage_path) return {data:null,error:{message:"group_cover_unconfirmed"}};
    return {data,error:null};
  } catch(error) {return {data:null,error:{message:error?.message||"group_cover_unavailable"}};}
}
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
// Scheduled letters use the already installed, authenticated v24 Neon RPCs.
// Never silently fall back to a generic unsupported-feature response.
const scheduledLetterRpcNames = new Set([
  "v24_create_scheduled_letter", "v24_update_scheduled_letter",
  "v24_cancel_scheduled_letter", "v26_scheduled_recipient_inbox",
  "v26_hide_sent_letter", "v26_hidden_sent_ids"
]);
async function scheduledLetterRpc(name, args) {
  if (!scheduledLetterRpcNames.has(name)) return blocked();
  try {
    const session = await activeSession();
    if (!session?.access_token)
      return { data: null, error: { message: "Sua sessão precisa ser renovada.", status: 401 } };
    const response = await fetch(config.data + "/rpc/" + name, {
      method: "POST", cache: "no-store",
      headers: {
        authorization: "Bearer " + session.access_token,
        accept: "application/json", "content-type": "application/json"
      },
      body: JSON.stringify(args || {})
    });
    const value = await response.json().catch(() => null);
    if (!response.ok) {
      console.warn("Looply scheduled letter RPC failed", name, response.status, value?.code || "");
      return { data: null, error: {
        message: response.status === 401 ? "Sua sessão precisa ser renovada." :
          "Não foi possível confirmar a programação. Tente novamente.",
        status: response.status, code: value?.code || ""
      } };
    }
    const valid = name === "v24_create_scheduled_letter"
      ? typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)
      : (name === "v26_scheduled_recipient_inbox" || name === "v26_hidden_sent_ids") ? Array.isArray(value)
      : value === true;
    return valid
      ? { data: value, error: null }
      : { data: null, error: { message: "Não foi possível confirmar a programação." } };
  } catch (error) {
    console.warn("Looply scheduled letter connection failed", name, error?.name || "network");
    return { data: null, error: { message: "Não foi possível conectar para programar a carta." } };
  }
}
const tttRpcNames=new Set(["v25_ttt_state","v25_ttt_invite","v25_ttt_accept","v25_ttt_decline","v25_ttt_move","v25_ttt_rematch"]);
async function tttRpc(name,args){
  if(!tttRpcNames.has(name))return blocked();
  try{
    const session=await activeSession();
    if(!session?.access_token)return {data:null,error:{message:"neon_session_required",status:401}};
    const response=await fetch(config.data+"/rpc/"+name,{
      method:"POST",cache:"no-store",
      headers:{authorization:"Bearer "+session.access_token,accept:"application/json","content-type":"application/json"},
      body:JSON.stringify(args||{})
    });
    const value=await response.json().catch(()=>null);
    if(!response.ok)return {data:null,error:{message:value?.message||"tic_tac_toe_rejected",status:response.status,code:value?.code||""}};
    if(value!==null&&(!value?.gameId||!Array.isArray(value.board)||value.board.length!==9))
      return {data:null,error:{message:"tic_tac_toe_invalid_state"}};
    return {data:value,error:null};
  }catch(error){return {data:null,error:{message:"tic_tac_toe_network_error",details:error?.message||""}};}
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

/**
 * Restore the administrative interface with authenticated Neon Data API RPCs.
 * Authorization and row-level access are always checked by PostgreSQL itself.
 * No Supabase Edge Function, service key or client-side elevated role.
 */

function secureAdminInitialPassword() {
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes=new Uint8Array(26);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte=>alphabet[byte%alphabet.length]).join("");
}
async function adminCreateUser(body) {
  const username=String(body?.username||"").trim().toLowerCase();
  // All newly created accounts use a stable, nonpersonal login alias.
  // This makes username + password work regardless of the admin's form values.
  const email=/^[a-z0-9_]{3,30}$/.test(username)?username+"@loooply.app":"";
  const displayName=String(body?.displayName||"").trim();
  const password=body?.password||secureAdminInitialPassword();
  const temporaryPassword=body?.password?"":password;
  if(!/^[a-z0-9_]{3,30}$/.test(username)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !displayName || displayName.length>80
    || password.length<8 || password.length>72) {
    return {data:null,error:{message:"admin_invalid_user_details"}};
  }
  const authorized=await adminFunctionInvoke({body:{action:"status"}});
  if(authorized.error||authorized.data?.isAdmin!==true)
    return {data:null,error:authorized.error||{message:"admin_forbidden"}};
  try {
    // Avoid orphaned Better Auth identities when this username is already
    // allocated in the legacy profile table. The RPC repeats validation to
    // guard concurrency; this preflight catches the common admin form error.
    const sessionBeforeCreate=await activeSession();
    if(!sessionBeforeCreate?.access_token)throw Error("neon_session_required");
    const existing=await fetch(config.data+"/profiles?"+new URLSearchParams({
      select:"id",username:"eq."+username,limit:"1"
    }),{method:"GET",cache:"no-store",headers:{
      authorization:"Bearer "+sessionBeforeCreate.access_token,accept:"application/json"
    }});
    if(!existing.ok)throw Error("admin_username_preflight_unavailable");
    const existingProfiles=await existing.json();
    if(!Array.isArray(existingProfiles))throw Error("admin_username_preflight_invalid");
    if(existingProfiles.length)throw Error("username_already_exists");
    // Neon Auth Better Auth admin API performs the password hashing and never
    // signs into the new account in place of the current administrator.
    const nativeAdmin=neon.auth?.admin;
    const alternateAuth=createClient({auth:{url:config.auth},dataApi:{url:config.data}});
    const adminApi=typeof nativeAdmin?.createUser==="function"?nativeAdmin:alternateAuth.auth?.admin;
    if(typeof adminApi?.createUser!=="function")
      throw Error("neon_auth_admin_create_user_unavailable");
    const created=await adminApi.createUser({
      email,password,name:displayName,role:"user"
    });
    if(created.error) throw Error(created.error.message||"neon_auth_create_user_failed");
    const neonUserId=created.data?.user?.id||created.data?.id;
    if(!/^[0-9a-f-]{36}$/i.test(String(neonUserId||"")))
      throw Error("neon_auth_user_id_not_confirmed");
    const session=await activeSession();
    if(!session?.access_token)throw Error("neon_session_required");
    const linked=await fetch(config.data+"/rpc/v12_admin_finish_signup",{
      method:"POST",cache:"no-store",
      headers:{authorization:"Bearer "+session.access_token,accept:"application/json","content-type":"application/json"},
      body:JSON.stringify({
        p_neon_user_id:neonUserId,p_username:username,p_email:email,
        p_display_name:displayName,p_playlist_url:body.playlistUrl||null
      })
    });
    const linkedData=await linked.json().catch(()=>null);
    if(!linked.ok||linkedData?.created!==true)
      throw Error("neon_auth_created_profile_link_failed: "+String(linkedData?.message||linked.status));
    return {data:{...linkedData,temporaryPassword},error:null};
  }catch(error){
    return {data:null,error:{message:String(error?.message||"neon_admin_create_user_unavailable")}};
  }
}
async function adminFunctionInvoke(options = {}) {
  const body = options?.body || {};
  const action = typeof body.action === "string" ? body.action : body.resourceType === "status" ? "status" : "read";
  // Original password-protected archives are recipient-scoped, not admin-only.
  // Neon validates the verified legacy identity link and the current password.
  if (action === "unlock_archived_card") {
    try {
      const session = await activeSession();
      if (!session?.access_token) return {data:null,error:{message:"neon_session_required",status:401}};
      const response = await fetch(config.data + "/rpc/v13_unlock_archived_card", {
        method:"POST",cache:"no-store",
        headers:{authorization:"Bearer "+session.access_token,accept:"application/json","content-type":"application/json"},
        body:JSON.stringify({p_card_id:String(body.cardId||""),p_password:String(body.password||"")})
      });
      const result = await response.json().catch(()=>null);
      if (!response.ok) return {data:null,error:{
        message:String(result?.message||"protected_archive_unlock_unavailable"),
        code:String(result?.code||""),status:response.status
      }};
      if (!result || typeof result!=="object") return {data:null,error:{message:"protected_archive_invalid_response"}};
      return {data:result,error:null};
    } catch (error) {
      return {data:null,error:{message:String(error?.message||"protected_archive_unlock_unavailable")}};
    }
  }
  if (action === "user_create_with_password") return adminCreateUser(body);
  if (action === "verify_archive_media_upload") {
    const path=String(body?.storagePath || body?.path || body?.media?.storage_path || "");
    if (!/^legacy-archive\/midia\/(?:[A-Za-z0-9_.-]+|(?:misol|yara)\/[A-Za-z0-9_.-]+)$/.test(path)
      || path.split("/").some(part => part === "." || part === ".."))
      return {data:null,error:{message:"invalid_archive_storage_path",status:400}};
    const access=await adminFunctionInvoke({body:{action:"status"}});
    if(access.error || access.data?.isAdmin!==true)
      return {data:null,error:access.error||{message:"admin_forbidden",status:403}};
    const result=await storageBucket("looply-media").verify(path);
    if(result.error)return result;
    if(typeof result.data?.exists!=="boolean" ||
       (result.data.exists && (!Number.isSafeInteger(Number(result.data.byteSize)) || Number(result.data.byteSize)<1)))
      return {data:null,error:{message:"storage_verify_invalid_response"}};
    return {data:{exists:result.data.exists,byteSize:result.data.byteSize??null},error:null};
  }
  try {
    const session = await activeSession();
    if (!session?.access_token) return { data:null, error:{message:"neon_session_required",status:401} };
    const isRead = action === "read";
    const endpoint = isRead ? "v12_admin_read" : "v12_admin_action";
    const args = isRead
      ? {p_resource:body.resourceType,p_id:body.resourceId||null,p_offset:Number(body.offset||0),p_purpose:String(body.purpose||"")}
      : {p_action:action,p_payload:body};
    const response = await fetch(config.data + "/rpc/" + endpoint, {
      method:"POST", cache:"no-store",
      headers:{authorization:"Bearer "+session.access_token,accept:"application/json","content-type":"application/json"},
      body:JSON.stringify(args)
    });
    const payload = await response.json().catch(()=>null);
    if (!response.ok) return {data:null,error:{
      message:String(payload?.message||"neon_admin_operation_failed"),
      code:String(payload?.code||""),status:response.status
    }};
    return {data:payload,error:null};
  } catch(error) {
    return {data:null,error:{message:String(error?.message||"neon_admin_unavailable")}};
  }
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
    signOut: async () => {
      // Defensive logout: no device token should stay linked to the old
      // account even when a page forgets to explicitly unregister it.
      await unregisterAndroidFcmDevice().catch(() => false);
      principalCache.clear();
      return neon.auth.signOut();
    },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  }),
  from: table => createReadQuery(table),
  rpc: async (name, args) => name === "v10_set_group_cover" ? setGroupCoverRpc(args) : storyEngagementRpcNames.has(name) ? storyEngagementRpc(name,args) : galleryRpcNames.has(name) ? galleryRpc(name,args) : protectedArchiveRpcNames.has(name) ? galleryRpc(name,args) : publicationRpcNames.has(name) ? ownerPublicationRpc(name,args) : scheduledLetterRpcNames.has(name) ? scheduledLetterRpc(name,args) : tttRpcNames.has(name) ? tttRpc(name,args) : name === "v3_self_is_admin" ? adminRpc(name, args) : name === "create_selected_post" ? selectedPostRpc(name,args) : name === "mark_conversation_read" || name === "mark_conversations_delivered" ? chatReadReceiptRpc(name,args) : cleanupPendingGalleryMedia(name, args),
  functions: Object.freeze({ invoke: (name,options) => name === "looply-admin" ? adminFunctionInvoke(options) : chatFunctionInvoke(name,options) }),
  storage: Object.freeze({ from: storageBucket }),
  channel: realtimeBridge.channel,
  removeChannel: realtimeBridge.removeChannel,
});
