import "./theme.js";
import {neon} from "./neon-production-client.js";
import {classifyNeonLoginFailure} from "./neon-login-errors.js";
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const [result]=await Promise.allSettled([neon.auth.getSession(),wait(2400)]);
const session=result.status==="fulfilled"&&result.value?.data?.session;
const problem=result.status==="rejected" ? result.reason : result.value?.error;
if(session)location.replace("home.html");
else if(problem){
  // Auth backend outages do not mean the user explicitly signed out.
  // Preserve the existing session storage and never terminate a session here.
  const failure=classifyNeonLoginFailure(problem);
  const copy=document.querySelector(".splash-copy")||document.body;
  const message=document.createElement("p");
  message.textContent=failure.message;
  message.setAttribute("role","alert");
  message.style.cssText="max-width:320px;margin:20px auto;text-align:center;font:500 15px/1.5 system-ui,sans-serif;color:var(--text,#222)";
  const retry=document.createElement("button");
  retry.type="button";
  retry.textContent="Tentar novamente";
  retry.style.cssText="display:block;margin:12px auto;padding:12px 20px;min-height:44px;border:0;border-radius:14px;background:var(--primary,#7010b0);color:white;font:600 15px system-ui,sans-serif";
  retry.addEventListener("click",()=>location.reload());
  copy.append(message,retry);
}else location.replace("login.html");
