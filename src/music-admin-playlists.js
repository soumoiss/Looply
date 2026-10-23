function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function playlistId(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["youtube.com", "www.youtube.com", "music.youtube.com"].includes(url.hostname)) return "";
    if (url.pathname !== "/playlist") return "";
    const id = url.searchParams.get("list") || "";
    return /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : "";
  } catch { return ""; }
}

export async function mountMusicAdminPlaylistPanel(root, client) {
  const { data: status, error: statusError } = await client.functions.invoke("looply-admin", { body: { resourceType: "status" } });
  if (statusError || status?.isAdmin !== true) return;
  const { data: result, error } = await client.functions.invoke("looply-admin", {
    body: { action: "users_list", resourceType: "profiles" }
  });
  if (error || !Array.isArray(result?.users)) return;
  const users = result.users.filter((user) => user.playlist_url && playlistId(user.playlist_url));
  const panel = document.createElement("section");
  panel.className = "music-admin-playlists";
  panel.innerHTML = `
    <div class="music-admin-playlists-heading"><span class="section-kicker">Área administrativa</span><h2>Playlists dos usuários</h2>
    <p>Ouça a playlist dentro do Looply e deixe um comentário privado sobre uma faixa. O comentário fica visível apenas para o dono da playlist.</p></div>
    <div class="field"><label for="adminMusicOwner">Selecionar usuário</label><select id="adminMusicOwner">${users.map((user) => `<option value="${escapeHtml(user.id)}" data-playlist="${escapeHtml(playlistId(user.playlist_url))}">${escapeHtml(user.display_name || user.username)} · @${escapeHtml(user.username)}</option>`).join("")}</select></div>
    <div class="music-admin-playlist-player" data-admin-music-player></div>
    <form data-admin-music-comment-form class="music-admin-comment-form">
      <div class="music-form-grid"><div class="field"><label for="adminMusicVideoId">ID da faixa do YouTube</label><input id="adminMusicVideoId" name="videoId" required maxlength="11" pattern="[A-Za-z0-9_-]{11}" placeholder="ID de 11 caracteres"></div>
      <div class="field"><label for="adminMusicTrackTitle">Nome da música (opcional)</label><input id="adminMusicTrackTitle" name="title" maxlength="160" placeholder="Título da faixa"></div></div>
      <div class="field"><label for="adminMusicCommentBody">Comentário privado</label><textarea name="body" required maxlength="2000" rows="3" placeholder="Este comentário será visto somente pelo dono da playlist."></textarea></div>
      <button class="primary-button compact-button" type="submit">Enviar comentário privado</button><span data-admin-music-status role="status" aria-live="polite"></span>
    </form>`;
  const musicArea = root.querySelector("[data-music-area]");
  (musicArea || root.firstElementChild || root).before(panel);
  const owner = panel.querySelector("#adminMusicOwner");
  const player = panel.querySelector("[data-admin-music-player]");
  const selectedPlaylist = () => owner.selectedOptions[0]?.dataset.playlist || "";
  const renderPlayer = () => {
    const id = selectedPlaylist();
    player.replaceChildren();
    if (!id) { player.textContent = "Este usuário ainda não tem uma playlist válida configurada."; return; }
    const iframe = document.createElement("iframe");
    iframe.title = "Playlist do usuário selecionado";
    iframe.src = `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(id)}&listType=playlist`;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    player.append(iframe);
  };
  owner.addEventListener("change", renderPlayer);
  renderPlayer();
  panel.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const user = result.users.find((item) => item.id === owner.value);
    const videoId = String(data.get("videoId") || "").trim();
    const title = String(data.get("title") || "").trim();
    const body = String(data.get("body") || "").trim();
    const submit = form.querySelector('button[type="submit"]');
    const status = panel.querySelector("[data-admin-music-status]");
    if (!user || !selectedPlaylist() || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || !body) return;
    submit.disabled = true;
    status.textContent = "Enviando comentário privado…";
    try {
      const { data: response, error: invokeError } = await client.functions.invoke("looply-admin", {
        body: { action: "admin_music_track_comment", resourceType: "youtube_track_comments",
          recipientId: user.id, playlistId: selectedPlaylist(), videoId, title, body }
      });
      if (invokeError || response?.created !== true) throw invokeError || new Error("comment_failed");
      form.reset();
      status.textContent = "Comentário enviado. Somente o dono da playlist poderá vê-lo.";
    } catch {
      status.textContent = "Não foi possível enviar. Verifique o ID da faixa e tente novamente.";
    } finally { submit.disabled = false; }
  });
}
