// Zero-dependency S3 client. Neon Functions inject the storage credentials.
const allowedOrigin = "https://soumoiss.github.io";
const encoder = new TextEncoder();
const maxBytes = bucket => bucket === "looply-stickers"
  ? 1024 * 1024
  : bucket === "looply-avatars"
  ? 10 * 1024 * 1024
  : Math.max(25 * 1024 * 1024, Math.min(5 * 1024 * 1024 * 1024, Number(process.env.LOOPLY_MAX_UPLOAD_BYTES) || 5 * 1024 * 1024 * 1024));
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers } });
const cors = origin => ({ "access-control-allow-origin": origin, "access-control-allow-methods": "GET, PUT, POST, OPTIONS", "access-control-allow-headers": "authorization, content-type, x-looply-bucket, x-looply-path, x-looply-size", "access-control-max-age": "600", vary: "Origin" });
const rfc3986 = value => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const hex = value => [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, "0")).join("");
const sha256 = async value => hex(await crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : value));
async function hmac(key, value) { const material = typeof key === "string" ? encoder.encode(key) : key; const cryptoKey = await crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value))); }
function awsTimestamp(now = new Date()) { const compact = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); return { amzDate: compact, dateStamp: compact.slice(0, 8) }; }
function objectUri(bucket, path) { const endpointPath = new URL(process.env.AWS_ENDPOINT_URL_S3).pathname.replace(/\/$/, ""); return `${endpointPath}/${rfc3986(bucket)}/${path.split("/").map(rfc3986).join("/")}`; }
async function signingKey(dateStamp) { const region = process.env.AWS_REGION; return hmac(await hmac(await hmac(await hmac(`AWS4${process.env.AWS_SECRET_ACCESS_KEY}`, dateStamp), region), "s3"), "aws4_request"); }
async function signedRequest({ method, bucket, path, bytes = new Uint8Array(), mime = "", presignSeconds = 0 }) {
  const endpoint = new URL(process.env.AWS_ENDPOINT_URL_S3), canonicalUri = objectUri(bucket, path), { amzDate, dateStamp } = awsTimestamp();
  const scope = `${dateStamp}/${process.env.AWS_REGION}/s3/aws4_request`, payloadHash = presignSeconds ? "UNSIGNED-PAYLOAD" : await sha256(bytes), query = new URLSearchParams();
  if (presignSeconds) { query.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256"); query.set("X-Amz-Credential", `${process.env.AWS_ACCESS_KEY_ID}/${scope}`); query.set("X-Amz-Date", amzDate); query.set("X-Amz-Expires", String(presignSeconds)); query.set("X-Amz-SignedHeaders", "host"); }
  const headers = { host: endpoint.host };
  if (!presignSeconds) { headers["x-amz-content-sha256"] = payloadHash; headers["x-amz-date"] = amzDate; if (mime) headers["content-type"] = mime; }
  const signedHeaders = Object.keys(headers).sort(), canonicalHeaders = signedHeaders.map(name => `${name}:${headers[name].trim()}\n`).join(""), canonicalQuery = [...query.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`).join("&");
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders.join(";")}\n${payloadHash}`;
  const signature = hex(await hmac(await signingKey(dateStamp), `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256(canonicalRequest)}`));
  if (presignSeconds) query.set("X-Amz-Signature", signature); else headers.authorization = `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`;
  const canonicalUrl = `${endpoint.origin}${canonicalUri}`;
  return { url: presignSeconds ? `${canonicalUrl}?${[...query.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`).join("&")}` : canonicalUrl, headers };
}
function safeObjectPath(value) { const path = String(value || ""); return path.length <= 512 && !path.startsWith("/") && !path.includes("..") && !/[\\\u0000-\u001f\u007f]/.test(path) && path.split("/").every(part => part && encodeURIComponent(decodeURIComponent(part)) === part); }
const uuidFragment = "[0-9a-f-]{36}";
const mediaMime = /^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/;
const chatMime = /^(image\/(jpeg|png|webp)|video\/(mp4|webm)|audio\/(mp4|mpeg|ogg|webm)|application\/(pdf|msword|rtf|vnd[.]openxmlformats-officedocument[.]wordprocessingml[.]document)|text\/(plain|csv))$/;
const galleryMime = /^(image\/(jpeg|png|gif|webp|avif|heic|heif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|aac|ogg|wav|webm|opus))$/;
function inspectObject(bucket, path) {
  const gallery = /^gallery\/([0-9a-f-]{36})\/([0-9a-f-]{36})[.]([a-z0-9]{1,20})$/i.exec(path);
  const avatar = /^avatars\/([0-9a-f-]{36})\/([0-9a-f-]{36})[.](jpg|jpeg|png|webp)$/i.exec(path);
  const media = /^(posts|stories)\/([0-9a-f-]{36})\/([0-9a-f-]{36})[.](jpg|jpeg|png|webp|mp4|webm)$/i.exec(path);
  const comment = /^comments\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})[.](jpg|jpeg|png|webp|mp4|webm)$/i.exec(path);
  const chat = /^conversations\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})[.](jpg|jpeg|png|webp|mp4|webm|mp3|ogg|pdf|txt|csv|doc|docx|rtf)$/i.exec(path);
  const sticker = /^stickers\/([0-9a-f-]{36})\/([0-9a-f-]{36})[.]webp$/i.exec(path);
  const letter = /^([0-9a-f-]{36})\/([0-9a-f-]{36})-([A-Za-z0-9._-]{1,120})$/.exec(path);
  if (bucket === "looply-avatars" && avatar) return { type:"avatar", owner:avatar[1] };
  if (bucket === "looply-stickers" && sticker) return { type:"sticker", owner:sticker[1] };
  if (bucket === "looply-gallery" && gallery) return { type:"gallery",owner:gallery[1] };
  if (bucket === "looply-media" && media) return { type:media[1],record:media[2] };
  if (bucket === "looply-media" && comment) return { type:"comments",record:comment[2],post:comment[1] };
  if (bucket === "looply-chat" && chat) return { type:"chat",conversation:chat[1],record:chat[2] };
  if (bucket === "looply-letters" && letter) return { type:"letter",record:letter[1] };
  return null;
}
function allowedFile(bucket,path,mime,size,profileId) {
  const object = inspectObject(bucket,path);
  if (!object || size<=0 || size>maxBytes(bucket)) return false;
  if (object.owner && object.owner!==profileId) return false;
  if (object.type==="avatar") return ["image/jpeg","image/png","image/webp"].includes(mime);
  if (object.type==="sticker") return mime==="image/webp";
  if (object.type==="gallery") return galleryMime.test(mime);
  if (object.type==="letter") return chatMime.test(mime);
  if (object.type==="chat") return chatMime.test(mime);
  return mediaMime.test(mime);
}
async function rowsFor(token,table,params) {
  const qs = new URLSearchParams(params);
  qs.set("select","id");
  qs.set("limit","1");
  const reply = await fetch(process.env.NEON_DATA_API_URL+"/"+table+"?"+qs, {
    headers:{authorization:token,accept:"application/json"},cache:"no-store"
  });
  if(!reply.ok)return [];
  const rows=await reply.json().catch(()=>[]);
  return Array.isArray(rows)?rows:[];
}
async function canUploadObject(token,profileId,bucket,path) {
  const object=inspectObject(bucket,path);
  if(!object)return false;
  if(object.owner)return object.owner===profileId;
  const mapping={
    posts:["posts", {id:"eq."+object.record,author_id:"eq."+profileId}],
    stories:["stories",{id:"eq."+object.record,author_id:"eq."+profileId}],
    comments:["comments",{id:"eq."+object.record,post_id:"eq."+object.post,author_id:"eq."+profileId}],
    chat:["chat_messages",{id:"eq."+object.record,conversation_id:"eq."+object.conversation,sender_id:"eq."+profileId}],
    letter:["community_letters",{id:"eq."+object.record,sender_id:"eq."+profileId}]
  };
  const query=mapping[object.type];
  return Boolean(query && (await rowsFor(token,query[0],query[1])).length);
}
// The database validates ADM membership and an exact registered gallery path.
async function canAdminDeleteGalleryObject(token,bucket,path) {
  if (!["looply-gallery","looply-media"].includes(bucket)) return false;
  const response=await fetch(process.env.NEON_DATA_API_URL+"/rpc/v7_gallery_storage_delete_allowed",{
    method:"POST",headers:{authorization:token,"content-type":"application/json"},
    body:JSON.stringify({p_bucket:bucket,p_path:path}),cache:"no-store"
  });
  return response.ok && (await response.json().catch(()=>false))===true;
}
async function canSignObject(token,profileId,bucket,path) {
  const object=inspectObject(bucket,path);
  if(!object)return false;
  const tableByType={avatar:"profiles",sticker:"sticker_catalog",gallery:"community_gallery_media",posts:"post_media",
    stories:"story_media",comments:"comment_media",chat:"chat_media",letter:"community_letters"};
  const table=tableByType[object.type];
  if(!table)return false;
  if(object.type==="letter") {
    const qs = new URLSearchParams({select:"id",limit:"1"});
    qs.set("attachments","cs."+JSON.stringify([{path}]));
    const reply=await fetch(process.env.NEON_DATA_API_URL+"/"+table+"?"+qs,{
      headers:{authorization:token,accept:"application/json"},cache:"no-store"
    });
    return reply.ok && (await reply.json().catch(()=>[])).length>0;
  }
  const params=object.type==="sticker"?{storage_path:"eq."+path}:
    object.type==="avatar"?{avatar_path:"eq."+path}:
    object.type==="gallery"?{storage_path:"eq."+path,publication_state:"eq.published"}:
    {storage_path:"eq."+path};
  return (await rowsFor(token,table,params)).length>0;
}

// Playlist metadata is fetched server-side; the browser never calls a Supabase
// Edge Function, and no Google API key is embedded in static assets.
function parseYouTubeFeed(xml) {
  const decode = value => String(value||"").replace(/&(?:amp|lt|gt|quot|apos|#(\d+)|#x([a-f0-9]+));/gi,(full,decimal,hex)=>{
    if(decimal||hex){const cp=parseInt(decimal||hex,hex?16:10);return Number.isInteger(cp)&&cp>0&&cp<=1114111?String.fromCodePoint(cp):"";}
    return {"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'"}[full]||full;
  });
  const entries=xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi)||[];
  return entries.map((entry,index)=>{
    const videoId=/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/.exec(entry)?.[1]||"";
    const title=decode(/<title\b[^>]*>([\s\S]*?)<\/title>/.exec(entry)?.[1]||"").trim();
    const channel=decode(/<name\b[^>]*>([\s\S]*?)<\/name>/.exec(entry)?.[1]||"").trim();
    return {videoId,title,channel,position:index,thumbnail:videoId?"https://i.ytimg.com/vi/"+videoId+"/hqdefault.jpg":""};
  }).filter(item=>item.videoId&&item.title&&!/^(Private|Deleted) video$/i.test(item.title));
}
async function youtubePlaylist(request, headers) {
  const target=new URL(request.url), playlistId=target.searchParams.get("playlistId")||"";
  const pageToken=target.searchParams.get("pageToken")||"";
  if (!/^[A-Za-z0-9_-]{11,100}$/.test(playlistId)||pageToken.length>300) return json({error:"youtube_playlist_not_allowed"},400,headers);
  try{
    if(process.env.YOUTUBE_API_KEY){
      const args=new URLSearchParams({part:"snippet",playlistId,maxResults:"50",key:process.env.YOUTUBE_API_KEY});
      if(pageToken)args.set("pageToken",pageToken);
      const response=await fetch("https://www.googleapis.com/youtube/v3/playlistItems?"+args,{signal:AbortSignal.timeout(10000)});
      const data=await response.json();
      if(!response.ok) return json({error:"youtube_upstream_failed"},502,headers);
      return json({items:(data.items||[]).map(i=>({
        videoId:i.snippet?.resourceId?.videoId||"",title:i.snippet?.title||"",
        channel:i.snippet?.videoOwnerChannelTitle||i.snippet?.channelTitle||"",
        position:i.snippet?.position||0,
        thumbnail:i.snippet?.thumbnails?.medium?.url||""
      })),nextPageToken:data.nextPageToken||""},200,{...headers,"cache-control":"private, max-age=600"});
    }
    if(pageToken)return json({items:[],nextPageToken:""},200,headers);
    const response=await fetch("https://www.youtube.com/feeds/videos.xml?playlist_id="+encodeURIComponent(playlistId),{signal:AbortSignal.timeout(10000)});
    if(!response.ok) return json({error:"youtube_public_feed_unavailable"},502,headers);
    const xml=await response.text();
    if(xml.length>300000)return json({error:"youtube_public_feed_too_large"},502,headers);
    return json({items:parseYouTubeFeed(xml),nextPageToken:"",partial:true},200,{...headers,"cache-control":"private, max-age=600"});
  }catch{return json({error:"youtube_upstream_unavailable"},503,headers);}
}
async function identity(request) { const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization") || ""); if (!match) return null; try { const response = await fetch(`${process.env.NEON_DATA_API_URL}/v3_self_profile?select=id&limit=1`, { headers: { authorization: `Bearer ${match[1]}`, accept: "application/json" } }); const profileId = response.ok ? (await response.json())?.[0]?.id : null; return /^[0-9a-f-]{36}$/i.test(String(profileId || "")) ? profileId : null; } catch { return null; } }
let spotifyToken = null;
async function spotifyAccessToken() {
  if (spotifyToken?.expiresAt > Date.now() + 30000) return spotifyToken.value;
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) return null;
  const authorization = "Basic " + btoa(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`);
  const response = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { authorization, "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(10000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error("spotify_token_failed");
  spotifyToken = { value: payload.access_token, expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000 };
  return spotifyToken.value;
}
async function spotifySearch(request, headers) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length < 2 || query.length > 120) return json({ error: "invalid_search_query" }, 400, headers);
  try {
    const token = await spotifyAccessToken();
    if (!token) return json({ error: "spotify_not_configured" }, 503, headers);
    const params = new URLSearchParams({ q: query, type: "track", market: "BR", limit: "10" });
    const response = await fetch("https://api.spotify.com/v1/search?" + params, { headers: { authorization: "Bearer " + token }, signal: AbortSignal.timeout(10000) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: response.status === 429 ? "spotify_rate_limited" : "spotify_search_failed" }, response.status === 429 ? 429 : 502, headers);
    const items = (payload.tracks?.items || []).map(track => ({ id: track.id, name: String(track.name || "").slice(0, 180), artist: (track.artists || []).map(artist => artist.name).filter(Boolean).join(", ").slice(0, 180), image: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || "", previewUrl: typeof track.preview_url === "string" ? track.preview_url : null })).filter(track => /^[A-Za-z0-9]{22}$/.test(track.id));
    return json({ items }, 200, { ...headers, "cache-control": "private, max-age=60" });
  } catch (error) { console.error("Spotify search failed", error?.message || error); return json({ error: "spotify_search_unavailable" }, 503, headers); }
}
export default { async fetch(request) {
  const origin = request.headers.get("origin") || "", headers = cors(origin === allowedOrigin ? origin : "null");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (origin !== allowedOrigin) return json({ error: "origin_not_allowed" }, 403, headers);
  if (![process.env.NEON_DATA_API_URL, process.env.AWS_ENDPOINT_URL_S3, process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY, process.env.AWS_REGION].every(Boolean)) return json({ error: "storage_not_configured" }, 503, headers);
  const profileId = await identity(request); if (!profileId) return json({ error: "unauthorized" }, 401, headers);
  if (new URL(request.url).pathname.endsWith("/youtube/playlist") && request.method === "GET") return youtubePlaylist(request,headers);
  if (new URL(request.url).pathname.endsWith("/spotify/search") && request.method === "GET") return spotifySearch(request,headers);
  const bucket = request.headers.get("x-looply-bucket") || "", path = request.headers.get("x-looply-path") || "";
  if (!safeObjectPath(path) || !["looply-avatars", "looply-stickers", "looply-gallery", "looply-media", "looply-chat", "looply-letters"].includes(bucket)) return json({ error: "invalid_object" }, 400, headers);
  const url = new URL(request.url);
  if (url.pathname.endsWith("/storage/upload-url") && request.method === "POST") {
    const mime = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const size = Number(request.headers.get("x-looply-size") || 0);
    if (!Number.isSafeInteger(size) || !allowedFile(bucket, path, mime, size, profileId)) return json({ error: "file_not_allowed" }, 400, headers);
    if (!(await canUploadObject(request.headers.get("authorization"),profileId,bucket,path))) return json({error:"not_owner_of_media_parent"},403,headers);
    const signed = await signedRequest({ method: "PUT", bucket, path, mime, presignSeconds: 900 });
    return json({ path, uploadUrl: signed.url, expiresIn: 900 }, 200, headers);
  }
  if (url.pathname.endsWith("/storage/upload") && request.method === "PUT") {
    const mime = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(), bytes = new Uint8Array(await request.arrayBuffer());
    if (!allowedFile(bucket, path, mime, bytes.length, profileId)) return json({ error: "file_not_allowed" }, 400, headers);
    if (!(await canUploadObject(request.headers.get("authorization"),profileId,bucket,path))) return json({error:"not_owner_of_media_parent"},403,headers);
    const signed = await signedRequest({ method: "PUT", bucket, path, bytes, mime }), response = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: bytes });
    if (!response.ok) { console.error("S3 object write failed", response.status); return json({ error: "storage_write_failed" }, 502, headers); }
    return json({ path }, 200, headers);
  }
  if (url.pathname.endsWith("/storage/remove") && request.method === "POST") {
    const owned=await canUploadObject(request.headers.get("authorization"),profileId,bucket,path);
    if (!owned && !(await canAdminDeleteGalleryObject(request.headers.get("authorization"),bucket,path))) return json({ error: "forbidden" }, 403, headers);
    const signed = await signedRequest({ method: "DELETE", bucket, path }), response = await fetch(signed.url, { method: "DELETE", headers: signed.headers });
    if (!response.ok) { console.error("S3 object removal failed", response.status); return json({ error: "storage_remove_failed" }, 502, headers); }
    return json({ path }, 200, headers);
  }
  if (url.pathname.endsWith("/storage/sign") && request.method === "POST") {
    if (!(await canSignObject(request.headers.get("authorization"),profileId,bucket,path))) {
      return json({ error: "object_not_visible" }, 403, headers);
    }
    const payload = await request.json().catch(() => ({})), signed = await signedRequest({ method: "GET", bucket, path, presignSeconds: Math.max(60, Math.min(1800, Number(payload.expiresIn) || 1800)) });
    return json({ signedUrl: signed.url }, 200, headers);
  }
  return json({ error: "not_found" }, 404, headers);
} };
