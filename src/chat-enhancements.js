import { icon } from "./icons.js";
import { matchesConversationFilter } from "./chat-filter-logic.js";
import { setupChatTtt } from "./chat-ttt.js";
const PREFIX = "looply-chat-v2";
const COLORS = [
  { name: "Padrão", value: "" },
  { name: "Azul suave", value: "#edf5ff" },
  { name: "Azul noite", value: "#e5edfb" },
  { name: "Verde menta", value: "#edf9f3" },
  { name: "Rosa claro", value: "#fff0f5" },
  { name: "Areia", value: "#faf4e8" },
  { name: "Escuro", value: "#202938" }
];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const key = (userId, name) => `${PREFIX}:${userId}:${name}`;
const read = (storageKey, fallback) => { try { const value = localStorage.getItem(storageKey); return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const write = (storageKey, value) => { try { localStorage.setItem(storageKey, JSON.stringify(value)); return true; } catch { return false; } };

export function setupChatEnhancements(root, client, userId) {
  if (!root || root.dataset.chatEnhancements === "true") return;
  root.dataset.chatEnhancements = "true";
  let settingsScope = "*";
  const favoritesKey = key(userId, "favorites");
  const nicknameKey = key(userId, "nicknames");
  const wallpaperKey = key(userId, "wallpapers");
  const favorites = new Set(read(favoritesKey, []));
  const nicknames = read(nicknameKey, {});
  const wallpapers = read(wallpaperKey, {});
  const selectedConversation = () => root.querySelector("[data-chat-send]")?.dataset.conversationId || root.querySelector(".chat-thread-heading")?.dataset.conversationId || "";
  const isGroup = () => root.querySelector(".chat-thread-heading")?.dataset.chatKind === "group";
  const toast = (message) => {
    let node = root.querySelector("[data-chat-enhancement-toast]");
    if (!node) { node = document.createElement("div"); node.className = "chat-v2-toast"; node.dataset.chatEnhancementToast = ""; node.setAttribute("role", "status"); root.append(node); }
    node.textContent = message;
    node.hidden = false;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => { node.hidden = true; }, 2800);
  };
  const modal = () => {
    let node = root.querySelector("[data-chat-v2-modal]");
    if (!node) { node = document.createElement("div"); node.className = "chat-v2-modal-backdrop"; node.dataset.chatV2Modal = ""; node.hidden = true; node.innerHTML = '<section class="chat-v2-modal" role="dialog" aria-modal="true" aria-labelledby="chatV2ModalTitle"><button type="button" class="chat-v2-modal-close" data-v2-close aria-label="Fechar">' + icon("close") + '</button><div data-v2-modal-content></div></section>'; root.append(node); }
    return node;
  };
  const openModal = (content) => { const node = modal(); node.querySelector("[data-v2-modal-content]").innerHTML = content; node.hidden = false; node.querySelector("[data-v2-close]").focus(); };
  const closeModal = () => { const node = root.querySelector("[data-chat-v2-modal]"); if (node) node.hidden = true; };
  const game = setupChatTtt({root,client,userId,selectedConversation,isGroup,openModal,closeModal,toast});
  const applyWallpaper = () => {
    const id = selectedConversation();
    const thread = root.querySelector("[data-chat-thread]");
    if (!thread) return;
    const value = wallpapers[id] || wallpapers["*"] || "";
    thread.style.backgroundColor = value.startsWith("url(") ? "" : (value || "");
    thread.style.backgroundImage = value.startsWith("url(") ? value : "none";
    thread.style.backgroundSize = value.startsWith("url(") ? "cover" : "";
    thread.classList.toggle("is-chat-v2-dark", value === "#202938");
  };
  const renderTools = () => {
    const topHeading = root.querySelector(".chat-heading");
    if (topHeading && !topHeading.querySelector("[data-v2-home]")) {
      const home = document.createElement("a");
      home.href = "home.html";
      home.className = "chat-v2-icon-button chat-v2-home-button";
      home.dataset.v2Home = "";
      home.setAttribute("aria-label", "Ir para a página inicial");
      home.title = "Página inicial";
      home.innerHTML = icon("home");
      topHeading.prepend(home);
    }
    if (topHeading && !topHeading.querySelector("[data-v2-settings]")) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "chat-v2-icon-button chat-v2-menu-button"; button.dataset.v2Settings = ""; button.setAttribute("aria-label", "Configurações das conversas"); button.title = "Configurações"; button.innerHTML = icon("menu");
      topHeading.prepend(button);
    }
    const filters = root.querySelector(".chat-filter-tabs");
    filters?.querySelectorAll('[data-chat-filter]:not([data-chat-filter="all"])').forEach(button => button.remove());
    const heading = root.querySelector(".chat-thread-heading");
    if (heading && !heading.querySelector("[data-v2-thread-settings]")) {
      heading.insertAdjacentHTML("beforeend", '<button type="button" class="chat-v2-icon-button" data-v2-thread-settings aria-label="Configurações da conversa">' + icon("more") + '</button>');
      if (!isGroup() && !heading.querySelector("[data-v2-game]")) heading.insertAdjacentHTML("beforeend", '<button type="button" class="chat-v2-icon-button" data-v2-game aria-label="Jogar jogo da velha" title="Jogar jogo da velha">' + icon("grid") + '</button>');
      heading.dataset.conversationId = selectedConversation();
    }
    root.querySelectorAll("[data-chat-open]").forEach((item) => {
      const id = item.dataset.chatOpen;
      const label = item.querySelector(".chat-conversation-copy strong");
      if (label && !label.dataset.originalName) label.dataset.originalName = label.textContent;
      if (label && nicknames[id] && label.textContent !== nicknames[id]) label.textContent = nicknames[id];
      const star = item.querySelector("[data-v2-favorite]");
      if (!star) {
        const button = document.createElement("button");
        button.type = "button"; button.className = "chat-v2-favorite"; button.dataset.v2Favorite = id; button.setAttribute("aria-label", favorites.has(id) ? "Remover conversa dos favoritos" : "Favoritar conversa");
        button.innerHTML = icon(favorites.has(id) ? "starFilled" : "star");
        button.setAttribute("aria-pressed", String(favorites.has(id)));
        item.append(button);
      }
    });
    if (topHeading) {
      const home = topHeading.querySelector("[data-v2-home]");
      if (home && topHeading.firstElementChild !== home) topHeading.prepend(home);
    }
    applyWallpaper();
  };
  const renderSettings = (conversationOnly = false) => {
    settingsScope = conversationOnly ? selectedConversation() : "*";
    const id = settingsScope;
    const colors = COLORS.map((color) => `<button type="button" class="chat-v2-swatch ${(wallpapers[id] || "") === color.value ? "is-selected" : ""}" data-v2-color="${esc(color.value)}"><span style="background:${color.value || "var(--surface)"}"></span>${esc(color.name)}</button>`).join("");
    openModal(`<span class="chat-v2-kicker">Personalização</span><h2 id="chatV2ModalTitle">${conversationOnly ? "Esta conversa" : "Suas conversas"}</h2><div class="chat-v2-setting-group"><strong>Papel de parede</strong><div class="chat-v2-swatches">${colors}</div><label class="chat-v2-upload">Usar uma imagem<input type="file" accept="image/png,image/jpeg,image/webp" data-v2-wallpaper-file></label></div>${conversationOnly && !isGroup() ? '<div class="chat-v2-setting-group"><label for="chatV2Nickname">Apelido do contato</label><input id="chatV2Nickname" maxlength="60" value="' + esc(nicknames[id] || "") + '" placeholder="Nome que só você verá"><button type="button" class="chat-v2-button is-primary" data-v2-save-nickname>Salvar apelido</button></div>' : ""}<p class="chat-v2-help">O apelido é privado da sua conta e sincronizado pelo Neon. O papel de parede permanece neste dispositivo.</p>`);
  };
  const updateNickname = (id, name) => {
    const link = [...root.querySelectorAll("[data-chat-open]")].find((item) => item.dataset.chatOpen === id);
    const label = link?.querySelector(".chat-conversation-copy strong");
    if (label) { const text = name || label.dataset.originalName || label.textContent; if (label.textContent !== text) label.textContent = text; }
    const heading = root.querySelector(".chat-thread-heading strong");
    if (heading && id === selectedConversation()) { if (!heading.dataset.v2OriginalName) heading.dataset.v2OriginalName = heading.textContent; const text = name || heading.dataset.v2OriginalName; if (heading.textContent !== text) heading.textContent = text; }
  };
  const applyFilters = () => {
    const activeFilter = "all";
    const search = (root.querySelector("[data-chat-conversation-search]")?.value || "").toLocaleLowerCase("pt-BR").trim();
    const items = root.querySelectorAll("[data-chat-conversations] [data-chat-open]");
    let visible = 0;
    items.forEach((item) => {
      const id = item.dataset.chatOpen;
      const matches = matchesConversationFilter({
        id,
        kind: item.dataset.chatKind,
        unreadCount: item.dataset.chatUnreadCount
      }, activeFilter, favorites) && (!search || item.textContent.toLocaleLowerCase("pt-BR").includes(search));
      item.hidden = !matches;
      if (matches) visible += 1;
    });
    const noMatches = root.querySelector("[data-chat-no-matches]");
    if (noMatches) {
      const emptyMessage = activeFilter === "favorites"
        ? "Nenhuma conversa favorita. Toque na estrela de uma conversa para favoritar."
        : activeFilter === "groups"
          ? "Nenhum grupo encontrado."
          : activeFilter === "unread"
            ? "Nenhuma mensagem não lida."
            : "Nenhuma conversa corresponde ao filtro.";
      if (noMatches.textContent !== emptyMessage) noMatches.textContent = emptyMessage;
      noMatches.hidden = !items.length || visible > 0;
    }
  };
  root.addEventListener("click", (event) => {
    const favorite = event.target.closest("[data-v2-favorite]");
    if (!favorite) return;
    event.preventDefault();
    event.stopPropagation();
    const id = favorite.dataset.v2Favorite;
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    write(favoritesKey, [...favorites]);
    favorite.innerHTML = icon(favorites.has(id) ? "starFilled" : "star");
    favorite.setAttribute("aria-pressed", String(favorites.has(id)));
    favorite.setAttribute("aria-label", favorites.has(id) ? "Remover conversa dos favoritos" : "Favoritar conversa");
    applyFilters();
  }, true);
  root.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (await game.handleClick(target)) return;
    if (target.matches("[data-v2-close]")) { closeModal(); return; }
    if (target.matches("[data-v2-settings]")) { renderSettings(false); return; }
    if (target.matches("[data-v2-thread-settings]")) { renderSettings(true); return; }
    if (target.matches("[data-v2-save-nickname]")) {
      const id = selectedConversation(); const name = (root.querySelector("#chatV2Nickname")?.value || "").trim();
      if (!/^[a-f0-9-]{36}$/i.test(id) || !client || !userId) { toast("Abra uma conversa válida e entre na sua conta."); return; }
      const previous = nicknames[id] || "";
      target.disabled = true;
      // Optimistic UI never masquerades as a successful database write.
      if (name) nicknames[id] = name; else delete nicknames[id];
      updateNickname(id, name);
      try {
        const result = name
          ? await client.from("conversation_nicknames").upsert(
            { user_id: userId, conversation_id: id, nickname: name, updated_at: new Date().toISOString() },
            { onConflict: "user_id,conversation_id" })
          : await client.from("conversation_nicknames").delete().eq("user_id", userId).eq("conversation_id", id);
        if (result?.error) throw result.error;
        write(nicknameKey, nicknames);
        closeModal();
        toast(name ? "Apelido salvo na sua conta." : "Apelido removido da sua conta.");
      } catch (error) {
        if (previous) nicknames[id] = previous; else delete nicknames[id];
        updateNickname(id, previous);
        console.warn("Looply nickname save failed", error?.message || "unavailable");
        toast("Não foi possível salvar o apelido no banco. Tente novamente.");
      } finally { target.disabled = false; }
      return;
    }
    if (target.matches("[data-v2-color]")) {
      const id = settingsScope; const color = target.dataset.v2Color || "";
      if (color) wallpapers[id] = color; else delete wallpapers[id];
      write(wallpaperKey, wallpapers); applyWallpaper(); renderSettings(settingsScope !== "*"); return;
    }
  });
  root.addEventListener("change", async (event) => {
    const fileInput = event.target.closest("[data-v2-wallpaper-file]");
    if (!fileInput?.files?.[0]) return;
    const file = fileInput.files[0];
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 1_500_000) { toast("Escolha PNG, JPG ou WebP de até 1,5 MB."); fileInput.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const id = settingsScope;
      wallpapers[id] = `url("${String(reader.result).replace(/["\\\\]/g, "")}")`;
      if (!write(wallpaperKey, wallpapers)) { toast("Armazenamento local cheio; tente uma imagem menor."); return; }
      applyWallpaper();
      closeModal(); toast("Papel de parede atualizado.");
    };
    reader.readAsDataURL(file);
  });
  root.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-chat-filter]");
    if (!filter) return;
    if (filter.dataset.chatFilter === "all") {
      root.querySelectorAll("[data-chat-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button === filter)));
      queueMicrotask(applyFilters);
    }
  });
  root.addEventListener("looply:chat-rendered", () => { renderTools(); applyFilters(); void game.onConversation(); });
  root.addEventListener("looply:conversation-activated", () => { void game.onConversation(); });
  root.addEventListener("focusout", (event) => {
    if (event.target.matches(".chat-message-form textarea")) {
      root.dispatchEvent(new CustomEvent("looply:chat-draft-blur"));
    }
  });
  root.addEventListener("looply:open-conversation", () => { setTimeout(async () => { await game.onConversation(); renderTools(); }, 0); });
  const observer = new MutationObserver(() => { renderTools(); applyFilters(); });
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("pagehide", () => { observer.disconnect(); game.dispose(); }, { once: true });
  renderTools();
  applyFilters();
  void game.onConversation();
  // Reconcile previously local nicknames with the authenticated, RLS-protected
  // Neon table so a nickname remains available across the user's devices.
  void (async () => {
    if (!client || !userId) return;
    try {
      const result = await client.from("conversation_nicknames")
        .select("conversation_id,nickname").eq("user_id", userId).limit(200);
      if (result?.error) throw result.error;
      const stored = Array.isArray(result?.data) ? result.data : [];
      const fromServer = new Map(stored.map(row => [row.conversation_id, row.nickname]));
      for (const [id, name] of Object.entries(nicknames)) {
        if (!/^[a-f0-9-]{36}$/i.test(id) || !name || fromServer.has(id)) continue;
        const migrated = await client.from("conversation_nicknames").upsert(
          { user_id: userId, conversation_id: id, nickname: name },
          { onConflict: "user_id,conversation_id" });
        if (!migrated?.error) fromServer.set(id, name);
      }
      for (const id of Object.keys(nicknames)) delete nicknames[id];
      for (const [id, name] of fromServer) nicknames[id] = name;
      write(nicknameKey, nicknames);
      for (const [id, name] of fromServer) updateNickname(id, name);
      renderTools();
    } catch (error) {
      console.warn("Looply private nicknames unavailable", error?.message || "unavailable");
    }
  })();
}
