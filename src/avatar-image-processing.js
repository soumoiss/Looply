// Browser-only avatar intake: decode EXIF orientation and HEIC/HEIF before cropping.
// The original file is never uploaded; the final avatar is a 512x512 JPEG.
const FORMATS = new Map([
  ["jpg","image/jpeg"],["jpeg","image/jpeg"],["png","image/png"],
  ["webp","image/webp"],["heic","image/heic"],["heif","image/heif"]
]);
const ACCEPTED = new Set(FORMATS.values());
export const MAX_AVATAR_SOURCE_BYTES = 35 * 1024 * 1024;
export function avatarFileType(file) {
  const type = String(file?.type||"").toLowerCase().split(";")[0].trim();
  const ext=String(file?.name||"").split(".").pop().toLowerCase();
  if(ACCEPTED.has(type))return type;
  if(!type || type==="application/octet-stream" || type==="image/jpg" || type==="image/pjpeg")
    return FORMATS.get(ext)||null;
  return null;
}
export async function convertHeicAvatar(file) {
  const module = await import("https://esm.sh/heic-to@1.6.6?bundle");
  if(typeof module.heicTo!=="function")throw Error("heic-decoder-unavailable");
  const result=await module.heicTo({blob:file,type:"image/jpeg",quality:0.94});
  const blob=Array.isArray(result)?result[0]:result;
  if(!(blob instanceof Blob) || blob.size===0)throw Error("heic-decoder-unavailable");
  return new File([blob],"avatar-convertido.jpg",{type:"image/jpeg",lastModified:Date.now()});
}
export async function prepareAvatarSource(file,{bitmapFactory=createImageBitmap,heicConverter=convertHeicAvatar}={}) {
  const mime=avatarFileType(file);
  if(!mime || !Number.isFinite(file?.size) || file.size<=0 || file.size>MAX_AVATAR_SOURCE_BYTES)
    throw Error("avatar-file-invalid");
  const converted=mime==="image/heic"||mime==="image/heif"?await heicConverter(file):file;
  // ImageBitmap applies orientation metadata before returning width and height.
  let bitmap;
  try{bitmap=await bitmapFactory(converted,{imageOrientation:"from-image"});}
  catch(error){
    try{bitmap=await bitmapFactory(converted);}catch{throw Error("avatar-decode-failed");}
  }
  if(!bitmap || bitmap.width<128||bitmap.height<128||bitmap.width>12000||bitmap.height>12000
    || bitmap.width*bitmap.height>64000000) {
    bitmap?.close?.();
    throw Error("avatar-dimensions-invalid");
  }
  return {bitmap,mime,converted,sourceWidth:bitmap.width,sourceHeight:bitmap.height};
}
export async function avatarPreviewFromBitmap(bitmap,{canvasFactory=()=>document.createElement("canvas")}={}) {
  const max=1600,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const canvas=canvasFactory();
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw Error("avatar-decode-failed");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error("avatar-decode-failed")),"image/jpeg",0.9));
}
