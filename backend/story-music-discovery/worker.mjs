// Unified public music catalog metadata for the Stories editor.
// Public promo preview URLs are passed transiently to the native browser player;
// files are never downloaded, transcoded, saved, or embedded in a Story.
// Apple iTunes Search and Deezer are read-only discovery sources.
const ALLOWED_ORIGIN = "https://soumoiss.github.io";
const JSON_HEADERS = { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" };
const filterText = (value,max=160) => String(value ?? "").replace(/[\u0000-\u001f<>]/g,"").trim().slice(0,max);
const safeUrl = (raw, domains) => {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && domains.some(d => u.hostname === d || u.hostname.endsWith("."+d))
      ? u.href.slice(0,850) : "";
  } catch { return ""; }
};
const normalize = {
  apple: data => (Array.isArray(data?.results) ? data.results : []).filter(x => x.kind === "song").map(x=>({
    provider:"apple",id:String(x.trackId||""),title:filterText(x.trackName),
    artist:filterText(x.artistName),album:filterText(x.collectionName),
    durationSec:Number(x.trackTimeMillis)>0?Math.round(Number(x.trackTimeMillis)/1000):0,
    isrc:filterText(x.isrc||"",16),
    artwork:safeUrl(x.artworkUrl100,["mzstatic.com"]),url:safeUrl(x.trackViewUrl,["apple.com","itunes.com"]),
    previewUrl:safeUrl(x.previewUrl,["apple.com","itunes.com","mzstatic.com"])
  })),
  deezer: data => (Array.isArray(data?.data) ? data.data : []).map(x=>({
    provider:"deezer",id:String(x.id||""),title:filterText(x.title),
    artist:filterText(x.artist?.name),album:filterText(x.album?.title),
    durationSec:Number(x.duration)>0?Number(x.duration):0,
    isrc:filterText(x.isrc||"",16),
    artwork:safeUrl(x.album?.cover_medium,["dzcdn.net"]),url:safeUrl(x.link,["deezer.com"]),
    previewUrl:safeUrl(x.preview,["dzcdn.net"])
  }))
};
async function queryCatalog(name,url) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),6500);
  try {
    const response = await fetch(url,{signal:controller.signal,headers:{"accept":"application/json"}});
    if (!response.ok) throw new Error(name+" HTTP "+response.status);
    const data = await response.json();
    return {provider:name,available:true,items:normalize[name](data).filter(x=>x.id&&x.title&&x.artist&&x.url).slice(0,20)};
  } catch(error) {
    return {provider:name,available:false,items:[],error:filterText(error.message,90)};
  } finally { clearTimeout(timer); }
}
export default {
  async fetch(request) {
    const origin=request.headers.get("origin");
    const cors = origin === ALLOWED_ORIGIN
      ? {"access-control-allow-origin":ALLOWED_ORIGIN,"vary":"origin"} : {};
    const respond = (body,status=200) => new Response(JSON.stringify(body),
      {status,headers:{...JSON_HEADERS,...cors,"x-content-type-options":"nosniff"}});
    if (request.method==="OPTIONS") return new Response(null,{status:204,headers:{
      ...cors,"access-control-allow-methods":"GET,OPTIONS","access-control-allow-headers":"content-type",
      "access-control-max-age":"86400"
    }});
    const path=new URL(request.url);
    if (request.method!=="GET" || path.pathname!=="/search") return respond({error:"not_found"},404);
    const q=filterText(path.searchParams.get("q"),72);
    if (q.length<2 || q.length>72) return respond({error:"Digite pelo menos dois caracteres."},400);
    const e=encodeURIComponent(q);
    const [apple,deezer]=await Promise.all([
      queryCatalog("apple","https://itunes.apple.com/search?media=music&entity=song&country=br&limit=20&term="+e),
      queryCatalog("deezer","https://api.deezer.com/search?q="+e+"&limit=20")
    ]);
    return respond({query:q,providers:[apple,deezer]});
  }
};