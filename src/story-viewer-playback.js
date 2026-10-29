import { releaseMediaPlayback, requestMediaPlayback } from "./media-playback-coordinator.js";

// Story media playback remains within the viewer and never creates a popup,
// floating audio control, external application redirect or second media player.
// play() is invoked synchronously by the Story-open click when possible.
export function startStoryMediaPlayback(media,{onBlocked,owner=media?.closest?.("[data-story-viewer]")||media}={}) {
  if(!media?.isConnected || typeof media.play!=="function")return Promise.resolve(false);
  if(!requestMediaPlayback("story",owner,media))return Promise.resolve(false);
  let result;
  try { result=media.play(); }
  catch(error) {
    if(media.isConnected){
      media.dataset.playback="gesture-required";
      onBlocked?.(error);
    }
    releaseMediaPlayback(owner,media);
    return Promise.resolve(false);
  }
  return Promise.resolve(result).then(()=>{
    if(!media.isConnected){releaseMediaPlayback(owner,media);return false;}
    if(media.paused){releaseMediaPlayback(owner,media);return false;}
    media.dataset.playback="playing";
    return true;
  }).catch(error=>{
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
  try{media.pause();}catch{}
  releaseMediaPlayback(owner,media);
  if(media.dataset)media.dataset.playback="paused";
}
