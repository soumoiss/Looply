import { dedupeStorySongRecordings } from "./story-music-dedupe.js";
// Discovery + safe metadata markers for the Stories music picker.
// Streaming services require separate licensed playback. No streaming preview
// may be sampled, downloaded or baked into a published Story.
export const STORY_MUSIC_ENDPOINT = "https://looply-story-music-search.s0upoetamoiss.workers.dev/search";
export const PROVIDER_NAMES = Object.freeze({
  apple: "Apple Music", deezer: "Deezer", spotify: "Spotify"
});
const PROVIDER_HOSTS = Object.freeze({
  apple:["apple.com","itunes.com"],
  deezer:["deezer.com"],
  spotify:["spotify.com"]
});
function officialUrl(value, provider) {
  try {
    const url=new URL(value);
    const allowed=PROVIDER_HOSTS[provider]||[];
    return url.protocol==="https:" && allowed.some(host=>url.hostname===host||url.hostname.endsWith("."+host))
      ? url.href : "";
  } catch { return ""; }
}
function officialPreviewUrl(value,provider) {
  try {
    if(!value) return "";
    const url = new URL(value);
    const allowed = provider==="apple"
      ? ["itunes.apple.com","apple.com","mzstatic.com"]
      : provider==="deezer" ? ["dzcdn.net"] : [];
    return url.protocol==="https:" && allowed.some(host=>
      url.hostname===host || url.hostname.endsWith("."+host))
      ? url.href : "";
  }catch{return "";}
}
function clean(value,max=140) {
  return String(value ?? "").replace(/[\u0000-\u001f<>]/g,"").trim().slice(0,max);
}
export function normalizeStorySong(track) {
  if (!track || !PROVIDER_NAMES[track.provider]) return null;
  const url=officialUrl(track.url,track.provider);
  const title=clean(track.title,110),artist=clean(track.artist,100);
  const id=/^[a-zA-Z0-9_-]{1,100}$/.test(String(track.id||""))?String(track.id):"";
  return url&&title&&artist
    ? {provider:track.provider,title,artist,url,id,
      artwork:typeof track.artwork==="string"?track.artwork:"",kind:"catalog",
      previewUrl:officialPreviewUrl(track.previewUrl,track.provider),
      album:clean(track.album,110),
      durationSec:Number.isFinite(Number(track.durationSec)) && Number(track.durationSec)>0
        ? Math.round(Number(track.durationSec)):0,
      isrc:/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(String(track.isrc||"").toUpperCase())
        ? String(track.isrc).toUpperCase():""} : null;
}
const markerStart="[[looply-music-v4|";
const markerV5="[[looply-music-v5|";
/** Authorized provider-owned widgets are played in the published Story after
 * the viewer taps Play. They are never captured or mixed into its media file.
 * Deezer previews are normally limited; Apple full playback may require sign-in.
 */
export function officialStorySongEmbed(track) {
  const song=normalizeStorySong(track);
  if(!song)return null;
  const u=new URL(song.url);
  if(song.provider==="apple" && u.hostname==="music.apple.com")
    return {provider:"apple",kind:"embed",src:"https://embed.music.apple.com"+u.pathname+u.search};
  if(song.provider==="deezer"){
    const match=u.pathname.match(/^\/(?:[a-z]{2}\/)?track\/(\d+)/i);
    if(match)return {provider:"deezer",kind:"embed",src:"https://widget.deezer.com/widget/dark/track/"+match[1]};
  }
  if(song.provider==="spotify" && u.hostname==="open.spotify.com" &&
    /^\/track\/[A-Za-z0-9]{22}$/.test(u.pathname))
    return {provider:"spotify",kind:"embed",src:"https://open.spotify.com/embed"+u.pathname};
  return null;
}
/** A provider-owned preview is never mixed into the exported video. */
export function officialSongPreview(track) {
  const song=normalizeStorySong(track);
  if(!song) return null;
  const u=new URL(song.url);
  // Temporary playback directly from the official source. Never download,
  // save or attach this preview to the video (Apple/iTunes promo terms).
  if(song.previewUrl) return {kind:"audio",provider:song.provider,src:song.previewUrl};
  if(song.provider==="apple" && u.hostname==="music.apple.com"){
    return {kind:"embed",provider:"apple",src:"https://embed.music.apple.com"+u.pathname+u.search};
  }
  if(song.provider==="deezer"){
    const match=u.pathname.match(/^\/(?:[a-z]{2}\/)?track\/(\d+)/i);
    if(match) return {kind:"embed",provider:"deezer",src:"https://widget.deezer.com/widget/dark/track/"+match[1]};
  }
  if(song.provider==="spotify"){
    const widget=officialStorySongEmbed(song);
    if(widget)return widget; // Preview in picker only, not exported to Story
  }
  return null;
}
export function encodeStorySong(text,track) {
  const song=normalizeStorySong(track);
  const description=String(text||"").trim();
  if (!song) return description.slice(0,700);
  const marker=markerStart+
    [song.provider,song.title,song.artist,song.url].map(encodeURIComponent).join("|")+"]]";
  if (marker.length>=700) throw new Error("Os dados desta música são longos demais. Escolha outra.");
  return marker+description.slice(0,700-marker.length);
}
export function decodeStorySong(value) {
  const raw=String(value||"");
  const prefix=raw.startsWith(markerV5)?markerV5:raw.startsWith(markerStart)?markerStart:null;
  if(!prefix)return {text:raw,song:null};
  const end=raw.indexOf("]]",prefix.length);
  if (end<0 || end>1300) return {text:raw,song:null};
  const chunks=raw.slice(prefix.length,end).split("|");
  if (chunks.length!==(prefix===markerV5?5:4)) return {text:raw,song:null};
  try {
    const [provider,title,artist,url,id]=chunks.map(decodeURIComponent);
    // Decode old markers for text recovery but disable the removed provider.
    if(provider==="audius")return {text:raw.slice(end+2),song:null};
    const song=normalizeStorySong({provider,title,artist,url,id});
    return song ? {text:raw.slice(end+2),song} : {text:raw,song:null};
  } catch { return {text:raw,song:null}; }
}
// Search ONLY for Spotify title/artist metadata via the existing
// authenticated Neon function. No Spotify preview/audio is downloaded or
// synchronized into user-generated videos.
export async function searchSpotifyStoryMetadata(value,{
  fetcher=fetch,signal,accessToken="",endpoint=""
}={}) {
  const q=clean(value,70);
  if(q.length<2 || !accessToken || !endpoint)return [];
  let base;
  try {
    base=new URL(endpoint);
    if(base.protocol!=="https:" || !base.hostname.endsWith(".neon.tech"))return [];
  }catch{return [];}
  const response=await fetcher(base.origin+"/spotify/search?q="+encodeURIComponent(q),{
    headers:{authorization:"Bearer "+accessToken},signal,cache:"no-store"
  });
  if(!response.ok)throw Error("Spotify metadata: HTTP "+response.status);
  const data=await response.json();
  return (Array.isArray(data.items)?data.items:[]).map(item=>{
    const id=String(item.id||"");
    if(!/^[A-Za-z0-9]{22}$/.test(id))return null;
    return normalizeStorySong({provider:"spotify",id,title:item.name,artist:item.artist,
      url:"https://open.spotify.com/track/"+id,artwork:item.image||"",previewUrl:""});
  }).filter(Boolean).slice(0,10);
}

