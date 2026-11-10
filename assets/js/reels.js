import { mountPremiumSurface } from "../../src/home-reels-premium.js?v=faithful-20261110";
import { mountAppPage } from "../../src/page-runtime.js?v=one-session-entry-20261031";
import { bindSocialEvents, disposeSocialRealtime, loadSocialData, refreshSocialFeed, setupSocialRealtime, socialMarkup } from "../../src/social.js?v=smart-storage-20261031";
import { bindHomeCommentsSheet } from "../../src/home-comments-sheet.js";
import { captureIncomingSharedLink, takeIncomingSharedLink } from "../../src/shared-link.js";
captureIncomingSharedLink();
await mountAppPage({page:"reels",render:async({root,client,user,profile,isAdmin})=>{
  root.dataset.socialStream="external";
  const socialData=await loadSocialData(client,"external").catch(error=>({
    people:[],peopleError:error,posts:[],postsError:error
  }));
  root.innerHTML=socialMarkup(socialData,user.id,isAdmin,"external");
  bindSocialEvents(root,client,()=>user.id,isAdmin);
  bindHomeCommentsSheet(root);
  setupSocialRealtime(client,user.id,root,isAdmin);
  root.__looplyRefreshData=()=>refreshSocialFeed(root,client,user.id,isAdmin);
  window.addEventListener("pagehide",()=>disposeSocialRealtime(client),{once:true});
  const sharedUrl=takeIncomingSharedLink();
  if(sharedUrl){
    const fields=root.querySelector("[data-composer-fields]");
    const toggle=root.querySelector("[data-toggle-composer]");
    const input=root.querySelector("#postExternalUrl");
    if(fields&&input){
      fields.hidden=false;input.value=sharedUrl;
      toggle?.setAttribute("aria-expanded","true");
      const status=root.querySelector("form[data-social-post] [data-status]");
      if(status)status.textContent="Link recebido. Revise e toque em Publicar para confirmar.";
      requestAnimationFrame(()=>{input.focus({preventScroll:true});fields.scrollIntoView({block:"start",behavior:"smooth"});});
    }
  }
  mountPremiumSurface({root, client, user, profile, mode:"external", refresh:()=>root.__looplyRefreshData?.()});
  if(location.hash){
    requestAnimationFrame(()=>{
      try{document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({block:"center"});}
      catch{}
    });
  }
}});
