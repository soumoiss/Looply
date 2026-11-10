/* Camada real da interface premium. Sem dados fictícios ou duplicação de autenticação. */
import { signPeople } from "./profile-api.js";
import { mountSecretMessages } from "./secret-messages.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const EMOJIS = Object.freeze(["❤️","😂","😮","😢","🔥","👏"]);
const by = (node, selector) => node.querySelector(selector);
const all = (node, selector) => Array.from(node.querySelectorAll(selector));
const text = (node, value) => { if (node) node.textContent = String(value ?? ""); };
const idFrom = node => node?.closest("[data-post-card]")?.dataset.postCard || null;
function element(tag, className, content) {
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(content!==undefined)node.textContent=content;
  return node;
}
function makeButton(label, className, title) {
  const b=element("button",className,label);b.type="button";if(title)b.setAttribute("aria-label",title);return b;
}
async function call(client, name, args) {
  const result=await client.rpc(name,args);
  if(result?.error)throw result.error;
  return typeof result?.data==="string" ? JSON.parse(result.data) : result?.data;
}
function avatar(profile) {
  const face=element("span","fallback",String(profile.display_name||profile.username||"?")[0].toUpperCase());
  const url=String(profile.avatarUrl||"");
  if(/^https:\/\//i.test(url)){
    const img=document.createElement("img");img.src=url;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";img.onerror=()=>img.replaceWith(face);return img;
  }
  return face;
}
export function mountPremiumSurface({root,client,user,profile,mode="native",refresh}) {
  if (!root || root.__premiumBound) return;
  root.__premiumBound=true;
  const ownId=user.id, isHome=mode!=="external";
  const scene=element("div","premium-scene");
  scene.innerHTML=(isHome?'<div id="hello"></div><section class="premium-why-now"><div class="h2"><h2>Why Now</h2></div><div data-premium-stories></div></section><div id="extras"></div>':'<div class="h2"><h2>Reels</h2></div>')+
    '<div id="composer" class="cardx"></div><div class="ftool" id="ftool"><div class="chips"><button type="button" class="fc on" data-premium-filter="all" aria-pressed="true">Para você</button><button type="button" class="fc" data-premium-filter="following" aria-pressed="false">Seguindo</button><button type="button" class="fc" data-premium-filter="photo" aria-pressed="false">Fotos</button><button type="button" class="fc" data-premium-filter="video" aria-pressed="false">Vídeos</button><button type="button" class="fc" data-premium-filter="link" aria-pressed="false">Links</button></div><button type="button" class="ib" data-premium-search aria-label="Buscar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 5 5"/></svg></button><div class="vt"><button type="button" class="on" data-premium-list aria-label="Lista" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><button type="button" data-premium-grid aria-label="Mosaico" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button></div></div><label class="srch" id="srch"><span aria-hidden="true">⌕</span><input type="search" id="q" placeholder="Buscar publicações e pessoas" aria-label="Buscar publicações"></label><div id="feed"></div><div id="sent"></div>';
  const hero=by(root,".home-welcome");
  const storyHost=by(root,"#stories");
  const welcome=by(root,"[data-global-welcome]");
  const music=by(root,"[data-global-music]");
  const social=by(root,".social-area");
  const socialHeading=by(social||root,".social-heading");
  const composer=by(root,"[data-social-post]");
  const feed=by(root,"[data-social-feed]");
  root.append(scene);
  if(hero){
    by(scene,"#hello")?.append(hero);
    by(hero,".home-welcome-avatar")?.classList.add("av");
    const copy=by(hero,".home-welcome-copy");
    if(copy&&!by(copy,".eyebrow"))copy.prepend(element("span","eyebrow","✦"));
  }
  const globalHeader=document.querySelector("[data-site-header]");
  if(globalHeader){
    by(globalHeader,".brand-inline")?.classList.add("brand");
    by(globalHeader,".header-notifications")?.classList.add("ib");
    by(globalHeader,".page-navigation")?.classList.add("dock","glass");
  }
  if(storyHost){
    by(scene,"[data-premium-stories]")?.append(storyHost);
    all(storyHost,":scope > :not(.why-now-mount)").forEach(n=>{n.hidden=true;});
    function skinStoryPeople(){
      by(storyHost,".why-now-people")?.classList.add("stories");
      all(storyHost,".why-now-person").forEach((item,index)=>{
        item.classList.add("st1");item.style.setProperty("--i",String(index));
        by(item,".why-now-person-ring")?.classList.add("ring");
        const face=by(item,".why-now-person-face");if(face){face.classList.add("av");face.style.setProperty("--s","58px");}
      });
    }
    skinStoryPeople();
    new MutationObserver(skinStoryPeople).observe(storyHost,{childList:true,subtree:true});
  }
  if(welcome){welcome.hidden=true;by(scene,"#extras")?.append(welcome);}
  if(music)by(scene,"#extras")?.append(music);
  if(composer){
    by(scene,"#composer")?.append(composer);
    const head=by(composer,".post-composer-heading"),toggle=by(head||composer,"[data-toggle-composer]");
    if(head&&toggle){
      head.classList.add("comp1");
      head.replaceChildren();
      const face=element("span","av",String(profile?.display_name||profile?.username||"L").charAt(0).toUpperCase());
      face.style.setProperty("--s","44px");
      if(/^https:\/\//.test(profile?.avatarUrl||"")){
        const img=document.createElement("img");img.src=profile.avatarUrl;img.alt="";img.referrerPolicy="no-referrer";face.replaceChildren(img);
      }
      head.append(face,element("span","fk",isHome?"No que você está pensando?":"Compartilhar link"),toggle);
      toggle.className="ci";
      toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/></svg>';
      toggle.setAttribute("aria-label","Criar publicação");
    }
  }
  if(feed){feed.classList.add("feed");by(scene,"#feed")?.append(feed);}
  if(socialHeading){socialHeading.hidden=true;scene.append(socialHeading);}
  social?.remove();
  if(isHome && music)decorateMusic(music);

  // Exibir Recado secreto apenas quando há uma mensagem real e ainda não lida.
  // O modal e o recibo de leitura continuam pertencendo a secret-messages.js.
  if(isHome){
    void client.from("secret_messages").select("id,title,created_at")
      .eq("recipient_id",ownId).eq("is_read",false)
      .order("created_at",{ascending:true}).limit(1).maybeSingle()
      .then(({data,error})=>{
        if(error||!data||!root.isConnected)return;
        const button=makeButton("","sec1","Abrir recado secreto");
        button.innerHTML='<span class="wx" aria-hidden="true">✉</span><span><b>Recado secreto</b><small></small></span>';
        text(by(button,"small"),data.title||"");
        button.onclick=()=>{
          const existing=document.querySelector("[data-secret-vip-modal]");
          if(existing){
            existing.querySelector("button")?.focus();
          }else{void mountSecretMessages(client,ownId);}
        };
        by(scene,"#extras")?.append(button);
      }).catch(()=>{});
  }
  const toolbar=by(scene,"#ftool"),search=by(scene,"#q");
  const gridButton=by(toolbar,"[data-premium-grid]");
  const listButton=by(toolbar,"[data-premium-list]");
  const searchPanel=by(scene,"#srch");
  by(toolbar,"[data-premium-search]").onclick=()=>{
    searchPanel.classList.toggle("on");
    if(searchPanel.classList.contains("on"))search.focus();
    else{search.value="";applyFilters();}
  };
  let following=new Set(), saved=new Set(), filter="all", grid=false;
  let pendingLikes=new Set(), pendingSaves=new Set(), dialog=null, picker=null;
  let likePage=0,likeBusy=false,likeDone=false,likeGeneration=0,selectedPost="",likerTab="all",likerSearch="";
  let wasFollowingChanged=false, previousIds=new Set();
  const suppressed=new Map();
  const toast=element("div","premium-toast");
  toast.setAttribute("role","status");toast.setAttribute("aria-live","polite");root.append(toast);
  let toastTimeout;
  const notify=(message,error=false)=>{
    toast.textContent=message;toast.dataset.error=String(error);toast.classList.add("on");
    clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.classList.remove("on"),2800);
  };
  async function loadFollowing() {
    try {
      const r=await client.from("follows").select("following_id").eq("follower_id",ownId);
      if(r.error)throw r.error;
      following=new Set((r.data||[]).map(f=>f.following_id));applyFilters();
    }catch(e){notify("Não foi possível carregar quem você segue.",true);}
  }
  async function loadSaves() {
    const cards=all(root,"[data-post-card]"), ids=cards.map(c=>c.dataset.postCard);
    if(!ids.length)return;
    try{
      const r=await client.from("post_saves").select("post_id").eq("user_id",ownId).in("post_id",ids);
      if(r.error)throw r.error;
      saved=new Set((r.data||[]).map(item=>item.post_id));
      for(const card of cards)by(card,"[data-premium-save]")?.setAttribute("aria-pressed",String(saved.has(card.dataset.postCard)));
    }catch(e){/* Após aplicar a migração, o botão passa a refletir o banco. */}
  }
  function decorateMusic(link){
    if(!link || link.hidden || link.tagName!=="A" || link.classList.contains("premium-music"))return;
    const title=by(link,".looply-music-of-day-copy strong")?.textContent?.trim()||"Música do dia";
    link.className="cardx premium-music";
    link.innerHTML='<span class="cv" aria-hidden="true">♫</span><span class="tx"><small>Música do dia</small><strong></strong></span><span class="pl" aria-hidden="true">▶</span>';
    text(by(link,".tx strong"),title);
    link.setAttribute("aria-label","Ouvir música do dia: "+title);
  }
  function authorId(card){return by(card,"[data-profile-open]")?.dataset.profileOpen||"";}
  function applyFilters(){
    for(const card of all(root,"[data-post-card]")){
      const category=by(card,".post-external")?"link":by(card,"video[data-feed-video]")?"video":by(card,".post-media img")?"photo":"text";
      const matching=filter==="all"||(filter==="following"?(authorId(card)===ownId||following.has(authorId(card))):filter===category);
      const visible=matching&&(card.textContent||"").toLocaleLowerCase("pt-BR").includes(search.value.trim().toLocaleLowerCase("pt-BR"));
      card.hidden=!visible;
    }
    const visible=all(root,"[data-post-card]").some(card=>!card.hidden);
    let empty=by(scene,"[data-premium-empty]");
    if(!visible && all(root,"[data-post-card]").length){
      if(!empty){empty=element("p","empty","Nenhuma publicação encontrada.");empty.dataset.premiumEmpty="";by(scene,"#feed").append(empty);}
    }else empty?.remove();
  }
  const ICONS={
    more:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
    bookmark:'<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12v17l-6-4.2L6 21z"/></svg>',
    send:'<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="m21 3-8.6 18-3.6-7.8L1 9.6 21 3Z"/><path d="m9 13 12-10"/></svg>',
    play:'<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    heart:'<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20.8 8.7c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z"/></svg>'
  };
  function openPostMenu(card){
    const menu=document.createElement("dialog");menu.className="premium-sheet premium-actions-sheet";
    menu.setAttribute("aria-label","Ações da publicação");
    menu.innerHTML='<div class="premium-sheet-content"><div class="grab"></div><h2>Publicação</h2></div>';
    const content=by(menu,".premium-sheet-content");
    const actions=[
      ["Ver perfil",".post-author-profile"],
      ["Compartilhar","[data-share-post]"],
      ["Enviar no Looply","[data-share-in-app]"],
      ["Responder em particular","[data-private-reply]"],
      ["Editar legenda","[data-edit-post]"],
      ["Excluir publicação","[data-delete-post]"]
    ];
    for(const [label,selector] of actions){
      const target=by(card,selector);if(!target)continue;
      const btn=makeButton(label,"act"+(label==="Excluir publicação"?" dg":""));
      btn.onclick=()=>{menu.close();menu.remove();target.click();};
      content.append(btn);
    }
    const close=makeButton("Cancelar","act");
    close.onclick=()=>menu.close();content.append(close);
    menu.addEventListener("close",()=>menu.remove(),{once:true});
    root.append(menu);menu.showModal();
  }
  function decorateCard(card){
    if(card.dataset.premiumReady)return;
    card.dataset.premiumReady="true";
    card.classList.add("post");
    const head=by(card,".post-header"),media=by(card,".post-media-grid"),
      external=by(card,".post-external"),actions=by(card,".post-interactions"),
      caption=by(card,".post-body");
    if(!head||!actions)return;
    head.classList.add("ph");media?.classList.add("med");actions.classList.add("pa");
    const author=by(head,".post-author-profile");
    const authorWrap=author?.parentElement;
    if(author){
      head.insertBefore(author,head.firstChild);
      if(authorWrap?.classList.contains("post-author"))authorWrap.remove();
      const av=by(author,".post-avatar");av?.classList.add("av");if(av)av.style.setProperty("--s","44px");
      const tx=by(author,"div");tx?.classList.add("tx");
    }
    const more=makeButton("","ib","Mais opções da publicação");
    more.innerHTML=ICONS.more;
    more.dataset.premiumMenu=card.dataset.postCard;
    head.append(more);
    const postId=card.dataset.postCard;
    const date=by(author||head,"time")?.textContent||"";
    if(caption){
      caption.classList.add("pt");
      if(!media&&!external){
        const quote=element("div","qt");
        quote.append(caption);head.after(quote);
      }
    }
    if(external){
      const source=by(external,".hybrid-provider-tools a");
      const provider=by(external,".hybrid-provider-label")?.textContent?.trim()||"Link externo";
      if(source){
        const strip=element("div","lnk");
        const logo=element("a","li");logo.href=source.href;logo.target="_blank";logo.rel="noopener noreferrer";logo.setAttribute("aria-label","Abrir original");logo.innerHTML=ICONS.play;
        const body=element("a","tx");body.href=source.href;body.target="_blank";body.rel="noopener noreferrer";
        body.append(element("b","",provider),element("small","",source.hostname||source.href));
        strip.append(logo,body);
        const origin=by(external,"[data-open-external-reel]");
        if(origin){
          const open=makeButton("","ib","Assistir Reel em tela cheia");
          open.innerHTML=ICONS.play;
          open.dataset.openExternalReel=origin.dataset.openExternalReel;
          strip.append(open);
        }
        external.before(strip);
      }
    }
    const summary=makeButton("","lb premium-like-summary","Ver quem curtiu");
    summary.dataset.premiumLikers=postId;
    const count=by(card,"[data-toggle-like] span")?.textContent||"0";
    summary.innerHTML='<span class="stk" data-premium-like-avatars></span><span><b data-premium-like-total>'+esc(count)+'</b> curtidas · Ver quem curtiu</span>';
    actions.after(summary);
    const save=makeButton("","post-icon-button premium-save sv","Salvar publicação");
    save.dataset.premiumSave=postId;save.setAttribute("aria-pressed",String(saved.has(postId)));save.innerHTML=ICONS.bookmark;
    actions.append(save);
    const shared=by(card,"[data-share-in-app]");
    if(shared){shared.innerHTML=ICONS.send;shared.title="Enviar no Looply";shared.setAttribute("aria-label","Enviar publicação no chat do Looply");}
    const out=by(card,"[data-share-post]");
    if(out){out.innerHTML=ICONS.send;out.title="Compartilhar publicação";out.setAttribute("aria-label","Compartilhar publicação");}
    const reply=by(card,"[data-private-reply]");if(reply)reply.title="Responder em particular";
    const liker=by(card,"[data-toggle-like]");
    if(liker){liker.classList.add("lk");liker.setAttribute("aria-label","Curtir ou reagir; mantenha pressionado para escolher uma reação");}
    const dateStamp=element("div","ts",date);summary.after(dateStamp);
    if(caption&&(media||external)){
      const block=element("div","cap");
      const authorName=by(author||head,"strong")?.textContent?.trim()||"";
      block.append(element("b","",authorName),caption);
      summary.after(block); // original model: caption immediately after likes
    }
    if(card.querySelector("[data-open-reel],[data-open-external-reel]"))card.dataset.hasReel="true";
  }
  root.addEventListener("click",event=>{
    const menu=event.target.closest("[data-premium-menu]");
    if(menu){event.preventDefault();const card=menu.closest("[data-post-card]");if(card)openPostMenu(card);}
  });
  function decorateAll(){
    all(root,"[data-post-card]").forEach(decorateCard);
    applyFilters();
    if(isHome)updateReelsStrip();
  }
  function updateLikeDisplay(postId,like,emoji,count){
    const card=all(root,"[data-post-card]").find(node=>node.dataset.postCard===postId);
    if(!card)return;
    const button=by(card,"[data-toggle-like]"),counter=by(button||card,":scope > span:not([data-premium-emoji])");
    if(button){
      button.setAttribute("aria-pressed",String(like));
      button.classList.toggle("is-liked",like);
      button.dataset.premiumEmoji=like?emoji||"❤️":"";
      const svg=by(button,"svg");
      if(svg){svg.style.display=emoji&&emoji!=="❤️"?"none":"";}
      let reaction=by(button,"[data-premium-emoji]");
      if(emoji && emoji!=="❤️"){
        if(!reaction){reaction=element("span","premium-emoji");reaction.dataset.premiumEmoji="";button.prepend(reaction);}
        reaction.textContent=emoji;
      }else reaction?.remove();
      text(counter,count);
    }
    const summary=by(card,"[data-premium-like-total]");
    if(summary)summary.textContent=String(count);
  }
  async function react(postId,chosen) {
    if(pendingLikes.has(postId))return;
    const card=all(root,"[data-post-card]").find(node=>node.dataset.postCard===postId);
    const button=card&&by(card,"[data-toggle-like]");if(!button)return;
    const count=Number(by(button,":scope > span:not([data-premium-emoji])")?.textContent)||0;
    const wasLiked=button.getAttribute("aria-pressed")==="true";
    const prev=wasLiked?(button.dataset.premiumEmoji||"❤️"):null;
    const emoji=chosen===prev?null:chosen;
    pendingLikes.add(postId);
    updateLikeDisplay(postId,!!emoji,emoji,Math.max(0,count+(!!emoji&&!wasLiked?1:!emoji&&wasLiked?-1:0)));
    try{
      const state=await call(client,"v13_set_post_reaction",{p_post_id:postId,p_emoji:emoji});
      updateLikeDisplay(postId,!!state.emoji,state.emoji,Number(state.count)||0);
    }catch(error){
      updateLikeDisplay(postId,wasLiked,prev,count);
      notify("Não foi possível salvar a reação. Tente de novo.",true);
    }finally{pendingLikes.delete(postId);}
  }
  async function savePost(postId){
    if(pendingSaves.has(postId))return;
    pendingSaves.add(postId);
    const before=saved.has(postId),next=!before;
    if(next)saved.add(postId);else saved.delete(postId);
    const buttons=all(root,'[data-premium-save="'+postId+'"]');
    buttons.forEach(b=>b.setAttribute("aria-pressed",String(next)));
    try{
      await call(client,"v13_set_post_saved",{p_post_id:postId,p_saved:next});
      notify(next?"Publicação salva.":"Publicação removida dos salvos.");
    }catch(error){
      if(before)saved.add(postId);else saved.delete(postId);
      buttons.forEach(b=>b.setAttribute("aria-pressed",String(before)));
      notify("Não foi possível atualizar os salvos.",true);
    }finally{pendingSaves.delete(postId);}
  }
  function closePicker(){picker?.remove();picker=null;}
  function showPicker(button,postId){
    closePicker();picker=element("div","premium-reaction-picker");picker.setAttribute("role","group");picker.setAttribute("aria-label","Escolher reação");
    for(const emoji of EMOJIS){const b=makeButton(emoji,"",emoji);b.onclick=()=>{closePicker();void react(postId,emoji);};picker.append(b);}
    document.body.append(picker);
    const rect=button.getBoundingClientRect();
    picker.style.left=Math.max(4,Math.min(window.innerWidth-picker.offsetWidth-4,rect.left-40))+"px";
    picker.style.top=Math.max(6,rect.top-picker.offsetHeight-12)+"px";
  }
  let holdTimer,holdId="";
  root.addEventListener("pointerdown",event=>{
    const button=event.target.closest("[data-toggle-like]");if(!button)return;
    holdId=button.dataset.toggleLike;
    clearTimeout(holdTimer);
    holdTimer=setTimeout(()=>{suppressed.set(holdId,Date.now()+800);showPicker(button,holdId);},510);
  },true);
  for(const type of ["pointerup","pointercancel","pointerleave"])root.addEventListener(type,()=>clearTimeout(holdTimer),true);
  root.addEventListener("click",event=>{
    const like=event.target.closest("[data-toggle-like]");
    if(like){
      event.preventDefault();event.stopImmediatePropagation();
      const id=like.dataset.toggleLike;
      if((suppressed.get(id)||0)>Date.now())return;
      closePicker();const emoji=like.getAttribute("aria-pressed")==="true"?null:"❤️";
      void react(id,like.dataset.premiumEmoji||"❤️");
      return;
    }
    const liker=event.target.closest("[data-premium-likers]");
    if(liker){event.preventDefault();openLikes(liker.dataset.premiumLikers);return;}
    const save=event.target.closest("[data-premium-save]");
    if(save){event.preventDefault();void savePost(save.dataset.premiumSave);return;}
  },true);
  document.addEventListener("pointerdown",event=>{if(picker && !picker.contains(event.target) && !event.target.closest("[data-toggle-like]"))closePicker();},{passive:true});
  function sheet(){
    if(dialog)return dialog;
    dialog=document.createElement("dialog");dialog.className="premium-sheet";
    dialog.setAttribute("aria-label","Quem curtiu");
    dialog.innerHTML='<div class="premium-sheet-content"><div class="grab"></div><header class="premium-sheet-head"><h2>Quem curtiu <span data-like-total></span></h2><button type="button" data-close-likes aria-label="Fechar">×</button></header><div class="rxbar" data-like-summary></div><div class="tgs"><button type="button" data-like-tab="all" class="on">Todos</button><button type="button" data-like-tab="following">Seguindo</button></div><input class="fi" type="search" data-like-search placeholder="Buscar por nome" aria-label="Buscar quem curtiu"><div data-like-list></div><p data-like-status role="status"></p></div>';
    root.append(dialog);
    by(dialog,"[data-close-likes]").onclick=()=>dialog.close();
    dialog.addEventListener("close",()=>{if(wasFollowingChanged){wasFollowingChanged=false;void loadFollowing();if(typeof refresh==="function")void refresh();}});
    by(dialog,"[data-like-search]").oninput=event=>{likerSearch=event.target.value.trim();resetLikes();};
    all(dialog,"[data-like-tab]").forEach(button=>button.onclick=()=>{
      likerTab=button.dataset.likeTab;
      all(dialog,"[data-like-tab]").forEach(x=>x.classList.toggle("on",x===button));resetLikes();
    });
    by(dialog,".premium-sheet-content").addEventListener("scroll",event=>{
      const n=event.currentTarget;
      if(n.scrollHeight-n.scrollTop-n.clientHeight<180)void loadMoreLikes();
    },{passive:true});
    dialog.addEventListener("click",async event=>{
      const follow=event.target.closest("[data-premium-follow]");if(!follow||follow.disabled)return;
      const target=follow.dataset.premiumFollow,next=follow.dataset.following!=="true";
      follow.disabled=true;follow.dataset.following=String(next);follow.textContent=next?"Seguindo":"Seguir";
      try{
        await call(client,"v11_set_follow",{p_target_id:target,p_follow:next});
        wasFollowingChanged=true;
      }catch(error){
        follow.dataset.following=String(!next);follow.textContent=next?"Seguir":"Seguindo";
        notify("Não foi possível atualizar o seguimento.",true);
      }finally{follow.disabled=false;}
    });
    return dialog;
  }
  function openLikes(postId) {
    if(!postId)return;selectedPost=postId;likerTab="all";likerSearch="";sheet();
    by(dialog,"[data-like-search]").value="";
    all(dialog,"[data-like-tab]").forEach(b=>b.classList.toggle("on",b.dataset.likeTab==="all"));
    if(!dialog.open)dialog.showModal();
    resetLikes();
  }
  function resetLikes(){
    likeGeneration++;likePage=0;likeDone=false;likeBusy=false;
    by(dialog,"[data-like-list]").replaceChildren();by(dialog,"[data-like-summary]").replaceChildren();
    text(by(dialog,"[data-like-total]"),"");
    void loadMoreLikes();
  }
  async function loadMoreLikes(){
    if(!dialog?.open||likeDone||likeBusy||!selectedPost)return;
    const generation=likeGeneration,postId=selectedPost;likeBusy=true;
    text(by(dialog,"[data-like-status]"),"Carregando…");
    try{
      const payload=await call(client,"v13_post_engagement_page",{
        p_post_id:postId,p_offset:likePage,p_limit:25,p_search:likerSearch,
        p_following_only:likerTab==="following"
      });
      if(generation!==likeGeneration)return;
      const items=Array.isArray(payload?.items)?payload.items:[];
      const profiles=await signPeople(client,items);
      if(generation!==likeGeneration)return;
      text(by(dialog,"[data-like-total]"),"("+Number(payload.total||0)+")");
      const summary=by(dialog,"[data-like-summary]");summary.replaceChildren();
      for(const [emoji,count] of Object.entries(payload.summary||{})){
        const chip=element("span","rxc",emoji+" "+count);summary.append(chip);
      }
      const list=by(dialog,"[data-like-list]");
      for(const person of profiles){
        const row=element("div","premium-like-row");
        row.append(avatar(person));
        const middle=element("span","tx");
        const link=element("a","",person.display_name||person.username||"Membro");
        link.href="perfil.html?usuario="+encodeURIComponent(person.id);
        const at=element("small","", "@"+String(person.username||"")+" · "+relative(person.created_at)+" · "+(person.emoji||"❤️"));
        middle.append(link,at);row.append(middle);
        if(person.id!==ownId){
          const follow=makeButton(person.isFollowing?"Seguindo":"Seguir","fbtn"+(person.isFollowing?" on":""));
          follow.dataset.premiumFollow=person.id;follow.dataset.following=String(!!person.isFollowing);row.append(follow);
        }
        list.append(row);
      }
      likePage+=items.length;
      likeDone=likePage>=Number(payload.total||0)||items.length<25;
      text(by(dialog,"[data-like-status]"),!likePage?"Nenhuma curtida.":likeDone?"":"Role para carregar mais");
    }catch(error){
      if(generation===likeGeneration){
        const status=by(dialog,"[data-like-status]");status.replaceChildren();
        status.append(document.createTextNode("Não foi possível carregar as curtidas. "));
        const retry=makeButton("Tentar de novo","btn");retry.onclick=()=>void loadMoreLikes();status.append(retry);
      }
    }finally{if(generation===likeGeneration)likeBusy=false;}
  }
  function relative(value){
    const t=new Date(value).getTime();if(!Number.isFinite(t))return "";
    const min=Math.max(0,Math.floor((Date.now()-t)/60000));
    return min<1?"agora":min<60?min+" min":min<1440?Math.floor(min/60)+" h":Math.floor(min/1440)+" d";
  }
  let reelSignature="";
  function updateReelsStrip(){
    if(!isHome)return;
    const signature=all(root,'[data-post-card][data-has-reel="true"]').map(card=>card.dataset.postCard).join('|');
    if(signature===reelSignature)return;
    reelSignature=signature;
    let section=by(scene,"[data-premium-reels]");
    if(!section){
      section=element("section","reels-section");section.dataset.premiumReels="";
      const heading=element("div","h2");const title=element("h2","", "Reels");
      heading.append(title);section.append(heading,element("div","premium-reel-strip"));
      by(scene,"#feed").after(section);
    }
    const strip=by(section,".premium-reel-strip");strip.replaceChildren();
    for(const card of all(root,'[data-post-card][data-has-reel="true"]').slice(0,15)){
      const open=by(card,"[data-open-reel],[data-open-external-reel]");
      const media=by(card,"video,img");
      if(!open || !media)continue;
      const tile=makeButton("","premium-reel-tile","Assistir reel");
      tile.dataset.premiumOpenReel=open.getAttribute("data-open-reel")||open.getAttribute("data-open-external-reel");
      const preview=media.cloneNode(false);preview.removeAttribute("id");preview.removeAttribute("autoplay");preview.removeAttribute("controls");preview.removeAttribute("data-feed-reel-id");preview.removeAttribute("data-feed-video");preview.removeAttribute("data-open-reel");preview.removeAttribute("src");
      if(media.tagName==="IMG")preview.src=media.currentSrc||media.src;
      else{preview.poster=media.poster||"";preview.preload="none";}
      tile.append(preview);
      const name=by(card,".post-author strong")?.textContent||"Reel";
      tile.append(element("span","",name));strip.append(tile);
    }
    section.hidden=!strip.children.length;
  }
  toolbar.addEventListener("click",event=>{
    const button=event.target.closest("[data-premium-filter]");
    if(button){filter=button.dataset.premiumFilter;all(toolbar,"[data-premium-filter]").forEach(b=>{const active=b===button;b.classList.toggle("on",active);b.setAttribute("aria-pressed",String(active));});applyFilters();}
  });
  search.addEventListener("input",applyFilters);
  function setGrid(next){
    grid=next;
    by(root,"[data-social-feed]")?.classList.toggle("mos",grid);
    gridButton.classList.toggle("on",grid);
    listButton.classList.toggle("on",!grid);
    gridButton.setAttribute("aria-pressed",String(grid));
    listButton.setAttribute("aria-pressed",String(!grid));
  }
  gridButton.onclick=()=>setGrid(true);
  listButton.onclick=()=>setGrid(false);
  const topButton=makeButton("↑","premium-top","Voltar ao topo");topButton.hidden=true;root.append(topButton);
  topButton.onclick=()=>window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
  window.addEventListener("scroll",()=>{topButton.hidden=window.scrollY<480;},{passive:true});
  const pill=makeButton("↑ Novas publicações","newpill","Ver novas publicações");root.append(pill);
  pill.onclick=()=>{pill.classList.remove("on");window.scrollTo({top:0,behavior:"smooth"});};
  function decorateViewer(dialogNode){
    if(!dialogNode||dialogNode.dataset.premiumViewer)return;
    dialogNode.dataset.premiumViewer="true";
    const track=by(dialogNode,"[data-reels-track]"),slides=all(dialogNode,"[data-reels-key]");
    const counter=element("span","rvcount");dialogNode.append(counter);
    const rail=by(dialogNode,"[data-reels-rail]");
    const save=makeButton("","looply-reel-action premium-viewer-save","Salvar Reel");save.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12v17l-6-4.2L6 21z"/></svg><small>Salvar</small>';save.dataset.premiumViewerSave="";
    const likers=makeButton("Curtidas","looply-reel-action premium-viewer-likes","Ver quem curtiu o reel");likers.dataset.premiumViewerLikes="";
    rail?.append(likers,save);
    const current=()=>{
      const index=Math.max(0,Math.min(slides.length-1,Math.round(track.scrollTop/Math.max(1,track.clientHeight))));
      const entry=slides[index];
      const key=entry?.dataset.reelsKey;
      const origin=all(root,"[data-post-card]").find(c=>all(c,"[data-open-reel],[data-open-external-reel]").some(el=>el.dataset.openReel===key||el.dataset.openExternalReel===key));
      return {index,entry,postId:origin?.dataset.postCard};
    };
    const sync=()=>{const now=current();text(counter,(now.index+1)+" / "+slides.length);save.setAttribute("aria-pressed",String(saved.has(now.postId)));};
    track?.addEventListener("scroll",sync,{passive:true});sync();
    likers.onclick=()=>{const now=current();if(now.postId)openLikes(now.postId);};
    save.onclick=()=>{const now=current();if(now.postId)void savePost(now.postId);};
    let last=0;
    for(const slide of slides){
      slide.addEventListener("pointerup",event=>{
        if(event.target.closest("button,a,input,textarea"))return;
        const now=Date.now();
        if(now-last<310){last=0;const id=current().postId;if(id)void react(id,"❤️");}
        else last=now;
      },{passive:true});
      const video=by(slide,"video");
      if(video){
        video.addEventListener("timeupdate",()=>{
          let bar=by(slide,".premium-video-progress");
          if(!bar){bar=element("span","premium-video-progress");bar.style.cssText="position:absolute;left:0;bottom:0;height:4px;background:#fff;z-index:8;width:0";slide.append(bar);}
          bar.style.width=video.duration?Math.min(100,(video.currentTime/video.duration)*100)+"%":"0";
        });
      }
    }
    const keys=event=>{
      if(!dialogNode.open||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)||event.target?.isContentEditable)return;
      const key=event.key.toLowerCase();
      if(["arrowdown","arrowup","j","k"].includes(key)){
        event.preventDefault();track?.scrollBy({top:(["j","arrowdown"].includes(key)?1:-1)*track.clientHeight,behavior:"smooth"});
      }else if(key===" "){event.preventDefault();const video=by(current().entry||dialogNode,"video");if(video){video.paused?void video.play().catch(()=>{}):video.pause();}}
      else if(key==="l"){event.preventDefault();by(dialogNode,'[data-reel-action="like"]')?.click();}
      else if(key==="m"){event.preventDefault();by(dialogNode,"[data-reels-sound]")?.click();}
      else if(key==="escape"){event.preventDefault();dialogNode.dispatchEvent(new Event("cancel",{cancelable:true}));}
    };
    document.addEventListener("keydown",keys,true);
    dialogNode.addEventListener("close",()=>document.removeEventListener("keydown",keys,true),{once:true});
  }
  root.addEventListener("click",event=>{
    const tile=event.target.closest("[data-premium-open-reel]");
    if(!tile)return;
    const open=all(root,"[data-open-reel],[data-open-external-reel]").find(el=>el.dataset.openReel===tile.dataset.premiumOpenReel||el.dataset.openExternalReel===tile.dataset.premiumOpenReel);
    open?.click();
  });
  const feedTarget=by(root,"[data-social-feed]");
  previousIds=new Set(all(feedTarget,"[data-post-card]").map(c=>c.dataset.postCard));
  const observer=new MutationObserver(()=>{
    if(!root.isConnected)return;
    decorateAll();
    const ids=new Set(all(feedTarget,"[data-post-card]").map(c=>c.dataset.postCard));
    if([...ids].some(id=>!previousIds.has(id))){void loadSaves();if(window.scrollY>400)pill.classList.add("on");}
    previousIds=ids;
    all(root,"dialog[data-reels-scroll]").forEach(decorateViewer);
    if(isHome)decorateMusic(by(scene,"[data-global-music]"));
  });
  observer.observe(root,{childList:true,subtree:true});
  decorateAll();void loadFollowing();void loadSaves();
  root.addEventListener("looply:reels-closed",()=>{dialog?.open&&dialog.close();});
  window.addEventListener("pagehide",()=>{observer.disconnect();clearTimeout(holdTimer);clearTimeout(toastTimeout);closePicker();},{once:true});
  return {refresh:()=>{decorateAll();return loadSaves();},openLikes};
}
