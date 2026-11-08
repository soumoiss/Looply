/* Complete, RLS-authorized Chat Ultra export. No messages are read from localStorage.
 * ZIP stores JSON and optionally available R2 attachments. All server-side
 * hidden/expired messages are excluded by Neon RLS.
 */
const CHUNK=100, MAX_ROWS=50000, MAX_UNCOMPRESSED=240*1024*1024;
const encoder=new TextEncoder();
const safeName=value=>String(value||"arquivo").normalize("NFKC")
  .replace(/[\/\\\x00-\x1f:*?"<>|]/g,"_").replace(/^\.+/,"_").slice(0,90)||"arquivo";
const iso=value=>{const date=new Date(value);return Number.isFinite(date.valueOf())?date.toISOString():null};
function parsePeriod(days=0){return days?new Date(Date.now()-days*86400000).toISOString():null;}
function header(metadata,rows){
  return {product:"Looply Chat Ultra",schema:"chat-export-v1",exportedAt:new Date().toISOString(),
    conversation:metadata,count:rows.length,
    note:"A exportação contém apenas mensagens que sua conta pode consultar agora. Arquivos de mídia são incluídos somente na opção ZIP.",
    messages:rows};
}
function download(blob,name,doc=globalThis.document,urlApi=globalThis.URL){
  const url=urlApi.createObjectURL(blob),a=doc.createElement("a");
  a.download=name;a.href=url;a.style.display="none";
  doc.body.append(a);a.click();a.remove();
  setTimeout(()=>urlApi.revokeObjectURL(url),20000);
}
async function listMessages(client,conversationId,days,onProgress){
  const all=[],from=parsePeriod(days);
  let offset=0,byteEstimate=0;
  while(true){
    let query=client.from("chat_messages")
      .select("id,conversation_id,sender_id,body,reply_to,created_at,updated_at,expires_at,media:chat_media!chat_media_message_fk(id,storage_path,mime_type,file_name,byte_size)")
      .eq("conversation_id",conversationId)
      .order("created_at",{ascending:false}).order("id",{ascending:false})
      .range(offset,offset+CHUNK-1);
    if(from)query=query.gte("created_at",from);
    const {data,error}=await query;
    if(error)throw error;
    const batch=Array.isArray(data)?data:[];
    for(const row of batch){
      const safe={
        id:row.id,senderId:row.sender_id,createdAt:iso(row.created_at),
        updatedAt:iso(row.updated_at),expiresAt:iso(row.expires_at),
        replyTo:row.reply_to||null,body:String(row.body||""),
        attachments:(row.media||[]).map(media=>({
          id:media.id,name:safeName(media.file_name),
          type:media.mime_type,size:Number(media.byte_size)||0,
          path:media.storage_path
        }))
      };
      byteEstimate+=safe.body.length*3+safe.attachments.length*380+550;
      if(byteEstimate>MAX_UNCOMPRESSED||all.length>=MAX_ROWS)
        throw Error("Histórico muito grande. Exporte por período (7 ou 30 dias).");
      all.push(safe);
    }
    onProgress?.(all.length);
    if(batch.length<CHUNK)break;
    offset+=batch.length;
  }
  return all.reverse();
}
function uint16(n){const out=new Uint8Array(2);new DataView(out.buffer).setUint16(0,n,true);return out;}
function uint32(n){const out=new Uint8Array(4);new DataView(out.buffer).setUint32(0,n>>>0,true);return out;}
function join(...parts){const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
export function createStoreZip(files){
  let offset=0;
  const locals=[],central=[];
  for(const {name,content} of files){
    const fn=encoder.encode(name),bytes=typeof content==="string"?encoder.encode(content):content;
    if(bytes.length>0xffffffff||offset+bytes.length>0xffffffff)throw Error("Arquivo ZIP muito grande.");
    const checksum=crc32(bytes);
    const local=join(uint32(0x04034b50),uint16(20),uint16(0x0800),uint16(0),uint16(0),uint16(0),
      uint32(checksum),uint32(bytes.length),uint32(bytes.length),uint16(fn.length),uint16(0),fn,bytes);
    const record=join(uint32(0x02014b50),uint16(20),uint16(20),uint16(0x0800),uint16(0),uint16(0),uint16(0),
      uint32(checksum),uint32(bytes.length),uint32(bytes.length),uint16(fn.length),uint16(0),uint16(0),
      uint16(0),uint16(0),uint32(0),uint32(offset),fn);
    locals.push(local);central.push(record);offset+=local.length;
  }
  const directory=join(...central),tail=join(uint32(0x06054b50),uint16(0),uint16(0),
    uint16(files.length),uint16(files.length),uint32(directory.length),uint32(offset),uint16(0));
  return new Blob([...locals,...central,tail],{type:"application/zip"});
}
async function addMedia(client,rows,files,onProgress){
  let bytes=0,n=0,skipped=0;
  for(const message of rows){
    for(const media of message.attachments){
      if(!media.path)continue;
      const expires=message.expiresAt?Date.parse(message.expiresAt):Infinity;
      const seconds=Number.isFinite(expires)?Math.floor((expires-Date.now())/1000):300;
      if(seconds<2){skipped++;continue;}
      const {data,error}=await client.storage.from("looply-chat").createSignedUrl(media.path,Math.min(300,seconds));
      if(error||!data?.signedUrl){skipped++;continue;}
      try{
        const response=await fetch(data.signedUrl,{cache:"no-store"});
        if(!response.ok)throw Error("media_unavailable");
        const binary=new Uint8Array(await response.arrayBuffer());
        bytes+=binary.byteLength;
        if(bytes>MAX_UNCOMPRESSED)throw Error("Limite de 240 MiB para mídias no ZIP. Exporte por período.");
        files.push({name:"media/"+safeName(message.id)+"-"+safeName(media.name),content:binary});
        n++;onProgress?.(rows.length,n);
      }catch(error){
        if(/Limite de 240/.test(String(error.message)))throw error;
        skipped++;
      }
    }
  }
  return {included:n,unavailable:skipped};
}
export async function exportUltraHistory({client,conversationId,conversationName="Conversa",days=0,
  format="json",includeMedia=false,onProgress=()=>{},save=download}){
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(conversationId))throw Error("Conversa inválida.");
  if(![0,7,30].includes(days)||!["json","txt","zip"].includes(format))throw Error("Opção inválida.");
  onProgress("Consultando histórico autorizado…");
  const rows=await listMessages(client,conversationId,days,count=>onProgress(count+" mensagens consultadas"));
  const record=header({id:conversationId,name:conversationName,periodDays:days||null},rows);
  const fileName="looply-"+safeName(conversationId)+"-"+new Date().toISOString().slice(0,10);
  if(format==="json"){
    save(new Blob([JSON.stringify(record,null,2)],{type:"application/json;charset=utf-8"}),fileName+".json");
  }else if(format==="txt"){
    const text=["Looply Chat Ultra",conversationName,record.exportedAt,"",
      ...rows.map(row=>[row.createdAt,row.senderId,row.body,
        ...row.attachments.map(a=>"[Anexo: "+a.name+" — "+a.type+"]")].join("\n")+"\n---\n")].join("\n");
    save(new Blob([text],{type:"text/plain;charset=utf-8"}),fileName+".txt");
  }else{
    const files=[{name:"historico.json",content:JSON.stringify(record,null,2)}];
    if(includeMedia){
      onProgress("Preparando mídias autorizadas…");
      record.media=await addMedia(client,rows,files,(_,count)=>onProgress(count+" mídias incluídas"));
      files[0].content=JSON.stringify(record,null,2);
    }
    save(createStoreZip(files),fileName+".zip");
  }
  return {count:rows.length,media:record.media||{included:0,unavailable:0}};
}
