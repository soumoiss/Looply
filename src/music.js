import { icon } from "./icons.js";
import { normalizeStorySong, officialSongPreview, PROVIDER_NAMES, searchStorySongs } from "./story-music-catalog.js";
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function person(profile) {
  return profile ? `@${escapeHtml(profile.username)}` : "perfil restrito";
}

function isDirectAudioUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && /\.(?:mp3|m4a|aac|ogg|oga|wav|flac|webm)(?:$|[?#])/i.test(url.pathname + url.search);
  } catch {
    return false;
  }
}

export function musicEmbedForUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (["youtube.com", "music.youtube.com", "youtu.be"].includes(host)) {
      let id = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : url.searchParams.get("v");
      if (!id && host !== "youtu.be") {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live"].includes(parts[0])) id = parts[1];
      }
      if (!/^[A-Za-z0-9_-]{11}$/.test(id || "")) return null;
      return { provider: "youtube", height: 240, src: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0` };
    }
    if (host === "open.spotify.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const index = parts.findIndex((part) => ["track", "album", "playlist", "episode", "show"].includes(part));
      const kind = parts[index];
      const id = parts[index + 1];
      if (index < 0 || !/^[A-Za-z0-9]+$/.test(id || "")) return null;
      return { provider: "spotify", height: kind === "track" ? 152 : 352, src: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0` };
    }
    if (host === "soundcloud.com" && /^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
      const embed = new URL("https://w.soundcloud.com/player/");
      embed.searchParams.set("url", url.origin + url.pathname);
      embed.searchParams.set("auto_play", "false");
      embed.searchParams.set("visual", "true");
      return { provider: "soundcloud", height: 166, src: embed.toString() };
    }
    if (host === "music.apple.com" && /^\/[a-z]{2}\/(?:album|playlist)\//i.test(url.pathname)) {
      return { provider: "apple-music", height: 450, src: `https://embed.music.apple.com${url.pathname}` };
    }
  } catch { /* Unsupported or malformed URLs stay on the explicit-link fallback. */ }
  return null;
}

function formatAudioTime(value) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const totalSeconds = Math.floor(value);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}:${seconds}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`;
}

export function musicPlayerMarkup(item) {
  const url = escapeHtml(item.listen_url);
  if (!isDirectAudioUrl(item.listen_url)) {
    const embed = musicEmbedForUrl(item.listen_url);
    if (embed) {
      return `<div class="music-player music-player-embed" data-provider="${embed.provider}"><iframe src="${escapeHtml(embed.src)}" title="Tocar ${escapeHtml(item.title || "música")}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen height="${embed.height}"></iframe></div>`;
    }
    return `<div class="music-player music-player-external">
      <span class="music-player-source">Fonte externa</span>
      <a class="music-listen" href="${url}" target="_blank" rel="noopener noreferrer">Abrir música ${icon("external")}</a>
      <span class="music-player-hint">Este serviço não oferece um player integrado compatível.</span>
    </div>`;
  }
  return `<div class="music-player" data-music-player>
    <audio data-music-audio preload="metadata" src="${url}"></audio>
    <button class="music-player-button" type="button" data-music-play aria-label="Tocar música">${icon("play")}<span>Tocar</span></button>
    <div class="music-player-main">
      <div class="music-player-topline"><span class="music-player-label">Player Looply</span><span data-music-time>0:00 / 0:00</span></div>
      <input class="music-player-progress" data-music-seek type="range" min="0" max="0" step="0.1" value="0" aria-label="Posição da música">
      <div class="music-player-bottomline"><span data-music-status role="status" aria-live="polite">Pronto para tocar</span><span class="music-player-wave" aria-hidden="true">${Array.from({ length: 9 }, (_, index) => `<i style="--music-bar-delay:${index * 70}ms"></i>`).join("")}</span></div>
    </div>
  </div>`;
}

