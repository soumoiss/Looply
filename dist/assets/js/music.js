import { mountAppPage } from "../../src/page-runtime.js?build=caa8d5b0bdd8905d";
import { bindMusicEvents, disposeMusicRealtime, loadMusicData, refreshMusicInPlace, musicMarkup, setupMusicRealtime } from "../../src/music.js?build=caa8d5b0bdd8905d";
import { bindYouTubePlaylist, playlistMarkup } from "../../src/youtube-playlist.js?build=caa8d5b0bdd8905d";
import { mountMusicAdminPlaylistPanel } from "../../src/music-admin-playlists.js?build=caa8d5b0bdd8905d";

await mountAppPage({ page: "music", render: async ({ root, client, user, profile }) => {
  const data = await loadMusicData(client, user.id);
  root.innerHTML = playlistMarkup(profile) + musicMarkup(data, user.id);
  await bindYouTubePlaylist(root, client);
  await mountMusicAdminPlaylistPanel(root, client);
  bindMusicEvents(root, client, () => user.id);
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
