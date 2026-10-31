import { prepareAvatarSource, avatarPreviewFromBitmap } from "./avatar-image-processing.js";
import { saveNeonAvatarOnly } from "./neon-avatar-profile.js";
import { icon } from "./icons.js";

export const AVATAR_OUTPUT_SIZE=512;
export const AVATAR_MAX_ZOOM=3.5;
export const bound=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));

export function avatarCropLayout(width,height,zoom=1,rotation=0,x=0,y=0){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error("avatar-dimensions-invalid");
  const angle=((Math.round(rotation/90)*90)%360+360)%360;
  const turned=angle===90||angle===270;
  const rw=turned?height:width,rh=turned?width:height;
  const z=bound(Number(zoom),1,AVATAR_MAX_ZOOM);
  const scale=Math.max(AVATAR_OUTPUT_SIZE/rw,AVATAR_OUTPUT_SIZE/rh)*z;
  const maxX=Math.max(0,(rw*scale-AVATAR_OUTPUT_SIZE)/2);
  const maxY=Math.max(0,(rh*scale-AVATAR_OUTPUT_SIZE)/2);
  return {width,height,rotation:angle,zoom:z,scale,
    x:bound(Number(x),-maxX,maxX),y:bound(Number(y),-maxY,maxY),
    maxX,maxY};
}

export function paintAvatarSquare(canvas,bitmap,layout){
  const size=canvas.width;
  if(!size||canvas.height!==size)throw Error("avatar-canvas-invalid");
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw Error("avatar-canvas-unavailable");
  ctx.save();
  ctx.fillStyle="#fff";ctx.fillRect(0,0,size,size);
  ctx.translate(size/2+layout.x*size/AVATAR_OUTPUT_SIZE,size/2+layout.y*size/AVATAR_OUTPUT_SIZE);
  ctx.rotate(layout.rotation*Math.PI/180);
  const scale=layout.scale*size/AVATAR_OUTPUT_SIZE;
  ctx.scale(scale,scale);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2,bitmap.width,bitmap.height);
  ctx.restore();
}

const blobFromCanvas=canvas=>new Promise((resolve,reject)=>{
  canvas.toBlob(blob=>blob?.size?resolve(blob):reject(Error("avatar-decode-failed")),"image/jpeg",.91);
});

