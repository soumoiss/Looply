import { mountAppPage } from "../../src/page-runtime.js?v=one-session-entry-20261031";
import { archivedCardsMarkup, bindArchivedCards, loadArchivedCards } from "../../src/archived-cards.js?v=author-only-hints-20261030";
import { bindCommunityLetters, communityLettersMarkup, loadCommunityLetters, sealLetter, openProtectedLetter } from "../../src/letters-community.js?v=sent-letter-hints-modal-20261023";
import { signProfileAvatars } from "../../src/profiles.js";
import { installScheduledLetters } from "../../src/scheduled-letters.js?v=scheduled-inbox-20261031";
import { createLetterAttachmentComposer, createLetterAttachmentReader } from "../../src/letter-attachments.js?v=letter-native-attachments-20261103";
import { fetchFullLetterForEdit, unlockFullLetterForEdit, saveFullLetterEdit, COMMUNITY_LETTER_LIMIT } from "../../src/letter-edit-service.js?v=sender-editor-20261030";
import { closeEmojiPicker, toggleEmojiPicker } from "../../src/emoji-picker.js";
import { mountAdminLetterLog } from "../../src/admin-letter-log.js";

const h = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const formattedBody = value => h(value).replace(/\*\*([^*\n]+)\*\*/g,"<b>$1</b>")
  .replace(/__([^_\n]+)__/g,"<u>$1</u>").replace(/\*([^*\n]+)\*/g,"<i>$1</i>");
const day = (value) => value && !Number.isNaN(new Date(value).valueOf()) ? new Date(value).toLocaleDateString("pt-BR") : "Sem data";
const MISOL_ORIGINAL_RECOVERY_CARD_ID = "98df71c4-cf50-42fe-98d2-357d12633356";
const adminOriginalRecoveryMarkup = `
  <details id="adminOriginalRecovery" hidden aria-labelledby="adminOriginalRecoveryTitle"><summary>Restaurar conteúdo original</summary><div class="letter-recovery-fields">
    <h3 id="adminOriginalRecoveryTitle">Restaurar texto da carta original</h3>
    <label>Conteúdo completo da carta original
      <textarea id="archiveRecoveryText" rows="8" maxlength="100000" spellcheck="true"></textarea>
    </label>
    <label>Proteção da carta
      <select id="archiveRecoveryMode">
        <option value="password">Com senha</option>
        <option value="none">Sem senha</option>
      </select>
    </label>
    <div id="archiveRecoveryPasswordFields">
      <label>Nova senha <input id="archiveRecoveryPassword" type="password" autocomplete="new-password" placeholder="Digite a senha desejada" /></label>
      <label>Confirmar nova senha <input id="archiveRecoveryPasswordConfirm" type="password" autocomplete="new-password" placeholder="Repita a senha" /></label>
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

const editorMarkup = "<dialog class=\"modal-carta letter-edit-dialog\" id=\"editorAdminCarta\" aria-labelledby=\"adminEditTitle\">\n<div class=\"modal-header\"><button type=\"button\" id=\"fecharAdminCarta\" aria-label=\"Fechar editor\">✕</button><strong id=\"adminEditTitle\">Editar carta</strong><button id=\"salvarAdminCarta\" type=\"submit\" form=\"adminEditForm\" class=\"btn-enviar\">Salvar</button></div>\n<form class=\"modal-body letter-edit-body\" id=\"adminEditForm\">\n<label id=\"adminSubjectField\">Título<input name=\"subject\" maxlength=\"120\"></label>\n<div id=\"letterEditUnlock\" class=\"letter-edit-unlock\">\n<label id=\"adminPasswordField\" hidden>Senha atual da carta<input name=\"password\" type=\"password\" autocomplete=\"current-password\"></label>\n<label id=\"archiveCurrentPasswordField\" hidden>Senha atual da carta original<input name=\"archive_current_password\" type=\"password\" autocomplete=\"current-password\"></label>\n<button id=\"desbloquearEdicaoCarta\" class=\"btn-enviar\" type=\"button\" hidden>Desbloquear conteúdo</button>\n</div>\n<label id=\"adminContentField\">Conteúdo completo<textarea name=\"body\" rows=\"9\" spellcheck=\"true\" placeholder=\"Texto completo da carta\"></textarea></label>\n<label id=\"adminPrivateField\" hidden><input type=\"checkbox\" name=\"is_private\"> Carta privada</label>\n<details id=\"adminHintSection\" class=\"letter-edit-details\" hidden><summary>Adicionar dica</summary>\n<label id=\"adminHintField\">Nova dica<input name=\"password_hint\" maxlength=\"240\" placeholder=\"Uma pista para a senha\"></label>\n<button id=\"addEditorHint\" type=\"button\" class=\"btn-enviar\">Salvar dica</button><p id=\"adminHintStatus\" role=\"status\" aria-live=\"polite\"></p></details>\n<details id=\"communityPasswordChange\" class=\"letter-edit-details\" hidden><summary>Editar senha</summary>\n<label id=\"adminNewPasswordField\">Nova senha (opcional)<input name=\"new_password\" type=\"password\" autocomplete=\"new-password\"></label></details>\n<details id=\"adminArchivePasswordChange\" class=\"letter-edit-details\" hidden><summary>Editar senha</summary>\n<label>Nova senha<input name=\"archive_new_password\" type=\"password\" autocomplete=\"new-password\"></label>\n<label>Confirmar nova senha<input name=\"archive_confirm_password\" type=\"password\" autocomplete=\"new-password\"></label>\n<button id=\"alterarSenhaCartaOriginal\" class=\"btn-enviar\" type=\"button\">Salvar nova senha</button></details>" + adminOriginalRecoveryMarkup + "<p id=\"adminEditStatus\" role=\"status\" aria-live=\"polite\"></p>\n<button id=\"adminDeleteCarta\" class=\"danger\" type=\"button\" hidden>Excluir carta permanentemente</button></form></dialog>";

const modelPaths = {
  mail:"M3 6h18v12H3z M3 7l9 6 9-6", plus:"M12 5v14 M5 12h14", search:"M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z M21 21l-5-5",
  lock:"M5 11h14v9H5z M8 11V8a4 4 0 0 1 8 0v3", eye:"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2", clip:"M20 11l-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7",
  mic:"M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3",star:"M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  x:"M6 6l12 12 M18 6L6 18", send:"M3 11l18-8-8 18-2-8z", photo:"M3 5h18v14H3z M8 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3 M3 17l5-5 4 4 3-3 6 5", reply:"M9 14L4 9l5-5 M4 9h9a7 7 0 0 1 7 7v2", check:"M5 12l5 5 9-10"
};
const mi = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${modelPaths[name]}"></path></svg>`;
const papers = [["#fffaf0","#29252f"],["#ffe4ec","#4a1230"],["#ece4ff","#2d1b55"],["#1f1730","#f3e6c4"],["#e7f4ea","#1d3b27"],["#fff1d6","#4b2a14"],["#dff1ff","#12324d"],["#fde7f6","#5a1646"]];
const inks = ["#29252f","#7010b0","#a3123a","#1d5fa8","#c9a24b"];
const defaultSeal = "💌";

