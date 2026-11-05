// Persistent sticker catalog. Bundled entries are license-reviewed CC0 assets
// committed with Looply, so they do not depend on an external sticker site.
const PAGE_SIZE = 36;
const safeAsset = value => /^assets\/stickers\/[a-z0-9_-]{3,80}\.svg$/.test(String(value || ""));
const safeUpload = value => /^stickers\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(String(value || ""));
const safeBundledAsset = value => /^assets\/stickers\/cc0\/[a-z0-9-]{3,80}\.webp$/.test(String(value || ""));

export const CC0_STICKERS = [
  ["cat-scared", "Gato assustado", "cat-scared.webp", "lalahsghost / myEmotes · CC0 1.0"],
  ["gato-branco", "Gato branco", "gato-branco.webp", "anlh / myEmotes · CC0 1.0"],
  ["gato-derp", "Gato derp", "gato-derp.webp", "lalahsghost / myEmotes · CC0 1.0"],
  ["blobcatpoly", "Gatinhos com coração", "blobcatpoly.webp", "angiepawing / myEmotes · CC0 1.0"]
].map(([slug,title,file,source_name]) => ({
  id:`cc0:${slug}`,slug,title,source_name,asset_path:`assets/stickers/cc0/${file}`,bundled:true
}));

export function cc0StickerFromMessage(body) {
  const match = /^\[\[looply-sticker:([a-z0-9-]{3,80})\]\]$/.exec(String(body || ""));
  return match ? CC0_STICKERS.find(sticker => sticker.slug === match[1]) || null : null;
}
async function prepareImages(client,rows) {
  return Promise.all(rows.map(async row => {
    if (safeAsset(row.asset_path) || safeBundledAsset(row.asset_path)) return row;
    if (!safeUpload(row.storage_path)) return {...row,imageUrl:null};
    const result = await client.storage.from("looply-stickers").createSignedUrl(row.storage_path,1800);
    return {...row,imageUrl:result.error ? null : result.data?.signedUrl||null};
  }));
}
function stickerSrc(row) {
  if (safeAsset(row.asset_path) || safeBundledAsset(row.asset_path)) return new URL(row.asset_path,document.baseURI).href;
  return safeUpload(row.storage_path) ? row.imageUrl||null : null;
}

