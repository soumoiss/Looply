// WebRTC ICE delivery: the SDP carries candidates gathered before snapshot.
// Additional candidates discovered while Neon publishes the offer/answer must
// be buffered, not discarded. This is essential on slower Android networks.
export function createCallIceGate(sendCandidate) {
  if (typeof sendCandidate !== "function") throw new TypeError("call_ice_sender_required");
  let activePeer = null;
  let snapshotTaken = false;
  let initialDescriptionSent = false;
  let queued = [];
  const publish = candidate => {
    try {
      Promise.resolve(sendCandidate(candidate)).catch(error => {
        console.warn("Looply late ICE candidate signaling failed",error);
      });
    } catch(error) {console.warn("Looply late ICE candidate signaling failed",error);}
  };
  return {
    bind(peer) {
      if (!peer || typeof peer !== "object") throw new TypeError("call_peer_required");
      activePeer=peer;snapshotTaken=false;initialDescriptionSent=false;queued=[];
      peer.onicecandidate = event => {
        if(peer!==activePeer||!event?.candidate)return;
        const candidate=event.candidate.toJSON?.();
        if(!candidate)return;
        if(initialDescriptionSent){publish(candidate);return;}
        if(snapshotTaken && queued.length<32)queued.push(candidate);
      };
    },
    snapshotDescription(peer) {
      if(peer===activePeer)snapshotTaken=true;
    },
    markDescriptionSent(peer) {
      if(peer!==activePeer)return;
      initialDescriptionSent=true;
      const buffered=queued.splice(0);
      for(const candidate of buffered)publish(candidate);
    },
    reset() {
      activePeer=null;snapshotTaken=false;initialDescriptionSent=false;queued=[];
    }
  };
}
