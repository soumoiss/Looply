// Administração: importação real de ZIP preparado pelo Looply.
// O ZIP contém WebP originais em armazenamento ZIP_STORED (método 0).
// Nenhum recurso externo, desenho substituto ou conversão de animação.
import { looplyClient } from "./neon-production-client.js";

const input=document.querySelector("#stickerZip");
const start=document.querySelector("#startStickerImport");
const status=document.querySelector("#importStatus");
const log=document.querySelector("#importLog");
const progress=document.querySelector("#stickerImportProgress");
const counters=document.querySelector("#importCounters");
const bucket=looplyClient.storage.from("looply-stickers");
const decoder=new TextDecoder("utf-8",{fatal:true});
const MAX_ZIP_BYTES=150*1024*1024;
const MAX_FILE_BYTES=1024*1024;
let ownerId=null;
let working=false;

function updateStatus(message){status.textContent=message;}
function addLog(message){
  const item=document.createElement("li");
  item.textContent=message;
  log.prepend(item);
  while(log.children.length>50)log.lastElementChild.remove();
}
function fail(message){throw new Error(message);}
function sha256(data){
  return crypto.subtle.digest("SHA-256",data).then(buffer=>
    [...new Uint8Array(buffer)].map(byte=>byte.toString(16).padStart(2,"0")).join(""));
}
function unpackStoredZip(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  const u16=offset=>view.getUint16(offset,true);
  const u32=offset=>view.getUint32(offset,true);
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(u32(i)===0x06054b50){eocd=i;break;}
  }
  if(eocd<0)fail("O arquivo não contém um diretório ZIP válido.");
  if(u16(eocd+4)!==0 || u16(eocd+6)!==0 ||
     u16(eocd+8)!==u16(eocd+10) || u16(eocd+10)>1500)
    fail("O ZIP está dividido, excessivamente grande ou corrompido.");
  const count=u16(eocd+10),size=u32(eocd+12),central=u32(eocd+16);
  if(central+size>eocd)fail("Diretório ZIP inválido.");
  const files=new Map();
  let cursor=central;
  for(let n=0;n<count;n++){
    if(cursor+46>eocd || u32(cursor)!==0x02014b50)fail("Entrada ZIP inválida.");
    const flags=u16(cursor+8),method=u16(cursor+10);
    const length=u32(cursor+24),nameSize=u16(cursor+28);
    const extraSize=u16(cursor+30),commentSize=u16(cursor+32);
    const offset=u32(cursor+42),storedSize=u32(cursor+20);
    const end=cursor+46+nameSize+extraSize+commentSize;
    if(end>eocd || flags&1 || method!==0 || length!==storedSize)
      fail("Este importador aceita apenas o ZIP preparado sem compactação/encriptação.");
    const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameSize));
    cursor=end;
    if(offset+30>central || u32(offset)!==0x04034b50)fail("Cabeçalho local inválido.");
    const begin=offset+30+u16(offset+26)+u16(offset+28);
    if(begin+storedSize>central)fail("Arquivo ZIP truncado.");
    if(!(/^figurinhas\/[a-f0-9]{64}\.webp$/.test(name)||name==="manifest.json"))
      fail("Entrada ZIP inesperada: "+name.slice(0,90));
    if(files.has(name))fail("Nome de arquivo duplicado no ZIP.");
    if(name!=="manifest.json" && (storedSize===0 || storedSize>MAX_FILE_BYTES))
      fail("Figurinha excede o limite de 1 MB.");
    files.set(name,{begin,length:storedSize});
  }
  if(cursor!==central+size)fail("Diretório ZIP inconsistente.");
  const manifestLocation=files.get("manifest.json");
  if(!manifestLocation)fail("Manifesto não encontrado.");
  const manifest=JSON.parse(decoder.decode(bytes.subarray(
    manifestLocation.begin,manifestLocation.begin+manifestLocation.length)));
  if(!manifest || manifest.unique_files!==534 || !Array.isArray(manifest.items))
    fail("Este não é o pacote verificado de 534 figurinhas do Looply.");
  const unique=manifest.items.filter(item=>!item.duplicate_of);
  if(unique.length!==534 || files.size!==535)
    fail("A contagem de imagens não corresponde ao manifesto.");
  const seen=new Set();
  for(const item of unique){
    if(!/^[a-f0-9]{64}$/.test(item.sha256) ||
       item.asset_file!=="figurinhas/"+item.sha256+".webp" ||
       !files.has(item.asset_file) || seen.has(item.sha256))
      fail("Hash, caminho ou registro do manifesto inconsistente.");
    seen.add(item.sha256);
  }
  return {bytes,files,unique};
}
function isWebp(data){
  return data.length>=16 &&
    String.fromCharCode(...data.subarray(0,4))==="RIFF" &&
    String.fromCharCode(...data.subarray(8,12))==="WEBP";
}
async function ensureAdmin(){
  const session=await looplyClient.auth.getSession();
  if(session.error || !session.data?.session?.user?.id) fail("Entre na sua conta do Looply.");
  const authorized=await looplyClient.rpc("v3_self_is_admin",{});
  if(authorized.error || authorized.data!==true) fail("Somente o administrador pode importar o arquivo.");
  return session.data.session.user.id;
}
async function importOne(item,bytes,files,index){
  const location=files.get(item.asset_file);
  const data=bytes.subarray(location.begin,location.begin+location.length);
  if(!isWebp(data))fail("Imagem WebP inválida: "+item.original_name);
  const digest=await sha256(data);
  if(digest!==item.sha256)fail("Hash inválido: "+item.original_name);
  const existing=await looplyClient.from("sticker_catalog").select("id,storage_path")
    .eq("owner_id",ownerId).eq("content_sha256",digest).limit(1);
  if(existing.error)fail("Falha na consulta de duplicatas: "+existing.error.message);
  if(existing.data?.length)return "already";
  const path="stickers/"+ownerId+"/"+crypto.randomUUID()+".webp";
  const blob=new Blob([data],{type:"image/webp"});
  const uploaded=await bucket.upload(path,blob,{contentType:"image/webp"});
  if(uploaded.error)fail("Falha no envio: "+uploaded.error.message);
  let recorded=false;
  try {
    const saved=await looplyClient.from("sticker_catalog").insert({
      slug:"u-"+crypto.randomUUID(),
      title:"Figurinha "+String(index+1).padStart(3,"0"),
      owner_id:ownerId,
      storage_path:path,
      byte_size:blob.size,
      content_sha256:digest,
      source_name:"Sticker.zip"
    }).select("id,storage_path").single();
    if(saved.error || saved.data?.storage_path!==path)fail("Registro no catálogo não confirmado.");
    recorded=true;
    const confirmed=await looplyClient.from("sticker_catalog").select("id,storage_path")
      .eq("id",saved.data.id).maybeSingle();
    if(confirmed.error || confirmed.data?.storage_path!==path)
      fail("Registro de figurinha ainda não confirmado.");
    const signed=await bucket.createSignedUrl(path,900);
    if(signed.error || !signed.data?.signedUrl)fail("A URL da figurinha não foi assinada.");
    return "imported";
  } catch(error) {
    if(!recorded){
      const cleanup=await bucket.remove([path]);
      if(cleanup.error)addLog("Atenção: mídia enviada mas limpeza não confirmada: "+path);
    }
    throw error;
  }
}
async function importZip(){
  if(working)return;
  working=true;
  start.disabled=true;
  input.disabled=true;
  log.replaceChildren();
  progress.value=0;
  try{
    const file=input.files?.[0];
    if(!file || file.size===0 || file.size>MAX_ZIP_BYTES || !/\.zip$/i.test(file.name))
      fail("Selecione o arquivo ZIP preparado (até 150 MB).");
    ownerId=await ensureAdmin();
    updateStatus("Lendo e verificando as 534 figurinhas originais…");
    const {bytes,files,unique}=unpackStoredZip(await file.arrayBuffer());
    let imported=0,already=0,failed=0;
    const failures=[];
    progress.max=unique.length;
    for(let i=0;i<unique.length;i++){
      try{
        const result=await importOne(unique[i],bytes,files,i);
        if(result==="imported")imported++;
        else already++;
      }catch(error){
        failed++;
        failures.push({name:unique[i].original_name,error:String(error.message||error)});
        addLog("Falhou "+(i+1)+": "+String(error.message||error));
      }
      progress.value=i+1;
      counters.textContent=imported+" importadas · "+already+" já existentes · "+failed+" falhas · "+(i+1)+"/"+unique.length;
      if(i%5===0 || i===unique.length-1)updateStatus("Importando figurinhas "+(i+1)+"/"+unique.length+"…");
    }
    updateStatus(failed
      ? "Importação parcial: "+imported+" novas, "+already+" já existentes, "+failed+" falharam. Reenvie o mesmo ZIP para tentar novamente."
      : "Importação concluída no Neon: "+imported+" novas e "+already+" já existentes. Verifique o seletor do chat.");
    if(failures.length){
      const report=new Blob([JSON.stringify({imported,already,failed,failures},null,2)],{type:"application/json"});
      const url=URL.createObjectURL(report);
      const anchor=document.createElement("a");
      anchor.href=url;anchor.download="falhas-importacao-looply.json";
      anchor.textContent="Baixar relatório de falhas";
      document.querySelector("#importReport").replaceChildren(anchor);
    }
  } catch(error){
    updateStatus("Não foi possível importar: "+String(error.message||error));
    addLog(String(error.stack||error));
  } finally {
    working=false;
    start.disabled=false;
    input.disabled=false;
  }
}
start.addEventListener("click",importZip);
updateStatus("Selecione o ZIP preparado com as 534 figurinhas para iniciar o envio autenticado.");
