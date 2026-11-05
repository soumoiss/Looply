import "./theme.js?build=caa8d5b0bdd8905d";
import {neon} from "./neon-production-client.js?build=caa8d5b0bdd8905d";
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const [result]=await Promise.allSettled([neon.auth.getSession(),wait(2400)]);
const session=result.status==="fulfilled"&&result.value?.data?.session;
location.replace(session?"home.html":"login.html");
