import { mountAppPage } from "../../src/page-runtime.js?v=private-letter-fixed-20261029";
import { archivedCardsMarkup, bindArchivedCards, loadArchivedCards } from "../../src/archived-cards.js?v=author-only-hints-20261030";
import { bindCommunityLetters, communityLettersMarkup, loadCommunityLetters, sealLetter, openProtectedLetter } from "../../src/letters-community.js?v=sent-letter-hints-modal-20261023";
import { signProfileAvatars } from "../../src/profiles.js";
import { fetchFullLetterForEdit, unlockFullLetterForEdit, saveFullLetterEdit, COMMUNITY_LETTER_LIMIT } from "../../src/letter-edit-service.js?v=sender-editor-20261030";

const h = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const day = (value) => value && !Number.isNaN(new Date(value).valueOf()) ? new Date(value).toLocaleDateString("pt-BR") : "Sem data";
const MISOL_ORIGINAL_RECOVERY_CARD_ID = "98df71c4-cf50-42fe-98d2-357d12633356";
const adminOriginalRecoveryMarkup = `
  <details id="adminOriginalRecovery" hidden aria-labelledby="adminOriginalRecoveryTitle"><summary>Restaurar conteúdo original</summary><div class="letter-recovery-fields">
    <h3 id="adminOriginalRecoveryTitle">Restaurar texto da carta original</h3>
    <p>Cole o conteúdo completo que você guardou. A senha antiga não é necessária. A versão criptografada anterior será preservada no histórico privado.</p>
    <label>Conteúdo completo da carta original
      <textarea id="archiveRecoveryText" rows="8" maxlength="100000" spellcheck="true" placeholder="Cole aqui o texto completo do seu bloco de notas..."></textarea>
    </label>
    <label>Proteção da carta
      <select id="archiveRecoveryMode">
        <option value="password">Com senha (MiSol precisará desbloquear)</option>
        <option value="none">Sem senha (continua privada para MiSol)</option>
      </select>
    </label>
    <div id="archiveRecoveryPasswordFields">
      <label>Nova senha <input id="archiveRecoveryPassword" type="password" minlength="7" maxlength="256" autocomplete="new-password" placeholder="Digite a senha desejada" /></label>
      <label>Confirmar nova senha <input id="archiveRecoveryPasswordConfirm" type="password" minlength="7" maxlength="256" autocomplete="new-password" placeholder="Repita a senha" /></label>
    </div>
    <label><input id="archiveRecoveryAcknowledgement" type="checkbox" /> Confirmo que colei o texto original completo e autorizo substituí-lo nesta mesma carta.</label>
    <button id="archiveRecoverySave" type="button" class="btn-enviar">Salvar conteúdo e proteção</button>
    <p id="archiveRecoveryStatus" role="status" aria-live="polite"></p>
  </div></details>`;

const cardTitle = (card) => {
  if (card.is_protected) return card.is_private ? "Carta privada protegida" : "Carta protegida";
  const line = String(card.body || "").split(/\r?\n/).map(x => x.trim()).find(Boolean);
  return line ? line.slice(0, 100) : "Carta sem título";
};
const asError = (error) => typeof error?.message === "string" ? error.message : "Não foi possível concluir. Verifique sua conexão e tente novamente.";
function archivedRecoveryError(error) {
  const message = String(error?.message || error?.error || "");
  const code = String(error?.code || "").toUpperCase();
  const status = Number(error?.status || 0);
  const combined = [message, code].join(" ");
  if (/admin_forbidden|42501|permission denied/i.test(combined) || status === 403)
    return "Sua sessão não tem permissão administrativa para restaurar esta carta. Entre novamente com o ADM.";
  if (/authentication_required|neon_session_required|PGRST301|jwt/i.test(combined) || status === 401)
    return "Sua sessão expirou. Copie o texto para um lugar seguro antes de entrar novamente.";
  if (/PGRST202|42883|could not find the function|function .*does not exist/i.test(combined))
    return "A função de restauração não está disponível no Neon (PGRST202/42883). É necessário verificar a instalação da RPC v14 e atualizar o cache de esquema.";
  if (/card_unavailable|recovery_scope_restricted/i.test(combined))
    return "O Neon não reconheceu o registro original autorizado (ID ou nome do arquivo). Nenhuma carta nova foi criada.";
  if (/original_record_missing/i.test(combined))
    return "O registro da carta existe, mas o material antigo necessário à recuperação não foi encontrado. Nenhum texto foi substituído.";
  if (/invalid_recovery_input|invalid_recovery_password|unexpected_password/i.test(combined))
    return "Revise o conteúdo, a confirmação e a opção de senha antes de salvar.";
  if (/42P01|undefined_table/i.test(combined))
    return "A estrutura de recuperação ainda não está completa no Neon (42P01).";
  if (/23514|check_violation/i.test(combined))
    return "O banco recusou a gravação por uma regra de integridade da carta (23514).";
  if (/network|conexão|fetch|unavailable|timeout|Failed to fetch/i.test(combined))
    return "Erro de conexão com o Neon. O texto continua no editor. Confira a rede e tente novamente.";
  if (/recovery_verification_failed|recovery_not_confirmed|cipher_verification_failed|content_verification_failed/i.test(combined))
    return "O servidor não confirmou a integridade do texto restaurado. A carta permanece no editor.";
  const diagnostic = code || (status ? "HTTP " + status : "");
  return "A restauração foi recusada pelo servidor" + (diagnostic ? " (código " + diagnostic + ")" : "") +
    ". O texto permanece no editor; copie-o antes de sair.";
}

