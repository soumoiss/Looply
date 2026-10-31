// Scheduled-letter experience. The recipient never receives pending rows:
// public.scheduled_letters has sender-only RLS; mutations use authenticated RPCs.
const esc = value => String(value ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const zone = "America/Fortaleza";
const formatted = date => new Intl.DateTimeFormat("pt-BR",{
  dateStyle:"full",timeStyle:"short",timeZone:zone
}).format(new Date(date));
const localDate = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US",{
    timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return [parts.year,parts.month,parts.day].join("-");
};
// Dates are resolved against the IANA zone, then sent to the server in UTC.
export function fortalezaInstant(date,time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw Error("Escolha uma data e um horário válidos.");
  // Resolve the IANA timezone at the chosen future date (no fixed UTC offset).
  const [year,month,day]=date.split("-").map(Number);
  const [hour,minute]=time.split(":").map(Number);
  const desired=Date.UTC(year,month-1,day,hour,minute);
  let resolved=desired;
  const dtf=new Intl.DateTimeFormat("en-US",{timeZone:zone,
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",
    minute:"2-digit",hourCycle:"h23"});
  const components=timestamp=>Object.fromEntries(dtf.formatToParts(new Date(timestamp))
    .filter(p=>p.type!=="literal").map(p=>[p.type,Number(p.value)]));
  for(let i=0;i<3;i++){
    const p=components(resolved);
    const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
    resolved+=desired-represented;
  }
  const check=components(resolved);
  if(check.year!==year||check.month!==month||check.day!==day||
     check.hour!==hour||check.minute!==minute) throw Error("Data inválida para o fuso horário.");
  if (resolved <= Date.now()) throw Error("Selecione uma data e um horário futuros.");
  return new Date(resolved).toISOString();
}
export function installScheduledLetters({
  root,client,user,people,getRecipient,setRecipient,sealLetter,openProtectedLetter,
  notify,onChanged,selectScheduled
}) {
  const $ = q => root.querySelector(q);
  const compose = $("#cartaComposeForm"), send = $("#enviarCarta");
  let rows = [], recipientRows = [], hiddenIds = new Set(), direction="sent";
  let editId = null, editPassword = "", requestId = crypto.randomUUID();
  let loading = false, busy = false, loadError = "";
  const filter = document.createElement("button");
  filter.type="button"; filter.className="filter-btn"; filter.dataset.filter="programadas";
  filter.setAttribute("aria-pressed","false");filter.textContent="Programadas";
  $(".row.types")?.append(filter);
  const panel = document.createElement("section");
  panel.className = "scheduled-compose";
  panel.innerHTML = '<fieldset class="scheduled-mode"><legend>Quando deseja enviar?</legend>'+
    '<label><input type="radio" name="delivery_mode" value="now" checked> Enviar agora</label>'+
    '<label><input type="radio" name="delivery_mode" value="later"> Programar entrega</label></fieldset>'+
    '<div id="scheduledFields" hidden><div class="scheduled-date-grid">'+
    '<label>Data da entrega<input type="date" id="scheduledDate"></label>'+
    '<label>Horário (24h)<input type="time" id="scheduledTime" step="60"></label></div>'+
    '<p class="scheduled-date-description" id="scheduledDateText" aria-live="polite"></p>'+
    '<small>Fuso horário: America/Fortaleza (horário de Brasília sem horário de verão, UTC−03:00).</small></div>';
  compose.insertBefore(panel,$("#enviarStatus"));
  const preview = document.createElement("dialog");
  preview.id="scheduledPreview";preview.className="modal-carta scheduled-confirm";
  preview.innerHTML='<div class="modal-header"><button type="button" id="scheduledClose" aria-label="Voltar à edição">✕</button>'+
    '<strong>Pré-visualização da entrega</strong></div><div class="modal-body">'+
    '<div id="scheduledPreviewContent"></div><p id="scheduledPreviewStatus" role="alert"></p>'+
    '<div class="scheduled-actions"><button type="button" id="scheduledBack">Voltar</button>'+
    '<button class="btn-enviar" type="button" id="scheduledConfirm">Confirmar programação</button></div></div>';
  root.append(preview);
  const read = document.createElement("dialog");
  read.id="scheduledRead";read.className="modal-carta scheduled-confirm";
  read.innerHTML='<div class="modal-header"><button type="button" id="scheduledReadClose" aria-label="Fechar">✕</button>'+
    '<strong>Carta programada</strong></div><div class="modal-body"><div id="scheduledReadContent"></div>'+
    '<div id="scheduledReadHistory"></div></div>';
  root.append(read);
  const unlock = document.createElement("dialog");
  unlock.id="scheduledUnlock";unlock.className="modal-carta scheduled-confirm";
  unlock.innerHTML='<form id="scheduledUnlockForm" class="modal-body">'+
    '<h2>Desbloquear carta</h2><p>A senha não é armazenada pelo agendador.</p>'+
    '<label>Senha atual<input type="password" id="scheduledUnlockPassword" autocomplete="current-password" required></label>'+
    '<p role="alert" id="scheduledUnlockError"></p><div class="scheduled-actions">'+
    '<button type="button" id="scheduledUnlockCancel">Cancelar</button>'+
    '<button type="submit" class="btn-enviar">Desbloquear</button></div></form>';
  root.append(unlock);
  const mode = () => compose.querySelector('input[name="delivery_mode"]:checked')?.value || "now";
  const renderDate = () => {
    $("#scheduledDate").min=localDate();
    try { $("#scheduledDateText").textContent = "Entrega: "+formatted(fortalezaInstant($("#scheduledDate").value,$("#scheduledTime").value)); }
    catch { $("#scheduledDateText").textContent = "Escolha um dia e um horário futuros."; }
  };
  const setMode = value => {
    const radio=compose.querySelector('input[name="delivery_mode"][value="'+value+'"]');
    if (radio) radio.checked=true;
    $("#scheduledFields").hidden=value!=="later";
    $("#scheduledDate").required=value==="later";
    $("#scheduledTime").required=value==="later";
    send.innerHTML=value==="later" ?
      '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 15h3"/></svg> Programar carta' : "Enviar";
    renderDate();
  };
  compose.querySelectorAll('[name="delivery_mode"]').forEach(input =>
    input.addEventListener("change",()=>setMode(mode())));
  $("#scheduledDate").addEventListener("change",renderDate);
  $("#scheduledTime").addEventListener("change",renderDate);
  const reset = () => {
    editId=null;editPassword="";requestId=crypto.randomUUID();
    $("#scheduledDate").value="";$("#scheduledTime").value="";
    $("#senhaCarta").required=$("#isPrivada").checked;
    setMode("now");
  };
  $("#btnEscrever").addEventListener("click",reset);
  const name = id => {
    const p=people.find(item=>item.id===id);
    return p?.display_name || p?.username || "Perfil";
  };
  const avatar = id => {
    const p=people.find(item=>item.id===id);
    return p?.avatarUrl ? '<img alt="" src="'+esc(p.avatarUrl)+'" loading="lazy">' :
      '<span aria-hidden="true">'+esc(name(id).slice(0,1).toUpperCase())+'</span>';
  };
  const payload = async () => {
    const recipient=getRecipient(),subject=$("#tituloCarta").value.trim();
    const body=$("#textoCarta").value.trim(),protectedLetter=$("#isPrivada").checked;
    if (!recipient || recipient===user.id || !subject || !body) throw Error("Preencha o destinatário, título e conteúdo.");
    const password=$("#senhaCarta").value || editPassword;
    if (protectedLetter && password.length<8) throw Error("A senha precisa ter no mínimo 8 caracteres.");
    const deliverAt=fortalezaInstant($("#scheduledDate").value,$("#scheduledTime").value);
    const sealed=protectedLetter ? await sealLetter(body,password,subject) :
      {body,password_salt:null,password_iv:null,password_ciphertext:null};
    return {p_recipient_id:recipient,p_subject:subject,p_body:sealed.body,
      p_is_protected:protectedLetter,p_password_salt:sealed.password_salt,
      p_password_iv:sealed.password_iv,p_password_ciphertext:sealed.password_ciphertext,
      p_password_hint:protectedLetter ? ($("#dicaCarta").value.trim()||null) : null,
      p_deliver_at:deliverAt};
  };
  let pending = null;
  const closePreview = () => {if(preview.open) preview.close();};
  $("#scheduledClose").addEventListener("click",closePreview);
  $("#scheduledBack").addEventListener("click",closePreview);
  compose.addEventListener("submit",async event=>{
    if(mode()!=="later") return; // existing normal-letter controller remains untouched
    event.preventDefault();event.stopImmediatePropagation();
    if(busy || preview.open) return;
    try {
      pending=await payload();
      const detail='<div class="scheduled-person"><span class="scheduled-avatar">'+avatar(pending.p_recipient_id)+'</span>'+
        '<div><small>Para</small><strong>'+esc(name(pending.p_recipient_id))+'</strong></div></div>'+
        '<h2>'+esc(pending.p_subject)+'</h2><p class="scheduled-preview-body">'+esc($("#textoCarta").value)+'</p>'+
        '<p><strong>Entrega:</strong> '+esc(formatted(pending.p_deliver_at))+'</p>'+
        (pending.p_is_protected?'<p>🔒 Conteúdo protegido por senha.</p>':'');
      $("#scheduledPreviewContent").innerHTML=detail;
      $("#scheduledPreviewStatus").textContent="";
      preview.showModal();
    } catch(error) {console.warn("Scheduled letter preview rejected",error?.name||"invalid");notify("Confira os dados da programação.",true);}
  },true);
  $("#scheduledConfirm").addEventListener("click",async()=>{
    if(busy || !pending) return;
    busy=true;$("#scheduledConfirm").disabled=true;
    $("#scheduledPreviewStatus").textContent="Programando sua carta...";
    try {
      const isEdit=Boolean(editId);
      const input=isEdit ? {p_id:editId,...pending} : {p_request_id:requestId,...pending};
      const {data,error}=await client.rpc(isEdit?"v24_update_scheduled_letter":"v24_create_scheduled_letter",input);
      if(error) throw error;
      if(!data || (isEdit && data!==true)) throw Error("O agendamento não foi confirmado.");
      closePreview();$("#modalEscrever").close();compose.reset();reset();
      try {await onChanged();selectScheduled();}
      catch(refreshError){console.warn("Programmed letter refresh pending",refreshError);}
      notify(isEdit?"Programação atualizada.":"Carta programada.");
    } catch(error) {
      console.warn("Looply scheduled letter confirmation failed",error?.message||"unavailable");
      $("#scheduledPreviewStatus").textContent="Não foi possível programar a carta. Confira a conexão e tente novamente.";
    } finally {busy=false;$("#scheduledConfirm").disabled=false;}
  });
  const statusLabels={scheduled:"Programada",sending:"Enviando",delivered:"Entregue",
    canceled:"Cancelada",failed:"Falha de entrega"};
  const eligible = row => ["scheduled","failed"].includes(row.status);
  const showRead = async row => {
    let body=esc(row.body);
    if(row.is_protected){
      const unlocked=await askPassword(row);
      if(!unlocked) return;
      body=esc(unlocked.body);
    }
    $("#scheduledReadContent").innerHTML='<div class="scheduled-person"><span class="scheduled-avatar">'+avatar(row.recipient_id)+
      '</span><div><small>Destinatário</small><strong>'+esc(name(row.recipient_id))+'</strong></div></div>'+
      '<h2>'+esc(row.subject)+'</h2><p class="scheduled-preview-body">'+body+'</p>'+
      '<p><strong>Data:</strong> '+esc(formatted(row.deliver_at))+'</p>'+
      '<p><strong>Status:</strong> '+esc(statusLabels[row.status]||row.status)+'</p>';
    $("#scheduledReadHistory").textContent="Carregando histórico...";
    read.showModal();
    const {data,error}=await client.from("scheduled_letter_delivery_events")
      .select("status,sqlstate,created_at").eq("scheduled_letter_id",row.id)
      .order("created_at",{ascending:false}).limit(20);
    if (!read.open) return;
    $("#scheduledReadHistory").innerHTML=error ? '<p>Histórico temporariamente indisponível.</p>' :
      '<h3>Histórico de entrega</h3>'+(data?.length?'<ol>'+data.map(ev=>
        '<li>'+esc(formatted(ev.created_at))+' · '+esc(statusLabels[ev.status]||ev.status)+
        (ev.sqlstate?' (código '+esc(ev.sqlstate)+')':'')+'</li>').join("")+'</ol>':
        '<p>Nenhuma tentativa de entrega até agora.</p>');
  };
  $("#scheduledReadClose").addEventListener("click",()=>read.close());
  const askPassword = row => new Promise(resolve=>{
    const form=$("#scheduledUnlockForm"),msg=$("#scheduledUnlockError");
    form.reset();msg.textContent="";
    const finish=value=>{unlock.removeEventListener("cancel",onEsc);unlock.close();
      form.removeEventListener("submit",submit);cancel.removeEventListener("click",onCancel);resolve(value);};
    const cancel=$("#scheduledUnlockCancel");
    const onCancel=()=>finish(null);
    const submit=async e=>{
      e.preventDefault();
      try {const password=$("#scheduledUnlockPassword").value;
        const body=await openProtectedLetter(row,password);
        finish({password,body});
      } catch {msg.textContent="Senha incorreta ou conteúdo indisponível.";}
    };
    cancel.addEventListener("click",onCancel);
    form.addEventListener("submit",submit);
    const onEsc=()=>finish(null);
    unlock.addEventListener("cancel",onEsc,{once:true});
    unlock.showModal();
  });
  const edit = async row => {
    if (!eligible(row)) return;
    let body=row.body || "",password="";
    if (row.is_protected) {
      const unlocked=await askPassword(row);
      if(!unlocked) return;
      body=unlocked.body;password=unlocked.password;
    }
    editId=row.id;editPassword=password;setRecipient(row.recipient_id);
    $("#tituloCarta").value=row.subject;$("#textoCarta").value=body;
    $("#isPrivada").checked=row.is_protected;
    $("#privadaFields").hidden=!row.is_protected;
    $("#senhaCarta").value="";$("#senhaCarta").required=false;
    $("#dicaCarta").value=row.password_hint || "";
    const chosen=new Date(row.deliver_at);
    const dateParts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
      timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",
      minute:"2-digit",hourCycle:"h23"
    }).formatToParts(chosen).map(p=>[p.type,p.value]));
    $("#scheduledDate").value=[dateParts.year,dateParts.month,dateParts.day].join("-");
    $("#scheduledTime").value=[dateParts.hour,dateParts.minute].join(":");
    setMode("later");
    $("#modalEscrever").showModal();
  };
  const cancel = async row => {
    if(!eligible(row) || !confirm("Cancelar esta carta programada? O destinatário não a receberá.")) return;
    const {data,error}=await client.rpc("v24_cancel_scheduled_letter",{p_id:row.id});
    if(error || data!==true) {notify("A carta já foi entregue ou não pôde ser cancelada.",true);return;}
    await onChanged();notify("Envio cancelado.");
  };
  $("#cartasList").addEventListener("click",async event=>{
    const tab=event.target.closest("[data-scheduled-direction]");
    if(tab){direction=tab.dataset.scheduledDirection;render();return;}
    const b=event.target.closest("[data-scheduled-action]");if(!b)return;
    event.preventDefault();
    if(b.dataset.scheduledAction==="received"){
      root.querySelector('[data-filter="recebidas"]')?.click();
      return;
    }
    const row=rows.find(item=>item.id===b.dataset.scheduleId);
    if(!row)return;
    b.disabled=true;
    try {
      if(b.dataset.scheduledAction==="delete"){
        if(!confirm("Excluir esta carta da sua coleção? Se estiver pendente, o envio será cancelado."))return;
        const {data,error}=await client.rpc("v26_hide_sent_letter",{p_kind:"scheduled",p_id:row.id});
        if(error || data!==true)throw error||Error("delete_not_confirmed");
        hiddenIds.add("scheduled:"+row.id);
        await reload();render();notify("Carta excluída da sua coleção.");
        return;
      }
      if(b.dataset.scheduledAction==="view")await showRead(row);
      if(b.dataset.scheduledAction==="edit")await edit(row);
      if(b.dataset.scheduledAction==="cancel")await cancel(row);
    } catch(error) {console.warn("Scheduled letter operation failed",error?.name||"unavailable");notify("Não foi possível concluir. Tente novamente.",true);}
    finally {b.disabled=false;}
  });
  const reload = async () => {
    if(loading) return;
    loading=true;
    try {
      const [sent, received, hidden] = await Promise.all([
        client.from("scheduled_letters")
          .select("id,sender_id,recipient_id,subject,body,is_protected,password_salt,password_iv,password_ciphertext,password_hint,deliver_at,status,delivered_at,created_at")
          .eq("sender_id",user.id).order("created_at",{ascending:false}).limit(200),
        client.rpc("v26_scheduled_recipient_inbox",{}),
        client.rpc("v26_hidden_sent_ids",{})
      ]);
      if(sent.error || received.error || hidden.error) throw sent.error || received.error || hidden.error;
      hiddenIds=new Set((hidden.data||[]).map(x=>String(x.kind)+":"+String(x.id)));
      rows=(sent.data||[]).filter(x=>!hiddenIds.has("scheduled:"+x.id));
      recipientRows=(received.data||[]).filter(x=>x.recipient_id===user.id);
      loadError="";
    } catch(error) {console.warn("Scheduled letter list unavailable",error?.message||"network");loadError="Falha de sincronização";} finally {loading=false;}
  };
  const render = () => {
    $("#colecaoTitulo").textContent="Cartas programadas";
    $("#colecaoCount").textContent=(rows.length+recipientRows.length)+" cartas";
    $("#lidasCount").textContent=direction==="received"
      ?"O conteúdo permanece bloqueado até o horário da entrega."
      :"Você pode editar ou cancelar uma carta enquanto estiver pendente.";
    const items=(direction==="received"?recipientRows:rows).filter(item=>{
      if(!$("#dataCartas").value)return true;
      return new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"})
        .format(new Date(item.deliver_at))===$("#dataCartas").value;
    });
    const tabs='<div class="scheduled-direction-tabs" role="group" aria-label="Cartas programadas">'+
      '<button type="button" data-scheduled-direction="sent" aria-pressed="'+(direction==="sent")+'">Enviadas ('+rows.length+')</button>'+
      '<button type="button" data-scheduled-direction="received" aria-pressed="'+(direction==="received")+'">Recebidas ('+recipientRows.length+')</button></div>';
    let cards="";
    if(direction==="received"){
      cards=items.length?items.map(row=>
        '<article class="carta-item scheduled-card"><div class="scheduled-person">'+
        '<span class="scheduled-avatar">'+avatar(row.sender_id)+'</span>'+
        '<div><small>De</small><strong>'+esc(name(row.sender_id))+'</strong></div></div>'+
        '<h3>✉ Carta programada</h3><p>📅 '+esc(formatted(row.deliver_at))+'</p>'+
        '<span class="scheduled-status" data-status="'+esc(row.status)+'">'+
        esc(row.status==="delivered"?"Entregue":row.status==="sending"?"Em processamento":"Pendente")+'</span>'+
        (row.status==="delivered"&&row.delivered_letter_id
          ? '<div class="scheduled-actions"><button type="button" data-scheduled-action="received" data-schedule-id="'+esc(row.id)+'">Abrir nas cartas recebidas</button></div>'
          : '<p class="scheduled-lock-note">🔒 O conteúdo será liberado quando chegar a data programada.</p>')+
        '</article>').join(""):'<p class="cartas-empty">Nenhuma carta programada recebida.</p>';
    }else{
      cards=items.length?items.map(row=>
        '<article class="carta-item scheduled-card">'+
        '<div class="scheduled-person"><span class="scheduled-avatar">'+avatar(row.recipient_id)+'</span>'+
        '<div><small>Para</small><strong>'+esc(name(row.recipient_id))+'</strong></div></div>'+
        '<h3>'+esc(row.subject)+'</h3><p>📅 '+esc(formatted(row.deliver_at))+'</p>'+
        '<span class="scheduled-status" data-status="'+esc(row.status)+'">'+
        esc(statusLabels[row.status]||row.status)+'</span>'+
        '<div class="scheduled-actions"><button type="button" data-scheduled-action="view" data-schedule-id="'+esc(row.id)+'">Visualizar</button>'+
        (eligible(row)?'<button type="button" data-scheduled-action="edit" data-schedule-id="'+esc(row.id)+'">Editar programação</button>'+
          '<button type="button" class="scheduled-danger" data-scheduled-action="cancel" data-schedule-id="'+esc(row.id)+'">Cancelar envio</button>':'')+
        '<button type="button" class="scheduled-danger" data-scheduled-action="delete" data-schedule-id="'+esc(row.id)+'">Excluir da minha lista</button>'+
        '</div></article>').join(""):'<p class="cartas-empty">Nenhuma carta programada enviada.</p>';
    }
    $("#cartasList").innerHTML=tabs+(loadError?'<p class="cartas-empty" role="alert">Não foi possível sincronizar as programações.</p>':cards);
  };
  reset();
  void reload();
  return {reload,render};
}
