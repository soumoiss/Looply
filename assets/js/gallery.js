import { mountAppPage } from "../../src/page-runtime.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const dateLabel = value => { const d = new Date(value); return Number.isNaN(+d) ? "" : new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium"}).format(d); };
const galleryMarkup = () => `
<section class="gallery-shell">
  <div class="gallery-hero"><div><div class="gallery-eyebrow">Seu espaço compartilhado</div><h1 class="gallery-title">Galeria</h1><p class="gallery-subtitle">Fotos, vídeos e lembranças da comunidade Looply, reunidos em um só lugar.</p></div><button class="gallery-primary" data-open-upload>＋ Adicionar mídia</button></div>
  <nav class="gallery-tabs" aria-label="Seções da galeria"><button class="gallery-tab active" data-main="recentes">Recentes</button><button class="gallery-tab" data-main="videos">Vídeos</button><button class="gallery-tab" data-main="privadas">Privadas 🔒</button></nav>
  <div class="gallery-toolbar"><input class="gallery-search" type="search" placeholder="Buscar por título ou descrição…" aria-label="Buscar na galeria" data-search><div class="gallery-actions"><button class="gallery-tool" data-view="grid" aria-pressed="true">▦ Grade</button><button class="gallery-tool" data-view="list" aria-pressed="false">☷ Lista</button><button class="gallery-tool" data-view="masonry" aria-pressed="false">▤ Mosaico</button></div></div>
  <div class="gallery-filters"><button class="gallery-chip active" data-kind="all">Todas</button><button class="gallery-chip" data-kind="image">Fotos</button><button class="gallery-chip" data-kind="video">Vídeos</button><button class="gallery-chip" data-kind="audio">Áudios</button></div>
  <p class="gallery-status" data-status role="status"></p><div class="gallery-count" data-count></div><div class="gallery-grid" data-grid></div>
</section>
<div class="gallery-modal" data-upload-modal hidden><section class="gallery-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title"><h2 id="upload-title">Adicionar à galeria</h2><form class="gallery-form" data-upload-form><label>Arquivos (até 12)<input type="file" name="files" accept="image/*,video/mp4,video/webm,audio/*" multiple required></label><label>Título<input name="title" maxlength="160" placeholder="Dê um nome para essa lembrança"></label><label>Descrição<textarea name="description" maxlength="1200" placeholder="Conte um pouco sobre esta mídia"></textarea></label><label>Tipo<select name="category"><option value="photo">Fotos</option><option value="illustration">Ilustrações</option><option value="design">Design</option><option value="news">Notícias</option><option value="video">Vídeos</option><option value="audio">Áudios</option></select></label><p class="gallery-status" data-upload-status></p><div class="gallery-dialog-actions"><button class="gallery-tool" type="button" data-close-upload>Cancelar</button><button class="gallery-primary" type="submit">Enviar mídia</button></div></form></section></div>
<div class="gallery-modal" data-pin-modal hidden><section class="gallery-dialog" role="dialog" aria-modal="true" aria-labelledby="pin-title"><h2 id="pin-title">Área privada</h2><p>Digite seu PIN de seis dígitos para abrir suas mídias privadas.</p><form class="gallery-form" data-pin-form><label>PIN<input name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="current-password"></label><p class="gallery-status" data-pin-status></p><div class="gallery-dialog-actions"><button class="gallery-tool" type="button" data-close-pin>Cancelar</button><button class="gallery-tool" type="button" data-set-pin>Salvar PIN</button><button class="gallery-primary" type="submit">Desbloquear</button></div></form></section></div>
<div class="gallery-viewer" data-viewer hidden><button type="button" aria-label="Fechar visualização" data-close-viewer>×</button><div data-viewer-media></div></div>`;

