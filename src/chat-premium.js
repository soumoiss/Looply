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
  if(modal)modal.remove();
}
function submitPremiumMessage(root,body){
  const form=currentComposer(root),input=form?.querySelector('textarea[name="body"]');
  if(!form||!input||!form.isConnected)throw Error("Abra uma conversa para compartilhar.");
  const preserved=input.value;
  input.value=body;
  input.dispatchEvent(new Event("input",{bubbles:true}));
  try{
    form.requestSubmit(form.querySelector('button[type="submit"]'));
  }catch(error){
    input.value=preserved;input.dispatchEvent(new Event("input",{bubbles:true}));
    throw error;
  }
}
function createModal(root,{title,kind,content}){
  closePremiumModal(root);closeAttachmentMenus(root);
  const modal=document.createElement("div");
  modal.className="chat-premium-modal";
  modal.dataset.chatPremiumModal="";
  modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");
  modal.setAttribute("aria-label",title);
  modal.innerHTML='<section><header><h2>'+esc(title)+'</h2><button type="button" data-chat-premium-close aria-label="Fechar">'+icon("close")+
    '</button></header><form data-chat-premium-card-form="'+esc(kind)+'">'+content+
    '<div class="chat-premium-modal-actions"><button type="button" data-chat-premium-close>Cancelar</button>'+
    '<button type="submit" data-chat-premium-confirm>Enviar</button></div>'+
    '<p class="form-status" data-chat-premium-modal-status role="status" aria-live="polite"></p></form></section>';
  root.append(modal);
  requestAnimationFrame(()=>modal.querySelector("input,textarea")?.focus({preventScroll:true}));
  return modal;
}
function setModalError(modal,message){
  const target=modal?.querySelector("[data-chat-premium-modal-status]");
  if(target)target.textContent=message;
}
function openNote(root){
  createModal(root,{title:"💌 Escrever bilhete",kind:"note",content:
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
export function setupChatPremium(root,client,userId){
  if(!root||root.__looplyPremiumBound)return ()=>{};
  root.__looplyPremiumBound=true;
  let searchAbort=null,searchTimer=0;
  let activeAudio=null,activeButton=null;
  const stopAudio=()=>{
    if(activeAudio){try{activeAudio.pause();activeAudio.currentTime=0;}catch{}releaseMediaPlayback(root,activeAudio);}
    if(activeButton?.isConnected){activeButton.textContent="▶";activeButton.setAttribute("aria-label","Ouvir prévia");}
    activeAudio=null;activeButton=null;
  };
  const onClick=async event=>{
    const target=event.target;
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
      if(root.dataset.conversationPage==="true"){window.location.assign("chat.html");return;}
      const panel=root.querySelector(".chat-search-panel");
      if(panel){panel.open=true;panel.scrollIntoView({behavior:"smooth",block:"nearest"});panel.querySelector('input[name="query"]')?.focus({preventScroll:true});}
      return;
    }
    if(target.closest("[data-chat-premium-new-group]")){
      if(root.dataset.conversationPage==="true"){window.location.assign("chat.html");return;}
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
    if(target.closest("[data-chat-premium-share-game]")){
      try{
        const form=currentComposer(root),id=form?.dataset.conversationId;
        if(!window.confirm("Enviar um convite para jogar nesta conversa?"))return;
        submitPremiumMessage(root,makePremiumGameCard(id));
      }catch(error){
        const status=currentComposer(root)?.querySelector("[data-status]");
        if(status)status.textContent=error.message||"Abra uma conversa.";
      }
      return;
    }
    if(target.closest("[data-chat-premium-note]")){openNote(root);return;}
    if(target.closest("[data-chat-premium-music]")){openMusic(root);return;}
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
      const rect=openReactions.getBoundingClientRect();
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
      let source=play.dataset.chatPremiumPlayMusic||"";
      if(!source){
        play.disabled=true;play.textContent="…";
        try{
          const result=await searchStorySongs(decodeURIComponent(play.dataset.chatPremiumMusicQuery||""));
          const playable=result.items?.find(song=>officialSongPreview(song)?.kind==="audio");
          source=playable?.previewUrl||"";
          if(source)play.dataset.chatPremiumPlayMusic=source;
        }catch(error){console.warn("Music preview search",error);}
        finally{play.disabled=false;play.textContent="▶";}
      }
      if(!source)return;
      const song=normalizeStorySong({provider:"apple",title:"Prévia",artist:"Catálogo",url:"https://music.apple.com/br",previewUrl:source})
        ||normalizeStorySong({provider:"deezer",title:"Prévia",artist:"Catálogo",url:"https://www.deezer.com/br/track/123456",previewUrl:source});
      const preview=officialSongPreview(song);
      if(!preview||preview.kind!=="audio")return;
      const audio=new Audio(preview.src);audio.preload="auto";
      if(!requestMediaPlayback("music",root,audio)){play.textContent="▶";return;}
      activeAudio=audio;activeButton=play;
      play.textContent="Ⅱ";
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
    if(searchAbort)searchAbort.abort();
    clearTimeout(searchTimer);
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
  const onSubmit=event=>{
    const form=event.target.closest("form[data-chat-premium-card-form]");
    if(!form)return;
    event.preventDefault();
    const modal=form.closest("[data-chat-premium-modal]");
    try{
      const kind=form.dataset.chatPremiumCardForm;
      const body=kind==="note"
        ? makePremiumNote(form.elements.note?.value)
        : makePremiumMusic(modal?._premiumSelected);
      submitPremiumMessage(root,body);
      closePremiumModal(root);
    }catch(error){setModalError(modal,error.message||"Não foi possível enviar.");}
  };
  const onKey=event=>{
    if(event.key!=="Escape")return;
    closeAttachmentMenus(root);
    closePremiumModal(root);
    root.querySelector("[data-chat-premium-reaction-palette]")?.remove();
  };
  root.addEventListener("click",onClick);
  root.addEventListener("input",onInput);
  root.addEventListener("submit",onSubmit,true);
  root.addEventListener("keydown",onKey);
  const cleanup=()=>{
    searchAbort?.abort();clearTimeout(searchTimer);stopAudio();
    root.removeEventListener("click",onClick);
    root.removeEventListener("input",onInput);
    root.removeEventListener("submit",onSubmit,true);
    root.removeEventListener("keydown",onKey);
    delete root.__looplyPremiumBound;
    closePremiumModal(root);
  };
  window.addEventListener("pagehide",cleanup,{once:true});
  return cleanup;
}
