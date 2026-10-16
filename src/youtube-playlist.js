const playlists = Object.freeze({
  misol: "PLUZFdmgmipvI",
  yara: "PLCn4CAsA_tiM",
  patati: "PLE0tcB0gaSzM",
  peixinho: "PLD5PXwJcU-Sg"
});
const fallbackPlaylist = "PLMeQ_QyqhY7s";

export function playlistIdFor(username) {
  const key = String(username || "").trim().toLowerCase();
  return playlists[key] || fallbackPlaylist;
}

export function playlistMarkup(profile) {
  const id = playlistIdFor(profile.username);
  const title = String(profile.display_name || profile.username || "Usuário").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const embed = `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(id)}`;
  const page = `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
  return `<section class="panel youtube-playlist" aria-labelledby="youtubePlaylistTitle">
    <div class="eyebrow">Playlist de ${title}</div><h2 id="youtubePlaylistTitle">Playlist</h2>
    <iframe src="${embed}" title="Playlist de ${title}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
    <a class="youtube-playlist-link" href="${page}" target="_blank" rel="noopener noreferrer">Abrir no YouTube</a>
  </section>`;
}
