// Keep the viewer's own receipt authoritative even when an older Neon RPC
// refers to story_views columns that are absent from the deployed table.
const missingViewColumns = error => error?.code === "42703" &&
  /\b(last_viewed_at|view_count)\b/i.test(String(error?.message || error?.details || ""));

async function hasReceipt(client, storyId, viewerId) {
  const { data, error } = await client.from("story_views").select("story_id")
    .eq("story_id", storyId).eq("viewer_id", viewerId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function recordStoryView(client, storyId, viewerId) {
  const { data, error } = await client.rpc("record_story_view", { p_story_id: storyId });
  if (!error) {
    if (typeof data !== "boolean") throw Error("story_view_unconfirmed");
    return data || hasReceipt(client, storyId, viewerId);
  }
  if (!missingViewColumns(error)) throw error;

  // The existing INSERT policy checks the authenticated viewer and story
  // visibility. A duplicate means this viewer already has a saved receipt.
  const inserted = await client.from("story_views").insert({ story_id: storyId, viewer_id: viewerId });
  if (!inserted.error) return true;
  if (inserted.error.code === "23505") return hasReceipt(client, storyId, viewerId);
  throw inserted.error;
}
