// Neon-only paginated Chat Ultra search, saved items and media browsing.
// Every RPC enforces JWT membership and message expiration / personal hiding.
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
export async function browseUltraPage({client,conversationId,mode,search="",kind="all",cursor=null,limit=50}={}){
  if(!client?.rpc||!UUID.test(conversationId)||!["search","media","saved"].includes(mode))
    throw Error("Consulta indisponível.");
  const size=Math.max(1,Math.min(50,Number(limit)||50));
  let rpc,args;
  const common={
    p_conversation_id:conversationId,
    p_before_at:cursor?.at||null,
    p_before_id:cursor?.id||null,
    p_limit:size+1
  };
  if(mode==="search"){
    if(!search.trim()||search.trim().length>120)throw Error("Digite um termo de até 120 caracteres.");
    rpc="v47_chat_search";args={...common,p_query:search.trim(),p_sender_id:null};
  }else if(mode==="media"){
    rpc="v47_chat_media";args={...common,p_media_kind:kind};
  }else{
    rpc="v47_chat_saved";args=common;
  }
  const {data,error}=await client.rpc(rpc,args);
  if(error)throw error;
  const rows=Array.isArray(data)?data:[];
  const hasMore=rows.length>size;
  const items=rows.slice(0,size);
  const last=items.at(-1)||null;
  const after=last?{
    at:mode==="saved"?last.saved_at:last.created_at,
    id:mode==="media"?last.media_id:last.message_id
  }:null;
  return {items,hasMore,cursor:after,mode,kind,search};
}