await mountAppPage({ page: "gallery", render: async ({root,client,user}) => {
  root.innerHTML = galleryMarkup();
  const grid=root.querySelector("[data-grid]"),status=root.querySelector("[data-status]"),count=root.querySelector("[data-count]");
  let items=[],main="recentes",kind="all",view="grid",privateUnlocked=false;
  const say=(message,where=status)=>{where.textContent=message||""};
  const mediaType=x=>x.kind||(String(x.mime_type||"").startsWith("video/")?"video":String(x.mime_type||"").startsWith("audio/")?"audio":"image");
  const load=async()=>{
    say("Carregando mídias…");
    const [a,c]=await Promise.all([
      client.from("archive_media").select("id,source_path,file_name,description,storage_path,kind,mime_type,visibility,source_date,created_at").order("source_date",{ascending:false,nullsFirst:false}).order("created_at",{ascending:false}).limit(500),
      client.from("community_gallery_media").select("id,owner_id,storage_path,file_name,kind,mime_type,caption,visibility,created_at,owner:profiles!community_gallery_media_owner_id_fkey(username,display_name)").order("created_at",{ascending:false}).limit(300)
    ]);
    if(a.error&&c.error)throw a.error;
    items=[...(a.data||[]).map(x=>({...x,source:"archive",title:x.file_name||x.source_path,description:x.description||"",date:x.source_date||x.created_at})),...(c.data||[]).map(x=>({...x,source:"community",title:x.caption||x.file_name,description:x.caption||"",date:x.created_at}))];
    try{const {data:personal,error:personalError}=await client.from("gallery_media_descriptions").select("source,media_id,description,category").eq("user_id",user.id);if(!personalError){const map=new Map((personal||[]).map(r=>[r.source+":"+r.media_id,r]));for(const item of items){const row=map.get(item.source+":"+item.id);if(row){item.description=row.description;item.personalCategory=row.category}}}}catch{}\n    for(const x of items){const bucket=x.source==="archive"?"looply-media":"looply-gallery";try{const {data}=await client.storage.from(bucket).createSignedUrl(x.storage_path,1800);x.url=data?.signedUrl||""}catch{x.url=""}}
    say("");draw();
  };
  const visible=()=>items.filter(x=>{
    if(main==="videos"&&mediaType(x)!=="video")return false;
    if(main==="privadas"&&(!privateUnlocked||x.visibility!=="exclusive"))return false;
    if(main!=="privadas"&&x.visibility==="exclusive")return false;
    if(kind!=="all"&&mediaType(x)!==kind)return false;
    const q=root.querySelector("[data-search]").value.trim().toLocaleLowerCase("pt-BR");
    return !q||[x.title,x.description,x.owner?.display_name,x.owner?.username].some(v=>String(v||"").toLocaleLowerCase("pt-BR").includes(q));
  });
  const draw=()=>{
    grid.className="gallery-grid"+(view==="list"?" list":view==="masonry"?" masonry":"");
    const list=visible();count.textContent=list.length+" mídia(s)";
    grid.innerHTML=list.length?list.map(x=>{
      const type=mediaType(x),media=x.url?(type==="video"?'<video src="'+esc(x.url)+'" controls preload="metadata"></video>':type==="audio"?'<audio src="'+esc(x.url)+'" controls></audio>':'<img src="'+esc(x.url)+'" alt="'+esc(x.title)+'" loading="lazy">'):'<span>Prévia indisponível</span>';
      const author=x.owner?.display_name||x.owner?.username||"Arquivo compartilhado";
      return '<article class="gallery-card" data-card="'+esc(x.source+":"+x.id)+'"><div class="gallery-media" data-open-media="'+esc(x.source+":"+x.id)+'">'+media+'</div><div class="gallery-card-body"><h2 class="gallery-card-title">'+esc(x.title||"Mídia sem título")+'</h2><div class="gallery-meta">'+esc(author)+' · '+esc(dateLabel(x.date))+' · '+esc(type==="image"?"Foto":type==="video"?"Vídeo":type==="audio"?"Áudio":"Arquivo")+'</div><p class="gallery-description">'+esc(x.description||"Sem descrição.")+'</p><div class="gallery-card-actions"><button data-like="'+esc(x.source+":"+x.id)+'">♡ Curtir</button><button data-comments="'+esc(x.source+":"+x.id)+'">Comentários</button>'+(x.source==="community"&&x.owner_id===user.id?'<button data-delete="'+esc(x.id)+'">Excluir</button>':"")+'</div></div></article>';
    }).join(""):'<div class="gallery-empty">Nenhuma mídia encontrada nesta seção. Adicione uma lembrança ou ajuste os filtros.</div>';
  };
  root.addEventListener("click",async e=>{
    const btn=e.target.closest("button");
    if(btn?.matches("[data-open-upload]"))root.querySelector("[data-upload-modal]").hidden=false;
    if(btn?.matches("[data-close-upload]"))root.querySelector("[data-upload-modal]").hidden=true;
    if(btn?.matches("[data-close-pin]"))root.querySelector("[data-pin-modal]").hidden=true;
    if(btn?.matches("[data-main]")){main=btn.dataset.main;root.querySelectorAll("[data-main]").forEach(b=>b.classList.toggle("active",b===btn));if(main==="privadas"&&!privateUnlocked)root.querySelector("[data-pin-modal]").hidden=false;draw()}
    if(btn?.matches("[data-kind]")){kind=btn.dataset.kind;root.querySelectorAll("[data-kind]").forEach(b=>b.classList.toggle("active",b===btn));draw()}
    if(btn?.matches("[data-view]")){view=btn.dataset.view;root.querySelectorAll("[data-view]").forEach(b=>b.setAttribute("aria-pressed",String(b===btn)));draw()}
    if(btn?.matches("[data-close-viewer]"))root.querySelector("[data-viewer]").hidden=true;
    const open=e.target.closest("[data-open-media]");if(open){const x=items.find(x=>x.source+":"+x.id===open.dataset.openMedia);if(x?.url){const t=mediaType(x);root.querySelector("[data-viewer-media]").innerHTML=t==="video"?'<video src="'+esc(x.url)+'" controls autoplay playsinline></video>':'<img src="'+esc(x.url)+'" alt="'+esc(x.title)+'">';root.querySelector("[data-viewer]").hidden=false}}
    const like=btn?.dataset.like;if(like){const [source,id]=like.split(":");const table=source==="archive"?"archive_media_likes":"community_gallery_media_likes";const {data:existing,error}=await client.from(table).select("media_id").eq("media_id",id).eq("user_id",user.id).maybeSingle();if(error){say("Curtidas indisponíveis até aplicar a migração de curtidas.");return}const result=existing?await client.from(table).delete().eq("media_id",id).eq("user_id",user.id):await client.from(table).insert({media_id:id,user_id:user.id});say(result.error?"Não foi possível atualizar a curtida.":existing?"Curtida removida.":"Curtido!")}
    if(btn?.dataset.comments){const [source,id]=btn.dataset.comments.split(":");const table=source==="archive"?"archive_media_comments":"community_gallery_comments";const body=prompt("Escreva seu comentário:");if(!body?.trim())return;const result=await client.from(table).insert({media_id:id,author_id:user.id,body:body.trim(),audience:"media_viewers"});say(result.error?"Não foi possível publicar o comentário.":"Comentário publicado.")}
    if(btn?.dataset.delete){if(!confirm("Excluir esta mídia enviada por você?"))return;const x=items.find(x=>x.source==="community"&&x.id===btn.dataset.delete);if(!x)return;const {error}=await client.from("community_gallery_media").delete().eq("id",x.id).eq("owner_id",user.id);if(error)say("Não foi possível excluir a mídia.");else{await client.storage.from("looply-gallery").remove([x.storage_path]);items=items.filter(y=>y.id!==x.id||y.source!=="community");draw();say("Mídia excluída.")}}
  });
  root.querySelector("[data-search]").addEventListener("input",draw);
  root.addEventListener("click",async e=>{const setPin=e.target.closest("[data-set-pin]");if(setPin){const form=root.querySelector("[data-pin-form]"),pin=String(new FormData(form).get("pin")||"");if(!/^\\d{6}$/.test(pin)){say("Use exatamente seis dígitos.",root.querySelector("[data-pin-status]"));return}const {error}=await client.rpc("set_gallery_private_passcode",{p_password:pin});say(error?"Não foi possível salvar o PIN. Confira as migrações.":"PIN salvo com segurança.",root.querySelector("[data-pin-status]")}});
  root.querySelector("[data-pin-form]").addEventListener("submit",async e=>{e.preventDefault();const pin=new FormData(e.currentTarget).get("pin");const {data,error}=await client.rpc("verify_gallery_private_passcode",{p_password:String(pin)});if(error||!data){say("PIN incorreto ou não configurado.",root.querySelector("[data-pin-status]"));return}privateUnlocked=true;root.querySelector("[data-pin-modal]").hidden=true;draw()});
  root.querySelector("[data-upload-form]").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]'),fd=new FormData(form),files=Array.from(fd.getAll("files")).filter(f=>f instanceof File&&f.size);
    if(!files.length||files.length>12){say("Selecione de 1 a 12 arquivos.",root.querySelector("[data-upload-status]"));return}
    button.disabled=true;say("Enviando arquivos…",root.querySelector("[data-upload-status]"));
    try{for(const file of files){if(file.size>100*1024*1024)throw new Error("Cada arquivo deve ter no máximo 100 MB.");const ext=(file.name.split(".").pop()||"bin").replace(/[^a-z0-9]/gi,"").toLowerCase();const path=user.id+"/"+crypto.randomUUID()+"."+ext;const {error:upErr}=await client.storage.from("looply-gallery").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});if(upErr)throw upErr;const kind=file.type.startsWith("video/")?"video":file.type.startsWith("audio/")?"audio":"image";const {data,error:rowErr}=await client.from("community_gallery_media").insert({owner_id:user.id,storage_path:path,file_name:file.name,caption:String(fd.get("title")||"").trim()||file.name,kind,mime_type:file.type||null,visibility:"members",comment_access:"viewers"}).select("id").single();if(rowErr){await client.storage.from("looply-gallery").remove([path]);throw rowErr}const {error:descErr}=await client.from("gallery_media_descriptions").upsert({user_id:user.id,source:"community",media_id:row.id,description:String(fd.get("description")||"").trim(),category:String(fd.get("category")||"outros")},{onConflict:"user_id,source,media_id"});if(descErr)console.warn("Descrição não salva",descErr)}form.reset();root.querySelector("[data-upload-modal]").hidden=true;await load();say("Mídia enviada com sucesso.");}
    catch(error){console.error(error);say(error.message||"Falha no envio. Confira as permissões e migrações do Supabase.",root.querySelector("[data-upload-status]"))}finally{button.disabled=false}
  });
  try{await load()}catch(error){console.error(error);say("Não foi possível carregar a galeria. Confira a conexão e as migrações do Supabase.");grid.innerHTML='<div class="gallery-empty">A galeria não pôde ser carregada. Recarregue a página após verificar a configuração do Supabase.</div>'}
} });
