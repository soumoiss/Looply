// Story media playback remains within the viewer and never creates a popup,
// floating audio control, external application redirect or second media player.
// play() is invoked synchronously by the Story-open click when possible.
export function startStoryMediaPlayback(media,{onBlocked}={}) {
  if(!media?.isConnected || typeof media.play!=="function")return Promise.resolve(false);
  let result;
  try { result=media.play(); }
  catch(error) {
    if(media.isConnected){
      media.dataset.playback="gesture-required";
      onBlocked?.(error);
    }
    return Promise.resolve(false);
  }
  return Promise.resolve(result).then(()=>{
    if(!media.isConnected)return false;
    if(media.paused)return false;
    media.dataset.playback="playing";
    return true;
  }).catch(error=>{
    if(media.isConnected){
      media.dataset.playback=error?.name==="NotAllowedError"?"gesture-required":"unavailable";
      onBlocked?.(error);
    }
    return false;
  });
}

export function stopStoryMediaPlayback(media) {
  if(!media)return;
  try{media.pause();}catch{}
  if(media.dataset)media.dataset.playback="paused";
}