export async function loadMusicData(client, userId) {
  const [peopleResult, dedicationsResult, libraryResult, generalCommentsResult] = await Promise.all([
    client.from("profiles").select("id,username,display_name").order("username").limit(100),
    client.from("music_dedications")
      .select("id,sender_id,recipient_id,title,artist,listen_url,dedication_note,created_at,sender:profiles!music_dedications_sender_id_fkey(username,display_name),recipient:profiles!music_dedications_recipient_id_fkey(username,display_name),comments:music_comments(id,author_id,body,visibility,created_at,author:profiles!music_comments_author_id_fkey(username,display_name))")
      .order("created_at", { ascending: false }).limit(50),
    client.from("music_library").select("id,owner_id,title,artist,listen_url,note,created_at,updated_at")
      .eq("owner_id", userId).order("created_at", { ascending: false }).limit(100),
    client.from("music_page_comments").select("id,body,created_at,author_id,author:profiles!music_page_comments_author_id_fkey(username,display_name)")
      .eq("comment_type", "general").order("created_at", { ascending: true }).limit(100)
  ]);
  return {
    people: peopleResult.data || [],
    peopleError: peopleResult.error,
    dedications: dedicationsResult.data || [],
    dedicationsError: dedicationsResult.error,
    library: libraryResult.data || [],
    libraryError: libraryResult.error,
    generalComments: generalCommentsResult.data || [],
    generalCommentsError: generalCommentsResult.error
  };
}

function libraryMarkup(items, error) {
  if (error) return `<p class="music-error" role="alert">Não foi possível carregar sua coleção pessoal.</p>`;
  if (!items.length) return `<p class="music-empty">Sua coleção pessoal está vazia.</p>`;
  return items.map((item) => `<article class="music-card music-library-card" data-library-track="${escapeHtml(item.id)}">
    <div class="music-card-top"><span class="music-disc" aria-hidden="true">♫</span><span class="music-date">Na sua coleção</span></div>
    <h3>${escapeHtml(item.title)}</h3>${item.artist ? `<p class="music-artist">${escapeHtml(item.artist)}</p>` : ""}
    ${item.note ? `<p class="music-note">${escapeHtml(item.note)}</p>` : ""}
    ${musicPlayerMarkup(item)}
    <button class="text-button" type="button" data-music-library-delete="${escapeHtml(item.id)}">Remover da minha coleção</button>
    <span class="form-status" data-library-delete-status role="status" aria-live="polite"></span>
  </article>`).join("");
}

function personalLibraryMarkup(data) {
  return `<details class="music-library-panel"><summary>Minha coleção pessoal</summary>
    <p class="field-hint">Só você e a administração auditada podem consultar esta lista.</p>
    <form class="music-library-form" data-music-library>
      <div class="music-form-grid">
        <div class="field"><label for="libraryMusicTitle">Música</label><input id="libraryMusicTitle" name="title" type="text" maxlength="160" required placeholder="Nome da música"></div>
        <div class="field"><label for="libraryMusicArtist">Artista</label><input id="libraryMusicArtist" name="artist" type="text" maxlength="120" placeholder="Nome do artista"></div>
      </div>
      <div class="field"><label for="libraryMusicUrl">Link para ouvir</label><input id="libraryMusicUrl" name="listenUrl" type="url" maxlength="1000" required placeholder="YouTube, Spotify, Apple Music ou SoundCloud"></div>
      <div class="field"><label for="libraryMusicNote">Anotação pessoal (opcional)</label><textarea id="libraryMusicNote" name="note" maxlength="1000" rows="2" placeholder="Por que esta música é importante para você?"></textarea></div>
      <button class="text-button" type="submit">Salvar na minha coleção</button>
      <span class="form-status" data-status role="status" aria-live="polite"></span>
    </form>
    <div class="music-list" data-music-library-list>${libraryMarkup(data.library, data.libraryError)}</div>
  </details>`;
}

