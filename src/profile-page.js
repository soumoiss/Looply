import { icon } from './icons.js';
import { saveNeonProfile } from './neon-avatar-profile.js';
import { normalizeYouTubePlaylistUrl } from './youtube-playlist.js';
import { PROFILE_TABS, esc, isProfileId, profileError, profileRpc, signPeople, signContentCovers, optimisticFollow, prepareProfileAvatar } from './profile-api.js';
import { createProfileMediaViewer } from './profile-media-viewer.js';

const avatar = p => p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" data-profile-avatar-id="${esc(p.id)}" alt="" referrerpolicy="no-referrer">` : `<span aria-hidden="true">${esc(Array.from(p.display_name || p.username || '?')[0])}</span>`;
const closeButton = label => `<button type="button" class="pr-icon" data-pr-close aria-label="${label}">${icon('close')}</button>`;
const skeleton = () => `<div class="pr-grid" aria-busy="true">${Array.from({length:9},()=>'<div class="pr-tile pr-skeleton"></div>').join('')}</div>`;

export function profileShellMarkup(mine, isAdmin, person) {
  return `<section class="pr-page" aria-label="Perfil de usuário">
    <div class="pr-card" data-pr-card></div>
    <p class="pr-status" data-pr-status role="status"></p>
    <nav class="pr-tabs" role="tablist" aria-label="Conteúdos do perfil">${PROFILE_TABS.map((tab,i)=>`<button type="button" id="tab-${tab}" role="tab" aria-controls="grid-${tab}" aria-selected="${i===0}" tabindex="${i===0?0:-1}" data-pr-tab="${tab}">${icon(['image','video','users'][i])}<span>${['Fotos','Vídeos','Menções'][i]}</span></button>`).join('')}</nav>
    ${PROFILE_TABS.map((tab,i)=>`<section id="grid-${tab}" role="tabpanel" aria-labelledby="tab-${tab}" ${i?'hidden':''}><div data-pr-grid="${tab}">${skeleton()}</div></section>`).join('')}
    <button type="button" class="pr-button pr-more" data-pr-more hidden>Carregar mais</button>
    <dialog class="pr-dialog pr-connections" data-pr-connections aria-labelledby="prConnectionsTitle"><div class="pr-dialog-header"><h2 id="prConnectionsTitle">Seguidores</h2>${closeButton('Fechar lista')}</div>
      <label class="pr-search">${icon('search')}<input type="search" data-pr-user-search placeholder="Buscar por nome ou @usuário" aria-label="Buscar pessoas"></label>
      <div class="pr-connections-list" data-pr-people></div><p class="pr-status" data-pr-list-status role="status"></p><button type="button" class="pr-button" data-pr-people-more hidden>Carregar mais pessoas</button>
    </dialog>
    ${mine?`<dialog class="pr-dialog" data-pr-edit aria-labelledby="prEditTitle"><div class="pr-dialog-header"><h2 id="prEditTitle">Editar perfil</h2>${closeButton('Fechar edição')}</div>
      <form data-pr-edit-form><div class="pr-edit-avatar" data-pr-preview>${avatar(person)}</div><label>Foto de perfil<input type="file" name="avatar" accept="image/jpeg,image/png,image/webp"><small>JPEG, PNG ou WebP. A foto é salva junto com as alterações.</small></label>
      <label>Nome de exibição<input name="displayName" required maxlength="80" autocomplete="name"></label><label>Biografia<textarea name="bio" maxlength="280" rows="3"></textarea></label>
      ${isAdmin?'<label>URL da playlist do YouTube<input name="playlistUrl" type="url" maxlength="260" placeholder="https://www.youtube.com/playlist?list=…"></label>':''}
      <p class="pr-status" data-pr-save-status role="status"></p><button class="pr-button pr-primary" type="submit">Salvar alterações</button></form></dialog>`:''}
  </section>`;
}

