import { mountAppPage } from "../../src/page-runtime.js?v=letters-rebuild-20261027";
import { archivedCardsMarkup, bindArchivedCards, loadArchivedCards } from "../../src/archived-cards.js?v=card-read-state-fallback-20261026";
import { bindCommunityLetters, communityLettersMarkup, loadCommunityLetters, sealLetter, openProtectedLetter } from "../../src/letters-community.js?v=sent-letter-hints-modal-20261023";
import { signProfileAvatars } from "../../src/profiles.js";

const h = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const day = (value) => value && !Number.isNaN(new Date(value).valueOf()) ? new Date(value).toLocaleDateString("pt-BR") : "Sem data";
const cardTitle = (card) => {
  if (card.is_protected) return card.is_private ? "Carta privada protegida" : "Carta protegida";
  const line = String(card.body || "").split(/\r?\n/).map(x => x.trim()).find(Boolean);
  return line ? line.slice(0, 100) : "Carta sem título";
};
const asError = (error) => typeof error?.message === "string" ? error.message : "Não foi possível concluir. Verifique sua conexão e tente novamente.";

function visual() {
  return '<section class="cartas-page">' +
    '<div class="cartas-hero"><span>CARTAS</span><h1>Minha coleção</h1></div>' +
    '<section class="cartas-action" aria-label="Escrever carta"><div class="action-header"><div><span>CARTAS</span><h2>✎ Escrever carta</h2></div><button id="btnEscrever" class="fab" type="button" aria-label="Escrever nova carta">+</button></div><p>Envie mensagens e memórias para pessoas do Looply.</p></section>' +
    '<section class="filtros" aria-label="Filtros"><div class="row date-buttons"><button type="button" id="filtrarData">Filtrar por data</button><button type="button" id="limparData">Limpar data</button></div><label class="date-input-label" id="dataWrap" hidden>Selecionar dia<input type="date" id="dataCartas" /></label><div class="row types"><button type="button" class="filter-btn active" data-filter="recebidas" aria-pressed="true">Cartas recebidas</button><button type="button" class="filter-btn" data-filter="enviadas" aria-pressed="false">Cartas enviadas</button><button type="button" class="filter-btn" data-filter="originais" aria-pressed="false">Cartas originais</button></div></section>' +
    '<section class="colecao-container" aria-label="Coleção de cartas"><div class="colecao-header"><div><span>COLEÇÃO</span><h2 id="colecaoTitulo">Minhas Cartas</h2></div><small id="colecaoCount">Carregando...</small></div><div class="progress-badge"><span id="lidasCount">Carregando leituras...</span></div><div class="subfiltros"><button type="button" data-sub="todas" class="sub active" aria-pressed="true">Todas</button><button type="button" data-sub="semdata" class="sub" aria-pressed="false">Sem data</button></div><p id="cartasStatus" role="status" aria-live="polite"></p><div id="cartasList" class="cartas-list" aria-live="polite"></div></section>' +
    '<section class="cartas-admin" id="cartasAdmin" hidden><div class="admin-title"><span>ADMINISTRAÇÃO</span><h2>Gerenciar cartas de usuários</h2></div><label>Consultar coleção de <select id="adminUserFilter"></select></label><div id="adminCartasCount" role="status"></div></section></section>' +
    '<dialog class="modal-carta" id="modalEscrever" aria-labelledby="modalEscreverTitle"><div class="modal-header"><button type="button" id="fecharModal" aria-label="Fechar editor">✕</button><strong id="modalEscreverTitle">Escrever carta</strong><button type="submit" form="cartaComposeForm" id="enviarCarta" class="btn-enviar">Enviar</button></div><form id="cartaComposeForm" class="modal-body"><label>Título da carta<input id="tituloCarta" name="subject" placeholder="Ex.: Estou feliz! De Moisés" maxlength="80" required /></label><div class="destinatario-picker" id="destPicker"><label>Destinatário<input type="search" id="buscarDestinatario" placeholder="Pesquisar pessoa..." autocomplete="off" /></label><div id="listaUsuarios" role="group" aria-label="Escolher destinatário"></div></div><label>Mensagem<textarea id="textoCarta" name="body" placeholder="Escreva sua carta..." maxlength="5000" required></textarea></label><div class="privada-section"><label><input type="checkbox" id="isPrivada" /> Carta privada com senha</label><div id="privadaFields" hidden><label>Senha<input id="senhaCarta" type="password" minlength="8" maxlength="256" autocomplete="new-password" /></label><label>Dica (opcional)<input id="dicaCarta" maxlength="240" placeholder="Dica para a senha" /></label></div></div><p id="enviarStatus" role="alert"></p></form></dialog>' +
    '<dialog class="modal-carta modal-read" id="modalLeituraNova" aria-labelledby="readCartaTitulo"><div class="modal-header"><button type="button" id="fecharLeituraNova">✕</button><strong>Leitura da carta</strong><span aria-hidden="true">✉</span></div><div class="modal-body"><h2 id="readCartaTitulo"></h2><p id="readCartaAutor"></p><p id="readCartaData"></p><div id="readCartaDicas"></div><form id="desbloquearNova" hidden><label>Senha da carta<input id="senhaLeituraNova" type="password" required /></label><button class="btn-enviar" type="submit">Desbloquear</button></form><div id="readCartaTexto" class="carta-texto"></div><p id="readCartaStatus" role="status"></p></div></dialog>' +
    '<dialog class="modal-carta" id="editorAdminCarta" aria-labelledby="adminEditTitle"><div class="modal-header"><button type="button" id="fecharAdminCarta">✕</button><strong id="adminEditTitle">Editar carta · ADM</strong><button type="submit" form="adminEditForm" class="btn-enviar">Salvar</button></div><form class="modal-body" id="adminEditForm"><label id="adminSubjectField">Título<input name="subject" maxlength="120" /></label><label>Conteúdo<textarea name="body" maxlength="5000"></textarea></label><label id="adminPrivateField"><input type="checkbox" name="is_private" /> Carta privada</label><label id="adminHintField">Dica de senha<input name="password_hint" maxlength="240" /></label><label id="adminPasswordField" hidden>Senha atual da carta protegida<input type="password" name="password" autocomplete="current-password" /></label><label id="adminNewPasswordField" hidden>Nova senha (opcional)<input type="password" name="new_password" minlength="8" /></label><p id="adminEditStatus" role="status"></p><button id="adminDeleteCarta" class="danger" type="button">Excluir carta permanentemente</button></form></dialog>' +
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
      (isAdmin ? '<button class="carta-admin-edit" type="button" data-edit-kind="'+c.kind+'" data-edit-id="'+h(c.id)+'">Editar · ADM</button>' : "") +
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
    if (ar.status !== "fulfilled" || cr.status !== "fulfilled") notify("Parte das cartas não pôde ser sincronizada com o Neon.", true);
  };
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
  $("#fecharAdminCarta").addEventListener("click", ()=>close("editorAdminCarta"));
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
    if(edit&&isAdmin){const raw=edit.dataset.editKind==="archive"?state.cards.find(c=>c.id===edit.dataset.editId):state.letters.find(c=>c.id===edit.dataset.editId);
      if(!raw)return;state.editor={kind:edit.dataset.editKind,raw};
      const form=$("#adminEditForm");form.reset();form.elements.subject.value=raw.subject||"";form.elements.body.value=raw.is_protected?"":raw.body||"";
      form.elements.is_private.checked=Boolean(raw.is_private);form.elements.password_hint.value=raw.password_hint||"";
      $("#adminSubjectField").hidden=state.editor.kind==="archive";$("#adminPrivateField").hidden=state.editor.kind!=="archive";
      $("#adminHintField").hidden=state.editor.kind!=="archive";$("#adminPasswordField").hidden=!raw.is_protected||state.editor.kind!=="community";$("#adminNewPasswordField").hidden=!raw.is_protected||state.editor.kind!=="community";
      $("#adminEditStatus").textContent=raw.is_protected ? "Conteúdo criptografado: para alterá-lo, informe a senha atual. O ADM não pode ignorar a proteção." : "";
      $("#editorAdminCarta").showModal();return;
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
    state.reading=letter;$("#readCartaTitulo").textContent=letter.subject;
    $("#readCartaAutor").textContent="De "+fullName(letter.sender_id)+" · Para "+fullName(letter.recipient_id);
    $("#readCartaData").textContent=day(letter.created_at);
    $("#readCartaDicas").textContent=letter.is_protected ? (Array.isArray(letter.password_hints)&&letter.password_hints.length?letter.password_hints.join(" · "):letter.password_hint||"") : "";
    $("#desbloquearNova").hidden=!letter.is_protected;$("#readCartaTexto").hidden=Boolean(letter.is_protected);
    $("#readCartaTexto").textContent=letter.is_protected?"":letter.body||"";$("#readCartaStatus").textContent="";$("#senhaLeituraNova").value="";
    $("#modalLeituraNova").showModal();
  });
  $("#desbloquearNova").addEventListener("submit",async e=>{
    e.preventDefault();const letter=state.reading;if(!letter)return;
    try{const opened=await openProtectedLetter(letter,$("#senhaLeituraNova").value);$("#readCartaTexto").textContent=opened;$("#readCartaTexto").hidden=false;$("#desbloquearNova").hidden=true;$("#readCartaStatus").textContent="Carta desbloqueada.";}
    catch{$("#readCartaStatus").textContent="Senha incorreta ou conteúdo indisponível.";}
  });
  $("#adminEditForm").addEventListener("submit",async e=>{
    e.preventDefault();if(!isAdmin||!state.editor)return;
    const {kind,raw}=state.editor,form=e.currentTarget,save=$("#editorAdminCarta .btn-enviar");
    save.disabled=true;
    try {
      const text=form.elements.body.value.trim();
      if(kind==="archive"){
        const changes={is_private:form.elements.is_private.checked,password_hint:form.elements.password_hint.value.trim()||null};
        if(!raw.is_protected){if(!text)throw Error("A carta precisa de conteúdo.");changes.body=text;}
        const {data,error}=await client.from("archived_cards").update(changes).eq("id",raw.id).select("id");
        if(error||!data?.length)throw error||Error("Alteração não autorizada pelo Neon.");
      }else{
        const subject=form.elements.subject.value.trim();if(!subject)throw Error("Informe um título.");
        let changes={subject};
        if(raw.is_protected){
          const pwd=form.elements.password.value;
          const unsealed=await openProtectedLetter(raw,pwd);
          const resealed=await sealLetter(text||unsealed,form.elements.new_password.value||pwd,subject);
          changes={...changes,...resealed};
        }else{if(!text)throw Error("A carta precisa de conteúdo.");changes.body=text;}
        const {data,error}=await client.from("community_letters").update(changes).eq("id",raw.id).select("id");
        if(error||!data?.length)throw error||Error("Alteração não autorizada pelo Neon.");
      }
      close("editorAdminCarta");await loadCurrent();notify("Carta atualizada no Neon.");
    }catch(err){$("#adminEditStatus").textContent=asError(err);}finally{save.disabled=false;}
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
  if (isAdmin) void loadCurrent();
  const requestedLetterId=new URLSearchParams(location.search).get("letterId");
  const requestedCardId=new URLSearchParams(location.search).get("cardId");
  if(requestedCardId)requestAnimationFrame(()=>$("#cartasList [data-letter-id='"+CSS.escape(requestedCardId)+"']")?.click());
  if(requestedLetterId)requestAnimationFrame(()=>$("#cartasList [data-letter-id='"+CSS.escape(requestedLetterId)+"']")?.click());
}});
