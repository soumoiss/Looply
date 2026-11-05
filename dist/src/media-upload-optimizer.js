// Client-side loss-bounded image optimization. Never touches videos/audio,
// GIF animations, original source bytes on the user's device, or historic media.
// Keeps the source when the browser cannot encode or reduction is insignificant.
export async function optimizeUploadImage(file,{maxDimension=2048,quality=0.85,minBytes=1200000}={}){
  if(!(file instanceof Blob)||file.size<minBytes ||
    !["image/jpeg","image/png","image/webp"].includes(file.type))return file;
  if(typeof document==="undefined"||typeof document.createElement!=="function")return file;
  let bitmap=null,img=null,url=null;
  try{
    if(typeof createImageBitmap==="function"){
      bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
    }else{
      url=URL.createObjectURL(file);
      img=new Image();img.src=url;await img.decode();
    }
    const width=bitmap?.width||img?.naturalWidth,height=bitmap?.height||img?.naturalHeight;
    if(!width||!height||width>20000||height>20000)return file;
    const ratio=Math.min(1,maxDimension/Math.max(width,height));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(width*ratio));
    canvas.height=Math.max(1,Math.round(height*ratio));
    const context=canvas.getContext("2d",{alpha:true});
    if(!context)return file;
    context.imageSmoothingEnabled=true;
    context.imageSmoothingQuality="high";
    context.drawImage(bitmap||img,0,0,canvas.width,canvas.height);
    const encoded=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
    if(!encoded||encoded.type!=="image/webp"||!encoded.size||encoded.size>file.size*0.90)return file;
    const name=String(file.name||"foto.jpg").replace(/\.[^.]+$/,"")+".webp";
    return new File([encoded],name,{type:"image/webp",lastModified:file.lastModified||Date.now()});
  }catch(error){
    console.warn("Looply photo optimization kept original",error?.name||"unsupported");
    return file;
  }finally{
    if(bitmap)bitmap.close?.();
    if(url)URL.revokeObjectURL(url);
  }
}
