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
    await originalLoadViewer();
    const current = viewerRecord();
    if (!current?.remoteUrl) return;
    const vid = document.querySelector("#view-video");
    const img = document.querySelector("#view-image");
    vid.pause(); vid.removeAttribute("src"); img.removeAttribute("src");
    if (current.type === "video") {
      vid.src = current.remoteUrl; vid.muted = true; vid.playsInline = true;
      vid.classList.remove("hidden"); img.classList.add("hidden");
      vid.onended = nextViewer;
      void vid.play().catch(() => {});
      const sound = document.querySelector("#viewer-sound");
      sound.hidden = false; sound.textContent = "♫";
      sound.setAttribute("aria-label", "Ativar ou desativar áudio");
      sound.onclick = () => { vid.muted = !vid.muted; sound.textContent = vid.muted ? "♫" : "🔊"; if (vid.paused) void vid.play().catch(() => {}); };
    } else {
      img.src = current.remoteUrl; img.classList.remove("hidden"); vid.classList.add("hidden");
      document.querySelector("#viewer-sound").hidden = true;
    }
    if (current.catalogMusic?.provider === "apple") {
      const sound = document.querySelector("#viewer-sound");
      sound.hidden = false; sound.textContent = "♫";
      sound.title = "Ouvir música do Why Now";
      sound.setAttribute("aria-label", "Ouvir ou pausar música de fundo");
      sound.onclick = async () => {
        if (viewerCatalogAudio) {
          if (viewerCatalogAudio.paused) void viewerCatalogAudio.play().catch(() => showToast("Toque novamente para ouvir"));
          else viewerCatalogAudio.pause();
          return;
        }
        try {
          const catalog = await import("./story-music-catalog.js?v=story-music-official-widget-20261028");
          const url = await catalog.resolveAppleStoryPreview(current.catalogMusic);
          if (!url || viewerRecord()?.id !== current.id) return;
          const audio = new Audio(url);
          viewerCatalogAudio = audio; audio.preload = "auto";
          void audio.play().catch(() => showToast("Toque novamente para ouvir"));
        } catch (e) { console.warn("[Why Now] Apple preview unavailable", e); }
      };
    }
    const avatar = document.querySelector("#view-avatar");
    if (current.avatarUrl && /^https:\/\//i.test(current.avatarUrl)) {
      avatar.replaceChildren();
      const picture = document.createElement("img"); picture.className = "ava-img"; picture.alt = ""; picture.src = current.avatarUrl;
      avatar.append(picture);
    }
    document.querySelector("#view-name").textContent = current.owner ? "Você" : current.name;
    if (current.owner) {
      document.querySelector("#own-viewers").onclick = () => void request("views", { storyId: current.id }).catch(messageError);
      document.querySelector("#own-remove").onclick = removeOwnMoment;
      document.querySelector("#own-share").onclick = shareMoment;
    } else {
      const reply = document.querySelector("#reply-input");
      reply.maxLength = 2000;
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
  shareMoment = async function () {
    const item = viewerRecord();
    if (!item?.remoteUrl) return;
    const url = new URL("home.html", location.href);
    url.search = ""; url.searchParams.set("storyId", item.id);
    try {
      if (navigator.share) await navigator.share({ title: "Why Now", url: url.href });
      else { await navigator.clipboard.writeText(url.href); showToast("Link copiado"); }
    } catch (e) { if (e.name !== "AbortError") messageError(e); }
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
  showOwnViewers = function () {
    const it = viewerRecord();
    if (it?.remoteUrl && it.owner) void request("views", { storyId: it.id }).catch(messageError);
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
      renderHome();
      if (screen === "viewer" && viewerRecord()?.remoteUrl) {
        const active = storyForId(viewerRecord().id);
        if (!active) closeViewer();
      }
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
    if (data.type === "views") {
      const people = Array.isArray(data.people) ? data.people : [];
      sheetOpen('<h2 class="sheet-title">Visualizações · ' + people.length + '</h2><div class="view-list">' +
        (people.length ? people.map(p => '<div class="person">' + escapeHtml(p.name) + '</div>').join("") : '<p>Ninguém visualizou ainda.</p>') + '</div>');
      pauseViewer(true);
    }
  });
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
    "#sheet .studio-music-preview audio{display:none}"
  ].join("\n");
  document.head.append(style);
  renderHome();
  send("ready", {});
})();
