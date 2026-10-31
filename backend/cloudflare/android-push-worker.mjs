// Looply FCM delivery worker. Cloudflare scheduled trigger: "*/1 * * * *"
// Least-privilege Neon dispatcher role (queue reads + delivery claim/update).
// Never ship NEON_PUSH_DATABASE_URL or Firebase service-account JSON to
// an APK or public web bundle.
const encoder = new TextEncoder();
let cachedOauth = null;
const b64url = data => {
  const bytes = typeof data === "string" ? encoder.encode(data) : new Uint8Array(data);
  let string = ""; for(const byte of bytes) string += String.fromCharCode(byte);
  return btoa(string).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
// Google service account JSON is sometimes stored with literal \n sequences
// (an extra JSON-escaping layer in CI/CD secrets). Normalize the PEM rather
// than passing a backslash-containing string into atob. Never log secret bytes.
export function decodeFcmPrivateKey(pem, decode = atob) {
  if (typeof pem !== "string" || !pem.trim()) throw Error("fcm_private_key_missing");
  let normalized = pem.trim().replace(/^\uFEFF/, "");
  for (let i = 0; i < 3; i++) {
    normalized = normalized.replace(/\\+r\\+n|\\+n|\\+r/g, "\n");
  }
  const body = normalized.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, "")
    .replace(/[\s\uFEFF]/g, "");
  if (body.length < 100) throw Error("fcm_private_key_too_short");
  if (!/^[A-Za-z0-9+/]+={0,8}$/.test(body)) throw Error("fcm_private_key_non_base64_characters");
  // The transport sometimes adds inappropriate trailing padding. Normalize
  // padding, but do not accept a malformed RSA key: importKey still validates
  // the complete DER structure before any OAuth request can be made.
  const unpadded = body.replace(/=+$/, "");
  if (unpadded.length % 4 === 1) throw Error("fcm_private_key_bad_length");
  const padded = unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, "=");
  try {
    return Uint8Array.from(decode(padded), character => character.charCodeAt(0));
  } catch {
    throw Error("fcm_private_key_invalid_base64");
  }
}
// Accept JSON-stringified or secret-manager wrapped service-account JSON.
// Android's public google-services.json cannot authenticate an FCM sender.
export function parseFcmServiceAccount(value, projectId) {
  let account=value;
  for (let attempt=0;attempt<5;attempt++) {
    if (typeof account==="string") {
      try { account=JSON.parse(account.trim()); }
      catch { throw Error("fcm_service_account_invalid_json"); }
      continue;
    }
    if (account && typeof account==="object" && !Array.isArray(account)) {
      if (account.project_info && Array.isArray(account.client))
        throw Error("fcm_android_config_not_service_account");
      if (typeof account.private_key==="string" || typeof account.privateKey==="string")
        break;
      const key=["service_account","serviceAccount","firebase_service_account",
        "firebaseServiceAccount","credentials","FCM_SERVICE_ACCOUNT_JSON"]
        .find(k=>account[k] && (typeof account[k]==="object" || typeof account[k]==="string"));
      if(key) { account=account[key];continue; }
    }
    break;
  }
  if(!account || typeof account!=="object" || Array.isArray(account))
    throw Error("fcm_service_account_invalid_fields");
  const normalized={...account,
    project_id:account.project_id||account.projectId,
    client_email:account.client_email||account.clientEmail,
    private_key:account.private_key||account.privateKey};
  if(typeof normalized.client_email!=="string" || !normalized.client_email.includes("@"))
    throw Error("fcm_service_account_missing_client_email");
  if(typeof normalized.private_key!=="string" || !normalized.private_key.trim())
    throw Error("fcm_service_account_missing_private_key");
  if(normalized.project_id!==projectId)throw Error("fcm_project_mismatch");
  return normalized;
}
async function googleAccessToken(env){
  if(cachedOauth && cachedOauth.expiresAt > Date.now()+60_000) return cachedOauth.accessToken;
  if(!env.FCM_PROJECT_ID) throw Error("missing_fcm_config");
  const account = parseFcmServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON,env.FCM_PROJECT_ID);
  const keyBytes = decodeFcmPrivateKey(account.private_key);
  const key = await crypto.subtle.importKey("pkcs8",keyBytes,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const now = Math.floor(Date.now()/1000);
  const part = b64url(JSON.stringify({alg:"RS256",typ:"JWT"}))+"."+
    b64url(JSON.stringify({iss:account.client_email,scope:"https://www.googleapis.com/auth/firebase.messaging",
      aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,encoder.encode(part));
  const response=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:part+"."+b64url(sig)})
  });
  if(!response.ok)throw Error("fcm_oauth_rejected:"+response.status);
  const payload=await response.json();
  if(typeof payload.access_token!=="string")throw Error("fcm_oauth_invalid");
  cachedOauth={accessToken:payload.access_token,expiresAt:Date.now()+Math.min(3300,Number(payload.expires_in)||3300)*1000};
  return cachedOauth.accessToken;
}
async function neonQuery(env,query,params=[]){
  const conn=String(env.NEON_PUSH_DATABASE_URL||"");
  const url=new URL(conn);
  if(!["postgresql:","postgres:"].includes(url.protocol)||!url.hostname.endsWith(".neon.tech"))throw Error("neon_secret_unavailable");
  // Refuse any previously configured Neon role with administrative powers.
  // Never accept the older, privileged looply_push_dispatcher role.
  if(decodeURIComponent(url.username)!=="looply_push_relay_limited")
    throw Error("neon_push_role_not_limited");
  const host=url.hostname.replace(/-pooler(?=\.)/,"");
  const response=await fetch("https://"+host+"/sql",{
    method:"POST",headers:{"content-type":"application/json","Neon-Connection-String":conn},
    body:JSON.stringify({query,params})
  });
  if(!response.ok)throw Error("neon_query_failed:"+response.status);
  const payload=await response.json();
  if(!Array.isArray(payload.rows))throw Error("neon_invalid_rows");
  return payload.rows;
}
// Runs on the same one-minute Cron Trigger using the pre-existing restricted
// Neon connection. The DB function owns row locks and exactly-once delivery.
// No scheduled content, passwords or recipient identifiers are returned.
export async function dispatchScheduledLetters(env,{query=neonQuery}={}){
  const rows=await query(env,"SELECT processed,delivered,failed FROM public.v24_dispatch_scheduled_letters($1)",[50]);
  return rows[0]||{processed:0,delivered:0,failed:0};
}
const pendingSql = `
SELECT events.source,events.event_id,events.kind,events.resource_id,
       events.conversation_id,events.token_id,events.fcm_token,
       events.actor_name,events.call_mode
FROM public.v22_android_fcm_named_candidates() events
WHERE created_at > now()-interval '2 hours'
AND (events.source<>'incoming-call' OR created_at>now()-interval '30 seconds')
AND NOT EXISTS (
  SELECT 1 FROM public.android_fcm_deliveries d
  WHERE d.source=events.source AND d.event_id=events.event_id AND d.token_id=events.token_id
  AND (d.status IN ('sent','pending') OR d.updated_at > now()-interval '5 minutes')
)
ORDER BY created_at ASC LIMIT 80
`;
const directCallSql=pendingSql
  .replace("WHERE created_at > now()-interval '2 hours'",
    "WHERE created_at > now()-interval '35 seconds' AND events.source='incoming-call' "+
    "AND events.conversation_id=$1::uuid "+
    "AND events.event_id=md5('cs:'||$2::text)::uuid");
