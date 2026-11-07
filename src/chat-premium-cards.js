import { normalizeStorySong } from "./story-music-catalog.js";

const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const NOTE="💌 Bilhete\n";
const LETTER="💌 Carta Looply/1\n";
const CONTACT="👤 Contato Looply/1\n";
const LOCATION="📍 Local Looply/1\n";
const POLL="📊 Enquete Looply/1\n";
const POLL_VOTES=["❤️","😂","😮","😢","🙏","👍"];
const PAPER_COLORS=Object.freeze({cream:"#faf1df",rose:"#fff0f4",lavender:"#f2edff",sky:"#edf6ff"});
const MUSIC="🎵 Música: ";

export function safeMusicArtwork(value){
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["mzstatic.com","dzcdn.net","i.scdn.co"].some(host => url.hostname === host || url.hostname.endsWith("."+host)) ? url.href : "";
  } catch { return ""; }
}

export function makePremiumNote(text){
  const value=String(text||"").trim().slice(0,1200);
  if(!value)throw Error("Escreva um bilhete antes de enviar.");
  return NOTE+value;
}
/** Envelope payload fits the existing 5k-character authenticated chat_messages.body limit. */
export function makePremiumLetter({title,body,signature="",paper="cream",seal="💌"}={}) {
  const record={v:1,
    title:String(title??"").trim().slice(0,100),
    body:String(body??"").trim(),
    signature:String(signature??"").trim().slice(0,80),
    paper:Object.hasOwn(PAPER_COLORS,paper)?paper:"cream",
    seal:String(seal??"💌").trim().slice(0,16)||"💌"};
  if(record.body.length<2||record.body.length>4200)throw Error("A carta precisa ter entre 2 e 4.200 caracteres.");
  if(!record.title)throw Error("Dê um título à carta.");
  const encoded=LETTER+JSON.stringify(record);
  if(encoded.length>5000)throw Error("Reduza o texto da carta para enviá-la.");
  return encoded;
}
export function parsePremiumLetter(value){
  const text=String(value??"");
  if(!text.startsWith(LETTER)||text.length>5000)return null;
  try {
    const data=JSON.parse(text.slice(LETTER.length));
    if(!data||data.v!==1||typeof data.body!=="string"||typeof data.title!=="string"||
       typeof data.signature!=="string"||typeof data.seal!=="string"||
       !Object.hasOwn(PAPER_COLORS,data.paper)||!data.title.trim()||
       data.title.length>100||data.body.trim().length<2||data.body.length>4200||
       data.signature.length>80||data.seal.length>16) return null;
    return {type:"letter",title:data.title,body:data.body,signature:data.signature,paper:data.paper,seal:data.seal};
  }catch{return null;}
}
export function makePremiumContact({id,name,username}={}){
  const record={v:1,id:String(id??""),name:String(name??"").trim().slice(0,90),username:String(username??"").trim().slice(0,40)};
  if(!/^[0-9a-f-]{36}$/i.test(record.id)||!record.name||!record.username)
    throw Error("Selecione um perfil válido da lista.");
  return CONTACT+JSON.stringify(record);
}
export function makePremiumLocation(place){
  const label=String(place??"").trim().slice(0,180);
  if(label.length<3)throw Error("Digite um local ou endereço.");
  return LOCATION+JSON.stringify({v:1,label});
}
export function makePremiumPoll({question,options}={}){
  const q=String(question??"").trim().slice(0,240);
  const list=Array.isArray(options)?options.map(x=>String(x??"").trim()).filter(Boolean):[];
  if(q.length<3||list.length<2||list.length>6||list.some(x=>x.length>95))
    throw Error("A enquete exige pergunta e de 2 a 6 alternativas (até 95 caracteres).");
  if(new Set(list.map(x=>x.toLocaleLowerCase("pt-BR"))).size!==list.length)
    throw Error("Use alternativas diferentes.");
  return POLL+JSON.stringify({v:1,question:q,options:list});
}
export function makePremiumGameCard(conversationId){
  const id=String(conversationId||"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(id))throw Error("Abra uma conversa válida para convidar alguém.");
  return "🎮 Convite para jogar no Looply\n"+id;
}
export function makePremiumMusic(track){
  const song=normalizeStorySong(track);
  if(!song)throw Error("Selecione uma música de um catálogo oficial.");
  return MUSIC+song.title+" — "+song.artist+"\n"+song.url+(song.previewUrl?"\n▶ "+song.previewUrl:"")+(safeMusicArtwork(song.artwork)?"\n▧ "+safeMusicArtwork(song.artwork):"");
}
export function parsePremiumChatBody(value){
  const text=String(value||"");
  const letter=parsePremiumLetter(text);
  if(letter)return letter;
  if(text.startsWith(POLL)&&text.length<=1300){
    try{
      const p=JSON.parse(text.slice(POLL.length));
      if(p.v===1&&typeof p.question==="string"&&p.question.trim().length>=3&&p.question.length<=240&&
        Array.isArray(p.options)&&p.options.length>=2&&p.options.length<=6&&
        p.options.every(x=>typeof x==="string"&&x.length>0&&x.length<=95))
        return {type:"poll",question:p.question,options:p.options};
    }catch{return null;}
    return null;
  }
  if(text.startsWith(CONTACT)&&text.length<=500){
    try {
      const d=JSON.parse(text.slice(CONTACT.length));
      if(d.v===1&&/^[0-9a-f-]{36}$/i.test(d.id)&&typeof d.name==="string"&&d.name.length<=90&&d.name.trim()&&
         typeof d.username==="string"&&d.username.length<=40&&d.username.trim())
        return {type:"contact",id:d.id,name:d.name,username:d.username};
    }catch{return null;}
    return null;
  }
  if(text.startsWith(LOCATION)&&text.length<=500){
    try {
      const d=JSON.parse(text.slice(LOCATION.length));
      if(d.v===1&&typeof d.label==="string"&&d.label.trim().length>=3&&d.label.length<=180)
        return {type:"location",label:d.label};
    }catch{return null;}
    return null;
  }
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
    if(lines.length<2||lines.length>4)return null;
    const subtitle=lines[0];
    const split=subtitle.lastIndexOf(" — ");
    if(split<1)return null;
    const title=subtitle.slice(0,split).trim(),artist=subtitle.slice(split+3).trim();
    const url=lines[1].trim();
    const previewUrl=lines.slice(2).find(line=>line.startsWith("▶ "))?.slice(2).trim()||"";
    const artwork=safeMusicArtwork(lines.slice(2).find(line=>line.startsWith("▧ "))?.slice(2).trim());
    if(lines.slice(2).some(line=>!line.startsWith("▶ ")&&!line.startsWith("▧ ")))return null;
    if(title.length>110||artist.length>100||!title||!artist)return null;
    for(const provider of ["apple","deezer","spotify"]){
      const song=normalizeStorySong({provider,title,artist,url,previewUrl,artwork});
      if(song)return {type:"music",...song};
    }
  }
  return null;
}
export function premiumChatCardMarkup(body,reactions=[],messageId="",userId=""){
  const card=parsePremiumChatBody(body);
  if(!card)return "";
  if(card.type==="game")
    return '<section class="chat-premium-game-card" aria-label="Convite para jogar">'+
      '<span class="chat-premium-game-icon" aria-hidden="true">🎮</span>'+
      '<div><small>Looply Games</small><strong>Vamos jogar?</strong><span>Jogo da Velha e Gartic</span></div>'+
      '<button type="button" data-v2-game data-chat-premium-game aria-label="Abrir jogos desta conversa">Jogar</button></section>';
  if(card.type==="letter")
    return '<details class="chat-premium-note-card chat-ultra-letter-card" aria-label="Carta selada: '+escapeHtml(card.title)+'" style="--chat-ultra-paper:'+PAPER_COLORS[card.paper]+'">' +
      '<summary class="chat-envelope-toggle"><span class="chat-envelope" aria-hidden="true">'+
      '<span class="chat-envelope-back"></span><span class="chat-envelope-slip"></span><span class="chat-envelope-flap"></span>'+
      '<span class="chat-envelope-front"></span><span class="chat-envelope-seal">'+escapeHtml(card.seal)+'</span>'+
      '<span class="chat-envelope-sparks">✧ <i>♡</i> ✦</span></span>'+
      '<span class="chat-premium-card-kicker"><span class="chat-envelope-closed-label">💌 '+escapeHtml(card.title)+'</span><span class="chat-envelope-open-label">Fechar carta</span></span></summary>'+
      '<div class="chat-letter-paper"><h3 class="chat-ultra-letter-title">'+escapeHtml(card.title)+'</h3>'+
      '<p class="chat-premium-note-body">'+escapeHtml(card.body)+'</p><span class="chat-letter-signature">'+escapeHtml(card.signature)+'</span></div></details>';
  if(card.type==="poll"){
    const rows=Array.isArray(reactions)?reactions.filter(r=>r&&POLL_VOTES.includes(r.emoji)):[];
    const total=rows.length;
    return '<section class="chat-ultra-poll-card" aria-label="Enquete da conversa">'+
      '<small>📊 Enquete</small><strong>'+escapeHtml(card.question)+'</strong><div class="chat-ultra-poll-options">'+
      card.options.map((label,index)=>{
        const emoji=POLL_VOTES[index],votes=rows.filter(r=>r.emoji===emoji).length;
        const selected=rows.some(r=>r.emoji===emoji&&r.user_id===userId);
        const percentage=total?Math.round(votes*100/total):0;
        return '<button type="button" data-chat-premium-reaction-existing="'+emoji+'" data-chat-premium-message-id="'+escapeHtml(messageId)+
          '" aria-pressed="'+String(selected)+'" class="chat-ultra-poll-option'+(selected?' is-selected':'')+'">'+
          '<span class="chat-ultra-poll-progress" style="width:'+percentage+'%"></span>'+
          '<span>'+escapeHtml(label)+'</span><small>'+votes+' · '+percentage+'%</small></button>';
      }).join('')+'</div><small>'+total+' voto'+(total===1?'':'s')+' · Toque para votar ou retirar seu voto</small></section>';
  }
  if(card.type==="contact")
    return '<a class="chat-ultra-contact-card" href="perfil.html?usuario='+encodeURIComponent(card.id)+'" aria-label="Abrir perfil de '+escapeHtml(card.name)+'">'+
      '<span class="chat-ultra-card-emoji" aria-hidden="true">👤</span><span><small>Contato Looply</small><strong>'+escapeHtml(card.name)+'</strong><small>@'+escapeHtml(card.username)+'</small></span><span aria-hidden="true">›</span></a>';
  if(card.type==="location")
    return '<a class="chat-ultra-location-card" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(card.label)+'" target="_blank" rel="noopener noreferrer">'+
      '<span class="chat-ultra-card-emoji" aria-hidden="true">📍</span><span><small>Local compartilhado</small><strong>'+escapeHtml(card.label)+'</strong><small>Abrir no mapa</small></span></a>';
  if(card.type==="note")
    return '<details class="chat-premium-note-card" aria-label="Bilhete enviado">' +
      '<summary class="chat-envelope-toggle"><span class="chat-envelope" aria-hidden="true">'+
      '<span class="chat-envelope-back"></span><span class="chat-envelope-slip"></span><span class="chat-envelope-flap"></span>'+
      '<span class="chat-envelope-front"></span><span class="chat-envelope-seal">♥</span>'+
      '<span class="chat-envelope-sparks">✧ <i>♡</i> ✦</span></span>'+
      '<span class="chat-premium-card-kicker"><span class="chat-envelope-closed-label">Abrir bilhete</span><span class="chat-envelope-open-label">Guardar bilhete</span></span></summary>'+
      '<div class="chat-letter-paper"><span class="chat-letter-greeting">Para você,</span>'+
      '<p class="chat-premium-note-body">'+escapeHtml(card.body)+'</p><span class="chat-letter-signature" aria-hidden="true">Com carinho ♡</span></div></details>';

  return '<section class="chat-premium-music-card" aria-label="Música compartilhada">' +
    (safeMusicArtwork(card.artwork)?'<img class="chat-premium-music-cover" src="'+escapeHtml(safeMusicArtwork(card.artwork))+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="chat-premium-music-cover" aria-hidden="true">♫</span>') +
    '<div class="chat-premium-music-info"><small>Música · '+escapeHtml(card.provider.toUpperCase())+'</small>' +
    '<strong>'+escapeHtml(card.title)+'</strong><span>'+escapeHtml(card.artist)+'</span></div>' +
    (card.previewUrl ? '<button type="button" class="chat-premium-music-play" data-chat-premium-play-music="'+escapeHtml(card.previewUrl)+'" ' +
    'aria-label="Ouvir prévia da música '+escapeHtml(card.title)+'">▶</button>' : '') +
    '<a class="chat-premium-music-provider" href="'+escapeHtml(card.url)+'" target="_blank" rel="noopener noreferrer">Abrir no serviço ↗</a>' +
    '</section>';
}
