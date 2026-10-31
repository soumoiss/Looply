// The initial offer/answer is sent only after ICE gathering has populated its
// SDP. Sending all of those same candidates as separate Neon RPCs beforehand
// floods signaling, can hit server rate limits, and may bury the actual offer.
// Trickle only candidates discovered *after* the initial SDP is published.
export function createCallIceGate(sendCandidate) {
  if (typeof sendCandidate !== "function") throw new TypeError("call_ice_sender_required");
  let activePeer = null;
  let initialDescriptionSent = false;
  return {
    bind(peer) {
      if (!peer || typeof peer !== "object") throw new TypeError("call_peer_required");
      activePeer = peer;
      initialDescriptionSent = false;
      peer.onicecandidate = (event) => {
        if (peer !== activePeer || !initialDescriptionSent || !event?.candidate) return;
        const candidate = event.candidate;
        if (typeof candidate.toJSON !== "function") return;
        try {
          Promise.resolve(sendCandidate(candidate.toJSON())).catch(error => {
            console.warn("Looply late ICE candidate signaling failed", error);
          });
        } catch (error) {
          console.warn("Looply late ICE candidate signaling failed", error);
        }
      };
    },
    markDescriptionSent(peer) {
      if (peer === activePeer) initialDescriptionSent = true;
    },
    reset() {
      activePeer = null;
      initialDescriptionSent = false;
    }
  };
}