export async function searchAppleMusicPublic(value,{fetcher=fetch,signal}={}) {
  const q=clean(value,70);
  if(q.length<2) return [];
  // iTunes Search API is public, supports Access-Control-Allow-Origin: *
  // and avoids shared Cloudflare egress addresses sometimes rate-limited (429).
  const url="https://itunes.apple.com/search?country=br&media=music&entity=song&limit=20&term="+encodeURIComponent(q);
  const response=await fetcher(url,{signal,cache:"no-store"});
  if(!response.ok) throw new Error("Apple Music: HTTP "+response.status);
  const data=await response.json();
  return (Array.isArray(data.results)?data.results:[])
    .filter(x=>x.kind==="song")
    .map(x=>normalizeStorySong({
      provider:"apple",id:String(x.trackId||""),title:x.trackName,artist:x.artistName,
      url:x.trackViewUrl,artwork:x.artworkUrl100,previewUrl:x.previewUrl,
      album:x.collectionName,durationSec:Math.round(Number(x.trackTimeMillis||0)/1000),isrc:x.isrc
    })).filter(Boolean).slice(0,20);
}
// Legacy entry point: discovery returns metadata, never soundtrack rights.
export async function searchPlayableStorySongs(value,options={}){
  return searchStorySongs(value,options);
}

export async function searchStorySongs(value,{fetcher=fetch,signal}={}) {
  const q=clean(value,70);
  if (q.length<2) return {providers:[],items:[]};
  let data;
  try{
    const result=await fetcher(STORY_MUSIC_ENDPOINT+"?q="+encodeURIComponent(q),{signal,cache:"no-store"});
    if(!result.ok)throw Error("Worker HTTP "+result.status);
    data=await result.json();
    if(!Array.isArray(data.providers))throw Error("Worker returned invalid results");
  }catch(error){
    if(signal?.aborted)throw error;
    // A broken Worker must not prevent Apple's documented, publicly
    // available browser search; return a partial result, never fabricated data.
    const apple=await searchAppleMusicPublic(q,{fetcher,signal}).catch(()=>[]);
    if(!apple.length)throw new Error("A busca musical está temporariamente indisponível.");
    data={providers:[{provider:"apple",available:true,items:apple},
      {provider:"deezer",available:false,items:[]}]};
  }
  // Apple may return 429 to a shared serverless egress IP while answering the
  // end user's browser normally. Restore the catalog from Apple directly.
  if (data.providers.some(p=>p.provider==="apple" && !p.available)) {
    try {
      const apple=await searchAppleMusicPublic(q,{fetcher,signal});
      if (apple.length) {
        data.providers=data.providers.map(p=>p.provider==="apple"
          ? {...p,available:true,items:apple}:p);
      }
    } catch { /* The other providers and original tracks remain usable. */ }
  }
  const providers=data.providers.map(p=>({
    provider:p.provider,available:p.available===true,items:Array.isArray(p.items)
      ? p.items.map(normalizeStorySong).filter(Boolean).slice(0,20):[]
  })).filter(p=>PROVIDER_NAMES[p.provider]);
  const items=dedupeStorySongRecordings(providers.flatMap(p=>p.items));
  return {providers,items};
}
export function storySongSearchLinks(query) {
  const q=clean(query,90);
  if (!q) return [];
  const encoded=encodeURIComponent(q);
  return [
    {name:"Apple Music",url:"https://music.apple.com/br/search?term="+encoded},
    {name:"YouTube Music",url:"https://music.youtube.com/search?q="+encoded},
    {name:"SoundCloud",url:"https://soundcloud.com/search/sounds?q="+encoded},
    {name:"TIDAL",url:"https://tidal.com/search?q="+encoded}
  ];
}
