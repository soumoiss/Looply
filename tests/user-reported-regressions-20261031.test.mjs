import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("Scheduled letters call authenticated Neon RPC, not the unsupported bridge", () => {
  const bridge = read("src/neon-production-client.js");
  assert.match(bridge, /scheduledLetterRpcNames/);
  assert.match(bridge, /scheduledLetterRpc\(name,args\)/);
  for (const name of ["v24_create_scheduled_letter","v24_update_scheduled_letter","v24_cancel_scheduled_letter"])
    assert.ok(bridge.includes(name),name);
  const letters = read("src/scheduled-letters.js");
  assert.doesNotMatch(letters, /error\.message \|\| "Não foi possível salvar/);
  assert.match(letters, /Carta programada\./);
});

test("Tic-tac-toe invitation SQL does not use unsupported max(uuid)", () => {
  const sql = read("migration/20261031_fix_ttt_uuid_aggregation.sql");
  assert.match(sql, /array_agg\(user_id\)/);
  assert.doesNotMatch(sql, /max\(CASE WHEN user_id/);
  const game = read("src/chat-ttt.js");
  assert.match(game, /hydrationConversation/);
  assert.match(game, /"v25_ttt_invite"/);
  assert.match(game, /"convite"/);
});

test("Story media is uncropped and reply actions remain keyboard-aware", () => {
  const css = read("assets/css/pages/stories-viewer-engagement.css");
  assert.match(css, /object-fit:contain!important/);
  assert.match(css, /object-position:center center!important/);
  assert.match(css, /bottom:var\(--story-keyboard-inset,0px\)!important/);
  assert.match(css, /display:none!important;\s*\}\s*\.story-viewer-dialog \.story-viewer-media/);
});

test("Reposts verify a mention and upload a distinct copy", () => {
  const stories = read("src/stories.js");
  assert.match(stories, /data-story-repost/);
  assert.match(stories, /mentioned_user_id/);
  assert.match(stories, /const repostCurrentStory = async/);
  assert.match(stories, /upload\(uploadedPath,copy/);
  assert.match(stories, /v5_attach_story_media/);
  assert.match(stories, /sharePanel\.hidden = true/);
});

test("Theme and font bootstraps exist on all main pages", () => {
  for (const page of ["home.html","chat.html","cartas.html","conversa.html","configuracoes.html","notificacoes.html","usuarios.html","galeria.html","musicas.html","perfil.html","admin.html"])
    assert.match(read(page), /src\/theme-bootstrap\.js/,page);
  assert.match(read("src/theme.js"), /localStorage\.setItem\("looply_font_family"/);
  assert.match(read("assets/css/app.css"), /font-family:var\(--looply-font-family/);
});
