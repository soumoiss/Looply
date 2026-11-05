// Route authenticated inbox offers to the active chat WebRTC controller.
// The global listener must never silently drop a call merely because its
// conversation is open: the room subscription may still be connecting.
export function routeIncomingCallToOpenChat(root, conversationId, payload, EventType = globalThis.CustomEvent) {
  if (!root || root.dataset?.chatCalls !== "true" || !conversationId ||
      !payload || typeof payload !== "object" || typeof EventType !== "function") return false;
  const headingId = root.querySelector?.(".chat-thread-heading")?.dataset?.conversationId;
  const composerId = root.querySelector?.("[data-chat-send]")?.dataset?.conversationId;
  if (headingId !== conversationId && composerId !== conversationId) return false;
  const event = new EventType("looply:incoming-call", {
    cancelable: true,
    detail: { conversationId, payload }
  });
  root.dispatchEvent(event);
  return event.defaultPrevented;
}
