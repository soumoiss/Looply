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