const states = new WeakMap();
const esc = text => String(text ?? "").replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export function stickerCatalogMarkup() {
  return `<div class="chat-catalog" data-chat-catalog>
    <div class="chat-catalog-tabs" role="group" aria-label="Coleção de figurinhas">
      <button type="button" data-chat-catalog-tab="all" aria-pressed="true">Figurinhas</button>
      <button type="button" data-chat-catalog-tab="favorites" aria-pressed="false">Favoritas</button>
    </div>
    <label class="visually-hidden" for="chatStickerCatalogPack">Pacote de figurinhas</label>
    <select id="chatStickerCatalogPack" data-chat-catalog-pack aria-label="Pacote de figurinhas">
      <option value="">Todos os pacotes</option><option value="cc0">Pacote CC0</option>
    </select>
    <label class="visually-hidden" for="chatStickerCatalogSearch">Buscar figurinha</label>
    <input id="chatStickerCatalogSearch" type="search" maxlength="60" placeholder="Buscar figurinha" data-chat-catalog-search>
    <div class="chat-catalog-grid" data-chat-catalog-grid aria-label="Escolher figurinha"></div>
    <button type="button" class="text-button" data-chat-catalog-more hidden>Carregar mais</button>
    <p class="chat-catalog-status" data-chat-catalog-status role="status" aria-live="polite"></p>
  </div>`;
}
const setStatus = (picker, text) => {
  const field = picker.querySelector("[data-chat-catalog-status]");
  if (field) field.textContent = text;
};
const stateFor = picker => {
  let state = states.get(picker);
  if (!state) {
    state = { tab:"all", pack:"", offset:0, query:"", pending:false, request:0,
      favoriteIds:new Set(), rendered:new Map(), timer:null, sending:false, importing:false };
    states.set(picker,state);
  }
  return state;
};
function renderItems(picker, rows, append) {
  const grid = picker.querySelector("[data-chat-catalog-grid]");
  const state = stateFor(picker);
  if (!append) grid.replaceChildren();
  for (const entry of rows) {
    const url = stickerSrc(entry);
    if (!entry || !url) continue;
    state.rendered.set(entry.id, entry);
    const item = document.createElement("div");
    item.className = "chat-catalog-item";
    const send = document.createElement("button");
    send.type = "button";
    send.dataset.chatStickerItem = entry.id;
    send.setAttribute("aria-label", "Enviar figurinha: " + entry.title);
    const picture = document.createElement("img");
    picture.src = url;
    picture.alt = entry.title;
    picture.loading = "lazy";
    picture.decoding = "async";
    send.append(picture);
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "chat-catalog-favorite";
    favorite.dataset.chatStickerFavorite = entry.id;
    favorite.setAttribute("aria-pressed", String(state.favoriteIds.has(entry.id)));
    favorite.setAttribute("aria-label", state.favoriteIds.has(entry.id) ? "Desfavoritar " + entry.title : "Favoritar " + entry.title);
    favorite.textContent = state.favoriteIds.has(entry.id) ? "★" : "☆";
    item.append(send,favorite);
    grid.append(item);
  }
  if (!grid.children.length) setStatus(picker, state.tab === "favorites"
    ? "Nenhuma figurinha favorita." : "Nenhuma figurinha encontrada.");
}
async function fetchFavoriteIds(client, userId) {
  const ids = new Set();
  for (let offset = 0; offset < 10000; offset += 500) {
    const {data,error} = await client.from("sticker_favorites").select("sticker_id")
      .eq("user_id",userId).order("created_at",{ascending:false}).range(offset,offset+499);
    if (error) throw error;
    for (const row of data || []) ids.add(row.sticker_id);
    if ((data || []).length < 500) break;
  }
  return ids;
}
async function loadPackOptions(picker,client) {
  const select=picker.querySelector("[data-chat-catalog-pack]");
  if (!select) return;
  try {
    const {data,error}=await client.from("sticker_catalog")
      .select("slug,source_name").neq("slug","amostra-coracao").range(0,999);
    if(error) throw error;
    if(!picker.isConnected) return;
    const current=stateFor(picker).pack;
    const sources=[...new Set((data||[]).map(row=>row.source_name).filter(name=>
      typeof name==="string" && name.trim().length && name.trim().length<=80))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
    select.replaceChildren();
    const addOption=(value,label)=>{const option=document.createElement("option");option.value=value;option.textContent=label;select.append(option);};
    addOption("","Todos os pacotes");
    addOption("cc0","Pacote CC0");
    sources.forEach(source=>addOption(source,source));
    if ([...select.options].some(option=>option.value===current)) select.value=current;
    else {select.value="";stateFor(picker).pack="";}
  } catch(error) {
    console.warn("Looply sticker pack metadata unavailable",error);
  }
}
async function loadPage(picker, client, userId, reset = false) {
  const state=stateFor(picker);
  if(state.pending) {
    ++state.request;
    state.queued=reset || Boolean(state.queued);
    return;
  }
  state.pending=true;
  const sequence=++state.request;
  const offset=reset?0:state.offset;
  const more=picker.querySelector("[data-chat-catalog-more]");
  more.hidden=true;
  setStatus(picker,"Carregando figurinhas…");
  if (reset) {
    state.rendered.clear();
    // CC0 stickers are genuine bundled media. Preserve old messages and
    // favorites; never show the legacy SVG example from the database.
    const localRows=(state.pack==="" || state.pack==="cc0")
      ? CC0_STICKERS.filter(item=>(state.tab!=="favorites" || state.favoriteIds.has(item.id))
          && (!state.query || item.title.toLocaleLowerCase("pt-BR").includes(state.query.toLocaleLowerCase("pt-BR"))))
      : [];
    renderItems(picker,localRows,false);
  }
  try {
    if(state.pack==="cc0") {
      state.offset=0;
      if(picker.querySelector("[data-chat-catalog-grid]").children.length)
        setStatus(picker,"Toque para enviar ou na estrela para favoritar.");
      return;
    }
    let rows=[];
    let fetchedCount=0;
    if(state.tab==="favorites") {
      const {data,error}=await client.from("sticker_favorites").select("sticker_id")
        .eq("user_id",userId).order("created_at",{ascending:false}).range(offset,offset+PAGE_SIZE-1);
      if(error) throw error;
      const ids=(data||[]).map(item=>item.sticker_id);
      fetchedCount=ids.length;
      if(ids.length) {
        const found=await client.from("sticker_catalog")
          .select("id,slug,title,asset_path,storage_path,source_name").in("id",ids).limit(PAGE_SIZE);
        if(found.error) throw found.error;
        const indexed=new Map((found.data||[]).map(row=>[row.id,row]));
        rows=ids.map(id=>indexed.get(id)).filter(row=>row && row.slug!=="amostra-coracao"
          && (!state.pack || row.source_name===state.pack)
          && (!state.query || row.title.toLocaleLowerCase("pt-BR").includes(state.query.toLocaleLowerCase("pt-BR"))));
      }
    } else {
      let query=client.from("sticker_catalog")
        .select("id,slug,title,asset_path,storage_path,source_name")
        .neq("slug","amostra-coracao").order("slug");
      if(state.pack) query=query.eq("source_name",state.pack);
      if(state.query) query=query.ilike("title","%"+state.query+"%");
      const result=await query.range(offset,offset+PAGE_SIZE-1);
      if(result.error) throw result.error;
      rows=result.data||[];
      fetchedCount=rows.length;
    }
    const ready=await prepareImages(client,rows);
    if(sequence!==state.request || !picker.isConnected) return;
    renderItems(picker,ready,true);
    state.offset=offset+fetchedCount;
    more.hidden=fetchedCount<PAGE_SIZE;
    if(picker.querySelector("[data-chat-catalog-grid]").children.length)
      setStatus(picker,"Toque na imagem para enviar ou na estrela para favoritar.");
    else
      setStatus(picker,state.tab==="favorites" ? "Nenhuma figurinha favorita neste pacote." : "Nenhuma figurinha disponível neste pacote.");
  } catch(error) {
    console.warn("Looply sticker catalog unavailable.",error);
    setStatus(picker,"Não foi possível carregar o catálogo. Tente novamente.");
  } finally {
    state.pending=false;
    if(state.queued && picker.isConnected) {
      const queuedReset=state.queued;
      state.queued=false;
      void loadPage(picker,client,userId,queuedReset);
    }
  }
}
async function normalizeImportedSticker(file) {
  if (!(file instanceof File) || !["image/png","image/jpeg","image/webp"].includes(file.type)
    || file.size < 1 || file.size > 10*1024*1024)
    throw Error("sticker_invalid_image");
  let bitmap;
  let tempUrl;
  try {
    if (typeof createImageBitmap === "function") bitmap = await createImageBitmap(file);
    else {
      tempUrl=URL.createObjectURL(file);
      bitmap=new Image();
      bitmap.src=tempUrl;
      await bitmap.decode();
    }
    const w=bitmap.width||bitmap.naturalWidth, h=bitmap.height||bitmap.naturalHeight;
    if (!w||!h||w*h>24000000) throw Error("sticker_invalid_dimensions");
    const canvas=document.createElement("canvas");
    const scale=Math.min(1,320/Math.max(w,h));
    canvas.width=Math.max(1,Math.round(w*scale));
    canvas.height=Math.max(1,Math.round(h*scale));
    canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",0.84));
    if (!blob || !blob.size || blob.size>1024*1024) throw Error("sticker_encoding_failed");
    return new File([blob],"figurinha.webp",{type:"image/webp"});
  } finally {
    bitmap?.close?.();
    if (tempUrl) URL.revokeObjectURL(tempUrl);
  }
}
async function importStickerFiles(picker,files,client,userId) {
  const state=stateFor(picker);
  if (state.importing) return;
  state.importing=true;
  let imported=0,failed=0,uncertain=0,duplicates=0;
  try {
    for (const [index,file] of files.entries()) {
      if (!picker.isConnected) break;
      setStatus(picker,`Importando ${index+1}/${files.length}…`);
      let path="", inserted=false;
      try {
        const normalized=await normalizeImportedSticker(file);
        const digest=await crypto.subtle.digest("SHA-256",await normalized.arrayBuffer());
        const hash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
        const existing=await client.from("sticker_catalog").select("id")
          .eq("owner_id",userId).eq("content_sha256",hash).limit(1);
        if (existing.error) throw existing.error;
        if (existing.data?.length) {duplicates++;continue;}
        path=`stickers/${userId}/${crypto.randomUUID()}.webp`;
        const upload=await client.storage.from("looply-stickers").upload(path,normalized,{contentType:"image/webp"});
        if (upload.error) throw upload.error;
        const title=String(file.name||"Figurinha")
          .replace(/\.[^.]+$/,"").replace(/[<>]/g,"").trim().slice(0,100)||"Figurinha";
        const added=await client.from("sticker_catalog").insert({
          slug:"u-"+crypto.randomUUID(),title,owner_id:userId,storage_path:path,
          byte_size:normalized.size,source_name:"Importação pessoal",content_sha256:hash
        }).select("id,storage_path").single();
        if (added.error || !added.data?.id) throw added.error||Error("sticker_insert_failed");
        inserted=true;
        const verified=await client.from("sticker_catalog").select("id,storage_path")
          .eq("id",added.data.id).maybeSingle();
        if (verified.error || verified.data?.storage_path!==path) {
          uncertain++;continue;
        }
        imported++;
      } catch (error) {
        failed++;
        console.warn("Looply personal sticker import failed.",error);
        if (path&&!inserted) {
          const cleanup=await client.storage.from("looply-stickers").remove([path]);
          if (cleanup.error) console.warn("Sticker upload cleanup not confirmed.",cleanup.error);
        }
      }
    }
    state.tab="all";
    picker.querySelectorAll("[data-chat-catalog-tab]").forEach(button=>
      button.setAttribute("aria-pressed",String(button.dataset.chatCatalogTab==="all")));
    state.offset=0;
    await loadPage(picker,client,userId,true);
    setStatus(picker,`${imported} importada(s)${duplicates?" · "+duplicates+" já existente(s)":""}${failed?" · "+failed+" falharam":""}${uncertain?" · "+uncertain+" pendente(s) de verificação":""}.`);
  } finally {state.importing=false;}
}
export function bindStickerCatalog(root, client, getUserId) {
  root.addEventListener("click", async event => {
    const open = event.target.closest("[data-chat-choose-sticker]");
    if (open) {
      const picker = open.closest("[data-chat-send]")?.querySelector("[data-chat-sticker-picker]");
      const userId = getUserId?.();
      if (!picker || !userId) return;
      const state = stateFor(picker);
      const saved = JSON.parse(localStorage.getItem(`looply:cc0-sticker-favorites:${userId}`) || "[]");
      state.favoriteIds = new Set(Array.isArray(saved) ? saved.filter(id => /^cc0:[a-z0-9-]+$/.test(id)) : []);
      if (picker.isConnected) {
        void loadPackOptions(picker,client);
        try {
          const remoteFavorites=await fetchFavoriteIds(client,userId);
          remoteFavorites.forEach(id=>state.favoriteIds.add(id));
        } catch(error) {console.warn("Sticker favorites unavailable",error);}
        if (picker.isConnected) void loadPage(picker,client,userId,true);
      }
      return;
    }
    const picker = event.target.closest("[data-chat-sticker-picker]");
    if (!picker) return;
    const state = stateFor(picker);
    const userId = getUserId?.();
    if (!userId) return;
    const tab = event.target.closest("[data-chat-catalog-tab]");
    if (tab) {
      if (state.tab === tab.dataset.chatCatalogTab) return;
      state.tab = tab.dataset.chatCatalogTab;
      picker.querySelectorAll("[data-chat-catalog-tab]").forEach(b =>
        b.setAttribute("aria-pressed",String(b === tab)));
      state.offset = 0;
      void loadPage(picker,client,userId,true);
      return;
    }
    if (event.target.closest("[data-chat-catalog-more]")) {
      void loadPage(picker,client,userId,false);
      return;
    }
    const favorite = event.target.closest("[data-chat-sticker-favorite]");
    if (favorite) {
      event.preventDefault();
      event.stopPropagation();
      if (favorite.disabled) return;
      const id = favorite.dataset.chatStickerFavorite;
      const wasFavorite = state.favoriteIds.has(id);
      favorite.disabled = true;
      try {
        if (id.startsWith("cc0:")) {
          if (wasFavorite) state.favoriteIds.delete(id); else state.favoriteIds.add(id);
          localStorage.setItem(`looply:cc0-sticker-favorites:${userId}`, JSON.stringify([...state.favoriteIds]));
          favorite.setAttribute("aria-pressed",String(!wasFavorite));
          favorite.textContent = wasFavorite ? "☆" : "★";
          if (state.tab === "favorites" && wasFavorite) void loadPage(picker,client,userId,true);
          return;
        }
        const result = wasFavorite
          ? await client.from("sticker_favorites").delete().eq("user_id",userId).eq("sticker_id",id).select("sticker_id").maybeSingle()
          : await client.from("sticker_favorites").insert({user_id:userId,sticker_id:id}).select("sticker_id").maybeSingle();
        if (result.error || result.data?.sticker_id !== id) throw result.error || Error("favorite_not_confirmed");
        if (wasFavorite) state.favoriteIds.delete(id); else state.favoriteIds.add(id);
        favorite.setAttribute("aria-pressed",String(!wasFavorite));
        favorite.textContent = wasFavorite ? "☆" : "★";
        favorite.setAttribute("aria-label",wasFavorite ? "Favoritar figurinha" : "Desfavoritar figurinha");
        if (state.tab === "favorites" && wasFavorite) void loadPage(picker,client,userId,true);
      } catch {
        setStatus(picker,"Não foi possível alterar esta favorita.");
      } finally { favorite.disabled=false; }
      return;
    }
    const send = event.target.closest("[data-chat-sticker-item]");
    if (!send || state.sending) return;
    const sticker = state.rendered.get(send.dataset.chatStickerItem);
    const form = picker.closest("[data-chat-send]");
    const conversationId = form?.dataset.conversationId;
    if (!sticker || !stickerSrc(sticker) || !conversationId ||
      root.querySelector("[data-chat-send]") !== form) return;
    state.sending = true;
    send.disabled = true;
    let newMessageId = null;
    try {
      if (sticker.bundled) {
        const {data:message,error} = await client.from("chat_messages")
          .insert({conversation_id:conversationId,sender_id:userId,body:`[[looply-sticker:${sticker.slug}]]`})
          .select("id").single();
        if (error || !message?.id) throw error || Error("sticker_not_confirmed");
        picker.close();
        root.dispatchEvent(new CustomEvent("looply:chat-message-saved",{detail:{conversationId}}));
        root.dispatchEvent(new CustomEvent("looply:open-conversation",{detail:{conversationId}}));
        return;
      }
      const {data:message,error} = await client.from("chat_messages")
        .insert({conversation_id:conversationId,sender_id:userId,body:"Figurinha"})
        .select("id").single();
      if (error || !message?.id) throw error || Error("message_not_confirmed");
      newMessageId = message.id;
      const saved = await client.from("chat_sticker_messages").insert({
        message_id:message.id,conversation_id:conversationId,
        sticker_id:sticker.id,sender_id:userId
      }).select("message_id").maybeSingle();
      if (saved.error || saved.data?.message_id !== message.id)
        throw saved.error || Error("sticker_not_confirmed");
      picker.close();
      root.dispatchEvent(new CustomEvent("looply:chat-message-saved",{detail:{conversationId}}));
      root.dispatchEvent(new CustomEvent("looply:open-conversation",{detail:{conversationId}}));
    } catch (error) {
      // Remove incomplete placeholder. A failed cleanup is logged, not
      // misrepresented as a successfully delivered sticker.
      if (newMessageId) {
        const removed = await client.from("chat_messages").delete()
          .eq("id",newMessageId).eq("conversation_id",conversationId);
        if (removed.error) console.error("Sticker placeholder cleanup failed", removed.error);
      }
      console.warn("Looply sticker send failed.",error);
      setStatus(picker,"A figurinha não foi enviada. Tente novamente.");
    } finally { state.sending = false; send.disabled = false; }
  });
  root.addEventListener("change",async event=>{
    const pack=event.target.closest("[data-chat-catalog-pack]");
    if(pack) {
      const picker=pack.closest("[data-chat-sticker-picker]");
      if(!picker) return;
      const state=stateFor(picker);
      state.pack=pack.value;
      state.offset=0;
      void loadPage(picker,client,getUserId?.(),true);
      return;
    }
    const input=event.target.closest("[data-chat-sticker-import-files]");
    if (!input) return;
    const picker=input.closest("[data-chat-sticker-picker]");
    const files=Array.from(input.files||[]);
    input.value="";
    if (!picker || !files.length) return;
    const rights=picker.querySelector("[data-chat-sticker-import-rights]");
    if (!rights?.checked) {setStatus(picker,"Confirme que você pode compartilhar as imagens.");return;}
    if (files.length>30) {setStatus(picker,"Selecione até 30 imagens por lote.");return;}
    if (stateFor(picker).importing) return;
    const userId=getUserId?.();
    if (!userId) {setStatus(picker,"Entre na sua conta para importar.");return;}
    await importStickerFiles(picker,files,client,userId);
  });
  root.addEventListener("input", event => {
    const input = event.target.closest("[data-chat-catalog-search]");
    if (!input) return;
    const picker = input.closest("[data-chat-sticker-picker]");
    const state = stateFor(picker);
    clearTimeout(state.timer);
    state.query = input.value.trim().slice(0,60);
    if (state.tab !== "all") return;
    state.timer = setTimeout(() => { state.offset=0;void loadPage(picker,client,getUserId?.(),true); },220);
  });
}
