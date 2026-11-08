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
import { mountUltraStickerPicker } from "./chat-ultra-stickers.js?v=chat-real-20261107";
import { createUltraPreferenceService } from "../../src/chat-ultra-preferences.js?v=20261108-r1";
import { mergeChatHistory,oldestChatTimestamp,hasChatHistoryPage } from "../../src/chat-ultra-history.js";
import { setupUltraTyping } from "../../src/chat-ultra-typing.js?v=20261108-v41";
import { setupUltraActivities } from "../../src/chat-ultra-activities.js?v=20261108-v1";
import { createUltraSendIds } from "../../src/chat-ultra-send-ids.js?v=20261108-v1";
import { createUltraRoomService } from "../../src/chat-ultra-room-service.js?v=20261108-v44";
import { createUltraDraftSync } from "../../src/chat-ultra-drafts.js?v=20261108-v45";
import { exportUltraHistory } from "../../src/chat-ultra-export.js?v=20261108-v1";
import { setupUltraRemoteBrowser } from "../../src/chat-ultra-remote-browser.js?v=20261108-v48";
import { mountUltraNativeOverlays } from "./chat-ultra-native-overlays.js?v=ultra-real-20261107";
import { renderUltraPlayableMedia, bindUltraPlayableMedia } from "./chat-ultra-media.js?v=ultra-r2-20261107";
import { setupUltraChatSchedules } from "./chat-ultra-scheduled.js?v=ultra-cron-20261107";
import { cc0StickerFromMessage } from "../../src/chat-sticker-catalog.js";
import { parsePremiumChatBody, makePremiumLetter, makePremiumPoll, makePremiumLocation, makePremiumContact, makePremiumNote, makePremiumMusic } from "../../src/chat-premium-cards.js";

