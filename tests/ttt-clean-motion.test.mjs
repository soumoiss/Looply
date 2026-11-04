import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Jogo da Velha has a single clean title and no explanatory server copy",async()=>{
  const src=await read("src/chat-ttt.js");
  assert.match(src,/id="chatV2ModalTitle">Jogo da Velha/);
  assert.doesNotMatch(src,/Partida no Looply|Convidar para jogar\?|Placar salvo no Neon|Jogadas validadas pelo servidor|Uma partida privada nesta conversa/);
  assert.match(src,/data-v2-scoreboard/);
  assert.match(src,/aria-live="polite"/);
});
test("Invites, acceptance, declines and rematches preserve the server-authoritative contracts",async()=>{
  const src=await read("src/chat-ttt.js");
  for(const action of ["v25_ttt_state","v25_ttt_invite","v25_ttt_accept",
    "v25_ttt_decline","v25_ttt_move","v25_ttt_rematch"])
    assert.ok(src.includes(action),action);
  for(const control of ["data-v2-send-invite","data-v2-accept","data-v2-decline",
    "data-v2-rematch","data-v2-cell","data-v2-close-game"])
    assert.ok(src.includes(control),control);
  assert.match(src,/if\(busy\)return/);
  assert.match(src,/if\(offline\)root\.querySelectorAll/);
  assert.match(src,/payload:\{type:"updated",gameId,conversationId\}/);
  assert.doesNotMatch(src,/record_chat_ttt_result/);
});
test("Victory is drawn over three server-confirmed cells, and new moves animate locally",async()=>{
  const src=await read("src/chat-ttt.js");
  const css=await read("assets/css/pages/chat.css");
  assert.match(src,/line=winningLine\(game\.board\|\|\[\]\)/);
  assert.match(src,/const changedCell=paintedGameId===game\.gameId/);
  assert.match(src,/class="chat-ttt-win-line"/);
  assert.match(src,/viewBox="0 0 300 300"/);
  assert.match(src,/class="chat-v2-cell/);
  assert.match(src,/is-new/);
  for(const animation of ["ttt-pop","ttt-draw-line","ttt-turn-pulse",
    "ttt-win-cell","ttt-appear","ttt-invite-float"])
    assert.ok(css.includes(animation),animation);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/focus-visible/);
  assert.match(css,/touch-action:manipulation/);
});
test("Assets use fresh versions without changing Gartic or calls",async()=>{
  const html=await read("chat.html");
  const runtime=await read("assets/js/chat.js");
  const enhanced=await read("src/chat-enhancements.js");
  assert.match(html,/chat-features\.css/);
  assert.match(html,/chat\.js\?v=ttt-clean-20261103/);
  assert.match(runtime,/chat-enhancements\.js\?v=ttt-clean-20261103/);
  assert.match(enhanced,/chat-ttt\.js\?v=ttt-clean-20261103/);
  assert.match(enhanced,/setupChatGartic/);
  assert.match(runtime,/setupChatCalls/);
});
