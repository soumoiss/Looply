function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

export async function loadArchiveMedia(client) {
  const { data: media, error } = await client.from("archive_media")
    .select("id,source_path,file_name,description,storage_path,kind,mime_type,byte_size,visibility,created_at")
    .order("source_path", { ascending: true }).limit(500);
  if (error) throw error;
  const rows = media || [];
  if (!rows.length) return [];
  const [{ data: comments, error: commentError }, { data: signed, error: signedError }] = await Promise.all([
    client.from("archive_media_comments")
      .select("id,media_id,author_id,body,created_at,author:profiles!archive_media_comments_author_id_fkey(username,display_name)")
      .in("media_id", rows.map((item) => item.id)).order("created_at", { ascending: true }).limit(1000),
    client.storage.from("looply-media").createSignedUrls(rows.map((item) => item.storage_path), 1800)
  ]);
  if (commentError) throw commentError;
  const commentMap = new Map();
  for (const comment of comments || []) {
    const list = commentMap.get(comment.media_id) || [];
    list.push(comment);
    commentMap.set(comment.media_id, list);
  }
  return rows.map((item, index) => ({
    ...item,
    signedUrl: signedError ? null : signed?.[index]?.signedUrl || null,
    comments: commentMap.get(item.id) || []
  }));
}

export function archiveGalleryMarkup(media) {
  const tiles = media.map((item) => {
    const title = escapeHtml(item.file_name || item.source_path);
    const url = escapeHtml(item.signedUrl || "");
    const preview = item.kind === "image" && item.signedUrl && !item.mime_type.includes("heic")
      ? `<img src="${url}" alt="${title}" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="archive-media-placeholder">${item.kind === "video" ? "Vídeo" : item.kind === "audio" ? "Áudio" : "Imagem"}</span>`;
    return `<button class="archive-media-tile" type="button" data-open-archive-media="${escapeHtml(item.id)}" aria-label="Abrir ${title}">
      ${preview}<span class="archive-media-caption"><strong>${title}</strong><small>${escapeHtml(item.kind)} · ${escapeHtml(formatDate(item.created_at))}</small></span></button>`;
  }).join("");
  return `<section class="archive-media-library" aria-labelledby="archiveMediaTitle">
    <div class="archive-media-heading"><div><span class="section-kicker">Acervo</span><h2 id="archiveMediaTitle">Mídias antigas</h2></div><span data-archive-media-count>${media.length} arquivo(s)</span></div>
    ${media.length ? `<div class="archive-media-grid" data-archive-media-grid>${tiles}</div>` : `<p class="archive-media-empty">O acervo ainda não foi importado.</p>`}
    <div class="archive-viewer" data-archive-viewer aria-hidden="true" inert>
      <div class="archive-viewer-backdrop" data-archive-viewer-close></div>
      <section class="archive-viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="archiveViewerTitle">
        <header class="archive-viewer-header"><div><h2 id="archiveViewerTitle" data-archive-viewer-title></h2><span data-archive-viewer-meta></span></div>
          <div class="archive-viewer-actions"><button type="button" data-viewer-previous aria-label="Mídia anterior">‹</button><button type="button" data-viewer-next aria-label="Próxima mídia">›</button><button type="button" data-viewer-fullscreen>Expandir</button><button type="button" data-archive-viewer-close aria-label="Fechar visualização">×</button></div>
        </header>
      <p class="archive-viewer-description" data-archive-viewer-description hidden></p>
      <div class="archive-viewer-layout"><div class="archive-viewer-stage" data-archive-viewer-stage>
          <div class="archive-viewer-controls"><button type="button" data-media-zoom="out" aria-label="Diminuir zoom">−</button><button type="button" data-media-zoom="reset">Ajustar</button><button type="button" data-media-zoom="in" aria-label="Aumentar zoom">+</button></div>
          <div class="archive-viewer-content" data-archive-viewer-content></div>
        </div>
        <aside class="archive-viewer-comments"><h3>Comentários <span data-viewer-comment-count>0</span></h3><div class="archive-viewer-comment-list" data-viewer-comments></div>
          <form class="archive-media-comment-form" data-archive-media-comment><label for="archiveMediaCommentBody">Adicionar comentário</label><textarea id="archiveMediaCommentBody" name="body" maxlength="2000" required placeholder="Escreva um comentário"></textarea><button class="primary-button compact-button" type="submit">Comentar</button><span class="form-status" data-status role="status" aria-live="polite"></span></form>
        </aside></div>
      </section>
    </div>
  </section>`;
}

function commentsMarkup(comments) {
  if (!comments.length) return `<p class="archive-media-empty">Ainda não há comentários.</p>`;
  return comments.map((item) => `<article class="archive-media-comment"><div><strong>${escapeHtml(item.author?.display_name || item.author?.username || "Membro")}</strong><time datetime="${escapeHtml(item.created_at)}">${escapeHtml(formatDate(item.created_at))}</time></div><p>${escapeHtml(item.body)}</p></article>`).join("");
}

