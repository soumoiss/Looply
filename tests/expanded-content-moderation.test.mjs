import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

test('archive and music moderation are included in the server allowlist', async () => {
  const edge = await readFile(resolve(root, 'supabase/functions/looply-admin/index.ts'), 'utf8');
  for (const type of ['archive_media', 'archive_media_comment', 'music_page_comment']) {
    assert.ok(edge.includes(type), `missing content type: ${type}`);
  }
  assert.match(edge, /adminSessionToken = String\(payload\.adminSessionToken \|\| ""\)/);
  assert.match(edge, /moderation_completed/);
});

test('moderated archive media and comments are blocked by access functions', async () => {
  const sql = await readFile(resolve(root, 'supabase/migrations/20261019080000_expanded_content_moderation.sql'), 'utf8');
  assert.match(sql, /not private\.looply_content_is_hidden\('archive_media', media\.id\)/);
  assert.match(sql, /not private\.looply_content_is_hidden\('archive_media_comment', comment_row\.id\)/);
  assert.match(sql, /not private\.looply_content_is_hidden\('archive_media', comment_row\.media_id\)/);
  assert.match(sql, /music_page_comments_read_general_or_author_or_admin/);
});

test('admin UI exposes moderation actions for archive and music comments', async () => {
  const ui = await readFile(resolve(root, 'src/admin.js'), 'utf8');
  assert.match(ui, /moderationFormMarkup\("archive_media"/);
  assert.match(ui, /moderationFormMarkup\("archive_media_comment"/);
  assert.match(ui, /moderationFormMarkup\("music_page_comment"/);
});
