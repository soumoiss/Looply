/* Authenticated, paginated Chat Ultra activity center.
 * User-scoped v46 Neon RPCs; no fake local activities or truncated unread counts. */
export function setupUltraActivities({
  client,userId,visual,onOpen,getProfile=()=>null,win=globalThis.window
}={}){
  if(!client?.rpc||!userId||!visual||!win)return {open(){},refreshBadge(){},dispose(){}};
  let disposed=false,busy=false,loaded=false,hasMore=true,cursor=null;
  let activeFilter="all",records=[];
  const validId=value=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value||""));
  const symbols={letter:"💌",message:"💬",poll:"📊",game:"🎮",missed:"📵",
    call:"📞",audio:"📞",video:"📹",group:"👥",reaction:"💜"};
  async function refreshBadge(){
    if(disposed)return;
    try{
      const {data,error}=await client.rpc("v46_chat_unread_activity_count");
      if(error)throw error;
      visual.updateActivityBadge?.(Math.min(9999,Math.max(0,Number(data)||0)));
    }catch(error){console.warn("Chat Ultra badge unavailable",error?.code||"offline");}
  }
  function filtered(){
    return records.filter(item=>
      activeFilter==="unread"?!item.seen:
      activeFilter==="calls"?["audio","video","call","missed"].includes(item.kind):true);
  }
  function render(){
    if(disposed)return;
    visual.showServerActivities?.(filtered(),activeFilter,{
      filter:next=>void open(next),
      hasMore,
      more:()=>void loadMore(),
      select:async id=>{
        const item=records.find(row=>row.id===id);
        if(!item)return;
        try{
          if(!item.seen){
            const {error}=await client.from("chat_notifications")
              .update({read_at:new Date().toISOString()})
              .eq("id",item.id).eq("user_id",userId).select("id").maybeSingle();
            if(error)throw error;
            item.seen=true;
          }
          await refreshBadge();
          visual.closeActivityPanel?.();
          onOpen?.(item.conversationId,item.messageId);
        }catch(error){
          console.warn("Chat Ultra activity read failed",error?.code||"offline");
          visual.notice?.("Não foi possível marcar esta atividade como vista.");
        }
      },
      markAll:async()=>{
        try{
          const {data,error}=await client.rpc("v46_chat_mark_all_activities_read");
          if(error||!Number.isFinite(Number(data)))throw error||Error("unconfirmed");
          for(const item of records)item.seen=true;
          await refreshBadge();
          render();
        }catch(error){visual.notice?.("Não foi possível marcar as atividades.");}
      }
    });
  }
  async function loadMore(){
    if(disposed||busy||!hasMore)return;
    busy=true;
    try{
      const {data,error}=await client.rpc("v46_chat_notifications",{
        p_before:cursor,p_limit:50
      });
      if(error)throw error;
      const rows=Array.isArray(data)?data:[];
      const seen=new Set(records.map(r=>r.id));
      const accepted=rows.filter(row=>validId(row.id)&&validId(row.conversation_id)&&!seen.has(row.id));
      // Fetch sender profiles for visible notifications using RLS-scoped
      // message lookup. When a message is gone, keep a neutral icon.
      const messageIds=accepted.map(row=>row.message_id).filter(validId);
      const senders=new Map();
      if(messageIds.length){
        const result=await client.from("chat_messages")
          .select("id,sender_id").in("id",messageIds).limit(50);
        if(!result.error)for(const message of result.data||[])
          senders.set(message.id,message.sender_id);
      }
      for(const row of accepted){
        const profile=getProfile(senders.get(row.message_id))||{};
        const url=String(profile.avatarUrl||"");
        records.push({
          id:row.id,conversationId:row.conversation_id,messageId:row.message_id||null,
          kind:String(row.kind||"message").slice(0,40),
          preview:String(row.preview||"Nova atividade").slice(0,180),
          createdAt:row.created_at,seen:Boolean(row.read_at),
          emoji:symbols[row.kind]||"🔔",
          avatarUrl:/^https:\/\//.test(url)?url:"",
          senderName:String(profile.display_name||profile.username||"").slice(0,90)
        });
      }
      cursor=rows.at(-1)?.created_at||null;
      hasMore=rows.length===50;
      loaded=true;
      render();
    }catch(error){
      console.warn("Chat Ultra activities unavailable",error?.code||"offline");
      visual.notice?.("Não foi possível carregar atividades.");
    }finally{busy=false;}
  }
  async function open(filter=activeFilter){
    if(disposed)return;
    activeFilter=["all","unread","calls"].includes(filter)?filter:"all";
    if(!loaded)await loadMore();
    else render();
  }
  const timer=win.setInterval(()=>void refreshBadge(),12000);
  void refreshBadge();
  return {open,refreshBadge,dispose(){disposed=true;win.clearInterval(timer);}};
}