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
  const previewUrls = new Map();
  let catalogRequestVersion = 0;
  let lastSoundBlocked = false;
  function previewKey(song) { return String(song?.id || song?.url || ""); }
  async function catalogPreview(song) {
    if (!song || song.provider !== "apple") return "";
    const key=previewKey(song);
    if (!key) return "";
    if(previewUrls.has(key))return previewUrls.get(key);
    const { resolveAppleStoryPreview }=await import("./story-music-catalog.js?v=story-music-official-widget-20261028");
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
      seen: Boolean(story.seen), catalogMusic: story.music || null, items: [], strokes: [], filter: "none"
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
  const publish = document.querySelector("#btn-publish");
  publish.onclick = async function () {
    if (publishing || !media) return;
    publishing = true; publish.disabled = true;
    try {
      const draft = buildDraft();
      const blob = draft.music ? await wnExportWithMusic(draft) :
        draft.type === "image" ? await exportMomentImage(draft) : await exportEditedVideo(draft);
      if (!(blob instanceof Blob) || !blob.size) throw Error("empty export");
      await request("publish", { blob, kind: blob.type.startsWith("video/") ? "video" : "image",
        caption: draft.caption || "", reason: draft.reason || "", catalogTrack });
      wnStopPreview(); showToast("Why Now publicado"); showScreen("home");
    } catch (error) { messageError(error); }
    finally { publishing = false; publish.disabled = false; }
  };
  const musicButton = document.querySelector("#tool-music");
  musicButton.onclick = async function () {
    try {
      if (musicPickerCleanup) { musicPickerCleanup(); musicPickerCleanup = null; }
      const module = await import("./story-music-picker.js?v=story-music-official-widget-20261028");
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
            sheetClose(); showToast("Música selecionada");
          } catch (error) { messageError(error); }
        },
        onStatus: text => { if (text) console.info("[Why Now music]", text); }
      });
    } catch (e) { messageError(e); }
  };
  document.querySelector("#wn-music-remove").addEventListener("click", () => {
    catalogTrack = null; musicButton.classList.remove("has-track");
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
    "#sheet .wn-person-text .wn-viewed-at{font-size:11px;color:#6a5489}"

  ].join("\n");
  document.head.append(style);
  renderHome();
  send("ready", {});
})();
