# Looply Notifications, Web Push, Calls, and Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep notification badges reactive in-app, add browser Web Push infrastructure, and define the native Android path for background notifications and incoming calls.

**Architecture:** Reuse Supabase Realtime for in-app events and add a client event bus for debounced badge/toast updates. Store Web Push subscriptions under RLS and send through a secret-backed Edge Function. Keep WebRTC in the existing web layer while FCM and native Android notifications wake the app and deep-link into the conversation.

**Tech Stack:** Supabase Realtime/RLS/Edge Functions, Web Push API, Service Worker, Firebase Cloud Messaging, Kotlin Android WebView.

**Spec:** `docs/superpowers/specs/2026-10-19-looply-publications-performance-push-android-design.md`

## Global Constraints

- Browser code uses only the publishable Supabase key.
- VAPID private key, FCM server credentials, and Firebase configuration secrets never enter the public bundle.
- Push permission is requested only after explicit user action.
- Camera/microphone and calls require explicit user permission and action; no auto-answer.

## Review Focus

- Realtime bursts must not multiply subscriptions or duplicate badges — test channel lifecycle and debounce.
- Push subscription replacement/removal must be scoped to the authenticated user — test RLS and client upsert.
- Expired Push endpoints must be deleted without failing the originating notification — test Edge Function behavior.
- Service Worker Push payloads must not expose private message bodies to an unauthenticated click target — test notification data/deep-link validation.
- Android permission denial must leave the WebView usable and explain the unavailable feature — test native permission paths.

### Task 1: Global in-app notification bus

**Files:**
- Create: `src/notification-bus.js`
- Modify: `src/page-runtime.js`, `assets/js/notifications.js`, `src/chat.js`
- Test: `tests/notifications-realtime-contract.test.mjs`

**Interfaces:**
- `createNotificationBus() -> { emit(event), subscribe(listener), destroy() }`.
- `refreshUnreadBadge(header, client, { signal }) -> Promise<number>` remains the single count updater.

- [ ] Write failing tests for one subscription per page, debounced refresh, and cleanup on page teardown.
- [ ] Run focused tests and verify current refreshes are independent and uncoordinated.
- [ ] Implement the bus and route existing notification/chat Realtime events through it.
- [ ] Keep notification list loading paginated and preserve current read-marking behavior.
- [ ] Run focused tests and existing notification/chat tests.
- [ ] Commit `feat: unify realtime notification badge updates`.

### Task 2: Web Push subscription storage and browser client

**Files:**
- Create: `supabase/migrations/<timestamp>_push_subscriptions.sql`
- Create: `src/web-push.js`, `assets/js/push-settings.js`
- Modify: `sw.js`, `src/page-runtime.js`, `config.js` only for public VAPID key configuration
- Test: `tests/web-push-contract.test.mjs`

**Interfaces:**
- `registerPushSubscription(client, { vapidPublicKey }) -> Promise<{ ok, reason }>`.
- `removePushSubscription(client, endpoint) -> Promise<void>`.
- Table fields: `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `created_at`, `updated_at`, unique by `(user_id, endpoint)`.

- [ ] Write failing tests for secure RLS, explicit permission flow, VAPID conversion, registration, upsert, and removal.
- [ ] Run focused tests and verify the table/module/worker handlers are absent.
- [ ] Add the RLS migration, client module, settings entry point, and Service Worker `push`/`notificationclick` handlers.
- [ ] Validate notification clicks against an allowlisted internal route before opening it.
- [ ] Run focused tests and build the worker into `dist`.
- [ ] Commit `feat: add browser web push subscriptions`.

### Task 3: Push dispatcher Edge Function

**Files:**
- Create: `supabase/functions/looply-push/index.ts`
- Modify: `supabase/config.toml`, event triggers/notification integration files
- Test: `tests/push-dispatch-contract.test.mjs`

**Interfaces:**
- Function input: `{ recipientIds: string[], title: string, body: string, url: string, kind: string }`.
- Function uses VAPID secrets, sends best-effort payloads, and removes endpoints returning permanent gone/invalid errors.

- [ ] Write failing tests for auth, input bounds, secret-only configuration, allowlisted URLs, and expired endpoint cleanup.
- [ ] Run focused tests and verify failure.
- [ ] Implement the Edge Function with bounded payloads and no raw upstream error leakage.
- [ ] Wire relevant notification producers without blocking their primary database action.
- [ ] Run Deno checks and focused contract tests.
- [ ] Commit `feat: dispatch looply web push notifications`.

### Task 4: Android FCM and incoming-call shell

**Files:**
- Modify: `android/app/build.gradle.kts`, `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/java/com/soumoiss/looply/LooplyMessagingService.kt`, notification channel/deep-link helpers
- Modify: `android/app/src/main/java/com/soumoiss/looply/MainActivity.kt`
- Test: `tests/android-notifications-contract.test.mjs`

**Interfaces:**
- `LooplyMessagingService` handles FCM token refresh and high-priority call/message payloads.
- `MainActivity` accepts a validated conversation deep link and resumes the WebView without granting media permission implicitly.

- [ ] Write failing tests for manifest permissions, Firebase dependency, notification channel, deep-link allowlist, and runtime media permission behavior.
- [ ] Run focused tests and verify the current WebView-only APK lacks FCM/background-call support.
- [ ] Add Firebase dependencies only with repository configuration/credentials available; otherwise keep the native task explicitly blocked and document required setup.
- [ ] Implement notification tap routing and foreground call handoff; never auto-answer.
- [ ] Run Gradle assemble/debug checks and existing web tests.
- [ ] Commit `feat: add native android notification entrypoint`.

### Task 5: Verification and platform documentation

- [ ] Run browser build and `node --test tests/*.test.mjs`.
- [ ] Run Deno checks for all Edge Functions.
- [ ] Run Android debug build with the configured Node executable.
- [ ] Document required Supabase secrets, VAPID keys, Firebase project files, Android runtime permissions, and the limitation that WebView WebRTC alone cannot receive calls with the process fully closed.
