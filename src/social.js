import { icon } from "./icons.js";
import { cachedSignedUrls } from "./storage-url-cache.js";
import { invokeAdminAction } from "./admin.js";
import { signProfileAvatars } from "./profiles.js";
import { validatePublicationInput } from "./publication-validation.js";
import { releaseMediaPlayback, requestMediaPlayback } from "./media-playback-coordinator.js";

const externalHosts = new Set([
  "instagram.com", "www.instagram.com", "m.instagram.com", "l.instagram.com",
  "tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"
]);

export function normalizeExternalUrl(value) {
  try {
    let url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return null;
    if (url.hostname.toLowerCase() === "l.instagram.com") {
      const target = url.searchParams.get("u");
      if (!target) return null;
      url = new URL(target);
    }
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !externalHosts.has(hostname)) return null;
    if (["instagram.com", "m.instagram.com"].includes(hostname)) url.hostname = "www.instagram.com";
    return url.href;
  } catch {
    return null;
  }
}

export function extractExternalLinkFromText(value) {
  const text = String(value || "").trim();
  const match = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (!match) return { text, url: null };
  const candidate = match[0].replace(/[),.;!?]+$/, "");
  const url = normalizeExternalUrl(candidate);
  if (!url) return { text, url: null };
  const cleanText = (text.slice(0, match.index) + text.slice(match.index + match[0].length))
    .replace(/\s+/g, " ").trim();
  return { text: cleanText, url };
}

export function tiktokEmbedDetails(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !["tiktok.com", "www.tiktok.com"].includes(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const videoIndex = parts.findIndex((part) => part === "video");
    const videoId = videoIndex > 0 ? parts[videoIndex + 1] : null;
    if (!videoId || !/^\d{8,25}$/.test(videoId) || !parts[videoIndex - 1]?.startsWith("@")) return null;
    // TikTok officially supports a chromeless Embed Player. Looply supplies
    // its own actions, attribution and navigation around this iframe.
    return { videoId, embedUrl: "https://www.tiktok.com/player/v1/" + videoId + "?controls=0&progress_bar=0&play_button=0&volume_control=0&fullscreen_button=0&timestamp=0&music_info=0&description=0&rel=0&native_context_menu=0&closed_caption=0&autoplay=1&loop=1" };
  } catch {
    return null;
  }
}

export function externalPlayerMessage(provider, action) {
  if (provider === "youtube" && ["play", "pause"].includes(action)) {
    return {
      targetOrigin: "https://www.youtube-nocookie.com",
      payload: JSON.stringify({ event: "command", func: action === "play" ? "playVideo" : "pauseVideo", args: [] })
    };
  }
  if (provider === "tiktok" && ["play", "pause", "mute"].includes(action)) {
    return { targetOrigin: "https://www.tiktok.com", payload: { "x-tiktok-player": true, type: action, value: null } };
  }
  return null;
}

export function feedMediaDisplayHeight(containerWidth, naturalWidth, naturalHeight, maximumHeight) {
  const width = Number(containerWidth);
  const sourceWidth = Number(naturalWidth);
  const sourceHeight = Number(naturalHeight);
  const limit = Number(maximumHeight);
  if (!(width > 0)) return 0;
  const proportional = sourceWidth > 0 && sourceHeight > 0
    ? width * sourceHeight / sourceWidth
    : width * 3 / 4;
  return Math.max(1, Math.round(limit > 0 ? Math.min(proportional, limit) : proportional));
}

function feedMediaDimensions(figure) {
  const media = figure?.querySelector("img,video");
  if (media instanceof HTMLImageElement) return [media.naturalWidth, media.naturalHeight];
  if (media instanceof HTMLVideoElement) return [media.videoWidth, media.videoHeight];
  return [0, 0];
}

export function classifyFeedImages(root) {
  root.querySelectorAll("[data-feed-carousel]").forEach(carousel => {
    if (carousel.dataset.carouselBound === "true") return;
    carousel.dataset.carouselBound = "true";
    let ticking = false;
    let activeIndex = 0;
    const maximumHeight = () => Math.min(window.innerHeight * .75, 730);
    const resizeActiveSlide = () => {
      const figure = carousel.children[activeIndex];
      if (!figure) return;
      const [naturalWidth, naturalHeight] = feedMediaDimensions(figure);
      if (naturalWidth > 0 && naturalHeight > 0) figure.dataset.aspect = `${naturalWidth} / ${naturalHeight}`;
      const height = feedMediaDisplayHeight(carousel.clientWidth, naturalWidth, naturalHeight, maximumHeight());
      if (height && Math.abs(carousel.getBoundingClientRect().height - height) > 1) carousel.style.height = height + "px";
      carousel.dataset.mediaReady = naturalWidth > 0 && naturalHeight > 0 ? "true" : "false";
      [...carousel.children].forEach((slide, index) => {
        slide.dataset.carouselActive = index === activeIndex ? "true" : "false";
        slide.setAttribute("aria-hidden", index === activeIndex ? "false" : "true");
      });
    };
    const updateIndex = () => {
      const index = Math.min(carousel.children.length - 1, Math.max(0, Math.round(carousel.scrollLeft / Math.max(1, carousel.clientWidth))));
      activeIndex = index;
      const card = carousel.closest("[data-post-card]");
      card?.querySelectorAll("[data-carousel-dot]").forEach(dot => dot.classList.toggle("is-active", Number(dot.dataset.carouselDot) === index));
      const count = card?.querySelector("[data-carousel-position]");
      if (count) count.textContent = (index + 1) + " / " + carousel.children.length;
      const previous = card?.querySelector('[data-carousel-step="-1"]');
      const next = card?.querySelector('[data-carousel-step="1"]');
      if (previous) previous.disabled = index === 0;
      if (next) next.disabled = index === carousel.children.length - 1;
      resizeActiveSlide();
    };
    carousel.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        updateIndex();
      });
    }, { passive: true });
    const observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => resizeActiveSlide()) : null;
    observer?.observe(carousel);
    carousel.querySelectorAll("img").forEach(image => image.addEventListener("load", resizeActiveSlide));
    carousel.querySelectorAll("video").forEach(video => video.addEventListener("loadedmetadata", resizeActiveSlide));
    updateIndex();
  });
  root.querySelectorAll(".ig-post .post-media img").forEach(image => {
    const apply = () => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      const figure = image.closest(".post-media");
      if (figure) {
        figure.dataset.naturalWidth = String(image.naturalWidth);
        figure.dataset.naturalHeight = String(image.naturalHeight);
      }
    };
    if (image.complete) apply();
    else image.addEventListener("load", apply, { once: true });
  });
}
function bindFeedVideoAutoplay(root) {
  root.__looplyVideoAutoplayDispose?.();
  const media = [...root.querySelectorAll("video[data-feed-video], [data-feed-embed]")];
  if (!media.length || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  let active = null;
  const controller = new AbortController();
  let observer = null;

  const sendFrameCommand = (frame, provider, action) => {
    const message = externalPlayerMessage(provider, action);
    if (!message || !frame?.contentWindow) return;
    frame.contentWindow.postMessage(message.payload, message.targetOrigin);
  };
  const pause = (item) => {
    if (!item) return;
    if (item.matches("video")) { item.pause(); releaseMediaPlayback(item, item); }
    else sendFrameCommand(item.querySelector("iframe"), item.dataset.videoProvider, "pause");
  };
  const play = async (item) => {
    if (!item?.isConnected || active === item) return;
    pause(active);
    active = item;
    if (item.matches("video")) {
      if (!requestMediaPlayback("feed", item, item)) { active = null; return; }
      item.muted = true;
      item.playsInline = true;
      try { await item.play(); }
      catch { releaseMediaPlayback(item, item); active = null; /* Native controls remain available. */ }
      return;
    }
    const frame = item.querySelector("iframe");
    const provider = item.dataset.videoProvider;
    for (const delay of [0, 250, 750]) {
      setTimeout(() => {
        if (active !== item) return;
        if (provider === "tiktok") sendFrameCommand(frame, provider, "mute");
        sendFrameCommand(frame, provider, "play");
      }, delay);
    }
  };

  for (const item of media) {
    const hoverTarget = item.matches("video") ? item : item;
    hoverTarget.addEventListener("pointerenter", () => { void play(item); }, { passive: true, signal: controller.signal });
    hoverTarget.addEventListener("pointerleave", () => {
      if (active === item) { pause(item); active = null; }
    }, { passive: true, signal: controller.signal });
    hoverTarget.addEventListener("focusin", () => { void play(item); }, { signal: controller.signal });
    hoverTarget.addEventListener("focusout", (event) => {
      if (!hoverTarget.contains(event.relatedTarget) && active === item) { pause(item); active = null; }
    }, { signal: controller.signal });
  }

  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.intersectionRatio >= 0.6) void play(entry.target);
        else if (active === entry.target) { pause(active); active = null; }
      }
    }, { threshold: [0, 0.6] });
    media.forEach((item) => observer.observe(item));
  }
  root.__looplyVideoAutoplayDispose = () => {
    pause(active);
    active = null;
    observer?.disconnect();
    controller.abort();
    root.ownerDocument.removeEventListener("visibilitychange", handleVisibilityChange);
    root.__looplyVideoAutoplayDispose = null;
  };
  function handleVisibilityChange() {
    if (root.ownerDocument.hidden) { pause(active); active = null; }
  }
  root.ownerDocument.addEventListener("visibilitychange", handleVisibilityChange, { signal: controller.signal });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export function instagramEmbedDetails(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const shared = parts[0] === "share";
    const kind = parts[shared ? 1 : 0];
    const shortcode = parts[shared ? 2 : 1];
    if (!["p", "reel", "tv"].includes(kind) || !/^[A-Za-z0-9_-]{5,30}$/.test(shortcode || "")) return null;
    return { kind, shortcode, embedUrl: "https://www.instagram.com/" + kind + "/" + shortcode + "/embed/" };
  } catch {
    return null;
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "agora há pouco";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function profileLabel(profile) {
  if (!profile) return "Perfil restrito";
  const name = escapeHtml(profile.display_name || profile.username || "Membro");
  const username = profile.username ? ` <span>@${escapeHtml(profile.username)}</span>` : "";
  return `${name}${username}`;
}

function commentMediaMarkup(media) {
  if (!media?.length) return "";
  return `<div class="comment-media-grid">${media.map((item) => {
    if (!item.signedUrl) return `<span class="media-unavailable">Anexo temporariamente indisponível.</span>`;
    const url = escapeHtml(item.signedUrl);
    const label = escapeHtml(item.file_name || (item.mime_type.startsWith("video/") ? "Vídeo anexado ao comentário" : "Imagem anexada ao comentário"));
    return item.mime_type.startsWith("video/")
      ? `<video src="${url}" controls preload="metadata" aria-label="${label}"></video>`
      : `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" alt="${label}" loading="lazy" referrerpolicy="no-referrer"></a>`;
  }).join("")}</div>`;
}

function commentAttachmentField(commentId, postId) {
  const id = `comment-media-${commentId || postId}`;
  return `<label class="comment-attachment-label" for="${escapeHtml(id)}">${icon("plus")} Foto ou vídeo <span>Você pode escolher pela galeria ou câmera do celular.</span></label>
    <input class="visually-hidden" id="${escapeHtml(id)}" name="commentMedia" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm">`;
}

