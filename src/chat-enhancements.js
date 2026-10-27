import { icon } from "./icons.js";
import { matchesConversationFilter } from "./chat-filter-logic.js";
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
const newGameId = () => globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
const read = (storageKey, fallback) => { try { const value = localStorage.getItem(storageKey); return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const write = (storageKey, value) => { try { localStorage.setItem(storageKey, JSON.stringify(value)); return true; } catch { return false; } };

export function setupChatEnhancements(root, client, userId) {
  if (!root || root.dataset.chatEnhancements === "true") return;
  root.dataset.chatEnhancements = "true";
  let settingsScope = "*";
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
  const ownDisplayName = () => root.querySelector(".looply-account strong")?.textContent?.trim()
    || root.querySelector("[data-profile-display-name]")?.getAttribute("data-profile-display-name")
    || "Membro";
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
    gameChannel = client.channel(`looply-game-${id}`, { config: { broadcast: { self: false } }, fastFallback: true });
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
      } else if (payload.type === "score-saved") {
        void refreshScoreboard();
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
    if (!node) { node = document.createElement("div"); node.className = "chat-v2-modal-backdrop"; node.dataset.chatV2Modal = ""; node.hidden = true; node.innerHTML = '<section class="chat-v2-modal" role="dialog" aria-modal="true" aria-labelledby="chatV2ModalTitle"><button type="button" class="chat-v2-modal-close" data-v2-close aria-label="Fechar">' + icon("close") + '</button><div data-v2-modal-content></div></section>'; root.append(node); }
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
  const refreshScoreboard = async () => {
    const conversationId = gameConversation;
    const node = root.querySelector("[data-v2-scoreboard]");
    if (!node || !conversationId) return;
    const { data, error } = await client.from("chat_ttt_results").select("winner_id,is_draw").eq("conversation_id", conversationId).limit(500);
    if (error) {
      node.textContent = "Placar sincronizado indisponível até aplicar a migração do banco.";
      return;
    }
    if (conversationId !== gameConversation || !node.isConnected) return;
    const wins = new Map();
    let draws = 0;
    for (const row of data || []) {
      if (row.is_draw) draws += 1;
      else if (row.winner_id) wins.set(row.winner_id, (wins.get(row.winner_id) || 0) + 1);
    }
    const xScore = wins.get(gameState?.xPlayer) || 0;
    const oScore = wins.get(gameState?.oPlayer) || 0;
    node.textContent = `${gameState?.xName || "X"} ${xScore} × ${oScore} ${gameState?.oName || "O"} · Empates: ${draws}`;
  };
  const renderGame = () => {
    if (!gameState) return;
    const result = winner(gameState.cells);
    const winnerId = gameState.winnerId || (result === "X" ? gameState.xPlayer : result === "O" ? gameState.oPlayer : null);
    const winnerName = winnerId === gameState.xPlayer ? gameState.xName : winnerId === gameState.oPlayer ? gameState.oName : "";
    const status = result === "draw" ? "Empate!" : winnerId ? winnerName + " venceu!" : gameState.turn === userId ? "Sua vez" : "Aguardando a outra pessoa…";
    openModal(`<span class="chat-v2-kicker">Jogo da velha · rodada ${Number(gameState.round) || 1}</span><h2 id="chatV2ModalTitle">Uma pausa para jogar</h2><p class="chat-v2-game-status">${esc(status)}</p><p class="chat-v2-scoreboard" data-v2-scoreboard role="status" aria-live="polite">Carregando placar…</p><div class="chat-v2-board" role="group" aria-label="Tabuleiro do jogo da velha">${gameState.cells.map((cell, i) => `<button type="button" class="chat-v2-cell" data-v2-cell="${i}" aria-label="Casa ${i+1}${cell ? ": "+cell : ""}" ${cell || result || gameState.turn !== userId ? "disabled" : ""}>${esc(cell)}</button>`).join("")}</div><div class="chat-v2-actions"><button type="button" class="chat-v2-button" data-v2-close-game>Fechar partida</button>${result ? '<button type="button" class="chat-v2-button is-primary" data-v2-rematch>Jogar novamente</button>' : ""}</div>`);
    void refreshScoreboard();
  };
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
    if (filters && !filters.querySelector('[data-chat-filter="groups"]')) {
      filters.insertAdjacentHTML("beforeend", '<button type="button" data-chat-filter="groups" aria-pressed="false">Grupos</button><button type="button" data-chat-filter="favorites" aria-pressed="false">Favoritas</button>');
    }
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
      if (label && nicknames[id]) label.textContent = nicknames[id];
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
    const items = root.querySelectorAll("[data-chat-conversations] [data-chat-open]");
    let visible = 0;
    items.forEach((item) => {
      const id = item.dataset.chatOpen;
      const matches = matchesConversationFilter({
        id,
        kind: item.dataset.chatKind,
        unreadCount: item.dataset.chatUnreadCount
      }, activeFilter, favorites);
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
    if (target.matches("[data-v2-close]")) { closeModal(); return; }
    if (target.matches("[data-v2-settings]")) { renderSettings(false); return; }
    if (target.matches("[data-v2-thread-settings]")) { renderSettings(true); return; }
    if (target.matches("[data-v2-game]")) {
      if (isGroup()) { toast("O jogo está disponível apenas em conversas individuais."); return; }
      const name = root.querySelector(".chat-thread-heading strong")?.textContent || "Contato";
      openModal(`<span class="chat-v2-kicker">Jogo da velha</span><h2 id="chatV2ModalTitle">Convidar para jogar?</h2><p>O convite será enviado em tempo real nesta conversa.</p><div class="chat-v2-actions"><button type="button" class="chat-v2-button" data-v2-close>Cancelar</button><button type="button" class="chat-v2-button is-primary" data-v2-send-invite data-v2-name="${esc(name)}">Enviar convite</button></div>`); return;
    }
    if (target.matches("[data-v2-send-invite]")) {
      const name = target.dataset.v2Name || "Contato";
      const ok = await sendGame("invite", { senderName: ownDisplayName() });
      if (ok) { toast("Convite enviado."); closeModal(); } else toast("Não foi possível enviar o convite agora.");
      return;
    }
    if (target.matches("[data-v2-decline]")) { await sendGame("decline"); closeModal(); return; }
    if (target.matches("[data-v2-accept]")) {
      const firstPlayer = Math.random() < 0.5 ? gameInvite.senderId : userId;
      const state = { gameId: newGameId(), cells: Array(9).fill(null), xPlayer: gameInvite.senderId, oPlayer: userId, turn: firstPlayer, winnerId: null, round: 1, xName: gameInvite.senderName || "Contato", oName: ownDisplayName() };
      gameState = state; ownTurn = false;
      await sendGame("state", { state }); renderGame(); return;
    }
    if (target.matches("[data-v2-cell]")) {
      const index = Number(target.dataset.v2Cell);
      if (!gameState || gameState.turn !== userId || gameState.cells[index] || winner(gameState.cells)) return;
      const cells = [...gameState.cells]; cells[index] = userId === gameState.xPlayer ? "X" : "O";
      const result = winner(cells);
      const nextTurn = userId === gameState.xPlayer ? gameState.oPlayer : gameState.xPlayer;
      const winnerId = result === "X" ? gameState.xPlayer : result === "O" ? gameState.oPlayer : null;
      gameState = { ...gameState, cells, turn: result ? null : nextTurn, winnerId };
      await sendGame("state", { state: gameState });
      if (result) {
        const { error } = await client.rpc("record_chat_ttt_result", {
          p_game_id: gameState.gameId, p_conversation_id: gameConversation,
          p_x_player: gameState.xPlayer, p_o_player: gameState.oPlayer,
          p_winner_id: winnerId, p_is_draw: result === "draw"
        });
        if (error) toast("A rodada terminou, mas o placar não foi salvo. Confira a migração do banco.");
        else await sendGame("score-saved");
      }
      renderGame(); return;
    }
    if (target.matches("[data-v2-close-game]")) { await sendGame("close"); closeModal(); return; }
    if (target.matches("[data-v2-rematch]")) {
      const nextStarter = gameState.winnerId || (Math.random() < 0.5 ? gameState.xPlayer : gameState.oPlayer);
      gameState = { ...gameState, gameId: newGameId(), cells: Array(9).fill(null), turn: nextStarter, winnerId: null, round: (Number(gameState.round) || 1) + 1 };
      await sendGame("state", { state: gameState }); renderGame(); return;
    }
    if (target.matches("[data-v2-save-nickname]")) {
      const id = selectedConversation(); const name = root.querySelector("#chatV2Nickname")?.value.trim() || "";
      if (name) nicknames[id] = name; else delete nicknames[id];
      write(nicknameKey, nicknames); updateNickname(id, name); toast(name ? "Apelido salvo neste dispositivo." : "Apelido removido."); return;
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
  applyFilters();
}
