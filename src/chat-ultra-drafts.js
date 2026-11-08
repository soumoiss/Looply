/* Authenticated per-account draft sync. RLS-protected RPCs; no notifications.
 * The live composer remains usable offline because local recovery is retained.
 */
const valid=id=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(id||""));
export function createUltraDraftSync(client,{onError=()=>{},delay=650}={}){
  const pending=new Map(),timers=new Map(),chains=new Map();
  let disposed=false;
  const chain=(id,body)=>{
    const previous=chains.get(id)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      const {data,error}=await client.rpc("v45_chat_save_draft",{
        p_conversation_id:id,p_body:body
      });
      if(error||data!==true)throw error||Error("not_authorized");
      if(pending.get(id)===body)pending.delete(id);
      return true;
    }).catch(error=>{
      onError(error?.code||"offline");
      return false;
    });
    chains.set(id,next);
    return next;
  };
  async function load(){
    const {data,error}=await client.rpc("v45_chat_read_drafts");
    if(error)throw error;
    return (Array.isArray(data)?data:[])
      .filter(row=>valid(row.conversation_id)&&typeof row.body==="string"&&row.body.trim())
      .map(row=>({id:row.conversation_id,body:row.body.slice(0,12000),updatedAt:row.updated_at}));
  }
  function queue(id,body,immediate=false){
    if(disposed||!valid(id))return;
    const value=String(body||"").slice(0,12000);
    pending.set(id,value);
    clearTimeout(timers.get(id));
    timers.set(id,setTimeout(()=>{
      timers.delete(id);
      const latest=pending.get(id);
      if(latest!==undefined)void chain(id,latest);
    },immediate?0:delay));
  }
  const flush=async()=>{
    for(const [id,timer] of timers)clearTimeout(timer);
    timers.clear();
    await Promise.all([...pending].map(([id,value])=>chain(id,value)));
  };
  const dispose=()=>{
    if(disposed)return;
    disposed=true;
    for(const timer of timers.values())clearTimeout(timer);
    timers.clear();pending.clear();
  };
  return {queue,load,flush,dispose,pending};
}
