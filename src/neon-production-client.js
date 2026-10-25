import {createClient,SupabaseAuthAdapter} from "https://esm.sh/@neondatabase/neon-js@0.7.0-beta?bundle";
const config=Object.freeze({auth:"https://ep-fancy-smoke-b7d6t1s6.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth",data:"https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1"});
export const neon=createClient({auth:{url:config.auth,adapter:SupabaseAuthAdapter()},dataApi:{url:config.data}});
export const accounts=Object.freeze({patati:"patati@loooply.app",gaberinjela:"gaberinjela@loooply.app",misol:"misol@loooply.app",yara:"yara@loooply.app",peixinho:"peixinho@loooply.app",eukeiliane:"keilageo@loooply.app"});
export function emailOf(value){const v=String(value||"").trim().toLowerCase();return accounts[v]||(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)?v:null)}
export const escapeText=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export async function selfProfile(){const res=await neon.from("v3_self_profile").select("id,username,display_name,bio,theme,avatar_path").limit(2);if(res.error)throw Error("Não foi possível consultar o perfil vinculado no Neon.");if(res.data?.length!==1)throw Error("A identidade foi autenticada, mas o perfil original ainda não está vinculado.");return res.data[0]}
export async function activeSession(){const s=await neon.auth.getSession();if(s.error)throw Error("Não foi possível verificar a sessão no Neon.");return s.data?.session||null}
