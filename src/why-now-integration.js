/* A scoped bridge: replace only Looply's Stories surface with Why Now.
   Existing Neon Auth, Neon Storage, R2, story permissions and 24h expiry remain authoritative. */
import { loadStories, groupActiveStories } from "./stories.js?v=visible-repost-seen-20261031";
import { normalizePublicationMedia, uploadResumable } from "./social.js?v=smart-storage-20261031";
import { encodeStorySong, decodeStorySong } from "./story-music-catalog.js?v=story-music-official-widget-20261028";
import { decodeStoryBody } from "./story-text-style.js";

const CHANNEL = "looply-why-now-v1";
const EXT = Object.freeze({
  "image/jpeg":"jpg","image/png":"png","image/webp":"webp",
  "video/mp4":"mp4","video/webm":"webm"
});
const validStoryId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ""));

function storyText(story) {
  const song = decodeStorySong(story.body || "");
  const plain = decodeStoryBody(song.text || "").text || "";
  const match = plain.match(/^✳\s*([^\n]{1,100})\n?/);
  return { caption: match ? plain.slice(match[0].length) : plain, reason: match?.[1] || "", music: song.song || null };
}
function toGroup(storyGroup, userId) {
  const author = storyGroup.author || {};
  return {
    authorId: storyGroup.author_id,
    name: String(author.display_name || author.username || (storyGroup.author_id === userId ? "Você" : "Usuário")).slice(0,60),
    avatarUrl: author.avatarUrl || "",
    stories: storyGroup.stories.map(story => {
      const media = (Array.isArray(story.media) ? story.media : []).find(m => m.signedUrl);
      const text = storyText(story);
      return {
        id: story.id, url: media?.signedUrl || "",
        type: media?.kind === "video" ? "video" : "image",
        created: Date.parse(story.created_at) || Date.now(),
        seen: Boolean(story.seen), caption: text.caption, reason: text.reason, music: text.music
      };
    }).filter(story => story.url)
  };
}
function bridgeCss() {
  const style = document.createElement("style");
  style.dataset.whyNowStyle = "";
  style.textContent = [
    "#stories.why-now-live{display:block!important;padding:14px 15px 16px!important;overflow:visible!important;background:var(--surface-strong,var(--surface,#fff))!important;color:var(--text,#23202a)!important;border-color:var(--line,#e7deed)!important}",
    "#stories.why-now-live > :not(.why-now-mount){display:none!important}",
    ".why-now-mount{width:100%;min-width:0;font-family:inherit;color:inherit}",
    ".why-now-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;flex-wrap:wrap}",
    ".why-now-identity{display:flex;align-items:center;gap:9px;min-width:0}",
    ".why-now-branddot{display:grid;place-items:center;width:31px;height:31px;border-radius:12px;color:#fff;background:var(--primary,#7952d5);font-size:20px}",
    ".why-now-headcopy{display:grid;gap:1px}",
    ".why-now-headcopy h2{font:800 17px/1.2 inherit!important;font-family:inherit!important;font-size:17px!important;margin:0!important;letter-spacing:-.4px;color:var(--text,#28202f)!important}",
    ".why-now-headcopy small{font-size:10px;color:var(--muted,#827d87);line-height:1.3}",
    ".why-now-create{border:0!important;display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:999px!important;background:var(--primary,#7952d5)!important;color:#fff!important;padding:10px 13px!important;min-height:42px;font-family:inherit!important;font-weight:800;font-size:12px;white-space:nowrap;box-shadow:none!important}",
    ".why-now-create svg{width:16px;height:16px;stroke:currentColor;stroke-width:2.4;fill:none}",
    ".why-now-people{display:flex;overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:none;gap:13px;padding:0 0 5px;max-width:100%;min-height:105px}",
    ".why-now-people::-webkit-scrollbar{display:none}",
    ".why-now-person{border:0;background:transparent;color:var(--text,#28202f);min-width:67px;max-width:70px;display:flex;flex-direction:column;align-items:center;gap:7px;padding:1px 0;font:700 11px/1.25 inherit;cursor:pointer;scroll-snap-align:start}",
    ".why-now-person:focus-visible,.why-now-create:focus-visible{outline:2px solid var(--primary,#7952d5);outline-offset:3px}",
    ".why-now-person-ring{position:relative;width:65px;height:65px;display:grid;place-items:center;flex-shrink:0;border-radius:50%;padding:3px;background:linear-gradient(135deg,#ff8e78,#ef628a 48%,var(--primary,#7952d5));}",
    ".why-now-person-ring.is-seen{background:var(--line,#d5cedb)}",
    ".why-now-person-ring.is-own{background:var(--primary,#7952d5)}",
    ".why-now-person-face{display:grid;place-items:center;height:100%;width:100%;overflow:hidden;border:3px solid var(--surface-strong,var(--surface,#fff));border-radius:50%;background:var(--lilac,#d6c6ff);color:var(--primary,#6843c3);font-weight:800;font-size:20px}",
    ".why-now-person-face img{display:block;width:100%;height:100%;object-fit:cover}",
    ".why-now-own-plus{position:absolute;right:-4px;bottom:-1px;background:var(--primary,#7952d5);color:#fff;border:2px solid var(--surface-strong,var(--surface,#fff));width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:18px;line-height:1}",
    ".why-now-person-label{display:block;max-width:70px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:center;color:var(--text,#28202f)}",
    ".why-now-overlay{display:none;position:fixed!important;inset:0!important;z-index:2147483640!important;background:#09080d!important;overflow:hidden}",
    ".why-now-overlay.why-now-expanded{display:block!important}",
    ".why-now-overlay iframe{display:block;width:100vw!important;height:100dvh!important;max-width:none!important;border:0!important;background:#09080d}",
    "body.why-now-screen-open{overflow:hidden!important}",
    "@media(max-width:390px){.why-now-header{gap:7px}.why-now-create{font-size:11px;padding:10px!important}.why-now-headcopy h2{font-size:16px!important}}"
  ].join("\n");
  document.head.append(style);
  return style;
}
export function mountWhyNowStories({ root, client, user, profile, initialStories = [] }) {
  const host = root.querySelector("#stories");
  if (!host || !client || !user?.id) return () => {};
  const style = bridgeCss();
  const mount = document.createElement("div");
  mount.className = "why-now-mount";
  mount.setAttribute("aria-label","Why Now — instantes do Looply");
  const header = document.createElement("header"); header.className = "why-now-header";
  const identity = document.createElement("div"); identity.className="why-now-identity";
  const symbol = document.createElement("span"); symbol.className = "why-now-branddot"; symbol.setAttribute("aria-hidden","true"); symbol.textContent="✳";
  const headCopy=document.createElement("div"); headCopy.className="why-now-headcopy";
  const heading=document.createElement("h2"); heading.textContent="Why Now";
  const subtitle=document.createElement("small"); subtitle.textContent="Instantes de agora";
  headCopy.append(heading,subtitle);identity.append(symbol,headCopy);
  const create=document.createElement("button");create.type="button";create.className="why-now-create";
  create.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Criar Why Now</span>';
  const people=document.createElement("div");people.className="why-now-people";
  people.setAttribute("aria-label","Why Now dos usuários");
  header.append(identity,create);mount.append(header,people);
  host.append(mount);host.classList.add("why-now-live");
  const overlay=document.createElement("div");overlay.className="why-now-overlay";
  const frame=document.createElement("iframe");
  frame.title="Why Now — câmera, edição e visualização";frame.src="why-now.html?embedded=1";
  frame.allow="camera; microphone; autoplay";
  frame.referrerPolicy="same-origin";frame.loading="eager";
  overlay.append(frame);document.body.append(overlay);
  const styleParent = document.body;
  let destroyed = false, loadId = 0, reloadTimer = 0, records = initialStories;
  let expanded = false, frameReady=false, pendingOpen=null;
  let requestedStoryId = new URL(location.href).searchParams.get("storyId");
  if (requestedStoryId && validStoryId(requestedStoryId)) {
    const url = new URL(location.href);url.searchParams.delete("storyId");
    history.replaceState(history.state,"",url.pathname + url.search + url.hash);
  } else requestedStoryId = null;
  function screen(mode) {
    expanded = ["camera","editor","viewer"].includes(mode);
    overlay.classList.toggle("why-now-expanded",expanded);
    styleParent.classList.toggle("why-now-screen-open",expanded);
  }
  function send(type,payload) {
    if (destroyed || !frame.contentWindow) return;
    frame.contentWindow.postMessage({channel:CHANNEL,type,...payload},location.origin);
  }
  function open(type,payload) {
    screen(type==="open-create"?"camera":"viewer");
    if (!frameReady) {pendingOpen={type,payload};return;}
    send(type,payload||{});
  }
  function renderSurface() {
    people.replaceChildren();
    const grouped=groupActiveStories(records);
    const own=grouped.find(g=>g.author_id===user.id);
    const all=[own||{author_id:user.id,author:profile||{},stories:[]},
      ...grouped.filter(g=>g.author_id!==user.id)];
    for(const group of all){
      const ownAccount=group.author_id===user.id;
      const recent=(group.stories||[]).filter(s=>Array.isArray(s.media)&&s.media.some(m=>m.signedUrl));
      const name=ownAccount?"Seu Why Now":String(group.author?.display_name||group.author?.username||"Usuário");
      const item=document.createElement("button");item.className="why-now-person";item.type="button";
      item.setAttribute("aria-label",name+(ownAccount?" — criar ou visualizar":" — visualizar"));
      const ring=document.createElement("span");ring.className="why-now-person-ring";
      if(ownAccount)ring.classList.add("is-own");
      else if(recent.length&&recent.every(s=>s.seen))ring.classList.add("is-seen");
      const face=document.createElement("span");face.className="why-now-person-face";
      const avatar=group.author?.avatarUrl||(ownAccount?profile?.avatarUrl:"");
      if(avatar&&/^https:\/\//i.test(avatar)){
        const img=document.createElement("img");img.src=avatar;img.alt="";
        img.referrerPolicy="no-referrer";img.onerror=()=>{img.remove();face.textContent=name[0]||"?";};
        face.append(img);
      }else face.textContent=(name[0]||"?").toUpperCase();
      ring.append(face);
      if(ownAccount){
        const plus=document.createElement("span");plus.className="why-now-own-plus";plus.textContent="+";
        plus.setAttribute("aria-hidden","true");ring.append(plus);
      }
      const label=document.createElement("span");label.className="why-now-person-label";label.textContent=name;
      item.append(ring,label);
      item.onclick=()=> {
        if(ownAccount&&!recent.length){open("open-create");return;}
        if(recent.length)open("open-story",{storyId:recent[0].id});
      };
      people.append(item);
    }
  }
  create.addEventListener("click",()=>open("open-create"));
  function state() {
    return {me:{id:user.id,name:String(profile?.display_name||profile?.username||"Você"),avatarUrl:profile?.avatarUrl||""},
      groups:groupActiveStories(records).map(group=>toGroup(group,user.id))};
  }
  function sync() {
    renderSurface();
    if(!frameReady)return;
    send("data",state());
    if(requestedStoryId&&records.some(story=>story.id===requestedStoryId)){
      open("open-story",{storyId:requestedStoryId});requestedStoryId=null;
    }
  }
  renderSurface();
  async function refresh() {
    const id = ++loadId;
    try {
      const latest = await loadStories(client, user.id);
      if (destroyed || id !== loadId) return false;
      records = latest; sync(); return true;
    } catch (error) {
      console.warn("[Why Now] Story refresh unavailable:", error);
      return false;
    }
  }
  function schedule() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => void refresh(), 350);
  }
  function getOwned(storyId) {
    const story = records.find(s => s.id === storyId);
    if (!story) throw Error("Publicação indisponível");
    return story;
  }
  async function publish(message) {
    const original = message.blob;
    if (!(original instanceof Blob) || !original.size || original.size > 100 * 1024 * 1024) throw Error("Arquivo inválido ou muito grande");
    const type = String(original.type || "").split(";")[0].toLowerCase();
    if (!EXT[type] || (message.kind === "video") !== type.startsWith("video/")) throw Error("Tipo de arquivo não permitido");
    const file = normalizePublicationMedia(new File([original], "why-now." + EXT[type], { type }));
    if (!file) throw Error("Não foi possível validar a mídia");
    const caption = String(message.caption || "").trim().slice(0,500);
    const reason = String(message.reason || "").trim().slice(0,100);
    const body = (reason ? "✳ " + reason + "\n" : "") + caption;
    const catalog = message.catalogTrack;
    const text = catalog?.kind === "catalog" && catalog.provider === "apple"
      ? encodeStorySong(body, { kind:"catalog", provider:"apple", title: catalog.title,
          artist: catalog.artist, id: catalog.id, trackId: catalog.trackId, previewUrl: catalog.previewUrl,
          url: catalog.url, artwork: catalog.artwork })
      : body;
    let createdId = null, storagePath = null;
    try {
      const created = await client.rpc("v5_create_story", {
        p_body: text, p_visibility: "public", p_recipient_ids: []
      });
      if (created.error || !validStoryId(created.data)) throw created.error || Error("Criação não confirmada");
      createdId = created.data;
      storagePath = "stories/" + createdId + "/" + crypto.randomUUID() + "." + EXT[file.type];
      await uploadResumable(client, storagePath, file);
      const attached = await client.rpc("v5_attach_story_media", {
        p_story_id: createdId, p_storage_path: storagePath,
        p_kind: type.startsWith("video/") ? "video" : "image",
        p_mime_type: file.type, p_byte_size: file.size
      });
      if (attached.error) throw attached.error;
      const checked = await client.from("story_media").select("id,kind,mime_type")
        .eq("story_id",createdId).eq("storage_path",storagePath).maybeSingle();
      if (checked.error || !checked.data?.id || checked.data.mime_type !== file.type) throw checked.error || Error("Publicação não confirmada");
      await refresh();
      return { storyId: createdId };
    } catch (error) {
      if (storagePath) {
        try { await client.storage.from("looply-media").remove([storagePath]); } catch (cleanup) { console.warn("Why Now rollback media", cleanup); }
      }
      if (createdId) {
        try { await client.from("stories").delete().eq("id", createdId).eq("author_id", user.id); } catch (cleanup) { console.warn("Why Now rollback record",cleanup); }
      }
      throw error;
    }
  }
  async function remove(storyId) {
    const story = getOwned(storyId);
    if (story.author_id !== user.id) throw Error("Operação não autorizada");
    const paths = (story.media || []).map(m => m.storage_path).filter(Boolean);
    if (paths.length) {
      const removed = await client.storage.from("looply-media").remove(paths);
      if (removed.error) throw removed.error;
    }
    const deleted = await client.from("stories").delete().eq("id", storyId).eq("author_id", user.id);
    if (deleted.error) throw deleted.error;
    await refresh();
    return {};
  }
  async function seen(storyId) {
    getOwned(storyId);
    const result = await client.rpc("record_story_view", { p_story_id: storyId });
    if (result.error || typeof result.data !== "boolean") throw result.error || Error("Visualização não confirmada");
    const current = records.find(story => story.id === storyId);
    if (current) current.seen = true;
    sync();
    return {};
  }
  async function reply(storyId, text) {
    const story = getOwned(storyId);
    if (story.author_id === user.id) throw Error("Não é possível responder ao próprio Why Now");
    const body = String(text || "").trim().slice(0,2000);
    if (!body) throw Error("Resposta vazia");
    const result = await client.rpc("send_story_reply", { p_story_id: storyId, p_body: body });
    if (result.error) throw result.error;
    return {};
  }
  async function like(storyId) {
    const story = getOwned(storyId);
    if (story.author_id === user.id) throw Error("Não é possível curtir seu próprio Why Now");
    const lookup = await client.from("story_likes").select("story_id").eq("story_id",storyId).eq("user_id",user.id).maybeSingle();
    if (lookup.error) throw lookup.error;
    const liked = !lookup.data;
    const mutation = liked
      ? await client.from("story_likes").insert({ story_id: storyId, user_id: user.id })
      : await client.from("story_likes").delete().eq("story_id",storyId).eq("user_id",user.id);
    if (mutation.error) throw mutation.error;
    return { liked };
  }
  async function views(storyId) {
    const story = getOwned(storyId);
    if (story.author_id !== user.id) throw Error("Lista restrita ao autor");
    const result = await client.from("story_views").select("viewer_id,viewed_at")
      .eq("story_id",storyId).order("viewed_at",{ascending:false}).limit(5000);
    if (result.error) throw result.error;
    const ids = [...new Set((result.data || []).map(v => v.viewer_id).filter(Boolean))];
    let profiles = [];
    for (let index=0; index<ids.length; index+=100) {
      const page = await client.from("profiles").select("id,username,display_name").in("id", ids.slice(index,index+100));
      if (page.error) throw page.error;
      profiles.push(...(page.data || []));
    }
    const names = new Map(profiles.map(p => [p.id, p.display_name || p.username]));
    send("views",{people:(result.data || []).map(v => ({name:String(names.get(v.viewer_id)||"Usuário")}))});
    return {};
  }
  const actions = { publish, delete: remove, seen, reply, like, views };
  async function onMessage(event) {
    if (destroyed || event.origin !== location.origin || event.source !== frame.contentWindow) return;
    const message = event.data;
    if (!message || message.channel !== CHANNEL) return;
    if (message.type === "ready") {
      frameReady=true;sync();
      if(pendingOpen){const next=pendingOpen;pendingOpen=null;send(next.type,next.payload||{});}
      void refresh();return;
    }
    if (message.type === "mode") { screen(message.mode); return; }
    if (!Object.prototype.hasOwnProperty.call(actions,message.type)) return;
    if (!Number.isSafeInteger(message.requestId) || message.requestId < 1) return;
    try {
      const result = await actions[message.type](message.storyId || message, message.text);
      send("ack",{requestId: message.requestId, result});
    } catch (error) {
      console.error("[Why Now] " + message.type + " failed", error);
      send("ack",{requestId: message.requestId,error:"A operação não foi confirmada pelo servidor."});
    }
  }
  window.addEventListener("message", onMessage);
  const visibilityHandler = () => { if (!document.hidden) schedule(); };
  document.addEventListener("visibilitychange", visibilityHandler);
  const channel = client.channel("looply-why-now-" + user.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"stories"},schedule)
    .on("postgres_changes",{event:"*",schema:"public",table:"story_media"},schedule)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"story_views"},schedule)
    .subscribe();
  const unload = () => {
    destroyed = true; clearTimeout(reloadTimer); screen("home");
    window.removeEventListener("message",onMessage);
    document.removeEventListener("visibilitychange",visibilityHandler);
    void client.removeChannel(channel);
    style.remove(); mount.remove();overlay.remove();host.classList.remove("why-now-live");
  };
  window.addEventListener("pagehide", unload, {once:true});
  return unload;
}
