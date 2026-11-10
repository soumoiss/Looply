/* Envio de publicações para várias conversas, sem dados fictícios.
   Captura antes do handler legado de <select> e reutiliza looply-chat/share_post. */
import {signPeople} from "./profile-api.js";
const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
export function mountInternalShareDialog(root,client,userId){
  let dialog=null,people=[],selected=new Set(),busy=false,postId="",query="";
  const q=(s)=>dialog?.querySelector(s);
  const all=(s)=>Array.from(dialog?.querySelectorAll(s)||[]);
  function ensure(){
    if(dialog)return dialog;
    dialog=document.createElement("dialog");dialog.className="looply-send-dialog";dialog.dataset.premiumShareDialog="";
    dialog.setAttribute("aria-label","Enviar no Looply");
    dialog.innerHTML='<section class="looply-send-card"><header class="looply-send-head"><div class="looply-send-grab"></div><h2>Enviar no Looply</h2><button type="button" data-send-close aria-label="Fechar">×</button></header><label class="looply-send-search"><span aria-hidden="true">⌕</span><input data-send-search type="search" placeholder="Buscar pessoas" aria-label="Buscar pessoas"></label><div class="looply-send-selected" data-send-selected></div><div class="looply-send-grid" data-send-grid role="group" aria-label="Selecionar destinatários"></div><label class="looply-send-message-label" for="looplySendMessage">Mensagem</label><textarea id="looplySendMessage" data-send-message maxlength="2000" rows="2" placeholder="Escreva uma mensagem (opcional)"></textarea><p class="looply-send-status" data-send-status role="status" aria-live="polite"></p><footer class="looply-send-footer"><button type="button" data-send-submit disabled>Enviar <span data-send-count></span></button></footer></section>';
    document.body.append(dialog);
    q("[data-send-close]").onclick=()=>{if(!busy)dialog.close();};
    q("[data-send-search]").oninput=event=>{query=event.target.value.trim().toLocaleLowerCase("pt-BR");render();};
    q("[data-send-grid]").onclick=event=>{
      const btn=event.target.closest("[data-send-person]");if(!btn||busy)return;
      const id=btn.dataset.sendPerson;
      if(selected.has(id))selected.delete(id);else selected.add(id);
      render();
    };
    q("[data-send-submit]").onclick=()=>void send();
    dialog.addEventListener("cancel",event=>{if(busy)event.preventDefault();});
    dialog.addEventListener("click",event=>{if(event.target===dialog&&!busy)dialog.close();});
    return dialog;
  }
  function render(){
    const grid=q("[data-send-grid]");grid.replaceChildren();
    const matches=people.filter(p=>(String(p.display_name||"")+" "+String(p.username||"")).toLocaleLowerCase("pt-BR").includes(query));
    for(const p of matches){
      const btn=el("button","looply-send-person");btn.type="button";btn.dataset.sendPerson=p.id;
      btn.setAttribute("aria-pressed",String(selected.has(p.id)));
      const face=el("span","looply-send-avatar");
      if(/^https:\/\//i.test(p.avatarUrl||"")){
        const img=el("img");img.src=p.avatarUrl;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";
        img.onerror=()=>img.replaceWith(el("span","",String(p.display_name||p.username||"?").slice(0,1).toUpperCase()));
        face.append(img);
      }else face.textContent=String(p.display_name||p.username||"?").slice(0,1).toUpperCase();
      const name=el("strong","",p.display_name||p.username||"Membro");
      const username=el("small","","@"+String(p.username||""));
      const check=el("span","looply-send-check",selected.has(p.id)?"✓":"+");
      btn.append(face,name,username,check);grid.append(btn);
    }
    if(!matches.length)grid.append(el("p","looply-send-empty",people.length?"Nenhum usuário encontrado.":"Nenhum usuário disponível."));
    const chips=q("[data-send-selected]");chips.replaceChildren();
    for(const id of selected){
      const p=people.find(p=>p.id===id);if(!p)continue;
      const chip=el("button","looply-send-chip","@"+p.username+" ×");chip.type="button";chip.onclick=()=>{selected.delete(id);render();};chips.append(chip);
    }
    const submit=q("[data-send-submit]");
    submit.disabled=busy||selected.size===0;
    q("[data-send-count]").textContent=selected.size?"("+selected.size+")":"";
  }
  async function open(id){
    postId=id;selected=new Set();people=[];query="";
    ensure();
    q("[data-send-search]").value="";q("[data-send-message]").value="";
    q("[data-send-status]").textContent="Carregando pessoas…";
    render();
    if(!dialog.open)dialog.showModal();
    try{
      const {data,error}=await client.from("profiles").select("id,username,display_name,avatar_path").neq("id",userId).order("username").limit(500);
      if(error)throw error;
      if(!dialog.open||postId!==id)return;
      people=await signPeople(client,(data||[]).filter(p=>p.id&&p.username));
      render();
      q("[data-send-status]").textContent="";
    }catch(error){
      console.error("Looply share recipients",error);
      q("[data-send-status]").textContent="Não foi possível carregar os usuários: "+String(error?.message||"erro de conexão");
    }
  }
  async function send(){
    if(busy||!postId||!selected.size)return;
    busy=true;render();
    const ids=[...selected],message=q("[data-send-message]").value.trim(),failures=[];
    let sent=0;
    for(const id of ids){
      q("[data-send-status]").textContent="Enviando "+(sent+failures.length+1)+" de "+ids.length+"…";
      try{
        const {data,error}=await client.functions.invoke("looply-chat",{
          body:{action:"share_post",mode:"share",targetId:id,postId,body:message||undefined}
        });
        if(error)throw error;
        if(!data?.conversationId||data.errorCode)throw Error(data?.errorCode||"conversation_unavailable");
        sent++;
        selected.delete(id);
      }catch(error){
        failures.push({id,error});
        console.error("Looply share delivery failed",id,error);
      }
    }
    busy=false;render();
    if(!failures.length){
      q("[data-send-status]").textContent="Enviado para "+sent+" "+(sent===1?"pessoa.":"pessoas.");
      setTimeout(()=>{if(dialog?.open&&!busy)dialog.close();},800);
    }else{
      q("[data-send-status]").textContent=sent+" enviado(s); "+failures.length+" falha(s). Selecione Enviar para tentar novamente apenas os pendentes.";
    }
  }
  root.addEventListener("click",event=>{
    const button=event.target.closest("[data-share-in-app]");
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!button.dataset.shareInApp)return;
    void open(button.dataset.shareInApp);
  },true);
  return {open};
}