function mediaContent(item) {
  if (!item.signedUrl) return `<p class="archive-media-unavailable">Arquivo temporariamente indisponível.</p>`;
  const url = escapeHtml(item.signedUrl);
  const title = escapeHtml(item.file_name || item.source_path);
  if (item.kind === "video") return `<video src="${url}" controls playsinline preload="metadata" aria-label="${title}"></video>`;
  if (item.kind === "audio") return `<div class="archive-audio-player"><span>${title}</span><audio src="${url}" controls preload="metadata" aria-label="${title}"></audio></div>`;
  if (item.mime_type.includes("heic")) return `<a class="archive-heic-link" href="${url}" target="_blank" rel="noopener noreferrer">Abrir ou baixar ${title}</a>`;
  return `<img class="archive-zoom-image" data-zoom-image src="${url}" alt="${title}" draggable="false" referrerpolicy="no-referrer">`;
}

function setCommentStatus(form, message, kind = "") {
  const status = form.querySelector("[data-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

export function bindArchiveGallery(root, client, user, media, profile = user) {
  const state = { media: [...media], activeId: null, zoom: 1, panX: 0, panY: 0, dragging: null, channel: null };
  const viewer = root.querySelector("[data-archive-viewer]");
  const viewerContent = root.querySelector("[data-archive-viewer-content]");
  const stage = root.querySelector("[data-archive-viewer-stage]");
  const current = () => state.media.find((item) => item.id === state.activeId);

  function applyZoom() {
    const image = viewerContent?.querySelector("[data-zoom-image]");
    if (!image) return;
    image.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    image.style.cursor = state.zoom > 1 ? "grab" : "zoom-in";
  }

  function renderComments(item) {
    const list = root.querySelector("[data-viewer-comments]");
    const count = root.querySelector("[data-viewer-comment-count]");
    if (list) list.innerHTML = commentsMarkup(item.comments || []);
    if (count) count.textContent = String((item.comments || []).length);
  }

  function show(item) {
    if (!item || !viewer) return;
    state.activeId = item.id;
    state.zoom = 1; state.panX = 0; state.panY = 0; state.dragging = null;
    root.querySelector("[data-archive-viewer-title]").textContent = item.file_name || item.source_path;
    root.querySelector("[data-archive-viewer-meta]").textContent = `${item.kind} · ${formatDate(item.created_at)}`;
    const description = root.querySelector("[data-archive-viewer-description]");
    if (description) {
      description.textContent = item.description || "";
      description.hidden = !item.description;
    }
    if (viewerContent) viewerContent.innerHTML = mediaContent(item);
    renderComments(item);
    const commentForm = root.querySelector("[data-archive-media-comment]");
    if (commentForm) commentForm.dataset.mediaId = item.id;
    viewer.classList.add("is-open");
    viewer.setAttribute("aria-hidden", "false");
    viewer.removeAttribute("inert");
    document.body.classList.add("modal-open");
    root.querySelector("[data-viewer-previous]").disabled = state.media.findIndex((entry) => entry.id === item.id) <= 0;
    root.querySelector("[data-viewer-next]").disabled = state.media.findIndex((entry) => entry.id === item.id) >= state.media.length - 1;
    applyZoom();
  }

  function close() {
    if (!viewer) return;
    viewer.classList.remove("is-open");
    viewer.setAttribute("aria-hidden", "true");
    viewer.setAttribute("inert", "");
    document.body.classList.remove("modal-open");
    state.activeId = null;
  }

  function refreshTiles(nextMedia) {
    const activeId = state.activeId;
    state.media = [...nextMedia];
    const replacement = document.createElement("div");
    replacement.innerHTML = archiveGalleryMarkup(state.media);
    const nextLibrary = replacement.firstElementChild;
    const currentLibrary = root.querySelector(".archive-media-library");
    const currentGrid = currentLibrary?.querySelector("[data-archive-media-grid]");
    const nextGrid = nextLibrary?.querySelector("[data-archive-media-grid]");

    if (currentGrid && nextGrid) currentGrid.replaceWith(nextGrid);
    else if (currentGrid && !nextGrid) currentGrid.replaceWith(nextLibrary.querySelector(".archive-media-empty"));
    else if (!currentGrid && nextGrid) currentLibrary?.querySelector(".archive-media-empty")?.replaceWith(nextGrid);

    const count = currentLibrary?.querySelector("[data-archive-media-count]");
    if (count) count.textContent = `${state.media.length} arquivo(s)`;
    const active = activeId ? current() : null;
    if (active) {
      renderComments(active);
      const content = viewerContent?.firstElementChild;
      if (active.signedUrl && content && content.getAttribute("src") !== active.signedUrl) {
        content.setAttribute("src", active.signedUrl);
        content.load?.();
        applyZoom();
      }
      root.querySelector("[data-viewer-previous]").disabled = state.media.findIndex((entry) => entry.id === active.id) <= 0;
      root.querySelector("[data-viewer-next]").disabled = state.media.findIndex((entry) => entry.id === active.id) >= state.media.length - 1;
    } else if (activeId) {
      close();
    }
  }

  root.addEventListener("click", (event) => {
    const open = event.target.closest("[data-open-archive-media]");
    if (open) { show(state.media.find((item) => item.id === open.dataset.openArchiveMedia)); return; }
    if (event.target.closest("[data-archive-viewer-close]")) { close(); return; }
    const zoomButton = event.target.closest("[data-media-zoom]");
    if (zoomButton) {
      const action = zoomButton.dataset.mediaZoom;
      if (action === "in") state.zoom = Math.min(5, state.zoom + 0.25);
      else if (action === "out") state.zoom = Math.max(1, state.zoom - 0.25);
      else { state.zoom = 1; state.panX = 0; state.panY = 0; }
      applyZoom(); return;
    }
    if (event.target.closest("[data-viewer-fullscreen]")) {
      stage?.requestFullscreen?.().catch((error) => console.warn("Fullscreen unavailable", error));
      return;
    }
    const nav = event.target.closest("[data-viewer-previous], [data-viewer-next]");
    if (nav) {
      const index = state.media.findIndex((item) => item.id === state.activeId);
      show(state.media[index + (nav.matches("[data-viewer-previous]") ? -1 : 1)]);
    }
  });

  stage?.addEventListener("wheel", (event) => {
    if (!viewer?.classList.contains("is-open") || !viewerContent?.querySelector("[data-zoom-image]")) return;
    event.preventDefault();
    state.zoom = Math.max(1, Math.min(5, state.zoom + (event.deltaY < 0 ? 0.1 : -0.1)));
    applyZoom();
  }, { passive: false });
  stage?.addEventListener("pointerdown", (event) => {
    if (state.zoom <= 1 || !event.target.matches("[data-zoom-image]")) return;
    state.dragging = { x: event.clientX - state.panX, y: event.clientY - state.panY };
    stage.setPointerCapture(event.pointerId);
  });
  stage?.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    state.panX = event.clientX - state.dragging.x;
    state.panY = event.clientY - state.dragging.y;
    applyZoom();
  });
  stage?.addEventListener("pointerup", () => { state.dragging = null; });
  stage?.addEventListener("pointercancel", () => { state.dragging = null; });

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && viewer?.classList.contains("is-open")) close();
    if (!viewer?.classList.contains("is-open")) return;
    if (event.key === "ArrowLeft") root.querySelector("[data-viewer-previous]")?.click();
    if (event.key === "ArrowRight") root.querySelector("[data-viewer-next]")?.click();
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-archive-media-comment]");
    if (!form) return;
    event.preventDefault();
    const body = String(new FormData(form).get("body") || "").trim();
    const button = form.querySelector('button[type="submit"]');
    if (!body || body.length > 2000) { setCommentStatus(form, "Escreva um comentário de até 2.000 caracteres.", "error"); return; }
    if (button) button.disabled = true;
    try {
      const mediaId = form.dataset.mediaId;
      const { data, error } = await client.from("archive_media_comments").insert({ media_id: mediaId, author_id: user.id, body })
        .select("id,media_id,author_id,body,created_at").single();
      if (error) throw error;
      const item = current();
      if (item?.id === mediaId) {
        item.comments.push({ ...data, author: { username: profile.username, display_name: profile.display_name } });
        renderComments(item);
      }
      form.reset();
      setCommentStatus(form, "Comentário salvo na nuvem.", "success");
    } catch (error) {
      console.error("Looply archive media comment failed", error);
      setCommentStatus(form, "O comentário não foi salvo. Confira a conexão e as permissões.", "error");
    } finally { if (button) button.disabled = false; }
  });

  const status = root.querySelector("[data-archive-media-count]");
  if (status) status.textContent = `${state.media.length} arquivo(s)`;
  state.channel = client.channel(`looply-archive-media-${user.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "archive_media" }, async () => {
      try { refreshTiles(await loadArchiveMedia(client)); } catch (error) { console.error("Looply archive media refresh failed", error); }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "archive_media_comments" }, async (payload) => {
      const item = current();
      if (!item || item.id !== payload.new.media_id) return;
      try {
        const { data, error } = await client.from("archive_media_comments")
          .select("id,media_id,author_id,body,created_at,author:profiles!archive_media_comments_author_id_fkey(username,display_name)")
          .eq("media_id", item.id).order("created_at", { ascending: true }).limit(100);
        if (error) throw error;
        item.comments = data || [];
        renderComments(item);
      } catch (error) { console.error("Looply archive comments refresh failed", error); }
    })
    .subscribe();
  window.addEventListener("pagehide", () => { if (state.channel) client.removeChannel(state.channel); }, { once: true });
}
