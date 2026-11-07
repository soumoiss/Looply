import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const model=read('docs/mensagens-premium/modelo-mensagens-premium.html');
const newCss=read('assets/css/pages/chat-reference-complete.css');
const ui=read('src/chat-reference-complete.js');
const premium=read('src/chat-premium.js');
const bridge=read('src/chat.js');

test('Official model CSS, avatar, quick-actions and drawer supplied, not demo people',()=>{
  for(const fragment of ['.dr{','.qa{','.opt{','.sw{','.sws{','.sheet{']){
    assert.ok(model.includes(fragment),fragment+' missing in official model');
    assert.ok(newCss.includes(fragment),fragment+' not transplanted');
  }
  for(const name of ['Personalização','Cor das mensagens','Silenciar notificações','Fixar no topo','Arquivar', 'Mensagens temporárias','Marcar como não lida','Denunciar','Limpar conversa','Excluir conversa','Adicionar participante','Trocar foto do grupo']){
    assert.ok(ui.includes(name),name+' absent from native controller');
  }
  assert.ok(!ui.includes('const C=['),'mock conversation dataset cannot be used');
});

test('Existing Neon media, calls, audio, games, sticker and realtime services remain mounted',()=>{
  const main=read('assets/js/chat.js'),single=read('assets/js/conversation.js');
  for(const entry of [main,single]){
    for(const name of ['setupChatEnhancements','setupChatPremium','setupChatCalls','setupChatRealtime','bindChatEvents','setupOfficialMessagesModel']){
      assert.ok(entry.includes(name),name);
    }
  }
  for(const hook of ['data-chat-group-cover-input','v10_set_group_cover','data-chat-send','data-chat-record-start','data-chat-choose-sticker']) assert.ok(bridge.includes(hook),hook);
  assert.ok(premium.includes('data-model-message-forward'));
  assert.ok(premium.includes('data-model-message-pin'));
  assert.ok(premium.includes('data-model-message-star'));
});

test('Both chat entrypoints load official reference CSS and dynamic module',()=>{
  for(const route of ['chat.html','conversa.html']){assert.match(read(route),/class="conv" id="conv"/);assert.match(read(route),/chat-ultra-live[.]js/);}
  const migration=read('migration/20261104_group_cover_participants.sql');
  assert.match(migration,/JOIN public[.]conversation_participants/);
  assert.match(migration,/msg[.]sender_id=actor/);
  assert.match(migration,/m[.]created_by=actor/);
});

test('Single mobile scroll surface, viewport-anchored thread and no fake report success',()=>{
  assert.match(newCss,/chat-conversation-list[.]list\s*\{overflow:visible!important/);
  assert.match(newCss,/--looply-visible-height/);
  assert.match(ui,/chat_conversation_reports/);
  assert.match(ui,/if\(response.error\|\|!response.data\?\.id\)throw/);
  assert.match(ui,/data-ref-drawer/);
});
