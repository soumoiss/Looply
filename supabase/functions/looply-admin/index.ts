import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// These server-only RPCs are maintained in SQL migrations rather than a generated Database type.
type UntypedServiceClient = Omit<SupabaseClient<any, any, any, any, any>, "rpc"> & {
  rpc: (...args: any[]) => Promise<any>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const allowedResources = new Set([
  "posts", "music_dedications", "music_library", "youtube_track_comments", "profiles", "post_media", "music_comments", "conversations", "letters", "chat_messages", "archive_media", "archive_media_comments", "archived_cards", "audit", "announcements", "stories", "community_gallery_media", "community_letters"
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cardPasswordIterations = 210_000;

async function isLooplyAdmin(service: UntypedServiceClient, userId: string) {
  const { data, error } = await service.rpc("is_looply_admin", { p_user_id: userId });
  if (error) throw error;
  return data === true;
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function defaultKey(dictionaryName: string, legacyName: string) {
  const raw = Deno.env.get(dictionaryName);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.default) return String(parsed.default);
  }
  return Deno.env.get(legacyName) || "";
}

function decodeBase64Url(value: string) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyArchivedCardPassword(password: string, saltText: string, hashText: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: decodeBase64Url(saltText), iterations: cardPasswordIterations, hash: "SHA-256" }, key, 256);
  const actual = new Uint8Array(bits);
  const expected = decodeBase64Url(hashText);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

async function recordAccess(service: UntypedServiceClient, actorId: string, event: string, resourceType: string, resourceId: string | null, purpose: string, requestId: string, metadata: Record<string, unknown> = {}) {
  const { error } = await service.rpc("record_looply_admin_access", {
    p_actor_id: actorId,
    p_event: event,
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_purpose: purpose,
    p_request_id: requestId,
    p_metadata: metadata
  });
  if (error) throw error;
}

function adminAuditPurpose(action: string, resourceType: string) {
  const safeAction = action.replace(/[^a-z0-9_:-]/gi, "").slice(0, 80) || "access";
  const safeResource = resourceType.replace(/[^a-z0-9_:-]/gi, "").slice(0, 80) || "resource";
  return `ADM ${safeAction} on ${safeResource}`;
}

async function removeStoragePaths(service: UntypedServiceClient, bucket: string, paths: string[]) {
  const uniquePaths = [...new Set(paths.map(String).filter(Boolean))];
  if (!uniquePaths.length) return;
  const { error } = await service.storage.from(bucket).remove(uniquePaths);
  if (error) throw error;
}

async function deleteContent(service: UntypedServiceClient, contentType: string, contentId: string) {
  const storage: Array<{ bucket: string; paths: string[] }> = [];
  const removeRows = async (table: string, column = "id", value = contentId) => {
    const { error } = await service.from(table).delete().eq(column, value);
    if (error) throw error;
  };
  if (contentType === "post") {
    const [{ data: media, error: mediaError }, { data: commentMedia, error: commentMediaError }] = await Promise.all([
      service.from("post_media").select("storage_path").eq("post_id", contentId),
      service.from("comment_media").select("storage_path").eq("post_id", contentId)
    ]);
    if (mediaError) throw mediaError;
    if (commentMediaError) throw commentMediaError;
    storage.push({ bucket: "looply-media", paths: [...(media || []), ...(commentMedia || [])].map((row: any) => row.storage_path) });
    await removeStoragePaths(service, "looply-media", storage[0].paths);
    await removeRows("posts");
  } else if (contentType === "comment") {
    const { data: media, error } = await service.from("comment_media").select("storage_path").eq("comment_id", contentId);
    if (error) throw error;
    await removeStoragePaths(service, "looply-media", (media || []).map((row: any) => row.storage_path));
    await removeRows("comments");
  } else if (contentType === "story") {
    const { data: media, error } = await service.from("story_media").select("storage_path").eq("story_id", contentId);
    if (error) throw error;
    await removeStoragePaths(service, "looply-media", (media || []).map((row: any) => row.storage_path));
    await removeRows("stories");
  } else if (contentType === "community_gallery_media") {
    const { data: media, error } = await service.from("community_gallery_media").select("storage_path").eq("id", contentId).maybeSingle();
    if (error) throw error;
    await removeStoragePaths(service, "looply-gallery", media ? [media.storage_path] : []);
    await removeRows("community_gallery_media");
  } else if (contentType === "archive_media") {
    const { data: media, error } = await service.from("archive_media").select("storage_path").eq("id", contentId).maybeSingle();
    if (error) throw error;
    await removeStoragePaths(service, "looply-media", media ? [media.storage_path] : []);
    await removeRows("archive_media");
  } else if (contentType === "chat_message") {
    const { data: media, error } = await service.from("chat_media").select("storage_path").eq("message_id", contentId);
    if (error) throw error;
    await removeStoragePaths(service, "looply-chat", (media || []).map((row: any) => row.storage_path));
    await removeRows("chat_messages");
  } else if (contentType === "chat_media") {
    const { data: media, error } = await service.from("chat_media").select("storage_path").eq("id", contentId).maybeSingle();
    if (error) throw error;
    await removeStoragePaths(service, "looply-chat", media ? [media.storage_path] : []);
    await removeRows("chat_media");
  } else if (contentType === "conversation") {
    const { data: media, error } = await service.from("chat_media").select("storage_path").eq("conversation_id", contentId);
    if (error) throw error;
    await removeStoragePaths(service, "looply-chat", (media || []).map((row: any) => row.storage_path));
    await removeRows("conversations");
  } else if (contentType === "community_letter") {
    await removeRows("community_letters");
  } else if (contentType === "music_dedication") {
    await removeRows("music_dedications");
  } else if (contentType === "music_library") {
    await removeRows("music_library");
  } else if (contentType === "music_page_comment") {
    await removeRows("music_page_comments");
  } else {
    throw new Error("unsupported_content_deletion");
  }
  return { contentType, contentId, storageCleaned: storage.length > 0 };
}

async function loadResource(service: UntypedServiceClient, actorId: string, resourceType: string, resourceId: string | null, offset = 0) {
  if (resourceType === "audit") {
    const { data, error } = await service.rpc("read_looply_admin_audit", { p_actor_id: actorId, p_limit: 100, p_offset: offset });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  if (resourceType === "archived_cards") {
    const { data, error } = await service.rpc("read_looply_admin_archived_cards", {
      p_actor_id: actorId,
      p_card_id: resourceId,
      p_limit: resourceId ? 1 : 100
    });
    if (error) throw error;
    const cards = Array.isArray(data) ? data : [];
    const recipientIds = [...new Set(cards.map((card: any) => String(card.recipient_id || "")).filter(Boolean))];
    if (!recipientIds.length) return cards;
    const { data: profiles, error: profilesError } = await service.from("profiles").select("id,username,display_name").in("id", recipientIds);
    if (profilesError) throw profilesError;
    const recipients = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
    return cards.map((card: any) => ({ ...card, recipient: recipients.get(card.recipient_id) || null }));
  }

  if (resourceType === "archive_media") {
    let query = service.from("archive_media")
      .select("id,source_path,file_name,description,storage_path,kind,mime_type,byte_size,visibility,comment_access,source_date,created_at,recipients:archive_media_recipients(user_id,profile:profiles!archive_media_recipients_user_id_fkey(username,display_name)),commenters:archive_media_commenters(user_id,profile:profiles!archive_media_commenters_user_id_fkey(username,display_name))")
      .order("source_path");
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query.range(offset, offset + 99);
    if (result.error) throw result.error;
    const rows: any[] = result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
    if (rows.length) {
      const { data: flags, error: flagsError } = await service.from("looply_content_moderation")
        .select("content_id").eq("content_type", "archive_media").in("content_id", rows.map((row: any) => row.id));
      if (flagsError) throw flagsError;
      const hidden = new Set((flags || []).map((flag: any) => flag.content_id));
      for (const row of rows) row.moderated = hidden.has(row.id);
    }
    return rows;
  }

  if (resourceType === "archive_media_comments") {
    let query = service.from("archive_media_comments")
      .select("id,media_id,author_id,body,audience,created_at,author:profiles!archive_media_comments_author_id_fkey(username,display_name),media:archive_media!archive_media_comments_media_id_fkey(id,source_path,file_name,visibility)")
      .order("created_at", { ascending: false }).limit(resourceId ? 1 : 100);
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query;
    if (result.error) throw result.error;
    const rows: any[] = result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
    if (rows.length) {
      const { data: flags, error: flagsError } = await service.from("looply_content_moderation")
        .select("content_id").eq("content_type", "archive_media_comment").in("content_id", rows.map((row: any) => row.id));
      if (flagsError) throw flagsError;
      const hidden = new Set((flags || []).map((flag: any) => flag.content_id));
      for (const row of rows) row.moderated = hidden.has(row.id);
    }
    return rows;
  }

  if (resourceType === "posts") {
    let query = service.from("posts")
      .select("id,author_id,body,visibility,created_at,updated_at,author:profiles!posts_author_id_fkey(id,username,display_name,bio,profile_visibility),comments(id,author_id,parent_comment_id,body,created_at,author:profiles!comments_author_id_fkey(id,username,display_name)),media:post_media(id,storage_path,kind,mime_type,byte_size,alt_text,created_at)")
      .order("created_at", { ascending: false }).limit(resourceId ? 1 : 30);
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query;
    if (result.error) throw result.error;
    const rows: any[] = result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
    const ids = [...new Set(rows.flatMap((row: any) => [row.id, ...(row.comments || []).map((comment: any) => comment.id)]))];
    if (ids.length) {
      const { data: moderation, error: moderationError } = await service.from("looply_content_moderation")
        .select("content_type,content_id").in("content_id", ids);
      if (moderationError) throw moderationError;
      const hidden = new Set((moderation || []).map((entry: any) => entry.content_type + ":" + entry.content_id));
      for (const row of rows) {
        row.moderated = hidden.has("post:" + row.id);
        for (const comment of row.comments || []) comment.moderated = hidden.has("comment:" + comment.id);
      }
    }
    return rows;
  }

  if (resourceType === "music_dedications") {
    let query = service.from("music_dedications")
      .select("id,sender_id,recipient_id,title,artist,listen_url,dedication_note,created_at,sender:profiles!music_dedications_sender_id_fkey(id,username,display_name),recipient:profiles!music_dedications_recipient_id_fkey(id,username,display_name),comments:music_comments(id,author_id,body,visibility,created_at,author:profiles!music_comments_author_id_fkey(id,username,display_name))")
      .order("created_at", { ascending: false }).limit(resourceId ? 1 : 30);
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query;
    if (result.error) throw result.error;
    return result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
  }

  if (resourceType === "music_library") {
    let query = service.from("music_library")
      .select("id,owner_id,title,artist,listen_url,note,created_at,updated_at,owner:profiles!music_library_owner_id_fkey(id,username,display_name)")
      .order("created_at", { ascending: false }).limit(resourceId ? 1 : 50);
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query;
    if (result.error) throw result.error;
    return result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
  }

  if (resourceType === "youtube_track_comments") {
    let query = service.from("music_page_comments")
      .select("id,playlist_id,video_id,body,created_at,author_id,author:profiles!music_page_comments_author_id_fkey(id,username,display_name)")
      .eq("comment_type", "track").order("created_at", { ascending: false }).limit(resourceId ? 1 : 100);
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query;
    if (result.error) throw result.error;
    const rows: any[] = result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
    if (rows.length) {
      const { data: flags, error: flagsError } = await service.from("looply_content_moderation")
        .select("content_id").eq("content_type", "music_page_comment").in("content_id", rows.map((row: any) => row.id));
      if (flagsError) throw flagsError;
      const hidden = new Set((flags || []).map((flag: any) => flag.content_id));
      for (const row of rows) row.moderated = hidden.has(row.id);
    }
    return rows;
  }

  if (resourceType === "profiles") {
    let query = service.from("profiles")
      .select("id,username,display_name,bio,profile_visibility,created_at,updated_at")
      .order("username").range(offset, offset + 99);
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query;
    if (result.error) throw result.error;
    return result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
  }

  if (resourceType === "post_media") {
    let query = service.from("post_media")
      .select("id,post_id,storage_path,kind,mime_type,byte_size,alt_text,created_at,post:posts(id,author_id,body,visibility,created_at)")
      .order("created_at", { ascending: false }).limit(resourceId ? 1 : 50);
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query;
    if (result.error) throw result.error;
    return result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
  }

  if (resourceType === "stories") {
    let query = service.from("stories")
      .select("id,author_id,body,visibility,created_at,expires_at,author:profiles!stories_author_id_fkey(id,username,display_name),media:story_media(id,storage_path,kind,mime_type,byte_size,alt_text,created_at)")
      .order("created_at", { ascending: false });
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query.range(offset, offset + 49);
    if (result.error) throw result.error;
    const rows: any[] = result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
    if (rows.length) {
      const { data: flags, error } = await service.from("looply_content_moderation")
        .select("content_id").eq("content_type", "story").in("content_id", rows.map((row: any) => row.id));
      if (error) throw error;
      const hidden = new Set((flags || []).map((flag: any) => flag.content_id));
      rows.forEach((row) => { row.moderated = hidden.has(row.id); });
    }
    return rows;
  }

  if (resourceType === "community_gallery_media") {
    let query = service.from("community_gallery_media")
      .select("id,owner_id,storage_path,file_name,kind,mime_type,byte_size,caption,publication_state,created_at,owner:profiles!community_gallery_media_owner_id_fkey(id,username,display_name)")
      .order("created_at", { ascending: false });
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query.range(offset, offset + 49);
    if (result.error) throw result.error;
    const rows: any[] = result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
    if (rows.length) {
      const { data: flags, error } = await service.from("looply_content_moderation")
        .select("content_id").eq("content_type", "community_gallery_media").in("content_id", rows.map((row: any) => row.id));
      if (error) throw error;
      const hidden = new Set((flags || []).map((flag: any) => flag.content_id));
      rows.forEach((row) => { row.moderated = hidden.has(row.id); row.bucket_id = "looply-gallery"; });
    }
    return rows;
  }

  if (resourceType === "letters") {
    let query = service.from("letters")
      .select("id,conversation_id,sender_id,recipient_id,subject,initial_message_id,created_at,sender:profiles!letters_sender_id_fkey(id,username,display_name),recipient:profiles!letters_recipient_id_fkey(id,username,display_name),initial_message:chat_messages!letters_initial_message_fk(id,body,created_at)")
      .order("created_at", { ascending: false }).limit(resourceId ? 1 : 30);
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query;
    if (result.error) throw result.error;
    return result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
  }

  if (resourceType === "conversations") {
    let query = service.from("conversations")
      .select("id,kind,subject,created_by,created_at,updated_at,participants:conversation_participants(user_id,joined_at,profile:profiles!conversation_participants_user_id_fkey(id,username,display_name))")
      .order("updated_at", { ascending: false }).limit(resourceId ? 1 : 40);
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query;
    if (result.error) throw result.error;
    return result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
  }

  if (resourceType === "chat_messages") {
    let query = service.from("chat_messages")
      .select("id,conversation_id,sender_id,body,created_at,author:profiles!chat_messages_sender_id_fkey(id,username,display_name),conversation:conversations!chat_messages_conversation_id_fkey(id,kind,subject),media:chat_media!chat_media_message_fk(id,storage_path,mime_type,file_name,byte_size,created_at)")
      .order("created_at", { ascending: false }).limit(resourceId ? 1 : 60);
    if (resourceId) query = query.eq("id", resourceId);
    const result = resourceId ? await query.maybeSingle() : await query;
    if (result.error) throw result.error;
    return result.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
  }

  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { error: "Use POST." });

  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) return respond(401, { error: "Sign in is required." });

  try {
    const projectUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishableKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secretKey = defaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!projectUrl || !publishableKey || !secretKey) throw new Error("Required Supabase function environment is missing.");

    const userClient = createClient(projectUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } }
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return respond(401, { error: "The session is invalid or expired." });

    const service = createClient(projectUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as UntypedServiceClient;
    const payload = await request.json().catch(() => ({}));
    const requestId = crypto.randomUUID();

    if (payload.action === "unlock_archived_card") {
      const cardId = String(payload.cardId || "");
      const password = String(payload.password || "");
      if (!uuidPattern.test(cardId) || password.length < 1 || password.length > 256) {
        return respond(400, { error: "invalid_card_unlock" });
      }
      const { data: secret, error: secretError } = await service.rpc("read_looply_archived_card_secret", {
        p_actor_id: authData.user.id,
        p_card_id: cardId
      });
      if (secretError || !secret) return respond(403, { error: "card_unavailable" });
      const { data: unlockAllowed, error: attemptError } = await service.rpc("consume_looply_archived_card_unlock", {
        p_actor_id: authData.user.id,
        p_card_id: cardId
      });
      if (attemptError) throw attemptError;
      if (unlockAllowed !== true) return respond(429, { error: "too_many_unlock_attempts" });
      if (!await verifyArchivedCardPassword(password, secret.password_salt, secret.password_hash)) {
        return respond(200, { error: "incorrect_password" });
      }
      const { error: resetError } = await service.rpc("reset_looply_archived_card_unlock", {
        p_actor_id: authData.user.id,
        p_card_id: cardId
      });
      if (resetError) throw resetError;
      return respond(200, { body: secret.body });
    }

    const action = String(payload.action || "");
    const requestedType = String(payload.resourceType || (action.startsWith("broadcast_") ? "announcements" : ""));
    const resourceType = allowedResources.has(requestedType) ? requestedType : "posts";
    const { data: isAdmin, error: membershipError } = await service.rpc("is_looply_admin", { p_user_id: authData.user.id });
    if (membershipError) throw membershipError;

    if (action.startsWith("admin_session_")) {
      if (isAdmin !== true) {
        await recordAccess(service, authData.user.id, "access_denied", "admin_session", null,
          "Attempted protected admin session action without verified administrator membership.", requestId,
          { action });
        return respond(403, { error: "Administrator membership is required." });
      }

      if (action === "admin_session_status") {
        const { data, error } = await service.rpc("looply_admin_session_status", { p_actor_id: authData.user.id });
        if (error) throw error;
        return respond(200, { ...data, isAdmin: true });
      }

      if (action === "admin_session_setup") {
        const password = String(payload.password || "");
        if (password.length < 12 || password.length > 256) {
          return respond(400, { error: "admin_password_length" });
        }
        const { data: created, error } = await service.rpc("looply_admin_session_setup", {
          p_actor_id: authData.user.id,
          p_password: password
        });
        if (error) throw error;
        await recordAccess(service, authData.user.id, created ? "admin_session_credential_created" : "admin_session_setup_rejected",
          "admin_session", null, "Initial protected administrator credential setup.", requestId);
        return respond(created ? 200 : 409, { configured: created === true, error: created ? null : "already_configured" });
      }

      if (action === "admin_session_unlock") {
        const password = String(payload.password || "");
        if (!password || password.length > 256) return respond(400, { error: "invalid_admin_password" });
        const token = randomSessionToken();
        const tokenHash = await sha256Hex(token);
        const { data, error } = await service.rpc("looply_admin_session_unlock", {
          p_actor_id: authData.user.id,
          p_password: password,
          p_token_hash: tokenHash
        });
        if (error) throw error;
        if (data?.ok !== true) {
          await recordAccess(service, authData.user.id, data?.limited ? "admin_session_rate_limited" : "admin_session_unlock_failed",
            "admin_session", null, "Protected administrator session unlock attempt.", requestId);
          return respond(data?.limited ? 429 : 403, {
            error: data?.limited ? "admin_session_rate_limited" : data?.configured === false ? "admin_session_not_configured" : "incorrect_admin_password",
            retryAt: data?.retry_at || null
          });
        }
        await recordAccess(service, authData.user.id, "admin_session_unlocked", "admin_session", null,
          "Protected administrator session created with a 15-minute expiry.", requestId,
          { expires_at: data.expires_at });
        return respond(200, { token, expiresAt: data.expires_at });
      }

      if (action === "admin_session_revoke") {
        const token = String(payload.token || "");
        const tokenHash = token ? await sha256Hex(token) : null;
        const { data: revokedCount, error } = await service.rpc("looply_admin_session_revoke", {
          p_actor_id: authData.user.id,
          p_token_hash: tokenHash
        });
        if (error) throw error;
        await recordAccess(service, authData.user.id, "admin_session_revoked", "admin_session", null,
          "Protected administrator session revoked by its administrator.", requestId,
          { revoked_count: Number(revokedCount || 0), all_sessions: !token });
        return respond(200, { revoked: Number(revokedCount || 0) });
      }

      if (action === "admin_session_validate") {
        const token = String(payload.token || "");
        if (!/^[0-9a-f]{64}$/.test(token)) return respond(200, { active: false });
        const { data: active, error } = await service.rpc("looply_admin_session_validate", {
          p_actor_id: authData.user.id,
          p_token_hash: await sha256Hex(token)
        });
        if (error) throw error;
        return respond(200, { active: active === true });
      }
    }

    if (requestedType === "status") return respond(200, { isAdmin: isAdmin === true });
    if (isAdmin !== true) {
      await recordAccess(service, authData.user.id, "access_denied", resourceType, null,
        "Attempted administrative access without a verified membership.", requestId);
      return respond(403, { error: "Administrator membership is required." });
    }
    const adminSessionToken = String(payload.adminSessionToken || "");
    if (!/^[0-9a-f]{64}$/.test(adminSessionToken)) {
      return respond(423, { error: "admin_session_locked" });
    }
    const { data: sessionActive, error: sessionError } = await service.rpc("looply_admin_session_validate", {
      p_actor_id: authData.user.id,
      p_token_hash: await sha256Hex(adminSessionToken)
    });
    if (sessionError) throw sessionError;
    if (sessionActive !== true) {
      await recordAccess(service, authData.user.id, "admin_session_required", "admin_session", null,
        "Administrative action rejected because no active protected session was presented.", requestId,
        { action });
      return respond(423, { error: "admin_session_expired_or_revoked" });
    }

    if (!allowedResources.has(requestedType)) return respond(400, { error: "Unsupported administrative resource." });

    // Legacy client input is deliberately ignored: const purpose = String(payload.purpose || "").trim();
    // Legacy purpose.length < 20 validation is intentionally removed for direct ADM actions.
    const purpose = adminAuditPurpose(action, resourceType);
    if (action === "user_check_availability") {
      const username = String(payload.username || "").trim().toLowerCase();
      const email = String(payload.email || "").trim().toLowerCase();
      const usernameValid = /^[a-z0-9_]{3,30}$/.test(username);
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
      let usernameAvailable: boolean | null = null;
      let emailAvailable: boolean | null = null;
      if (usernameValid) {
        const [{ data: profile, error: profileError }, { data: pending, error: pendingError }] = await Promise.all([
          service.from("profiles").select("id").eq("username", username).maybeSingle(),
          service.from("looply_user_invites").select("username").eq("username", username).maybeSingle()
        ]);
        if (profileError) throw profileError;
        if (pendingError) throw pendingError;
        usernameAvailable = !profile && !pending;
      }
      if (emailValid) {
        const { data: authUsers, error: authUsersError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (authUsersError) throw authUsersError;
        const { data: pendingEmail, error: pendingEmailError } = await service.from("looply_user_invites")
          .select("email").eq("email", email).maybeSingle();
        if (pendingEmailError) throw pendingEmailError;
        emailAvailable = !(authUsers.users || []).some((user: any) => String(user.email || "").toLowerCase() === email) && !pendingEmail;
      }
      await recordAccess(service, authData.user.id, "availability_checked", "profiles", null, purpose, requestId,
        { action, username_checked: usernameValid, email_checked: emailValid });
      return respond(200, { requestId, usernameAvailable, emailAvailable });
    }

    if (action === "user_create_with_password") {
      const username = String(payload.username || "").trim().replace(/^@/, "").toLowerCase();
      const email = String(payload.email || "").trim().toLowerCase();
      const displayName = String(payload.displayName || "").trim();
      const password = String(payload.password || "");
      const playlistUrl = String(payload.playlistUrl || "").trim();
      if (!/^[a-z0-9_]{3,30}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          || email.length > 254 || displayName.length < 1 || displayName.length > 80
          || password.length < 8 || password.length > 72
          || (playlistUrl && !/^https:\/\/(?:www\.|music\.)?youtube\.com\/playlist\?list=[A-Za-z0-9_-]{1,100}(?:&[^#]*)?$/.test(playlistUrl))) {
        return respond(400, { error: "invalid_user_creation_fields" });
      }
      await recordAccess(service, authData.user.id, "write_requested", "profiles", null, purpose, requestId,
        { action, username, email });
      let createdUserId: string | null = null;
      try {
        const [{ data: existingProfile, error: profileLookupError }, { data: existingInvite, error: inviteLookupError },
          { data: authUsers, error: authUsersError }] = await Promise.all([
          service.from("profiles").select("id").eq("username", username).maybeSingle(),
          service.from("looply_user_invites").select("username").eq("username", username).maybeSingle(),
          service.auth.admin.listUsers({ page: 1, perPage: 1000 })
        ]);
        if (profileLookupError) throw profileLookupError;
        if (inviteLookupError) throw inviteLookupError;
        if (authUsersError) throw authUsersError;
        if (existingProfile || existingInvite) return respond(409, { error: "username_already_exists" });
        if ((authUsers.users || []).some((user: any) => String(user.email || "").toLowerCase() === email)) {
          return respond(409, { error: "email_already_exists" });
        }
        const { data: created, error: createError } = await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { looply_admin_provisioned: "true" },
          user_metadata: { username, display_name: displayName }
        });
        if (createError) {
          if (/already registered|already exists/i.test(String(createError.message || ""))) {
            return respond(409, { error: "email_already_exists" });
          }
          throw createError;
        }
        createdUserId = created.user?.id || null;
        if (!createdUserId) throw new Error("Auth user creation returned no user ID.");
        const { data: profile, error: profileError } = await service.from("profiles")
          .select("id,username,display_name").eq("id", createdUserId).maybeSingle();
        if (profileError) throw profileError;
        if (!profile) throw new Error("Auth profile trigger did not create a Looply profile.");
        if (playlistUrl) {
          const { error: playlistError } = await service.from("profiles")
            .update({ playlist_url: playlistUrl }).eq("id", createdUserId);
          if (playlistError) throw playlistError;
        }
        await recordAccess(service, authData.user.id, "write_completed", "profiles", createdUserId, purpose, requestId,
          { action, username, email });
        return respond(200, { requestId, userId: createdUserId, username, email, displayName: profile.display_name, playlistUrl: playlistUrl || null, created: true });
      } catch (error) {
        if (createdUserId) {
          const { error: deleteError } = await service.auth.admin.deleteUser(createdUserId);
          if (deleteError) console.error("Looply user-create rollback failed", deleteError);
        }
        await recordAccess(service, authData.user.id, "write_failed", "profiles", createdUserId, purpose, requestId,
          { action, username, reason: errorMessage(error, "User creation failed.").slice(0, 200) });
        throw error;
      }
    }

    const resourceId = payload.resourceId == null || payload.resourceId === "" ? null : String(payload.resourceId);
    if (resourceId && !uuidPattern.test(resourceId)) return respond(400, { error: "Resource ID must be a UUID." });
    const offset = Number(payload.offset ?? 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) return respond(400, { error: "Archive media position is invalid." });

    if (action === "moderate_content") {
      const contentType = String(payload.contentType || "");
      const contentId = String(payload.contentId || "");
      const hidden = payload.hidden === true;
      const suppliedReason = String(payload.reason || "").trim();
      const reason = suppliedReason || adminAuditPurpose(action, contentType);
      const tableByContentType: Record<string, string> = {
        post: "posts",
        comment: "comments",
        archive_media: "archive_media",
        archive_media_comment: "archive_media_comments",
        music_page_comment: "music_page_comments"
      };
      const auditResourceByContentType: Record<string, string> = {
        post: "posts", comment: "posts", archive_media: "archive_media",
        archive_media_comment: "archive_media_comments", music_page_comment: "youtube_track_comments",
        story: "stories", community_gallery_media: "community_gallery_media"
      };
      const tableName = tableByContentType[contentType];
      const auditResourceType = auditResourceByContentType[contentType];
      if (!tableName || !uuidPattern.test(contentId) || suppliedReason.length > 500) {
        return respond(400, { error: "invalid_moderation_request" });
      }
      const { data: target, error: targetError } = await service.from(tableName).select("id").eq("id", contentId).maybeSingle();
      if (targetError) throw targetError;
      if (!target) return respond(404, { error: "content_not_found" });
      await recordAccess(service, authData.user.id, "moderation_requested", auditResourceType, contentId, reason, requestId,
        { action, content_type: contentType, hidden });
      try {
        if (hidden) {
          const { error } = await service.from("looply_content_moderation").upsert({
            content_type: contentType, content_id: contentId, reason, moderated_by: authData.user.id
          }, { onConflict: "content_type,content_id" });
          if (error) throw error;
        } else {
          const { error } = await service.from("looply_content_moderation")
            .delete().eq("content_type", contentType).eq("content_id", contentId);
          if (error) throw error;
        }
        await recordAccess(service, authData.user.id, "moderation_completed", auditResourceType, contentId, reason, requestId,
          { action, content_type: contentType, hidden });
        return respond(200, { requestId, contentType, contentId, hidden });
      } catch (error) {
        await recordAccess(service, authData.user.id, "moderation_failed", auditResourceType, contentId, reason, requestId,
          { action, content_type: contentType, hidden, reason_error: errorMessage(error, "Moderation failed.").slice(0, 200) });
        throw error;
      }
    }

    if (action === "delete_content") {
      const contentType = String(payload.contentType || "");
      const contentId = String(payload.contentId || "");
      if (!payload.confirmDelete || !uuidPattern.test(contentId)
          || !["post", "comment", "story", "community_gallery_media", "archive_media", "chat_message", "chat_media", "conversation", "community_letter", "music_dedication", "music_library", "music_page_comment"].includes(contentType)) {
        return respond(400, { error: "explicit_delete_confirmation_required" });
      }
      const resourceType = contentType === "post" || contentType === "comment" ? "posts"
        : contentType === "story" ? "stories"
          : contentType === "community_gallery_media" ? "community_gallery_media"
            : contentType === "archive_media" ? "archive_media"
              : contentType === "chat_message" || contentType === "chat_media" || contentType === "conversation" ? "chat_messages"
              : contentType === "music_page_comment" ? "youtube_track_comments"
                : contentType === "community_letter" ? "community_letters"
                  : contentType === "music_dedication" ? "music_dedications" : contentType;
      const purpose = adminAuditPurpose(action, resourceType);
      await recordAccess(service, authData.user.id, "write_requested", resourceType, contentId, purpose, requestId, { action, content_type: contentType });
      try {
        const result = await deleteContent(service, contentType, contentId);
        await recordAccess(service, authData.user.id, "write_completed", resourceType, contentId, purpose, requestId, { action, ...result });
        return respond(200, { requestId, deleted: true, ...result });
      } catch (error) {
        await recordAccess(service, authData.user.id, "write_failed", resourceType, contentId, purpose, requestId, { action, reason: errorMessage(error, "Content deletion failed.").slice(0, 200) });
        throw error;
      }
    }

    if (action === "users_list") {
      await recordAccess(service, authData.user.id, "read_requested", "profiles", null, purpose, requestId, { action });
      try {
        const [{ data: profiles, error: profilesError }, { data: authUsers, error: authUsersError }] = await Promise.all([
          service.from("profiles").select("id,username,display_name,bio,profile_visibility,playlist_url,created_at,updated_at").order("username").limit(500),
          service.auth.admin.listUsers({ page: 1, perPage: 1000 })
        ]);
        if (profilesError) throw profilesError;
        if (authUsersError) throw authUsersError;
        const authById = new Map((authUsers.users || []).map((user: any) => [user.id, user]));
        const users = (profiles || []).map((profile: any) => {
          const authUser: any = authById.get(profile.id);
          return {
            ...profile,
            email: authUser?.email || null,
            emailConfirmed: Boolean(authUser?.email_confirmed_at),
            suspended: Boolean(authUser?.banned_until && new Date(authUser.banned_until).getTime() > Date.now()),
            lastSignInAt: authUser?.last_sign_in_at || null
          };
        });
        await recordAccess(service, authData.user.id, "read_completed", "profiles", null, purpose, requestId, { action, result_count: users.length });
        return respond(200, { requestId, users });
      } catch (error) {
        await recordAccess(service, authData.user.id, "read_failed", "profiles", null, purpose, requestId,
          { action, reason: errorMessage(error, "User list failed.").slice(0, 200) });
        throw error;
      }
    }

    if (action === "user_create_invite") {
      const email = String(payload.email || "").trim().toLowerCase();
      const username = String(payload.username || "").trim().toLowerCase();
      const displayName = String(payload.displayName || "").trim();
      if (!/^[a-z0-9_]{3,30}$/.test(username)
          || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          || email.length > 254 || displayName.length < 1 || displayName.length > 80) {
        return respond(400, { error: "invalid_invitation_fields" });
      }
      await recordAccess(service, authData.user.id, "write_requested", "profiles", null, purpose, requestId,
        { action, username, email });
      let pendingInviteCreated = false;
      try {
        const { data: existingProfile, error: profileLookupError } = await service
          .from("profiles").select("id").eq("username", username).maybeSingle();
        if (profileLookupError) throw profileLookupError;
        if (existingProfile) {
          await recordAccess(service, authData.user.id, "write_failed", "profiles", existingProfile.id, purpose, requestId,
            { action, username, reason: "username_already_exists" });
          return respond(409, { error: "username_already_exists" });
        }

        const { error: inviteInsertError } = await service.from("looply_user_invites").insert({
          username, email, display_name: displayName, invited_by: authData.user.id
        });
        if (inviteInsertError) throw inviteInsertError;
        pendingInviteCreated = true;

        const redirectTo = Deno.env.get("INVITE_REDIRECT_URL") || "https://soumoiss.github.io/Looply/login.html?invite=1";
        const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
          data: { username, display_name: displayName },
          redirectTo
        });
        if (error) throw error;
        await recordAccess(service, authData.user.id, "write_completed", "profiles", data.user?.id || null, purpose, requestId,
          { action, username, email });
        return respond(200, { requestId, userId: data.user?.id || null, username, email, invited: true });
      } catch (error) {
        if (pendingInviteCreated) {
          await service.from("looply_user_invites").delete().eq("username", username).eq("email", email);
        }
        await recordAccess(service, authData.user.id, "write_failed", "profiles", null, purpose, requestId,
          { action, username, reason: errorMessage(error, "User invitation failed.").slice(0, 200) });
        throw error;
      }
    }

    if (action === "user_update_profile") {
      const userId = String(payload.userId || "");
      const displayName = String(payload.displayName || "").trim();
      const bio = String(payload.bio || "").trim();
      const playlistUrl = String(payload.playlistUrl || "").trim();
      const profileVisibility = String(payload.profileVisibility || "");
      if (!uuidPattern.test(userId) || displayName.length < 1 || displayName.length > 80
          || bio.length > 500 || !["members", "private"].includes(profileVisibility)
          || (playlistUrl && !/^https:\/\/(?:www\.|music\.)?youtube\.com\/playlist\?list=[A-Za-z0-9_-]{1,100}(?:&[^#]*)?$/.test(playlistUrl))) {
        return respond(400, { error: "invalid_user_profile_update" });
      }
      await recordAccess(service, authData.user.id, "write_requested", "profiles", userId, purpose, requestId,
        { action, display_name: displayName, profile_visibility: profileVisibility });
      try {
        const { data, error } = await service.from("profiles")
          .update({ display_name: displayName, bio, playlist_url: playlistUrl || null, profile_visibility: profileVisibility, updated_at: new Date().toISOString() })
          .eq("id", userId).select("id,username,display_name,bio,playlist_url,profile_visibility,updated_at").maybeSingle();
        if (error) throw error;
        if (!data) return respond(404, { error: "profile_not_found" });
        await recordAccess(service, authData.user.id, "write_completed", "profiles", userId, purpose, requestId,
          { action, display_name: displayName, profile_visibility: profileVisibility });
        return respond(200, { requestId, user: data });
      } catch (error) {
        await recordAccess(service, authData.user.id, "write_failed", "profiles", userId, purpose, requestId,
          { action, reason: errorMessage(error, "User profile update failed.").slice(0, 200) });
        throw error;
      }
    }

    if (action === "user_set_suspended" || action === "user_restore_access") {
      const userId = String(payload.userId || "");
      if (!uuidPattern.test(userId)) return respond(400, { error: "invalid_user_id" });
      if (userId === authData.user.id) return respond(400, { error: "cannot_change_own_access" });
      const suspended = action === "user_set_suspended";
      await recordAccess(service, authData.user.id, "write_requested", "profiles", userId, purpose, requestId,
        { action, suspended });
      try {
        const { data: target, error: targetError } = await service.auth.admin.getUserById(userId);
        if (targetError) throw targetError;
        if (!target.user) return respond(404, { error: "auth_user_not_found" });
        if (suspended && await isLooplyAdmin(service, userId)) {
          return respond(400, { error: "cannot_suspend_administrator" });
        }
        const { data, error } = await service.auth.admin.updateUserById(userId, {
          ban_duration: suspended ? "876000h" : "none"
        });
        if (error) throw error;
        await recordAccess(service, authData.user.id, "write_completed", "profiles", userId, purpose, requestId,
          { action, suspended });
        return respond(200, { requestId, userId, suspended, bannedUntil: data.user?.banned_until || null });
      } catch (error) {
        await recordAccess(service, authData.user.id, "write_failed", "profiles", userId, purpose, requestId,
          { action, reason: errorMessage(error, "User access update failed.").slice(0, 200) });
        throw error;
      }
    }

    if (action === "broadcast_create") {
      const title = String(payload.title || "").trim();
      const body = String(payload.body || "").trim();
      const expiresText = String(payload.expiresAt || "").trim();
      const expiresAt = expiresText ? new Date(expiresText) : null;
      if (title.length < 1 || title.length > 120 || body.length < 1 || body.length > 4000
          || (expiresAt && (!Number.isFinite(expiresAt.valueOf()) || expiresAt.valueOf() <= Date.now()))) {
        return respond(400, { error: "invalid_broadcast_content_or_expiry" });
      }
      await recordAccess(service, authData.user.id, "write_requested", "announcements", null, purpose, requestId,
        { action, title, expires_at: expiresAt?.toISOString() || null });
      try {
        const { data: announcement, error } = await service.from("global_announcements")
          .insert({ title, body, created_by: authData.user.id, expires_at: expiresAt?.toISOString() || null })
          .select("id,title,body,created_at,expires_at,is_active").single();
        if (error) throw error;
        await recordAccess(service, authData.user.id, "write_completed", "announcements", announcement.id, purpose, requestId,
          { action, title });
        return respond(200, { requestId, announcement });
      } catch (error) {
        await recordAccess(service, authData.user.id, "write_failed", "announcements", null, purpose, requestId,
          { action, reason: errorMessage(error, "Broadcast creation failed.").slice(0, 200) });
        throw error;
      }
    }

    if (action === "broadcast_list") {
      await recordAccess(service, authData.user.id, "read_requested", "announcements", null, purpose, requestId, { action });
      try {
        const { data: announcements, error } = await service.from("global_announcements")
          .select("id,title,body,created_at,starts_at,expires_at,is_active,created_by")
          .order("created_at", { ascending: false }).limit(50);
        if (error) throw error;
        const ids = (announcements || []).map((item: any) => item.id);
        const [{ data: reads, error: readsError }, { data: profiles, error: profilesError }] = ids.length
          ? await Promise.all([
            service.from("global_announcement_reads").select("announcement_id,user_id,read_at").in("announcement_id", ids),
            service.from("profiles").select("id,username,display_name").order("username")
          ])
          : [{ data: [], error: null }, { data: [], error: null }];
        if (readsError) throw readsError;
        if (profilesError) throw profilesError;
        const receiptMap = new Map((reads || []).map((row: any) => [`${row.announcement_id}:${row.user_id}`, row.read_at]));
        const users = profiles || [];
        const result = (announcements || []).map((item: any) => {
          const readers = users.map((profile: any) => ({
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            read_at: receiptMap.get(`${item.id}:${profile.id}`) || null
          }));
          return { ...item, read_count: readers.filter((reader: any) => reader.read_at).length, recipient_count: users.length, readers };
        });
        await recordAccess(service, authData.user.id, "read_completed", "announcements", null, purpose, requestId,
          { action, result_count: result.length });
        return respond(200, { requestId, announcements: result });
      } catch (error) {
        await recordAccess(service, authData.user.id, "read_failed", "announcements", null, purpose, requestId,
          { action, reason: errorMessage(error, "Broadcast list failed.").slice(0, 200) });
        throw error;
      }
    }

    if (action === "broadcast_deactivate") {
      const announcementId = String(payload.announcementId || "");
      if (!uuidPattern.test(announcementId)) return respond(400, { error: "invalid_announcement_id" });
      await recordAccess(service, authData.user.id, "write_requested", "announcements", announcementId, purpose, requestId, { action });
      try {
        const { data, error } = await service.from("global_announcements").update({ is_active: false })
          .eq("id", announcementId).select("id").maybeSingle();
        if (error) throw error;
        if (!data) return respond(404, { error: "announcement_not_found" });
        await recordAccess(service, authData.user.id, "write_completed", "announcements", announcementId, purpose, requestId, { action });
        return respond(200, { requestId, announcementId, isActive: false });
      } catch (error) {
        await recordAccess(service, authData.user.id, "write_failed", "announcements", announcementId, purpose, requestId,
          { action, reason: errorMessage(error, "Broadcast deactivation failed.").slice(0, 200) });
        throw error;
      }
    }

    if (payload.action === "set_archive_media_access") {
      const mediaId = String(payload.mediaId || "");
      const visibility = String(payload.visibility || "");
      const commentAccess = String(payload.commentAccess || "");
      const viewerIds = Array.isArray(payload.viewerIds) ? payload.viewerIds.map(String) : [];
      const commenterIds = Array.isArray(payload.commenterIds) ? payload.commenterIds.map(String) : [];
      if (requestedType !== "archive_media" || !uuidPattern.test(mediaId)
          || !["members", "exclusive"].includes(visibility)
          || !["viewers", "selected", "disabled"].includes(commentAccess)
          || viewerIds.length > 500 || commenterIds.length > 500
          || [...viewerIds, ...commenterIds].some((id) => !uuidPattern.test(id))) {
        return respond(400, { error: "invalid_archive_media_access" });
      }
      await recordAccess(service, authData.user.id, "write_requested", "archive_media", mediaId, purpose, requestId,
        { action: "set_media_access", visibility, viewer_count: viewerIds.length, comment_access: commentAccess, commenter_count: commenterIds.length });
      try {
        const { error } = await service.rpc("set_looply_archive_media_access", {
          p_actor_id: authData.user.id,
          p_media_id: mediaId,
          p_visibility: visibility,
          p_viewer_ids: viewerIds,
          p_comment_access: commentAccess,
          p_commenter_ids: commenterIds
        });
        if (error) throw error;
        await recordAccess(service, authData.user.id, "write_completed", "archive_media", mediaId, purpose, requestId,
          { action: "set_media_access", visibility, viewer_count: viewerIds.length, comment_access: commentAccess, commenter_count: commenterIds.length });
        return respond(200, { requestId, mediaId, visibility, viewerIds, commentAccess, commenterIds });
      } catch (error) {
        await recordAccess(service, authData.user.id, "write_failed", "archive_media", mediaId, purpose, requestId,
          { action: "set_media_access", reason: errorMessage(error, "Archive media access update failed.").slice(0, 200) });
        throw error;
      }
    }

    if (payload.action === "import_archived_cards") {
      const cards = payload.cards;
      if (!Array.isArray(cards) || cards.length < 1 || cards.length > 25) {
        return respond(400, { error: "Archive card batches must contain 1 to 25 cards." });
      }
      try {
        const { data, error } = await service.rpc("import_looply_archived_cards", {
          p_actor_id: authData.user.id,
          p_purpose: purpose,
          p_request_id: requestId,
          p_cards: cards
        });
        if (error) throw error;
        return respond(200, { requestId, importedCount: Number(data || 0) });
      } catch (error) {
        await recordAccess(service, authData.user.id, "write_failed", "archived_cards", null, purpose, requestId,
          { reason: errorMessage(error, "Card import failed.").slice(0, 200) });
        throw error;
      }
    }

    if (payload.action === "verify_archive_media_upload") {
      const media = payload.media && typeof payload.media === "object" ? payload.media : {};
      const storagePath = String(media.storage_path || "");
      const expectedSize = Number(media.byte_size);
      if (!/^legacy-archive\/midia\/(?:[^/]+|misol\/[^/]+|yara\/[^/]+)$/i.test(storagePath)
          || !Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > 209_715_200) {
        return respond(400, { error: "invalid_archive_media_upload_check" });
      }

      await recordAccess(service, authData.user.id, "read_requested", "archive_media", null, purpose, requestId,
        { action: "verify_upload", storage_path: storagePath });
      try {
        const splitAt = storagePath.lastIndexOf("/");
        const folder = storagePath.slice(0, splitAt);
        const fileName = storagePath.slice(splitAt + 1);
        const { data: objects, error } = await service.storage.from("looply-media").list(folder, { search: fileName, limit: 100 });
        if (error) throw error;
        const object = (objects || []).find((entry: any) => entry.name === fileName);
        const byteSize = object ? Number(object.metadata?.size || 0) : null;
        const exists = Boolean(object);
        await recordAccess(service, authData.user.id, "read_completed", "archive_media", null, purpose, requestId,
          { action: "verify_upload", exists, byte_size: byteSize, byte_size_matches: exists && byteSize === expectedSize });
        return respond(200, { requestId, exists, byteSize });
      } catch (error) {
        await recordAccess(service, authData.user.id, "read_failed", "archive_media", null, purpose, requestId,
          { action: "verify_upload", reason: errorMessage(error, "Storage upload check failed.").slice(0, 200) });
        throw error;
      }
    }

    if (payload.action === "register_archive_media") {
      const media = payload.media && typeof payload.media === "object" ? payload.media : {};
      const storagePath = String(media.storage_path || "");
      if (!/^legacy-archive\/midia\/(?:[^/]+|misol\/[^/]+|yara\/[^/]+)$/i.test(storagePath)) {
        return respond(400, { error: "invalid_archive_media_path" });
      }
      try {
        const splitAt = storagePath.lastIndexOf("/");
        const folder = storagePath.slice(0, splitAt);
        const fileName = storagePath.slice(splitAt + 1);
        const { data: objects, error: storageError } = await service.storage.from("looply-media").list(folder, { search: fileName, limit: 100 });
        if (storageError) throw storageError;
        const object = (objects || []).find((entry) => entry.name === fileName);
        if (!object) throw new Error("Uploaded object was not found in the private bucket.");
        if (Number(object.metadata?.size || 0) !== Number(media.byte_size)) throw new Error("Uploaded object size does not match its catalog entry.");
        const { data, error } = await service.rpc("import_looply_archive_media", {
          p_actor_id: authData.user.id,
          p_purpose: purpose,
          p_request_id: requestId,
          p_item: media
        });
        if (error) throw error;
        return respond(200, { requestId, mediaId: data });
      } catch (error) {
        await recordAccess(service, authData.user.id, "write_failed", "archive_media", null, purpose, requestId,
          { reason: errorMessage(error, "Media registration failed.").slice(0, 200) });
        throw error;
      }
    }

    if (payload.action === "comment_archive_media") {
      const mediaId = String(payload.mediaId || "");
      const body = String(payload.body || "").trim();
      if (!uuidPattern.test(mediaId) || body.length < 1 || body.length > 2000) {
        return respond(400, { error: "A media ID and a comment of up to 2,000 characters are required." });
      }
      await recordAccess(service, authData.user.id, "write_requested", "archive_media_comments", mediaId, purpose, requestId,
        { action: "admin_comment" });
      try {
        const { data: media, error: mediaError } = await service.from("archive_media").select("id").eq("id", mediaId).maybeSingle();
        if (mediaError) throw mediaError;
        if (!media) throw new Error("Media is no longer available.");
        const { data: comment, error: commentError } = await service.from("archive_media_comments")
          .insert({ media_id: mediaId, author_id: authData.user.id, body, audience: "media_viewers" })
          .select("id,media_id,author_id,body,audience,created_at").single();
        if (commentError) throw commentError;
        await recordAccess(service, authData.user.id, "write_completed", "archive_media_comments", comment.id, purpose, requestId,
          { action: "admin_comment", media_id: mediaId });
        return respond(200, { requestId, comment });
      } catch (error) {
        await recordAccess(service, authData.user.id, "write_failed", "archive_media_comments", mediaId, purpose, requestId,
          { action: "admin_comment", reason: errorMessage(error, "Media comment failed.").slice(0, 200) });
        throw error;
      }
    }

    if (payload.action === "comment") {
      const postId = String(payload.postId || "");
      const body = String(payload.body || "").trim();
      if (!uuidPattern.test(postId) || body.length < 1 || body.length > 2000) {
        return respond(400, { error: "A post ID and a comment of up to 2,000 characters are required." });
      }
      await recordAccess(service, authData.user.id, "write_requested", "posts", postId, purpose, requestId, { action: "admin_comment" });
      try {
        const { data: post, error: postError } = await service.from("posts").select("id").eq("id", postId).maybeSingle();
        if (postError) throw postError;
        if (!post) throw new Error("Post is no longer available.");
        const { data: comment, error: commentError } = await service.from("comments")
          .insert({ post_id: postId, author_id: authData.user.id, body })
          .select("id,post_id,author_id,body,created_at").single();
        if (commentError) throw commentError;
        await recordAccess(service, authData.user.id, "write_completed", "posts", postId, purpose, requestId,
          { action: "admin_comment", comment_id: comment.id });
        return respond(200, { requestId, comment });
      } catch (error) {
        await recordAccess(service, authData.user.id, "write_failed", "posts", postId, purpose, requestId,
          { action: "admin_comment", reason: errorMessage(error, "Comment failed.").slice(0, 200) });
        throw error;
      }
    }

    await recordAccess(service, authData.user.id, "read_requested", requestedType, resourceId, purpose, requestId);
    try {
      let data = await loadResource(service, authData.user.id, requestedType, resourceId, offset);
      if (data === null) {
        await recordAccess(service, authData.user.id, "read_failed", requestedType, resourceId, purpose, requestId, { reason: "resource_not_enabled" });
        return respond(409, { error: "This resource is not available in the current stage." });
      }

      const rows = Array.isArray(data) ? data : [];
      const postMediaRows = rows.flatMap((row: any) => Array.isArray(row.media)
        ? row.media.map((media: any) => ({ ...media, bucket_id: "looply-media", audit_resource_type: "post_media" }))
        : requestedType === "post_media" ? [{ ...row, bucket_id: "looply-media", audit_resource_type: "post_media" }]
          : requestedType === "archive_media" ? [{ ...row, bucket_id: "looply-media", audit_resource_type: "archive_media" }]
            : requestedType === "community_gallery_media" ? [{ ...row, bucket_id: "looply-gallery", audit_resource_type: "community_gallery_media" }] : []);
      const storyMediaRows = rows.flatMap((row: any) => requestedType === "stories" && Array.isArray(row.media)
        ? row.media.map((media: any) => ({ ...media, bucket_id: "looply-media", audit_resource_type: "stories" })) : []);
      const chatMediaRows = rows.flatMap((row: any) => Array.isArray(row.media) ? row.media.map((media: any) => ({ ...media, bucket_id: "looply-chat" })) : []);
      const mediaRows = [...postMediaRows, ...storyMediaRows, ...chatMediaRows];
      if (mediaRows.length) {
        const mediaAudit = await Promise.all(mediaRows.map((media: any) =>
          recordAccess(service, authData.user.id, "read_completed", media.bucket_id === "looply-chat" ? "chat_media" : media.audit_resource_type || "post_media", media.id, purpose, requestId, { delivery: "signed_url" })
        ));
        void mediaAudit;
      for (const bucketId of ["looply-media", "looply-chat", "looply-gallery"]) {
          const bucketMedia = mediaRows.filter((media: any) => media.bucket_id === bucketId);
          if (!bucketMedia.length) continue;
          const expiresIn = requestedType === "archive_media" ? 300 : 1800;
          const { data: signed, error: signedError } = await service.storage.from(bucketId).createSignedUrls(bucketMedia.map((media: any) => media.storage_path), expiresIn);
          if (signedError) throw signedError;
          bucketMedia.forEach((media: any, index: number) => {
            const signedUrl = signed?.[index]?.signedUrl || null;
            media.signed_url = signedUrl;
            if (requestedType === "archive_media") {
              const archiveRow = rows.find((row: any) => row.id === media.id);
              if (archiveRow) archiveRow.signed_url = signedUrl;
            }
          });
        }
      }

      await recordAccess(service, authData.user.id, "read_completed", requestedType,
        resourceId, purpose, requestId, { result_count: rows.length });
      return respond(200, { requestId, resourceType: requestedType, data });
    } catch (error) {
      await recordAccess(service, authData.user.id, "read_failed", requestedType, resourceId, purpose, requestId,
        { message: errorMessage(error, "Administrative read failed.").slice(0, 200) });
      throw error;
    }
  } catch (error) {
    console.error("Looply admin function failed", error);
    return respond(500, { error: "Administrative request could not be completed." });
  }
});





