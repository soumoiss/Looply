import { sendChatCard } from "./chat.js?v=premium-card-delivery";
import { icon } from "./icons.js";
import { makePremiumNote, makePremiumMusic, makePremiumGameCard } from "./chat-premium-cards.js";
import { searchStorySongs, officialSongPreview, normalizeStorySong } from "./story-music-catalog.js";
import { requestMediaPlayback, releaseMediaPlayback } from "./media-playback-coordinator.js";

const REACTIONS=["❤️","😂","😮","😢","🙏","👍"];
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function currentComposer(root){return root.querySelector("form[data-chat-send]");}
function closeAttachmentMenus(root){
  for(const menu of root.querySelectorAll("[data-chat-premium-menu]"))menu.hidden=true;
  for(const button of root.querySelectorAll("[data-chat-premium-menu-toggle]"))
    button.setAttribute("aria-expanded","false");
}
function closePremiumModal(root){
  const modal=root.querySelector("[data-chat-premium-modal]");
  if(modal?.open)modal.close();
  modal?.remove();
}
function createModal(root,{title,kind,content,submitLabel="Enviar"}){
  closePremiumModal(root);closeAttachmentMenus(root);
  const modal=document.createElement("dialog");
  modal.className="chat-premium-modal";
  modal.dataset.chatPremiumModal="";
  modal.composer=currentComposer(root);
  modal.setAttribute("aria-label",title);
  modal.innerHTML='<section><header><h2>'+esc(title)+'</h2><button type="button" data-chat-premium-close aria-label="Fechar">'+icon("close")+
    '</button></header><form data-chat-premium-card-form="'+esc(kind)+'">'+content+
    '<div class="chat-premium-modal-actions"><button type="button" data-chat-premium-close>Cancelar</button>'+
    '<button type="submit" data-chat-premium-confirm>'+esc(submitLabel)+'</button></div>'+
    '<p class="form-status" data-chat-premium-modal-status role="status" aria-live="polite"></p></form></section>';
  root.append(modal);
  modal.addEventListener("close",()=>modal.remove(),{once:true});
  modal._returnFocus=document.activeElement;
  modal.addEventListener("close",()=>{if(modal._returnFocus?.isConnected)modal._returnFocus.focus({preventScroll:true});},{once:true});
  modal.showModal();
  modal.querySelector("input,textarea")?.focus({preventScroll:true});
  return modal;
}
function setModalError(modal,message){
  const target=modal?.querySelector("[data-chat-premium-modal-status]");
  if(target)target.textContent=message;
}
function openNote(root){
  return createModal(root,{title:"💌 Escrever bilhete",kind:"note",content:
    '<label for="chatPremiumNote">Seu bilhete</label><textarea id="chatPremiumNote" name="note" maxlength="1200" rows="6" required placeholder="Algo especial para compartilhar…"></textarea>'+
    '<p class="chat-premium-note-hint">O bilhete ficará guardado na conversa, junto com as outras mensagens.</p>'});
}
function safeCover(value){
  try{
    const url=new URL(value);
    if(url.protocol!=="https:")return "";
    if(!["mzstatic.com","dzcdn.net","i.scdn.co"].some(host=>url.hostname===host||url.hostname.endsWith("."+host)))return "";
    return url.href;
  }catch{return "";}
}
function drawMusicResults(modal,tracks){
  const target=modal.querySelector("[data-chat-premium-music-results]");
  if(!target)return;
  target.replaceChildren();
  modal._premiumTracks=tracks;
  if(!tracks.length){
    const p=document.createElement("p");p.textContent="Nenhuma música encontrada. Experimente outro título ou artista.";target.append(p);return;
  }
  tracks.forEach((song,index)=>{
    const button=document.createElement("button");button.type="button";button.dataset.chatPremiumPickMusic=String(index);
    button.setAttribute("aria-label","Selecionar "+song.title+" de "+song.artist);
    const cover=safeCover(song.artwork);
    if(cover){const image=document.createElement("img");image.src=cover;image.alt="";image.loading="lazy";button.append(image);}
    else{const mark=document.createElement("span");mark.className="chat-premium-music-cover";mark.textContent="♫";button.append(mark);}
    const copy=document.createElement("span");
    const title=document.createElement("strong");title.textContent=song.title;
    const artist=document.createElement("small");artist.textContent=song.artist+" · "+song.provider;
    copy.append(title,artist);
    button.append(copy);
    target.append(button);
  });
}
function openMusic(root){
  const modal=createModal(root,{title:"🎵 Compartilhar música",kind:"music",content:
    '<label for="chatPremiumMusicQuery">Buscar por música ou artista</label>'+
    '<input id="chatPremiumMusicQuery" type="search" name="query" minlength="2" maxlength="70" placeholder="Digite o título ou artista" autocomplete="off" required>'+
    '<div class="chat-premium-music-results" data-chat-premium-music-results role="group" aria-label="Resultados de músicas"></div>'+
    '<p data-chat-premium-music-status role="status">Escolha uma faixa dos catálogos oficiais.</p>'});
  modal._premiumSelected=null;modal._premiumTracks=[];
  modal.querySelector("[data-chat-premium-confirm]").disabled=true;
  return modal;
}
function openThreadSearch(root){
  createModal(root,{title:"Buscar nesta conversa",kind:"search",submitLabel:"Buscar",content:
    '<label for="chatPremiumThreadQuery">Texto da mensagem</label>'+
    '<input id="chatPremiumThreadQuery" name="query" type="search" maxlength="100" required>'+
    '<ol class="chat-premium-search-results" data-chat-premium-search-results aria-label="Mensagens encontradas"></ol>'});
}

