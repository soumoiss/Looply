// Chat Ultra preferences: server-authoritative colors, wallpaper and inbox flags.
// Messages, drafts and authentication tokens are never persisted here.
const ID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const COLOR=/^#[0-9a-f]{6}$/i;
export const validId=id=>ID.test(String(id||""));
export function normalizeUltraPreference(row){
  if(!row||!validId(row.id))return null;
  const color=String(row.color||"");
  const paper=String(row.wallpaper||"");
  const tint=Number(row.wallpaperTint);
  return {
    id:row.id,
    wallpaper:paper==="gallery"||COLOR.test(paper)?paper:"",
    wallpaperTint:Number.isFinite(tint)?Math.max(.04,Math.min(.7,tint)):.18,
    color:COLOR.test(color)?color:"",
    pin:Boolean(row.pin),mute:Boolean(row.mute),
    arch:Boolean(row.arch),fav:Boolean(row.fav),
    wallpaperPath:typeof row.wallpaperPath==="string"?row.wallpaperPath:""
  };
}
export function wallpaperPathFor(userId,conversationId,id){
  if(!validId(userId)||!validId(conversationId)||!validId(id))throw Error("Invalid wallpaper identifier");
  return `chat-wallpapers/${userId}/${conversationId}/${id}.webp`;
}
const toRecord=(row,userId)=>({
  user_id:userId,conversation_id:row.id,wallpaper:row.wallpaper,
  wallpaper_tint:row.wallpaperTint,bubble_color:row.color,
  is_pinned:row.pin,is_muted:row.mute,is_archived:row.arch,
  is_favorite:row.fav,wallpaper_path:row.wallpaperPath||null,
  updated_at:new Date().toISOString()
});
export function createUltraPreferenceService(client,userId,onError=()=>{}){
  if(!validId(userId)||!client?.from||!client?.storage)throw Error("Authenticated session required");
  const cache=new Map(),timers=new Map(),inFlight=new Map(),signed=new Map();
  let disposed=false;
  function active(conversationId){return validId(conversationId);}
  function fromServer(rows){
    return Object.fromEntries((rows||[]).filter(r=>active(r.conversation_id)).map(r=>[
      r.conversation_id,{
        wallpaper:r.wallpaper||"",wallpaperPath:r.wallpaper_path||"",
        wallpaperTint:Number(r.wallpaper_tint??.18),
        color:r.bubble_color||"",pin:Number(r.is_pinned)||0,
        mute:Number(r.is_muted)||0,arch:Number(r.is_archived)||0,
        fav:Number(r.is_favorite)||0
      }
    ]));
  }
  async function load(){
    const result=await client.from("chat_ultra_preferences")
      .select("conversation_id,wallpaper,wallpaper_path,wallpaper_tint,bubble_color,is_pinned,is_muted,is_archived,is_favorite,updated_at")
      .eq("user_id",userId).order("updated_at",{ascending:false}).limit(500);
    if(result.error)throw result.error;
    const normalized=fromServer(result.data);
    for(const [id,pref] of Object.entries(normalized))cache.set(id,{...pref});
    return normalized;
  }
  async function write(row){
    if(disposed||!active(row.id))return false;
    const normalized=normalizeUltraPreference(row);
    if(!normalized)return false;
    const record=toRecord(normalized,userId);
    const prior=inFlight.get(row.id)||Promise.resolve();
    const promise=prior.catch(()=>{}).then(async()=>{
      const {data,error}=await client.from("chat_ultra_preferences").upsert(record,{
        onConflict:"user_id,conversation_id"
      }).select("conversation_id").maybeSingle();
      if(error||data?.conversation_id!==row.id)throw error||Error("Preference not confirmed");
      cache.set(row.id,{...normalized});
      return true;
    });
    inFlight.set(row.id,promise);
    try{return await promise;}catch(error){onError("Não foi possível sincronizar as preferências da conversa.",error);return false;}
    finally{if(inFlight.get(row.id)===promise)inFlight.delete(row.id);}
  }
  function queue(row){
    const normalized=normalizeUltraPreference(row);
    if(disposed||!normalized)return;
    clearTimeout(timers.get(row.id));
    timers.set(row.id,setTimeout(()=>{timers.delete(row.id);void write(normalized);},450));
  }
  async function uploadPhoto(conversationId,blob,visualRow={}){
    if(!active(conversationId)||!(blob instanceof Blob)||blob.type!=="image/webp"||
       blob.size<=0||blob.size>3*1024*1024)throw Error("Foto inválida ou acima de 3 MB.");
    const path=wallpaperPathFor(userId,conversationId,crypto.randomUUID());
    const uploaded=await client.storage.from("looply-chat").upload(path,blob,{
      contentType:"image/webp",upsert:false
    });
    if(uploaded.error||uploaded.data?.path!==path)throw uploaded.error||Error("Upload not confirmed");
    const row={
      ...cache.get(conversationId),...visualRow,
      id:conversationId,wallpaper:"gallery",wallpaperPath:path,wallpaperTint:.18
    };
    const saved=await write(row);
    if(!saved)throw Error("Foto enviada, mas a conversa não confirmou o fundo. Tente novamente.");
    return path;
  }
  async function signPhoto(conversationId,path){
    if(!active(conversationId)||typeof path!=="string"||
      !path.startsWith(`chat-wallpapers/${userId}/${conversationId}/`)||
      !/\/[0-9a-f-]{36}\.webp$/i.test(path))return "";
    const entry=signed.get(path);
    if(entry?.expires>Date.now())return entry.url;
    const response=await client.storage.from("looply-chat").createSignedUrl(path,1800);
    if(response.error||!/^https:\/\//i.test(response.data?.signedUrl||""))return "";
    const url=response.data.signedUrl;
    signed.set(path,{url,expires:Date.now()+25*60*1000});
    return url;
  }
  function dispose(){
    disposed=true;
    for(const timer of timers.values())clearTimeout(timer);
    timers.clear();signed.clear();
  }
  return {load,queue,write,uploadPhoto,signPhoto,dispose};
}
