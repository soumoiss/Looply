import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = path => readFile(new URL("../"+path,import.meta.url),"utf8");

test("original letters are counted and listed in the received collection without copying records",async()=>{
  const [page,archive,community] = await Promise.all([source("assets/js/letters.js"),source("src/archived-cards.js"),source("src/letters-community.js")]);
  assert.match(page,/received:\[\.\.\.received,\.\.\.originals\]/);
  assert.match(page,/const received=groups\.received\.length/);
  assert.match(page,/\["cartasReceived",received\]/);
  assert.doesNotMatch(page,/data-filter="originais"/);
  assert.match(page,/bindArchivedCards\(root, client/);
  assert.match(archive,/\.range\(from, from \+ 499\)/);
  assert.match(community,/\.range\(from, from \+ 499\)/);
});

test("the model shares global theme tokens and stores new UI state with owner RLS",async()=>{
  const [html,css,page,sql,runtime,nav]=await Promise.all(["cartas.html","assets/css/pages/letters-model.css","assets/js/letters.js","migration/20261106_letter_model_state.sql","src/page-runtime.js","src/primary-navigation.js"].map(source));
  assert.match(html,/letters-model\.css/);
  for(const selector of [".hero",".seg",".env",".sheet",".pick",".letter"]) assert.ok(css.includes(selector));
  assert.match(css,/--strong:var\(--surface-strong\)/);
  assert.match(css,/background:var\(--bg\) !important/);
  assert.match(page,/signProfileAvatars\(client, people\)/);
  assert.match(page,/model_style:modelStyle,view_once:viewOnce/);
  assert.match(page,/looply_letter_ui_state/);
  assert.match(sql,/letter_ui_owner_insert[\s\S]*?looply_legacy_uid\(\)/);
  assert.match(sql,/v27_letter_activity/);
  assert.match(runtime,/header-notifications" href="notificacoes.html"/);
  assert.doesNotMatch(nav,/"notifications","Avisos"/);
});
