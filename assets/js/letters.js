import { mountAppPage } from "../../src/page-runtime.js";
import { archivedCardsMarkup, bindArchivedCards, loadArchivedCards } from "../../src/archived-cards.js";
import { bindCommunityLetters, communityLettersMarkup, loadCommunityLetters } from "../../src/letters-community.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
async function loadWrittenLetters(client, userId) {
  const { data, error } = await client.from("letters")
    .select("id,conversation_id,sender_id,recipient_id,subject,created_at,sender:profiles!letters_sender_id_fkey(username,display_name),recipient:profiles!letters_recipient_id_fkey(username,display_name)")
    .or("sender_id.eq." + userId + ",recipient_id.eq." + userId).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}
function usersDirectoryMarkup(profiles, userId) {
  const people = profiles.filter((profile) => profile.id !== userId);
  const cards = people.map((profile) => {
    const label = profile.display_name || profile.username || "Usuário";
    const initial = label.slice(0, 1).toLocaleUpperCase("pt-BR");
    const avatar = profile.avatarUrl
      ? `<img class="letters-user-avatar" src="${escapeHtml(profile.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="letters-user-avatar letters-user-initial" aria-hidden="true">${escapeHtml(initial)}</span>`;
    return `<article class="letters-user-card" data-letters-user-card="${escapeHtml(profile.id)}">
      ${avatar}<span class="letters-user-copy"><strong>${escapeHtml(label)}</strong><small>@${escapeHtml(profile.username)}</small></span>
      <button class="primary-button compact-button" type="button" data-letters-chat-start="${escapeHtml(profile.id)}">Mensagem</button>
      <span class="letters-user-status" data-letters-user-status role="status" aria-live="polite"></span>
    </article>`;
  }).join("");
  return `<section class="panel letters-users-panel" aria-labelledby="lettersUsersTitle">
    <div class="letters-users-heading"><div><span class="section-kicker">Pessoas</span><h2 id="lettersUsersTitle">Iniciar conversa</h2></div><span class="letters-users-count">${people.length}</span></div>
    <label class="visually-hidden" for="lettersUserSearch">Buscar pessoa</label>
    <input class="letters-user-search" id="lettersUserSearch" type="search" maxlength="100" placeholder="Buscar pessoa" data-letters-user-search>
    <div class="letters-users-list" data-letters-users>${cards || '<p class="written-letters-empty">Nenhum outro usuário disponível.</p>'}</div>
    <p class="letters-users-empty" data-letters-users-empty hidden>Nenhum usuário corresponde à busca.</p>
  </section>`;
}
function writtenLettersMarkup(letters, userId) {
  if (!letters.length) return "<p class=\"written-letters-empty\">Nenhuma carta enviada ou recebida</p>";
  return letters.map((letter) => {
    const own = letter.sender_id === userId;
    const peer = own ? letter.recipient : letter.sender;
    return "<article class=\"written-letter-row\"><div><strong>" + escapeHtml(letter.subject) + "</strong><span>" +
      (own ? "Para " : "De ") + escapeHtml(peer?.display_name || peer?.username || "Perfil restrito") +
      " · " + escapeHtml(formatDate(letter.created_at)) + "</span></div>" +
      "<a class=\"text-button\" href=\"mensagens.html?id=" + encodeURIComponent(letter.conversation_id) + "\">Abrir conversa</a></article>";
  }).join("");
}
await mountAppPage({ page: "letters", render: async ({ root, client, user }) => {
  const [archiveResult, letterResult, communityResult, profilesResult] = await Promise.allSettled([
    loadArchivedCards(client, user.id), loadWrittenLetters(client, user.id),
    loadCommunityLetters(client, user.id),
    client.from("profiles").select("id,username,display_name,avatar_path").order("username").limit(100)
  ]);
  const communityLetters = communityResult.status === "fulfilled" ? communityResult.value : [];
  const profiles = profilesResult.status === "fulfilled" ? profilesResult.value.data || [] : [];
  const avatarProfiles = profiles.filter((profile) => profile.avatar_path);
  if (avatarProfiles.length) {
    const { data: signed, error: signedError } = await client.storage.from("looply-avatars")
      .createSignedUrls(avatarProfiles.map((profile) => profile.avatar_path), 1800);
    if (!signedError && signed) avatarProfiles.forEach((profile, index) => { profile.avatarUrl = signed[index]?.signedUrl || ""; });
  }
  root.innerHTML = usersDirectoryMarkup(profiles, user.id) + communityLettersMarkup(communityLetters, profiles, user.id) +
    "<section class=\"panel written-letters-panel\"><div class=\"written-letters-heading\"><h2>Cartas enviadas e recebidas</h2><a class=\"text-button\" href=\"chat.html\">Abrir conversa</a></div><div class=\"written-letters-list\"></div></section>" +
    archivedCardsMarkup();
  root.addEventListener("input", (event) => {
    if (!event.target.matches("[data-letters-user-search]")) return;
    const query = event.target.value.trim().toLocaleLowerCase("pt-BR");
    let visible = 0;
    root.querySelectorAll("[data-letters-user-card]").forEach((card) => {
      const match = card.textContent.toLocaleLowerCase("pt-BR").includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    });
    const empty = root.querySelector("[data-letters-users-empty]");
    if (empty) empty.hidden = visible !== 0;
  });
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-letters-chat-start]");
    if (!button || button.disabled) return;
    const card = button.closest("[data-letters-user-card]");
    const status = card?.querySelector("[data-letters-user-status]");
    button.disabled = true;
    button.textContent = "Abrindo…";
    if (status) status.textContent = "Conectando à conversa…";
    try {
      const { data, error } = await client.functions.invoke("looply-chat", {
        body: { action: "create_direct", targetId: button.dataset.lettersChatStart }
      });
      if (error) throw error;
      if (!data?.conversationId || data.errorCode) throw new Error(data?.errorCode || "conversation_unavailable");
      window.location.assign("mensagens.html?id=" + encodeURIComponent(data.conversationId));
    } catch (error) {
      console.error("Looply letters direct chat failed", error);
      button.disabled = false;
      button.textContent = "Mensagem";
      if (status) status.textContent = "Não foi possível abrir a conversa. Tente novamente.";
    }
  });
  if (communityResult.status === "fulfilled") bindCommunityLetters(root, client, user, profiles, communityLetters);
  else {
    console.error("Looply community letters load failed", communityResult.reason);
    const composer = root.querySelector(".community-letter-compose-panel");
    if (composer) composer.innerHTML = "<p role=\"alert\">Não foi possível carregar as cartas da comunidade.</p>";
  }
  const letterList = root.querySelector(".written-letters-list");
  if (letterResult.status === "fulfilled") letterList.innerHTML = writtenLettersMarkup(letterResult.value, user.id);
  else {
    console.error("Looply written letters load failed", letterResult.reason);
    letterList.innerHTML = "<p class=\"written-letters-empty\" role=\"alert\">Não foi possível carregar as cartas enviadas e recebidas.</p>";
  }
  if (archiveResult.status === "fulfilled") bindArchivedCards(root, client, user.id, archiveResult.value);
  else {
    console.error("Looply archive cards load failed", archiveResult.reason);
    root.querySelector("[data-archived-cards]").innerHTML = "<p class=\"archive-media-empty\" role=\"alert\">Não foi possível carregar a coleção arquivada.</p>";
    root.querySelector("[data-card-collection-note]").textContent = "Acervo indisponível";
  }
} });