function visual() {
  return `<section class="letter-model shell">
    <section class="hero" id="hero"><h1>Olá, <span id="cartasHeroName">você</span></h1><div class="stats">
      <div class="stat"><b id="cartasUnread">0</b><span>não lidas</span></div><div class="stat"><b id="cartasReceived">0</b><span>recebidas</span></div><div class="stat"><b id="cartasSent">0</b><span>enviadas</span></div><div class="stat"><b id="cartasScheduled">0</b><span>agendadas</span></div>
    </div></section>
    <section class="seg" aria-label="Coleções"><div class="row types">
      <button type="button" class="filter-btn on" data-filter="recebidas" aria-pressed="true">Recebidas <em id="tabReceived">0</em></button><button type="button" class="filter-btn" data-filter="enviadas" aria-pressed="false">Enviadas <em id="tabSent">0</em></button>
      <button type="button" class="filter-btn" data-filter="programadas" aria-pressed="false" data-scheduled-tab>Agendadas <em id="tabScheduled">0</em></button>
      <button type="button" class="filter-btn admin-only" data-filter="todas" aria-pressed="false" hidden>Todas (ADM)</button><button type="button" class="filter-btn admin-only" data-filter="registro" aria-pressed="false" hidden>Registro (ADM)</button>
    </div></section>
    <div class="tools"><label class="search">${mi("search")}<input id="buscarCartas" type="search" placeholder="Buscar cartas, pessoas…" aria-label="Buscar cartas"></label><div class="chips" aria-label="Filtros">
      <button type="button" data-sub="todas" class="fc on" aria-pressed="true">Todas</button><button type="button" data-sub="naolidas" class="fc" aria-pressed="false">Não lidas</button><button type="button" data-sub="comsenha" class="fc" aria-pressed="false">Com senha</button><button type="button" data-sub="leituraunica" class="fc" aria-pressed="false">Leitura única</button><button type="button" data-sub="favoritas" class="fc" aria-pressed="false">Favoritas</button>
    </div></div>
    <section aria-label="Cartas"><div class="sr-only" id="colecaoTitulo">Cartas recebidas</div><span class="sr-only" id="colecaoCount"></span><span class="sr-only" id="lidasCount"></span><p id="cartasStatus" role="status" aria-live="polite"></p><div id="cartasList" class="list" aria-live="polite"></div></section>
    <div id="cartasAdmin" hidden><label class="f">Consultar coleção de <select id="adminUserFilter"></select></label><div id="adminCartasCount" role="status"></div></div><div id="cartasAdminLog" hidden></div>
    <div hidden><button id="filtrarData" type="button"></button><button id="limparData" type="button"></button><label id="dataWrap" hidden><input type="date" id="dataCartas"></label></div>
    <button id="btnEscrever" class="fab" type="button" aria-label="Escrever nova carta">${mi("plus")}Escrever</button>
    <dialog class="modal-carta model-dialog" id="modalEscrever" aria-labelledby="modalEscreverTitle"><div class="sheet"><div class="grab"></div><header><h2 id="modalEscreverTitle">Nova carta</h2><button type="button" id="fecharModal" class="ib" aria-label="Fechar editor">${mi("x")}</button></header>
      <form id="cartaComposeForm" class="model-compose">
        <div class="sec"><h5><i>1</i>Para quem</h5><div id="listaUsuarios" class="pick" role="group" aria-label="Escolher destinatário"></div><label class="f">Buscar pessoa<input type="search" id="buscarDestinatario" placeholder="Pesquisar pessoa..." autocomplete="off"></label><div class="row"><button type="button" id="selecionarTodos" class="btn sm">Selecionar todos</button><span id="destinatariosCount"></span></div></div>
        <div class="sec"><h5><i>2</i>Escrita</h5><label class="f">Assunto<input id="tituloCarta" name="subject" maxlength="120" required></label><div class="row"><select id="letterFont" class="btn sm" aria-label="Fonte da carta"><option value="Cormorant Garamond">Clássica</option><option value="Caveat">Manuscrita</option><option value="Special Elite">Máquina</option><option value="Inter">Moderna</option></select><input id="letterSize" type="range" min="14" max="36" value="21" aria-label="Tamanho da letra"><span id="letterInks" class="row"></span></div><div id="letterPapers" class="row"></div><div class="row" id="letterFormatting"><button type="button" class="btn sm" data-format="**" aria-label="Negrito"><b>B</b></button><button type="button" class="btn sm" data-format="*" aria-label="Itálico"><i>I</i></button><button type="button" class="btn sm" data-format="__" aria-label="Sublinhado"><u>U</u></button><button type="button" id="letterSeal" class="btn sm" aria-expanded="false">Selo <span aria-hidden="true">💌</span></button></div><label class="f">Mensagem<textarea id="textoCarta" name="body" class="paper" maxlength="5000" required></textarea></label></div>
        <div class="sec"><h5><i>3</i>Anexos</h5><div class="letter-compose-files"><div class="row"><button type="button" id="letterImport" class="btn sm">${mi("clip")}Fotos e arquivos</button><input id="letterFileInput" type="file" multiple hidden aria-label="Escolher arquivos"><button type="button" id="letterRecord" class="btn sm">${mi("mic")}Gravar áudio</button><button type="button" id="letterStopRecord" class="btn sm" hidden>■ Parar</button></div><span id="letterFileStatus" role="status" aria-live="polite"></span><ul id="letterFileList" class="att" aria-label="Anexos selecionados"></ul></div></div>
        <div class="sec"><h5><i>4</i>Segurança e tempo</h5><label class="opt">${mi("lock")}<span><b>Senha</b></span><input type="checkbox" id="isPrivada" role="switch"></label><div id="privadaFields" class="reveal" hidden><label class="f">Senha da carta<input id="senhaCarta" type="password" autocomplete="new-password"></label><label class="f">Dica (opcional)<input id="dicaCarta" maxlength="240"></label></div><label class="opt">${mi("eye")}<span><b>Visualização única</b></span><input type="checkbox" id="letterOnce" role="switch"></label></div>
        <p id="enviarStatus" role="alert"></p><button type="submit" id="enviarCarta" class="btn main" style="width:100%;min-height:54px">${mi("send")}Selar e enviar</button>
      </form></div></dialog>
    <dialog class="modal-carta model-dialog" id="modalLeituraNova" aria-labelledby="readCartaTitulo"><div class="sheet"><div class="grab"></div><header><h2 id="readCartaTitulo">Carta</h2><button type="button" id="fecharLeituraNova" class="ib" aria-label="Fechar carta">${mi("x")}</button></header><p id="readCartaAutor"></p><p id="readCartaData"></p><div class="stage"><div class="envl" id="letterEnvelope"><div class="flap"></div><div class="wax">💌</div></div></div><div id="readCartaDicas" class="banner i"></div><form id="desbloquearNova" class="pw" hidden><h2>Carta protegida</h2><label class="f">Senha da carta<input id="senhaLeituraNova" type="password" autocomplete="current-password" required></label><button class="btn main" type="submit">Abrir</button></form><div id="readCartaTexto" class="letter"></div><div id="readCartaAttachments" class="letter-read-attachments" aria-label="Anexos da carta"></div><div id="letterReactions" class="react"></div><div id="letterReceipts" class="rec"></div><div class="row"><button id="responderCarta" class="btn" type="button">${mi("reply")}Responder</button><button id="editarCartaLida" class="btn" type="button" hidden>Editar carta</button><button id="mostrarDicaNova" class="btn" type="button" hidden aria-expanded="false" aria-controls="formDicaNova">Adicionar dica</button></div><form id="formDicaNova" hidden><label class="f">Nova dica<input name="password_hint" maxlength="240"></label><button class="btn main" type="submit">Salvar dica</button><p id="novaDicaStatus" role="status" aria-live="polite"></p></form><p id="readCartaStatus" role="status"></p></div></dialog>
    ${editorMarkup}<div id="cartasToast" role="status" aria-live="polite" class="cartas-toast" hidden></div>
  </section>`;
}

