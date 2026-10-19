# Looply Publications and Admin Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow media-only Feed, Gallery, and Story publications while removing manual ADM justifications without weakening server authorization or auditability.

**Architecture:** Keep the static JavaScript frontend and Supabase authorization model. Make publication bodies nullable/empty-safe at the database boundary, then remove client-side text requirements. Replace ADM prompts with a server-generated audit purpose derived from the validated action.

**Tech Stack:** Vanilla JavaScript modules, Supabase PostgreSQL/RLS, Supabase Edge Functions, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-19-looply-publications-performance-push-android-design.md`

## Global Constraints

- Never expose `service_role` or secret keys to the browser.
- Keep Auth, ADM membership, RLS, allowlists, and server-side audit checks.
- A publication requires media or non-empty text; an individual comment still requires non-empty text.
- Do not create replacement copy such as “Compartilhou uma mídia.” when the user supplied no text.

## Review Focus

- Empty text plus one valid media file must insert and render without placeholder text — test in publication contract tests.
- Empty text without media must still be rejected — test in publication contract tests.
- Selected-recipient posts must validate recipients even when body is empty — test migration/RPC contract.
- An unauthenticated or non-ADM caller must still be rejected without a prompt — test Edge Function contract.
- ADM audit rows must retain a non-empty server-generated purpose — test audit contract.

### Task 1: Database publication contracts

**Files:**
- Create: `supabase/migrations/<timestamp>_optional_publication_bodies.sql`
- Modify: `tests/social-private-sharing.test.mjs` or a focused new test file

**Interfaces:**
- `posts.body` and `stories.body` accept `NULL`/empty values while preserving max lengths.
- `public.create_selected_post(p_body text, p_recipient_ids uuid[])` accepts empty body but validates recipients.

- [ ] Write failing tests asserting nullable/empty-safe checks, retained max lengths, and selected recipient validation.
- [ ] Run `node --test tests/<focused-file>.test.mjs` and verify failure against current `NOT NULL`/minimum checks.
- [ ] Implement the migration with idempotent constraint replacement and explicit grants unchanged.
- [ ] Run the focused test and verify PASS.
- [ ] Commit `feat: allow media-only publications at database boundary`.

### Task 2: Feed, Gallery, and Story composers

**Files:**
- Modify: `src/social.js`
- Modify: `src/stories.js`
- Modify: `assets/js/gallery.js`
- Test: `tests/media-only-publications.test.mjs`

**Interfaces:**
- `validatePublicationInput({ text, mediaCount, externalUrl }) -> { ok, reason }` in `src/publication-validation.js`.
- Feed, Story, and Gallery submit handlers use the same validator and send `null` for empty text.

- [ ] Write failing tests for media-only success, text-only success where supported, and empty-without-media rejection.
- [ ] Run the focused test and confirm it fails because current forms use `required`/minimum text and fallback body copy.
- [ ] Add the shared validator and change all three composers to use it; remove text `required` attributes and fallback copy.
- [ ] Render captions/bodies only when trimmed content exists.
- [ ] Run focused tests plus the relevant gallery/social/story suites.
- [ ] Commit `feat: support media-only publishing flows`.

### Task 3: Direct ADM actions with automatic audit purpose

**Files:**
- Modify: `src/admin.js`, `assets/js/admin.js`, `assets/js/gallery.js`, `src/page-runtime.js`
- Modify: `supabase/functions/looply-admin/index.ts`
- Test: `tests/admin-direct-actions.test.mjs`

**Interfaces:**
- `adminAuditPurpose(action, resourceType) -> string` is server-owned and returns a non-empty bounded description.
- Client actions send no `purpose` field and never call `prompt()`/`confirm()` for ADM operations.

- [ ] Write failing tests for absent prompts, direct action dispatch, server-generated purpose, and preserved ADM rejection.
- [ ] Run focused tests and verify current prompt/purpose requirements fail.
- [ ] Remove UI prompts/confirmations and route actions directly to the existing protected endpoints.
- [ ] Generate bounded audit purpose server-side from an allowlisted action/resource pair; reject unknown actions.
- [ ] Run focused admin/security contract tests and the full suite.
- [ ] Commit `feat: streamline audited admin actions`.

### Task 4: Verification

- [ ] Run `node scripts/build.mjs`.
- [ ] Run `node --test tests/*.test.mjs`.
- [ ] Run `git diff --check` and inspect the migration for RLS/grant regressions.
- [ ] Apply/verify the migration through the configured Supabase workflow before deployment.
