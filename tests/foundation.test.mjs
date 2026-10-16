import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(projectRoot, path), "utf8");

test("the browser client uses an exact Supabase JS version and a publishable key", async () => {
  const [client, config] = await Promise.all([read("src/supabase.js"), read("config.js")]);
  assert.match(client, /@supabase\/supabase-js@2\.117\.3/);
  assert.match(client, /sb_publishable_/);
  assert.doesNotMatch(client + config, /service_role|sb_secret_/i);
  assert.match(client, /persistSession:\s*true/);
});

test("the initial schema protects profile rows and never derives administrator access from metadata", async () => {
  const names = await readdir(resolve(projectRoot, "supabase/migrations"));
  const foundationName = names.find((name) => name.endsWith("_foundation_profiles_admin.sql"));
  const hardeningName = names.find((name) => name.endsWith("_harden_admin_memberships.sql"));
  assert.ok(foundationName);
  assert.ok(hardeningName);
  const [sql, hardening] = await Promise.all([
    read("supabase/migrations/" + foundationName),
    read("supabase/migrations/" + hardeningName)
  ]);
  assert.match(sql, /alter table public\.profiles enable row level security/i);
  assert.match(sql, /profiles_update_self[\s\S]*?with check \(id = \(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /profiles_public_read[\s\S]*?to anon[\s\S]*?profile_visibility = 'public'/i);
  assert.match(sql, /revoke all on table private\.admin_users from public, anon, authenticated/i);
  assert.match(sql, /private\.is_admin\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql, /raw_user_meta_data ->> 'username'/i);
  assert.doesNotMatch(sql, /raw_user_meta_data[^;]*(?:role|admin)/i);
  assert.doesNotMatch(sql, /insert into private\.admin_users/i);
  assert.match(hardening, /admin_users_deny_direct_access[\s\S]*?using \(false\)[\s\S]*?with check \(false\)/i);
});

test("only four owner-created usernames can have profiles, then remain immutable", async () => {
  const [identity, login, profiles, allowlistMigration, immutableMigration, authProfileMigration] = await Promise.all([
    read("src/identities.js"),
    read("src/login.js"),
    read("src/profiles.js"),
    read("supabase/migrations/20261016001621_lock_looply_usernames.sql"),
    read("supabase/migrations/20261016002713_immutable_usernames.sql"),
    read("supabase/migrations/20261016023922_admin_created_auth_profiles.sql")
  ]);
  for (const username of ["patati", "misol", "yara", "peixinho"]) {
    assert.match(identity, new RegExp(`\\b${username}\\b`));
    assert.match(allowlistMigration, new RegExp(`'${username}'`));
  }
  assert.match(login, /emailForUsername\(username\)/);
  assert.match(identity, /loooply\.app/);
  assert.match(authProfileMigration, /split_part\(coalesce\(new\.email, ''\), '@', 1\)/i);
  assert.match(authProfileMigration, /@loooply\\\.app\$/i);
  assert.doesNotMatch(authProfileMigration, /raw_user_meta_data ->> 'username'/i);
  assert.match(authProfileMigration, /requested_username not in \('patati', 'misol', 'yara', 'peixinho'\)/i);
  assert.match(authProfileMigration, /when 'peixinho' then 'Peixinho'/i);
  assert.match(allowlistMigration, /profiles_username_allowlist/);
  assert.match(profiles, /Seu username confirmado não pode ser alterado/);
  assert.doesNotMatch(profiles, /update\(\{ username/);
  assert.match(immutableMigration, /revoke update \(username\) on table public\.profiles from authenticated/i);
  assert.match(immutableMigration, /profiles_prevent_username_change/);
  assert.match(immutableMigration, /new\.username is distinct from old\.username/i);
});

test("the interface supports only Auth sign-in and never stores browser credentials", async () => {
  const [login, client] = await Promise.all([read("src/login.js"), read("src/supabase.js")]);
  assert.doesNotMatch(login + client, /localStorage\.(?:getItem|setItem)\(["'](?:username|password|isLoggedIn)/i);
  assert.doesNotMatch(login + client, /(?:initialPassword|seedPassword|password\s*[:=]\s*["'][^"']{8,}["'])/i);
  assert.match(login, /signInWithPassword/);
  assert.doesNotMatch(login, /supabase\.auth\.signUp|toggle-auth|Criar conta|Criar minha conta/);
  assert.match(login, /emailForUsername\(username\)/);
});

test("separate pages keep the original login, navigation, five themes, and responsive layout", async () => {
  const [login, home, gallery, music, chat, profile, admin, css, theme, readme] = await Promise.all([
    read("login.html"), read("home.html"), read("galeria.html"), read("musicas.html"),
    read("chat.html"), read("perfil.html"), read("admin.html"), read("styles.css"),
    read("src/theme.js"), read("README.md")
  ]);
  for (const theme of ["lilas", "noite", "oceano", "rosa", "floresta"]) {
    assert.match(theme, new RegExp("\\b" + theme + "\\b"));
  }
  assert.match(login, /Quem és\?/);
  assert.match(login, /código secreto/);
  assert.match(login, /Avante!/);
  for (const page of [home, gallery, music, chat, profile, admin]) {
    assert.match(page, /data-site-header/);
    assert.match(page, /id="pageContent"/);
    assert.match(page, /assets\/js\//);
  }
  assert.match(home, /home\.js/);
  assert.match(gallery, /gallery\.js/);
  assert.match(music, /music\.js/);
  assert.match(chat, /chat\.js/);
  assert.match(profile, /profile\.js/);
  assert.match(admin, /admin\.js/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(readme, /supabase\/migrations/);
});

test("the account-specific YouTube playlists include the Peixinho playlist", async () => {
  const [playlists, musicPage] = await Promise.all([read("src/youtube-playlist.js"), read("musicas.html")]);
  assert.match(playlists, /peixinho:\s*"PLD5PXwJcU-Sg"/);
  assert.match(playlists, /PLUZFdmgmipvI/);
  assert.match(playlists, /PLCn4CAsA_tiM/);
  assert.match(playlists, /PLE0tcB0gaSzM/);
  assert.match(playlists, /youtube-nocookie\.com\/embed\/videoseries/);
  assert.match(musicPage, /assets\/js\/music\.js/);
  assert.doesNotMatch(playlists, /AIza[\w-]{20,}/);
});

test("the removed account is absent from active frontend code and page copy", async () => {
  const files = ["src/identities.js", "src/login.js", "src/page-runtime.js", "src/social.js", "src/music.js", "src/chat.js", "src/profiles.js", "assets/js/home.js", "assets/js/gallery.js", "assets/js/music.js", "assets/js/chat.js", "assets/js/profile.js", "assets/js/admin.js", "home.html", "galeria.html", "musicas.html", "chat.html", "perfil.html", "admin.html"];
  const contents = await Promise.all(files.map(read));
  const removedUsername = ["li", "li", "ka"].join("");
  assert.doesNotMatch(contents.join("\n"), new RegExp(removedUsername, "i"));
});

test("the build emits all independent pages and their assets", async () => {
  const { access } = await import("node:fs/promises");
  for (const path of ["dist/login.html", "dist/home.html", "dist/galeria.html", "dist/musicas.html", "dist/chat.html", "dist/perfil.html", "dist/admin.html", "dist/assets/js/login.js", "dist/assets/css/app.css", "dist/src/page-runtime.js"]) {
    await access(resolve(projectRoot, path));
  }
});

test("the social schema scopes posts and comments to the post audience", async () => {
  const names = await readdir(resolve(projectRoot, "supabase/migrations"));
  const filename = names.find((name) => name.endsWith("_posts_comments_core.sql"));
  const invokerName = names.find((name) => name.endsWith("_selected_posts_invoker.sql"));
  assert.ok(filename);
  assert.ok(invokerName);
  const sql = await read("supabase/migrations/" + filename);
  const invoker = await read("supabase/migrations/" + invokerName);
  assert.match(sql, /private\.can_view_post\(p_post_id uuid\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql, /posts_read_visible[\s\S]*?using \(\(select private\.can_view_post\(id\)\)\)/i);
  assert.match(sql, /comments_read_with_post[\s\S]*?using \(\(select private\.can_view_post\(post_id\)\)\)/i);
  assert.match(sql, /create policy comments_insert_with_post[\s\S]*?author_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /public\.create_selected_post[\s\S]*?actor_id uuid := auth\.uid\(\)/i);
  assert.match(sql, /comments_parent_same_post_fk[\s\S]*?references public\.comments \(id, post_id\)/i);
  assert.match(sql, /comments_enforce_one_reply_level/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.posts/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.comments/i);
  assert.match(invoker, /alter function public\.create_selected_post\(text, uuid\[\]\) security invoker/i);
  assert.match(invoker, /posts_insert_own[\s\S]*?visibility in \('public', 'private', 'selected'\)/i);
  assert.doesNotMatch(sql, /insert into private\.admin_users/i);
});

test("the feed escapes database text and writes through Supabase with realtime refresh", async () => {
  const social = await read("src/social.js");
  assert.match(social, /function escapeHtml\(value\)/);
  assert.match(social, /from\("posts"\)/);
  assert.match(social, /from\("comments"\)\.insert/);
  assert.match(social, /rpc\("create_selected_post"/);
  assert.match(social, /postgres_changes/);
  assert.match(social, /refreshSocialFeed/);
  assert.match(social, /createSignedUrls/);
  assert.match(social, /tus-js-client@4\.3\.1/);
  assert.match(social, /from\("post_media"\)\.insert/);
});

test("comment attachments use private storage and inherit the post's visibility", async () => {
  const [social, migration] = await Promise.all([
    read("src/social.js"),
    read("supabase/migrations/20261016023926_mobile_media.sql")
  ]);
  assert.match(social, /name="commentMedia" type="file" multiple/);
  assert.match(social, /comments\/\$\{postId\}\/\$\{comment\.id\}/);
  assert.match(social, /from\("comment_media"\)\.insert/);
  assert.match(social, /createSignedUrls\(allMedia\.map/);
  assert.match(social, /table: "comment_media"/);
  assert.match(migration, /alter table public\.comment_media enable row level security/i);
  assert.match(migration, /private\.can_view_post\(post_id\)/i);
  assert.match(migration, /looply_comment_media_read[\s\S]*?private\.can_view_post\(media\.post_id\)/i);
  assert.match(migration, /looply_comment_media_insert[\s\S]*?comment\.author_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /looply_comment_media_delete[\s\S]*?post\.author_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /byte_size between 1 and 104857600/i);
  assert.match(migration, /at most 4 media files/i);
});

test("comment media foreign keys have covering indexes", async () => {
  const sql = await read("supabase/migrations/20261016024015_mobile_media_fk_indexes.sql");
  assert.match(sql, /comment_media_author_id_idx[\s\S]*?on public\.comment_media \(author_id\)/i);
  assert.match(sql, /comment_media_comment_post_idx[\s\S]*?on public\.comment_media \(comment_id, post_id\)/i);
});

test("media storage stays private and follows post-level RLS", async () => {
  const names = await readdir(resolve(projectRoot, "supabase/migrations"));
  const filename = names.find((name) => name.endsWith("_private_post_media.sql"));
  assert.ok(filename);
  const sql = await read("supabase/migrations/" + filename);
  assert.match(sql, /'looply-media',[\s\S]*?false,[\s\S]*?104857600/i);
  assert.match(sql, /post_media_read_with_post[\s\S]*?private\.can_view_post\(post_id\)/i);
  assert.match(sql, /looply_media_read_authorized_post[\s\S]*?private\.can_view_post\(media\.post_id\)/i);
  assert.match(sql, /looply_media_insert_post_author[\s\S]*?p\.author_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /looply_media_delete_post_author[\s\S]*?p\.author_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /post_media_validate_uploaded_object/i);
  assert.doesNotMatch(sql, /grant select on public\.post_media to anon/i);
});

test("profile search and editing use only profile fields protected by RLS", async () => {
  const profiles = await read("src/profiles.js");
  assert.match(profiles, /const updates = \{ display_name: displayName, bio, profile_visibility: visibility \}/);
  assert.match(profiles, /from\("profiles"\)\.update\(updates\)/);
  assert.match(profiles, /storage\.from\("looply-avatars"\)\.createSignedUrls/);
  assert.match(profiles, /storage\.from\("looply-avatars"\)\.upload/);
  assert.match(profiles, /avatars\/\$\{userId\}\/\$\{crypto\.randomUUID\(\)\}/);
  assert.match(profiles, /\.ilike\("username", `\$\{query\}%`\)/);
  assert.match(profiles, /from\("posts"\)[\s\S]*?select\("id,body,created_at,media:post_media/);
  assert.doesNotMatch(profiles, /\.select\([^\n]*email/i);
});

test("music dedications are limited to the two participants and comments are private by default", async () => {
  const names = await readdir(resolve(projectRoot, "supabase/migrations"));
  const migration = names.find((name) => name.endsWith("_music_dedications_private_comments.sql"));
  assert.ok(migration);
  const [sql, module] = await Promise.all([read("supabase/migrations/" + migration), read("src/music.js")]);
  assert.match(sql, /music_dedications_read_participants[\s\S]*?sender_id = \(select auth\.uid\(\)\)[\s\S]*?recipient_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /music_comments_read_author_or_shared_participant[\s\S]*?visibility = 'participants'/i);
  assert.match(sql, /visibility text not null default 'private'/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.music_comments/i);
  assert.match(module, /from\("music_dedications"\)/);
  assert.match(module, /from\("music_comments"\)\.insert/);
  assert.match(module, /values\.get\("visibility"\) \|\| "private"/);
  assert.doesNotMatch(sql, /grant select on public\.music_comments to anon/i);
});

test("personal music libraries are owner-only and administrative reads are audited", async () => {
  const [migration, music, admin, edge] = await Promise.all([
    read("supabase/migrations/20261016002153_private_music_library.sql"),
    read("src/music.js"),
    read("src/admin.js"),
    read("supabase/functions/looply-admin/index.ts")
  ]);
  assert.match(migration, /alter table public\.music_library enable row level security/i);
  assert.match(migration, /music_library_select_owner[\s\S]*?owner_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /music_library_insert_owner[\s\S]*?with check \(owner_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /revoke all on table public\.music_library from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.music_library to authenticated/i);
  assert.match(migration, /music_library[\s\S]*?record_looply_admin_access/);
  assert.match(music, /from\("music_library"\)[\s\S]*?\.eq\("owner_id", userId\)/);
  assert.match(music, /from\("music_library"\)\.insert/);
  assert.match(music, /data-music-library-delete/);
  assert.match(music, /table: "music_library", filter: `owner_id=eq\.\$\{userId\}`/);
  assert.match(admin, /value="music_library"/);
  assert.match(edge, /resourceType === "music_library"/);
  assert.match(edge, /owner:profiles!music_library_owner_id_fkey/);
});

test("admin reads use a verified Edge Function and a service-role-only audit bridge", async () => {
  const names = await readdir(resolve(projectRoot, "supabase/migrations"));
  const bridgeName = names.find((name) => name.endsWith("_admin_audit_bridge.sql"));
  const denyName = names.find((name) => name.endsWith("_deny_direct_admin_audit_access.sql"));
  assert.ok(bridgeName);
  assert.ok(denyName);
  const [sql, denySql, edge, admin, config] = await Promise.all([
    read("supabase/migrations/" + bridgeName),
    read("supabase/migrations/" + denyName),
    read("supabase/functions/looply-admin/index.ts"),
    read("src/admin.js"),
    read("supabase/config.toml")
  ]);
  assert.match(sql, /private\.admin_audit[\s\S]*?enable row level security/i);
  assert.match(denySql, /admin_audit_deny_direct_access[\s\S]*?using \(false\)[\s\S]*?with check \(false\)/i);
  assert.match(sql, /is_looply_admin[\s\S]*?grant execute[\s\S]*?to service_role/i);
  assert.match(sql, /record_looply_admin_access[\s\S]*?grant execute[\s\S]*?to service_role/i);
  assert.match(edge, /auth\.getUser\(\)/);
  assert.match(edge, /record_looply_admin_access/);
  assert.match(edge, /createSignedUrls/);
  assert.match(config, /\[functions\.looply-admin\][\s\S]*?verify_jwt = true/i);
  assert.match(admin, /functions\.invoke\("looply-admin"/);
  assert.match(admin, /purpose.length < 20/);
  assert.doesNotMatch(edge, /sb_secret_[A-Za-z0-9_-]{10,}|service_role["']\s*:\s*["'][A-Za-z0-9_-]{20,}/i);
});

test("chat, letters, notifications, and attachments are private to conversation participants", async () => {
  const names = await readdir(resolve(projectRoot, "supabase/migrations"));
  const migrationName = names.find((name) => name.endsWith("_conversations_letters_chat_media.sql"));
  const hardeningName = names.find((name) => name.endsWith("_harden_chat_entrypoints.sql"));
  assert.ok(migrationName);
  assert.ok(hardeningName);
  const [sql, hardening, chat, edge, config] = await Promise.all([
    read("supabase/migrations/" + migrationName),
    read("supabase/migrations/" + hardeningName),
    read("src/chat.js"),
    read("supabase/functions/looply-chat/index.ts"),
    read("supabase/config.toml")
  ]);
  assert.match(sql, /private\.is_conversation_participant\(p_conversation_id uuid\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql, /chat_messages_select_participants[\s\S]*?private\.is_conversation_participant\(conversation_id\)/i);
  assert.match(sql, /chat_notifications_select_own[\s\S]*?user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /looply_chat_read_participants[\s\S]*?chat_media as media[\s\S]*?private\.is_conversation_participant/i);
  assert.match(sql, /looply-chat',[\s\S]*?false,[\s\S]*?104857600/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.chat_messages/i);
  assert.match(hardening, /revoke all on function public\.create_direct_conversation\(uuid, uuid\)[\s\S]*?from public, anon, authenticated, service_role[\s\S]*?grant execute[\s\S]*?to service_role/i);
  assert.match(hardening, /revoke all on function public\.create_admin_letter\(uuid, text, text\)[\s\S]*?from public, anon, authenticated, service_role[\s\S]*?grant execute[\s\S]*?to service_role/i);
  assert.match(chat, /functions\.invoke\("looply-chat"/);
  assert.match(chat, /createSignedUrls/);
  assert.match(chat, /tus-js-client@4\.3\.1/);
  assert.match(chat, /last_read_at/);
  assert.match(edge, /auth\.getUser\(\)/);
  assert.match(edge, /p_actor_id: authData\.user\.id/);
  assert.match(config, /\[functions\.looply-chat\][\s\S]*?verify_jwt = true/i);
  assert.doesNotMatch(edge, /sb_secret_[A-Za-z0-9_-]{10,}|service_role["']\s*:\s*["'][A-Za-z0-9_-]{20,}/i);
});

test("the original login keeps its recovery link without requiring SMTP for sign-in", async () => {
  const [login, page] = await Promise.all([read("src/login.js"), read("login.html")]);
  assert.match(login, /signInWithPassword/);
  assert.match(page, /Esqueci minha senha/);
  assert.doesNotMatch(login, /resetPasswordForEmail|auth\.updateUser/);
  assert.doesNotMatch(login, /localStorage\.(?:getItem|setItem)\(["'](?:username|password|isLoggedIn)/i);
});

test("administrative comments preserve actor identity and audit both sides of the write", async () => {
  const names = await readdir(resolve(projectRoot, "supabase/migrations"));
  const migrationName = names.find((name) => name.endsWith("_admin_audited_comments.sql"));
  assert.ok(migrationName);
  const [sql, edge, admin] = await Promise.all([
    read("supabase/migrations/" + migrationName),
    read("supabase/functions/looply-admin/index.ts"),
    read("src/admin.js")
  ]);
  assert.match(sql, /'write_requested', 'write_completed', 'write_failed'/i);
  assert.match(edge, /payload\.action === "comment"/);
  assert.match(edge, /recordAccess\(service, authData\.user\.id, "write_requested", "posts"/);
  assert.match(edge, /author_id: authData\.user\.id/);
  assert.match(edge, /"write_completed"/);
  assert.match(admin, /data-admin-comment/);
  assert.match(admin, /action: "comment"/);
});

test("owners can remove their own feed posts and profile pages render authorized media", async () => {
  const [social, profiles] = await Promise.all([read("src/social.js"), read("src/profiles.js")]);
  assert.match(social, /post\.author_id === userId[\s\S]*?data-delete-post/);
  assert.match(social, /storage\.from\("looply-media"\)\.remove\(paths\)/);
  assert.match(social, /\.delete\(\)\.eq\("id", postId\)\.eq\("author_id", userId\)/);
  assert.match(profiles, /createSignedUrls\(media\.map\(\(item\) => item\.storage_path\), 1800\)/);
  assert.match(profiles, /profile-post-media-grid/);
});

test("the legacy archive migration keeps letters private and all media objects behind RLS", async () => {
  const [migration, cards, importer, edge] = await Promise.all([
    read("supabase/migrations/20261016041000_legacy_archive.sql"),
    read("src/archived-cards.js"),
    read("src/archive-import.js"),
    read("supabase/functions/looply-admin/index.ts")
  ]);
  assert.match(migration, /create table public\.archived_cards[\s\S]*?enable row level security/i);
  assert.match(migration, /archived_cards_recipient_read[\s\S]*?recipient_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /create table private\.archived_card_secrets[\s\S]*?password_hash text not null/i);
  assert.match(migration, /body text,[\s\S]*?password_salt text not null[\s\S]*?password_hash text not null/i);
  assert.match(migration, /grant execute on function public\.read_looply_archived_card_secret\(uuid, uuid\) to service_role/i);
  assert.match(migration, /grant execute on function public\.consume_looply_archived_card_unlock\(uuid, uuid\) to service_role/i);
  assert.match(migration, /attempts between 0 and 8/i);
  const denyPolicies = await read("supabase/migrations/20261016043000_archive_secret_deny_policies.sql");
  assert.match(denyPolicies, /archived_card_secrets_deny_direct_access[\s\S]*?using \(false\)[\s\S]*?with check \(false\)/i);
  assert.match(denyPolicies, /archived_card_unlock_attempts_deny_direct_access[\s\S]*?using \(false\)[\s\S]*?with check \(false\)/i);
  assert.match(migration, /create table public\.archive_media[\s\S]*?visibility text not null[\s\S]*?enable row level security/i);
  assert.match(migration, /archive_media_audience_read[\s\S]*?private\.can_view_archive_media\(id\)/i);
  assert.match(migration, /looply_legacy_archive_media_read[\s\S]*?private\.can_view_archive_media/i);
  assert.match(migration, /looply_legacy_archive_admin_insert[\s\S]*?private\.is_admin\(\)/i);
  assert.match(migration, /looply_legacy_archive_admin_delete[\s\S]*?private\.is_admin\(\)/i);
  assert.match(migration, /update storage\.buckets[\s\S]*?image\/heic[\s\S]*?audio\/mpeg/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.archive_media_comments/i);
  assert.match(cards, /from\("archived_cards"\)\.select\("id,recipient_id,original_file,card_number,is_private,is_protected,password_hint,body,sent_date"\)/);
  assert.doesNotMatch(cards, /password_(?:salt|hash)/);
  assert.match(importer, /action: "import_archived_cards", resourceType: "archived_cards"/);
  assert.match(importer, /action: "register_archive_media", resourceType: "archive_media"/);
  assert.match(edge, /payload\.action === "unlock_archived_card"[\s\S]*?consume_looply_archived_card_unlock[\s\S]*?verifyArchivedCardPassword[\s\S]*?reset_looply_archived_card_unlock/);
  assert.match(edge, /recordAccess\(service, authData\.user\.id, "read_completed", media\.bucket_id === "looply-chat" \? "chat_media" : media\.audit_resource_type \|\| "post_media"/);
});

test("the archive importer uses the media index and preserves exclusive audiences", async () => {
  const { makeMediaCatalog } = await import("../src/archive-import.js");
  const index = {
    fotos: [
      { path: "midia/comum.jpg" },
      { path: "midia/Misol/restrita.jpg" },
      { path: "midia/fora-da-audiencia/ignorada.jpg" }
    ],
    videos: [{ path: "midia/video.mp4" }],
    audios: [],
    exclusivo: {
      Misol: [{ path: "midia/Misol/restrita.jpg" }],
      YARA: [{ path: "midia/YARA/foto.heic" }],
      Patati: []
    }
  };
  const paths = ["midia/comum.jpg", "midia/Misol/restrita.jpg", "midia/video.mp4", "midia/YARA/foto.heic"];
  const fileMap = new Map(paths.map((path) => [path.toLocaleLowerCase("pt-BR"), { path, file: {} }]));
  const catalog = makeMediaCatalog(index, fileMap);
  assert.equal(catalog.length, 4);
  assert.equal(catalog.find((item) => item.source_path === "midia/comum.jpg").visibility, "members");
  assert.deepEqual(catalog.find((item) => item.source_path === "midia/Misol/restrita.jpg").recipient_names, ["misol"]);
  assert.deepEqual(catalog.find((item) => item.source_path === "midia/YARA/foto.heic").recipient_names, ["yara"]);
  assert.equal(catalog.find((item) => item.source_path === "midia/YARA/foto.heic").mime_type, "image/heic");
  assert.equal(catalog.some((item) => item.source_path.includes("fora-da-audiencia")), false);
});

test("the admin screen connects the archive importer and audited archive comments", async () => {
  const [admin, entry, css] = await Promise.all([
    read("src/admin.js"), read("assets/js/admin.js"), read("assets/css/pages/admin.css")
  ]);
  assert.match(admin, /data-archive-import/);
  assert.match(admin, /value="archived_cards"/);
  assert.match(admin, /value="archive_media"/);
  assert.match(admin, /data-admin-archive-comment/);
  assert.match(admin, /action: "comment_archive_media"/);
  assert.match(admin, /data-admin-offset-field/);
  assert.match(entry, /bindArchiveImport\(root, client\)/);
  assert.match(css, /archive-import-errors/);
});


