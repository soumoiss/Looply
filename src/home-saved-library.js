import {signPeople} from "./profile-api.js";
const mk=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const validId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id||""));
const fromList=(xs,key)=>new Map(xs.map(x=>[x[key],x]));
const display=person=>person?.display_name||person?.username||"Perfil";
const initials=person=>Array.from(display(person))[0]?.toLocaleUpperCase("pt-BR")||"?";
function avatar(person){
 const node=mk("span","psaved-avatar",initials(person));
 const url=String(person?.avatarUrl||"");
 if(url.startsWith("https://")){
   const img=mk("img");img.src=url;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";
   img.onerror=()=>img.remove();node.prepend(img);
 }
 return node;
}
function icon(name){
 if(name==="bookmark")return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12v17l-6-4.2L6 21z"/></svg>';
 if(name==="close")return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>';
 if(name==="search")return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg>';
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 12h12m-5-5 5 5-5 5"/></svg>';
}
const fmt=date=>{
 try{return new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(date));}
 catch{return "";}
};
export function mountSavedLibrary({root,client,userId,onChanged}){
 let dialog=null,detail=null,rows=[],more=true,offset=0,busy=false,total=0,version=0,search="",error="";
 const pageSize=24;
 const q=s=>dialog?.querySelector(s);
 function ensure(){
  if(dialog)return dialog;
  dialog=mk("dialog","premium-saved-dialog");
  dialog.dataset.premiumSavedDialog="";
  dialog.setAttribute("aria-label","Salvos");
  dialog.innerHTML='<div class="psaved-shell"><header class="psaved-head"><div class="psaved-grab"></div><div class="psaved-head-text"><span class="psaved-kicker">MINHA COLEÇÃO</span><h2>Salvos <span data-psaved-total></span></h2></div><button class="psaved-close" type="button" data-psaved-close aria-label="Fechar"></button></header><label class="psaved-search"><span data-psaved-search-icon></span><input type="search" aria-label="Buscar salvos" placeholder="Buscar salvos" data-psaved-query></label><div class="psaved-content"><div class="psaved-grid" data-psaved-grid></div><p class="psaved-status" data-psaved-status role="status" aria-live="polite"></p><button class="psaved-more" type="button" data-psaved-more hidden>Carregar mais</button></div></div>';
  q("[data-psaved-close]").innerHTML=icon("close");
  q("[data-psaved-search-icon]").innerHTML=icon("search");
  document.body.append(dialog);
  q("[data-psaved-close]").onclick=()=>dialog.close();
  q("[data-psaved-query]").oninput=e=>{search=e.target.value.trim().toLocaleLowerCase("pt-BR");render();};
  q("[data-psaved-more]").onclick=()=>void load();
  q("[data-psaved-grid]").addEventListener("click",e=>{
   const unsave=e.target.closest("[data-psaved-remove]");
   if(unsave){e.preventDefault();e.stopPropagation();void remove(unsave.dataset.psavedRemove);return;}
   const open=e.target.closest("[data-psaved-open]");
   if(open)openDetail(open.dataset.psavedOpen);
  });
  dialog.addEventListener("close",()=>{detail?.open&&detail.close();});
  return dialog;
 }
 function card(row){
  const post=row.post,person=row.person,media=row.media;
  const item=mk("article","psaved-item");
  const open=mk("button","psaved-item-open");open.type="button";open.dataset.psavedOpen=row.id;open.setAttribute("aria-label","Ver publicação salva");
  const cover=mk("span","psaved-cover");
  if(media?.signedUrl){
   if(media.kind==="image"){
    const img=mk("img");img.src=media.signedUrl;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";cover.append(img);
   }else{
    const video=mk("video");video.src=media.signedUrl;video.muted=true;video.playsInline=true;video.preload="metadata";cover.append(video);
    cover.append(mk("span","psaved-play","▶"));
   }
  }else if(post?.external_url){
   cover.classList.add("psaved-link-cover");cover.append(mk("span","psaved-link-icon","↗"));
  }else cover.classList.add("psaved-text-cover");
  if(!post)cover.append(mk("span","psaved-missing","Indisponível"));
  const desc=mk("span","psaved-desc");
  const personLine=mk("span","psaved-person");personLine.append(avatar(person),mk("strong","",display(person)));
  desc.append(personLine,mk("span","psaved-caption",post?.body||post?.external_url||"Publicação"));
  if(!post)desc.append(mk("span","psaved-caption","Indisponível"));
  open.append(cover,desc);
  const remove=mk("button","psaved-remove");remove.type="button";remove.dataset.psavedRemove=row.id;remove.setAttribute("aria-label","Remover dos salvos");remove.innerHTML=icon("bookmark");
  item.append(open,remove);return item;
 }
 function render(){
  if(!dialog)return;
  const grid=q("[data-psaved-grid]");grid.replaceChildren();
  const filtered=rows.filter(row=>{
   const qtext=(row.post?.body||"")+" "+(row.person?.username||"")+" "+display(row.person)+" "+(row.post?.external_url||"");
   return qtext.toLocaleLowerCase("pt-BR").includes(search);
  });
  for(const row of filtered)grid.append(card(row));
  q("[data-psaved-total]").textContent=total?String(total):"";
  q("[data-psaved-more]").hidden=!more||Boolean(search);
  q("[data-psaved-more]").disabled=busy;
  q("[data-psaved-status]").textContent=error||(busy?"Carregando…":!filtered.length?"Nenhuma publicação salva.":"");
 }
 async function load(reset=false){
  if(busy)return;
  if(reset){rows=[];offset=0;more=true;error="";version++;}
  if(!more)return;
  const request=version;busy=true;render();
  try{
   const saves=await client.from("post_saves").select("post_id,created_at",{count:"exact"})
     .eq("user_id",userId).order("created_at",{ascending:false}).order("post_id",{ascending:false}).range(offset,offset+pageSize-1);
   if(saves.error)throw saves.error;
   if(request!==version)return;
   const refs=(saves.data||[]).filter(x=>validId(x.post_id));
   total=Number.isFinite(saves.count)?saves.count:offset+refs.length;
   const ids=refs.map(x=>x.post_id),posts=ids.length
    ?await client.from("posts").select("id,author_id,body,external_url,created_at").in("id",ids)
    :{data:[],error:null};
   if(posts.error)throw posts.error;
   const authors=[...new Set((posts.data||[]).map(x=>x.author_id).filter(Boolean))];
   const [peopleResult,mediaResult]=await Promise.all([
    authors.length?client.from("profiles").select("id,username,display_name,avatar_path").in("id",authors):Promise.resolve({data:[],error:null}),
    ids.length?client.from("post_media").select("post_id,storage_path,kind").in("post_id",ids):Promise.resolve({data:[],error:null})
   ]);
   if(peopleResult.error)throw peopleResult.error;
   if(mediaResult.error)throw mediaResult.error;
   const people=fromList(await signPeople(client,peopleResult.data||[]),"id");
   const firstMedia=fromList((mediaResult.data||[]).filter(x=>x.storage_path),"post_id");
   const mediaItems=ids.map(id=>firstMedia.get(id)).filter(Boolean);
   if(mediaItems.length){
    const signed=await client.storage.from("looply-media").createSignedUrls(mediaItems.map(x=>x.storage_path),900);
    if(!signed.error){
     mediaItems.forEach((item,i)=>item.signedUrl=signed.data?.[i]?.signedUrl||"");
    }
   }
   if(request!==version)return;
   const byPosts=fromList(posts.data||[],"id");
   rows.push(...refs.map(x=>{
    const post=byPosts.get(x.post_id)||null;
    return {id:x.post_id,createdAt:x.created_at,post,person:post?people.get(post.author_id):null,media:firstMedia.get(x.post_id)||null};
   }));
   offset+=refs.length;
   more=refs.length===pageSize && (saves.count==null||offset<total);
   error="";
  }catch(e){
   if(request===version){error="Não foi possível carregar os salvos.";console.error("Looply saved library",e);}
  }finally{if(request===version){busy=false;render();}}
 }
 async function remove(id){
  if(!validId(id))return;
  const target=q('[data-psaved-remove="'+id+'"]');
  if(target)target.disabled=true;
  try{
   const r=await client.rpc("v13_set_post_saved",{p_post_id:id,p_saved:false});
   if(r.error)throw r.error;
   rows=rows.filter(row=>row.id!==id);total=Math.max(0,total-1);offset=Math.max(0,offset-1);
   root.dispatchEvent(new CustomEvent("looply:saved-updated",{detail:{postId:id,saved:false}}));
   onChanged?.(id,false);
   if(detail?.open&&detail.dataset.postId===id)detail.close();
   error="";render();
  }catch(e){
   error="Não foi possível remover dos salvos.";console.error("Looply remove saved",e);
   if(target)target.disabled=false;render();
  }
 }
 function openDetail(id){
  const row=rows.find(x=>x.id===id);if(!row)return;
  const p=row.post;
  detail?.remove();
  detail=mk("dialog","premium-saved-detail");
  detail.dataset.postId=id;
  detail.innerHTML='<section class="psaved-detail-shell"><header class="psaved-detail-head"><button type="button" data-detail-back aria-label="Voltar">←</button><strong>Publicação salva</strong><button type="button" data-detail-close aria-label="Fechar">×</button></header><div data-detail-author class="psaved-detail-author"></div><div class="psaved-detail-media" data-detail-media></div><p class="psaved-detail-caption" data-detail-caption></p><footer class="psaved-detail-actions"><button type="button" data-detail-remove>Remover dos salvos</button><a data-detail-original>Abrir publicação</a></footer></section>';
  const author=detail.querySelector("[data-detail-author]");
  author.append(avatar(row.person),mk("strong","",display(row.person)),mk("small","","@"+String(row.person?.username||"")));
  const media=detail.querySelector("[data-detail-media]");
  if(row.media?.signedUrl){
   if(row.media.kind==="image"){const img=mk("img");img.src=row.media.signedUrl;img.alt="";media.append(img);}
   else {const video=mk("video");video.controls=true;video.playsInline=true;video.preload="metadata";video.src=row.media.signedUrl;media.append(video);}
  }else if(p?.external_url){
   const external=mk("a","psaved-external","Abrir original ↗");external.href=p.external_url;external.target="_blank";external.rel="noopener noreferrer";media.append(external);
  }
  detail.querySelector("[data-detail-caption]").textContent=p?.body||"";
  detail.querySelector("[data-detail-original]").href="home.html#post-"+encodeURIComponent(id);
  detail.querySelector("[data-detail-back]").onclick=()=>detail.close();
  detail.querySelector("[data-detail-close]").onclick=()=>{detail.close();dialog.close();};
  detail.querySelector("[data-detail-remove]").onclick=()=>void remove(id);
  detail.addEventListener("close",()=>{detail.remove();detail=null;},{once:true});
  document.body.append(detail);detail.showModal();
 }
 async function open(){
  ensure();if(!dialog.open)dialog.showModal();
  q("[data-psaved-query]").value="";search="";rows=[];offset=0;more=true;total=0;
  await load(true);
 }
 root.addEventListener("looply:saved-updated",event=>{
  const {postId,saved}=event.detail||{};
  if(!dialog?.open)return;
  if(!saved&&rows.some(row=>row.id===postId)){
    rows=rows.filter(row=>row.id!==postId);total=Math.max(0,total-1);offset=Math.max(0,offset-1);render();
  }
  if(saved){void load(true);}
 });
 return {open};
}
