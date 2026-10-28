import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("story engagement RPCs are routed through an authenticated Neon gateway", () => {
  const gateway = read("src/neon-production-client.js");
  assert.match(gateway, /storyEngagementRpcNames = new Set\(\["record_story_view", "send_story_reply"\]\)/);
  assert.match(gateway, /storyEngagementRpcNames\.has\(name\) \? storyEngagementRpc\(name,args\)/);
  assert.match(gateway, /authorization: "Bearer " \+ session\.access_token/);
  assert.match(gateway, /name === "send_story_reply" && \(!data\?\.conversation_id \|\| !data\?\.message_id\)/);
});

test("database migration uses authenticated identity, expiry, unique views and chat transactions", () => {
  const sql = read("migration/20261028_neon_story_engagement.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.record_story_view\(p_story_id uuid\)/);
  assert.match(sql, /public\.looply_legacy_uid\(\)/);
  assert.match(sql, /NOT public\.v3_can_view_story\(p_story_id\)/);
  assert.match(sql, /ON CONFLICT \(story_id,viewer_id\) DO NOTHING/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.send_story_reply\(p_story_id uuid,p_body text\)/);
  assert.match(sql, /public\.v4_create_conversation\('direct'/);
  assert.match(sql, /INSERT INTO public\.chat_messages/);
  assert.match(sql, /INSERT INTO public\.story_replies/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.send_story_reply\(uuid,text\) FROM public,anonymous/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.send_story_reply\(uuid,text\) TO authenticated/);
});

test("view records only after valid image, video or text slide opens", () => {
  const viewer = read("src/stories.js");
  assert.match(viewer, /const recordVisibleStoryView = async \(storyId, version\)/);
  assert.match(viewer, /state\.viewPending\.has\(storyId\)/);
  assert.match(viewer, /image\.addEventListener\("load"/);
  assert.match(viewer, /image\.naturalWidth/);
  assert.match(viewer, /video\.addEventListener\("playing"/);
  assert.match(viewer, /recordVisibleStoryView\(story\.id, version\)/);
  assert.doesNotMatch(viewer, /viewedThisSession\.add\(story\.id\);\s*void client\.rpc/);
});

test("asynchronous slide events and private activity panels are bound to their story", () => {
  const viewer = read("src/stories.js");
  assert.match(viewer, /const version = \+\+state\.slideVersion/);
  assert.match(viewer, /const token = \+\+state\.insightsToken/);
  assert.match(viewer, /currentStory\(\)\?\.id === story\.id/);
  assert.match(viewer, /story\.author_id !== userId/);
  assert.match(viewer, /\.range\(offset, offset \+ 499\)/);
  assert.match(viewer, /viewer\.addEventListener\("close"/);
  assert.match(viewer, /audio\.removeAttribute\("src"\); audio\.remove\(\)/);
});

test("sharing requires an available story and confirms recipient chat persistence", () => {
  const viewer = read("src/stories.js");
  assert.match(viewer, /const availableToShare = async story/);
  assert.match(viewer, /story\.visibility === "selected"/);
  assert.match(viewer, /from\("story_recipients"\)/);
  assert.match(viewer, /action: "create_direct", targetId: recipientId/);
  assert.match(viewer, /from\("chat_messages"\)/);
  assert.match(viewer, /body: "Story compartilhado: " \+ url/);
  assert.match(viewer, /if \(error \|\| !message\?\.id\)/);
  assert.match(viewer, /error\?\.name !== "AbortError"/);
});

test("reply drafts and likes are guarded against repeated sends and stale slides", () => {
  const viewer = read("src/stories.js");
  assert.match(viewer, /state\.replyPending\.has\(story\.id\)/);
  assert.match(viewer, /state\.replyDrafts\.set\(story\.id, body\)/);
  assert.match(viewer, /state\.replyDrafts\.delete\(story\.id\)/);
  assert.match(viewer, /!reply\?\.message_id \|\| reply\.story_id !== story\.id/);
  assert.match(viewer, /state\.likePending\.has\(story\.id\)/);
  assert.match(viewer, /from\("story_likes"\)\.insert/);
  assert.match(viewer, /from\("story_likes"\)\.delete/);
});

test("responsive controls preserve media aspect ratio, safe area and meaningful touch targets", () => {
  const css = read("assets/css/pages/stories-viewer-engagement.css");
  const home = read("home.html");
  assert.match(css, /object-fit:contain!important/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(css, /min-height:44px!important/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(home, /stories-viewer-engagement\.css/);
});
