/* Why Now ↔ Looply: adapter for the Stories-only embedded experience.
   The original prototype remains available independently without this bridge. */
(function () {
  "use strict";
  if (new URLSearchParams(location.search).get("embedded") !== "1" || window.parent === window) return;
  const origin = location.origin;
  const send = (type, data) => window.parent.postMessage(Object.assign({ channel: "looply-why-now-v1", type }, data || {}), origin);
  const pending = new Map();
  let serial = 0, groups = [], me = null, catalogTrack = null, publishing = false, musicPickerCleanup = null;
  let viewerCatalogAudio = null;
  let editorMentions=new Set(), editorDuration=15, publishVisibility="public", publishAudience=new Set();
  const hasEditorMusic=()=>Boolean(wnMusic?.blob||catalogTrack?.kind==="catalog");
  const previewDurationAvailable=()=>{
    if(!wnMusic?.blob)return 30;
    return Math.max(1,(Number(wnMusic.duration)||15)-(Number(wnMusic.start)||0));
  };
  function resetPublishEditor(){
    editorMentions.clear();editorDuration=15;publishVisibility="public";publishAudience.clear();
    renderEditorExtras();
  }
  const previewUrls = new Map();
  let catalogRequestVersion = 0;
  let lastSoundBlocked = false;
  function previewKey(song) { return String(song?.id || song?.url || ""); }
  async function catalogPreview(song) {
    if (!song || song.provider !== "apple") return "";
    const key=previewKey(song);
    if (!key) return "";
    if(previewUrls.has(key))return previewUrls.get(key);
    const { resolveAppleStoryPreview }=await import("./story-music-catalog.js?build=e96bd539b17ff957");
    const url=await resolveAppleStoryPreview(song).catch(()=> "");
    previewUrls.set(key,url);
    return url;
  }
  function preparePreviews() {
    const unique=new Map();
    for(const group of groups)for(const item of storiesOf(group)) {
      if(item.music?.provider==="apple"&&unique.size<30)unique.set(previewKey(item.music),item.music);
    }
    for(const song of unique.values())void catalogPreview(song);
  }
  function stopCatalogAudio() { if (viewerCatalogAudio) { viewerCatalogAudio.pause(); viewerCatalogAudio.removeAttribute("src"); viewerCatalogAudio = null; } }
  function request(type, data) {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send(type, Object.assign({ requestId: id }, data || {}));
    });
  }
  function messageError(err) {
    console.error("[Why Now bridge]", err);
    showToast("A operação não foi concluída. Tente novamente.");
  }
  function storiesOf(g) { return Array.isArray(g && g.stories) ? g.stories : []; }
  function ownGroup() { return groups.find(g => g.authorId === me?.id); }
  function storyForId(id) { return groups.flatMap(storiesOf).find(s => s.id === id); }
  function contentRecord(story, group) {
    return {
      id: story.id, remoteUrl: story.url, type: story.type, created: story.created,
      name: group.name, owner: group.authorId === me?.id, initial: (group.name || "?").charAt(0).toUpperCase(),
      avatarUrl: group.avatarUrl || "", caption: story.caption || "", reason: story.reason || "",
      seen: Boolean(story.seen), catalogMusic: story.music || null, duration: story.duration || 15, items: [], strokes: [], filter: "none"
    };
  }
  function avatarNode(g) {
    const el = document.createElement("span");
    el.className = "avatar";
    if (g.avatarUrl && /^https:\/\//i.test(g.avatarUrl)) {
      const im = document.createElement("img");
      im.className = "ava-img"; im.alt = ""; im.referrerPolicy = "no-referrer"; im.src = g.avatarUrl;
      im.onerror = () => { im.remove(); el.textContent = (g.name || "?").charAt(0).toUpperCase(); };
      el.append(im);
    } else {
      el.classList.add("ava-me");
      el.textContent = (g.name || "?").charAt(0).toUpperCase();
    }
    return el;
  }
  renderHome = function () {
    const row = document.querySelector("#moment-row");
    document.querySelector("#home .home-sub").textContent = "Why Now";
    row.replaceChildren();
    const all = [];
    const mine = ownGroup();
    all.push(mine || { authorId: me?.id, name: me?.name || "Você", avatarUrl: me?.avatarUrl || "", stories: [] });
    for (const group of groups) if (group.authorId !== me?.id) all.push(group);
    for (const group of all) {
      const own = group.authorId === me?.id, stories = storiesOf(group);
      const item = document.createElement("button");
      item.type = "button"; item.className = "moment-item";
      item.setAttribute("aria-label", own ? "Seus Why Now" : "Ver Why Now de " + group.name);
      const ring = document.createElement("span");
      ring.className = "ring" + (stories.length && stories.every(st => st.seen) ? " seen" : "") + (own && !stories.length ? " own" : "");
      const inner = document.createElement("span"); inner.className = "inner"; inner.append(avatarNode(group)); ring.append(inner);
      if (own && !stories.length) { const plus = document.createElement("span"); plus.className = "own-plus"; plus.textContent = "+"; ring.append(plus); }
      const name = document.createElement("span"); name.textContent = own ? (stories.length ? "Seu Why Now" : "Criar agora") : group.name;
      item.append(ring, name);
      item.onclick = () => {
        if (!stories.length && own) { openCamera(); return; }
        const records = stories.filter(st => st.url).map(st => contentRecord(st, group));
        if (records.length) openViewer(records, 0, "home");
      };
      row.append(item);
    }
    document.querySelector("#blank-feed")?.classList.add("hidden");
    document.querySelector("#feed-published")?.classList.add("hidden");
  };
  const oldShowScreen = showScreen;
  showScreen = function (name) {
    oldShowScreen(name);
    send("mode", { mode: name });
  };
  const originalStopViewer = stopViewer;
  stopViewer = function () { stopCatalogAudio(); originalStopViewer(); };
  const basePauseViewer=pauseViewer;
  pauseViewer=function(mode){
    basePauseViewer(mode);
    if(viewerCatalogAudio){
      if(viewerPaused)viewerCatalogAudio.pause();
      else void viewerCatalogAudio.play().catch(()=>{});
    }
  };
  const baseSheetClose=sheetClose;
  sheetClose=function(){
    baseSheetClose();
    if(screen==="viewer"&&viewerPaused)pauseViewer(false);
  };
  const originalLoadViewer = loadViewerRecord;
  loadViewerRecord = async function () {
    stopCatalogAudio();
    const incoming=viewerRecord();
    const version=++catalogRequestVersion;
    const cached=incoming?.catalogMusic?previewUrls.get(previewKey(incoming.catalogMusic)):null;
    // Start while the viewer-opening tap still carries transient activation.
    if(incoming?.remoteUrl && cached && incoming.catalogMusic?.provider==="apple") {
      const audio=new Audio(cached);audio.preload="auto";audio.volume=.85;
      viewerCatalogAudio=audio;
      void audio.play().catch(error=>{
        lastSoundBlocked=error?.name==="NotAllowedError";
        console.info("[Why Now] Browser deferred catalog audio",error?.name||"unavailable");
      });
    }
    await originalLoadViewer();
    const current = viewerRecord();
    if (!current?.remoteUrl) return;
    document.querySelectorAll("#viewer > .wn-repost-pill").forEach(button=>button.remove());
    const vid = document.querySelector("#view-video");
    const img = document.querySelector("#view-image");
    vid.pause(); vid.removeAttribute("src"); img.removeAttribute("src");
    if (current.type === "video") {
      vid.src = current.remoteUrl; vid.muted = false; vid.defaultMuted = false; vid.volume = 1; vid.playsInline = true;
      vid.classList.remove("hidden"); img.classList.add("hidden");
      vid.onended = nextViewer;
      void vid.play().catch(error => {
        if (error?.name==="NotAllowedError") {
          lastSoundBlocked = true;
          vid.muted=true;
          void vid.play().catch(()=>{});
          sound.textContent = "♫";
          sound.title="Toque para ativar o áudio";
        } else console.warn("[Why Now] Video playback",error);
      });
      const sound = document.querySelector("#viewer-sound");
      sound.hidden = false; sound.textContent = "♫";
      sound.setAttribute("aria-label", "Ativar ou desativar áudio");
      sound.onclick = () => { vid.muted = !vid.muted; sound.textContent = vid.muted ? "♫" : "🔊"; if (vid.paused) void vid.play().catch(() => {}); };
    } else {
      img.src = current.remoteUrl; img.classList.remove("hidden"); vid.classList.add("hidden");
      document.querySelector("#viewer-sound").hidden = true;
    }
    if (current.catalogMusic?.provider === "apple") {
      const sound=document.querySelector("#viewer-sound");
      sound.hidden=false;sound.textContent="♫";
      sound.setAttribute("aria-label","Pausar ou ativar a música");
      sound.title="Música de fundo";
      sound.onclick=async()=>{
        if(viewerCatalogAudio){
          if(viewerCatalogAudio.paused)void viewerCatalogAudio.play().catch(()=>{});
          else viewerCatalogAudio.pause();
        } else if(current.catalogMusic){
          const preview=await catalogPreview(current.catalogMusic);
          if(!preview||viewerRecord()?.id!==current.id)return;
          viewerCatalogAudio=new Audio(preview);
          void viewerCatalogAudio.play().catch(()=>{});
        }
      };
      if(!viewerCatalogAudio){
        // Previews are the only Apple audio the current Looply search provides.
        void catalogPreview(current.catalogMusic).then(url=>{
          if(!url||version!==catalogRequestVersion||screen!=="viewer"||viewerRecord()?.id!==current.id)return;
          const audio=new Audio(url);audio.preload="auto";audio.volume=.85;
          viewerCatalogAudio=audio;
          void audio.play().catch(error=>{
            lastSoundBlocked=error?.name==="NotAllowedError";
            sound.textContent="♫";
            sound.title=lastSoundBlocked?"Toque para ativar o áudio":"Música indisponível";
          });
        });
      }
    }
    const avatar = document.querySelector("#view-avatar");
    if (current.avatarUrl && /^https:\/\//i.test(current.avatarUrl)) {
      avatar.replaceChildren();
      const picture = document.createElement("img"); picture.className = "ava-img"; picture.alt = ""; picture.src = current.avatarUrl;
      avatar.append(picture);
    }
    document.querySelector("#view-name").textContent = current.owner ? "Você" : current.name;
    const options=document.querySelector("#btn-view-more");
    options.onclick=()=>shareMoment();
    if (current.owner) {
      document.querySelector("#own-viewers").onclick = showOwnViewers;
      const actions=document.querySelector(".own-bottom");
      const mention=document.createElement("button");
      mention.type="button";mention.className="wn-mention-button";
      mention.textContent="@";mention.title="Mencionar usuários";mention.setAttribute("aria-label","Mencionar pessoas para poderem republicar");
      mention.onclick=()=>mentionPeople();
      actions.insertBefore(mention,document.querySelector("#own-remove"));
      document.querySelector("#own-remove").onclick = removeOwnMoment;
      document.querySelector("#own-share").onclick = shareMoment;
    } else {
      const reply = document.querySelector("#reply-input");
      reply.maxLength = 2000;
      const repost=document.createElement("button");
      repost.type="button";repost.className="wn-repost-pill hidden";
      repost.textContent="↻ Republicar";
      repost.setAttribute("aria-label","Republicar Why Now em que fui mencionado");
      document.querySelector("#viewer").append(repost);
      repost.onclick=()=>{repost.disabled=true;void request("repost",{storyId:current.id})
        .then(()=>{showToast("Republicado no seu Why Now");closeViewer();})
        .catch(messageError).finally(()=>{repost.disabled=false;});};
      void request("permissions",{storyId:current.id}).then(({canRepost})=>{
        if(viewerRecord()?.id===current.id)repost.classList.toggle("hidden",!canRepost);
      }).catch(()=>{});
      document.querySelector("#quick-heart").onclick = () => void request("like", { storyId: current.id }).then(({ liked }) => {
        document.querySelector("#quick-heart").setAttribute("aria-pressed", liked ? "true" : "false");
        document.querySelector("#quick-heart").textContent = liked ? "♥" : "♡";
      }).catch(messageError);
      document.querySelector("#reply-send").onclick = sendDemoReply;
      reply.onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); sendDemoReply(); } };
      void request("seen", { storyId: current.id }).then(() => {
        const source = storyForId(current.id); if (source) source.seen = true;
        renderHome();
      }).catch(err => console.warn("[Why Now] view receipt failed", err));
    }
  };
  function storyShareUrl(item) {
    const url=new URL("home.html",location.href);
    url.search="";url.searchParams.set("storyId",item.id);
    return url.href;
  }
  function createAction(label,action,kind="") {
    const button=document.createElement("button");button.type="button";button.className="wn-sheet-action "+kind;
    button.textContent=label;button.onclick=action;return button;
  }
  function openActionsSheet(title) {
    pauseViewer(true);sheetOpen('<h2 class="sheet-title">'+escapeHtml(title)+'</h2><div class="wn-sheet-actions" id="wn-sheet-actions"></div>');
    return document.querySelector("#wn-sheet-actions");
  }
  function closeActionsSheet() {
    sheetClose();if(screen==="viewer")pauseViewer(false);
  }
  function personElement(person,onClick) {
    const button=document.createElement("button");button.type="button";button.className="wn-person-option";
    const avatar=document.createElement("span");avatar.className="wn-person-avatar";
    if(person.avatarUrl && /^https:\/\//i.test(person.avatarUrl)){
      const img=document.createElement("img");img.alt="";img.src=person.avatarUrl;img.referrerPolicy="no-referrer";avatar.append(img);
    } else avatar.textContent=String(person.name||"?").charAt(0).toUpperCase();
    const text=document.createElement("span");text.className="wn-person-text";
    const name=document.createElement("strong");name.textContent=person.name||"Usuário";
    const handle=document.createElement("small");handle.textContent=person.username?"@"+person.username:"";
    text.append(name,handle);button.append(avatar,text);button.onclick=()=>onClick(button);
    return button;
  }
  async function openPeopleSheet(title,handler) {
    const area=openActionsSheet(title);
    area.append(createAction("Voltar",closeActionsSheet,"wn-close"));
    try {
      const {people}=await request("people",{});
      if(!area.isConnected)return;
      const list=document.createElement("div");list.className="wn-people-options";
      for(const person of people||[])list.append(personElement(person,button=>handler(person,button)));
      if(!list.childElementCount){const empty=document.createElement("p");empty.textContent="Nenhum usuário disponível.";list.append(empty);}
      area.prepend(list);
    }catch(error){messageError(error);closeActionsSheet();}
  }
  shareMoment = function () {
    const item=viewerRecord();
    if(!item?.remoteUrl)return;
    const url=storyShareUrl(item);
    const area=openActionsSheet("Compartilhar Why Now");
    area.append(
      createAction("↗ Compartilhar externamente",async()=>{
        try{
          if(!navigator.share){showToast("Compartilhamento nativo não disponível");return;}
          await navigator.share({title:"Why Now no Looply",text:"Veja este instante no Looply",url});
          closeActionsSheet();
        }catch(e){if(e?.name!=="AbortError")messageError(e);}
      }),
      createAction("⧉ Copiar link",async()=>{
        try{
          if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(url);
          else{const field=document.createElement("textarea");field.value=url;field.style.position="fixed";field.style.opacity="0";
            document.body.append(field);field.select();if(!document.execCommand("copy"))throw Error("copy failed");field.remove();}
          showToast("Link copiado");closeActionsSheet();
        }catch(e){messageError(e);}
      }),
      createAction("➤ Enviar pelo Looply",()=>{
        openPeopleSheet("Enviar Why Now",async(person,button)=>{
          button.disabled=true;
          try{await request("share-send",{storyId:item.id,personId:person.id});
            showToast("Enviado para "+person.name);closeActionsSheet();
          }catch(e){messageError(e);}finally{button.disabled=false;}
        });
      }),
      createAction("Cancelar",closeActionsSheet,"wn-close")
    );
  };
  async function mentionPeople() {
    const item=viewerRecord();
    if(!item?.remoteUrl||!item.owner)return;
    await openPeopleSheet("Mencionar no Why Now",async(person,button)=>{
      button.disabled=true;
      try {
        await request("mention",{storyId:item.id,userIds:[person.id]});
        showToast("@"+person.username+" mencionado · republicação permitida");
        closeActionsSheet();
      } catch(e){messageError(e);}finally{button.disabled=false;}
    });
  }
  showOwnViewers = function () {
    const item=viewerRecord();
    if(!item?.remoteUrl||!item.owner)return;
    const area=openActionsSheet("Visualizações");
    const status=document.createElement("p");status.className="wn-sheet-status";status.textContent="Carregando visualizações…";area.append(status);
    area.append(createAction("Fechar",closeActionsSheet,"wn-close"));
    void request("views",{storyId:item.id}).then(({people})=>{
      if(!area.isConnected)return;
      status.textContent=(people?.length||0)+" visualização"+(people?.length===1?"":"ões");
      const list=document.createElement("div");list.className="wn-people-options";
      for(const person of people||[]) {
        const entry=personElement(person,()=>{});
        entry.disabled=true;
        const when=document.createElement("small");when.className="wn-viewed-at";
        const timestamp=new Date(person.viewedAt);
        when.textContent=Number.isNaN(timestamp.getTime())?"Horário não disponível":
          "Viu em "+timestamp.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+
          " às "+timestamp.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
        entry.querySelector(".wn-person-text").append(when);
        list.append(entry);
      }
      if(!list.childElementCount) {
        const empty=document.createElement("p");empty.textContent="Nenhuma visualização registrada.";list.append(empty);
      }
      area.insertBefore(list,area.lastChild);
    }).catch(messageError);
  };
  sendDemoReply = function () {
    const item = viewerRecord(), input = document.querySelector("#reply-input");
    const text = String(input?.value || "").trim();
    if (!item?.remoteUrl || !text) return;
    input.disabled = true;
    void request("reply", { storyId: item.id, text }).then(() => {
      input.value = ""; showToast("Resposta enviada");
    }).catch(messageError).finally(() => { input.disabled = false; });
  };
  removeOwnMoment = function () {
    const item = viewerRecord();
    if (!item?.remoteUrl || !item.owner) return;
    pauseViewer(true);
    sheetOpen('<h2 class="sheet-title">Apagar este Why Now?</h2><p class="sheet-desc">Esta publicação será excluída do Looply.</p><div class="sheet-foot"><button class="btn ghost" id="wn-del-cancel">Cancelar</button><button class="btn dark danger" id="wn-del-confirm">Apagar</button></div>');
    document.querySelector("#wn-del-cancel").onclick = () => { sheetClose(); pauseViewer(false); };
    document.querySelector("#wn-del-confirm").onclick = () => {
      const b = document.querySelector("#wn-del-confirm"); b.disabled = true;
      void request("delete", { storyId: item.id }).then(() => {
        sheetClose(); closeViewer(); showToast("Why Now apagado");
      }).catch(messageError).finally(() => { b.disabled = false; });
    };
  };
  const extra=document.createElement("section");
  extra.className="wn-editor-extras";
  extra.setAttribute("aria-label","Opções do Why Now");
  extra.innerHTML='<button type="button" class="wn-editor-mention" aria-label="Mencionar pessoas antes de publicar">＠ Mencionar <span class="wn-editor-mention-count"></span></button>'+
    '<div class="wn-editor-duration hidden" role="group" aria-label="Duração da foto com música">'+
    '<span>Foto com música</span><button type="button" data-wn-duration="15" aria-pressed="true">15 s</button>'+
    '<button type="button" data-wn-duration="30" aria-pressed="false">30 s</button></div>';
  document.querySelector("#editor .edit-bottom").before(extra);
  function renderEditorExtras(){
    extra.querySelector(".wn-editor-mention-count").textContent=editorMentions.size?"· "+editorMentions.size:"";
    const duration=extra.querySelector(".wn-editor-duration");
    const visible=media?.type==="image"&&hasEditorMusic();
    duration.classList.toggle("hidden",!visible);
    if(!visible)editorDuration=15;
    const enough=previewDurationAvailable()>=30;
    if(!enough&&editorDuration===30)editorDuration=15;
    for(const button of duration.querySelectorAll("[data-wn-duration]")){
      const chosen=Number(button.dataset.wnDuration)===editorDuration;
      button.setAttribute("aria-pressed",String(chosen));
      button.disabled=button.dataset.wnDuration==="30"&&!enough;
      button.title=button.disabled?"Prévia de menos de 30 segundos":"Duração da foto";
    }
  }
  extra.querySelector(".wn-editor-mention").onclick=()=>openEditorMentions();
  extra.querySelectorAll("[data-wn-duration]").forEach(button=>button.onclick=()=>{
    editorDuration=Number(button.dataset.wnDuration)===30?30:15;renderEditorExtras();
  });
  const previousEnterEditor=enterEditor;
  enterEditor=function(item){
    catalogTrack=null;previousEnterEditor(item);resetPublishEditor();
  };
  async function selectProfiles({title,initial,allowed,limit=20,commit}){
    const chosen=new Set(initial||[]);
    const sheet= document.querySelector("#sheet");
    sheetOpen('<h2 class="sheet-title">'+escapeHtml(title)+'</h2>'+
      '<div class="wn-selector-content"><label class="wn-selector-label" for="wn-profile-search">Buscar pessoas</label>'+
      '<input type="search" id="wn-profile-search" placeholder="Nome ou @usuário" autocomplete="off">'+
      '<p class="wn-selected-count" aria-live="polite"></p><div class="wn-selector-list"></div>'+
      '<div class="wn-selector-footer"><button type="button" class="wn-selector-cancel">Voltar</button>'+
      '<button type="button" class="wn-selector-confirm">Confirmar</button></div></div>');
    const list=sheet.querySelector(".wn-selector-list");
    const search=sheet.querySelector("#wn-profile-search");
    const count=sheet.querySelector(".wn-selected-count");
    const confirm=sheet.querySelector(".wn-selector-confirm");
    const close=()=>sheetClose();
    sheet.querySelector(".wn-selector-cancel").onclick=close;
    const {people}=await request("people",{}).catch(err=>{messageError(err);return {people:[]};});
    if(!sheet.contains(list))return;
    const valid=(people||[]).filter(p=>!allowed||allowed.has(p.id));
    function render(){
      const term=search.value.trim().replace(/^@/,"").toLocaleLowerCase("pt-BR");
      const filtered=valid.filter(p=>!term||[p.name,p.username].some(x=>String(x||"").toLocaleLowerCase("pt-BR").includes(term)));
      list.replaceChildren();
      for(const person of filtered){
        const button=personElement(person,()=>{
          if(chosen.has(person.id))chosen.delete(person.id);
          else if(chosen.size<limit)chosen.add(person.id);
          else{showToast("Selecione no máximo "+limit+" pessoas");return;}
          render();
        });
        button.classList.toggle("is-selected",chosen.has(person.id));
        button.setAttribute("aria-pressed",String(chosen.has(person.id)));
        const mark=document.createElement("span");mark.className="wn-selector-check";mark.textContent=chosen.has(person.id)?"✓":"+";
        button.append(mark);list.append(button);
      }
      if(!filtered.length){const empty=document.createElement("p");empty.className="wn-selector-empty";empty.textContent="Nenhum perfil encontrado.";list.append(empty);}
      count.textContent=chosen.size+" de "+limit+" selecionado(s)";
    }
    search.oninput=render;
    confirm.onclick=()=>{const accepted=commit(new Set(chosen));if(accepted!==false&&list.isConnected)close();};
    render();search.focus();
  }
  async function openEditorMentions(){
    const allowed=publishVisibility==="selected"?publishAudience:null;
    await selectProfiles({title:"Mencionar no Why Now",initial:editorMentions,allowed,limit:20,
      commit:chosen=>{editorMentions=chosen;renderEditorExtras();showToast(chosen.size+" menção(ões) preparada(s)");}
    });
  }
  function openPublishChoices(){
    if(!media)return;
    sheetOpen('<h2 class="sheet-title">Publicar Why Now</h2>'+
      '<p class="sheet-desc">Quem poderá assistir a este instante?</p>'+
      '<div class="wn-audience-options">'+
      '<button type="button" data-wn-audience="public"><strong>🌐 Todos</strong><small>Disponível para todos com acesso aos Why Now públicos</small></button>'+
      '<button type="button" data-wn-audience="selected"><strong>👥 Pessoas específicas</strong><small>Somente os perfis escolhidos</small></button></div>'+
      '<p class="wn-audience-count"></p>'+
      '<div class="wn-selector-footer"><button class="wn-selector-cancel" type="button">Voltar</button>'+
      '<button class="wn-selector-confirm" type="button">Publicar agora</button></div>');
    const sheet=document.querySelector("#sheet");
    const audienceButtons=[...sheet.querySelectorAll("[data-wn-audience]")];
    const summary=sheet.querySelector(".wn-audience-count");
    const commit=sheet.querySelector(".wn-selector-confirm");
    function render(){
      audienceButtons.forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.wnAudience===publishVisibility)));
      summary.textContent=publishVisibility==="selected"
        ?publishAudience.size+" pessoa(s) autorizada(s) · "+editorMentions.size+" mencionada(s)"
        :editorMentions.size+" pessoa(s) mencionada(s)";
      commit.disabled=publishVisibility==="selected"&&!publishAudience.size;
      commit.textContent=publishing?"Publicando…":"Publicar agora";
    }
    audienceButtons.forEach(button=>button.onclick=async()=>{
      if(button.dataset.wnAudience==="public"){publishVisibility="public";render();return;}
      await selectProfiles({title:"Pessoas específicas",initial:publishAudience,limit:20,
        commit:chosen=>{
          if(!chosen.size){showToast("Selecione pelo menos uma pessoa");return false;}
          publishAudience=chosen;publishVisibility="selected";
          editorMentions=new Set([...editorMentions].filter(id=>chosen.has(id)));
          renderEditorExtras();openPublishChoices();
        }
      });
    });
    sheet.querySelector(".wn-selector-cancel").onclick=()=>sheetClose();
    commit.onclick=async()=>{
      if(publishing)return;
      if(publishVisibility==="selected"&&!publishAudience.size)return;
      publishing=true;commit.disabled=true;render();
      try{
        const draft=buildDraft();
        const hasMusic=hasEditorMusic();
        const duration=media.type==="image"&&hasMusic?editorDuration:
          media.type==="video"&&hasMusic?(draft.music?.length>15?30:15):15;
        if(draft.music){
          if(media.type==="image"&&draft.music.duration-draft.music.start<duration-.1)
            throw Error("A música não possui este trecho.");
          draft.music.length=Math.min(duration,draft.music.length,30);
        }
        const blob=draft.music?await wnExportWithMusic(draft):
          draft.type==="image"?await exportMomentImage(draft):await exportEditedVideo(draft);
        if(!(blob instanceof Blob)||!blob.size)throw Error("Não foi possível exportar a mídia");
        await request("publish",{
          blob,kind:blob.type.startsWith("video/")?"video":"image",
          originalKind:media.type,hasMusic,photoDuration:duration,
          caption:draft.caption||"",reason:draft.reason||"",catalogTrack,
          visibility:publishVisibility,recipientIds:[...publishAudience],
          mentionIds:[...editorMentions]
        });
        wnStopPreview();sheetClose();showToast("Why Now publicado");showScreen("home");
      }catch(error){messageError(error);}
      finally{publishing=false;if(commit.isConnected)render();}
    };
    render();
  }
  // A photo without audio lasts 15 seconds; photos with music offer 15/30.
  const oldViewerTick=viewerTick;
  viewerTick=function(now){
    const item=viewerRecord();
    if(screen==="viewer"&&item?.remoteUrl&&item.type==="video"&&item.catalogMusic&&
       Number.isFinite(item.duration)&&item.duration>0){
      const video=document.querySelector("#view-video");
      if(video&&video.currentTime>=item.duration){nextViewer();return;}
    }
    if(screen==="viewer"&&item?.type==="image"&&(item.remoteUrl||item.id==="draft")){
      if(!viewerPaused){
        const dt=Math.min(100,now-viewerLast);
        viewProgress+=dt/(Math.max(1,Number(item.duration)||15)*1000);
        const bar=document.getElementById("prog-"+viewerIdx);
        if(bar)bar.style.width=(clamp(viewProgress,0,1)*100)+"%";
        if(viewProgress>=1){nextViewer();return;}
      }
      viewerLast=now;viewerRaf=requestAnimationFrame(viewerTick);return;
    }
    oldViewerTick(now);
  };
  const publish=document.querySelector("#btn-publish");
  publish.onclick=()=>openPublishChoices();
  const musicButton = document.querySelector("#tool-music");
  musicButton.onclick = async function () {
    try {
      if (musicPickerCleanup) { musicPickerCleanup(); musicPickerCleanup = null; }
      const module = await import("./story-music-picker.js?build=e96bd539b17ff957");
      const body = document.querySelector("#sheet-body");
      musicPickerCleanup = module.openStoryMusicPicker({
        modal: (title, html) => sheetOpen('<h2 class="sheet-title">' + escapeHtml(title) + '</h2>' + html),
        body, builtin: [],
        onSelect: async track => {
          try {
            if (track?.kind === "file" && track.file instanceof Blob) {
              catalogTrack = null;
              await wnImportAudio(track.file, track.title || "Música", { artist: track.artist, provider: track.provider || "", source: "file" });
            } else if (track?.kind === "catalog" && track.provider === "apple") {
              wnClearSong(); catalogTrack = track;
              musicButton.classList.add("has-track");
              document.querySelector("#wn-music-empty").textContent = track.title + " · " + (track.artist || "Apple Music");
            } else { showToast("Selecione uma gravação disponível"); return; }
            musicPickerCleanup?.(); musicPickerCleanup = null;
            sheetClose();renderEditorExtras(); showToast("Música selecionada");
          } catch (error) { messageError(error); }
        },
        onStatus: text => { if (text) console.info("[Why Now music]", text); }
      });
    } catch (e) { messageError(e); }
  };
  document.querySelector("#wn-music-remove").addEventListener("click", () => {
    catalogTrack = null; musicButton.classList.remove("has-track");renderEditorExtras();
  });
  document.querySelector("#btn-cam-close").addEventListener("click", () => {
    if (screen === "camera") send("mode", { mode: "home" });
  });
  window.addEventListener("message", event => {
    if (event.origin !== origin || event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.channel !== "looply-why-now-v1") return;
    if (data.type === "data") {
      me = data.me || me; groups = Array.isArray(data.groups) ? data.groups : [];
      const theme=data.theme||{};
      const allowed=value=>typeof value==="string" && /^#[0-9a-f]{3,8}$/i.test(value.trim());
      for(const [key,value] of Object.entries({
        "--violet":theme.primary,"--lilac":theme.lilac,
        "--accent":theme.primaryDark,"--ink":theme.text,"--paper":theme.surface,
        "--muted":theme.muted
      }))if(allowed(value))document.documentElement.style.setProperty(key,value.trim());
      renderHome();preparePreviews();
      if (screen === "viewer" && viewerRecord()?.remoteUrl) {
        const active = storyForId(viewerRecord().id);
        if (!active) closeViewer();
      }
    }
    if (data.type === "open-create") {
      void openCamera();
    }
    if (data.type === "open-story" && data.storyId) {
      for (const group of groups) {
        const stories = storiesOf(group).filter(st => st.url);
        const index = stories.findIndex(st => st.id === data.storyId);
        if (index >= 0) {
          openViewer(stories.map(st => contentRecord(st, group)), index, "home");
          break;
        }
      }
    }
    if (data.type === "ack") {
      const task = pending.get(data.requestId);
      if (!task) return;
      pending.delete(data.requestId);
      if (data.error) task.reject(Error(data.error));
      else task.resolve(data.result || {});
    }

  });
  window.whyNowOpenCreate=()=>{void openCamera();};
  window.whyNowOpenStory=storyId=>{
    for(const group of groups){
      const items=storiesOf(group).filter(st=>st.url);
      const index=items.findIndex(st=>st.id===storyId);
      if(index>=0){openViewer(items.map(st=>contentRecord(st,group)),index,"home");return true;}
    }
    return false;
  };
  const style = document.createElement("style");
  style.textContent = [
    "html,body,#app{background:transparent!important}",
    "@media(min-width:650px){body{display:block!important}#app{width:100%!important;max-width:none!important;height:100dvh!important;border:0!important;border-radius:0!important;box-shadow:none!important}}",
    "#home{background:transparent!important;overflow:hidden!important}",
    "#home .home-head,#home .blank-feed,#home .bottom-nav,#home .feed-note,#home .feed-published,#home .top-line,#home .own-publications{display:none!important}",
    "#home .feed-scroll{overflow:hidden!important}",
    "#home .home-sub{margin:9px 17px 11px!important;color:#7954d3!important}",
    "#home .moment-row{padding:0 14px 12px!important;min-height:106px!important;gap:14px}",
    "#home .moment-item{min-width:68px!important;max-width:68px!important}",
    "#sheet .studio-music-picker{color:#242129;font-size:12px}",
    "#sheet .studio-music-search-label input{width:100%;padding:14px;background:#f2eff7;border-radius:12px}",
    "#sheet .studio-music-results{display:grid;gap:9px;max-height:38dvh;overflow:auto;margin-top:13px}",
    "#sheet .studio-catalog-song{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #e9e4ef}",
    "#sheet .studio-catalog-song img{width:43px;height:43px;object-fit:cover;border-radius:8px}",
    "#sheet .studio-catalog-info{flex:1;min-width:0}",
    "#sheet .studio-catalog-info strong,#sheet .studio-catalog-info small{display:block;overflow:hidden;text-overflow:ellipsis}",
    "#sheet .studio-catalog-info small{color:#85808e;font-size:10px;margin-top:4px}",
    "#sheet .studio-music-row-actions{display:flex;gap:4px;flex-direction:column}",
    "#sheet .studio-music-row-actions button{padding:7px 10px;background:#ede7fa;border-radius:10px;font-size:10px}",
    "#sheet .studio-music-preview{margin:10px 0}",
    "#sheet .studio-music-preview button{padding:9px;border-radius:9px;background:#ede7fa}",
    "#sheet .studio-music-found{font-size:10px;color:#78698b}",
    "#sheet .studio-music-preview audio{display:none}",
    "#viewer .own-bottom{gap:6px}",
    "#viewer .own-bottom .views-btn{flex:1;min-width:0;font-size:11px}",
    "#viewer .own-bottom .btn{min-width:0;padding:10px 9px}",
    "#viewer .wn-mention-button{border:1px solid #ffffff68;border-radius:13px;color:#fff;padding:10px 12px;min-width:38px;font-weight:800;font-size:16px}",
    "#viewer .wn-repost-pill{position:absolute;z-index:9;right:18px;bottom:calc(87px + var(--safeBottom));padding:10px 16px;border-radius:99px;background:var(--violet,#8455f0);color:#fff;font-weight:800;font-size:12px;box-shadow:0 9px 25px #0005}",
    "#sheet .wn-sheet-actions{display:grid;gap:9px}",
    "#sheet .wn-sheet-action{width:100%;text-align:left;background:#f2eff7;color:#27202f;padding:15px 17px;border-radius:16px;font-size:13px;font-weight:700}",
    "#sheet .wn-sheet-action:active{background:#e4dafa}",
    "#sheet .wn-sheet-action.wn-close{background:transparent;color:#82798d;text-align:center;border:1px solid #e3dfeb}",
    "#sheet .wn-sheet-status{font-size:12px;color:#786a85;margin:3px 0 9px}",
    "#sheet .wn-people-options{display:grid;gap:6px;max-height:47dvh;overflow:auto;margin-bottom:12px}",
    "#sheet .wn-person-option{width:100%;display:flex;align-items:center;text-align:left;gap:11px;background:#f8f5fb;border-radius:14px;padding:9px 10px;min-height:59px}",
    "#sheet .wn-person-option:disabled{opacity:1;cursor:default}",
    "#sheet .wn-person-avatar{width:41px;height:41px;border-radius:50%;overflow:hidden;display:grid;place-items:center;flex:none;background:#d3c2f4;color:#5c389f;font-weight:800}",
    "#sheet .wn-person-avatar img{width:100%;height:100%;object-fit:cover}",
    "#sheet .wn-person-text{display:grid;gap:3px;flex:1;min-width:0}",
    "#sheet .wn-person-text strong{font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    "#sheet .wn-person-text small{font-size:10px;color:#81768f}",
    "#sheet .wn-person-text .wn-viewed-at{font-size:11px;color:var(--violet,#7952d5)}",
    "#editor .wn-editor-extras{position:absolute;z-index:12;left:14px;right:14px;bottom:calc(76px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;justify-content:space-between;gap:8px;pointer-events:auto}",
    "#editor .wn-editor-mention{border:1px solid #ffffff77;background:#24212cab;color:white;padding:10px 13px;border-radius:999px;font-size:12px;font-weight:800;backdrop-filter:blur(12px)}",
    "#editor .wn-editor-duration{display:flex;align-items:center;gap:5px;border-radius:999px;background:#24212ccc;color:white;padding:5px 8px;font-size:10px;font-weight:700}",
    "#editor .wn-editor-duration.hidden{display:none}",
    "#editor .wn-editor-duration button{padding:7px 9px;border-radius:99px;color:#fff9;font-weight:800;font-size:10px}",
    "#editor .wn-editor-duration button[aria-pressed=true]{background:var(--violet,#7952d5);color:#fff}",
    "#editor .wn-editor-duration button:disabled{opacity:.4}",
    "#sheet .wn-selector-content{display:grid;gap:10px}",
    "#sheet .wn-selector-label{font-size:12px;font-weight:800}",
    "#sheet #wn-profile-search{width:100%;border:1px solid #d9d1e7;border-radius:13px;padding:12px 13px;color:var(--ink,#292133);background:#fff;outline-color:var(--violet,#7952d5)}",
    "#sheet .wn-selector-list{overflow-y:auto;max-height:45dvh;display:grid;gap:6px}",
    "#sheet .wn-selector-count,#sheet .wn-selected-count,#sheet .wn-audience-count{font-size:11px;color:var(--violet,#7952d5);font-weight:700}",
    "#sheet .wn-selector-check{font-size:17px;display:grid;place-items:center;width:27px;height:27px;border-radius:50%;background:#eee8f7;color:#6f4ac1;font-weight:800;flex:none}",
    "#sheet .wn-person-option.is-selected{background:color-mix(in srgb,var(--violet,#7952d5) 13%,white)}",
    "#sheet .wn-person-option.is-selected .wn-selector-check{background:var(--violet,#7952d5);color:#fff}",
    "#sheet .wn-selector-footer{display:flex;gap:9px;margin-top:10px}",
    "#sheet .wn-selector-footer button{flex:1;min-height:46px;padding:10px;border-radius:13px;font-size:12px;font-weight:800}",
    "#sheet .wn-selector-cancel{border:1px solid #e2daea;background:#fff;color:#6f6480}",
    "#sheet .wn-selector-confirm{background:var(--violet,#7952d5);color:white}",
    "#sheet .wn-selector-confirm:disabled{opacity:.48}",
    "#sheet .wn-audience-options{display:grid;gap:9px}",
    "#sheet .wn-audience-options button{display:grid;gap:5px;text-align:left;border:2px solid #e6e0ef;border-radius:15px;padding:13px;background:#fff;color:var(--ink,#292133)}",
    "#sheet .wn-audience-options button strong{font-size:13px}",
    "#sheet .wn-audience-options button small{font-size:11px;color:#796d89}",
    "#sheet .wn-audience-options button[aria-pressed=true]{border-color:var(--violet,#7952d5);background:color-mix(in srgb,var(--violet,#7952d5) 9%,white)}",

    "#sheet{background:var(--paper,#fff)!important;color:var(--ink,#231e2c)!important}",
    "#sheet .wn-sheet-action{color:var(--ink,#231e2c)}",
    "#sheet .wn-sheet-action:not(.wn-close){background:color-mix(in srgb,var(--violet) 9%,white)}",
    "#sheet .wn-person-option{background:color-mix(in srgb,var(--violet) 6%,white)}",
    "#sheet .wn-person-avatar{background:var(--lilac,#d3c2f4)}",
    "#viewer .wn-repost-pill{background:var(--violet,#7952d5)}",
    "#editor .btn.purple{background:var(--violet,#7952d5)!important}",
    "#editor .edit-reason{color:var(--ink,#231e2c)}",
    "#wn-music-studio .wn-music-search{display:none!important}",
    "body,button,input,textarea{font-family:'Plus Jakarta Sans','DM Sans',system-ui,sans-serif}"


  ].join("\n");
  document.head.append(style);
  renderHome();
  send("ready", {});
})();
