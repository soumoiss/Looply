// Openverse discovery of Creative Commons music with explicit license provenance.
// The index DOES NOT verify ownership; publication requires the user to check the source.
// No commercial preview, streaming API, or unauthorised track is copied.
const OPENVERSE_AUDIO_ENDPOINT = "https://api.openverse.org/v1/audio/";
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const clean = (value, limit=160) => String(value ?? "").replace(/[\u0000-\u001f<>]/g,"").trim().slice(0,limit);

function httpsUrl(value) {
  try {
    const url = new URL(value);
    if(url.protocol !== "https:" || url.username || url.password) return "";
    const host = url.hostname.toLowerCase();
    if (host==="localhost" || host.endsWith(".local") || host.endsWith(".internal") ||
        host==="127.0.0.1" || host==="0.0.0.0" || host==="[::1]" ||
        /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return "";
    return url.href;
  }catch{return "";}
}

/** Only licenses allowing modification/synchronization and commercial use. */
export function normalizeLicensedStorySong(value) {
  if(!value || !["cc0","by"].includes(value.license)) return null;
  const license = value.license;
  const version = String(value.license_version||"").trim();
  if (license==="cc0" && version!=="1.0") return null;
  if (license==="by" && !["4.0","3.0","2.5","2.0"].includes(version)) return null;
  const expected = license==="cc0"
    ? "https://creativecommons.org/publicdomain/zero/1.0/"
    : "https://creativecommons.org/licenses/by/"+version+"/";
  const declaredLicense = httpsUrl(value.license_url);
  if(!declaredLicense || declaredLicense.replace(/\/$/,"")!==expected.replace(/\/$/,"")) return null;
  const id = clean(value.id,80);
  const title = clean(value.title,110), artist=clean(value.creator,100);
  const audioUrl = httpsUrl(value.url);
  const sourceUrl = httpsUrl(value.foreign_landing_url);
  const filetype = String(value.filetype||"").toLowerCase();
  if(!id || !title || !artist || !audioUrl || !sourceUrl ||
     !["mp3","mpeg","ogg","wav","m4a"].includes(filetype)) return null;
  // If the index knows the file is too large, don't advertise a publishable file.
  const size = Number(value.filesize);
  if(Number.isFinite(size) && size>MAX_AUDIO_BYTES) return null;
  return {kind:"openverse",id,title,artist,provider:"openverse",
    license,licenseVersion:version,licenseUrl:declaredLicense,
    sourceUrl,audioUrl,filetype,artwork:httpsUrl(value.thumbnail),
    source:clean(value.source,60)};
}

export async function searchLicensedStorySongs(term,{fetcher=fetch,signal}={}) {
  const q=clean(term,70);
  if(q.length<2)return [];
  const url=new URL(OPENVERSE_AUDIO_ENDPOINT);
  url.searchParams.set("q",q);
  url.searchParams.set("category","music");
  url.searchParams.set("license","cc0,by");
  url.searchParams.set("page_size","15");
  url.searchParams.set("mature","false");
  const response=await fetcher(url.href,{signal,cache:"no-store"});
  if(!response.ok)throw new Error("O catálogo de músicas livres está indisponível.");
  const data=await response.json();
  return (Array.isArray(data?.results)?data.results:[])
    .map(normalizeLicensedStorySong).filter(Boolean);
}

export function licensedStoryAttribution(song) {
  if(song?.kind!=="file" || !song?.licenseUrl || !song?.sourceUrl)return "";
  // Visible in the published Story caption and kept with the media.
  return '🎵 "'+clean(song.title,100)+'" — '+clean(song.artist,90)+
    ' (CC '+(song.license==="cc0"?"0":"BY "+song.licenseVersion)+
    '). Fonte: '+song.sourceUrl+' | Licença: '+song.licenseUrl+
    ' | Áudio sincronizado ao Story.';
}
export function captionWithLicensedMusic(caption,song,maxLength=700) {
  const credit=licensedStoryAttribution(song);
  if(!credit) return String(caption||"").trim().slice(0,maxLength);
  if(credit.length>maxLength)throw new Error("Créditos musicais excedem o tamanho permitido.");
  const text=String(caption||"").trim().slice(0,maxLength-credit.length-2);
  return (text?text+"\n\n":"")+credit;
}

/** Fetch only user-approved, audibly exportable audio. No provider previews. */
export async function downloadLicensedStorySong(song,{fetcher=fetch,signal}={}) {
  if(song?.kind!=="openverse" || !["cc0","by"].includes(song.license) ||
    !httpsUrl(song.sourceUrl) || !httpsUrl(song.audioUrl) ||
    !httpsUrl(song.licenseUrl)) throw new Error("Licença ou origem musical inválida.");
  const response=await fetcher(song.audioUrl,{signal,credentials:"omit",redirect:"follow"});
  if(!response.ok)throw new Error("Não foi possível carregar o áudio da fonte original.");
  const size=Number(response.headers?.get?.("content-length")||0);
  if(size>MAX_AUDIO_BYTES)throw new Error("Esta faixa é maior que o limite de 15 MB.");
  const mime=String(response.headers?.get?.("content-type")||"").split(";")[0].toLowerCase();
  if(mime && mime!=="application/octet-stream" && !mime.startsWith("audio/"))
    throw new Error("O arquivo recebido não contém áudio válido.");
  const buffer=await response.arrayBuffer();
  if(!buffer.byteLength || buffer.byteLength>MAX_AUDIO_BYTES)
    throw new Error("Esta faixa é maior que o limite de 15 MB.");
  const type= mime.startsWith("audio/")?mime:
    song.filetype==="wav"?"audio/wav":song.filetype==="ogg"?"audio/ogg":
    song.filetype==="m4a"?"audio/mp4":"audio/mpeg";
  const file=new File([buffer],"looply-licensed-"+song.id+"."+
    (song.filetype==="mpeg"?"mp3":song.filetype),{type});
  return {...song,kind:"file",file,licenseVerifiedByUser:true};
}
