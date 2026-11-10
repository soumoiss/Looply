/* Coleção autenticada de publicações salvas: catálogo real do Neon. */
import {loadSavedSocialPage} from "./social.js";
const el=(tag,cls,txt)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=txt;return node;};
const secureUrl=url=>{try{const value=new URL(String(url||""),location.href);return value.protocol==="https:"?value.href:"";}catch{return ""}};
export function mountSavedCollection({root,client,userId}){
  const panel=document.createElement("dialog");panel.className="looply-saved-dialog";panel.setAttribute("aria-label","Salvos");
  panel.innerHTML='<section class="looply-saved-layout"><header class="looply-saved-head"><div><small>MINHA COLEÇÃO</small><h2>Salvos</h2></div><button type="button" data-saved-close aria-label="Fechar">×</button></header><div class="looply-saved-search"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><input type="search" data-saved-query placeholder="Buscar nos salvos" aria-label="Buscar salvos"></div><p data-saved-status role="status" aria-live="polite"></p><div class="looply-saved-grid" data-saved-grid></div><button type="button" data-saved-more hidden>Ver mais</button></section>';
  document.body.append(panel);
  let rows=[],offset=0,busy=false,more=true,token=0,errorMessage="";
  const by=selector=>panel.querySelector(selector),grid=by("[data-saved-grid]");
  const render=()=>{
    const search=by("[data-saved-query]").value.trim().toLocaleLowerCase("pt-BR");
    grid.replaceChildren();
    const visible=rows.filter(post=>(String(post.author?.display_name||"")+" "+String(post.author?.username||"")+" "+String(post.body||"")).toLocaleLowerCase("pt-BR").includes(search));
    for(const post of visible){
      const tile=el("article","looply-saved-item");
      const link=el("a","looply-saved-preview");
      link.href=(post.external_url?"reels.html":"home.html")+"#post-"+encodeURIComponent(post.id);
      link.setAttribute("aria-label","Abrir publicação de "+String(post.author?.display_name||post.author?.username||"membro"));
      const image=post.media?.find(item=>item.kind==="image"&&item.signedUrl);
      const video=post.media?.find(item=>item.kind==="video");
      if(image){
        const img=el("img");img.alt="";img.src=secureUrl(image.signedUrl);img.loading="lazy";img.referrerPolicy="no-referrer";link.append(img);
      }else if(video?.signedUrl){
        const videoPreview=el("video");videoPreview.src=secureUrl(video.signedUrl);videoPreview.muted=true;videoPreview.playsInline=true;videoPreview.preload="metadata";link.append(videoPreview);
      }else{
        link.append(el("div","looply-saved-quote",String(post.body||post.external_url||"Publicação").slice(0,190)));
      }
      if(post.external_url||video)link.append(el("span","looply-saved-kind",post.external_url?"↗":"▶"));
      tile.append(link);
      const footer=el("div","looply-saved-meta");
      const avatar=el("span","looply-saved-avatar");
      const signed=secureUrl(post.author?.avatarUrl);
      if(signed){const img=el("img");img.alt="";img.src=signed;img.referrerPolicy="no-referrer";img.loading="lazy";avatar.append(img);}
      else avatar.textContent=String(post.author?.display_name||post.author?.username||"?").slice(0,1).toUpperCase();
      const label=el("span","looply-saved-person");label.append(el("strong","",post.author?.display_name||post.author?.username||"Membro"),el("small","","@"+String(post.author?.username||"")));
      const remove=el("button","looply-saved-remove");remove.innerHTML=`<svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12v17l-6-4.2L6 21z"/></svg>`;remove.type="button";remove.dataset.savedRemove=post.id;remove.setAttribute("aria-label","Remover dos salvos");remove.title="Remover dos salvos";
      footer.append(avatar,label,remove);tile.append(footer);grid.append(tile);
    }
    by("[data-saved-more]").hidden=!more||!!search||busy;
    const status=by("[data-saved-status]");
    if(!busy && errorMessage)status.textContent=errorMessage;
    else if(!busy && !rows.length)status.textContent="Nenhum salvo";
    else if(!busy&&!visible.length)status.textContent="Nenhum resultado";
    else if(!busy)status.textContent="";
  };
  const fetchNext=async()=>{
    if(busy||!more)return;
    busy=true;errorMessage="";const generation=token;
    by("[data-saved-more]").disabled=true;
    by("[data-saved-status]").textContent="Carregando…";
    try{
      const next=await loadSavedSocialPage(client,userId,offset,24);
      if(generation!==token)return;
      const seen=new Set(rows.map(post=>post.id));
      for(const post of next.posts){if(!seen.has(post.id)){rows.push(post);seen.add(post.id);}}
      offset=next.nextOffset;more=next.hasMore;
    }catch(error){
      if(generation===token){
        more=true;
        errorMessage="Não foi possível carregar os salvos.";
        console.error("Looply saved collection failed",error);
      }
    }finally{
      if(generation===token){busy=false;by("[data-saved-more]").disabled=false;render();}
    }
  };
  const open=()=>{
    token++;rows=[];offset=0;more=true;busy=false;errorMessage="";
    by("[data-saved-query]").value="";grid.replaceChildren();
    by("[data-saved-status]").textContent="Carregando…";
    if(!panel.open)panel.showModal();
    void fetchNext();
  };
  by("[data-saved-close]").onclick=()=>panel.close();
  by("[data-saved-query]").oninput=render;
  by("[data-saved-more]").onclick=()=>void fetchNext();
  panel.addEventListener("click",e=>{if(e.target===panel)panel.close();});
  panel.addEventListener("close",()=>{token++;rows=[];busy=false;});
  panel.addEventListener("click",async event=>{
    const button=event.target.closest("[data-saved-remove]");
    if(!button||button.disabled)return;
    const id=button.dataset.savedRemove;
    button.disabled=true;
    try{
      const result=await client.rpc("v13_set_post_saved",{p_post_id:id,p_saved:false});
      if(result.error||result.data!==false)throw result.error||Error("save_not_confirmed");
      rows=rows.filter(post=>post.id!==id);
      root.dispatchEvent(new CustomEvent("looply:saved-change",{detail:{postId:id,saved:false}}));
      render();
    }catch(error){
      console.error("Looply unsave failed",error);
      errorMessage="Não foi possível remover dos salvos.";
      by("[data-saved-status]").textContent=errorMessage;
    }finally{button.disabled=false;}
  });
  return {open,refresh:()=>{if(panel.open)open();},close:()=>panel.close()};
}
