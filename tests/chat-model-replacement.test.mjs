import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compactChatTime,messageComposerMarkup,threadMarkup} from '../src/chat.js';
import {makePremiumNote,makePremiumMusic,parsePremiumChatBody,premiumChatCardMarkup,safeMusicArtwork} from '../src/chat-premium-cards.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const cid='33333333-3333-4333-8333-333333333333';
test('both message entrypoints ship the model without any old layout overlay',()=>{
  for(const page of ['chat.html','conversa.html']){
    const source=read(page);
    assert.doesNotMatch(source,/href="assets\/css\/pages\/(?:chat|chat-mobile-reference|chat-viewport-catalog|conversation)\.css/);
    for(const file of ['chat-foundation.css','chat-features.css','chat-premium.css'])assert.ok(source.includes(file));
  }
  assert.match(read('assets/css/pages/chat-foundation.css'),/theme-complete\.css.*layer\(looply-foundation\)/);
});
test('a note is a keyboard-operable native envelope with escaped content and cursive paper',()=>{
  const html=premiumChatCardMarkup(makePremiumNote('<script>alert(1)</script>\nCom carinho 💜'));
  assert.match(html,/<details class="chat-premium-note-card"/);
  assert.match(html,/<summary class="chat-envelope-toggle"/);
  assert.match(html,/chat-envelope-flap/);
  assert.match(html,/chat-letter-paper/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
  const css=read('assets/css/pages/chat-premium.css');
  assert.match(css,/rotateX\(180deg\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/font-family:Caveat/);
});
test('music artwork survives persistence and only comes from approved HTTPS providers',()=>{
  const song={provider:'apple',title:'Canção',artist:'Artista',url:'https://music.apple.com/br/album/test/123',artwork:'https://is1-ssl.mzstatic.com/image/thumb/Music/a.jpg',previewUrl:'https://audio-ssl.itunes.apple.com/itunes-assets/a.m4a'};
  const body=makePremiumMusic(song),card=parsePremiumChatBody(body);
  assert.equal(card.artwork,song.artwork);assert.equal(card.previewUrl,song.previewUrl);
  assert.match(premiumChatCardMarkup(body),/<img class="chat-premium-music-cover"/);
  assert.equal(parsePremiumChatBody(makePremiumMusic({...song,previewUrl:''})).artwork,song.artwork);
  for(const url of ['javascript:alert(1)','https://mzstatic.com.evil.test/a','data:image/svg+xml,x','http://is1-ssl.mzstatic.com/a'])assert.equal(safeMusicArtwork(url),'');
  const old=makePremiumMusic({...song,artwork:''});
  assert.equal(parsePremiumChatBody(old).title,'Canção');
  assert.doesNotMatch(premiumChatCardMarkup(old),/<img/);
});
test('timestamps are compact but keep date semantics',()=>{
  assert.equal(compactChatTime('invalid'),'');
  assert.match(compactChatTime('2026-11-03T12:00:00Z',new Date('2026-11-03T16:00:00Z')),/^\d{2}:\d{2}$/);
  assert.match(compactChatTime('2025-01-02T12:00:00Z',new Date('2026-11-03T16:00:00Z')),/^02\/01$/);
});
test('composer and action menus retain all native data hooks behind the model',()=>{
  const composer=messageComposerMarkup(cid);
  for(const hook of ['data-chat-send','data-chat-emoji','data-chat-premium-menu-toggle','data-chat-record-start','data-chat-premium-game','data-chat-premium-note','data-chat-premium-music','name="replyTo"','name="files"'])assert.ok(composer.includes(hook));
  const html=threadMarkup([{id:cid,conversation_id:cid,sender_id:'me',body:'Texto',created_at:'2026-11-03T12:00:00Z',media:[]}],'me');
  assert.match(html,/class="chat-bubble"/);assert.match(html,/data-chat-message-menu/);
  assert.match(html,/class="chat-message-actions-inline" hidden/);
  assert.match(html,/data-chat-edit-open/);assert.match(html,/data-chat-delete/);assert.match(html,/data-chat-reply/);assert.match(html,/data-chat-copy/);
});
