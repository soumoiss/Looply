import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function namedKey(pluralName: string, legacyNames: string[]) {
  const encoded = Deno.env.get(pluralName);
  if (encoded) {
    try {
      const keys = JSON.parse(encoded);
      if (typeof keys?.default === "string") return keys.default;
    } catch (error) {
      console.error(`Invalid ${pluralName} configuration.`, error);
    }
  }
  for (const name of legacyNames) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return "";
}

async function cleanupOrphanAvatars(service: SupabaseClient<any, "public", any>) {
  const { data: profiles, error: profileError } = await service.from("profiles").select("avatar_path").not("avatar_path", "is", null);
  if (profileError) throw profileError;
  const profileRows = (profiles || []) as Array<{ avatar_path: string | null }>;
  const referenced = new Set(profileRows.map((profile) => profile.avatar_path).filter((path): path is string => Boolean(path)));
  const bucket = service.storage.from("looply-avatars");
  const { data: owners, error: ownerError } = await bucket.list("avatars", { limit: 1000 });
  if (ownerError) throw ownerError;
  const orphanPaths: string[] = [];
  for (const owner of owners || []) {
    if (owner.id) {
      const path = `avatars/${owner.name}`;
      if (!referenced.has(path)) orphanPaths.push(path);
      continue;
    }
    const prefix = `avatars/${owner.name}`;
    const { data: files, error: fileError } = await bucket.list(prefix, { limit: 1000 });
    if (fileError) throw fileError;
    for (const file of files || []) {
      if (!file.id) continue;
      const path = `${prefix}/${file.name}`;
      if (!referenced.has(path)) orphanPaths.push(path);
    }
  }
  if (!orphanPaths.length) return 0;
  const { error: removeError } = await bucket.remove(orphanPaths.slice(0, 1000));
  if (removeError) throw removeError;
  return Math.min(orphanPaths.length, 1000);
}

type StoredObject = { name: string; id?: string | null; created_at?: string | null; updated_at?: string | null };

async function listFiles(bucket: ReturnType<SupabaseClient<any, "public", any>["storage"]["from"]>, prefix = "") {
  const files: Array<{ path: string; createdAt: string | null }> = [];
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await bucket.list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    const entries = (data || []) as StoredObject[];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) files.push({ path, createdAt: entry.created_at || entry.updated_at || null });
      else files.push(...await listFiles(bucket, path));
    }
    if (entries.length < 1000) break;
  }
  return files;
}

async function selectPaths(service: SupabaseClient<any, "public", any>, table: string, column = "storage_path") {
  const paths = new Set<string>();
  for (let from = 0;; from += 1000) {
    const { data, error } = await service.from(table).select(column).range(from, from + 999);
    if (error) throw error;
    const rows = (data || []) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const value = row[column];
      if (typeof value === "string" && value) paths.add(value);
    }
    if (rows.length < 1000) break;
  }
  return paths;
}

async function removeUnreferenced(
  service: SupabaseClient<any, "public", any>,
  bucketName: string,
  referenced: Set<string>,
  graceHours = 24
) {
  const bucket = service.storage.from(bucketName);
  const files = await listFiles(bucket);
  const cutoff = Date.now() - graceHours * 60 * 60 * 1000;
  const orphanPaths = files.filter((file) => {
    if (referenced.has(file.path)) return false;
    const created = file.createdAt ? Date.parse(file.createdAt) : NaN;
    return Number.isFinite(created) && created < cutoff;
  }).map((file) => file.path);
  for (let offset = 0; offset < orphanPaths.length; offset += 100) {
    const { error } = await bucket.remove(orphanPaths.slice(offset, offset + 100));
    if (error) throw error;
  }
  return orphanPaths.length;
}