const editorMarkup = "<dialog class=\"modal-carta letter-edit-dialog\" id=\"editorAdminCarta\" aria-labelledby=\"adminEditTitle\">\n<div class=\"modal-header\"><button type=\"button\" id=\"fecharAdminCarta\" aria-label=\"Fechar editor\">✕</button><strong id=\"adminEditTitle\">Editar carta</strong><button id=\"salvarAdminCarta\" type=\"submit\" form=\"adminEditForm\" class=\"btn-enviar\">Salvar</button></div>\n<form class=\"modal-body letter-edit-body\" id=\"adminEditForm\">\n<label id=\"adminSubjectField\">Título<input name=\"subject\" maxlength=\"120\"></label>\n<div id=\"letterEditUnlock\" class=\"letter-edit-unlock\">\n<label id=\"adminPasswordField\" hidden>Senha atual da carta<input name=\"password\" type=\"password\" maxlength=\"256\" autocomplete=\"current-password\"></label>\n<label id=\"archiveCurrentPasswordField\" hidden>Senha atual da carta original<input name=\"archive_current_password\" type=\"password\" maxlength=\"256\" autocomplete=\"current-password\"></label>\n<button id=\"desbloquearEdicaoCarta\" class=\"btn-enviar\" type=\"button\" hidden>Desbloquear conteúdo</button>\n</div>\n<label id=\"adminContentField\">Conteúdo completo<textarea name=\"body\" rows=\"9\" spellcheck=\"true\" placeholder=\"Texto completo da carta\"></textarea></label>\n<label id=\"adminPrivateField\" hidden><input type=\"checkbox\" name=\"is_private\"> Carta privada</label>\n<details id=\"adminHintSection\" class=\"letter-edit-details\" hidden><summary>Adicionar dica</summary>\n<label id=\"adminHintField\">Nova dica<input name=\"password_hint\" maxlength=\"240\" placeholder=\"Uma pista para a senha\"></label>\n<button id=\"addEditorHint\" type=\"button\" class=\"btn-enviar\">Salvar dica</button><p id=\"adminHintStatus\" role=\"status\" aria-live=\"polite\"></p></details>\n<details id=\"communityPasswordChange\" class=\"letter-edit-details\" hidden><summary>Editar senha</summary>\n<label id=\"adminNewPasswordField\">Nova senha (opcional)<input name=\"new_password\" type=\"password\" minlength=\"8\" maxlength=\"256\" autocomplete=\"new-password\"></label><p>A alteração da senha será aplicada ao salvar a carta.</p></details>\n<details id=\"adminArchivePasswordChange\" class=\"letter-edit-details\" hidden><summary>Editar senha</summary>\n<p>Desbloqueie com a senha atual acima para atualizar a proteção.</p>\n<label>Nova senha<input name=\"archive_new_password\" type=\"password\" minlength=\"8\" maxlength=\"256\" autocomplete=\"new-password\"></label>\n<label>Confirmar nova senha<input name=\"archive_confirm_password\" type=\"password\" minlength=\"8\" maxlength=\"256\" autocomplete=\"new-password\"></label>\n<button id=\"alterarSenhaCartaOriginal\" class=\"btn-enviar\" type=\"button\">Salvar nova senha</button></details>" + adminOriginalRecoveryMarkup + "<p id=\"adminEditStatus\" role=\"status\" aria-live=\"polite\"></p>\n<button id=\"adminDeleteCarta\" class=\"danger\" type=\"button\" hidden>Excluir carta permanentemente</button></form></dialog>";

