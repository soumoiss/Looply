const playlists = Object.freeze({
  misol: "PLUZFdmgmipvI",
  yara: "PLCn4CAsA_tiM",
  patati: "PLE0tcB0gaSzM",
  peixinho: "PLD5PXwJcU-Sg"
});
const fallbackPlaylist = "PLMeQ_QyqhY7s";
const playlistItemsEndpoint = "https://www.googleapis.com/youtube/v3/playlistItems";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function playlistIdFor(username) {
  const key = String(username || "").trim().toLowerCase();
  return playlists[key] || fallbackPlaylist;
}

export function playlistMarkup(profile) {
  const id = playlistIdFor(profile.username);
  const title = escapeHtml(profile.display_name || profile.username || "Usuário");
  const embed = `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(id)}&listType=playlist`;
  return `<section class="panel youtube-playlist" aria-labelledby="youtubePlaylistTitle" data-youtube-playlist="${escapeHtml(id)}">
    <div class="eyebrow">Playlist de ${title}</div><h2 id="youtubePlaylistTitle">Playlist</h2>
    <div class="youtube-playlist-layout">
      <iframe class="youtube-playlist-player" src="${embed}" title="Playlist de ${title}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
      <section class="youtube-track-panel" aria-label="Lista de músicas">
        <div class="youtube-track-heading"><h3>Músicas</h3><span data-youtube-track-count></span></div>
        <label class="visually-hidden" for="youtubeTrackSearch">Buscar na playlist</label>
        <input id="youtubeTrackSearch" class="youtube-track-search" type="search" maxlength="100" placeholder="Buscar música" data-youtube-track-search>
        <p class="youtube-track-status" data-youtube-track-status role="status" aria-live="polite">Carregando músicas…</p>
        <ol class="youtube-track-list" data-youtube-track-list aria-label="Faixas da playlist"></ol>
      </section>
    </div>
    <dialog class="youtube-track-dialog" data-youtube-track-dialog aria-labelledby="youtubeTrackDialogTitle">
      <div class="youtube-track-dialog-heading"><div><span class="section-kicker">Playlist</span><h2 id="youtubeTrackDialogTitle" data-youtube-dialog-title></h2><p data-youtube-dialog-channel></p></div>
        <button class="youtube-track-dialog-close" type="button" data-youtube-dialog-close aria-label="Fechar reprodutor">×</button></div>
      <iframe class="youtube-track-dialog-player" data-youtube-dialog-player title="Reprodutor de música" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </dialog>
  </section>`;
}

function playlistApiKey() {
  return String(window.LOOPLY_CONFIG?.youtubeApiKey || "").trim();
}

const playlistCachePrefix = "looply.youtube-playlist.v1.";
const playlistCacheMaxAge = 12 * 60 * 60 * 1000;

export function youtubeApiErrorMessage(status, data = {}) {
  const reason = String(data?.error?.errors?.[0]?.reason || "").toLowerCase();
  const apiMessage = String(data?.error?.message || "").toLowerCase();
  if (["quotaexceeded", "dailylimitexceeded", "ratelimitexceeded", "userratelimitexceeded"].includes(reason)) {
    return "A cota diária da YouTube Data API foi atingida. A lista salva continua disponível; tente novamente após a renovação da cota.";
  }
  if (["keyinvalid", "iprefererblocked", "refererblocked", "forbidden"].includes(reason) || /api key|referer|referrer/.test(apiMessage)) {
    return "A chave da YouTube Data API foi recusada para este domínio. Confira LOOPLY_YOUTUBE_API_KEY no projeto Vercel desta prévia e permita o domínio de implantação nas restrições HTTP da chave.";
  }
  if (["accessnotconfigured", "youtubesignuprequired"].includes(reason)) {
    return "Ative a YouTube Data API v3 no projeto Google Cloud vinculado à chave e gere um novo deployment.";
  }
  if (status === 400) return "O YouTube recusou o identificador desta playlist. Confira o ID configurado para este perfil.";
  if (status === 401) return "A chave da YouTube Data API é inválida. Atualize LOOPLY_YOUTUBE_API_KEY no Vercel e gere um novo deployment.";
  return `A YouTube Data API respondeu com erro HTTP ${Number(status) || "desconhecido"}. O player incorporado continua disponível.`;
}

