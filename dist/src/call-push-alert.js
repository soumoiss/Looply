// The caller requests an immediate, authenticated wake after successfully
// persisting an actual WebRTC offer. The server independently validates it.
// Best effort: never block the working audio/video call on a push outage.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function requestImmediateCallPush(client,conversationId,{
  fetcher=fetch,endpoint="https://looply-android-push.s0upoetamoiss.workers.dev/call-ring"
}={}){
  if(!UUID.test(conversationId||"") || !client?.auth?.getSession)return false;
  try{
    const {data,error}=await client.auth.getSession();
    if(error || !data?.session?.access_token)return false;
    const response=await fetcher(endpoint,{
      method:"POST",cache:"no-store",credentials:"omit",
      headers:{authorization:"Bearer "+data.session.access_token,
        "content-type":"application/json",accept:"application/json"},
      body:JSON.stringify({conversationId}),
      signal:typeof AbortSignal!=="undefined" && AbortSignal.timeout
        ? AbortSignal.timeout(3500):undefined
    });
    return response.ok;
  }catch(error){
    console.warn("Looply call push fallback unavailable",error?.name||"network");
    return false;
  }
}