async function cleanupAllOrphans(service: SupabaseClient<any, "public", any>) {
  const media = new Set<string>();
  for (const table of ["post_media", "comment_media", "story_media", "archive_media"]) {
    for (const path of await selectPaths(service, table)) media.add(path);
  }
  const gallery = await selectPaths(service, "community_gallery_media");
  const chat = await selectPaths(service, "chat_media");
  const avatars = await selectPaths(service, "profiles", "avatar_path");
  const secretMessages = await selectPaths(service, "secret_vip_messages", "media_url");
  const letters = new Set<string>();
  for (let from = 0;; from += 1000) {
    const { data, error } = await service.from("community_letters").select("attachments").range(from, from + 999);
    if (error) throw error;
    const rows = (data || []) as Array<{ attachments?: Array<{ path?: unknown }> | null }>;
    for (const row of rows) for (const item of row.attachments || []) if (typeof item.path === "string") letters.add(item.path);
    if (rows.length < 1000) break;
  }
  const references = new Map<string, Set<string>>([
    ["looply-media", media], ["looply-gallery", gallery], ["looply-chat", chat],
    ["looply-avatars", avatars], ["looply-letters", letters], ["looply-secret-messages", secretMessages]
  ]);
  const deletedByBucket: Record<string, number> = {};
  for (const [bucket, paths] of references) deletedByBucket[bucket] = await removeUnreferenced(service, bucket, paths);
  return deletedByBucket;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });

  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return respond(401, { error: "unauthorized" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = namedKey("SUPABASE_PUBLISHABLE_KEYS", ["SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"]);
  const serviceKey = namedKey("SUPABASE_SECRET_KEYS", ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]);
  if (!url || !anonKey || !serviceKey) {
    console.error("Story cleanup is missing server-side Supabase configuration.");
    return respond(500, { error: "server_configuration_error" });
  }

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(match[1]);
  if (authError || !authData.user) return respond(401, { error: "unauthorized" });

  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let deletedAvatars = 0;
  let deletedOrphans: Record<string, number> = {};
  try {
    deletedOrphans = await cleanupAllOrphans(service);
    deletedAvatars = deletedOrphans["looply-avatars"] || 0;
  } catch (error) {
    console.error("Orphan cleanup failed closed; no unverified files were removed.", error);
  }
  const cutoff = new Date().toISOString();
  const { data: expired, error: selectError } = await service.from("stories")
    .select("id")
    .lt("expires_at", cutoff)
    .order("expires_at", { ascending: true })
    .limit(100);
  if (selectError) {
    console.error("Story cleanup could not list expired rows.", selectError);
    return respond(500, { error: "cleanup_failed" });
  }
  const storyIds = (expired || []).map((story: { id: string }) => story.id);
  const orphanCount = Object.values(deletedOrphans).reduce((total, count) => total + count, 0);
  if (!storyIds.length) return respond(200, { deletedStories: 0, deletedFiles: orphanCount, deletedAvatars, deletedOrphans, moreMayRemain: false });

  const { data: media, error: mediaError } = await service.from("story_media")
    .select("storage_path")
    .in("story_id", storyIds);
  if (mediaError) {
    console.error("Story cleanup could not list expired media.", mediaError);
    return respond(500, { error: "cleanup_failed" });
  }

  const paths = (media || []).map((item: { storage_path: string }) => item.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await service.storage.from("looply-media").remove(paths);
    if (storageError) {
      console.error("Story cleanup could not remove expired files.", storageError);
      return respond(500, { error: "cleanup_failed" });
    }
  }

  const { data: deleted, error: deleteError } = await service.from("stories")
    .delete()
    .in("id", storyIds)
    .lt("expires_at", cutoff)
    .select("id");
  if (deleteError) {
    console.error("Story cleanup could not remove expired rows.", deleteError);
    return respond(500, { error: "cleanup_failed" });
  }

  return respond(200, {
    deletedStories: deleted?.length || 0,
    deletedFiles: paths.length + orphanCount,
    deletedAvatars,
    deletedOrphans,
    moreMayRemain: storyIds.length === 100
  });
});