function commentMarkup(comment, canReply, userId) {
  const replyForm = canReply
    ? `<details class="reply-details"><summary>Responder</summary>
        <form class="comment-form reply-form" data-social-comment data-post-id="${escapeHtml(comment.post_id)}" data-parent-comment-id="${escapeHtml(comment.id)}">
          <label class="visually-hidden" for="reply-${escapeHtml(comment.id)}">Sua resposta</label>
          <textarea id="reply-${escapeHtml(comment.id)}" name="body" maxlength="2000" required placeholder="Escreva uma resposta..."></textarea>
          ${commentAttachmentField(comment.id, comment.post_id)}
          <button class="text-button" type="submit">Enviar resposta</button>
          <span class="form-status" data-status role="status" aria-live="polite"></span>
        </form>
      </details>`
    : "";

  const ownerActions = comment.author_id === userId
    ? `<div class="comment-owner-actions"><button class="text-button" type="button" data-edit-comment="${escapeHtml(comment.id)}">Editar</button><button class="text-button" type="button" data-delete-comment="${escapeHtml(comment.id)}">Excluir</button></div>`
    : "";
  return `<article class="comment-item${canReply ? "" : " comment-reply"}" id="comment-${escapeHtml(comment.id)}" data-comment-post-id="${escapeHtml(comment.post_id)}">
    <div class="comment-meta"><a href="perfil.html?usuario=${encodeURIComponent(comment.author_id)}" data-profile-name-id="${escapeHtml(comment.author_id)}"><strong>${profileLabel(comment.author)}</strong></a><time datetime="${escapeHtml(comment.created_at)}">${escapeHtml(formatDate(comment.created_at))}</time>${ownerActions}</div>
    <p data-comment-body>${escapeHtml(comment.body)}</p><form class="comment-edit-form" data-comment-edit-form hidden><label class="visually-hidden" for="edit-comment-${escapeHtml(comment.id)}">Editar comentário</label><textarea id="edit-comment-${escapeHtml(comment.id)}" name="body" maxlength="2000" required></textarea><div><button class="text-button" type="submit">Salvar edição</button><button class="text-button" type="button" data-cancel-comment-edit>Cancelar</button></div></form>${commentMediaMarkup(comment.media)}<span class="form-status" data-comment-status role="status" aria-live="polite"></span>${replyForm}
  </article>`;
}

function postMarkup(post, userId, isAdmin = false) {
  const comments = Array.isArray(post.comments) ? [...post.comments] : [];
  comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const replies = new Map();
  for (const comment of comments) {
    if (comment.parent_comment_id) {
      const siblings = replies.get(comment.parent_comment_id) || [];
      siblings.push(comment);
      replies.set(comment.parent_comment_id, siblings);
    }
  }
  const roots = comments.filter((comment) => !comment.parent_comment_id);
  const commentList = roots.length
    ? roots.map((comment) => `<div class="comment-thread">${commentMarkup(comment, true, userId)}${(replies.get(comment.id) || []).map((reply) => commentMarkup(reply, false, userId)).join("")}</div>`).join("")
    : `<p class="empty-comments">Ainda não há comentários. Você pode começar a conversa.</p>`;
  const labels = { public: "Público", private: "Só você", selected: "Pessoas escolhidas" };
  const liked = Boolean(post.likedByMe);
  const likeCount = Number(post.likeCount || 0);
  const normalizedExternalUrl = normalizeExternalUrl(post.external_url);
  const externalUrl = normalizedExternalUrl ? new URL(normalizedExternalUrl) : null;
  let externalMarkup = "";
  if (externalUrl) {
    let provider = externalUrl.hostname.includes("instagram") ? "Instagram" : externalUrl.hostname.includes("tiktok") ? "TikTok" : "Link externo";
    let embed = "";
    if (externalUrl.hostname.includes("instagram")) {
      const details = instagramEmbedDetails(externalUrl.href);
      if (details) {
        provider = "Instagram";
        embed = '<div class="post-external-embed post-instagram-embed"><iframe src="' + escapeHtml(details.embedUrl) + '" title="Publicação do Instagram" loading="lazy" allow="clipboard-write; encrypted-media; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>';
      }
    } else if (externalUrl.hostname.includes("youtube.com") || externalUrl.hostname === "youtu.be") {
      const pathParts = externalUrl.pathname.split("/").filter(Boolean);
      const id = externalUrl.hostname === "youtu.be" ? pathParts[0] : externalUrl.pathname === "/watch" ? externalUrl.searchParams.get("v") : ["shorts", "embed", "live"].includes(pathParts[0]) ? pathParts[1] : null;
      if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
        provider = "YouTube";
        const origin = typeof location !== "undefined" ? "&origin=" + encodeURIComponent(location.origin) : "";
        embed = '<div class="post-external-embed" data-feed-embed data-video-provider="youtube"><iframe src="https://www.youtube-nocookie.com/embed/' + escapeHtml(id) + '?enablejsapi=1&controls=0&disablekb=1&fs=0&playsinline=1&rel=0' + origin + '" title="Vídeo do YouTube" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
      }
    } else if (externalUrl.hostname.includes("tiktok.com")) {
      const details = tiktokEmbedDetails(externalUrl.href);
      provider = "TikTok";
      if (details) {
        embed = '<div class="post-external-embed post-tiktok-embed" data-feed-embed data-video-provider="tiktok"><iframe src="' + escapeHtml(details.embedUrl) + '" title="Vídeo do TikTok" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>';
      } else {
        // TikTok share URLs are often shortened. Resolve them with TikTok's public oEmbed endpoint after rendering.
        embed = '<div class="post-external-embed post-tiktok-embed" data-tiktok-preview data-tiktok-url="' + escapeHtml(externalUrl.href) + '"><p>Carregando pré-visualização do TikTok…</p></div>';
      }
    }
    const expand = embed ? '<button type="button" class="hybrid-external-watch" data-open-external-reel="external-' + escapeHtml(post.id) + '" aria-label="Assistir esta publicação em tela cheia">▶<span>Assistir em Reels</span></button>' : '';
    externalMarkup = '<section class="post-external" aria-label="Conteúdo externo"><div class="post-external-credit"><span class="hybrid-provider-label">' + escapeHtml(provider) + '</span><div class="hybrid-provider-tools"><a href="' + escapeHtml(externalUrl.href) + '" target="_blank" rel="noopener noreferrer" aria-label="Abrir publicação original em ' + escapeHtml(provider) + '">Abrir original ' + icon("external") + '</a><button type="button" data-profile-open="' + escapeHtml(post.author_id) + '">Ver perfil</button></div></div><div class="hybrid-external-frame">' + (embed || '<p class="post-external-unavailable">A prévia não está disponível para este link.</p>') + expand + '</div></section>';
  }
  const mediaMarkup = (post.media || []).map((item, mediaIndex) => {
    if (!item.signedUrl) return `<div class="media-unavailable" role="status">Mídia temporariamente indisponível.</div>`;
    const source = escapeHtml(item.signedUrl);
    const alt = escapeHtml(item.alt_text || (item.kind === "video" ? "Vídeo compartilhado no Looply" : "Imagem compartilhada no Looply"));
    return item.kind === "video"
      ? `<figure class="post-media"><video src="${source}" data-feed-video controls muted playsinline preload="metadata" aria-label="${alt}" data-feed-reel-id="${escapeHtml(post.id)}-${mediaIndex}" data-open-reel="${escapeHtml(post.id)}-${mediaIndex}" title="Abrir vídeo em tela cheia"></video><button class="reel-expand-button" type="button" data-open-reel="${escapeHtml(post.id)}-${mediaIndex}" aria-label="Abrir vídeo em tela cheia" title="Abrir vídeo em tela cheia">⛶</button>${item.alt_text ? `<figcaption>${escapeHtml(item.alt_text)}</figcaption>` : ""}</figure>`
      : `<figure class="post-media"><img src="${source}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">${item.alt_text ? `<figcaption>${escapeHtml(item.alt_text)}</figcaption>` : ""}</figure>`;
  }).join("");

  return `<article class="post-card ig-post" id="post-${escapeHtml(post.id)}" data-post-card="${escapeHtml(post.id)}">
    <header class="post-header ig-post-header">
      <div class="post-author"><button type="button" class="post-author-profile" data-profile-open="${escapeHtml(post.author_id)}" aria-label="Visualizar perfil do autor"><span class="post-avatar" data-profile-avatar-id="${escapeHtml(post.author_id)}" aria-hidden="true">${post.author?.avatarUrl ? '<img src="' + escapeHtml(post.author.avatarUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : escapeHtml((post.author?.display_name || post.author?.username || "M").slice(0, 1).toLocaleUpperCase("pt-BR"))}</span>
        <div><strong data-profile-name-id="${escapeHtml(post.author_id)}">${profileLabel(post.author)}</strong><time datetime="${escapeHtml(post.created_at)}">${escapeHtml(formatDate(post.created_at))}</time></div></button>
      </div>
      <div class="post-controls"><span class="visibility-pill">${labels[post.visibility] || "Publicação"}</span>${post.author_id === userId ? `<details class="post-owner-menu"><summary aria-label="Opções da publicação">⋯</summary><div class="post-owner-menu-actions"><button type="button" class="text-button post-edit-button" data-edit-post="${escapeHtml(post.id)}">Editar legenda</button></div></details>` : ""}${post.author_id === userId || isAdmin ? `<button class="post-delete-button${isAdmin && post.author_id !== userId ? " admin-content-delete" : ""}" type="button" data-delete-post="${escapeHtml(post.id)}" aria-label="Excluir publicação">${isAdmin && post.author_id !== userId ? "Excluir como ADM" : "Excluir"}</button>` : ""}</div>
    </header>
    ${mediaMarkup ? `<div class="post-media-grid" data-feed-carousel>${mediaMarkup}</div>${(post.media || []).length > 1 ? `<div class="post-carousel-navigation" role="group" aria-label="Navegar pelas fotos da publicação"><button type="button" data-carousel-step="-1" aria-label="Foto anterior" disabled>‹</button><span data-carousel-position aria-live="polite">1 / ${post.media.length}</span><button type="button" data-carousel-step="1" aria-label="Próxima foto">›</button></div><div class="post-carousel-dots" aria-hidden="true">${post.media.map((_, i) => `<span data-carousel-dot="${i}" class="${i === 0 ? "is-active" : ""}"></span>`).join("")}</div>` : ""}` : ""}
    ${externalMarkup}
    ${post.body && !(post.external_url && /^Compartilhou uma publicação externa\.?$/i.test(post.body.trim())) ? `<p class="post-body">${escapeHtml(post.body)}</p>` : ""}
    ${post.author_id === userId ? `<form class="post-caption-editor" data-post-edit-form="${escapeHtml(post.id)}" hidden><label for="caption-${escapeHtml(post.id)}">Editar legenda</label><textarea id="caption-${escapeHtml(post.id)}" name="body" maxlength="2200">${escapeHtml(post.body || "")}</textarea><div class="post-caption-editor-actions"><button type="submit" class="primary-button compact-button">Salvar edição</button><button type="button" class="text-button" data-cancel-post-edit>Cancelar</button></div><span data-edit-status role="status" aria-live="polite"></span></form>` : ""}
    <div class="post-interactions ig-actions">
      <button class="post-icon-button post-like-button${liked ? " is-liked" : ""}" type="button" data-toggle-like="${escapeHtml(post.id)}" aria-pressed="${liked ? "true" : "false"}" aria-label="${liked ? "Descurtir publicação" : "Curtir publicação"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.7c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>${likeCount}</span></button>
      <button class="post-icon-button post-comments-toggle" type="button" data-toggle-post-comments="${escapeHtml(post.id)}" aria-expanded="false" aria-label="Ver ou adicionar comentários">${icon("chat")}<span>${comments.length}</span></button>
      <button class="post-icon-button" type="button" data-share-post="${escapeHtml(post.id)}" aria-label="Compartilhar publicação externamente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Compartilhar</span></button>
      <button class="post-icon-button" type="button" data-share-in-app="${escapeHtml(post.id)}" aria-label="Compartilhar no chat do Looply">Enviar no Looply</button>
      ${post.author_id !== userId ? '<button class="post-icon-button" type="button" data-private-reply="' + escapeHtml(post.author_id) + '" data-private-post="' + escapeHtml(post.id) + '">Responder em particular</button>' : ""}
      <span class="post-action-status" data-post-status="${escapeHtml(post.id)}" role="status" aria-live="polite"></span>
    </div>
    <section class="post-comments ig-comments" aria-label="Comentários">
      <h3>Comentários <span>${comments.length}</span></h3>
      <div class="comment-list">${commentList}</div>
      <form class="comment-form" data-social-comment data-post-id="${escapeHtml(post.id)}">
        <label class="visually-hidden" for="comment-${escapeHtml(post.id)}">Adicionar comentário</label>
        <textarea id="comment-${escapeHtml(post.id)}" name="body" maxlength="2000" required placeholder="Escreva um comentário..."></textarea>
        ${commentAttachmentField("new", post.id)}
        <button class="text-button" type="submit">Comentar</button>
        <span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>
    </section>
  </article>`;
}

