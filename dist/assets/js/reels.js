import { mountAppPage } from "../../src/page-runtime.js?build=e913ddee23ac1c1d";
import { bindSocialEvents, disposeSocialRealtime, loadSocialData, refreshSocialFeed, setupSocialRealtime, socialMarkup } from "../../src/social.js?build=e913ddee23ac1c1d";
import { bindHomeCommentsSheet } from "../../src/home-comments-sheet.js?build=e913ddee23ac1c1d";
import { captureIncomingSharedLink, takeIncomingSharedLink } from "../../src/shared-link.js?build=e913ddee23ac1c1d";
captureIncomingSharedLink();
await mountAppPage({page:"reels",render:async({root,client,user,isAdmin})=>{
  root.dataset.socialStream="external";
  const socialData=await loadSocialData(client,"external").catch(error=>({
    people:[],peopleError:error,posts:[],postsError:error
  }));
  root.innerHTML='<header class="reels-destination-heading" aria-label="Reels do Looply">'+
    '<div class="reels-destination-symbol" aria-hidden="true">▶</div>'+
    '<div><span class="section-kicker">Links compartilhados</span><h1>Reels</h1>'+
    '<p>Vídeos e publicações do Instagram, TikTok e YouTube compartilhados no Looply.</p></div>'+
    '</header>'+
    socialMarkup(socialData,user.id,isAdmin,"external");
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
  if(location.hash){
    requestAnimationFrame(()=>{
      try{document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({block:"center"});}
      catch{}
    });
  }
}});
