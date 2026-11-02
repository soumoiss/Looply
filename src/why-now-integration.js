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
  return { caption: match ? plain.slice(match[0].length) : plain, reason: match?.[1] || "" };
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
        seen: Boolean(story.seen), caption: text.caption, reason: text.reason
      };
    }).filter(story => story.url)
  };
}
function bridgeCss() {
  const style = document.createElement("style");
  style.dataset.whyNowStyle = "";
  style.textContent = [
    "#stories.why-now-live {position:relative!important;overflow:visible!important;padding-top:0!important}",
    "#stories.why-now-live > :not(.why-now-mount) {display:none!important}",
    ".why-now-mount{width:100%;position:relative;min-height:141px;isolation:isolate}",
    ".why-now-mount iframe{display:block;width:100%;height:141px;border:0;background:transparent;max-width:none}",
    ".why-now-mount.why-now-expanded{position:fixed!important;inset:0!important;z-index:2147483000!important;min-height:100dvh!important;background:#08080b!important}",
    ".why-now-mount.why-now-expanded iframe{height:100dvh!important;width:100vw!important}",
    "body.why-now-screen-open{overflow:hidden!important}"
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
  mount.setAttribute("aria-label", "Why Now — instantes");
  const frame = document.createElement("iframe");
  frame.title = "Why Now — câmera, edição e visualização";
  frame.src = "why-now.html?embedded=1";
  frame.allow = "camera; microphone; autoplay";
  frame.referrerPolicy = "same-origin";
  frame.loading = "eager";
  mount.append(frame);
  host.append(mount);
  host.classList.add("why-now-live");
  const styleParent = document.body;
  let destroyed = false, loadId = 0, reloadTimer = 0, records = initialStories;
  let expanded = false, requestedStoryId = new URL(location.href).searchParams.get("storyId");
  // Old deep links must now open the Why Now viewer, not Looply's retired dialog.
  if (requestedStoryId && validStoryId(requestedStoryId)) {
    const url = new URL(location.href);
    url.searchParams.delete("storyId");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  } else requestedStoryId = null;

  function screen(mode) {
    expanded = ["camera","editor","viewer"].includes(mode);
    mount.classList.toggle("why-now-expanded", expanded);
    styleParent.classList.toggle("why-now-screen-open", expanded);
  }
  function send(type, payload) {
    if (destroyed || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ channel: CHANNEL, type, ...payload }, location.origin);
  }
  function state() {
    return { me: {
      id: user.id, name: String(profile?.display_name || profile?.username || "Você"),
      avatarUrl: profile?.avatarUrl || ""
    }, groups: groupActiveStories(records).map(group => toGroup(group, user.id)) };
  }
  function sync() {
    send("data", state());
    if (requestedStoryId) {
      const found = records.some(story => story.id === requestedStoryId);
      if (found) { send("open-story", { storyId: requestedStoryId }); requestedStoryId = null; }
    }
  }
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
    if (message.type === "ready") { sync(); void refresh(); return; }
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
    style.remove(); mount.remove(); host.classList.remove("why-now-live");
  };
  window.addEventListener("pagehide", unload, {once:true});
  return unload;
}