const claimSql=`
INSERT INTO public.android_fcm_deliveries(source,event_id,token_id,status)
VALUES ($1,$2::uuid,$3::uuid,'pending')
ON CONFLICT(source,event_id,token_id) DO UPDATE
  SET status='pending',updated_at=now()
  WHERE public.android_fcm_deliveries.status='failed'
    AND public.android_fcm_deliveries.updated_at < now()-interval '5 minutes'
RETURNING event_id
`;
const doneSql=`UPDATE public.android_fcm_deliveries SET status=$4,updated_at=now()
WHERE source=$1 AND event_id=$2::uuid AND token_id=$3::uuid RETURNING event_id`;
function kindFor(row){
  const kind=String(row.kind||"activity");
  if(row.source==="admin_event")
    return ["admin_online","admin_letter_read","admin_private_unlock"].includes(kind)?kind:"activity";
  if(row.source==="chat")return kind==="call"?"call":kind==="voice"?"voice":"message";
  if(row.source==="letter" || row.source==="community-letter")return "letter";
  if(row.source==="story")return "story";
  if(row.source==="post-mention")return "post";
  if(["gallery","gallery-comment","gallery-like","gallery-mention","gallery-tag","archive-gallery-comment","archive-gallery-mention"].includes(row.source))
    return "gallery";
  if(kind==="story_mention")return "mention";
  if(kind==="story_like")return "story";
  if(kind==="gallery_like" || kind==="gallery_mention" || kind==="gallery_comment")return "gallery";
  if(kind==="dedication")return "dedication";
  if(kind==="story_like")return "story";
  if(kind==="music_dedication")return "dedication";
  if(["comment","reply","post","post_like","like","reel","story","mention","call"].includes(kind))return kind==="post_like"?"like":kind;
  return "activity";
}
// Inject transports only from unit tests; production uses the actual Neon
// HTTP SQL API and Google OAuth/FCM endpoints.
export async function deliverNotifications(env,{
  query=neonQuery, accessTokenProvider=googleAccessToken, sendFetch=fetch,
  pendingQuerySql=pendingSql,pendingQueryParams=[]
}={}){
  const rows=await query(env,pendingQuerySql,pendingQueryParams);
  if(!rows.length)return {eligible:0,sent:0,failed:0};
  const accessToken=await accessTokenProvider(env);
  let sent=0,failed=0;
  // Bounded concurrency: one slow device cannot hold back other ringing phones.
  // Unique SQL claims still protect against duplicate deliveries.
  for(let offset=0;offset<rows.length;offset+=5){
    await Promise.all(rows.slice(offset,offset+5).map(async item=>{
    const values=[String(item.source),String(item.event_id),String(item.token_id)];
    const claim=await query(env,claimSql,values);
    if(!claim.length)return;
    const kind=kindFor(item);
    const data={kind};
    if(item.conversation_id)data.conversationId=String(item.conversation_id);
    if(item.resource_id)data.resourceId=String(item.resource_id);
    // Names are sourced from Neon after recipient visibility checks. Never
    // trust senderName from the client signaling payload.
    const actor=String(item.actor_name||"").replace(/\s+/g," ").trim().slice(0,64) || "Alguém";
    const happened=new Date(item.created_at);
    const happenedLabel=Number.isNaN(happened.valueOf())?"":new Intl.DateTimeFormat("pt-BR",{
      timeZone:"America/Fortaleza",day:"2-digit",month:"2-digit",year:"numeric",
      hour:"2-digit",minute:"2-digit"
    }).format(happened);
    if(!Number.isNaN(happened.valueOf()))data.occurredAt=happened.toISOString();
    const callMode=item.call_mode==="video"?"video":"audio";
    // Every notification identifies the verified actor and the specific
    // event type; never put private message, letter, or comment text in FCM.
    const actionBySource={
      "admin_event":kind==="admin_online"?"Entrou no aplicativo":
        kind==="admin_letter_read"?"Leu uma carta enviada por você":
        kind==="admin_private_unlock"?"Desbloqueou uma carta privada":"Atividade administrativa",
      "feed":"Publicou no feed",
      "post-mention":"Mencionou você em uma publicação",
      "feed-comment":"Comentou uma publicação",
      "gallery":"Publicou uma mídia na galeria",
      "gallery-comment":"Comentou uma mídia da galeria",
      "gallery-like":"Curtiu sua mídia da galeria",
      "gallery-mention":"Mencionou você em um comentário da galeria",
      "gallery-tag":"Marcou você em uma mídia da galeria",
      "archive-gallery-comment":"Comentou uma mídia da galeria histórica",
      "archive-gallery-mention":"Mencionou você na galeria histórica",
      "story":"Publicou um Story",
      "story-mention":"Mencionou você em um Story",
      "story-like":"Curtiu seu Story",
      "post-like":"Curtiu sua publicação",
      "letter":"Enviou uma carta para você",
      "community-letter":"Enviou uma carta para você",
      "music-dedication":"Dedicou uma música para você",
      "music-comment":"Comentou uma dedicatória musical",
      "music-page-comment":"Comentou uma música",
      "music-admin-comment":"Comentou uma música"
    };
    const genericByKind={
      "voice":"Enviou uma mensagem de voz","message":"Enviou uma mensagem",
      "letter":"Enviou uma carta para você","comment":"Comentou sua publicação",
      "reply":"Respondeu ao seu comentário","mention":"Mencionou você",
      "story_mention":"Mencionou você em um Story",
      "story_like":"Curtiu seu Story","post_like":"Curtiu sua publicação",
      "dedication":"Dedicou uma música para você","music_dedication":"Dedicou uma música para você",
      "post":"Publicou no feed","reel":"Publicou um Reel",
      "like":"Curtiu sua publicação","gallery":"Publicou na galeria"
    };
    const action=kind==="call"?"Está ligando por "+(callMode==="video"?"vídeo":"voz"):
      item.source==="chat"?(kind==="voice"?"Enviou uma mensagem de voz":"Enviou uma mensagem"):
      item.source==="activity"?(genericByKind[String(item.kind)]||"Interagiu com você"):
      actionBySource[String(item.source)]||genericByKind[String(item.kind)]||"Interagiu com você";
    data.title=kind==="call"?"Chamada de "+(callMode==="video"?"vídeo":"voz"):actor;
    if(kind==="call"){data.callerName=actor;data.callMode=callMode;}
    data.body=kind==="call"?actor+" está ligando por "+(callMode==="video"?"vídeo":"voz"):
      item.source==="admin_event"&&happenedLabel?action+" · "+happenedLabel:action;
    // For stories, replies and comments we keep only a short generic
    // action and no private excerpt, password or attachment in FCM.
    const message={token:item.fcm_token,data,
      android:{priority:["call","message","voice"].includes(kind)?"HIGH":"NORMAL",
        ttl:kind==="call"?"30s":"86400s"}};
    let ok=false;
    try{
      const response=await sendFetch("https://fcm.googleapis.com/v1/projects/"+encodeURIComponent(env.FCM_PROJECT_ID)+"/messages:send",{
        method:"POST",headers:{authorization:"Bearer "+accessToken,"content-type":"application/json"},
        body:JSON.stringify({message})
      });
      ok=response.ok;
      // Tokens are opaque. Do not log the response body or a token.
      if(!ok) {
        // Log a Firebase error category only; never log destination tokens
        // or message bodies, even when Google includes them in a response.
        const detail=await response.json().catch(()=>null);
        const status=String(detail?.error?.status||"unknown").slice(0,48);
        console.warn("Looply FCM delivery rejected",response.status,/^[A-Z_]+$/.test(status)?status:"unknown");
      }
    }catch{console.warn("Looply FCM network unavailable");}
    await query(env,doneSql,[...values,ok?"sent":"failed"]);
    if(ok)sent++;else failed++;
    }));
  }
  return {eligible:rows.length,sent,failed};
}

