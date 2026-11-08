/* Looply Chat Ultra: source-of-truth message browser.
 * RLS-scoped v46/v47 RPCs, keyset pagination and no demo/local-only results.
 */
const isId=id=>/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(String(id||""));
const modes={search:"Buscar mensagens",saved:"Mensagens salvas",media:"Fotos e arquivos",receipts:"Informações da mensagem"};
const el=(tag,className="",label="")=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(label)node.textContent=label;
  return node;
};
const button=(label,className="")=>{const b=el("button",className,label);b.type="button";return b;};
const date=value=>{const time=new Date(value);return Number.isFinite(time.valueOf())?time.toLocaleString("pt-BR"):"";};
export function setupUltraRemoteBrowser({client,getRoom,getUserName,onOpen,notice=()=>{},signMedia}={}){
  let dialog=null,state=null,aborted=false,debounce=null;
  function mount(){
    if(dialog?.isConnected)return dialog;
    dialog=el("dialog","looply-ultra-browser");
    dialog.setAttribute("aria-label","Navegador de mensagens");
    dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
    dialog.addEventListener("close",()=>{aborted=true;state=null;clearTimeout(debounce);});
    document.body.append(dialog);
    return dialog;
  }
  function header(title){
    const top=el("div","lub-header");
    top.append(el("strong","lub-title",title));
    const close=button("✕","lub-close");close.setAttribute("aria-label","Fechar");
    close.onclick=()=>dialog.close();top.append(close);
    return top;
  }
  const textInput=(placeholder,ariaLabel)=>{
    const input=el("input","lub-input");
    input.type="search";input.placeholder=placeholder;input.setAttribute("aria-label",ariaLabel);
    return input;
  };
  const status=()=>dialog?.querySelector("[data-lub-status]");
  const results=()=>dialog?.querySelector("[data-lub-results]");
  const footer=()=>dialog?.querySelector("[data-lub-more]");
  function setStatus(message){const node=status();if(node)node.textContent=message;}
  function openState(mode,conversationId,options={}){
    if(!modes[mode]||!isId(conversationId)||!getRoom?.(conversationId))return false;
    const d=mount();
    aborted=false;
    state={mode,conversationId,beforeAt:null,beforeId:null,loading:false,hasMore:false,
      query:"",kind:"all",messageId:options.messageId||"",createdAt:options.createdAt||null};
    d.replaceChildren(header(modes[mode]));
    if(mode==="search"){
      const input=textInput("Buscar no histórico","Pesquisar mensagens");
      input.addEventListener("input",()=>{
        clearTimeout(debounce);
        debounce=setTimeout(()=>{
          if(!state||state.mode!=="search"||state.conversationId!==conversationId)return;
          state.query=input.value.trim().slice(0,120);
          state.beforeAt=null;state.beforeId=null;
          results().replaceChildren();
          void load(false);
        },320);
      });
      d.append(input);
    }
    if(mode==="media"){
      const filter=el("select","lub-input");
      filter.setAttribute("aria-label","Filtrar mídias");
      for(const [value,label] of [["all","Todos os arquivos"],["photo","Fotos"],["video","Vídeos"],["audio","Áudios"],["file","Documentos"]]){
        const option=el("option","",label);option.value=value;filter.add(option);
      }
      filter.onchange=()=>{
        if(!state)return;
        state.kind=filter.value;state.beforeAt=null;state.beforeId=null;
        results().replaceChildren();void load(false);
      };
      d.append(filter);
    }
    const list=el("div","lub-results");list.dataset.lubResults="true";
    list.setAttribute("role","list");
    d.append(list);
    const message=el("div","lub-status");message.dataset.lubStatus="true";
    message.setAttribute("role","status");d.append(message);
    const more=button("Carregar mais","lub-more");
    more.dataset.lubMore="true";
    more.onclick=()=>void load(true);
    d.append(more);
    if(!d.open)d.showModal();
    void load(false);
    return true;
  }
  async function queryPage(s){
    if(s.mode==="search"){
      if(!s.query)return [];
      const {data,error}=await client.rpc("v47_chat_search",{
        p_conversation_id:s.conversationId,p_query:s.query,p_before_at:s.beforeAt,
        p_before_id:s.beforeId,p_limit:41,p_sender_id:null
      });
      if(error)throw error;return data||[];
    }
    if(s.mode==="media"){
      const {data,error}=await client.rpc("v47_chat_media",{
        p_conversation_id:s.conversationId,p_media_kind:s.kind,
        p_before_at:s.beforeAt,p_before_id:s.beforeId,p_limit:41
      });
      if(error)throw error;return data||[];
    }
    if(s.mode==="saved"){
      const {data,error}=await client.rpc("v47_chat_saved",{
        p_conversation_id:s.conversationId,p_before_at:s.beforeAt,
        p_before_id:s.beforeId,p_limit:41
      });
      if(error)throw error;return data||[];
    }
    if(s.mode==="receipts"){
      const {data,error}=await client.rpc("v46_chat_message_receipts",{
        p_conversation_id:s.conversationId,p_message_id:s.messageId
      });
      if(error)throw error;return data||[];
    }
    return [];
  }
  async function mediaPreview(row,parent,s){
    if(!row.storage_path||aborted)return;
    const mime=String(row.mime_type||"");
    try{
      const url=await signMedia?.("looply-chat",row.storage_path,300);
      if(!url||aborted||state!==s)return;
      if(mime.startsWith("image/")){
        const pic=el("img","lub-photo");
        pic.alt=String(row.file_name||"Foto");pic.loading="lazy";pic.decoding="async";pic.src=url;
        parent.prepend(pic);
      }else if(mime.startsWith("audio/")){
        const audio=el("audio","lub-audio");audio.controls=true;audio.preload="none";audio.src=url;
        parent.append(audio);
      }else if(mime.startsWith("video/")){
        const video=el("video","lub-video");video.controls=true;video.preload="none";video.playsInline=true;
        video.src=url;parent.append(video);
      }else{
        const link=el("a","lub-download","Abrir arquivo");link.href=url;link.rel="noopener noreferrer";link.target="_blank";
        parent.append(link);
      }
    }catch(error){console.warn("Ultra browser media unavailable",error?.code||"offline");}
  }
  function renderRow(row,s){
    const item=el("div","lub-item");item.setAttribute("role","listitem");
    if(s.mode==="receipts"){
      const name=getUserName?.(row.user_id)||row.display_name||row.username||"Participante";
      const when=new Date(row.last_read_at||"").valueOf(),sent=new Date(s.createdAt||"").valueOf();
      const read=Number.isFinite(when)&&Number.isFinite(sent)&&when>=sent;
      item.append(el("strong","lub-person",name),el("small","lub-date",read?"Lida · "+date(row.last_read_at):"Ainda não lida"));
      return item;
    }
    const id=row.message_id;
    const body=s.mode==="media"?(row.file_name||"Arquivo"):
      s.mode==="saved"?(row.body||"Mensagem salva"):(row.body||"Mensagem");
    const stamp=s.mode==="saved"?row.saved_at:row.created_at;
    const preview=button("","lub-entry");
    preview.append(el("strong","lub-person",getUserName?.(row.sender_id)||""));
    preview.append(el("span","lub-snippet",String(body).slice(0,340)));
    preview.append(el("small","lub-date",date(stamp)));
    preview.onclick=()=>{dialog.close();void onOpen?.(s.conversationId,id);};
    item.append(preview);
    if(s.mode==="media")void mediaPreview(row,item,s);
    return item;
  }
  async function load(append){
    const s=state;
    if(!s||s.loading||aborted)return;
    if(s.mode==="search"&&!s.query){setStatus("");footer().hidden=true;return;}
    s.loading=true;
    const more=footer();
    more.hidden=true;setStatus("Carregando…");
    try{
      const all=await queryPage(s);
      if(s!==state||aborted)return;
      const rows=all.slice(0,40);
      if(!append)results().replaceChildren();
      for(const row of rows)results().append(renderRow(row,s));
      s.hasMore=all.length>40;
      if(rows.length&&s.mode!=="receipts"){
        const last=rows.at(-1);
        s.beforeAt=s.mode==="saved"?last.saved_at:last.created_at;
        s.beforeId=s.mode==="media"?last.media_id:last.message_id;
      }
      more.hidden=!s.hasMore||s.mode==="receipts";
      setStatus(results().childElementCount? "": "Nenhum resultado");
    }catch(error){
      if(s===state&&!aborted){
        setStatus("Não foi possível carregar.");
        notice("Falha ao consultar o histórico.");
      }
      console.warn("Chat Ultra remote list error",error?.code||"offline");
    }finally{if(s===state)s.loading=false;}
  }
  function dispose(){aborted=true;clearTimeout(debounce);dialog?.remove();dialog=null;}
  return {open:openState,dispose};
}
