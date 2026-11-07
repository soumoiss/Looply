/* Looply Chat Ultra — live adapter for the exact approved visual model.
 * The model is the visible DOM. Neon Auth, messages, participants and uploads
 * remain the source of truth; no demo conversations are published.
 */
import { mountAppPage } from "../../src/page-runtime.js?v=one-session-entry-20261031";
import { loadChatData, chatMarkup, bindChatEvents, disposeChatRealtime, setupChatRealtime } from "../../src/chat.js?v=ultra-20261107-r1";
import { setupChatPremium } from "../../src/chat-premium.js?v=ultra-20261107-r1";
import { setupChatEnhancements } from "../../src/chat-enhancements.js?v=ttt-clean-20261103-premium";
import { setupChatCalls } from "../../src/chat-calls.js?v=fast-ice-20261031";
import { setupOfficialMessagesModel } from "../../src/chat-reference-complete.js?v=official-model-20261104-r1";
import { parsePremiumChatBody, makePremiumLetter, makePremiumPoll, makePremiumLocation, makePremiumContact } from "../../src/chat-premium-cards.js";

const visual=window.LooplyVisual;
const runtime=document.querySelector("#pageContent");
const errorMessage="Não foi possível concluir a ação. Confira a conexão e tente novamente.";
let client=null,selfId="",knownProfiles=[],roomIds=new Set(),lastRender="",channel=null;
let busy=false,loading=null,refreshTimer=0;
const say=text=>visual.notice(text);
const safeTime=value=>new Date(value||Date.now()).getTime()||Date.now();
function mapPreview(message){
  if(!message)return [];
  const card=parsePremiumChatBody(message.body||"");
  return [{id:message.id||"preview",from:message.sender_id||"",t:safeTime(message.created_at),
    text:card?.type==="letter"?"💌 Carta selada":card?.type==="poll"?"📊 "+card.question:
      card?.type==="contact"?"👤 "+card.name:card?.type==="location"?"📍 "+card.label:
      card?.type==="note"?card.body:card?.type==="music"?"🎵 "+card.title:
      String(message.body||""),kind:"text",react:{},st:"read"}];
}
function mapConversations(data){
  roomIds=new Set((data.conversations||[]).map(c=>c.id));
  return (data.conversations||[]).map(c=>({
    id:c.id,type:c.kind==="group"?"group":"dm",kind:c.kind,
    name:c.subject||"Grupo",coverUrl:c.coverUrl||"",
    members:(c.participants||[]).map(p=>p.user_id),
    pin:0,mute:0,unread:c.unreadCount||0,
    msgs:mapPreview(c.lastMessage)
  }));
}
async function refreshRooms(){
  if(!client||!selfId||document.hidden)return;
  try{
    const data=await loadChatData(client,selfId);
    knownProfiles=data.profiles||[];
    visual.rooms({selfId,profiles:knownProfiles,conversations:mapConversations(data)});
    const current=visual.current();
    if(current&&roomIds.has(current))await refreshThread(current);
  }catch(error){console.error("Chat Ultra: conversas indisponíveis",error);say("Não foi possível atualizar as conversas.");}
}
function planRefresh(delay=300){
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>void refreshRooms(),delay);
}
async function refreshThread(id){
  if(!client||!roomIds.has(id))return;
  if(loading===id)return;
  loading=id;
  try{
    const {data,error}=await client.from("chat_messages")
      .select("id,conversation_id,sender_id,reply_to,body,created_at,delivered_at,read_at,media:chat_media!chat_media_message_fk(id,storage_path,mime_type,file_name,byte_size)")
      .eq("conversation_id",id).order("created_at",{ascending:false}).limit(100);
    if(error)throw error;
    const messages=(data||[]).reverse();
    let reactions=[];
    if(messages.length){
      const result=await client.from("chat_message_reactions")
        .select("message_id,user_id,emoji").eq("conversation_id",id)
        .in("message_id",messages.map(m=>m.id)).limit(1000);
      reactions=result.data||[];
    }
    const reactByMessage=new Map();
    for(const r of reactions){
      let bucket=reactByMessage.get(r.message_id);
      if(!bucket){bucket={};reactByMessage.set(r.message_id,bucket);}
      bucket[r.user_id]=r.emoji;
    }
    const mapped=await Promise.all(messages.map(async message=>{
      const card=parsePremiumChatBody(message.body||"");
      const files=Array.isArray(message.media)?message.media:[];
      let media=files[0];
      let url="";
      if(media?.storage_path){
        const signed=await client.storage.from("looply-chat").createSignedUrl(media.storage_path,1800);
        url=signed.data?.signedUrl||"";
      }
      const kind=card?.type==="letter"?"letter":card?.type==="poll"?"poll":
        media?.mime_type?.startsWith("image/")?"img":
        media?.mime_type?.startsWith("audio/")?"audio":
        media?"file":"text";
      const base={
        id:message.id,from:message.sender_id,t:safeTime(message.created_at),
        kind,react:reactByMessage.get(message.id)||{},st:message.read_at?"read":message.delivered_at?"deliv":"sent",
        text:String(message.body||""),url,name:media?.file_name||"",reply:message.reply_to||null
      };
      if(card?.type==="letter")Object.assign(base,{title:card.title,text:card.body,signature:card.signature,paper:card.paper,seal:card.seal});
      if(card?.type==="poll"){const votes={};for(const [voter,emoji] of Object.entries(base.react)){const index=["❤️","😂","😮","😢","🙏","👍"].indexOf(emoji);if(index>=0)votes[voter]=index;}Object.assign(base,{text:card.question,options:card.options,votes,react:{}});}
      if(card?.type==="note")base.text=card.body;
      if(card?.type==="music")base.text="🎵 "+card.title+" — "+card.artist;
      if(card?.type==="contact")base.text="👤 "+card.name+" (@"+card.username+")";
      if(card?.type==="location")base.text="📍 "+card.label;
      if(card?.type==="game")base.text="🎮 Convite para jogar";
      return base;
    }));
    const signature=JSON.stringify(mapped.map(m=>[m.id,m.text,m.st,m.react,m.url]));
    if(visual.current()===id&&signature!==lastRender){
      visual.messages(id,mapped);
      lastRender=signature;
    }else visual.storeMessages(id,mapped);
  }catch(error){console.error("Chat Ultra: histórico indisponível",error);say("Não foi possível carregar o histórico.");}
  finally{loading=null;}
}
async function openBackend(id){
  if(!roomIds.has(id))return;
  runtime.dispatchEvent(new CustomEvent("looply:open-conversation",{detail:{conversationId:id}}));
  void refreshThread(id);
  const {error}=await client.rpc("mark_conversation_read",{p_conversation_id:id});
  if(error)console.warn("Chat Ultra: leitura não confirmada",error);
}
async function postBody(conversationId,body,replyTo=null){
  if(busy||!roomIds.has(conversationId))throw Error("Conversa indisponível.");
  if(typeof body!=="string"||!body.trim()||body.length>5000)throw Error("Mensagem inválida.");
  busy=true;
  try{
    const {data,error}=await client.from("chat_messages")
      .insert({conversation_id:conversationId,sender_id:selfId,body,reply_to:replyTo||null})
      .select("id").single();
    if(error||!data?.id)throw error||Error("Envio não confirmado");
    runtime.dispatchEvent(new CustomEvent("looply:chat-message-saved",{detail:{conversationId}}));
    const {requestImmediateMessagePush}=await import("../../src/chat-push-alert.js");
    void requestImmediateMessagePush(client,data.id);
    await refreshThread(conversationId);
    planRefresh(450);
  }finally{busy=false;}
}
async function sendModel(c,m){
  if(!c?.id)return;
  try{
    let body=String(m?.text||"");
    if(m?.kind==="letter")body=makePremiumLetter({title:m.title,body:m.text,signature:m.signature,paper:m.paper,seal:m.seal});
    if(m?.kind==="poll")body=makePremiumPoll({question:m.text,options:m.options});
    if(m?.kind==="location")body=makePremiumLocation(m.text);
    if(m?.kind==="contact")body=makePremiumContact({id:m.userId,name:m.name,username:m.username});
    if(m?.kind==="sticker")body=String(m.text||"");
    if(["audio","img","file"].includes(m?.kind)){say("Escolha o arquivo pelo seletor de anexos.");return;}
    await postBody(c.id,body,m?.replyTo||null);
    return true;
  }catch(error){console.error("Chat Ultra: envio falhou",error);say(error?.message||errorMessage);return false;}
}
async function editModel(c,m,body){
  if(!c?.id||!m?.id||m.from!==selfId||!body.trim())return;
  try{
    const {data,error}=await client.from("chat_messages").update({body:body.trim()})
      .eq("id",m.id).eq("conversation_id",c.id).eq("sender_id",selfId).select("id").maybeSingle();
    if(error||!data?.id)throw error||Error("Edição não autorizada");
    await refreshThread(c.id);
  }catch(error){console.error("Chat Ultra: edição falhou",error);say(errorMessage);}
}
async function openDirect(targetId){
  if(!knownProfiles.some(p=>p.id===targetId)||targetId===selfId)return;
  try{
    const existing=visual.conversations().find(c=>c.type==="dm"&&c.members.includes(targetId));
    if(existing){visual.open(existing.id);return;}
    const {data,error}=await client.functions.invoke("looply-chat",{body:{action:"create_direct",targetId}});
    if(error||!data?.conversationId)throw error||Error(data?.errorCode||"Conversa indisponível");
    await refreshRooms();
    visual.open(data.conversationId);
  }catch(error){console.error("Chat Ultra: conversa não criada",error);say(errorMessage);}
}
async function createGroup(targetIds,subject){
  try{
    if(targetIds.length<2||targetIds.length>49)throw Error("Selecione pelo menos duas pessoas.");
    const {data,error}=await client.functions.invoke("looply-chat",{body:{action:"create_group",subject:String(subject||"Grupo").slice(0,120),targetIds}});
    if(error||!data?.conversationId)throw error||Error(data?.errorCode||"Grupo indisponível");
    document.querySelector("#sh")?.close();
    await refreshRooms();
    visual.open(data.conversationId);
  }catch(error){console.error("Chat Ultra: grupo não criado",error);say(error?.message||errorMessage);}
}
async function legacyComposer(id){
  if(!roomIds.has(id))throw Error("Conversa não encontrada.");
  runtime.dispatchEvent(new CustomEvent("looply:open-conversation",{detail:{conversationId:id}}));
  for(let i=0;i<35;i++){
    const form=runtime.querySelector("form[data-chat-send]");
    if(form?.dataset.conversationId===id)return form;
    await new Promise(resolve=>setTimeout(resolve,80));
  }
  throw Error("O editor de anexos não está disponível.");
}
async function uploadFiles(files){
  if(!files.length)return;
  try{
    const id=visual.current();
    const form=await legacyComposer(id);
    const input=form.querySelector('input[name="files"]');
    const transfer=new DataTransfer();
    files.forEach(file=>transfer.items.add(file));
    input.files=transfer.files;
    form.requestSubmit();
    say("Enviando anexo…");
    setTimeout(()=>void refreshThread(id),1100);
  }catch(error){console.error("Chat Ultra: anexo indisponível",error);say(error?.message||errorMessage);}
}

