// WebRTC capture recovery for Android WebView and mobile browsers.
// NotReadableError means an OS/browser media device could not be opened.
// A temporarily busy camera must not make an otherwise usable audio call fail.
const RETRIABLE = new Set(["NotReadableError","AbortError"]);
const CAMERA_UNAVAILABLE = new Set(["NotReadableError","AbortError","NotFoundError","OverconstrainedError","NotAllowedError"]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stop=stream=>stream?.getTracks?.().forEach(track=>track.stop());

function validate(stream,video) {
  if(!stream?.getAudioTracks?.().length || (video&&!stream.getVideoTracks?.().length)){
    stop(stream);
    throw new DOMException("Required capture device is missing","NotFoundError");
  }
  return stream;
}

/**
 * Audio is indispensable; video is recoverable. If a video device is busy,
 * answer with microphone audio and a negotiated video transceiver so video
 * can be enabled later using RTCRtpSender.replaceTrack without a new call.
 */
export async function captureCallMedia(mediaDevices,mode,{
  wait=sleep,initialDelayMs=160,createStream=null
}={}){
  if(!mediaDevices?.getUserMedia)throw new DOMException("Media capture unavailable","NotFoundError");
  if(mode!=="audio"&&mode!=="video")throw TypeError("Invalid call mode");
  const video=mode==="video";
  try{
    return {stream:validate(await mediaDevices.getUserMedia({audio:true,video}),video),videoUnavailable:false};
  }catch(firstError){
    if(!RETRIABLE.has(firstError?.name))throw firstError;
    await wait(initialDelayMs);
  }
  // Retry after the system releases a device held by an outgoing app,
  // incoming-call surface, or previous media session.
  try{
    return {stream:validate(await mediaDevices.getUserMedia({audio:true,video}),video),videoUnavailable:false};
  }catch(secondError){
    if(!video||!CAMERA_UNAVAILABLE.has(secondError?.name))throw secondError;
  }
  // Video was busy: keep the call alive with real microphone audio rather than
  // sending a false "failed" event to the caller.
  const audioStream=validate(await mediaDevices.getUserMedia({audio:true,video:false}),false);
  try{
    const videoStream=await mediaDevices.getUserMedia({audio:false,video:true});
    const tracks=videoStream.getVideoTracks?.()||[];
    if(!tracks.length){stop(videoStream);return {stream:audioStream,videoUnavailable:true};}
    for(const track of tracks)audioStream.addTrack(track);
    return {stream:audioStream,videoUnavailable:false};
  }catch(cameraError){
    if(!CAMERA_UNAVAILABLE.has(cameraError?.name)){stop(audioStream);throw cameraError;}
    return {stream:audioStream,videoUnavailable:true};
  }
}

/** Used when the microphone itself was unavailable. Preserve the offer. */
export function isRecoverableCallCaptureError(error) {
  return RETRIABLE.has(error?.name);
}
