import { applyGarticStroke } from "./gartic-paint.js";
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
  let latestGuessFeedback = "", mediaBooting = false;
  let voiceStream = null, voiceJoined = false, voiceMuted = false, remotePeers = new Map();
  let serverDelta = 0, serverTimer = setInterval(updateClock,250);
  const avatarCache = new Map();
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
      return reply !== "error";
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
    const wordLabel=active?(drawer?'Sua palavra secreta:':'Descubra a palavra:'):'';
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
        '<span>'+escapeHtml(game.category||"")+' · '+answered+' acerto(s)</span></div>'+
        '<canvas width="1000" height="650" class="gartic-canvas" data-gartic-canvas role="img" aria-label="Quadro de desenho compartilhado"></canvas>'+
        (drawer?'<div class="gartic-tools"><div class="gartic-tool-group">'+
          '<button type="button" data-gartic-tool="pen" title="Pincel" aria-label="Pincel">✏️</button>'+
          '<button type="button" data-gartic-tool="eraser" title="Borracha" aria-label="Borracha">⌫</button>'+
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
    const sidebar='<aside class="gartic-sidebar"><section class="gartic-sidebar-card"><h3>🏆 Classificação</h3>'+
      (active||ended?people:'<p class="gartic-muted"></p>')+'</section>'+
      '<section class="gartic-sidebar-card gartic-voice"><h3>🎙️ Áudio ao vivo</h3>'+
      '<p class="gartic-muted">'+(voiceJoined?(voiceMuted?'Seu microfone está silenciado.':'Você está no chat de voz.'):'')+'</p>'+
      (voiceJoined?makeButton("mute",voiceMuted?'Ativar microfone':'Silenciar microfone')+makeButton("leave-voice","Sair do áudio"):
        makeButton("join-voice","Entrar no áudio",false,!me||!connected))+
      '<div data-gartic-audio-status class="gartic-muted">'+(connected?'Sala conectada':'Conectando ao tempo real…')+'</div></section>'+
      '<section class="gartic-sidebar-card gartic-chat"><h3>💬 Chat</h3>'+
      '<div class="gartic-chat-list" aria-live="polite">'+(chat||'')+'</div>'+
      '<form class="gartic-chat-form" data-gartic-chat><input name="message" maxlength="300" autocomplete="off" placeholder="Conversar…" aria-label="Mensagem para a sala"'+(me?'':' disabled')+'>'+
      '<button type="submit" aria-label="Enviar mensagem"'+(me?'':' disabled')+'>➤</button></form></section></aside>';
    const markup='<div data-looply-gartic class="gartic-shell">'+head+'<div class="gartic-grid">'+
      '<div class="gartic-primary">'+body+'</div>'+sidebar+'</div>'+
      '<div class="gartic-footer">'+(game.lastWord?'<span>Palavra anterior: <b>'+escapeHtml(game.lastWord)+'</b></span>':'<span></span>')+
      (game.hostId===userId&&!ended?'<button type="button" data-gartic-action="finish">Encerrar partida</button>':'')+
      '</div></div>';
    openModal(markup);
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
  function syncLiveGame() {
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
    if(audioStatus) audioStatus.textContent=voiceJoined?(voiceMuted?"Silenciado":"Conectado"):"";
    drawAll();
    updateClock();
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
    const canvas=root.querySelector("[data-gartic-canvas]");if(!canvas)return;
    if(!amDrawer()){canvas.style.touchAction="auto";return;}
    canvas.style.touchAction="none";
    const position=e=>{
      const b=canvas.getBoundingClientRect();
      return [Math.round(Math.max(0,Math.min(1000,(e.clientX-b.left)*1000/b.width))),
        Math.round(Math.max(0,Math.min(1000,(e.clientY-b.top)*1000/b.height)))];
    };
    canvas.onpointerdown=e=>{
      if(!amDrawer()||e.button>0)return;
      e.preventDefault();canvas.setPointerCapture(e.pointerId);
      drawing={tool,color:tool==="eraser"?"#ffffff":color,width:tool==="eraser"?26:width,points:[position(e)]};
      if(tool==="fill"){void canvas.onpointerup(e);return;}
      drawAll();drawStroke(canvas.getContext("2d"),drawing);
    };
    canvas.onpointermove=e=>{
      if(!drawing)return;e.preventDefault();
      const p=position(e),last=drawing.points.at(-1);
      if(last&&Math.hypot(last[0]-p[0],last[1]-p[1])<2)return;
      if(["line","circle","rectangle"].includes(drawing.tool))drawing.points=[drawing.points[0],p];
      else if(drawing.points.length<140)drawing.points.push(p);
      drawAll();drawStroke(canvas.getContext("2d"),drawing);
    };
    canvas.onpointerup=async e=>{
      if(!drawing)return;
      const stroke=drawing;drawing=null;
      if(stroke.points.length===1 && stroke.tool!=="fill")stroke.points.push(stroke.points[0]);
      localStrokes.push(stroke);drawAll();
      try{
        const next=await rpc("stroke",JSON.stringify(stroke));
        const previous=game?.turn;
        if(next){game=next;serverDelta=Date.parse(next.serverNow)-Date.now();if(next.turn!==previous)localStrokes=[];}
        localStrokes=[];drawAll();
        void sendPacket({kind:"stroke",turn:previous,stroke});
      }catch(error){
        localStrokes=localStrokes.filter(x=>x!==stroke);
        drawAll();toast("O traço não foi salvo. Confira a conexão.");
      }
    };
    canvas.onpointercancel=()=>{drawing=null;drawAll();};
  }
  async function refresh(force=false){
    if(disposed||!conversationId||busy)return;
    try {
      const next=await rpc("tick");
      if(!next){game=null;updateGameIndicator();renderInviteBanner();if(force)showEmpty();return;}
      const key=[next.gameId,next.status,next.turn,next.updatedAt,next.players?.length,next.strokes?.length,next.chat?.length].join(":");
      const changed=key!==renderedKey;
      const wasInvited=game?.status==="waiting"&&game?.inviteStatus==="pending";
      const priorTurn=game?.turn,priorGame=game?.gameId,priorStatus=game?.status;
      const priorInviteStatus=game?.inviteStatus,priorPlayers=game?.players?.length;
      game=next;
      if(!wasInvited && next.status==="waiting" && next.inviteStatus==="pending")
        toast(currentName(next.hostId)+" convidou você para jogar Gartic.");serverDelta=Date.parse(next.serverNow)-Date.now();
      updateGameIndicator();renderInviteBanner();
      if(priorGame!==next.gameId || priorTurn!==next.turn)localStrokes=[];
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
    for(const {pc,audio} of remotePeers.values()){try{pc.close();}catch{}audio?.remove();}
    remotePeers.clear();
    voiceStream?.getTracks().forEach(t=>t.stop());voiceStream=null;
    voiceJoined=false;voiceMuted=false;
  }
  function makePeer(id){
    if(remotePeers.has(id))return remotePeers.get(id);
    const optionalTurn=(Array.isArray(globalThis.LOOPLY_CONFIG?.rtcIceServers)?globalThis.LOOPLY_CONFIG.rtcIceServers:[])
      .filter(s=>s && s.urls && s.username && s.credential);
    const pc=new RTCPeerConnection({iceServers:[
      {urls:"stun:stun.l.google.com:19302"},
      {urls:"stun:stun1.l.google.com:19302"},...optionalTurn
    ]});
    const audio=document.createElement("audio");audio.autoplay=true;audio.playsInline=true;audio.hidden=true;
    audio.dataset.garticRemoteAudio=id;document.body.append(audio);
    const record={pc,audio,pending:[],makingOffer:false,ignoreOffer:false,polite:userId>id,retried:false};remotePeers.set(id,record);
    voiceStream?.getTracks().forEach(track=>pc.addTrack(track,voiceStream));
    pc.ontrack=e=>{
      audio.srcObject=e.streams[0]||new MediaStream([e.track]);
      audio.play().catch(()=>{const status=root.querySelector("[data-gartic-audio-status]");if(status)status.textContent="Toque em Áudio";});
    };
    pc.onicecandidate=e=>{if(e.candidate)void sendPacket({kind:"voice-signal",target:id,signal:{type:"candidate",candidate:e.candidate.toJSON()}});};
    pc.onconnectionstatechange=()=>{
      const status=root.querySelector("[data-gartic-audio-status]");
      if(status && voiceJoined)status.textContent=pc.connectionState==="connected"?"Áudio conectado":
        pc.connectionState==="connecting"?"Conectando áudio…":
        pc.connectionState==="failed"?"Reconectando áudio…":"Áudio";
      if(pc.connectionState==="failed"&&!record.retried){
        record.retried=true;
        setTimeout(()=>{
          if(!voiceJoined||remotePeers.get(id)!==record)return;
          audio.remove();remotePeers.delete(id);pc.close();
          void sendPacket({kind:"voice-join"});
        },1400);
      }
      if(pc.connectionState==="closed"){audio.remove();remotePeers.delete(id);}
    };
    return record;
  }
  async function onVoicePacket(packet){
    const sender=packet.senderId;
    if(!sender||sender===userId||!(game?.players||[]).some(x=>x.id===sender))return;
    if(packet.kind==="voice-join"){if(voiceJoined)void sendPacket({kind:"voice-ready",target:sender});return;}
    if(packet.kind==="voice-leave"){
      const old=remotePeers.get(sender);
      if(old){try{old.pc.close()}catch{}old.audio.remove();remotePeers.delete(sender);}return;
    }
    if(!voiceJoined || packet.target!==userId)return;
    try{
      if(packet.kind==="voice-ready"){
        const record=makePeer(sender);
        if(record.pc.signalingState!=="stable"||record.makingOffer)return;
        record.makingOffer=true;
        try{
          await record.pc.setLocalDescription(await record.pc.createOffer());
          await sendPacket({kind:"voice-signal",target:sender,signal:{type:"offer",sdp:record.pc.localDescription.sdp}});
        }finally{record.makingOffer=false;}
      }
      if(packet.kind==="voice-signal" && packet.signal){
        const data=packet.signal,record=makePeer(sender);
        if(data.type==="offer"){
          const collision=record.makingOffer||record.pc.signalingState!=="stable";
          record.ignoreOffer=!record.polite&&collision;
          if(record.ignoreOffer)return;
          await record.pc.setRemoteDescription({type:"offer",sdp:data.sdp});
          await record.pc.setLocalDescription(await record.pc.createAnswer());
          await sendPacket({kind:"voice-signal",target:sender,signal:{type:"answer",sdp:record.pc.localDescription.sdp}});
        }else if(data.type==="answer"){
          if(record.pc.signalingState==="have-local-offer")
            await record.pc.setRemoteDescription({type:"answer",sdp:data.sdp});
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
  async function joinVoice(){
    if(voiceJoined||!connected||!inGame()) {toast("A sala de áudio ainda não está disponível.");return;}
    if(!navigator.mediaDevices?.getUserMedia||!globalThis.RTCPeerConnection){
      toast("Este navegador não permite áudio ao vivo.");return;
    }
    try{
      voiceStream=await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},
        video:false
      });
      voiceJoined=true;voiceMuted=false;
      const announced=await sendPacket({kind:"voice-join"});
      if(!announced)throw Error("audio_signaling_offline");
      renderGame(true);
    }catch(error){
      stopVoice();
      toast(error?.name==="NotAllowedError"?"Permita o uso do microfone.":"Não foi possível conectar ao áudio.");
    }
  }
  async function switchConversation(){
    const id=selectedConversation();
    if(id===conversationId)return;
    stopVoice();if(channel)try{await client.removeChannel(channel)}catch{}
    conversationId=id;channel=null;game=null;connected=false;renderedKey="";localStrokes=[];
    root.querySelector("[data-gartic-invitation]")?.remove();
    if(pollTimer)clearInterval(pollTimer);pollTimer=null;
    if(!id||!client)return;
    const currentId=id;
    const next=client.channel("looply-game-"+id,{config:{broadcast:{self:false},disableFallback:true}});
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
      if(connected&&voiceJoined)void sendPacket({kind:"voice-join"});
    });
    let backgroundPolls=0;
    pollTimer=setInterval(()=>{
      if(document.hidden)return;
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
    const before=game?.turn;
    try{
      const next=await rpc(action,value,number);
      if(next) {
        if(action==="guess" && game && next.turn===game.turn && next.updatedAt===game.updatedAt){
          const feedback=root.querySelector("[data-gartic-feedback]");
          if(feedback)feedback.textContent="Ainda não! Tente outra resposta.";
          game=next;return;
        }
        game=next;serverDelta=Date.parse(next.serverNow)-Date.now();
        renderInviteBanner();updateGameIndicator();
        if(before!==next.turn)localStrokes=[];
        renderedKey="";
        if(action==="chat" && gameVisible())syncLiveGame();
        else renderGame(true);
        if(action!=="create")void sendPacket({kind:"updated"});
      }else if(action==="state")showEmpty();
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
      else if(action==="join-voice")await joinVoice();
      else if(action==="mute"){
        voiceMuted=!voiceMuted;voiceStream?.getAudioTracks().forEach(t=>{t.enabled=!voiceMuted});
        const mute=root.querySelector('[data-gartic-action="mute"]');
        if(mute)mute.textContent=voiceMuted?"Ativar microfone":"Silenciar microfone";
        const status=root.querySelector("[data-gartic-audio-status]");
        if(status)status.textContent=voiceMuted?"Silenciado":"Conectado";
      }else if(action==="leave-voice"){stopVoice();renderGame(true);}
      else if(["create","invite","accept","decline","join","start","hint","undo","clear","finish"].includes(action))await perform(action);
      return true;
    }
    if(button.hasAttribute("data-gartic-invite-user")){
      await perform("invite",button.dataset.garticInviteUser);
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
      event.preventDefault();const input=form.elements.message,text=input.value.trim();
      if(!text)return true;
      input.value="";
      await perform("chat",text);
      return true;
    }
    return false;
  }
  function onConversation(){void switchConversation();}
  function dispose(){disposed=true;root.querySelector("[data-gartic-invitation]")?.remove();stopVoice();if(serverTimer)clearInterval(serverTimer);if(pollTimer)clearInterval(pollTimer);if(channel)void client?.removeChannel(channel).catch(()=>{});}
  return {handleClick,handleChange,handleSubmit,onConversation,dispose,openHub:renderHub};
}
