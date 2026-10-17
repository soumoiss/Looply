// Configuração pública do cliente. Nunca coloque chaves secretas neste arquivo.
const looplyHost = String(globalThis.location?.hostname || "").toLowerCase();
const looplyIsGitHubPages = looplyHost === "soumoiss.github.io";
const looplyApiBase = looplyIsGitHubPages
  ? "https://looply-mu.vercel.app/api/youtube-playlist"
  : "/api/youtube-playlist";

window.LOOPLY_CONFIG = Object.freeze({
  supabaseUrl: "https://qixocgetiwlrsbadpbvh.supabase.co",
  publishableKey: "sb_publishable_GEUz-cJM1qXuaR7KbM2EBA_vk1hGxdT",
  youtubeApiUrl: looplyApiBase,
  // Chave pública do YouTube Data API. Restrinja-a no Google Cloud por API e origem.
  youtubeApiKey: "AIzaSyAL_V1wioXwRNCJn9ZIW7RsqHhBqbDd6Sg"
});
