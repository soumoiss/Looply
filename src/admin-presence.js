// One administrative entry notice per actual browser/app session.
// Focus changes, heartbeat refreshes and ordinary navigation are NOT logins.
// SessionStorage persists across internal pages, but not a newly opened tab/WebView.
const keyFor = userId => "looply:admin-open:session:" + userId;
const acknowledgedFor = userId => "looply:admin-open:ack:" + userId;

export function clearAdminPresenceSession(userId,{storage=globalThis.sessionStorage}={}){
  if(!userId)return;
  try {
    storage?.removeItem(keyFor(userId));
    storage?.removeItem(acknowledgedFor(userId));
  }catch{}
}

export function startAdminPresenceTracking(client,userId,{
  documentRef=globalThis.document,
  storage=globalThis.sessionStorage,
  createSessionId=()=>globalThis.crypto?.randomUUID?.()
}={}){
  if(!client?.rpc||!userId||!documentRef||!storage)return ()=>{};
  const sessionKey=keyFor(userId),ackKey=acknowledgedFor(userId);
  let stopped=false,inFlight=false,sessionId;
  try {
    sessionId=storage.getItem(sessionKey);
    if(!sessionId){
      sessionId=createSessionId();
      if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(sessionId||""))return ()=>{};
      storage.setItem(sessionKey,sessionId);
    }
  }catch{return ()=>{};}
  const register=async()=>{
    if(stopped||inFlight||documentRef.visibilityState==="hidden")return;
    try{if(storage.getItem(ackKey)===sessionId)return;}catch{return;}
    inFlight=true;
    try{
      const {data,error}=await client.rpc("v28_register_app_open",{p_session_id:sessionId});
      if(error||data!==true)throw error||Error("app_open_not_confirmed");
      if(!stopped)storage.setItem(ackKey,sessionId);
    }catch(error){
      console.warn("Looply entry event unavailable",String(error?.code||error?.name||"network").slice(0,50));
    }finally{inFlight=false;}
  };
  // A page may initialize hidden; register only when first shown. Do not
  // register subsequent returns from background or periodic Android focus.
  const onVisible=()=>{
    if(documentRef.visibilityState!=="hidden"){
      documentRef.removeEventListener("visibilitychange",onVisible);
      void register();
    }
  };
  if(documentRef.visibilityState==="hidden")
    documentRef.addEventListener("visibilitychange",onVisible);
  else void register();
  return ()=>{
    stopped=true;
    documentRef.removeEventListener("visibilitychange",onVisible);
  };
}
