import { applyGarticStroke } from "./gartic-paint.js?build=caa8d5b0bdd8905d";
import { attachGarticViewport } from "./gartic-viewport.js?build=caa8d5b0bdd8905d";
// Looply Gartic: server-authoritative word game scoped to an authenticated conversation.
// Shares the existing authenticated Cloudflare "ttt" room for ephemeral drawing/audio signals.
// All words, turns, scores, chat messages and persisted strokes are verified by Neon RPCs.
const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const CATEGORIES = [
  ["animais","🐾","Animais"],["filmes","🎬","Filmes"],["doramas","🎭","Doramas"],
  ["desenhos","🪄","Desenhos"],["objetos","🧸","Objetos"],["comidas","🍕","Comidas"],
  ["verbos","🏃","Ações e verbos"],["profissoes","👩‍🚒","Profissões"],
  ["lugares","🌍","Lugares"],["esportes","🏆","Esportes"],
  ["natureza","🌿","Natureza"],["tecnologia","💻","Tecnologia"]
];
const PALETTE = ["#242432","#7060c8","#f06387","#f5a33b","#eecb3f","#38a67c","#3986c7","#ffffff"];
export function normalizeGarticAnswer(v) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]/g,"");
}
const makeButton = (action,label,primary=false,disabled=false) =>
  '<button type="button" class="gartic-button'+(primary?' is-primary':'')+'" data-gartic-action="'+action+'"'+(disabled?' disabled':'')+'>'+label+'</button>';
const personName = (p) => p?.name || p?.username || "Participante";