const POLL_VOTES=["❤️","😂","😮","😢","🙏","👍"];
async function setReaction(conversationId,messageId,emoji){
  if(!roomIds.has(conversationId)||!POLL_VOTES.includes(emoji))return;
  try{
    const {data,error}=await client.from("chat_message_reactions")
      .select("emoji").eq("conversation_id",conversationId)
      .eq("message_id",messageId).eq("user_id",selfId).maybeSingle();
    if(error)throw error;
    const op=data?.emoji===emoji
      ?client.from("chat_message_reactions").delete().eq("conversation_id",conversationId).eq("message_id",messageId).eq("user_id",selfId)
      :client.from("chat_message_reactions").upsert({conversation_id:conversationId,message_id:messageId,user_id:selfId,emoji},{onConflict:"message_id,user_id"});
    const result=await op;
    if(result.error)throw result.error;
    await refreshThread(conversationId);
  }catch(error){console.error("Chat Ultra: reação não persistida",error);say(errorMessage);}
}
async function votePoll(conversationId,messageId,index){
  const emoji=POLL_VOTES[index];
  if(emoji)await setReaction(conversationId,messageId,emoji);
}
async function removeMessage(conversationId,messageId){
  if(!roomIds.has(conversationId))return;
  try{
    const {data,error}=await client.from("chat_messages").delete()
      .eq("conversation_id",conversationId).eq("id",messageId)
      .eq("sender_id",selfId).select("id").maybeSingle();
    if(error||!data?.id)throw error||Error("Exclusão não autorizada");
    await refreshThread(conversationId);
  }catch(error){console.error("Chat Ultra: exclusão falhou",error);say(errorMessage);}
}