export function mountProfileAvatarEditor({root,client,userId,onSaved,onStatus=()=>{},onSaving=()=>{}}){
  const host=document.createElement("div");
  host.className="pr-avatar-host";
  host.innerHTML=`<dialog class="pr-avatar-menu" data-avatar-menu aria-labelledby="prAvatarMenuTitle">
    <div class="pr-avatar-menu-body"><h2 id="prAvatarMenuTitle">Alterar foto de perfil</h2>
    <p>Escolha de onde deseja obter sua foto.</p>
    <button type="button" data-avatar-pick="gallery">${icon("image")} <span>Escolher da galeria</span></button>
    <button type="button" data-avatar-pick="camera">${icon("camera")} <span>Tirar foto</span></button>
    <button type="button" data-avatar-cancel>Cancelar</button></div>
  </dialog>
  <input data-avatar-source="gallery" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" hidden aria-label="Escolher foto da galeria">
  <input data-avatar-source="camera" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" capture="user" hidden aria-label="Tirar foto com a câmera">
  <dialog class="pr-avatar-crop" data-avatar-crop aria-labelledby="prAvatarCropTitle">
    <div class="pr-avatar-crop-shell">
      <header class="pr-avatar-crop-heading">
        <button type="button" data-avatar-back aria-label="Voltar para escolha de foto">${icon("back")}</button>
        <h2 id="prAvatarCropTitle">Editar foto de perfil</h2>
        <button type="button" data-avatar-confirm class="pr-avatar-done">Concluir</button>
      </header>
      <div class="pr-avatar-crop-content">
        <p class="pr-avatar-hint">Arraste para enquadrar. Use dois dedos para ampliar.</p>
        <div class="pr-avatar-stage" data-avatar-stage tabindex="0" role="group" aria-label="Arraste ou use as setas para reposicionar a foto">
          <img data-avatar-image alt="" draggable="false">
          <div class="pr-avatar-grid" aria-hidden="true"></div>
          <div class="pr-avatar-circle" aria-hidden="true"></div>
        </div>
        <div class="pr-avatar-preview">
          <canvas width="128" height="128" data-avatar-preview role="img" aria-label="Prévia circular da foto de perfil"></canvas>
          <div><strong>Prévia do perfil</strong><small>Recorte quadrado 1:1 · 512 × 512 px</small></div>
        </div>
        <label class="pr-avatar-zoom" for="prAvatarZoom"><span>Zoom</span>
          <input id="prAvatarZoom" type="range" min="1" max="${AVATAR_MAX_ZOOM}" step=".01" value="1" data-avatar-zoom>
        </label>
        <div class="pr-avatar-tools">
          <button type="button" data-avatar-reset>${icon("refresh")} Redefinir</button>
          <button type="button" data-avatar-rotate>${icon("rotateRight")} Girar 90°</button>
        </div>
        <p role="status" aria-live="polite" data-avatar-status class="pr-avatar-editor-status"></p>
      </div>
    </div>
  </dialog>`;
  root.append(host);
  const $=selector=>host.querySelector(selector);
  const menu=$("[data-avatar-menu]"),dialog=$("[data-avatar-crop]"),stage=$("[data-avatar-stage]");
  const image=$("[data-avatar-image]"),preview=$("[data-avatar-preview]"),zoomControl=$("[data-avatar-zoom]");
  const status=$("[data-avatar-status]"),done=$("[data-avatar-confirm]");
  let bitmap=null,url="",state=null,drag=null,request=0,working=false,disposed=false,frame=0;
  const activePointers=new Map();
  const clear=()=>{
    if(frame)cancelAnimationFrame(frame);frame=0;
    activePointers.clear();drag=null;
    bitmap?.close?.();bitmap=null;state=null;
    if(url)URL.revokeObjectURL(url);url="";
    image.removeAttribute("src");
    for(const file of host.querySelectorAll("[data-avatar-source]"))file.value="";
  };
  const hide=()=>{
    if(working)return;
    ++request;
    if(dialog.open)dialog.close();
    if(menu.open)menu.close();
    clear();
  };
  const update=()=>{
    if(!bitmap||!state)return;
    state=avatarCropLayout(bitmap.width,bitmap.height,state.zoom,state.rotation,state.x,state.y);
    zoomControl.value=String(state.zoom);
    const ratio=(stage.clientWidth||280)/AVATAR_OUTPUT_SIZE;
    image.style.width=state.width*state.scale*ratio+"px";
    image.style.height=state.height*state.scale*ratio+"px";
    image.style.transform=`translate(-50%,-50%) translate(${state.x*ratio}px,${state.y*ratio}px) rotate(${state.rotation}deg)`;
    if(!frame)frame=requestAnimationFrame(()=>{
      frame=0;if(bitmap&&state)paintAvatarSquare(preview,bitmap,state);
    });
  };
  async function choose(file){
    if(!file||working||disposed)return;
    const current=++request;
    status.textContent="Preparando fotografia…";
    let source=null,newUrl="";
    try{
      source=await prepareAvatarSource(file);
      const previewBlob=await avatarPreviewFromBitmap(source.bitmap);
      if(disposed||current!==request){source.bitmap.close();return;}
      newUrl=URL.createObjectURL(previewBlob);
      clear();
      bitmap=source.bitmap;url=newUrl;
      state=avatarCropLayout(bitmap.width,bitmap.height);
      image.src=url;
      status.textContent="";
      if(menu.open)menu.close();
      dialog.showModal();
      update();
      stage.focus({preventScroll:true});
    }catch(error){
      source?.bitmap?.close?.();
      if(newUrl)URL.revokeObjectURL(newUrl);
      status.textContent=error?.message==="avatar-file-invalid"?
        "Escolha uma fotografia JPEG, PNG, WebP ou HEIC válida (até 35 MB).":
        "Não foi possível abrir esta imagem. Selecione outra foto.";
      if(!dialog.open){menu.showModal();onStatus(status.textContent);}
    }
  }
  const start=()=>{if(!working&&!disposed&&!menu.open&&!dialog.open)menu.showModal();};
  const onClick=event=>{
    const item=event.target.closest("[data-avatar-pick]");
    if(item){const input=$('[data-avatar-source="'+item.dataset.avatarPick+'"]');input?.click();return;}
    if(event.target.closest("[data-avatar-cancel]")){hide();return;}
    if(event.target.closest("[data-avatar-back]")){hide();start();return;}
    if(event.target.closest("[data-avatar-reset]")){
      if(bitmap){state=avatarCropLayout(bitmap.width,bitmap.height);update();}
      return;
    }
    if(event.target.closest("[data-avatar-rotate]")){
      if(bitmap){state={...state,rotation:(state.rotation+90)%360,x:0,y:0};update();}
      return;
    }
    if(event.target.closest("[data-avatar-confirm]"))void save();
  };
  const save=async()=>{
    if(!bitmap||!state||working||disposed)return;
    working=true;onSaving(true);done.disabled=true;status.textContent="Salvando foto de perfil…";
    try{
      const canvas=document.createElement("canvas");canvas.width=canvas.height=AVATAR_OUTPUT_SIZE;
      paintAvatarSquare(canvas,bitmap,state);
      const jpeg=await blobFromCanvas(canvas);
      const file=new File([jpeg],"avatar-looply.jpg",{type:"image/jpeg",lastModified:Date.now()});
      const session=await client.auth.getSession();
      if(session.error||!session.data?.session)throw Object.assign(Error("Session required"),{status:401});
      const saved=await saveNeonAvatarOnly({
        profileId:userId,session:session.data.session,dataApiUrl:client.dataApiUrl,
        storage:client.storage,avatarFile:file
      });
      if(!saved.avatarUrl||saved.profile?.avatar_path!==saved.avatarPath)throw Error("avatar-save-unconfirmed");
      await onSaved(saved);
      working=false;hide();
      onStatus("Foto de perfil atualizada.");
    }catch(error){
      status.textContent=error?.status===401?"Sua sessão expirou. Entre novamente.":
        error?.status===403?"Não foi possível autorizar esta foto.":
        "Não foi possível salvar. A foto antiga foi preservada. Tente novamente.";
    }finally{working=false;onSaving(false);done.disabled=false;}
  };
  host.addEventListener("click",onClick);
  for(const input of host.querySelectorAll("[data-avatar-source]"))
    input.addEventListener("change",()=>{const file=input.files?.[0];if(file)void choose(file);});
  for(const element of [menu,dialog]){
    element.addEventListener("cancel",event=>{event.preventDefault();hide();});
    element.addEventListener("click",event=>{if(event.target===element)hide();});
  }
  zoomControl.addEventListener("input",()=>{if(!bitmap||working)return;state.zoom=Number(zoomControl.value);update();});
  stage.addEventListener("wheel",event=>{
    if(!bitmap||working)return;
    event.preventDefault();state.zoom=bound(state.zoom+(event.deltaY>0?-.12:.12),1,AVATAR_MAX_ZOOM);update();
  },{passive:false});
  const point=event=>({x:event.clientX,y:event.clientY});
  const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)||1;
  const restart=()=>{
    const points=[...activePointers.values()];
    if(points.length===1){drag={x:points[0].x,y:points[0].y,ox:state.x,oy:state.y,zoom:state.zoom};}
    else if(points.length>=2){drag={distance:length(points[0],points[1]),zoom:state.zoom,
      x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2,ox:state.x,oy:state.y};}
    else drag=null;
  };
  stage.addEventListener("pointerdown",event=>{
    if(!bitmap||working||event.pointerType==="mouse"&&event.button!==0)return;
    event.preventDefault();stage.setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId,point(event));restart();
  });
  stage.addEventListener("pointermove",event=>{
    if(!activePointers.has(event.pointerId)||!drag||!bitmap||working)return;
    activePointers.set(event.pointerId,point(event));
    const points=[...activePointers.values()],ratio=AVATAR_OUTPUT_SIZE/(stage.clientWidth||280);
    if(points.length===1){
      state.x=drag.ox+(points[0].x-drag.x)*ratio;
      state.y=drag.oy+(points[0].y-drag.y)*ratio;
    }else if(points.length>=2){
      state.zoom=bound(drag.zoom*length(points[0],points[1])/drag.distance,1,AVATAR_MAX_ZOOM);
      state.x=drag.ox+((points[0].x+points[1].x)/2-drag.x)*ratio;
      state.y=drag.oy+((points[0].y+points[1].y)/2-drag.y)*ratio;
    }
    update();
  });
  for(const type of ["pointerup","pointercancel","lostpointercapture"])
    stage.addEventListener(type,event=>{if(activePointers.delete(event.pointerId))restart();});
  stage.addEventListener("keydown",event=>{
    const dirs={ArrowUp:[0,-12],ArrowDown:[0,12],ArrowLeft:[-12,0],ArrowRight:[12,0]};
    if(!bitmap||working||!dirs[event.key])return;
    event.preventDefault();
    state.x+=dirs[event.key][0];state.y+=dirs[event.key][1];update();
  });
  return {open:start,dispose(){
    disposed=true;++request;working=false;
    if(menu.open)menu.close();if(dialog.open)dialog.close();
    clear();host.remove();
  }};
}
