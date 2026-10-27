// Best-effort incoming call alert in the currently open page. Mobile browsers
// can block sound or throttle background tabs; no unsupported wakeup guarantee.
export function startIncomingCallAlert({
  name="Contato", mode="audio", globalWindow=globalThis.window,
  globalDocument=globalThis.document,
  repeat=(fn,ms)=>setInterval(fn,ms), stopRepeat=clearInterval
}={}) {
  const originalTitle=globalDocument?.title || "Looply";
  const Ctx=globalWindow?.AudioContext || globalWindow?.webkitAudioContext;
  let ctx=null, active=true, timer=null, notification=null;
  const ping=()=>{
    if(!active)return;
    try { globalWindow?.navigator?.vibrate?.([160,90,160]); } catch {}
    if(!Ctx)return;
    try {
      if(!ctx)ctx=new Ctx();
      if(ctx.state==="suspended")void ctx.resume().catch(()=>{});
      const start=ctx.currentTime;
      for(let i=0;i<2;i++){
        const oscillator=ctx.createOscillator();
        const gain=ctx.createGain();
        oscillator.type="sine";
        oscillator.frequency.value=i===0?680:820;
        gain.gain.value=.038;
        oscillator.connect(gain);gain.connect(ctx.destination);
        oscillator.start(start+i*.22);
        oscillator.stop(start+i*.22+.14);
      }
    }catch(error){console.warn("Looply call ringtone unavailable",error?.name);}
  };
  if(globalDocument)globalDocument.title="☎ Chamada recebida — Looply";
  if(globalDocument?.hidden && globalWindow?.Notification?.permission==="granted"){
    try {
      notification=new globalWindow.Notification("Chamada recebida no Looply",{
        body: name+" está ligando por "+(mode==="video"?"vídeo":"áudio"),
        tag:"looply-incoming-call",silent:false
      });
      notification.onclick=()=>{try{globalWindow.focus();}catch{}};
    }catch{}
  }
  ping();
  timer=repeat(ping,2400);
  const safety=setTimeout(()=>stop(),40000);
  const stop=()=>{
    if(!active)return;
    active=false;
    clearTimeout(safety);
    if(timer!==null)stopRepeat(timer);
    try{globalWindow?.navigator?.vibrate?.(0);}catch{}
    try{notification?.close();}catch{}
    if(globalDocument && globalDocument.title==="☎ Chamada recebida — Looply")globalDocument.title=originalTitle;
    try{void ctx?.close?.().catch?.(()=>{});}catch{}
  };
  return stop;
}
