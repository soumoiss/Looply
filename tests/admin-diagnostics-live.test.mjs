import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/admin-model-live.js', import.meta.url), 'utf8');

test('ADM backend health probes require the authenticated session and use real read-only requests', () => {
  const begin = source.indexOf('async function dbHealth(root){');
  const end = source.indexOf('function stickers(root){', begin);
  assert.ok(begin > 0 && end > begin, 'authenticated backend diagnostic is present');
  const block = source.slice(begin, end);
  for(const item of ["callAction('status')", "callAction('users_list')", "callAction('broadcast_list')", "readResource('audit')", "panelAction('reports_list')", "panelAction('word_list')", "safeQuery('profiles')", "directRead('looply_admin_letter_access_log'"]){
    assert.ok(block.includes(item), `missing real probe: ${item}`);
  }
  assert.doesNotMatch(block, /Math\.random\s*\(|Date\.now\s*\(/);
  assert.doesNotMatch(block, /callAction\('(?:user_set_suspended|user_restore_access|delete_content|broadcast_create|app_settings_update)'\)/);
  assert.match(block, /succeeded.*probes\.length/);
});

test('ADM never interprets an invalid backend response as an empty successful list', () => {
  assert.match(source, /Resposta administrativa inválida/);
  assert.match(source, /if\(!verified\)throw Error\('Acesso administrativo não autorizado'\)/);
});
