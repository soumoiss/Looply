import { icon } from "./icons.js";
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export async function checkAdminAccess(client) {
  if (!client) return false;
  try {
    const { data, error } = await client.functions.invoke("looply-admin", { body: { resourceType: "status" } });
    if (error) throw error;
    return data?.isAdmin === true;
  } catch (error) {
    console.error("Looply admin status unavailable", error);
    return false;
  }
}

export function adminMarkup(profile = {}) {
  const adminName = profile.username === "peixinho" ? "Peixinho" : `@${escapeHtml(profile.username || "administrador")}`;
  return `<section class="admin-area" aria-labelledby="adminTitle">
    <div class="admin-heading"><div><span class="section-kicker">Acesso verificado pelo servidor</span><h2 id="adminTitle">Administração</h2></div>
      <span class="admin-badge">${adminName} · administrador</span></div>
    <p class="admin-description">O modo protegido exige uma senha administrativa separada, expira em 15 minutos e registra as ações privilegiadas.</p>
    <section class="admin-session-panel admin-broadcast-panel" data-admin-session-panel aria-labelledby="adminSessionTitle">
      <div class="admin-broadcast-heading"><div><span class="section-kicker">Sessão temporária</span><h3 id="adminSessionTitle">Modo ADM protegido</h3></div></div>
      <p class="admin-description" data-admin-session-message>Verificando a autorização e o estado da sessão…</p>
      <form class="admin-session-form admin-broadcast-form" data-admin-session-setup hidden>
        <div class="field"><label for="adminSessionSetupPassword">Criar senha administrativa separada</label><input id="adminSessionSetupPassword" name="password" type="password" minlength="12" maxlength="256" autocomplete="new-password" required><small>Use pelo menos 12 caracteres. A senha não é a senha de login.</small></div>
        <div class="field"><label for="adminSessionSetupConfirm">Confirmar senha</label><input id="adminSessionSetupConfirm" name="confirmPassword" type="password" minlength="12" maxlength="256" autocomplete="new-password" required></div>
        <button class="primary-button compact-button" type="submit">Configurar senha ADM</button><span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>
      <form class="admin-session-form admin-broadcast-form" data-admin-session-unlock hidden>
        <div class="field"><label for="adminSessionPassword">Senha administrativa</label><input id="adminSessionPassword" name="password" type="password" maxlength="256" autocomplete="current-password" required></div>
        <button class="primary-button compact-button" type="submit">Desbloquear por 15 minutos</button><span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>
      <div class="admin-session-active" data-admin-session-active hidden><p>Modo ADM desbloqueado nesta aba. A autorização é validada pelo servidor em cada operação.</p><button class="text-button" type="button" data-admin-session-exit>Encerrar sessão ADM</button></div>
    </section>
    <div data-admin-controls hidden>
    <section class="admin-broadcast-panel" aria-labelledby="adminUsersTitle">
      <div class="admin-broadcast-heading"><div><span class="section-kicker">Contas e permissões</span><h3 id="adminUsersTitle">Gerenciamento de usuários</h3></div><button class="text-button" type="button" data-users-refresh>Atualizar lista</button></div>
      <p class="admin-description">Consulte contas, edite o perfil, suspenda ou restaure o acesso. Toda ação exige justificativa e fica registrada na auditoria. A criação de conta respeita as identidades Looply autorizadas.</p>
      <div class="field"><label for="adminUsersPurpose">Justificativa administrativa (obrigatória)</label><input id="adminUsersPurpose" data-users-purpose minlength="20" maxlength="500" placeholder="Descreva o motivo da consulta ou alteração" required></div>
      <form class="admin-broadcast-form" data-user-invite>
        <h4>Convidar uma conta Looply autorizada</h4>
        <div class="field"><label for="adminInviteUsername">Identidade</label><select id="adminInviteUsername" name="username" required><option value="">Selecione</option><option value="patati">Patati</option><option value="misol">Misol</option><option value="yara">Yara</option><option value="peixinho">Peixinho</option></select></div>
        <div class="field"><label for="adminInviteDisplayName">Nome de exibição</label><input id="adminInviteDisplayName" name="displayName" maxlength="80" required></div>
        <p class="admin-description">O convite será enviado para a identidade @loooply.app selecionada; não é possível criar contas arbitrárias nem conceder privilégios de administrador por aqui.</p>
        <button class="primary-button compact-button" type="submit">Enviar convite</button><span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>
      <div class="admin-results" data-users-results aria-live="polite"><p>Desbloqueie o Modo ADM e atualize a lista para consultar as contas.</p></div>
    </section>
    <section class="admin-broadcast-panel" aria-labelledby="adminBroadcastTitle">
      <div class="admin-broadcast-heading"><div><span class="section-kicker">Aviso para todas as contas</span><h3 id="adminBroadcastTitle">Comunicado global</h3></div></div>
      <p class="admin-description">O aviso aparece como uma janela dentro do Looply. Cada conta registra sua própria leitura, e o histórico mostra quem leu e quem ainda não leu.</p>
      <form class="admin-broadcast-form" data-admin-broadcast>
        <div class="field"><label for="broadcastTitle">Título do aviso</label><input id="broadcastTitle" name="title" type="text" maxlength="120" required placeholder="Ex.: Atualização do Looply"></div>
        <div class="field"><label for="broadcastBody">Mensagem</label><textarea id="broadcastBody" name="body" maxlength="4000" rows="4" required placeholder="Escreva a mensagem que todos os membros devem receber."></textarea></div>
        <div class="field"><label for="broadcastExpiresAt">Expira em (opcional)</label><input id="broadcastExpiresAt" name="expiresAt" type="datetime-local"><small>Sem data de expiração, o aviso permanece ativo até ser desativado.</small></div>
        <div class="field"><label for="broadcastPurpose">Motivo administrativo</label><textarea id="broadcastPurpose" name="purpose" minlength="20" maxlength="500" rows="2" required placeholder="Explique o motivo do comunicado (mínimo de 20 caracteres)."></textarea></div>
        <div class="admin-broadcast-actions"><button class="primary-button compact-button" type="submit">Publicar comunicado</button><button class="text-button" type="button" data-broadcast-refresh>Consultar leituras</button></div>
        <span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>
      <div class="admin-broadcast-results" data-broadcast-results aria-live="polite"><p>Informe o motivo administrativo e consulte o histórico para ver os recibos de leitura.</p></div>
    </section>
    <form class="admin-read-form" data-admin-read>
      <div class="admin-form-grid">
        <div class="field"><label for="adminResource">Área</label><select id="adminResource" name="resourceType">
          <option value="posts">Publicações, comentários e mídias</option>
          <option value="music_dedications">Músicas e comentários</option>
          <option value="music_library">Coleções pessoais de músicas</option>
          <option value="youtube_track_comments">Comentários por música</option>
          <option value="letters">Cartas para Peixinho</option>
          <option value="conversations">Conversas privadas</option>
          <option value="chat_messages">Mensagens de chat e anexos</option>
          <option value="profiles">Perfis</option>
          <option value="post_media">Arquivo de mídia</option>
          <option value="archived_cards">Cartas antigas</option>
          <option value="archive_media">Mídias antigas</option>
          <option value="archive_media_comments">Comentários das mídias antigas</option>
          <option value="audit">Trilha de auditoria</option>
        </select></div>
        <div class="field" data-admin-id-field><label for="adminResourceId">UUID específico (opcional)</label><input id="adminResourceId" name="resourceId" type="text" maxlength="36" placeholder="Deixe vazio para consultar a lista recente"></div>
        <div class="field" data-admin-offset-field hidden><label for="adminOffset">Posição da lista</label><input id="adminOffset" name="offset" type="number" min="0" max="10000" step="100" value="0"><small>As mídias são exibidas em grupos de 100.</small></div>
      </div>
      <div class="field"><label for="adminPurpose">Motivo da consulta</label><textarea id="adminPurpose" name="purpose" minlength="20" maxlength="500" rows="3" required placeholder="Descreva por que esta consulta é necessária (mínimo de 20 caracteres)."></textarea></div>
      <button class="primary-button compact-button" type="submit">Registrar e consultar ${icon("search")}</button>
      <span class="form-status" data-status role="status" aria-live="polite"></span>
    </form>
    <div class="admin-results" data-admin-results aria-live="polite"><p>Consultas administrativas aparecem aqui depois de registradas.</p></div>
    <div data-archive-import></div>
    </div>
  </section>`;
}

function dateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function setStatus(form, message, kind = "success") {
  const status = form.querySelector("[data-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function mediaMarkup(media) {
  if (!media.signed_url) return `<p class="admin-media-link">Arquivo sem link temporário ativo.</p>`;
  const url = escapeHtml(media.signed_url);
  const label = escapeHtml(media.alt_text || media.file_name || media.storage_path || "Mídia privada");
  if (media.mime_type?.startsWith("audio/")) return `<figure><audio src="${url}" controls preload="metadata" aria-label="${label}"></audio><figcaption>${label}</figcaption></figure>`;
  if (media.mime_type === "application/pdf" || media.mime_type === "text/plain") return `<p class="admin-media-link"><a href="${url}" target="_blank" rel="noopener noreferrer">Abrir ${label} ${icon("external")}</a></p>`;
  if (media.mime_type === "image/heic") return `<p class="admin-media-link"><a href="${url}" target="_blank" rel="noopener noreferrer">Abrir ou baixar ${label} ${icon("external")}</a></p>`;
  return (media.kind === "video" || media.mime_type?.startsWith("video/"))
    ? `<figure><video src="${url}" controls preload="metadata" aria-label="${label}"></video><figcaption>${label}</figcaption></figure>`
    : `<figure><img src="${url}" alt="${label}" loading="lazy" referrerpolicy="no-referrer"><figcaption>${label}</figcaption></figure>`;
}

function itemMarkup(resourceType, item) {
  if (resourceType === "posts") {
    const comments = (item.comments || []).map((comment) => `<li><strong>@${escapeHtml(comment.author?.username || "perfil restrito")}</strong><p>${escapeHtml(comment.body)}</p></li>`).join("");
    const media = (item.media || []).map(mediaMarkup).join("");
    return `<article class="admin-record"><div class="admin-record-top"><strong>@${escapeHtml(item.author?.username || "perfil restrito")}</strong><span>${escapeHtml(item.visibility)} · ${escapeHtml(dateTime(item.created_at))}</span></div>
      <p class="admin-record-body">${escapeHtml(item.body)}</p>${media ? `<div class="admin-media-grid">${media}</div>` : ""}
      ${comments ? `<details><summary>${item.comments.length} comentário(s)</summary><ul>${comments}</ul></details>` : ""}
      <form class="admin-comment-form" data-admin-comment data-post-id="${escapeHtml(item.id)}"><label class="visually-hidden" for="admin-comment-${escapeHtml(item.id)}">Comentário administrativo</label><textarea id="admin-comment-${escapeHtml(item.id)}" name="body" maxlength="2000" required placeholder="Comente como administrador..."></textarea><button class="text-button" type="submit">Comentar como administrador</button><span class="form-status" data-status role="status" aria-live="polite"></span></form>
      <small>Post UUID: ${escapeHtml(item.id)}</small></article>`;
  }
  if (resourceType === "music_dedications") {
    const comments = (item.comments || []).map((comment) => `<li><strong>@${escapeHtml(comment.author?.username || "perfil restrito")} · ${escapeHtml(comment.visibility)}</strong><p>${escapeHtml(comment.body)}</p></li>`).join("");
    return `<article class="admin-record"><div class="admin-record-top"><strong>${escapeHtml(item.title)}${item.artist ? ` · ${escapeHtml(item.artist)}` : ""}</strong><span>${escapeHtml(dateTime(item.created_at))}</span></div>
      <p class="admin-record-body">${escapeHtml(item.dedication_note)}</p><p>@${escapeHtml(item.sender?.username || "perfil restrito")} → @${escapeHtml(item.recipient?.username || "perfil restrito")}</p>
      <a class="music-listen" href="${escapeHtml(item.listen_url)}" target="_blank" rel="noopener noreferrer">Abrir link externo ${icon("external")}</a>${comments ? `<details><summary>Comentários</summary><ul>${comments}</ul></details>` : ""}</article>`;
  }
  if (resourceType === "youtube_track_comments") {
    return `<article class="admin-record"><div class="admin-record-top"><strong>${escapeHtml(item.author?.display_name || item.author?.username || "Usuário")} · comentário de música</strong><span>${escapeHtml(dateTime(item.created_at))}</span></div><p class="admin-record-body">${escapeHtml(item.body)}</p><p>Playlist: ${escapeHtml(item.playlist_id)} · Vídeo: ${escapeHtml(item.video_id)}</p><small>Comentário UUID: ${escapeHtml(item.id)}</small></article>`;
  }
  if (resourceType === "music_library") {
    return `<article class="admin-record"><div class="admin-record-top"><strong>${escapeHtml(item.title)}${item.artist ? ` · ${escapeHtml(item.artist)}` : ""}</strong><span>${escapeHtml(dateTime(item.created_at))}</span></div>
      <p>@${escapeHtml(item.owner?.username || "perfil restrito")}</p>${item.note ? `<p class="admin-record-body">${escapeHtml(item.note)}</p>` : ""}
      <a class="music-listen" href="${escapeHtml(item.listen_url)}" target="_blank" rel="noopener noreferrer">Abrir link externo ${icon("external")}</a></article>`;
  }
  if (resourceType === "profiles") {
    return `<article class="admin-record"><div class="admin-record-top"><strong>@${escapeHtml(item.username)}</strong><span>${escapeHtml(item.profile_visibility)}</span></div>
      <p class="admin-record-body">${escapeHtml(item.display_name)}${item.bio ? ` · ${escapeHtml(item.bio)}` : ""}</p><button class="text-button" type="button" data-admin-chat-start="${escapeHtml(item.id)}">Iniciar conversa</button><span class="form-status" data-status role="status" aria-live="polite"></span><small>Perfil UUID: ${escapeHtml(item.id)}</small></article>`;
  }
  if (resourceType === "post_media") {
    return `<article class="admin-record"><div class="admin-record-top"><strong>${escapeHtml(item.kind)} · ${escapeHtml(item.mime_type)}</strong><span>${escapeHtml(String(Math.ceil(item.byte_size / 1024)))} KiB</span></div>
      ${mediaMarkup(item)}<p>${escapeHtml(item.post?.body || "")}</p><small>Mídia UUID: ${escapeHtml(item.id)} · Post UUID: ${escapeHtml(item.post_id)}</small></article>`;
  }
  if (resourceType === "archived_cards") {
    const recipient = item.recipient?.display_name || item.recipient?.username || "Perfil";
    const body = item.body ? `<details class="admin-archive-card-body"><summary>Visualizar carta</summary><pre>${escapeHtml(item.body)}</pre></details>` : `<p class="admin-record-body">O conteúdo da carta não está disponível.</p>`;
    return `<article class="admin-record"><div class="admin-record-top"><strong>${escapeHtml(item.original_file)} · ${escapeHtml(recipient)}</strong><span>${item.is_private ? "Privada" : "Carta"}${item.is_protected ? " · protegida" : ""}${item.sent_date ? ` · ${escapeHtml(item.sent_date)}` : ""}</span></div>
      ${item.password_hint ? `<p class="admin-record-hint">Dica: ${escapeHtml(item.password_hint)}</p>` : ""}${body}<small>Carta UUID: ${escapeHtml(item.id)}</small></article>`;
  }
  if (resourceType === "archive_media") {
    const recipients = (item.recipients || []).map((entry) => `@${escapeHtml(entry.profile?.username || "perfil restrito")}`).join(" · ");
    const comments = (item.comments || []).map((comment) => `<li><strong>@${escapeHtml(comment.author?.username || "perfil restrito")}</strong><p>${escapeHtml(comment.body)}</p></li>`).join("");
    return `<article class="admin-record"><div class="admin-record-top"><strong>${escapeHtml(item.file_name)} · ${escapeHtml(item.kind)}</strong><span>${escapeHtml(item.visibility)}${item.source_date ? ` · ${escapeHtml(dateTime(item.source_date))}` : ""}</span></div>
      ${mediaMarkup({ ...item, alt_text: item.file_name })}<p>${escapeHtml(item.source_path)} · ${escapeHtml(String(Math.ceil(item.byte_size / 1024)))} KiB${recipients ? ` · ${recipients}` : ""}</p>
      ${comments ? `<details><summary>${item.comments.length} comentário(s)</summary><ul>${comments}</ul></details>` : "<p class=\"admin-empty\">Nenhum comentário.</p>"}
      <form class="admin-comment-form" data-admin-archive-comment data-media-id="${escapeHtml(item.id)}"><label class="visually-hidden" for="admin-archive-comment-${escapeHtml(item.id)}">Comentário administrativo</label><textarea id="admin-archive-comment-${escapeHtml(item.id)}" name="body" maxlength="2000" required placeholder="Comente como administrador..."></textarea><button class="text-button" type="submit">Comentar como administrador</button><span class="form-status" data-status role="status" aria-live="polite"></span></form>
      <small>Mídia UUID: ${escapeHtml(item.id)}</small></article>`;
  }
  if (resourceType === "archive_media_comments") {
    return `<article class="admin-record"><div class="admin-record-top"><strong>@${escapeHtml(item.author?.username || "perfil restrito")}</strong><span>${escapeHtml(dateTime(item.created_at))}</span></div><p class="admin-record-body">${escapeHtml(item.body)}</p><p>${escapeHtml(item.media?.file_name || "Mídia antiga")} · ${escapeHtml(item.media?.visibility || "")}</p><small>Comentário UUID: ${escapeHtml(item.id)} · Mídia UUID: ${escapeHtml(item.media_id)}</small></article>`;
  }
  if (resourceType === "letters") {
    return `<article class="admin-record"><div class="admin-record-top"><strong>Carta · ${escapeHtml(item.subject)}</strong><span>${escapeHtml(dateTime(item.created_at))}</span></div>
      <p>@${escapeHtml(item.sender?.username || "perfil restrito")} → @${escapeHtml(item.recipient?.username || "peixinho")}</p>
      <p class="admin-record-body">${escapeHtml(item.initial_message?.body || "A mensagem inicial não está disponível.")}</p><small>Conversa UUID: ${escapeHtml(item.conversation_id)}</small></article>`;
  }
  if (resourceType === "conversations") {
    const participants = (item.participants || []).map((participant) => `@${escapeHtml(participant.profile?.username || "perfil restrito")}`).join(" · ");
    return `<article class="admin-record"><div class="admin-record-top"><strong>${escapeHtml(item.kind === "letter" ? `Carta · ${item.subject || ""}` : "Conversa privada")}</strong><span>${escapeHtml(dateTime(item.updated_at))}</span></div><p>${participants}</p><small>Conversa UUID: ${escapeHtml(item.id)}</small></article>`;
  }
  if (resourceType === "chat_messages") {
    const media = (item.media || []).map(mediaMarkup).join("");
    return `<article class="admin-record"><div class="admin-record-top"><strong>@${escapeHtml(item.author?.username || "perfil restrito")}</strong><span>${escapeHtml(dateTime(item.created_at))}</span></div>
      <p class="admin-record-body">${escapeHtml(item.body)}</p>${media ? `<div class="admin-media-grid">${media}</div>` : ""}<small>Conversa UUID: ${escapeHtml(item.conversation_id)} · Mensagem UUID: ${escapeHtml(item.id)}</small></article>`;
  }
  return `<article class="admin-record"><pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre></article>`;
}

function renderResults(container, resourceType, data) {
  const rows = Array.isArray(data) ? data : data == null ? [] : [data];
  if (!rows.length) {
    container.innerHTML = `<p class="admin-empty">Nenhum registro foi encontrado.</p>`;
    return;
  }
  container.innerHTML = `<p class="admin-result-count">${rows.length} registro(s) · conteúdo privado consultado após auditoria</p>${rows.map((item) => itemMarkup(resourceType, item)).join("")}`;
}

export function bindAdminEvents(root, client) {
  async function loadUsers() {
    const results = root.querySelector("[data-users-results]");
    const purpose = String(root.querySelector("[data-users-purpose]")?.value || "").trim();
    if (!results) return;
    if (purpose.length < 20) {
      results.textContent = "Informe uma justificativa de pelo menos 20 caracteres antes de consultar ou alterar contas.";
      return;
    }
    results.textContent = "Carregando contas…";
    try {
      const { data, error } = await invokeAdmin({ action: "users_list", resourceType: "profiles", purpose });
      if (error) throw error;
      results.replaceChildren();
      const users = data?.users || [];
      if (!users.length) {
        results.textContent = "Nenhuma conta encontrada.";
        return;
      }
      for (const user of users) {
        const card = document.createElement("article");
        card.className = "admin-user-card";
        const heading = document.createElement("div");
        heading.className = "admin-broadcast-heading";
        const title = document.createElement("h4");
        title.textContent = user.display_name + " · @" + user.username;
        const status = document.createElement("span");
        status.className = "admin-badge";
        status.textContent = user.suspended ? "Suspensa" : user.emailConfirmed ? "Ativa" : "Convite pendente";
        heading.append(title, status);
        const email = document.createElement("p");
        email.textContent = user.email || "E-mail indisponível";
        const lastSignIn = document.createElement("p");
        lastSignIn.className = "admin-description";
        lastSignIn.textContent = user.lastSignInAt ? "Último acesso: " + dateTime(user.lastSignInAt) : "Ainda não há acesso registrado.";
        const form = document.createElement("form");
        form.className = "admin-broadcast-form";
        form.dataset.userProfileForm = "";
        form.dataset.userId = user.id;
        const fields = [
          ["displayName", "Nome de exibição", user.display_name || "", 80],
          ["bio", "Biografia", user.bio || "", 500]
        ];
        for (const [name, labelText, value, max] of fields) {
          const field = document.createElement("div");
          field.className = "field";
          const label = document.createElement("label");
          label.textContent = labelText;
          const input = name === "bio" ? document.createElement("textarea") : document.createElement("input");
          input.name = name;
          input.value = value;
          input.maxLength = max;
          if (name === "displayName") input.required = true;
          label.htmlFor = "user-" + user.id + "-" + name;
          input.id = label.htmlFor;
          field.append(label, input);
          form.append(field);
        }
        const visibilityField = document.createElement("div");
        visibilityField.className = "field";
        const visibilityLabel = document.createElement("label");
        visibilityLabel.textContent = "Visibilidade do perfil";
        visibilityLabel.htmlFor = "user-" + user.id + "-visibility";
        const visibility = document.createElement("select");
        visibility.id = visibilityLabel.htmlFor;
        visibility.name = "profileVisibility";
        for (const [value, labelText] of [["members", "Membros"], ["private", "Privado"]]) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = labelText;
          option.selected = user.profile_visibility === value;
          visibility.append(option);
        }
        visibilityField.append(visibilityLabel, visibility);
        form.append(visibilityField);
        const save = document.createElement("button");
        save.type = "submit";
        save.className = "primary-button compact-button";
        save.textContent = "Salvar perfil";
        const feedback = document.createElement("span");
        feedback.className = "form-status";
        feedback.dataset.status = "";
        feedback.setAttribute("role", "status");
        form.append(save, feedback);
        const actions = document.createElement("div");
        actions.className = "admin-user-actions";
        if (user.id !== (root.dataset.currentUserId || "")) {
          const accessButton = document.createElement("button");
          accessButton.type = "button";
          accessButton.className = "text-button";
          accessButton.dataset.userAccessAction = user.suspended ? "restore" : "suspend";
          accessButton.dataset.userId = user.id;
          accessButton.textContent = user.suspended ? "Restaurar acesso" : "Suspender acesso";
          actions.append(accessButton);
        }
        card.append(heading, email, lastSignIn, form, actions);
        results.append(card);
      }
    } catch (error) {
      results.textContent = /admin_session/.test(String(error?.message || "")) ? "A sessão ADM expirou. Desbloqueie novamente." : "Não foi possível carregar as contas. Verifique a justificativa e tente novamente.";
    }
  }

  async function invokeAdmin(body) {
    const token = sessionStorage.getItem("looplyAdminSessionToken") || "";
    if (!token) throw new Error("admin_session_locked");
    return client.functions.invoke("looply-admin", { body: { ...body, adminSessionToken: token } });
  }

  function showSessionState(state, message = "") {
    const setup = root.querySelector("[data-admin-session-setup]");
    const unlock = root.querySelector("[data-admin-session-unlock]");
    const active = root.querySelector("[data-admin-session-active]");
    const controls = root.querySelector("[data-admin-controls]");
    const note = root.querySelector("[data-admin-session-message]");
    if (!setup || !unlock || !active || !controls || !note) return;
    setup.hidden = state !== "setup";
    unlock.hidden = state !== "locked";
    active.hidden = state !== "active";
    controls.hidden = state !== "active";
    note.textContent = message || (state === "setup" ? "Configure uma senha separada antes de usar ferramentas administrativas."
      : state === "locked" ? "A sessão ADM está bloqueada. Desbloqueie para continuar."
      : state === "active" ? "Sessão ADM ativa por tempo limitado." : "Não foi possível verificar a sessão.");
  }

  async function refreshAdminSession() {
    if (!client) return;
    try {
      const { data, error } = await client.functions.invoke("looply-admin", { body: { action: "admin_session_status" } });
      if (error || data?.isAdmin !== true) {
        showSessionState("unavailable", "A identidade administrativa não foi confirmada pelo servidor.");
        return;
      }
      const token = sessionStorage.getItem("looplyAdminSessionToken") || "";
      if (data.configured && token) {
        const { data: validation, error: validationError } = await client.functions.invoke("looply-admin", {
          body: { action: "admin_session_validate", token }
        });
        if (!validationError && validation?.active === true) {
          showSessionState("active", "Sessão ADM validada pelo servidor.");
          return;
        }
        sessionStorage.removeItem("looplyAdminSessionToken");
      }
      showSessionState(data.configured ? "locked" : "setup");
    } catch {
      showSessionState("unavailable", "O serviço de sessão protegida está indisponível. Tente novamente.");
    }
  }


  void refreshAdminSession();

  async function loadBroadcasts(form, showStatus = true) {
    const purpose = String(form?.elements.purpose?.value || "").trim();
    const results = root.querySelector("[data-broadcast-results]");
    if (purpose.length < 20 || purpose.length > 500) {
      if (form) setStatus(form, "Informe o motivo administrativo (20–500 caracteres) antes de consultar.", "error");
      return false;
    }
    const refreshButton = form?.querySelector("[data-broadcast-refresh]");
    if (refreshButton) refreshButton.disabled = true;
    if (showStatus && form) setStatus(form, "Consultando comunicados e recibos de leitura…", "info");
    try {
      const { data, error } = await invokeAdmin({ action: "broadcast_list", resourceType: "announcements", purpose });
      if (error) throw error;
      const announcements = data?.announcements || [];
      if (results) {
        results.innerHTML = announcements.length ? announcements.map((item) => {
          const readers = (item.readers || []).map((reader) => `<li><strong>@${escapeHtml(reader.username || reader.display_name || "usuário")}</strong><span>${reader.read_at ? `Lido em ${escapeHtml(dateTime(reader.read_at))}` : "Ainda não leu"}</span></li>`).join("");
          return `<article class="admin-broadcast-record"><div class="admin-record-top"><strong>${escapeHtml(item.title)}</strong><span>${item.is_active ? "Ativo" : "Desativado"}</span></div><p class="admin-broadcast-body">${escapeHtml(item.body)}</p><p class="admin-broadcast-meta">Publicado em ${escapeHtml(dateTime(item.created_at))}${item.expires_at ? ` · Expira em ${escapeHtml(dateTime(item.expires_at))}` : ""}</p><p class="admin-broadcast-meta">Leituras: ${Number(item.read_count || 0)} de ${Number(item.recipient_count || 0)} contas</p><details><summary>Ver estado de leitura por conta</summary><ul class="admin-broadcast-readers">${readers}</ul></details>${item.is_active ? `<button class="text-button" type="button" data-broadcast-deactivate="${escapeHtml(item.id)}">Desativar comunicado</button>` : ""}</article>`;
        }).join("") : '<p class="admin-empty">Nenhum comunicado foi publicado.</p>';
      }
      if (showStatus && form) setStatus(form, `Histórico atualizado · ${announcements.length} comunicado(s).`);
      return true;
    } catch (error) {
      console.error("Looply global announcement history failed", error);
      if (showStatus && form) setStatus(form, "Não foi possível carregar o histórico. Confira o acesso administrativo e tente novamente.", "error");
      return false;
    } finally {
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  root.addEventListener("click", async (event) => {
    const refreshUsers = event.target.closest("[data-users-refresh]");
    if (refreshUsers && client) {
      await loadUsers();
      return;
    }
    const accessAction = event.target.closest("[data-user-access-action]");
    if (accessAction && client) {
      const purpose = String(root.querySelector("[data-users-purpose]")?.value || "").trim();
      if (purpose.length < 20) {
        const results = root.querySelector("[data-users-results]");
        if (results) results.textContent = "Informe uma justificativa de pelo menos 20 caracteres.";
        return;
      }
      accessAction.disabled = true;
      try {
        const action = accessAction.dataset.userAccessAction === "suspend" ? "user_set_suspended" : "user_restore_access";
        const { data, error } = await invokeAdmin({ action, resourceType: "profiles", userId: accessAction.dataset.userId, purpose });
        if (error) throw error;
        await loadUsers();
      } catch (error) {
        const results = root.querySelector("[data-users-results]");
        if (results) results.textContent = "Não foi possível alterar o acesso. Verifique a justificativa e a autorização.";
      } finally { accessAction.disabled = false; }
      return;
    }
    const exitSession = event.target.closest("[data-admin-session-exit]");
    if (exitSession && client) {
      exitSession.disabled = true;
      const token = sessionStorage.getItem("looplyAdminSessionToken") || "";
      try {
        await client.functions.invoke("looply-admin", { body: { action: "admin_session_revoke", token } });
      } catch (error) {
        console.error("Looply admin session revoke failed", error);
      } finally {
        sessionStorage.removeItem("looplyAdminSessionToken");
        showSessionState("locked", "Sessão ADM encerrada nesta aba.");
        exitSession.disabled = false;
      }
      return;
    }
    const refreshBroadcasts = event.target.closest("[data-broadcast-refresh]");
    const broadcastForm = root.querySelector("form[data-admin-broadcast]");
    if (refreshBroadcasts && client) {
      event.preventDefault();
      await loadBroadcasts(broadcastForm);
      return;
    }
    const deactivateBroadcast = event.target.closest("[data-broadcast-deactivate]");
    if (deactivateBroadcast && client) {
      event.preventDefault();
      const purpose = String(broadcastForm?.elements.purpose?.value || "").trim();
      if (purpose.length < 20 || purpose.length > 500) {
        if (broadcastForm) setStatus(broadcastForm, "Informe o motivo administrativo (20–500 caracteres) antes de desativar.", "error");
        return;
      }
      deactivateBroadcast.disabled = true;
      try {
        const { error } = await invokeAdmin({ action: "broadcast_deactivate", resourceType: "announcements", announcementId: deactivateBroadcast.dataset.broadcastDeactivate, purpose });
        if (error) throw error;
        await loadBroadcasts(broadcastForm, false);
        if (broadcastForm) setStatus(broadcastForm, "Comunicado desativado. Novas janelas não serão exibidas.");
      } catch (error) {
        console.error("Looply global announcement deactivation failed", error);
        if (broadcastForm) setStatus(broadcastForm, "Não foi possível desativar o comunicado.", "error");
      } finally { deactivateBroadcast.disabled = false; }
      return;
    }
    const button = event.target.closest("[data-admin-chat-start]");
    if (!button || !client) return;
    button.disabled = true;
    try {
      const { data, error } = await client.functions.invoke("looply-chat", {
        body: { action: "create_direct", targetId: button.dataset.adminChatStart }
      });
      if (error) throw error;
      if (!data?.conversationId) throw new Error(data?.errorCode || "conversation unavailable");
      root.dispatchEvent(new CustomEvent("looply:open-conversation", { detail: { conversationId: data.conversationId } }));
    } catch (error) {
      console.error("Looply admin conversation start failed", error);
      const status = button.parentElement?.querySelector("[data-status]");
      if (status) {
        status.textContent = "Não foi possível iniciar essa conversa.";
        status.dataset.kind = "error";
      }
    } finally { button.disabled = false; }
  });

  root.addEventListener("change", (event) => {
    if (event.target.matches("#adminResource")) {
      const field = root.querySelector("[data-admin-id-field]");
      if (field) field.hidden = event.target.value === "audit";
      const offsetField = root.querySelector("[data-admin-offset-field]");
      if (offsetField) offsetField.hidden = event.target.value !== "archive_media";
      const offset = root.querySelector("#adminOffset");
      if (offset && event.target.value === "archive_media") offset.value = "0";
    }
  });

  root.addEventListener("submit", async (event) => {
    const inviteForm = event.target.closest("form[data-user-invite]");
    if (inviteForm && client) {
      event.preventDefault();
      const values = new FormData(inviteForm);
      const username = String(values.get("username") || "");
      const displayName = String(values.get("displayName") || "").trim();
      const purpose = String(root.querySelector("[data-users-purpose]")?.value || "").trim();
      if (purpose.length < 20) {
        setStatus(inviteForm, "Informe uma justificativa de pelo menos 20 caracteres.", "error");
        return;
      }
      const button = inviteForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const { data, error } = await invokeAdmin({ action: "user_create_invite", resourceType: "profiles", username, email: username + "@loooply.app", displayName, purpose });
        if (error) throw error;
        inviteForm.reset();
        setStatus(inviteForm, "Convite enviado para " + (data?.email || username + "@loooply.app") + ".", "success");
        await loadUsers();
      } catch (error) {
        setStatus(inviteForm, "Não foi possível enviar o convite. A identidade pode já existir ou não estar disponível.", "error");
      } finally { if (button) button.disabled = false; }
      return;
    }

    const userProfileForm = event.target.closest("form[data-user-profile-form]");
    if (userProfileForm && client) {
      event.preventDefault();
      const purpose = String(root.querySelector("[data-users-purpose]")?.value || "").trim();
      const values = new FormData(userProfileForm);
      if (purpose.length < 20) {
        setStatus(userProfileForm, "Informe uma justificativa de pelo menos 20 caracteres.", "error");
        return;
      }
      const button = userProfileForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const { error } = await invokeAdmin({
          action: "user_update_profile", resourceType: "profiles", userId: userProfileForm.dataset.userId,
          displayName: String(values.get("displayName") || "").trim(),
          bio: String(values.get("bio") || "").trim(),
          profileVisibility: String(values.get("profileVisibility") || ""), purpose
        });
        if (error) throw error;
        setStatus(userProfileForm, "Perfil atualizado.", "success");
        await loadUsers();
      } catch {
        setStatus(userProfileForm, "Não foi possível salvar o perfil.", "error");
      } finally { if (button) button.disabled = false; }
      return;
    }

    const setupForm = event.target.closest("form[data-admin-session-setup]");
    if (setupForm && client) {
      event.preventDefault();
      const values = new FormData(setupForm);
      const password = String(values.get("password") || "");
      const confirmation = String(values.get("confirmPassword") || "");
      if (password.length < 12 || password.length > 256 || password !== confirmation) {
        setStatus(setupForm, password !== confirmation ? "As senhas não coincidem." : "Use uma senha de 12 a 256 caracteres.", "error");
        return;
      }
      const button = setupForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const { data, error } = await client.functions.invoke("looply-admin", { body: { action: "admin_session_setup", password } });
        if (error) throw error;
        if (data?.configured !== true) throw new Error(data?.error || "setup_failed");
        setupForm.reset();
        showSessionState("locked", "Senha configurada. Desbloqueie o modo ADM para iniciar uma sessão temporária.");
      } catch (error) {
        setStatus(setupForm, /already_configured/.test(String(error?.message || "")) ? "A senha já foi configurada. Use o formulário de desbloqueio." : "Não foi possível configurar a senha. Confirme sua autorização e tente novamente.", "error");
        await refreshAdminSession();
      } finally { if (button) button.disabled = false; }
      return;
    }

    const unlockForm = event.target.closest("form[data-admin-session-unlock]");
    if (unlockForm && client) {
      event.preventDefault();
      const password = String(new FormData(unlockForm).get("password") || "");
      const button = unlockForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const { data, error } = await client.functions.invoke("looply-admin", { body: { action: "admin_session_unlock", password } });
        if (error) throw error;
        if (!data?.token) throw new Error(data?.error || "unlock_failed");
        sessionStorage.setItem("looplyAdminSessionToken", data.token);
        unlockForm.reset();
        showSessionState("active", "Sessão ADM desbloqueada até " + dateTime(data.expiresAt) + ".");
      } catch (error) {
        const reason = String(error?.message || "");
        setStatus(unlockForm, /429|rate_limited/.test(reason) ? "Muitas tentativas. Aguarde antes de tentar novamente." : "Senha incorreta ou sessão indisponível.", "error");
      } finally { if (button) button.disabled = false; }
      return;
    }

    const broadcastForm = event.target.closest("form[data-admin-broadcast]");
    if (broadcastForm && client) {
      event.preventDefault();
      const submitButton = broadcastForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      try {
        const values = new FormData(broadcastForm);
        const title = String(values.get("title") || "").trim();
        const body = String(values.get("body") || "").trim();
        const purpose = String(values.get("purpose") || "").trim();
        const expiresText = String(values.get("expiresAt") || "").trim();
        if (purpose.length < 20 || purpose.length > 500) throw new Error("purpose");
        if (!title || title.length > 120 || !body || body.length > 4000) throw new Error("content");
        const expiresAt = expiresText ? new Date(expiresText) : null;
        if (expiresAt && (!Number.isFinite(expiresAt.valueOf()) || expiresAt.valueOf() <= Date.now())) throw new Error("expiry");
        const { data, error } = await invokeAdmin({
          action: "broadcast_create", resourceType: "announcements", title, body,
          expiresAt: expiresAt?.toISOString() || null, purpose
        });
        if (error) throw error;
        if (!data?.announcement?.id) throw new Error("announcement unavailable");
        broadcastForm.elements.title.value = "";
        broadcastForm.elements.body.value = "";
        broadcastForm.elements.expiresAt.value = "";
        await loadBroadcasts(broadcastForm, false);
        setStatus(broadcastForm, "Comunicado publicado. O histórico de leitura foi atualizado.");
      } catch (error) {
        console.error("Looply global announcement creation failed", error);
        const message = /purpose/.test(String(error?.message || ""))
          ? "Informe o motivo administrativo (20–500 caracteres)."
          : /expiry/.test(String(error?.message || ""))
            ? "A data de expiração precisa estar no futuro."
            : /content/.test(String(error?.message || ""))
              ? "Informe um título de até 120 e uma mensagem de até 4.000 caracteres."
              : "Não foi possível publicar o comunicado. Verifique a autorização administrativa e tente novamente.";
        setStatus(broadcastForm, message, "error");
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
      return;
    }
    const archiveCommentForm = event.target.closest("form[data-admin-archive-comment]");
    if (archiveCommentForm && client) {
      event.preventDefault();
      const button = archiveCommentForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const purpose = String(root.querySelector('[data-admin-read] textarea[name="purpose"]')?.value || "").trim();
        const body = String(new FormData(archiveCommentForm).get("body") || "").trim();
        if (purpose.length < 20 || purpose.length > 500) throw new Error("purpose");
        if (!body || body.length > 2000) throw new Error("comment");
        const { data, error } = await invokeAdmin({ action: "comment_archive_media", resourceType: "archive_media", mediaId: archiveCommentForm.dataset.mediaId, body, purpose });
        if (error) throw error;
        if (!data?.comment) throw new Error("comment unavailable");
        const saved = document.createElement("p");
        saved.className = "admin-record-body admin-comment-confirmation";
        saved.textContent = `Comentário de administrador: ${data.comment.body}`;
        archiveCommentForm.before(saved);
        archiveCommentForm.reset();
        setStatus(archiveCommentForm, "Comentário registrado e atribuído ao perfil administrador.");
      } catch (error) {
        console.error("Looply audited archive comment failed");
        setStatus(archiveCommentForm, /purpose/.test(String(error?.message || ""))
          ? "Informe o motivo da ação no campo acima (20–500 caracteres)."
          : "O comentário não foi salvo. Confira o acesso administrativo e tente novamente.", "error");
      } finally {
        if (button) button.disabled = false;
      }
      return;
    }
    const commentForm = event.target.closest("form[data-admin-comment]");
    if (commentForm && client) {
      event.preventDefault();
      const button = commentForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const purpose = String(root.querySelector('[data-admin-read] textarea[name="purpose"]')?.value || "").trim();
        const body = String(new FormData(commentForm).get("body") || "").trim();
        if (purpose.length < 20 || purpose.length > 500) throw new Error("purpose");
        if (!body || body.length > 2000) throw new Error("comment");
        const { data, error } = await invokeAdmin({ action: "comment", resourceType: "posts", postId: commentForm.dataset.postId, body, purpose });
        if (error) throw error;
        if (!data?.comment) throw new Error("comment unavailable");
        const saved = document.createElement("p");
        saved.className = "admin-record-body admin-comment-confirmation";
        saved.textContent = `Comentário de administrador: ${data.comment.body}`;
        commentForm.before(saved);
        commentForm.reset();
        setStatus(commentForm, "Comentário registrado e atribuído ao perfil administrador.");
      } catch (error) {
        console.error("Looply audited admin comment failed", error);
        const message = /purpose/.test(String(error?.message || ""))
          ? "Informe o motivo da ação no campo acima (20–500 caracteres)."
          : "O comentário não foi salvo. A publicação pode ter sido removida ou o serviço está indisponível.";
        setStatus(commentForm, message, "error");
      } finally {
        if (button) button.disabled = false;
      }
      return;
    }
    const form = event.target.closest("form[data-admin-read]");
    if (!form || !client) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    const status = form.querySelector("[data-status]");
    if (status) status.textContent = "Registrando consulta e carregando conteúdo...";
    try {
      const values = new FormData(form);
      const resourceType = String(values.get("resourceType") || "posts");
      const resourceId = String(values.get("resourceId") || "").trim() || null;
      const offset = Number(values.get("offset") || 0);
      const purpose = String(values.get("purpose") || "").trim();
      if (purpose.length < 20) throw new Error("purpose");
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Error("offset");
      const { data, error } = await invokeAdmin({ resourceType, resourceId: resourceType === "audit" ? null : resourceId, offset, purpose });
      if (error) throw error;
      renderResults(root.querySelector("[data-admin-results]"), resourceType, data?.data);
      if (status) status.textContent = `Consulta registrada · ${data?.requestId || ""}`;
      status?.setAttribute("data-kind", "success");
    } catch (error) {
      console.error("Looply audited admin read failed", error);
      const message = /purpose/.test(String(error?.message || ""))
        ? "Informe um motivo com pelo menos 20 caracteres."
        : /offset/.test(String(error?.message || ""))
          ? "Informe uma posição válida entre 0 e 10.000."
          : "A consulta não foi concluída. A associação administrativa ou o serviço não está disponível.";
      if (status) {
        status.textContent = message;
        status.dataset.kind = "error";
      }
    } finally {
      if (button) button.disabled = false;
    }
  });
}

