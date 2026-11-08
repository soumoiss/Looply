/* Chat Ultra authoritative, paginated and recipient-scoped activity center. */
export function setupUltraActivities({client,userId,visual,onOpen,win=globalThis.window}={}){
  if(!client||!userId||!visual||!win)
    return {open(){},refreshBadge(){},dispose(){}};
  let disposed=false,loading=false,activeFilter="all",pageSize=50,generation=0;
  const validId=value=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value||""));
  const emojiForKind=kind=>({
    letter:"💌",message:"💬",poll:"📊",game:"🎮",missed:"📵",
    call:"📞",audio:"📞",video:"📹",group:"👥",reaction:"💜"
  })[kind]||"🔔";
  const calls=["audio","video","call","missed"];
  async function fetchActivities(filter,limit){
    let query=client.from("chat_notifications")
      .select("id,conversation_id,message_id,kind,preview,created_at,read_at")
      .eq("user_id",userId).order("created_at",{ascending:false});
    if(filter==="unread")query=query.is("read_at",null);
    if(filter==="calls")query=query.in("kind",calls);
    const {data,error}=await query.range(0,limit);
    if(error)throw error;
    return (data||[]).filter(row=>validId(row?.id)&&validId(row?.conversation_id)).map(row=>({
      id:row.id,conversationId:row.conversation_id,
      messageId:validId(row.message_id)?row.message_id:null,
      kind:String(row.kind||"message").slice(0,40),
      preview:String(row.preview||"Nova atividade").slice(0,180),
      createdAt:row.created_at,seen:Boolean(row.read_at),
      emoji:emojiForKind(row.kind)
    }));
  }
  async function refreshBadge(){
    if(disposed)return;
    try{
      const {data,error}=await client.rpc("v46_chat_unread_activity_count");
      if(error||!Number.isInteger(data))throw error||Error("badge_count_unavailable");
      visual.updateActivityBadge?.(data);
    }catch(error){
      console.warn("Chat Ultra: unread activity count unavailable",error?.code||"offline");
    }
  }
  async function open(filter=activeFilter,{more=false}={}){
    if(disposed||loading)return;
    const target=["all","unread","calls"].includes(filter)?filter:"all";
    if(target!==activeFilter||!more)pageSize=more?pageSize:50;
    if(more)pageSize=Math.min(1000,pageSize+50);
    activeFilter=target;
    const current=++generation;
    loading=true;
    try{
      const rows=await fetchActivities(activeFilter,pageSize);
      if(current!==generation||disposed)return;
      const hasMore=rows.length>pageSize;
      const visible=rows.slice(0,pageSize);
      visual.showServerActivities?.(visible,activeFilter,{
        hasMore,
        filter:next=>void open(next),
        loadMore:()=>void open(activeFilter,{more:true}),
        select:async id=>{
          const item=visible.find(row=>row.id===id);
          if(!item)return;
          if(!item.seen){
            const {error}=await client.from("chat_notifications")
              .update({read_at:new Date().toISOString()})
              .eq("id",id).eq("user_id",userId).select("id").maybeSingle();
            if(error){visual.notice?.("Não foi possível confirmar a leitura.");return;}
          }
          await refreshBadge();
          visual.closeActivityPanel?.();
          onOpen?.(item.conversationId,item.messageId);
        },
        markAll:async()=>{
          try{
            const {data,error}=await client.rpc("v46_chat_mark_all_activity_seen");
            if(error||!Number.isInteger(data))throw error||Error("not_confirmed");
            await refreshBadge();void open(activeFilter);
          }catch(error){
            visual.notice?.("Não foi possível marcar as atividades como vistas.");
          }
        }
      });
    }catch(error){
      console.warn("Chat Ultra: activity timeline failed",error?.code||"offline");
      visual.notice?.("Não foi possível carregar atividades agora.");
    }finally{loading=false;}
  }
  const timer=win.setInterval(()=>void refreshBadge(),12000);
  void refreshBadge();
  return {open,refreshBadge,dispose(){disposed=true;generation++;win.clearInterval(timer);}};
}
