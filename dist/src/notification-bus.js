export function createNotificationBus() {
  const listeners = new Set();
  return {
    emit(event) { listeners.forEach((listener) => listener(event)); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    subscribeDebounced(listener, delay = 150) {
      let timer = null;
      const sources = new Set();
      const unsubscribe = this.subscribe((event) => {
        if (event?.type !== "notification-changed") return;
        if (event.source) sources.add(event.source);
        clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          const changedSources = [...sources];
          sources.clear();
          listener({ type: "notification-changed", sources: changedSources });
        }, delay);
      });
      return () => {
        clearTimeout(timer);
        timer = null;
        sources.clear();
        unsubscribe();
      };
    },
    destroy() { listeners.clear(); }
  };
}
export const notificationBus = globalThis.__looplyNotificationBus ||= createNotificationBus();
