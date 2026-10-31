import { icon } from "./icons.js";

const mounted = new WeakMap();
const RESTRICTED_START = [
  "a","button","input","textarea","select","label","summary",
  "[contenteditable]","[draggable='true']","[data-reels-scroll]",
  "[data-story-list]","[data-story-viewer]","[data-story-touch-surface]",
  "[data-story-capture]","[data-gallery-viewer]","[data-viewer-media]",
  "[data-post-carousel]","[data-photo-adjust-panel]","[data-crop-source]",
  "video","audio","canvas",".chat-thread",".chat-sidebar",
  ".cartas-container",".gallery-grid",".pr-grid",".reels-viewer",
  ".story-viewer-dialog",".story-studio",".post-carousel",
  ".gallery-viewer",".gallery-modal",".chat-message-form"
].join(",");

const ACTIVE_OVERLAYS = [
  "dialog[open]","[aria-modal='true']:not([hidden])",
  ".chat-call-backdrop:not([hidden])",
  ".looply-global-call-notice:not([hidden])",
  "[data-reels-viewer][open]",
  ".story-viewer-dialog[open]",
  ".story-studio-dialog[open]",
  "[data-camera-modal]:not([hidden])"
].join(",");

function isVisible(node, win) {
  if (!node || node.hidden || node.closest("[hidden]")) return false;
  if (typeof node.getClientRects === "function" && !node.getClientRects().length) return false;
  const style=win.getComputedStyle(node);
  return style.display!=="none" && style.visibility!=="hidden";
}

/** Conservative: user edits, media controls and modal interactions take priority. */
export function hasPendingRefreshWork(root) {
  if (!root) return false;
  if (root.querySelector('[aria-busy="true"],[data-upload-busy="true"],[data-recording="true"],[data-saving="true"],.is-recording,.chat-recording-active')) return true;
  for (const form of root.querySelectorAll("form")) {
    for (const control of form.elements || []) {
      if (control.disabled || control.type==="hidden" || control.type==="search"
        || control.type==="submit" || control.type==="button" || control.type==="reset") continue;
      if (control.type==="file") {if (control.files?.length) return true;continue;}
      if (control.type==="checkbox" || control.type==="radio") {
        if (control.checked!==control.defaultChecked)return true;
        continue;
      }
      if (control.tagName==="SELECT"){
        const options=[...control.options];
        const defaults=options.filter(option=>option.defaultSelected);
        // Browsers select the first option implicitly when none declares "selected".
        if(!defaults.length&&!control.multiple&&options.length)defaults.push(options[0]);
        if(options.some(option=>option.selected!==defaults.includes(option)))return true;
      } else if (typeof control.value==="string" && control.value!==control.defaultValue) return true;
    }
  }
  return false;
}

function nestedScrollable(target, scrollRoot, win) {
  for(let el=target?.parentElement;el && el!==scrollRoot && el!==scrollRoot?.ownerDocument?.body;el=el.parentElement){
    const style=win.getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight>el.clientHeight+3) return true;
  }
  return false;
}

export function isPullRefreshBlocked({target,root,doc,win}) {
  if (!target || !root || !doc || !win || !root.isConnected) return true;
  if (doc.visibilityState==="hidden" || (doc.scrollingElement?.scrollTop||0)>1 || (win.scrollY||0)>1) return true;
  if (target.closest?.(RESTRICTED_START)) return true;
  if (target.closest?.("nav,[role='tablist'],[role='slider'],[role='dialog'],[role='menu'],.chat-thread-panel")) return true;
  if ([...doc.querySelectorAll(ACTIVE_OVERLAYS)].some(el=>isVisible(el,win)))return true;
  if (nestedScrollable(target,doc.scrollingElement,win)) return true;
  if (hasPendingRefreshWork(root))return true;
  return false;
}

