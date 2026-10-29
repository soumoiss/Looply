import { icon } from "./icons.js";
import { sealLetter } from "./letters-community.js";
import { hashArchivePassword } from "./archive-import.js";
import { decodeStoryBody } from "./story-text-style.js";
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

export async function invokeAdminAction(client, body = {}) {
  if (!client) throw new Error("admin_client_unavailable");
  // Every protected operation is authorized server-side against the authenticated
  // user's administrator membership. No separate temporary ADM unlock is needed.
  const { adminSessionToken: _ignoredToken, ...action } = body || {};
  return client.functions.invoke("looply-admin", { body: action });
}

export function adminMarkup(profile = {}) {
  const adminName = profile.username === "peixinho" ? "Peixinho" : `@${escapeHtml(profile.username || "administrador")}`;
  return `<section class="admin-area" aria-labelledby="adminTitle">
    <div class="admin-heading"><div><span class="section-kicker">Acesso verificado pelo servidor</span><h2 id="adminTitle">Administração</h2></div>
      <span class="admin-badge">${adminName} · administrador</span></div>
    <p class="admin-description">Acesso administrativo vinculado à conta Peixinho. As operações continuam sendo verificadas pelo servidor.</p>
    <section class="admin-broadcast-panel" aria-labelledby="adminUsersTitle">
      <div class="admin-broadcast-heading"><div><span class="section-kicker">Contas e permissões</span><h3 id="adminUsersTitle">Gerenciamento de usuários</h3></div><button class="text-button" type="button" data-users-refresh>Atualizar lista</button></div>
      <p class="admin-description">Consulte contas, edite o perfil, suspenda ou restaure o acesso. A criação usa o backend administrativo, preserva a sessão do Peixinho e registra a operação na auditoria.</p>
      <form class="admin-broadcast-form" data-user-create>
        <h4>Cadastrar novo usuário</h4>
        <div class="field"><label for="adminCreateUsername">Username</label><input id="adminCreateUsername" name="username" type="text" minlength="3" maxlength="30" pattern="[a-zA-Z0-9_]{3,30}" autocomplete="off" required placeholder="Ex.: maria_silva" aria-describedby="adminCreateUsernameStatus"><small>Digite sem @; serão aceitos 3–30 caracteres: letras, números e sublinhado. O sistema salva em minúsculas.</small><small id="adminCreateUsernameStatus" data-availability="username" class="form-status" role="status" aria-live="polite"></small></div>
        <div class="field"><label for="adminCreateEmail">E-mail (opcional, usado internamente se não informado)</label><input id="adminCreateEmail" name="email" type="email" maxlength="254" autocomplete="off" placeholder="pessoa@exemplo.com" aria-describedby="adminCreateEmailStatus"><small id="adminCreateEmailStatus" data-availability="email" class="form-status" role="status" aria-live="polite"></small></div>
        <div class="field"><label for="adminCreateDisplayName">Nome completo / de exibição</label><input id="adminCreateDisplayName" name="displayName" type="text" maxlength="80" autocomplete="off" required></div>
        <div class="field"><label for="adminCreatePlaylistUrl">URL da playlist do YouTube <span class="field-hint">(opcional)</span></label><input id="adminCreatePlaylistUrl" name="playlistUrl" type="url" maxlength="260" autocomplete="off" placeholder="https://www.youtube.com/playlist?list=..."><small>A playlist personalizada substitui a lista padrão deste perfil.</small></div>
        <div class="field"><label for="adminCreatePassword">Senha inicial <span class="field-hint">(opcional)</span></label><input id="adminCreatePassword" name="password" type="password" minlength="8" maxlength="72" autocomplete="new-password"><small>Se ficar vazia, o sistema gera uma senha temporária segura e mostra-a uma única vez.</small></div>
        <div class="field"><label for="adminCreateConfirmPassword">Confirmar senha inicial <span class="field-hint">(opcional)</span></label><input id="adminCreateConfirmPassword" name="confirmPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password"></div>
        <p class="admin-description">A conta será criada como usuário comum, com e-mail confirmado para permitir login imediato. O processo não altera a sessão do ADM.</p>
        <button class="primary-button compact-button" type="submit">Cadastrar usuário</button><span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>
    <div class="field"><label for="adminUsersPurpose">Justificativa para consultar e administrar usuários</label><textarea id="adminUsersPurpose" data-users-purpose minlength="20" maxlength="500" rows="2" required placeholder="Descreva a finalidade do acesso administrativo (mínimo 20 caracteres)."></textarea></div>
    <p class="form-status" data-users-feedback role="status" aria-live="polite"></p>
    <div class="admin-results" data-users-results aria-live="polite"><p>Carregando contas cadastradas no Neon…</p></div>
    </section>
    <section class="admin-broadcast-panel admin-settings-panel" aria-labelledby="appSettingsTitle" data-app-settings-panel>
      <div class="admin-broadcast-heading"><div><span class="section-kicker">Configurações globais</span><h3 id="appSettingsTitle">Controles do aplicativo</h3></div></div>
      <p class="admin-description">As alterações são gravadas no Neon e aplicadas aos usuários ao abrir as páginas. O ADM permanece com acesso durante a manutenção.</p>
      <form class="admin-broadcast-form" data-app-settings-form>
        <div class="field admin-maintenance-toggle"><label for="maintenanceMode">Modo de manutenção</label><label class="looply-switch"><input id="maintenanceMode" name="maintenance_mode" type="checkbox"><span class="looply-switch-track" aria-hidden="true"></span><span class="looply-switch-label" data-maintenance-label>Desativado</span></label></div>
        <div class="field"><label for="maintenanceMessage">Mensagem de manutenção</label><textarea id="maintenanceMessage" name="maintenance_message" rows="2" maxlength="500">Sistema em atualização rápida por Peixinho</textarea></div>
        <div class="admin-broadcast-actions"><button class="primary-button compact-button" type="button" data-maintenance-save>Salvar modo de manutenção</button></div>
        <div class="field"><label for="musicOfDayTitle">Música do dia — título/dedicatória</label><input id="musicOfDayTitle" name="music_of_the_day_title" type="text" maxlength="180" placeholder="Dedicada a você!"></div>
        <div class="field"><label for="musicOfDayUrl">Link do YouTube</label><input id="musicOfDayUrl" name="music_of_the_day_url" type="url" maxlength="1000" placeholder="https://www.youtube.com/watch?v=..."></div>
        <div class="admin-broadcast-actions"><button class="primary-button compact-button" type="button" data-music-save>Atualizar Música do Dia</button></div>
        <div class="field"><label for="welcomeBannerText">Mensagem de boas-vindas da Home</label><textarea id="welcomeBannerText" name="welcome_banner_text" rows="3" maxlength="500" placeholder="Escreva a mensagem que aparecerá no topo da Home."></textarea></div>
        <div class="admin-broadcast-actions"><button class="primary-button compact-button" type="button" data-welcome-save>Salvar Mensagem de Boas-Vindas</button></div>
        <span class="form-status" data-app-settings-status role="status" aria-live="polite"></span>
      </form>
    </section>
    <section class="admin-broadcast-panel" aria-labelledby="adminBroadcastTitle">
      <div class="admin-broadcast-heading"><div><span class="section-kicker">Aviso para todas as contas</span><h3 id="adminBroadcastTitle">Comunicado global</h3></div></div>
      <p class="admin-description">O aviso aparece como uma janela dentro do Looply. Cada conta registra sua própria leitura, e o histórico mostra quem leu e quem ainda não leu.</p>
      <form class="admin-broadcast-form" data-admin-broadcast>
        <div class="field"><label for="broadcastTitle">Título do aviso</label><input id="broadcastTitle" name="title" type="text" maxlength="120" required placeholder="Ex.: Atualização do Looply"></div>
        <div class="field"><label for="broadcastBody">Mensagem</label><textarea id="broadcastBody" name="body" maxlength="4000" rows="4" required placeholder="Escreva a mensagem que todos os membros devem receber."></textarea></div>
        <div class="field"><label for="broadcastMedia">Mídia opcional (imagem ou vídeo)</label><input id="broadcastMedia" name="media" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"><small>Até 20 MB. A prévia aparece antes da publicação.</small><div data-broadcast-media-preview class="admin-broadcast-media-preview" hidden></div></div>
        <div class="field"><label for="broadcastExpiresAt">Expira em (opcional)</label><input id="broadcastExpiresAt" name="expiresAt" type="datetime-local"><small>Sem data de expiração, o aviso permanece ativo até ser desativado.</small></div>
        <div class="field"><label for="broadcastPurpose">Justificativa administrativa</label><textarea id="broadcastPurpose" name="purpose" minlength="20" maxlength="500" rows="2" required placeholder="Informe por que o comunicado será enviado (mínimo 20 caracteres)."></textarea></div>
        <div class="admin-broadcast-actions"><button class="primary-button compact-button" type="submit">Publicar comunicado</button><button class="text-button" type="button" data-broadcast-refresh>Consultar leituras</button></div>
        <span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>
      <div class="admin-broadcast-results" data-broadcast-results aria-live="polite"><p>Informe o motivo administrativo e consulte o histórico para ver os recibos de leitura.</p></div>
    </section>
    <section class="admin-broadcast-panel secret-vip-admin" aria-labelledby="secretVipTitle">
      <div class="admin-broadcast-heading"><div><span class="section-kicker">Mensagem individual</span><h3 id="secretVipTitle">💌 Enviar Recado Secreto VIP</h3></div><button class="text-button" type="button" data-secret-refresh>Atualizar histórico</button></div>
      <p class="admin-description">O recado só pode ser consultado pelo destinatário escolhido e reaparece até ser guardado como lido.</p>
      <form class="admin-broadcast-form" data-secret-message-form>
        <div class="field"><label for="secretRecipient">Destinatário</label><select id="secretRecipient" name="recipient_id" required><option value="">Carregando usuários…</option></select></div>
        <div class="field"><label for="secretTitle">Título do recado (opcional)</label><input id="secretTitle" name="title" maxlength="160" placeholder="Psiu... Olha só isso!"></div>
        <div class="field"><label for="secretContent">Conteúdo do recado</label><textarea id="secretContent" name="content" rows="4" maxlength="5000" required placeholder="Escreva seu recado especial…"></textarea></div>
        <div class="field"><label for="secretMedia">Foto ou imagem opcional</label><input id="secretMedia" name="media" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><small>Imagem de até 10 MB. A mídia fica em armazenamento privado e só o destinatário e o ADM podem acessá-la.</small><div class="secret-media-preview" data-secret-media-preview hidden></div></div>
        <div class="field"><label for="secretPurpose">Justificativa administrativa</label><textarea id="secretPurpose" name="purpose" minlength="20" maxlength="500" rows="2" required placeholder="Descreva a finalidade do recado (mínimo 20 caracteres)."></textarea></div>
        <button class="primary-button compact-button" type="submit">Enviar Recado Secreto ✨</button><span class="form-status" data-secret-status role="status" aria-live="polite"></span>
      </form>
      <div class="admin-broadcast-results" data-secret-history aria-live="polite"><p>Carregando histórico de recados…</p></div>
    </section>
    <form class="admin-read-form" data-admin-read>
      <div class="admin-form-grid">
        <div class="field"><label for="adminResource">Área</label><select id="adminResource" name="resourceType">
          <option value="posts">Publicações, comentários e mídias</option>
          <option value="music_dedications">Músicas e comentários</option>
          <option value="music_library">Coleções pessoais de músicas</option>
          <option value="youtube_track_comments">Comentários por música</option>
          <option value="letters">Cartas para Peixinho</option>
          <option value="community_letters">Cartas da comunidade (todos os usuários)</option>
          <option value="conversations">Conversas privadas</option>
          <option value="chat_messages">Mensagens de chat e anexos</option>
          <option value="profiles">Perfis</option>
          <option value="post_media">Arquivo de mídia</option>
          <option value="archived_cards">Cartas importadas · enviadas por Peixinho</option>
          <option value="archive_media">Mídias antigas</option>
          <option value="archive_media_comments">Comentários das mídias antigas</option>
          <option value="stories">Stories</option>
          <option value="community_gallery_media">Galeria comunitária</option>
          <option value="audit">Trilha de auditoria</option>
        </select></div>
        <div class="field" data-admin-id-field><label for="adminResourceId">UUID específico (opcional)</label><input id="adminResourceId" name="resourceId" type="text" maxlength="36" placeholder="Deixe vazio para consultar a lista recente"></div>
        <div class="field" data-admin-offset-field hidden><label for="adminOffset">Posição da lista</label><input id="adminOffset" name="offset" type="number" min="0" max="10000" step="100" value="0"><small>Cartas, mídias e auditoria são exibidas em grupos de 100.</small><div class="admin-broadcast-actions"><button class="text-button" type="button" data-admin-page="previous" disabled>Anterior</button><button class="text-button" type="button" data-admin-page="next">Próximas 100</button></div></div>
      </div>
      <div class="field"><label for="adminReadPurpose">Motivo da consulta administrativa</label><textarea id="adminReadPurpose" name="purpose" minlength="20" maxlength="500" rows="2" required placeholder="Descreva por que precisa consultar esses dados privados (mínimo 20 caracteres)."></textarea></div>
      <button class="primary-button compact-button" type="submit">Registrar e consultar ${icon("search")}</button>
      <span class="form-status" data-status role="status" aria-live="polite"></span>
    </form>
    <div class="admin-results" data-admin-results aria-live="polite"><p>Consultas administrativas aparecem aqui depois de registradas.</p></div>
    <div data-archive-import></div>
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

// Only offer irreversible actions implemented by the installed Neon RPC.
// Unsupported categories retain the reversible moderation control.
export const ADMIN_DELETE_TYPES = new Set([
  "post", "comment", "story", "community_letter",
  "community_gallery_media", "archive_media_comment", "music_page_comment"
]);
function moderationFormMarkup(contentType, contentId, hidden) {
  const deleteButton = ADMIN_DELETE_TYPES.has(contentType)
    ? `<button class="text-button admin-danger-action" type="button" data-delete-content data-content-type="${escapeHtml(contentType)}" data-content-id="${escapeHtml(contentId)}">Excluir definitivamente</button>`
    : "";
  return `<form class="admin-comment-form" data-moderate-content data-content-type="${escapeHtml(contentType)}" data-content-id="${escapeHtml(contentId)}" data-hidden="${hidden ? "true" : "false"}">
    <button class="text-button" type="submit">${hidden ? "Restaurar conteúdo" : "Ocultar conteúdo"}</button>
    ${deleteButton}
    <span class="form-status" data-status role="status" aria-live="polite"></span></form>`;
}

function itemMarkup(resourceType, item) {
  if (resourceType === "posts") {
    const comments = (item.comments || []).map((comment) => `<li><strong>@${escapeHtml(comment.author?.username || "perfil restrito")}</strong><p>${escapeHtml(comment.body)}</p>${moderationFormMarkup("comment", comment.id, comment.moderated)}</li>`).join("");
    const media = (item.media || []).map(mediaMarkup).join("");
    return `<article class="admin-record"><div class="admin-record-top"><strong>@${escapeHtml(item.author?.username || "perfil restrito")}</strong><span>${escapeHtml(item.visibility)} · ${escapeHtml(dateTime(item.created_at))}</span></div>
      <p class="admin-record-body">${escapeHtml(item.body)}</p>${moderationFormMarkup("post", item.id, item.moderated)}${media ? `<div class="admin-media-grid">${media}</div>` : ""}
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
    return `<article class="admin-record"><div class="admin-record-top"><strong>${escapeHtml(item.author?.display_name || item.author?.username || "Usuário")} · comentário de música</strong><span>${escapeHtml(dateTime(item.created_at))}</span></div><p class="admin-record-body">${escapeHtml(item.body)}</p>${moderationFormMarkup("music_page_comment", item.id, item.moderated)}<p>Playlist: ${escapeHtml(item.playlist_id)} · Vídeo: ${escapeHtml(item.video_id)}</p><small>Comentário UUID: ${escapeHtml(item.id)}</small></article>`;
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
  if (resourceType === "stories") {
    const media = (item.media || []).map(mediaMarkup).join("");
    return `<article class="admin-record"><div class="admin-record-top"><strong>@${escapeHtml(item.author?.username || "perfil restrito")} · Story</strong><span>${escapeHtml(dateTime(item.created_at))}</span></div><p class="admin-record-body">${escapeHtml(decodeStoryBody(item.body || "").text)}</p>${media ? `<div class="admin-media-grid">${media}</div>` : ""}${moderationFormMarkup("story", item.id, item.moderated)}<small>Story UUID: ${escapeHtml(item.id)}</small></article>`;
  }
  if (resourceType === "community_gallery_media") {
    return `<article class="admin-record"><div class="admin-record-top"><strong>${escapeHtml(item.file_name)} · ${escapeHtml(item.kind)}</strong><span>@${escapeHtml(item.owner?.username || "perfil restrito")}</span></div>${mediaMarkup(item)}${moderationFormMarkup("community_gallery_media", item.id, item.moderated)}<p>${escapeHtml(item.caption || "")}</p><small>Mídia UUID: ${escapeHtml(item.id)}</small></article>`;
  }
  if (resourceType === "archived_cards") {
    const recipient = item.recipient?.display_name || item.recipient?.username || "Perfil";
    const body = item.body ? `<details class="admin-archive-card-body"><summary>Visualizar carta</summary><pre>${escapeHtml(item.body)}</pre></details>` : `<p class="admin-record-body">O conteúdo da carta não está disponível.</p>`;
    return `<article class="admin-record"><div class="admin-record-top"><strong>${escapeHtml(item.original_file)} · ${escapeHtml(recipient)}</strong><span>${item.is_private ? "Privada" : "Carta"}${item.is_protected ? " · protegida" : ""}${item.sent_date ? ` · ${escapeHtml(item.sent_date)}` : ""}</span></div>
      <p>Enviada por Peixinho · ADM</p>${item.password_hint ? `<p class="admin-record-hint">Dica: ${escapeHtml(item.password_hint)}</p>` : ""}${body}
      <button class="text-button" type="button" data-edit-archived-card>${item.is_protected ? "Substituir carta protegida" : "Editar carta"}</button>
      <form class="admin-community-letter-edit" data-edit-archived-card-form data-card-id="${escapeHtml(item.id)}" data-recipient-id="${escapeHtml(item.recipient_id)}" data-original-file="${escapeHtml(item.original_file)}" data-card-number="${escapeHtml(item.card_number)}" data-private="${item.is_private ? "true" : "false"}" data-protected="${item.is_protected ? "true" : "false"}" hidden>
        ${item.is_protected ? `<p class="admin-record-hint">A senha antiga não pode ser recuperada. Ao salvar, defina uma nova senha para o conteúdo substituto.</p>` : ""}
        <label>Texto da carta<textarea name="body" maxlength="100000" required>${item.is_protected ? "" : escapeHtml(item.body)}</textarea></label>
        <label>Data da carta<input name="sent_date" type="date" value="${escapeHtml(item.sent_date || "")}"></label>
        <label>Dica da senha (opcional)<input name="password_hint" maxlength="300" value="${escapeHtml(item.password_hint || "")}"></label>
        <label>Nova senha ${item.is_protected ? "(obrigatória)" : "(opcional)"}<input name="password" type="password" maxlength="256" autocomplete="new-password" ${item.is_protected ? "required" : ""}></label>
        <button class="text-button" type="submit">Salvar carta</button><button class="text-button" type="button" data-cancel-archived-card-edit>Cancelar</button><span class="form-status" data-status role="status" aria-live="polite"></span>
      </form><button class="text-button admin-danger-action" type="button" data-delete-archived-card="${escapeHtml(item.id)}">Excluir carta importada permanentemente</button><small>Carta UUID: ${escapeHtml(item.id)}</small></article>`;
  }
  if (resourceType === "community_letters") {
    const sender = item.sender?.display_name || item.sender?.username || "perfil restrito";
    const recipient = item.recipient?.display_name || item.recipient?.username || "perfil restrito";
    const body = item.is_protected
      ? `<p class="admin-record-body">Carta protegida. O ADM não lê o texto atual; use a edição para substituir o conteúdo e definir uma nova senha.</p>`
      : `<p class="admin-record-body">${escapeHtml(item.body)}</p>`;
    return `<article class="admin-record"><div class="admin-record-top"><strong>Carta · ${escapeHtml(item.subject)}</strong><span>${escapeHtml(dateTime(item.created_at))}</span></div>
      <p>${escapeHtml(sender)} (@${escapeHtml(item.sender?.username || "perfil restrito")}) → ${escapeHtml(recipient)} (@${escapeHtml(item.recipient?.username || "perfil restrito")})${item.is_protected ? " · protegida" : ""}</p>${body}
      <button class="text-button" type="button" data-edit-community-letter>${item.is_protected ? "Substituir carta protegida" : "Editar carta"}</button>
      <form class="admin-community-letter-edit" data-edit-community-letter-form data-letter-id="${escapeHtml(item.id)}" data-protected="${item.is_protected ? "true" : "false"}" hidden>
        ${item.is_protected ? `<p class="admin-record-hint">O texto cifrado atual não pode ser recuperado. Esta operação o substitui por uma nova carta.</p>` : ""}
        <label>Assunto<input name="subject" maxlength="120" required value="${escapeHtml(item.subject)}"></label>
        <label>Novo texto<textarea name="body" maxlength="5000" required>${item.is_protected ? "" : escapeHtml(item.body)}</textarea></label>
        <label>Senha para proteção<input name="password" type="password" minlength="1" maxlength="256" autocomplete="new-password" data-community-letter-password ${item.is_protected ? "required" : "disabled"}></label>
        ${item.is_protected ? `<input type="hidden" name="is_protected" value="true">` : `<label><input type="checkbox" name="is_protected" value="true" data-community-letter-protect> Proteger carta com senha</label>`}
        <button class="text-button" type="submit">Salvar edição</button><button class="text-button" type="button" data-cancel-community-letter-edit>Cancelar</button><span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>
      <button class="text-button admin-danger-action" type="button" data-delete-content data-content-type="community_letter" data-content-id="${escapeHtml(item.id)}">Excluir carta</button>
      <small>Carta UUID: ${escapeHtml(item.id)}</small></article>`;
  }
  if (resourceType === "archive_media") {
    const recipients = (item.recipients || []).map((entry) => `@${escapeHtml(entry.profile?.username || "perfil restrito")}`).join(" · ");
    const comments = (item.comments || []).map((comment) => `<li><strong>@${escapeHtml(comment.author?.username || "perfil restrito")}</strong><p>${escapeHtml(comment.body)}</p></li>`).join("");
    return `<article class="admin-record"><div class="admin-record-top"><strong>${escapeHtml(item.file_name)} · ${escapeHtml(item.kind)}</strong><span>${escapeHtml(item.visibility)}${item.source_date ? ` · ${escapeHtml(dateTime(item.source_date))}` : ""}</span></div>
      ${mediaMarkup({ ...item, alt_text: item.file_name })}${moderationFormMarkup("archive_media", item.id, item.moderated)}<p>${escapeHtml(item.source_path)} · ${escapeHtml(String(Math.ceil(item.byte_size / 1024)))} KiB${recipients ? ` · ${recipients}` : ""}</p>
      ${comments ? `<details><summary>${item.comments.length} comentário(s)</summary><ul>${comments}</ul></details>` : "<p class=\"admin-empty\">Nenhum comentário.</p>"}
      <form class="admin-comment-form" data-admin-archive-comment data-media-id="${escapeHtml(item.id)}"><label class="visually-hidden" for="admin-archive-comment-${escapeHtml(item.id)}">Comentário administrativo</label><textarea id="admin-archive-comment-${escapeHtml(item.id)}" name="body" maxlength="2000" required placeholder="Comente como administrador..."></textarea><button class="text-button" type="submit">Comentar como administrador</button><span class="form-status" data-status role="status" aria-live="polite"></span></form>
      <small>Mídia UUID: ${escapeHtml(item.id)}</small></article>`;
  }
  if (resourceType === "archive_media_comments") {
    return `<article class="admin-record"><div class="admin-record-top"><strong>@${escapeHtml(item.author?.username || "perfil restrito")}</strong><span>${escapeHtml(dateTime(item.created_at))}</span></div><p class="admin-record-body">${escapeHtml(item.body)}</p>${moderationFormMarkup("archive_media_comment", item.id, item.moderated)}<p>${escapeHtml(item.media?.file_name || "Mídia antiga")} · ${escapeHtml(item.media?.visibility || "")}</p><small>Comentário UUID: ${escapeHtml(item.id)} · Mídia UUID: ${escapeHtml(item.media_id)}</small></article>`;
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

async function signAdminMediaRows(client,resourceType,rows) {
  const requests=[];
  const seen=new Set();
  const collect=row=>{
    if(!row || typeof row!=="object")return;
    const path=String(row.storage_path||"");
    const bucket=resourceType==="community_gallery_media"
      || /^gallery\//.test(path)?"looply-gallery"
      : /^conversations\//.test(path)?"looply-chat"
      : /^(?:posts|stories|comments|legacy-archive)\//.test(path)?"looply-media":null;
    if(bucket && !seen.has(bucket+":"+path)){
      seen.add(bucket+":"+path);
      requests.push({row,bucket,path});
    }
    for(const key of ["media","comments"]) {
      if(Array.isArray(row[key]))row[key].forEach(collect);
    }
  };
  rows.forEach(collect);
  const tasks=requests.slice(0,200);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(6,tasks.length)},async()=>{
    while(cursor<tasks.length) {
      const item=tasks[cursor++];
      try{
        const {data,error}=await client.storage.from(item.bucket).createSignedUrl(item.path,900);
        if(!error && /^https:\/\//.test(data?.signedUrl||""))item.row.signed_url=data.signedUrl;
      }catch(error){console.warn("ADM media signing failed",error);}
    }
  }));
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
  const secretForm = root.querySelector("[data-secret-message-form]");
  const secretRecipient = root.querySelector("[data-secret-message-form] select[name='recipient_id']");
  const secretMediaInput = root.querySelector("#secretMedia");
  const secretPreview = root.querySelector("[data-secret-media-preview]");
  let selectedSecretMedia = null;

  async function loadSecretRecipients() {
    if (!secretRecipient) return;
    try {
      const { data, error } = await client.from("profiles").select("id,username,display_name").order("username");
      if (error) throw error;
      secretRecipient.replaceChildren(new Option("Escolha um usuário…", ""));
      for (const person of data || []) secretRecipient.add(new Option(`${person.display_name || person.username} · @${person.username}`, person.id));
    } catch (error) {
      console.error("Secret VIP recipients unavailable", error);
      secretRecipient.replaceChildren(new Option("Não foi possível carregar usuários", ""));
    }
  }

  async function loadSecretHistory() {
    const history = root.querySelector("[data-secret-history]");
    if (!history) return;
    history.textContent = "Carregando histórico…";
    try {
      const { data: response, error } = await invokeAdmin({action:"secret_list",resourceType:"secret_messages"});
      if (error) throw error;
      if (!Array.isArray(response?.messages)) throw Error("secret_history_invalid_response");
      const data = response.messages;
      history.replaceChildren();
      if (!data.length) { history.textContent = "Ainda não há recados enviados."; return []; }
      for (const item of data) {
        const card = document.createElement("article"); card.className = "admin-record";
        const top = document.createElement("div"); top.className = "admin-record-top";
        const who = document.createElement("strong"); who.textContent = `${item.recipient?.display_name || item.recipient?.username || "Destinatário"} · @${item.recipient?.username || "usuário"}`;
        const status = document.createElement("span"); status.textContent = item.is_read ? `Lido em ${dateTime(item.read_at)} ✅` : "Aguardando leitura ⏳";
        top.append(who, status);
        const title = document.createElement("h4"); title.textContent = item.title || "Recado secreto";
        const body = document.createElement("p"); body.className = "admin-record-body"; body.textContent = item.content;
        card.append(top, title, body);
        if (item.media_url) {
          const {data:signed}=await client.storage.from("looply-secret-messages").createSignedUrl(item.media_url,900);
          if(signed?.signedUrl){const image=document.createElement("img");image.alt="Imagem do recado secreto";image.src=signed.signedUrl;image.loading="lazy";image.style.maxWidth="min(240px,100%)";card.append(image);}
        }
        if (!item.is_read) {
          const remove = document.createElement("button"); remove.type = "button"; remove.className = "text-button admin-danger-action"; remove.dataset.secretDelete = item.id; remove.textContent = "Cancelar recado não lido"; card.append(remove);
        }
        history.append(card);
      }
      return data;
    } catch (error) {
      console.error("Secret VIP history unavailable", error);
      history.textContent = "Histórico indisponível: " + String(error?.message || "erro desconhecido");
      return null;
    }
  }

  if (secretForm) {
    void loadSecretRecipients();
    void loadSecretHistory();
    secretMediaInput?.addEventListener("change", () => {
      selectedSecretMedia = secretMediaInput.files?.[0] || null;
      if (secretPreview) {
        secretPreview.replaceChildren(); secretPreview.hidden = !selectedSecretMedia;
        if (selectedSecretMedia) {
          const img = document.createElement("img"); img.alt = "Prévia do recado VIP"; img.src = URL.createObjectURL(selectedSecretMedia);
          img.onload = () => URL.revokeObjectURL(img.src); secretPreview.append(img);
        }
      }
    });
  }
  async function loadUsers() {
    const results = root.querySelector("[data-users-results]");
    const purpose = String(root.querySelector("[data-users-purpose]")?.value || "").trim()
      || "Listagem de contas na abertura do painel administrativo";
    if (!results) return null;
    results.textContent = "Carregando contas…";
    try {
      const { data, error } = await invokeAdmin({ action: "users_list", resourceType: "profiles", purpose });
      if (error) throw error;
      results.replaceChildren();
      const users = data?.users || [];
      if (!users.length) {
        results.textContent = "Nenhuma conta encontrada.";
        return [];
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
        lastSignIn.textContent = user.lastSignInAt ? "Último acesso: " + dateTime(user.lastSignInAt) : "Último acesso não informado pelo Neon Auth.";
        const form = document.createElement("form");
        form.className = "admin-broadcast-form";
        form.dataset.userProfileForm = "";
        form.dataset.userId = user.id;
        const fields = [
          ["displayName", "Nome de exibição", user.display_name || "", 80],
          ["bio", "Biografia", user.bio || "", 280],
          ["playlistUrl", "URL da playlist do YouTube", user.playlist_url || "", 260]
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
      return users;
    } catch (error) {
      results.textContent = "Falha ao carregar contas: " + String(error?.message || "erro desconhecido") + ". Verifique sua sessão administrativa.";
      return null;
    }
  }

  function validatedUserPurpose() {
    const purpose=String(root.querySelector("[data-users-purpose]")?.value || "").trim();
    if(purpose.length<20 || purpose.length>500) throw Error("Informe uma justificativa administrativa de 20 a 500 caracteres.");
    return purpose;
  }

  async function invokeAdmin(body) {
    const response = await invokeAdminAction(client, body);
    if (response?.error) {
      console.error("Looply ADM operation rejected", {
        action: body?.action || "read",
        resourceType: body?.resourceType,
        code: response.error.code,
        status: response.error.status,
        message: response.error.message
      });
    }
    return response;
  }

  let availabilityTimer = null;
  let availabilityRequest = 0;
  root.addEventListener("input", (event) => {
    const form = event.target.closest("form[data-user-create]");
    if (!form || !["username", "email"].includes(event.target.name)) return;
    const username = String(form.elements.username.value || "").trim().replace(/^@/, "").toLowerCase();
    const email = String(form.elements.email.value || "").trim().toLowerCase();
    const purpose = String(root.querySelector("[data-users-purpose]")?.value || "").trim();
    const usernameStatus = form.querySelector('[data-availability="username"]');
    const emailStatus = form.querySelector('[data-availability="email"]');
    if (usernameStatus) { usernameStatus.textContent = ""; usernameStatus.dataset.kind = ""; }
    if (emailStatus) { emailStatus.textContent = ""; emailStatus.dataset.kind = ""; }
    if (availabilityTimer) clearTimeout(availabilityTimer);
    const requestNumber = ++availabilityRequest;
    if (!/^[a-z0-9_]{3,30}$/.test(username) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (usernameStatus && /^[a-z0-9_]{3,30}$/.test(username)) usernameStatus.textContent = "Verificando disponibilidade…";
    if (emailStatus && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) emailStatus.textContent = "Verificando disponibilidade…";
    availabilityTimer = setTimeout(async () => {
      try {
        const { data, error } = await invokeAdmin({
          action: "user_check_availability",
          resourceType: "profiles",
          username: /^[a-z0-9_]{3,30}$/.test(username) ? username : "",
          email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
          purpose
        });
        if (error) throw error;
        if (requestNumber !== availabilityRequest) return;
        if (usernameStatus && /^[a-z0-9_]{3,30}$/.test(username)) {
          usernameStatus.textContent = data?.usernameAvailable ? "Username disponível." : "Este username já está em uso.";
          usernameStatus.dataset.kind = data?.usernameAvailable ? "success" : "error";
        }
        if (emailStatus && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          emailStatus.textContent = data?.emailAvailable ? "E-mail disponível." : "Este e-mail já está cadastrado.";
          emailStatus.dataset.kind = data?.emailAvailable ? "success" : "error";
        }
      } catch (error) {
        if (requestNumber !== availabilityRequest) return;
        if (usernameStatus) { usernameStatus.textContent = "Não foi possível verificar agora."; usernameStatus.dataset.kind = "error"; }
        if (emailStatus) { emailStatus.textContent = "Não foi possível verificar agora."; emailStatus.dataset.kind = "error"; }
      }
    }, 450);
  });

  async function loadBroadcasts(form, showStatus = true) {
    const purpose = String(form?.elements.purpose?.value || "").trim();
    const results = root.querySelector("[data-broadcast-results]");
    const refreshButton = form?.querySelector("[data-broadcast-refresh]");
    if (refreshButton) refreshButton.disabled = true;
    if (showStatus && form) setStatus(form, "Consultando comunicados e recibos de leitura…", "info");
    try {
      const { data, error } = await invokeAdmin({ action: "broadcast_list", resourceType: "announcements", purpose });
      if (error) throw error;
      const announcements = data?.announcements || [];
      await Promise.all(announcements.map(async item => {
        if(!/^announcements\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp|gif|mp4|webm)$/i.test(item.media_url||""))return;
        item.media_kind=/\.(?:mp4|webm)$/i.test(item.media_url)?"video":"image";
        const {data:signed,error:signError}=await client.storage.from("looply-announcements").createSignedUrl(item.media_url,1800);
        item.media_url=signError?null:signed?.signedUrl||null;
      }));
      if (results) {
        results.innerHTML = announcements.length ? announcements.map((item) => {
          const readers = (item.readers || []).map((reader) => `<li><strong>@${escapeHtml(reader.username || reader.display_name || "usuário")}</strong><span>${reader.read_at ? `Lido em ${escapeHtml(dateTime(reader.read_at))}` : "Ainda não leu"}</span></li>`).join("");
          return `<article class="admin-broadcast-record"><div class="admin-record-top"><strong>${escapeHtml(item.title)}</strong><span>${item.is_active ? "Ativo" : "Desativado"}</span></div><p class="admin-broadcast-body">${escapeHtml(item.body)}</p>${item.media_url ? (item.media_kind === "video" ? `<video class="admin-broadcast-media-preview-content" src="${escapeHtml(item.media_url)}" controls preload="metadata"></video>` : `<a class="admin-broadcast-media-link" href="${escapeHtml(item.media_url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(item.media_url)}" alt="Mídia do comunicado" loading="lazy"></a>`) : ""}<p class="admin-broadcast-meta">Publicado em ${escapeHtml(dateTime(item.created_at))}${item.expires_at ? ` · Expira em ${escapeHtml(dateTime(item.expires_at))}` : ""}</p><p class="admin-broadcast-meta">Leituras: ${Number(item.read_count || 0)} de ${Number(item.recipient_count || 0)} contas</p><details><summary>Ver estado de leitura por conta</summary><ul class="admin-broadcast-readers">${readers}</ul></details>${item.is_active ? `<button class="text-button" type="button" data-broadcast-deactivate="${escapeHtml(item.id)}">Desativar comunicado</button>` : ""}</article>`;
        }).join("") : '<p class="admin-empty">Nenhum comunicado foi publicado.</p>';
      }
      if (showStatus && form) setStatus(form, `Histórico atualizado · ${announcements.length} comunicado(s).`);
      return true;
    } catch (error) {
      console.error("Looply global announcement history failed", error);
      if (results) results.textContent = "Histórico indisponível: " + String(error?.message || "erro de consulta");
      if (form) setStatus(form, "Não foi possível carregar o histórico.", "error");
      return false;
    } finally {
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  const mediaInput = root.querySelector("#broadcastMedia");
  const mediaPreview = root.querySelector("[data-broadcast-media-preview]");
  let selectedBroadcastMedia = null;
  mediaInput?.addEventListener("change", () => {
    const file = mediaInput.files?.[0] || null;
    selectedBroadcastMedia = null;
    if (mediaPreview) { mediaPreview.replaceChildren(); mediaPreview.hidden = true; }
    if (!file) return;
    const allowed = ["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm"];
    if (!allowed.includes(file.type) || file.size > 20 * 1024 * 1024) {
      mediaInput.value = "";
      setStatus(mediaInput.closest("form"), "Escolha imagem/vídeo compatível de até 20 MB.", "error");
      return;
    }
    selectedBroadcastMedia = file;
    if (!mediaPreview) return;
    const preview = document.createElement(file.type.startsWith("video/") ? "video" : "img");
    preview.className = "admin-broadcast-media-preview-content";
    preview.src = URL.createObjectURL(file);
    if (preview.tagName === "VIDEO") { preview.controls = true; preview.playsInline = true; }
    else preview.alt = "Prévia da mídia do comunicado";
    mediaPreview.append(preview);
    mediaPreview.hidden = false;
  });
  const settingsForm = root.querySelector("[data-app-settings-form]");
  if (settingsForm && client) {
    const status = settingsForm.querySelector("[data-app-settings-status]");
    const modeInput = settingsForm.elements.maintenance_mode;
    const modeLabel = settingsForm.querySelector("[data-maintenance-label]");
    const setSettingsStatus = (message, kind = "success") => { if (status) { status.textContent = message; status.dataset.kind = kind; } };
    let settingsSaving = false;
    const updateSettings = async (patch, button) => {
      if (settingsSaving) return;
      settingsSaving = true;
      const saveButtons = [...settingsForm.querySelectorAll("[data-maintenance-save], [data-music-save], [data-welcome-save]")];
      saveButtons.forEach(item => {item.disabled = true;});
      setSettingsStatus("Salvando configurações…", "info");
      try {
        const { data, error } = await invokeAdmin({ action: "app_settings_update", resourceType: "settings", settings: patch });
        if (error) throw error;
        const saved = data?.settings;
        if (!saved || !Object.keys(patch).every(key => saved[key] === patch[key])) throw Error("settings_write_unconfirmed");
        const confirmed = await client.from("app_settings")
          .select("maintenance_mode,maintenance_message,music_of_the_day_title,music_of_the_day_url,welcome_banner_text")
          .eq("id", 1).maybeSingle();
        if (confirmed.error || !confirmed.data || !Object.keys(patch).every(key => confirmed.data[key] === patch[key]))
          throw Error("settings_persistence_unconfirmed");
        for (const key of Object.keys(patch)) {
          if (key === "maintenance_mode") modeInput.checked = confirmed.data[key] === true;
          else if (settingsForm.elements[key]) settingsForm.elements[key].value = confirmed.data[key] || "";
        }
        if (modeLabel) modeLabel.textContent = modeInput.checked ? "Ativado" : "Desativado";
        setSettingsStatus("Configuração confirmada no Neon.");
      } catch (error) {
        console.error("Looply app settings save failed", error);
        setSettingsStatus("Falha ao salvar: " + String(error?.message || "erro desconhecido"), "error");
      } finally { settingsSaving = false; saveButtons.forEach(item => {item.disabled = false;}); }
    };
    const loadSettings = async () => {
      try {
        const { data, error } = await client.from("app_settings").select("id,maintenance_mode,maintenance_message,music_of_the_day_title,music_of_the_day_url,welcome_banner_text").eq("id", 1).maybeSingle();
        if (error) throw error;
        if (!data) return;
        modeInput.checked = data.maintenance_mode === true;
        settingsForm.elements.maintenance_message.value = data.maintenance_message || "Sistema em atualização rápida por Peixinho";
        settingsForm.elements.music_of_the_day_title.value = data.music_of_the_day_title || "";
        settingsForm.elements.music_of_the_day_url.value = data.music_of_the_day_url || "";
        settingsForm.elements.welcome_banner_text.value = data.welcome_banner_text || "";
        if (modeLabel) modeLabel.textContent = modeInput.checked ? "Ativado" : "Desativado";
      } catch (error) { console.warn("Looply app settings could not load", error); setSettingsStatus("Não foi possível carregar as configurações.", "error"); }
    };
    modeInput.addEventListener("change", () => {
      if (modeLabel) modeLabel.textContent = modeInput.checked ? "Ativado (não salvo)" : "Desativado (não salvo)";
      setSettingsStatus("Alteração pendente. Toque em Salvar modo de manutenção.", "info");
    });
    settingsForm.querySelector("[data-maintenance-save]")?.addEventListener("click", (event) => updateSettings({ maintenance_mode: modeInput.checked, maintenance_message: settingsForm.elements.maintenance_message.value.trim() || "Sistema em atualização rápida por Peixinho" }, event.currentTarget));
    settingsForm.querySelector("[data-music-save]")?.addEventListener("click", (event) => {
      const rawUrl = settingsForm.elements.music_of_the_day_url.value.trim();
      if (rawUrl) { try { const url = new URL(rawUrl); if (url.protocol !== "https:" || !/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname)) throw new Error("invalid"); } catch { setSettingsStatus("Informe um link HTTPS válido do YouTube.", "error"); return; } }
      updateSettings({ music_of_the_day_title: settingsForm.elements.music_of_the_day_title.value.trim(), music_of_the_day_url: rawUrl }, event.currentTarget);
    });
    settingsForm.querySelector("[data-welcome-save]")?.addEventListener("click", (event) => updateSettings({ welcome_banner_text: settingsForm.elements.welcome_banner_text.value.trim() }, event.currentTarget));
    void loadSettings();
  }

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-moderate-content]");
    if (!form || !client) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    setStatus(form, "Registrando moderação…", "info");
    try {
      const { data, error } = await invokeAdmin({
        action: "moderate_content", resourceType: form.dataset.contentType || "posts",
        contentType: form.dataset.contentType, contentId: form.dataset.contentId,
        hidden: form.dataset.hidden !== "true"
      });
      if (error) throw error;
      setStatus(form, data?.hidden ? "Conteúdo ocultado e ação auditada." : "Conteúdo restaurado e ação auditada.");
      const readForm = root.querySelector("[data-admin-read]");
      if (readForm) {
        const readPurpose = readForm.querySelector('[name="purpose"]');
        readForm.requestSubmit();
      }
    } catch (error) {
        setStatus(form, /admin_session/.test(String(error?.message || "")) ? "A sessão ADM expirou. Desbloqueie novamente." : "Não foi possível moderar o conteúdo. Confira a sessão e tente novamente.", "error");
      if (button) button.disabled = false;
    }
  });

  root.addEventListener("click", async (event) => {
    const adminPage = event.target.closest("[data-admin-page]");
    if (adminPage) {
      const form = root.querySelector("form[data-admin-read]");
      const offset = form?.querySelector("#adminOffset");
      if (!form || !offset) return;
      const current = Number(offset.value || 0);
      offset.value = String(adminPage.dataset.adminPage === "next" ? Math.min(10000, current + 100) : Math.max(0, current - 100));
      form.querySelector("[name=resourceId]").value = "";
      form.requestSubmit();
      return;
    }
    const deleteArchivedCard = event.target.closest("[data-delete-archived-card]");
    if (deleteArchivedCard && client) {
      if (!window.confirm("Excluir permanentemente esta carta importada e seu conteúdo protegido? Esta ação não pode ser desfeita.")) return;
      deleteArchivedCard.disabled = true;
      try {
        const { data, error } = await invokeAdmin({
          action: "delete_archived_card", resourceType: "archived_cards", cardId: deleteArchivedCard.dataset.deleteArchivedCard
        });
        if (error) throw error;
        if (data?.deleted !== true) throw new Error("delete_not_confirmed");
        deleteArchivedCard.closest(".admin-record")?.remove();
        root.querySelector("form[data-admin-read]")?.requestSubmit();
      } catch (error) {
        deleteArchivedCard.disabled = false;
        const record = deleteArchivedCard.closest(".admin-record");
        if (record) setStatus(record, /admin_session/.test(String(error?.message || "")) ? "A sessão ADM expirou." : "A exclusão da carta não foi confirmada.", "error");
      }
      return;
    }
    const editArchivedCard = event.target.closest("[data-edit-archived-card]");
    if (editArchivedCard) {
      const form = editArchivedCard.parentElement?.querySelector("[data-edit-archived-card-form]");
      if (form) { form.hidden = false; editArchivedCard.hidden = true; form.querySelector("[name=body]")?.focus(); }
      return;
    }
    const cancelArchivedCardEdit = event.target.closest("[data-cancel-archived-card-edit]");
    if (cancelArchivedCardEdit) {
      const form = cancelArchivedCardEdit.closest("[data-edit-archived-card-form]");
      if (form) { form.hidden = true; form.parentElement?.querySelector("[data-edit-archived-card]")?.removeAttribute("hidden"); }
      return;
    }
    const editCommunityLetter = event.target.closest("[data-edit-community-letter]");
    if (editCommunityLetter) {
      const form = editCommunityLetter.parentElement?.querySelector("[data-edit-community-letter-form]");
      if (form) { form.hidden = false; editCommunityLetter.hidden = true; form.querySelector("[name=subject]")?.focus(); }
      return;
    }
    const cancelCommunityLetterEdit = event.target.closest("[data-cancel-community-letter-edit]");
    if (cancelCommunityLetterEdit) {
      const form = cancelCommunityLetterEdit.closest("[data-edit-community-letter-form]");
      if (form) { form.hidden = true; form.parentElement?.querySelector("[data-edit-community-letter]")?.removeAttribute("hidden"); }
      return;
    }
    const deleteContent = event.target.closest("[data-delete-content]");
    if (deleteContent && client) {
      if (!window.confirm("Excluir esta carta permanentemente? Esta ação não pode ser desfeita.")) return;
      deleteContent.disabled = true;
      try {
        const { data, error } = await invokeAdmin({
          action: "delete_content",
          contentType: deleteContent.dataset.contentType,
          contentId: deleteContent.dataset.contentId,
          confirmDelete: true
        });
        if (error) throw error;
        if (data?.deleted !== true) throw new Error("delete_not_confirmed");
        deleteContent.closest(".admin-record")?.remove();
      } catch (error) {
        console.error("Looply administrative content deletion failed", error);
        deleteContent.disabled = false;
        const record = deleteContent.closest(".admin-record");
        if (record) setStatus(record, /admin_session/.test(String(error?.message || "")) ? "A sessão ADM expirou." : "A exclusão não foi confirmada pelo servidor.", "error");
      }
      return;
    }
    const refreshUsers = event.target.closest("[data-users-refresh]");
    if (refreshUsers && client) {
      await loadUsers();
      return;
    }
    const accessAction = event.target.closest("[data-user-access-action]");
    if (accessAction && client) {
      accessAction.disabled = true;
      try {
        const purpose = validatedUserPurpose();
        const action = accessAction.dataset.userAccessAction === "suspend" ? "user_set_suspended" : "user_restore_access";
        const { data, error } = await invokeAdmin({ action, resourceType: "profiles", userId: accessAction.dataset.userId, purpose });
        const expectedSuspended = action === "user_set_suspended";
        if (error || data?.updated !== true || data?.suspended !== expectedSuspended)
          throw error || Error("Alteração de acesso não confirmada pelo Neon.");
        const refreshed = await loadUsers();
        const account = refreshed?.find(row => row.id === accessAction.dataset.userId);
        if (!account || account.suspended !== expectedSuspended) throw Error("Alteração de acesso não persistiu.");
        const feedback = root.querySelector("[data-users-feedback]");
        if (feedback) { feedback.textContent = expectedSuspended ? "Acesso suspenso e conferido." : "Acesso restaurado e conferido."; feedback.dataset.kind="success"; }
      } catch (error) {
        const feedback = root.querySelector("[data-users-feedback]");
        if (feedback) { feedback.textContent = String(error?.message || "Não foi possível alterar o acesso."); feedback.dataset.kind="error"; }
      } finally { accessAction.disabled = false; }
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
        if (broadcastForm) setStatus(broadcastForm, "Informe justificativa de 20 a 500 caracteres antes de desativar.", "error");
        broadcastForm?.elements.purpose?.focus();
        return;
      }
      deactivateBroadcast.disabled = true;
      try {
        const { data, error } = await invokeAdmin({ action: "broadcast_deactivate", resourceType: "announcements", announcementId: deactivateBroadcast.dataset.broadcastDeactivate, purpose });
        if (error || data?.deactivated !== true) throw error || Error("deactivation_unconfirmed");
        if (!await loadBroadcasts(broadcastForm, false)) throw Error("history_refresh_failed");
        if (broadcastForm) setStatus(broadcastForm, "Comunicado desativado. Novas janelas não serão exibidas.");
      } catch (error) {
        console.error("Looply global announcement deactivation failed", error);
        if (broadcastForm) setStatus(broadcastForm, "Não foi possível desativar o comunicado.", "error");
      } finally { deactivateBroadcast.disabled = false; }
      return;
    }
    const refreshSecret = event.target.closest("[data-secret-refresh]");
    if (refreshSecret && client) { event.preventDefault(); await loadSecretHistory(); return; }
    const cancelSecret = event.target.closest("[data-secret-delete]");
    if (cancelSecret && client) {
      cancelSecret.disabled = true;
      try {
        const purpose=String(secretForm?.elements.purpose?.value||"").trim();
        if (purpose.length<20 || purpose.length>500) throw Error("Informe uma justificativa de 20 a 500 caracteres.");
        const { data, error } = await invokeAdmin({action:"secret_cancel",resourceType:"secret_messages",secretId:cancelSecret.dataset.secretDelete,purpose});
        if (error || data?.cancelled!==true) throw error || Error("cancel_unconfirmed");
        const history=await loadSecretHistory();
        if(!history || history.some(item=>item.id===cancelSecret.dataset.secretDelete))throw Error("cancel_persistence_unconfirmed");
      } catch (error) { console.error("Secret message delete failed", error); const status=root.querySelector("[data-secret-status]"); if(status){status.textContent="Não foi possível apagar o recado.";status.dataset.kind="error";} }
      finally { cancelSecret.disabled = false; }
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
      window.location.assign("chat.html?conversation=" + encodeURIComponent(data.conversationId));
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
      if (offsetField) offsetField.hidden = !["archive_media", "archived_cards", "audit", "community_letters", "letters"].includes(event.target.value);
      const offset = root.querySelector("#adminOffset");
      if (offset && ["archive_media", "archived_cards", "audit", "community_letters", "letters"].includes(event.target.value)) offset.value = "0";
    }
  });

  root.addEventListener("change", (event) => {
    const protectionToggle = event.target.closest("[data-community-letter-protect]");
    if (!protectionToggle) return;
    const password = protectionToggle.form?.querySelector("[data-community-letter-password]");
    if (!password) return;
    password.disabled = !protectionToggle.checked;
    password.required = protectionToggle.checked;
    if (!protectionToggle.checked) password.value = "";
  });

  root.addEventListener("submit", async (event) => {
    const archivedCardForm = event.target.closest("[data-edit-archived-card-form]");
    if (archivedCardForm) {
      event.preventDefault();
      const button = archivedCardForm.querySelector('button[type="submit"]');
      const body = String(new FormData(archivedCardForm).get("body") || "").replace(/\r/g, "").trim();
      const password = String(new FormData(archivedCardForm).get("password") || "");
      const protectedCard = archivedCardForm.dataset.protected === "true" || Boolean(password);
      if (!body || body.length > 100000 || (archivedCardForm.dataset.protected === "true" && !password)
          || (password && (password.length > 256 || /\s/.test(password)))) {
        setStatus(archivedCardForm, "Informe um texto válido e, para carta protegida, uma nova senha sem espaços.", "error");
        return;
      }
      const payloadCard = {
        recipient_id: archivedCardForm.dataset.recipientId,
        original_file: archivedCardForm.dataset.originalFile,
        card_number: Number(archivedCardForm.dataset.cardNumber),
        is_private: archivedCardForm.dataset.private === "true",
        is_protected: protectedCard,
        password_hint: String(new FormData(archivedCardForm).get("password_hint") || "").trim().slice(0, 300),
        body: protectedCard ? null : body,
        secret_body: protectedCard ? body : null,
        sent_date: String(new FormData(archivedCardForm).get("sent_date") || "")
      };
      try {
        if (protectedCard) Object.assign(payloadCard, await hashArchivePassword(password));
        if (button) button.disabled = true;
        setStatus(archivedCardForm, "Salvando carta e registrando auditoria…", "info");
        const { data, error } = await invokeAdmin({
          action: "update_archived_card", resourceType: "archived_cards",
          cardId: archivedCardForm.dataset.cardId, card: payloadCard
        });
        if (error) throw error;
        if (data?.updated !== true) throw new Error("update_not_confirmed");
        setStatus(archivedCardForm, "Carta atualizada e auditoria registrada.");
        archivedCardForm.hidden = true;
        archivedCardForm.parentElement?.querySelector("[data-edit-archived-card]")?.removeAttribute("hidden");
        const readForm = root.querySelector("[data-admin-read]");
        if (readForm) readForm.requestSubmit();
      } catch (error) {
        setStatus(archivedCardForm, /admin_session/.test(String(error?.message || "")) ? "A sessão ADM expirou." : "Não foi possível atualizar a carta. Confira a autorização e os dados.", "error");
      } finally { if (button) button.disabled = false; }
      return;
    }
    const communityLetterForm = event.target.closest("[data-edit-community-letter-form]");
    if (communityLetterForm && client) {
      event.preventDefault();
      const button = communityLetterForm.querySelector('[type="submit"]');
      if (button) button.disabled = true;
      try {
        const values = new FormData(communityLetterForm);
        const subject = String(values.get("subject") || "").trim();
        const body = String(values.get("body") || "").trim();
        const protect = communityLetterForm.dataset.protected === "true" || values.get("is_protected") === "true";
        const update = { subject, body, is_protected: protect };
        if (protect) {
          const password = String(values.get("password") || "");
          if (!password || /\s/.test(password)) throw new Error("invalid_letter_password");
          Object.assign(update, await sealLetter(body, password, subject));
        } else {
          Object.assign(update, { password_salt: null, password_iv: null, password_ciphertext: null });
        }
        const { data, error } = await invokeAdmin({
          action: "update_community_letter", resourceType: "community_letters",
          letterId: communityLetterForm.dataset.letterId, ...update
        });
        if (error) throw error;
        if (data?.updated !== true) throw new Error("letter_update_unconfirmed");
        setStatus(communityLetterForm, "Carta atualizada e ação registrada.");
        root.querySelector("form[data-admin-read]")?.requestSubmit();
      } catch (error) {
        console.error("Looply administrative letter update failed", error);
        setStatus(communityLetterForm, error?.message === "invalid_letter_password"
          ? "Informe uma senha sem espaços para proteger a carta."
          : "A alteração não foi salva. Confira o texto, a senha e a conexão.", "error");
      } finally { if (button) button.disabled = false; }
      return;
    }
    const secretMessageForm = event.target.closest("form[data-secret-message-form]");
    if (secretMessageForm && client) {
      event.preventDefault();
      const submitButton = secretMessageForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      const status = secretMessageForm.querySelector("[data-secret-status]");
      let uploadedSecretPath = null;
      let secretRecorded = false;
      try {
        const values = new FormData(secretMessageForm);
        const recipientId = String(values.get("recipient_id") || "");
        const title = String(values.get("title") || "").trim();
        const content = String(values.get("content") || "").trim();
        const purpose = String(values.get("purpose") || "").trim();
        if (purpose.length < 20 || purpose.length > 500) throw Error("purpose");
        if (!recipientId || !content || content.length > 5000 || title.length > 160) throw new Error("validation");
        let mediaUrl = null;
        if (selectedSecretMedia) {
          if (!selectedSecretMedia.type.startsWith("image/") || selectedSecretMedia.size > 10 * 1024 * 1024) throw new Error("media");
          const {data:authData,error:authError}=await client.auth.getUser();
          if(authError || !authData?.user?.id) throw new Error("auth");
          const ext = {"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"}[selectedSecretMedia.type];
          if(!ext) throw new Error("media");
          const path = `secret-messages/${authData.user.id}/${crypto.randomUUID()}.${ext}`;
          const {error:uploadError}=await client.storage.from("looply-secret-messages")
            .upload(path,selectedSecretMedia,{contentType:selectedSecretMedia.type});
          if(uploadError) throw new Error("media_upload_failed: "+uploadError.message);
          mediaUrl=path;
          uploadedSecretPath=path;
        }
        const { data, error } = await invokeAdmin({action:"secret_create",resourceType:"secret_messages",recipientId,title,content,mediaPath:mediaUrl,purpose});
        if (error || data?.created !== true || !data.id) throw error || Error("secret_creation_unconfirmed");
        secretRecorded = true;
        const history=await loadSecretHistory();
        if (!history?.some(item => item.id === data.id)) throw Error("secret_history_not_confirmed");
        const recipientLabel=secretRecipient?.selectedOptions?.[0]?.textContent || "o usuário";
        secretMessageForm.reset(); selectedSecretMedia = null;
        if (secretPreview) { secretPreview.replaceChildren(); secretPreview.hidden = true; }
        if (status) { status.textContent = "Recado secreto salvo e confirmado para " + recipientLabel + "."; status.dataset.kind = "success"; }
      } catch (error) {
        console.error("Secret VIP message send failed", error);
        if(uploadedSecretPath && !secretRecorded) {
          const cleanup=await client.storage.from("looply-secret-messages").remove([uploadedSecretPath]);
          if(cleanup.error) console.warn("Secret media cleanup not confirmed", cleanup.error);
        }
        if (status) { status.textContent = error.message === "secret_media_storage_not_configured" ? "A mídia do recado VIP ainda não está disponível no armazenamento Neon. Remova a foto para enviar o texto." : error.message === "media" ? "Escolha uma imagem válida de até 10 MB." : error.message === "validation" ? "Escolha o destinatário e informe o conteúdo do recado." : error.message === "purpose" ? "Informe uma justificativa administrativa de 20 a 500 caracteres." : "Não foi possível enviar o recado. Verifique sua conexão e a autorização administrativa no Neon."; status.dataset.kind = "error"; }
      } finally { if (submitButton) submitButton.disabled = false; }
      return;
    }

    const secretDelete = event.target.closest("[data-secret-delete]");
    if (secretDelete && client) {
      secretDelete.disabled = true;
      try {
        const { error } = await invokeAdmin({action:"secret_cancel",resourceType:"secret_messages",secretId:secretDelete.dataset.secretDelete});
        if (error) throw error;
        await loadSecretHistory();
      } catch (error) {
        console.error("Secret VIP cancel failed", error);
        secretDelete.disabled = false;
        alert("Não foi possível cancelar o recado.");
      }
      return;
    }
    if (event.target.closest("[data-secret-refresh]")) {
      void loadSecretRecipients(); void loadSecretHistory(); return;
    }

    const createForm = event.target.closest("form[data-user-create]");
    if (createForm && client) {
      event.preventDefault();
      const values = new FormData(createForm);
      const username = String(values.get("username") || "").trim().replace(/^@/, "").toLowerCase();
      const email = (String(values.get("email") || "").trim().toLowerCase() || `${username}@loooply.app`);
      const displayName = String(values.get("displayName") || "").trim();
      const password = String(values.get("password") || "");
      const confirmPassword = String(values.get("confirmPassword") || "");
      const playlistUrl = String(values.get("playlistUrl") || "").trim();
      const purpose = String(root.querySelector("[data-users-purpose]")?.value || "").trim();
      if (!/^[a-z0-9_]{3,30}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          || displayName.length < 1 || displayName.length > 80
          || (password && (password.length < 8 || password.length > 72 || password !== confirmPassword))
          || (playlistUrl && !/^https:\/\/(?:www\.|music\.)?youtube\.com\/playlist\?list=[A-Za-z0-9_-]{1,100}(?:&[^#]*)?$/.test(playlistUrl))) {
        setStatus(createForm, password !== confirmPassword ? "As senhas não coincidem." : "Confira o username, o e-mail, o nome, a senha e a URL da playlist.", "error");
        return;
      }
      try { validatedUserPurpose(); }
      catch(error) { setStatus(createForm, error.message, "error"); return; }
      const button = createForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      setStatus(createForm, "Criando a conta e o perfil…", "info");
      try {
        const { data, error } = await invokeAdmin({
          action: "user_create_with_password", resourceType: "profiles",
          username, email, displayName, password, playlistUrl, purpose
        });
        if (error || data?.created !== true) throw error || Error("Cadastro não confirmado no Neon.");
        const refreshed=await loadUsers();
        if (!refreshed?.some(row => row.username === username && row.id === data?.userId))
          throw Error("Conta criada, mas o vínculo do perfil ainda não foi confirmado. Não repita o cadastro.");
        createForm.reset();
        for (const status of createForm.querySelectorAll("[data-availability]")) {
          status.textContent = "";
          status.dataset.kind = "";
        }
        const temporaryPassword = String(data?.temporaryPassword || "");
        setStatus(createForm, temporaryPassword
          ? `Usuário @${data?.username || username} cadastrado. Senha temporária: ${temporaryPassword} — copie e entregue ao usuário com segurança.`
          : "Usuário @" + (data?.username || username) + " cadastrado com sucesso. O login já está habilitado.", "success");
        await loadUsers();
      } catch (error) {
        console.error("Looply direct user creation failed", error);
        const message = String(error?.message || "");
        const code = String(error?.context?.body?.error || error?.details || "");
        const reason = [message, code].join(" ").toLowerCase();
        if (reason.includes("username_already_exists")) setStatus(createForm, "Este username já está em uso.", "error");
        else if (reason.includes("email_already_exists") || reason.includes("user_already_exists")) setStatus(createForm, "Este e-mail já está cadastrado.", "error");
        else if (reason.includes("admin_session")) setStatus(createForm, "A sessão ADM expirou. Desbloqueie novamente e tente outra vez.", "error");
        else setStatus(createForm, "Não foi possível criar a conta. Confira os dados e tente novamente.", "error");
      } finally { if (button) button.disabled = false; }
      return;
    }

    const userProfileForm = event.target.closest("form[data-user-profile-form]");
    if (userProfileForm && client) {
      event.preventDefault();
      let purpose;
      try {purpose=validatedUserPurpose();}
      catch(error) {setStatus(userProfileForm,error.message,"error");return;}
      const values = new FormData(userProfileForm);
      const button = userProfileForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const displayName = String(values.get("displayName") || "").trim();
        const bio = String(values.get("bio") || "").trim();
        const playlistUrl = String(values.get("playlistUrl") || "").trim();
        const { data, error } = await invokeAdmin({
          action: "user_update_profile", resourceType: "profiles", userId: userProfileForm.dataset.userId,
          displayName, bio, playlistUrl, purpose
        });
        if (error || data?.updated !== true) throw error || Error("Edição de perfil não confirmada.");
        const refreshed = await loadUsers();
        const saved=refreshed?.find(row=>row.id===userProfileForm.dataset.userId);
        if(!saved || saved.display_name!==displayName || (saved.bio||"")!==bio || (saved.playlist_url||"")!==playlistUrl)
          throw Error("Edição não persistiu como esperado.");
        const feedback=root.querySelector("[data-users-feedback]");
        if(feedback) {feedback.textContent="Perfil atualizado e confirmado no Neon.";feedback.dataset.kind="success";}
      } catch {
        setStatus(userProfileForm, "Não foi possível salvar o perfil.", "error");
      } finally { if (button) button.disabled = false; }
      return;
    }

    const broadcastForm = event.target.closest("form[data-admin-broadcast]");
    if (broadcastForm && client) {
      event.preventDefault();
      const submitButton = broadcastForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      let uploadedBroadcastPath=null;
      let broadcastRecorded=false;
      try {
        const values = new FormData(broadcastForm);
        const title = String(values.get("title") || "").trim();
        const body = String(values.get("body") || "").trim();
        const purpose = String(values.get("purpose") || "").trim();
        const expiresText = String(values.get("expiresAt") || "").trim();
        if (!title || title.length > 120 || !body || body.length > 4000) throw new Error("content");
        const expiresAt = expiresText ? new Date(expiresText) : null;
        if (expiresAt && (!Number.isFinite(expiresAt.valueOf()) || expiresAt.valueOf() <= Date.now())) throw new Error("expiry");
        let mediaUrl = null;
        if (selectedBroadcastMedia) {
          const { data: authData, error: authError } = await client.auth.getUser();
          if (authError || !authData?.user?.id) throw new Error("media_auth");
          const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","video/mp4":"mp4","video/webm":"webm"}[selectedBroadcastMedia.type];
          if(!ext) throw new Error("invalid_media");
          const path = `announcements/${authData.user.id}/${crypto.randomUUID()}.${ext}`;
          const {error:uploadError}=await client.storage.from("looply-announcements")
            .upload(path,selectedBroadcastMedia,{contentType:selectedBroadcastMedia.type});
          if(uploadError) throw new Error("media_upload_failed: "+uploadError.message);
          mediaUrl=path;
          uploadedBroadcastPath=path;
        }
        const { data, error } = await invokeAdmin({
          action: "broadcast_create", resourceType: "announcements", title, body, mediaUrl,
          expiresAt: expiresAt?.toISOString() || null, purpose
        });
        if (error) throw error;
        if (!data?.announcement?.id) throw new Error("announcement unavailable");
        broadcastRecorded=true;
        if(!await loadBroadcasts(broadcastForm, false)) throw Error("announcement_history_not_confirmed");
        broadcastForm.elements.title.value = "";
        broadcastForm.elements.body.value = "";
        broadcastForm.elements.expiresAt.value = "";
        if (mediaInput) mediaInput.value = "";
        selectedBroadcastMedia = null;
        if (mediaPreview) { mediaPreview.replaceChildren(); mediaPreview.hidden = true; }
        setStatus(broadcastForm, "Comunicado registrado no Neon; histórico atualizado.");
      } catch (error) {
        console.error("Looply global announcement creation failed", error);
        if(uploadedBroadcastPath && !broadcastRecorded) {
          const cleanup=await client.storage.from("looply-announcements").remove([uploadedBroadcastPath]);
          if(cleanup.error) console.warn("Broadcast upload cleanup not confirmed",cleanup.error);
        }
        const message = /broadcast_media_storage_not_configured/.test(String(error?.message || "")) ? "A publicação de mídia ainda não está autorizada no armazenamento Neon. Remova o anexo para publicar o comunicado em texto." : /purpose/.test(String(error?.message || ""))
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
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Error("offset");
      const { data, error } = await invokeAdmin({ resourceType, resourceId: resourceType === "audit" ? null : resourceId, offset, purpose });
      if (error) throw error;
      await signAdminMediaRows(client,resourceType,data?.data||[]);
      renderResults(root.querySelector("[data-admin-results]"), resourceType, data?.data);
      const previousPage = form.querySelector('[data-admin-page="previous"]');
      const nextPage = form.querySelector('[data-admin-page="next"]');
      if (previousPage) previousPage.disabled = offset < 100;
      if (nextPage) nextPage.disabled = !Array.isArray(data?.data) || data.data.length < 100 || offset >= 10000;
      if (status) status.textContent = `Consulta registrada · ${data?.requestId || ""}`;
      status?.setAttribute("data-kind", "success");
    } catch (error) {
      console.error("Looply audited admin read failed", error);
      const message = /purpose/.test(String(error?.message || ""))
        ? "Informe um motivo com pelo menos 20 caracteres."
        : /offset/.test(String(error?.message || ""))
          ? "Informe uma posição válida entre 0 e 10.000."
          : "Consulta não concluída: " + String(error?.message || "erro desconhecido");
      if (status) {
        status.textContent = message;
        status.dataset.kind = "error";
      }
    } finally {
      if (button) button.disabled = false;
    }
  });
  void loadUsers();
}