const visual=window.LooplyVisual;
const runtime=document.querySelector("#pageContent");
const errorMessage="Não foi possível concluir a ação. Confira a conexão e tente novamente.";
let client=null,selfId="",knownProfiles=[],roomIds=new Set(),lastRender="",channel=null;
let busy=false,loading=null,refreshTimer=0,scheduler=null,preferenceService=null,typingSession=null,activityService=null,roomService=null,draftSync=null,browserService=null;
let attachmentBusy=false;
const olderPages=new Map(),hasMoreHistory=new Map(),olderLoading=new Set(),rerunPending=new Set();
const CHAT_SELECT="id,conversation_id,sender_id,reply_to,body,created_at,expires_at,delivered_at,read_at,media:chat_media!chat_media_message_fk(id,storage_path,mime_type,file_name,byte_size)";
const signedMediaCache=new Map();
const pendingSendIds=createUltraSendIds();
let nicknameMap=new Map();
async function signedMedia(bucket,path,requestedSeconds=1800){
  if(!path||requestedSeconds<=1)return "";
  const seconds=Math.max(2,Math.min(1800,Math.floor(requestedSeconds)));
  const key=bucket+":"+path+":"+seconds,old=signedMediaCache.get(key),now=Date.now();
  if(old?.validUntil>now)return old.url;
  const result=await client.storage.from(bucket).createSignedUrl(path,seconds);
  const url=result.error?"":String(result.data?.signedUrl||"");
  if(/^https:\/\//i.test(url)){
    if(signedMediaCache.size>350)signedMediaCache.clear();
    signedMediaCache.set(key,{url,validUntil:now+Math.max(500,seconds*1000-2000)});
    return url;
  }
  return "";
}
async function onlineIds(profiles){
  const ids=(profiles||[]).map(p=>p.id).filter(id=>/^[0-9a-f-]{36}$/i.test(id)).slice(0,120);
  if(!ids.length)return [];
  try{const {data,error}=await client.rpc("v37_chat_presence_visible",{p_user_ids:ids});
    if(error)throw error;return (data||[]).map(row=>row.user_id).filter(Boolean);
  }catch(error){console.warn("Chat Ultra: presença temporariamente indisponível",error?.code||"offline");return [];}
}
const say=text=>visual.notice(text);
const safeTime=value=>new Date(value||Date.now()).getTime()||Date.now();
function mapPreview(message){
  if(!message)return [];
  const card=parsePremiumChatBody(message.body||"");
  return [{id:message.id||"preview",from:message.sender_id||"",t:safeTime(message.created_at),
    text:card?.type==="letter"?"💌 Carta selada":card?.type==="poll"?"📊 "+card.question:
      card?.type==="contact"?"👤 "+card.name:card?.type==="location"?"📍 "+card.label:
      card?.type==="note"?card.body:card?.type==="music"?"🎵 "+card.title:
      String(message.body||""),kind:"text",react:{},st:message.read_at?"read":message.delivered_at?"deliv":"sent"}];
}
async function loadChatBlocks(conversations){
  const blocks=new Map();
  const ids=(conversations||[]).filter(room=>room.kind==="direct"||room.kind==="letter").map(room=>room.id);
  for(let i=0;i<ids.length;i+=100){
    try{
      const {data,error}=await client.rpc("v43_chat_block_states",{p_conversation_ids:ids.slice(i,i+100)});
      if(error)throw error;
      for(const row of data||[])blocks.set(row.conversation_id,{
        blocked_by_me:row.blocked_by_me===true,can_chat:row.can_chat===true
      });
    }catch(error){
      console.warn("Chat Ultra: block permissions temporarily unavailable",error?.code||"offline");
      for(const id of ids.slice(i,i+100))blocks.set(id,{blocked_by_me:false,can_chat:false});
    }
  }
  return blocks;
}
async function fetchNicknames(){
  try{
    const {data,error}=await client.from("conversation_nicknames")
      .select("conversation_id,nickname").eq("user_id",selfId).limit(500);
    if(error)throw error;
    nicknameMap=new Map((data||[]).map(row=>[row.conversation_id,String(row.nickname||"")]));
  }catch(error){console.warn("Chat Ultra nicknames unavailable",error?.code||"offline");}
}
function mapConversations(data,blocks=new Map()){
  const states=roomService;
  roomIds=new Set((data.conversations||[]).map(c=>c.id));
  return (data.conversations||[]).filter(c=>!states?.isHidden(c)).map(c=>({
    id:c.id,type:c.kind==="group"?"group":"dm",kind:c.kind,
    name:c.subject||"Grupo",nick:nicknameMap.get(c.id)||"",coverUrl:c.coverUrl||"",createdBy:c.created_by||"",
    members:(c.participants||[]).map(p=>p.user_id),
    pin:0,mute:0,unread:Math.max(c.unreadCount||0,states?.get(c.id)?.reminder?1:0),
    reminder:states?.get(c.id)?.reminder||false,ttl:(states?.get(c.id)?.ttl||0)*1000,
    blocked:Boolean(blocks.get(c.id)?.blocked_by_me),canChat:blocks.get(c.id)?.can_chat!==false,
    msgs:mapPreview(c.lastMessage)
  }));
}
async function refreshRooms(){
  if(!client||!selfId||document.hidden)return;
  try{
    const data=await loadChatData(client,selfId);
    knownProfiles=data.profiles||[];
    const active=await onlineIds(knownProfiles);
    const blocks=await loadChatBlocks(data.conversations||[]);
    await fetchNicknames();
    try{await roomService?.load((data.conversations||[]).map(c=>c.id));}
    catch(error){console.warn("Chat Ultra room preferences unavailable",error?.code||"offline");}
    let preferences={};
    try{preferences=await preferenceService?.load()||{};}catch(error){console.warn("Chat Ultra preferences temporarily unavailable",error?.code||"offline");}
    visual.rooms({selfId,profiles:knownProfiles,conversations:mapConversations(data,blocks),onlineUserIds:active,remotePreferences:preferences});
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
  if(loading===id){rerunPending.add(id);return;}
  loading=id;
  try{
    const {data,error}=await client.from("chat_messages")
      .select(CHAT_SELECT)
      .eq("conversation_id",id).order("created_at",{ascending:false}).limit(100);
    if(error)throw error;
    const recent=(data||[]).reverse();
    if(!olderPages.has(id))hasMoreHistory.set(id,hasChatHistoryPage(recent));
    // "Apagar só para mim" is an authenticated per-account tombstone. Never
    // delete another participant's message just to hide it locally.
    const hiddenResult=await client.rpc("v41_hidden_chat_messages",{p_conversation_id:id});
    if(hiddenResult.error)throw hiddenResult.error;
    const hidden=new Set((hiddenResult.data||[]).map(row=>row.message_id));
    const flagResult=await client.rpc("v42_chat_message_flags",{p_conversation_id:id});
    if(flagResult.error)throw flagResult.error;
    const flags=new Map((flagResult.data||[]).map(row=>[row.message_id,row]));
    const messages=mergeChatHistory(olderPages.get(id)||[],recent).filter(message=>!hidden.has(message.id));
    // Read the genuine sticker attachments. A sticker belongs to the chat message;
    // a local file name must never be sent as its message body.
    const ids=messages.map(m=>m.id);
    const stickerData=ids.length?await client.from("chat_sticker_messages")
      .select("message_id,sticker_id").eq("conversation_id",id).in("message_id",ids).limit(100):{data:[],error:null};
    const stickerRefs=stickerData.error?[]:(stickerData.data||[]);
    const stickerIds=[...new Set(stickerRefs.map(row=>row.sticker_id))];
    const stickerRows=stickerIds.length?await client.from("sticker_catalog")
      .select("id,title,asset_path,storage_path").in("id",stickerIds):{data:[],error:null};
    const stickerUrls=new Map();
    if(!stickerRows.error)await Promise.all((stickerRows.data||[]).map(async row=>{
      if(/^assets\/stickers\/cc0\/[a-z0-9-]+\.webp$/.test(row.asset_path||"")){
        stickerUrls.set(row.id,row.asset_path);return;
      }
      if(!/^stickers\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(row.storage_path||""))return;
      const url=await signedMedia("looply-stickers",row.storage_path);
      if(url)stickerUrls.set(row.id,url);
    }));
    const stickerByMessage=new Map(stickerRefs.map(row=>[row.message_id,stickerUrls.get(row.sticker_id)||""]));
    let reactions=[];
    if(messages.length){
      const result=await client.from("chat_message_reactions")
        .select("message_id,user_id,emoji").eq("conversation_id",id)
        .in("message_id",messages.map(m=>m.id)).limit(1000);
      reactions=result.data||[];
    }

    // A dedicated authenticated ballot table replaces the old six-emoji
    // encoding, so an eighth alternative is a real eighth choice.
    const pollIds=messages.filter(m=>parsePremiumChatBody(m.body||"")?.type==="poll").map(m=>m.id);
    let storedPollVotes=null;
    if(pollIds.length){
      const ballots=await client.rpc("v38_chat_poll_votes",{p_conversation_id:id,p_message_ids:pollIds});
      if(!ballots.error && Array.isArray(ballots.data)){
        storedPollVotes=new Map();
        for(const ballot of ballots.data){
          let votes=storedPollVotes.get(ballot.message_id);
          if(!votes){votes={};storedPollVotes.set(ballot.message_id,votes);}
          votes[ballot.user_id]=Number(ballot.option_index);
        }
      }else console.warn("Chat Ultra: votos de enquete indisponíveis",ballots.error?.code||"offline");
    }
    const reactByMessage=new Map();
    for(const r of reactions){
      let bucket=reactByMessage.get(r.message_id);
      if(!bucket){bucket={};reactByMessage.set(r.message_id,bucket);}
      bucket[r.user_id]=r.emoji;
    }
    const mapped=await Promise.all(messages.map(async message=>{
      const card=parsePremiumChatBody(message.body||"");
      const bundled=cc0StickerFromMessage(message.body||"");
      const nativeSticker=stickerByMessage.get(message.id)||"";
      const files=Array.isArray(message.media)?message.media:[];
      let media=files[0];
      let url="";
      if(media?.storage_path){
        const expires=message.expires_at?Date.parse(message.expires_at):Infinity;
        const lifetime=Number.isFinite(expires)?Math.floor((expires-Date.now())/1000):1800;
        if(lifetime>1)url=await signedMedia("looply-chat",media.storage_path,lifetime);
      }
      const kind=nativeSticker||bundled?"sticker":card?.type==="letter"?"letter":card?.type==="poll"?"poll":
        media?.mime_type?.startsWith("image/")?"img":
        media?.mime_type?.startsWith("audio/")?"audio":
        media?.mime_type?.startsWith("video/")?"video":
        media?"file":["contact","location","music","note"].includes(card?.type)?card.type:"text";
      const base={
        id:message.id,from:message.sender_id,t:safeTime(message.created_at),expiresAt:message.expires_at||null,
        kind,react:reactByMessage.get(message.id)||{},st:message.read_at?"read":message.delivered_at?"deliv":"sent",
        text:kind==="sticker"?"Figurinha":String(message.body||""),url,name:media?.file_name||"",reply:message.reply_to||null,
        stickerSrc:bundled?.asset_path||nativeSticker||"",stickerUrl:nativeSticker||"",card:card||null,
        starred:Boolean(flags.get(message.id)?.saved),pinned:Boolean(flags.get(message.id)?.pinned)
      };
      if(card?.type==="letter")Object.assign(base,{title:card.title,text:card.body,signature:card.signature,paper:card.paper,seal:card.seal});
      if(card?.type==="poll"){
        const votes=storedPollVotes?.get(message.id)||{};
        if(!storedPollVotes){
          // Read-only fallback for earlier data when offline; no fake votes.
          for(const [voter,emoji] of Object.entries(base.react)){
            const index=["❤️","😂","😮","😢","🙏","👍"].indexOf(emoji);
            if(index>=0)votes[voter]=index;
          }
        }
        Object.assign(base,{text:card.question,options:card.options,votes,react:{}});
      }
      if(card?.type==="note")base.text=card.body;
      if(card?.type==="music")base.text="🎵 "+card.title+" — "+card.artist;
      if(card?.type==="contact")base.text="👤 "+card.name+" (@"+card.username+")";
      if(card?.type==="location")base.text="📍 "+card.label;
      if(card?.type==="game")base.text="🎮 Convite para jogar";
      return base;
    }));
    const signature=JSON.stringify(mapped.map(m=>[m.id,m.text,m.st,m.react,m.url,m.stickerUrl,m.votes,m.starred,m.pinned,m.expiresAt]));
    if(visual.current()===id&&signature!==lastRender){
      visual.messages(id,mapped);
      lastRender=signature;
    }else visual.storeMessages(id,mapped);
  }catch(error){console.error("Chat Ultra: histórico indisponível",error);say("Não foi possível carregar o histórico.");}
  finally{
    loading=null;
    if(rerunPending.delete(id))setTimeout(()=>void refreshThread(id),75);
  }
}
async function loadOlderHistory(id){
  if(!roomIds.has(id)||olderLoading.has(id)||hasMoreHistory.get(id)===false)return false;
  const visible=visual.conversations().find(c=>c.id===id)?.msgs||[];
  const cursor=visible.filter(m=>m.id&&m.id!=="preview").reduce((min,m)=>Math.min(min,m.t),Infinity);
  if(!Number.isFinite(cursor))return false;
  olderLoading.add(id);
  try{
    const result=await client.from("chat_messages").select(CHAT_SELECT).eq("conversation_id",id)
      .lt("created_at",new Date(cursor).toISOString()).order("created_at",{ascending:false}).limit(100);
    if(result.error)throw result.error;
    const older=(result.data||[]).reverse();
    const prior=olderPages.get(id)||[];
    olderPages.set(id,mergeChatHistory(prior,older));
    hasMoreHistory.set(id,hasChatHistoryPage(older));
    lastRender="";await refreshThread(id);return true;
  }catch(error){console.warn("Chat Ultra older messages unavailable",error?.code||"offline");say("Não foi possível carregar mensagens anteriores.");return false;}
  finally{olderLoading.delete(id);}
}
async function openBackend(id){
  if(!roomIds.has(id))return;
  lastRender="";
  runtime.dispatchEvent(new CustomEvent("looply:open-conversation",{detail:{conversationId:id}}));
  void refreshThread(id);
  const {error}=await client.rpc("mark_conversation_read",{p_conversation_id:id});
  if(!error)void roomService?.unread(id,false);
  if(error)console.warn("Chat Ultra: leitura não confirmada",error);
  else planRefresh(200);
}
async function postBody(conversationId,body,replyTo=null){
  if(busy||!roomIds.has(conversationId))throw Error("Conversa indisponível.");
  if(typeof body!=="string"||!body.trim()||body.length>5000)throw Error("Mensagem inválida.");
  busy=true;
  try{
    const nonce=pendingSendIds.get(conversationId,body,replyTo);
    let messageId=null;
    try{
      const {data,error}=await client.from("chat_messages")
        .insert({id:nonce,conversation_id:conversationId,sender_id:selfId,body,reply_to:replyTo||null})
        .select("id").single();
      if(error||data?.id!==nonce)throw error||Error("Envio não confirmado");
      messageId=data.id;
    }catch(insertError){
      // A lost acknowledgement can leave the row persisted in Neon. The same
      // nonce is used on retry; only the authenticated author's exact row can
      // turn a duplicate/timeout into a confirmed success.
      const {data:existing,error:readError}=await client.from("chat_messages")
        .select("id,conversation_id,sender_id,body")
        .eq("id",nonce).eq("conversation_id",conversationId)
        .eq("sender_id",selfId).maybeSingle();
      if(readError||existing?.id!==nonce||existing.body!==body)
        throw insertError;
      messageId=existing.id;
    }
    pendingSendIds.confirm(conversationId,body,replyTo);
    runtime.dispatchEvent(new CustomEvent("looply:chat-message-saved",{detail:{conversationId}}));
    void import("../../src/chat-push-alert.js")
      .then(({requestImmediateMessagePush})=>requestImmediateMessagePush(client,messageId))
      .catch(error=>console.warn("Chat Ultra: push could not be queued",error?.code||"offline"));
    typingSession?.stop();
    await refreshThread(conversationId);
    planRefresh(450);
  }finally{busy=false;}
}
async function sendModel(c,m){
  if(!c?.id)return;
  if(c.canChat===false){say("Não é possível enviar mensagens nesta conversa.");return false;}
  try{
    let body=String(m?.text||"");
    if(m?.kind==="letter")body=makePremiumLetter({title:m.title,body:m.text,signature:m.signature,paper:m.paper,seal:m.seal});
    if(m?.kind==="poll")body=makePremiumPoll({question:m.text,options:m.options});
    if(m?.kind==="location")body=makePremiumLocation(m.text);
    if(m?.kind==="contact")body=makePremiumContact({id:m.userId,name:m.name,username:m.username});
    if(m?.kind==="sticker"){say("Escolha a figurinha no catálogo da conversa.");return false;}
    if(m?.kind==="note")body=makePremiumNote([m.title,m.text].filter(Boolean).join("\n\n"));
    if(m?.kind==="music"){
      const raw=String(m.text||"");
      let url;
      try{url=new URL(raw);}catch{throw Error("Insira o link oficial da música.");}
      const host=url.hostname.toLowerCase();
      const provider=host==="music.apple.com"?"apple":
        host==="open.spotify.com"?"spotify":
        host==="www.deezer.com"||host==="deezer.com"?"deezer":"";
      if(!provider)throw Error("Escolha um link oficial Apple Music, Spotify ou Deezer.");
      body=makePremiumMusic({provider,title:m.title,artist:m.artist,url:raw});
    }
    if(["audio","img","file"].includes(m?.kind)){say("Escolha o arquivo pelo seletor de anexos.");return;}
    await postBody(c.id,body,m?.replyTo||null);
    return true;
  }catch(error){console.error("Chat Ultra: envio falhou",error);say(error?.message||errorMessage);return false;}
}
async function editModel(c,m,body){
  if(!c?.id||!m?.id||m.from!==selfId||!String(body||"").trim()||body.length>5000)return false;
  try{
    const {data,error}=await client.from("chat_messages").update({body:body.trim()})
      .eq("id",m.id).eq("conversation_id",c.id).eq("sender_id",selfId).select("id").maybeSingle();
    if(error||!data?.id)throw error||Error("Edição não autorizada");
    runtime.dispatchEvent(new CustomEvent("looply:chat-message-saved",{detail:{conversationId:c.id}}));
    lastRender="";await refreshThread(c.id);
    return true;
  }catch(error){console.error("Chat Ultra: edição falhou",error);say(errorMessage);return false;}
}
async function openDirect(targetId){
  if(!knownProfiles.some(p=>p.id===targetId)||targetId===selfId)return;
  try{
    const existing=visual.conversations().find(c=>c.type==="dm"&&c.members.includes(targetId));
    if(existing){visual.open(existing.id);return;}
    const {data,error}=await client.functions.invoke("looply-chat",{body:{action:"create_direct",targetId}});
    if(error||!data?.conversationId)throw error||Error(data?.errorCode||"Conversa indisponível");
    await roomService?.hide(data.conversationId,false);
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
async function uploadFiles(files,targetConversation=visual.current()){
  if(!files.length||attachmentBusy)return false;
  attachmentBusy=true;
  try{
    const id=targetConversation;
    if(id!==visual.current())throw Error("A conversa mudou antes do envio.");
    if(visual.conversations().find(c=>c.id===id)?.canChat===false)
      throw Error("Envio bloqueado nesta conversa.");
    const form=await legacyComposer(id);
    const input=form.querySelector('input[name="files"]');
    if(!input)throw Error("O envio de anexos não está disponível.");
    const body=form.querySelector('textarea[name="body"]');
    if(body)body.value="";
    const transfer=new DataTransfer();
    files.forEach(file=>transfer.items.add(file));
    input.files=transfer.files;
    say("Enviando anexo…");
    const accepted=await new Promise(resolve=>{
      let settled=false,timeout=0;
      const cleanup=()=>{
        clearTimeout(timeout);
        runtime.removeEventListener("looply:chat-attachment-saved",success);
        runtime.removeEventListener("looply:chat-attachment-failed",failure);
        window.removeEventListener("pagehide",unload);
      };
      const finish=value=>{
        if(settled)return;
        settled=true;
        cleanup();
        resolve(value);
      };
      const success=event=>{
        if(event.detail?.conversationId===id)finish(true);
      };
      const failure=event=>{
        if(event.detail?.conversationId===id)finish(false);
      };
      const unload=()=>finish(false);
      runtime.addEventListener("looply:chat-attachment-saved",success);
      runtime.addEventListener("looply:chat-attachment-failed",failure);
      window.addEventListener("pagehide",unload,{once:true});
      timeout=setTimeout(()=>finish(false),240000);
      try{form.requestSubmit();}catch(error){console.warn("Native chat submit failed",error);finish(false);}
    });
    if(!accepted)throw Error("Upload não confirmado. Verifique o anexo antes de tentar novamente.");
    await refreshThread(id);
    planRefresh(350);
    return true;
  }catch(error){
    console.error("Chat Ultra: anexo não confirmado",error);
    say(error?.message||errorMessage);
    return false;
  }finally{attachmentBusy=false;}
}

const POLL_VOTES=["❤️","😂","😮","😢","🙏","👍","🔥"];
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
    runtime.dispatchEvent(new CustomEvent("looply:chat-message-saved",{detail:{conversationId}}));
    lastRender="";await refreshThread(conversationId);
  }catch(error){console.error("Chat Ultra: reação não persistida",error);say(errorMessage);}
}
async function votePoll(conversationId,messageId,index){
  if(!roomIds.has(conversationId)||!Number.isInteger(index)||index<0||index>7)return;
  const selected=visual.conversations().find(c=>c.id===conversationId)?.msgs
    ?.find(m=>m.id===messageId)?.votes?.[selfId];
  try{
    const {data,error}=await client.rpc("v38_vote_chat_poll",{
      p_message_id:messageId,p_option:selected===index?-1:index
    });
    if(error||data!==true)throw error||Error("Voto não confirmado");
    runtime.dispatchEvent(new CustomEvent("looply:chat-message-saved",{detail:{conversationId}}));
    lastRender="";
    await refreshThread(conversationId);
    planRefresh(500);
  }catch(error){console.error("Chat Ultra: voto não confirmado",error);say("Não foi possível registrar o voto.");}
}
async function toggleMessageFlag(conversationId,messageId,kind){
  if(!roomIds.has(conversationId)||!["saved","pinned"].includes(kind))return;
  const current=visual.conversations().find(c=>c.id===conversationId)?.msgs?.find(m=>m.id===messageId);
  if(!current)return;
  const enabled=kind==="saved"?!current.starred:!current.pinned;
  try{
    const {data,error}=await client.rpc("v42_set_chat_message_flag",{
      p_message_id:messageId,p_flag:kind,p_enabled:enabled
    });
    if(error||data!==true)throw error||Error("not_authorized");
    lastRender="";
    await refreshThread(conversationId);
    say(kind==="saved"?(enabled?"Mensagem salva.":"Mensagem removida das salvas."):(enabled?"Mensagem fixada.":"Mensagem desafixada."));
  }catch(error){
    console.warn("Chat Ultra: message flag denied",error?.code||"permission");
    say("Não foi possível alterar esta mensagem no servidor.");
  }
}
async function hideMessageForSelf(conversationId,messageId){
  if(!roomIds.has(conversationId))return false;
  try{
    const {data,error}=await client.rpc("v41_hide_chat_message",{p_message_id:messageId});
    if(error||data!==true)throw error||Error("not_authorized");
    // Re-query from the backend; never fake a successful deletion.
    lastRender="";
    await refreshThread(conversationId);
    planRefresh(350);
    say("Mensagem removida apenas da sua visualização.");
    return true;
  }catch(error){
    console.warn("Chat Ultra: per-user deletion rejected",error?.code||"offline");
    say("Não foi possível remover a mensagem para você.");
    return false;
  }
}
async function removeMessage(conversationId,messageId){
  if(!roomIds.has(conversationId))return;
  try{
    const {data,error}=await client.from("chat_messages").delete()
      .eq("conversation_id",conversationId).eq("id",messageId)
      .eq("sender_id",selfId).select("id").maybeSingle();
    if(error||!data?.id)throw error||Error("Exclusão não autorizada");
    runtime.dispatchEvent(new CustomEvent("looply:chat-message-saved",{detail:{conversationId}}));
    lastRender="";await refreshThread(conversationId);
  }catch(error){console.error("Chat Ultra: exclusão falhou",error);say(errorMessage);}
}

function launchActualFeature(conversationId,selector,label){
  if(!conversationId||!roomIds.has(conversationId)){say("Conversa indisponível.");return;}
  const form=runtime.querySelector("form[data-chat-send]");
  const native=form?.dataset.conversationId===conversationId?runtime.querySelector(selector):null;
  if(native){native.click();return;}
  void legacyComposer(conversationId).then(()=>{
    const button=runtime.querySelector(selector);
    if(button)button.click();
    else say(label+" indisponível. Verifique a conexão.");
  }).catch(error=>say(error?.message||"Conversa não carregada."));
}
function startRealCall(conversationId,video=false){
  const room=visual.conversations().find(c=>c.id===conversationId);
  if(room?.canChat===false){say("A ligação está indisponível nesta conversa.");return;}
  if(!room||room.type!=="dm"){say("Chamadas diretas exigem uma conversa privada.");return;}
  launchActualFeature(conversationId,video?"[data-call-video]":"[data-call-audio]","Chamada");
}
function openRealGames(conversationId){
  launchActualFeature(conversationId,"[data-v2-game]","Games");
}

async function changeBlock(conversationId,enabled){
  const room=visual.conversations().find(c=>c.id===conversationId);
  const other=room?.type==="dm"?room.members.find(id=>id!==selfId):null;
  if(!other){say("Bloqueio disponível apenas em conversas privadas.");return false;}
  try{
    const {data,error}=await client.rpc("v43_set_chat_block",{
      p_target_user_id:other,p_block:enabled
    });
    if(error||data!==true)throw error||Error("not_authorized");
    await refreshRooms();
    say(enabled?"Contato bloqueado.":"Contato desbloqueado.");
    return true;
  }catch(error){
    console.warn("Chat Ultra: server block failed",error?.code||"permission");
    say("Não foi possível modificar o bloqueio no servidor.");
    return false;
  }
}
async function performRealRoomAction(action,id,value=null){
  if(!id||!roomIds.has(id)||!roomService)return false;
  const room=visual.conversations().find(c=>c.id===id);
  let ok=false;
  try{
    if(action==="ttl")ok=await roomService.expiry(id,Math.floor(Number(value)/1000));
    else if(action==="unread")ok=await roomService.unread(id,true);
    else if(action==="read"){
      const confirmed=await client.rpc("mark_conversation_read",{p_conversation_id:id});
      ok=!confirmed.error&&confirmed.data===true&&await roomService.unread(id,false);
    }
    else if(action==="clear")ok=await roomService.clear(id);
    else if(action==="hide")ok=await roomService.hide(id,true);
    else if(action==="show")ok=await roomService.hide(id,false);
    else if(action==="leave")ok=await roomService.leave(id);
    else if(action==="transfer")ok=await roomService.transfer(id,String(value||""));
    if(!ok){
      say(action==="leave"&&room?.createdBy===selfId?
        "Transfira a administração do grupo antes de sair.":"A alteração não foi autorizada pelo servidor.");
      return false;
    }
    if(action==="clear"){
      olderPages.delete(id);
      hasMoreHistory.delete(id);
      lastRender="";
      visual.storeMessages(id,[]);
    }
    if(["hide","leave","unread"].includes(action)&&visual.current()===id)
      visual.closeCurrent?.();
    await refreshRooms();
    if(["clear","ttl"].includes(action)&&visual.current()===id){
      lastRender="";await refreshThread(id);
    }
    const labels={
      ttl:"Prazo das novas mensagens atualizado.",unread:"Conversa marcada como não lida para você.",
      read:"Conversa marcada como lida.",clear:"Histórico ocultado apenas para sua conta.",
      hide:"Conversa removida da sua lista.",show:"Conversa restaurada.",
      leave:"Você saiu do grupo.",transfer:"Administração transferida."
    };
    say(labels[action]||"Alteração confirmada.");
    return true;
  }catch(error){
    console.warn("Chat Ultra room action failed",action,error?.code||"offline");
    say("Não foi possível concluir a ação no servidor.");
    return false;
  }
}
async function applyRealMemberChange(button){
  const id=visual.current();
  const group=visual.conversations().find(c=>c.id===id);
  const members=[...document.querySelectorAll("#shBox .pk.on[data-member-id]")].map(node=>node.dataset.memberId);
  if(!group||group.type!=="group"||!members.length){say("Escolha os participantes.");return;}
  const adding=button.textContent.trim().toLowerCase().startsWith("adicionar");
  if(!adding&&!confirm("Remover os participantes selecionados do grupo?"))return;
  button.disabled=true;
  let confirmed=0,failed=0;
  const mutation=adding?"v36_add_group_member":"v36_remove_group_member";
  for(const userId of new Set(members)){
    if(userId===selfId){failed++;continue;}
    try{
      const {data,error}=await client.rpc(mutation,{p_conversation_id:id,p_user_id:userId});
      if(error||data!==true)throw error||Error("not_confirmed");
      confirmed++;
    }catch(error){console.warn("Group membership was not confirmed",error?.code||"permission");failed++;}
  }
  document.querySelector("#sh")?.close();
  if(confirmed)await refreshRooms();
  say(confirmed?(adding?"Participantes adicionados: ":"Participantes removidos: ")+confirmed+
    (failed?" · "+failed+" não autorizados.":""):"Nenhuma alteração foi autorizada pelo servidor.");
}
async function saveRealConversationName(button){
  const id=visual.current(),group=visual.conversations().find(c=>c.id===id);
  if(!group)return;
  const name=document.querySelector("#shBox #nk")?.value.trim().slice(0,120)||"";
  if(!name){say("Informe o nome.");return;}
  button.disabled=true;
  try{
    if(group.type==="group"){
      const {data,error}=await client.rpc("v46_chat_rename_group",{p_conversation_id:id,p_subject:name});
      if(error||data!==true)throw error||Error("Apenas o administrador pode alterar o nome.");
      document.querySelector("#sh")?.close();
      await refreshRooms();
      say("Nome do grupo atualizado.");
      return;
    }
    const result=await client.from("conversation_nicknames").upsert({
        user_id:selfId,conversation_id:id,nickname:name,updated_at:new Date().toISOString()
      },{onConflict:"user_id,conversation_id"}).select("conversation_id").maybeSingle();
    if(result.error||!result.data)throw result.error||Error("not_confirmed");
    if(group.type==="dm")group.nick=name;
    document.querySelector("#sh")?.close();
    await refreshRooms();
    say("Nome salvo na sua conta.");
  }catch(error){console.warn("Conversation rename denied",error?.code||"permission");say("Não foi possível salvar o nome no servidor.");}
  finally{button.disabled=false;}
}
async function submitRealReport(button){
  const id=visual.current();
  if(!id||!roomIds.has(id))return;
  const selected=document.querySelector("#shBox [data-r].on")?.dataset.r;
  if(!selected){say("Selecione um motivo.");return;}
  const details=document.querySelector("#shBox #rd")?.value.trim().slice(0,500)||"";
  const reason=[selected,details].filter(Boolean).join(": ").slice(0,700);
  button.disabled=true;
  try{
    const {data,error}=await client.from("chat_conversation_reports")
      .insert({conversation_id:id,reporter_id:selfId,reason}).select("id").maybeSingle();
    if(error||!data?.id)throw error||Error("not_confirmed");
    document.querySelector("#sh")?.close();
    say("Denúncia registrada para análise.");
  }catch(error){console.warn("Moderation report not confirmed",error?.code||"permission");say("Não foi possível registrar a denúncia.");}
  finally{button.disabled=false;}
}

async function forwardRealMessage(source,targetId){
  if(!source?.id||!roomIds.has(targetId))return false;
  const original=visual.conversations().find(c=>c.id===visual.current())?.msgs?.find(m=>m.id===source.id);
  if(!original){say("Mensagem original indisponível.");return false;}
  if(["img","video","audio","file","sticker"].includes(original.kind)){
    say("O encaminhamento de anexos requer uma cópia autorizada da mídia.");return false;
  }
  try{
    const {data,error}=await client.from("chat_messages").select("body,expires_at")
      .eq("id",source.id).eq("conversation_id",visual.current()).maybeSingle();
    if(error||!data?.body)throw error||Error("Mensagem original indisponível.");
    if(data.expires_at&&Date.parse(data.expires_at)<=Date.now())throw Error("Mensagem expirada.");
    await postBody(targetId,data.body);
    say("Mensagem encaminhada.");
    planRefresh(300);
    return true;
  }catch(error){
    console.warn("Chat Ultra: forwarding rejected",error?.code||"offline");
    say(error?.message||"Não foi possível encaminhar.");
    return false;
  }
}

function bindEvents(){
  visual.install({send:sendModel,forward:forwardRealMessage,edit:editModel,
    remoteList:(mode,id,options)=>browserService?.open(mode,id,options),direct:openDirect,opened:openBackend,group:createGroup,
    react:setReaction,vote:votePoll,remove:removeMessage,call:startRealCall,games:openRealGames,
    uploadAudio:(conversationId,file)=>uploadFiles([file],conversationId),
    activities:()=>activityService?.open(),
    block:changeBlock,
    roomAction:performRealRoomAction,
    draft:(id,value)=>draftSync?.queue(id,value,!value),
    schedule:()=>scheduler?.open(),
    hasOlder:id=>Boolean(hasMoreHistory.get(id)),loadOlder:loadOlderHistory,
    savePrefs:row=>preferenceService?.queue(row),
    uploadWallpaper:(id,blob)=>preferenceService?.uploadPhoto(id,blob,visual.conversations().find(c=>c.id===id)),
    resolveWallpaper:(id,path)=>preferenceService?.signPhoto(id,path)});
  document.addEventListener("change",event=>{
    const target=event.target;
    if(!target?.matches("#fImg,#fAny"))return;
    event.stopImmediatePropagation();
    const files=[...(target.files||[])];
    target.value="";
    void uploadFiles(files);
  },true);
  document.addEventListener("click",event=>{
    const target=event.target;
    const remote=target.closest("#cfg [data-feature='media'],#cfg [data-feature='starred'],#bSearch");
    if(remote){
      event.preventDefault();event.stopImmediatePropagation();
      const id=visual.current();
      if(!id||!roomIds.has(id)){say("Abra uma conversa.");return;}
      browserService?.open(remote.id==="bSearch"?"search":
        remote.dataset.feature==="starred"?"saved":"media",id);
      return;
    }
    const detail=target.closest("#shBox [data-ultra-details]");
    if(detail){
      event.preventDefault();event.stopImmediatePropagation();
      const id=visual.current(),mid=detail.dataset.ultraDetails;
      const msg=visual.conversations().find(c=>c.id===id)?.msgs?.find(m=>m.id===mid);
      if(!id||!msg)return;
      document.querySelector("#sh")?.close();
      browserService?.open("receipts",id,{
        messageId:mid,createdAt:new Date(msg.t).toISOString()
      });
      return;
    }
    const share=target.closest("#attachFan [data-fan='share']");
    if(share){
      event.preventDefault();event.stopImmediatePropagation();
      const id=visual.current();
      if(!roomIds.has(id))return;
      const link=new URL("conversa.html",location.href);
      link.searchParams.set("conversation",id);
      const room=visual.conversations().find(c=>c.id===id);
      const label="Conversa Looply · "+(room?.type==="group"?room.name:"Mensagem privada");
      document.querySelector("#attachFan")?.classList.remove("open");
      if(document.querySelector("#bPlus"))document.querySelector("#bPlus").setAttribute("aria-expanded","false");
      if(navigator.share){
        void navigator.share({title:label,url:link.href})
          .catch(error=>{if(error?.name!=="AbortError")say("Compartilhamento indisponível.");});
      }else if(navigator.clipboard){
        void navigator.clipboard.writeText(link.href)
          .then(()=>say("Link copiado."))
          .catch(()=>say("Não foi possível copiar o link."));
      }else say(link.href);
      return;
    }
    const exportOpen=event.target.closest("#cfg [data-feature='export']");
    if(exportOpen){
      event.preventDefault();event.stopImmediatePropagation();
      const id=visual.current();
      if(!id||!roomIds.has(id))return;
      const dialog=document.querySelector("#sh"),panel=document.querySelector("#shBox");
      if(!dialog||!panel)return;
      delete panel.dataset.looplyContextMenu;
      delete panel.dataset.looplyRoomChoice;
      delete panel.dataset.looplyTtlRoom;
      panel.dataset.ultraExportConversation=id;
      panel.innerHTML='<div class="grab"></div><h2>Exportar histórico</h2>'+
        '<label class="feature-row">Formato <select class="fi" data-ultra-export-format>'+
        '<option value="json">JSON</option><option value="txt">Texto</option><option value="zip">ZIP</option></select></label>'+
        '<label class="feature-row">Período <select class="fi" data-ultra-export-days>'+
        '<option value="0">Todo o histórico disponível</option><option value="30">Últimos 30 dias</option>'+
        '<option value="7">Últimos 7 dias</option></select></label>'+
        '<label class="feature-row"><input type="checkbox" data-ultra-export-media> Incluir anexos disponíveis no ZIP</label>'+
        '<p class="mobile-note">Somente mensagens autorizadas para sua conta; mídias expiradas ou indisponíveis não serão exportadas.</p>'+
        '<p role="status" data-ultra-export-status></p>'+
        '<button type="button" class="btn main" data-ultra-export-go>Exportar</button>'+
        '<button type="button" class="btn" data-ultra-export-cancel>Cancelar</button>';
      if(!dialog.open)dialog.showModal();
      return;
    }
    const cancelExport=event.target.closest("#shBox [data-ultra-export-cancel]");
    if(cancelExport){event.preventDefault();event.stopImmediatePropagation();document.querySelector("#sh")?.close();return;}
    const exportGo=event.target.closest("#shBox [data-ultra-export-go]");
    if(exportGo){
      event.preventDefault();event.stopImmediatePropagation();
      const panel=document.querySelector("#shBox");
      const id=panel?.dataset.ultraExportConversation;
      if(!id||!roomIds.has(id))return;
      const room=visual.conversations().find(c=>c.id===id);
      const format=panel.querySelector("[data-ultra-export-format]")?.value||"json";
      const days=Number(panel.querySelector("[data-ultra-export-days]")?.value||0);
      const includeMedia=Boolean(panel.querySelector("[data-ultra-export-media]")?.checked);
      const status=panel.querySelector("[data-ultra-export-status]");
      exportGo.disabled=true;
      void exportUltraHistory({
        client,conversationId:id,conversationName:room?.name||"Conversa",days,format,
        includeMedia:format==="zip"&&includeMedia,
        onProgress:message=>{if(status)status.textContent=String(message);}
      }).then(summary=>{
        say("Histórico exportado: "+summary.count+" mensagens"+
          (summary.media.included?" · "+summary.media.included+" anexos.":".")+
          (summary.media.unavailable?" · "+summary.media.unavailable+" mídias indisponíveis.":""));
        document.querySelector("#sh")?.close();
      }).catch(error=>{
        console.warn("Chat Ultra: export failed",error?.code||"offline");
        if(status)status.textContent=error?.message||"Não foi possível exportar. Tente novamente.";
      }).finally(()=>{exportGo.disabled=false;});
      return;
    }
    const older=event.target.closest("#msgs [data-ultra-history-more]");
    if(older){
      event.preventDefault();event.stopImmediatePropagation();
      const id=visual.current(),list=document.querySelector("#msgs");
      if(!id||!list)return;
      older.disabled=true;older.textContent="Carregando…";
      const oldHeight=list.scrollHeight,oldTop=list.scrollTop;
      void loadOlderHistory(id).then(()=>requestAnimationFrame(()=>{
        if(visual.current()===id)list.scrollTop=oldTop+(list.scrollHeight-oldHeight);
      })).finally(()=>{older.disabled=false;});
      return;
    }
    const membership=event.target.closest("#shBox #memberCommit");
    if(membership){event.preventDefault();event.stopImmediatePropagation();void applyRealMemberChange(membership);return;}
    const nameSave=event.target.closest("#shBox #nks");
    if(nameSave){event.preventDefault();event.stopImmediatePropagation();void saveRealConversationName(nameSave);return;}
    const report=event.target.closest("#shBox #rs");
    if(report){event.preventDefault();event.stopImmediatePropagation();void submitRealReport(report);return;}
    const photo=event.target.closest('#cfg [data-feature="group-avatar"]');
    if(photo){
      event.preventDefault();event.stopImmediatePropagation();
      const choose=runtime.querySelector("[data-chat-group-cover-choose]");
      const group=visual.conversations().find(c=>c.id===visual.current());
      if(group?.type==="group"&&choose)choose.click();
      else say("Editor da foto do grupo indisponível. Reabra a conversa.");
      return;
    }
    const fakeSimulation=event.target.closest("#shBox [data-activity-sim],#cfg [data-ultra-setting='incoming']");
    if(fakeSimulation){event.preventDefault();event.stopImmediatePropagation();say("Eventos de demonstração não estão disponíveis na produção.");return;}
    const poll=event.target.closest("#msgs [data-poll-vote]");
    if(poll){event.preventDefault();event.stopImmediatePropagation();void votePoll(visual.current(),poll.dataset.pollVote,Number(poll.dataset.option));return;}
    const flagButton=event.target.closest("#shBox [data-enhanced-msg='star'],#shBox [data-enhanced-msg='pin']");
    if(flagButton){
      event.preventDefault();event.stopImmediatePropagation();
      const info=visual.pendingDelete?.();
      if(info)void toggleMessageFlag(info.conversationId,info.messageId,
        flagButton.dataset.enhancedMsg==="star"?"saved":"pinned");
      document.querySelector("#sh")?.close();
      return;
    }
    const destructive=event.target.closest("#shBox [data-d]");
    if(destructive){event.preventDefault();event.stopImmediatePropagation();const item=window.LooplyVisual.pendingDelete?.();document.querySelector("#sh")?.close();if(item&&destructive.dataset.d==="all")void removeMessage(item.conversationId,item.messageId);
      else if(item&&destructive.dataset.d==="me")void hideMessageForSelf(item.conversationId,item.messageId);
      else say("Esta exclusão não está disponível para você.");return;}
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
  window.addEventListener("pagehide",()=>{clearTimeout(refreshTimer);signedMediaCache.clear();olderPages.clear();hasMoreHistory.clear();void channel?.unsubscribe?.();disposeChatRealtime(client);},{once:true});
}
await mountAppPage({page:"chat",render:async({root,client:sessionClient,user,profile})=>{
  client=sessionClient;selfId=user.id;
  const initial=await loadChatData(client,selfId);
  roomService=createUltraRoomService(client,code=>console.warn("Chat Ultra room action not confirmed",code));
  draftSync=createUltraDraftSync(client,{onError:code=>console.warn("Chat Ultra draft retained locally",code)});
  window.addEventListener("pagehide",()=>{void draftSync?.flush();},{once:true});
  try{await roomService.load((initial.conversations||[]).map(c=>c.id));}
  catch(error){console.warn("Chat Ultra room state unavailable",error?.code||"offline");}
  preferenceService=createUltraPreferenceService(client,selfId,(message,error)=>{
    console.warn("Chat Ultra visual sync failed",error?.code||"offline");say(message);
  });
  let firstPreferences={};
  try{firstPreferences=await preferenceService.load();}catch(error){console.warn("Chat Ultra visual preferences unavailable",error?.code||"offline");}
  window.addEventListener("pagehide",()=>preferenceService?.dispose(),{once:true});
  root.innerHTML=chatMarkup(initial,selfId);
  const stopNativeOverlays=mountUltraNativeOverlays(document.getElementById("looplyLiveRuntime"),root);
  window.addEventListener("pagehide",stopNativeOverlays,{once:true});
  bindChatEvents(root,client,()=>selfId);
  setupChatEnhancements(root,client,selfId);
  setupChatPremium(root,client,selfId);
  setupChatCalls(root,client,selfId);
  setupOfficialMessagesModel(root,client,selfId,initial);
  setupChatRealtime(client,selfId,root);
  // The authenticated Cloudflare channel invalidates the native thread;
  // mirror its confirmed refresh into the approved Ultra visual timeline.
  let nativeFrame=0;
  root.addEventListener("looply:chat-rendered",()=>{
    if(nativeFrame)return;
    nativeFrame=requestAnimationFrame(()=>{
      nativeFrame=0;
      const id=visual.current();
      if(id&&roomIds.has(id))void refreshThread(id);
    });
  });
  window.addEventListener("pagehide",()=>cancelAnimationFrame(nativeFrame),{once:true});
  knownProfiles=initial.profiles||[];
  const active=await onlineIds(knownProfiles);
  const blocks=await loadChatBlocks(initial.conversations||[]);
  await fetchNicknames();
  visual.rooms({selfId,profiles:knownProfiles,conversations:mapConversations(initial,blocks),selfAvatar:profile.avatarUrl||"",onlineUserIds:active,remotePreferences:firstPreferences});
  void draftSync.load().then(rows=>visual.applyRemoteDrafts(rows))
    .catch(error=>console.warn("Chat Ultra server drafts unavailable",error?.code||"offline"));
  scheduler=setupUltraChatSchedules({client,getConversationId:()=>visual.current(),notice:say,onChange:()=>planRefresh(350)});
  window.addEventListener("pagehide",()=>scheduler?.dispose(),{once:true});
  visual.mediaRenderer(renderUltraPlayableMedia);
  const unbindMedia=bindUltraPlayableMedia(document.querySelector("#msgs"));
  window.addEventListener("pagehide",unbindMedia,{once:true});
  bindEvents();
  browserService=setupUltraRemoteBrowser({
    client,
    getRoom:id=>visual.conversations().find(c=>c.id===id),
    getUserName:id=>knownProfiles.find(p=>p.id===id)?.display_name||
      knownProfiles.find(p=>p.id===id)?.username||"Participante",
    onOpen:async(id,messageId)=>{
      visual.open(id);
      for(let step=0;step<20;step++){
        await refreshThread(id);
        const node=document.querySelector('#msgs [data-id="'+CSS.escape(messageId)+'"]');
        if(node){node.scrollIntoView({block:"center",behavior:"smooth"});node.classList.add("chat-highlighted");return;}
        if(!hasMoreHistory.get(id))break;
        const continued=await loadOlderHistory(id);
        if(!continued)break;
      }
      say("Mensagem fora do histórico carregado.");
    },
    notice:say,signMedia:signedMedia
  });
  window.addEventListener("pagehide",()=>browserService?.dispose(),{once:true});
  activityService=setupUltraActivities({
    client,userId:selfId,visual,
    onOpen:id=>{if(roomIds.has(id))visual.open(id);}
  });
  window.addEventListener("pagehide",()=>activityService?.dispose(),{once:true});
  typingSession=setupUltraTyping({
    client,input:document.querySelector("#inp"),
    getConversationId:()=>visual.current(),
    onUpdate:(id,users)=>visual.showTyping(id,users)
  });
  window.addEventListener("pagehide",()=>typingSession?.dispose(),{once:true});
  mountUltraStickerPicker({client,getUserId:()=>selfId,getConversationId:()=>visual.current(),onSaved:()=>{
    const id=visual.current();if(id)void refreshThread(id);
    planRefresh(350);
  }});
  const params=new URLSearchParams(location.search);
  const linked=params.get("conversation")||params.get("id");
  if(linked&&roomIds.has(linked))visual.open(linked);
  channel=client.channel("chat-ultra-live-"+selfId)
    .on("postgres_changes",{event:"*",schema:"public",table:"chat_messages"},payload=>{
      const id=payload.new?.conversation_id||payload.old?.conversation_id;
      if(roomIds.has(id)){void refreshThread(id);planRefresh(650);}
    }).subscribe();
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden)return;
    planRefresh(500);
    void draftSync?.load().then(rows=>visual.applyRemoteDrafts(rows)).catch(()=>{});
  });
  window.setInterval(()=>{if(!document.hidden)planRefresh(200);},30000);
  // Time-limited messages vanish when Neon stops authorizing their rows.
  // This timer only re-queries the server: it never deletes chat data locally
  // as an ersatz expiration or purges a fellow participant's message.
  const expirationRefresh=window.setInterval(()=>{
    if(document.hidden)return;
    const id=visual.current();
    const messages=visual.conversations().find(c=>c.id===id)?.msgs||[];
    if(id&&messages.some(m=>m.expiresAt))void refreshThread(id);
  },6500);
  window.addEventListener("pagehide",()=>window.clearInterval(expirationRefresh),{once:true});

}});