async function loadPosts(client) {
  const { data, error } = await client
    .from("posts")
    .select("id,author_id,body,visibility,external_url,created_at,author:profiles!posts_author_id_fkey(id,username,display_name,avatar_path),comments(id,post_id,author_id,parent_comment_id,body,created_at,author:profiles!comments_author_id_fkey(id,username,display_name,avatar_path),media:comment_media(id,storage_path,mime_type,byte_size,created_at)),media:post_media(id,storage_path,kind,mime_type,byte_size,alt_text,created_at)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(0, 29);
  if (error) throw error;
  const posts = data || [];
  if (posts.length) {
    const { data: currentUserData } = await client.auth.getUser();
    const currentUserId = currentUserData?.user?.id;
    const postIds = posts.map((post) => post.id);
    const [{ data: likes, error: likesError }, { data: mine, error: mineError }] = await Promise.all([
      client.from("post_likes").select("post_id").in("post_id", postIds),
      currentUserId ? client.from("post_likes").select("post_id").in("post_id", postIds).eq("user_id", currentUserId) : Promise.resolve({data:[],error:null})
    ]);
    if (likesError) throw likesError;
    if (mineError) throw mineError;
    const counts = new Map();
    for (const like of likes || []) counts.set(like.post_id, (counts.get(like.post_id) || 0) + 1);
    const mineIds = new Set((mine || []).map((like) => like.post_id));
    for (const post of posts) {
      post.likeCount = counts.get(post.id) || 0;
      post.likedByMe = mineIds.has(post.id);
    }
  }
  const profileRows = [];
  for (const post of posts) {
    if (post.author) profileRows.push(post.author);
    for (const comment of post.comments || []) if (comment.author) profileRows.push(comment.author);
  }
  const signedProfiles = await signProfileAvatars(client, [...new Map(profileRows.filter((p) => p.id).map((p) => [p.id, p])).values()]);
  const profilesById = new Map(signedProfiles.map((p) => [p.id, p]));
  for (const post of posts) {
    if (post.author) post.author = profilesById.get(post.author.id) || post.author;
    for (const comment of post.comments || []) if (comment.author) comment.author = profilesById.get(comment.author.id) || comment.author;
  }
  const media = posts.flatMap((post) => (post.media || []).map((item) => ({ ...item, postId: post.id })));
  const commentMedia = posts.flatMap((post) => (post.comments || []).flatMap((comment) =>
    (comment.media || []).map((item) => Object.assign(item, { commentId: comment.id }))));
  const allMedia = [...media, ...commentMedia];
  if (allMedia.length) {
    const { data: signed, error: signedError } = await cachedSignedUrls(client, "looply-media", allMedia.map((item) => item.storage_path), 1800);
    if (!signedError && signed) {
      allMedia.forEach((item, index) => { item.signedUrl = signed[index]?.signedUrl || null; });
    }
    const byPost = new Map();
    for (const item of media) {
      const items = byPost.get(item.postId) || [];
      items.push(item);
      byPost.set(item.postId, items);
    }
    for (const post of posts) post.media = (byPost.get(post.id) || []).sort((a, b) =>
      new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id)));
  }
  return posts;
}

const mediaExtensions = new Map([
  ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"],
  ["video/mp4", "mp4"], ["video/webm", "webm"]
]);
const mediaMimeTypesByExtension = new Map([...mediaExtensions].map(([mimeType, extension]) => [extension, mimeType]));
mediaMimeTypesByExtension.set("jpeg", "image/jpeg"); // Some Android providers omit the JPEG MIME type.
// The previous 25 MB browser-side gate was arbitrary. The signed Neon Storage
// upload path accepts substantially larger objects without proxying their bytes
// through the application function. Keep a 10x safety ceiling so accidental
// multi-gigabyte selections still fail locally and predictably.
// Database post_media_byte_size_check limits every attached file to 100 MiB.
const maxMediaBytes = 100 * 1024 * 1024;
const maxMediaCount = 8;
const maxCommentMediaCount = 4;

export function normalizePublicationMedia(file) {
  const declaredType = String(file?.type || "").split(";")[0].toLocaleLowerCase("en-US");
  if (mediaExtensions.has(declaredType)) return file;
  if (declaredType === "image/jpg" || declaredType === "image/pjpeg") {
    return new File([file], file.name || "foto.jpg", {
      type: "image/jpeg", lastModified: file.lastModified || Date.now()
    });
  }
  // Android document providers commonly return an empty/generic MIME type for a
  // user-selected content:// URI. Infer only that narrow case from an allowlisted
  // extension; explicit unsupported types are still rejected.
  if (declaredType && declaredType !== "application/octet-stream") return null;
  const extension = String(file?.name || "").split(".").pop()?.toLocaleLowerCase("en-US") || "";
  const mimeType = mediaMimeTypesByExtension.get(extension);
  if (!mimeType) return null;
  return new File([file], file.name || `midia.${mediaExtensions.get(mimeType)}`, {
    type: mimeType,
    lastModified: file.lastModified || Date.now()
  });
}

// HEIC/HEIF must be decoded before being uploaded: browsers and the current
// post_media schema do not consistently support displaying HEIC objects.
export async function preparePublicationMedia(file) {
  const extension = String(file?.name || "").split(".").pop()?.toLowerCase() || "";
  const type = String(file?.type || "").split(";")[0].toLowerCase();
  if (["image/heic", "image/heif"].includes(type) || ["heic", "heif"].includes(extension)) {
    try {
      // Lazy-load only for HEIC/HEIF; all conversions stay on the user's device.
      const { heicTo } = await import("https://esm.sh/heic-to@1.6.6?bundle");
      const converted = await heicTo({ blob: file, type: "image/jpeg", quality: 0.94 });
      if (!(converted instanceof Blob) || !converted.size) throw new Error("heic_empty_output");
      return new File([converted], (file.name || "foto.heic").replace(/\.(heic|heif)$/i, "") + ".jpg", {
        type: "image/jpeg", lastModified: file.lastModified || Date.now()
      });
    } catch (error) {
      console.error("HEIC/HEIF conversion failed", error);
      throw new Error("heic_conversion_failed");
    }
  }
  return normalizePublicationMedia(file);
}

async function selectedMedia(formData) {
  const originals = formData.getAll("media").filter((file) => file instanceof File && file.size > 0);
  if (originals.length > maxMediaCount) throw new Error("too many files");
  const files = [];
  for (const original of originals) {
    const file = await preparePublicationMedia(original);
    if (!file || !mediaExtensions.has(file.type) || file.size > maxMediaBytes) throw new Error("unsupported file");
    files.push(file);
  }
  return files;
}

