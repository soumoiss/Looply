// Configuração pública do Looply. Auth, dados e mídia operam via Neon e Cloudflare.
// Nunca publique credenciais privadas nesta configuração.
window.LOOPLY_CONFIG = Object.freeze({
  // ICE opcional para WebRTC. Credenciais TURN não devem ser embutidas no JS.
  rtcIceServers: []
});
