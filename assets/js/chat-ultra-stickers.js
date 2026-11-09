/* Chat Ultra: authenticated Neon/R2 stickers in an independent modal.
 * Never mount unbounded sticker images in the message composer.
 * The existing catalog owns search, favorites, packs, pagination and sending. */
import { stickerCatalogMarkup, bindStickerCatalog } from "../../src/chat-sticker-catalog.js?v=ultra-sticker-modal-20261109";

export function mountUltraStickerPicker({client,getUserId,getConversationId,onSaved}) {
  const panel=document.getElementById("pan");
  const games=document.getElementById("bGames");
  const emoji=document.getElementById("bEmo");
  const composer=document.getElementById("comp");
  if(!panel||!games||!emoji||!composer)return ()=>{};

  const tabs=panel.querySelector(".ptabs");
  const nativeHost=document.createElement("div");
  nativeHost.id="ultraStickerHost";
  nativeHost.hidden=true;
  nativeHost.setAttribute("aria-hidden","true");

  const modal=document.createElement("div");
  modal.className="ultra-sticker-modal";
  modal.setAttribute("role","dialog");
  modal.setAttribute("aria-modal","true");
  modal.setAttribute("aria-labelledby","ultraStickerTitle");

  const header=document.createElement("div");
  header.className="ultra-sticker-header";
  header.innerHTML='<span class="ultra-sticker-title" id="ultraStickerTitle">Figurinhas</span>'+
    '<div class="ultra-sticker-head-actions">'+
    '<button type="button" class="ultra-sticker-import-trigger" data-ultra-sticker-import-toggle aria-expanded="false" aria-controls="ultraStickerImport">＋ Importar</button>'+
    '<button type="button" class="ultra-sticker-close" data-ultra-sticker-close aria-label="Fechar figurinhas">✕</button></div>';

  const form=document.createElement("form");
  form.setAttribute("data-chat-send","");
  form.className="ultra-sticker-form";
  const load=document.createElement("button");
  load.type="button";
  load.setAttribute("data-chat-choose-sticker","");
  load.hidden=true;

  const picker=document.createElement("section");
  picker.setAttribute("data-chat-sticker-picker","");
  picker.setAttribute("aria-label","Figurinhas da sua conta");
  picker.innerHTML=stickerCatalogMarkup();

  const importTools=document.createElement("div");
  importTools.id="ultraStickerImport";
  importTools.className="chat-ultra-sticker-import";
  importTools.hidden=true;
  importTools.innerHTML='<label><input type="checkbox" data-chat-sticker-import-rights> Tenho autorização para compartilhar estas imagens</label>'+
    '<button type="button" data-ultra-sticker-import-select>Selecionar imagens</button>'+
    '<input type="file" data-chat-sticker-import-files accept="image/png,image/jpeg,image/webp" multiple hidden>';
  picker.querySelector("[data-chat-catalog]").append(importTools);

  form.append(load,picker);
  modal.append(header,form);
  nativeHost.append(modal);
  // CRITICAL: a top-level overlay, never #pan, #comp, or a chat bubble.
  document.body.append(nativeHost);
  let focusBefore=null;

  // No fake local stickers. This function closes only the visual modal.
  function closePicker() {
    if(nativeHost.hidden)return;
    nativeHost.hidden=true;
    nativeHost.setAttribute("aria-hidden","true");
    document.body.classList.remove("ultra-sticker-modal-open");
    button.setAttribute("aria-expanded","false");
    importTools.hidden=true;
    header.querySelector("[data-ultra-sticker-import-toggle]")?.setAttribute("aria-expanded","false");
    focusBefore?.focus?.({preventScroll:true});
  }
  picker.close=closePicker;
  nativeHost.addEventListener("looply:chat-message-saved",()=>onSaved?.());
  bindStickerCatalog(nativeHost,client,getUserId);

  games.hidden=true;
  games.style.display="none";
  games.setAttribute("aria-hidden","true");
  games.tabIndex=-1;

  const button=document.createElement("button");
  button.id="bStickers";
  button.type="button";
  button.className="ib g";
  button.setAttribute("aria-label","Abrir figurinhas");
  button.setAttribute("aria-controls","ultraStickerHost");
  button.setAttribute("aria-expanded","false");
  button.innerHTML='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01"/></svg>';
  games.before(button);

  function openStickers() {
    if(!getUserId?.())return;
    const id=getConversationId?.();
    if(!id)return;
    form.dataset.conversationId=id;
    focusBefore=document.activeElement;
    // The legacy emoji grid stays closed; it must never reserve message space.
    panel.classList.remove("open");
    nativeHost.hidden=false;
    nativeHost.setAttribute("aria-hidden","false");
    document.body.classList.add("ultra-sticker-modal-open");
    button.setAttribute("aria-expanded","true");
    load.click();
    header.querySelector("[data-ultra-sticker-close]")?.focus({preventScroll:true});
  }

  button.addEventListener("click",()=>nativeHost.hidden?openStickers():closePicker());
  nativeHost.addEventListener("click",event=>{
    if(event.target===nativeHost||event.target.closest("[data-ultra-sticker-close]")){
      event.preventDefault();
      closePicker();
      return;
    }
    const toggle=event.target.closest("[data-ultra-sticker-import-toggle]");
    if(toggle){
      event.preventDefault();
      importTools.hidden=!importTools.hidden;
      toggle.setAttribute("aria-expanded",String(!importTools.hidden));
      if(!importTools.hidden)importTools.querySelector("input[type=checkbox]")?.focus();
      return;
    }
    if(event.target.closest("[data-ultra-sticker-import-select]")){
      event.preventDefault();
      picker.querySelector("[data-chat-sticker-import-files]")?.click();
    }
  });
  // Tab switch from the original emoji panel preserves emoji behavior.
  function onPanelClick(event){
    const tab=event.target.closest("[data-pt]");
    if(tab?.dataset.pt==="s"){
      event.preventDefault();event.stopImmediatePropagation();
      openStickers();
    }
  }
  panel.addEventListener("click",onPanelClick,true);
  function onEmojiClick(){closePicker();}
  emoji.addEventListener("click",onEmojiClick,true);
  function onKeyDown(event){
    if(nativeHost.hidden)return;
    if(event.key==="Escape"){event.preventDefault();closePicker();}
    else if(event.key==="Tab"){
      const focusable=[...nativeHost.querySelectorAll('button:not([hidden]):not([disabled]),input:not([hidden]):not([disabled]),select:not([disabled])')]
        .filter(element=>element.getClientRects().length>0);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  }
  document.addEventListener("keydown",onKeyDown);
  const dispose=()=>{
    closePicker();
    document.removeEventListener("keydown",onKeyDown);
    panel.removeEventListener("click",onPanelClick,true);
    emoji.removeEventListener("click",onEmojiClick,true);
    nativeHost.remove();button.remove();
    games.hidden=false;games.style.removeProperty("display");
    games.removeAttribute("aria-hidden");games.removeAttribute("tabindex");
  };
  window.addEventListener("pagehide",dispose,{once:true});
  return dispose;
}
