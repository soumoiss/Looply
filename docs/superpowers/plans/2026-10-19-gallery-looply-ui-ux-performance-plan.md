# Gallery Looply UI/UX Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the existing Looply gallery into a mobile-first, full-screen viewer with anchored pinch/pan, bottom sheets, lazy thumbnails, instant comments, and verified Supabase comment visibility.

**Architecture:** Keep `assets/js/gallery.js` as the page coordinator and extract gesture math into a pure `assets/js/gallery-gestures.js` module. The coordinator owns query/render state and delegates transform calculations; CSS owns layout, safe areas, sheet transitions, skeletons, and overflow protection. Existing RPCs and RLS remain the authorization boundary.

**Tech Stack:** Browser ES modules, vanilla DOM/CSS, Node built-in test runner, Supabase Storage signed URLs, PostgreSQL RLS/migrations.

**Spec:** `docs/superpowers/specs/2026-10-19-gallery-looply-ui-ux-performance-design.md`

## Global Constraints

- Keep gallery tabs `Recentes`, `Privadas`, and `Exclusivas`.
- On mobile, secondary filters are entered through one `Filtros` control and a bottom sheet.
- Viewer actions are limited to Voltar, Curtir, Editar for admins, and `…`; secondary actions live in the action sheet.
- Thumbnail URLs are lazy and HD URLs are resolved only when opening viewer/detail flows.
- `selected` comments are authorized by Supabase RLS/RPC for author or recipients plus parent-media visibility.
- No authorization decision may use `user_metadata`.
- Preserve `prefers-reduced-motion`, focus restoration, Escape/backdrop dismissal, and safe-area insets.
- Do not alter unrelated pages, global icon inventory, or storage structure.

## Review Focus

- A two-finger pinch must keep the point between fingers visually anchored while scale changes; test this in the pure controller.
- A one-finger drag at scale 1 must remain a viewer swipe, while the same drag above scale 1 must pan and be clamped; test both paths.
- Opening comments from a tile must not trigger a page reload or fetch all comment bodies for the grid; test event/render contracts and query shape.
- A thumbnail transform failure must fall back to the original signed URL without blocking the gallery; test the fallback branch.
- A selected comment must not leak to a third party even when the third party can view the parent media; test the migration contract for author, recipient, and outsider.

### Task 1: Extract and verify anchored pan/zoom state

**Files:**
- Create: `assets/js/gallery-gestures.js`
- Modify: `assets/js/gallery.js`
- Test: `tests/gallery-gestures.test.mjs`

**Interfaces:**
- Produces `createGalleryGestureController(options)` with `beginPointer`, `movePointer`, `endPointer`, `reset`, `getState`, and `getTransform` methods; later tasks consume `getTransform()` for CSS `translate3d` application.

- [ ] **Step 1: Write the failing tests** for pinch anchoring, pan clamping, reset, and swipe-vs-pan mode selection.
- [ ] **Step 2: Run `node --test tests/gallery-gestures.test.mjs` and verify it fails because the controller is absent or does not satisfy the assertions.**
- [ ] **Step 3: Implement the minimal pure controller** using pointer coordinates, stage/media bounds, scale limits `1..5`, and a two-pointer midpoint anchor; keep DOM-free math in `assets/js/gallery-gestures.js`.
- [ ] **Step 4: Wire `gallery.js` pointer listeners to the controller** and apply `translate3d(x, y, 0) scale(s)` to the viewer media.
- [ ] **Step 5: Run `node --test tests/gallery-gestures.test.mjs` and the existing gallery tests; verify all pass.**
- [ ] **Step 6: Commit with `git add assets/js/gallery-gestures.js assets/js/gallery.js tests/gallery-gestures.test.mjs && git commit -m "feat: add anchored gallery pan zoom"`.**

### Task 2: Make gallery filters and media loading resilient on mobile

**Files:**
- Modify: `assets/js/gallery.js`
- Modify: `assets/css/pages/gallery.css`
- Test: `tests/gallery-mobile-contract.test.mjs`

**Interfaces:**
- Consumes gesture controller from Task 1.
- Produces stable markup markers for `data-filter-sheet`, `data-comment-count`, `data-gallery-thumbnail`, and a deduplicated `ensureMediaUrl(item, thumbnail)` flow.

