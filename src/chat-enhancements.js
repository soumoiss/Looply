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
  let gameChannel = null;
  let gameConversation = "";
  let gameState = null;
  let gameInvite = null;
  let ownTurn = false;
  const favoritesKey = key(userId, "favorites");
  const nicknameKey = key(userId, "nicknames");
  const wallpaperKey = key(userId, "wallpapers");
  const favorites = new Set(read(favoritesKey, []));
  const nicknames = read(nicknameKey, {});
  const wallpapers = read(wallpaperKey, {});
  const selectedConversation = () => root.querySelector("[data-chat-send]")?.dataset.conversationId || root.querySelector(".chat-thread-heading")?.dataset.conversationId || "";
  const isGroup = () => root.querySelector(".chat-thread-heading")?.dataset.chatKind === "group";
  const closeChannel = async () => {
    if (gameChannel) { await client.removeChannel(gameChannel); gameChannel = null; }
    gameConversation = "";
    gameState = null;
  };
  const ensureChannel = async () => {
    const id = selectedConversation();
    if (!id || isGroup() || !client) { await closeChannel(); return null; }
    if (gameChannel && gameConversation === id) return gameChannel;
    await closeChannel();
    gameConversation = id;
    gameChannel = client.channel(`looply-game-${id}`, { config: { broadcast: { self: false } } });
    gameChannel.on("broadcast", { event: "ttt" }, ({ payload }) => {
      if (!payload || payload.conversationId !== gameConversation || payload.senderId === userId) return;
      if (payload.type === "invite") {
        gameInvite = { senderId: payload.senderId, senderName: payload.senderName || "Contato" };
        showInvite();
      } else if (payload.type === "decline") {
        toast("O convite para jogar foi recusado.");
        closeModal();
      } else if (payload.type === "state" && payload.state) {
        gameState = payload.state;
        ownTurn = payload.state.turn === userId;
        renderGame();
      } else if (payload.type === "close") closeModal();
    });
    await gameChannel.subscribe();
    return gameChannel;
  };
  const sendGame = async (type, payload = {}) => {
    const channel = await ensureChannel();
    if (!channel) { toast("Abra uma conversa individual para usar este recurso."); return false; }
    const result = await channel.send({ type: "broadcast", event: "ttt", payload: { type, conversationId: gameConversation, senderId: userId, ...payload } });
    return result === "ok" || result?.status === "ok";
  };
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
    if (!node) { node = document.createElement("div"); node.className = "chat-v2-modal-backdrop"; node.dataset.chatV2Modal = ""; node.hidden = true; node.innerHTML = '<section class="chat-v2-modal" role="dialog" aria-modal="true" aria-labelledby="chatV2ModalTitle"><button type="button" class="chat-v2-modal-close" data-v2-close aria-label="Fechar">×</button><div data-v2-modal-content></div></section>'; root.append(node); }
    return node;
  };
  const openModal = (content) => { const node = modal(); node.querySelector("[data-v2-modal-content]").innerHTML = content; node.hidden = false; node.querySelector("[data-v2-close]").focus(); };
  const closeModal = () => { const node = root.querySelector("[data-chat-v2-modal]"); if (node) node.hidden = true; gameInvite = null; };
  const showInvite = () => {
    if (!gameInvite) return;
    openModal(`<span class="chat-v2-kicker">Convite recebido</span><h2 id="chatV2ModalTitle">${esc(gameInvite.senderName)} quer jogar jogo da velha</h2><p>Uma partida rápida, sincronizada nesta conversa.</p><div class="chat-v2-actions"><button type="button" class="chat-v2-button" data-v2-decline>Agora não</button><button type="button" class="chat-v2-button is-primary" data-v2-accept>Aceitar convite</button></div>`);
  };
  const winner = (cells) => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a,b,c] of lines) if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
    return cells.every(Boolean) ? "draw" : null;
  };
  const renderGame = () => {
    if (!gameState) return;
    const result = winner(gameState.cells);
    const status = result === "draw" ? "Empate!" : result ? (result === "X" ? gameState.xName : gameState.oName) + " venceu!" : gameState.turn === userId ? "Sua vez" : "Aguardando a outra pessoa…";
    openModal(`<span class="chat-v2-kicker">Jogo da velha</span><h2 id="chatV2ModalTitle">Uma pausa para jogar</h2><p class="chat-v2-game-status">${esc(status)}</p><div class="chat-v2-board" role="group" aria-label="Tabuleiro do jogo da velha">${gameState.cells.map((cell, i) => `<button type="button" class="chat-v2-cell" data-v2-cell="${i}" aria-label="Casa ${i+1}${cell ? ": "+cell : ""}" ${cell || result || gameState.turn !== userId ? "disabled" : ""}>${esc(cell)}</button>`).join("")}</div><div class="chat-v2-actions"><button type="button" class="chat-v2-button" data-v2-close-game>Fechar partida</button>${result ? '<button type="button" class="chat-v2-button is-primary" data-v2-rematch>Jogar novamente</button>' : ""}</div>`);
  };
  const applyWallpaper = () => {
    const id = selectedConversation();
    const thread = root.querySelector("[data-chat-thread]");
    if (!thread) return;
    const value = wallpapers[id] || "";
    thread.style.backgroundColor = value || "";
    thread.classList.toggle("is-chat-v2-dark", value === "#202938");
  };
  const renderTools = () => {
    const sidebarHeading = root.querySelector(".chat-sidebar .chat-panel-heading");
    if (sidebarHeading && !sidebarHeading.querySelector("[data-v2-settings]")) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "chat-v2-icon-button"; button.dataset.v2Settings = ""; button.setAttribute("aria-label", "Configurações das conversas"); button.textContent = "⚙";
      sidebarHeading.append(button);
    }
    const filters = root.querySelector(".chat-filter-tabs");
    if (filters && !filters.querySelector('[data-chat-filter="groups"]')) {
      filters.insertAdjacentHTML("beforeend", '<button type="button" data-chat-filter="groups" aria-pressed="false">Grupos</button><button type="button" data-chat-filter="favorites" aria-pressed="false">Favoritas</button>');
    }
    const heading = root.querySelector(".chat-thread-heading");
    if (heading && !heading.querySelector("[data-v2-thread-settings]")) {
      heading.insertAdjacentHTML("beforeend", '<button type="button" class="chat-v2-icon-button" data-v2-thread-settings aria-label="Configurações da conversa">⋯</button>');
      if (!isGroup() && !heading.querySelector("[data-v2-game]")) heading.insertAdjacentHTML("beforeend", '<button type="button" class="chat-v2-icon-button" data-v2-game aria-label="Jogar jogo da velha" title="Jogar jogo da velha">▦</button>');
      heading.dataset.conversationId = selectedConversation();
    }
    root.querySelectorAll("[data-chat-open]").forEach((item) => {
      const id = item.dataset.chatOpen;
      const star = item.querySelector("[data-v2-favorite]");
      if (!star) {
        const button = document.createElement("button");
        button.type = "button"; button.className = "chat-v2-favorite"; button.dataset.v2Favorite = id; button.setAttribute("aria-label", "Favoritar conversa");
        button.textContent = favorites.has(id) ? "★" : "☆";
        button.setAttribute("aria-pressed", String(favorites.has(id)));
        item.append(button);
      }
    });
    applyWallpaper();
  };
  const renderSettings = (conversationOnly = false) => {
    const id = selectedConversation();
    const colors = COLORS.map((color) => `<button type="button" class="chat-v2-swatch ${(wallpapers[id] || "") === color.value ? "is-selected" : ""}" data-v2-color="${esc(color.value)}"><span style="background:${color.value || "var(--surface)"}"></span>${esc(color.name)}</button>`).join("");
    openModal(`<span class="chat-v2-kicker">Personalização</span><h2 id="chatV2ModalTitle">${conversationOnly ? "Esta conversa" : "Suas conversas"}</h2><div class="chat-v2-setting-group"><strong>Papel de parede</strong><div class="chat-v2-swatches">${colors}</div><label class="chat-v2-upload">Usar uma imagem<input type="file" accept="image/png,image/jpeg,image/webp" data-v2-wallpaper-file></label></div>${conversationOnly && !isGroup() ? '<div class="chat-v2-setting-group"><label for="chatV2Nickname">Apelido local do contato</label><input id="chatV2Nickname" maxlength="60" value="' + esc(nicknames[id] || "") + '" placeholder="Nome que só você verá"><button type="button" class="chat-v2-button is-primary" data-v2-save-nickname>Salvar apelido</button></div>' : ""}<p class="chat-v2-help">As preferências ficam neste dispositivo e não alteram o perfil da outra pessoa.</p>`);
  };
  const updateNickname = (id, name) => {
    const link = [...root.querySelectorAll("[data-chat-open]")].find((item) => item.dataset.chatOpen === id);
    if (link && name) link.querySelector(".chat-conversation-copy strong").textContent = name;
    if (link && !name) link.querySelector(".chat-conversation-copy strong").textContent = link.dataset.originalName || link.querySelector(".chat-conversation-copy strong").textContent;
    const heading = root.querySelector(".chat-thread-heading strong");
    if (heading && id === selectedConversation() && name) heading.textContent = name;
  };
  const applyFilters = () => {
    const activeFilter = root.querySelector('[data-chat-filter][aria-pressed="true"]')?.dataset.chatFilter || "all";
    root.querySelectorAll("[data-chat-open]").forEach((item) => {
      const id = item.dataset.chatOpen;
      const isGroupItem = item.querySelector(".chat-group-avatar") || /grupo/i.test(item.getAttribute("aria-label") || "");
      const matches = activeFilter === "all" || (activeFilter === "unread" && Boolean(item.querySelector(".chat-unread"))) || (activeFilter === "groups" && Boolean(isGroupItem)) || (activeFilter === "favorites" && favorites.has(id));
      if (activeFilter === "groups" || activeFilter === "favorites") item.hidden = !matches;
    });
  };
  root.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.matches("[data-v2-close]")) { closeModal(); return; }
    if (target.matches("[data-v2-settings]")) { renderSettings(false); return; }
    if (target.matches("[data-v2-thread-settings]")) { renderSettings(true); return; }
    if (target.matches("[data-v2-favorite]")) {
      event.preventDefault(); event.stopPropagation();
      const id = target.dataset.v2Favorite;
      if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
      write(favoritesKey, [...favorites]);
      target.textContent = favorites.has(id) ? "★" : "☆";
      target.setAttribute("aria-pressed", String(favorites.has(id)));
      applyFilters(); return;
    }
    if (target.matches("[data-v2-game]")) {
      if (isGroup()) { toast("O jogo está disponível apenas em conversas individuais."); return; }
      const name = root.querySelector(".chat-thread-heading strong")?.textContent || "Contato";
      openModal(`<span class="chat-v2-kicker">Jogo da velha</span><h2 id="chatV2ModalTitle">Convidar para jogar?</h2><p>O convite será enviado em tempo real nesta conversa.</p><div class="chat-v2-actions"><button type="button" class="chat-v2-button" data-v2-close>Cancelar</button><button type="button" class="chat-v2-button is-primary" data-v2-send-invite data-v2-name="${esc(name)}">Enviar convite</button></div>`); return;
    }
    if (target.matches("[data-v2-send-invite]")) {
      const name = target.dataset.v2Name || "Contato";
      const ok = await sendGame("invite", { senderName: root.querySelector("[data-site-header]")?.textContent?.trim() || "Alguém" });
      if (ok) { toast("Convite enviado."); closeModal(); } else toast("Não foi possível enviar o convite agora.");
      return;
    }
    if (target.matches("[data-v2-decline]")) { await sendGame("decline"); closeModal(); return; }
    if (target.matches("[data-v2-accept]")) {
      const state = { cells: Array(9).fill(null), turn: userId, x: "X", o: "O", xName: "X", oName: "O" };
      gameState = state; ownTurn = true;
      await sendGame("state", { state }); renderGame(); return;
    }
    if (target.matches("[data-v2-cell]")) {
      const index = Number(target.dataset.v2Cell);
      if (!gameState || gameState.turn !== userId || gameState.cells[index] || winner(gameState.cells)) return;
      const cells = [...gameState.cells]; cells[index] = "X";
      const result = winner(cells);
      gameState = { ...gameState, cells, turn: result ? null : "peer" };
      await sendGame("state", { state: gameState }); renderGame(); return;
    }
    if (target.matches("[data-v2-close-game]")) { await sendGame("close"); closeModal(); return; }
    if (target.matches("[data-v2-rematch]")) {
      gameState = { ...gameState, cells: Array(9).fill(null), turn: userId };
      await sendGame("state", { state: gameState }); renderGame(); return;
    }
    if (target.matches("[data-v2-save-nickname]")) {
      const id = selectedConversation(); const name = root.querySelector("#chatV2Nickname")?.value.trim() || "";
      if (name) nicknames[id] = name; else delete nicknames[id];
      write(nicknameKey, nicknames); updateNickname(id, name); toast(name ? "Apelido salvo neste dispositivo." : "Apelido removido."); return;
    }
    if (target.matches("[data-v2-color]")) {
      const id = selectedConversation(); const color = target.dataset.v2Color || "";
      if (color) wallpapers[id] = color; else delete wallpapers[id];
      write(wallpaperKey, wallpapers); applyWallpaper(); renderSettings(true); return;
    }
  });
  root.addEventListener("change", async (event) => {
    const fileInput = event.target.closest("[data-v2-wallpaper-file]");
    if (!fileInput?.files?.[0]) return;
    const file = fileInput.files[0];
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 1_500_000) { toast("Escolha PNG, JPG ou WebP de até 1,5 MB."); fileInput.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const id = selectedConversation();
      wallpapers[id] = `url("${String(reader.result).replace(/["\\\\]/g, "")}")`;
      if (!write(wallpaperKey, wallpapers)) { toast("Armazenamento local cheio; tente uma imagem menor."); return; }
      const thread = root.querySelector("[data-chat-thread]");
      if (thread) { thread.style.backgroundImage = wallpapers[id]; thread.style.backgroundSize = "cover"; }
      closeModal(); toast("Papel de parede atualizado.");
    };
    reader.readAsDataURL(file);
  });
  root.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-chat-filter]");
    if (!filter) return;
    if (["all","unread","groups","favorites"].includes(filter.dataset.chatFilter)) {
      root.querySelectorAll("[data-chat-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button === filter)));
      queueMicrotask(applyFilters);
    }
  });
  root.addEventListener("looply:chat-rendered", () => { renderTools(); applyFilters(); });
  root.addEventListener("focusout", (event) => {
    if (event.target.matches(".chat-message-form textarea")) {
      root.dispatchEvent(new CustomEvent("looply:chat-draft-blur"));
    }
  });
  root.addEventListener("looply:open-conversation", () => { setTimeout(async () => { await ensureChannel(); renderTools(); }, 0); });
  const observer = new MutationObserver(() => { renderTools(); applyFilters(); });
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("pagehide", () => { observer.disconnect(); closeChannel(); }, { once: true });
  renderTools();
}
