/* Right Now editor: non-destructive text editing, two-finger scaling, shared Chat stickers. */
(() => {
  "use strict";
  const qs = selector => document.querySelector(selector);
  const STAGE_WIDTH = 420;
  const minSize = (item) => item.type === "sticker-image" ? 42 : item.type === "sticker" ? 25 : 14;
  const maxSize = (item) => item.type === "sticker-image" ? 310 : item.type === "sticker" ? 190 : 140;
  const keepSize = (item, size) => clamp(Math.round(Number(size) || minSize(item)), minSize(item), maxSize(item));
  const COLORS = ["#ffffff","#17151c","#f7d98e","#f98fa5","#b797ff","#99e9cd","#6dbaff","#ff7c55"];
  const imageCache = new Map();
  let selectedPointerEl = null;
  let activePointerGesture = null;
  let lastTap = {id:null,at:0};
  let pickerSequence = 0;
  let catalog = null;
  let stickerState = null;

  // A normalized WebP data URL is self-contained: it survives draft previews,
  // local IndexedDB sessions and export, and never taints the output canvas.
  async function normalizedSticker(blob) {
    if (!(blob instanceof Blob) || !blob.size || blob.size > 12*1024*1024)
      throw Error("Escolha uma imagem de até 12 MB");
    const allowed = ["image/jpeg","image/png","image/webp","image/svg+xml"];
    if (!allowed.includes(blob.type)) throw Error("Selecione PNG, JPG ou WebP");
    const source = URL.createObjectURL(blob);
    let image = new Image();
    try {
      image.src = source;
      await image.decode();
      const ratio = Math.min(1,512/Math.max(image.naturalWidth||1,image.naturalHeight||1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1,Math.round(image.naturalWidth*ratio));
      canvas.height = Math.max(1,Math.round(image.naturalHeight*ratio));
      canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
      const out = await new Promise(resolve => canvas.toBlob(resolve,"image/webp",.91));
      if (!out) throw Error("Não foi possível processar a figurinha");
      return await new Promise((resolve,reject)=>{
        const reader = new FileReader();
        reader.onload=()=>resolve(String(reader.result));
        reader.onerror=()=>reject(Error("Não foi possível preparar a imagem"));
        reader.readAsDataURL(out);
      });
    } finally { URL.revokeObjectURL(source); }
  }
  async function cacheImage(source) {
    if (!source) throw Error("Figurinha indisponível");
    if (imageCache.has(source)) return imageCache.get(source);
    const image = new Image();
    image.src=source;
    await image.decode();
    imageCache.set(source,image);
    return image;
  }
  async function prepareImages(items) {
    for (const item of items || [])
      if (item.type==="sticker-image" && item.imageSrc)
        await cacheImage(item.imageSrc);
  }
  async function addImageSticker(data, title="Figurinha") {
    const src=await normalizedSticker(data);
    await cacheImage(src);
    addOverlay("sticker-image","",{size:100});
    const item=editorItems.at(-1);
    item.imageSrc=src;
    item.title=String(title).slice(0,120);
    selectedId=item.id;
    renderEditorItems();
    showToast("Figurinha adicionada");
  }

  function layerElement(item, editing, scale) {
    const element = document.createElement("div");
    element.className="overlay-item"+
      (item.type==="sticker"||item.type==="sticker-image"?" sticker":"")+
      (item.type==="sticker-image"?" sticker-image":"")+
      (item.type==="question"?" question":"")+
      (editing && item.id===selectedId?" active-item":"");
    if (editing) {
      element.dataset.id=item.id;
      element.tabIndex=0;
      element.setAttribute("role","button");
      element.setAttribute("aria-label",item.type==="sticker-image"?"Editar figurinha":"Editar texto ou elemento");
    }
    element.style.left=clamp(item.x,0,100)+"%";
    element.style.top=clamp(item.y,0,100)+"%";
    element.style.fontSize=keepSize(item,item.size)*scale+"px";
    element.style.color=/^#[0-9a-f]{6}$/i.test(item.color||"")?item.color:"#ffffff";
    element.style.fontFamily=item.font==="serif"?"Playfair Display,Georgia,serif":"Manrope,sans-serif";
    element.style.fontWeight=item.font==="serif"?"500":"800";
    if(item.type==="sticker-image" && item.imageSrc) {
      const img=document.createElement("img");
      img.src=item.imageSrc; img.alt=item.title||"Figurinha";
      img.decoding="async";img.draggable=false;
      element.style.width=(keepSize(item,item.size)*scale)+"px";
      element.append(img);
    } else {
      element.textContent=item.text||"";
    }
    return element;
  }

  function itemById(id) {return editorItems.find(item=>item.id===id)||null;}
  const toolbar=document.createElement("div");
  toolbar.className="wn-layer-tools";
  toolbar.hidden=true;
  toolbar.setAttribute("role","toolbar");
  toolbar.setAttribute("aria-label","Editar elemento selecionado");
  toolbar.innerHTML=
    '<button type="button" data-wn-edit>Editar</button>'+
    '<button type="button" data-wn-shrink class="wn-layer-size" aria-label="Diminuir tamanho">−</button>'+
    '<button type="button" data-wn-grow class="wn-layer-size" aria-label="Aumentar tamanho">＋</button>'+
    '<button type="button" data-wn-color class="wn-layer-color" aria-label="Alterar cor"></button>'+
    '<button type="button" data-wn-delete class="wn-layer-delete">Apagar</button>';
  qs("#editor").append(toolbar);
  function refreshToolbar() {
    const item=itemById(selectedId);
    toolbar.hidden=!item || screen!=="editor" || isDrawing;
    if (!item || toolbar.hidden)return;
    qs("[data-wn-edit]").hidden=!["text","question"].includes(item.type);
    qs("[data-wn-color]").hidden=!["text","question","sticker"].includes(item.type);
    qs("[data-wn-color]").style.background=item.color||"#fff";
    qs("[data-wn-shrink]").disabled=keepSize(item,item.size)<=minSize(item);
    qs("[data-wn-grow]").disabled=keepSize(item,item.size)>=maxSize(item);
  }
  toolbar.querySelector("[data-wn-edit]").onclick=()=>{const item=itemById(selectedId);if(item)openTextTool(item);};
  toolbar.querySelector("[data-wn-delete]").onclick=()=>{
    editorItems=editorItems.filter(item=>item.id!==selectedId);
    selectedId=null;
    renderEditorItems();
  };
  toolbar.querySelector("[data-wn-shrink]").onclick=()=>resizeSelected(.85);
  toolbar.querySelector("[data-wn-grow]").onclick=()=>resizeSelected(1.15);
  toolbar.querySelector("[data-wn-color]").onclick=()=>{
    const item=itemById(selectedId);if(!item)return;
    const idx=COLORS.indexOf(item.color);
    item.color=COLORS[(idx+1)%COLORS.length];
    renderEditorItems();
  };
  function resizeSelected(scale) {
    const item=itemById(selectedId);if(!item)return;
    item.size=keepSize(item,item.size*scale);
    renderEditorItems();
  }
  // Single finger = translation, two fingers = scale + translation.
  function makeDraggable(element,item) {
    const pointers = new Map();
    let originSize=item.size, originDistance=0;
    let delta={x:0,y:0}, activeDrag=false;
    const bounds=()=>qs("#edit-stage").getBoundingClientRect();
    const center=(list)=>{
      if(list.length===1)return list[0];
      return {x:(list[0].x+list[1].x)/2,y:(list[0].y+list[1].y)/2};
    };
    function restartReference() {
      const list=[...pointers.values()];
      if(!list.length)return;
      const b=bounds(), c=center(list);
      originSize=item.size;
      delta={x:c.x-(b.left+item.x/100*b.width),y:c.y-(b.top+item.y/100*b.height)};
      originDistance=list.length>1?Math.hypot(list[0].x-list[1].x,list[0].y-list[1].y):0;
    }
    element.addEventListener("pointerdown",ev=>{
      if(isDrawing||screen!=="editor")return;
      ev.preventDefault();ev.stopPropagation();
      selectedId=item.id;
      selectedPointerEl=element;
      qs("#edit-overlays").querySelectorAll(".active-item").forEach(el=>el.classList.remove("active-item"));
      element.classList.add("active-item");
      pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
      try{element.setPointerCapture(ev.pointerId)}catch{}
      if(pointers.size<=2)restartReference();
      activeDrag=false;
      activePointerGesture={
        element, pointers, externalIds:new Set(),
        add(event){
          pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
          this.externalIds.add(event.pointerId);
          try{qs("#edit-stage").setPointerCapture(event.pointerId)}catch{}
          restartReference();
        },
        move:event=>movePointer(event),
        end:event=>finish(event),
      };
      refreshToolbar();
    });
    const movePointer=ev=>{
      if(!pointers.has(ev.pointerId))return;
      ev.preventDefault();
      pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
      const list=[...pointers.values()].slice(0,2),c=center(list),b=bounds();
      const posX=clamp((c.x-b.left-delta.x)/b.width*100,5,95);
      const posY=clamp((c.y-b.top-delta.y)/b.height*100,6,94);
      if(Math.abs(item.x-posX)+Math.abs(item.y-posY)>.2)activeDrag=true;
      item.x=posX;item.y=posY;
      element.style.left=posX+"%";element.style.top=posY+"%";
      if(list.length>1&&originDistance>10) {
        const distance=Math.hypot(list[0].x-list[1].x,list[0].y-list[1].y);
        item.size=keepSize(item,originSize*distance/originDistance);
        const scale=b.width/STAGE_WIDTH;
        element.style.fontSize=item.size*scale+"px";
        if(item.type==="sticker-image")element.style.width=item.size*scale+"px";
        activeDrag=true;
      }
    };
    element.addEventListener("pointermove",movePointer);
    const finish=ev=>{
      if(!pointers.has(ev.pointerId))return;
      pointers.delete(ev.pointerId);
      if(!pointers.size){
        const now=performance.now();
        const openEdit=ev.type==="pointerup"&&!activeDrag&&
          ["text","question"].includes(item.type)&&lastTap.id===item.id&&now-lastTap.at<375;
        if(!activeDrag)lastTap={id:item.id,at:now};
        selectedPointerEl=null;
        activePointerGesture=null;
        renderEditorItems();
        if(openEdit)openTextTool(item);
      } else restartReference();
    };
    element.addEventListener("pointerup",finish);
    element.addEventListener("pointercancel",finish);
    element.addEventListener("dblclick",ev=>{ev.preventDefault();if(["text","question"].includes(item.type))openTextTool(item);});
    element.addEventListener("keydown",ev=>{
      if(ev.key==="Enter"&&["text","question"].includes(item.type)){ev.preventDefault();openTextTool(item);}
      if(ev.key==="Delete"||ev.key==="Backspace"){
        ev.preventDefault();editorItems=editorItems.filter(x=>x.id!==item.id);selectedId=null;renderEditorItems();
      }
      const moves={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
      if(moves[ev.key]){
        ev.preventDefault();item.x=clamp(item.x+moves[ev.key][0],5,95);
        item.y=clamp(item.y+moves[ev.key][1],6,94);renderEditorItems();
      }
    });
  }

  renderEditorItems=function(){
    const root=qs("#edit-overlays"),b=qs("#edit-stage").getBoundingClientRect();
    root.replaceChildren();
    const scale=(b.width||STAGE_WIDTH)/STAGE_WIDTH;
    for(const item of editorItems){
      const el=layerElement(item,true,scale);
      makeDraggable(el,item);
      root.append(el);
    }
    refreshToolbar();
  };
  const oldScreen=showScreen;
  showScreen=function(next){oldScreen(next);refreshToolbar();};
  const touchStage=qs("#edit-stage");
  // A second finger may land OUTSIDE a small text label. Capture it on the
  // editing stage, so pinch-to-scale still works for 14px text and tiny stickers.
  touchStage.addEventListener("pointerdown",ev=>{
    const gesture=activePointerGesture;
    if(!gesture||ev.pointerType!=="touch"||gesture.pointers.has(ev.pointerId))return;
    if(gesture.pointers.size>=2)return;
    ev.preventDefault();ev.stopPropagation();
    gesture.add(ev);
  },true);
  touchStage.addEventListener("pointermove",ev=>{
    const gesture=activePointerGesture;
    if(!gesture?.externalIds.has(ev.pointerId))return;
    gesture.move(ev);
  },true);
  for(const type of ["pointerup","pointercancel"]){
    touchStage.addEventListener(type,ev=>{
      const gesture=activePointerGesture;
      if(!gesture?.externalIds.has(ev.pointerId))return;
      gesture.externalIds.delete(ev.pointerId);
      gesture.end(ev);
    },true);
  }
  touchStage.addEventListener("pointerdown",ev=>{
    if(!activePointerGesture &&
      (ev.target===qs("#edit-overlays")||ev.target===touchStage)){
      selectedId=null;renderEditorItems();
    }
  });
  window.addEventListener("resize",()=>{if(screen==="editor")renderEditorItems();});

  const oldEnterEditor=enterEditor;
  enterEditor=function(item){oldEnterEditor(item);selectedId=null;renderEditorItems();};

  // Edit existing text, not just delete it. Preserve the original styling palette.
  openTextTool=function(existing=null){
    const isEdit=Boolean(existing&&editorItems.some(i=>i.id===existing.id));
    const item=isEdit?existing:null;
    const kind=item?.type==="question"?"question":"text";
    const startingFont=item?.font==="serif"?"serif":"sans";
    const startingColor=COLORS.includes(item?.color)?item.color:"#ffffff";
    const startingSize=item?keepSize(item,item.size):30;
    sheetOpen('<div class="wn-text-picker"><h2 class="sheet-title">'+(isEdit?"Editar texto":"Texto")+'</h2>'+
      '<textarea class="sheet-input" id="wn-text-value" maxlength="180" aria-label="Texto"></textarea>'+
      '<div class="font-examples"><button type="button" id="wn-font-sans">Aa</button><button type="button" id="wn-font-serif" style="font-family:Georgia">Aa</button></div>'+
      '<span class="sheet-label">Cor</span><div class="palette" id="wn-text-palette"></div>'+
      '<span class="sheet-label">Tamanho <output id="wn-text-size-output"></output></span>'+
      '<input type="range" class="slider" id="wn-text-size" min="14" max="140" value="'+startingSize+'" aria-label="Tamanho do texto">'+
      '<div id="wn-text-preview" class="wn-text-preview" aria-live="polite"></div>'+
      '<div class="wn-text-picker-actions"><button class="btn ghost" type="button" id="wn-text-cancel">Cancelar</button>'+
      '<button class="btn dark" type="button" id="wn-text-save">'+(isEdit?"Salvar":"Adicionar")+'</button></div></div>');
    const input=qs("#wn-text-value"),preview=qs("#wn-text-preview"),sizeInput=qs("#wn-text-size");
    input.value=item?.text||"";
    let font=startingFont,color=startingColor;
    const paint=()=>{
      preview.textContent=input.value||"Aa";
      preview.style.color=color;
      preview.style.fontFamily=font==="serif"?"Georgia,serif":"Manrope,sans-serif";
      preview.style.fontSize=Math.min(40,Number(sizeInput.value))+"px";
      qs("#wn-text-size-output").textContent=sizeInput.value;
      qs("#wn-font-sans").classList.toggle("on",font==="sans");
      qs("#wn-font-serif").classList.toggle("on",font==="serif");
      qs("#wn-text-palette").querySelectorAll("button").forEach(el=>el.classList.toggle("on",el.dataset.color===color));
    };
    qs("#wn-font-sans").onclick=()=>{font="sans";paint();};
    qs("#wn-font-serif").onclick=()=>{font="serif";paint();};
    const palette=qs("#wn-text-palette");
    for(const value of COLORS){
      const button=document.createElement("button");
      button.type="button";button.dataset.color=value;
      button.style.backgroundColor=value;button.setAttribute("aria-label","Cor "+value);
      button.onclick=()=>{color=value;paint();};palette.append(button);
    }
    input.addEventListener("input",paint);
    sizeInput.addEventListener("input",paint);
    qs("#wn-text-cancel").onclick=()=>sheetClose();
    qs("#wn-text-save").onclick=()=>{
      const value=input.value.trim();
      if(!value){showToast("Digite o texto");return;}
      if(isEdit){
        item.text=value;item.color=color;item.font=font;item.size=keepSize(item,sizeInput.value);
        selectedId=item.id;renderEditorItems();
      }else{
        addOverlay(kind,value,{size:Number(sizeInput.value),color,font});
      }
      sheetClose();
    };
    paint();
    setTimeout(()=>{if(qs("#wn-text-value")?.isConnected)qs("#wn-text-value").focus();},330);
  };
  qs("#tool-text").onclick=()=>openTextTool();

  // Retain legacy emoji and question stickers, but use the exact Chat catalog
  // definitions and saved remote favorite records for image stickers.
  const EMOJIS=["✳️","💗","✨","🌙","💭","🫶","🎞️","🌸","🪩","🤍","🦋","💌","🌷","⭐","☀️","🔥","🫧","🌊","🍒","🎀"];
  async function catalogModule(){
    if(!catalog)catalog=await import(new URL("src/chat-sticker-catalog.js",document.baseURI).href);
    return catalog;
  }
  function catalogStatus(text){
    const el=qs("#wn-sticker-status");if(el)el.textContent=text;
  }
  function renderStickerRows(rows,append){
    const grid=qs("#wn-sticker-grid");if(!grid)return;
    if(!append)grid.replaceChildren();
    for(const row of rows){
      if(!row.src||grid.querySelector('[data-wn-sticker-id="'+CSS.escape(row.id)+'"]'))continue;
      const cell=document.createElement("div");cell.className="chat-catalog-item";
      const select=document.createElement("button");
      select.type="button";select.dataset.wnStickerId=row.id;select.title=row.title||"Figurinha";
      select.setAttribute("aria-label","Adicionar "+(row.title||"figurinha"));
      const image=document.createElement("img");image.src=row.src;image.alt=row.title||"Figurinha";
      image.loading="lazy";image.decoding="async";
      select.append(image);
      const favorite=document.createElement("button");favorite.type="button";
      favorite.className="chat-catalog-favorite";
      favorite.dataset.wnFavoriteId=row.id;
      const isFavorite=stickerState.favorites.has(row.id);
      favorite.textContent=isFavorite?"★":"☆";
      favorite.setAttribute("aria-label",(isFavorite?"Desfavoritar ":"Favoritar ")+(row.title||"figurinha"));
      favorite.setAttribute("aria-pressed",String(isFavorite));
      cell.append(select,favorite);
      grid.append(cell);
      stickerState.entries.set(row.id,row);
    }
    if(!grid.childElementCount)catalogStatus("Nenhuma figurinha encontrada.");
  }
  function filteredLocal(){
    const state=stickerState;
    return state.local.filter(row=>
      (state.pack===""||state.pack==="cc0") &&
      (state.tab!=="favorites"||state.favorites.has(row.id)) &&
      (!state.query||row.title.toLocaleLowerCase("pt-BR").includes(state.query.toLocaleLowerCase("pt-BR"))));
  }
  async function loadStickerPage(reset=true){
    const state=stickerState;if(!state)return;
    const number=++pickerSequence;
    if(reset){state.offset=0;state.entries.clear();renderStickerRows(filteredLocal(),false);}
    const bridge=window.whyNowStickerBridge;
    if(typeof bridge!=="function"||state.pack==="cc0"){
      catalogStatus(qs("#wn-sticker-grid")?.childElementCount?"":"Nenhuma outra figurinha.");
      qs("#wn-sticker-more").hidden=true;
      return;
    }
    catalogStatus("Carregando figurinhas…");
    try{
      const result=await bridge("sticker-page",{
        tab:state.tab,pack:state.pack,query:state.query,offset:state.offset
      });
      if(number!==pickerSequence||stickerState!==state||!qs("#wn-sticker-grid"))return;
      const rows=(result.items||[]).filter(row=>
        typeof row.id==="string"&&typeof row.src==="string"&&
        (/^https:\/\//i.test(row.src)||/^assets\//.test(row.src)||row.src.startsWith(location.origin)));
      renderStickerRows(rows,true);
      state.offset=result.nextOffset||state.offset+rows.length;
      qs("#wn-sticker-more").hidden=!result.hasMore;
      catalogStatus(qs("#wn-sticker-grid")?.childElementCount?"":"Nenhuma figurinha disponível.");
    }catch(error){
      console.warn("[Right Now stickers]",error);
      catalogStatus("O catálogo não pôde ser carregado. Tente novamente.");
      qs("#wn-sticker-more").hidden=true;
    }
  }
  function saveLocalFavorites(){
    const id=window.whyNowStickerCurrentUser?.()||"local";
    const saved=[...stickerState.favorites].filter(value=>value.startsWith("cc0:"));
    localStorage.setItem("looply:cc0-sticker-favorites:"+id,JSON.stringify(saved));
  }
  async function onStickerPicker(event){
    const state=stickerState;if(!state)return;
    const tab=event.target.closest("[data-chat-catalog-tab]");
    if(tab){
      state.tab=tab.dataset.chatCatalogTab;
      qs("#sheet").querySelectorAll("[data-chat-catalog-tab]").forEach(b=>b.setAttribute("aria-pressed",String(b===tab)));
      await loadStickerPage(true);return;
    }
    const favorite=event.target.closest("[data-wn-favorite-id]");
    if(favorite){
      const id=favorite.dataset.wnFavoriteId;
      const was=state.favorites.has(id);
      favorite.disabled=true;
      try{
        if(!id.startsWith("cc0:")){
          if(!window.whyNowStickerBridge)throw Error("Entre na conta para favoritar");
          await window.whyNowStickerBridge("sticker-favorite",{id,favorite:!was});
        }
        if(was)state.favorites.delete(id);else state.favorites.add(id);
        if(id.startsWith("cc0:"))saveLocalFavorites();
        favorite.textContent=was?"☆":"★";
        favorite.setAttribute("aria-pressed",String(!was));
        if(state.tab==="favorites")await loadStickerPage(true);
      }catch(error){showToast("Não foi possível alterar a favorita");console.warn(error);}
      finally{if(favorite.isConnected)favorite.disabled=false;}
      return;
    }
    const chosen=event.target.closest("[data-wn-sticker-id]");
    if(chosen){
      const row=state.entries.get(chosen.dataset.wnStickerId);
      if(!row)return;
      chosen.disabled=true;
      try{
        // Chat catalog WebP files are on R2. The preview <img> can display a
        // signed URL, but browser fetch() cannot read it without R2 CORS.
        // Read authenticated bytes through the parent Neon storage gateway.
        let stickerBlob;
        if(row.id.startsWith("cc0:")){
          const asset=await fetch(row.src,{cache:"no-store",credentials:"omit"});
          if(!asset.ok)throw Error("sticker_local_asset_"+asset.status);
          stickerBlob=await asset.blob();
        }else{
          if(typeof window.whyNowStickerBridge!=="function")
            throw Error("sticker_session_required");
          const payload=await window.whyNowStickerBridge("sticker-image",{id:row.id});
          stickerBlob=payload?.blob;
        }
        if(!(stickerBlob instanceof Blob)||!stickerBlob.size)
          throw Error("sticker_empty_response");
        await addImageSticker(stickerBlob,row.title);
        stickerState=null;sheetClose();
      }catch(error){
        console.warn("[Right Now sticker image]",error);
        showToast("A figurinha não pôde ser adicionada. Tente outra.");
      }finally{if(chosen.isConnected)chosen.disabled=false;}
      return;
    }
    if(event.target.closest("#wn-sticker-more"))await loadStickerPage(false);
  }
  async function openStickerPicker(){
    ++pickerSequence;
    sheetOpen('<div class="wn-sticker-picker"><h2 class="sheet-title">Figurinhas</h2>'+
      '<div id="wn-sticker-loading">Carregando…</div></div>');
    try{
      const module=await catalogModule();
      if(!qs("#wn-sticker-loading"))return;
      const userId=window.whyNowStickerCurrentUser?.()||"local";
      let localFavorites=[];
      try{localFavorites=JSON.parse(localStorage.getItem("looply:cc0-sticker-favorites:"+userId)||"[]");}catch{}
      stickerState={tab:"all",pack:"",query:"",offset:0,entries:new Map(),
        local:module.CC0_STICKERS.map(row=>({...row,src:new URL(row.asset_path,document.baseURI).href})),
        favorites:new Set(Array.isArray(localFavorites)?localFavorites.filter(id=>/^cc0:[a-z0-9-]+$/.test(id)):[])};
      const area=qs("#wn-sticker-loading");
      area.outerHTML=module.stickerCatalogMarkup()
        .replace('id="chatStickerCatalogPack"','id="wnStickerCatalogPack"')
        .replace('id="chatStickerCatalogSearch"','id="wnStickerCatalogSearch"')
        .replace('for="chatStickerCatalogPack"','for="wnStickerCatalogPack"')
        .replace('for="chatStickerCatalogSearch"','for="wnStickerCatalogSearch"')
        .replace('data-chat-catalog-grid','id="wn-sticker-grid" data-chat-catalog-grid')
        .replace('data-chat-catalog-status','id="wn-sticker-status" data-chat-catalog-status')
        .replace('data-chat-catalog-more','id="wn-sticker-more" data-chat-catalog-more')+
        '<button type="button" class="wn-sticker-import" id="wn-import-image">Usar imagem do aparelho</button>'+
        '<input type="file" accept="image/png,image/jpeg,image/webp" id="wn-import-file" hidden>'+
        '<button class="btn ghost" style="margin-top:10px;width:100%" id="wn-stickers-close">Fechar</button>';
      const sheet=qs("#sheet .wn-sticker-picker");
      sheet.addEventListener("click",event=>{void onStickerPicker(event);});
      qs("#wn-stickers-close").onclick=()=>{stickerState=null;sheetClose();};
      qs("#wn-import-image").onclick=()=>qs("#wn-import-file").click();
      qs("#wn-import-file").onchange=async event=>{
        const file=event.target.files?.[0];event.target.value="";
        if(!file)return;
        try{await addImageSticker(file,"Figurinha do aparelho");stickerState=null;sheetClose();}
        catch(error){showToast(error.message||"Imagem indisponível");}
      };
      let debounce=0;
      const change=()=>{
        stickerState.pack=qs("#wnStickerCatalogPack").value;
        stickerState.query=qs("#wnStickerCatalogSearch").value.trim().slice(0,60);
        clearTimeout(debounce);debounce=setTimeout(()=>void loadStickerPage(true),220);
      };
      qs("#wnStickerCatalogPack").addEventListener("change",change);
      qs("#wnStickerCatalogSearch").addEventListener("input",change);
      await loadStickerPage(true);
      if(typeof window.whyNowStickerBridge==="function"){
        const response=await window.whyNowStickerBridge("sticker-metadata",{}).catch(err=>{
          console.warn("[Right Now stickers] metadata",err);return null;
        });
        if(!qs("#wnStickerCatalogPack")||!stickerState)return;
        if(response){
          for(const id of response.favorites||[])stickerState.favorites.add(id);
          const select=qs("#wnStickerCatalogPack");
          for(const name of response.packs||[]){
            if(typeof name!=="string"||name.length>80)continue;
            const option=document.createElement("option");
            option.value=name;option.textContent=name;select.append(option);
          }
          await loadStickerPage(true);
        }
      }
    }catch(error){console.error(error);showToast("Não foi possível abrir as figurinhas");}
  }
  qs("#tool-sticker").onclick=()=>void openStickerPicker();

  // Keep original question sticker accessible through the same editor, without
  // forcing the chat catalog to pretend that emojis are stored images.
  const existingOptions=qs("#tool-options");
  const previousOptions=existingOptions.onclick;
  existingOptions.onclick=()=>{
    previousOptions?.();
    const b=document.createElement("button");
    b.className="option-card";b.type="button";
    b.innerHTML='<span><strong>Adicionar pergunta</strong></span>';
    b.onclick=()=>{
      sheetOpen('<h2 class="sheet-title">Pergunta</h2><input class="sheet-input" id="wn-question-value" maxlength="100" placeholder="Escreva uma pergunta">'+
        '<button class="btn dark" id="wn-question-add" style="margin-top:14px;width:100%">Adicionar</button>');
      qs("#wn-question-add").onclick=()=>{
        const value=qs("#wn-question-value").value.trim();
        if(!value)return showToast("Digite a pergunta");
        addOverlay("question",value,{size:16});
        sheetClose();
      };
    };
    qs("#sheet-body").append(b);
  };

  const defaultDraw=drawItemsOnCanvas;
  drawItemsOnCanvas=function(ctx,items,w,h){
    for(const item of items||[]){
      if(item.type!=="sticker-image"){defaultDraw(ctx,[item],w,h);continue;}
      const image=imageCache.get(item.imageSrc);
      if(!image||!image.naturalWidth)continue;
      const measure=keepSize(item,item.size)*(w/STAGE_WIDTH);
      const factor=measure/Math.max(image.naturalWidth,image.naturalHeight);
      const iw=image.naturalWidth*factor,ih=image.naturalHeight*factor;
      ctx.save();
      ctx.shadowColor="#0006";ctx.shadowBlur=10*w/420;
      ctx.drawImage(image,item.x/100*w-iw/2,item.y/100*h-ih/2,iw,ih);
      ctx.restore();
    }
  };
  const oldView=renderViewElements;
  renderViewElements=function(item){
    const root=qs("#view-overlays"),b=qs("#view-frame").getBoundingClientRect();
    root.replaceChildren();
    for(const entry of item.items||[])root.append(layerElement(entry,false,(b.width||STAGE_WIDTH)/STAGE_WIDTH));
    const canvas=qs("#view-draw-canvas");
    canvas.width=Math.round(b.width*Math.min(window.devicePixelRatio||1,2));
    canvas.height=Math.round(b.height*Math.min(window.devicePixelRatio||1,2));
    redrawStrokes(canvas,item.strokes||[]);
    // Old viewer overlays deliberately stay pointer-inert.
  };
  const rawPhoto=exportPhotoBlob;
  exportPhotoBlob=async function(){await prepareImages(editorItems);return rawPhoto();};
  const rawMoment=exportMomentImage;
  exportMomentImage=async function(item){await prepareImages(item?.items);return rawMoment(item);};
  const rawVideo=exportEditedVideo;
  exportEditedVideo=async function(item){
    await prepareImages(item?.items);
    const output=await rawVideo(item);
    if(item?.items?.length && output===item.blob)
      throw Error("Não foi possível incorporar as edições ao vídeo neste dispositivo.");
    return output;
  };
  const rawMusic=wnExportWithMusic;
  wnExportWithMusic=async function(item){await prepareImages(item?.items);return rawMusic(item);};
  window.addEventListener("pagehide",()=>{stickerState=null;imageCache.clear();});
})();