function bindEvents(){
  visual.install({send:sendModel,edit:editModel,direct:openDirect,opened:openBackend,group:createGroup,react:setReaction,vote:votePoll,remove:removeMessage});
  document.addEventListener("change",event=>{
    const target=event.target;
    if(!target?.matches("#fImg,#fAny"))return;
    event.stopImmediatePropagation();
    const files=[...(target.files||[])];
    target.value="";
    void uploadFiles(files);
  },true);
  document.addEventListener("click",event=>{
    const poll=event.target.closest("#msgs [data-poll-vote]");
    if(poll){event.preventDefault();event.stopImmediatePropagation();void votePoll(visual.current(),poll.dataset.pollVote,Number(poll.dataset.option));return;}
    const destructive=event.target.closest("#shBox [data-d]");
    if(destructive){event.preventDefault();event.stopImmediatePropagation();const item=window.LooplyVisual.pendingDelete?.();document.querySelector("#sh")?.close();if(destructive.dataset.d==="all"&&item)void removeMessage(item.conversationId,item.messageId);else say("Esta exclusão não está disponível para você.");return;}
    const go=event.target.closest("#shBox #go");
    if(go){
      event.preventDefault();event.stopImmediatePropagation();
      const selected=[...document.querySelectorAll("#shBox .pk.on[data-k]")].map(e=>e.dataset.k);
      if(selected.length===1){document.querySelector("#sh")?.close();void openDirect(selected[0]);}
      else if(selected.length>=2)void createGroup(selected,document.querySelector("#shBox #gn")?.value||"Grupo");
      return;
    }
    const nav=event.target.closest("#dock button");
    if(nav){
      const index=[...nav.parentElement.querySelectorAll("button")].indexOf(nav);
      const paths=["home.html","reels.html","cartas.html","musicas.html","galeria.html","chat.html","notificacoes.html"];
      if(index>=0&&index!==5){event.preventDefault();event.stopImmediatePropagation();location.href=paths[index];}
    }
  },true);
  window.addEventListener("pagehide",()=>{clearTimeout(refreshTimer);void channel?.unsubscribe?.();disposeChatRealtime(client);},{once:true});
}
await mountAppPage({page:"chat",render:async({root,client:sessionClient,user,profile})=>{
  client=sessionClient;selfId=user.id;
  const initial=await loadChatData(client,selfId);
  root.innerHTML=chatMarkup(initial,selfId);
  bindChatEvents(root,client,()=>selfId);
  setupChatEnhancements(root,client,selfId);
  setupChatPremium(root,client,selfId);
  setupChatCalls(root,client,selfId);
  setupOfficialMessagesModel(root,client,selfId,initial);
  setupChatRealtime(client,selfId,root);
  knownProfiles=initial.profiles||[];
  visual.rooms({selfId,profiles:knownProfiles,conversations:mapConversations(initial),selfAvatar:profile.avatarUrl||""});
  bindEvents();
  const params=new URLSearchParams(location.search);
  const linked=params.get("conversation")||params.get("id");
  if(linked&&roomIds.has(linked))visual.open(linked);
  channel=client.channel("chat-ultra-live-"+selfId)
    .on("postgres_changes",{event:"*",schema:"public",table:"chat_messages"},payload=>{
      const id=payload.new?.conversation_id||payload.old?.conversation_id;
      if(roomIds.has(id)){void refreshThread(id);planRefresh(650);}
    }).subscribe();
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)planRefresh(500);});
  window.setInterval(()=>{if(!document.hidden)planRefresh(200);},30000);
}});
