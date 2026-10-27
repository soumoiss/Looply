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
  button.append(make("span", "looply-reel-glyph", glyph), make("small", "looply-reel-count", ""));
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
  dialog.innerHTML = '<div class="looply-reels-track" data-reels-track aria-label="Deslize para assistir aos próximos vídeos"></div><header class="looply-reels-top"><button type="button" data-reels-close aria-label="Voltar ao feed">←</button><strong>Reels <span>· Looply</span></strong><span class="looply-reels-top-space"></span></header><aside class="looply-reels-rail" data-reels-rail></aside><footer class="looply-reels-bottom"><div data-reels-creator></div><p data-reels-caption></p><div class="looply-reels-audio">♫ <span data-reels-audio>Áudio da publicação</span></div></footer><button type="button" class="looply-reels-mute" data-reels-sound aria-label="Ativar som">♪ Som</button><p class="looply-reels-message" data-reels-message role="status" aria-live="polite"></p><section class="looply-reels-comments" data-reels-comments hidden><header><strong>Comentários</strong><button type="button" data-close-reels-comments aria-label="Fechar comentários">×</button></header><div data-reels-comments-body></div></section>';
  const track = by(dialog, "[data-reels-track]");
  const rail = by(dialog, "[data-reels-rail]");
  const actions = ["like", "comment", "repost", "share", "save", "more"];
  const labels = { like: "Curtir", comment: "Comentários", repost: "Enviar no Looply", share: "Compartilhar", save: "Salvar", more: "Mais opções" };
  const glyphs = { like: "♡", comment: "♧", repost: "⇄", share: "➤", save: "▯", more: "⋯" };
  for (const type of actions) rail.append(action(type, labels[type], glyphs[type]));
  const slides = sources.map((source, index) => {
    const slide = make("section", "looply-reel-slide");
    slide.dataset.reelsKey = source.key;
    slide.setAttribute("aria-label", "Vídeo " + (index + 1) + " de " + sources.length);
    const media = source.kind === "video" ? make("video", "looply-reel-video") : make("iframe", "looply-reel-embed");
    if (source.kind === "video") {
      media.playsInline = true; media.preload = "none"; media.loop = true;
      media.setAttribute("aria-label", "Vídeo da publicação");
      media.addEventListener("click", () => { if (media.paused) void media.play().catch(() => {}); else media.pause(); });
      media.addEventListener("error", () => {
        if (index === activeIndex) status("Não foi possível reproduzir este vídeo. Verifique a conexão ou o formato.");
      });
    } else {
      media.title = "Publicação externa no player oficial";
      media.allow = "autoplay; encrypted-media; picture-in-picture; web-share";
      media.referrerPolicy = "strict-origin-when-cross-origin";
      media.allowFullscreen = true;
    }
    slide.append(media); track.append(slide);
    return { ...source, slide, video: source.kind === "video" ? media : null, frame: source.kind === "embed" ? media : null };
  });
  let activeIndex = -1, soundOn = false, closed = false, scrollTimer = null;
  const previousOverflow = document.body.style.overflow;
  const cardFor = source => root.querySelector('[data-post-card="' + CSS.escape(source.postId) + '"]');
  const status = message => { by(dialog, "[data-reels-message]").textContent = message || ""; };
  const sync = () => {
    const source = slides[activeIndex], card = source && cardFor(source);
    if (!card) return;
    const author = by(card, ".post-author");
    const creator = by(dialog, "[data-reels-creator]");
    creator.replaceChildren();
    if (author) creator.append(author.cloneNode(true));
    const caption = by(card, ".post-body");
    by(dialog, "[data-reels-caption]").textContent = caption?.textContent || "";
    by(dialog, "[data-reels-audio]").textContent = source.kind === "embed" ? "Player oficial · áudio controlado pelo provedor" : "Áudio da publicação";
    const like = by(card, "[data-toggle-like]");
    const save = by(card, "[data-toggle-save]");
    for (const type of actions) {
      const btn = by(rail, '[data-reel-action="' + type + '"]');
      btn.disabled = (type === "save" && !save) || (type === "repost" && !by(card, "[data-share-in-app]"));
      const counter = by(btn, "small");
      counter.textContent = type === "like" ? relativeCount(like?.querySelector("span")?.textContent) :
        type === "comment" ? relativeCount(by(card, ".post-comments h3 span")?.textContent) :
        type === "save" ? save?.getAttribute("aria-pressed") === "true" ? "Salvo" : "" : "";
      const selected = type === "like" ? like?.getAttribute("aria-pressed") === "true" : type === "save" ? save?.getAttribute("aria-pressed") === "true" : false;
      btn.setAttribute("aria-pressed", String(selected));
      if (type === "like") by(btn, ".looply-reel-glyph").textContent = selected ? "♥" : "♡";
      if (type === "save") by(btn, ".looply-reel-glyph").textContent = selected ? "▣" : "▯";
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
        // Unload inactive third-party players: no hidden audio can continue behind the current slide.
        if (i === index) { if (!source.frame.getAttribute("src")) source.frame.src = source.source; }
        else if (source.frame.hasAttribute("src")) source.frame.removeAttribute("src");
      }
    });
  };
  const activate = (index) => {
    if (closed || index < 0 || index >= slides.length) return;
    if (activeIndex === index) return;
    activeIndex = index;
    for (let i = 0; i < slides.length; i++) { if (i !== index) slides[i].video?.pause(); }
    loadNear(index);
    const player = slides[index].video;
    status("");
    sync();
    const soundButton = by(dialog, "[data-reels-sound]");
    soundButton.hidden = !player;
    if (player) {
      player.muted = !soundOn;
      void player.play().catch(() => status("Toque no vídeo para iniciar a reprodução."));
    }
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
    if (scrollTimer !== null) cancelAnimationFrame(scrollTimer);
    for (const source of slides) {
      if (source.video) { source.video.pause(); source.video.removeAttribute("src"); source.video.load(); }
      source.frame?.removeAttribute("src");
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
      soundOn = !soundOn;
      const activeVideo = slides[activeIndex]?.video;
      if (!activeVideo) return;
      activeVideo.muted = !soundOn;
      const button = by(dialog, "[data-reels-sound]");
      button.textContent = soundOn ? "♫ Som ligado" : "♪ Ativar som";
      button.setAttribute("aria-label", soundOn ? "Silenciar som" : "Ativar som");
      if (soundOn) void activeVideo.play().catch(() => status("Toque no vídeo para ativar o áudio."));
      return;
    }
    const control = event.target.closest("[data-reel-action]");
    if (!control) return;
    const current = slides[activeIndex];
    const card = current && cardFor(current);
    if (!card) { status("Esta publicação não está mais disponível."); return; }
    const type = control.dataset.reelAction;
    if (type === "comment") { showCommentPanel(); return; }
    const selectors = { like: "[data-toggle-like]", save: "[data-toggle-save]", repost: "[data-share-in-app]", share: "[data-share-post]" };
    if (selectors[type]) { const button = by(card, selectors[type]); if (button) button.click(); else status("Esta ação não está disponível."); }
    else if (type === "more") { const link = by(card, "[data-delete-post]"); if (link) { by(dialog, "[data-reels-comments]").hidden = true; const ok = window.confirm("Excluir esta publicação do Looply?"); if (ok) link.click(); } else status("Use as opções da publicação no Feed."); }
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
