import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const source=readFileSync(resolve("config.js"),"utf8");
const endpoint=source.match(/supabaseUrl:\s*"([^"]+)"/)?.[1];
const key=source.match(/publishableKey:\s*"([^"]+)"/)?.[1];
if(!endpoint?.endsWith(".supabase.co")||!key?.startsWith("sb_publishable_"))throw Error("Missing original public Supabase project config");
const probes=[
 {name:"Supabase Auth",path:"/auth/v1/health"},
 {name:"Supabase public data API",path:"/rest/v1/profiles?select=id&limit=0"},
 {name:"Neon Auth",url:"https://ep-fancy-smoke-b7d6t1s6.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth/health"},
 {name:"Neon Data API",url:"https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1/profiles?select=id&limit=0"}
];
let usable=true;
for(const p of probes){
 try{
  const target=p.url||endpoint+p.path;
  const headers=p.url?{Accept:"application/json"}:{"apikey":key,Accept:"application/json"};
  const result=await fetch(target,{headers,signal:AbortSignal.timeout(12000),cache:"no-store"});
  console.log(JSON.stringify({provider:p.name,status:result.status,accessible:result.ok,quotaExceeded:result.status===402}));
  if(!p.url && result.status===402)usable=false;
  if(!p.url && ![200,401,403].includes(result.status))usable=false;
 }catch(error){
  console.log(JSON.stringify({provider:p.name,error:String(error?.name||"network")}));
  if(!p.url)usable=false;
 }
}
if(!usable)process.exitCode=2;
