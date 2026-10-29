import { icon } from './icons.js';
import { cachedSignedUrl } from './storage-url-cache.js';
import { esc, profileError, profileRpc, signPeople } from './profile-api.js';

// The profile uses the gallery's immersive media layout with the original
// visibility checks, likes and comments for each content source.
export function createProfileMediaViewer({root,client,user,onChanged,status}) {
  const dialog=document.createElement('dialog');dialog.className='pr-dialog pr-media-dialog';
  dialog.setAttribute('aria-label','Visualização de mídia');
  dialog.innerHTML=`<div class="pr-dialog-header"><h2>Publicação</h2><button type="button" class="pr-icon" data-mv-close aria-label="Fechar publicação">${icon('close')}</button></div>
    <div class="pr-viewer-stage" data-mv-stage></div><div class="pr-carousel"><button type="button" class="pr-icon" data-mv-prev aria-label="Mídia anterior">${icon('back')}</button><span data-mv-position></span><button type="button" class="pr-icon" data-mv-next aria-label="Próxima mídia">${icon('forward')}</button></div>
    <p class="pr-caption" data-mv-caption></p><div class="pr-viewer-actions"><button type="button" class="pr-button" data-mv-like aria-pressed="false">${icon('heart')}Curtir</button><a class="pr-button" data-mv-original>Abrir publicação original</a></div>
    <div class="pr-viewer-owner" data-mv-owner hidden><button type="button" class="pr-button" data-mv-action="caption">Editar legenda</button><button type="button" class="pr-button" data-mv-action="clear_mentions">Remover menções</button><button type="button" class="pr-button pr-danger" data-mv-action="delete">Excluir publicação</button></div>
    <p data-mv-status class="pr-status" role="status"></p><section class="pr-comments"><h3>Comentários</h3><div data-mv-comments></div><form data-mv-comment-form><label for="prCommentBody">Comentar</label><textarea id="prCommentBody" name="body" required maxlength="2000" rows="2"></textarea><button type="submit" class="pr-button pr-primary">Enviar comentário</button></form></section>`;
  root.append(dialog);
  const editor=document.createElement('dialog');editor.className='pr-dialog';editor.setAttribute('aria-label','Editar legenda');
  editor.innerHTML=`<form data-mv-edit-form><div class="pr-dialog-header"><h2>Editar legenda</h2><button type="button" class="pr-icon" data-mv-edit-close aria-label="Fechar edição">${icon('close')}</button></div><label>Legenda<textarea name="caption" maxlength="2200" rows="5"></textarea></label><p class="pr-status" data-mv-edit-status role="status"></p><button type="submit" class="pr-button pr-primary">Salvar legenda</button></form>`;root.append(editor);
  const $=s=>dialog.querySelector(s);
  let current=null,index=0,request=0,editItem=null,busy=false,liked=false,likeCount=0;
  const feedback=message=>$('[data-mv-status]').textContent=message||'';
  function stopMedia(){dialog.querySelectorAll('video,audio').forEach(media=>{media.pause();media.removeAttribute('src');media.load();});}
  function close(){++request;stopMedia();dialog.close();current=null;}
  $('[data-mv-close]').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  const result=async query=>{const response=await query;if(response.error)throw response.error;return response.data;};
  async function showMedia(){
    if(!current)return;stopMedia();const item=current,version=++request,media=item.media[index];
    $('[data-mv-stage]').innerHTML='<span class="pr-status">Carregando mídia…</span>';
    $('[data-mv-position]').textContent=`${index+1} / ${item.media.length}`;
    $('[data-mv-prev]').disabled=index===0;$('[data-mv-next]').disabled=index===item.media.length-1;
    dialog.querySelector('.pr-carousel').hidden=item.media.length<2;
    try{
      const signed=await cachedSignedUrl(client,media.bucket,media.storage_path,1800);
      if(signed.error||!signed.data?.signedUrl)throw Error('Media unavailable');
      if(version!==request||current!==item)return;
      const element=document.createElement(media.kind==='video'?'video':media.kind==='audio'?'audio':'img');
      element.src=signed.data.signedUrl;
      if(element.tagName==='IMG'){element.alt=item.caption||'Foto publicada';element.decoding='async';element.referrerPolicy='no-referrer';}
      else{element.controls=true;element.playsInline=true;element.preload='metadata';}
      element.addEventListener('error',()=>{if(version===request)$('[data-mv-stage]').textContent='Esta mídia não está disponível agora.';},{once:true});
      $('[data-mv-stage]').replaceChildren(element);
    }catch(error){if(version===request)$('[data-mv-stage]').textContent='Não foi possível abrir esta mídia. Feche e tente novamente.';}
  }
  $('[data-mv-prev]').onclick=()=>{if(index>0){index--;void showMedia();}};
  $('[data-mv-next]').onclick=()=>{if(current&&index<current.media.length-1){index++;void showMedia();}};
  const likesConfig=item=>({table:item.source==='post'?'post_likes':'community_gallery_media_likes',key:item.source==='post'?'post_id':'media_id'});
  function drawLike(){const button=$('[data-mv-like]');button.setAttribute('aria-pressed',String(liked));button.innerHTML=icon(liked?'heartFilled':'heart')+`${liked?'Curtido':'Curtir'} · ${likeCount}`;}
  async function loadLikes(item){
    const {table,key}=likesConfig(item);const response=await client.from(table).select('user_id').eq(key,item.id);
    if(current!==item)return;if(response.error){feedback('Não foi possível carregar as curtidas.');return;}
    liked=(response.data||[]).some(row=>row.user_id===user.id);likeCount=(response.data||[]).length;drawLike();$('[data-mv-like]').disabled=false;
  }
  async function loadComments(item){
    $('[data-mv-comments]').textContent='Carregando comentários…';
    try{
      const rows=await result(client.from(item.source==='post'?'comments':'community_gallery_comments').select('id,author_id,body,created_at').eq(item.source==='post'?'post_id':'media_id',item.id).order('created_at',{ascending:false}).limit(100));
      const ids=[...new Set(rows.map(row=>row.author_id))];
      const people=ids.length?await result(client.from('profiles').select('id,username,display_name,avatar_path').in('id',ids)):[];
      const signed=await signPeople(client,people),map=new Map(signed.map(p=>[p.id,p]));if(current!==item)return;
      $('[data-mv-comments]').innerHTML=rows.length?rows.map(row=>{const person=map.get(row.author_id);return `<article class="pr-comment"><a href="perfil.html?usuario=${encodeURIComponent(row.author_id)}">${esc(person?.display_name||person?.username||'Membro')}</a><p>${esc(row.body)}</p></article>`;}).join(''):'<p class="pr-empty">Seja a primeira pessoa a comentar.</p>';
    }catch(error){if(current===item)$('[data-mv-comments]').textContent='Não foi possível carregar os comentários. Feche e tente novamente.';}
  }
  $('[data-mv-like]').onclick=async event=>{
    if(!current)return;const item=current,button=event.currentTarget,{table,key}=likesConfig(item);button.disabled=true;
    try{if(liked)await result(client.from(table).delete().eq(key,item.id).eq('user_id',user.id));else await result(client.from(table).upsert({[key]:item.id,user_id:user.id},{onConflict:key+',user_id'}));await loadLikes(item);}
    catch(error){feedback(profileError(error));}finally{button.disabled=false;}
  };
  $('[data-mv-comment-form]').onsubmit=async event=>{
    event.preventDefault();if(!current)return;
    const form=event.currentTarget,item=current,body=form.elements.body.value.trim(),button=form.querySelector('[type=submit]');if(!body||button.disabled)return;button.disabled=true;
    try{
      if(item.source==='post')await result(client.from('comments').insert({post_id:item.id,author_id:user.id,body}).select('id').single());
      else{const response=await client.rpc('v8_create_gallery_comment',{p_source:'community',p_media_id:item.id,p_body:body,p_audience:'media_viewers',p_recipient_ids:[],p_mention_ids:[]});if(response.error||!response.data)throw response.error||Error('Comment unconfirmed');}
      if(current===item){form.reset();await loadComments(item);feedback('Comentário enviado.');}
    }catch(error){feedback(profileError(error));}finally{button.disabled=false;}
  };
  async function open(item){
    if(busy)return;current=item;index=0;liked=false;likeCount=0;drawLike();$('[data-mv-like]').disabled=true;feedback('');$('[data-mv-caption]').textContent=item.caption||'';
    $('[data-mv-owner]').hidden=item.owner_id!==user.id;
    $('[data-mv-original]').href=item.source==='post'?'home.html#post-'+encodeURIComponent(item.id):'galeria.html?media='+encodeURIComponent('community:'+item.id);
    if(!dialog.open)dialog.showModal();await Promise.all([showMedia(),loadComments(item),loadLikes(item)]);
  }
  const getStatus=()=>editor.querySelector('[data-mv-edit-status]');
  function closeEditor(){if(busy)return;editor.close();editItem=null;}
  editor.querySelector('[data-mv-edit-close]').onclick=closeEditor;
  editor.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
  editor.addEventListener('click',event=>{if(event.target===editor)closeEditor();});
  editor.querySelector('form').onsubmit=async event=>{
    event.preventDefault();if(!editItem||busy)return;const item=editItem,form=event.currentTarget,button=form.querySelector('[type=submit]');busy=true;button.disabled=true;
    try{
      const caption=form.elements.caption.value.trim();const response=await profileRpc(client,'v11_edit_profile_content',{p_source:item.source,p_id:item.id,p_action:'caption',p_caption:caption});if(response!==true)throw Error('Caption unconfirmed');
      item.caption=caption;if(current===item)$('[data-mv-caption]').textContent=caption;busy=false;closeEditor();await onChanged();status('Legenda atualizada.');
    }catch(error){getStatus().textContent=profileError(error);}finally{busy=false;button.disabled=false;}
  };
  async function manage(item,action){
    if(item.owner_id!==user.id||busy)return;
    if(action==='caption'){editItem=item;editor.querySelector('[name=caption]').value=item.caption||'';editor.querySelector('[name=caption]').maxLength=item.source==='community'?500:2200;getStatus().textContent='';editor.showModal();return;}
    if(!window.confirm(action==='delete'?'Excluir esta publicação?':'Remover todas as menções desta publicação?'))return;
    busy=true;feedback('Salvando…');status('Salvando…');
    try{
      if(action==='clear_mentions'){
        if(await profileRpc(client,'v11_edit_profile_content',{p_source:item.source,p_id:item.id,p_action:'clear_mentions',p_caption:null})!==true)throw Error('Tags unconfirmed');
        if(current===item){close();}status('Menções removidas.');
      }else if(action==='delete'){
        // Remove the owned objects before deleting their authorization rows.
        // Preserve the row if storage fails, allowing a safe retry.
        const byBucket=new Map();for(const media of item.media||[]){if(!byBucket.has(media.bucket))byBucket.set(media.bucket,[]);byBucket.get(media.bucket).push(media.storage_path);}
        if(item.source==='post'){
          const attachments=await result(client.from('comment_media').select('storage_path').eq('post_id',item.id));
          if(attachments.length){if(!byBucket.has('looply-media'))byBucket.set('looply-media',[]);byBucket.get('looply-media').push(...attachments.map(x=>x.storage_path));}
        }
        for(const [bucket,paths] of byBucket){const response=await client.storage.from(bucket).remove(paths);if(response.error)throw response.error;}
        if(item.source==='community'){const response=await client.rpc('v8_delete_gallery_media',{p_source:'community',p_media_id:item.id});if(response.error||response.data!==true)throw response.error||Error('Delete unconfirmed');}
        else{const deleted=await result(client.from('posts').delete().eq('id',item.id).eq('author_id',user.id).select('id'));if(!deleted?.some(row=>row.id===item.id))throw Error('Delete unconfirmed');}
        if(current===item)close();status('Publicação excluída.');
      }
      await onChanged();
    }catch(error){const message=profileError(error);status(message);feedback(message);}finally{busy=false;}
  }
  dialog.querySelectorAll('[data-mv-action]').forEach(button=>button.onclick=()=>{if(current)void manage(current,button.dataset.mvAction);});
  return {open,manage,destroy(){++request;stopMedia();dialog.remove();editor.remove();}};
}
