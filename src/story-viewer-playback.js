import { releaseMediaPlayback, requestMediaPlayback } from "./media-playback-coordinator.js";

// Each pending play() resolves only for its own active attempt. A cancelled
// attempt cannot reactivate a soundtrack after advancing or closing a Story.
const playbackAttempts = new WeakMap();
function nextAttempt(media) {
  const version=(playbackAttempts.get(media)||0)+1;
  playbackAttempts.set(media,version);
  return version;
}

// Story media playback remains within the viewer and never creates a popup,
// floating audio control, external application redirect or second media player.
// play() is invoked synchronously by the Story-open click when possible.
export function startStoryMediaPlayback(media,{onBlocked,owner=media?.closest?.("[data-story-viewer]")||media}={}) {
  if(!media?.isConnected || typeof media.play!=="function")return Promise.resolve(false);
  if(!requestMediaPlayback("story",owner,media))return Promise.resolve(false);
  const attempt=nextAttempt(media);
  let result;
  try { result=media.play(); }
  catch(error) {
    if(media.isConnected && playbackAttempts.get(media)===attempt){
      media.dataset.playback=error?.name==="NotAllowedError"?"gesture-required":"unavailable";
      onBlocked?.(error);
    }
    releaseMediaPlayback(owner,media);
    return Promise.resolve(false);
  }
  return Promise.resolve(result).then(()=>{
    if(playbackAttempts.get(media)!==attempt)return false;
    if(!media.isConnected){releaseMediaPlayback(owner,media);return false;}
    if(media.paused){releaseMediaPlayback(owner,media);return false;}
    media.dataset.playback="playing";
    return true;
  }).catch(error=>{
    if(playbackAttempts.get(media)!==attempt)return false;
    if(media.isConnected){
      media.dataset.playback=error?.name==="NotAllowedError"?"gesture-required":"unavailable";
      onBlocked?.(error);
    }
    releaseMediaPlayback(owner,media);
    return false;
  });
}

export function stopStoryMediaPlayback(media,{owner=media?.closest?.("[data-story-viewer]")||media}={}) {
  if(!media)return;
  nextAttempt(media);
  try{media.pause();}catch{}
  releaseMediaPlayback(owner,media);
  if(media.dataset)media.dataset.playback="paused";
}
