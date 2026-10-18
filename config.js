// Valores públicos do Supabase. Configure a URL e a publishable key deste projeto.
// Nunca coloque chaves secretas neste arquivo.
window.LOOPLY_CONFIG = Object.freeze({
  supabaseUrl: "https://qixocgetiwlrsbadpbvh.supabase.co",
  publishableKey: "sb_publishable_GEUz-cJM1qXuaR7KbM2EBA_vk1hGxdT",
  // The playlist API runs as a Vercel serverless function; GitHub Pages cannot host /api routes.
  apiBaseUrl: "https://looply-mu.vercel.app",
  // Add TURN credentials from your TURN provider to improve calls on restrictive networks.
  // Example: { urls: "turns:turn.example.com:5349", username: "short-lived-user", credential: "short-lived-password" }
  rtcIceServers: []
});

