// Looply immersive Reels: plays videos already authorized in the current Neon-backed feed.
// No third-party scraping, synthetic counters, or separate mock data source.
const by = (root, selector) => root.querySelector(selector);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function action(name, label, glyph) {
  const button = make("button", "looply-reel-action");
  button.type = "button"; button.dataset.reelAction = name; button.setAttribute("aria-label", label);
  const symbol = make("span", "looply-reel-glyph");
  if (name === "comment") symbol.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8 8.8 8.8 0 0 1-3.2-.6L4 20l1.2-4A8 8 0 1 1 20 11.5Z"/></svg>';
  else if (name === "chat") symbol.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m21 3-8.6 18-3.6-7.8L1 9.6 21 3Z"/><path d="m9 13 12-10"/></svg>';
  else symbol.textContent = glyph;
  button.append(symbol, make("small", "looply-reel-count", ""));
  return button;
}
function relativeCount(value) {
  const n = Number(String(value || "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
function safeSource(video) {
  const uri = video?.currentSrc || video?.getAttribute("src") || "";
  try {
    const url = new URL(uri, location.href);
    return ["https:", "blob:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}
// TikTok/YouTube provide documented iframe APIs. On Instagram, these messages
// are handled ONLY by Looply's trusted Android WebView document-start adapter.
// In an ordinary browser, Instagram's iframe does not expose a playback API.
export function commandEmbeddedPlayer(frame, action) {
  const raw=frame?.getAttribute("src");
  if(!raw || !frame?.contentWindow) return false;
  let url;
  try {url=new URL(raw,location.href);} catch {return false;}
  const host=url.hostname.toLowerCase();
  let payload=null,origin="";
  if(host==="www.tiktok.com" && ["play","pause","mute","unMute"].includes(action)) {
    origin="https://www.tiktok.com";
    payload={"x-tiktok-player":true,type:action,value:null};
  } else if(host==="www.youtube-nocookie.com" && ["play","pause","mute","unMute"].includes(action)) {
    origin="https://www.youtube-nocookie.com";
    const func={play:"playVideo",pause:"pauseVideo",mute:"mute",unMute:"unMute"}[action];
    payload=JSON.stringify({event:"command",func,args:[]});
  } else if (host==="www.instagram.com" && ["play","pause","mute","unMute"].includes(action)) {
    // The Android WebView installs an origin-scoped listener inside the official
    // Instagram iframe. The browser cannot read or control that cross-origin DOM.
    origin="https://www.instagram.com";
    payload={type:"looply:reels-media",action};
  } else return false;
  try {frame.contentWindow.postMessage(payload,origin);return true;} catch {return false;}
}
export function activeEmbedUrl(source) {
  try{
    const url=new URL(source);
    if(url.hostname==="www.youtube-nocookie.com"){
      url.searchParams.set("autoplay","1");
      url.searchParams.set("playsinline","1");
      url.searchParams.set("enablejsapi","1");
      url.searchParams.set("mute","0");
      if(typeof location!=="undefined" && /^https?:$/.test(location.protocol))url.searchParams.set("origin",location.origin);
    }else if(url.hostname==="www.tiktok.com" && /^\/player\/v1\//.test(url.pathname)){
      url.searchParams.set("autoplay","1");
      url.searchParams.set("loop","1");
      url.searchParams.set("force_muted","0");
      url.searchParams.set("muted","0");
    }
    // Instagram has no supported autoplay query parameter. Do not fabricate one.
    return url.href;
  }catch{return source;}
}
export function openHybridReels(root, startKey) {
  const prior = by(root, "[data-reels-scroll]");
  if (prior) { prior.__reelsOpenAt?.(startKey); return; }
  const sources = [...root.querySelectorAll("[data-post-card]")].flatMap(card => {
    const own = [...card.querySelectorAll("video[data-feed-reel-id]")].map(video => ({
      kind: "video", key: video.dataset.feedReelId, source: safeSource(video), postId: card.dataset.postCard
    }));
    const external = [...card.querySelectorAll("[data-open-external-reel]")].map(button => {
      const iframe = button.closest(".post-external")?.querySelector("iframe");
      const source = iframe ? safeSource(iframe) : "";
      let permitted = false;
      try {
        const url = new URL(source);
        permitted = url.protocol === "https:" && ["www.instagram.com","www.tiktok.com","www.youtube-nocookie.com"].includes(url.hostname);
      } catch {}
      return { kind:"embed", key:button.dataset.openExternalReel, source:permitted ? source : "", postId:card.dataset.postCard };
    });
    return own.concat(external);
  }).filter(entry => entry.key && entry.source && entry.postId);
  if (!sources.length) return;
  const initial = Math.max(0, sources.findIndex(entry => entry.key === startKey));
  const dialog = make("dialog", "looply-reels-scroll");
  dialog.dataset.reelsScroll = "";
  dialog.setAttribute("aria-label", "Reels do Looply");
  dialog.innerHTML = '<div class="looply-reels-track" data-reels-track aria-label="Deslize para assistir aos próximos vídeos"></div><header class="looply-reels-top"><button type="button" data-reels-close aria-label="Voltar aos Reels">←</button><strong class="visually-hidden">Reels</strong><a class="looply-reels-original" data-reels-provider-original target="_blank" rel="noopener noreferrer" hidden>Abrir original ↗</a></header><aside class="looply-reels-rail" data-reels-rail></aside><footer class="looply-reels-bottom"><div data-reels-creator></div><p data-reels-caption></p><div class="looply-reels-audio">♫ <span data-reels-audio>Áudio da publicação</span></div></footer><button type="button" class="looply-reels-mute" data-reels-sound aria-label="Ativar som">♪ Som</button><p class="looply-reels-message" data-reels-message role="status" aria-live="polite"></p><section class="looply-reels-comments" data-reels-comments hidden><header><strong>Comentários</strong><button type="button" data-close-reels-comments aria-label="Fechar comentários">×</button></header><div data-reels-comments-body></div></section>';
  const track = by(dialog, "[data-reels-track]");
  const rail = by(dialog, "[data-reels-rail]");
  // Four real actions only: like, comment, external share, and Looply chat.
  // Never show an inert bookmark or fake repost counter.
  const actions = ["like", "comment", "external", "chat"];
  const labels = { like: "Curtir", comment: "Comentários", external: "Compartilhar fora do Looply", chat: "Enviar no chat do Looply" };
  const glyphs = { like: "♡", comment: "", external: "⇄", chat: "" };
  for (const type of actions) rail.append(action(type, labels[type], glyphs[type]));
  const slides = sources.map((source, index) => {
    const embedHost = source.kind === "embed" ? new URL(source.source).hostname : "";
    const providerClass = embedHost.endsWith("instagram.com") ? " is-instagram-embed"
      : embedHost.endsWith("tiktok.com") ? " is-tiktok-embed"
      : embedHost.endsWith("youtube-nocookie.com") ? " is-youtube-embed" : "";
    const sourceCard = root.querySelector('[data-post-card="' + CSS.escape(source.postId) + '"]');
    const originalUrl = sourceCard?.querySelector(".hybrid-provider-tools a[href]")?.href || "";
    const isShort = providerClass.includes("youtube") && /\/shorts\//i.test(originalUrl);
    const instagramReel=providerClass.includes("instagram") && /\/reel\//i.test(new URL(source.source).pathname);
    const orientation = providerClass.includes("instagram") || providerClass.includes("tiktok") || isShort
      ? " is-portrait-player" : providerClass.includes("youtube") ? " is-landscape-player" : "";
    const slide = make("section", "looply-reel-slide" +
      (source.kind === "embed" ? " is-external-embed" + providerClass + orientation + (instagramReel?" is-instagram-reel-clean":"") : ""));
    slide.dataset.reelsKey = source.key;
    slide.setAttribute("aria-label", "Vídeo " + (index + 1) + " de " + sources.length);
    const media = source.kind === "video" ? make("video", "looply-reel-video") : make("iframe", "looply-reel-embed");
    if (source.kind === "video") {
      media.playsInline = true; media.preload = "none"; media.loop = true;
      media.setAttribute("aria-label", "Vídeo da publicação");
      media.addEventListener("click", () => {
        if(media.paused || (media.muted && soundOn)) {
          media.muted=!soundOn;
          if(!media.muted){
            by(dialog,"[data-reels-sound]").dataset.audioBlocked="false";
            status("");
          }
          void media.play().catch(()=>status("Toque em Som para ativar o áudio."));
        } else media.pause();
      });
      media.addEventListener("error", () => {
        if (index === activeIndex) status("Não foi possível reproduzir este vídeo. Verifique a conexão ou o formato.");
      });
    } else {
      media.title = "Vídeo externo";
      media.allow = "autoplay; encrypted-media; picture-in-picture; web-share";
      media.addEventListener("load",()=>{
        if(closed || activeIndex!==index || document.hidden)return;
        // TikTok/YouTube accept player commands; Instagram owns its player
        // and does not expose a supported playback-control interface.
        if(soundOn)commandEmbeddedPlayer(media,"unMute");
        commandEmbeddedPlayer(media,"play");
      });
      media.setAttribute("scrolling","no");
      media.referrerPolicy = "strict-origin-when-cross-origin";
      media.allowFullscreen = true;
    }
    if (source.kind === "embed") {
      // A cross-origin iframe does not support object-fit. Give the official
      // document its own correctly proportioned stage instead of stretching
      // the document across the entire phone height.
      const stage = make("div", "looply-reel-media-stage");
      if(instagramReel){
        // Chrome-only matte around the official reel player. The central window
        // keeps the 9:16 media fully visible; surrounding embed header/footer
        // are outside this window, not overlaid on top of the video.
        const cleanWindow=make("div","looply-instagram-video-window");
        cleanWindow.append(media);stage.append(cleanWindow);
      }else stage.append(media);
      slide.append(stage);
    } else {
      slide.append(media);
    }
    if (source.kind === "embed") {
      // Third-party cross-origin iframes swallow swipe events. Keep their player
      // clickable in the center, and offer transparent gesture strips on either
      // side for native vertical Reel navigation without scraping video files.
      for (const edge of ["left", "right"]) {
        const lane = make("div", "looply-embed-swipe-lane is-" + edge);
        lane.setAttribute("aria-hidden", "true");
        let touchStart = null;
        lane.addEventListener("touchstart", event => {
          touchStart = event.touches[0]?.clientY ?? null;
        }, { passive:true });
        lane.addEventListener("touchend", event => {
          if (touchStart === null) return;
          const diff = touchStart - (event.changedTouches[0]?.clientY ?? touchStart);
          touchStart = null;
          if (Math.abs(diff) < 45) return;
          const current = slides.findIndex(item => item.slide === slide);
          if (current >= 0) navigate(current + (diff > 0 ? 1 : -1));
        }, { passive:true });
        slide.append(lane);
      }
    }
    track.append(slide);
    return { ...source, slide, video: source.kind === "video" ? media : null, frame: source.kind === "embed" ? media : null };
  });
  // Every new Reel session starts with audible playback requested. A sound-toggle
  // click can mute the CURRENT session, but stale mute preferences cannot disable
  // autoplay on future visits.
  let activeIndex = -1, soundOn = true, closed = false, scrollTimer = null;
  const previousOverflow = document.body.style.overflow;
  const cardFor = source => root.querySelector('[data-post-card="' + CSS.escape(source.postId) + '"]');
  const status = message => { by(dialog, "[data-reels-message]").textContent = message || ""; };
  const sync = () => {
    const source = slides[activeIndex], card = source && cardFor(source);
    if (!card) return;
    // O skin premium move o autor para .post-header > .post-author-profile.
    // Buscar somente .post-author fazia a autoria desaparecer em tela cheia.
    const author = by(card, ".post-header .post-author-profile");
    const creator = by(dialog, "[data-reels-creator]");
    creator.replaceChildren();
    if (author) {
      const wrapper = make("div", "post-author looply-reels-creator-profile");
      const clone = author.cloneNode(true);
      clone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
      wrapper.append(clone);
      creator.append(wrapper);
    }
    const original = by(dialog, "[data-reels-provider-original]");
    const providerSource = card.querySelector(".hybrid-provider-tools a[href]");
    if (original) {
      const href = providerSource?.href || "";
      let valid = false;
      try { valid = new URL(href).protocol === "https:"; } catch {}
      original.hidden = source.kind !== "embed" || !valid;
      if (valid) original.href = href;
      else original.removeAttribute("href");
    }
    const caption = by(card, ".post-body");
    by(dialog, "[data-reels-caption]").textContent = caption?.textContent || "";
    const providerName = source.kind === "embed"
      ? source.source.includes("instagram.com") ? "Instagram"
        : source.source.includes("tiktok.com") ? "TikTok"
        : source.source.includes("youtube-nocookie.com") ? "YouTube"
        : "Vídeo externo"
      : "Looply";
    dialog.dataset.reelsProvider=providerName.toLowerCase().includes("instagram")?"instagram":providerName.toLowerCase().includes("tiktok")?"tiktok":providerName.toLowerCase().includes("youtube")?"youtube":"looply";
    by(dialog, "[data-reels-audio]").textContent = "Áudio original · " + providerName;
    const like = by(card, "[data-toggle-like]");
    const externalShare = by(card, "[data-share-post]");
    const chatShare = by(card, "[data-share-in-app]");
    for (const type of actions) {
      const btn = by(rail, '[data-reel-action="' + type + '"]');
      btn.disabled = (type === "external" && !externalShare) || (type === "chat" && !chatShare);
      const counter = by(btn, "small");
      counter.textContent = type === "like" ? relativeCount(like?.querySelector("span")?.textContent) :
        type === "comment" ? relativeCount(by(card, ".post-comments h3 span")?.textContent) : "";
      const selected = type === "like" && like?.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", String(selected));
      if (type === "like") by(btn, ".looply-reel-glyph").textContent = selected ? "♥" : "♡";
    }
  };
  const loadNear = index => {
    slides.forEach((source, i) => {
      const player = source.video;
      if (player) {
        if (Math.abs(i - index) <= 1) {
          if (!player.getAttribute("src")) player.src = source.source;
        } else {
          player.pause();
          if (player.hasAttribute("src")) { player.removeAttribute("src"); player.load(); }
        }
      } else if (source.frame) {
        // A different origin cannot be paused by inspecting its internal DOM.
        // Remove the iframe document as soon as the slide becomes inactive.
        if(i===index) {
          if(!source.frame.getAttribute("src"))source.frame.src=activeEmbedUrl(source.source);
          else {if(soundOn)commandEmbeddedPlayer(source.frame,"unMute");commandEmbeddedPlayer(source.frame,"play");}
        } else if(source.frame.hasAttribute("src")) {
          commandEmbeddedPlayer(source.frame,"pause");
          source.frame.removeAttribute("src");
          source.frame.src="about:blank";
          source.frame.removeAttribute("src");
        }
      }
    });
  };
  const startNative = async(player)=>{
    if(!player || closed || document.hidden)return;
    player.muted=!soundOn;
    try {await player.play();if(slides[activeIndex]?.video===player)status("");}
    catch(error) {
      if(closed || slides[activeIndex]?.video!==player)return;
      // Chromium may reject audio autoplay until the first touch.
      // Keep the visible Reel playing muted rather than leaving a frozen poster.
      if(soundOn && error?.name==="NotAllowedError"){
        player.muted=true;
        try{
          await player.play();
          const sound=by(dialog,"[data-reels-sound]");
          sound.dataset.audioBlocked="true";
          sound.textContent="♪ Ativar som";
          sound.setAttribute("aria-label","Ativar som");
          status("");
        }catch{status("Toque no vídeo para reproduzir.");}
      } else status("Toque no vídeo para reproduzir.");
    }
  };
  const activate = (index) => {
    if (closed || index < 0 || index >= slides.length) return;
    if (activeIndex === index) return;
    // Pause every outgoing source immediately, before starting the next.
    // Instagram cannot receive pause commands: unload its iframe entirely.
    for(let i=0;i<slides.length;i++){
      if(i===index)continue;
      slides[i].video?.pause();
      const oldFrame=slides[i].frame;
      if(oldFrame?.hasAttribute("src")) {
        commandEmbeddedPlayer(oldFrame,"pause");
        oldFrame.removeAttribute("src");
        oldFrame.src="about:blank";
        oldFrame.removeAttribute("src");
      }
    }
    activeIndex=index;
    loadNear(index);
    const player=slides[index].video;
    status("");
    by(dialog,"[data-reels-comments]").hidden=true;
    sync();
    const soundButton=by(dialog,"[data-reels-sound]");
    const activeEmbedHost=slides[index].frame ? new URL(slides[index].source).hostname : "";
    const androidWebView=/Android/i.test(navigator.userAgent||"") && /\bwv\b/i.test(navigator.userAgent||"");
    const controllableFrame=slides[index].frame &&
      (/(?:tiktok\.com|youtube-nocookie\.com)$/.test(activeEmbedHost) ||
       (androidWebView && activeEmbedHost==="www.instagram.com"));
    soundButton.hidden=!player&&!controllableFrame;
    soundButton.dataset.audioBlocked="false";
    soundButton.textContent=soundOn?"♫ Som ligado":"♪ Ativar som";
    soundButton.setAttribute("aria-label",soundOn?"Silenciar som":"Ativar som");
    if(player)void startNative(player);
  };
  const navigate = index => {
    slides[Math.min(slides.length - 1, Math.max(0, index))]?.slide.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const showCommentPanel = () => {
    const panel = by(dialog, "[data-reels-comments]");
    panel.hidden = !panel.hidden;
    if (panel.hidden) return;
    const card = cardFor(slides[activeIndex]);
    const target = by(dialog, "[data-reels-comments-body]");
    target.replaceChildren();
    const comments = card && by(card, ".post-comments");
    if (comments) {
      const copy = comments.cloneNode(true);
      copy.querySelectorAll("[id]").forEach(node => { const oldId = node.id; node.id = "reels-" + oldId; copy.querySelectorAll("label[for]").forEach(label => { if (label.htmlFor === oldId) label.htmlFor = node.id; }); });
      copy.querySelectorAll("[data-edit-comment],[data-delete-comment]").forEach(button => button.remove());
      target.append(copy);
    } else target.append(make("p", "", "Comentários indisponíveis."));
  };
  const observer = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const index = slides.findIndex(source => source.slide === entry.target);
      if (entry.intersectionRatio >= 0.7) activate(index);
      else if (index !== activeIndex) slides[index]?.video?.pause();
    }
  }, { root: track, threshold: [0, 0.7, 1] }) : null;
  for (const source of slides) observer?.observe(source.slide);
  track.addEventListener("scroll", () => {
    if (scrollTimer !== null) cancelAnimationFrame(scrollTimer);
    scrollTimer = requestAnimationFrame(() => {
      scrollTimer = null;
      const idx = Math.round(track.scrollTop / Math.max(1, track.clientHeight));
      activate(Math.max(0, Math.min(slides.length - 1, idx)));
    });
  }, { passive: true });
  const onFrameMessage=event=>{
    const current=slides[activeIndex]?.frame;
    if(!current || event.source!==current.contentWindow || event.origin!=="https://www.tiktok.com")return;
    if(event.data?.["x-tiktok-player"] && event.data?.type==="onPlayerReady") {
      if(soundOn)commandEmbeddedPlayer(current,"unMute");
      commandEmbeddedPlayer(current,"play");
    }
  };
  window.addEventListener("message",onFrameMessage);
  const onVisibility=()=>{
    if(closed)return;
    if(document.hidden){
      slides.forEach(source=>{
        source.video?.pause();
        if(source.frame?.hasAttribute("src")){
          commandEmbeddedPlayer(source.frame,"pause");
          source.frame.removeAttribute("src");
          source.frame.src="about:blank";
          source.frame.removeAttribute("src");
        }
      });
    }else if(dialog.open && activeIndex>=0){
      loadNear(activeIndex);
      const video=slides[activeIndex]?.video;
      if(video)void startNative(video);
    }
  };
  document.addEventListener("visibilitychange",onVisibility);
  const mutation = new MutationObserver(() => {
    if (!closed) sync();
  });
  const feed = by(root, "[data-social-feed]");
  if (feed) mutation.observe(feed, { childList: true });
  const onEscape = event => {
    if (event.key === "ArrowDown") { event.preventDefault(); navigate(activeIndex + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); navigate(activeIndex - 1); }
  };
  dialog.addEventListener("keydown", onEscape);
  const close = () => {
    if (closed) return;
    closed = true; observer?.disconnect(); mutation.disconnect();
    document.removeEventListener("visibilitychange",onVisibility);
    window.removeEventListener("message",onFrameMessage);
    if (scrollTimer !== null) cancelAnimationFrame(scrollTimer);
    for (const source of slides) {
      if (source.video) { source.video.pause(); source.video.removeAttribute("src"); source.video.load(); }
      if(source.frame?.hasAttribute("src")) {
        commandEmbeddedPlayer(source.frame,"pause");source.frame.removeAttribute("src");
      }
    }
    // Restore official embeds in the feed only after closing the immersive viewer.
    for (const item of feedFrames) { if (item.frame.isConnected) item.frame.src = item.src; }
    if (dialog.open) dialog.close();
    dialog.remove(); document.body.style.overflow = previousOverflow;
    root.dispatchEvent(new CustomEvent("looply:reels-closed"));
  };
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("click", event => {
    if (event.target.closest("[data-reels-close]")) { close(); return; }
    if (event.target.closest("[data-close-reels-comments]")) { by(dialog, "[data-reels-comments]").hidden = true; return; }
    if (event.target.closest("[data-reels-sound]")) {
      const soundControl=by(dialog,"[data-reels-sound]");
      const wasBlocked=soundControl.dataset.audioBlocked==="true";
      soundOn=wasBlocked?true:!soundOn;
      soundControl.dataset.audioBlocked="false";
      try { localStorage.setItem('looply-premium-reels-sound-on',String(soundOn)); } catch {}
      const activeVideo=slides[activeIndex]?.video;
      const activeFrame=slides[activeIndex]?.frame;
      const button=by(dialog,"[data-reels-sound]");
      button.textContent=soundOn?"♫ Som ligado":"♪ Ativar som";
      button.setAttribute("aria-label",soundOn?"Silenciar som":"Ativar som");
      if(activeVideo){
        activeVideo.muted=!soundOn;
        if(soundOn)void startNative(activeVideo);
      }else if(activeFrame)commandEmbeddedPlayer(activeFrame,soundOn?"unMute":"mute");
      return;
    }
    const control = event.target.closest("[data-reel-action]");
    if (!control) return;
    const current = slides[activeIndex];
    const card = current && cardFor(current);
    if (!card) { status("Esta publicação não está mais disponível."); return; }
    const type = control.dataset.reelAction;
    if (type === "comment") { showCommentPanel(); return; }
    const selectors = { like: "[data-toggle-like]", external: "[data-share-post]", chat: "[data-share-in-app]" };
    if (selectors[type]) {
      const button = by(card, selectors[type]);
      if (button) button.click();
      else status("Esta ação não está disponível nesta publicação.");
    }
  });
  root.__looplyVideoAutoplayDispose?.();
  root.querySelectorAll("video[data-feed-video]").forEach(video => video.pause());
  // Provider players on the feed otherwise keep playing behind the modal.
  const feedFrames = [...root.querySelectorAll(".post-external-embed iframe")].filter(frame => frame.getAttribute("src")).map(frame => ({frame, src: frame.getAttribute("src")}));
  for (const item of feedFrames) item.frame.removeAttribute("src");
  root.append(dialog);
  document.body.style.overflow = "hidden";
  try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
  dialog.__reelsOpenAt = key => { const index = slides.findIndex(source => source.key === key); if (index >= 0) navigate(index); };
  track.scrollTop = initial * track.clientHeight;
  activate(initial);
  return dialog;
}
