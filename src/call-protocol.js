export const CALL_STATES = Object.freeze({
  IDLE: "idle",
  RINGING: "ringing",
  DIALING: "dialing",
  ACCEPTING: "accepting",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ENDED: "ended",
  FAILED: "failed"
});

const transitions = Object.freeze({
  [CALL_STATES.IDLE]: new Set([CALL_STATES.RINGING, CALL_STATES.DIALING]),
  [CALL_STATES.RINGING]: new Set([CALL_STATES.ACCEPTING, CALL_STATES.ENDED, CALL_STATES.FAILED]),
  [CALL_STATES.DIALING]: new Set([CALL_STATES.CONNECTING, CALL_STATES.ENDED, CALL_STATES.FAILED]),
  [CALL_STATES.ACCEPTING]: new Set([CALL_STATES.RINGING, CALL_STATES.CONNECTING, CALL_STATES.ENDED, CALL_STATES.FAILED]),
  [CALL_STATES.CONNECTING]: new Set([CALL_STATES.CONNECTED, CALL_STATES.ENDED, CALL_STATES.FAILED]),
  [CALL_STATES.CONNECTED]: new Set([CALL_STATES.CONNECTING, CALL_STATES.ENDED, CALL_STATES.FAILED]),
  [CALL_STATES.ENDED]: new Set([CALL_STATES.IDLE]),
  [CALL_STATES.FAILED]: new Set([CALL_STATES.IDLE])
});

export function canTransitionCall(from, to) {
  return transitions[from]?.has(to) || false;
}

export function createCallId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export function hasCallScope(payload) {
  return Boolean(payload
    && typeof payload.callId === "string" && payload.callId.length >= 16
    && typeof payload.conversationId === "string" && payload.conversationId
    && typeof payload.senderId === "string" && payload.senderId);
}

export function isSignalForCall(payload, call) {
  return hasCallScope(payload)
    && Boolean(call)
    && payload.callId === call.id
    && payload.conversationId === call.conversationId;
}
