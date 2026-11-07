import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {chatMarkup,threadMarkup,sendChatCard} from "../src/chat.js";
import {makePremiumNote,makePremiumMusic,makePremiumGameCard,parsePremiumChatBody,premiumChatCardMarkup} from "../src/chat-premium-cards.js";

const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const uid="11111111-1111-4111-8111-111111111111";
const chatId="22222222-2222-4222-8222-222222222222";
const song={provider:"apple",id:"123",title:"Canção de teste",artist:"Artista",
  url:"https://music.apple.com/br/album/example/123",previewUrl:"https://audio-ssl.itunes.apple.com/itunes-assets/preview.m4a"};

test("premium note is a real readable message and safely rendered as a letter",()=>{
  const body=makePremiumNote("Um segredo entre nós 💜");
  assert.match(body,/^💌 Bilhete\n/);
  assert.deepEqual(parsePremiumChatBody(body),{type:"note",body:"Um segredo entre nós 💜"});
  assert.match(premiumChatCardMarkup(body),/chat-premium-note-card/);
  assert.ok(premiumChatCardMarkup(makePremiumNote("<img src=x onerror=alert(1)>")).includes("&lt;img"));
  assert.ok(!premiumChatCardMarkup(makePremiumNote("<img src=x onerror=alert(1)>")).includes("<img"));
});
test("music card stores an official playable preview and rejects untrusted links",()=>{
  const body=makePremiumMusic(song);
  assert.match(body,/^🎵 Música:/);
  const parsed=parsePremiumChatBody(body);
  assert.equal(parsed?.type,"music");
  assert.equal(parsed?.previewUrl,song.previewUrl);
  const html=premiumChatCardMarkup(body);
  assert.match(html,/chat-premium-music-card/);
  assert.match(html,/data-chat-premium-play-music/);
  assert.ok(!parsePremiumChatBody("🎵 Música: Fake — Teste\nhttps://evil.example/track"));
  assert.throws(()=>makePremiumMusic({...song,url:"javascript:alert(1)"}));
});
test("game invitation keeps Neon conversation ID and opens existing real Games",()=>{
  const body=makePremiumGameCard(chatId);
  assert.equal(parsePremiumChatBody(body)?.type,"game");
  assert.match(premiumChatCardMarkup(body),/data-v2-game/);
  assert.throws(()=>makePremiumGameCard("../../chat"));
});
test("premium sidebar renders genuine conversations and all required filters",()=>{
  const html=chatMarkup({
    error:false,notifications:[],profiles:[],
    conversations:[{id:chatId,kind:"direct",subject:null,participants:[],lastMessage:null,
      updated_at:"2026-11-03T11:00:00Z",unreadCount:0}]
  },uid);
  for(const value of ["chat-premium","data-chat-premium-stories","data-chat-premium-new",
      'data-chat-filter="all"','data-chat-filter="unread"','data-chat-filter="groups"',
      'data-chat-filter="favorites"','data-chat-filter="archived"',"data-chat-open"]){
    assert.ok(html.includes(value),"missing "+value);
  }
  assert.ok(!html.includes("Luna Marques"),"no demo contacts must leak into application");
});
test("real conversation bubble shows all premium cards without fake timestamps",()=>{
  const message={id:"33333333-3333-4333-8333-333333333333",conversation_id:chatId,
    sender_id:uid,body:makePremiumNote("Olá!"),created_at:"2026-11-03T11:00:00Z",media:[],
    reactions:[{emoji:"❤️",user_id:uid}]};
  const html=threadMarkup([message],uid);
  assert.match(html,/chat-premium-note-card/);
  assert.match(html,/data-chat-premium-react/);
  assert.match(html,/chat-premium-reaction-pill/);
  assert.match(html,/data-chat-premium-reaction-existing/);
  assert.match(html,/chat-message-edit/);
  assert.match(html,/data-chat-reply/);
  assert.match(html,/data-chat-delete/);
});
test("clip menu includes native attachment handlers, Games, Cards and Music",()=>{
  const source=read("src/chat.js"),controller=read("src/chat-premium.js");
  for(const marker of ["data-chat-premium-menu-toggle","data-chat-choose-files",
    "data-chat-premium-camera","data-chat-choose-sticker","data-chat-premium-game",
    "data-chat-premium-share-game","data-chat-premium-note","data-chat-premium-music"]){
    assert.ok(source.includes(marker),marker);
  }
  assert.match(controller,/await sendChatCard/);
  assert.match(controller,/searchStorySongs/);
  assert.match(controller,/makePremiumGameCard/);
  assert.match(controller,/client\.from\("chat_message_reactions"\)/);
  assert.match(read("src/neon-rest-bridge.js"),/chat_message_reactions:/);
});
test("model is styled through global Looply themes and both chat entries",()=>{
  const css=read("assets/css/pages/chat-premium.css");
  for(const token of ["--primary","--surface-strong","--looply-root-font-size",
      "--looply-font-family","chat-premium-history","chat-premium-compose-box",
      "chat-premium-note-card","chat-premium-music-card","@media(max-width:760px)"]){
    assert.ok(css.includes(token),token);
  }
  for(const page of ["chat.html","conversa.html"])
    assert.match(read(page),/assets\/js\/chat-ultra-live\.js/);
  assert.match(read("assets/js/chat.js"),/setupChatPremium\(root, client, user\.id\)/);
  assert.match(read("assets/js/conversation.js"),/setupChatPremium\(root, client, user\.id\)/);
});
test("all modified JavaScript modules parse",()=>{
  for(const name of ["src/chat.js","src/chat-premium.js","src/chat-premium-cards.js",
    "src/chat-enhancements.js","assets/js/chat.js","assets/js/conversation.js"]){
    const result=spawnSync(process.execPath,["--check",new URL("../"+name,import.meta.url).pathname],
      {encoding:"utf8"});
    assert.equal(result.status,0,name+": "+result.stderr);
  }
});

