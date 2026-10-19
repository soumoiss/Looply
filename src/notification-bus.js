export function createNotificationBus() {
  const listeners = new Set();
  return { emit(event) { listeners.forEach((listener) => listener(event)); }, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, destroy() { listeners.clear(); } };
}
export const notificationBus = globalThis.__looplyNotificationBus ||= createNotificationBus();
