/* The Ultra model keeps its approved composer. This adapter uses the actual
   Neon/R2 sticker catalog instead of ZIP-only thumbnails and local fake sends. */
import { stickerCatalogMarkup, bindStickerCatalog } from "../../src/chat-sticker-catalog.js?v=ultra-real-stickers-20261107";

export function mountUltraStickerPicker({client,getUserId,getConversationId,onSaved}) {
  const panel=document.getElementById("pan");
  const grid=document.getElementById("grid");
  const games=document.getElementById("bGames");
  const emoji=document.getElementById("bEmo");
  if(!panel||!grid||!games||!emoji)return ()=>{};
  const tabs=panel.querySelector(".ptabs");
  const nativeHost=document.createElement("div");
  nativeHost.id="ultraStickerHost";
  nativeHost.hidden=true;
  const form=document.createElement("form");
  form.setAttribute("data-chat-send","");
  const load=document.createElement("button");
  load.type="button";
  load.setAttribute("data-chat-choose-sticker","");
  load.hidden=true;
  const picker=document.createElement("section");
  picker.setAttribute("data-chat-sticker-picker","");
  picker.setAttribute("aria-label","Figurinhas da sua conta");
  picker.innerHTML=stickerCatalogMarkup();
  form.append(load,picker);
  nativeHost.append(form);
  tabs.after(nativeHost);
  picker.close=()=>{
    panel.classList.remove("open");
    nativeHost.hidden=true;
    grid.hidden=false;
    onSaved?.();
  };
  nativeHost.addEventListener("looply:chat-message-saved",()=>{
    onSaved?.();
  });
  bindStickerCatalog(nativeHost,client,getUserId);
  // The real multiplayer Games control still exists for the fan action. It is
  // no longer a redundant composer shortcut.
  games.hidden=true;
  games.style.display="none";
  games.setAttribute("aria-hidden","true");
  games.tabIndex=-1;
  const button=document.createElement("button");
  button.id="bStickers";
  button.type="button";
  button.className="ib g";
  button.setAttribute("aria-label","Abrir figurinhas");
  button.setAttribute("aria-expanded","false");
  button.innerHTML='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01"/></svg>';
  games.before(button);
  function syncTabs(stickers){
    for(const tab of tabs.querySelectorAll("[data-pt]"))
      tab.classList.toggle("on",tab.dataset.pt===(stickers?"s":"e"));
    button.setAttribute("aria-expanded",String(stickers&&panel.classList.contains("open")));
  }
  function restoreEmoji(){
    nativeHost.hidden=true;
    grid.hidden=false;
    syncTabs(false);
  }
  function openStickers(){
    const conversationId=getConversationId?.();
    if(!conversationId)return;
    form.dataset.conversationId=conversationId;
    panel.classList.add("open");
    nativeHost.hidden=false;
    grid.hidden=true;
    syncTabs(true);
    // Uses the existing authenticated catalog's loading, remote favorites,
    // pagination, pack filters, R2 signed URLs, and persisted send logic.
    load.click();
  }
  button.addEventListener("click",()=>{
    if(panel.classList.contains("open")&&!nativeHost.hidden){
      panel.classList.remove("open");
      restoreEmoji();
    } else openStickers();
  });
  panel.addEventListener("click",event=>{
    const tab=event.target.closest("[data-pt]");
    if(!tab)return;
    if(tab.dataset.pt==="s"){
      event.preventDefault();
      event.stopImmediatePropagation();
      openStickers();
    }else{
      restoreEmoji();
    }
  },true);
  emoji.addEventListener("click",()=>{
    restoreEmoji();
  },true);
  return ()=>{nativeHost.remove();button.remove();games.hidden=false;games.style.removeProperty("display");};
}
