import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createNotificationBus } from "../src/notification-bus.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("notification changes are debounced together and preserve their sources", async () => {
  const bus = createNotificationBus();
  const batches = [];
  bus.subscribeDebounced((event) => batches.push(event), 25);

  bus.emit({ type: "notification-changed", source: "app" });
  bus.emit({ type: "notification-changed", source: "chat" });
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.deepEqual(batches, [{ type: "notification-changed", sources: ["app", "chat"] }]);
});

test("unsubscribing from debounced notification changes cancels pending work", async () => {
  const bus = createNotificationBus();
  const batches = [];
  const unsubscribe = bus.subscribeDebounced((event) => batches.push(event), 20);

  bus.emit({ type: "notification-changed", source: "app" });
  unsubscribe();
  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.deepEqual(batches, []);
});

test("the app runtime is the sole Realtime source for notification tables", async () => {
  const [runtime, notifications, chat] = await Promise.all([
    read("../src/page-runtime.js"),
    read("../assets/js/notifications.js"),
    read("../src/chat.js")
  ]);

  assert.match(runtime, /table: "notifications"[\s\S]*?refreshBadgeSoon\("app"\)/);
  assert.match(runtime, /table: "chat_notifications"[\s\S]*?refreshBadgeSoon\("chat"\)/);
  assert.match(notifications, /notificationBus\.subscribeDebounced/);
  assert.doesNotMatch(notifications, /\.channel\(`looply-notifications-page-/);
  assert.match(notifications, /stopWatching\(\)/);
  assert.match(chat, /notificationBus\.subscribeDebounced/);
  assert.doesNotMatch(chat, /table: "chat_notifications"/);
  assert.match(chat, /stopNotificationChanges\?\.\(\)/);
});


test("Neon notifications have bounded foreground refresh without PostgreSQL change feeds", async () => {
  const runtime = await read("../src/page-runtime.js");
  assert.match(runtime, /const notificationPollTimer = window\.setInterval\(pollNotifications, 6000\)/);
  assert.match(runtime, /if \(document\.visibilityState === "hidden"\) return/);
  assert.match(runtime, /notificationBus\.emit\(\{ type: "notification-changed", source: "neon-poll" \}\)/);
  assert.match(runtime, /window\.clearInterval\(notificationPollTimer\)/);
  assert.match(runtime, /window\.removeEventListener\("focus", pollNotifications\)/);
  assert.match(runtime, /document\.removeEventListener\("visibilitychange", pollNotifications\)/);
});


test("notification refresh preserves scroll and controls when records are unchanged", async () => {
  const notifications = await read("../assets/js/notifications.js");
  assert.match(notifications, /lastNotificationSignature/);
  assert.match(notifications, /nextSignature === lastNotificationSignature/);
  assert.match(notifications, /root\.querySelector\("\[data-notification-list\]"\)/);
  assert.match(notifications, /lastNotificationSignature = nextSignature/);
});
