// App-wide authenticated presence. Only an active foreground session keeps a
// green dot alive; the server expires stale heartbeats after 85 seconds.
export function startChatPresenceHeartbeat(client,{
  doc=globalThis.document,
  win=globalThis.window,
  everyMs=28000
}={}){
  if(!client?.rpc||!doc||!win)return ()=>{};
  let stopped=false,inFlight=false;
  const beat=async()=>{
    if(stopped||inFlight||doc.visibilityState==="hidden")return;
    inFlight=true;
    try{
      const result=await client.rpc("v37_chat_presence_heartbeat");
      if(result.error||result.data!==true)
        console.warn("Looply chat presence could not be confirmed");
    }catch(error){
      console.warn("Looply chat presence network unavailable",error?.name||"offline");
    }finally{inFlight=false;}
  };
  const onVisible=()=>{if(doc.visibilityState!=="hidden")void beat();};
  const timer=win.setInterval(onVisible,everyMs);
  doc.addEventListener("visibilitychange",onVisible);
  win.addEventListener("focus",onVisible);
  void beat();
  return ()=>{
    stopped=true;
    win.clearInterval(timer);
    doc.removeEventListener("visibilitychange",onVisible);
    win.removeEventListener("focus",onVisible);
  };
}