- [ ] **Step 1: Write failing contract tests** asserting horizontal mobile controls, one filter entry point, reserved skeleton slots, comment indicators, paginated metadata queries, and thumbnail-first URL requests.
- [ ] **Step 2: Run `node --test tests/gallery-mobile-contract.test.mjs` and verify the missing/incorrect markers or query shape fail.**
- [ ] **Step 3: Update gallery markup and state** so mobile secondary filters use a bottom sheet, filters do not mutate unrelated sections, and comment counts are loaded as counts/flags only.
- [ ] **Step 4: Update thumbnail loading** to use transformed Storage URLs when available, fall back to the original signed URL, and deduplicate in-flight requests.
- [ ] **Step 5: Update CSS** to enforce horizontal writing mode, row controls, `min-width: 0`, non-overlapping labels, stable aspect-ratio slots, and reduced-motion skeletons.
- [ ] **Step 6: Run the focused contract test and the existing gallery suite; verify all pass.**
- [ ] **Step 7: Commit with `git add assets/js/gallery.js assets/css/pages/gallery.css tests/gallery-mobile-contract.test.mjs && git commit -m "feat: stabilize gallery mobile loading and filters"`.**

### Task 3: Consolidate viewer action sheet and instant comment drawer

**Files:**
- Modify: `assets/js/gallery.js`
- Modify: `assets/css/pages/gallery.css`
- Test: `tests/gallery-viewer-sheets.test.mjs`

**Interfaces:**
- Consumes `getTransform()` and lazy URL behavior from Tasks 1–2.
- Produces viewer markup with exactly four primary action roles and sheet actions for details, share, comments, private move, and admin delete.

- [ ] **Step 1: Write failing tests** for the four-action viewer contract, secondary action list, focus restoration, comment drawer opening from a card, no reload, and escaped markup without stray implementation characters.
- [ ] **Step 2: Run `node --test tests/gallery-viewer-sheets.test.mjs` and verify it fails against the current markup/handlers.**
- [ ] **Step 3: Refactor viewer event handling** so the primary bar stays minimal, action-sheet actions are routed through one active-media state, and dangerous delete is confirmed before its RPC.
- [ ] **Step 4: Implement the comment drawer path** to fetch comment bodies only for the selected media, render loading/error/empty states, and preserve the active gallery position.
- [ ] **Step 5: Finish CSS sheet transitions and viewer containment** so no header/footer control overlays the media content area.
- [ ] **Step 6: Run focused viewer tests plus the full existing gallery suite; verify all pass.**
- [ ] **Step 7: Commit with `git add assets/js/gallery.js assets/css/pages/gallery.css tests/gallery-viewer-sheets.test.mjs && git commit -m "feat: simplify gallery viewer and comment sheets"`.**

### Task 4: Verify selected-comment RLS and complete branch validation

**Files:**
- Modify/Create: `supabase/migrations/20261019193000_gallery_comment_visibility_hardening.sql` only if the audit finds a policy gap
- Modify: `tests/gallery-comment-recipient-access.test.mjs` or add a focused policy test

**Interfaces:**
- Consumes the existing archive/community comment RPC and private authorization helpers.
- Produces a migration only when needed, with policies that require parent-media visibility and selected-recipient/author access.

- [ ] **Step 1: Write/extend failing policy-contract tests** for author, selected recipient, parent-media viewer who is not selected, and anonymous access.
- [ ] **Step 2: Run the focused policy test and verify the current migration either fails the new contract or is proven sufficient.**
- [ ] **Step 3: If needed, create the migration with the Supabase CLI migration workflow, implement invoker-safe policies, and grant only required execution rights.**
- [ ] **Step 4: Run the focused policy test and Supabase advisor/SQL verification; verify no direct-client authorization bypass exists.**
- [ ] **Step 5: Run `npm test` and `npm run build`; verify exit code 0 and zero failures.**
- [ ] **Step 6: Commit the policy/test changes with `git add supabase tests && git commit -m "fix: enforce gallery selected comment visibility"` when a schema change is necessary.**

