// Authorized, ephemeral Chat Ultra typing state.
// Presence is server-confirmed and expires after nine seconds; it is never a
// message, notification or localStorage record. All RPCs derive the actor from JWT.
export function setupUltraTyping({
  client,
  input,
  getConversationId,
  onUpdate,
  doc=globalThis.document,
  win=globalThis.window,
  pollMs=2700,
  announceMs=2800
}={}){
  if(!client?.rpc||!input||!doc||!win||typeof getConversationId!=="function")
    return {dispose(){},stop(){}};
  let stopped=false,activeId="",typingId="",lastAnnounce=0,changeTimer=0,inFlight=false;
  let pendingInput=false,lastVisible="";
  const validId=value=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value||""));
  const report=(id,users=[])=>{
    const hash=users.join(",");
    if(hash===lastVisible&&id===activeId)return;
    lastVisible=hash;
    onUpdate?.(id,users);
  };
  async function write(id,isTyping){
    if(!validId(id)||stopped)return false;
    try{
      const {data,error}=await client.rpc("v41_chat_typing_update",{
        p_conversation_id:id,p_typing:Boolean(isTyping)
      });
      if(error||data!==true)throw error||new Error("not_authorized");
      return true;
    }catch(error){
      // A lost network must never show fake typing or claim remote delivery.
      console.warn("Chat Ultra: typing not confirmed",error?.code||"offline");
      return false;
    }
  }
  const stop=()=>{
    win.clearTimeout(changeTimer);
    pendingInput=false;
    const old=typingId;
    typingId="";
    lastAnnounce=0;
    if(old)void write(old,false);
  };
  function announce(){
    if(stopped||doc.visibilityState==="hidden")return;
    const id=getConversationId();
    if(!validId(id)||!input.value.trim()){stop();return;}
    const now=Date.now();
    if(typingId===id && now-lastAnnounce<announceMs)return;
    if(typingId&&typingId!==id)stop();
    typingId=id;
    lastAnnounce=now;
    void write(id,true);
  }
  const inputChange=()=>{
    if(stopped)return;
    win.clearTimeout(changeTimer);
    if(!input.value.trim()){stop();return;}
    pendingInput=true;
    changeTimer=win.setTimeout(()=>{pendingInput=false;announce();},260);
  };
  const blur=()=>stop();
  const visible=()=>{if(doc.visibilityState==="hidden")stop();else void poll();};
  async function poll(){
    if(stopped||doc.visibilityState==="hidden"||inFlight)return;
    const id=getConversationId();
    if(id!==activeId){
      const previous=activeId;
      activeId=id;
      lastVisible="";
      if(previous)onUpdate?.(previous,[]);
      if(typingId&&typingId!==id)stop();
    }
    if(!validId(id))return;
    inFlight=true;
    try{
      const {data,error}=await client.rpc("v41_chat_typing_visible",{p_conversation_id:id});
      if(error)throw error;
      if(stopped||id!==getConversationId())return;
      const participants=[...new Set((Array.isArray(data)?data:[])
        .map(row=>row?.user_id).filter(validId))];
      report(id,participants);
    }catch(error){
      if(!stopped)report(id,[]);
      console.warn("Chat Ultra: remote typing unavailable",error?.code||"offline");
    }finally{inFlight=false;}
  }
  input.addEventListener("input",inputChange);
  input.addEventListener("blur",blur);
  doc.addEventListener("visibilitychange",visible);
  const timer=win.setInterval(()=>{void poll();if(typingId&&input.value.trim()&&!pendingInput)announce();},pollMs);
  void poll();
  return {
    stop,
    dispose(){
      if(stopped)return;
      stop();
      stopped=true;
      win.clearInterval(timer);
      input.removeEventListener("input",inputChange);
      input.removeEventListener("blur",blur);
      doc.removeEventListener("visibilitychange",visible);
      if(activeId)onUpdate?.(activeId,[]);
    }
  };
}
