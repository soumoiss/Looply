/* Connect existing authenticated Neon/WebRTC game and call dialogs with the
 * approved Chat Ultra front-end, without copying fake game/call state.
 * Modal DOM stays under the original root so its delegated listeners and media
 * streams keep working. It is surfaced only while a genuine modal is active. */
export function mountUltraNativeOverlays(host, root) {
  if(!host||!root)return ()=>{};
  host.classList.add("page-chat");
  const selector="[data-chat-v2-modal]:not([hidden]),[data-call-modal]:not([hidden]),dialog[data-chat-premium-modal][open]";
  let queued=false,closed=false;
  const update=()=>{
    queued=false;
    if(closed)return;
    const hasModal=Boolean(root.querySelector(selector));
    host.classList.toggle("looply-native-active",hasModal);
    host.setAttribute("aria-hidden",String(!hasModal));
    document.body.classList.toggle("looply-native-overlay-visible",hasModal);
  };
  const observe=()=>{
    if(queued||closed)return;
    queued=true;
    queueMicrotask(update);
  };
  const watcher=new MutationObserver(observe);
  watcher.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden","open"]});
  update();
  return ()=>{
    closed=true;watcher.disconnect();
    host.classList.remove("looply-native-active");
    document.body.classList.remove("looply-native-overlay-visible");
    host.setAttribute("aria-hidden","true");
  };
}
