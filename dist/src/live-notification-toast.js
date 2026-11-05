import {notificationBus} from "./notification-bus.js?build=c8dfb31c1e9d8b3a";

const verifiedUuid=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const AVATAR_BUCKET="looply-avatars";
const NOTICE_LIFETIME=6500;
const SWIPE_DISMISS_PX=36;

function safePreview(value){
  return String(value||"").replace(/[\x00-\x1f\x7f]+/g," ").trim().slice(0,180);
}
function initialsOf(name){
  const parts=String(name||"").trim().split(/\s+/).filter(Boolean);
  if(!parts.length)return "L";
  return (parts[0][0]+(parts.length>1?parts[parts.length-1][0]:"")).toUpperCase();
}
/** Short sentence for activity events. Chat messages show the message preview instead. */
function activityText(item){
  const preview=safePreview(item.preview);
  if(item.kind==="story_view")return "visualizou seu Story";
  if(item.kind==="story_like")return "curtiu seu Story";
  if(item.kind==="story_mention")return "mencionou você em um Story";
  if(preview)return preview;
  return item.kind==="reply"?"respondeu ao seu comentário":
    item.kind==="comment"?"comentou na sua publicação":
    item.kind==="post_like"?"curtiu sua publicação":"Nova atividade";
}
function hrefFor(item,source){
  if(source==="chat")return "conversa.html?id="+encodeURIComponent(item.conversation_id);
  if(item.kind==="story_view"||item.kind==="story_like")return "home.html#stories";
  return "notificacoes.html";
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
  const timers=new Set(),avatarCache=new Map();

  async function avatarUrl(path){
    if(!path)return "";
    if(avatarCache.has(path))return avatarCache.get(path);
    const request=(async()=>{
      try{
        const {data,error}=await client.storage.from(AVATAR_BUCKET).createSignedUrl(path,1800);
        return error?"":(data?.signedUrl||"");
      }catch{return "";}
    })();
    avatarCache.set(path,request);
    return request;
  }
  function dismiss(card,timer){
    if(timer){clearTimeout(timer);timers.delete(timer);}
    if(!card.isConnected)return;
    card.classList.add("is-leaving");
    const finish=()=>card.remove();
    card.addEventListener("animationend",finish,{once:true});
    setTimeout(finish,320);
  }
  async function display(item,source){
    const id=source+":"+item.id;
    if(seen.has(id))return;
    seen.add(id);
    if(seen.size>1000)seen.clear();
    if(item.read_at)return;
    const name=item.actor?.display_name||item.actor?.username||"Looply";
    const text=source==="chat"?(safePreview(item.preview)||"Nova mensagem"):activityText(item);
    const url=await avatarUrl(item.actor?.avatar_path);
    if(stopped)return;

    const card=document.createElement("a");
    card.className="looply-live-notice looply-live-notice--ios";
    card.href=hrefFor(item,source);
    card.setAttribute("role","status");
    card.dataset.noticeSource=source;

    const avatar=document.createElement("span");
    avatar.className="looply-live-avatar";
    avatar.setAttribute("aria-hidden","true");
    if(url){
      const img=document.createElement("img");
      img.alt="";img.decoding="async";img.src=url;
      img.addEventListener("error",()=>{img.remove();avatar.textContent=initialsOf(name);});
      avatar.append(img);
    }else avatar.textContent=initialsOf(name);

    const copy=document.createElement("span");
    copy.className="looply-live-copy";
    const head=document.createElement("span");
    head.className="looply-live-head";
    const title=document.createElement("strong");title.textContent=name;
    const when=document.createElement("time");when.textContent="agora";
    head.append(title,when);
    const line=document.createElement("span");
    line.className="looply-live-text";
    line.textContent=text;
    copy.append(head,line);

    const close=document.createElement("button");
    close.type="button";close.className="looply-live-close";
    close.setAttribute("aria-label","Fechar notificação");
    close.textContent="×";
    card.append(avatar,copy,close);
    stack.prepend(card);

    const timer=setTimeout(()=>dismiss(card,timer),NOTICE_LIFETIME);
    timers.add(timer);
    close.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();dismiss(card,timer);});
    // Swipe up to dismiss, like a native banner.
    let startY=null;
    card.addEventListener("touchstart",event=>{startY=event.touches[0].clientY;},{passive:true});
    card.addEventListener("touchmove",event=>{
      if(startY===null)return;
      const delta=Math.min(0,event.touches[0].clientY-startY);
      card.style.transform="translateY("+delta+"px)";card.style.opacity=String(1+delta/120);
    },{passive:true});
    card.addEventListener("touchend",event=>{
      if(startY===null)return;
      const delta=event.changedTouches[0].clientY-startY;startY=null;
      if(delta<-SWIPE_DISMISS_PX){dismiss(card,timer);}
      else{card.style.transform="";card.style.opacity="";}
    });
    while(stack.childElementCount>3)stack.lastElementChild?.remove();
  }
  async function poll(){
    if(stopped||busy||document.visibilityState==="hidden"||Date.now()-lastPoll<700)return;
    busy=true;lastPoll=Date.now();
    try{
      const [app,chat]=await Promise.all([
        client.from("notifications")
          .select("id,kind,preview,created_at,read_at,actor:profiles!notifications_actor_id_fkey(username,display_name,avatar_path)")
          .eq("recipient_id",userId).gt("created_at",since).order("created_at",{ascending:false}).limit(12),
        client.from("chat_notifications")
          .select("id,message_id,conversation_id,preview,created_at,read_at")
          .eq("user_id",userId).gt("created_at",since).order("created_at",{ascending:false}).limit(12)
      ]);
      if(app.error||chat.error)throw app.error||chat.error;
      const chatMessages=[...new Set((chat.data||[]).map(row=>row.message_id).filter(Boolean))];
      if(chatMessages.length){
        const {data:messages,error:messageError}=await client.from("chat_messages")
          .select("id,author:profiles!chat_messages_sender_id_fkey(username,display_name,avatar_path)")
          .in("id",chatMessages.slice(0,12));
        if(!messageError){
          const senders=new Map((messages||[]).map(msg=>[msg.id,msg.author]));
          for(const note of chat.data||[])note.actor=senders.get(note.message_id)||null;
        }
      }
      const ordered=[...(app.data||[]).map(row=>({row,source:"app"})),
        ...(chat.data||[]).map(row=>({row,source:"chat"}))]
        .sort((a,b)=>Date.parse(a.row.created_at)-Date.parse(b.row.created_at));
      for(const entry of ordered)await display(entry.row,entry.source);
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
