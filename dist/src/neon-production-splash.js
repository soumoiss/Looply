import "./theme.js?build=c8dfb31c1e9d8b3a";
import {neon} from "./neon-production-client.js?build=c8dfb31c1e9d8b3a";
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const [result]=await Promise.allSettled([neon.auth.getSession(),wait(2400)]);
const session=result.status==="fulfilled"&&result.value?.data?.session;
location.replace(session?"home.html":"login.html");