function dedicationMarkup(item, userId) {
  const comments = [...(item.comments || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const senderIsCurrent = item.sender_id === userId;
  const direction = senderIsCurrent
    ? `Você dedicou esta música para ${person(item.recipient)}.`
    : `${person(item.sender)} dedicou esta música para você.`;
  const notes = item.dedication_note
    ? `<p class="music-note">${escapeHtml(item.dedication_note)}</p>`
    : "";
  const commentsMarkup = comments.length
    ? comments.map((comment) => `<article class="music-comment">
        <div><strong>${person(comment.author)}</strong><span class="music-comment-visibility">${comment.visibility === "private" ? "Só você" : "Compartilhado"}</span></div>
        <p>${escapeHtml(comment.body)}</p>
      </article>`).join("")
    : `<p class="music-empty">Ainda não há comentários nesta dedicatória.</p>`;

  return `<article class="music-card" id="dedication-${escapeHtml(item.id)}" data-dedication="${escapeHtml(item.id)}">
    <div class="music-card-top"><span class="music-disc" aria-hidden="true">♫</span><span class="music-date">${escapeHtml(new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(item.created_at)))}</span></div>
    <p class="music-direction">${direction}</p>
    <h3>${escapeHtml(item.title)}</h3>
    ${item.artist ? `<p class="music-artist">${escapeHtml(item.artist)}</p>` : ""}
    ${notes}
    ${musicPlayerMarkup(item)}
    <section class="music-comments" aria-label="Comentários privados da música">
      <h4>Comentários <span>${comments.length}</span></h4>
      <div class="music-comment-list">${commentsMarkup}</div>
      <form class="music-comment-form" data-music-comment data-dedication-id="${escapeHtml(item.id)}">
        <label class="visually-hidden" for="music-comment-${escapeHtml(item.id)}">Seu comentário sobre esta música</label>
        <textarea id="music-comment-${escapeHtml(item.id)}" name="body" maxlength="2000" required placeholder="Escreva um comentário"></textarea>
        <div class="music-comment-actions"><label for="comment-visibility-${escapeHtml(item.id)}">Visibilidade</label>
          <select id="comment-visibility-${escapeHtml(item.id)}" name="visibility"><option value="private">Só eu</option><option value="participants">Compartilhar com quem participa da dedicatória</option></select>
          <button class="text-button" type="submit">Salvar comentário</button>
        </div>
        <span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>
    </section>
  </article>`;
}

function generalCommentsMarkup(data) {
  if (data.generalCommentsError) return '<p class="music-empty">Os comentários gerais estão temporariamente indisponíveis.</p>';
  const comments = data.generalComments || [];
  if (!comments.length) return '<p class="music-empty">Ainda não há comentários gerais.</p>';
  return comments.map((comment) => '<article class="music-comment"><strong>' +
    escapeHtml(comment.author?.display_name || comment.author?.username || "Usuário") +
    '</strong><p>' + escapeHtml(comment.body) + '</p></article>').join("");
}

function musicContent(data, userId) {
  if (data.dedicationsError) {
    return `<div class="social-message social-error" role="alert">Não foi possível carregar suas músicas. Confira a conexão e tente novamente.</div>`;
  }
  const received = data.dedications.filter((item) => item.recipient_id === userId);
  const sent = data.dedications.filter((item) => item.sender_id === userId);
  const choices = data.people.filter((profile) => profile.id !== userId).map((profile) =>
    `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.display_name)} · @${escapeHtml(profile.username)}</option>`
  ).join("");
  const recipientHint = data.peopleError
    ? `<span class="field-hint field-error">A lista de perfis não carregou; atualize a página para dedicar uma música.</span>`
    : choices ? `<span class="field-hint">A dedicatória fica visível apenas para você e o perfil escolhido.</span>`
      : `<span class="field-hint">Ainda não há outros perfis visíveis para receber uma dedicatória.</span>`;
  const directionPanel = (items, key, emptyText) => `<section data-music-direction-panel="${key}" ${key === "sent" ? "hidden" : ""}>${items.length
    ? items.map((item) => dedicationMarkup(item, userId)).join("")
    : `<div class="music-empty-state"><strong>${emptyText}</strong></div>`}</section>`;

  return `<section class="music-area" data-music-area aria-labelledby="musicTitle">
    <div class="music-heading"><div><span class="section-kicker">Biblioteca</span><h2 id="musicTitle">Músicas e dedicatórias</h2></div>
      <span class="music-count">${received.length} recebida${received.length === 1 ? "" : "s"} · ${sent.length} enviada${sent.length === 1 ? "" : "s"}</span></div>
    ${personalLibraryMarkup(data)}
    <section class="music-general-comments" aria-labelledby="musicGeneralCommentsTitle">
      <h3 id="musicGeneralCommentsTitle">Comentários gerais</h3>
      <div class="music-general-comment-list" data-music-general-comment-list>${generalCommentsMarkup(data)}</div>
      <form data-music-general-comment class="music-comment-form"><label for="musicGeneralCommentBody">Comentar na página de músicas</label><textarea id="musicGeneralCommentBody" name="body" maxlength="2000" required placeholder="Escreva um comentário geral"></textarea><button class="text-button" type="submit">Enviar comentário geral</button><span class="form-status" data-status role="status" aria-live="polite"></span></form>
    </section>
    <details class="music-composer"><summary>＋ Dedicar uma música</summary>
      <form data-music-send>
        <div class="field"><label for="musicRecipient">Para quem é esta música?</label><select id="musicRecipient" name="recipientId" multiple size="5" required ${choices ? "" : "disabled"}><option value="all-users">Todos os usuários</option>${choices}</select>${recipientHint}</div>
        <div class="field music-song-selection">
          <span class="field-label">Música</span>
          <button class="music-song-picker-open" type="button" data-music-open-search>⌕ Pesquisar músicas</button>
          <input id="musicTitle" name="title" type="hidden">
          <input id="musicArtist" name="artist" type="hidden">
          <input id="musicUrl" name="listenUrl" type="hidden">
          <div class="music-selected-song" data-music-selected-song hidden aria-live="polite"></div>
        </div>
        <div class="field"><label for="musicNote">Uma dedicatória (opcional)</label><textarea id="musicNote" name="note" maxlength="1000" rows="3" placeholder="Por que esta música lembrou essa pessoa?"></textarea></div>
        <button class="primary-button compact-button" type="submit">Enviar dedicatória ${icon("send")}</button>
        <span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>
    </details>
    <nav class="music-direction-tabs" role="tablist" aria-label="Músicas recebidas e enviadas">
      <button type="button" role="tab" data-music-direction="received" aria-selected="true">Recebidas <span>${received.length}</span></button>
      <button type="button" role="tab" data-music-direction="sent" aria-selected="false">Enviadas <span>${sent.length}</span></button>
    </nav>
    <div class="music-list" data-music-list>
      ${directionPanel(received, "received", "Você ainda não recebeu músicas dedicadas.")}
      ${directionPanel(sent, "sent", "Você ainda não dedicou músicas.")}
    </div>
    <span class="realtime-state" data-music-realtime role="status">Conectando atualizações...</span>
    <div class="music-picker-backdrop" data-music-picker hidden>
      <section class="music-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="musicPickerTitle">
        <header><div><span class="section-kicker">Catálogo musical</span><h3 id="musicPickerTitle">Escolher música</h3></div><button type="button" class="music-picker-close" data-music-picker-close aria-label="Fechar">×</button></header>
        <label for="musicCatalogQuery">Pesquisar por música ou artista</label>
        <input id="musicCatalogQuery" type="search" maxlength="70" autocomplete="off" placeholder="Ex.: nome da música ou artista" data-music-catalog-query>
        <p class="music-picker-help" data-music-search-status role="status" aria-live="polite">Digite ao menos duas letras para pesquisar no catálogo.</p>
        <div class="music-picker-results" data-music-search-results></div>
        <div class="music-picker-preview" data-music-search-preview aria-live="polite"></div>
        <footer><button type="button" class="text-button" data-music-picker-close>Cancelar</button><button type="button" class="primary-button compact-button" data-music-picker-confirm disabled>Usar música selecionada</button></footer>
      </section>
    </div>
  </section>`;
}

export function musicMarkup(data, userId) {
  return musicContent(data, userId);
}

async function refreshMusic(root, client, userId) {
  const area = root.querySelector("[data-music-area]");
  if (!area) return;
  area.setAttribute("aria-busy", "true");
  try {
    area.outerHTML = musicMarkup(await loadMusicData(client, userId), userId);
    bindMusicPlayers(root);
  } catch (error) {
    console.error("Looply music refresh failed", error);
    area.innerHTML = `<div class="social-message social-error" role="alert">Não foi possível atualizar agora.</div>`;
  }
}

function updateMusicPlayer(player, audio) {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const seek = player.querySelector("[data-music-seek]");
  const time = player.querySelector("[data-music-time]");
  const status = player.querySelector("[data-music-status]");
  if (seek) {
    seek.max = String(duration);
    seek.value = String(Math.min(current, duration || current));
    seek.style.setProperty("--music-progress", `${duration ? (current / duration) * 100 : 0}%`);
  }
  if (time) time.textContent = `${formatAudioTime(current)} / ${formatAudioTime(duration)}`;
  if (status && !audio.error && !audio.paused) status.textContent = "Reproduzindo agora";
}

function setMusicPlayerPlaying(player, playing) {
  const button = player.querySelector("[data-music-play]");
  if (!button) return;
  button.innerHTML = `${icon(playing ? "pause" : "play")}<span>${playing ? "Pausar" : "Tocar"}</span>`;
  button.setAttribute("aria-label", playing ? "Pausar música" : "Tocar música");
  player.classList.toggle("is-playing", playing);
}

function bindMusicPlayers(root) {
  root.querySelectorAll("[data-music-player]").forEach((player) => {
    const audio = player.querySelector("[data-music-audio]");
    const seek = player.querySelector("[data-music-seek]");
    if (!audio || player.dataset.musicBound === "true") return;
    player.dataset.musicBound = "true";
    ["loadedmetadata", "durationchange", "timeupdate"].forEach((eventName) => audio.addEventListener(eventName, () => updateMusicPlayer(player, audio)));
    audio.addEventListener("play", () => setMusicPlayerPlaying(player, true));
    audio.addEventListener("pause", () => setMusicPlayerPlaying(player, false));
    audio.addEventListener("ended", () => {
      setMusicPlayerPlaying(player, false);
      const status = player.querySelector("[data-music-status]");
      if (status) status.textContent = "Música concluída — toque novamente para repetir";
    });
    audio.addEventListener("error", () => {
      setMusicPlayerPlaying(player, false);
      const status = player.querySelector("[data-music-status]");
      if (status) status.textContent = "Não foi possível reproduzir este arquivo";
    });
    if (seek) seek.addEventListener("input", () => {
      audio.currentTime = Number(seek.value) || 0;
      updateMusicPlayer(player, audio);
    });
    updateMusicPlayer(player, audio);
  });
}

function setStatus(form, message, kind = "success") {
  const status = form.querySelector("[data-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

export function bindMusicEvents(root, client, getUserId) {
  bindMusicPlayers(root);
  let selectedDedicationSong = null;
  let catalogSongs = [];
  let selectedCatalogIndex = -1;
  let catalogSearchSequence = 0;
  let catalogSearchTimer = null;
  let catalogSearchController = null;
  let catalogPreview = null;

  const stopCatalogPreview = () => {
    if (catalogPreview instanceof HTMLAudioElement) {
      catalogPreview.pause();
      catalogPreview.removeAttribute("src");
      catalogPreview.load();
    }
    catalogPreview = null;
    root.querySelector("[data-music-search-preview]")?.replaceChildren();
  };
  const closeCatalogPicker = () => {
    clearTimeout(catalogSearchTimer);
    catalogSearchController?.abort();
    stopCatalogPreview();
    const picker = root.querySelector("[data-music-picker]");
    if (picker) picker.hidden = true;
  };
  const renderCatalogResults = (songs) => {
    const list = root.querySelector("[data-music-search-results]");
    if (!list) return;
    list.replaceChildren();
    songs.forEach((song, index) => {
      const card = document.createElement("article");
      card.className = "music-catalog-result";
      const artworkUrl = safeMusicArtwork(song.artwork);
      if (artworkUrl) {
        const artwork = document.createElement("img");
        artwork.src = artworkUrl;
        artwork.alt = "";
        artwork.loading = "lazy";
        artwork.referrerPolicy = "no-referrer";
        card.append(artwork);
      } else {
        const artwork = document.createElement("span");
        artwork.className = "music-catalog-artwork-fallback";
        artwork.setAttribute("aria-hidden", "true");
        artwork.textContent = "♫";
        card.append(artwork);
      }
      const copy = document.createElement("div");
      copy.className = "music-catalog-copy";
      const title = document.createElement("strong");
      title.textContent = song.title;
      const artist = document.createElement("small");
      artist.textContent = song.artist;
      const provider = document.createElement("span");
      provider.textContent = PROVIDER_NAMES[song.provider] || "Catálogo";
      copy.append(title, artist, provider);
      card.append(copy);
      const select = document.createElement("button");
      select.type = "button";
      select.dataset.musicSongSelect = String(index);
      select.setAttribute("aria-pressed", String(index === selectedCatalogIndex));
      select.textContent = index === selectedCatalogIndex ? "Selecionada" : "Selecionar";
      card.append(select);
      const preview = document.createElement("button");
      preview.type = "button";
      preview.dataset.musicSongPreview = String(index);
      preview.disabled = !officialSongPreview(song);
      preview.textContent = "Prévia";
      preview.setAttribute("aria-label", "Ouvir prévia de " + song.title);
      card.append(preview);
      list.append(card);
    });
  };
  const searchCatalog = (query, sequence) => {
    clearTimeout(catalogSearchTimer);
    catalogSearchController?.abort();
    stopCatalogPreview();
    const status = root.querySelector("[data-music-search-status]");
    const list = root.querySelector("[data-music-search-results]");
    catalogSongs = [];
    selectedCatalogIndex = -1;
    const term = String(query || "").trim();
    renderCatalogResults(catalogSongs);
    const normalized = term.toLocaleLowerCase("pt-BR");
    if (normalized.length < 2) {
      if (status) status.textContent = "Digite ao menos duas letras para pesquisar no catálogo.";
      return;
    }
    if (status) status.textContent = "Pesquisando músicas…";
    catalogSearchTimer = setTimeout(async () => {
      catalogSearchController = new AbortController();
      try {
        const result = await searchStorySongs(normalized, { signal: catalogSearchController.signal });
        if (sequence !== catalogSearchSequence) return;
        catalogSongs = result.items.map(normalizeStorySong).filter(Boolean);
        renderCatalogResults(catalogSongs);
        if (status) status.textContent = catalogSongs.length
          ? "Selecione uma música. A prévia, quando disponível, usa o player oficial."
          : "Nenhuma música encontrada. Tente buscar pelo nome do artista.";
      } catch (error) {
        if (error?.name === "AbortError" || sequence !== catalogSearchSequence) return;
        if (status) status.textContent = "A busca está indisponível agora. Tente novamente em instantes.";
        if (list) list.replaceChildren();
      }
    }, 260);
  };

  root.addEventListener("click", async (event) => {
    const openPicker = event.target.closest("[data-music-open-search]");
    if (openPicker) {
      const picker = root.querySelector("[data-music-picker]");
      if (picker) picker.hidden = false;
      const query = root.querySelector("[data-music-catalog-query]");
      if (query) {
        query.focus();
        if (query.value.trim().length >= 2) {
          const sequence = ++catalogSearchSequence;
          searchCatalog(query.value, sequence);
        }
      }
      return;
    }
    const closePicker = event.target.closest("[data-music-picker-close]");
    if (closePicker || event.target.matches("[data-music-picker]")) {
      closeCatalogPicker();
      return;
    }
    const direction = event.target.closest("[data-music-direction]");
    if (direction) {
      const selected = direction.dataset.musicDirection;
      root.querySelectorAll("[data-music-direction]").forEach((button) => button.setAttribute("aria-selected", String(button === direction)));
      root.querySelectorAll("[data-music-direction-panel]").forEach((panel) => { panel.hidden = panel.dataset.musicDirectionPanel !== selected; });
      return;
    }
    const songSelect = event.target.closest("[data-music-song-select]");
    if (songSelect) {
      selectedCatalogIndex = Number(songSelect.dataset.musicSongSelect);
      root.querySelectorAll("[data-music-song-select]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button === songSelect));
        button.textContent = button === songSelect ? "Selecionada" : "Selecionar";
      });
      const confirm = root.querySelector("[data-music-picker-confirm]");
      if (confirm) confirm.disabled = !catalogSongs[selectedCatalogIndex];
      return;
    }
    const songPreview = event.target.closest("[data-music-song-preview]");
    if (songPreview) {
      const song = catalogSongs[Number(songPreview.dataset.musicSongPreview)];
      const preview = song && officialSongPreview(song);
      const target = root.querySelector("[data-music-search-preview]");
      if (!preview || !target) return;
      stopCatalogPreview();
      if (preview.kind === "audio") {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "none";
        audio.src = preview.src;
        catalogPreview = audio;
        target.append(audio);
        try { await audio.play(); }
        catch {
          const hint = document.createElement("span");
          hint.textContent = "Toque em reproduzir para ouvir a prévia.";
          target.append(hint);
        }
      } else if (preview.kind === "embed") {
        const frame = document.createElement("iframe");
        frame.src = preview.src;
        frame.title = "Player oficial de " + song.title;
        frame.loading = "lazy";
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        frame.allow = "autoplay; encrypted-media";
        frame.height = "110";
        catalogPreview = frame;
        target.append(frame);
      }
      return;
    }
    const confirmPicker = event.target.closest("[data-music-picker-confirm]");
    if (confirmPicker) {
      const song = normalizeStorySong(catalogSongs[selectedCatalogIndex]);
      const form = root.querySelector("form[data-music-send]");
      if (!song || !form) return;
      selectedDedicationSong = song;
      form.elements.title.value = song.title;
      form.elements.artist.value = song.artist;
      form.elements.listenUrl.value = song.url;
      const selected = form.querySelector("[data-music-selected-song]");
      if (selected) {
        selected.hidden = false;
        selected.textContent = song.title + " · " + song.artist + " · " + (PROVIDER_NAMES[song.provider] || "Catálogo");
      }
      closeCatalogPicker();
      return;
    }
    const playButton = event.target.closest("[data-music-play]");
    if (!playButton) return;
    const playButton = event.target.closest("[data-music-play]");
    if (!playButton) return;
    const player = playButton.closest("[data-music-player]");
    const audio = player?.querySelector("[data-music-audio]");
    if (!player || !audio) return;
    root.querySelectorAll("[data-music-audio]").forEach((otherAudio) => {
      if (otherAudio !== audio) otherAudio.pause();
    });
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        const status = player.querySelector("[data-music-status]");
        if (status) status.textContent = "Toque novamente para iniciar a reprodução";
      }
    } else {
      audio.pause();
    }
  });

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-music-library-delete]");
    if (!button || !client) return;
    button.disabled = true;
    try {
      const { error } = await client.from("music_library").delete().eq("id", button.dataset.musicLibraryDelete);
      if (error) throw error;
      await refreshMusic(root, client, getUserId?.());
    } catch (error) {
      console.error("Looply music library delete failed", error);
      const status = button.closest("[data-library-track]")?.querySelector("[data-library-delete-status]");
      if (status) {
        status.textContent = "Não foi possível remover a música. Tente novamente.";
        status.dataset.kind = "error";
      }
      button.disabled = false;
    }
  });

  root.addEventListener("input", (event) => {
    const input = event.target.closest("[data-music-catalog-query]");
    if (!input) return;
    const sequence = ++catalogSearchSequence;
    searchCatalog(input.value, sequence);
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !root.querySelector("[data-music-picker]")?.hidden) closeCatalogPicker();
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-music-library], form[data-music-send], form[data-music-comment], form[data-music-general-comment]");
    if (!form || !client) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const userId = getUserId?.();
    if (button) button.disabled = true;
    try {
      const values = new FormData(form);
      const body = String(values.get("body") || "").trim();
      if (form.matches("[data-music-library]")) {
        const title = String(values.get("title") || "").trim();
        const artist = String(values.get("artist") || "").trim();
        const note = String(values.get("note") || "").trim();
        const listenUrl = String(values.get("listenUrl") || "").trim();
        const supported = isDirectAudioUrl(listenUrl) || /^https:\/\/(open\.spotify\.com|music\.youtube\.com|youtu\.be|www\.youtube\.com|youtube\.com|music\.apple\.com|soundcloud\.com)\//i.test(listenUrl);
        if (!title || title.length > 160 || !supported) throw new Error("music-library-fields");
        const { error } = await client.from("music_library").insert({ owner_id:userId, title, artist, listen_url: listenUrl, note });
        if (error) throw error;
        form.reset();
        setStatus(form, "A música foi salva na sua coleção.");
        await refreshMusic(root, client, userId);
      } else if (form.matches("[data-music-send]")) {
        const song = normalizeStorySong(selectedDedicationSong);
        const title = song?.title || "";
        const artist = song?.artist || "";
        const note = String(values.get("note") || "").trim();
        const recipientIds = values.getAll("recipientId").map(String);
        const listenUrl = song?.url || "";
        const supported = Boolean(song);
        const selectedRecipients = recipientIds.includes("all-users")
          ? (await client.from("profiles").select("id").neq("id", userId).in("profile_visibility", ["members", "public"])).data?.map((profile) => profile.id) || []
          : recipientIds.filter((id) => id !== userId);
        if (!title || title.length > 160 || !selectedRecipients.length || !supported) throw new Error("music-fields");
        const rows = selectedRecipients.map((recipient_id) => ({ sender_id:userId, recipient_id, title, artist, dedication_note: note, listen_url: listenUrl }));
        const { error } = await client.from("music_dedications").insert(rows);
        if (error) throw error;
        form.reset();
        selectedDedicationSong = null;
        const selectedSongLabel = form.querySelector("[data-music-selected-song]");
        if (selectedSongLabel) { selectedSongLabel.hidden = true; selectedSongLabel.textContent = ""; }
        closeCatalogPicker();
        setStatus(form, "Dedicatória enviada para " + selectedRecipients.length + " pessoa(s).");
        await refreshMusic(root, client, userId);
      } else if (form.matches("[data-music-general-comment]")) {
        if (!body || body.length > 2000) throw new Error("comment-fields");
        const { error } = await client.from("music_page_comments").insert({ comment_type: "general", author_id:userId, body });
        if (error) throw error;
        form.reset();
        setStatus(form, "Comentário geral enviado.");
        await refreshMusic(root, client, userId);
      } else {
        const dedicationId = form.dataset.dedicationId;
        const visibility = String(values.get("visibility") || "private");
        if (!body || body.length > 2000) throw new Error("comment-fields");
        const { error } = await client.from("music_comments").insert({ dedication_id: dedicationId, author_id:userId, body, visibility });
        if (error) throw error;
        await refreshMusic(root, client, userId);
      }
    } catch (error) {
      console.error("Looply music action failed", error);
      const message = /duplicate|unique/i.test(String(error?.message || ""))
        ? "Esta dedicatória já foi salva."
        : "Não foi possível salvar. Confira os campos, o link e as permissões e tente novamente.";
      setStatus(form, message, "error");
    } finally {
      if (button) button.disabled = false;
    }
  });
}

