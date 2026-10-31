// Non-destructive crop editor; the existing authenticated upload path is unchanged.
export async function editGroupCover(file) {
  if (!(file instanceof File) || !["image/jpeg","image/png","image/webp"].includes(file.type) ||
      file.size < 1 || file.size > 10 * 1024 * 1024) throw Error("invalid_group_cover");
  const url=URL.createObjectURL(file);
  const image=new Image();
  image.src=url;
  try { await image.decode(); } catch { URL.revokeObjectURL(url); throw Error("invalid_group_cover"); }
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width||!height){URL.revokeObjectURL(url);throw Error("invalid_group_cover");}
  const size=280, base=Math.max(size/width,size/height);
  let zoom=1,dx=0,dy=0,drag=null,finished=false;
  const dialog=document.createElement("dialog");
  dialog.className="looply-group-cover-editor";
  dialog.setAttribute("aria-label","Editar foto do grupo");
  dialog.innerHTML='<section class="group-cover-editor-card">'+
    '<h2>Foto do grupo</h2><p>Arraste para enquadrar e use o zoom para ampliar.</p>'+
    '<div class="group-cover-editor-stage" role="img" aria-label="Prévia do recorte quadrado">'+
    '<img alt="Prévia da foto do grupo"></div>'+
    '<label>Zoom <input type="range" min="1" max="3" step="0.01" value="1" aria-label="Ampliar imagem"></label>'+
    '<div class="group-cover-editor-actions"><button type="button" data-cover-cancel>Cancelar</button>'+
    '<button type="button" data-cover-confirm>Salvar foto</button></div></section>';
  document.body.append(dialog);
  const stage=dialog.querySelector(".group-cover-editor-stage");
  const preview=stage.querySelector("img");
  preview.src=url;
  const limit=()=>{
    const scaledW=width*base*zoom,scaledH=height*base*zoom;
    dx=Math.max((size-scaledW)/2,Math.min((scaledW-size)/2,dx));
    dy=Math.max((size-scaledH)/2,Math.min((scaledH-size)/2,dy));
  };
  const render=()=>{
    limit();
    preview.style.width=width*base*zoom+"px";
    preview.style.height=height*base*zoom+"px";
    preview.style.transform="translate(calc(-50% + "+dx+"px),calc(-50% + "+dy+"px))";
  };
  const slider=dialog.querySelector('input[type="range"]');
  slider.addEventListener("input",()=>{zoom=Number(slider.value);render();});
  stage.addEventListener("pointerdown",event=>{
    if(event.button!==0 && event.pointerType==="mouse")return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,dx,dy};
    try{stage.setPointerCapture(event.pointerId);}catch{}
  });
  stage.addEventListener("pointermove",event=>{
    if(!drag||drag.id!==event.pointerId)return;
    dx=drag.dx+(event.clientX-drag.x);dy=drag.dy+(event.clientY-drag.y);render();
  });
  const release=()=>{drag=null;};
  stage.addEventListener("pointerup",release);
  stage.addEventListener("pointercancel",release);
  render();
  return new Promise(resolve=>{
    const finish=result=>{
      if(finished)return;
      finished=true;
      if(dialog.open)dialog.close();
      dialog.remove();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    dialog.querySelector("[data-cover-cancel]").addEventListener("click",()=>finish(null));
    dialog.addEventListener("cancel",event=>{event.preventDefault();finish(null);});
    dialog.querySelector("[data-cover-confirm]").addEventListener("click",async event=>{
      const button=event.currentTarget;button.disabled=true;
      try{
        const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;
        const context=canvas.getContext("2d",{alpha:false});
        if(!context)throw Error("canvas_unavailable");
        const sourceSize=size/(base*zoom);
        const centerX=width/2-dx/(base*zoom),centerY=height/2-dy/(base*zoom);
        context.drawImage(image,centerX-sourceSize/2,centerY-sourceSize/2,
          sourceSize,sourceSize,0,0,512,512);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",0.85));
        if(!blob?.size)throw Error("encode_failed");
        finish(new File([blob],"capa-grupo.webp",{type:"image/webp"}));
      }catch(error){console.warn("Group cover crop unavailable",error?.name||"error");button.disabled=false;}
    });
    dialog.showModal();
  });
}
