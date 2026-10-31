// REST bridge for the restored pages. Auth uses Neon JWTs; security is enforced
// again by Postgres RLS on every request. This is not the Supabase SDK.
const WRITABLE = Object.freeze({
  profiles: ["display_name","bio","profile_visibility","playlist_url","avatar_path","theme","font_family","font_size"],
  posts: ["author_id","body","visibility","external_url"],
  post_media: ["post_id","storage_path","kind","mime_type","byte_size","alt_text"],
  comments: ["post_id","author_id","parent_comment_id","body"],
  comment_media: ["comment_id","post_id","author_id","storage_path","mime_type","byte_size"],
  stories: ["author_id","body","visibility"],
  story_media: ["story_id","storage_path","kind","mime_type","byte_size","alt_text"],
  story_recipients: ["story_id","recipient_id"],
  story_views: ["story_id","viewer_id","viewed_at"],
  story_likes: ["story_id","user_id"],
  post_likes: ["post_id","user_id"],
  chat_messages: ["conversation_id","sender_id","reply_to","body","delivered_at","read_at"],
  group_covers: [], // Read-only: only v10_set_group_cover RPC may update it.
  sticker_catalog: ["slug","title","owner_id","storage_path","byte_size","source_name","content_sha256"], // RLS restricts owner uploads to verified storage paths; no external URLs.
  sticker_favorites: ["user_id","sticker_id"],
  chat_sticker_messages: ["message_id","conversation_id","sticker_id","sender_id"],
  chat_media: ["conversation_id","message_id","created_by","storage_path","mime_type","byte_size","file_name"],
  archived_cards: ["body","is_private","password_hint","password_hints"],
  admin_music_track_comments: ["author_id","recipient_id","playlist_id","video_id","track_title","body"],
  community_letters: ["sender_id","recipient_id","subject","body","is_protected","password_salt","password_iv","password_ciphertext","attachments","password_hint","password_hints"],
  archived_card_reads: ["card_id","user_id","read_at"],
  // RLS permits only the authenticated user to acknowledge active announcements.
  global_announcement_reads: ["announcement_id","user_id"],
  music_library: ["owner_id","title","artist","listen_url","note"],
  music_dedications: ["sender_id","recipient_id","title","artist","listen_url","dedication_note"],
  music_comments: ["dedication_id","author_id","body","visibility"],
  music_page_comments: ["comment_type","playlist_id","video_id","author_id","body","recipient_id"],
  music_track_comments: ["track_key","track_title","author_id","body"],
  archive_media: [], // Read/delete only; RLS authorizes the verified ADM.
  community_gallery_media: ["owner_id","storage_path","file_name","kind","mime_type","byte_size","caption","visibility","comment_access","publication_state","private_owner_id"],
  gallery_media_descriptions: ["user_id","source","media_id","description","category"],
  gallery_media_people: ["source","media_id","person_id","created_by"],
  gallery_media_viewers: ["media_id","user_id"],
  gallery_private_items: ["user_id","source","media_id","owner_private"],
  gallery_albums: ["owner_id","name"],
  gallery_album_items: ["album_id","source","media_id"],
  gallery_media_adjustments: ["source","media_id","rotation","position_x","position_y"],
  community_gallery_comments: ["media_id","user_id","body","parent_comment_id"],
  community_gallery_media_likes: ["media_id","user_id"],
  gallery_media_pins: ["source","media_id"],
  archive_media_comments: ["media_id","user_id","body","parent_comment_id"],
  archive_media_likes: ["media_id","user_id"],
  conversation_participants: ["conversation_id","user_id","last_read_at"],
  conversation_favorites: ["conversation_id","user_id"],
  // Client-side nickname updates use a per-user, per-conversation RLS table.
  conversation_nicknames: ["user_id","conversation_id","nickname","updated_at"],
  conversations: ["kind","created_by","subject","direct_key"],
  letter_event_notifications: ["read_at","notified_at"],
  notifications: ["read_at"],
  chat_notifications: ["read_at"],
  looply_admin_activity_notifications: ["read_at"],
  app_settings: []
});
const plainIdentifier = /^[a-z][a-z0-9_]*$/;
const tableIsAllowed = table => plainIdentifier.test(table) && !table.startsWith("neon_");
function safePayload(table, payload) {
  const allowed = WRITABLE[table];
  if (!allowed || !allowed.length) throw new Error("neon_feature_write_api_not_migrated");
  const rows = Array.isArray(payload) ? payload : [payload];
  if (!rows.length || rows.some(row=>!row || typeof row!=="object" || Object.keys(row).some(key=>!allowed.includes(key)))) {
    throw new Error("neon_unpermitted_fields");
  }
  return payload;
}
function errorResult(message, status = 0, code = "") {
  return { data:null, count:null, error: {message, status, code} };
}
function filterValue(op,value) {
  if (op==="in") return "in.("+value.map(v=>'"'+String(v).replaceAll('"','\\"')+'"').join(",")+")";
  if (op==="is") return "is."+String(value);
  if (op==="not") return "not."+String(value);
  return op+"."+String(value);
}
export function createNeonRestQuery(table, {dataApiUrl,getAccessToken,fetchImpl=fetch}) {
  if (!tableIsAllowed(table)) throw new Error("neon_invalid_table");
  const state={columns:"*",filters:[],orders:[],max:null,range:null,mode:"select",payload:null,head:false,count:null,conflict:null};
  const q={
    select(columns="*", options={}) {state.columns=columns;state.head=options.head===true;state.count=options.count||null;return q;},
    eq(k,v){state.filters.push(["eq",k,v]);return q;},
    neq(k,v){state.filters.push(["neq",k,v]);return q;},
    is(k,v){state.filters.push(["is",k,v]);return q;},
    in(k,v){state.filters.push(["in",k,v]);return q;},
    gt(k,v){state.filters.push(["gt",k,v]);return q;},
    gte(k,v){state.filters.push(["gte",k,v]);return q;},
    lt(k,v){state.filters.push(["lt",k,v]);return q;},
    lte(k,v){state.filters.push(["lte",k,v]);return q;},
    ilike(k,v){state.filters.push(["ilike",k,v]);return q;},
    or(expression){state.filters.push(["or",null,expression]);return q;},
    not(k,op,v){state.filters.push(["not",k,op+"."+v]);return q;},
    insert(payload){state.mode="insert";state.payload=payload;return q;},
    upsert(payload,options={}){state.mode="upsert";state.payload=payload;state.conflict=options.onConflict||null;return q;},
    update(payload){state.mode="update";state.payload=payload;return q;},
    delete(){state.mode="delete";return q;},
    order(column,options={}){state.orders.push(column+"."+(options.ascending===false?"desc":"asc")+(options.nullsFirst===true?".nullsfirst":options.nullsFirst===false?".nullslast":""));return q;},
    limit(n){state.max=Number(n);return q;},
    range(a,b){state.range={from:Number(a),to:Number(b)};return q;},
    maybeSingle(){return q.then(r=>r.error?r:r.data?.length>1?errorResult("multiple_rows"): {data:r.data?.[0]||null,error:null,count:r.count});},
    single(){return q.then(r=>r.error?r:r.data?.length!==1?errorResult("row_count_mismatch"): {data:r.data[0],error:null,count:r.count});},
    then(resolve,reject){return execute().then(resolve,reject)}
  };
  async function execute() {
    try{
      const token=await getAccessToken();
      if(!token)return errorResult("neon_session_required",401);
      const isWrite=state.mode!=="select";
      if(isWrite&&state.mode!=="delete")safePayload(table,state.payload);
      if(isWrite&&state.mode==="delete"&&!WRITABLE[table])return errorResult("neon_feature_write_api_not_migrated");
      // Mark-all only touches RLS-scoped notification rows, with one permitted
      // column and the explicit unread-only predicate. Never generalize this
      // exception to posts, messages or administrator data.
      const scopedUnreadUpdate = state.mode === "update"
        && ["notifications","chat_notifications","looply_admin_activity_notifications"].includes(table)
        && state.filters.length === 1
        && state.filters[0][0] === "is"
        && state.filters[0][1] === "read_at"
        && state.filters[0][2] === null
        && Object.keys(state.payload || {}).length === 1
        && typeof state.payload?.read_at === "string"
        && Number.isFinite(Date.parse(state.payload.read_at));
      if(["update","delete"].includes(state.mode)
        && !state.filters.some(([op,col])=>op==="eq"&&plainIdentifier.test(col))
        && !scopedUnreadUpdate) return errorResult("neon_update_requires_owner_filter");
      const url=new URL(String(dataApiUrl).replace(/\/$/,"")+"/"+table);
      url.searchParams.set("select",state.columns);
      for(const [op,column,value] of state.filters){
        if(op==="or"){const expr=String(value).trim();url.searchParams.append("or",expr.startsWith("(")&&expr.endsWith(")")?expr:"("+expr+")");continue;}
        if(!plainIdentifier.test(column))return errorResult("neon_invalid_filter");
        url.searchParams.append(column,filterValue(op,value));
      }
      if(state.orders.length)url.searchParams.set("order",state.orders.join(","));
      if(state.range){
        if(!Number.isSafeInteger(state.range.from)||!Number.isSafeInteger(state.range.to)||state.range.from<0||state.range.to<state.range.from)return errorResult("invalid_range");
        url.searchParams.set("offset",String(state.range.from));url.searchParams.set("limit",String(state.range.to-state.range.from+1));
      }else if(state.max!==null&&state.mode==="select"){url.searchParams.set("limit",String(state.max));}
      if(state.conflict)url.searchParams.set("on_conflict",state.conflict);
      const method=state.mode==="select"?(state.head?"HEAD":"GET"):state.mode==="update"?"PATCH":state.mode==="delete"?"DELETE": "POST";
      const preferences=[];
      if(isWrite)preferences.push("return=representation");
      if(state.mode==="upsert")preferences.push("resolution=merge-duplicates");
      if(state.count)preferences.push("count="+state.count);
      const response=await fetchImpl(url.toString(),{method,cache:"no-store",headers:{
        authorization:"Bearer "+token,accept:"application/json",
        ...(isWrite&&state.mode!=="delete"?{"content-type":"application/json"}:{}),
        ...(preferences.length?{prefer:preferences.join(',')}:{})
      },...(isWrite&&state.mode!=="delete"?{body:JSON.stringify(state.payload)}:{})});
      if(!response.ok){
        const body=await response.json().catch(()=>({}));
        return errorResult(typeof body?.message==="string"?body.message:"neon_data_api_request_failed",response.status,String(body?.code||""));
      }
      const contentRange=response.headers.get("content-range")||"";
      const count=state.count?(Number(contentRange.split("/")[1])||0):null;
      if(state.head||response.status===204)return {data:[],error:null,count};
      const rows=await response.json();
      return {data:Array.isArray(rows)?rows:rows==null?[]:[rows],error:null,count};
    }catch(e){return errorResult(e?.message||"neon_data_api_unavailable",Number(e?.status||0),e?.code||"");}
  }
  return q;
}