test("cards use the saved-message pipeline and leave the composer's draft, reply and pending attachments alone",async()=>{
  const composer={dataset:{conversationId:chatId},draft:"Meu rascunho",replyTo:"outra mensagem",files:["foto.jpg"]};
  const saved=[];
  const root=new EventTarget();
  root.querySelector=()=>composer;
  root.addEventListener("looply:chat-message-saved",event=>saved.push(event.detail.conversationId));
  const body=makePremiumNote("Uma carta");
  const client={from(table){
    assert.equal(table,"chat_messages");
    return {insert(record){
      assert.deepEqual(record,{conversation_id:chatId,sender_id:uid,body,reply_to:null});
      return {select(){return {async single(){return {data:{id:uid},error:null};}};}};
    }};
  }};
  await sendChatCard(root,client,uid,composer,body);
  assert.deepEqual(saved,[chatId]);
  assert.deepEqual([composer.draft,composer.replyTo,composer.files],["Meu rascunho","outra mensagem",["foto.jpg"]]);
  root.querySelector=()=>null;
  await assert.rejects(sendChatCard(root,client,uid,composer,body),/Abra a conversa novamente/);
  assert.deepEqual(saved,[chatId]);
});

test("a failed card insert does not announce a saved message",async()=>{
  const composer={dataset:{conversationId:chatId}};
  const root={querySelector:()=>composer,dispatchEvent:()=>assert.fail("Unexpected saved event")};
  const failure=new Error("offline");
  const client={from:()=>({insert:()=>({select:()=>({single:async()=>({error:failure})})})})};
  await assert.rejects(sendChatCard(root,client,uid,composer,makePremiumNote("Uma carta")),failure);
});

test("tracks without a preview keep their official link without a misleading play button",()=>{
  const html=premiumChatCardMarkup(makePremiumMusic({...song,previewUrl:""}));
  assert.match(html,/chat-premium-music-provider/);
  assert.doesNotMatch(html,/data-chat-premium-play-music/);
});
