// Cloudflare notifies, but the Neon database authoritatively validates all
// players, moves, completed games and historical scores.
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,
  c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export const winningLine=board=>Array.isArray(board)&&board.length===9
  ?(LINES.find(([a,b,c])=>board[a]&&board[a]===board[b]&&board[a]===board[c])||[]):[];
export const tttDisplayName=player=>String(player?.name||"").trim()||String(player?.username||"").trim()||"Usuário";
export const tttScore=(game,userId)=>{
  const x=Number(game?.score?.x||0),o=Number(game?.score?.o||0),draws=Number(game?.score?.draws||0);
  return {x,o,draws,own:userId===game?.xPlayer?x:userId===game?.oPlayer?o:0};
};

export function setupChatTtt({root,client,userId,selectedConversation,isGroup,openModal,closeModal,toast}){
  let conversationId="",channel=null,timer=null,current=null,busy=false;
  let dismissedId="",hydration=null,disposed=false,offline=false;
  const avatars=new Map();
  const gameIsOpen=()=>Boolean(root.querySelector("[data-chat-v2-modal]:not([hidden]) [data-v2-game-board]"));
  function showConnectionState(){
    const notice=root.querySelector("[data-v2-game-board] .chat-ttt-connection");
    if(notice)notice.textContent=offline
      ?"Sem conexão. A partida será sincronizada automaticamente."
      :"Jogadas validadas pelo servidor";
    if(offline)root.querySelectorAll("[data-v2-game-board] [data-v2-cell]")
      .forEach(button=>button.disabled=true);
  }
  const validConversation=()=>selectedConversation()&&!isGroup();
  const rpc=async(name,args)=>{
    const {data,error}=await client.rpc(name,args);
    if(error)throw Error(error.message||"Operação recusada pelo Neon.");
    return data;
  };
  const notify=async(gameId)=>{
    if(!channel)return;
    try{await channel.send({type:"broadcast",event:"ttt",
      payload:{type:"updated",gameId,conversationId}});}catch{}
  };
  const nameForId=id=>id===current?.xPlayer?tttDisplayName(current.x):
    id===current?.oPlayer?tttDisplayName(current.o):"";
  function playerCard(player,mark,score,isTurn,isWinner){
    const name=tttDisplayName(player),handle=player?.username?"@"+player.username:"";
    return '<article class="chat-ttt-player'+(isTurn?' is-turn':'')+(isWinner?' is-winner':'')+
      '" aria-label="Jogador '+mark+': '+escapeHtml(name)+'">'+
      '<div class="chat-ttt-avatar" data-ttt-avatar="'+escapeHtml(player?.id)+'" aria-hidden="true">'+escapeHtml(name[0]?.toUpperCase()||"?")+'</div>'+
      '<div class="chat-ttt-identity"><span class="chat-ttt-player-symbol">'+mark+' · Jogador '+mark+'</span>'+
      '<strong title="'+escapeHtml(name)+'">'+escapeHtml(name)+'</strong>'+
      '<small title="'+escapeHtml(handle)+'">'+escapeHtml(handle)+'</small>'+
      '<span class="chat-ttt-win-count">'+score+' '+(score===1?'vitória':'vitórias')+'</span></div></article>';
  }
  async function setAvatars(game){
    for(const person of [game.x,game.o]){
      if(!person?.id||!person?.avatarPath)continue;
      const targets=[...root.querySelectorAll('[data-ttt-avatar="'+person.id+'"]')];
      if(!targets.length)continue;
      let url=avatars.get(person.id);
      if(!url){
        try{
          const {data,error}=await client.storage.from("looply-avatars")
            .createSignedUrl(person.avatarPath,600);
          if(!error&&typeof data?.signedUrl==="string"&&/^https:\/\//.test(data.signedUrl)){
            url=data.signedUrl;avatars.set(person.id,url);
          }
        }catch{}
      }
      if(!url)continue;
      for(const target of targets){
        if(target.querySelector("img"))continue;
        const img=document.createElement("img");img.alt="";img.loading="lazy";
        img.decoding="async";img.src=url;target.replaceChildren(img);
      }
    }
  }
  function renderGame(game){
    if(!game||game.status==="declined"){closeModal();return;}
    const finished=game.status==="finished",invited=game.status==="invited";
    const active=game.status==="active",me=game.turn===userId,mine=game.invitedBy===userId;
    const status=invited
      ?(mine?"Convite enviado. Aguardando resposta…":tttDisplayName(game.x.id===game.invitedBy?game.x:game.o)+" convidou você para jogar.")
      :finished?(game.isDraw?"Partida empatada!":"🏆 "+nameForId(game.winnerId)+" venceu a partida!")
      :me?"É a sua vez, "+nameForId(userId)+"!":"É a vez de "+nameForId(game.turn)+".";
    const scores=tttScore(game,userId),line=winningLine(game.board||[]);
    const board=(game.board||Array(9).fill("")).map((cell,index)=>{
      const won=line.includes(index)&&finished;
      return '<button type="button" class="chat-v2-cell'+(won?' is-winning':'')+(cell?' is-played':'')+
        '" data-v2-cell="'+index+'" aria-label="Casa '+(index+1)+(cell?': '+cell:'')+'"'+
        (busy||!active||!me||cell?' disabled':'')+'>'+escapeHtml(cell||"")+'</button>';
    }).join("");
    const actions=invited
      ?(mine?'<button type="button" class="chat-v2-button" data-v2-decline>Cancelar convite</button>'
        :'<button type="button" class="chat-v2-button" data-v2-decline>Recusar</button><button type="button" class="chat-v2-button is-primary" data-v2-accept>Aceitar convite</button>')
      :finished?'<button type="button" class="chat-v2-button" data-v2-close-game>Fechar</button><button type="button" class="chat-v2-button is-primary" data-v2-rematch>Jogar novamente</button>'
      :'<button type="button" class="chat-v2-button" data-v2-close-game>Fechar por enquanto</button>';
    openModal('<div data-v2-game-board class="chat-ttt-game">'+
      '<span class="chat-v2-kicker">Jogo da velha · Rodada '+(Number(game.round)||1)+'</span>'+
      '<h2 id="chatV2ModalTitle">Partida no Looply</h2>'+
      '<div class="chat-ttt-players">'+playerCard(game.x,"X",scores.x,game.turn===game.xPlayer,game.winnerId===game.xPlayer)+
      playerCard(game.o,"O",scores.o,game.turn===game.oPlayer,game.winnerId===game.oPlayer)+'</div>'+
      '<p class="chat-v2-game-status" role="status" aria-live="polite">'+escapeHtml(status)+'</p>'+
      '<p class="chat-v2-scoreboard" data-v2-scoreboard>Empates: <strong>'+scores.draws+'</strong> · Placar salvo no Neon</p>'+
      '<div class="chat-v2-board" role="group" aria-label="Tabuleiro do jogo da velha">'+board+'</div>'+
      '<p class="chat-ttt-connection">Jogadas validadas pelo servidor</p>'+
      '<div class="chat-v2-actions">'+actions+'</div></div>');
    showConnectionState();
    void setAvatars(game);
  }
  function showInvitePrompt(){
    openModal('<span class="chat-v2-kicker">Jogo da velha</span>'+
      '<h2 id="chatV2ModalTitle">Convidar para jogar?</h2>'+
      '<p>Uma partida privada nesta conversa. Nomes, turnos e vitórias são verificados pelo Neon.</p>'+
      '<div class="chat-v2-actions"><button type="button" class="chat-v2-button" data-v2-close>Cancelar</button>'+
      '<button type="button" class="chat-v2-button is-primary" data-v2-send-invite>Enviar convite</button></div>');
  }
  function reconcile(game,{show=false}={}){
    if(!game)return;
    const previous=current,changed=!previous||previous.gameId!==game.gameId||previous.updatedAt!==game.updatedAt;
    current=game;
    if(game.status==="declined"){
      if(gameIsOpen())closeModal();
      return;
    }
    if(gameIsOpen()&&changed){renderGame(game);return;}
    if(show){dismissedId="";renderGame(game);return;}
    if(game.gameId===dismissedId)return;
    const newInvitation=game.status==="invited"&&game.invitedBy!==userId&&(!previous||previous.gameId!==game.gameId);
    const restoredActive=game.status==="active"&&(!previous||previous.gameId!==game.gameId);
    if(newInvitation||restoredActive)renderGame(game);
  }
  async function refresh({show=false}={}){
    if(disposed||!validConversation()||!conversationId)return;
    if(hydration)return hydration;
    const id=conversationId;
    hydration=(async()=>{
      try{
        const game=await rpc("v25_ttt_state",{p_conversation_id:id});
        if(id!==conversationId||disposed)return;
        const reconnecting=offline;
        offline=false;
        if(game)reconcile(game,{show:show||(reconnecting&&gameIsOpen())});
        showConnectionState();
        else if(show)showInvitePrompt();
      }catch{
        offline=true;
        showConnectionState();
        if(show)toast("Jogo indisponível. Confira a conexão ou a sessão.");
      }
    })();
    try{return await hydration;}finally{hydration=null;}
  }
  async function switchConversation(){
    if(disposed)return;
    const id=validConversation()?selectedConversation():"";
    if(id===conversationId)return;
    if(timer){clearInterval(timer);timer=null;}
    const old=channel;channel=null;conversationId=id;current=null;dismissedId="";
    offline=false;
    if(old)void client.removeChannel(old).catch(()=>{});
    if(!id)return;
    const nextChannel=client.channel("looply-game-"+id,{config:{broadcast:{self:false},disableFallback:true}});
    channel=nextChannel;
    nextChannel.on("broadcast",{event:"ttt"},({payload})=>{
      if(!payload||payload.conversationId!==id||id!==conversationId||payload.senderId===userId)return;
      void refresh();
    });
    nextChannel.subscribe();
    timer=setInterval(()=>{
      if(!document.hidden&&id===conversationId)void refresh();
    },3500);
    await refresh();
  }
  async function withAction(task){
    if(busy)return;
    busy=true;
    const controls=[...root.querySelectorAll("[data-v2-game-board] button")];
    controls.forEach(button=>button.disabled=true);
    try{
      const game=await task();
      if(game?.gameId){reconcile(game,{show:true});void notify(game.gameId);}
    }catch(error){
      toast(/not your turn|turno/i.test(error?.message||"")
        ?"Aguarde sua vez. O tabuleiro será sincronizado.":"Não foi possível concluir a jogada. Sincronizando…");
      await refresh({show:true});
    }finally{busy=false;}
  }
  async function handleClick(target){
    if(target.matches("[data-v2-game]")){
      if(!validConversation()){toast("O jogo está disponível apenas em conversas individuais.");return true;}
      await switchConversation();
      // Reopening a match must re-read Neon before enabling any move.
      // A cached board from before a disconnect is never authoritative.
      await refresh({show:true});
      if(!current||current.status==="declined")showInvitePrompt();
      return true;
    }
    if(target.matches("[data-v2-send-invite]")){
      if(validConversation())await withAction(()=>rpc("v25_ttt_invite",{p_conversation_id:conversationId}));
      return true;
    }
    if(target.matches("[data-v2-accept]")){
      if(current)await withAction(()=>rpc("v25_ttt_accept",{p_game_id:current.gameId}));
      return true;
    }
    if(target.matches("[data-v2-decline]")){
      if(current)await withAction(()=>rpc("v25_ttt_decline",{p_game_id:current.gameId}));
      return true;
    }
    if(target.matches("[data-v2-cell]")){
      const cell=Number(target.dataset.v2Cell);
      if(current&&Number.isInteger(cell)&&cell>=0&&cell<9)
        await withAction(()=>rpc("v25_ttt_move",{p_game_id:current.gameId,p_cell:cell}));
      return true;
    }
    if(target.matches("[data-v2-rematch]")){
      if(current)await withAction(()=>rpc("v25_ttt_rematch",{p_game_id:current.gameId}));
      return true;
    }
    if(target.matches("[data-v2-close-game]")){
      dismissedId=current?.gameId||"";closeModal();return true;
    }
    if(target.matches("[data-v2-close]")&&gameIsOpen()){
      dismissedId=current?.gameId||"";return false;
    }
    return false;
  }
  function dispose(){
    disposed=true;
    if(timer)clearInterval(timer);
    timer=null;
    if(channel)void client.removeChannel(channel).catch(()=>{});
    channel=null;conversationId="";
  }
  return {handleClick,onConversation:switchConversation,dispose};
}
