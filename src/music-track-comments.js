function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function commentElement(comment) {
  const article = document.createElement("article");
  article.className = "youtube-track-comment";
  const body = document.createElement("p");
  body.textContent = comment.body || "";
  const time = document.createElement("time");
  const date = new Date(comment.created_at);
  time.textContent = Number.isNaN(date.valueOf())
    ? ""
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  article.append(body, time);
  return article;
}

export function bindMusicTrackComments(root, client) {
  const playlist = root.querySelector("[data-youtube-playlist]");
  const list = playlist?.querySelector("[data-youtube-track-list]");
  const dialog = playlist?.querySelector("[data-youtube-track-dialog]");
  const dialogPlayer = dialog?.querySelector("[data-youtube-dialog-player]");
  const dialogTitle = dialog?.querySelector("[data-youtube-dialog-title]");
  const dialogChannel = dialog?.querySelector("[data-youtube-dialog-channel]");
  if (!playlist || !list || !dialog || !client) return;

  let activeTrack = null;
  let loadVersion = 0;
  let saving = false;

  let panel = dialog.querySelector("[data-youtube-track-comments]");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "youtube-track-comments";
    panel.dataset.youtubeTrackComments = "";
    panel.setAttribute("aria-label", "Comentários desta música");
    panel.innerHTML = `
      <h3>Comentários desta música</h3>
      <div class="youtube-track-comment-list" data-youtube-track-comment-list><p class="music-empty">Selecione uma música para ver os comentários.</p></div>
      <form class="youtube-track-comment-form" data-youtube-track-comment-form>
        <label class="visually-hidden" for="youtubeTrackCommentBody">Comentário sobre esta música</label>
        <textarea id="youtubeTrackCommentBody" name="body" maxlength="2000" rows="2" required placeholder="Comentar esta música"></textarea>
        <button class="primary-button compact-button" type="submit">Salvar comentário</button>
        <span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>`;
    dialog.append(panel);
  }
  const commentsList = panel.querySelector("[data-youtube-track-comment-list]");
  const form = panel.querySelector("[data-youtube-track-comment-form]");
  const bodyInput = form?.querySelector('textarea[name="body"]');
  const submitButton = form?.querySelector('button[type="submit"]');
  const status = form?.querySelector("[data-status]");

  const decorateTracks = () => {
    list.querySelectorAll("li").forEach((item) => {
      const trackButton = item.querySelector("[data-youtube-track]");
      if (!trackButton || item.querySelector("[data-youtube-comment-open]")) return;
      item.classList.add("youtube-track-item");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "youtube-track-comment-open";
      button.dataset.youtubeCommentOpen = trackButton.dataset.youtubeTrack || "";
      button.textContent = "Comentário";
      const title = item.querySelector(".youtube-track-copy strong")?.textContent || "esta música";
      button.setAttribute("aria-label", "Abrir comentários de " + title);
      item.append(button);
    });
  };

  const loadComments = async (track) => {
    activeTrack = track;
    const version = ++loadVersion;
    if (commentsList) commentsList.innerHTML = '<p class="music-empty">Carregando comentários…</p>';
    if (status) { status.textContent = ""; status.dataset.kind = ""; }
    try {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData?.user) throw new Error("sign-in-required");
      const { data, error } = await client.from("music_track_comments")
        .select("id,body,created_at")
        .eq("track_key", "youtube:" + track.videoId)
        .eq("author_id", authData.user.id)
        .order("created_at", { ascending: true }).limit(100);
      if (error) throw error;
      if (version !== loadVersion || activeTrack?.videoId !== track.videoId || !commentsList) return;
      commentsList.replaceChildren();
      const comments = data || [];
      if (!comments.length) {
        const empty = document.createElement("p");
        empty.className = "music-empty";
        empty.textContent = "Nenhum comentário salvo para esta música.";
        commentsList.append(empty);
      } else comments.forEach((comment) => commentsList.append(commentElement(comment)));
    } catch (error) {
      console.error("Looply track comments load failed", error);
      if (version === loadVersion && commentsList) {
        const message = document.createElement("p");
        message.className = "music-empty";
        message.setAttribute("role", "alert");
        message.textContent = "Não foi possível carregar os comentários desta música.";
        commentsList.replaceChildren(message);
      }
    }
  };

  const openComments = (videoId, play = false) => {
    const trackButton = list.querySelector('[data-youtube-track="' + CSS.escape(videoId) + '"]');
    const track = {
      videoId,
      title: trackButton?.querySelector(".youtube-track-copy strong")?.textContent || "Música",
      channel: trackButton?.querySelector(".youtube-track-copy small")?.textContent || ""
    };
    if (dialogTitle) dialogTitle.textContent = track.title;
    if (dialogChannel) dialogChannel.textContent = track.channel;
    if (dialogPlayer) {
      dialogPlayer.title = "Reprodutor: " + track.title;
      if (!play) dialogPlayer.removeAttribute("src");
    }
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    void loadComments(track);
  };

  decorateTracks();
  const observer = new MutationObserver(decorateTracks);
  observer.observe(list, { childList: true, subtree: true });

  list.addEventListener("click", (event) => {
    const commentButton = event.target.closest("[data-youtube-comment-open]");
    if (commentButton) {
      event.preventDefault();
      event.stopPropagation();
      openComments(commentButton.dataset.youtubeCommentOpen, false);
      return;
    }
    const trackButton = event.target.closest("[data-youtube-track]");
    if (!trackButton) return;
    const videoId = trackButton.dataset.youtubeTrack;
    window.setTimeout(() => openComments(videoId, true), 0);
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = String(bodyInput?.value || "").trim();
    if (!activeTrack || !body || body.length > 2000 || saving) {
      if (status) { status.textContent = "Escreva um comentário de até 2.000 caracteres."; status.dataset.kind = "error"; }
      return;
    }
    saving = true;
    if (submitButton) submitButton.disabled = true;
    if (status) { status.textContent = "Salvando…"; status.dataset.kind = "info"; }
    try {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData?.user) throw new Error("sign-in-required");
      const { error } = await client.from("music_track_comments").insert({
        track_key: "youtube:" + activeTrack.videoId,
        track_title: activeTrack.title.slice(0, 160),
        body
      });
      if (error) throw error;
      bodyInput.value = "";
      if (status) { status.textContent = "Comentário salvo nesta música."; status.dataset.kind = "success"; }
      await loadComments(activeTrack);
      if (status) { status.textContent = "Comentário salvo nesta música."; status.dataset.kind = "success"; }
    } catch (error) {
      console.error("Looply track comment save failed", error);
      if (status) { status.textContent = "Não foi possível salvar o comentário. Tente novamente."; status.dataset.kind = "error"; }
    } finally {
      saving = false;
      if (submitButton) submitButton.disabled = false;
    }
  });

  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
}
