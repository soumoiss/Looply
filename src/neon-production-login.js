import "./theme.js";
import {neon,activeSession,emailOf,selfProfile} from "./neon-production-client.js";
const $=id=>document.getElementById(id);
const form=$("loginForm"),message=$("message"),submit=$("loginButton"),password=$("password");
const redirect=(()=>{const v=new URLSearchParams(location.search).get("next");return v&&/^[a-z0-9_-]+\.html$/i.test(v)?v:"home.html"})();
const status=s=>{if(message){message.textContent=s;message.dataset.kind="error";message.classList.add("show")}};
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
   if(result.error||!result.data?.session)throw Error("Usuário ou senha incorretos.");
   await selfProfile();
   location.replace(redirect);
 }catch(e){status(e.message||"Não foi possível acessar o Neon. Tente novamente.");submit.disabled=false;submit.textContent="Avante!"}
 finally{password.value=""}
});
