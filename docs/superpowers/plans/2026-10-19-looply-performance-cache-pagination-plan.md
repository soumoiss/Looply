# Looply Performance, Cache, and Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the media app load a small shell quickly, fetch thumbnails and paginated records incrementally, and avoid full-tree refreshes.

**Architecture:** Add a versioned Service Worker for same-origin static assets only, reuse Supabase Storage image transformations for list media, and introduce a small cursor/range helper for Feed, Gallery, Chat, and notifications. Realtime events invalidate the affected page instead of replacing unrelated DOM.

**Tech Stack:** Service Worker Cache Storage, vanilla JavaScript, Supabase JS `.range()`, PostgreSQL indexes, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-19-looply-publications-performance-push-android-design.md`

## Global Constraints

- Never cache Supabase/API responses or private media in a public Service Worker cache.
- Keep original media out of list/grid requests; request HD only from the viewer.
- Preserve stable ordering by timestamp plus ID tie-breaker.
- Avoid a React migration; the repository is vanilla JavaScript.

## Review Focus

- Offline cache must never serve stale authenticated data as public content — test Service Worker route matching.
- A failed thumbnail transform must preserve a safe fallback without blanking the list — test media URL helper.
- A page boundary must not duplicate or skip rows — test cursor/range helper.
- Realtime bursts must be debounced and preserve the composer/draft DOM — test refresh scheduler.
- Empty pages and deleted rows must terminate infinite scroll cleanly — test pagination state.

### Task 1: Static shell Service Worker

**Files:**
- Create: `sw.js`
- Modify: `src/page-runtime.js`, `scripts/build.mjs`
- Test: `tests/service-worker-contract.test.mjs`

**Interfaces:**
- `registerLooplyServiceWorker() -> Promise<ServiceWorkerRegistration | null>` in `src/service-worker.js`.
- Service Worker cache name is `looply-shell-v1`; only same-origin GET requests for allowlisted static extensions are cached.

- [ ] Write failing tests for registration, cache versioning, same-origin filtering, and bypass of Supabase/private media.
- [ ] Run focused tests and verify the files/contract are absent.
- [ ] Implement the worker and idempotent runtime registration.
- [ ] Run focused tests and verify PASS.
- [ ] Commit `feat: cache the static looply shell safely`.

### Task 2: Shared media thumbnail helper

**Files:**
- Create or modify: `src/media-urls.js`
- Modify: `src/social.js`, `assets/js/gallery.js`, `src/stories.js`
- Test: `tests/media-thumbnails.test.mjs`

**Interfaces:**
- `createThumbnailUrl(storage, bucket, path, { width, height, quality }) -> Promise<string | null>`.
- `createOriginalUrl(storage, bucket, path) -> Promise<string | null>` for viewer-only use.

- [ ] Write failing tests proving list code requests transformed sizes and viewer code requests original media.
- [ ] Run focused tests and confirm current code does not satisfy all consumers.
- [ ] Implement the helper with per-object fallback and no public caching of private URLs.
- [ ] Add `loading="lazy"`, `decoding="async"`, and intrinsic dimensions where markup lacks them.
- [ ] Run focused media tests and existing gallery/social tests.
- [ ] Commit `perf: standardize thumbnail loading across media lists`.

### Task 3: Range pagination and infinite scroll

**Files:**
- Create: `src/pagination.js`
- Modify: `src/social.js`, `assets/js/gallery.js`, `src/chat.js`, `assets/js/notifications.js`
- Test: `tests/pagination-contract.test.mjs`

**Interfaces:**
- `createPagedLoader({ pageSize, fetchPage }) -> { loadNext(), reset(), hasMore }`.
- `fetchPage({ from, to, cursor }) -> Promise<{ rows, nextCursor, hasMore }> `.

- [ ] Write failing tests for first page, next page, duplicate boundary, empty page, and reset.
- [ ] Run focused tests and verify failure.
- [ ] Implement the helper and connect sentinel/“carregar mais” handlers without replacing existing drafts/composers.
- [ ] Update Supabase queries to use `.range(start, end)` with stable order and bounded profile lookups.
- [ ] Run focused tests and the existing chat/gallery/social suites.
- [ ] Commit `perf: paginate media and conversation lists`.

### Task 4: Database indexes

**Files:**
- Create: `supabase/migrations/<timestamp>_looply_performance_indexes.sql`
- Test: `tests/database-indexes.test.mjs`

- [ ] Write failing assertions for only the absent indexes on posts/media/conversations/messages/notifications.
- [ ] Run the focused test and verify the expected indexes are missing.
- [ ] Add idempotent indexes with partial predicates for unread rows where appropriate.
- [ ] Run tests and Supabase advisors/verification; remove any duplicate or unused index.
- [ ] Commit `perf: add indexes for paginated looply feeds`.

### Task 5: Verification

- [ ] Run `node scripts/build.mjs`.
- [ ] Run `node --test tests/*.test.mjs`.
- [ ] Smoke-test shell registration, list thumbnail requests, and next-page loading in the published browser.
