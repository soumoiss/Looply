// Looply automatic object-storage garbage collector.
// Neon Function Trigger (*/2 * * * * UTC) runs even if app and APK are closed.
// Endpoint is not callable by browsers: Neon strips spoofed X-Neon-* headers.
// No user text, images or private S3 credentials leave the Neon runtime.
import {createHash,createHmac} from "node:crypto";

export const RETRY_LIMIT=12;
export const NEVER_DELETE=/^(?:recovered|recovery-20261025|legacy-archive)\//i;
export const SAFE_KEYS={
  "looply-media":/^(?:posts|stories|comments)\/[a-f0-9-]{36}\//i,
  "looply-gallery":/^gallery\/[a-f0-9-]{36}\//i,
  "looply-chat":/^conversations\/[a-f0-9-]{36}\//i
};
export function safeDeleteCandidate(bucket,path){
  return Object.prototype.hasOwnProperty.call(SAFE_KEYS,bucket)
    && typeof path==="string" && path.length<=1024
    && !NEVER_DELETE.test(path) && !path.includes("..")
    && !/[\\\x00-\x1f\x7f]/.test(path)
    && SAFE_KEYS[bucket].test(path);
}
const enc=val=>encodeURIComponent(val).replace(/[!'()*]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());
const hash=v=>createHash("sha256").update(v).digest("hex");
const hmac=(key,value)=>createHmac("sha256",key).update(value).digest();
export async function sqlQuery(query,params=[],config=process.env,fetcher=fetch){
  const url=new URL(config.DATABASE_URL||"");
  if(!["postgres:","postgresql:"].includes(url.protocol)||!url.hostname.endsWith(".neon.tech"))
    throw Error("invalid_database_connection");
  const host=url.hostname.replace(/-pooler(?=\.)/,"");
  const response=await fetcher("https://"+host+"/sql",{
    method:"POST",cache:"no-store",
    headers:{"content-type":"application/json","Neon-Connection-String":config.DATABASE_URL},
    body:JSON.stringify({query,params}),
    signal:AbortSignal.timeout(18000)
  });
  if(!response.ok)throw Error("database_http_"+response.status);
  const data=await response.json();
  if(!Array.isArray(data.rows))throw Error("database_rows_unavailable");
  return data.rows;
}
export async function deleteObject(bucket,key,config=process.env,fetcher=fetch){
  if(!safeDeleteCandidate(bucket,key))throw Error("unsafe_object_path");
  for(const k of ["AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY","AWS_REGION","AWS_ENDPOINT_URL_S3"])
    if(!config[k])throw Error("missing_storage_credentials");
  const endpoint=new URL(config.AWS_ENDPOINT_URL_S3);
  if(endpoint.protocol!=="https:")throw Error("invalid_storage_endpoint");
  const day=new Date().toISOString().replace(/[:-]|\.\d{3}/g,"");
  const date=day.slice(0,8),scope=date+"/"+config.AWS_REGION+"/s3/aws4_request";
  const canonicalPath=endpoint.pathname.replace(/\/$/,"")+"/"+enc(bucket)+"/"+key.split("/").map(enc).join("/");
  const payloadHash=hash("");
  const signedHeaders="host;x-amz-content-sha256;x-amz-date";
  const signingHeaders={host:endpoint.host,"x-amz-content-sha256":payloadHash,"x-amz-date":day};
  const canonicalHeaders=Object.entries(signingHeaders).sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>k+":"+v+"\n").join("");
  const request=["DELETE",canonicalPath,"",canonicalHeaders,signedHeaders,payloadHash].join("\n");
  const keyDate=hmac("AWS4"+config.AWS_SECRET_ACCESS_KEY,date);
  const keyRegion=hmac(keyDate,config.AWS_REGION);
  const keyService=hmac(keyRegion,"s3");
  const keySign=hmac(keyService,"aws4_request");
  const signature=hmac(keySign,["AWS4-HMAC-SHA256",day,scope,hash(request)].join("\n")).toString("hex");
  const response=await fetcher(endpoint.origin+canonicalPath,{
    method:"DELETE",headers:{
      "x-amz-content-sha256":payloadHash,"x-amz-date":day,
      authorization:"AWS4-HMAC-SHA256 Credential="+config.AWS_ACCESS_KEY_ID+"/"+scope+
        ", SignedHeaders="+signedHeaders+", Signature="+signature
    },
    signal:AbortSignal.timeout(12000)
  });
  // S3 DELETE is idempotent: 204 also means the key was already absent.
  if(![200,202,204].includes(response.status))throw Error("storage_delete_http_"+response.status);
  return true;
}
const first=rows=>rows[0]||{};
export async function runMaintenance({query=sqlQuery,remove=deleteObject,limit=20}={}){
  let expired=0,cleaned=0,protectedCount=0,failed=0;
  // Delete expired story metadata through the existing FK cascades.
  // The AFTER DELETE triggers enqueue every media object before the commit.
  for(let i=0;i<4;i++){
    const rows=await query("SELECT looply_private.gc_expired_stories($1) AS removed",[30]);
    const amount=Number(first(rows).removed||0);
    expired+=amount;
    if(amount<30)break;
  }
  const jobs=await query("SELECT id,bucket,object_key,attempts FROM looply_private.gc_claim_jobs($1)",[Math.min(20,Math.max(1,limit))]);
  for(const job of jobs){
    let state="pending",reason=null;
    try{
      if(!safeDeleteCandidate(job.bucket,job.object_key)){
        state="protected";reason="protected_namespace";
      }else{
        const refs=await query("SELECT looply_private.gc_reference_count($1,$2) AS n",
          [job.bucket,job.object_key]);
        if(Number(first(refs).n||0)>0){state="protected";reason="still_referenced";}
        else {await remove(job.bucket,job.object_key);state="done";}
      }
    }catch(error){reason=error?.message||"delete_failed";state="pending";}
    try{
      await query("SELECT looply_private.gc_finish_job($1,$2,$3)",
        [Number(job.id),state,reason]);
      if(state==="done")cleaned++;
      else if(state==="protected")protectedCount++;
      else failed++;
    }catch(error){failed++;console.error("gc_job_commit_failed",Number(job.id),error?.name||"database");}
  }
  // Do not expose S3 paths or filenames in console logs or public responses.
  console.log("looply_gc",JSON.stringify({expired,cleaned,protected:protectedCount,retry:failed}));
  return {expired,cleaned,protected:protectedCount,retry:failed};
}
export default {
  async fetch(request){
    if(request.method!=="POST"||!request.headers.get("x-neon-trigger-invocation-id"))
      return new Response('{"error":"trigger_only"}',{status:403,headers:{"content-type":"application/json"}});
    try{
      const result=await runMaintenance();
      return Response.json({ok:true,...result},{headers:{"cache-control":"no-store"}});
    }catch(error){
      console.error("looply_gc_run_failed",error?.name||"server");
      return Response.json({ok:false,error:"maintenance_unavailable"},{status:503});
    }
  }
};
