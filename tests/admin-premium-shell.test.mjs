import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL('../'+p,import.meta.url),'utf8');

test('novo painel usa somente a interface do modelo, sem formulário legado',async()=>{
 const html=await read('admin.html');
 assert.match(html,/<canvas id="mx"/);
 assert.match(html,/id="v-home"/);
 assert.match(html,/id="v-mods"/);
 assert.match(html,/id="v-con"/);
 assert.match(html,/id="v-log"/);
 assert.match(html,/Cabin\+Sketch/);
 assert.match(html,/JetBrains\+Mono/);
 assert.match(html,/src="src\/admin-model-live\.js"/);
 assert.doesNotMatch(html,/data-site-header|id="pageContent"|const DB=|dados simulados/);
});
test('sessão real e mutações auditadas, sem confirmação simulada',async()=>{
 const js=await read('src/admin-model-live.js');
 assert.match(js,/activeSession\(\)/);
 assert.match(js,/isAdmin!==true/);
 assert.match(js,/profile\?\.username/);
 assert.match(js,/looplyClient\.functions\.invoke\('looply-admin'/);
 assert.match(js,/v26_admin_panel_action/);
 assert.doesNotMatch(js,/DB\.users|Math\.random\(\).*users|ok\(\).*refreshAll/);
});
test('filtro de mensagens e denúncias validam Peixinho no banco',async()=>{
 const sql=await read('migration/20261108_admin_panel_reports_word_filter.sql');
 assert.match(sql,/v3_self_is_admin\(\)/);
 assert.match(sql,/username\)='peixinho'/);
 assert.match(sql,/CREATE TRIGGER looply_chat_message_word_filter/);
 assert.match(sql,/BEFORE INSERT OR UPDATE OF body/);
 assert.match(sql,/chat_conversation_reports/);
 assert.match(sql,/looply_admin_audit_events/);
});
