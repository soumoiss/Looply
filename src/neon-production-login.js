import "./theme.js";
import {classifyNeonLoginFailure} from "./neon-login-errors.js";
import {neon,activeSession,emailOf,selfProfile,NEON_DATA_API_URL} from "./neon-production-client.js";
const $=id=>document.getElementById(id);
const form=$("loginForm"),message=$("message"),submit=$("loginButton"),password=$("password");
const redirect=(()=>{const v=new URLSearchParams(location.search).get("next");return v&&/^[a-z0-9_-]+\.html$/i.test(v)?v:"home.html"})();
const status=(s,kind="service_unavailable")=>{if(message){message.textContent=s;message.dataset.kind=kind;message.classList.add("show")}};
$("invitePasswordForm")?.remove();
$("togglePassword")?.addEventListener("click",()=>{const show=password.type==="password";password.type=show?"text":"password";$("togglePassword").setAttribute("aria-pressed",String(show))});
try{if(await activeSession()){await selfProfile();location.replace(redirect)}}catch(e){console.warn("Neon login session check unavailable:",e?.message)}
form?.addEventListener("submit",async ev=>{
 ev.preventDefault();
 const input=new FormData(form),email=emailOf(input.get("username")),secret=String(input.get("password")||"");
 if(!email||!secret||secret.length>128){status("Informe seu usuário e senha válidos.");return}
 submit.disabled=true;submit.textContent="Entrando…";message?.classList.remove("show");
 try{
   const result=await neon.auth.signInWithPassword({email,password:secret});
   if(result.error)throw result.error;
   if(!result.data?.session?.access_token)throw Error("auth_session_not_created");
   try { await selfProfile(result.data.session); }
   catch(profileError){profileError.looplyAuthenticated=true;throw profileError;}
   location.replace(redirect);
 }catch(e){
   const failure=classifyNeonLoginFailure(e,{authenticated:e?.looplyAuthenticated===true});
   const username=String(input.get("username")||"").trim().toLowerCase().replace(/^@/,"");
   if(failure.kind==="invalid_credentials"&&/^[a-z0-9_]{3,30}$/.test(username)){
     // This is an untrusted client report, not a server-verified auth audit.
     const code="invalid_credentials";
     void fetch(NEON_DATA_API_URL+"/rpc/v48_record_failed_login",{
       method:"POST",cache:"no-store",headers:{"content-type":"application/json"},
       body:JSON.stringify({p_username:username,p_error_code:code})
     }).catch(()=>{});
   }
   status(failure.message,failure.kind);
   if(failure.kind!=="invalid_credentials")console.warn("Looply login backend unavailable",failure.kind);
   submit.disabled=false;submit.textContent="Avante!";
 }
 finally{password.value=""}
});
