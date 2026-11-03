import {notificationBus} from "./notification-bus.js?v=notification-bus-20261022";

const verifiedUuid=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
function safePreview(value){
  return String(value||"").replace(/[\x00-\x1f\x7f]+/g," ").trim().slice(0,180);
}
/** Show only newly committed, recipient-visible activity on an authenticated page. */
export function mountLiveNotificationToasts(client,userId){
  if(!client||!verifiedUuid.test(String(userId||"")))return ()=>{};
  const since=new Date(Date.now()-1000).toISOString();
  const seen=new Set(),stack=document.createElement("aside");
  stack.className="looply-live-notices";
  stack.dataset.looplyLiveNotices="";
  stack.setAttribute("role","region");
  stack.setAttribute("aria-label","Novas notificações");
  document.body.append(stack);
  let stopped=false,busy=false,lastPoll=0;
  const timers=new Set();
  function display(item,source){
    const id=source+":"+item.id;
    if(seen.has(id))return;
    seen.add(id);
    if(seen.size>1000)seen.clear();
    if(item.read_at)return;
    const card=document.createElement("section");
    card.className="looply-live-notice";
    card.setAttribute("role","status");
    const kind=source==="chat"?"Mensagem":
      item.kind==="reply"?"Resposta":
      item.kind==="comment"?"Comentário":
      item.preview==="Curtiu seu comentário"?"Curtida no comentário":
      item.kind==="post_like"?"Curtida":"Atividade";
    const author=item.actor?.display_name||item.actor?.username||"Looply";
    const top=document.createElement("div");
    top.className="looply-live-notice-top";
    const label=document.createElement("strong");label.textContent=kind;
    const close=document.createElement("button");close.type="button";
    close.textContent="×";close.setAttribute("aria-label","Fechar notificação");
    top.append(label,close);
    const body=document.createElement("p");
    body.textContent=source==="chat"?
      ((item.actor?author+" · ":"")+(safePreview(item.preview)||"Nova mensagem")):
      (author+" · "+(safePreview(item.preview)||"Nova atividade"));
    const anchor=document.createElement("a");
    anchor.href=source==="chat"?"conversa.html?id="+encodeURIComponent(item.conversation_id):
      "notificacoes.html";
    anchor.textContent=source==="chat"?"Abrir conversa":"Ver notificação";
    card.append(top,body,anchor);
    stack.prepend(card);
    const timer=setTimeout(()=>{timers.delete(timer);card.remove();},7000);
    timers.add(timer);
    close.addEventListener("click",()=>{clearTimeout(timer);timers.delete(timer);card.remove();});
    while(stack.childElementCount>2)stack.lastElementChild?.remove();
  }
  async function poll(){
    if(stopped||busy||document.visibilityState==="hidden"||Date.now()-lastPoll<700)return;
    busy=true;lastPoll=Date.now();
    try{
      const [app,chat]=await Promise.all([
        client.from("notifications")
          .select("id,kind,preview,created_at,read_at,actor:profiles!notifications_actor_id_fkey(username,display_name)")
          .eq("recipient_id",userId).gt("created_at",since).order("created_at",{ascending:false}).limit(12),
        client.from("chat_notifications")
          .select("id,message_id,conversation_id,preview,created_at,read_at")
          .eq("user_id",userId).gt("created_at",since).order("created_at",{ascending:false}).limit(12)
      ]);
      if(app.error||chat.error)throw app.error||chat.error;
      const chatMessages=[...new Set((chat.data||[]).map(row=>row.message_id).filter(Boolean))];
      if(chatMessages.length){
        const {data:messages,error:messageError}=await client.from("chat_messages")
          .select("id,author:profiles!chat_messages_sender_id_fkey(username,display_name)")
          .in("id",chatMessages.slice(0,12));
        if(!messageError){
          const senders=new Map((messages||[]).map(msg=>[msg.id,msg.author]));
          for(const note of chat.data||[])note.actor=senders.get(note.message_id)||null;
        }
      }
      const ordered=[...(app.data||[]).map(row=>({row,source:"app"})),
        ...(chat.data||[]).map(row=>({row,source:"chat"}))]
        .sort((a,b)=>Date.parse(a.row.created_at)-Date.parse(b.row.created_at));
      for(const entry of ordered)display(entry.row,entry.source);
    }catch(error){
      // Fail quietly rather than exposing a stale/incorrect notification.
      console.warn("Looply live notification lookup unavailable",error?.code||"network");
    }finally{busy=false;}
  }
  const stopListening=notificationBus.subscribeDebounced(()=>{void poll();},100);
  const timer=setInterval(()=>{void poll();},5500);
  const onVisible=()=>{if(document.visibilityState==="visible")void poll();};
  document.addEventListener("visibilitychange",onVisible);
  void poll();
  return ()=>{
    stopped=true;clearInterval(timer);stopListening();
    document.removeEventListener("visibilitychange",onVisible);
    for(const handle of timers)clearTimeout(handle);
    timers.clear();stack.remove();
  };
}