export async function mountProfilePage({root,client,user,profile:actor,isAdmin}) {
  let targetId = new URLSearchParams(location.search).get('usuario') || new URLSearchParams(location.search).get('user_id') || actor.id;
  if (!isProfileId(targetId)) { root.innerHTML='<section class="pr-card" role="alert">O link deste perfil é inválido.</section>';return; }
  const mine=targetId===actor.id;
  let stats,person,tab='fotos',generation=0,loading=false,hasMore=false,items=[],saving=false,pendingAvatar=null,previewUrl='',avatarGeneration=0;
  let listKind='followers',listRows=[],listOffset=0,listMore=false,listLoading=false,listGeneration=0,searchTimer;
  const pendingFollows=new Set();
  let viewer,refreshTimer;
  const bus=typeof BroadcastChannel==='function'?new BroadcastChannel('looply-profile-social'):null;
  root.innerHTML=`<section class="pr-page"><div class="pr-card pr-skeleton" style="height:220px"></div>${skeleton()}</section>`;
  try {
    stats=await profileRpc(client,'v11_profile_overview',{p_profile_id:targetId});
    if (!stats?.profile) throw Error('Profile unavailable');
    [person]=await signPeople(client,[stats.profile]);
  } catch(error) {root.innerHTML=`<section class="pr-card" role="alert"><p>Não foi possível carregar este perfil.</p><button type="button" class="pr-button" data-pr-retry>Tentar novamente</button></section>`;root.querySelector('[data-pr-retry]').onclick=()=>mountProfilePage({root,client,user,profile:actor,isAdmin});return;}
  root.innerHTML=profileShellMarkup(mine,isAdmin,person);
  const $=s=>root.querySelector(s), $$=s=>Array.from(root.querySelectorAll(s));
  const status=message=>{$('[data-pr-status]').textContent=message||'';};
  document.title=(person.display_name||person.username)+' — Looply';
  function drawCard() {
    $('[data-pr-card]').innerHTML=`<div class="pr-identity-top"><div class="pr-avatar">${avatar(person)}</div><div class="pr-stats"><div><strong>${Number(stats.posts)}</strong><span>Posts</span></div><button type="button" data-pr-list="followers"><strong>${Number(stats.followers)}</strong><span>Seguidores</span></button><button type="button" data-pr-list="following"><strong>${Number(stats.following)}</strong><span>Seguindo</span></button></div></div>
      <div class="pr-bio"><h1 data-profile-name-id="${esc(person.id)}">${esc(person.display_name||person.username)}</h1><p class="pr-handle">@${esc(person.username)}</p>${person.bio?`<p>${esc(person.bio)}</p>`:''}</div>
      <div class="pr-actions">${mine?`<button class="pr-button pr-primary" type="button" data-pr-open-edit>${icon('pencil')}Editar perfil</button>`:`<button class="pr-button ${stats.isFollowing?'':'pr-primary'}" type="button" data-pr-follow="${esc(targetId)}" aria-pressed="${Boolean(stats.isFollowing)}" ${pendingFollows.has(targetId)?'disabled':''}>${stats.isFollowing?'Seguindo':'Seguir'}</button><button class="pr-button pr-message" type="button" data-pr-message>${icon('chat')}Mensagem</button>`}
      <button class="pr-button pr-share" type="button" data-pr-share aria-label="Compartilhar perfil" title="Compartilhar perfil">${icon('share')}<span>Compartilhar</span></button></div>`;
  }
  async function refreshStats() {
    const next=await profileRpc(client,'v11_profile_overview',{p_profile_id:targetId});
    if (next?.profile) {stats=next;person={...person,...next.profile};drawCard();}
  }
  const announceFollow=detail=>{window.dispatchEvent(new CustomEvent('looply:follow-updated',{detail}));bus?.postMessage(detail);};
  async function follow(id, next, button) {
    if(id===user.id||pendingFollows.size)return;
    pendingFollows.add(id);button.disabled=true;
    const before={...stats};const row=listRows.find(p=>p.id===id),wasRow=row?.isFollowing;
    if(id===targetId){stats=optimisticFollow(stats,next);drawCard();}
    if(row)row.isFollowing=next;
    if(mine)stats={...stats,following:Math.max(0,Number(stats.following)+(next?1:-1))};
    drawCard();drawPeople();
    try {
      const result=await profileRpc(client,'v11_set_follow',{p_target_id:id,p_follow:next});
      if(result?.targetId!==id || result?.isFollowing!==next)throw Error('Follow unconfirmed');
      if(id===targetId)stats={...stats,...result};
      if(mine)stats.following=result.actorFollowing;
      if(row)row.isFollowing=result.isFollowing;
      announceFollow({...result,actorId:user.id});
      status(next?'Você está seguindo esta pessoa.':'Você deixou de seguir esta pessoa.');
    }catch(error){if(id===targetId||mine)stats=before;if(row)row.isFollowing=wasRow;status(profileError(error));}
    finally{pendingFollows.delete(id);drawCard();drawPeople();}
  }
  const tile=item=>{
    const cover=item.media?.[0],key=item.source+':'+item.id;
    const label=item.caption || (cover?.kind==='video'?'Vídeo publicado':'Foto publicada');
    const preview=cover?.signedUrl?(cover.kind==='video'?`<video src="${esc(cover.signedUrl)}#t=0.1" muted playsinline preload="metadata" aria-hidden="true"></video>`:`<img src="${esc(cover.signedUrl)}" alt="" loading="lazy" decoding="async">`):'<span class="pr-unavailable">Prévia indisponível</span>';
    return `<article class="pr-tile"><button type="button" class="pr-media-open" data-pr-media="${esc(key)}" aria-label="${esc(label)}">${preview}${cover?.kind==='video'?`<span class="pr-tile-mark">${icon('play')}</span>`:item.media?.length>1?`<span class="pr-tile-mark">${icon('grid')}</span>`:''}</button>${mine&&item.owner_id===user.id?`<details class="pr-tile-menu"><summary aria-label="Opções da publicação">⋯</summary><div>${['caption','clear_mentions','delete'].map((action,i)=>`<button type="button" data-pr-content-action="${action}" data-pr-key="${esc(key)}">${['Editar legenda','Remover menções','Excluir publicação'][i]}</button>`).join('')}</div></details>`:''}</article>`;
  };
  function drawGrid(){const grid=$(`[data-pr-grid="${tab}"]`);grid.innerHTML=items.length?`<div class="pr-grid">${items.map(tile).join('')}</div>`:'<p class="pr-empty">Nenhuma publicação nesta aba.</p>';$('[data-pr-more]').hidden=!hasMore;}
  async function loadContent(reset=true){
    if(!reset&&loading)return;
    const request=++generation,current=tab;loading=true;
    $('[data-pr-more]').disabled=true;
    if(reset){items=[];hasMore=false;$('[data-pr-more]').hidden=true;$(`[data-pr-grid="${tab}"]`).innerHTML=skeleton();}
    try{
      const rows=await profileRpc(client,'v11_profile_content',{p_profile_id:targetId,p_tab:current,p_offset:reset?0:items.length,p_limit:30});
      if(!Array.isArray(rows))throw Error('Content unavailable');
      await signContentCovers(client,rows);
      if(request!==generation)return;
      items=reset?rows:items.concat(rows);hasMore=rows.length===30;drawGrid();
    }catch(error){if(request!==generation)return;if(reset)$(`[data-pr-grid="${tab}"]`).innerHTML='<p class="pr-empty">Não foi possível carregar as publicações. <button type="button" class="pr-button" data-pr-content-retry>Tentar novamente</button></p>';else status(profileError(error));}
    finally{if(request===generation){loading=false;$('[data-pr-more]').disabled=false;}}
  }
  function drawPeople(){
    const query=$('[data-pr-user-search]').value.trim().replace(/^@/,'').toLocaleLowerCase('pt-BR');
    const visible=listRows.filter(p=>[p.display_name,p.username].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(query)));
    $('[data-pr-people]').innerHTML=visible.map(p=>`<article class="pr-person"><a href="perfil.html?usuario=${encodeURIComponent(p.id)}"><span class="pr-person-avatar">${avatar(p)}</span><span><strong>${esc(p.display_name||p.username)}</strong><small>@${esc(p.username)}</small></span></a>${p.id!==user.id?`<button type="button" class="pr-button ${p.isFollowing?'':'pr-primary'}" data-pr-follow="${esc(p.id)}" aria-pressed="${Boolean(p.isFollowing)}" ${pendingFollows.size?'disabled':''}>${p.isFollowing?'Seguindo':'Seguir'}</button>`:''}</article>`).join('')||'<p class="pr-empty">Nenhuma pessoa encontrada.</p>';
    $('[data-pr-people-more]').hidden=!listMore;
  }
  async function loadPeople(reset=true){
    if(!reset&&listLoading)return;
    const request=++listGeneration;listLoading=true;$('[data-pr-people-more]').disabled=true;
    if(reset){listOffset=0;listMore=false;$('[data-pr-list-status]').textContent='Carregando pessoas…';}
    try{
      const rows=await profileRpc(client,'v11_profile_connections',{p_profile_id:targetId,p_kind:listKind,p_offset:reset?0:listOffset,p_limit:50,p_query:$('[data-pr-user-search]').value.trim().replace(/^@/,'')});
      if(!Array.isArray(rows))throw Error('Connections unavailable');
      const signed=await signPeople(client,rows);if(request!==listGeneration)return;
      listRows=reset?signed:listRows.concat(signed);listOffset=reset?rows.length:listOffset+rows.length;listMore=rows.length===50;
      drawPeople();$('[data-pr-list-status]').textContent='';
    }catch(error){if(request===listGeneration)$('[data-pr-list-status]').textContent=profileError(error);}
    finally{if(request===listGeneration){listLoading=false;$('[data-pr-people-more]').disabled=false;}}
  }
  function selectTab(next){
    if(!PROFILE_TABS.includes(next)||tab===next)return;tab=next;
    $$('[data-pr-tab]').forEach(b=>{const active=b.dataset.prTab===tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    PROFILE_TABS.forEach(t=>$(`#grid-${t}`).hidden=t!==tab);void loadContent();
  }
  function clearPending(){++avatarGeneration;pendingAvatar=null;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';}
  function closeDialog(dialog){if(saving&&dialog===$('[data-pr-edit]'))return;dialog.close();if(dialog===$('[data-pr-edit]'))clearPending();}
  $$('dialog').forEach(dialog=>{
    dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog(dialog);});
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog);});
  });
  root.addEventListener('click',async event=>{
    const close=event.target.closest('[data-pr-close]');if(close){closeDialog(close.closest('dialog'));return;}
    const list=event.target.closest('[data-pr-list]');if(list){listKind=list.dataset.prList;listRows=[];$('[data-pr-people]').innerHTML='';$('[data-pr-user-search]').value='';$('#prConnectionsTitle').textContent=listKind==='followers'?'Seguidores':'Seguindo';$('[data-pr-connections]').showModal();void loadPeople();return;}
    const followButton=event.target.closest('[data-pr-follow]');if(followButton){const id=followButton.dataset.prFollow,following=id===targetId?stats.isFollowing:listRows.find(p=>p.id===id)?.isFollowing;void follow(id,!following,followButton);return;}
    if(event.target.closest('[data-pr-share]')){
      const link=new URL('perfil.html?usuario='+encodeURIComponent(targetId),location.href).href;
      try{await navigator.clipboard.writeText(link);status('Link do perfil copiado.');}catch{if(navigator.share)try{await navigator.share({title:person.display_name,url:link});}catch(error){if(error.name!=='AbortError')status(profileError(error));}else status('Link do perfil: '+link);}return;
    }
    const message=event.target.closest('[data-pr-message]');if(message){message.disabled=true;try{const {data,error}=await client.functions.invoke('looply-chat',{body:{action:'create_direct',targetId}});if(error||!data?.conversationId)throw error||Error('Chat unavailable');location.assign('conversa.html?id='+encodeURIComponent(data.conversationId));}catch(error){status(profileError(error));message.disabled=false;}return;}
    if(event.target.closest('[data-pr-open-edit]')){
      clearPending();const form=$('[data-pr-edit-form]');form.reset();Array.from(form.elements).forEach(el=>el.disabled=false);form.elements.displayName.value=person.display_name||person.username;form.elements.bio.value=person.bio||'';if(form.elements.playlistUrl)form.elements.playlistUrl.value=actor.playlist_url||'';
      $('[data-pr-preview]').innerHTML=avatar(person);$('[data-pr-save-status]').textContent='';$('[data-pr-edit]').showModal();return;
    }
    const tabButton=event.target.closest('[data-pr-tab]');if(tabButton){selectTab(tabButton.dataset.prTab);return;}
    if(event.target.closest('[data-pr-more]')){void loadContent(false);return;}
    if(event.target.closest('[data-pr-content-retry]')){void loadContent();return;}
    if(event.target.closest('[data-pr-people-more]')){void loadPeople(false);return;}
    const media=event.target.closest('[data-pr-media]');if(media){const item=items.find(x=>x.source+':'+x.id===media.dataset.prMedia);if(item)void viewer.open(item);return;}
    const action=event.target.closest('[data-pr-content-action]');if(action){const item=items.find(x=>x.source+':'+x.id===action.dataset.prKey);if(item)void viewer.manage(item,action.dataset.prContentAction);}
  });
  $('[role="tablist"]').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    const index=PROFILE_TABS.indexOf(tab);const next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;selectTab(PROFILE_TABS[next]);$(`[data-pr-tab="${tab}"]`).focus();
  });
  $('[data-pr-user-search]').addEventListener('input',()=>{drawPeople();clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadPeople(),180);});
  if(mine){
    const form=$('[data-pr-edit-form]');
    form.elements.avatar.addEventListener('change',async()=>{
      clearPending();const request=avatarGeneration,file=form.elements.avatar.files?.[0];if(!file){$('[data-pr-preview]').innerHTML=avatar(person);return;}
      const submit=form.querySelector('[type=submit]');submit.disabled=true;$('[data-pr-save-status]').textContent='Preparando foto…';
      try{const ready=await prepareProfileAvatar(file);if(request!==avatarGeneration)return;pendingAvatar=ready;previewUrl=URL.createObjectURL(ready);$('[data-pr-preview]').innerHTML=`<img src="${esc(previewUrl)}" alt="Prévia da nova foto">`;$('[data-pr-save-status]').textContent='Foto selecionada. Toque em Salvar alterações para publicar.';}
      catch(error){if(request!==avatarGeneration)return;form.elements.avatar.value='';$('[data-pr-preview]').innerHTML=avatar(person);$('[data-pr-save-status]').textContent=profileError(error);}
      finally{if(request===avatarGeneration)submit.disabled=false;}
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(saving)return;
      const updates={display_name:form.elements.displayName.value.trim(),bio:form.elements.bio.value.trim(),profile_visibility:'members'};
      if(!updates.display_name||updates.display_name.length>80||updates.bio.length>280)return;
      if(form.elements.playlistUrl){const raw=form.elements.playlistUrl.value.trim();const url=normalizeYouTubePlaylistUrl(raw);if(raw&&!url){$('[data-pr-save-status]').textContent='Informe uma URL válida de playlist do YouTube.';return;}updates.playlist_url=url||null;}
      saving=true;Array.from(form.elements).forEach(el=>el.disabled=true);$('[data-pr-save-status]').textContent='Salvando alterações…';
      try{
        const session=await client.auth.getSession();if(session.error||!session.data?.session)throw Object.assign(Error('Session required'),{status:401});
        const saved=await saveNeonProfile({profileId:user.id,session:session.data.session,dataApiUrl:client.dataApiUrl,storage:client.storage,updates,avatarFile:pendingAvatar});
        let avatarUrl=person.avatarUrl;
        if(pendingAvatar){const signed=await client.storage.from('looply-avatars').createSignedUrl(saved.avatarPath,1800);if(signed.error||!signed.data?.signedUrl)throw Error('Avatar URL unavailable');avatarUrl=signed.data.signedUrl;}
        person={...person,...saved.profile,avatarUrl};Object.assign(actor,person);stats.profile=person;drawCard();
        const detail={profileId:user.id,display_name:person.display_name,bio:person.bio,avatar_path:person.avatar_path,avatarUrl};
        window.dispatchEvent(new CustomEvent('looply:profile-updated',{detail}));window.dispatchEvent(new CustomEvent('looply:avatar-updated',{detail}));
        bus?.postMessage({type:'profile',...detail});saving=false;closeDialog($('[data-pr-edit]'));status('Perfil atualizado.');
      }catch(error){$('[data-pr-save-status]').textContent=profileError(error);}
      finally{saving=false;Array.from(form.elements).forEach(el=>el.disabled=false);}
    });
  }
  viewer=createProfileMediaViewer({root,client,user,onChanged:async()=>{await Promise.all([refreshStats(),loadContent()]);},status});
  drawCard();void loadContent();
  const onSocial=event=>{const detail=event.detail;if(pendingFollows.size)return;if(detail.actorId===targetId||detail.targetId===targetId)void refreshStats().catch(()=>{});};
  window.addEventListener('looply:follow-updated',onSocial);
  if(bus)bus.onmessage=event=>{if(event.data?.type==='profile'){if(event.data.profileId===person.id){person={...person,...event.data};drawCard();}}else onSocial({detail:event.data||{}});};
  refreshTimer=setInterval(()=>{if(document.hidden||pendingFollows.size)return;void refreshStats().catch(()=>{});if($('[data-pr-connections]').open&&!listLoading)void loadPeople();},15000);
  window.addEventListener('pagehide',()=>{clearPending();clearTimeout(searchTimer);clearInterval(refreshTimer);++generation;++listGeneration;window.removeEventListener('looply:follow-updated',onSocial);bus?.close();viewer.destroy();},{once:true});
  if(mine&&new URLSearchParams(location.search).get('foto')==='obrigatoria')$('[data-pr-open-edit]').click();
}
