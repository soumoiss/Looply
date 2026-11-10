import { mountAppPage } from "../../src/page-runtime.js?v=one-session-entry-20261031";
import { bindMusicEvents, disposeMusicRealtime, loadMusicData, refreshMusicInPlace, musicMarkup, setupMusicRealtime } from "../../src/music.js?v=music-member-discovery-20261028";
import { bindYouTubePlaylist, playlistMarkup } from "../../src/youtube-playlist.js?v=live-index-20261031";
import { mountMusicAdminPlaylistPanel } from "../../src/music-admin-playlists.js?v=live-index-20261031";
import { mountMusicV6Ui } from "../../src/music-v6-ui.js?v=music-v6-20261110";

await mountAppPage({ page: "music", render: async ({ root, client, user, profile }) => {
  const data = await loadMusicData(client, user.id);
  root.innerHTML = `<section class="music-v6" data-music-v6 data-music-view="playlist">
    <div class="music-v6-toolbar">
      <button type="button" data-music-v6-comments-open aria-label="Comentários gerais" title="Comentários gerais">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 12a8 8 0 0 1-11.5 7.2L4 20l1-4.2A8 8 0 1 1 20 12z"/></svg>
      </button>
    </div>
    <nav class="music-v6-tabs" data-music-v6-tabs role="tablist" aria-label="Seções de músicas">
      <button type="button" role="tab" data-music-v6-tab="playlist" aria-selected="true">Playlist</button>
      <button type="button" role="tab" data-music-v6-tab="dedications" aria-selected="false">Dedicatórias</button>
      <button type="button" role="tab" data-music-v6-tab="collection" aria-selected="false">Coleção</button>
    </nav>
    <div class="music-v6-playlist" data-music-v6-panel="playlist">${playlistMarkup(profile)}</div>
    ${musicMarkup(data,user.id)}
    <div class="music-v6-scrim" data-music-v6-scrim hidden></div>
    <button class="music-v6-fab" type="button" data-music-v6-compose hidden aria-label="Dedicar música">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Dedicar
    </button>
  </section>`;
  await bindYouTubePlaylist(root, client);
  await mountMusicAdminPlaylistPanel(root, client);
  bindMusicEvents(root, client, () => user.id);
  mountMusicV6Ui(root);
  root.__looplyRefreshData = () => refreshMusicInPlace(root, client, user.id);
  setupMusicRealtime(client, user.id, root);
  window.addEventListener("pagehide", () => disposeMusicRealtime(client), { once: true });
} });

if (window.location.hash) {
  requestAnimationFrame(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
