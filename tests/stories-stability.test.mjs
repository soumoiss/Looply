import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { decodeStoryBody, encodeStoryBody, spotifyTrackId } from "../src/story-text-style.js";

const read = (path) => readFile(resolve(process.cwd(), path), "utf8");

test("Stories viewer has theme-aware title and safe responsive media sizing", async () => {
  const css = await read("assets/css/pages/home.css");
  assert.match(css, /\.story-area-heading h2\s*\{\s*color:\s*var\(--text\)/);
  assert.match(css, /\.story-viewer-media img, \.story-viewer-media video[^{]*\{[^}]*object-fit:\s*contain/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.story-viewer-caption[^{}]*\{[^}]*overflow-y:\s*auto/);
});

test("legacy text stories keep their font envelope and new text editor exports real canvas layers", async () => {
  const [story, studio, admin, html, css] = await Promise.all([
    read("src/stories.js"), read("src/story-studio.js"), read("src/admin.js"),
    read("home.html"), read("assets/css/pages/story-studio.css")
  ]);
  const styled = decodeStoryBody(encodeStoryBody("Texto centralizado", "serif", 6));
  assert.equal(styled.text, "Texto centralizado");
  assert.equal(styled.font, "serif");
  assert.equal(styled.size, 6);
  assert.equal(styled.styled, true);
  assert.equal(decodeStoryBody("Story antigo").text, "Story antigo");
  assert.equal(decodeStoryBody(encodeStoryBody("Texto", "invalid", 99)).font, "system");
  assert.equal(decodeStoryBody(encodeStoryBody("Texto", "system", 99)).size, 20);
  assert.match(studio, /data-studio-text-mode/);
  assert.match(studio, /data-layer-font/);
  assert.match(studio, /data-layer-color/);
  assert.match(studio, /data-layer-size min="18" max="94"/);
  assert.match(studio, /paintLayers\(ctx, overlayRoot/);
  assert.match(story, /caption\.style\.fontSize = !media && storyText\.styled/);
  assert.match(admin, /decodeStoryBody\(item\.body \|\| ""\)\.text/);
  assert.match(css, /\.studio-overlay/);
  assert.match(html, /story-studio\.css/);
});
test("Stories persist only valid Spotify track embeds and preserve the styled text", () => {
  const url = "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=preview";
  assert.equal(spotifyTrackId(url), "4uLU6hMCjMI75M1A2tKUQC");
  assert.equal(spotifyTrackId("https://open.spotify.com/playlist/4uLU6hMCjMI75M1A2tKUQC"), "");
  assert.equal(spotifyTrackId("https://open.spotify.com.evil.example/track/4uLU6hMCjMI75M1A2tKUQC"), "");
  const story = decodeStoryBody(encodeStoryBody("Um momento", "serif", 18, url));
  assert.equal(story.text, "Um momento");
  assert.equal(story.font, "serif");
  assert.equal(story.size, 18);
  assert.equal(story.spotifyTrackId, "4uLU6hMCjMI75M1A2tKUQC");
});

test("Story music is local to the app and AR uses face landmarks rather than fake CSS-only lenses", async () => {
  const [studio, lenses, picker] = await Promise.all([read("src/story-studio.js"), read("src/story-ar.js"), read("src/story-music-picker.js")]);
  assert.match(picker, /data-studio-music-query/);
  assert.match(picker, /data-studio-provider="all"/);
  assert.doesNotMatch(picker, /data-studio-provider="builtin"/);
  assert.doesNotMatch(picker, /builtin\.filter\(t=>/);
  assert.match(picker, /data-studio-audio-file/);
  assert.match(studio, /makeSynthBuffer\(audioCtx, music\)/);
  assert.match(studio, /data-studio-lens-chooser/);
  assert.match(studio, /loadStoryEffectManifest/);
  assert.match(studio, /new StoryFaceLens/);
  assert.match(studio, /canvas\.captureStream\(24\)/);
  assert.match(lenses, /FaceLandmarker\.createFromOptions/);
  assert.match(lenses, /detectForVideo/);
  assert.match(lenses, /outputFaceBlendshapes:\s*true/);
  assert.doesNotMatch(studio, /spotify|supabase/i);
});
test("new camera defaults to front mirror, flips physically and publishes via Neon", async () => {
  const studio = await read("src/story-studio.js");
  assert.match(studio, /data-studio-flip/);
  assert.match(studio, /facing: "user"/);
  assert.match(studio, /settings\.facing === "user" \? "environment" : "user"/);
  assert.match(studio, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(studio, /"scaleX\(-1\) "/);
  assert.match(studio, /stage\.addEventListener\("touchmove"/);
  assert.match(studio, /await uploadResumable\(client, uploadedPath, normalized/);
  assert.match(studio, /rpc\("v5_attach_story_media"/);
});
test("story view insights show signed viewer avatars with initials as a privacy-safe fallback", async () => {
  const source = await read("src/stories.js");
  const css = await read("assets/css/pages/home.css");
  assert.match(source, /\.select\("viewer_id,viewed_at"\)/);
  assert.match(source, /profileMap\.get\(view\.viewer_id\)/);
  assert.match(source, /cachedSignedUrls\(client, "looply-avatars", avatarPaths, 1800\)/);
  assert.match(source, /avatar\.textContent = initials\(profileName\(view\.viewer\)\)/);
  assert.match(source, /image\.referrerPolicy = "no-referrer"/);
  assert.match(css, /\.story-insights-avatar img[^{]*\{[^}]*object-fit:\s*cover/);
  assert.match(css, /grid-template-columns:\s*38px minmax\(0, 1fr\) auto/);
});

test("Story viewer supports tap-to-pause and resume without intercepting action buttons", async () => {
  const source = await read("src/stories.js");
  assert.match(source, /data-story-play-toggle/);
  assert.match(source, /const setStoryPaused = \(paused\)/);
  assert.match(source, /touchSurface\.addEventListener\("click"/);
  assert.match(source, /event\.target\.closest\("button, a, input, form/);
  assert.match(source, /setStoryPaused\(!state\.paused\)/);
});

test("Story likes and realtime synchronization remain server-backed", async () => {
  const source = await read("src/stories.js");
  assert.match(source, /from\("story_likes"\)\.insert/);
  assert.match(source, /from\("story_likes"\)\.delete/);
  assert.match(source, /setupStoriesRealtime/);
  assert.match(source, /postgres_changes/);
  assert.match(source, /table: "stories"/);
});

test("opening a stale story refreshes and retries instead of silently leaving the viewer closed", async () => {
  const source = await read("src/stories.js");
  assert.match(source, /let activeStories = group \? activeStoriesFor\(group\) : \[\]/);
  assert.match(source, /await refresh\(\);\s*group = state\.groups\.find/);
  assert.match(source, /openStoryDialog\(viewer\)/);
  assert.match(source, /playToggle\.innerHTML = icon\("pause"\)/);
  assert.doesNotMatch(source, /playToggle\.querySelector\("span"\)\.textContent/);
  assert.match(source, /function openStoryDialog\(dialog\)/);
  assert.match(source, /function closeStoryDialog\(dialog\)/);
});

test("story captions overlay the full-ratio media with a transparent gradient and safe-area spacing", async () => {
  const css = await read("assets/css/pages/home.css");
  assert.match(css, /story-viewer-caption[^{}]*\{[^}]*background:\s*linear-gradient\(180deg, transparent/);
  assert.match(css, /bottom:\s*calc\(66px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /story-viewer-caption:empty\s*\{\s*display:\s*none/);
});

test("text-only stories center their copy vertically and horizontally without changing media captions", async () => {
  const source = await read("src/stories.js");
  const css = await read("assets/css/pages/home.css");
  assert.match(source, /viewer\.classList\.toggle\("story-viewer-text-only", !media && Boolean\(String\(story\.body \|\| ""\)\.trim\(\)\)\)/);
  assert.match(css, /\.story-viewer-dialog\.story-viewer-text-only \.story-viewer-caption\s*\{[^}]*top:\s*50%;[^}]*bottom:\s*auto;[^}]*text-align:\s*center;[^}]*transform:\s*translateY\(-50%\)/);
  assert.match(css, /font-size:\s*20pt/);
});

test("story media retries signed URLs per object and exposes a retry control when media is unavailable", async () => {
  const source = await read("src/stories.js");
  assert.match(source, /cachedSignedUrl\(client, "looply-media", item\.storage_path, remainingTtl\)/);
  assert.match(source, /data-story-media-retry/);
  assert.match(source, /Não foi possível carregar a mídia deste story/);
});

test("private story replies have a deployed database RPC and persist a direct message", async () => {
  const migration = await read("supabase/migrations/20261018235900_restore_story_private_reply_rpc.sql");
  const source = await read("src/stories.js");
  assert.match(migration, /create or replace function public\.send_story_reply\(p_story_id uuid, p_body text\)/i);
  assert.match(migration, /grant execute on function public\.send_story_reply\(uuid, text\) to authenticated/i);
  assert.match(migration, /private\.can_view_story\(p_story_id\)/);
  assert.match(migration, /create_direct_conversation\(actor_id, story_author_id\)/);
  assert.match(migration, /insert into public\.chat_messages \(conversation_id, sender_id, body\)/);
  assert.match(migration, /insert into public\.story_replies/);
  assert.match(source, /client\.rpc\("send_story_reply", \{ p_story_id: story\.id, p_body: body \}\)/);
  assert.match(source, /A resposta não foi enviada\. Verifique a conexão/);
});
