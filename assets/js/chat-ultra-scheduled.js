/* Authenticated scheduled Chat Ultra messages. A Cloudflare one-minute Cron
 * sends the row from Neon even if the device is closed; the UI never simulates
 * delivery locally. The server uses the request UUID as chat_message ID. */
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value||""));
const fmt=value=>new Date(value).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
function localDatetime(date){
  const pad=n=>String(n).padStart(2,"0");
  return date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate())+"T"+pad(date.getHours())+":"+pad(date.getMinutes());
}
export function setupUltraChatSchedules({client,getConversationId,notice,onChange}){
  const modal=document.createElement("dialog");
  modal.className="chat-ultra-schedule-dialog";
  modal.setAttribute("aria-label","Agendar mensagens da conversa");
  modal.innerHTML='<section class="chat-ultra-schedule-content">'+
    '<header><h2>🕒 Agendar mensagem</h2><button type="button" data-sch-close aria-label="Fechar">✕</button></header>'+
    '<form data-sch-form><label for="chatUltraScheduleBody">Mensagem</label>'+
    '<textarea id="chatUltraScheduleBody" maxlength="5000" rows="4" required placeholder="Escreva a mensagem que será enviada…"></textarea>'+
    '<label for="chatUltraScheduleTime">Data e hora de envio</label>'+
    '<input id="chatUltraScheduleTime" type="datetime-local" required>'+
    '<small data-sch-timezone></small>'+
    '<button type="submit" data-sch-send>Agendar</button></form>'+
    '<h3>Mensagens programadas</h3>'+
    '<div class="chat-ultra-schedule-list" data-sch-items role="status"></div>'+
    '<p data-sch-status role="status" aria-live="polite"></p></section>';
  document.body.append(modal);
  const form=modal.querySelector("[data-sch-form]");
  const body=form.querySelector("textarea");
  const date=form.querySelector("input[type=datetime-local]");
  const status=modal.querySelector("[data-sch-status]");
  const list=modal.querySelector("[data-sch-items]");
  const send=form.querySelector("[data-sch-send]");
  const zone=modal.querySelector("[data-sch-timezone]");
  zone.textContent="Horário local: "+(Intl.DateTimeFormat().resolvedOptions().timeZone||"aparelho");
  let currentId="",busy=false,interval=null;
  function message(text){status.textContent=text;}
  async function load(){
    if(!modal.open||!uuid(currentId))return;
    const {data,error}=await client.rpc("v39_list_chat_schedules",{p_conversation_id:currentId});
    if(!modal.open)return;
    list.replaceChildren();
    if(error){message("Não foi possível atualizar as mensagens programadas.");return;}
    const records=Array.isArray(data)?data:[];
    if(!records.length){list.textContent="Nenhuma mensagem programada.";return;}
    for(const record of records){
      const row=document.createElement("article");
      row.className="chat-ultra-schedule-row";
      const title=document.createElement("strong");
      title.textContent=String(record.body||"").slice(0,120);
      const info=document.createElement("small");
      const statuses={scheduled:"Agendada",sending:"Enviando",sent:"Enviada",failed:"Reenvio pendente",cancelled:"Cancelada"};
      info.textContent=(statuses[record.status]||"") +" · "+fmt(record.deliver_at);
      row.append(title,info);
      if(["scheduled","failed"].includes(record.status) && uuid(record.id)){
        const cancel=document.createElement("button");
        cancel.type="button";cancel.dataset.schCancel=record.id;
        cancel.textContent="Cancelar";cancel.setAttribute("aria-label","Cancelar a mensagem programada");
        row.append(cancel);
      }
      list.append(row);
    }
  }
  function open(){
    const id=getConversationId?.();
    if(!uuid(id)){notice?.("Abra uma conversa para agendar uma mensagem.");return;}
    currentId=id;
    date.min=localDatetime(new Date(Date.now()+90*1000));
    date.max=localDatetime(new Date(Date.now()+90*86400000));
    date.value=localDatetime(new Date(Date.now()+3600000));
    body.value=document.querySelector("#inp")?.value||"";
    message("");
    if(!modal.open)modal.showModal();
    void load();
    clearInterval(interval);
    interval=setInterval(()=>{if(!document.hidden)void load();},30000);
    body.focus({preventScroll:true});
  }
  modal.addEventListener("click",async event=>{
    if(event.target===modal||event.target.closest("[data-sch-close]")){modal.close();return;}
    const cancel=event.target.closest("[data-sch-cancel]");
    if(!cancel||busy||!uuid(cancel.dataset.schCancel))return;
    if(!window.confirm("Cancelar esta mensagem programada?"))return;
    busy=true;cancel.disabled=true;
    try{
      const {data,error}=await client.rpc("v39_cancel_chat_schedule",{p_id:cancel.dataset.schCancel});
      if(error||data!==true)throw error||Error("Cancelamento não confirmado");
      message("Agendamento cancelado.");
      await load();onChange?.();
    }catch{message("Não foi possível cancelar. Atualize e tente novamente.");cancel.disabled=false;}
    finally{busy=false;}
  });
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(busy)return;
    const text=body.value.trim(),when=new Date(date.value);
    if(!uuid(currentId)||!text||text.length>5000||!Number.isFinite(+when)||
      +when<Date.now()+60000||+when>Date.now()+90*86400000){
      message("Informe uma mensagem e uma data válida entre 1 minuto e 90 dias.");return;
    }
    busy=true;send.disabled=true;message("Salvando agendamento…");
    try{
      const requestId=crypto.randomUUID();
      const {data,error}=await client.rpc("v39_schedule_chat_message",{
        p_request_id:requestId,p_conversation_id:currentId,
        p_body:text,p_deliver_at:when.toISOString(),p_reply_to:null
      });
      if(error||data!==requestId)throw error||Error("Agendamento não confirmado");
      message("Mensagem programada no servidor para "+fmt(when)+".");
      body.value="";
      const composer=document.querySelector("#inp");
      if(composer?.value===text)composer.value="";
      await load();onChange?.();
    }catch(error){
      console.warn("Looply schedule unavailable",String(error?.code||"network").slice(0,50));
      message("Falha ao salvar no servidor. O agendamento não foi confirmado.");
    }finally{busy=false;send.disabled=false;}
  });
  modal.addEventListener("close",()=>{clearInterval(interval);interval=null;});
  return {open,dispose:()=>{clearInterval(interval);modal.remove();}};
}
