/* Authenticated Chat Ultra activity center.
 * Reads only the current user's RLS-scoped Neon notifications.
 * No local phantom notifications, automated mock calls, or fake read counts.
 */
export function setupUltraActivities({client,userId,visual,onOpen,win=globalThis.window}={}){
  if(!client||!userId||!visual||!win)
    return {open(){},refreshBadge(){},dispose(){}};
  let disposed=false,loading=false,activeFilter="all";
  const validId=value=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value||""));
  const emojiForKind=kind=>({
    letter:"💌",message:"💬",poll:"📊",game:"🎮",missed:"📵",
    call:"📞",audio:"📞",video:"📹",group:"👥",reaction:"💜"
  })[kind]||"🔔";
  async function fetchActivities(){
    const {data,error}=await client.from("chat_notifications")
      .select("id,conversation_id,kind,preview,created_at,read_at")
      .eq("user_id",userId).order("created_at",{ascending:false}).limit(150);
    if(error)throw error;
    return (data||[]).filter(row=>validId(row?.id)&&validId(row?.conversation_id)).map(row=>({
      id:row.id,conversationId:row.conversation_id,
      kind:String(row.kind||"message").slice(0,40),
      preview:String(row.preview||"Nova atividade").slice(0,180),
      createdAt:row.created_at,seen:Boolean(row.read_at),
      emoji:emojiForKind(row.kind)
    }));
  }
  async function refreshBadge(){
    if(disposed)return;
    try{
      const {data,error}=await client.from("chat_notifications")
        .select("id").eq("user_id",userId).is("read_at",null).limit(100);
      if(error)throw error;
      visual.updateActivityBadge?.((data||[]).length);
    }catch(error){
      console.warn("Chat Ultra: unread activity count unavailable",error?.code||"offline");
    }
  }
  async function open(filter=activeFilter){
    if(disposed||loading)return;
    activeFilter=["all","unread","calls"].includes(filter)?filter:"all";
    loading=true;
    try{
      const records=await fetchActivities();
      const filtered=records.filter(item=>activeFilter==="unread"?!item.seen:
        activeFilter==="calls"?["audio","video","call","missed"].includes(item.kind):true);
      visual.showServerActivities?.(filtered,activeFilter,{
        filter:next=>void open(next),
        select:async id=>{
          const item=records.find(row=>row.id===id);
          if(!item)return;
          if(!item.seen){
            const {error}=await client.from("chat_notifications")
              .update({read_at:new Date().toISOString()})
              .eq("id",id).eq("user_id",userId).select("id").maybeSingle();
            if(error){visual.notice?.("Não foi possível confirmar a leitura.");return;}
          }
          await refreshBadge();
          visual.closeActivityPanel?.();
          onOpen?.(item.conversationId);
        },
        markAll:async()=>{
          const {error}=await client.from("chat_notifications")
            .update({read_at:new Date().toISOString()})
            .eq("user_id",userId).is("read_at",null).select("id").limit(1000);
          if(error){visual.notice?.("Não foi possível marcar as atividades.");return;}
          await refreshBadge();
          void open(activeFilter);
        }
      });
    }catch(error){
      console.warn("Chat Ultra: activity timeline failed",error?.code||"offline");
      visual.notice?.("Não foi possível carregar atividades agora.");
    }finally{loading=false;}
  }
  const timer=win.setInterval(()=>void refreshBadge(),12000);
  void refreshBadge();
  return {open,refreshBadge,dispose(){disposed=true;win.clearInterval(timer);}};
}