function visual() {
  return '<section class="cartas-page">' +
    '<div class="cartas-hero"><span>CARTAS</span><h1>Minha coleção</h1></div>' +
    '<section class="cartas-action" aria-label="Escrever carta"><div class="action-header"><div><span>CARTAS</span><h2>✎ Escrever carta</h2></div><button id="btnEscrever" class="fab" type="button" aria-label="Escrever nova carta">+</button></div></section>' +
    '<section class="filtros" aria-label="Filtros"><div class="row date-buttons"><button type="button" id="filtrarData">Filtrar por data</button><button type="button" id="limparData">Limpar data</button></div><label class="date-input-label" id="dataWrap" hidden>Selecionar dia<input type="date" id="dataCartas" /></label><div class="row types"><button type="button" class="filter-btn active" data-filter="recebidas" aria-pressed="true">Cartas recebidas</button><button type="button" class="filter-btn" data-filter="enviadas" aria-pressed="false">Cartas enviadas</button><button type="button" class="filter-btn" data-filter="originais" aria-pressed="false">Cartas originais</button></div></section>' +
    '<section class="colecao-container" aria-label="Coleção de cartas"><div class="colecao-header"><div><span>COLEÇÃO</span><h2 id="colecaoTitulo">Minhas Cartas</h2></div><small id="colecaoCount">Carregando...</small></div><div class="progress-badge"><span id="lidasCount">Carregando leituras...</span></div><div class="subfiltros"><button type="button" data-sub="todas" class="sub active" aria-pressed="true">Todas</button><button type="button" data-sub="semdata" class="sub" aria-pressed="false">Sem data</button></div><p id="cartasStatus" role="status" aria-live="polite"></p><div id="cartasList" class="cartas-list" aria-live="polite"></div></section>' +
    '<section class="cartas-admin" id="cartasAdmin" hidden><div class="admin-title"><span>ADMINISTRAÇÃO</span><h2>Gerenciar cartas de usuários</h2></div><label>Consultar coleção de <select id="adminUserFilter"></select></label><div id="adminCartasCount" role="status"></div></section></section>' +
    '<dialog class="modal-carta" id="modalEscrever" aria-labelledby="modalEscreverTitle"><div class="modal-header"><button type="button" id="fecharModal" aria-label="Fechar editor">✕</button><strong id="modalEscreverTitle">Escrever carta</strong><button type="submit" form="cartaComposeForm" id="enviarCarta" class="btn-enviar">Enviar</button></div><form id="cartaComposeForm" class="modal-body"><label>Título da carta<input id="tituloCarta" name="subject" placeholder="Ex.: Estou feliz! De Moisés" maxlength="80" required /></label><div class="destinatario-picker" id="destPicker"><label>Destinatário<input type="search" id="buscarDestinatario" placeholder="Pesquisar pessoa..." autocomplete="off" /></label><div id="listaUsuarios" role="group" aria-label="Escolher destinatário"></div></div><label>Mensagem<textarea id="textoCarta" name="body" placeholder="Escreva sua carta..." maxlength="5000" required></textarea></label><div class="privada-section"><label><input type="checkbox" id="isPrivada" /> Carta privada com senha</label><div id="privadaFields" hidden><label>Senha<input id="senhaCarta" type="password" minlength="8" maxlength="256" autocomplete="new-password" /></label><label>Dica (opcional)<input id="dicaCarta" maxlength="240" placeholder="Dica para a senha" /></label></div></div><p id="enviarStatus" role="alert"></p></form></dialog>' +
    "<dialog class=\"modal-carta modal-read\" id=\"modalLeituraNova\" aria-labelledby=\"readCartaTitulo\"><div class=\"modal-header\"><button type=\"button\" id=\"fecharLeituraNova\" aria-label=\"Fechar carta\">✕</button><strong>Leitura da carta</strong><span aria-hidden=\"true\">✉</span></div><div class=\"modal-body\"><h2 id=\"readCartaTitulo\"></h2><p id=\"readCartaAutor\"></p><p id=\"readCartaData\"></p><div id=\"readCartaDicas\" class=\"letter-read-hints\"></div><form id=\"desbloquearNova\" hidden><label>Senha da carta<input id=\"senhaLeituraNova\" type=\"password\" autocomplete=\"current-password\" required></label><button class=\"btn-enviar\" type=\"submit\">Desbloquear</button></form><div id=\"readCartaTexto\" class=\"carta-texto\"></div><div class=\"letter-reader-actions\"><button id=\"editarCartaLida\" class=\"btn-enviar\" type=\"button\" hidden>Editar carta</button><button id=\"mostrarDicaNova\" class=\"letter-aux-button\" type=\"button\" hidden aria-expanded=\"false\" aria-controls=\"formDicaNova\">Adicionar dica</button></div><form id=\"formDicaNova\" class=\"letter-hint-compact\" hidden><label>Nova dica<input name=\"password_hint\" maxlength=\"240\" placeholder=\"Uma pista para a senha\"></label><button class=\"btn-enviar\" type=\"submit\">Salvar dica</button><p id=\"novaDicaStatus\" role=\"status\" aria-live=\"polite\"></p></form><p id=\"readCartaStatus\" role=\"status\"></p></div></dialog>" +
    editorMarkup +
    '<div id="cartasToast" role="status" aria-live="polite" class="cartas-toast" hidden></div>';
}
await mountAppPage({ page: "letters", render: async ({ root, client, user, isAdmin }) => {
  const [archiveResult, communityResult, profilesResult] = await Promise.allSettled([
    loadArchivedCards(client, user.id, isAdmin),
    loadCommunityLetters(client, user.id, isAdmin),
    client.from("profiles").select("id,username,display_name,avatar_path").order("username").limit(250)
  ]);
  const archive = archiveResult.status === "fulfilled" ? archiveResult.value : { cards: [], reads: [], readsUnavailable: true };
  let letters = communityResult.status === "fulfilled" ? communityResult.value : [];
  let people = profilesResult.status === "fulfilled" && !profilesResult.value.error ? profilesResult.value.data || [] : [];
  try { people = await signProfileAvatars(client, people); } catch { /* text fallback */ }
  // Keep the proven encrypted-letter and protected-archive readers accessible as dialogs.
  // Their old collections are not presented: the entire visible interface is rebuilt.
  root.innerHTML = visual() + '<div class="letter-engine">' +
    communityLettersMarkup(letters, people, user.id, isAdmin, archive.cards.length > 0) + archivedCardsMarkup() + '</div>';
  if (communityResult.status === "fulfilled") bindCommunityLetters(root, client, user, people, letters, isAdmin, archive.cards);
  if (archiveResult.status === "fulfilled") bindArchivedCards(root, client, user.id, archive, isAdmin, people);
  const $ = (selector) => root.querySelector(selector);
  const state = { filter: "recebidas", sub: "todas", date: "", adminUser: user.id,
    cards: archive.cards, reads: new Set(archive.reads.map(item => item.card_id)), letters, selectedRecipient: null, editor: null, reading: null };
  const notify = (message, error = false) => {
    const notice = $("#cartasToast"); notice.textContent = message; notice.hidden = false;
    notice.classList.toggle("error", error);
    clearTimeout(notify.timer); notify.timer = setTimeout(() => { notice.hidden = true; }, 3500);
  };
  const fullName = (id) => { const p = people.find(x => x.id === id); return p?.display_name || p?.username || "Perfil"; };
  const ownerTarget = () => isAdmin ? state.adminUser : user.id;
  const filtered = () => {
    let rows = [];
    if (state.filter === "originais") {
      rows = state.cards.filter(c => c.recipient_id === ownerTarget()).map(c => ({
        kind: "archive", id: c.id, title: cardTitle(c), author: "Peixinho · ADM",
        date: c.date, num: c.card_number, read: state.reads.has(c.id), locked: c.is_protected, raw: c
      }));
    } else {
      const owner = ownerTarget();
      rows = state.letters.filter(c => state.filter === "enviadas" ? c.sender_id === owner : c.recipient_id === owner)
        .map((c, i) => ({
          kind: "community", id: c.id, title: c.subject, author: state.filter === "enviadas" ? "Para " + fullName(c.recipient_id) : fullName(c.sender_id),
          date: c.created_at, num: i + 1, read: false, locked: c.is_protected, raw: c
        }));
    }
    if (state.date) rows = rows.filter(c => {
      const d = c.date instanceof Date ? c.date : new Date(c.date || "");
      return !Number.isNaN(d.getTime()) && [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-") === state.date;
    });
    if (state.sub === "semdata") rows = rows.filter(c => !c.date || Number.isNaN(new Date(c.date).getTime()));
    return rows;
  };
  const updateList = () => {
    const rows = filtered();
    const total = state.filter === "originais"
      ? state.cards.filter(c => c.recipient_id === ownerTarget()).length
      : state.letters.filter(c => state.filter === "enviadas" ? c.sender_id === ownerTarget() : c.recipient_id === ownerTarget()).length;
    $("#colecaoTitulo").textContent = state.filter === "originais" ? "Minhas Cartas" : state.filter === "enviadas" ? "Cartas enviadas" : "Cartas recebidas";
    $("#colecaoCount").textContent = total + (total === 1 ? " carta" : " cartas");
    const archives = state.cards.filter(c => c.recipient_id === ownerTarget());
    const readCount = archives.filter(c => state.reads.has(c.id)).length;
    $("#lidasCount").textContent = state.filter === "originais"
      ? (archive.readsUnavailable ? "Leituras indisponíveis" : readCount + "/" + archives.length + " lidas")
      : total + (total === 1 ? " correspondência" : " correspondências") + " · " + (state.filter === "enviadas" ? "enviadas" : "recebidas");
    $("#cartasList").innerHTML = rows.length ? rows.map((c, i) =>
      '<article class="carta-item">' +
      '<button type="button" class="carta-open" data-letter-kind="'+c.kind+'" data-letter-id="'+h(c.id)+'" aria-label="Ler '+h(c.title)+'"><span class="num">'+String(c.num || i + 1).padStart(2,"0")+'</span><span class="info"><span class="carta-kicker">CARTA '+String(c.num || i + 1).padStart(2,"0")+'</span><span class="titulo">'+h(c.title)+'</span><span class="date">'+h(day(c.date))+'</span><span class="sender">'+(c.kind === "archive" ? "Enviada por " : "")+h(c.author)+'</span></span><span class="check '+(c.read?'checked':'')+'" aria-label="'+(c.read?"Lida":"Não lida")+'">'+(c.read ? "✓" : "✉")+'</span></button>' +
      ((c.kind==="community" && c.raw.sender_id===user.id) || (isAdmin && c.kind==="archive") ? '<button class="carta-admin-edit" type="button" data-edit-kind="'+c.kind+'" data-edit-id="'+h(c.id)+'">'+"Editar"+'</button>' : "") +
      '</article>').join("") : '<p class="cartas-empty">Nenhuma carta encontrada para os filtros selecionados.</p>';
    if (isAdmin) $("#adminCartasCount").textContent = "Cartas arquivadas: "+archives.length+" · correspondências: "+total;
  };
  const loadCurrent = async () => {
    // Load from the actual Neon tables after each write and on return to the tab.
    const [ar, cr] = await Promise.allSettled([
      loadArchivedCards(client, user.id, isAdmin),
      loadCommunityLetters(client, user.id, isAdmin)
    ]);
    if (ar.status === "fulfilled") {
      state.cards = ar.value.cards;
      state.reads = new Set(ar.value.reads.map(x => x.card_id));
      if (isAdmin) {
        const r = await client.from("archived_card_reads").select("card_id").eq("user_id", ownerTarget()).limit(1000);
        if (!r.error) state.reads = new Set((r.data || []).map(x => x.card_id));
      }
    }
    if (cr.status === "fulfilled") state.letters = cr.value;
    updateList();
    const complete = ar.status === "fulfilled" && cr.status === "fulfilled";
    if (!complete) notify("Parte das cartas não pôde ser sincronizada com o Neon.", true);
    return complete;
  };
  // Re-read real Neon letters and read receipts without remounting private editors.
  root.__looplyRefreshData = () => loadCurrent();
  if (isAdmin) {
    $("#cartasAdmin").hidden = false;
    $("#adminUserFilter").innerHTML = people.map(p=>'<option value="'+h(p.id)+'">'+h(p.display_name||p.username)+' · @'+h(p.username)+'</option>').join("");
    $("#adminUserFilter").value = user.id;
    $("#adminUserFilter").addEventListener("change", (e) => {
      state.adminUser = e.target.value; void loadCurrent();
    });
  }
  const renderRecipients = (term = "") => {
    const matches = people.filter(p => p.id !== user.id && (p.display_name+" "+p.username).toLocaleLowerCase("pt-BR").includes(term.toLocaleLowerCase("pt-BR")));
    $("#listaUsuarios").innerHTML = matches.length ? matches.map(p => '<button type="button" class="recipient'+(p.id===state.selectedRecipient?' selected':'')+'" data-recipient="'+h(p.id)+'" aria-pressed="'+(p.id===state.selectedRecipient)+'">'+
      '<span class="recipient-avatar">'+(p.avatarUrl ? '<img src="'+h(p.avatarUrl)+'" alt="" loading="lazy"/>' : h((p.display_name||p.username||"?")[0].toUpperCase()))+'</span><span class="recipient-meta"><strong>'+h(p.display_name||p.username)+'</strong><small>@'+h(p.username)+'</small></span><span class="recipient-select">'+(p.id===state.selectedRecipient?'Selecionado':'Selecionar')+'</span></button>').join("") : '<p class="cartas-empty">Nenhum destinatário encontrado.</p>';
  };
  const close = (id) => { const dialog=$("#"+id); if (dialog?.open) dialog.close(); };
  $("#btnEscrever").addEventListener("click", () => { state.selectedRecipient = null; $("#cartaComposeForm").reset(); $("#privadaFields").hidden=true; $("#enviarStatus").textContent=""; renderRecipients(); $("#modalEscrever").showModal(); });
  $("#fecharModal").addEventListener("click", ()=>close("modalEscrever"));
  $("#fecharLeituraNova").addEventListener("click", ()=>close("modalLeituraNova"));
  let editLoadGeneration = 0;
  const closeEdit = () => { ++editLoadGeneration; state.editor = null; close("editorAdminCarta"); };
  $("#fecharAdminCarta").addEventListener("click", closeEdit);
  $("#editorAdminCarta").addEventListener("close", () => { ++editLoadGeneration; state.editor = null; });
  const openLetterEditor = async (kind, id, trigger, unlockedPassword = "") => {
    const generation = ++editLoadGeneration;
    if (trigger) trigger.disabled = true;
    $("#cartasStatus").textContent = "Carregando conteúdo completo...";
    try {
      const full = await fetchFullLetterForEdit(client, kind, id, user.id, isAdmin);
      const needsPassword = kind === "community" && full.is_protected;
       if (kind === "community" && full.sender_id !== user.id) throw Error("Somente o remetente pode editar esta carta.");
      const canChangeArchivePassword = isAdmin && kind === "archive" && full.is_protected;
      // A letter already unlocked in the reader can open in edit mode with
      // its full decrypted text. Never preload a stale list snapshot.
      let unlockedText = null;
      if (needsPassword && unlockedPassword) {
        try { unlockedText = await unlockFullLetterForEdit(full, unlockedPassword); }
        catch { /* Source may have changed since the reader opened. Ask for the password. */ }
      }
      if (generation !== editLoadGeneration) return false;
      const form = $("#adminEditForm");
      form.reset();
      state.editor = { kind, raw: full, unlocked: !full.is_protected || unlockedText !== null };
      form.elements.subject.value = full.subject || "";
      form.elements.password.value = unlockedText !== null ? unlockedPassword : "";
      form.elements.body.value = unlockedText !== null ? unlockedText : full.is_protected ? "" : full.body;
      // Originals may be longer than the 5,000-character limit of new letters.
      if (kind === "community") form.elements.body.maxLength = COMMUNITY_LETTER_LIMIT;
      else form.elements.body.removeAttribute("maxlength");
      form.elements.body.disabled = !state.editor.unlocked;
      form.elements.is_private.checked = Boolean(full.is_private);
      form.elements.password_hint.value = "";
       $("#adminHintStatus").textContent = "";
       for (const id of ["adminHintSection","communityPasswordChange","adminArchivePasswordChange","adminOriginalRecovery"]) $("#"+id).open = false;
      $("#adminSubjectField").hidden = kind === "archive";
      $("#adminPrivateField").hidden = true;
      $("#adminHintSection").hidden = !full.is_protected;
      $("#adminPasswordField").hidden = !needsPassword;
      $("#communityPasswordChange").hidden = !needsPassword;
       $("#archiveCurrentPasswordField").hidden = !canChangeArchivePassword;
       $("#adminContentField").hidden = full.is_protected && !state.editor.unlocked;
      $("#desbloquearEdicaoCarta").hidden = !(needsPassword || canChangeArchivePassword) || state.editor.unlocked;
      $("#adminArchivePasswordChange").hidden = !canChangeArchivePassword;
      const canRecover = isAdmin && kind === "archive" && full.id === MISOL_ORIGINAL_RECOVERY_CARD_ID;
      $("#adminOriginalRecovery").hidden = !canRecover;
      $("#archiveRecoveryText").value = "";
      $("#archiveRecoveryMode").value = "password";
      $("#archiveRecoveryPasswordFields").hidden = false;
      $("#archiveRecoveryPassword").value = "";
      $("#archiveRecoveryPasswordConfirm").value = "";
      $("#archiveRecoveryAcknowledgement").checked = false;
      $("#archiveRecoveryStatus").textContent = "";
      $("#salvarAdminCarta").disabled = !state.editor.unlocked;
      $("#salvarAdminCarta").hidden = false;
      $("#adminDeleteCarta").hidden = !isAdmin || full.id === MISOL_ORIGINAL_RECOVERY_CARD_ID || kind === "community";
      $("#adminEditTitle").textContent = "Editar carta";
      $("#adminEditStatus").textContent = needsPassword && !state.editor.unlocked
        ? "Digite a senha atual e carregue o texto antes de editar."
        : full.is_protected && !state.editor.unlocked
          ? "Informe a senha atual para carregar e editar o conteúdo original." : "";
      $("#editorAdminCarta").showModal();
      (needsPassword && !state.editor.unlocked ? form.elements.password : canChangeArchivePassword ? form.elements.archive_current_password : form.elements.body).focus();
      return true;
    } catch (error) {
      if (generation === editLoadGeneration) notify(asError(error), true);
      return false;
    } finally {
      if (trigger) trigger.disabled = false;
      if (generation === editLoadGeneration) $("#cartasStatus").textContent = "";
    }
  };
  $("#desbloquearEdicaoCarta").addEventListener("click", async () => {
    const edit = state.editor, form = $("#adminEditForm"), status = $("#adminEditStatus");
    if (!edit || !edit.raw.is_protected || edit.unlocked) return;
    const generation = editLoadGeneration;
    const button = $("#desbloquearEdicaoCarta");
    button.disabled = true;
    try {
      let value;
      if (edit.kind === "archive") {
        const { data, error } = await client.rpc("v13_unlock_archived_card", {
          p_card_id: edit.raw.id, p_password: form.elements.archive_current_password.value
        });
        if (error || typeof data?.body !== "string") throw error || new Error(data?.error || "incorrect_password");
        value = data.body;
      } else value = await unlockFullLetterForEdit(edit.raw, form.elements.password.value);
      if (generation !== editLoadGeneration || state.editor !== edit) return;
      // Disabled until decrypted: no pending request can overwrite user typing.
      form.elements.body.value = value;
      edit.unlocked = true;
      form.elements.body.disabled = false;
      $("#adminContentField").hidden = false;
       $("#salvarAdminCarta").disabled = false;
      button.hidden = true;
      status.textContent = "";
      form.elements.body.focus();
    } catch (error) {
      status.textContent = /incorrect_password/i.test(String(error?.message || "")) ? "Senha incorreta." : asError(error);
    } finally { button.disabled = false; }
  });
  $("#archiveRecoveryMode").addEventListener("change", () => {
    const usePassword = $("#archiveRecoveryMode").value === "password";
    $("#archiveRecoveryPasswordFields").hidden = !usePassword;
    if (!usePassword) {
      $("#archiveRecoveryPassword").value = "";
      $("#archiveRecoveryPasswordConfirm").value = "";
    }
  });
  $("#archiveRecoverySave").addEventListener("click", async () => {
    const edit = state.editor;
    if (!isAdmin || !edit || edit.kind !== "archive" ||
        edit.raw.id !== MISOL_ORIGINAL_RECOVERY_CARD_ID) return;
    const generation = editLoadGeneration;
    const status = $("#archiveRecoveryStatus"), button = $("#archiveRecoverySave");
    if (button.disabled) return;
    const fullText = $("#archiveRecoveryText").value;
    const usePassword = $("#archiveRecoveryMode").value === "password";
    const password = usePassword ? $("#archiveRecoveryPassword").value : "";
    const confirmation = usePassword ? $("#archiveRecoveryPasswordConfirm").value : "";
    if (!fullText.trim() || fullText.length > 100000) {
      status.textContent = "Cole o texto completo (até 100.000 caracteres)."; return;
    }
    if (usePassword && (password.length < 7 || password.length > 256)) {
      status.textContent = "Defina uma senha de 7 a 256 caracteres."; return;
    }
    if (usePassword && password !== confirmation) {
      status.textContent = "As senhas digitadas não coincidem."; return;
    }
    if (!$("#archiveRecoveryAcknowledgement").checked) {
      status.textContent = "Confirme a substituição do texto original antes de salvar."; return;
    }
    button.disabled = true;
    status.textContent = "Salvando e verificando a carta no Neon...";
    let serverConfirmed = false;
    try {
      const { data, error } = await client.rpc("v14_admin_recover_archived_card", {
        p_card_id: edit.raw.id, p_new_body: fullText, p_use_password: usePassword,
        p_new_password: usePassword ? password : null, p_confirm_replace: true
      });
      if (error) throw error;
      if (data?.updated !== true || data?.verified !== true ||
          data?.is_protected !== usePassword) {
        throw Object.assign(new Error(data?.error || "recovery_not_confirmed"), { code: data?.error || "" });
      }
      serverConfirmed = true;
      // Independent authenticated read-back, including a real decrypt for protected cards.
      const persisted = await fetchFullLetterForEdit(client, "archive", edit.raw.id, user.id, isAdmin);
      if (persisted.is_protected !== usePassword) throw Error("recovery_verification_failed");
      if (usePassword) {
        const checked = await client.rpc("v13_unlock_archived_card", {
          p_card_id: edit.raw.id, p_password: password
        });
        if (checked.error || checked.data?.body !== fullText)
          throw Error("recovery_verification_failed");
      } else if (persisted.body !== fullText) {
        throw Error("recovery_verification_failed");
      }
      if (generation !== editLoadGeneration || state.editor !== edit) return;
      const refreshed = await loadCurrent();
      if (generation !== editLoadGeneration || state.editor !== edit) return;
      $("#archiveRecoveryPassword").value = "";
      $("#archiveRecoveryPasswordConfirm").value = "";
      if (!refreshed) {
        status.textContent = "Carta salva e verificada, mas não foi possível atualizar a lista. Reabra a página.";
        return;
      }
      $("#archiveRecoveryText").value = "";
      closeEdit();
      notify(usePassword ? "Carta original restaurada com sucesso. Use a nova senha para abrir."
        : "Carta original restaurada com sucesso, sem senha e com acesso privado.");
    } catch (error) {
      if (generation !== editLoadGeneration || state.editor !== edit) return;
      status.textContent = serverConfirmed
        ? "O Neon confirmou a gravação, mas a leitura independente falhou. Não salve novamente antes de conferir a carta. O texto foi mantido no editor."
        : archivedRecoveryError(error);
    } finally {
      if (generation === editLoadGeneration && state.editor === edit) button.disabled = false;
    }
  });
  $("#alterarSenhaCartaOriginal").addEventListener("click", async () => {
    const edit = state.editor, form = $("#adminEditForm"), status = $("#adminEditStatus");
    if (!isAdmin || !edit || edit.kind !== "archive" || !edit.raw.is_protected) return;
    const currentPassword = String(form.elements.archive_current_password.value || "");
    const newPassword = String(form.elements.archive_new_password.value || "");
    const confirmation = String(form.elements.archive_confirm_password.value || "");
    if (!currentPassword || newPassword.length < 8 || newPassword.length > 256) {
      status.textContent = "Informe a senha atual e uma nova senha entre 8 e 256 caracteres.";
      return;
    }
    if (newPassword !== confirmation) { status.textContent = "A confirmação da nova senha não confere."; return; }
    const button = $("#alterarSenhaCartaOriginal");
    button.disabled = true;
    status.textContent = "Alterando a senha com segurança...";
    try {
      if (!edit.unlocked || !form.elements.body.value.trim()) throw Error("Desbloqueie o texto completo antes de mudar a senha.");
      const { data, error } = await client.rpc("v13_admin_change_archived_card_password", {
        p_card_id: edit.raw.id, p_new_password: newPassword, p_new_body: form.elements.body.value
      });
      if (error) throw error;
      if (!data?.updated) throw new Error(data?.error || "password_change_unavailable");
      form.elements.archive_current_password.value = "";
      form.elements.archive_new_password.value = "";
      form.elements.archive_confirm_password.value = "";
      const verify = await client.rpc("v13_unlock_archived_card", { p_card_id: edit.raw.id, p_password: newPassword });
      if (verify.error || verify.data?.body !== form.elements.body.value) throw Error("A nova senha não passou na verificação.");
      await loadCurrent();
      closeEdit();
      notify("Senha e conteúdo da carta original salvos e verificados.");
    } catch (error) {
      status.textContent = asError(error) || "Não foi possível alterar a senha da carta.";
    } finally { button.disabled = false; }
  });
  $("#editarCartaLida").addEventListener("click", async e => {
    const letter = state.reading;
    if (!letter || letter.sender_id !== user.id) return;
    const readPassword = letter.is_protected && $("#desbloquearNova").hidden ? $("#senhaLeituraNova").value : "";
    const opened = await openLetterEditor("community", letter.id, e.currentTarget, readPassword);
    if (opened) close("modalLeituraNova");
  });

  const appendHintToLetter = async (kind, letter, value) => {
    const hint = String(value || "").trim();
    if (!hint || hint.length > 240) throw Error("Digite uma dica de até 240 caracteres.");
    if (!letter?.is_protected || (kind === "archive" ? !isAdmin : letter.sender_id !== user.id))
      throw Error("Somente o remetente pode adicionar dicas.");
    const previous = Array.isArray(letter.password_hints) && letter.password_hints.length
      ? letter.password_hints : letter.password_hint ? [letter.password_hint] : [];
    const hints = [...previous, hint];
    let query = client.from(kind === "archive" ? "archived_cards" : "community_letters")
      .update({ password_hint: hint, password_hints: hints }).eq("id", letter.id);
    if (kind === "community") query = query.eq("sender_id", user.id);
    const { data, error } = await query.select("id,password_hint,password_hints").single();
    if (error || data?.id !== letter.id || !Array.isArray(data.password_hints) ||
        data.password_hints.length !== hints.length || data.password_hints.at(-1) !== hint)
      throw error || Error("O servidor não confirmou a nova dica.");
    letter.password_hint = data.password_hint;
    letter.password_hints = data.password_hints;
    return data.password_hints.map((entry, i) => "Dica " + (i + 1) + ": " + entry).join(" · ");
  };
  $("#mostrarDicaNova").addEventListener("click", () => {
    const visible = $("#formDicaNova").hidden;
    $("#formDicaNova").hidden = !visible;
    $("#mostrarDicaNova").setAttribute("aria-expanded", String(visible));
    if (visible) $("#formDicaNova").elements.password_hint.focus();
  });
  $("#formDicaNova").addEventListener("submit", async event => {
    event.preventDefault();
    const letter = state.reading, form = event.currentTarget;
    const status = $("#novaDicaStatus"), button = form.querySelector('[type="submit"]');
    if (!letter || letter.sender_id !== user.id || !letter.is_protected) return;
    button.disabled = true;
    try {
      $("#readCartaDicas").textContent = await appendHintToLetter("community", letter, form.elements.password_hint.value);
      form.reset();
      status.textContent = "Dica adicionada.";
    } catch (error) { status.textContent = asError(error); }
    finally { button.disabled = false; }
  });
  $("#addEditorHint").addEventListener("click", async () => {
    const edit = state.editor, form = $("#adminEditForm"), button = $("#addEditorHint");
    const status = $("#adminHintStatus");
    if (!edit) return;
    button.disabled = true;
    try {
      await appendHintToLetter(edit.kind, edit.raw, form.elements.password_hint.value);
      form.elements.password_hint.value = "";
      status.textContent = "Dica adicionada ao histórico.";
      await loadCurrent();
    } catch (error) { status.textContent = asError(error); }
    finally { button.disabled = false; }
  });
  $("#buscarDestinatario").addEventListener("input", e => renderRecipients(e.target.value));
  $("#listaUsuarios").addEventListener("click",e=>{ const b=e.target.closest("[data-recipient]"); if(!b)return;state.selectedRecipient=b.dataset.recipient;renderRecipients($("#buscarDestinatario").value);});
  $("#isPrivada").addEventListener("change", e=> {$("#privadaFields").hidden=!e.target.checked;$("#senhaCarta").required=e.target.checked;});
  $("#cartaComposeForm").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,button=$("#enviarCarta"),title=$("#tituloCarta").value.trim(),body=$("#textoCarta").value.trim(),privateCarta=$("#isPrivada").checked;
    if(!title||!body||!state.selectedRecipient){notify("Preencha o título, o texto e escolha uma pessoa.",true);return;}
    if(privateCarta && $("#senhaCarta").value.length<8){notify("Escolha uma senha com pelo menos 8 caracteres.",true);return;}
    button.disabled=true; $("#enviarStatus").textContent="Salvando no Neon...";
    try {
      const sealed = privateCarta ? await sealLetter(body,$("#senhaCarta").value,title) : {body,password_salt:null,password_iv:null,password_ciphertext:null};
      const payload = {subject:title,recipient_id:state.selectedRecipient,sender_id:user.id,is_protected:privateCarta,
        body:sealed.body,password_salt:sealed.password_salt,password_iv:sealed.password_iv,password_ciphertext:sealed.password_ciphertext,
        password_hint: privateCarta ? $("#dicaCarta").value.trim() || null : null,attachments:[]};
      const {data,error}=await client.from("community_letters").insert(payload).select("id,subject,recipient_id,created_at");
      if(error) throw error;
      if(!Array.isArray(data)||!data.length) throw new Error("O banco não confirmou a carta.");
      close("modalEscrever");form.reset();state.selectedRecipient=null;state.filter="enviadas";state.sub="todas";state.date="";
      root.querySelectorAll("[data-filter]").forEach(b=>{const yes=b.dataset.filter===state.filter;b.classList.toggle("active",yes);b.setAttribute("aria-pressed",String(yes));});
      root.querySelectorAll("[data-sub]").forEach(b=>{const yes=b.dataset.sub==="todas";b.classList.toggle("active",yes);b.setAttribute("aria-pressed",String(yes));});
      $("#dataCartas").value="";await loadCurrent();notify("Carta enviada e confirmada no Neon!");
    }catch(error){$("#enviarStatus").textContent=asError(error);notify("Não foi possível enviar a carta.",true);}finally{button.disabled=false;}
  });
  root.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",async()=>{
    state.filter=b.dataset.filter;state.sub="todas";
    root.querySelectorAll("[data-filter]").forEach(x=>{const yes=x===b;x.classList.toggle("active",yes);x.setAttribute("aria-pressed",String(yes));});
    root.querySelectorAll("[data-sub]").forEach(x=>{const yes=x.dataset.sub==="todas";x.classList.toggle("active",yes);x.setAttribute("aria-pressed",String(yes));});
    await loadCurrent();
  }));
  root.querySelectorAll("[data-sub]").forEach(b=>b.addEventListener("click",()=>{
    state.sub=b.dataset.sub;
    root.querySelectorAll("[data-sub]").forEach(x=>{const yes=x===b;x.classList.toggle("active",yes);x.setAttribute("aria-pressed",String(yes));});
    updateList();
  }));
  $("#filtrarData").addEventListener("click",()=>{$("#dataWrap").hidden=!$("#dataWrap").hidden; if(!$("#dataWrap").hidden)$("#dataCartas").focus();});
  $("#dataCartas").addEventListener("change",e=>{state.date=e.target.value;updateList();});
  $("#limparData").addEventListener("click",()=>{state.date="";$("#dataCartas").value="";$("#dataWrap").hidden=true;updateList();});
  $("#cartasList").addEventListener("click",async e=>{
    const edit=e.target.closest("[data-edit-id]");
    if (edit) {
      e.preventDefault();
      await openLetterEditor(edit.dataset.editKind,edit.dataset.editId,edit);
      return;
    }
    const button=e.target.closest("[data-letter-id]");if(!button)return;
    if(button.dataset.letterKind==="archive"){
      // Reuse verified archive read receipt and password-unlock controller.
      const native=root.querySelector('.letter-engine [data-card-id="'+CSS.escape(button.dataset.letterId)+'"]');
      if(native){native.click();setTimeout(()=>{void loadCurrent()},600);}
      else notify("Esta carta não está disponível para sua conta.",true);
      return;
    }
    const letter=state.letters.find(c=>c.id===button.dataset.letterId);if(!letter)return;
    state.reading=letter;
     const senderControls = letter.sender_id === user.id;
     $("#editarCartaLida").hidden = !senderControls;
     $("#mostrarDicaNova").hidden = !(senderControls && letter.is_protected);
     $("#mostrarDicaNova").setAttribute("aria-expanded","false");
     $("#formDicaNova").hidden = true; $("#formDicaNova").reset(); $("#novaDicaStatus").textContent = "";
    $("#readCartaTitulo").textContent=letter.subject;
    $("#readCartaAutor").textContent="De "+fullName(letter.sender_id)+" · Para "+fullName(letter.recipient_id);
    $("#readCartaData").textContent=day(letter.created_at);
    $("#readCartaDicas").textContent=letter.is_protected ? (Array.isArray(letter.password_hints)&&letter.password_hints.length?letter.password_hints.join(" · "):letter.password_hint||"") : "";
    $("#desbloquearNova").hidden=!letter.is_protected;$("#readCartaTexto").hidden=Boolean(letter.is_protected);
    $("#readCartaTexto").textContent=letter.is_protected?"":letter.body||"";$("#readCartaStatus").textContent="";$("#senhaLeituraNova").value="";
    $("#modalLeituraNova").showModal();
    if(!letter.is_protected && letter.recipient_id===user.id && letter.sender_id!==user.id) {
      void client.rpc("v23_mark_community_letter_read",{p_letter_id:letter.id})
        .then(({error})=>{if(error)console.warn("Could not record letter read",error);});
    }
  });
  $("#desbloquearNova").addEventListener("submit",async e=>{
    e.preventDefault();const letter=state.reading;if(!letter)return;
    try{
      const opened=await openProtectedLetter(letter,$("#senhaLeituraNova").value);
      $("#readCartaTexto").textContent=opened;$("#readCartaTexto").hidden=false;
      $("#desbloquearNova").hidden=true;$("#readCartaStatus").textContent="Carta desbloqueada.";
      if(letter.recipient_id===user.id && letter.sender_id!==user.id){
        const [{error:unlockError},{error:readError}]=await Promise.all([
          client.rpc("looply_register_recipient_unlock",{p_letter_id:letter.id}),
          client.rpc("v23_mark_community_letter_read",{p_letter_id:letter.id})
        ]);
        if(unlockError)console.warn("Could not register private-letter unlock",unlockError);
        if(readError)console.warn("Could not register private-letter read",readError);
      }
    }
    catch{$("#readCartaStatus").textContent="Senha incorreta ou conteúdo indisponível.";}
  });
  $("#adminEditForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const editor = state.editor;
    if (!editor || (editor.kind === "community" ? editor.raw.sender_id !== user.id : !isAdmin)) return;
    if (editor.raw.is_protected && !editor.unlocked) {
      $("#adminEditStatus").textContent = "Carregue o texto completo com a senha antes de salvar.";
      return;
    }
    const form=e.currentTarget, save=$("#salvarAdminCarta"), generation=editLoadGeneration;
    if (save.disabled || form.dataset.saving === "true") return;
    save.disabled=true;
    form.dataset.saving="true";
    try {
      let persisted;
      if (editor.kind === "archive" && editor.raw.is_protected) {
        // Protected originals are saved through the authenticated RPC; never
        // overwrite their public empty body or change the password silently.
        if (!isAdmin || !editor.unlocked) throw Error("Desbloqueie a carta original antes de salvar.");
        const currentPassword = String(form.elements.archive_current_password.value || "");
        const text = form.elements.body.value;
        if (!currentPassword || !text.trim() || text.length > 100000) throw Error("Informe a senha atual e o conteúdo completo.");
        const { data, error } = await client.rpc("v13_admin_change_archived_card_password", {
          p_card_id: editor.raw.id, p_new_password: currentPassword, p_new_body: text
        });
        if (error || !data?.updated) throw error || Error(data?.error || "Não foi possível salvar a carta original.");
        const verify = await client.rpc("v13_unlock_archived_card", {
          p_card_id: editor.raw.id, p_password: currentPassword
        });
        if (verify.error || verify.data?.body !== text) throw Error("O conteúdo salvo não passou na verificação de leitura.");
        persisted = await fetchFullLetterForEdit(client,"archive",editor.raw.id,user.id,isAdmin);
      } else {
        persisted = await saveFullLetterEdit(client,{
          kind: editor.kind, letter: editor.raw, userId:user.id, isAdmin,
          subject:form.elements.subject.value, body:form.elements.body.value,
          password:form.elements.password.value, newPassword:form.elements.new_password.value,
          isPrivate:form.elements.is_private.checked
        });
      }
      if (generation !== editLoadGeneration || state.editor !== editor) return;
      editor.raw = persisted;
      const synced = await loadCurrent();
      if (generation !== editLoadGeneration || state.editor !== editor) return;
      if (!synced) {
        $("#adminEditStatus").textContent = "Alterações gravadas, mas não foi possível atualizar a lista. O texto continua no editor.";
        return;
      }
      closeEdit();
      notify("Carta atualizada e confirmada no Neon.");
    } catch(err) {
      if (generation===editLoadGeneration && state.editor===editor) $("#adminEditStatus").textContent=asError(err);
    } finally { form.dataset.saving="false"; if (generation===editLoadGeneration && state.editor===editor) save.disabled=false; }
  });
  $("#adminDeleteCarta").addEventListener("click",async()=>{
    if(!isAdmin||!state.editor)return;
    if(!confirm("Excluir permanentemente esta carta do Neon? Essa ação não pode ser desfeita."))return;
    const {kind,raw}=state.editor,button=$("#adminDeleteCarta");
    button.disabled=true;
    try {
      if(kind==="community"&&raw.attachments?.length)throw Error("Remova primeiro os anexos pela administração para evitar arquivos órfãos.");
      const table=kind==="archive"?"archived_cards":"community_letters";
      const {data,error}=await client.from(table).delete().eq("id",raw.id).select("id");
      if(error||!data?.length)throw error||Error("Exclusão não autorizada.");
      close("editorAdminCarta");await loadCurrent();notify("Carta removida do banco de dados.");
    }catch(err){$("#adminEditStatus").textContent=asError(err);}finally{button.disabled=false;}
  });
  $("#cartasStatus").textContent = [archiveResult,communityResult].every(x=>x.status==="fulfilled")?"": "Alguns dados não puderam ser carregados. Tente atualizar a página.";
  updateList();
  const requestedRecoveryId = new URLSearchParams(location.search).get("recoverCardId");
  if (isAdmin && requestedRecoveryId === MISOL_ORIGINAL_RECOVERY_CARD_ID) {
    const target = state.cards.find(c => c.id === requestedRecoveryId);
    if (target) {
      state.adminUser = target.recipient_id;
      $("#adminUserFilter").value = target.recipient_id;
      state.filter = "originais";
      state.sub = "todas";
      state.date = "";
      root.querySelectorAll("[data-filter]").forEach(button => {
        const active = button.dataset.filter === "originais";
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      void loadCurrent().then(ok => {
        if (ok) void openLetterEditor("archive", requestedRecoveryId, null);
      });
    } else {
      void loadCurrent();
      notify("Carta original não encontrada na coleção do ADM.", true);
    }
  } else if (isAdmin) void loadCurrent();
  const requestedLetterId=new URLSearchParams(location.search).get("letterId");
  const requestedCardId=new URLSearchParams(location.search).get("cardId");
  if(requestedCardId)requestAnimationFrame(()=>$("#cartasList [data-letter-id='"+CSS.escape(requestedCardId)+"']")?.click());
  if(requestedLetterId)requestAnimationFrame(()=>$("#cartasList [data-letter-id='"+CSS.escape(requestedLetterId)+"']")?.click());
}});
