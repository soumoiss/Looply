/* Chat Ultra: authenticated and paginated Neon notification timeline.
 * No fake activities, 100-item badge cap or local-only confirmations.
 */
const isId=id=>/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(String(id||""));
const TYPES={letter:"💌",message:"💬",poll:"📊",game:"🎮",missed:"📵",call:"📞",
  audio:"📞",video:"📹",group:"👥",reaction:"💜"};
export function setupUltraActivities({client,userId,visual,onOpen,profiles=()=>[],win=globalThis.window}={}){
  if(!client||!isId(userId)||!visual)return {open(){},refreshBadge(){},dispose(){}};
  let disposed=false,loading=false,filter="all",history=[],before=null,hasMore=false,nonce=0;
  const notificationFor=row=>({
    id:row.id,conversationId:row.conversation_id,messageId:row.message_id||"",
    kind:row.kind||"message",preview:String(row.preview||"Nova atividade").slice(0,180),
    createdAt:row.created_at,seen:Boolean(row.read_at),
    emoji:TYPES[row.kind]||"🔔",senderName:"",avatarUrl:""
  });
  async function refreshBadge(){
    if(disposed)return;
    try{
      const {data,error}=await client.rpc("v46_chat_unread_activity_count");
      if(error)throw error;
      visual.updateActivityBadge?.(Math.max(0,Number(data)||0));
    }catch(error){console.warn("Chat Ultra unread count unavailable",error?.code||"offline");}
  }
  async function fetchNext(){
    const {data,error}=await client.rpc("v46_chat_notifications",{p_before:before,p_limit:50});
    if(error)throw error;
    const rows=(Array.isArray(data)?data:[]).filter(row=>isId(row.id)&&isId(row.conversation_id));
    const mapped=rows.map(notificationFor);
    const messageIds=[...new Set(mapped.map(n=>n.messageId).filter(isId))];
    if(messageIds.length){
      try{
        const res=await client.from("chat_messages").select("id,sender_id").in("id",messageIds).limit(50);
        if(!res.error){
          const senders=new Map((res.data||[]).map(r=>[r.id,r.sender_id]));
          const people=new Map(profiles().map(p=>[p.id,p]));
          for(const item of mapped){
            const author=people.get(senders.get(item.messageId));
            if(!author)continue;
            item.senderName=author.display_name||author.username||"";
            item.avatarUrl=author.avatarUrl||"";
          }
        }
      }catch{/* A message can expire before its notification; keep the notification. */}
    }
    const known=new Set(history.map(n=>n.id));
    history.push(...mapped.filter(x=>!known.has(x.id)));
    before=rows.at(-1)?.created_at||before;
    hasMore=rows.length>=50;
  }
  function view(){
    const filtered=history.filter(item=>filter==="unread"?!item.seen:
      filter==="calls"?["call","audio","video","missed"].includes(item.kind):true);
    visual.showServerActivities?.(filtered,filter,{
      filter:next=>{
        filter=["all","unread","calls"].includes(next)?next:"all";
        view();
      },
      select:async id=>{
        const item=history.find(row=>row.id===id);
        if(!item)return;
        if(!item.seen){
          try{
            const {data,error}=await client.from("chat_notifications")
              .update({read_at:new Date().toISOString()})
              .eq("id",id).eq("user_id",userId).select("id").maybeSingle();
            if(error||data?.id!==id)throw error||Error("not_confirmed");
            item.seen=true;
          }catch(error){visual.notice?.("Não foi possível confirmar a leitura.");return;}
        }
        await refreshBadge();
        visual.closeActivityPanel?.();
        onOpen?.(item.conversationId,item.messageId);
      },
      markAll:async()=>{
        try{
          const {data,error}=await client.rpc("v46_chat_mark_all_activities_read");
          if(error||!Number.isInteger(Number(data)))throw error||Error("not_confirmed");
          history.forEach(row=>row.seen=true);
          await refreshBadge();view();
        }catch(error){visual.notice?.("Não foi possível marcar as atividades.");}
      },
      more:()=>void open(undefined,true),
      hasMore
    });
  }
  async function open(nextFilter="all",more=false){
    if(disposed||loading)return;
    filter=["all","unread","calls"].includes(nextFilter)?nextFilter:filter;
    loading=true;const current=++nonce;
    try{
      if(!more){history=[];before=null;hasMore=false;}
      await fetchNext();
      if(disposed||current!==nonce)return;
      view();
    }catch(error){
      console.warn("Chat Ultra activity timeline unavailable",error?.code||"offline");
      visual.notice?.("Não foi possível carregar atividades.");
    }finally{loading=false;}
  }
  const timer=win.setInterval(()=>void refreshBadge(),12000);
  void refreshBadge();
  return {open,refreshBadge,dispose(){disposed=true;nonce++;win.clearInterval(timer);}};
}
