import { safeMusicArtwork } from "../../src/chat-premium-cards.js";
/* Looply Chat Ultra: authenticated media previews.
 * Only URLs signed by the existing Neon/R2 storage adapter enter this renderer.
 * Replaces model-only audio/video/file placeholders with playable real media. */
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const valid=(value)=>{try{const u=new URL(value);return u.protocol==="https:"?u.href:"";}catch{return "";}};
function seconds(t){
  if(!Number.isFinite(t)||t<0)return "0:00";
  return Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0");
}
function barsFor(id){
  let hash=2166136261;for(const ch of String(id))hash=Math.imul(hash^ch.charCodeAt(0),16777619);
  return Array.from({length:36},(_,i)=>{
    hash=Math.imul(hash^(i+1),16777619);return 17+((hash>>>11)%72);
  });
}
function audioMarkup(message,url){
  return '<div class="chat-ultra-voice" data-ultra-voice>'+
    '<button type="button" data-ultra-voice-play aria-label="Reproduzir mensagem de voz" aria-pressed="false">▶</button>'+
    '<button type="button" class="chat-ultra-voice-seek" data-ultra-voice-seek aria-label="Avançar no áudio">'+
    barsFor(message.id).map(height=>'<i style="--h:'+height+'%"></i>').join("")+
    '</button>'+
    '<time data-ultra-voice-clock>0:00</time>'+
    '<audio preload="metadata" src="'+esc(url)+'" data-ultra-voice-audio></audio></div>';
}
function cardNode(message){
  const card=message.card;
  if(!card||!["contact","location","music"].includes(card.type))return null;
  const a=document.createElement("a");
  a.className="chat-ultra-real-card";
  const head=document.createElement("span"),name=document.createElement("strong"),sub=document.createElement("small");
  head.className="chat-ultra-real-card-icon";
  if(card.type==="contact"){
    if(!/^[0-9a-f-]{36}$/i.test(card.id||""))return null;
    a.href="perfil.html?usuario="+encodeURIComponent(card.id);
    head.textContent="👤";name.textContent=card.name;sub.textContent="@"+card.username;
  }else if(card.type==="location"){
    a.href=Number.isFinite(card.latitude)&&Number.isFinite(card.longitude)?
      "https://www.google.com/maps?q="+encodeURIComponent(card.latitude+","+card.longitude):
      "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(card.label||"");
    a.target="_blank";a.rel="noopener noreferrer";
    head.textContent="📍";name.textContent=card.label;sub.textContent="Abrir no mapa";
  }else{
    let link="";
    try{const target=new URL(card.url||"");if(target.protocol==="https:")link=target.href;}catch{}
    if(!link)return null;
    a.href=link;a.target="_blank";a.rel="noopener noreferrer";
    const artwork=safeMusicArtwork(card.artwork);
    if(artwork){
      const photo=document.createElement("img");photo.src=artwork;photo.alt="";photo.loading="lazy";
      photo.style.cssText="width:48px;height:48px;object-fit:cover;border-radius:12px";
      head.replaceChildren(photo);
    }else head.textContent="🎵";
    name.textContent=card.title;sub.textContent=card.artist||"Música compartilhada";
  }
  const copy=document.createElement("span");copy.className="chat-ultra-real-card-copy";
  copy.append(name,sub);a.append(head,copy);return a;
}
export function renderUltraPlayableMedia(markup,message){
  if(!message||!["audio","video","file","contact","location","music"].includes(message.kind))return markup;
  const url=valid(message.url);
  if(["audio","video","file"].includes(message.kind)&&!url)return markup;
  const template=document.createElement("template");
  template.innerHTML=markup;
  const bubble=template.content.querySelector(".m .b");
  if(!bubble)return markup;
  const meta=bubble.querySelector(".meta");
  const preserved=[...bubble.children].filter(n=>n.matches(".fw,.q"));
  const node=document.createElement("div");node.className="chat-ultra-real-media";
  if(message.kind==="audio"){
    node.innerHTML=audioMarkup(message,url);
  }else if(message.kind==="video"){
    const video=document.createElement("video");
    video.className="chat-ultra-real-video";video.src=url;
    video.controls=true;video.playsInline=true;video.preload="metadata";
    video.setAttribute("aria-label","Vídeo recebido");node.append(video);
  }else if(message.kind==="file"){
    const anchor=document.createElement("a");anchor.className="chat-ultra-real-file";
    anchor.href=url;anchor.target="_blank";anchor.rel="noopener noreferrer";
    const icon=document.createElement("span");icon.textContent="📎";
    const name=document.createElement("strong");
    name.textContent=String(message.name||"Arquivo").slice(0,160)||"Arquivo";
    anchor.append(icon,name);node.append(anchor);
  }else{
    const card=cardNode(message);
    if(!card)return markup;
    node.append(card);
  }
  bubble.replaceChildren(...preserved,node,...(meta?[meta]:[]));
  return template.innerHTML;
}
export function bindUltraPlayableMedia(root){
  if(!root)return ()=>{};
  const audioOf=element=>element.closest("[data-ultra-voice]")?.querySelector("audio");
  function progress(audio){
    const item=audio.closest("[data-ultra-voice]");
    if(!item)return;
    const duration=Number.isFinite(audio.duration)?audio.duration:0;
    const percent=duration?Math.min(100,Math.max(0,audio.currentTime/duration*100)):0;
    item.style.setProperty("--played",percent+"%");
    const clock=item.querySelector("[data-ultra-voice-clock]");
    if(clock)clock.textContent=seconds(audio.paused&&audio.currentTime===0?duration:audio.currentTime);
    const play=item.querySelector("[data-ultra-voice-play]");
    if(play){play.textContent=audio.paused?"▶":"Ⅱ";
      play.setAttribute("aria-pressed",String(!audio.paused));
      play.setAttribute("aria-label",audio.paused?"Reproduzir mensagem de voz":"Pausar mensagem de voz");
    }
  }
  function onClick(event){
    const play=event.target.closest("[data-ultra-voice-play]");
    if(play){
      const audio=audioOf(play);if(!audio)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(audio.paused)void audio.play().catch(()=>{play.textContent="!";});
      else audio.pause();
      return;
    }
    const seek=event.target.closest("[data-ultra-voice-seek]");
    if(!seek)return;
    const audio=audioOf(seek);if(!audio||!Number.isFinite(audio.duration)||!audio.duration)return;
    event.preventDefault();event.stopImmediatePropagation();
    const box=seek.getBoundingClientRect();
    audio.currentTime=Math.max(0,Math.min(audio.duration,(event.clientX-box.left)/box.width*audio.duration));
    progress(audio);
  }
  function onKey(event){
    const seek=event.target.closest("[data-ultra-voice-seek]");
    if(!seek||!["ArrowLeft","ArrowRight"].includes(event.key))return;
    const audio=audioOf(seek);if(!audio||!Number.isFinite(audio.duration))return;
    event.preventDefault();
    audio.currentTime=Math.max(0,Math.min(audio.duration,audio.currentTime+(event.key==="ArrowRight"?5:-5)));
    progress(audio);
  }
  function onMedia(event){
    const media=event.target;
    if(!media.matches("audio[data-ultra-voice-audio],video.chat-ultra-real-video"))return;
    if(event.type==="play"){
      for(const other of root.querySelectorAll("audio[data-ultra-voice-audio],video.chat-ultra-real-video"))
        if(other!==media&&!other.paused)other.pause();
    }
    if(media.matches("audio"))progress(media);
  }
  root.addEventListener("click",onClick,true);
  root.addEventListener("keydown",onKey,true);
  for(const name of ["play","pause","ended","timeupdate","loadedmetadata"]){
    root.addEventListener(name,onMedia,true);
  }
  return ()=>{root.removeEventListener("click",onClick,true);root.removeEventListener("keydown",onKey,true);
    for(const name of ["play","pause","ended","timeupdate","loadedmetadata"])root.removeEventListener(name,onMedia,true);
    root.querySelectorAll("audio[data-ultra-voice-audio],video.chat-ultra-real-video").forEach(x=>x.pause());
  };
}