async function searchThread(client,modal,query){
  const results=modal.querySelector("[data-chat-premium-search-results]");
  results.replaceChildren();
  if(!query){setModalError(modal,"Digite um texto para buscar.");return;}
  setModalError(modal,"Buscando…");
  const pattern=query.replace(/[\\%_*]/g,character=>"\\"+character);
  const {data,error}=await client.from("chat_messages").select("body,created_at")
    .eq("conversation_id",modal.composer.dataset.conversationId)
    .ilike("body","%"+pattern+"%").order("created_at",{ascending:false}).limit(50);
  if(error)throw error;
  if(!modal.open)return;
  const dateFormat=new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"});
  for(const message of data||[]){
    const item=document.createElement("li"),date=document.createElement("time");
    date.dateTime=message.created_at;
    date.textContent=dateFormat.format(new Date(message.created_at));
    const body=document.createElement("p");
    body.textContent=message.body;
    item.append(date,body);
    results.append(item);
  }
  const count=results.children.length;
  setModalError(modal,count===50?"50 resultados mais recentes.":count?count+" resultado(s).":"Nenhuma mensagem encontrada.");
}

export function setupChatPremium(root,client,userId){
  if(!root||root.__looplyPremiumBound)return ()=>{};
  root.__looplyPremiumBound=true;
  let searchAbort=null,searchTimer=0;
  const cancelSearch=()=>{
    searchAbort?.abort();
    clearTimeout(searchTimer);
  };
  let activeAudio=null,activeButton=null;
  const stopAudio=()=>{
    if(activeAudio){try{activeAudio.pause();activeAudio.currentTime=0;}catch{}releaseMediaPlayback(root,activeAudio);}
    if(activeButton?.isConnected){activeButton.textContent="▶";activeButton.setAttribute("aria-label","Ouvir prévia");activeButton.setAttribute("aria-pressed","false");}
    activeAudio=null;activeButton=null;
  };
  const onClick=async event=>{
    const target=event.target;
    const messageMenu=target.closest("[data-chat-message-menu]");
    if(messageMenu){
      const actions=messageMenu.parentElement.querySelector(".chat-message-actions-inline");
      const open=actions.hidden;
      root.querySelectorAll("[data-chat-message-menu]").forEach(button=>{
        button.setAttribute("aria-expanded","false");
        button.parentElement.querySelector(".chat-message-actions-inline").hidden=true;
      });
      actions.hidden=!open;messageMenu.setAttribute("aria-expanded",String(open));
      if(open)actions.querySelector("button")?.focus({preventScroll:true});
      return;
    }
    if(target.closest("[data-chat-premium-legacy-letter]")){
      root.querySelectorAll(".chat-sidebar>details").forEach(panel=>panel.open=false);
      const panel=root.querySelector(".letter-compose-panel");
      if(panel){panel.open=true;panel.querySelector("input")?.focus();}
      return;
    }
    const menuToggle=target.closest("[data-chat-premium-menu-toggle]");
    if(menuToggle){
      const form=menuToggle.closest("[data-chat-send]");
      const menu=form?.querySelector("[data-chat-premium-menu]");
      if(menu){const open=menu.hidden;closeAttachmentMenus(root);menu.hidden=!open;menuToggle.setAttribute("aria-expanded",String(open));}
      return;
    }
    const attachmentAction=target.closest("[data-chat-premium-menu] button");
    if(attachmentAction)closeAttachmentMenus(root);
    if(target.closest("[data-chat-premium-new]")){

      root.querySelector("[data-chat-area]")?.classList.remove("is-conversation-open");
      root.querySelectorAll(".chat-sidebar>details").forEach(panel=>panel.open=false);
      const panel=root.querySelector(".chat-search-panel");
      if(panel){panel.open=true;panel.scrollIntoView({behavior:"smooth",block:"nearest"});panel.querySelector('input[name="query"]')?.focus({preventScroll:true});}
      return;
    }
    if(target.closest("[data-chat-premium-new-group]")){

      root.querySelector("[data-chat-area]")?.classList.remove("is-conversation-open");
      root.querySelectorAll(".chat-sidebar>details").forEach(panel=>panel.open=false);
      const panel=root.querySelector(".group-compose-panel");
      if(panel){panel.open=true;panel.scrollIntoView({behavior:"smooth",block:"nearest"});panel.querySelector('input[name="subject"]')?.focus({preventScroll:true});}
      return;
    }
    if(target.closest("[data-chat-premium-camera]")){
      const files=currentComposer(root)?.querySelector('input[name="files"]');
      if(files){
        files.setAttribute("accept","image/*,video/*");
        files.setAttribute("capture","environment");
        files.addEventListener("change",()=>{
          files.removeAttribute("capture");
          files.setAttribute("accept","image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mp4,audio/mpeg,audio/ogg,audio/webm,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf");
        },{once:true});
        files.click();
      }
      return;
    }
    const invite=target.closest("[data-chat-premium-share-game]");
    if(invite){
      const composer=invite.closest("form[data-chat-send]");
      const status=composer?.querySelector("[data-status]");
      if(invite.disabled)return;
      invite.disabled=true;
      try{
        await sendChatCard(root,client,userId,composer,makePremiumGameCard(composer?.dataset.conversationId));
        if(status)status.textContent="Convite enviado.";
      }catch(error){
        console.warn("Chat game card failed",error);
        if(status)status.textContent="O convite não foi enviado. Tente novamente.";
      }finally{invite.disabled=false;}
      return;
    }
    if(target.closest("[data-chat-premium-search]")){openThreadSearch(root);return;}
    if(target.closest("[data-chat-premium-note]")){openNote(root);return;}
    if(target.closest("[data-chat-premium-music]")){
      openMusic(root).addEventListener("close",cancelSearch,{once:true});
      return;
    }
    const pick=target.closest("[data-chat-premium-pick-music]");
    if(pick){
      const modal=pick.closest("[data-chat-premium-modal]");
      const song=modal?._premiumTracks?.[Number(pick.dataset.chatPremiumPickMusic)];
      if(!song)return;
      modal._premiumSelected=song;
      modal.querySelectorAll("[data-chat-premium-pick-music]").forEach(node=>
        node.setAttribute("aria-pressed",String(node===pick)));
      modal.querySelector("[data-chat-premium-confirm]").disabled=false;
      setModalError(modal,song.title+" — "+song.artist);
      return;
    }
    if(target.closest("[data-chat-premium-close]")){closePremiumModal(root);return;}
    const modal=target.closest("[data-chat-premium-modal]");
    if(modal&&target===modal){closePremiumModal(root);return;}
    const openReactions=target.closest("[data-chat-premium-react]");
    if(openReactions){
      root.querySelector("[data-chat-premium-reaction-palette]")?.remove();
      const palette=document.createElement("div");
      palette.className="chat-premium-reaction-palette";
      palette.dataset.chatPremiumReactionPalette="";
      palette.setAttribute("role","group");palette.setAttribute("aria-label","Reagir à mensagem");
      const rect=openReactions.closest(".chat-message").getBoundingClientRect();
      palette.style.left=Math.max(10,Math.min(window.innerWidth-272,rect.left))+"px";
      palette.style.top=Math.max(9,Math.min(window.innerHeight-65,rect.bottom+5))+"px";
      for(const emoji of REACTIONS){
        const button=document.createElement("button");
        button.type="button";
        button.dataset.chatPremiumReactionChoice=emoji;
        button.dataset.chatPremiumMessageId=openReactions.dataset.chatPremiumReact;
        button.textContent=emoji;
        button.setAttribute("aria-label","Reagir com "+emoji);
        palette.append(button);
      }
      root.append(palette);
      return;
    }
    const choice=target.closest("[data-chat-premium-reaction-choice],[data-chat-premium-reaction-existing]");
    if(choice){
      const emoji=choice.dataset.chatPremiumReactionChoice||choice.dataset.chatPremiumReactionExisting;
      const messageId=choice.dataset.chatPremiumMessageId;
      const conversationId=currentComposer(root)?.dataset.conversationId;
      root.querySelector("[data-chat-premium-reaction-palette]")?.remove();
      if(!REACTIONS.includes(emoji)||!messageId||!conversationId||!userId)return;
      choice.disabled=true;
      try{
        const {data:old,error:readError}=await client.from("chat_message_reactions").select("emoji")
          .eq("message_id",messageId).eq("user_id",userId).maybeSingle();
        if(readError)throw readError;
        const response=old?.emoji===emoji
          ? await client.from("chat_message_reactions").delete().eq("message_id",messageId).eq("user_id",userId)
          : await client.from("chat_message_reactions").upsert({
            message_id:messageId,conversation_id:conversationId,user_id:userId,emoji
          },{onConflict:"message_id,user_id"});
        if(response.error)throw response.error;
        root.dispatchEvent(new CustomEvent("looply:chat-message-saved",{detail:{conversationId}}));
        if(currentComposer(root)?.dataset.conversationId===conversationId)
          root.dispatchEvent(new CustomEvent("looply:open-conversation",{detail:{conversationId}}));
      }catch(error){
        console.warn("Chat reaction failed",error);
        const status=currentComposer(root)?.querySelector("[data-status]");
        if(status)status.textContent="Não foi possível salvar a reação.";
      }finally{if(choice.isConnected)choice.disabled=false;}
      return;
    }
    const play=target.closest("[data-chat-premium-play-music]");
    if(play){
      if(activeButton===play){stopAudio();return;}
      stopAudio();
      const source=play.dataset.chatPremiumPlayMusic;
      const song=normalizeStorySong({provider:"apple",title:"Prévia",artist:"Catálogo",url:"https://music.apple.com/br",previewUrl:source})
        ||normalizeStorySong({provider:"deezer",title:"Prévia",artist:"Catálogo",url:"https://www.deezer.com/br/track/123456",previewUrl:source});
      const preview=officialSongPreview(song);
      if(!preview||preview.kind!=="audio")return;
      const audio=new Audio(preview.src);audio.preload="auto";
      if(!requestMediaPlayback("music",root,audio)){play.textContent="▶";return;}
      activeAudio=audio;activeButton=play;
      play.textContent="Ⅱ";play.setAttribute("aria-label","Pausar prévia");play.setAttribute("aria-pressed","true");
      audio.addEventListener("ended",stopAudio,{once:true});
      audio.addEventListener("error",stopAudio,{once:true});
      try{await audio.play();}catch(error){console.warn("Preview playback requires tap",error);stopAudio();}
      return;
    }
    if(!target.closest("[data-chat-premium-menu], [data-chat-premium-menu-toggle]"))closeAttachmentMenus(root);
    if(!target.closest("[data-chat-premium-reaction-palette]"))root.querySelector("[data-chat-premium-reaction-palette]")?.remove();
  };
  const onInput=event=>{
    const field=event.target.closest("#chatPremiumMusicQuery");
    if(!field)return;
    const modal=field.closest("[data-chat-premium-modal]");
    if(!modal)return;
    cancelSearch();
    modal._premiumTracks=[];
    modal.querySelector("[data-chat-premium-music-results]").replaceChildren();
    modal._premiumSelected=null;
    modal.querySelector("[data-chat-premium-confirm]").disabled=true;
    const value=field.value.trim();
    const target=modal.querySelector("[data-chat-premium-music-status]");
    if(value.length<2){modal.querySelector("[data-chat-premium-music-results]").replaceChildren();target.textContent="Digite pelo menos duas letras.";return;}
    target.textContent="Buscando músicas…";
    searchTimer=setTimeout(async()=>{
      const controller=new AbortController();searchAbort=controller;
      try{
        const result=await searchStorySongs(value,{signal:controller.signal});
        if(controller.signal.aborted||!modal.isConnected)return;
        drawMusicResults(modal,(result.items||[]).slice(0,25));
        target.textContent=(result.items||[]).length+" resultado(s).";
      }catch(error){
        if(controller.signal.aborted||!modal.isConnected)return;
        console.warn("Chat music lookup unavailable",error);
        drawMusicResults(modal,[]);
        target.textContent="Busca indisponível neste momento. Tente novamente.";
      }
    },350);
  };
  const onSubmit=async event=>{
    const form=event.target.closest("form[data-chat-premium-card-form]");
    if(!form)return;
    event.preventDefault();
    const modal=form.closest("[data-chat-premium-modal]");
    if(modal.sending)return;
    modal.sending=true;
    const confirm=form.querySelector("[data-chat-premium-confirm]");
    confirm.disabled=true;
    try{
      const kind=form.dataset.chatPremiumCardForm;
      if(kind==="search"){
        if(!modal.composer||modal.composer!==currentComposer(root))throw Error("conversation_changed");
        await searchThread(client,modal,form.elements.query.value.trim());
        return;
      }
      const body=kind==="note"
        ? makePremiumNote(form.elements.note?.value)
        : makePremiumMusic(modal?._premiumSelected);
      await sendChatCard(root,client,userId,modal.composer,body);
      if(modal.open)modal.close();
    }catch(error){
      console.warn("Chat card failed",error);
      setModalError(modal,form.dataset.chatPremiumCardForm==="search"
        ?"A busca está indisponível. Tente novamente."
        :"A mensagem não foi enviada. Confira a conexão ou reabra a conversa e tente novamente.");
    }finally{
      modal.sending=false;
      confirm.disabled=form.dataset.chatPremiumCardForm==="music"&&!modal._premiumSelected;
    }
  };
  const onKey=event=>{
    if(event.key!=="Escape"||event.target.closest("[data-chat-premium-modal]"))return;
    closeAttachmentMenus(root);
    closePremiumModal(root);
    root.querySelectorAll("[data-chat-message-menu]").forEach(button=>{
      if(button.getAttribute("aria-expanded")==="true")button.focus({preventScroll:true});
      button.setAttribute("aria-expanded","false");
      button.parentElement.querySelector(".chat-message-actions-inline").hidden=true;
    });
    root.querySelector("[data-chat-premium-reaction-palette]")?.remove();
  };
  const syncComposer=()=>{
    const form=currentComposer(root);if(!form)return;
    const hasContent=Boolean(form.elements.body?.value.trim()||form.elements.files?.files.length||form._looplyRecordedFile||form._looplyStickerFile);
    if(form.dataset.hasContent!==String(hasContent))form.dataset.hasContent=String(hasContent);
  };
  let pressTimer=null,pressOrigin=null,suppressClick=false;
  const cancelPress=()=>{clearTimeout(pressTimer);pressTimer=null;};
  const onPress=event=>{
    if(event.button!==0||event.target.closest("button,a,input,textarea,audio,video,summary"))return;
    const message=event.target.closest(".chat-message");
    if(!message)return;
    pressOrigin={x:event.clientX,y:event.clientY};
    cancelPress();
    pressTimer=setTimeout(()=>{
      message.querySelector("[data-chat-premium-react]")?.click();
      suppressClick=true;
    },500);
  };
  const onMove=event=>{if(pressOrigin&&Math.hypot(event.clientX-pressOrigin.x,event.clientY-pressOrigin.y)>10)cancelPress();};
  const onPressClick=event=>{if(suppressClick){suppressClick=false;if(!event.target.closest("[data-chat-premium-reaction-palette]")){event.preventDefault();event.stopImmediatePropagation();}}};
  const onContext=event=>{if(event.target.closest(".chat-message")){event.preventDefault();}};
  root.addEventListener("pointerdown",onPress);
  root.addEventListener("pointermove",onMove,{passive:true});
  root.addEventListener("pointerup",cancelPress);
  root.addEventListener("pointercancel",cancelPress);
  root.addEventListener("click",onPressClick,true);
  root.addEventListener("contextmenu",onContext);
  const syncObserver=new MutationObserver(syncComposer);
  syncObserver.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden"]});
  root.addEventListener("input",syncComposer);
  root.addEventListener("change",syncComposer);
  root.addEventListener("reset",()=>queueMicrotask(syncComposer));
  const stopOnNavigation=()=>{stopAudio();closeAttachmentMenus(root);};
  root.addEventListener("looply:conversation-activated",stopOnNavigation);
  root.addEventListener("click",onClick);
  root.addEventListener("input",onInput);
  root.addEventListener("submit",onSubmit,true);
  root.addEventListener("keydown",onKey);
  const cleanup=()=>{
    cancelPress();
    root.removeEventListener("pointerdown",onPress);root.removeEventListener("pointermove",onMove);
    root.removeEventListener("pointerup",cancelPress);root.removeEventListener("pointercancel",cancelPress);
    root.removeEventListener("click",onPressClick,true);root.removeEventListener("contextmenu",onContext);
    cancelSearch();stopAudio();syncObserver.disconnect();
    root.removeEventListener("input",syncComposer);root.removeEventListener("change",syncComposer);
    root.removeEventListener("looply:conversation-activated",stopOnNavigation);
    root.removeEventListener("click",onClick);
    root.removeEventListener("input",onInput);
    root.removeEventListener("submit",onSubmit,true);
    root.removeEventListener("keydown",onKey);
    delete root.__looplyPremiumBound;
    closePremiumModal(root);
  };
  window.addEventListener("pagehide",cleanup,{once:true});
  syncComposer();
  return cleanup;
}