const PUSH_NEON_API="https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1";
const CALL_ORIGIN="https://soumoiss.github.io";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function dispatchImmediateCall(env,{
  request, authFetch=fetch, deliver=deliverNotifications
}={}){
  const origin=request.headers.get("origin");
  const cors={"access-control-allow-origin":CALL_ORIGIN,
    "access-control-allow-methods":"POST,OPTIONS",
    "access-control-allow-headers":"authorization,content-type",
    "cache-control":"no-store","vary":"Origin"};
  if(origin!==CALL_ORIGIN) return Response.json({error:"forbidden_origin"},{status:403});
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(request.method!=="POST")return Response.json({error:"method_not_allowed"},{status:405,headers:cors});
  const bearer=request.headers.get("authorization")||"";
  if(!/^Bearer [A-Za-z0-9_.-]{32,8192}$/.test(bearer))
    return Response.json({error:"login_required"},{status:401,headers:cors});
  let body;
  try{body=await request.json();}catch{return Response.json({error:"invalid_body"},{status:400,headers:cors});}
  const conversation=body?.conversationId;
  if(!UUID.test(conversation||""))
    return Response.json({error:"invalid_conversation"},{status:400,headers:cors});
  // A bearer is never decoded or trusted locally; the Neon authenticated RPC
  // checks auth.uid, direct membership, offer age, mode and hangup/answer state.
  let validation;
  try{
    validation=await authFetch(PUSH_NEON_API+"/rpc/v22_fcm_authorize_call_ring",{
      method:"POST",headers:{authorization:bearer,"content-type":"application/json",
        accept:"application/json"},body:JSON.stringify({p_conversation_id:conversation}),
      signal:AbortSignal.timeout(2500)
    });
  }catch{return Response.json({error:"validation_unavailable"},{status:503,headers:cors});}
  if(!validation.ok)return Response.json({error:"call_not_authorized"},{status:403,headers:cors});
  const offerId=await validation.json().catch(()=>null);
  if(!Number.isSafeInteger(offerId)||offerId<1)
    return Response.json({error:"call_not_available"},{status:409,headers:cors});
  let result;
  try{
    result=await deliver(env,{pendingQuerySql:directCallSql,
      pendingQueryParams:[conversation,String(offerId)]});
  }catch(error){
    console.warn("Looply immediate FCM dispatch failed",String(error?.message||"unavailable").slice(0,75));
    return Response.json({error:"push_unavailable"},{status:503,headers:cors});
  }
  return Response.json({accepted:result.sent,failed:result.failed},{headers:cors});
}

