/* Real Neon/R2 sticker selector. A standalone accessible sheet, never an
   expanding composer pane: fixed 5-column previews on mobile and desktop. */
import { stickerCatalogMarkup, bindStickerCatalog } from "../../src/chat-sticker-catalog.js?v=ultra-real-stickers-20261109";

const SHEET_STYLE=String.raw`
/* Self-contained to prevent stale Chat Ultra theme CSS from expanding stickers. */
body.looply-chat-ultra-live dialog#ultraStickerHost:not([open]){display:none!important}
body.looply-chat-ultra-live dialog#ultraStickerHost[open]{
  position:fixed!important;inset:auto 10px max(10px,env(safe-area-inset-bottom)) 10px!important;
  margin:0 auto!important;display:block!important;
  width:min(550px,calc(100vw - 20px))!important;
  height:min(76dvh,700px)!important;max-height:calc(100dvh - max(24px,env(safe-area-inset-top)) - max(12px,env(safe-area-inset-bottom)))!important;
  max-width:none!important;overflow:hidden!important;
  padding:0!important;border:1px solid color-mix(in srgb,var(--primary) 18%,var(--line))!important;
  border-radius:27px!important;background:color-mix(in srgb,var(--bg) 96%,var(--strong))!important;
  color:var(--text)!important;box-shadow:0 22px 74px rgba(34,13,59,.3),0 0 0 1px rgba(255,255,255,.22) inset!important;
  transform:none!important;animation:none!important;
  isolation:isolate;overscroll-behavior:contain;z-index:2147483000!important;
}
body.looply-chat-ultra-live #ultraStickerHost::backdrop{
  background:rgba(20,9,37,.58)!important;
  -webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);
}
#ultraStickerHost [data-chat-send]{
  display:flex!important;flex-direction:column!important;
  height:100%!important;min-height:0!important;overflow:hidden!important;
  margin:0!important;padding:0!important;
}
#ultraStickerHost .ultra-sticker-sheet-head{
  flex:none;display:flex;align-items:center;gap:10px;
  padding:15px 16px 11px;border-bottom:1px solid var(--line);
  background:linear-gradient(120deg,color-mix(in srgb,var(--primary) 8%,var(--strong)),var(--strong));
}
#ultraStickerHost .ultra-sticker-heading{flex:1;min-width:0}
#ultraStickerHost .ultra-sticker-heading b{display:block;font-size:17px;font-weight:800;letter-spacing:-.35px}
#ultraStickerHost .ultra-sticker-heading small{display:block;color:var(--muted);font-size:11px;margin-top:2px}
#ultraStickerHost .ultra-sticker-head-btn{
  flex:none;display:grid;place-items:center;height:37px;min-width:37px;padding:0 9px;
  border:1px solid var(--line);border-radius:13px;
  background:var(--strong);font-weight:800;color:var(--primary);font-size:13px;
}
#ultraStickerHost .ultra-sticker-head-btn.close{
  color:var(--muted);font-size:23px;line-height:1;
}
#ultraStickerHost [data-chat-sticker-picker]{
  display:flex!important;flex:1!important;flex-direction:column!important;min-height:0!important;
  min-width:0!important;padding:0!important;overflow:hidden!important;
}
#ultraStickerHost .chat-catalog{
  display:flex!important;flex-direction:column!important;flex:1!important;
  min-height:0!important;min-width:0!important;max-height:none!important;
  gap:9px!important;padding:12px 12px 8px!important;overflow:hidden!important;
}
#ultraStickerHost .chat-catalog-tabs{display:flex!important;flex:none!important;gap:6px!important;padding:0!important}
#ultraStickerHost .chat-catalog-tabs button{
  min-height:36px!important;padding:6px 13px!important;font-size:12px!important;font-weight:750!important;
  border-radius:99px!important;border:1px solid var(--line)!important;
  background:var(--strong)!important;color:var(--muted)!important;
}
#ultraStickerHost .chat-catalog-tabs button[aria-pressed="true"]{
  background:var(--primary)!important;color:#fff!important;border-color:var(--primary)!important;
}
#ultraStickerHost .ultra-sticker-filters{
  display:grid!important;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr)!important;
  gap:8px!important;flex:none!important;min-width:0;
}
#ultraStickerHost .ultra-sticker-filters [data-chat-catalog-search],
#ultraStickerHost .ultra-sticker-filters [data-chat-catalog-pack]{
  display:block!important;width:100%!important;min-width:0!important;min-height:41px!important;
  margin:0!important;padding:8px 10px!important;
  border:1px solid var(--line)!important;border-radius:13px!important;
  font-size:13px!important;background:var(--strong)!important;color:var(--text)!important;
}
#ultraStickerHost .chat-catalog-grid{
  display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;
  grid-auto-rows:max-content!important;align-content:start!important;align-items:start!important;
  gap:7px!important;flex:1 1 auto!important;
  min-width:0!important;min-height:80px!important;max-height:none!important;
  overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:contain!important;
  -webkit-overflow-scrolling:touch!important;
  padding:4px 2px 12px!important;scrollbar-width:thin!important;
}
#ultraStickerHost .chat-catalog-item{
  position:relative!important;width:100%!important;aspect-ratio:1!important;
  min-width:0!important;min-height:0!important;height:auto!important;
  margin:0!important;padding:3px!important;border-radius:13px!important;
  border:1px solid color-mix(in srgb,var(--primary) 13%,var(--line))!important;
  background:color-mix(in srgb,var(--primary) 5%,var(--strong))!important;
  display:block!important;overflow:visible!important;
}
#ultraStickerHost .chat-catalog-item>[data-chat-sticker-item]{
  width:100%!important;height:100%!important;min-height:0!important;min-width:0!important;
  display:grid!important;place-items:center!important;overflow:hidden!important;
  padding:2px!important;border-radius:10px!important;
}
#ultraStickerHost .chat-catalog-item img{
  display:block!important;width:100%!important;height:100%!important;
  max-width:100%!important;max-height:100%!important;
  object-fit:contain!important;object-position:center!important;
  border-radius:8px!important;overflow:hidden!important;
  font-size:0!important;filter:none!important;
}
#ultraStickerHost .chat-catalog-favorite{
  position:absolute!important;z-index:2!important;top:-3px!important;right:-3px!important;
  display:grid!important;place-items:center!important;
  width:24px!important;height:24px!important;min-width:24px!important;min-height:24px!important;
  padding:0!important;border-radius:50%!important;
  border:1px solid color-mix(in srgb,var(--primary) 15%,var(--line))!important;
  box-shadow:0 2px 7px rgba(20,9,37,.12)!important;
  background:var(--strong)!important;color:var(--muted)!important;
  line-height:1!important;font-size:18px!important;
}
#ultraStickerHost .chat-catalog-favorite[aria-pressed="true"]{color:#d59013!important}
#ultraStickerHost .chat-catalog-status{
  flex:none!important;min-height:15px!important;max-height:38px!important;overflow:hidden!important;
  padding:0 2px!important;margin:0!important;
  font-size:11px!important;color:var(--muted)!important;line-height:1.4!important;
}
#ultraStickerHost [data-chat-catalog-more]{
  flex:none!important;min-height:34px!important;padding:5px!important;
  margin:0!important;color:var(--primary)!important;
  font-size:12px!important;font-weight:760!important;
}
#ultraStickerHost [data-chat-catalog-more][hidden],
#ultraStickerHost .chat-ultra-sticker-import[hidden],
#ultraStickerHost [hidden]{display:none!important}
#ultraStickerHost .chat-ultra-sticker-import{
  flex:none!important;display:flex!important;gap:8px!important;align-items:center!important;
  flex-wrap:wrap!important;margin-top:2px!important;padding:10px 2px 4px!important;
  border-top:1px solid var(--line)!important;
}
#ultraStickerHost .chat-ultra-sticker-import label{
  flex:1 1 160px!important;display:flex!important;align-items:center!important;gap:8px!important;
  font-size:11px!important;line-height:1.35!important;color:var(--muted)!important;
}
#ultraStickerHost .chat-ultra-sticker-import [data-ultra-sticker-import]{
  flex:0 0 auto!important;min-height:36px!important;padding:7px 11px!important;
  border-radius:11px!important;background:var(--primary)!important;color:white!important;
  font-size:12px!important;font-weight:780!important;
}
#ultraStickerHost .ultra-sticker-bottom{
  flex:none;min-height:18px;padding:0 13px 12px;
  color:var(--muted);font-size:10px;text-align:center;
}
#ultraStickerHost button:focus-visible,#ultraStickerHost input:focus-visible,
#ultraStickerHost select:focus-visible{outline:2px solid var(--primary)!important;outline-offset:2px!important}
@media(max-width:390px){
  #ultraStickerHost .chat-catalog{gap:7px!important;padding:10px 10px 7px!important}
  #ultraStickerHost .chat-catalog-grid{grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:5px!important}
  #ultraStickerHost .chat-catalog-item{padding:2px!important;border-radius:11px!important}
  #ultraStickerHost .chat-catalog-favorite{width:21px!important;height:21px!important;min-width:21px!important;min-height:21px!important;font-size:16px!important}
  #ultraStickerHost .ultra-sticker-sheet-head{padding:11px 12px 9px}
}
@media(prefers-reduced-motion:reduce){#ultraStickerHost *{transition:none!important;animation:none!important}}
`;

