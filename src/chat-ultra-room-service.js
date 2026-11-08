// Chat Ultra per-user room state and conversation-level temporary message policy.
// Every operation goes through a JWT-scoped Neon RPC. No local fake success.
const ID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const TTLS=new Set([0,30,86400,604800,7776000]);
export function createUltraRoomService(client,onError=()=>{}){
  const states=new Map();
  const valid=id=>ID.test(String(id||""));
  const invoke=async(name,args)=>{
    const {data,error}=await client.rpc(name,args);
    if(error)throw error;
    return data;
  };
  async function load(conversationIds=[]){
    states.clear();
    const ids=[...new Set(conversationIds.filter(valid))];
    for(let i=0;i<ids.length;i+=100){
      const data=await invoke("v44_chat_room_state",{p_conversation_ids:ids.slice(i,i+100)});
      for(const state of Array.isArray(data)?data:[]){
        states.set(state.conversation_id,{
          id:state.conversation_id,ttl:Number(state.ttl_seconds)||0,
          clearedBefore:state.cleared_before||null,
          hiddenAt:state.hidden_at||null,
          reminder:Boolean(state.unread_reminder)
        });
      }
    }
    return states;
  }
  const get=id=>states.get(id)||{id,ttl:0,clearedBefore:null,hiddenAt:null,reminder:false};
  async function command(name,args,id){
    if(!valid(id))return false;
    try{
      const done=await invoke(name,args);
      if(done!==true)throw Error("not_authorized");
      await load([...states.keys()]);
      return true;
    }catch(error){
      onError(error?.code||"permission");
      return false;
    }
  }
  async function expiry(id,seconds){
    if(!TTLS.has(Number(seconds)))return false;
    return command("v44_chat_set_expiry",{p_conversation_id:id,p_ttl_seconds:Number(seconds)},id);
  }
  const unread=(id,on)=>command("v44_chat_mark_unread",{p_conversation_id:id,p_marked:Boolean(on)},id);
  const clear=id=>command("v44_chat_clear_history",{p_conversation_id:id},id);
  const hide=(id,on)=>command("v44_chat_hide_room",{p_conversation_id:id,p_hide:Boolean(on)},id);
  const leave=id=>command("v44_chat_leave_group",{p_conversation_id:id},id);
  const transfer=(id,to)=>valid(to)&&command("v44_chat_transfer_group_owner",{p_conversation_id:id,p_target_user_id:to},id);
  function isHidden(conversation){
    const state=get(conversation?.id);
    if(!state.hiddenAt)return false;
    const recent=Date.parse(conversation?.lastMessage?.created_at||"")||0;
    return recent<=Date.parse(state.hiddenAt);
  }
  return {load,get,expiry,unread,clear,hide,leave,transfer,isHidden,states};
}