function selectedCommentMedia(formData) {
  const files = formData.getAll("commentMedia").filter((file) => file instanceof File && file.size > 0).map(normalizePublicationMedia);
  if (files.length > maxCommentMediaCount) throw new Error("too many comment files");
  for (const file of files) {
    if (!file || !mediaExtensions.has(file.type) || file.size > maxMediaBytes) throw new Error("unsupported file");
  }
  return files;
}

export async function uploadResumable(client, path, file, onProgress) {
  // All binary data goes to the authenticated Neon Storage service.
  // Supabase TUS endpoints, keys, and retry SDKs are not used.
  const { data, error } = await client.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error("session expired");
  if (!file?.size) throw new Error("unsupported file");
  onProgress?.(0);
  const { data: uploaded, error: uploadError } = await client.storage.from("looply-media").upload(path, file, {
    contentType: file.type || "application/octet-stream", upsert: false
  });
  if (uploadError) throw uploadError;
  if (uploaded?.path !== path) throw new Error("neon_storage_unconfirmed");
  onProgress?.(100);
}

export async function loadSocialData(client) {
  const [peopleResult, postsResult] = await Promise.all([
    client.from("profiles").select("id,username,display_name,profile_visibility,avatar_path").order("username").limit(100),
    loadPosts(client).then((posts) => ({ posts }), (error) => ({ error }))
  ]);
  const people = await signProfileAvatars(client, peopleResult.data || []);
  return {
    people,
    peopleError: peopleResult.error,
    posts: postsResult.posts || [],
    postsError: postsResult.error
  };
}

function feedMarkup(posts, error, userId, isAdmin = false) {
  if (error) {
    return `<div class="social-message social-error" role="alert">O feed não carregou. Confira a conexão e as permissões e tente atualizar.
      <button class="text-button" type="button" data-social-action="refresh">Atualizar feed</button></div>`;
  }
  if (!posts.length) {
    return `<div class="social-message"><strong>Nenhuma publicação ainda.</strong></div>`;
  }
  return posts.map((post) => postMarkup(post, userId, isAdmin)).join("");
}

export function socialMarkup({ people, peopleError, posts, postsError }, userId, isAdmin = false) {
  const eligiblePeople = (people || []).filter(person => person.id !== userId);
  const recipients = eligiblePeople.map((person) =>
    `<option value="${escapeHtml(person.id)}">${escapeHtml(person.display_name || person.username)} · @${escapeHtml(person.username)}</option>`
  ).join("");
  const peopleHint = peopleError
    ? `<span class="field-hint field-error">Não foi possível carregar os perfis. As publicações escolhidas ficarão indisponíveis até atualizar a página.</span>`
    : eligiblePeople.length
      ? `<span class="field-hint">Escolha de 1 a 20 perfis visíveis. Só as pessoas selecionadas terão acesso.</span>`
      : `<span class="field-hint">Não há outros perfis visíveis para compartilhar ainda.</span>`;

  return `<section class="social-area" aria-labelledby="socialTitle">
    <div class="social-heading"><div><span class="section-kicker">Publicações</span><h2 id="socialTitle">Feed</h2></div>
      <span class="realtime-state" data-realtime-status role="status">Conectando atualizações...</span></div>
    <form class="post-composer" data-social-post>
      <header class="post-composer-heading"><span class="post-compose-pen" aria-hidden="true">✒</span><strong>Nova publicação</strong><button class="post-add-button" type="button" data-toggle-composer aria-expanded="false" aria-controls="postComposerFields" aria-label="Abrir formulário de nova publicação" title="Nova publicação"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></header>
      <div class="post-composer-fields" id="postComposerFields" data-composer-fields hidden>
      <div class="post-create-header"><button type="button" data-close-composer aria-label="Cancelar publicação">✕</button><strong>Nova publicação</strong><button type="submit">Compartilhar</button></div>
      <div class="post-create-preview" data-post-preview aria-live="polite"><p class="post-preview-empty">Sua foto ou vídeo aparecerá aqui antes de publicar.</p></div>
      <button class="post-select-media" data-select-post-media type="button">${icon("image")} Selecionar fotos e vídeos</button>
      <label for="postBody">Legenda</label>
      <textarea id="postBody" name="body" maxlength="2200" placeholder="Escreva uma legenda (opcional)"></textarea>
      <label class="media-picker-label" for="postFiles">Fotos e vídeos <span>Até 8 arquivos, 100 MB por arquivo</span></label>
      <input id="postFiles" name="media" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,video/mp4,video/webm">
      <label for="postExternalUrl">Link externo (Instagram, TikTok ou YouTube)</label>
      <input id="postExternalUrl" name="externalUrl" type="url" inputmode="url" maxlength="2048" placeholder="https://..." autocomplete="url">
      <div class="composer-options">
        <label for="postVisibility">Quem pode ver?</label>
        <select id="postVisibility" name="visibility">
          <option value="public">Público</option>
          <option value="private">Só eu</option>
          <option value="selected">Pessoas escolhidas</option>
        </select>
        <button class="primary-button compact-button" type="submit">Publicar ${icon("send")}</button>
      </div>
      <div class="recipient-picker" data-recipient-picker hidden>
        <label for="postRecipients">Escolha quem poderá ver</label>
        <select id="postRecipients" name="recipientIds" multiple size="4" ${people.length ? "" : "disabled"}>${recipients}</select>
        ${peopleHint}
      </div>
      <div class="form-status" data-status role="status" aria-live="polite"></div>
      </div>
    </form>
    <div class="feed-list" data-social-feed>${feedMarkup(posts, postsError, userId, isAdmin)}</div>
    <nav class="looply-feed-nav" aria-label="Navegação rápida"><a href="home.html" aria-current="page" aria-label="Início">${icon("home")}<small>Início</small></a><a href="cartas.html" aria-label="Cartas">${icon("mail")}<small>Cartas</small></a><a href="musicas.html" aria-label="Músicas">${icon("music")}<small>Músicas</small></a><a href="galeria.html" aria-label="Galeria">${icon("image")}<small>Galeria</small></a><a href="chat.html" aria-label="Chat">${icon("chat")}<small>Chat</small></a><a href="notificacoes.html" aria-label="Avisos">${icon("bell")}<small>Avisos</small></a></nav>
  </section>`;
}

function setStatus(form, message, isError = false) {
  const target = form.querySelector("[data-status]");
  if (!target) return;
  target.textContent = message;
  target.dataset.kind = isError ? "error" : "success";
}

function explainWriteError(error) {
  console.error("Looply social action failed", error);
  const message = String(error?.message || "");
  if (/too many files/i.test(message)) return "Escolha no máximo 8 arquivos para esta publicação.";
  if (/too many comment files/i.test(message)) return "Anexe no máximo 4 fotos ou vídeos a cada comentário.";
  if (/heic_conversion_failed/i.test(message)) return "Não foi possível converter esta foto HEIC/HEIF neste navegador. Tente novamente com conexão ativa.";
  if (/unsupported file/i.test(message)) return "Use JPEG, PNG, WebP, HEIC/HEIF (conversão necessária) ou MP4/WebM com até 100 MB.";
  if (/duplicate|unique/i.test(message)) return "Essa publicação ou interação já foi registrada.";
  if (/permission|policy|row-level|42501/i.test(message)) return "Sua conta não tem permissão para essa ação ou o conteúdo não está mais disponível.";
  if (/recipient|recipients/i.test(message)) return "Revise os perfis escolhidos para compartilhar.";
  if (/unsupported external URL/i.test(message)) return "Use um link HTTPS válido do Instagram, YouTube ou TikTok.";
  if (/empty body|media_or_text_required/i.test(message)) return "Adicione um texto, um link válido ou uma foto/vídeo antes de publicar.";
  return "Não foi possível salvar agora. Confira sua conexão e tente novamente.";
}

