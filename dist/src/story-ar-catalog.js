// Effects are same-origin, versionable JSON files under assets/story-effects.
// The user can download, edit and host them on GitHub Pages or a CDN mirrored
// under the same app origin. No AR SDK fees or remote user-data uploads.
export const DEFAULT_STORY_EFFECTS=Object.freeze([
  {id:"none",name:"Sem lente",symbol:"◎",type:"none",file:"none.json"},
  {id:"big-eyes",name:"Zoião",symbol:"👀",type:"warp",file:"big-eyes.json"},
  {id:"big-mouth",name:"Bocão",symbol:"😮",type:"warp",file:"big-mouth.json"},
  {id:"clown",name:"Clown",symbol:"🤡",type:"paint",file:"clown.json"},
  {id:"sunglasses",name:"Óculos 3D",symbol:"🕶️",type:"accessory",file:"sunglasses.json"},
  {id:"skincare",name:"Skincare",symbol:"🫧",type:"paint",file:"skincare.json"}
]);
const TYPES=new Set(["none","warp","paint","accessory"]);
const INDEX_URL=new URL("../assets/story-effects/index.json",import.meta.url);
const validFile=f=>typeof f==="string"&&/^[a-z0-9-]{1,48}\.json$/.test(f);
function normalize(item){
  if(!item||typeof item.id!=="string"||!/^[a-z0-9-]{1,48}$/.test(item.id)||!TYPES.has(item.type))return null;
  if(!validFile(item.file))return null;
  return {id:item.id,name:String(item.name||item.id).slice(0,32),symbol:String(item.symbol||"✦").slice(0,4),type:item.type,file:item.file};
}
export async function loadStoryEffectCatalog(fetcher=fetch){
  try{
    const res=await fetcher(INDEX_URL.href,{cache:"force-cache"});
    if(!res.ok)throw new Error("Falha ao carregar índice");
    const data=await res.json();
    if(!Array.isArray(data.effects))throw new Error("Catálogo inválido");
    const options=data.effects.slice(0,24).map(normalize).filter(Boolean);
    if(!options.some(x=>x.id==="none"))throw new Error("Sem lente original");
    return options;
  }catch(error){console.warn("Catálogo AR local indisponível",error);return DEFAULT_STORY_EFFECTS;}
}
export async function loadStoryEffectManifest(effect,fetcher=fetch){
  if(!effect||effect.id==="none")return {id:"none",type:"none",strength:0,params:{}};
  if(!validFile(effect.file))throw new Error("Arquivo da lente inválido");
  const url=new URL("../assets/story-effects/lenses/"+effect.file,import.meta.url);
  if(url.origin!==INDEX_URL.origin)throw new Error("Lente fora do domínio do aplicativo");
  const res=await fetcher(url.href,{cache:"force-cache"});
  if(!res.ok)throw new Error("Lente indisponível: "+effect.name);
  const len=Number(res.headers?.get?.("content-length")||0);
  if(len>65536)throw new Error("Manifesto da lente é muito grande");
  const data=await res.json();
  if(data.id!==effect.id||data.type!==effect.type||!TYPES.has(data.type))throw new Error("Manifesto AR incompatível");
  const strength=Number.isFinite(data.strength)?Math.max(0,Math.min(.85,data.strength)):.45;
  const params=Object.fromEntries(Object.entries(data.params||{}).filter(([k,v])=>
    /^[a-zA-Z]{1,24}$/.test(k)&&(typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v)||
      typeof v==="number"&&Number.isFinite(v))).slice(0,12));
  return {id:effect.id,type:effect.type,strength,params};
}
