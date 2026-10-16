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
  const page = `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
  return `<section class="panel youtube-playlist" aria-labelledby="youtubePlaylistTitle" data-youtube-playlist="${escapeHtml(id)}">
    <div class="eyebrow">Playlist de ${title}</div><h2 id="youtubePlaylistTitle">Playlist</h2>
    <div class="youtube-playlist-layout">
      <iframe class="youtube-playlist-player" src="${embed}" title="Playlist de ${title}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
      <section class="youtube-track-panel" aria-label="Lista de músicas">
        <div class="youtube-track-heading"><h3>Músicas</h3><span data-youtube-track-count></span></div>
        <label class="visually-hidden" for="youtubeTrackSearch">Buscar na playlist</label>
        <input id="youtubeTrackSearch" class="youtube-track-search" type="search" maxlength="100" placeholder="Buscar música" data-youtube-track-search>
        <p class="youtube-track-status" data-youtube-track-status role="status" aria-live="polite">A lista completa está disponível no player do YouTube.</p>
        <ol class="youtube-track-list" data-youtube-track-list aria-label="Faixas da playlist"></ol>
      </section>
    </div>
    <a class="youtube-playlist-link" href="${page}" target="_blank" rel="noopener noreferrer">Abrir no YouTube</a>
  </section>`;
}

function playlistApiKey() {
  return String(window.LOOPLY_CONFIG?.youtubeApiKey || "").trim();
}

async function fetchPlaylistItems(playlistId, apiKey) {
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
    const response = await fetch(`${playlistItemsEndpoint}?${params}`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("youtube-playlist-request-failed");
    const data = await response.json();
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
  if (!playlist || !list || !status || !player) return;

  const playlistId = playlist.dataset.youtubePlaylist;
  const apiKey = playlistApiKey();
  if (!apiKey) {
    status.textContent = "Use os controles do player para ver todas as músicas. A lista nesta página precisa da chave restrita da YouTube Data API v3.";
    return;
  }

  status.textContent = "Carregando músicas…";
  try {
    const tracks = await fetchPlaylistItems(playlistId, apiKey);
    if (!playlist.isConnected) return;
    if (!tracks.length) {
      status.textContent = "Esta playlist não tem músicas públicas disponíveis.";
      return;
    }
    if (count) count.textContent = `${tracks.length}`;
    const render = (query = "") => {
      const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
      const filtered = tracks.filter((track) => `${track.title} ${track.channel}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
      list.innerHTML = filtered.map((track) => trackMarkup(track, track.position)).join("");
      status.textContent = normalizedQuery
        ? `${filtered.length} de ${tracks.length} músicas`
        : `${tracks.length} músicas na playlist`;
    };
    render();
    search?.addEventListener("input", () => render(search.value));
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-youtube-track]");
      if (!button) return;
      list.querySelectorAll("[data-youtube-track]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      const videoId = button.dataset.youtubeTrack;
      player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&list=${encodeURIComponent(playlistId)}&listType=playlist`;
    });
  } catch {
    status.textContent = "Não foi possível carregar a lista. Confira a chave restrita da YouTube Data API v3; o player continua disponível.";
  }
}
