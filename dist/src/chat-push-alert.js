// Best-effort notification after Neon confirms the real message and files.
// The Worker independently verifies the author's JWT and message age.
// No message text, sender names, token IDs or private payload sent by browser.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function requestImmediateMessagePush(client,messageId,{
  fetcher=fetch,endpoint="https://looply-android-push.s0upoetamoiss.workers.dev/chat-notify"
}={}){
  if(!UUID.test(messageId||"") || !client?.auth?.getSession)return false;
  try{
    const {data,error}=await client.auth.getSession();
    if(error||!data?.session?.access_token)return false;
    const response=await fetcher(endpoint,{
      method:"POST",cache:"no-store",credentials:"omit",
      headers:{authorization:"Bearer "+data.session.access_token,
        "content-type":"application/json",accept:"application/json"},
      body:JSON.stringify({messageId}),
      signal:typeof AbortSignal!=="undefined"&&typeof AbortSignal.timeout==="function"
        ? AbortSignal.timeout(4500):undefined
    });
    return response.ok;
  }catch(error){
    console.warn("Looply immediate message alert deferred",error?.name||"network");
    return false;
  }
}
