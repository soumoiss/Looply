import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fortalezaInstant} from "../src/scheduled-letters.js";
import {dispatchScheduledLetters} from "../backend/cloudflare/android-push-worker.mjs";

const read = path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Fortaleza date/time becomes an unambiguous UTC instant",()=>{
  assert.equal(fortalezaInstant("2027-12-31","23:30"),"2028-01-01T02:30:00.000Z");
  assert.equal(fortalezaInstant("2027-01-01","00:00"),"2027-01-01T03:00:00.000Z");
  assert.throws(()=>fortalezaInstant("2020-01-01","08:00"),/futuros/);
  assert.throws(()=>fortalezaInstant("2027-12-31","25:00"),/válidos/);
  assert.throws(()=>fortalezaInstant("2027-12-31",""),/válidos/);
});

test("Cron dispatcher uses the restricted Neon query and returns counters",async()=>{
  const requests=[];
  const query=async(env,sql,params)=>{
    requests.push({env,sql,params});
    return [{processed:2,delivered:1,failed:1}];
  };
  const env={NEON_PUSH_DATABASE_URL:"private"};
  const result=await dispatchScheduledLetters(env,{query});
  assert.deepEqual(result,{processed:2,delivered:1,failed:1});
  assert.deepEqual(requests,[{env,sql:"SELECT processed,delivered,failed FROM public.v24_dispatch_scheduled_letters($1)",params:[50]}]);
});

test("Additive migration protects pending letters and idempotent delivery",async()=>{
  const sql=await read("migration/20261031_scheduled_letters.sql");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.scheduled_letters/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/sender_id = \(SELECT public\.looply_legacy_uid\(\)\)/);
  assert.match(sql,/UNIQUE \(sender_id,request_id\)/);
  assert.match(sql,/FOR UPDATE SKIP LOCKED/);
  assert.match(sql,/ON CONFLICT DO NOTHING RETURNING id INTO v_letter_id/);
  assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS community_letters_scheduled_letter_uidx/);
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.v24_dispatch_scheduled_letters\(integer\) TO looply_push_relay_limited/);
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE TABLE|DELETE FROM public\.community_letters/i);
});

test("Sender-only history and notifications are not created before delivery",async()=>{
  const sql=await read("migration/20261031_scheduled_letters.sql");
  const code=await read("backend/cloudflare/android-push-worker.mjs");
  assert.match(sql,/CREATE POLICY scheduled_event_sender_select/);
  assert.match(sql,/INSERT INTO public\.community_letters[\s\S]*SELECT sender_id,recipient_id/);
  assert.match(code,/await dispatchScheduledLetters\(env\);[\s\S]*await deliverNotifications\(env\);/);
  assert.doesNotMatch(code,/password_ciphertext.*notification/i);
});

test("Existing normal letter path and new scheduled filter both remain",async()=>{
  const source=await read("assets/js/letters.js");
  const module=await read("src/scheduled-letters.js");
  assert.match(source,/client\.from\("community_letters"\)\.insert\(payload\)/);
  assert.match(source,/installScheduledLetters/);
  assert.match(module,/data\.filter="programadas"|filter\.dataset\.filter="programadas"/);
  assert.match(module,/stopImmediatePropagation\(\)/);
  assert.match(module,/v24_create_scheduled_letter/);
  assert.match(module,/v24_update_scheduled_letter/);
  assert.match(module,/v24_cancel_scheduled_letter/);
});
