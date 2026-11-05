# Refatoração 2026-11-05

1. Aplicar `migration/20261105_admin_letter_access_log_story_views.sql` no Neon (testar antes em staging).
2. Reimplantar o worker `backend/cloudflare/android-push-worker.mjs` e a Edge Function `looply-admin`.
3. Front-end: novo `assets/css/pages/ios-redesign.css`, `src/ios-motion.js`, `src/admin-letter-log.js`; toast reescrito em `src/live-notification-toast.js`.
4. Painel ADM > "Atividade de cartas privadas" (log silencioso: usuário, carta, data/hora exata).