export function mountPullToRefresh({
  root,page,refresh,doc=globalThis.document,win=globalThis.window,
  threshold=76
}={}) {
  if (!root || !doc || !win || typeof refresh!=="function"
    || page==="conversation")return ()=>{};
  const prior=mounted.get(root);
  if (prior)return prior;
  const media=win.matchMedia?.("(pointer: coarse)");
  if (media && !media.matches)return ()=>{};
  const indicator=doc.createElement("div");
  indicator.className="looply-pull-indicator";
  indicator.setAttribute("role","status");
  indicator.setAttribute("aria-live","polite");
  indicator.setAttribute("aria-atomic","true");
  indicator.innerHTML='<span class="looply-pull-indicator-icon" aria-hidden="true">'+icon("refresh")+
    '</span><span class="looply-pull-indicator-text">Puxe para atualizar</span>';
  indicator.hidden=true;
  doc.body.append(indicator);
  const message=indicator.querySelector(".looply-pull-indicator-text");
  let startY=0,startX=0,distance=0,dragging=false,tracking=false,loading=false,disposed=false;
  let errorTimer=0,inflight=null;
  const reset=()=>{
    tracking=false;dragging=false;distance=0;
    if(!loading){indicator.classList.remove("is-pulling","is-ready","is-loading");indicator.style.removeProperty("--looply-pull-distance");indicator.hidden=true;}
  };
  const start=event=>{
    if(disposed || loading || event.touches?.length!==1) return;
    const touch=event.touches[0];
    if(isPullRefreshBlocked({target:event.target,root,doc,win}))return;
    startY=touch.clientY;startX=touch.clientX;tracking=true;dragging=false;distance=0;
  };
  const move=event=>{
    if(!tracking||disposed||loading)return;
    if(event.touches?.length!==1){reset();return;}
    const touch=event.touches[0];
    const dy=touch.clientY-startY,dx=touch.clientX-startX;
    if(dy<0 || (Math.abs(dx)>12 && Math.abs(dx)>dy*0.75)){reset();return;}
    if(!dragging && dy<8)return;
    if(isPullRefreshBlocked({target:event.target,root,doc,win})){reset();return;}
    dragging=true;
    if(event.cancelable)event.preventDefault();
    distance=Math.min(112,Math.max(0,dy*0.55));
    indicator.hidden=false;
    indicator.classList.add("is-pulling");
    indicator.classList.toggle("is-ready",distance>=threshold);
    indicator.style.setProperty("--looply-pull-distance",String(distance)+"px");
    message.textContent=distance>=threshold?"Solte para atualizar":"Puxe para atualizar";
  };
  const announceFailure=()=>{
    indicator.hidden=false;indicator.classList.remove("is-pulling","is-ready","is-loading");
    indicator.classList.add("has-error");indicator.style.removeProperty("--looply-pull-distance");
    message.textContent="Não foi possível atualizar. Verifique sua conexão.";
    win.clearTimeout(errorTimer);
    errorTimer=win.setTimeout(()=>{if(!loading)reset();indicator.classList.remove("has-error");},3200);
  };
  const run=()=>{
    if(disposed||loading || (win.navigator && win.navigator.onLine===false)){
      if(!disposed)announceFailure();return Promise.resolve(false);
    }
    loading=true;indicator.hidden=false;indicator.classList.remove("is-pulling","is-ready","has-error");
    indicator.classList.add("is-loading");indicator.style.setProperty("--looply-pull-distance","48px");
    message.textContent="Atualizando...";
    let timer;
    inflight=Promise.race([
      Promise.resolve().then(()=>refresh()),
      new Promise((_,reject)=>{timer=win.setTimeout(()=>reject(Error("pull_refresh_timeout")),15000);})
    ]).then(ok=>ok===true).catch(error=>{
      console.warn("Looply pull-to-refresh unavailable",error);return false;
    }).then(ok=>{
      if(!disposed){loading=false;if(ok)reset();else announceFailure();}
      return ok;
    }).finally(()=>{win.clearTimeout(timer);inflight=null;});
    return inflight;
  };
  const end=()=>{
    if(!tracking)return;
    const shouldRun=dragging&&distance>=threshold;
    tracking=false;dragging=false;
    if(shouldRun)void run();else reset();
  };
  const cancel=()=>reset();
  doc.addEventListener("touchstart",start,{passive:true});
  doc.addEventListener("touchmove",move,{passive:false});
  doc.addEventListener("touchend",end,{passive:true});
  doc.addEventListener("touchcancel",cancel,{passive:true});
  const stop=()=>{
    if(disposed)return;
    disposed=true;win.clearTimeout(errorTimer);
    doc.removeEventListener("touchstart",start);
    doc.removeEventListener("touchmove",move);
    doc.removeEventListener("touchend",end);
    doc.removeEventListener("touchcancel",cancel);
    win.removeEventListener("pagehide",stop);
    indicator.remove();mounted.delete(root);
  };
  win.addEventListener("pagehide",stop,{once:true});
  mounted.set(root,stop);
  return stop;
}
