import { normalizeStorySong } from "./story-music-catalog.js";

const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const NOTE="💌 Bilhete\n";
const MUSIC="🎵 Música: ";

export function makePremiumNote(text){
  const value=String(text||"").trim().slice(0,1200);
  if(!value)throw Error("Escreva um bilhete antes de enviar.");
  return NOTE+value;
}
export function makePremiumGameCard(conversationId){
  const id=String(conversationId||"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(id))throw Error("Abra uma conversa válida para convidar alguém.");
  return "🎮 Convite para jogar no Looply\n"+id;
}
export function makePremiumMusic(track){
  const song=normalizeStorySong(track);
  if(!song)throw Error("Selecione uma música de um catálogo oficial.");
  return MUSIC+song.title+" — "+song.artist+"\n"+song.url+(song.previewUrl?"\n▶ "+song.previewUrl:"");
}
export function parsePremiumChatBody(value){
  const text=String(value||"");
  if(text.startsWith("🎮 Convite para jogar no Looply\n")){
    const conversationId=text.split("\n")[1];
    if(/^[0-9a-f-]{36}$/i.test(conversationId))return {type:"game",conversationId};
  }
  if(text.startsWith(NOTE)){
    const body=text.slice(NOTE.length).trim();
    if(body&&body.length<=1200)return {type:"note",body};
  }
  if(text.startsWith(MUSIC)){
    const lines=text.slice(MUSIC.length).split("\n");
    if(lines.length<2||lines.length>3)return null;
    const subtitle=lines[0];
    const split=subtitle.lastIndexOf(" — ");
    if(split<1)return null;
    const title=subtitle.slice(0,split).trim(),artist=subtitle.slice(split+3).trim();
    const url=lines[1].trim();
    const previewUrl=lines[2]?.startsWith("▶ ")?lines[2].slice(2).trim():"";
    if(title.length>110||artist.length>100||!title||!artist)return null;
    for(const provider of ["apple","deezer","spotify"]){
      const song=normalizeStorySong({provider,title,artist,url,previewUrl});
      if(song)return {type:"music",...song};
    }
  }
  return null;
}
export function premiumChatCardMarkup(body){
  const card=parsePremiumChatBody(body);
  if(!card)return "";
  if(card.type==="game")
    return '<section class="chat-premium-game-card" aria-label="Convite para jogar">'+
      '<span class="chat-premium-game-icon" aria-hidden="true">🎮</span>'+
      '<div><small>Looply Games</small><strong>Vamos jogar?</strong><span>Jogo da Velha e Gartic</span></div>'+
      '<button type="button" data-v2-game data-chat-premium-game aria-label="Abrir jogos desta conversa">Jogar</button></section>';
  if(card.type==="note")
    return '<section class="chat-premium-note-card" aria-label="Bilhete enviado">' +
      '<span class="chat-premium-card-kicker">💌 &nbsp; Um bilhete para você</span>' +
      '<p class="chat-premium-note-body">'+escapeHtml(card.body)+'</p>' +
      '<span class="chat-premium-note-seal" aria-hidden="true">✉</span></section>';

  return '<section class="chat-premium-music-card" aria-label="Música compartilhada">' +
    '<span class="chat-premium-music-cover" aria-hidden="true">♫</span>' +
    '<div class="chat-premium-music-info"><small>Música · '+escapeHtml(card.provider.toUpperCase())+'</small>' +
    '<strong>'+escapeHtml(card.title)+'</strong><span>'+escapeHtml(card.artist)+'</span></div>' +
    (card.previewUrl ? '<button type="button" class="chat-premium-music-play" data-chat-premium-play-music="'+escapeHtml(card.previewUrl)+'" ' +
    'aria-label="Ouvir prévia da música '+escapeHtml(card.title)+'">▶</button>' : '') +
    '<a class="chat-premium-music-provider" href="'+escapeHtml(card.url)+'" target="_blank" rel="noopener noreferrer">Abrir no serviço ↗</a>' +
    '</section>';
}
