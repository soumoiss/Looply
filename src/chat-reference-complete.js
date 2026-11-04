/**
 * Looply Messages — official model's drawers, sheets and actions, bound to real
 * conversation IDs and authenticated Neon rows. No prototype users or messages.
 * Both chat.html and conversa.html share this controller.
 */
import { modelIcon as ic } from './chat-model-icons.js';

const COLOR_PALETTE = ['#7010b0','#5f1098','#bd42f2','#087fbd','#c04483','#187b58','#6752d8','#d05b65','#14806e','#d76a32'];
const THEMES = [
 ['lilas','Lilás','#7010b0','#f5f0fa'],['noite','Noite','#b84dff','#100a18'],
 ['oceano','Oceano','#087fbd','#edf8fc'],['rosa','Rosa','#c04483','#fff2f7'],
 ['floresta','Floresta','#187b58','#f0f8f2'],['aurora','Aurora','#6752d8','#f4f2ff'],
 ['coral','Coral','#d05b65','#fff5f2'],['menta','Menta','#14806e','#effaf7'],
 ['sunset','Sunset','#d76a32','#fff7ed'],['grafite','Grafite','#c4a7ff','#11111b']
];
const safe = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = (key,fallback)=>{try{const result=JSON.parse(localStorage.getItem(key)||'null');return result??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const keys=(user,name)=>`looply-chat-v2:${user}:${name}`;
const prefs=(user,name)=>new Set(json(keys(user,name),[]));
const action=(name,label,desc,iconName,danger=false)=>`<button type="button" class="opt${danger?' dg':''}" data-ref-action="${name}">${ic(iconName)}<div>${label}${desc?`<small>${desc}</small>`:''}</div></button>`;

export function setupOfficialMessagesModel(root,client,userId,seed={}) {
  if (!root||root.__officialModelBound) return;
  root.__officialModelBound=true;
  root.classList.add('chat-official-model');
  document.body.classList.add('chat-model-live');
  let activeId='', activeInfo=null, lastModelDialog=null;
  const base=`looply-chat-model:${userId}:`;
  const bubbles=json(base+'bubbles',{});
  const cleared=json(base+'cleared',{});
  const excluded=new Set(json(base+'excluded',[]));
  const manualUnread=new Set(json(base+'unread',[]));
  const messageStars=new Set(json(base+'message-stars',[]));
  const messagePins=json(base+'message-pins',{});
  const flags=json(base+'flags',{});
  const notices=(message)=>{
    let node=root.querySelector('[data-ref-toast]');
    if(!node){node=document.createElement('div');node.className='toast';node.setAttribute('role','status');node.dataset.refToast='';root.append(node);}
    node.textContent=message;node.classList.add('on');clearTimeout(node._close);node._close=setTimeout(()=>node.classList.remove('on'),2600);
  };
  const node=(attr,tag,classes)=>{
    let el=root.querySelector(`[${attr}]`);
    if(!el){el=document.createElement(tag);el.className=classes;el.setAttribute(attr,'');root.append(el);}return el;
  };
  const drawer=()=>node('data-ref-drawer','aside','dr');
  const overlay=()=>node('data-ref-overlay','div','ref-overlay');
  const currentId=()=>root.querySelector('[data-chat-send]')?.dataset.conversationId||root.querySelector('.chat-thread-heading')?.dataset.conversationId||activeId;
  const currentHeading=()=>root.querySelector('.chat-thread-heading');
  const currentName=()=>currentHeading()?.querySelector('.chat-thread-identity strong')?.textContent?.trim()||'Conversa';
  const currentIsGroup=()=>currentHeading()?.dataset.chatKind==='group';
  const listedId=id=>[...root.querySelectorAll('[data-chat-open]')].find(el=>el.dataset.chatOpen===id);
  const stored=(name,id)=>prefs(userId,name).has(id);
  const fresh=()=>{paintRows();paintThread();};
  const header=document.querySelector('[data-site-header]');
  if(header&&!header.querySelector('[data-ref-settings]'))header.insertAdjacentHTML('beforeend',`<button type="button" class="ib ref-header-settings" data-ref-settings aria-label="Configurações de mensagens">${ic('settings')}</button>`);
  header?.addEventListener('click',event=>{if(event.target.closest('[data-ref-settings]'))settings();});
  const closeDrawer=()=>{drawer().classList.remove('on');overlay().classList.remove('is-drawer');root.classList.remove('model-drawer-open');lastModelDialog=null;};
  const closeSheet=()=>{
    const modal=overlay();modal.classList.remove('is-sheet');modal.querySelector('.sheet')?.remove();
    lastModelDialog=null;
  };
  const openSheet=(content,style='')=>{
    closeSheet();const ov=overlay();ov.classList.add('is-sheet');
    const sheet=document.createElement('section');sheet.className='sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.style.cssText=style;
    sheet.innerHTML=content;ov.append(sheet);lastModelDialog=sheet;
    sheet.querySelector('input,button')?.focus({preventScroll:true});return sheet;
  };
  const get = async(id)=>{
    const fallback=seed.conversations?.find(c=>c.id===id)||{};
    const heading=currentHeading();
    const isGroup=heading?.dataset.chatKind==='group'||fallback.kind==='group';
    const result=await client.from('conversations').select('id,kind,subject,created_by').eq('id',id).maybeSingle();
    const conversation=result?.data||fallback;
    const participantsResult=await client.from('conversation_participants')
      .select('user_id,profile:profiles!conversation_participants_user_id_fkey(id,username,display_name,avatar_path)')
      .eq('conversation_id',id);
    const participants=participantsResult.data||fallback.participants||[];
    const name=heading?.querySelector('.chat-thread-identity strong')?.textContent?.trim()||
      (isGroup?conversation.subject:listedId(id)?.querySelector('.chat-conversation-copy strong')?.textContent)||'Conversa';
    const avatar=heading?.querySelector('.chat-thread-avatar');
    const image=avatar?.tagName==='IMG'&&avatar.src?avatar.src:'';
    const other=participants.find(p=>p.user_id!==userId)?.profile;
    return {id,name,image,isGroup,conversation,participants,other,canManage:conversation.created_by===userId};
  };
  const initials=(label)=>String(label||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toLocaleUpperCase('pt-BR');
  const avatar=(info,large=false)=>info.image
    ? `<img class="av${info.isGroup?' g':''}${large?' lg':''}" src="${safe(info.image)}" alt="${info.isGroup?'Foto do grupo':'Foto do contato'}" referrerpolicy="no-referrer">`
    : `<span class="av${info.isGroup?' g':''}${large?' lg':''}" style="background:linear-gradient(135deg,var(--p),var(--pd))">${info.isGroup?ic('users'):safe(initials(info.name))}</span>`;
  const enabled=(name,id)=>stored(name,id);
  const toggleRow=(name,id)=>{
    const map={favorites:'favorite',pinned:'pin',muted:'mute',archived:'archive'};
    const current=listedId(id);
    if(!current || !map[name]) return;
    const btn=document.createElement('button');btn.type='button';btn.hidden=true;
    btn.dataset.chatPremiumRowAction=map[name];btn.dataset.chatPremiumRowId=id;
    root.append(btn);btn.click();btn.remove();
    // Enhancements owns the storage and runtime sets; do not duplicate its state.
    requestAnimationFrame(()=>{fresh();if(drawer().classList.contains('on'))void openDetails(id);});
  };
  const renderControls=info=>{
    const id=info.id,group=info.isGroup;
    const toggle=(key,title,sub,ico)=>`<div class="opt">${ic(ico)}<div>${title}<small>${sub}</small></div><label class="sw"><input type="checkbox" data-ref-toggle="${key}" ${enabled(key,id)?'checked':''} aria-label="${title}"><i></i></label></div>`;
    const members=group?`<div class="grp">${info.participants.length} participantes</div>
      ${info.participants.map(member=>{
        const p=member.profile||{},label=p.display_name||p.username||'Participante',self=member.user_id===userId;
        return `<div class="pk"><span class="av sm" style="background:var(--p)">${safe(initials(label))}</span><b>${safe(self?'Você':label)}${member.user_id===info.conversation.created_by?' <small style="color:var(--p)">· admin</small>':''}</b>${!self&&info.canManage?`<button class="ib" data-ref-remove-member="${safe(member.user_id)}" aria-label="Remover ${safe(label)}">${ic('close')}</button>`:''}</div>`;
      }).join('')}${action('addmem','Adicionar participante','', 'plus')}`:'';
    const cover=group?`<button class="ref-avatar-camera" type="button" data-ref-action="groupcover" aria-label="Trocar foto do grupo">${ic('camera')}</button>`:'';
    const actionButtons=`<div class="qa"><button type="button" data-ref-action="call">${ic('phone')}Ligar</button><button type="button" data-ref-action="video">${ic('video')}Vídeo</button><button type="button" data-ref-action="search">${ic('search')}Buscar</button><button type="button" data-ref-toggle-button="favorites">${ic(enabled('favorites',id)?'starF':'star')}Favorita</button></div>`;
    return `<button class="ib ref-close" type="button" data-ref-action="close" aria-label="Fechar">${ic('close')}</button>
      <div class="ctr"> <div class="ref-avatar-wrap">${avatar(info,true)}${cover}</div><h3>${safe(info.name)}</h3><small>${group?`${info.participants.length} participantes`:'Conversa em tempo real'}</small></div>
      ${actionButtons}${members}
      <div class="grp">Personalização</div>${action('rename',group?'Nome do grupo':'Apelido',info.name,'pencil')}
      <div class="opt">${ic('pal')}<div>Cor das mensagens</div></div>
      <div class="sws" aria-label="Cor das mensagens">${COLOR_PALETTE.map(color=>`<button type="button" data-ref-color="${color}" class="${(bubbles[id]||'')===color?'on':''}" style="background:${color}" aria-label="Cor ${color}"></button>`).join('')}</div>
      <div class="grp">Preferências</div>
      ${toggle('muted','Silenciar notificações','Sem avisos desta conversa','bellOff')}
      ${toggle('pinned','Fixar no topo','Mantém no início da lista','pin')}
      ${toggle('archived','Arquivar','Move para Arquivadas','arch')}
      ${action('ephemeral','Mensagens temporárias',flags[id]?.ephemeral||'Desativadas','clock')}
      <div class="grp">Privacidade</div>
      ${action('markunread','Marcar como não lida','','unread')}
      ${group?action('leave','Sair do grupo','','close',true):action('block',flags[id]?.blocked?'Desbloquear contato':'Bloquear contato','','block',true)}
      ${action('report','Denunciar','','flag',true)}
      ${action('clear','Limpar conversa','','trash',true)}
      ${action('delete','Excluir conversa','','trash',true)}`;
  };
  const openDetails=async id=>{
    if(!id)return;
    activeId=id;
    const dr=drawer();dr.classList.add('on');overlay().classList.add('is-drawer');
    root.classList.add('model-drawer-open');
    dr.innerHTML=`<button class="ib ref-close" data-ref-action="close" aria-label="Fechar">${ic('close')}</button><div class="ctr"><small>Carregando detalhes…</small></div>`;
    try{
      const info=await get(id);
      if(activeId!==id||!dr.classList.contains('on'))return;
      activeInfo=info;dr.innerHTML=renderControls(info);
    }catch(error){console.warn('Chat model details unavailable',error);
      dr.innerHTML=`<button class="ib ref-close" data-ref-action="close">${ic('close')}</button><div class="ctr"><h3>${safe(currentName())}</h3><small>Não foi possível carregar os detalhes.</small></div>`;}
  };
  const avatarChanges=()=>root.querySelector('.chat-thread-heading [data-chat-group-cover-choose]')?.click();
  const find=()=>{closeDrawer();root.querySelector('[data-chat-premium-search]')?.click();};
  const changeColor=(id,value)=>{
    bubbles[id]=value;save(base+'bubbles',bubbles);
    const thread=root.querySelector('.chat-thread');if(thread)thread.style.setProperty('--bub',value);
    drawer().querySelectorAll('[data-ref-color]').forEach(el=>el.classList.toggle('on',el.dataset.refColor===value));
  };
  const rename=id=>{
    const info=activeInfo;if(!info)return;
    if(info.isGroup&&!info.canManage){notices('Somente o criador pode alterar o nome do grupo.');return;}
    openSheet(`<h2><span>${info.isGroup?'Nome do grupo':'Apelido'}</span><button class="ib" data-ref-sheet-close aria-label="Fechar">${ic('close')}</button></h2>
    <form data-ref-rename><input type="hidden" name="id" value="${safe(id)}"><input class="fld" name="name" maxlength="${info.isGroup?120:60}" value="${safe(info.name)}" required aria-label="Novo nome"><button class="btn" type="submit">Salvar</button></form>`);
  };
  const updateName=async(name)=>{
    const id=activeInfo.id,was=activeInfo.name;
    if(activeInfo.isGroup){const {data,error}=await client.from('conversations').update({subject:name,updated_at:new Date().toISOString()}).eq('id',id).eq('created_by',userId).select('id').maybeSingle();if(error||!data)throw error||new Error('Não autorizado');}
    else{const {error}=await client.from('conversation_nicknames').upsert({user_id:userId,conversation_id:id,nickname:name,updated_at:new Date().toISOString()},{onConflict:'user_id,conversation_id'});if(error)throw error;
      const map=json(keys(userId,'nicknames'),{});map[id]=name;save(keys(userId,'nicknames'),map);}
    const row=listedId(id)?.querySelector('.chat-conversation-copy strong');if(row)row.textContent=name;
    const heading=currentHeading()?.querySelector('.chat-thread-identity strong');if(heading)heading.textContent=name;
    activeInfo.name=name;closeSheet();void openDetails(id);notices('Nome atualizado.');
  };
  let memberSearchSeq=0;
  const searchGroupCandidates=async(query='')=>{
    const id=activeInfo?.id;
    if(!id||!activeInfo?.canManage)return;
    const seq=++memberSearchSeq;
    const parent=root.querySelector('[data-ref-member-results]');
    if(!parent)return;
    parent.textContent='Buscando pessoas…';
    try{
      // Query the actual Neon profiles, not the 100-row chat-page snapshot.
      // User-scoped RLS still controls profile discovery.
      let request=client.from('profiles').select('id,username,display_name,avatar_path')
        .order('username').limit(30);
      const value=String(query||'').trim().replace(/^@/,'').slice(0,40);
      if(value) request=request.or(`username.ilike.${value.replace(/[^a-zA-Z0-9_]/g,'')}%,display_name.ilike.${value.replace(/[^a-zA-Z0-9_\s]/g,'')}%`);
      const {data,error}=await request;
      if(error)throw error;
      if(seq!==memberSearchSeq||id!==activeInfo?.id||!parent.isConnected)return;
      const members=new Set(activeInfo.participants.map(m=>m.user_id));
      const pool=(data||[]).filter(p=>p.id!==userId&&!members.has(p.id));
      parent.innerHTML=pool.map(p=>`<button type="button" class="pk" data-ref-add-member="${safe(p.id)}"><span class="av sm" style="background:var(--p)">${safe(initials(p.display_name||p.username))}</span><b>${safe(p.display_name||p.username)}<small>@${safe(p.username)}</small></b>${ic('plus')}</button>`).join('')||'<p class="ref-empty-members">Nenhuma pessoa disponível para adicionar.</p>';
    }catch(error){if(seq===memberSearchSeq&&parent.isConnected){parent.textContent='Não foi possível buscar usuários.';console.warn('group member search failed',error);}}
  };
  const pickNewMember=()=>{
    if(!activeInfo?.isGroup)return;
    if(!activeInfo.canManage){notices('Somente o criador pode gerenciar participantes.');return;}
    openSheet(`<h2><span>Adicionar participante</span><button class="ib" data-ref-sheet-close>${ic('close')}</button></h2>
    <label class="sr ref-member-search">${ic('search')}<input type="search" data-ref-member-query aria-label="Buscar pessoas" placeholder="Buscar nome ou @usuário" autocomplete="off"></label>
    <div class="ref-people" data-ref-member-results role="status">Buscando pessoas…</div>`);
    void searchGroupCandidates();
  };
  const confirmSheet=(heading,body,yes,actionName)=>openSheet(`<h2><span>${heading}</span><button class="ib" data-ref-sheet-close>${ic('close')}</button></h2><p>${body}</p><button type="button" class="btn ref-danger" data-ref-confirm="${actionName}">${yes}</button><button type="button" class="btn gh" data-ref-sheet-close>Cancelar</button>`);
  const rowMenu=id=>{
    const item=listedId(id),label=item?.querySelector('.chat-conversation-copy strong')?.textContent||'Conversa';
    activeId=id;activeInfo=null;
    root.querySelector('[data-chat-premium-row-popover]')?.remove();
    const fmt=(name,ico,verb)=>`<button type="button" class="opt" data-ref-row-action="${name}">${ic(ico)}<div>${verb}</div></button>`;
    const h=`<h2><span>${safe(label)}</span><button class="ib" data-ref-sheet-close>${ic('close')}</button></h2>`;
    openSheet(h+
      fmt('favorite','star',enabled('favorites',id)?'Remover das favoritas':'Favoritar')+
      fmt('pin','pin',enabled('pinned',id)?'Desafixar':'Fixar no topo')+
      fmt('mute','bellOff',enabled('muted',id)?'Reativar som':'Silenciar')+
      fmt('archive','arch',enabled('archived',id)?'Desarquivar':'Arquivar')+
      `<button type="button" class="opt dg" data-ref-row-action="delete">${ic('trash')}<div>Excluir conversa</div></button>`);
  };
  const settings=()=>{
    const selected=document.documentElement.dataset.savedTheme||localStorage.getItem('looply_theme')||'lilas';
    openSheet(`<h2><span>Configurações de mensagens</span><button class="ib" data-ref-sheet-close>${ic('close')}</button></h2>
      <div class="grp">Tema</div><div class="sws">${THEMES.map(([k,l,p,b])=>`<button data-ref-theme="${k}" aria-label="Tema ${l}" class="${selected===k?'on':''}" style="background:linear-gradient(135deg,${p} 55%,${b} 55%)"></button>`).join('')}<button data-ref-theme="system" aria-label="Tema do sistema" class="${selected==='system'?'on':''}" style="background:linear-gradient(135deg,#fff 50%,#222 50%)"></button></div>
      <div class="grp">Texto</div><p>Fontes e tamanhos são definidos nas configurações globais do Looply.</p>
      <a class="btn ref-config-link" href="configuracoes.html">Configurações globais</a>
      <div class="grp">Conversas</div>${action('allread','Marcar todas como lidas','','check2')}${action('archread','Arquivar todas as lidas','','arch')}`);
  };
  const paintRows=()=>{
    root.querySelectorAll('.chat-conversation').forEach(row=>{
      const id=row.dataset.chatOpen;
      row.classList.add('row');
      row.querySelector('.chat-conversation-avatar')?.classList.add('av');
      row.querySelector('.chat-conversation-copy')?.classList.add('rb');
      row.querySelector('.chat-model-row-title')?.classList.add('rt');
      row.querySelector('.chat-model-row-preview')?.classList.add('rp');
      row.querySelector('.chat-unread')?.classList.add('ub');
      const more=row.querySelector('.chat-premium-row-more');if(more)more.classList.add('ib');
      row.classList.toggle('un',manualUnread.has(id)||Number(row.dataset.chatUnreadCount)>0);
      row.classList.toggle('is-model-excluded',excluded.has(id));
    });
    root.querySelector('.chat-heading')?.classList.add('sh');
    root.querySelector('.chat-model-search')?.classList.add('sr');
    root.querySelector('.chat-premium-stories-slot')?.classList.add('stories');
    root.querySelector('.chat-filter-tabs')?.classList.add('chips');
    root.querySelectorAll('.chat-filter-chip').forEach(button=>{button.classList.add('chip');button.classList.toggle('on',button.getAttribute('aria-pressed')==='true');});
    root.querySelector('.chat-conversation-list')?.classList.add('list');
  };
  const paintThread=()=>{
    const area=root.querySelector('.chat-area'),heading=currentHeading();
    area?.classList.toggle('in',!!heading);
    if(heading){activeId=heading.dataset.conversationId||activeId;
      heading.classList.add('th');
      const title=heading.querySelector('.chat-thread-identity');title?.classList.add('who');
      const avatar=heading.querySelector('.chat-thread-avatar');avatar?.classList.add('av','sm');
      heading.querySelector('.chat-back-button')?.classList.add('back','ib');
      heading.querySelectorAll('.chat-v2-icon-button').forEach(button=>button.classList.add('ib'));
      if(heading.dataset.chatKind==='group')heading.querySelector('.chat-group-avatar-wrap')?.classList.add('ref-heading-avatar');
    }
    const history=root.querySelector('[data-chat-premium-history]');history?.classList.add('msgs');
    root.querySelectorAll('.chat-message').forEach(message=>{
      message.classList.add('m');message.querySelector('.chat-bubble')?.classList.add('bu');
      if(message.classList.contains('is-mine'))message.classList.add('me');
      const row=message.closest('[data-message-row-id]');
      const id=heading?.dataset.conversationId;
      if(id&&cleared[id]){
        const time=message.querySelector('time[datetime]')?.dateTime;
        row?.classList.toggle('is-model-cleared',Boolean(time&&Date.parse(time)<=cleared[id]));
      }
      const msgid=row?.dataset.messageRowId;
      message.classList.toggle('is-model-starred',messageStars.has(msgid));
      message.classList.toggle('is-model-pinned',messagePins[id]===msgid);
    });
    root.querySelectorAll('.chat-date-separator').forEach(el=>el.classList.add('day'));
    const form=root.querySelector('[data-chat-send]');
    form?.classList.add('cmp');form?.querySelector('.chat-premium-compose-box')?.classList.add('box');
    form?.querySelector('.chat-premium-send')?.classList.add('send');
    form?.querySelectorAll('.chat-emoji-button,.chat-attachment-label,.chat-record-start').forEach(btn=>btn.classList.add('ib'));
    if(form&&activeId){if(bubbles[activeId])root.querySelector('.chat-thread')?.style.setProperty('--bub',bubbles[activeId]);
      else root.querySelector('.chat-thread')?.style.removeProperty('--bub');}
    if(form){form.hidden=Boolean(flags[activeId]?.blocked);let block=root.querySelector('.ref-blocked-banner');
      if(flags[activeId]?.blocked){if(!block){block=document.createElement('div');block.className='ref-blocked-banner';form.before(block);}block.innerHTML=`Você bloqueou este contato. <button type="button" data-ref-action="block">Desbloquear</button>`;}else block?.remove();}
    const pinned=messagePins[activeId];let pin=root.querySelector('.ref-pinned-message');
    if(!pinned){pin?.remove();return;}
    const message=root.querySelector(`[data-message-row-id="${CSS.escape(pinned)}"]`);
    if(message&&!pin){pin=document.createElement('div');pin.className='ref-pinned-message';heading?.after(pin);}
    if(pin){pin.innerHTML=`${ic('pin')} <span>Mensagem fixada</span><button type="button" data-ref-action="unpinmsg" aria-label="Desafixar">${ic('close')}</button>`;}
  };
  const decorate=()=>{
    root.querySelector('.chat-layout')?.classList.add('main');
    root.querySelector('.chat-sidebar')?.classList.add('side');
    root.querySelector('.chat-thread-panel')?.classList.add('thread');
    root.querySelector('.chat-thread')?.classList.add('ref-thread-body');
    paintRows();paintThread();
  };
  const handleAction=async(type)=>{
    const id=activeInfo?.id||currentId();
    if(type==='close'){closeDrawer();return;}
    if(type==='groupcover'){closeDrawer();avatarChanges();return;}
    if(type==='call'||type==='video'){closeDrawer();root.querySelector(type==='call'?'[data-call-audio]':'[data-call-video]')?.click();return;}
    if(type==='search'){find();return;}
    if(type==='rename'){rename(id);return;}
    if(type==='addmem'){pickNewMember();return;}
    if(type==='markunread'){manualUnread.add(id);save(base+'unread',[...manualUnread]);closeDrawer();paintRows();notices('Conversa marcada como não lida.');return;}
    if(type==='ephemeral'){const options=['Desativadas','24 horas','7 dias','90 dias'];const old=flags[id]?.ephemeral||options[0];flags[id]={...flags[id],ephemeral:options[(options.indexOf(old)+1)%options.length]};save(base+'flags',flags);notices(`Temporárias: ${flags[id].ephemeral}`);void openDetails(id);return;}
    if(type==='block'){confirmSheet(flags[id]?.blocked?'Desbloquear contato?':'Bloquear contato?', 'Esta preferência impede o envio de novas mensagens neste aparelho.',flags[id]?.blocked?'Desbloquear':'Bloquear','block');return;}
    if(type==='report'){confirmSheet('Denunciar conversa?','A denúncia será enviada à moderação do Looply para análise.','Enviar denúncia','report');return;}
    if(type==='clear'){confirmSheet('Limpar conversa?','O histórico será ocultado apenas neste aparelho; as mensagens de outras pessoas serão preservadas.','Limpar','clear');return;}
    if(type==='delete'){confirmSheet('Excluir conversa?','A conversa deixará de aparecer na sua lista, sem apagar os dados dos demais participantes.','Excluir','delete');return;}
    if(type==='leave'){confirmSheet('Sair do grupo?','Você perderá acesso às mensagens futuras deste grupo.','Sair do grupo','leave');return;}
    if(type==='unpinmsg'){delete messagePins[id];save(base+'message-pins',messagePins);paintThread();return;}
    if(type==='allread'){for(const row of root.querySelectorAll('[data-chat-open]')){manualUnread.delete(row.dataset.chatOpen);}save(base+'unread',[...manualUnread]);notices('Marcadores locais de não lidas removidos.');closeSheet();paintRows();return;}
    if(type==='archread'){for(const row of root.querySelectorAll('[data-chat-open]')){if(!Number(row.dataset.chatUnreadCount))toggleRow('archived',row.dataset.chatOpen);}closeSheet();return;}
  };
  async function confirmed(type){
    const id=activeId||activeInfo?.id;
    try{
      if(type==='block'){flags[id]={...flags[id],blocked:!flags[id]?.blocked};save(base+'flags',flags);notices(flags[id].blocked?'Contato bloqueado neste aparelho.':'Contato desbloqueado.');}
      else if(type==='report'){
        // Do not fake a moderation submission. Ask the official feedback endpoint.
        const response=await client.from('chat_conversation_reports').insert({conversation_id:id,reporter_id:userId,reason:'Denúncia enviada pela tela de mensagens'}).select('id').maybeSingle();
        if(response.error||!response.data?.id)throw response.error||Error('report_not_confirmed');
        notices('Denúncia registrada pela moderação.');
      }else if(type==='clear'){cleared[id]=Date.now();save(base+'cleared',cleared);paintThread();notices('Histórico ocultado neste aparelho.');}
      else if(type==='delete'){excluded.add(id);save(base+'excluded',[...excluded]);paintRows();closeDrawer();root.querySelector('[data-chat-back]')?.click();notices('Conversa removida da lista neste aparelho.');}
      else if(type==='leave'){
        const {data,error}=await client.from('conversation_participants').delete().eq('conversation_id',id).eq('user_id',userId).select('user_id').maybeSingle();
        if(error||!data?.user_id)throw error||Error('Não autorizado');
        excluded.add(id);save(base+'excluded',[...excluded]);closeDrawer();root.querySelector('[data-chat-back]')?.click();notices('Você saiu do grupo.');
      }
      closeSheet();
      if(drawer().classList.contains('on'))void openDetails(id);
    }catch(error){console.warn('Official model action failed',type,error);notices('Não foi possível concluir essa ação no servidor.');}
  }
  const handleClick=async event=>{
    const target=event.target;
    if(target===overlay()&&target.classList.contains('is-sheet')){closeSheet();return;}
    if(target===overlay()&&target.classList.contains('is-drawer')){closeDrawer();return;}
    if(target.closest('[data-ref-sheet-close]')){event.preventDefault();closeSheet();return;}
    const ref=target.closest('[data-ref-action]');
    if(ref){event.preventDefault();await handleAction(ref.dataset.refAction);return;}
    const flag=target.closest('[data-ref-confirm]');if(flag){event.preventDefault();flag.disabled=true;await confirmed(flag.dataset.refConfirm);flag.disabled=false;return;}
    const row=target.closest('[data-ref-row-action]');if(row){event.preventDefault();const mode=row.dataset.refRowAction;
      if(mode==='delete'){confirmSheet('Excluir conversa?','A conversa sairá da lista somente neste aparelho.','Excluir','delete');return;}
      toggleRow({favorite:'favorites',pin:'pinned',mute:'muted',archive:'archived'}[mode],activeId);closeSheet();return;
    }
    if(target.closest('[data-ref-toggle-button]')){toggleRow('favorites',activeId);return;}
    const color=target.closest('[data-ref-color]');if(color){changeColor(activeInfo.id,color.dataset.refColor);return;}
    const theme=target.closest('[data-ref-theme]');if(theme){
      const {applyTheme}=await import('./theme.js');applyTheme(theme.dataset.refTheme);
      settings();return;
    }
    const add=target.closest('[data-ref-add-member]');if(add){
      if(!activeInfo?.canManage)return;
      add.disabled=true;
      try{const {data,error}=await client.rpc('v36_add_group_member',{p_conversation_id:activeInfo.id,p_user_id:add.dataset.refAddMember});if(error||data!==true)throw error||Error('membership_not_confirmed');
        closeSheet();notices('Participante adicionado.');void openDetails(activeInfo.id);
      }catch(error){console.warn(error);add.disabled=false;notices('Não foi possível adicionar este participante.');}return;
    }
    const remove=target.closest('[data-ref-remove-member]');if(remove){
      if(!activeInfo?.canManage)return;
      if(!window.confirm('Remover este participante do grupo?'))return;
      try{const {data,error}=await client.rpc('v36_remove_group_member',{p_conversation_id:activeInfo.id,p_user_id:remove.dataset.refRemoveMember});if(error||data!==true)throw error||Error('removal_not_confirmed');notices('Participante removido.');void openDetails(activeInfo.id);}
      catch(error){console.warn(error);notices('A remoção não foi autorizada.');}return;
    }
    const messageStar=target.closest('[data-model-message-star]');if(messageStar){
      const id=messageStar.dataset.modelMessageStar;
      if(messageStars.has(id))messageStars.delete(id);else messageStars.add(id);
      save(base+'message-stars',[...messageStars]);root.querySelector('.chat-react-backdrop')?.click();paintThread();notices(messageStars.has(id)?'Mensagem favoritada':'Removida das favoritas');return;
    }
    const messagePin=target.closest('[data-model-message-pin]');if(messagePin){const id=messagePin.dataset.modelMessagePin;messagePins[currentId()]=id;save(base+'message-pins',messagePins);root.querySelector('.chat-react-backdrop')?.click();paintThread();notices('Mensagem fixada.');return;}
    const forward=target.closest('[data-model-message-forward]');if(forward){
      const row=forward.closest('.chat-message');const body=row?.querySelector('[data-chat-message-body]')?.textContent||'';
      if(!body.trim()){notices('Este tipo de mídia não pode ser encaminhado dessa forma.');return;}
      const choices=[...root.querySelectorAll('[data-chat-open]')].filter(node=>!excluded.has(node.dataset.chatOpen));
      openSheet(`<h2><span>Encaminhar mensagem</span><button class="ib" data-ref-sheet-close>${ic('close')}</button></h2><div class="ref-people">${choices.map(c=>`<button type="button" class="pk" data-ref-forward-to="${safe(c.dataset.chatOpen)}"><span class="av sm" style="background:var(--p)">${safe(initials(c.querySelector('strong')?.textContent))}</span><b>${safe(c.querySelector('strong')?.textContent||'Conversa')}</b>${ic('send')}</button>`).join('')}</div>`);
      root._refForwardBody=body;root.querySelector('.chat-react-backdrop')?.click();return;
    }
    const to=target.closest('[data-ref-forward-to]');if(to){to.disabled=true;try{
      const {error}=await client.from('chat_messages').insert({conversation_id:to.dataset.refForwardTo,sender_id:userId,body:root._refForwardBody});if(error)throw error;
      closeSheet();notices('Mensagem encaminhada.');
    }catch(error){console.warn(error);notices('Não foi possível encaminhar.');to.disabled=false;}return;}
  };
  const clickCapture=event=>{
    const header=event.target.closest('.chat-thread-heading');
    if(event.target.closest('[data-v2-thread-settings]')||header&&event.target.closest('.chat-thread-identity,.chat-thread-avatar')){
      event.preventDefault();event.stopImmediatePropagation();void openDetails(currentId());return;
    }
    const row=event.target.closest('[data-chat-premium-rowmenu]');
    if(row){event.preventDefault();event.stopImmediatePropagation();rowMenu(row.dataset.chatPremiumRowmenu);return;}
  };
  root.addEventListener('click',clickCapture,true);
  root.addEventListener('click',handleClick);
  let memberSearchTimer=0;
  root.addEventListener('input',event=>{
    if(!event.target.matches('[data-ref-member-query]'))return;
    clearTimeout(memberSearchTimer);
    const query=event.target.value;
    memberSearchTimer=setTimeout(()=>void searchGroupCandidates(query),180);
  });
  root.addEventListener('change',event=>{
    const toggle=event.target.closest('[data-ref-toggle]');
    if(!toggle)return;toggleRow(toggle.dataset.refToggle,activeInfo?.id||activeId);
    if(toggle.dataset.refToggle==='archived'){closeDrawer();root.querySelector('[data-chat-back]')?.click();}
  });
  root.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-ref-rename]');if(!form)return;
    event.preventDefault();const name=form.elements.name.value.trim();if(!name)return;
    const button=form.querySelector('[type=submit]');button.disabled=true;
    try{await updateName(name);}catch(error){console.warn('Failed to rename conversation',error);notices('Nome não salvo no servidor.');button.disabled=false;}
  },true);
  root.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    if(overlay().classList.contains('is-sheet')){closeSheet();event.stopPropagation();}
    else if(drawer().classList.contains('on')){closeDrawer();event.stopPropagation();}
  });
  root.addEventListener('looply:conversation-activated',()=>{closeDrawer();closeSheet();manualUnread.delete(currentId());save(base+'unread',[...manualUnread]);requestAnimationFrame(decorate);});
  root.addEventListener('looply:chat-rendered',()=>requestAnimationFrame(decorate));
  // Decorate only when the message tree changes; avoid reflowing a scrolling
  // history or replacing DOM nodes during Neon realtime events.
  const observer=new MutationObserver(records=>{
    if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('.chat-layout,.chat-thread-heading,.chat-message,.chat-conversation')||n.querySelector?.('.chat-message,.chat-conversation,.chat-thread-heading')))))
      queueMicrotask(decorate);
  });
  observer.observe(root,{childList:true,subtree:true});
  decorate();
  return ()=>{observer.disconnect();root.removeEventListener('click',clickCapture,true);root.removeEventListener('click',handleClick);closeDrawer();closeSheet();};
}
