// Discovery + safe metadata markers for the Stories music picker.
// Streaming services require separate licensed playback. No streaming preview
// may be sampled, downloaded or baked into a published Story.
export const STORY_MUSIC_ENDPOINT = "https://looply-story-music-search.s0upoetamoiss.workers.dev/search";
export const PROVIDER_NAMES = Object.freeze({
  apple: "Apple Music", deezer: "Deezer", audius: "Audius"
});
const PROVIDER_HOSTS = Object.freeze({
  apple:["apple.com","itunes.com"],
  deezer:["deezer.com"],
  audius:["audius.co"]
});
function officialUrl(value, provider) {
  try {
    const url=new URL(value);
    const allowed=PROVIDER_HOSTS[provider]||[];
    return url.protocol==="https:" && allowed.some(host=>url.hostname===host||url.hostname.endsWith("."+host))
      ? url.href : "";
  } catch { return ""; }
}
function clean(value,max=140) {
  return String(value ?? "").replace(/[\u0000-\u001f<>]/g,"").trim().slice(0,max);
}
export function normalizeStorySong(track) {
  if (!track || !PROVIDER_NAMES[track.provider]) return null;
  const url=officialUrl(track.url,track.provider);
  const title=clean(track.title,110),artist=clean(track.artist,100);
  return url&&title&&artist
    ? {provider:track.provider,title,artist,url,artwork:typeof track.artwork==="string"?track.artwork:"",kind:"catalog"} : null;
}
const markerStart="[[looply-music-v4|";
export function encodeStorySong(text,track) {
  const song=normalizeStorySong(track);
  const description=String(text||"").trim();
  if (!song) return description.slice(0,700);
  const marker=markerStart+[song.provider,song.title,song.artist,song.url].map(encodeURIComponent).join("|")+"]]";
  if (marker.length>=700) throw new Error("Os dados desta música são longos demais. Escolha outra.");
  return marker+description.slice(0,700-marker.length);
}
export function decodeStorySong(value) {
  const raw=String(value||"");
  if (!raw.startsWith(markerStart)) return {text:raw,song:null};
  const end=raw.indexOf("]]",markerStart.length);
  if (end<0 || end>1300) return {text:raw,song:null};
  const chunks=raw.slice(markerStart.length,end).split("|");
  if (chunks.length!==4) return {text:raw,song:null};
  try {
    const [provider,title,artist,url]=chunks.map(decodeURIComponent);
    const song=normalizeStorySong({provider,title,artist,url});
    return song ? {text:raw.slice(end+2),song} : {text:raw,song:null};
  } catch { return {text:raw,song:null}; }
}
export async function searchStorySongs(value,{fetcher=fetch,signal}={}) {
  const q=clean(value,70);
  if (q.length<2) return {providers:[],items:[]};
  const result=await fetcher(STORY_MUSIC_ENDPOINT+"?q="+encodeURIComponent(q),{signal,cache:"no-store"});
  if (!result.ok) throw new Error("A busca musical está temporariamente indisponível.");
  const data=await result.json();
  if (!Array.isArray(data.providers)) throw new Error("A busca musical retornou uma resposta inválida.");
  const providers=data.providers.map(p=>({
    provider:p.provider,available:p.available===true,items:Array.isArray(p.items)
      ? p.items.map(normalizeStorySong).filter(Boolean).slice(0,20):[]
  })).filter(p=>PROVIDER_NAMES[p.provider]);
  const keys=new Set();
  const items=providers.flatMap(p=>p.items).filter(song=>{
    const key=song.provider+":"+song.url;
    if (keys.has(key)) return false;
    keys.add(key);return true;
  });
  return {providers,items};
}
export function storySongSearchLinks(query) {
  const q=clean(query,90);
  if (!q) return [];
  const encoded=encodeURIComponent(q);
  return [
    {name:"Spotify",url:"https://open.spotify.com/search/"+encoded},
    {name:"YouTube Music",url:"https://music.youtube.com/search?q="+encoded},
    {name:"SoundCloud",url:"https://soundcloud.com/search/sounds?q="+encoded},
    {name:"TIDAL",url:"https://tidal.com/search?q="+encoded}
  ];
}