function readPlaylistCache(playlistId) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(`${playlistCachePrefix}${playlistId}`) || "null");
    if (!Array.isArray(cached?.tracks) || !Number.isFinite(cached?.savedAt)) return null;
    return cached;
  } catch {
    return null;
  }
}

function writePlaylistCache(playlistId, tracks) {
  try {
    sessionStorage.setItem(`${playlistCachePrefix}${playlistId}`, JSON.stringify({ savedAt: Date.now(), tracks }));
  } catch {
    // Storage is optional: the current page still renders the tracks.
  }
}

export async function fetchPlaylistItems(playlistId, apiKey, fetchImpl = globalThis.fetch) {
  const items = [];
  let pageToken = "";
  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "50",
      key: apiKey
    });
    if (pageToken) params.set("pageToken", pageToken);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetchImpl(`${playlistItemsEndpoint}?${params}`, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("youtube-playlist-timeout");
      throw new Error("youtube-playlist-network-error");
    } finally {
      clearTimeout(timeout);
    }
    let data = {};
    try { data = await response.json(); } catch { /* The status below provides the actionable failure. */ }
    if (!response.ok) throw new Error(youtubeApiErrorMessage(response.status, data));
    for (const item of Array.isArray(data.items) ? data.items : []) {
      const videoId = String(item?.snippet?.resourceId?.videoId || "");
      const title = String(item?.snippet?.title || "").trim();
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !title || title === "Private video" || title === "Deleted video") continue;
      items.push({
        videoId,
        title,
        channel: String(item?.snippet?.videoOwnerChannelTitle || item?.snippet?.channelTitle || ""),
        position: Number.isInteger(item?.snippet?.position) ? item.snippet.position : items.length,
        thumbnail: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`
      });
    }
    pageToken = String(data.nextPageToken || "");
    if (!pageToken) return items;
  }
  throw new Error("youtube-playlist-too-large");
}

function trackMarkup(track, index) {
  const number = String(index + 1);
  return `<li><button class="youtube-track" type="button" data-youtube-track="${escapeHtml(track.videoId)}" aria-pressed="false">
    <span class="youtube-track-number">${number}</span><img src="${escapeHtml(track.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">
    <span class="youtube-track-copy"><strong>${escapeHtml(track.title)}</strong>${track.channel ? `<small>${escapeHtml(track.channel)}</small>` : ""}</span>
    <span class="youtube-track-play" aria-hidden="true">▶</span>
  </button></li>`;
}

export async function bindYouTubePlaylist(root) {
  const playlist = root.querySelector("[data-youtube-playlist]");
  const list = playlist?.querySelector("[data-youtube-track-list]");
  const status = playlist?.querySelector("[data-youtube-track-status]");
  const search = playlist?.querySelector("[data-youtube-track-search]");
  const count = playlist?.querySelector("[data-youtube-track-count]");
  const player = playlist?.querySelector(".youtube-playlist-player");
  const dialog = playlist?.querySelector("[data-youtube-track-dialog]");
  const dialogPlayer = dialog?.querySelector("[data-youtube-dialog-player]");
  const dialogTitle = dialog?.querySelector("[data-youtube-dialog-title]");
  const dialogChannel = dialog?.querySelector("[data-youtube-dialog-channel]");
  if (!playlist || !list || !status || !player) return;

  const playlistId = playlist.dataset.youtubePlaylist;
  const apiKey = playlistApiKey();
  let tracks = [];
  let loading = false;
  const cached = readPlaylistCache(playlistId);
  const render = () => {
    const query = String(search?.value || "").trim().toLocaleLowerCase("pt-BR");
    const filtered = tracks.filter((track) => `${track.title} ${track.channel}`.toLocaleLowerCase("pt-BR").includes(query));
    list.innerHTML = filtered.map((track) => trackMarkup(track, track.position)).join("");
    if (count) count.textContent = `${tracks.length}`;
    if (query && !filtered.length) status.textContent = `Nenhuma música corresponde a “${search.value.trim()}”.`;
    else if (tracks.length) status.textContent = query ? `${filtered.length} de ${tracks.length} músicas` : `${tracks.length} músicas na playlist`;
    else status.textContent = "";
  };
  const showStatus = (message, retry = false) => {
    status.replaceChildren(document.createTextNode(message));
    if (retry) {
      const button = document.createElement("button");
      button.className = "text-button youtube-playlist-retry";
      button.type = "button";
      button.dataset.youtubeRetry = "";
      button.textContent = "Tentar novamente";
      status.append(" ", button);
    }
  };
  const load = async ({ retry = false } = {}) => {
    if (loading) return;
    if (!apiKey) {
      showStatus(tracks.length
        ? `${tracks.length} músicas da última consulta. Configure LOOPLY_YOUTUBE_API_KEY no projeto Vercel que publica esta URL para atualizar a playlist.`
        : "Configure LOOPLY_YOUTUBE_API_KEY no projeto Vercel que publica esta URL; sem ela, o YouTube não fornece os títulos da playlist. O player incorporado continua disponível.", true);
      return;
    }
    loading = true;
    if (!tracks.length || retry) showStatus("Carregando músicas…");
    try {
      const freshTracks = await fetchPlaylistItems(playlistId, apiKey);
      if (!playlist.isConnected) return;
      tracks = freshTracks;
      writePlaylistCache(playlistId, tracks);
      if (!tracks.length) {
        list.replaceChildren();
        if (count) count.textContent = "0";
        showStatus("Esta playlist não tem músicas públicas disponíveis.");
      } else render();
    } catch (error) {
      const message = error?.message === "youtube-playlist-timeout"
        ? "O YouTube demorou mais de 15 segundos para responder."
        : error?.message === "youtube-playlist-network-error"
          ? "Não foi possível conectar à YouTube Data API. Verifique a conexão e as regras de rede."
          : String(error?.message || "Não foi possível carregar a playlist.");
      showStatus(tracks.length ? `${tracks.length} músicas salvas. ${message}` : message, true);
    } finally {
      loading = false;
    }
  };

  if (cached) {
    tracks = cached.tracks;
    render();
    if (Date.now() - cached.savedAt <= playlistCacheMaxAge) {
      showStatus(`${tracks.length} músicas na playlist · lista salva nesta sessão`);
    }
  }
  search?.addEventListener("input", render);
  status.addEventListener("click", (event) => {
    if (event.target.closest("[data-youtube-retry]")) void load({ retry: true });
  });
  const closeDialog = () => {
    if (dialog?.open) dialog.close();
    else if (dialogPlayer) dialogPlayer.removeAttribute("src");
  };
  dialog?.querySelector("[data-youtube-dialog-close]")?.addEventListener("click", closeDialog);
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog?.addEventListener("close", () => dialogPlayer?.removeAttribute("src"));

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-youtube-track]");
    if (!button) return;
    list.querySelectorAll("[data-youtube-track]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    const videoId = button.dataset.youtubeTrack;
    const track = tracks.find((item) => item.videoId === videoId);
    if (dialog && dialogPlayer && typeof dialog.showModal === "function") {
      if (dialogTitle) dialogTitle.textContent = track?.title || "Música";
      if (dialogChannel) dialogChannel.textContent = track?.channel || "";
      dialogPlayer.title = `Reprodutor: ${track?.title || "música"}`;
      const params = new URLSearchParams({ autoplay: "1", playsinline: "1", rel: "0", list: playlistId });
      dialogPlayer.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params}`;
      if (!dialog.open) dialog.showModal();
    } else {
      player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0&list=${encodeURIComponent(playlistId)}`;
    }
  });
  if (!cached || Date.now() - cached.savedAt > playlistCacheMaxAge) await load();
}