export async function hydrateTikTokEmbeds(root) {
  if (!root) return;
  const placeholders = [...root.querySelectorAll("[data-tiktok-preview]")];
  await Promise.all(placeholders.map(async (placeholder) => {
    const sharedUrl = placeholder.dataset.tiktokUrl;
    if (!sharedUrl || placeholder.dataset.loading === "true") return;
    placeholder.dataset.loading = "true";
    try {
      const endpoint = "https://www.tiktok.com/oembed?url=" + encodeURIComponent(sharedUrl);
      const response = await fetch(endpoint, { headers: { Accept: "application/json" }, credentials: "omit" });
      if (!response.ok) throw new Error("TikTok preview unavailable");
      const payload = await response.json();
      const videoId = /data-video-id=["'](\d{8,25})["']/.exec(String(payload?.html || ""))?.[1];
      if (!videoId || !placeholder.isConnected) throw new Error("TikTok embed id unavailable");
      const iframe = document.createElement("iframe");
      iframe.src = tiktokEmbedDetails("https://www.tiktok.com/@looply/video/" + videoId)?.embedUrl || "";
      iframe.title = "Vídeo do TikTok";
      iframe.loading = "lazy";
      iframe.allow = "autoplay; encrypted-media; picture-in-picture; web-share";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      placeholder.dataset.feedEmbed = "";
      placeholder.dataset.videoProvider = "tiktok";
      placeholder.replaceChildren(iframe);
    } catch {
      if (placeholder.isConnected) placeholder.textContent = "A pré-visualização não está disponível para este link. Abra o conteúdo original.";
    }
  }));
  // Rebind after hydration, but never let feed media restart behind the viewer.
  if (root.querySelector("[data-reels-viewer]")?.open) root.querySelectorAll("video[data-feed-video]").forEach(video => video.pause());
  else if (root.querySelector("[data-reels-scroll]")) root.querySelectorAll("video[data-feed-video]").forEach(video => video.pause());
  else bindFeedVideoAutoplay(root);
}

export async function refreshSocialFeed(root, client, userId, isAdmin = false) {
  const feed = root.querySelector("[data-social-feed]");
  if (!feed || !client) return;
  feed.setAttribute("aria-busy", "true");
  try {
    const posts = await loadPosts(client);
    const currentUserId = userId || (await client.auth.getUser()).data.user?.id;
    feed.innerHTML = feedMarkup(posts, null, currentUserId, isAdmin);
    classifyFeedImages(feed);
    if (root.querySelector("[data-reels-viewer]")?.open || root.querySelector("[data-reels-scroll]")) {
      root.__looplyVideoAutoplayDispose?.();
      feed.querySelectorAll("video[data-feed-video]").forEach(video => video.pause());
    } else bindFeedVideoAutoplay(root);
    void hydrateTikTokEmbeds(root);
    refreshReelsViewer(root);
    return true;
  } catch (error) {
    feed.innerHTML = feedMarkup([], error);
    return false;
  } finally {
    feed.removeAttribute("aria-busy");
  }
}


function reelsViewerMarkup() {
  return '<dialog class="reels-viewer" data-reels-viewer aria-label="Visualizador de vídeos">' +
    '<button type="button" class="reels-close" data-reel-close aria-label="Fechar visualizador">×</button>' +
    '<div class="reels-backdrop" data-reel-backdrop aria-hidden="true"></div>' +
    '<video class="reels-active-video" data-reel-active playsinline preload="metadata" aria-label="Vídeo da publicação"></video>' +
    '<button type="button" class="reels-play-toggle" data-reel-toggle-play aria-label="Pausar ou continuar vídeo">Ⅱ</button>' +
    '<button type="button" class="reels-sound" data-reel-sound-toggle aria-label="Ativar som" aria-pressed="false">Ativar som</button>' +
    '<button type="button" class="reels-nav reels-previous" data-reel-previous aria-label="Vídeo anterior">⌃</button>' +
    '<button type="button" class="reels-nav reels-next" data-reel-next aria-label="Próximo vídeo">⌄</button>' +
    '<aside class="reels-actions" aria-label="Ações do vídeo">' +
      '<button type="button" data-reel-like aria-pressed="false" aria-label="Curtir"><span aria-hidden="true">♡</span><small data-reel-like-count>0</small></button>' +
      '<button type="button" data-reel-comments aria-expanded="false" aria-label="Comentários"><span aria-hidden="true">▤</span><small data-reel-comment-count>0</small></button>' +
      '<button type="button" data-reel-share aria-label="Compartilhar publicação"><span aria-hidden="true">➤</span><small>Compartilhar</small></button>' +
      '<button type="button" data-reel-send aria-label="Enviar no Looply"><span aria-hidden="true">↗</span><small>Enviar</small></button>' +
    '</aside>' +
    '<footer class="reels-details"><div class="reels-author" data-reel-author></div><p data-reel-caption></p></footer>' +
    '<section class="reels-comments-panel" data-reel-comments-panel hidden aria-label="Comentários">' +
      '<header><strong>Comentários</strong><button type="button" data-reel-comments-close aria-label="Fechar comentários">×</button></header>' +
      '<div data-reel-comments-content></div></section>' +
    '<p class="reels-status" data-reel-status role="status" aria-live="polite"></p>' +
  '</dialog>';
}
function reelsItems(root) {
  return [...root.querySelectorAll("[data-feed-reel-id]")].map(video => ({
    key: video.dataset.feedReelId, video, card: video.closest("[data-post-card]")
  })).filter(item => item.key && item.card);
}
function copyReelComments(item, viewer) {
  const target = viewer.querySelector("[data-reel-comments-content]");
  const source = item?.card?.querySelector(".post-comments");
  target.replaceChildren();
  if (!source) {
    const empty = document.createElement("p"); empty.textContent = "Os comentários não estão disponíveis."; target.append(empty); return;
  }
  const clone = source.cloneNode(true);
  const idMap = new Map();
  clone.querySelectorAll("[id]").forEach((element, index) => {
    const originalId = element.id;
    element.id = "reel-" + index + "-" + originalId;
    idMap.set(originalId, element.id);
  });
  clone.querySelectorAll("label[for]").forEach(label => { label.htmlFor = idMap.get(label.htmlFor) || label.htmlFor; });
  clone.querySelectorAll("[data-edit-comment],[data-delete-comment]").forEach(button => button.remove());
  target.append(clone);
}
function renderReelViewer(root, key, autoplay = false) {
  const viewer = root.querySelector("[data-reels-viewer]");
  const item = reelsItems(root).find(candidate => candidate.key === key);
  if (!viewer || !item) return false;
  const player = viewer.querySelector("[data-reel-active]");
  const source = item.video.currentSrc || item.video.src;
  const changed = viewer.dataset.reelKey !== key || player.dataset.source !== source;
  viewer.dataset.reelKey = key;
  if (changed) {
    player.pause(); player.removeAttribute("src"); player.load();
    // Preserve the viewer's explicit sound preference when swiping between Reels.
    // A new viewer session still starts muted for browser autoplay compatibility.
    const soundOn = viewer.dataset.reelsSoundOn === "true";
    player.src = source; player.dataset.source = source; player.currentTime = 0; player.muted = !soundOn; player.volume = 1;
    const soundButton = viewer.querySelector("[data-reel-sound-toggle]");
    soundButton.textContent = soundOn ? "Silenciar" : "Ativar som";
    soundButton.setAttribute("aria-pressed", String(soundOn));
    soundButton.setAttribute("aria-label", soundOn ? "Silenciar vídeo" : "Ativar som");
    // A video URL is not an image and cannot be used as an <img> backdrop.
    // Keep the existing CSS gradient backdrop instead of rendering a broken image.
    viewer.querySelector("[data-reel-backdrop]").replaceChildren();
    viewer.querySelector("[data-reel-status]").textContent = "";
    if (autoplay) void player.play().catch(() => {
      viewer.querySelector("[data-reel-status]").textContent = "Toque em reproduzir para iniciar este vídeo.";
    });
  }
  const author = item.card.querySelector(".post-author");
  const authorTarget = viewer.querySelector("[data-reel-author]");
  authorTarget.replaceChildren(...(author ? [author.cloneNode(true)] : []));
  viewer.querySelector("[data-reel-caption]").textContent = item.card.querySelector(".post-body")?.textContent || "";
  const originalLike = item.card.querySelector("[data-toggle-like]");
  const like = viewer.querySelector("[data-reel-like]");
  like.setAttribute("aria-pressed", originalLike?.getAttribute("aria-pressed") || "false");
  like.querySelector("span").textContent = originalLike?.classList.contains("is-liked") ? "♥" : "♡";
  viewer.querySelector("[data-reel-like-count]").textContent = originalLike?.querySelector("span")?.textContent || "0";
  viewer.querySelector("[data-reel-comment-count]").textContent = item.card.querySelector(".post-comments h3 span")?.textContent || "0";
  const items = reelsItems(root), index = items.findIndex(candidate => candidate.key === key);
  viewer.querySelector("[data-reel-previous]").disabled = index <= 0;
  viewer.querySelector("[data-reel-next]").disabled = index < 0 || index >= items.length - 1;
  if (!viewer.querySelector("[data-reel-comments-panel]").hidden) copyReelComments(item, viewer);
  return true;
}
function closeReelsViewer(root) {
  const viewer = root.querySelector("[data-reels-viewer]");
  if (!viewer) return;
  const player = viewer.querySelector("[data-reel-active]");
  player.pause(); player.removeAttribute("src"); player.removeAttribute("data-source"); player.load();
  viewer.querySelector("[data-reel-backdrop]").replaceChildren();
  if (viewer.open) viewer.close(); else viewer.removeAttribute("open");
  viewer.dataset.reelKey = "";
  viewer.dataset.reelsSoundOn = "false";
  viewer.querySelector("[data-reel-comments-panel]").hidden = true;
  viewer.querySelector("[data-reel-status]").textContent = "";
  const feed = root.querySelector("[data-social-feed]");
  if (feed) bindFeedVideoAutoplay(root);
}
function bindReelsViewer(root) {
  if (!root || root.__looplyReelsBound) return;
  root.__looplyReelsBound = true;
  root.insertAdjacentHTML("beforeend", reelsViewerMarkup());
  const viewer = root.querySelector("[data-reels-viewer]");
  // Lazy-load the new vertical, scroll-snap viewer on explicit user interaction.
  // Keep the existing dialog available if the new module is unavailable.
  root.addEventListener("click", event => {
    const trigger = event.target.closest("[data-open-reel], [data-open-first-reel], [data-open-external-reel]");
    if (!trigger) return;
    const key = trigger.dataset.openReel || trigger.dataset.openExternalReel || root.querySelector("[data-feed-reel-id], [data-open-external-reel]")?.dataset.feedReelId || root.querySelector("[data-open-external-reel]")?.dataset.openExternalReel;
    if (!key) { event.preventDefault(); trigger.setAttribute("title", "Ainda não há vídeos disponíveis"); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    void import("./home-hybrid-reels.js").then(({ openHybridReels }) => openHybridReels(root, key)).catch(error => {
      console.error("Looply Reels viewer unavailable; opening legacy viewer", error);
      root.__looplyVideoAutoplayDispose?.();
      root.querySelectorAll("video[data-feed-video]").forEach(video => video.pause());
      try { viewer.showModal(); } catch { viewer.setAttribute("open", ""); }
      viewer.dataset.reelsSoundOn = "false";
      if (key.startsWith("external-")) {
        root.querySelector("[data-post-status]")?.replaceChildren(document.createTextNode("A visualização externa não está disponível agora."));
        if (viewer.open) viewer.close();
        bindFeedVideoAutoplay(root);
      } else renderReelViewer(root, key, true);
    });
  }, { capture: true });
  root.addEventListener("looply:reels-closed", () => bindFeedVideoAutoplay(root));
  const getCurrent = () => reelsItems(root).find(item => item.key === viewer.dataset.reelKey);
  const navigate = direction => {
    const items = reelsItems(root), index = items.findIndex(item => item.key === viewer.dataset.reelKey);
    const next = items[index + direction];
    if (next) renderReelViewer(root, next.key, true);
  };
  root.addEventListener("click", event => {
    const open = event.target.closest("[data-open-reel]");
    if (open) {
      const feed = root.querySelector("[data-social-feed]");
      root.__looplyVideoAutoplayDispose?.();
      feed?.__looplyVideoAutoplayDispose?.();
      feed?.querySelectorAll("video[data-feed-video]").forEach(video => video.pause());
      try { viewer.showModal(); } catch { viewer.setAttribute("open", ""); }
      viewer.dataset.reelsSoundOn = "false";
      renderReelViewer(root, open.dataset.openReel, true);
      return;
    }
    if (event.target.closest("[data-reel-close]")) { closeReelsViewer(root); return; }
    if (event.target.closest("[data-reel-toggle-play]")) {
      const player = viewer.querySelector("[data-reel-active]");
      if (player.paused) void player.play().catch(() => {}); else player.pause();
      const button = viewer.querySelector("[data-reel-toggle-play]");
      button.textContent = player.paused ? "▶" : "Ⅱ";
      button.setAttribute("aria-label", player.paused ? "Continuar vídeo" : "Pausar vídeo");
      return;
    }
    if (event.target.closest("[data-reel-previous]")) { navigate(-1); return; }
    if (event.target.closest("[data-reel-next]")) { navigate(1); return; }
    const current = getCurrent();
    if (!current) return;
    if (event.target.closest("[data-reel-like]")) { current.card.querySelector("[data-toggle-like]")?.click(); return; }
    if (event.target.closest("[data-reel-comments]")) {
      const panel = viewer.querySelector("[data-reel-comments-panel]");
      panel.hidden = !panel.hidden;
      viewer.querySelector("[data-reel-comments]").setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) copyReelComments(current, viewer);
      return;
    }
    if (event.target.closest("[data-reel-comments-close]")) {
      viewer.querySelector("[data-reel-comments-panel]").hidden = true;
      viewer.querySelector("[data-reel-comments]").setAttribute("aria-expanded", "false");
      return;
    }
    if (event.target.closest("[data-reel-share]")) { current.card.querySelector("[data-share-post]")?.click(); return; }
    if (event.target.closest("[data-reel-send]")) { current.card.querySelector("[data-share-in-app]")?.click(); return; }
    if (event.target.closest("[data-reel-sound-toggle]")) {
      const player = viewer.querySelector("[data-reel-active]");
      player.muted = !player.muted;
      viewer.dataset.reelsSoundOn = String(!player.muted);
      const button = viewer.querySelector("[data-reel-sound-toggle]");
      button.setAttribute("aria-pressed", String(!player.muted));
      button.setAttribute("aria-label", player.muted ? "Ativar som" : "Silenciar vídeo");
      button.textContent = player.muted ? "Ativar som" : "Silenciar";
      if (!player.muted) void player.play().catch(() => { button.textContent = "Toque para ativar o som"; });
    }
  });
  viewer.addEventListener("cancel", event => { event.preventDefault(); closeReelsViewer(root); });
  viewer.addEventListener("keydown", event => {
    if (event.key === "ArrowUp") { event.preventDefault(); navigate(1); }
    if (event.key === "ArrowDown") { event.preventDefault(); navigate(-1); }
  });
  let pointerStart = null;
  const player = viewer.querySelector("[data-reel-active]");
  const playToggle = viewer.querySelector("[data-reel-toggle-play]");
  player.addEventListener("play", () => { playToggle.textContent = "Ⅱ"; playToggle.setAttribute("aria-label", "Pausar vídeo"); viewer.querySelector("[data-reel-status]").textContent = ""; });
  player.addEventListener("pause", () => { playToggle.textContent = "▶"; playToggle.setAttribute("aria-label", "Continuar vídeo"); });
  player.addEventListener("pointerdown", event => { pointerStart = { x: event.clientX, y: event.clientY }; }, { passive: true });
  player.addEventListener("ended", () => { if (viewer.open && player.ended) navigate(1); });
  player.addEventListener("pointerup", event => {
    if (!pointerStart) return;
    const delta = event.clientY - pointerStart.y; pointerStart = null;
    if (Math.abs(delta) > 60) navigate(delta < 0 ? 1 : -1);
  }, { passive: true });
}
function refreshReelsViewer(root) {
  const viewer = root.querySelector("[data-reels-viewer]");
  if (viewer?.open && viewer.dataset.reelKey && !renderReelViewer(root, viewer.dataset.reelKey)) closeReelsViewer(root);
}

export function bindSocialEvents(root, client, getUserId, isAdmin = false) {
  bindReelsViewer(root);
  bindFeedVideoAutoplay(root);
  classifyFeedImages(root);
  void hydrateTikTokEmbeds(root);
  let previewUrls = [];
  const clearPreview = () => { previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; };
  const resetPreview = () => { clearPreview(); const node = root.querySelector("[data-post-preview]"); if (node) node.innerHTML = '<p class="post-preview-empty">Sua foto ou vídeo aparecerá aqui antes de publicar.</p>'; };
  root.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-composer]") || event.target.closest(".post-composer-heading")?.querySelector("[data-toggle-composer]");
    if (!toggle) return;
    const fields = root.querySelector("[data-composer-fields]");
    if (!fields) return;
    fields.hidden = !fields.hidden;
    toggle.setAttribute("aria-expanded", String(!fields.hidden));
    toggle.setAttribute("aria-label", fields.hidden ? "Abrir formulário de nova publicação" : "Fechar formulário de nova publicação");
    document.body.style.overflow = fields.hidden ? "" : "hidden";
    if (!fields.hidden) root.querySelector("[data-select-post-media]")?.focus({ preventScroll: true });
  });

  root.addEventListener("click", event => {
    if (event.target.closest("[data-select-post-media]")) { root.querySelector("#postFiles")?.click(); return; }
    const close = event.target.closest("[data-close-composer]");
    if (close) {
      resetPreview();
      const fields = root.querySelector("[data-composer-fields]");
      if (fields) fields.hidden = true;
      document.body.style.overflow = "";
      const toggle = root.querySelector("[data-toggle-composer]");
      toggle?.setAttribute("aria-expanded", "false");
      toggle?.focus({ preventScroll: true });
    }
    const commentsToggle = event.target.closest("[data-toggle-post-comments]");
    if (commentsToggle) {
      const card = commentsToggle.closest("[data-post-card]");
      const section = card?.querySelector(".post-comments");
      if (section) {
        section.dataset.commentsExpanded = String(section.dataset.commentsExpanded !== "true");
        commentsToggle.setAttribute("aria-expanded", section.dataset.commentsExpanded);
        if (section.dataset.commentsExpanded === "true") section.querySelector("textarea")?.focus({ preventScroll: true });
      }
    }
  });
  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && !root.querySelector("[data-composer-fields]")?.hidden) {
      event.preventDefault(); root.querySelector("[data-close-composer]")?.click();
    }
  });
  root.addEventListener("change", (event) => {
    if (event.target.matches("#postFiles")) {
      resetPreview();
      const preview = root.querySelector("[data-post-preview]");
      if (!preview) return;
      const files = [...event.target.files].slice(0, 8);
      if (!files.length) return;
      preview.replaceChildren();
      for (const file of files) {
        const isVideo = file.type.startsWith("video/");
        if (/\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type)) {
          const notice = document.createElement("span");
          notice.className = "post-heic-preview";
          notice.textContent = file.name + " · será convertido em JPEG ao publicar";
          preview.append(notice);
          continue;
        }
        const media = document.createElement(isVideo ? "video" : "img");
        const url = URL.createObjectURL(file);
        previewUrls.push(url);
        media.src = url;
        if (isVideo) { media.controls = true; media.muted = true; media.playsInline = true; media.preload = "metadata"; }
        else media.alt = file.name || "Pré-visualização da imagem";
        preview.append(media);
      }
    }
    if (event.target.matches("#postVisibility")) {
      const picker = root.querySelector("[data-recipient-picker]");
      if (picker) picker.hidden = event.target.value !== "selected";
    }
    if (event.target.matches('input[name="commentMedia"]')) {
      const label = root.querySelector(`label[for="${CSS.escape(event.target.id)}"] span`);
      if (label) label.textContent = event.target.files.length
        ? `${event.target.files.length} arquivo(s) selecionado(s) · até 4`
        : "Você pode escolher pela galeria ou câmera do celular.";
    }
  });

  root.addEventListener("click", event => {
    const step = event.target.closest("[data-carousel-step]");
    if (step) {
      const carousel = step.closest("[data-post-card]")?.querySelector("[data-feed-carousel]");
      if (!carousel) return;
      const current = Math.round(carousel.scrollLeft / Math.max(1, carousel.clientWidth));
      const target = Math.max(0, Math.min(carousel.children.length - 1, current + Number(step.dataset.carouselStep)));
      carousel.scrollTo({ left: target * carousel.clientWidth, behavior: "smooth" });
      return;
    }
    const edit = event.target.closest("[data-edit-post]");
    if (edit) {
      const form = edit.closest("[data-post-card]")?.querySelector("[data-post-edit-form]");
      if (!form) return;
      form.hidden = false;
      form.querySelector("textarea")?.focus({ preventScroll: true });
      return;
    }
    const cancel = event.target.closest("[data-cancel-post-edit]");
    if (cancel) {
      const form = cancel.closest("[data-post-edit-form]");
      form.querySelector("textarea").value = form.closest("[data-post-card]")?.querySelector(".post-body")?.textContent || "";
      form.hidden = true;
    }
  });
  root.addEventListener("submit", async event => {
    const form = event.target.closest("[data-post-edit-form]");
    if (!form || !client) return;
    event.preventDefault();
    if (form.dataset.submitting === "true") return;
    const postId = form.dataset.postEditForm;
    const userId = getUserId?.();
    if (!userId || !postId) return;
    const nextBody = form.querySelector("textarea").value;
    const storedBody = nextBody.trim() ? nextBody : null;
    const status = form.querySelector("[data-edit-status]");
    form.dataset.submitting = "true";
    form.querySelectorAll("button").forEach(button => button.disabled = true);
    try {
      const { data, error } = await client.from("posts").update({ body: storedBody })
        .eq("id", postId).eq("author_id", userId).select("id,body").single();
      if (error || !data || (data.body || null) !== storedBody) throw error || Error("post_caption_unconfirmed");
      await refreshSocialFeed(root, client, userId, isAdmin);
    } catch (error) {
      console.error("Looply post caption update failed", error);
      if (status) status.textContent = explainWriteError(error);
    } finally {
      form.dataset.submitting = "false";
      form.querySelectorAll("button").forEach(button => button.disabled = false);
    }
  });
  root.addEventListener("click", async (event) => {
    const editCommentButton = event.target.closest("[data-edit-comment]");
    if (editCommentButton && client) {
      const userId = getUserId?.();
      const commentId = editCommentButton.dataset.editComment;
      const article = editCommentButton.closest(".comment-item");
      if (!userId || !commentId || editCommentButton.disabled) return;
      const form = article?.querySelector("[data-comment-edit-form]");
      const textarea = form?.querySelector("textarea");
      const body = article?.querySelector("[data-comment-body]");
      if (!form || !textarea || !body) return;
      textarea.value = body.textContent || "";
      form.hidden = false;
      editCommentButton.hidden = true;
      textarea.focus();
      return;
    }
    const cancelEdit = event.target.closest("[data-cancel-comment-edit]");
    if (cancelEdit) {
      const article = cancelEdit.closest(".comment-item");
      const form = article?.querySelector("[data-comment-edit-form]");
      if (form) form.hidden = true;
      const editButton = article?.querySelector("[data-edit-comment]");
      if (editButton) editButton.hidden = false;
      return;
    }
    const deleteCommentButton = event.target.closest("[data-delete-comment]");
    if (deleteCommentButton && client) {
      const userId = getUserId?.();
      const commentId = deleteCommentButton.dataset.deleteComment;
      const article = deleteCommentButton.closest(".comment-item");
      if (!userId || !commentId || deleteCommentButton.disabled) return;
      if (!window.confirm("Excluir este comentário? As respostas vinculadas também serão removidas.")) return;
      deleteCommentButton.disabled = true;
      try {
        const thread = article?.closest(".comment-thread");
        const commentIds = article?.classList.contains("comment-reply")
          ? [commentId]
          : [...(thread?.querySelectorAll(".comment-item") || [])].map((item) => item.id.replace(/^comment-/, ""));
        const { data: media, error: mediaError } = await client.from("comment_media").select("storage_path").in("comment_id", commentIds);
        if (mediaError) throw mediaError;
        const { error } = await client.from("comments").delete().eq("id", commentId).eq("author_id", userId);
        if (error) throw error;
        const paths = (media || []).map((item) => item.storage_path).filter(Boolean);
        if (paths.length) {
          const { error: storageError } = await client.storage.from("looply-media").remove(paths);
          if (storageError) console.error("Looply comment media cleanup failed", storageError);
        }
        await refreshSocialFeed(root, client, userId, isAdmin);
      } catch (error) {
        console.error("Looply comment deletion failed", error);
        const status = article?.querySelector("[data-comment-status]");
        if (status) status.textContent = "Não foi possível excluir o comentário. Ele continua salvo; tente novamente.";
      } finally { deleteCommentButton.disabled = false; }
      return;
    }
    if (event.target.closest('[data-social-action="refresh"]')) refreshSocialFeed(root, client, getUserId?.(), isAdmin);
    const internalShare = event.target.closest("[data-share-in-app]");
    if (internalShare && client) {
      const postId = internalShare.dataset.shareInApp;
      const userId = getUserId?.();
      if (!postId || !userId || internalShare.disabled) return;
      internalShare.disabled = true;
      try {
        const { data: people, error } = await client.from("profiles")
          .select("id,username,display_name").neq("id", userId).order("username").limit(200);
        if (error) throw error;
        if (!people?.length) throw new Error("no-share-recipients");
        let dialog = root.querySelector("[data-share-dialog]");
        if (!dialog) {
          dialog = document.createElement("dialog");
          dialog.className = "social-share-dialog";
          dialog.dataset.shareDialog = "";
          root.append(dialog);
        }
        dialog.dataset.postId = postId;
        dialog.innerHTML = '<section class="social-share-dialog-card"><h2>Compartilhar no Looply</h2><label for="socialShareRecipient">Enviar publicação para</label><select id="socialShareRecipient" data-share-recipient>' +
          people.map((person) => '<option value="' + escapeHtml(person.id) + '">' + escapeHtml(person.display_name || person.username) + ' (@' + escapeHtml(person.username) + ')</option>').join("") +
          '</select><div class="social-share-dialog-actions"><button type="button" class="text-button" data-share-dialog-cancel>Cancelar</button><button type="button" class="primary-button compact-button" data-share-in-app-send>Continuar no chat</button></div></section>';
        if (!dialog.open) dialog.showModal();
      } catch (error) {
        console.error("Looply internal post sharing failed", error);
        const status = root.querySelector('[data-post-status="' + CSS.escape(postId) + '"]');
        if (status) status.textContent = error?.message === "no-share-recipients" ? "Não há outros usuários disponíveis para compartilhar." : explainWriteError(error);
      } finally { internalShare.disabled = false; }
      return;
    }
    if (event.target.closest("[data-share-dialog-cancel]")) {
      root.querySelector("[data-share-dialog]")?.close();
      return;
    }
    const sendInternalShare = event.target.closest("[data-share-in-app-send]");
    if (sendInternalShare && client) {
      const dialog = root.querySelector("[data-share-dialog]");
      const targetId = dialog?.querySelector("[data-share-recipient]")?.value;
      const postId = dialog?.dataset.postId;
      if (!targetId || !postId || sendInternalShare.disabled) return;
      sendInternalShare.disabled = true;
      try {
        const { data, error } = await client.functions.invoke("looply-chat", {
          body: { action: "share_post", mode: "share", targetId, postId }
        });
        if (error) throw error;
        if (!data?.conversationId || data.errorCode) throw new Error(data?.errorCode || "conversation_unavailable");
        dialog.close();
        window.location.href = "conversa.html?id=" + encodeURIComponent(data.conversationId);
      } catch (error) {
        console.error("Looply internal post share failed", error);
        const status = root.querySelector('[data-post-status="' + CSS.escape(postId) + '"]');
        if (status) status.textContent = explainWriteError(error);
      } finally { sendInternalShare.disabled = false; }
      return;
    }
    const privateReply = event.target.closest("[data-private-reply]");
    if (privateReply && client) {
      const authorId = privateReply.dataset.privateReply;
      const postId = privateReply.dataset.privatePost;
      if (!authorId || !postId || privateReply.disabled) return;
      const replyText = window.prompt("Escreva sua resposta privada à publicação:", "");
      if (replyText === null) return;
      if (!replyText.trim()) {
        const status = root.querySelector('[data-post-status="' + CSS.escape(postId) + '"]');
        if (status) status.textContent = "Escreva uma resposta antes de enviar.";
        return;
      }
      privateReply.disabled = true;
      try {
        const { data, error } = await client.functions.invoke("looply-chat", {
          body: { action: "share_post", mode: "private_reply", targetId: authorId, postId, body: replyText.trim() }
        });
        if (error) throw error;
        if (!data?.conversationId || data.errorCode) throw new Error(data?.errorCode || "conversation_unavailable");
        window.location.href = "conversa.html?id=" + encodeURIComponent(data.conversationId);
      } catch (error) {
        console.error("Looply private post reply failed", error);
        const status = root.querySelector('[data-post-status="' + CSS.escape(postId) + '"]');
        if (status) status.textContent = explainWriteError(error);
      } finally { privateReply.disabled = false; }
      return;
    }
    const likeButton = event.target.closest("[data-toggle-like]");
    if (likeButton && client) {
      const postId = likeButton.dataset.toggleLike;
      const userId = getUserId?.();
      if (!postId || !userId || likeButton.disabled) return;
      likeButton.disabled = true;
      try {
        if (likeButton.getAttribute("aria-pressed") === "true") {
          const { error } = await client.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
          if (error) throw error;
        } else {
          const { error } = await client.from("post_likes").upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
          if (error) throw error;
        }
        await refreshSocialFeed(root, client, userId, isAdmin);
      } catch (error) {
        console.error("Looply post like failed", error);
        const status = root.querySelector('[data-post-status="' + CSS.escape(postId) + '"]');
        if (status) status.textContent = explainWriteError(error);
      } finally { likeButton.disabled = false; }
      return;
    }
    const shareButton = event.target.closest("[data-share-post]");
    if (shareButton) {
      const postId = shareButton.dataset.sharePost;
      const url = new URL("home.html#post-" + encodeURIComponent(postId), window.location.href).href;
      try {
        if (navigator.share) await navigator.share({ title: "Publicação no Looply", url });
        else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
        else window.prompt("Copie o link da publicação", url);
        const status = root.querySelector('[data-post-status="' + CSS.escape(postId) + '"]');
        if (status) status.textContent = "Link pronto para compartilhar.";
      } catch (error) {
        if (error?.name !== "AbortError") {
          const status = root.querySelector('[data-post-status="' + CSS.escape(postId) + '"]');
          if (status) status.textContent = "Não foi possível compartilhar agora.";
        }
      }
      return;
    }
    const deleteButton = event.target.closest("[data-delete-post]");
    if (!deleteButton || !client) return;
    const userId = getUserId?.();
    if (!userId) return;
    deleteButton.disabled = true;
    try {
      const postId = deleteButton.dataset.deletePost;
      if (isAdmin && deleteButton.classList.contains("admin-content-delete")) {
        const { data, error } = await invokeAdminAction(client, { action: "delete_content", contentType: "post", contentId: postId, confirmDelete: true });
        if (error) throw error;
        if (data?.deleted !== true) throw new Error("admin_delete_not_confirmed");
        await refreshSocialFeed(root, client, userId, isAdmin);
        return;
      }
      const { data: media, error: mediaError } = await client.from("post_media").select("storage_path").eq("post_id", postId);
      if (mediaError) throw mediaError;
      const { data: commentMedia, error: commentMediaError } = await client.from("comment_media").select("storage_path").eq("post_id", postId);
      if (commentMediaError) throw commentMediaError;
      const paths = [...(media || []).map((item) => item.storage_path), ...(commentMedia || []).map((item) => item.storage_path)];
      if (paths.length) {
        const { error } = await client.storage.from("looply-media").remove(paths);
        if (error) throw error;
      }
      const { error } = await client.from("posts").delete().eq("id", postId).eq("author_id", userId);
      if (error) throw error;
      await refreshSocialFeed(root, client, userId, isAdmin);
    } catch (error) {
      console.error("Looply post deletion failed", error);
      const feedback = document.createElement("p");
      feedback.className = "social-message social-error";
      feedback.setAttribute("role", "alert");
      feedback.textContent = "Não foi possível excluir a publicação. Ela continua salva; tente novamente.";
      root.querySelector("[data-social-feed]")?.prepend(feedback);
    } finally {
      deleteButton.disabled = false;
    }
  });

  root.addEventListener("submit", async (event) => {
    const editForm = event.target.closest("[data-comment-edit-form]");
    if (!editForm || !client) return;
    event.preventDefault();
    const article = editForm.closest(".comment-item");
    const editButton = article?.querySelector("[data-edit-comment]");
    const userId = getUserId?.();
    const commentId = editButton?.dataset.editComment;
    const textarea = editForm.querySelector("textarea");
    const nextBody = textarea?.value.trim() || "";
    const status = article?.querySelector("[data-comment-status]");
    if (!userId || !commentId || !textarea) return;
    if (!nextBody || nextBody.length > 2000) {
      if (status) status.textContent = "O comentário deve ter entre 1 e 2.000 caracteres.";
      textarea.focus();
      return;
    }
    const saveButton = editForm.querySelector('[type="submit"]');
    if (saveButton?.disabled) return;
    if (saveButton) saveButton.disabled = true;
    if (editButton) editButton.disabled = true;
    try {
      const { error } = await client.from("comments").update({ body: nextBody }).eq("id", commentId).eq("author_id", userId);
      if (error) throw error;
      await refreshSocialFeed(root, client, userId, isAdmin);
    } catch (error) {
      console.error("Looply comment edit failed", error);
      if (status) status.textContent = "Não foi possível editar o comentário. Ele continua salvo; tente novamente.";
    } finally { if (saveButton) saveButton.disabled = false; if (editButton) editButton.disabled = false; }
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-social-post], form[data-social-comment]");
    if (!form || !client) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (form.dataset.submitting === "true") return;
    form.dataset.submitting = "true";
    form.querySelectorAll('button[type="submit"]').forEach(control => control.disabled = true);
    let createdPostId = null;
    let published = false;
    let createdCommentId = null;
    const uploadedPaths = [];
    try {
      const formData = new FormData(form);
      const body = String(formData.get("body") || "").trim();
      if (form.matches("[data-social-post]")) {
        setStatus(form, "Preparando arquivos...");
        const files = await selectedMedia(formData);
        const visibility = String(formData.get("visibility") || "public");
        let externalUrl = String(formData.get("externalUrl") || "").trim();
        if (!body && !externalUrl && !files.length) throw new Error("empty body");
        const parsedShare = !externalUrl ? extractExternalLinkFromText(body) : null;
        if (parsedShare?.url) externalUrl = parsedShare.url;
        // Preserve the entire caption, including hyperlinks, spaces, newlines
        // and emoji. Link detection may add an embed, but cannot rewrite text.
        const postBody = body ? String(formData.get("body") ?? "") : null;
        if (!["public", "private", "selected"].includes(visibility)) throw new Error("invalid visibility");
        if (externalUrl) {
          let parsed;
          try { parsed = new URL(externalUrl); } catch { throw new Error("unsupported external URL"); }
          if (parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "l.instagram.com") {
            const sharedTarget = parsed.searchParams.get("u");
            try { parsed = new URL(sharedTarget || ""); } catch { throw new Error("unsupported external URL"); }
          }
          const allowedHosts = ["instagram.com","www.instagram.com","m.instagram.com","tiktok.com","www.tiktok.com","vm.tiktok.com","youtube.com","www.youtube.com","m.youtube.com","youtu.be"];
          if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname.toLowerCase())) throw new Error("unsupported external URL");
          if (["instagram.com", "m.instagram.com"].includes(parsed.hostname.toLowerCase())) parsed.hostname = "www.instagram.com";
          externalUrl = parsed.href;
        }
        if (visibility === "selected") {
          const recipientIds = formData.getAll("recipientIds").map(String);
          if (recipientIds.length < 1 || recipientIds.length > 20) throw new Error("invalid recipients");
          const { data, error } = await client.rpc("create_selected_post", { p_body: postBody, p_recipient_ids: recipientIds });
          if (error) throw error;
          createdPostId = data;
        } else {
          const { data, error } = await client.rpc("v5_create_post", { p_body: postBody, p_visibility: visibility, p_external_url: externalUrl || null });
          if (error) throw error;
          createdPostId = data;
        }
        const altText = ""; // The removed extra field is not needed to describe the whole post.
        for (const [index, file] of files.entries()) {
          const extension = mediaExtensions.get(file.type);
          const mediaId = crypto.randomUUID();
          const path = `posts/${createdPostId}/${mediaId}.${extension}`;
          setStatus(form, `Enviando arquivo ${index + 1} de ${files.length}: 0%`);
          uploadedPaths.push(path);
          await uploadResumable(client, path, file, (percentage) => {
            setStatus(form, `Enviando arquivo ${index + 1} de ${files.length}: ${percentage}%`);
          });
          const { error: mediaError } = await client.rpc("v5_attach_post_media", {
            p_post_id: createdPostId,
            p_storage_path: path,
            p_kind: file.type.startsWith("video/") ? "video" : "image",
            p_mime_type: file.type,
            p_byte_size: file.size,
            p_alt_text: altText
          });
          if (mediaError) throw mediaError;
        }
        if (visibility === "selected" && externalUrl) {
          const { error: linkError } = await client.from("posts").update({ external_url: externalUrl }).eq("id", createdPostId);
          if (linkError) throw linkError;
        }
        // A successful object PUT is not a successful publication until every
        // attachment and the caption are readable again from the database.
        const [{ data: persistedPost, error: postReadError }, { data: persistedMedia, error: mediaReadError }] = await Promise.all([
          client.from("posts").select("id,body").eq("id", createdPostId).single(),
          client.from("post_media").select("storage_path").eq("post_id", createdPostId)
        ]);
        if (postReadError || mediaReadError || !persistedPost || (persistedPost.body || null) !== postBody ||
            (persistedMedia || []).length !== files.length || files.some((_, index) => !persistedMedia?.some(item => item.storage_path === uploadedPaths[index]))) {
          throw postReadError || mediaReadError || Error("post_persistence_unconfirmed");
        }
        if (uploadedPaths.length) {
          const { data: signedMedia, error: signError } = await client.storage.from("looply-media")
            .createSignedUrls(uploadedPaths, 300);
          if (signError || signedMedia?.length !== uploadedPaths.length ||
              signedMedia.some(item => !item?.signedUrl)) {
            throw signError || Error("post_media_not_readable");
          }
        }
        published = true;
        form.reset();
        const composerFields = root.querySelector("[data-composer-fields]");
        const composerToggle = root.querySelector("[data-toggle-composer]");
        if (composerFields) composerFields.hidden = true;
        document.body.style.overflow = "";
        resetPreview();
        if (composerToggle) { composerToggle.setAttribute("aria-expanded", "false"); composerToggle.setAttribute("aria-label", "Abrir formulário de nova publicação"); }
        const picker = root.querySelector("[data-recipient-picker]");
        if (picker) picker.hidden = true;
        // Wait for a successful Feed reread before displaying a published toast.
      } else {
        const postId = form.dataset.postId;
        const parentCommentId = form.dataset.parentCommentId || null;
        const files = selectedCommentMedia(formData);
        const { data: comment, error } = await client.from("comments").insert({ post_id: postId, author_id: getUserId?.(), parent_comment_id: parentCommentId, body }).select("id").single();
        if (error) throw error;
        createdCommentId = comment.id;
        for (const [index, file] of files.entries()) {
          const path = `comments/${postId}/${comment.id}/${crypto.randomUUID()}.${mediaExtensions.get(file.type)}`;
          setStatus(form, `Enviando anexo ${index + 1} de ${files.length}: 0%`);
          uploadedPaths.push(path);
          await uploadResumable(client, path, file, (percentage) => setStatus(form, `Enviando anexo ${index + 1} de ${files.length}: ${percentage}%`));
          const { error: mediaError } = await client.from("comment_media").insert({
            comment_id: comment.id, post_id: postId, author_id: getUserId?.(), storage_path: path, mime_type: file.type, byte_size: file.size
          });
          if (mediaError) throw mediaError;
        }
        form.reset();
        setStatus(form, parentCommentId ? "Sua resposta foi salva." : "Seu comentário foi salvo.");
      }
      const refreshed = await refreshSocialFeed(root, client, getUserId?.(), isAdmin);
      if (published) {
        setStatus(form, refreshed ? "Sua publicação foi salva e aparece no Feed." :
          "Publicação salva, mas o Feed não atualizou. Atualize a página para consultar.", !refreshed);
        if (refreshed) {
          const toast = document.createElement("p");
          toast.className = "looply-publish-toast";
          toast.setAttribute("role", "status");
          toast.textContent = "Publicado no Looply!";
          root.append(toast);
          setTimeout(() => toast.remove(), 3500);
        }
      }
    } catch (error) {
      if (createdPostId && !published) {
        if (uploadedPaths.length) {
          const { error: cleanupError } = await client.storage.from("looply-media").remove(uploadedPaths);
          if (cleanupError) console.error("Could not clean up uploaded media", cleanupError);
        }
        const { error: deleteError } = await client.from("posts").delete().eq("id", createdPostId);
        if (deleteError) console.error("Could not clean up partially created post", deleteError);
      }
      if (createdCommentId) {
        if (uploadedPaths.length) {
          const { error: cleanupError } = await client.storage.from("looply-media").remove(uploadedPaths);
          if (cleanupError) console.error("Could not clean up uploaded comment media", cleanupError);
        }
        const { error: deleteError } = await client.from("comments").delete().eq("id", createdCommentId);
        if (deleteError) console.error("Could not clean up partially created comment", deleteError);
      }
      setStatus(form, explainWriteError(error), true);
      if (button) button.disabled = false;
    } finally {
      form.dataset.submitting = "false";
      form.querySelectorAll('button[type="submit"]').forEach(control => control.disabled = false);
    }
  });
}

