/* Looply Chat Ultra: authorized paginated browse of chat history.
   Uses Neon JWT-scoped v46 RPCs; never falls back to model-local message arrays. */
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const validId=id=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(id||""));
const textTime=value=>{const date=new Date(value);return Number.isFinite(date.valueOf())?date.toLocaleString("pt-BR"):"";};
export function setupUltraBrowse({client,getConversationId,getConversationTitle,onNavigate,onError=()=>{}}={}){
  const modal=document.querySelector("#sh"),panel=document.querySelector("#shBox");
  if(!modal||!panel||!client?.rpc)return {open(){},dispose(){}};
  let state=null,sequence=0,delay=0;
  const icons={search:"⌕",saved:"⭐",media:"📎"};
  const heading={search:"Buscar mensagens",saved:"Mensagens salvas",media:"Fotos e arquivos"};
  const params=()=>({p_conversation_id:state?.id,p_before:state?.cursor||null,p_limit:40});
  function open(mode){
    const id=getConversationId?.();
    if(!validId(id)||!heading[mode])return;
    sequence++;
    state={mode,id,entries:[],cursor:null,hasMore:true,busy:false,term:"",requested:false};
    // Other dialogs from the approved Ultra model use this same sheet.
    panel.replaceChildren();
    const root=document.createElement("section");
    root.dataset.ultraBrowse=mode;
    root.setAttribute("aria-label",heading[mode]);
    root.innerHTML='<div class="grab"></div><h2>'+heading[mode]+'</h2>'+
      (mode==="search"?'<label class="feature-row"><input type="search" class="feature-input" data-ultra-browse-term maxlength="100" placeholder="Buscar no histórico" autocomplete="off"></label>':"")+
      '<div class="chat-ultra-browse-results" data-ultra-browse-results role="list"></div>'+
      '<p class="chat-ultra-browse-status" data-ultra-browse-status role="status"></p>'+
      '<button type="button" class="btn" data-ultra-browse-more hidden>Carregar mais</button>'+
      '<button type="button" class="btn" data-ultra-browse-close>Fechar</button>';
    panel.append(root);
    if(!modal.open)modal.showModal();
    if(mode==="search"){
      panel.querySelector("[data-ultra-browse-term]")?.focus();
      panel.querySelector("[data-ultra-browse-status]").textContent="Digite pelo menos duas letras.";
    }else void load();
  }
  function paint(){
    if(!state||panel.querySelector("[data-ultra-browse]")?.dataset.ultraBrowse!==state.mode)return;
    const list=panel.querySelector("[data-ultra-browse-results]");
    const status=panel.querySelector("[data-ultra-browse-status]");
    const more=panel.querySelector("[data-ultra-browse-more]");
    if(!list||!status||!more)return;
    list.innerHTML=state.entries.length?state.entries.map(item=>{
      const name=state.mode==="media"?(item.file_name||"Arquivo"):
        String(item.body||"Mensagem").slice(0,160);
      const icon=state.mode==="media"?
        String(item.mime_type||"").startsWith("image/")?"🖼️":
        String(item.mime_type||"").startsWith("video/")?"🎞️":
        String(item.mime_type||"").startsWith("audio/")?"🎙️":"📎":icons[state.mode];
      const id=escapeHtml(item.message_id);
      return '<button type="button" class="feature-row" role="listitem" data-ultra-browse-item="'+id+'">'+
        '<span class="ci">'+icon+'</span><span class="grow"><b>'+escapeHtml(name)+'</b>'+
        '<small>'+escapeHtml(textTime(item.created_at))+'</small></span><span class="arrow">›</span></button>';
    }).join(""):'<div class="empty">'+(state.busy?"Carregando…":"Nenhum resultado")+'</div>';
    status.textContent=state.busy?"Carregando…":state.entries.length?state.entries.length+" resultado(s)":"";
    more.hidden=!state.hasMore||state.busy||!state.requested;
  }
  async function load(){
    if(!state||state.busy||!state.hasMore||(state.mode==="search"&&state.term.trim().length<2))return;
    const task=++sequence,at=state;
    at.busy=true;at.requested=true;paint();
    const method={search:"v46_chat_search",saved:"v46_chat_saved_items",media:"v46_chat_media_items"}[at.mode];
    const args=params();
    if(at.mode==="saved")args.p_only_pinned=false;
    if(at.mode==="search")args.p_query=at.term.trim().slice(0,100);
    try{
      const {data,error}=await client.rpc(method,args);
      if(error)throw error;
      if(task!==sequence||state!==at)return;
      const rows=Array.isArray(data)?data:[];
      const existing=new Set(at.entries.map(x=>x.message_id));
      for(const item of rows){if(validId(item.message_id)&&!existing.has(item.message_id)){
        at.entries.push(item);existing.add(item.message_id);
      }}
      at.hasMore=rows.length===40;
      at.cursor=rows.at(-1)?.created_at||null;
    }catch(error){
      if(state===at){at.hasMore=false;onError(error?.code||"offline");}
    }finally{if(state===at){at.busy=false;paint();}}
  }
  const trigger=event=>{
    const target=event.target;
    const button=target?.closest?.("#bSearch,#cfg [data-feature='starred'],#cfg [data-feature='media']");
    if(button){
      const type=button.id==="bSearch"?"search":button.dataset.feature==="media"?"media":"saved";
      event.preventDefault();event.stopImmediatePropagation();
      open(type);return;
    }
    if(!target?.closest?.("#shBox [data-ultra-browse]"))return;
    const close=target.closest("[data-ultra-browse-close]");
    if(close){event.preventDefault();event.stopImmediatePropagation();modal.close();state=null;return;}
    if(target.closest("[data-ultra-browse-more]")){
      event.preventDefault();event.stopImmediatePropagation();
      void load();return;
    }
    const item=target.closest("[data-ultra-browse-item]");
    if(item&&state){
      event.preventDefault();event.stopImmediatePropagation();
      const selected=state.entries.find(x=>x.message_id===item.dataset.ultraBrowseItem);
      if(selected){const id=state.id;modal.close();state=null;void onNavigate?.(id,selected);}
    }
  };
  const input=event=>{
    if(!event.target?.matches?.("#shBox [data-ultra-browse-term]")||!state||state.mode!=="search")return;
    state.term=event.target.value;state.entries=[];state.cursor=null;state.hasMore=true;state.requested=false;
    sequence++;clearTimeout(delay);paint();
    if(state.term.trim().length>=2)delay=setTimeout(()=>void load(),320);
  };
  document.addEventListener("click",trigger,true);
  document.addEventListener("input",input,true);
  return {open,dispose(){sequence++;clearTimeout(delay);document.removeEventListener("click",trigger,true);document.removeEventListener("input",input,true);}};
}