function mountStyles(){
  if(document.getElementById("looply-ultra-sticker-modal-styles"))return;
  const style=document.createElement("style");
  style.id="looply-ultra-sticker-modal-styles";
  style.textContent=SHEET_STYLE;
  document.head.append(style);
}

export function mountUltraStickerPicker({client,getUserId,getConversationId,onSaved}) {
  const panel=document.getElementById("pan");
  const grid=document.getElementById("grid");
  const games=document.getElementById("bGames");
  const emoji=document.getElementById("bEmo");
  if(!panel||!grid||!emoji)return ()=>{};
  mountStyles();

  const tabs=panel.querySelector(".ptabs");
  const dialog=document.createElement("dialog");
  dialog.id="ultraStickerHost";
  dialog.setAttribute("aria-label","Seletor de figurinhas");
  dialog.setAttribute("aria-modal","true");

  const form=document.createElement("form");
  form.setAttribute("data-chat-send","");
  const head=document.createElement("div");
  head.className="ultra-sticker-sheet-head";
  head.innerHTML='<div class="ultra-sticker-heading"><b>Figurinhas</b><small>Escolha para enviar ou salve suas favoritas</small></div>'+
    '<button type="button" class="ultra-sticker-head-btn" data-ultra-sticker-import-toggle aria-expanded="false" aria-label="Importar novas figurinhas">＋</button>'+
    '<button type="button" class="ultra-sticker-head-btn close" data-ultra-sticker-close aria-label="Fechar figurinhas">×</button>';

  const load=document.createElement("button");
  load.type="button";
  load.setAttribute("data-chat-choose-sticker","");
  load.hidden=true;

  const picker=document.createElement("section");
  picker.setAttribute("data-chat-sticker-picker","");
  picker.setAttribute("aria-label","Figurinhas da sua conta");
  picker.innerHTML=stickerCatalogMarkup();

  const catalog=picker.querySelector("[data-chat-catalog]");
  const pack=catalog.querySelector("[data-chat-catalog-pack]");
  const search=catalog.querySelector("[data-chat-catalog-search]");
  const filters=document.createElement("div");
  filters.className="ultra-sticker-filters";
  pack.before(filters);
  filters.append(search,pack);

  const importTools=document.createElement("div");
  importTools.className="chat-ultra-sticker-import";
  importTools.hidden=true;
  importTools.innerHTML='<label><input type="checkbox" data-chat-sticker-import-rights> Tenho autorização para compartilhar estas imagens</label>'+
    '<button type="button" data-ultra-sticker-import>Escolher imagens</button>'+
    '<input type="file" data-chat-sticker-import-files accept="image/png,image/jpeg,image/webp" multiple hidden>';
  catalog.append(importTools);

  const bottom=document.createElement("div");
  bottom.className="ultra-sticker-bottom";
  bottom.textContent="Toque na imagem para enviar · ★ para salvar";
  form.append(head,load,picker,bottom);
  dialog.append(form);
  document.body.append(dialog);

  let lastFocus=null;
  function syncTabs(stickers){
    for(const tab of tabs?.querySelectorAll("[data-pt]")||[])
      tab.classList.toggle("on",tab.dataset.pt===(stickers?"s":"e"));
    button.setAttribute("aria-expanded",String(stickers&&dialog.open));
  }
  function closePicker(){
    if(dialog.open)dialog.close();
    importTools.hidden=true;
    head.querySelector("[data-ultra-sticker-import-toggle]")?.setAttribute("aria-expanded","false");
    if(grid)grid.hidden=false;
    syncTabs(false);
    if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
    lastFocus=null;
    // The catalog's send handler dispatches its own success signal.
  }
  picker.close=closePicker;
  dialog.addEventListener("cancel",event=>{event.preventDefault();closePicker();});
  dialog.addEventListener("click",event=>{
    if(event.target===dialog || event.target.closest("[data-ultra-sticker-close]")){
      event.preventDefault();closePicker();return;
    }
    if(event.target.closest("[data-ultra-sticker-import-toggle]")){
      const expanded=importTools.hidden;
      importTools.hidden=!expanded;
      head.querySelector("[data-ultra-sticker-import-toggle]")?.setAttribute("aria-expanded",String(expanded));
    }
    if(event.target.closest("[data-ultra-sticker-import]")){
      event.preventDefault();
      picker.querySelector("[data-chat-sticker-import-files]")?.click();
    }
  });
  dialog.addEventListener("looply:chat-message-saved",()=>onSaved?.());
  bindStickerCatalog(dialog,client,getUserId);

  const catalogGrid=picker.querySelector("[data-chat-catalog-grid]");
  const more=picker.querySelector("[data-chat-catalog-more]");
  catalogGrid?.addEventListener("scroll",()=>{
    if(!dialog.open||more?.hidden||more?.disabled)return;
    if(catalogGrid.scrollTop+catalogGrid.clientHeight>=catalogGrid.scrollHeight-70)more.click();
  },{passive:true});

  if(games){
    games.hidden=true;games.style.display="none";
    games.setAttribute("aria-hidden","true");games.tabIndex=-1;
  }
  const button=document.createElement("button");
  button.id="bStickers";
  button.type="button";
  button.className="ib g";
  button.setAttribute("aria-label","Abrir figurinhas");
  button.setAttribute("aria-haspopup","dialog");
  button.setAttribute("aria-expanded","false");
  button.innerHTML='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/><path d="M8 15c2 2 6 2 8 0"/></svg>';
  (games||emoji).before(button);

  function openStickers(){
    const conversationId=getConversationId?.();
    if(!conversationId)return;
    form.dataset.conversationId=conversationId;
    panel.classList.remove("open");
    grid.hidden=false;
    lastFocus=document.activeElement;
    if(!dialog.open)dialog.showModal();
    syncTabs(true);
    // Real account favorites, R2 thumbnails, pack filters and sends.
    load.click();
    dialog.querySelector("[data-ultra-sticker-close]")?.focus({preventScroll:true});
  }
  button.addEventListener("click",()=>{
    if(dialog.open)closePicker();else openStickers();
  });
  panel.addEventListener("click",event=>{
    const tab=event.target.closest("[data-pt]");
    if(tab?.dataset.pt==="s"){
      event.preventDefault();event.stopImmediatePropagation();
      openStickers();
    }
  },true);
  emoji.addEventListener("click",()=>{
    if(dialog.open)closePicker();
  },true);

  const cleanup=()=>{
    closePicker();dialog.remove();button.remove();
    if(games){games.hidden=false;games.style.removeProperty("display");games.removeAttribute("aria-hidden");games.removeAttribute("tabindex");}
  };
  return cleanup;
}
