import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {winningLine,tttDisplayName,tttScore} from "../src/chat-ttt.js";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const uid="00000000-0000-4000-8000-000000000001";
const peer="00000000-0000-4000-8000-000000000002";
const board=(indexes,mark="X")=>Array.from({length:9},(_,i)=>indexes.includes(i)?mark:"");

test("eight horizontal, vertical and diagonal wins mark exactly the three winning cells",()=>{
  const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for(const line of lines){
    assert.deepEqual(winningLine(board(line)),line);
    assert.deepEqual(winningLine(board(line,"O")),line);
  }
  assert.deepEqual(winningLine(board([0,4,5])),[]);
  assert.deepEqual(winningLine(["X","O","X","O","X","O","O","X","O"]),[]);
  assert.deepEqual(winningLine([]),[]);
});

test("player name uses actual profile display name with @username fallback",()=>{
  assert.equal(tttDisplayName({id:uid,name:"Bielzinho",username:"patati"}),"Bielzinho");
  assert.equal(tttDisplayName({username:"peixinho"}),"peixinho");
  assert.equal(tttDisplayName({name:"",username:""}),"Usuário");
});

test("scores track verified immutable player IDs even if X/O change on rematch",()=>{
  const game={xPlayer:uid,oPlayer:peer,score:{x:5,o:2,draws:1}};
  assert.deepEqual(tttScore(game,uid),{x:5,o:2,draws:1,own:5});
  assert.deepEqual(tttScore(game,peer),{x:5,o:2,draws:1,own:2});
  assert.deepEqual(tttScore({...game,xPlayer:peer,oPlayer:uid,score:{x:2,o:5,draws:1}},uid),
    {x:2,o:5,draws:1,own:5});
});

test("production results remain intact and only the server can count completed games",async()=>{
  const sql=await read("migration/20261031_v25_authoritative_ttt.sql");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.looply_ttt_games/);
  assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS looply_ttt_one_live_game_per_conversation/);
  assert.match(sql,/CREATE POLICY looply_ttt_verified_participants_read/);
  assert.match(sql,/CREATE POLICY looply_ttt_results_verified_participants_read/);
  assert.match(sql,/REVOKE INSERT,UPDATE,DELETE ON public\.chat_ttt_results FROM authenticated/);
  assert.match(sql,/INSERT INTO public\.chat_ttt_results/);
  assert.match(sql,/ON CONFLICT \(game_id\) DO NOTHING/);
  assert.doesNotMatch(sql,/\b(?:DROP TABLE|DELETE FROM public\.chat_ttt_results|TRUNCATE public\.chat_ttt_results)\b/i);
  assert.match(sql,/WHERE r\.conversation_id=g\.conversation_id/);
  assert.match(sql,/r\.x_player=g\.o_player AND r\.o_player=g\.x_player/);
});

test("invite, accept and rematch validate authenticated real pair and original inviter",async()=>{
  const sql=await read("migration/20261031_v25_authoritative_ttt.sql");
  assert.match(sql,/SELECT public\.looply_legacy_uid\(\)/);
  assert.match(sql,/c\.kind='direct'/);
  assert.match(sql,/n<>2 OR peer IS NULL/);
  assert.match(sql,/invited_by uuid NOT NULL/);
  assert.match(sql,/actor=g\.invited_by/);
  assert.match(sql,/next_x:=COALESCE\(g\.winner_id,g\.o_player\)/);
  assert.match(sql,/previous_game_id uuid UNIQUE/);
  assert.match(sql,/ON CONFLICT DO NOTHING RETURNING id INTO new_id/);
});

test("moves are serialized with row locks and validate turn, occupied cell and terminal result",async()=>{
  const sql=await read("migration/20261031_v25_authoritative_ttt.sql");
  const index=sql.indexOf("CREATE OR REPLACE FUNCTION public.v25_ttt_move");
  const end=sql.indexOf("CREATE OR REPLACE FUNCTION public.v25_ttt_rematch",index);
  const mover=sql.slice(index,end);
  assert.match(mover,/FOR UPDATE/);
  assert.match(mover,/actor<>g\.turn_player/);
  assert.match(mover,/p_cell NOT BETWEEN 0 AND 8/);
  assert.match(mover,/g\.board\[p_cell\+1\]<>''/);
  assert.match(mover,/FOREACH line SLICE 1/);
  assert.match(mover,/updated_board\[line\[1\]\]=updated_board\[line\[2\]\]/);
  assert.match(mover,/array_position\(updated_board,''\) IS NULL/);
  assert.ok(mover.indexOf("UPDATE public.looply_ttt_games")<
    mover.indexOf("INSERT INTO public.chat_ttt_results"));
  assert.match(mover,/ON CONFLICT \(game_id\) DO NOTHING/);
});

test("secure read/write routing does not change message or call signaling",async()=>{
  const [bridge,client,controller,chat]=await Promise.all([
    read("src/neon-production-client.js"),read("src/chat-enhancements.js"),
    read("src/chat-ttt.js"),read("src/chat-calls.js")
  ]);
  for(const key of ["v25_ttt_state","v25_ttt_invite","v25_ttt_accept",
    "v25_ttt_decline","v25_ttt_move","v25_ttt_rematch"])
    assert.ok(bridge.includes(key),key);
  assert.match(bridge,/activeSession\(\)/);
  assert.match(client,/setupChatTtt/);
  assert.match(client,/game\.handleClick\(target\)/);
  assert.doesNotMatch(client,/record_chat_ttt_result/);
  assert.doesNotMatch(client,/gameState\s*=\s*payload\.state/);
  assert.match(controller,/v25_ttt_state/);
  assert.match(controller,/v25_ttt_move/);
  assert.match(controller,/v25_ttt_rematch/);
  assert.match(controller,/data-ttt-avatar/);
  assert.match(controller,/client\.storage\.from\("looply-avatars"\)/);
  assert.match(controller,/data-v2-scoreboard/);
  assert.match(controller,/setInterval/);
  assert.match(controller,/clearInterval/);
  assert.match(chat,/data-call-accept/);
});

test("Cloudflare broadcasts only invalidation hints, not fabricated board or results",async()=>{
  const controller=await read("src/chat-ttt.js");
  assert.match(controller,/payload:\{type:"updated",gameId,conversationId\}/);
  assert.match(controller,/void refresh\(\)/);
  assert.doesNotMatch(controller,/gameState\s*=\s*payload/);
  assert.doesNotMatch(controller,/senderName/);
});

test("mobile styles ensure readable identities, three-by-three board and touch targets",async()=>{
  const [css,html,wrapper]=await Promise.all([
    read("assets/css/pages/chat.css"),read("chat.html"),read("assets/js/chat.js")
  ]);
  assert.match(css,/chat-ttt-players \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/chat-ttt-identity strong/);
  assert.match(css,/text-overflow:ellipsis/);
  assert.match(css,/chat-ttt-game \.chat-v2-board/);
  assert.match(css,/@media\(max-width:360px\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(html,/chat\.css\?v=20261031/);
  assert.match(wrapper,/chat-enhancements\.js\?v=ttt-neon-20261031/);
});
