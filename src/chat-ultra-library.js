/* Authenticated Chat Ultra 3.0 discovery — server paginated, no demo data.
 * The visual model remains untouched; its sheet is reused for search,
 * pinned/favorite messages, media and files.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const TYPES={search:"Buscar no histórico",saved:"Mensagens salvas",media:"Mídias e arquivos"};
export function createUltraLibrary({client,getRoom,onJump,notice=()=>{},doc=globalThis.document}={}){
  if(!client?.rpc||!getRoom||!doc)return {open(){},dispose(){}};
  const state={mode:"",room:"",filter:"all",search:"",rows:[],cursor:null,more:false,loading:false,seq:0};
  const get=()=>doc.querySelector("#shBox");
  const modal=()=>doc.querySelector("#sh");
  const validRoom=id=>UUID.test(String(id||""));
  const formats={search:"v47_chat_search",media:"v47_chat_media",saved:"v47_chat_saved"};
  const params=(mode,room,cursor)=>{
    const values={p_conversation_id:room,p_before_at:cursor?.at||null,
      p_before_id:cursor?.id||null,p_limit:51};
    if(mode==="media")values.p_media_kind=state.filter;
    if(mode==="search"){values.p_query=state.search.trim();values.p_sender_id=null;}
    return values;
  };
  async function page(reset=false){
    if(state.loading||!state.mode||!validRoom(state.room))return;
    if(state.mode==="search"&&!state.search.trim()){state.rows=[];state.more=false;render();return;}
    state.loading=true;const token=++state.seq;
    if(reset){state.cursor=null;state.rows=[];}
    render();
    try{
      const {data,error}=await client.rpc(formats[state.mode],
        params(state.mode,state.room,state.cursor));
      if(error)throw error;
      if(token!==state.seq)return;
      const entries=Array.isArray(data)?data:[];
      state.more=entries.length>50;
      const pageRows=entries.slice(0,50);
      const last=pageRows.at(-1);
      if(last)state.cursor={at:state.mode==="saved"?last.saved_at:last.created_at,
        id:state.mode==="media"?last.media_id:last.message_id};
      const keys=new Set(state.rows.map(row=>row.message_id+(row.media_id||"")));
      for(const row of pageRows)if(!keys.has(row.message_id+(row.media_id||"")))state.rows.push(row);
    }catch(error){
      console.warn("Chat Ultra discovery unavailable",error?.code||"offline");
      notice("Não foi possível consultar o histórico.");
    }finally{if(token===state.seq){state.loading=false;render();}}
  }
  function rowMarkup(row,index){
    const id=esc(row.message_id);
    const title=state.mode==="media"?(row.file_name||"Anexo"):state.mode==="saved"?
      (row.body||"Mensagem salva"):(row.body||"Mensagem");
    const stamp=new Date(row.created_at);
    const time=Number.isFinite(stamp.valueOf())?stamp.toLocaleString("pt-BR"):"";
    const symbol=state.mode==="media"?
      (String(row.mime_type).startsWith("image/")?"📷":String(row.mime_type).startsWith("video/")?"🎞️":
      String(row.mime_type).startsWith("audio/")?"🎤":"📎"):state.mode==="saved"?"⭐":"💬";
    return '<button type="button" class="pk" data-ultra-library-jump="'+id+'" data-index="'+index+'">'+
      '<span class="ci">'+symbol+'</span><span class="ct"><b>'+esc(String(title).slice(0,125))+
      '</b><small>'+esc(time)+'</small></span><span class="arrow">›</span></button>';
  }
  function render(){
    const panel=get();if(!panel||!state.mode||panel.dataset.ultraLibraryRoom!==state.room)return;
    const status=panel.querySelector("[data-ultra-library-results]");
    if(status)status.innerHTML=state.rows.length?
      state.rows.map(rowMarkup).join(""):
      '<div class="empty">'+(state.loading?"Carregando…":state.mode==="search"&&!state.search?"Digite uma palavra para pesquisar.":"Nenhum resultado.")+'</div>';
    const more=panel.querySelector("[data-ultra-library-more]");
    if(more){more.hidden=!state.more;more.disabled=state.loading;more.textContent=state.loading?"Carregando…":"Carregar mais";}
    const count=panel.querySelector("[data-ultra-library-count]");
    if(count)count.textContent=state.rows.length+" resultados";
  }
  function open(mode){
    if(!Object.hasOwn(TYPES,mode))return;
    const room=getRoom();
    if(!validRoom(room)){notice("Abra uma conversa para consultar o histórico.");return;}
    state.mode=mode;state.room=room;state.filter="all";state.search="";state.cursor=null;
    state.rows=[];state.more=false;state.loading=false;state.seq++;
    const panel=get(),dialog=modal();if(!panel||!dialog)return;
    panel.onclick=null;
    delete panel.dataset.looplyContextMenu;
    delete panel.dataset.looplyTtlRoom;
    delete panel.dataset.ultraExportConversation;
    panel.dataset.ultraLibraryRoom=room;
    panel.innerHTML='<div class="grab"></div><h2>'+TYPES[mode]+'</h2>'+
      (mode==="search"?'<input class="fi" type="search" maxlength="120" autocapitalize="none" data-ultra-library-search placeholder="Pesquisar mensagem…" aria-label="Pesquisar mensagens">':
      mode==="media"?'<div class="ptabs" role="group" aria-label="Filtrar anexos">'+
      [["all","Todos"],["photo","Fotos"],["video","Vídeos"],["audio","Áudios"],["file","Arquivos"]].map(([id,label])=>
        '<button class="'+(id==="all"?"on":"")+'" type="button" data-ultra-library-filter="'+id+'">'+label+'</button>').join("")+'</div>':"")+
      '<p class="mobile-note" data-ultra-library-count>0 resultados</p>'+
      '<div data-ultra-library-results style="max-height:min(56dvh,520px);overflow:auto;overscroll-behavior:contain"></div>'+
      '<button class="btn" type="button" data-ultra-library-more hidden>Carregar mais</button>'+
      '<button class="btn" type="button" data-ultra-library-close>Fechar</button>';
    if(!dialog.open)dialog.showModal();
    if(mode==="search")panel.querySelector("[data-ultra-library-search]")?.focus();
    else void page(true);
    render();
  }
  async function jump(row){
    if(!row?.message_id)return;
    const room=state.room;
    modal()?.close();state.mode="";
    await onJump?.(room,row.message_id);
  }
  const onClick=event=>{
    const panel=get();if(!panel?.dataset.ultraLibraryRoom)return;
    if(!event.target.closest("#shBox"))return;
    const filter=event.target.closest("[data-ultra-library-filter]");
    if(filter){
      event.preventDefault();event.stopImmediatePropagation();
      state.filter=filter.dataset.ultraLibraryFilter;
      panel.querySelectorAll("[data-ultra-library-filter]").forEach(node=>node.classList.toggle("on",node===filter));
      state.rows=[];state.cursor=null;void page(true);return;
    }
    const more=event.target.closest("[data-ultra-library-more]");
    if(more){event.preventDefault();event.stopImmediatePropagation();void page(false);return;}
    const close=event.target.closest("[data-ultra-library-close]");
    if(close){event.preventDefault();event.stopImmediatePropagation();state.mode="";modal()?.close();return;}
    const item=event.target.closest("[data-ultra-library-jump]");
    if(item){event.preventDefault();event.stopImmediatePropagation();const row=state.rows[Number(item.dataset.index)];if(row)void jump(row);}
  };
  let debounce=0;
  const onInput=event=>{
    if(!event.target.matches("#shBox [data-ultra-library-search]"))return;
    state.search=event.target.value.slice(0,120);
    clearTimeout(debounce);
    debounce=setTimeout(()=>void page(true),350);
  };
  doc.addEventListener("click",onClick,true);doc.addEventListener("input",onInput,true);
  return {open,dispose(){
    clearTimeout(debounce);state.seq++;state.mode="";
    doc.removeEventListener("click",onClick,true);doc.removeEventListener("input",onInput,true);
  }};
}
