// Public YouTube playlist metadata only. No login, private content or playback proxy.
const origin="https://soumoiss.github.io",valid=/^[A-Za-z0-9_-]{11,100}$/;
const reply=(data,status=200,extra={})=>Response.json(data,{status,headers:{"access-control-allow-origin":origin,"access-control-allow-methods":"GET,OPTIONS","x-content-type-options":"nosniff","cache-control":status===200?"public, max-age=300":"no-store",...extra}});
function decode(s){return String(s||"").replace(/&(?:amp|lt|gt|quot|apos|#(\d+)|#x([a-f0-9]+));/gi,(f,d,h)=>d||h?String.fromCodePoint(parseInt(d||h,h?16:10)||32):({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'"}[f.toLowerCase()]||f));}
export function extractPlaylist(html,id){
 const tracks=[],seen=new Set();
 const add=(videoId,title,channel,index)=>{
  if(!/^[A-Za-z0-9_-]{11}$/.test(videoId||"")||!title||/^(private|deleted) video$/i.test(title)||seen.has(videoId))return;
  seen.add(videoId);tracks.push({videoId,title:String(title).slice(0,240),channel:String(channel||"").slice(0,160),position:Number.isInteger(index)&&index>=0?index:tracks.length,thumbnail:"https://i.ytimg.com/vi/"+videoId+"/hqdefault.jpg"});
 };
 const match=/\bvar ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(html);
 if(match){
  try{
   const nodes=[JSON.parse(match[1])];let visited=0;
   while(nodes.length&&visited++<75000){
    const item=nodes.pop();if(!item||typeof item!=="object")continue;
    const x=item.lockupViewModel,y=item.playlistVideoRenderer;
    if(x){
     const endpoint=x.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint;
     if(endpoint?.playlistId===id){
      const meta=x.metadata?.lockupMetadataViewModel;
      const artist=meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content;
      add(x.contentId,meta?.title?.content,artist,endpoint.index);
     }
    }
    if(y){
     const endpoint=y.navigationEndpoint?.watchEndpoint;
     if(endpoint?.playlistId===id)add(y.videoId,y.title?.runs?.map(t=>t.text).join("")||y.title?.simpleText,y.shortBylineText?.runs?.map(t=>t.text).join(""),Number(y.index?.simpleText)-1);
    }
    for(const value of Object.values(item)){
     if(!value||typeof value!=="object")continue;
     if(Array.isArray(value)){for(const child of value)if(child&&typeof child==="object")nodes.push(child);}
     else nodes.push(value);
    }
   }
  }catch(error){console.warn("Playlist JSON unavailable",error?.name||"parse");}
 }
 if(!tracks.length){
  for(const m of html.matchAll(/<h3\b[^>]*\btitle="([^"]+)"[^>]*>\s*<a\b[^>]*href="([^"]+)"/gi)){
   try{const url=new URL(decode(m[2]),"https://www.youtube.com");
    if(url.searchParams.get("list")!==id)continue;
    add(url.searchParams.get("v"),decode(m[1]),"",Number(url.searchParams.get("index"))-1);
   }catch{}
  }
 }
 return tracks.sort((a,b)=>a.position-b.position).map((item,i)=>({...item,position:i}));
}
export default {
 async fetch(request){
  const url=new URL(request.url),incoming=request.headers.get("origin");
  if(incoming&&incoming!==origin)return reply({error:"forbidden_origin"},403);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":origin,"access-control-allow-methods":"GET,OPTIONS"}});
  if(request.method!=="GET")return reply({error:"method_not_allowed"},405);
  if(url.pathname==="/health")return reply({ok:true,service:"looply-playlist-index"});
  if(url.pathname!=="/playlist")return reply({error:"not_found"},404);
  const id=url.searchParams.get("playlistId")||"";
  if(!valid.test(id))return reply({error:"invalid_playlist"},400);
  const cache=typeof caches!=="undefined"?caches.default:null;
  const key=new Request(url.origin+"/playlist?playlistId="+encodeURIComponent(id));
  if(cache){const saved=await cache.match(key);if(saved)return saved;}
  try{
   const upstream=await fetch("https://www.youtube.com/playlist?list="+encodeURIComponent(id),{
    headers:{"accept":"text/html","accept-language":"pt-BR,pt;q=0.9,en;q=0.8",
    "user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"},
    signal:AbortSignal.timeout(12000),redirect:"follow"
   });
   if(!upstream.ok)throw Error("youtube_http_"+upstream.status);
   if(Number(upstream.headers.get("content-length"))>5000000)throw Error("playlist_page_too_big");
   const tracks=extractPlaylist((await upstream.text()).slice(0,5000000),id);
   if(!tracks.length)throw Error("no_public_tracks");
   const answer=reply({items:tracks,nextPageToken:"",partial:false},200,{"cache-control":"public, max-age=1800","x-looply-source":"youtube-public-index"});
   if(cache)await cache.put(key,answer.clone());
   return answer;
  }catch(error){console.warn("Playlist lookup failed",String(error?.message||"network").slice(0,70));return reply({error:"playlist_source_unavailable"},503);}
 }
};