await mountAppPage({ page: "letters", render: async ({ root, client, user, profile, isAdmin }) => {
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
    cards: archive.cards, reads: new Set(archive.reads.map(item => item.card_id)), letters, hiddenSent: new Set(), selectedRecipient: null, selectedRecipients: new Set(), search: "", favorites: new Set(), communityReads: new Set(), editor: null, reading: null, style: { paper: papers[0][0], ink: inks[0], font: "Cormorant Garamond", size: 21, seal: defaultSeal } };
  const notify = (message, error = false) => {
    const notice = $("#cartasToast"); notice.textContent = message; notice.hidden = false;
    notice.classList.toggle("error", error);
    clearTimeout(notify.timer); notify.timer = setTimeout(() => { notice.hidden = true; }, 3500);
  };
  const composerAttachments = createLetterAttachmentComposer(root, notify);
  const readerAttachments = createLetterAttachmentReader(root, client);
  const fullName = (id) => { const p = people.find(x => x.id === id) || (id === user.id ? profile : null); return p?.display_name || p?.username || "Perfil"; };
  const ownerTarget = () => isAdmin ? state.adminUser : user.id;
  const avatar = id => {
    const person = people.find(p => p.id === id);
    const name = person?.display_name || person?.username || "?";
    return person?.avatarUrl ? `<img class="av" src="${h(person.avatarUrl)}" alt="" loading="lazy">` : `<span class="av" aria-hidden="true">${h(name.slice(0,1).toUpperCase())}</span>`;
  };
  const ownerRows = () => {
    const owner = ownerTarget();
    const originals = state.cards.filter(c => c.recipient_id === owner).map(c => ({
      kind:"archive", id:c.id, title:cardTitle(c), author:"Peixinho · ADM", avatarId:people.find(p=>p.username?.toLowerCase()==="peixinho")?.id,
      date:c.date, num:c.card_number, read:state.reads.has(c.id), locked:c.is_protected,
      excerpt:c.is_protected?"Protegida por senha":String(c.body||"").slice(0,160), raw:c
    }));
    const received = state.letters.filter(c => c.recipient_id === owner).map(c => ({
      kind:"community", id:c.id, title:c.subject, author:fullName(c.sender_id),avatarId:c.sender_id,
      date:c.created_at, read:state.communityReads.has(c.id), locked:c.is_protected,
      excerpt:c.is_protected?"Protegida por senha":String(c.body||"").slice(0,160),raw:c
    }));
    const sent = state.letters.filter(c => c.sender_id === owner && !state.hiddenSent.has("community:"+c.id)).map(c => ({
      kind:"community",id:c.id,title:c.subject,author:"Para " + fullName(c.recipient_id),avatarId:c.recipient_id,
      date:c.created_at,read:true,locked:c.is_protected,
      excerpt:c.is_protected?"Protegida por senha":String(c.body||"").slice(0,160),raw:c
    }));
    return { received:[...received,...originals].sort((a,b)=>(new Date(b.date||0))-(new Date(a.date||0))),sent };
  };
  const filtered = () => {
    const groups=ownerRows();
    let rows=state.filter==="enviadas"?groups.sent:state.filter==="todas"?[...groups.received,...groups.sent]:groups.received;
    if(state.filter==="registro") rows=groups.received.filter(c=>c.read);
    if(state.sub==="naolidas") rows=rows.filter(c=>!c.read);
    if(state.sub==="comsenha") rows=rows.filter(c=>c.locked);
    if(state.sub==="favoritas") rows=rows.filter(c=>state.favorites.has(c.kind+":"+c.id));
    if(state.sub==="leituraunica") rows=rows.filter(c=>c.raw.view_once===true);
    if(state.search) rows=rows.filter(c=>[c.title,c.author,c.excerpt,fullName(c.raw.recipient_id),fullName(c.raw.sender_id)]
      .some(value=>String(value||"").toLocaleLowerCase("pt-BR").includes(state.search)));
    if(state.date) rows=rows.filter(c=>{
      const d=new Date(c.date||"");return !Number.isNaN(d.getTime())&&[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")===state.date;
    });
    return rows;
  };
  let scheduledController = null;
  const updateList = () => {
    const groups=ownerRows();
    const received=groups.received.length,sent=groups.sent.length;
    const scheduled=scheduledController?.counts().sent || 0;
    const unread=groups.received.filter(c=>!c.read).length;
    $("#cartasHeroName").textContent=fullName(user.id).split(/\s+/)[0] || "você";
    for(const [id,value] of [["cartasReceived",received],["cartasSent",sent],["cartasScheduled",scheduled],["cartasUnread",unread],["tabReceived",received],["tabSent",sent],["tabScheduled",scheduled]]) $("#"+id).textContent=String(value);
    const active=root.querySelector('[data-filter="'+state.filter+'"]');
    root.querySelectorAll("[data-filter]").forEach(button=>{const on=button===active;button.classList.toggle("on",on);button.setAttribute("aria-pressed",String(on));});
    root.querySelectorAll("[data-sub]").forEach(button=>{const on=button.dataset.sub===state.sub;button.classList.toggle("on",on);button.setAttribute("aria-pressed",String(on));});
    $("#colecaoTitulo").textContent=state.filter==="programadas"?"Cartas agendadas":state.filter==="enviadas"?"Cartas enviadas":"Cartas recebidas";
    $("#colecaoCount").textContent=(state.filter==="enviadas"?sent:received)+" cartas";
    $("#lidasCount").textContent=`${received-unread}/${received} lidas`;
    $("#cartasAdmin").hidden=!isAdmin||!(state.filter==="todas"||state.filter==="registro");
    $("#cartasAdminLog").hidden=!isAdmin||state.filter!=="registro";
    $("#cartasList").hidden=state.filter==="registro";
    if(state.filter==="programadas"){scheduledController?.render();return;}
    const rows=filtered();
    $("#cartasList").innerHTML=rows.length?rows.map((c,i)=>{
      const key=c.kind+":"+c.id, favorite=state.favorites.has(key);
      const canFavorite=c.raw.recipient_id===user.id || (c.kind==="community"&&c.raw.sender_id===user.id);
      const badges=[c.locked?`<span class="bd">${mi("lock")}Senha</span>`:"",c.raw.view_once?`<span class="bd r">Leitura única</span>`:"",c.kind==="archive"?'<span class="bd g">Original</span>':"",!c.read?'<span class="bd">Nova</span>':""].join("");
      return `<article class="letter-row" style="--i:${i}"><div class="env ${c.read?"":"new"}">
        ${avatar(c.avatarId)}<button class="letter-open" type="button" data-letter-kind="${c.kind}" data-letter-id="${h(c.id)}" aria-label="Ler ${h(c.title)}"><span class="letter-person">${h(c.author)}</span><h3>${h(c.title)}</h3><p class="letter-excerpt">${h(c.excerpt)}</p><div class="meta">${badges}<span class="when">${h(day(c.date))}</span></div></button>
        <span class="side">${canFavorite?`<button type="button" class="star ${favorite?"on":""}" data-favorite-kind="${c.kind}" data-favorite-id="${h(c.id)}" aria-label="${favorite?"Remover dos favoritos":"Adicionar aos favoritos"}" aria-pressed="${favorite}">${mi("star")}</button>`:""}${c.read?mi("check"):'<span class="udot" aria-hidden="true"></span>'}</span></div>
        ${(c.kind==="community"&&c.raw.sender_id===user.id)||(isAdmin&&c.kind==="archive")||c.kind==="community"&&c.raw.sender_id===user.id?`<div class="env-actions">${(c.kind==="community"&&c.raw.sender_id===user.id)||(isAdmin&&c.kind==="archive")?`<button type="button" data-edit-kind="${c.kind}" data-edit-id="${h(c.id)}">Editar</button>`:""}${c.kind==="community"&&c.raw.sender_id===user.id?`<button type="button" data-delete-sent="${h(c.id)}">Excluir</button>`:""}</div>`:""}</article>`;
    }).join(""):'<p class="empty">Nenhuma carta</p>';
    if(isAdmin) $("#adminCartasCount").textContent=`${state.cards.filter(c=>c.recipient_id===ownerTarget()).length} originais · ${received} recebidas`;
  };
  const loadCurrent = async () => {
    // Load from the actual Neon tables after each write and on return to the tab.
    const [ar, cr, ui] = await Promise.allSettled([
      loadArchivedCards(client, user.id, isAdmin),
      loadCommunityLetters(client, user.id, isAdmin),
      client.from("looply_letter_ui_state").select("letter_kind,letter_id,favorite,reaction,read_at").eq("user_id",user.id).then(({data,error})=>{if(error)throw error;return data||[];})
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
    if (ui.status === "fulfilled") {
      state.favorites = new Set(ui.value.filter(x=>x.favorite).map(x=>x.letter_kind+":"+x.letter_id));
      state.communityReads = new Set(ui.value.filter(x=>x.letter_kind==="community"&&x.read_at).map(x=>x.letter_id));
      state.uiRows = ui.value;
    }
    const hidden=await client.rpc("v26_hidden_sent_ids",{});
    if(!hidden.error && Array.isArray(hidden.data))
      state.hiddenSent=new Set(hidden.data.map(x=>String(x.kind)+":"+String(x.id)));
    else console.warn("Sent letter hidden list unavailable",hidden.error?.code||"network");
    if (scheduledController) await scheduledController.reload();
    updateList();
    const complete = ar.status === "fulfilled" && cr.status === "fulfilled" && ui.status === "fulfilled";
    if (!complete) notify("Parte das cartas não pôde ser sincronizada com o Neon.", true);
    return complete;
  };
  const markRead = async letter => {
    const {error:receiptError}=await client.rpc("v23_mark_community_letter_read",{p_letter_id:letter.id});
    if(receiptError){console.warn("Could not record letter read",receiptError);return;}
    const {error}=await client.from("looply_letter_ui_state").upsert({
      user_id:user.id,letter_kind:"community",letter_id:letter.id,read_at:new Date().toISOString()
    },{onConflict:"user_id,letter_kind,letter_id"});
    if(error)console.warn("Could not sync letter receipt",error);
    else {state.communityReads.add(letter.id);updateList();}
  };
  // Re-read real Neon letters and read receipts without remounting private editors.
  root.__looplyRefreshData = () => loadCurrent();
  if (isAdmin) {
    root.querySelectorAll(".filter-btn.admin-only").forEach(button=>button.hidden=false);
    mountAdminLetterLog(root,client,$("#cartasAdminLog"));
    $("#cartasAdmin").hidden = false;
    $("#adminUserFilter").innerHTML = people.map(p=>'<option value="'+h(p.id)+'">'+h(p.display_name||p.username)+' · @'+h(p.username)+'</option>').join("");
    $("#adminUserFilter").value = user.id;
    $("#adminUserFilter").addEventListener("change", (e) => {
      state.adminUser = e.target.value; void loadCurrent();
    });
  }
  const renderRecipients = (term = "") => {
    const matches = people.filter(p => p.id !== user.id && (p.display_name+" "+p.username).toLocaleLowerCase("pt-BR").includes(term.toLocaleLowerCase("pt-BR")));
    $("#listaUsuarios").innerHTML = matches.length ? matches.map(p => '<button type="button" class="recipient'+(state.selectedRecipients.has(p.id)?' selected':'')+'" data-recipient="'+h(p.id)+'" aria-pressed="'+state.selectedRecipients.has(p.id)+'">'+
      '<span class="recipient-avatar">'+(p.avatarUrl ? '<img src="'+h(p.avatarUrl)+'" alt="" loading="lazy"/>' : h((p.display_name||p.username||"?")[0].toUpperCase()))+'</span><span class="recipient-meta"><strong>'+h(p.display_name||p.username)+'</strong><small>@'+h(p.username)+'</small></span><span class="recipient-select">Selecionado</span></button>').join("") : '<p class="cartas-empty">Nenhum destinatário encontrado.</p>';
    $("#destinatariosCount").textContent=state.selectedRecipients.size ? `${state.selectedRecipients.size} pessoa${state.selectedRecipients.size===1?"":"s"}` : "";
  };
  const close = (id) => { if (id === "modalEscrever") composerAttachments.stop(true); if (id === "modalLeituraNova") readerAttachments.clear(); const dialog=$("#"+id); if (dialog?.open) dialog.close(); };
  $("#modalEscrever").addEventListener("close", () => {
    composerAttachments.clear();
    closeEmojiPicker($("#letterSeal"));
  });
  $("#modalLeituraNova").addEventListener("close", () => readerAttachments.clear());
  $("#btnEscrever").addEventListener("click", () => { composerAttachments.clear(); state.selectedRecipient = null; state.selectedRecipients.clear(); $("#cartaComposeForm").reset(); $("#privadaFields").hidden=true; $("#senhaCarta").required=false; $("#enviarStatus").textContent=""; applyStyle(); renderRecipients(); $("#modalEscrever").showModal(); });
  scheduledController = installScheduledLetters({
    root,client,user,people,sealLetter,openProtectedLetter,notify,
    getRecipient:()=>state.selectedRecipient,
    getSeal:()=>state.style.seal,
    setSeal:seal=>{state.style.seal=seal||defaultSeal;applyStyle();},
    setRecipient:id=>{state.selectedRecipient=id;state.selectedRecipients=new Set(id?[id]:[]);renderRecipients();},
    onChanged:()=>loadCurrent(),
    selectScheduled:()=>{
      state.filter="programadas";state.sub="todas";state.date="";
      $("#dataCartas").value="";
      updateList();
    }
  });
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
    if (usePassword && password.length < 1) {
      status.textContent = "Defina uma senha."; return;
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
    if (!currentPassword || newPassword.length < 1) {
      status.textContent = "Informe a senha atual e a nova senha.";
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
  $("#listaUsuarios").addEventListener("click",e=>{
    const b=e.target.closest("[data-recipient]");if(!b)return;
    const id=b.dataset.recipient;
    if(state.selectedRecipients.has(id))state.selectedRecipients.delete(id);else state.selectedRecipients.add(id);
    state.selectedRecipient=state.selectedRecipients.values().next().value||null;
    renderRecipients($("#buscarDestinatario").value);
  });
  $("#selecionarTodos").addEventListener("click",()=>{
    const ids=people.filter(p=>p.id!==user.id).map(p=>p.id);
    state.selectedRecipients=state.selectedRecipients.size===ids.length?new Set():new Set(ids);
    state.selectedRecipient=state.selectedRecipients.values().next().value||null;
    renderRecipients($("#buscarDestinatario").value);
  });
  $("#isPrivada").addEventListener("change", e=> {$("#privadaFields").hidden=!e.target.checked;$("#senhaCarta").required=e.target.checked;});
  const applyStyle=()=>{
    const text=$("#textoCarta"), style=state.style;
    text.style.setProperty("--letter-paper",style.paper);
    text.style.setProperty("--letter-ink",style.ink);
    text.style.setProperty("--letter-font",JSON.stringify(style.font));
    text.style.setProperty("--letter-size",style.size+"px");
    $("#letterPapers").innerHTML=papers.map(([paper],i)=>`<button type="button" class="sw ${style.paper===paper?"on":""}" data-paper="${i}" style="background:${paper}" aria-label="Papel ${i+1}" aria-pressed="${style.paper===paper}"></button>`).join("");
    $("#letterInks").innerHTML=inks.map((ink,i)=>`<button type="button" class="sw ${style.ink===ink?"on":""}" data-ink="${i}" style="background:${ink}" aria-label="Tinta ${i+1}" aria-pressed="${style.ink===ink}"></button>`).join("");
    $("#letterSeal span").textContent=style.seal;
    $("#letterFont").value=style.font;$("#letterSize").value=String(style.size);
  };
  $("#letterPapers").addEventListener("click",e=>{const b=e.target.closest("[data-paper]");if(b){state.style.paper=papers[Number(b.dataset.paper)][0];applyStyle();}});
  $("#letterInks").addEventListener("click",e=>{const b=e.target.closest("[data-ink]");if(b){state.style.ink=inks[Number(b.dataset.ink)];applyStyle();}});
  const sealButton = $("#letterSeal");
  sealButton.addEventListener("click", () => toggleEmojiPicker(sealButton, {
    userId: user.id,
    action: "Usar",
    focusSearch: false,
    onSelect(emoji) {
      state.style.seal = emoji;
      applyStyle();
      sealButton.focus();
    }
  }));
  $("#letterFont").addEventListener("change",e=>{state.style.font=e.target.value;applyStyle();});
  $("#letterSize").addEventListener("input",e=>{state.style.size=Number(e.target.value);applyStyle();});
  $("#letterFormatting").addEventListener("click",e=>{
    const b=e.target.closest("[data-format]");if(!b)return;
    const area=$("#textoCarta"),start=area.selectionStart,end=area.selectionEnd,mark=b.dataset.format;
    area.setRangeText(mark+area.value.slice(start,end)+mark,start,end,"select");area.focus();
  });
  applyStyle();
  $("#cartaComposeForm").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,button=$("#enviarCarta"),title=$("#tituloCarta").value.trim(),body=$("#textoCarta").value.trim(),privateCarta=$("#isPrivada").checked;
    const recipients=[...state.selectedRecipients];
    if(!title||!body||!recipients.length){notify("Preencha o título, o texto e escolha uma pessoa.",true);return;}
    if(privateCarta && $("#senhaCarta").value.length<1){notify("Escolha uma senha para a carta privada.",true);return;}
    if(!composerAttachments.validate(privateCarta)){notify("Revise os anexos antes de enviar.",true);return;}
    const modelStyle = {...state.style};
    const viewOnce = $("#letterOnce").checked;
    button.disabled=true;let completed=0;
    try {
      const sealed=privateCarta?await sealLetter(body,$("#senhaCarta").value,title):{body,password_salt:null,password_iv:null,password_ciphertext:null};
      for(const recipient of recipients){
        $("#enviarStatus").textContent=`Enviando carta ${completed+1} de ${recipients.length}...`;
        const payload={subject:title,recipient_id:recipient,sender_id:user.id,is_protected:privateCarta,
          body:sealed.body,password_salt:sealed.password_salt,password_iv:sealed.password_iv,password_ciphertext:sealed.password_ciphertext,
          password_hint:privateCarta?$("#dicaCarta").value.trim()||null:null,attachments:[],model_style:modelStyle,view_once:viewOnce};
        const {data,error}=await client.from("community_letters").insert(payload).select("id,subject,recipient_id,created_at");
        if(error||!data?.length)throw error||Error("O banco não confirmou a carta.");
        const createdId=data[0].id;
        if(composerAttachments.count){
          let uploadedPaths=[];
          try {
            const sent=await composerAttachments.upload(createdId,{client,password:privateCarta?$("#senhaCarta").value:"",salt:sealed.password_salt});
            uploadedPaths=sent.uploaded;
            if(sent.metadata.length!==composerAttachments.count)throw Error("Nem todos os anexos foram enviados.");
            const {error:metadataError}=await client.from("community_letters").update({attachments:sent.metadata}).eq("id",createdId).eq("sender_id",user.id);
            if(metadataError)throw metadataError;
          }catch(uploadError){
            const paths=uploadError.uploaded||uploadedPaths;
            if(paths.length)await client.storage.from("looply-letters").remove(paths);
            const rollback=await client.from("community_letters").delete().eq("id",createdId).eq("sender_id",user.id);
            if(rollback.error)throw Error("Carta criada sem alguns anexos. Confira Enviadas antes de tentar novamente.");
            throw uploadError;
          }
        }
        state.selectedRecipients.delete(recipient);
        completed++;
      }
      close("modalEscrever");form.reset();state.selectedRecipient=null;state.selectedRecipients.clear();state.filter="enviadas";state.sub="todas";state.date="";
      $("#dataCartas").value="";await loadCurrent();notify(completed===1?"Carta enviada":"Cartas enviadas");
    }catch(error){console.warn("Letter send failed",error?.code||error?.message);notify(completed?`${completed} de ${recipients.length} cartas enviadas; confira Enviadas antes de repetir.`:"Não foi possível enviar a carta.",true);await loadCurrent();}
    finally{
      if (completed && $("#modalEscrever").open) {
        state.selectedRecipient=state.selectedRecipients.values().next().value||null;
        renderRecipients($("#buscarDestinatario").value);
      }
      $("#enviarStatus").textContent="";
      button.disabled=false;
    }
  });
  root.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",async()=>{
    state.filter=b.dataset.filter;state.sub="todas";
    await loadCurrent();
  }));
  root.querySelectorAll("[data-sub]").forEach(b=>b.addEventListener("click",()=>{
    state.sub=b.dataset.sub;
    updateList();
  }));
  $("#buscarCartas").addEventListener("input",event=>{state.search=event.target.value.trim().toLocaleLowerCase("pt-BR");updateList();});
  $("#filtrarData").addEventListener("click",()=>{$("#dataWrap").hidden=!$("#dataWrap").hidden; if(!$("#dataWrap").hidden)$("#dataCartas").focus();});
  $("#dataCartas").addEventListener("change",e=>{state.date=e.target.value;updateList();});
  $("#limparData").addEventListener("click",()=>{state.date="";$("#dataCartas").value="";$("#dataWrap").hidden=true;updateList();});
  $("#responderCarta").addEventListener("click",()=>{
    const letter=state.reading;if(!letter)return;
    close("modalLeituraNova");$("#btnEscrever").click();
    const peer=letter.sender_id===user.id?letter.recipient_id:letter.sender_id;
    state.selectedRecipients=new Set([peer]);state.selectedRecipient=peer;
    renderRecipients();$("#tituloCarta").value="Re: "+letter.subject;$("#tituloCarta").dispatchEvent(new Event("input"));
    $("#textoCarta").focus();
  });
  $("#letterReactions").addEventListener("click",async event=>{
    const button=event.target.closest("[data-reaction]"),letter=state.reading;
    if(!button||!letter||letter.recipient_id!==user.id)return;
    const previous=(state.uiRows||[]).find(row=>row.letter_kind==="community"&&row.letter_id===letter.id);
    const reaction=previous?.reaction===button.dataset.reaction?null:button.dataset.reaction;
    button.disabled=true;
    const {error}=await client.from("looply_letter_ui_state").upsert({user_id:user.id,letter_kind:"community",letter_id:letter.id,reaction},{onConflict:"user_id,letter_kind,letter_id"});
    if(error)notify("Não foi possível salvar a reação.",true);
    else {await loadCurrent();$("#letterReactions").querySelectorAll("[data-reaction]").forEach(b=>b.classList.toggle("on",b.dataset.reaction===reaction));}
    button.disabled=false;
  });
  $("#cartasList").addEventListener("click",async e=>{
    const favorite=e.target.closest("[data-favorite-id]");
    if(favorite){
      const key=favorite.dataset.favoriteKind+":"+favorite.dataset.favoriteId;
      const next=!state.favorites.has(key);favorite.disabled=true;
      try{
        const {error}=await client.from("looply_letter_ui_state").upsert({user_id:user.id,letter_kind:favorite.dataset.favoriteKind,letter_id:favorite.dataset.favoriteId,favorite:next},{onConflict:"user_id,letter_kind,letter_id"});
        if(error)throw error;
        await loadCurrent();
      }catch(error){console.warn("Favorite write failed",error?.code||error?.message);notify("Não foi possível salvar o favorito.",true);}
      finally{favorite.disabled=false;}
      return;
    }
    const remove=e.target.closest("[data-delete-sent]");
    if(remove){
      e.preventDefault();
      const id=remove.dataset.deleteSent;
      if(!state.letters.some(item=>item.id===id && item.sender_id===user.id))return;
      if(!confirm("Excluir esta carta da sua coleção de enviadas? A cópia recebida será preservada."))return;
      remove.disabled=true;
      try{
        const {data,error}=await client.rpc("v26_hide_sent_letter",{p_kind:"community",p_id:id});
        if(error || data!==true)throw error||Error("delete_unconfirmed");
        state.hiddenSent.add("community:"+id);
        updateList();
        notify("Carta excluída da sua coleção.");
      }catch(error){console.warn("Sent letter removal unavailable",error?.code||"network");notify("Não foi possível excluir a carta.",true);}
      finally{remove.disabled=false;}
      return;
    }
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
    const priorRead=state.communityReads.has(letter.id);
    if(letter.view_once&&priorRead&&letter.recipient_id===user.id&&letter.sender_id!==user.id){notify("Esta carta era de leitura única e já foi aberta.",true);return;}
    state.reading=letter;
    const mine=state.uiRows?.find(row=>row.letter_kind==="community"&&row.letter_id===letter.id);
    $("#letterReactions").innerHTML=letter.recipient_id===user.id?["❤️","🥹","😍","💜","👏","🌸"].map(emoji=>`<button type="button" data-reaction="${emoji}" class="${mine?.reaction===emoji?"on":""}" aria-label="Reagir ${emoji}" aria-pressed="${mine?.reaction===emoji}">${emoji}</button>`).join(""):"";
    $("#letterReceipts").textContent="";
    if(letter.sender_id===user.id){
      void client.rpc("v27_letter_activity",{p_letter_id:letter.id}).then(({data,error})=>{
        if(error||state.reading?.id!==letter.id)return;
        $("#letterReceipts").textContent=data?.read_at?`${fullName(letter.recipient_id)} leu em ${new Date(data.read_at).toLocaleString("pt-BR")}${data.reaction?" · "+data.reaction:""}`:"Aguardando leitura.";
      });
    }
     const senderControls = letter.sender_id === user.id;
     $("#editarCartaLida").hidden = !senderControls;
     $("#mostrarDicaNova").hidden = !(senderControls && letter.is_protected);
     $("#mostrarDicaNova").setAttribute("aria-expanded","false");
     $("#formDicaNova").hidden = true; $("#formDicaNova").reset(); $("#novaDicaStatus").textContent = "";
    readerAttachments.clear();
    $("#readCartaTitulo").textContent=letter.subject;
    $("#readCartaAutor").textContent="De "+fullName(letter.sender_id)+" · Para "+fullName(letter.recipient_id);
    $("#readCartaData").textContent=day(letter.created_at);
    const style=letter.model_style||{};
    for(const [key,value] of [["--letter-paper",style.paper||papers[0][0]],["--letter-ink",style.ink||inks[0]],["--letter-font",JSON.stringify(style.font||"Cormorant Garamond")],["--letter-size",(Number(style.size)||21)+"px"]]) $("#readCartaTexto").style.setProperty(key,value);
    $("#letterEnvelope .wax").textContent=style.seal||"💌";
    $("#letterEnvelope").classList.remove("open");
    requestAnimationFrame(()=>$("#letterEnvelope").classList.add("open"));
    $("#readCartaDicas").textContent=letter.is_protected ? (Array.isArray(letter.password_hints)&&letter.password_hints.length?letter.password_hints.join(" · "):letter.password_hint||"") : "";
    $("#desbloquearNova").hidden=!letter.is_protected;$("#readCartaTexto").hidden=Boolean(letter.is_protected);
    $("#readCartaTexto").innerHTML=letter.is_protected?"":formattedBody(letter.body||"");$("#readCartaStatus").textContent="";$("#senhaLeituraNova").value="";
    $("#modalLeituraNova").showModal();
    if (!letter.is_protected) void readerAttachments.render(letter);
    if(!letter.is_protected && letter.recipient_id===user.id && letter.sender_id!==user.id) {
      void markRead(letter);
    }
  });
  $("#desbloquearNova").addEventListener("submit",async e=>{
    e.preventDefault();const letter=state.reading;if(!letter)return;
    try{
      const opened=await openProtectedLetter(letter,$("#senhaLeituraNova").value);
      $("#readCartaTexto").innerHTML=formattedBody(opened);$("#readCartaTexto").hidden=false;
      void readerAttachments.render(letter,$("#senhaLeituraNova").value);
      $("#desbloquearNova").hidden=true;$("#readCartaStatus").textContent="";
      if(letter.recipient_id===user.id && letter.sender_id!==user.id){
        const {error:unlockError}=await client.rpc("looply_register_recipient_unlock",{p_letter_id:letter.id});
        if(unlockError)console.warn("Could not register private-letter unlock",unlockError);
        await markRead(letter);
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
      state.filter = "recebidas";
      state.sub = "todas";
      state.date = "";
      root.querySelectorAll("[data-filter]").forEach(button => {
        const active = button.dataset.filter === "recebidas";
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
  } else {
    const params = new URLSearchParams(location.search);
    const requestedLetterId = params.get("letterId");
    const requestedCardId = params.get("cardId");
    void loadCurrent().then(() => {
      if (requestedLetterId && ownerRows().sent.some(letter => letter.id === requestedLetterId)) {
        state.filter = "enviadas";
        updateList();
      }
      const requested = requestedLetterId || requestedCardId;
      if (requested) $("#cartasList [data-letter-id='"+CSS.escape(requested)+"']")?.click();
    });
  }
}});
