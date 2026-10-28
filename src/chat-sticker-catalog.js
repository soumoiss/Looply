// Persistent, paginated sticker catalog. Only first-party reviewed assets can
// enter this collection. External imports are intentionally not scraped here.
const PAGE_SIZE = 36;
const safeAsset = value => /^assets\/stickers\/[a-z0-9_-]{3,80}\.svg$/.test(String(value || ""));
const states = new WeakMap();
const esc = text => String(text ?? "").replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export function stickerCatalogMarkup() {
  return `<div class="chat-catalog" data-chat-catalog>
    <div class="chat-catalog-tabs" role="group" aria-label="Coleção de figurinhas">
      <button type="button" data-chat-catalog-tab="all" aria-pressed="true">Todas</button>
      <button type="button" data-chat-catalog-tab="favorites" aria-pressed="false">Favoritas</button>
    </div>
    <label class="visually-hidden" for="chatStickerCatalogSearch">Buscar figurinha</label>
    <input id="chatStickerCatalogSearch" type="search" maxlength="60" placeholder="Buscar figurinha" data-chat-catalog-search>
    <div class="chat-catalog-grid" data-chat-catalog-grid aria-label="Escolher figurinha"></div>
    <button type="button" class="text-button" data-chat-catalog-more hidden>Carregar mais</button>
    <p class="chat-catalog-status" data-chat-catalog-status role="status" aria-live="polite"></p>
  </div>`;
}
const setStatus = (picker, text) => {
  const field = picker.querySelector("[data-chat-catalog-status]");
  if (field) field.textContent = text;
};
const stateFor = picker => {
  let state = states.get(picker);
  if (!state) {
    state = { tab:"all", offset:0, query:"", pending:false, request:0,
      favoriteIds:new Set(), rendered:new Map(), timer:null, sending:false };
    states.set(picker,state);
  }
  return state;
};
function renderItems(picker, rows, append) {
  const grid = picker.querySelector("[data-chat-catalog-grid]");
  const state = stateFor(picker);
  if (!append) grid.replaceChildren();
  for (const entry of rows) {
    if (!entry || !safeAsset(entry.asset_path)) continue;
    state.rendered.set(entry.id, entry);
    const item = document.createElement("div");
    item.className = "chat-catalog-item";
    const send = document.createElement("button");
    send.type = "button";
    send.dataset.chatStickerItem = entry.id;
    send.setAttribute("aria-label", "Enviar figurinha: " + entry.title);
    const picture = document.createElement("img");
    picture.src = new URL(entry.asset_path, document.baseURI).href;
    picture.alt = entry.title;
    picture.loading = "lazy";
    picture.decoding = "async";
    send.append(picture);
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "chat-catalog-favorite";
    favorite.dataset.chatStickerFavorite = entry.id;
    favorite.setAttribute("aria-pressed", String(state.favoriteIds.has(entry.id)));
    favorite.setAttribute("aria-label", state.favoriteIds.has(entry.id) ? "Desfavoritar " + entry.title : "Favoritar " + entry.title);
    favorite.textContent = state.favoriteIds.has(entry.id) ? "★" : "☆";
    item.append(send,favorite);
    grid.append(item);
  }
  if (!grid.children.length) setStatus(picker, state.tab === "favorites"
    ? "Nenhuma figurinha favorita." : "Nenhuma figurinha encontrada.");
}
async function fetchFavoriteIds(client, userId) {
  const ids = new Set();
  for (let offset = 0; offset < 10000; offset += 500) {
    const {data,error} = await client.from("sticker_favorites").select("sticker_id")
      .eq("user_id",userId).order("created_at",{ascending:false}).range(offset,offset+499);
    if (error) throw error;
    for (const row of data || []) ids.add(row.sticker_id);
    if ((data || []).length < 500) break;
  }
  return ids;
}
async function loadPage(picker, client, userId, reset = false) {
  const state = stateFor(picker);
  if (state.pending) { state.request++; return; }
  state.pending = true;
  const sequence = ++state.request;
  const offset = reset ? 0 : state.offset;
  const more = picker.querySelector("[data-chat-catalog-more]");
  more.hidden = true;
  setStatus(picker,"Carregando figurinhas…");
  try {
    let rows = [];
    let fetchedCount = 0;
    if (state.tab === "favorites") {
      // Favorites are paginated at the database, not in the browser.
      const {data,error} = await client.from("sticker_favorites").select("sticker_id")
        .eq("user_id",userId).order("created_at",{ascending:false}).range(offset,offset+PAGE_SIZE-1);
      if (error) throw error;
      const ids = (data || []).map(row => row.sticker_id);
      fetchedCount = ids.length;
      if (ids.length) {
        const catalog = await client.from("sticker_catalog")
          .select("id,slug,title,asset_path").in("id",ids).limit(PAGE_SIZE);
        if (catalog.error) throw catalog.error;
        const indexed = new Map((catalog.data || []).map(row=>[row.id,row]));
        rows = ids.map(id=>indexed.get(id)).filter(Boolean);
      }
    } else {
      let query = client.from("sticker_catalog").select("id,slug,title,asset_path").order("slug");
      if (state.query) query = query.ilike("title","%"+state.query+"%");
      const result = await query.range(offset,offset+PAGE_SIZE-1);
      if (result.error) throw result.error;
      rows = result.data || [];
      fetchedCount = rows.length;
    }
    if (sequence !== state.request || !picker.isConnected) return;
    if (reset) state.rendered.clear();
    renderItems(picker, rows, !reset);
    state.offset = offset + fetchedCount;
    more.hidden = fetchedCount < PAGE_SIZE;
    if (rows.length) setStatus(picker, "Toque na imagem para enviar ou na estrela para favoritar.");
  } catch (error) {
    console.warn("Looply sticker catalog unavailable.", error);
    setStatus(picker,"Não foi possível carregar o catálogo. Tente novamente.");
  } finally { state.pending = false; }
}
export function bindStickerCatalog(root, client, getUserId) {
  root.addEventListener("click", async event => {
    const open = event.target.closest("[data-chat-choose-sticker]");
    if (open) {
      const picker = open.closest("[data-chat-send]")?.querySelector("[data-chat-sticker-picker]");
      const userId = getUserId?.();
      if (!picker || !userId) return;
      const state = stateFor(picker);
      try {
        state.favoriteIds = await fetchFavoriteIds(client,userId);
        if (picker.isConnected) void loadPage(picker,client,userId,true);
      } catch (error) {
        setStatus(picker,"Não foi possível carregar as favoritas.");
        void loadPage(picker,client,userId,true);
      }
      return;
    }
    const picker = event.target.closest("[data-chat-sticker-picker]");
    if (!picker) return;
    const state = stateFor(picker);
    const userId = getUserId?.();
    if (!userId) return;
    const tab = event.target.closest("[data-chat-catalog-tab]");
    if (tab) {
      if (state.tab === tab.dataset.chatCatalogTab) return;
      state.tab = tab.dataset.chatCatalogTab;
      picker.querySelectorAll("[data-chat-catalog-tab]").forEach(b =>
        b.setAttribute("aria-pressed",String(b === tab)));
      state.offset = 0;
      void loadPage(picker,client,userId,true);
      return;
    }
    if (event.target.closest("[data-chat-catalog-more]")) {
      void loadPage(picker,client,userId,false);
      return;
    }
    const favorite = event.target.closest("[data-chat-sticker-favorite]");
    if (favorite) {
      event.preventDefault();
      event.stopPropagation();
      if (favorite.disabled) return;
      const id = favorite.dataset.chatStickerFavorite;
      const wasFavorite = state.favoriteIds.has(id);
      favorite.disabled = true;
      try {
        const result = wasFavorite
          ? await client.from("sticker_favorites").delete().eq("user_id",userId).eq("sticker_id",id).select("sticker_id").maybeSingle()
          : await client.from("sticker_favorites").insert({user_id:userId,sticker_id:id}).select("sticker_id").maybeSingle();
        if (result.error || result.data?.sticker_id !== id) throw result.error || Error("favorite_not_confirmed");
        if (wasFavorite) state.favoriteIds.delete(id); else state.favoriteIds.add(id);
        favorite.setAttribute("aria-pressed",String(!wasFavorite));
        favorite.textContent = wasFavorite ? "☆" : "★";
        favorite.setAttribute("aria-label",wasFavorite ? "Favoritar figurinha" : "Desfavoritar figurinha");
        if (state.tab === "favorites" && wasFavorite) void loadPage(picker,client,userId,true);
      } catch {
        setStatus(picker,"Não foi possível alterar esta favorita.");
      } finally { favorite.disabled=false; }
      return;
    }
    const send = event.target.closest("[data-chat-sticker-item]");
    if (!send || state.sending) return;
    const sticker = state.rendered.get(send.dataset.chatStickerItem);
    const form = picker.closest("[data-chat-send]");
    const conversationId = form?.dataset.conversationId;
    if (!sticker || !safeAsset(sticker.asset_path) || !conversationId ||
      root.querySelector("[data-chat-send]") !== form) return;
    state.sending = true;
    send.disabled = true;
    let newMessageId = null;
    try {
      const {data:message,error} = await client.from("chat_messages")
        .insert({conversation_id:conversationId,sender_id:userId,body:"Figurinha"})
        .select("id").single();
      if (error || !message?.id) throw error || Error("message_not_confirmed");
      newMessageId = message.id;
      const saved = await client.from("chat_sticker_messages").insert({
        message_id:message.id,conversation_id:conversationId,
        sticker_id:sticker.id,sender_id:userId
      }).select("message_id").maybeSingle();
      if (saved.error || saved.data?.message_id !== message.id)
        throw saved.error || Error("sticker_not_confirmed");
      picker.close();
      root.dispatchEvent(new CustomEvent("looply:chat-message-saved",{detail:{conversationId}}));
      root.dispatchEvent(new CustomEvent("looply:open-conversation",{detail:{conversationId}}));
    } catch (error) {
      // Remove incomplete placeholder. A failed cleanup is logged, not
      // misrepresented as a successfully delivered sticker.
      if (newMessageId) {
        const removed = await client.from("chat_messages").delete()
          .eq("id",newMessageId).eq("conversation_id",conversationId);
        if (removed.error) console.error("Sticker placeholder cleanup failed", removed.error);
      }
      console.warn("Looply sticker send failed.",error);
      setStatus(picker,"A figurinha não foi enviada. Tente novamente.");
    } finally { state.sending = false; send.disabled = false; }
  });
  root.addEventListener("input", event => {
    const input = event.target.closest("[data-chat-catalog-search]");
    if (!input) return;
    const picker = input.closest("[data-chat-sticker-picker]");
    const state = stateFor(picker);
    clearTimeout(state.timer);
    state.query = input.value.trim().slice(0,60);
    if (state.tab !== "all") return;
    state.timer = setTimeout(() => { state.offset=0;void loadPage(picker,client,getUserId?.(),true); },220);
  });
}