export async function invokeGarticAction({client,conversationId,action,value=null,number=null,fetchImpl=fetch}) {
  const api=String(client?.dataApiUrl||"");
  let endpoint;
  try {
    endpoint=new URL(api);
    if(endpoint.protocol!=="https:"||!endpoint.hostname.endsWith(".neon.tech")||
       !endpoint.pathname.endsWith("/rest/v1")||endpoint.username||endpoint.password||
       endpoint.search||endpoint.hash)throw Error("Invalid Neon endpoint");
  } catch { throw Error("gartic_backend_not_configured"); }
  if(!/^[0-9a-f-]{36}$/i.test(String(conversationId||"")))
    throw Error("gartic_conversation_required");
  if(!["create","state","tick","invite","accept","decline","join","start","configure","duration","cycles","hint",
       "guess","chat","stroke","undo","clear","finish"].includes(action))
    throw Error("gartic_action_not_allowed");
  const sessionResult=await client.auth.getSession();
  const token=sessionResult?.data?.session?.access_token;
  if(sessionResult?.error||typeof token!=="string"||token.length<10)
    throw Error("neon_session_required");
  const response=await fetchImpl((api.endsWith("/")?api.slice(0,-1):api)+"/rpc/v26_gartic_action",{
    method:"POST",cache:"no-store",credentials:"omit",
    headers:{"authorization":"Bearer "+token,"content-type":"application/json","accept":"application/json"},
    body:JSON.stringify({p_conversation_id:conversationId,p_action:action,p_value:value,p_number:number}),
    signal:typeof AbortSignal!=="undefined"&&typeof AbortSignal.timeout==="function"
      ?AbortSignal.timeout(12000):undefined
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok){
    const error=new Error(data?.message||"gartic_server_unavailable");
    error.status=response.status;error.code=data?.code||"";
    throw error;
  }
  if(data!==null&&(!data.gameId||!Array.isArray(data.players)))
    throw Error("gartic_invalid_state");
  return data;
}

export function setupChatGartic({root,client,userId,selectedConversation,openModal,closeModal,toast,openTtt}) {
  let conversationId = "", game = null, channel = null, connected = false, pollTimer = null;
  let renderedKey = "", screen = "hub", open = false, busy = false, disposed = false;
  let tool = "pen", color = PALETTE[0], width = 5, drawing = null, localStrokes = [];
  let latestGuessFeedback = "", mediaBooting = false, chatBusy = false;
  const liveChat = new Map();
  let voiceStream = null, voiceJoined = false, voiceMuted = true, remotePeers = new Map();
  let serverDelta = 0, serverTimer = setInterval(updateClock,250);
  const avatarCache = new Map();
  const zoomState = {scale:1,x:0,y:0};
  let canvasViewport = null;
  const gameVisible = () => Boolean(root.querySelector("[data-chat-v2-modal]:not([hidden]) [data-looply-gartic]"));
  const hubVisible = () => Boolean(root.querySelector("[data-chat-v2-modal]:not([hidden]) [data-looply-games-hub]"));
  // Intentionally independent of the legacy client.rpc allowlist: stale cached
  // adapters must never reject newly deployed games before contacting Neon.
  const rpc = (action,value=null,number=null) =>
    invokeGarticAction({client,conversationId,action,value,number});
  const inGame = () => (game?.players || []).some(p => p.id === userId);
  const amDrawer = () => game?.status === "active" && game.drawerId === userId;
  const currentName = (id) => personName((game?.players || []).find(p => p.id===id));
  const sendPacket = async packet => {
    if(!channel || !connected || !game?.gameId) return false;
    try {
      const reply = await channel.send({type:"broadcast",event:"ttt",
        payload:{type:"gartic",gameId:game.gameId,conversationId,senderId:userId,...packet}});
      return reply === "ok";
    } catch {return false;}
  };
  function renderInviteBanner() {
    let banner=root.querySelector("[data-gartic-invitation]");
    const pending=game?.status==="waiting" && game?.inviteStatus==="pending" && !inGame();
    if(!pending || !root.querySelector(".chat-thread-heading")){
      banner?.remove(); return;
    }
    if(!banner){
      banner=document.createElement("div");
      banner.dataset.garticInvitation="";
      banner.className="gartic-invite-banner";
      root.querySelector(".chat-thread-heading").insertAdjacentElement("afterend",banner);
    }
    const inviter=currentName(game.hostId);
    banner.innerHTML='<span class="gartic-invite-icon" aria-hidden="true">🎨</span>'+
      '<div class="gartic-invite-copy"><strong>Convite · Gartic</strong>'+
      '<small>'+escapeHtml(inviter)+' convidou você para jogar.</small></div>'+
      '<button type="button" data-gartic-action="accept">Aceitar</button>'+
      '<button type="button" data-gartic-action="decline">Recusar</button>';
  }
  function renderHub() {
    screen="hub";open=true;
    const group = root.querySelector(".chat-thread-heading")?.dataset.chatKind==="group";
    openModal('<div data-looply-games-hub class="gartic-hub">'+
      '<div class="gartic-eyebrow">🎮 &nbsp; LOOPLY GAMES</div>'+
      '<h2 id="chatV2ModalTitle">Jogos</h2>'+

      '<button type="button" data-gartic-action="ttt" class="gartic-game-card"'+(group?' disabled aria-disabled="true"':'')+'>'+
      '<span class="gartic-game-icon">✕○</span><span><strong>Jogo da Velha</strong><small>'+(group?'Disponível somente em conversas individuais.':'O clássico X e O, com placar salvo.')+'</small></span><span>›</span></button>'+
      '<button type="button" data-gartic-action="gartic" class="gartic-game-card">'+
      '<span class="gartic-game-icon">🎨</span><span><strong>Gartic</strong></span><span>›</span></button></div>');
  }
  function showEmpty() {
    screen="empty";open=true;
    openModal('<div data-looply-gartic class="gartic-shell gartic-intro">'+
      '<div class="gartic-eyebrow">🎮 &nbsp; LOOPLY GAMES</div>'+
      '<div class="gartic-intro-art"><span>✎</span><span>◌</span><span>✦</span></div>'+
      '<h2 id="chatV2ModalTitle">Gartic</h2>'+

      makeButton("create","Criar nova partida",true)+
      '<button type="button" class="gartic-text-action" data-gartic-action="back">Voltar aos jogos</button></div>');
  }
  function renderGame(force=false) {
    if(!game) {showEmpty();return;}
    const previousForm=root.querySelector(".gartic-chat-form input, .gartic-guess-form input");
    const previousDrafts=[...root.querySelectorAll(".gartic-chat-form input, .gartic-guess-form input")].map(el=>({
      cls:el.closest("form")?.className, value:el.value, focused:document.activeElement===el,
      selection:el.selectionStart
    }));
    screen=game.status;open=true;
    const me=inGame(), drawer=amDrawer(), waiting=game.status==="waiting", active=game.status==="active";
    const ended=game.status==="finished", players=game.players||[];
    const safeWord=escapeHtml(drawer?game.word:displayGarticMask(game.masked||""));
    const wordLabel=active?(drawer?'Sua palavra:':'Palavra:'):'';
    const people=players.slice().sort((a,b)=>b.score-a.score).map((p,i)=>
      '<div class="gartic-player'+(p.id===game.drawerId?' is-drawing':'')+'">'+
      '<span class="gartic-player-rank">'+(i+1)+'</span>'+
      '<span class="gartic-avatar" data-gartic-avatar="'+escapeHtml(p.id)+'">'+escapeHtml(personName(p).slice(0,1).toUpperCase())+'</span>'+
      '<span class="gartic-player-name"><strong>'+escapeHtml(personName(p))+'</strong><small>@'+escapeHtml(p.username||"")+'</small></span>'+
      '<span class="gartic-score">'+Number(p.score||0)+' pts</span>'+
      (p.id===game.drawerId?'<span aria-label="Desenhista">✏️</span>':'')+'</div>').join("");
    const categories=CATEGORIES.map(item=>'<option value="'+item[0]+'"'+(item[0]===game.category?' selected':'')+'>'+item[1]+' '+escapeHtml(item[2])+'</option>').join("");
    const chat=(game.chat||[]).map(m=>'<div class="gartic-chat-line"><b>'+escapeHtml(m.name)+'</b> '+escapeHtml(m.body)+'</div>').join("");
    const answered=(game.correct||[]).filter(id=>id!==game.drawerId).length;
    const head='<header class="gartic-head"><div><span class="gartic-eyebrow">🎨 &nbsp; LOOPLY GAMES</span>'+
      '<h2 id="chatV2ModalTitle">Gartic</h2></div>'+
      '<button type="button" data-gartic-action="back" class="gartic-back" aria-label="Voltar aos jogos">✕</button></header>';
    let body="";
    if(waiting){
      body='<div class="gartic-lobby"><div class="gartic-lobby-hero"><span>✦</span>'+
        '<h3>Sala de espera</h3></div>'+
        '<label class="gartic-field">Tema<select data-gartic-category '+(game.hostId===userId?'':'disabled')+'>'+categories+'</select></label>'+
        '<div class="gartic-lobby-config"><label class="gartic-field">Tempo por desenho<select data-gartic-duration '+(game.hostId===userId?'':'disabled')+'>'+
        [45,60,75,90].map(n=>'<option value="'+n+'"'+(n===Number(game.duration)?' selected':'')+'>'+n+' segundos</option>').join('')+'</select></label>'+
        '<label class="gartic-field">Vezes para desenhar<select data-gartic-cycles '+(game.hostId===userId?'':'disabled')+'>'+
        [1,2,3,4,5].map(n=>'<option value="'+n+'"'+(n===Number(game.cycles)?' selected':'')+'>'+n+' vez(es)</option>').join('')+'</select></label></div>'+
        '<div class="gartic-lobby-people"><strong>Participantes · '+players.length+'/6</strong>'+people+'</div>'+
        (game.hostId===userId?'<div class="gartic-candidates">'+(game.inviteCandidates||[]).map(p=>
          '<div class="gartic-candidate"><span class="gartic-avatar" data-gartic-avatar="'+escapeHtml(p.userId)+'">'+escapeHtml((p.name||"?").slice(0,1))+'</span>'+
          '<span class="gartic-candidate-name">'+escapeHtml(p.name||p.username)+'</span>'+
          '<small>'+escapeHtml(p.status==="pending"?"Pendente":p.status==="accepted"?"Aceitou":p.status==="declined"?"Recusou":"")+'</small>'+
          (p.status!=="accepted"?'<button type="button" class="gartic-invite-one" data-gartic-invite-user="'+escapeHtml(p.userId)+'">'+(p.status==="pending"?"Reenviar":"Convidar")+'</button>':'')+
          '</div>').join('')+'</div>':'')+
        '<div class="gartic-invited-people">'+(game.invites||[]).map(p=>
          '<div class="gartic-invite-status"><span>'+escapeHtml(p.name)+'</span><small>'+
          escapeHtml(p.status==='pending'?'Aguardando resposta':p.status==='accepted'?'Aceitou':p.status==='declined'?'Recusou':'Expirou')+'</small></div>').join('')+'</div>'+
        '<div class="gartic-lobby-actions">'+(!me && game.inviteStatus==='pending'
          ?'<div class="gartic-invite-actions">'+makeButton("accept","Aceitar convite",true)+makeButton("decline","Recusar")+'</div>'
          :!me?'<p class="gartic-muted">'+(game.inviteStatus==='declined'?'Você recusou o convite.':'')+'</p>':'')+
        (game.hostId===userId?makeButton("invite","Convidar")+makeButton("start","Iniciar com "+players.length+" jogadores",true,players.length<2):'')+
        '</div></div>';
    } else if(active){
      body='<div class="gartic-main"><div class="gartic-topline">'+
        '<span class="gartic-drawer">✏️ '+escapeHtml(currentName(game.drawerId))+' está desenhando</span>'+
        '<span>Rodada '+game.turn+'/'+(players.length*Number(game.cycles||2))+'</span>'+
        '<strong data-gartic-clock>--:--</strong></div>'+
        '<div class="gartic-word"><small>'+escapeHtml(wordLabel)+'</small><strong>'+safeWord+'</strong>'+
        '<span>'+answered+' acerto(s)</span></div>'+
        '<div class="gartic-canvas-viewport" data-gartic-viewport>'+
          '<canvas width="1000" height="650" class="gartic-canvas" data-gartic-canvas role="img" aria-label="Quadro de desenho compartilhado"></canvas>'+
          '<canvas width="1000" height="650" class="gartic-canvas-preview" data-gartic-preview aria-hidden="true"></canvas>'+
          '</div><div class="gartic-zoom-controls">'+
          '<button type="button" data-gartic-zoom="out" aria-label="Diminuir zoom">−</button>'+
          '<span data-gartic-zoom-status>100%</span>'+
          '<button type="button" data-gartic-zoom="in" aria-label="Aumentar zoom">+</button>'+
          '<button type="button" data-gartic-zoom="reset" aria-label="Redefinir zoom">↺</button></div>'+
        (drawer?'<div class="gartic-tools"><div class="gartic-tool-group">'+
          '<button type="button" data-gartic-tool="pen" title="Pincel" aria-label="Pincel">✏️</button>'+
          '<button type="button" data-gartic-tool="eraser" title="Borracha" aria-label="Borracha">⌫</button>'+
          '<button type="button" data-gartic-tool="pan" title="Mover quadro" aria-label="Mover quadro">✋</button>'+
          '<button type="button" data-gartic-tool="fill" title="Balde de tinta" aria-label="Preencher área">▰</button>'+
          '<button type="button" data-gartic-tool="line" title="Linha" aria-label="Linha">╱</button>'+
          '<button type="button" data-gartic-tool="circle" title="Círculo" aria-label="Círculo">◯</button>'+
          '<button type="button" data-gartic-tool="rectangle" title="Retângulo" aria-label="Retângulo">▭</button>'+
          '<button type="button" data-gartic-action="undo" title="Desfazer" aria-label="Desfazer">↶</button>'+
          '<button type="button" data-gartic-action="clear" title="Limpar desenho" aria-label="Limpar">🗑</button>'+
          '<button type="button" data-gartic-action="hint" title="Dica" aria-label="Dica">💡</button>'+
          '</div><div class="gartic-swatches">'+PALETTE.map(c=>'<button type="button" data-gartic-color="'+c+'" style="background:'+c+'" title="Cor '+c+'"></button>').join('')+
          '</div><label class="gartic-brush">Espessura <input type="range" min="1" max="26" value="'+width+'" data-gartic-width></label></div>':
          '<form data-gartic-guess class="gartic-guess-form"><input name="guess" maxlength="96" autocomplete="off" placeholder="'+(me?'O que está sendo desenhado?':'Entre na próxima partida para pontuar')+'" '+(me?'':'disabled')+' aria-label="Sua resposta"><button type="submit" '+(me?'':'disabled')+'>Enviar</button></form>')+
        '<div class="gartic-status" role="status" data-gartic-feedback></div>'+
        '</div>';
    }else if(ended){
      body='<div class="gartic-results"><div class="gartic-winner-icon">🏆</div>'+
        '<h3>'+escapeHtml(currentName(game.winnerId))+' venceu!</h3><p>Partida finalizada · '+players.length+' jogadores</p>'+
        people+makeButton("create","Nova partida",true)+'</div>';
    }
    const sidebar='<aside class="gartic-sidebar">'+
      ((active||ended)?'<section class="gartic-sidebar-card"><h3>🏆 Classificação</h3>'+people+'</section>':'')+
      '<section class="gartic-sidebar-card gartic-voice"><h3>🎙️ Áudio ao vivo</h3>'+
      ''+
      makeButton("mute",voiceStream&&!voiceMuted?'Desativar microfone':'Ativar microfone',false,!me)+
      '<div data-gartic-audio-status class="gartic-audio-status" role="status">'+(voiceJoined?(voiceStream&&!voiceMuted?'Microfone ligado':'Ouvindo'):'')+'</div></section>'+
      '<section class="gartic-sidebar-card gartic-chat"><h3>💬 Chat</h3>'+
      '<div class="gartic-chat-list" aria-live="polite">'+(chat||'')+'</div>'+
      '<form class="gartic-chat-form" data-gartic-chat><input name="message" maxlength="300" enterkeyhint="send" autocomplete="off" placeholder="Mensagem…" aria-label="Mensagem para a sala"'+(me?'':' disabled')+'>'+
      '<button type="submit" aria-label="Enviar mensagem"'+(me?'':' disabled')+'>➤</button></form></section></aside>';
    const markup='<div data-looply-gartic class="gartic-shell">'+head+'<div class="gartic-grid">'+
      '<div class="gartic-primary">'+body+'</div>'+sidebar+'</div>'+
      '<div class="gartic-footer">'+(game.lastWord?'<span>Anterior: <b>'+escapeHtml(game.lastWord)+'</b></span>':'<span></span>')+
      (game.hostId===userId&&!ended?'<button type="button" data-gartic-action="finish">Encerrar partida</button>':'')+
      '</div></div>';
    openModal(markup);
    // Voice is auto-received only while the player is actually in Gartic.
    if(me && (waiting || active))startVoiceListening();
    for(const draft of previousDrafts){
      const input=draft.cls?.includes("gartic-chat-form")?
        root.querySelector(".gartic-chat-form input"):root.querySelector(".gartic-guess-form input");
      if(!input)continue;
      input.value=draft.value;
      if(draft.focused){input.focus({preventScroll:true});try{input.setSelectionRange(draft.selection,draft.selection);}catch{}}
    }
    if(active) {setupCanvas();drawAll();updateClock();}
    void hydrateAvatars();
    const list=root.querySelector(".gartic-chat-list");if(list)list.scrollTop=list.scrollHeight;
  }
  function syncLiveGame({paint=true}={}) {
    // Patch only changing sections; never replace a focused input or canvas.
    const chatList=root.querySelector(".gartic-chat-list");
    if(chatList) {
      const messages=game?.chat||[];
      const incoming=messages.map(m=>String(m.id)).join(",");
      if(chatList.dataset.messageIds!==incoming){
        const nearBottom=chatList.scrollHeight-chatList.scrollTop-chatList.clientHeight<55;
        chatList.innerHTML=messages.map(m=>'<div class="gartic-chat-line"><b>'+escapeHtml(m.name)+'</b> '+escapeHtml(m.body)+'</div>').join("");
        chatList.dataset.messageIds=incoming;
        if(nearBottom)chatList.scrollTop=chatList.scrollHeight;
      }
    }
    const word=root.querySelector(".gartic-word strong");
    if(word)word.textContent=amDrawer()?game.word||"":displayGarticMask(game.masked||"");
    const matches=root.querySelector(".gartic-word span");
    if(matches)matches.textContent=(game.correct||[]).filter(id=>id!==game.drawerId).length+" acerto(s)";
    const feedback=root.querySelector("[data-gartic-feedback]");
    if(feedback && latestGuessFeedback)feedback.textContent=latestGuessFeedback;
    const audioStatus=root.querySelector("[data-gartic-audio-status]");
    if(audioStatus) audioStatus.textContent=voiceJoined?(voiceStream&&!voiceMuted?"Microfone ligado":"Ouvindo"):"";
    if(paint)drawAll();
    updateClock();
  }
  function appendLiveChat(message){
    if(!message || !Number.isSafeInteger(Number(message.id)) ||
       !message.userId || typeof message.body!=="string" || message.body.length>300)return;
    liveChat.set(String(message.id),message);
    if((game?.chat||[]).some(m=>String(m.id)===String(message.id)))return;
    game.chat=[...(game.chat||[]),message].slice(-40);
    syncLiveGame({paint:false});
  }
  function displayGarticMask(mask){
    return String(mask).replace(/•/g,"_").replace(/\s+/g,"  —  ").replace(/-/g," – ");
  }
  async function hydrateAvatars(){
    for(const p of [...(game?.players || []),...(game?.inviteCandidates || []).map(x=>({...x,id:x.userId}))]){
      if(!p.avatarPath || !p.id)continue;
      let url=avatarCache.get(p.id);
      if(!url){
        try {
          const response=await client.storage.from("looply-avatars").createSignedUrl(p.avatarPath,600);
          if(!response.error && /^https:\/\//.test(response.data?.signedUrl||"")){
            url=response.data.signedUrl;avatarCache.set(p.id,url);
          }
        }catch{}
      }
      if(!url)continue;
      for(const el of root.querySelectorAll('[data-gartic-avatar="'+p.id+'"]')){
        if(el.querySelector("img"))continue;
        const img=document.createElement("img");img.alt="";img.loading="lazy";img.src=url;
        el.replaceChildren(img);
      }
    }
  }
  function updateGameIndicator(){
    const button=root.querySelector("[data-v2-game]");
    if(!button)return;
    const exists=game && ["waiting","active"].includes(game.status) && (inGame() || game.inviteStatus==="pending");
    button.classList.toggle("has-gartic-game",Boolean(exists));
    button.title=exists?"Games · há uma partida nesta conversa":"Games";
    button.setAttribute("aria-label",button.title);
  }
  function updateClock(){
    if(!game || game.status!=="active")return;
    const clock=root.querySelector("[data-gartic-clock]");
    if(!clock)return;
    const remaining=Math.max(0,Math.ceil((Date.parse(game.endsAt||"")-Date.now()-serverDelta)/1000));
    clock.textContent=String(Math.floor(remaining/60)).padStart(2,"0")+":"+String(remaining%60).padStart(2,"0");
    clock.classList.toggle("is-urgent",remaining<=12);
  }
  const drawStroke = applyGarticStroke;
  function drawAll(){
    const canvas=root.querySelector("[data-gartic-canvas]"); if(!canvas)return;
    const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)return;
    ctx.fillStyle="#ffffff";ctx.fillRect(0,0,1000,650);
    for(const stroke of [...(game?.strokes||[]),...localStrokes])drawStroke(ctx,stroke);
  }
  function setupCanvas(){
    canvasViewport?.destroy();canvasViewport=null;
    const canvas=root.querySelector("[data-gartic-canvas]");
    if(!canvas)return;
    canvasViewport=attachGarticViewport(canvas,{
      state:zoomState,canDraw:amDrawer,currentTool:()=>tool,
      onPreview:stroke=>{
        drawing=stroke;
        // Separate transparent overlay: avoid replaying the whole 650K-pixel
        // drawing on every pointermove, which stalls audio on Android WebView.
        const layer=root.querySelector("[data-gartic-preview]");
        const preview=layer?.getContext("2d");
        if(!preview)return;
        preview.clearRect(0,0,1000,650);
        if(stroke && stroke.tool!=="fill")drawStroke(preview,{
          ...stroke,color:stroke.tool==="eraser"?"#ffffff":color,
          width:stroke.tool==="eraser"?26:width
        });
      },
      onCommit:async stroke=>{
        if(!amDrawer()||!game?.gameId)return;
        const targetGame=game.gameId,targetTurn=game.turn;
        const packet={...stroke,color:stroke.tool==="eraser"?"#ffffff":color,
          width:stroke.tool==="eraser"?26:width};
        localStrokes.push(packet);drawAll();
        try{
          const next=await rpc("stroke",JSON.stringify(packet));
          if(!next || next.gameId!==targetGame)throw Error("gartic_stroke_outdated");
          if(game?.gameId===targetGame && game.turn===targetTurn){
            game=next;
            localStrokes=localStrokes.filter(v=>v!==packet);
            drawAll();
            void sendPacket({kind:"stroke",turn:targetTurn,stroke:packet});
          }else localStrokes=localStrokes.filter(v=>v!==packet);
        }catch(error){
          localStrokes=localStrokes.filter(v=>v!==packet);
          drawAll();
          toast("Não foi possível salvar o desenho.");
        }
      }
    });
  }
  async function refresh(force=false){
    if(disposed||!conversationId||busy)return;
    const requestedConversation=conversationId;
    try {
      const next=await rpc("tick");
      if(disposed || requestedConversation!==conversationId)return;
      if(!next){
        const wasVisible=gameVisible();
        game=null;updateGameIndicator();renderInviteBanner();
        if(force || wasVisible)showEmpty();
        return;
      }
      if(next.gameId!==game?.gameId)liveChat.clear();
      if(next.gameId===game?.gameId &&
         Date.parse(next.updatedAt)<Date.parse(game.updatedAt))return;
      for(const [id,message] of liveChat){
        if((next.chat||[]).some(m=>String(m.id)===id) ||
           Date.now()-Date.parse(message.at)>8000)liveChat.delete(id);
        else next.chat=[...(next.chat||[]),message].slice(-40);
      }
      const key=[next.gameId,next.status,next.turn,next.updatedAt,next.players?.length,next.strokes?.length,next.chat?.length].join(":");
      const changed=key!==renderedKey;
      const wasInvited=game?.status==="waiting"&&game?.inviteStatus==="pending";
      const priorTurn=game?.turn,priorGame=game?.gameId,priorStatus=game?.status;
      const priorInviteStatus=game?.inviteStatus,priorPlayers=game?.players?.length;
      game=next;
      if(!wasInvited && next.status==="waiting" && next.inviteStatus==="pending")
        toast(currentName(next.hostId)+" convidou você para jogar Gartic.");serverDelta=Date.parse(next.serverNow)-Date.now();
      updateGameIndicator();renderInviteBanner();startVoiceListening();
      if(priorGame!==next.gameId || priorTurn!==next.turn){
        localStrokes=[];latestGuessFeedback="";
        zoomState.scale=1;zoomState.x=0;zoomState.y=0;
      }
      if(open&&screen!=="hub"&&(changed||force)){
        renderedKey=key;
        if(gameVisible() && next.status==="active" && priorStatus==="active" &&
          priorTurn===next.turn && priorGame===next.gameId && priorPlayers===next.players?.length &&
          !force) syncLiveGame();
        else if(gameVisible() && next.status==="waiting" && priorStatus==="waiting" &&
          priorInviteStatus===next.inviteStatus && priorPlayers===next.players?.length &&
          !force && document.activeElement?.matches(".gartic-shell input,.gartic-shell select")) {
          // Preserve text composition and focused selection while lobby updates.
        } else renderGame(true);
      }
      updateClock();
    }catch(error){
      if(force)toast("Não foi possível sincronizar a partida. Confira a conexão.");
    }
  }
  function stopVoice(){
    if(voiceJoined)void sendPacket({kind:"voice-leave"});
    for(const {pc,audio,recoveryTimer,offerTimer} of remotePeers.values()){
      clearTimeout(recoveryTimer);
      clearTimeout(offerTimer);
      try{pc.close();}catch{}
      audio?.remove();
    }
    remotePeers.clear();
    voiceStream?.getTracks().forEach(t=>t.stop());voiceStream=null;
    voiceJoined=false;voiceMuted=true;
  }
  function makePeer(id){
    if(remotePeers.has(id))return remotePeers.get(id);
    const optionalTurn=(Array.isArray(globalThis.LOOPLY_CONFIG?.rtcIceServers)?globalThis.LOOPLY_CONFIG.rtcIceServers:[])
      .filter(s=>s && s.urls && s.username && s.credential);
    const pc=new RTCPeerConnection({iceServers:[
      {urls:"stun:stun.l.google.com:19302"},
      {urls:"stun:stun1.l.google.com:19302"},...optionalTurn
    ]});
    const audio=document.createElement("audio");audio.autoplay=true;audio.playsInline=true;audio.hidden=true;audio.muted=false;audio.volume=1;
    audio.dataset.garticRemoteAudio=id;document.body.append(audio);
    const record={pc,audio,pending:[],makingOffer:false,ignoreOffer:false,
      polite:userId>id,initialOfferer:userId<id,needsNegotiation:userId<id,
      restartRequested:false,transceiver:null,
      recoveryTimer:null,offerTimer:null,retries:0};
    remotePeers.set(id,record);
    // Only the offerer creates a transceiver. The answerer reuses the one
    // created by setRemoteDescription, preventing a silent second m-line.
    if(record.initialOfferer){
      record.transceiver=pc.addTransceiver("audio",{direction:"sendrecv"});
      if(voiceStream&&!voiceMuted)
        void record.transceiver.sender.replaceTrack(voiceStream.getAudioTracks()[0]);
    }
    // Only one side sends the first offer. Later ICE restarts may renegotiate.
    record.negotiate=async()=>{
      if(!record.needsNegotiation || record.makingOffer || !voiceJoined ||
         !connected || remotePeers.get(id)!==record)return;
      if(!record.initialOfferer && !pc.remoteDescription)return;
      if(pc.signalingState!=="stable")return;
      record.makingOffer=true;record.needsNegotiation=false;
      try{
        await pc.setLocalDescription(await pc.createOffer());
        if(pc.localDescription?.type!=="offer")return;
        const sent=await sendPacket({kind:"voice-signal",target:id,
          signal:{type:"offer",sdp:pc.localDescription.sdp}});
        if(sent){
          record.restartRequested=false;
          clearTimeout(record.offerTimer);
          record.offerTimer=setTimeout(async()=>{
            record.offerTimer=null;
            if(remotePeers.get(id)!==record || pc.signalingState!=="have-local-offer")return;
            try{
              await pc.setLocalDescription({type:"rollback"});
              record.needsNegotiation=true;
              void record.negotiate();
            }catch(error){console.warn("Gartic unanswered audio offer",error?.message);}
          },6000);
        }else{
          record.needsNegotiation=true;
          if(pc.signalingState==="have-local-offer")
            await pc.setLocalDescription({type:"rollback"});
        }
      }catch(error){
        record.needsNegotiation=true;
        console.warn("Gartic audio renegotiation failed",error?.message);
      }finally{
        record.makingOffer=false;
        if(record.needsNegotiation && pc.signalingState==="stable" && connected)
          setTimeout(()=>void record.negotiate(),900);
      }
    };
    pc.onnegotiationneeded=()=>{
      if((record.initialOfferer&&!pc.remoteDescription)||record.restartRequested){
        record.needsNegotiation=true;void record.negotiate();
      }
    };
    pc.onsignalingstatechange=()=>{
      if(pc.signalingState==="stable" && record.needsNegotiation)
        void record.negotiate();
    };
    pc.ontrack=e=>{
      audio.srcObject=e.streams[0]||new MediaStream([e.track]);
      void audio.play().catch(()=>{
        const status=root.querySelector("[data-gartic-audio-status]");
        if(status)status.textContent="Toque na tela para ouvir";
      });
    };
    pc.onicecandidate=e=>{if(e.candidate)void sendPacket({kind:"voice-signal",target:id,signal:{type:"candidate",candidate:e.candidate.toJSON()}});};
    pc.onconnectionstatechange=()=>{
      const status=root.querySelector("[data-gartic-audio-status]");
      if(status && voiceJoined)status.textContent=pc.connectionState==="connected"?"Áudio conectado":
        pc.connectionState==="connecting"?"Conectando áudio…":
        pc.connectionState==="failed"?"Reconectando áudio…":"Áudio";
      if(pc.connectionState==="connected"){
        clearTimeout(record.recoveryTimer);record.recoveryTimer=null;record.retries=0;
      }
      if(["failed","disconnected"].includes(pc.connectionState) &&
          record.recoveryTimer===null && record.retries<3){
        record.recoveryTimer=setTimeout(()=>{
          record.recoveryTimer=null;
          if(!voiceJoined || remotePeers.get(id)!==record ||
             !["failed","disconnected"].includes(pc.connectionState))return;
          record.retries++;
          // ICE restart retains the received stream and avoids a cascade of
          // destroyed peers/failed offers on a brief mobile network handoff.
          try{
            if(typeof pc.restartIce==="function"){
              record.restartRequested=true;
              pc.restartIce();
            }
            else void sendPacket({kind:"voice-join"});
          }catch(error){console.warn("Gartic ICE recovery",error?.message);}
        },pc.connectionState==="failed"?2500:5500);
      }
      if(pc.connectionState==="closed"){
        clearTimeout(record.recoveryTimer);
        clearTimeout(record.offerTimer);
        audio.remove();remotePeers.delete(id);
      }
    };
    return record;
  }
  async function onVoicePacket(packet){
    const sender=packet.senderId;
    if(!sender||sender===userId||!(game?.players||[]).some(x=>x.id===sender))return;
    if(packet.kind==="voice-join"){
      if(voiceJoined){
        // The first player must create the peer too. Otherwise a room only
        // connects when the second player's ID happens to be the offerer.
        const record=makePeer(sender);
        void sendPacket({kind:"voice-ready",target:sender});
        void record.negotiate();
      }
      return;
    }
    if(packet.kind==="voice-leave"){
      const old=remotePeers.get(sender);
      if(old){clearTimeout(old.offerTimer);try{old.pc.close()}catch{}old.audio.remove();remotePeers.delete(sender);}return;
    }
    if(!voiceJoined || packet.target!==userId)return;
    try{
      if(packet.kind==="voice-ready"){
        const record=makePeer(sender);
        void record.negotiate();
      }
      if(packet.kind==="voice-signal" && packet.signal){
        const data=packet.signal,record=makePeer(sender);
        if(data.type==="offer"){
          const collision=record.makingOffer||record.pc.signalingState!=="stable";
          record.ignoreOffer=!record.polite&&collision;
          if(record.ignoreOffer)return;
          if(collision)record.needsNegotiation=true;
          else if(!record.restartRequested)record.needsNegotiation=false;
          await record.pc.setRemoteDescription({type:"offer",sdp:data.sdp});
          record.transceiver=record.pc.getTransceivers().find(t=>t.receiver.track.kind==="audio");
          if(!record.transceiver)throw Error("gartic_audio_transceiver_missing");
          record.transceiver.direction="sendrecv";
          if(voiceStream&&!voiceMuted)
            await record.transceiver.sender.replaceTrack(voiceStream.getAudioTracks()[0]);
          await record.pc.setLocalDescription(await record.pc.createAnswer());
          await sendPacket({kind:"voice-signal",target:sender,signal:{type:"answer",sdp:record.pc.localDescription.sdp}});
          if(record.needsNegotiation)void record.negotiate();
        }else if(data.type==="answer"){
          if(record.pc.signalingState==="have-local-offer"){
            clearTimeout(record.offerTimer);record.offerTimer=null;
            await record.pc.setRemoteDescription({type:"answer",sdp:data.sdp});
          }
        }else if(data.type==="candidate"){
          if(record.ignoreOffer)return;
          if(record.pc.remoteDescription)await record.pc.addIceCandidate(data.candidate).catch(()=>{});
          else if(record.pending.length<120)record.pending.push(data.candidate);
        }
        if(record.pc.remoteDescription && record.pending.length){
          const waiting=record.pending.splice(0);
          for(const candidate of waiting)await record.pc.addIceCandidate(candidate).catch(()=>{});
        }
      }
    }catch(error){console.warn("Gartic voice negotiation failed",error?.message);}
  }
  function startVoiceListening(){
    if(voiceJoined || !inGame() || disposed ||
       !open || screen==="hub" || !gameVisible())return;
    if(!globalThis.RTCPeerConnection)return;
    voiceJoined=true;
    voiceMuted=!voiceStream;
    if(connected)void sendPacket({kind:"voice-join"});
  }
  function resumeRemoteAudio(){
    if(!voiceJoined)return;
    for(const {audio} of remotePeers.values())
      if(audio.srcObject && audio.paused)void audio.play().catch(()=>{});
  }
  async function toggleMicrophone(){
    if(mediaBooting || !inGame())return;
    startVoiceListening();
    if(voiceStream){
      voiceMuted=!voiceMuted;
      voiceStream.getAudioTracks().forEach(track=>track.enabled=!voiceMuted);
      updateVoiceControls();
      return;
    }
    if(!navigator.mediaDevices?.getUserMedia){
      toast("Microfone indisponível.");return;
    }
    mediaBooting=true;
    try{
      // Only the person transmitting audio needs to authorize the microphone.
      voiceStream=await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
        video:false
      });
      voiceMuted=false;
      const track=voiceStream.getAudioTracks()[0];
      for(const record of remotePeers.values()){
        if(!record.transceiver)continue;
        await record.transceiver.sender.replaceTrack(track);
        // Direction was negotiated at connection establishment, so no SDP update.
      }
      if(connected)void sendPacket({kind:"voice-join"});
      updateVoiceControls();
    }catch(error){
      voiceStream?.getTracks().forEach(track=>track.stop());voiceStream=null;voiceMuted=true;
      console.warn("Gartic microphone permission",error?.name);
      toast(error?.name==="NotAllowedError"?"Permita o acesso ao microfone.":"Não foi possível ativar o microfone.");
    }finally{mediaBooting=false;}
  }
  function updateVoiceControls(){
    const mic=root.querySelector('[data-gartic-action="mute"]');
    if(mic)mic.textContent=!voiceStream||voiceMuted?"Ativar microfone":"Desativar microfone";
    const status=root.querySelector("[data-gartic-audio-status]");
    if(status)status.textContent=voiceStream&&!voiceMuted?"Microfone ligado":"Ouvindo";
  }
  async function switchConversation(){
    const id=selectedConversation();
    if(id===conversationId)return;
    stopVoice();canvasViewport?.destroy();canvasViewport=null;
    zoomState.scale=1;zoomState.x=0;zoomState.y=0;
    if(channel)try{await client.removeChannel(channel)}catch{}
    conversationId=id;channel=null;game=null;connected=false;renderedKey="";localStrokes=[];liveChat.clear();
    root.querySelector("[data-gartic-invitation]")?.remove();
    if(pollTimer)clearInterval(pollTimer);pollTimer=null;
    if(!id||!client)return;
    const currentId=id;
    const next=client.channel("looply-game-"+id,{config:{broadcast:{self:false}}});
    channel=next;
    next.on("broadcast",{event:"ttt"},({payload})=>{
      if(currentId!==conversationId||payload?.type!=="gartic"||payload.senderId===userId)return;
      // Invitations can arrive before this client has loaded the new game ID.
      // Treat updates for a new room as a prompt to refresh authoritative Neon.
      if(!game || payload.gameId!==game.gameId){
        if(payload.kind==="updated")void refresh();
        return;
      }
      if(payload.kind?.startsWith("voice-")){void onVoicePacket(payload);return;}
      if(payload.kind==="chat" && payload.message?.userId===payload.senderId){
        appendLiveChat(payload.message);
        void refresh();
        return;
      }
      if(payload.kind==="stroke" && payload.senderId===game?.drawerId && payload.turn===game?.turn){
        const canvas=root.querySelector("[data-gartic-canvas]");
        if(canvas&&payload.stroke)drawStroke(canvas.getContext("2d"),payload.stroke);
      }
      void refresh();
    });
    next.subscribe(status=>{
      connected=status==="SUBSCRIBED";
      const node=root.querySelector("[data-gartic-audio-status]");
      if(node)node.textContent=connected?"Sala conectada":"Conectando ao tempo real…";
      if(connected&&voiceJoined){
        void sendPacket({kind:"voice-join"});
        for(const record of remotePeers.values())void record.negotiate();
      }
    });
    let backgroundPolls=0,voicePolls=0;
    pollTimer=setInterval(()=>{
      if(document.hidden)return;
      if(voiceJoined&&connected && ++voicePolls%2===0)
        void sendPacket({kind:"voice-join"});
      if(open&&screen!=="hub")void refresh();
      else if(++backgroundPolls%4===0)void refresh();
    },2600);
    void refresh();
  }
  async function openGartic(){
    await switchConversation();
    screen="empty";open=true;
    showEmpty();
    await refresh(true);
  }
  async function perform(action,value=null,number=null){
    if(busy)return;busy=true;
    const requestedConversation=conversationId;
    const before=game?.turn;
    try{
      const next=await rpc(action,value,number);
      if(requestedConversation!==conversationId)return;
      if(next) {
        if(action==="guess" && game){
          const changedTurn=next.turn!==game.turn;
          latestGuessFeedback=changedTurn?"Acertou!":
            next.guessFeedback==="correct"?"Acertou!":
            next.guessFeedback==="near"?"Quase!":"Tente outra.";
          game=next;
          if(!changedTurn) {
            syncLiveGame();
            const feedback=root.querySelector("[data-gartic-feedback]");
            if(feedback){
              feedback.textContent=latestGuessFeedback;
              feedback.classList.toggle("is-near",next.guessFeedback==="near");
              feedback.classList.toggle("is-correct",next.guessFeedback==="correct");
            }
            return;
          }
        }
        game=next;serverDelta=Date.parse(next.serverNow)-Date.now();
        renderInviteBanner();updateGameIndicator();startVoiceListening();
        if(before!==next.turn)localStrokes=[];
        renderedKey="";
        if(action==="chat" && gameVisible())syncLiveGame();
        else renderGame(true);
        if(action!=="create")void sendPacket({kind:"updated"});
      }else {
        game=null;renderInviteBanner();updateGameIndicator();
        if(open && screen!=="hub")showEmpty();
      }
    }catch(error){
      console.warn("Looply Gartic action failed",action,error?.message||"unknown");
      toast(/at least two/i.test(error.message)?"Aguarde pelo menos dois participantes.":/not a member|forbidden|session/i.test(error.message)?"Sua sessão precisa ser renovada para jogar.":"Não foi possível concluir a ação. Tente novamente.");
    }finally{busy=false;}
  }
  async function handleClick(button){
    if(button.matches("[data-v2-game]")){await switchConversation();renderHub();return true;}
    if(button.matches("[data-v2-close]")&&(gameVisible()||hubVisible())){
      stopVoice();open=false;screen="hub";return false;
    }
    const action=button.dataset.garticAction;
    if(action){
      if(action==="back"){stopVoice();renderHub();}
      else if(action==="ttt"){stopVoice();open=false;closeModal();await openTtt();}
      else if(action==="gartic")await openGartic();
      else if(action==="mute")await toggleMicrophone();
      else if(["create","invite","accept","decline","join","start","hint","undo","clear","finish"].includes(action))await perform(action);
      return true;
    }
    if(button.hasAttribute("data-gartic-invite-user")){
      await perform("invite",button.dataset.garticInviteUser);
      return true;
    }
    if(button.hasAttribute("data-gartic-zoom")){
      const action=button.dataset.garticZoom;
      if(action==="reset")canvasViewport?.reset();
      else canvasViewport?.zoom(action==="in"?1.35:1/1.35);
      return true;
    }
    if(button.hasAttribute("data-gartic-color")){
      color=button.dataset.garticColor;tool="pen";
      root.querySelectorAll("[data-gartic-color]").forEach(b=>b.classList.toggle("is-selected",b===button));return true;
    }
    if(button.hasAttribute("data-gartic-tool")){
      tool=button.dataset.garticTool;
      root.querySelectorAll("[data-gartic-tool]").forEach(b=>b.classList.toggle("is-selected",b===button));return true;
    }
    return false;
  }
  function handleChange(event){
    const t=event.target;
    if(t.matches("[data-gartic-width]")){width=Math.max(1,Math.min(26,Number(t.value)||5));return true;}
    if(t.matches("[data-gartic-category]")){
      void perform("configure",t.value);return true;
    }
    if(t.matches("[data-gartic-duration]")){void perform("duration",null,Number(t.value));return true;}
    if(t.matches("[data-gartic-cycles]")){void perform("cycles",null,Number(t.value));return true;}
    return false;
  }
  async function handleSubmit(event){
    const form=event.target;
    if(form.matches("[data-gartic-guess]")){
      event.preventDefault();
      const input=form.elements.guess,guess=input.value.trim();
      if(!guess)return true;input.value="";
      const currentTurn=game?.turn;
      await perform("guess",guess);
      if(game?.turn===currentTurn) {
        const feedback=root.querySelector("[data-gartic-feedback]");
        if(feedback)feedback.textContent="Palpite enviado. Acompanhe o resultado da rodada.";
      }
      return true;
    }
    if(form.matches("[data-gartic-chat]")){
      // Chat must not share the drawing/configuration lock. The old handler
      // cleared the input first, then perform() silently dropped the message
      // whenever another game action was in flight.
      event.preventDefault();
      event.stopPropagation();
      const input=form.elements.message,text=input?.value?.trim();
      if(!text || chatBusy || !game || !inGame())return true;
      chatBusy=true;
      const requestedConversation=conversationId;
      const submit=form.querySelector('button[type="submit"]');
      if(submit)submit.disabled=true;
      try{
        let next;
        try{next=await rpc("chat",text);}
        catch(error){
          if(/rate|too many|limit/i.test(String(error.message||""))){
            await new Promise(resolve=>setTimeout(resolve,800));
            next=await rpc("chat",text);
          }else throw error;
        }
        if(requestedConversation!==conversationId)return true;
        if(next?.gameId===game?.gameId){
          const turnChanged=game.turn!==next.turn;
          game=next;
          if(turnChanged)renderGame(true);
          else syncLiveGame({paint:false});
          const confirmed=[...(next.chat||[])].reverse().find(m=>m.userId===userId&&m.body===text);
          if(confirmed){appendLiveChat(confirmed);void sendPacket({kind:"chat",message:confirmed});}
          else void sendPacket({kind:"updated"});
          // Preserve anything typed while the request was in progress.
          const latestInput=root.querySelector('[data-gartic-chat] input[name="message"]');
          if(latestInput?.value.trim()===text)latestInput.value="";
        }else throw Error("chat_no_confirmation");
      }catch(error){
        console.warn("Gartic chat send failed",error?.message);
        const latestInput=root.querySelector('[data-gartic-chat] input[name="message"]');
        if(latestInput && !latestInput.value.trim())latestInput.value=text;
        toast("Mensagem não enviada. Tente novamente.");
      }finally{
        chatBusy=false;
        if(submit?.isConnected)submit.disabled=false;
      }
      return true;
    }
    return false;
  }
  function onConversation(){void switchConversation();}
  function dispose(){disposed=true;document.removeEventListener("pointerdown",resumeRemoteAudio);document.removeEventListener("keydown",resumeRemoteAudio);canvasViewport?.destroy();canvasViewport=null;root.querySelector("[data-gartic-invitation]")?.remove();stopVoice();if(serverTimer)clearInterval(serverTimer);if(pollTimer)clearInterval(pollTimer);if(channel)void client?.removeChannel(channel).catch(()=>{});}
  document.addEventListener("pointerdown",resumeRemoteAudio);
  document.addEventListener("keydown",resumeRemoteAudio);
  return {handleClick,handleChange,handleSubmit,onConversation,dispose,openHub:renderHub};
}
