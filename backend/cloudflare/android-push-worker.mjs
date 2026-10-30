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
async function googleAccessToken(env){
  if(cachedOauth && cachedOauth.expiresAt > Date.now()+60_000) return cachedOauth.accessToken;
  const account = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON || "{}");
  if(!account.client_email || !account.private_key || !env.FCM_PROJECT_ID) throw Error("missing_fcm_config");
  const keyBytes = Uint8Array.from(atob(account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"")),x=>x.charCodeAt(0));
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
const pendingSql = `
SELECT source,event_id,kind,resource_id,conversation_id,token_id,fcm_token
FROM (
 SELECT 'activity' AS source,n.id AS event_id,n.kind,n.resource_id,NULL::uuid AS conversation_id,
        t.id AS token_id,t.fcm_token,n.created_at
 FROM public.notifications n JOIN public.android_fcm_tokens t ON t.user_id=n.recipient_id
 UNION ALL
 SELECT 'chat',n.id,
        CASE WHEN EXISTS (
          SELECT 1 FROM public.chat_media cm
          WHERE cm.message_id=n.message_id AND cm.mime_type LIKE 'audio/%'
        ) THEN 'voice' ELSE n.kind END,
        n.message_id,n.conversation_id,t.id,t.fcm_token,n.created_at
 FROM public.chat_notifications n JOIN public.android_fcm_tokens t ON t.user_id=n.user_id
 UNION ALL
 SELECT 'letter',n.id,'letter',n.letter_id,NULL::uuid,t.id,t.fcm_token,n.created_at
 FROM public.letter_event_notifications n JOIN public.android_fcm_tokens t ON t.user_id=n.recipient_id
 WHERE n.event_type='new_received'
 UNION ALL
 SELECT 'story',n.id,'story',n.story_id,NULL::uuid,t.id,t.fcm_token,n.created_at
 FROM public.android_fcm_story_events n JOIN public.android_fcm_tokens t ON t.user_id=n.recipient_id
) events
WHERE created_at > now()-interval '15 minutes'
AND NOT EXISTS (
  SELECT 1 FROM public.android_fcm_deliveries d
  WHERE d.source=events.source AND d.event_id=events.event_id AND d.token_id=events.token_id
  AND (d.status IN ('sent','pending') OR d.updated_at > now()-interval '5 minutes')
)
ORDER BY created_at ASC LIMIT 80
`;
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
  if(row.source==="chat")return kind==="call"?"call":kind==="voice"?"voice":"message";
  if(row.source==="letter")return "letter";
  if(row.source==="story")return "story";
  if(kind==="story_mention")return "mention";
  if(kind==="story_like")return "story";
  if(kind==="music_dedication")return "dedication";
  if(["comment","reply","post","post_like","like","reel","story","mention","call"].includes(kind))return kind==="post_like"?"like":kind;
  return "activity";
}
// Inject transports only from unit tests; production uses the actual Neon
// HTTP SQL API and Google OAuth/FCM endpoints.
export async function deliverNotifications(env,{
  query=neonQuery, accessTokenProvider=googleAccessToken, sendFetch=fetch
}={}){
  const rows=await query(env,pendingSql);
  if(!rows.length)return {eligible:0,sent:0,failed:0};
  const accessToken=await accessTokenProvider(env);
  let sent=0,failed=0;
  for(const item of rows){
    const values=[String(item.source),String(item.event_id),String(item.token_id)];
    const claim=await query(env,claimSql,values);
    if(!claim.length)continue;
    const kind=kindFor(item);
    const data={kind};
    if(item.conversation_id)data.conversationId=String(item.conversation_id);
    if(item.resource_id)data.resourceId=String(item.resource_id);
    data.title="Looply";
    data.body=kind==="call"?"Chamada recebida":kind==="voice"?"Nova mensagem de voz":kind==="message"?"Nova mensagem":kind==="letter"?"Nova carta":"Nova atividade";
    const message={token:item.fcm_token,data,
      android:{priority:["call","message","voice"].includes(kind)?"HIGH":"NORMAL",ttl:kind==="call"?"120s":"86400s"}};
    let ok=false;
    try{
      const response=await sendFetch("https://fcm.googleapis.com/v1/projects/"+encodeURIComponent(env.FCM_PROJECT_ID)+"/messages:send",{
        method:"POST",headers:{authorization:"Bearer "+accessToken,"content-type":"application/json"},
        body:JSON.stringify({message})
      });
      ok=response.ok;
      // Tokens are opaque. Do not log the response body or a token.
      if(!ok)console.warn("Looply FCM delivery rejected",response.status);
    }catch{console.warn("Looply FCM network unavailable");}
    await query(env,doneSql,[...values,ok?"sent":"failed"]);
    if(ok)sent++;else failed++;
  }
  return {eligible:rows.length,sent,failed};
}
export default {
  async fetch(request){
    if(request.method==="GET"&&new URL(request.url).pathname==="/health")
      return Response.json({service:"looply-android-fcm",configured:"server-only"});
    return Response.json({error:"not_found"},{status:404});
  },
  async scheduled(_controller,env,ctx){
    ctx.waitUntil(deliverNotifications(env).catch(error=>{
      // No secrets, notification bodies or device tokens in logs.
      console.error("Looply scheduled FCM failed",String(error?.message||"unavailable").slice(0,120));
    }));
  }
};
