import { icon } from "./icons.js";
const passwordIterations = 310000;
const maxBodyLength = 5000;
const encoder = new TextEncoder();


function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}
function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decodeBase64Url(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function passwordKey(password, salt) {
  if (!globalThis.crypto?.subtle) throw new Error("Criptografia segura indisponível neste navegador.");
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: passwordIterations, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}
function letterAad(subject) {
  return encoder.encode("looply:community-letter:v1:" + subject);
}
export async function sealLetter(body, password, subject) {
  const text = String(body || "").trim();
  const secret = String(password || "");
  const cleanSubject = String(subject || "").trim();
  if (!text || text.length > maxBodyLength) throw new Error("A carta deve ter entre 1 e 5.000 caracteres.");
  if (!secret || /\s/.test(secret)) throw new Error("A senha deve conter pelo menos um caractere e não pode conter espaços.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(secret, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: letterAad(cleanSubject) }, key, encoder.encode(text)
  );
  return {
    body: null, password_salt: encodeBase64Url(salt), password_iv: encodeBase64Url(iv),
    password_ciphertext: encodeBase64Url(new Uint8Array(ciphertext))
  };
}
export async function openProtectedLetter(letter, password) {
  try {
    const key = await passwordKey(String(password || ""), decodeBase64Url(letter.password_salt));
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decodeBase64Url(letter.password_iv), additionalData: letterAad(String(letter.subject || "")) },
      key, decodeBase64Url(letter.password_ciphertext)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Senha incorreta.");
  }
}
function displayName(profile) {
  return String(profile?.display_name || profile?.username || "Perfil");
}
function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
export function matchesLetterDate(letter, dateValue) {
  if (!dateValue) return true;
  const date = new Date(letter?.created_at);
  if (Number.isNaN(date.valueOf())) return false;
  const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  return key === dateValue;
}
function dateFilterMarkup(kind, label) {
  return `<div class="community-letter-date-controls"><label for="letter-date-${kind}">Consultar por data</label><div><input id="letter-date-${kind}" type="date" data-letter-date-filter="${kind}" aria-label="Filtrar cartas ${label} por data"><button class="text-button" type="button" data-clear-letter-date="${kind}">Limpar</button></div><div class="community-date-calendar" data-community-calendar="${kind}"><div class="community-date-calendar-head"><strong data-community-calendar-month="${kind}"></strong><div><button type="button" data-community-calendar-nav="${kind}" data-month-step="-1" aria-label="Mês anterior">‹</button><button type="button" data-community-calendar-nav="${kind}" data-month-step="1" aria-label="Próximo mês">›</button></div></div><div class="community-date-calendar-weekdays" aria-hidden="true"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div><div class="community-date-calendar-grid" data-community-calendar-grid="${kind}"></div><p class="community-date-calendar-legend"><span>•</span> Dia com cartas</p></div><p data-letter-date-status="${kind}" role="status" aria-live="polite"></p></div>`;
}
function rowMarkup(letter, own) {
  const peer = own ? letter.recipient : letter.sender;
  return `<article class="community-letter-row"><div class="community-letter-meta"><strong>${escapeHtml(letter.subject)}</strong><span>${own ? "Para " : "De "}${escapeHtml(displayName(peer))}${letter.is_protected ? " · protegida por senha" : ""} · ${escapeHtml(dateLabel(letter.created_at))}</span></div><button class="text-button" type="button" data-open-community-letter="${escapeHtml(letter.id)}">${letter.is_protected ? "Desbloquear" : "Ler carta"}</button>${own ? `<button class="icon-action" type="button" data-delete-community-letter="${escapeHtml(letter.id)}" aria-label="Excluir carta enviada">${icon("trash")}</button>` : ""}</article>`;
}
export async function loadCommunityLetters(client, userId, isAdmin = false) {
  let query = client.from("community_letters")
    .select("id,sender_id,recipient_id,subject,body,is_protected,password_salt,password_iv,password_ciphertext,attachments,created_at,sender:profiles!community_letters_sender_id_fkey(username,display_name),recipient:profiles!community_letters_recipient_id_fkey(username,display_name)")
    .order("created_at", { ascending: false }).limit(isAdmin ? 1000 : 200);
  if (!isAdmin) query = query.or("sender_id.eq." + userId + ",recipient_id.eq." + userId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
function rowsMarkup(letters, userId, own, dateValue = "") {
  const rows = letters.filter((letter) => (own ? letter.sender_id === userId : letter.recipient_id === userId) && matchesLetterDate(letter, dateValue));
  if (!rows.length) return "<p class=\"community-letters-empty\">" + (dateValue ? "Nenhuma carta nesta data." : "Nenhuma carta " + (own ? "enviada." : "recebida.")) + "</p>";
  return rows.map((letter) => rowMarkup(letter, own)).join("");
}
function adminRowsMarkup(letters, direction = "all") {
  if (!letters.length) return "<p class=\"community-letters-empty\">Nenhuma carta encontrada.</p>";
  return letters.map((letter) => {
    const label = direction === "received" ? "Carta para " + displayName(letter.recipient) : direction === "sent" ? "Carta de " + displayName(letter.sender) : "Carta para " + displayName(letter.recipient);
    return "<article class=\"community-letter-row\"><div class=\"community-letter-meta\"><strong>" + escapeHtml(label) + "</strong><span>" + escapeHtml(letter.subject) + " · De " + escapeHtml(displayName(letter.sender)) + " → Para " + escapeHtml(displayName(letter.recipient)) + " · " + escapeHtml(dateLabel(letter.created_at)) + (letter.is_protected ? " · protegida" : "") + "</span></div><button type=\"button\" class=\"text-button\" data-open-community-letter=\"" + escapeHtml(letter.id) + "\">Abrir</button><button type=\"button\" class=\"icon-action\" data-admin-delete-community-letter=\"" + escapeHtml(letter.id) + "\" aria-label=\"Excluir carta como administrador\">" + icon("trash") + "</button></article>";
  }).join("");
}
export function communityLettersMarkup(letters, profiles, userId, isAdmin = false) {
  const options = (profiles || []).filter((profile) => profile.id !== userId)
    .map((profile) => "<option value=\"" + escapeHtml(profile.id) + "\">" + escapeHtml(displayName(profile)) +
      " (@" + escapeHtml(profile.username) + ")</option>").join("");
  return "<section class=\"panel community-letter-compose-panel\" aria-labelledby=\"communityLetterComposeTitle\">" +
    "<div class=\"community-letter-heading\"><div><span class=\"section-kicker\">Cartas</span><h2 id=\"communityLetterComposeTitle\">" + icon("pencil") + " Escrever carta</h2></div><button class='icon-action community-letter-compose-toggle' type='button' data-toggle-community-compose aria-expanded='false' aria-controls='communityLetterComposeForm' aria-label='Escrever carta'>" + icon("plus") + "</button></div>" +
    "<form class=\"community-letter-form\" id='communityLetterComposeForm' data-community-letter-compose hidden>" +
      "<label><span>" + icon("user") + " Destinatário</span><span>" + icon("users") + " Selecionar usuários</span><select name=\"recipient_id\" required><option value=\"\" disabled selected>Selecione um destinatário</option><option value=\"all\">Todos os usuários</option>" + options + "</select></label>" +
      "<label>Assunto<input name=\"subject\" maxlength=\"120\" required></label>" +
      "<label>Mensagem<textarea name=\"body\" rows=\"5\" maxlength=\"5000\" required></textarea></label>" +
      "<label class=\"community-letter-protect\"><input type=\"checkbox\" name=\"is_protected\" data-letter-protected> " + icon("lock") + " Proteger a carta com senha</label>" +
      "<label data-letter-password-wrap hidden>Senha da carta<input name=\"password\" type=\"password\" autocomplete=\"new-password\" data-letter-password disabled><button type='button' class='icon-action' data-toggle-letter-password aria-label='Mostrar senha' aria-pressed='false'>" + icon("eye") + "</button></label>" +
      "<div class=\"letter-attachment-tools\"><label class=\"letter-attach-button\">＋ Anexar mídia/arquivo<input type=\"file\" data-letter-files multiple accept=\"image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/webm,audio/ogg,audio/mpeg,audio/mp4,.pdf,.txt,.csv,.doc,.docx,.rtf\"></label><button type=\"button\" class=\"letter-attach-button\" data-letter-record>● Gravar áudio</button><button type=\"button\" class=\"letter-attach-button\" data-letter-stop-record disabled>Parar gravação</button><span data-letter-record-status role=\"status\"></span><div data-letter-attachment-list></div></div>" +
      "<button class=\"primary-button compact-button\" type=\"submit\">" + icon("send") + " Enviar carta</button>" +
      "<p class=\"form-status\" data-community-letter-compose-status role=\"status\" aria-live=\"polite\"></p>" +
    "</form></section>" +
    "<nav class=\"letter-collection-switcher\" aria-label=\"Exibição da coleção de cartas\">" +
      "<button type=\"button\" data-letter-collection-select=\"received\" class=\"active\" aria-pressed=\"true\">Cartas recebidas</button>" +
      "<button type=\"button\" data-letter-collection-select=\"sent\" aria-pressed=\"false\">Cartas enviadas</button>" +
      "<button type=\"button\" data-letter-collection-select=\"legacy\" aria-pressed=\"false\">Cartas originais</button></nav>" +
    "<section class=\"panel community-letter-collection\" data-letter-collection-panel=\"received\" aria-labelledby=\"communityReceivedLettersTitle\"><div class=\"community-letter-heading\"><div><span class=\"section-kicker\">Coleção</span><h2 id=\"communityReceivedLettersTitle\">Minhas Cartas · recebidas</h2></div><span data-letter-count=\"received\">" +
      letters.filter((letter) => isAdmin || letter.recipient_id === userId).length + "</span></div>" + dateFilterMarkup("received", "recebidas") + "<div class=\"community-letter-list\" data-community-letter-received>" + (isAdmin ? adminRowsMarkup(letters, "received") : rowsMarkup(letters, userId, false)) + "</div></section>" +
    "<section class=\"panel community-letter-collection\" data-letter-collection-panel=\"sent\" hidden aria-labelledby=\"communitySentLettersTitle\"><div class=\"community-letter-heading\"><div><span class=\"section-kicker\">Arquivo</span><h2 id=\"communitySentLettersTitle\">Cartas enviadas</h2></div><span data-letter-count=\"sent\">" +
      letters.filter((letter) => isAdmin || letter.sender_id === userId).length + "</span></div>" + dateFilterMarkup("sent", "enviadas") + "<div class=\"community-letter-list\" data-community-letter-sent>" + (isAdmin ? adminRowsMarkup(letters, "sent") : rowsMarkup(letters, userId, true)) + "</div></section>" +
    "<dialog class=\"community-letter-dialog\" data-community-letter-dialog aria-labelledby=\"communityLetterDialogTitle\"><div class=\"community-letter-dialog-card\">" +
      "<button type=\"button\" class=\"icon-action community-letter-close\" data-close-community-letter aria-label=\"Fechar carta\">" + icon("close") + "</button>" +
      "<span class=\"section-kicker\">Carta</span><h2 id=\"communityLetterDialogTitle\" data-community-letter-title></h2><p data-community-letter-byline></p>" +
      "<form data-community-letter-unlock hidden><label>Senha da carta<input type=\"password\" name=\"password\" autocomplete=\"current-password\" required><button type='button' class='icon-action' data-toggle-letter-password aria-label='Mostrar senha' aria-pressed='false'>"+ icon("eye") +"</button></label>" +
      "<button class=\"primary-button compact-button\" type=\"submit\">Desbloquear</button><p class=\"form-status\" data-community-letter-unlock-status role=\"status\" aria-live=\"polite\"></p></form>" +
      "<pre class=\"community-letter-body\" data-community-letter-body hidden></pre><div data-community-letter-attachments></div></div></dialog>";
}
export function bindCommunityLetters(root, client, user, profiles, initialLetters, isAdmin = false) {
  let letters = [...initialLetters];
  let selectedAttachments = [];
  let audioRecorder = null;
  let audioChunks = [];
  let activeLetter = null;
  const renderLetterAttachments = async (letter, unlocked) => {
    const box = root.querySelector("[data-community-letter-attachments]");
    if (!box) return;
    box.replaceChildren();
    if (!unlocked) return;
    for (const attachment of (letter.attachments || [])) {
      const { data: signed, error: signedError } = await client.storage.from("looply-letters").createSignedUrl(attachment.path, 300);
      if (signedError || !signed?.signedUrl) continue;
      const link = document.createElement("a");
      link.href = signed.signedUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.textContent = (attachment.type || "").startsWith("audio/") ? "▶ Ouvir áudio · " + attachment.name : (attachment.type || "").startsWith("video/") ? "▶ Abrir vídeo · " + attachment.name : (attachment.type || "").startsWith("image/") ? "Ver imagem · " + attachment.name : "Baixar arquivo · " + attachment.name;
      box.append(link);
    }
  };
  const dialog = root.querySelector("[data-community-letter-dialog]");
  const composeForm = root.querySelector("[data-community-letter-compose]");
  const composeToggle = root.querySelector("[data-toggle-community-compose]");
  const setComposeOpen = (open) => {
    if (!composeForm || !composeToggle) return;
    composeForm.hidden = !open;
    composeToggle.setAttribute("aria-expanded", String(open));
    composeToggle.setAttribute("aria-label", open ? "Fechar formulário de carta" : "Escrever carta");
    composeToggle.innerHTML = icon(open ? "close" : "plus");
    if (open) composeForm.querySelector("select[name=recipient_id]")?.focus();
  };
  composeToggle?.addEventListener("click", () => setComposeOpen(composeForm.hidden));
  root.querySelectorAll("[data-toggle-letter-password]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const input = toggle.parentElement?.querySelector("input");
      if (!input) return;
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      toggle.setAttribute("aria-label", reveal ? "Ocultar senha" : "Mostrar senha");
      toggle.setAttribute("aria-pressed", String(reveal));
      toggle.innerHTML = icon(reveal ? "eyeOff" : "eye");
    });
  });
  const renderLists = () => {
    const receivedDate = root.querySelector('[data-letter-date-filter="received"]')?.value || "";
    const sentDate = root.querySelector('[data-letter-date-filter="sent"]')?.value || "";
    const receivedMatches = letters.filter((letter) => (isAdmin || letter.recipient_id === user.id) && matchesLetterDate(letter, receivedDate)).length;
    const sentMatches = letters.filter((letter) => (isAdmin || letter.sender_id === user.id) && matchesLetterDate(letter, sentDate)).length;
    const received = root.querySelector("[data-community-letter-received]");
    const sent = root.querySelector("[data-community-letter-sent]");
    if (received) received.innerHTML = isAdmin ? adminRowsMarkup(letters.filter((letter) => matchesLetterDate(letter, receivedDate)), "received") : rowsMarkup(letters, user.id, false, receivedDate);
    if (sent) sent.innerHTML = isAdmin ? adminRowsMarkup(letters.filter((letter) => matchesLetterDate(letter, sentDate)), "sent") : rowsMarkup(letters, user.id, true, sentDate);
    const receivedStatus = root.querySelector('[data-letter-date-status="received"]');
    const sentStatus = root.querySelector('[data-letter-date-status="sent"]');
    if (receivedStatus) receivedStatus.textContent = receivedDate ? `${receivedMatches} carta(s) nesta data.` : "";
    if (sentStatus) sentStatus.textContent = sentDate ? `${sentMatches} carta(s) nesta data.` : "";
    renderCalendars();
    const receivedCount = root.querySelector('[data-letter-count="received"]');
    const sentCount = root.querySelector('[data-letter-count="sent"]');
    if (receivedCount) receivedCount.textContent = String(letters.filter((letter) => isAdmin || letter.recipient_id === user.id).length);
    if (sentCount) sentCount.textContent = String(letters.filter((letter) => isAdmin || letter.sender_id === user.id).length);
  };
  const calendarMonths = { received: new Date(), sent: new Date() };
  const localISO = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  const renderCommunityCalendar = (kind) => {
    const grid = root.querySelector(`[data-community-calendar-grid="${kind}"]`), label = root.querySelector(`[data-community-calendar-month="${kind}"]`), input = root.querySelector(`[data-letter-date-filter="${kind}"]`);
    if (!grid || !label) return;
    const month = calendarMonths[kind], year = month.getFullYear(), monthIndex = month.getMonth();
    label.textContent = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(month);
    grid.replaceChildren();
    for (let blank = 0; blank < new Date(year, monthIndex, 1).getDay(); blank++) { const spacer = document.createElement("span"); spacer.className = "community-calendar-blank"; grid.append(spacer); }
    const relevant = letters.filter((letter) => isAdmin || (kind === "received" ? letter.recipient_id === user.id : letter.sender_id === user.id));
    const datesWithLetters = new Set(relevant.map((letter) => { const date = new Date(letter.created_at); return Number.isNaN(date.valueOf()) ? "" : localISO(date); }).filter(Boolean));
    for (let day = 1, dayCount = new Date(year, monthIndex + 1, 0).getDate(); day <= dayCount; day++) {
      const date = new Date(year, monthIndex, day, 12), iso = localISO(date), hasLetters = datesWithLetters.has(iso), button = document.createElement("button");
      button.type = "button"; button.className = "community-calendar-day" + (hasLetters ? " has-letters" : "") + (input?.value === iso ? " is-selected" : "");
      button.dataset.communityCalendarDate = iso; button.dataset.communityCalendarKind = kind; button.disabled = !hasLetters; button.textContent = String(day);
      button.setAttribute("aria-label", day + " de " + label.textContent + (hasLetters ? ", com cartas" : ", sem cartas")); grid.append(button);
    }
  };
  const renderCalendars = () => { renderCommunityCalendar("received"); renderCommunityCalendar("sent"); };
  const reload = async () => { letters = await loadCommunityLetters(client, user.id, isAdmin); renderLists(); };
  const fileInput = root.querySelector("[data-letter-files]");
  const attachmentList = root.querySelector("[data-letter-attachment-list]");
  const recordButton = root.querySelector("[data-letter-record]");
  const stopRecordButton = root.querySelector("[data-letter-stop-record]");
  const recordStatus = root.querySelector("[data-letter-record-status]");
  const renderAttachmentList = () => {
    if (!attachmentList) return;
    attachmentList.innerHTML = selectedAttachments.map((file, index) => `<div class="letter-attachment-item">${escapeHtml(file.name)} · ${Math.max(1, Math.round(file.size / 1024))} KB <button type="button" data-remove-letter-attachment="${index}" aria-label="Remover anexo">×</button></div>`).join("");
  };
  fileInput?.addEventListener("change", () => {
    for (const file of [...(fileInput.files || [])]) {
      if (file.size > 50 * 1024 * 1024) { if (recordStatus) recordStatus.textContent = file.name + ": limite de 50 MB por arquivo."; continue; }
      if (selectedAttachments.length >= 8) { if (recordStatus) recordStatus.textContent = "Limite de 8 anexos por carta."; break; }
      selectedAttachments.push(file);
    }
    fileInput.value = "";
    renderAttachmentList();
  });
  recordButton?.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { if (recordStatus) recordStatus.textContent = "Gravação indisponível neste navegador. Anexe um arquivo de áudio."; return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      audioRecorder = new MediaRecorder(stream);
      audioRecorder.ondataavailable = (event) => { if (event.data.size) audioChunks.push(event.data); };
      audioRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: audioRecorder.mimeType || "audio/webm" });
        if (blob.size && selectedAttachments.length < 8) {
          selectedAttachments.push(new File([blob], "gravacao-" + Date.now() + ".webm", { type: blob.type }));
          renderAttachmentList();
          if (recordStatus) recordStatus.textContent = "Áudio gravado e anexado.";
        }
        stream.getTracks().forEach((track) => track.stop());
        if (recordButton) recordButton.disabled = false;
        if (stopRecordButton) stopRecordButton.disabled = true;
      };
      audioRecorder.start();
      if (recordButton) recordButton.disabled = true;
      if (stopRecordButton) stopRecordButton.disabled = false;
      if (recordStatus) recordStatus.textContent = "Gravando áudio…";
    } catch { if (recordStatus) recordStatus.textContent = "Permita acesso ao microfone para gravar áudio."; }
  });
  stopRecordButton?.addEventListener("click", () => { if (audioRecorder?.state === "recording") audioRecorder.stop(); });
  root.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-letter-attachment]");
    if (!remove) return;
    selectedAttachments.splice(Number(remove.dataset.removeLetterAttachment), 1);
    renderAttachmentList();
  });
  const protect = root.querySelector("[data-letter-protected]");
  const passwordWrap = root.querySelector("[data-letter-password-wrap]");
  const passwordInput = root.querySelector("[data-letter-password]");
  protect?.addEventListener("change", () => {
    const enabled = protect.checked;
    passwordWrap.hidden = !enabled;
    passwordInput.disabled = !enabled;
    passwordInput.required = enabled;
  });
  root.addEventListener("click", async (event) => {
    const calendarNav = event.target.closest("[data-community-calendar-nav]");
    if (calendarNav) { const kind = calendarNav.dataset.communityCalendarNav, step = Number(calendarNav.dataset.monthStep) || 0; calendarMonths[kind] = new Date(calendarMonths[kind].getFullYear(), calendarMonths[kind].getMonth() + step, 1, 12); renderCommunityCalendar(kind); return; }
    const calendarDay = event.target.closest("[data-community-calendar-date]");
    if (calendarDay) { const kind = calendarDay.dataset.communityCalendarKind, input = root.querySelector(`[data-letter-date-filter="${kind}"]`); if (input) input.value = calendarDay.dataset.communityCalendarDate; renderLists(); return; }
    const clearDate = event.target.closest("[data-clear-letter-date]");
    if (clearDate) {
      const input = root.querySelector(`[data-letter-date-filter="${clearDate.dataset.clearLetterDate}"]`);
      if (input) input.value = "";
      calendarMonths[clearDate.dataset.clearLetterDate] = new Date();
      renderLists();
      return;
    }
    const adminDeleteButton = event.target.closest("[data-admin-delete-community-letter]");
    if (adminDeleteButton && isAdmin) {
      const letterId = adminDeleteButton.dataset.adminDeleteCommunityLetter;
      if (!window.confirm("Excluir permanentemente esta carta e seus anexos?")) return;
      adminDeleteButton.disabled = true;
      const target = letters.find((letter) => letter.id === letterId);
      for (const attachment of (target?.attachments || [])) await client.storage.from("looply-letters").remove([attachment.path]);
      const { error } = await client.from("community_letters").delete().eq("id", letterId);
      if (error) { adminDeleteButton.disabled = false; alert("Não foi possível excluir a carta."); return; }
      await reload(); return;
    }
    const deleteButton = event.target.closest("[data-delete-community-letter]");
    if (deleteButton) {
      const letterId = deleteButton.dataset.deleteCommunityLetter;
      if (!window.confirm("Excluir esta carta enviada? Esta ação não pode ser desfeita.")) return;
      deleteButton.disabled = true;
      const target = letters.find((letter) => letter.id === letterId);
      for (const attachment of (target?.attachments || [])) await client.storage.from("looply-letters").remove([attachment.path]);
      const { error } = await client.from("community_letters").delete().eq("id", letterId).eq("sender_id", user.id);
      if (error) {
        deleteButton.disabled = false;
        const status = root.querySelector("[data-community-letter-compose-status]");
        if (status) status.textContent = "Não foi possível excluir a carta.";
        return;
      }
      await reload();
      return;
    }
    const close = event.target.closest("[data-close-community-letter]");
    if (close) { dialog?.close(); return; }
    const button = event.target.closest("[data-open-community-letter]");
    if (!button) return;
    activeLetter = letters.find((letter) => letter.id === button.dataset.openCommunityLetter);
    if (!activeLetter || !dialog) return;
    root.querySelector("[data-community-letter-title]").textContent = activeLetter.subject;
    const peer = activeLetter.sender_id === user.id ? activeLetter.recipient : activeLetter.sender;
    root.querySelector("[data-community-letter-byline]").textContent =
      (activeLetter.sender_id === user.id ? "Para " : "De ") + displayName(peer) + " · " + dateLabel(activeLetter.created_at);
    const unlockForm = root.querySelector("[data-community-letter-unlock]");
    const body = root.querySelector("[data-community-letter-body]");
    unlockForm.hidden = !activeLetter.is_protected;
    unlockForm.reset();
    root.querySelector("[data-community-letter-unlock-status]").textContent = "";
    body.hidden = Boolean(activeLetter.is_protected);
    body.textContent = activeLetter.is_protected ? "" : (activeLetter.body || "");
    await renderLetterAttachments(activeLetter, !activeLetter.is_protected);
    dialog.showModal();
    if (activeLetter.is_protected) unlockForm.querySelector("input").focus();
  });
  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-letter-date-filter]")) { const [year, month] = event.target.value.split("-").map(Number); if (year && month) calendarMonths[event.target.dataset.letterDateFilter] = new Date(year, month - 1, 1, 12); renderLists(); }
  });
  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-community-letter-compose], [data-community-letter-unlock]");
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const values = new FormData(form);
      if (form.matches("[data-community-letter-compose]")) {
        const subject = String(values.get("subject") || "").trim();
        const bodyText = String(values.get("body") || "").trim();
        const protectedLetter = protect.checked;
        const recipients = values.get("recipient_id") === "all"
          ? profiles.filter((profile) => profile.id !== user.id)
          : profiles.filter((profile) => profile.id === values.get("recipient_id") && profile.id !== user.id);
        if (!subject || subject.length > 120 || !bodyText || bodyText.length > maxBodyLength || !recipients.length) {
          throw new Error("Confira o destinatário, o assunto e o conteúdo da carta.");
        }
        let protectedContent = { body: bodyText, password_salt: null, password_iv: null, password_ciphertext: null };
        if (protectedLetter) protectedContent = await sealLetter(bodyText, values.get("password"), subject);
        const rows = recipients.map((recipient) => ({
          sender_id: user.id, recipient_id: recipient.id, subject, is_protected: protectedLetter,
          body: protectedContent.body, password_salt: protectedContent.password_salt,
          password_iv: protectedContent.password_iv, password_ciphertext: protectedContent.password_ciphertext, attachments: []
        }));
        const { data: insertedLetters, error } = await client.from("community_letters").insert(rows).select("id,recipient_id");
        if (error) throw error;
        const attachmentWarnings = [];
        for (const letter of (insertedLetters || [])) {
          const uploaded = [];
          for (const file of selectedAttachments) {
            const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "anexo";
            const path = letter.id + "/" + crypto.randomUUID() + "-" + safeName;
            const safeMime = (file.type || "application/octet-stream").split(";")[0].trim().toLowerCase();
            const { error: uploadError } = await client.storage.from("looply-letters").upload(path, file, { contentType: safeMime, upsert: false });
            if (uploadError) { attachmentWarnings.push(file.name + ": " + uploadError.message); continue; }
            uploaded.push({ path, name: file.name, type: (file.type || "application/octet-stream").split(";")[0].trim().toLowerCase(), size: file.size });
          }
          if (uploaded.length) {
            const { error: metadataError } = await client.from("community_letters").update({ attachments: uploaded }).eq("id", letter.id).eq("sender_id", user.id);
            if (metadataError) attachmentWarnings.push("Anexo enviado, mas não foi possível salvar seus metadados.");
          }
        }
        selectedAttachments = []; renderAttachmentList();
        if (recordStatus) recordStatus.textContent = attachmentWarnings.length ? "Avisos de anexos: " + attachmentWarnings.join("; ") : "";
        form.reset();
        passwordWrap.hidden = true;
        passwordInput.disabled = true;
        passwordInput.required = false;
        const status = root.querySelector("[data-community-letter-compose-status]");
        if (status) status.textContent = "Carta enviada para " + recipients.length + " usuário(s)." + (attachmentWarnings.length ? " Alguns anexos falharam; confira os avisos." : "");
        await reload();
      } else {
        const opened = await openProtectedLetter(activeLetter, String(values.get("password") || ""));
        const body = root.querySelector("[data-community-letter-body]");
        body.textContent = opened;
        body.hidden = false;
        form.hidden = true;
        await renderLetterAttachments(activeLetter, true);
      }
    } catch (error) {
      const status = form.querySelector(".form-status");
      if (status) status.textContent = error?.message || "Não foi possível concluir esta ação.";
    } finally {
      button.disabled = false;
    }
  });
  dialog?.addEventListener("close", () => {
    const form = root.querySelector("[data-community-letter-unlock]");
    form.reset(); form.hidden = true;
    root.querySelector("[data-community-letter-body]").textContent = "";
    root.querySelector("[data-community-letter-body]").hidden = true;
    activeLetter = null;
  });
  const channel = client.channel("looply-community-letters-" + user.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "community_letters" },
      () => reload().catch((error) => console.warn("Community letters refresh failed", error)))
    .subscribe();
  window.addEventListener("pagehide", () => client.removeChannel(channel), { once: true });
}