let realtimeChannel = null;
let realtimeUserId = null;
let refreshTimer = null;

export function setupSocialRealtime(client, userId, root, isAdmin = false) {
  if (!client || !userId) return;
  if (realtimeChannel && realtimeUserId === userId) return;
  if (realtimeChannel) client.removeChannel(realtimeChannel);
  realtimeUserId = userId;
  const status = root.querySelector("[data-realtime-status]");
  realtimeChannel = client
    .channel(`looply-social-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => scheduleRefresh(root, client, userId, isAdmin))
    .on("postgres_changes", { event: "*", schema: "public", table: "post_media" }, () => scheduleRefresh(root, client, userId, isAdmin))
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => scheduleRefresh(root, client, userId, isAdmin))
    .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, () => scheduleRefresh(root, client, userId, isAdmin))
    .on("postgres_changes", { event: "*", schema: "public", table: "comment_media" }, () => scheduleRefresh(root, client, userId, isAdmin))
    .subscribe((state) => {
      const currentStatus = root.querySelector("[data-realtime-status]");
      if (!currentStatus) return;
      currentStatus.textContent = state === "SUBSCRIBED" ? "Atualizações ao vivo" : "Reconectando atualizações...";
    });
}

function scheduleRefresh(root, client, userId, isAdmin = false) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshSocialFeed(root, client, userId, isAdmin), 350);
}

export function disposeSocialRealtime(client) {
  clearTimeout(refreshTimer);
  if (realtimeChannel && client) client.removeChannel(realtimeChannel);
  realtimeChannel = null;
  realtimeUserId = null;
}
