import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {letterLogRowMarkup,formatLogTimestamp} from "../src/admin-letter-log.js";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");

test("migration logs letter events silently and notifies story views",async()=>{
  const sql=await read("migration/20261105_admin_letter_access_log_story_views.sql");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.looply_admin_letter_access_log/);
  assert.match(sql,/lower\(p\.username\) = 'peixinho'/);
  assert.match(sql,/DELETE FROM public\.looply_admin_activity_notifications\s+WHERE kind IN \('admin_letter_read','admin_private_unlock'\)/);
  assert.doesNotMatch(sql,/INSERT INTO public\.letter_event_notifications/);
  assert.match(sql,/'story_view'/);
  assert.match(sql,/WHERE n\.kind='admin_online'/);
  assert.doesNotMatch(sql,/NOT BETWEEN (7|1) AND 256|length\(p_password\) > 256/);
});
test("letter password inputs and validation have no length limits",async()=>{
  const letters=await read("assets/js/letters.js");
  assert.doesNotMatch(letters,/password\.length > 256|7 a 256|entre 8 e 256/);
  assert.doesNotMatch(letters,/<input[^>]*type=\\?"password\\?"[^>]*(min|max)length/);
});
test("ADM log row shows user, letter and exact time",()=>{
  const html=letterLogRowMarkup({event_kind:"unlock",letter_label:"Para você <b>",created_at:"2026-11-05T17:32:07Z",actor:{username:"ana",display_name:"Ana"}});
  assert.match(html,/Ana/);assert.match(html,/desbloqueou/);assert.match(html,/&lt;b&gt;/);
  assert.equal(formatLogTimestamp("2026-11-05T17:32:07Z"),"05/11/2026 às 14:32:07");
});
