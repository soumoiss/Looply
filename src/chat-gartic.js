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

export function setupChatGartic({root,client,userId,selectedConversation,openModal,closeModal,toast,openTtt}) {
  let conversationId = "", game = null, channel = null, connected = false, pollTimer = null;
  let renderedKey = "", screen = "hub", open = false, busy = false, disposed = false;
  let tool = "pen", color = PALETTE[0], width = 5, drawing = null, localStrokes = [];
  let voiceStream = null, voiceJoined = false, voiceMuted = false, remotePeers = new Map();
  let serverDelta = 0, serverTimer = null, lastStatus = "";
  const gameVisible = () => Boolean(root.querySelector("[data-chat-v2-modal]:not([hidden]) [data-looply-gartic]"));
  const hubVisible = () => Boolean(root.querySelector("[data-chat-v2-modal]:not([hidden]) [data-looply-games-hub]"));
  const rpc = async (action,value=null,number=null) => {
    if(!client || !conversationId) throw Error("Abra uma conversa válida.");
    const {data,error} = await client.rpc("v26_gartic_action",
      {p_conversation_id:conversationId,p_action:action,p_value:value,p_number:number});
    if(error) throw Error(error.message || "Serviço de jogos indisponível.");
    return data;
  };
  const inGame = () => (game?.players || []).some(p => p.id === userId);
  const amDrawer = () => game?.status === "active" && game.drawerId === userId;
  const currentName = (id) => personName((game?.players || []).find(p => p.id===id));
  const sendPacket = async packet => {
    if(!channel || !connected || !game?.gameId) return false;
    try {
      const reply = await channel.send({type:"broadcast",event:"ttt",
        payload:{type:"gartic",gameId:game.gameId,conversationId,...packet}});
      return reply !== "error";
    } catch {return false;}
  };
  function renderHub() {
    screen="hub";open=true;
    openModal('<div data-looply-games-hub class="gartic-hub">'+
      '<div class="gartic-eyebrow">🎮 &nbsp; LOOPLY GAMES</div>'+
      '<h2 id="chatV2ModalTitle">Jogos na conversa</h2>'+
      '<p class="gartic-muted">Escolha um jogo e desafie seus amigos sem sair do chat.</p>'+
      '<button type="button" data-gartic-action="ttt" class="gartic-game-card">'+
      '<span class="gartic-game-icon">✕○</span><span><strong>Jogo da Velha</strong><small>O clássico X e O, com placar salvo.</small></span><span>›</span></button>'+
      '<button type="button" data-gartic-action="gartic" class="gartic-game-card">'+
      '<span class="gartic-game-icon">🎨</span><span><strong>Desenhe &amp; Adivinhe</strong><small>Gartic com desenho, chat, dicas e áudio.</small></span><span>›</span></button></div>');
  }
  function showEmpty() {
    screen="empty";open=true;
    openModal('<div data-looply-gartic class="gartic-shell gartic-intro">'+
      '<div class="gartic-eyebrow">✦ &nbsp; DESENHE & ADIVINHE</div>'+
      '<div class="gartic-intro-art"><span>✎</span><span>◌</span><span>✦</span></div>'+
      '<h2 id="chatV2ModalTitle">Seu próximo desenho pode valer uma vitória.</h2>'+
      '<p class="gartic-muted">Crie uma partida entre vocês dois ou com os participantes do grupo. Escolha o tema e descubra as palavras.</p>'+
      makeButton("create","Criar nova partida",true)+
      '<button type="button" class="gartic-text-action" data-gartic-action="back">Voltar aos jogos</button></div>');
  }
  function renderGame(force=false) {
    if(!game) {showEmpty();return;}
    screen=game.status;open=true;
    const me=inGame(), drawer=amDrawer(), waiting=game.status==="waiting", active=game.status==="active";
    const ended=game.status==="finished", players=game.players||[];
    const safeWord=escapeHtml(drawer?game.word:game.masked||"");
    const wordLabel=active?(drawer?'Sua palavra secreta:':'Descubra a palavra:'):'';
    const people=players.slice().sort((a,b)=>b.score-a.score).map((p,i)=>
      '<div class="gartic-player'+(p.id===game.drawerId?' is-drawing':'')+'">'+
      '<span class="gartic-player-rank">'+(i+1)+'</span>'+
      '<span class="gartic-avatar">'+escapeHtml(personName(p).slice(0,1).toUpperCase())+'</span>'+
      '<span class="gartic-player-name"><strong>'+escapeHtml(personName(p))+'</strong><small>@'+escapeHtml(p.username||"")+'</small></span>'+
      '<span class="gartic-score">'+Number(p.score||0)+' pts</span>'+
      (p.id===game.drawerId?'<span aria-label="Desenhista">✏️</span>':'')+'</div>').join("");
    const categories=CATEGORIES.map(item=>'<option value="'+item[0]+'"'+(item[0]===game.category?' selected':'')+'>'+item[1]+' '+escapeHtml(item[2])+'</option>').join("");
    const chat=(game.chat||[]).map(m=>'<div class="gartic-chat-line"><b>'+escapeHtml(m.name)+'</b> '+escapeHtml(m.body)+'</div>').join("");
    const answered=(game.correct||[]).filter(id=>id!==game.drawerId).length;
    const head='<header class="gartic-head"><div><span class="gartic-eyebrow">🎨 &nbsp; LOOPLY GAMES</span>'+
      '<h2 id="chatV2ModalTitle">Desenhe &amp; Adivinhe</h2></div>'+
      '<button type="button" data-gartic-action="back" class="gartic-back" aria-label="Voltar aos jogos">✕</button></header>';
    let body="";
    if(waiting){
      body='<div class="gartic-lobby"><div class="gartic-lobby-hero"><span>✦</span>'+
        '<h3>Preparando a partida</h3><p>Convide os participantes desta conversa para desenhar e adivinhar.</p></div>'+
        '<label class="gartic-field">Tema<select data-gartic-category '+(game.hostId===userId?'':'disabled')+'>'+categories+'</select></label>'+
        '<div class="gartic-lobby-people"><strong>Participantes · '+players.length+'/6</strong>'+people+'</div>'+
        '<div class="gartic-lobby-actions">'+(me?'':makeButton("join","Participar da sala",true))+
        (game.hostId===userId?makeButton("start","Iniciar com "+players.length+" jogadores",true,players.length<2):'')+
        '<p class="gartic-muted">Cada jogador desenha duas vezes. Tempo por desenho: 75 segundos.</p></div></div>';
    } else if(active){
      body='<div class="gartic-main"><div class="gartic-topline">'+
        '<span class="gartic-drawer">✏️ '+escapeHtml(currentName(game.drawerId))+' está desenhando</span>'+
        '<span>Rodada '+game.turn+'/'+(players.length*Number(game.cycles||2))+'</span>'+
        '<strong data-gartic-clock>--:--</strong></div>'+
        '<div class="gartic-word"><small>'+escapeHtml(wordLabel)+'</small><strong>'+safeWord+'</strong>'+
        '<span>'+escapeHtml(game.category||"")+' · '+answered+' acerto(s)</span></div>'+
        '<canvas width="1000" height="650" class="gartic-canvas" data-gartic-canvas role="img" aria-label="Quadro de desenho compartilhado"></canvas>'+
        (drawer?'<div class="gartic-tools"><div class="gartic-tool-group">'+
          '<button type="button" data-gartic-tool="pen" aria-label="Pincel">✏️</button>'+
          '<button type="button" data-gartic-tool="eraser" aria-label="Borracha">◻</button>'+
          '<button type="button" data-gartic-action="hint" title="Revelar uma letra aleatória">💡 Dica</button>'+
          '</div><div class="gartic-swatches">'+PALETTE.map(c=>'<button type="button" data-gartic-color="'+c+'" style="background:'+c+'" title="Cor '+c+'"></button>').join('')+
          '</div><label class="gartic-brush">Espessura <input type="range" min="1" max="26" value="'+width+'" data-gartic-width></label></div>':
          '<form data-gartic-guess class="gartic-guess-form"><input name="guess" maxlength="96" autocomplete="off" placeholder="'+(me?'O que está sendo desenhado?':'Entre na próxima partida para pontuar')+'" '+(me?'':'disabled')+' aria-label="Sua resposta"><button type="submit" '+(me?'':'disabled')+'>Enviar</button></form>')+
        '<div class="gartic-status" role="status" data-gartic-feedback>Respostas e pontos validados pelo servidor.</div>'+
        '</div>';
    }else if(ended){
      body='<div class="gartic-results"><div class="gartic-winner-icon">🏆</div>'+
        '<h3>'+escapeHtml(currentName(game.winnerId))+' venceu!</h3><p>Partida finalizada · '+players.length+' jogadores</p>'+
        people+makeButton("create","Nova partida",true)+'</div>';
    }
    const sidebar='<aside class="gartic-sidebar"><section class="gartic-sidebar-card"><h3>🏆 Classificação</h3>'+
      (active||ended?people:'<p class="gartic-muted">A classificação aparece quando o jogo começar.</p>')+'</section>'+
      '<section class="gartic-sidebar-card gartic-voice"><h3>🎙️ Áudio ao vivo</h3>'+
      '<p class="gartic-muted">'+(voiceJoined?(voiceMuted?'Seu microfone está silenciado.':'Você está no chat de voz.'):'Entre para conversar ao vivo com os jogadores.')+'</p>'+
      (voiceJoined?makeButton("mute",voiceMuted?'Ativar microfone':'Silenciar microfone')+makeButton("leave-voice","Sair do áudio"):
        makeButton("join-voice","Entrar no áudio",false,!me||!connected))+
      '<div data-gartic-audio-status class="gartic-muted">'+(connected?'Sala conectada':'Conectando ao tempo real…')+'</div></section>'+
      '<section class="gartic-sidebar-card gartic-chat"><h3>💬 Conversa da sala</h3>'+
      '<div class="gartic-chat-list" aria-live="polite">'+(chat||'<p class="gartic-muted">Comece a conversa.</p>')+'</div>'+
      '<form class="gartic-chat-form" data-gartic-chat><input name="message" maxlength="300" autocomplete="off" placeholder="Conversar…" aria-label="Mensagem para a sala"'+(me?'':' disabled')+'>'+
      '<button type="submit" aria-label="Enviar mensagem"'+(me?'':' disabled')+'>➤</button></form></section></aside>';
    const markup='<div data-looply-gartic class="gartic-shell">'+head+'<div class="gartic-grid">'+
      '<div class="gartic-primary">'+body+'</div>'+sidebar+'</div>'+
      '<div class="gartic-footer">'+(game.lastWord?'<span>Palavra anterior: <b>'+escapeHtml(game.lastWord)+'</b></span>':'<span>Conversa privada · Looply Games</span>')+
      (game.hostId===userId&&!ended?'<button type="button" data-gartic-action="finish">Encerrar partida</button>':'')+
      '</div></div>';
    openModal(markup);
    if(active) {setupCanvas();drawAll();updateClock();}
    const list=root.querySelector(".gartic-chat-list");if(list)list.scrollTop=list.scrollHeight;
  }
  function updateClock(){
    if(!game || game.status!=="active")return;
    const clock=root.querySelector("[data-gartic-clock]");
    if(!clock)return;
    const remaining=Math.max(0,Math.ceil((Date.parse(game.endsAt||"")-Date.now()-serverDelta)/1000));
    clock.textContent=String(Math.floor(remaining/60)).padStart(2,"0")+":"+String(remaining%60).padStart(2,"0");
    clock.classList.toggle("is-urgent",remaining<=12);
  }
  function drawStroke(ctx,stroke) {
    if(!stroke||!Array.isArray(stroke.points)||stroke.points.length===0)return;
    const points=stroke.points.filter(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&v>=0&&v<=1000));
    if(!points.length)return;
    const col=stroke.tool==="eraser"?"#ffffff":/^#[0-9a-f]{6}$/i.test(stroke.color)?stroke.color:"#242432";
    ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=Math.min(35,Math.max(1,Number(stroke.width)||4));
    ctx.lineCap="round";ctx.lineJoin="round";
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]*.65);
    if(points.length===1){ctx.arc(points[0][0],points[0][1]*.65,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();return;}
    for(const p of points.slice(1))ctx.lineTo(p[0],p[1]*.65);
    ctx.stroke();
  }
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
      drawAll();drawStroke(canvas.getContext("2d"),drawing);
    };
    canvas.onpointermove=e=>{
      if(!drawing)return;e.preventDefault();
      const p=position(e),last=drawing.points.at(-1);
      if(last&&Math.hypot(last[0]-p[0],last[1]-p[1])<2)return;
      if(drawing.points.length<140)drawing.points.push(p);
      drawAll();drawStroke(canvas.getContext("2d"),drawing);
    };
    canvas.onpointerup=async e=>{
      if(!drawing)return;
      const stroke=drawing;drawing=null;
      if(stroke.points.length===1)stroke.points.push(stroke.points[0]);
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
      if(!next){game=null;if(force)showEmpty();return;}
      const key=[next.gameId,next.status,next.turn,next.updatedAt,next.players?.length,next.strokes?.length,next.chat?.length].join(":");
      const changed=key!==renderedKey;
      const priorTurn=game?.turn,priorGame=game?.gameId;
      game=next;serverDelta=Date.parse(next.serverNow)-Date.now();
      if(priorGame!==next.gameId || priorTurn!==next.turn)localStrokes=[];
      if(open&&screen!=="hub"&&(changed||force)){renderedKey=key;renderGame(true);}
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
    const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    const audio=document.createElement("audio");audio.autoplay=true;audio.playsInline=true;audio.hidden=true;
    audio.dataset.garticRemoteAudio=id;document.body.append(audio);
    const record={pc,audio,pending:[]};remotePeers.set(id,record);
    voiceStream?.getTracks().forEach(track=>pc.addTrack(track,voiceStream));
    pc.ontrack=e=>{audio.srcObject=e.streams[0]||new MediaStream([e.track]);audio.play().catch(()=>{});};
    pc.onicecandidate=e=>{if(e.candidate)void sendPacket({kind:"voice-signal",target:id,signal:{type:"candidate",candidate:e.candidate.toJSON()}});};
    pc.onconnectionstatechange=()=>{
      if(["failed","closed"].includes(pc.connectionState)){
        audio.remove();remotePeers.delete(id);try{pc.close();}catch{}
      }
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
        if(record.pc.signalingState!=="stable")return;
        const offer=await record.pc.createOffer();
        await record.pc.setLocalDescription(offer);
        void sendPacket({kind:"voice-signal",target:sender,signal:{type:"offer",sdp:offer.sdp}});
      }
      if(packet.kind==="voice-signal" && packet.signal){
        const data=packet.signal,record=makePeer(sender);
        if(data.type==="offer"){
          await record.pc.setRemoteDescription({type:"offer",sdp:data.sdp});
          const answer=await record.pc.createAnswer();
          await record.pc.setLocalDescription(answer);
          void sendPacket({kind:"voice-signal",target:sender,signal:{type:"answer",sdp:answer.sdp}});
        }else if(data.type==="answer"){
          await record.pc.setRemoteDescription({type:"answer",sdp:data.sdp});
        }else if(data.type==="candidate"){
          if(record.pc.remoteDescription)await record.pc.addIceCandidate(data.candidate);
          else record.pending.push(data.candidate);
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
      voiceStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      voiceJoined=true;voiceMuted=false;
      await sendPacket({kind:"voice-join"});
      renderGame(true);
    }catch(error){toast("Não foi possível acessar o microfone.");}
  }
  async function switchConversation(){
    const id=selectedConversation();
    if(id===conversationId)return;
    stopVoice();if(channel)try{await client.removeChannel(channel)}catch{}
    conversationId=id;channel=null;game=null;connected=false;renderedKey="";localStrokes=[];
    if(pollTimer)clearInterval(pollTimer);pollTimer=null;
    if(!id||!client)return;
    const currentId=id;
    const next=client.channel("looply-game-"+id,{config:{broadcast:{self:false},disableFallback:true}});
    channel=next;
    next.on("broadcast",{event:"ttt"},({payload})=>{
      if(currentId!==conversationId||payload?.type!=="gartic"||payload.gameId!==game?.gameId||payload.senderId===userId)return;
      if(payload.kind?.startsWith("voice-")){void onVoicePacket(payload);return;}
      if(payload.kind==="stroke" && payload.turn===game?.turn){
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
    pollTimer=setInterval(()=>{if(!document.hidden && screen!=="hub" && open)void refresh();},2600);
  }
  async function openGartic(){
    await switchConversation();
    screen="empty";open=true;
    showEmpty();
    await refresh(true);
  }
  async function perform(action,value=null){
    if(busy)return;busy=true;
    const before=game?.turn;
    try{
      const next=await rpc(action,value);
      if(next) {
        game=next;serverDelta=Date.parse(next.serverNow)-Date.now();
        if(before!==next.turn)localStrokes=[];
        renderedKey="";renderGame(true);
        void sendPacket({kind:"updated"});
      }else if(action==="state")showEmpty();
    }catch(error){
      toast(/at least two/i.test(error.message)?"Aguarde pelo menos dois participantes.":"Não foi possível concluir: "+String(error.message||"").slice(0,110));
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
        renderGame(true);
      }else if(action==="leave-voice"){stopVoice();renderGame(true);}
      else if(["create","join","start","hint","finish"].includes(action))await perform(action,action==="create"?null:null);
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
    }return false;
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
      if(!text)return true;input.value="";
      await perform("chat",text);return true;
    }
    return false;
  }
  function onConversation(){void switchConversation();}
  function dispose(){disposed=true;stopVoice();if(pollTimer)clearInterval(pollTimer);if(channel)void client?.removeChannel(channel).catch(()=>{});}
  return {handleClick,handleChange,handleSubmit,onConversation,dispose,openHub:renderHub};
}
