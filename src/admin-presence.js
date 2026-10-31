// A verified foreground visit, not a persistent background tracker.
// sessionStorage prevents page navigation from generating dozens of alerts;
// the Neon RPC independently deduplicates repeated sessions/foreground events.
export function startAdminPresenceTracking(client,userId, {
  clock=()=>Date.now(),documentRef=globalThis.document,
  storage=globalThis.sessionStorage
}={}) {
  if (!client?.rpc || !userId || !documentRef) return ()=>{};
  const key="looply:admin-open:"+userId;
  let stopped=false, inFlight=false;
  const track=async()=>{
    if(stopped || inFlight || documentRef.visibilityState==="hidden")return;
    const now=clock();
    let previous=0;
    try{previous=Number(storage?.getItem(key))||0;}catch{}
    if(now-previous<180000 && now>=previous)return;
    inFlight=true;
    try{
      const {data,error}=await client.rpc("v23_register_app_open",{});
      if(error || data!==true)throw error||Error("presence_not_confirmed");
      if(!stopped){try{storage?.setItem(key,String(now));}catch{}}
    }catch(error){
      console.warn("Looply admin presence event unavailable",String(error?.message||"network").slice(0,80));
    }finally{inFlight=false;}
  };
  const onVisible=()=>{if(documentRef.visibilityState!=="hidden")void track();};
  const onFocus=()=>{void track();};
  documentRef.addEventListener("visibilitychange",onVisible);
  globalThis.window?.addEventListener("focus",onFocus);
  void track();
  return ()=>{
    stopped=true;
    documentRef.removeEventListener("visibilitychange",onVisible);
    globalThis.window?.removeEventListener("focus",onFocus);
  };
}
