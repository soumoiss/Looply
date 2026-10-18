import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const read = (path) => readFile(resolve(process.cwd(), path), "utf8");

test("feed sharing and private replies send messages through the authenticated chat backend", async () => {
  const social = await read("src/social.js");
  const edge = await read("supabase/functions/looply-chat/index.ts");
  assert.match(social, /action: "share_post", mode: "share", targetId, postId/);
  assert.match(social, /action: "share_post", mode: "private_reply", targetId: authorId, postId, body:/);
  assert.match(social, /window\.prompt\("Escreva sua resposta privada à publicação:/);
  assert.match(edge, /payload\.action === "share_post"/);
  assert.match(edge, /create_direct_conversation/);
  assert.match(edge, /from\("chat_messages"\)\.insert/);
  assert.match(edge, /post_author_mismatch/);
  assert.match(edge, /post\.visibility === "selected"/);
});

test("chat post sharing validates authenticated participants and content visibility before inserting a message", async () => {
  const edge = await read("supabase/functions/looply-chat/index.ts");
  assert.match(edge, /authData\.user\.id/);
  assert.match(edge, /uuidPattern\.test\(targetId\).*uuidPattern\.test\(postId\)/s);
  assert.match(edge, /recipient_id", authData\.user\.id/);
  assert.match(edge, /sender_id: authData\.user\.id/);
  assert.match(edge, /replyBody\.length > 2000/);
});
