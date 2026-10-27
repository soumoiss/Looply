import test from "node:test";
import assert from "node:assert/strict";
import { canRepostStory } from "../src/stories.js";

const now = Date.parse("2026-10-27T12:00:00.000Z");
const eligible = () => ({
  id: "original-story",
  author_id: "author-a",
  visibility: "public",
  allow_reposts: true,
  isMentioned: true,
  expires_at: new Date(now + 60_000).toISOString(),
  media: { kind: "image", signedUrl: "https://media.example/story.jpg" }
});

test("only a mentioned non-owner can repost an opted-in active public Story with media", () => {
  assert.equal(canRepostStory(eligible(), "member-b", now), true);
  assert.equal(canRepostStory(eligible(), "author-a", now), false);

  const cases = [
    story => { story.isMentioned = false; },
    story => { story.visibility = "selected"; },
    story => { story.visibility = "private"; },
    story => { story.allow_reposts = false; },
    story => { story.expires_at = new Date(now).toISOString(); },
    story => { story.media = null; },
    story => { story.media.signedUrl = null; },
    story => { story.media.kind = "audio"; }
  ];
  for (const change of cases) {
    const story = eligible();
    change(story);
    assert.equal(canRepostStory(story, "member-b", now), false);
  }
  assert.equal(canRepostStory(eligible(), null, now), false);
});

test("Story repost UI exposes owner consent, mention gating and copied-media flow", async () => {
  const { readFile } = await import("node:fs/promises");
  const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
  const [stories, studio, client, css, migration] = await Promise.all([
    read("src/stories.js"), read("src/story-studio.js"), read("src/neon-production-client.js"),
    read("assets/css/pages/home.css"), read("migration/20261027_story_reposts.sql")
  ]);
  assert.match(stories, /story.author_id === userId && story.visibility === "public"/);
  assert.match(stories, /data-story-repost-attribution/);
  assert.match(stories, /storage.from\("looply-media"\).download/);
  assert.match(stories, /__looplyStudioOpenWithMedia/);
  assert.match(studio, /data-studio-allow-reposts/);
  assert.match(studio, /v6_link_story_repost/);
  assert.match(client, /"v6_link_story_repost"/);
  assert.match(client, /storage\/download/);
  assert.match(css, /\.story-repost-attribution/);
  for (const requirement of [
    "SECURITY DEFINER", "story.visibility = 'public'", "source.allow_reposts = true",
    "mention.mentioned_user_id = owner_id", "original_expiry", "story_media media"
  ]) assert.ok(migration.includes(requirement), "migration is missing guard: " + requirement);
});