let musicChannel = null;
let musicUserId = null;
let musicRefreshTimer = null;

export function setupMusicRealtime(client, userId, root) {
  if (!client || !userId) return;
  if (musicChannel && musicUserId === userId) return;
  if (musicChannel) client.removeChannel(musicChannel);
  musicUserId = userId;
  musicChannel = client
    .channel(`looply-music-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "music_dedications" }, () => scheduleMusicRefresh(root, client, userId))
    .on("postgres_changes", { event: "*", schema: "public", table: "music_comments" }, () => scheduleMusicRefresh(root, client, userId))
    .on("postgres_changes", { event: "*", schema: "public", table: "music_page_comments" }, () => scheduleMusicRefresh(root, client, userId))
    .on("postgres_changes", { event: "*", schema: "public", table: "music_library", filter: `owner_id=eq.${userId}` }, () => scheduleMusicRefresh(root, client, userId))
    .subscribe((state) => {
      const status = root.querySelector("[data-music-realtime]");
      if (status) status.textContent = state === "SUBSCRIBED" ? "Atualizações ao vivo" : "Reconectando atualizações...";
    });
}

function scheduleMusicRefresh(root, client, userId) {
  clearTimeout(musicRefreshTimer);
  musicRefreshTimer = setTimeout(() => refreshMusic(root, client, userId), 350);
}

export function disposeMusicRealtime(client) {
  clearTimeout(musicRefreshTimer);
  if (musicChannel && client) client.removeChannel(musicChannel);
  musicChannel = null;
  musicUserId = null;
}