export default {
  async fetch(request,env){
    if(new URL(request.url).pathname==="/call-ring")
      return dispatchImmediateCall(env,{request});

    if(request.method==="GET"&&new URL(request.url).pathname==="/health") {
      let ready=false,status="missing_configuration";
      const codes=new Set(["fcm_service_account_invalid_json",
        "fcm_android_config_not_service_account","fcm_service_account_invalid_fields",
        "fcm_service_account_missing_client_email","fcm_service_account_missing_private_key",
        "fcm_project_mismatch","fcm_private_key_missing",
        "fcm_private_key_too_short","fcm_private_key_non_base64_characters",
        "fcm_private_key_bad_length","fcm_private_key_invalid_base64"]);
      try {
        if (env.FCM_SERVICE_ACCOUNT_JSON && env.NEON_PUSH_DATABASE_URL && env.FCM_PROJECT_ID) {
          const account=parseFcmServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON,env.FCM_PROJECT_ID);
          const keyBytes=decodeFcmPrivateKey(account.private_key);
          await crypto.subtle.importKey("pkcs8",keyBytes,
            {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
          ready=true; status="ready";
        }
      } catch (error) { status=codes.has(error?.message)?error.message:"fcm_private_key_invalid_pkcs8"; }
      // Only a fixed diagnostic code is returned; never tokens, credentials,
      // email addresses, user IDs or raw Google error payloads.
      return Response.json({service:"looply-android-fcm",ready,status},
        {headers:{"cache-control":"no-store"}});
    }
    return Response.json({error:"not_found"},{status:404});
  },
  async scheduled(_controller,env,ctx){
    ctx.waitUntil((async()=>{
      // Persist due letters BEFORE querying notification candidates.
      // A failure here must not interrupt ordinary message/call notifications.
      try { await dispatchScheduledLetters(env); }
      catch(error) {
        console.error("Looply scheduled letters failed",String(error?.message||"unavailable").slice(0,120));
      }
      try { await deliverNotifications(env); }
      catch(error) {
        console.error("Looply scheduled FCM failed",String(error?.message||"unavailable").slice(0,120));
      }
    })());
  }
};
