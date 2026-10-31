import { PROVIDER_NAMES, officialSongPreview, officialStorySongEmbed, searchStorySongs, searchAppleMusicPublic, searchSpotifyStoryMetadata } from "./story-music-catalog.js?v=story-music-official-widget-20261028";
import { searchLicensedStorySongs, downloadLicensedStorySong } from "./story-licensed-music.js";
import { dedupeStorySongRecordings } from "./story-music-dedupe.js";
import { storyMusicStartSeconds, withStoryMusicStart } from "./story-music-clip.js";
import { suggestStoryQueryFromApple } from "./story-apple-search-correction.js";

// Apple/Deezer/Spotify: catalog previews only; own or licensed audio is the publishable soundtrack.
// No Spotify app link, hidden application launch or fake synthetic tracks.
export function storyMusicCanPublish(track) {
  return track?.kind==="file" ||
    track?.kind==="openverse";
}
async function searchSpotifyAuthenticated(term,{signal}={}) {
  // The preexisting authenticated Neon Function proxies Spotify catalog
  // metadata server-side. No Spotify secret or media bytes enter the browser.
  const {activeSession,neonFunctionsBase}=await import("./neon-production-client.js");
  const session=await activeSession();
  return searchSpotifyStoryMetadata(term,{
    signal,endpoint:neonFunctionsBase,accessToken:session?.access_token||""
  });
}

export function openStoryMusicPicker({modal,body,builtin,onSelect,onStatus,isAdmin=false,
  searchCatalog=searchStorySongs,searchLicensed=searchLicensedStorySongs,
  searchApple=searchAppleMusicPublic,searchSpotify=searchSpotifyAuthenticated}) {
  modal("Escolher música",
    '<div class="studio-music-picker">' +
    '<label class="studio-music-search-label"><input type="search" data-studio-music-query placeholder="Música, artista ou versão…" autocomplete="off" aria-label="Pesquisar músicas"></label>' +
    '<nav class="studio-music-providers" aria-label="Resultados musicais"><span class="studio-music-all" data-studio-provider="all">Todas</span></nav>' +
    '<p class="studio-music-found" data-studio-music-found role="status" aria-live="polite"></p>' +
    '<section class="studio-music-preview" data-studio-music-preview hidden aria-label="Prévia da música"></section>' +
    '<div class="studio-music-results" data-studio-music-results></div>' +
    '</div>');
  const query=body.querySelector("[data-studio-music-query]");
  const listing=body.querySelector("[data-studio-music-results]");
  const found=body.querySelector("[data-studio-music-found]");
  const player=body.querySelector("[data-studio-music-preview]");
  let items=[],seq=0,timer=null,controller=null,importController=null,importBusy=false;
  const validatedStreams=new Set(), searchCache=new Map();
  let audio=null,iframe=null,fileUrl=null,previewToken=0,closed=false;
  let previewedTrack=null,previewStartSeconds=0,licensedTrackConfirmed=null;
  const addText=(parent,tag,value,className)=>{
    const el=document.createElement(tag);el.textContent=String(value??"");
    if(className)el.className=className;
    parent.append(el);return el;
  };
  const stopPreview=()=>{
    ++previewToken;
    if(audio){audio.pause();audio.removeAttribute("src");audio.load();audio=null;}
    if(iframe){iframe.src="about:blank";iframe.remove();iframe=null;}
    if(fileUrl){URL.revokeObjectURL(fileUrl);fileUrl=null;}
    previewedTrack=null;previewStartSeconds=0;licensedTrackConfirmed=null;
    player.replaceChildren();player.hidden=true;
  };
  const cleanup=()=>{
    closed=true;seq++;if(timer)clearTimeout(timer);
    controller?.abort();importController?.abort();
    stopPreview();
  };
  const chooseForStory=async track=>{
    if(closed||importBusy)return;
    const startSeconds = previewedTrack === track ? previewStartSeconds : 0;
    if(track.kind==="catalog"){
      found.textContent="Esta prévia é apenas para ouvir no seletor. Escolha uma gravação com licença adequada para publicar.";
      return;
    }
    if(track.kind==="openverse"){
      // An inline checkbox replaces disruptive confirm() dialogs. An index
      // license tag does not independently verify the recording\u0027s rights.
      if(licensedTrackConfirmed !== track){
        if(previewedTrack !== track)preview(track);
        found.textContent="Confirme a licença e a autoria na própria seleção antes de publicar.";
        return;
      }
      importBusy=true;
      const task=new AbortController();importController?.abort();importController=task;
      found.textContent="Importando áudio…";
      try{
        const imported=await downloadLicensedStorySong(track,{signal:task.signal});
        if(closed||task.signal.aborted)return;
        stopPreview();onSelect(withStoryMusicStart(imported,startSeconds));
        onStatus?.("Áudio confirmado para incorporação.",false);
      }catch(error){
        if(!closed&&!task.signal.aborted)found.textContent="Não foi possível importar esta faixa.";
      }finally{importBusy=false;}
      return;
    }
    if(!storyMusicCanPublish(track)){found.textContent="Este resultado não possui áudio utilizável.";return;}
    stopPreview();
    onSelect(withStoryMusicStart(track,startSeconds));
  };
  const makeAudio=src=>{
    const el=document.createElement("audio");audio=el;
    // Audio is internal: never display a second native/third-party player.
    el.controls=false;el.autoplay=false;el.preload="metadata";
    el.setAttribute("aria-label","Ouvir prévia da música");
    el.src=src;player.append(el);
    const toggle=addText(player,"button","▶ Ouvir trecho","studio-music-preview-toggle");
    toggle.type="button";toggle.dataset.studioMusicPlay="";
    toggle.onclick=()=>{
      if(el.paused){void el.play().catch(()=>{found.textContent="Toque novamente para ouvir a prévia.";});}
      else el.pause();
    };
    el.addEventListener("playing",()=>{
      if(el!==audio||closed)return;
      if(el.currentSrc && el.readyState>=2)validatedStreams.add(el.currentSrc);
      toggle.textContent="⏸ Pausar trecho";
      found.textContent=storyMusicCanPublish(previewedTrack)
        ?"Trecho tocando. Ajuste o início e selecione para usar no Story."
        :"Prévia oficial tocando. Esta faixa não pode ser incorporada ao Story.";
    });
    el.addEventListener("pause",()=>{if(el===audio)toggle.textContent="▶ Ouvir trecho";});
    el.addEventListener("error",()=>{if(el===audio && !closed)found.textContent="Não foi possível reproduzir o áudio.";});
    void el.play().catch(()=>{
      if(el===audio && !closed)found.textContent="Toque em reproduzir para ouvir a prévia.";
    });
  };
  const preview=track=>{
    if(closed)return;
    stopPreview();
    previewedTrack=track;
    previewStartSeconds=storyMusicStartSeconds(track.startSeconds);
    player.hidden=false;
    const token=previewToken;
    addText(player,"strong",track.title+" · "+(track.artist||"Áudio próprio"),"studio-music-preview-title");
    if(track.kind==="catalog" && ["apple","deezer","spotify"].includes(track.provider) && track.url){
      // Promotional store previews require an adjacent direct attribution
      // to the provider. This link stays in the picker, never in the viewer.
      const providerLink=addText(player,"a","Ver no "+PROVIDER_NAMES[track.provider],"studio-music-preview-source");
      providerLink.href=track.url;
      providerLink.target="_blank";
      providerLink.rel="noopener noreferrer";
    }
    if(track.kind==="openverse"){
      const link=addText(player,"a","Licença e origem","studio-music-preview-source");
      link.href=track.sourceUrl;link.target="_blank";link.rel="noopener noreferrer";
      makeAudio(track.audioUrl);
    }else if(track.kind==="file"){
      fileUrl=URL.createObjectURL(track.file);makeAudio(fileUrl);
    }else{
      const config=officialSongPreview(track);
      if(config?.kind==="audio")makeAudio(config.src);
      else if(config?.kind==="embed"){
        iframe=document.createElement("iframe");
        iframe.className="studio-music-official-player";
        iframe.title="Prévia oficial de "+(PROVIDER_NAMES[track.provider]||"música");
        iframe.src=config.src;iframe.allow="autoplay; encrypted-media";
        iframe.referrerPolicy="strict-origin-when-cross-origin";
        player.append(iframe);
      }else found.textContent="Esta gravação não disponibilizou prévia.";
    }
    // Pick the exact second of a licensed recording in the same panel.
    // The recorded video then starts at this position, not at second zero.
    if(storyMusicCanPublish(track) && audio){
      const trackAudio=audio;
      const clipLabel=addText(player,"label","Início do trecho: 0:00","studio-music-clip-label");
      const clipRange=document.createElement("input");
      clipRange.type="range";clipRange.min="0";clipRange.max="0";clipRange.step="1";
      clipRange.value=String(Math.floor(previewStartSeconds));
      clipRange.setAttribute("aria-label","Segundo inicial da música no Story");
      clipLabel.append(clipRange);
      clipLabel.hidden=true;
      const formatTime=seconds=>Math.floor(seconds/60)+":"+String(Math.floor(seconds%60)).padStart(2,"0");
      const refreshClip=()=>{
        if(trackAudio!==audio || !Number.isFinite(trackAudio.duration))return;
        const available=Math.min(3600,Math.max(0,Math.floor(trackAudio.duration)-1));
        clipRange.max=String(available);
        previewStartSeconds=storyMusicStartSeconds(previewStartSeconds,trackAudio.duration);
        clipRange.value=String(Math.min(available,Math.floor(previewStartSeconds)));
        clipLabel.firstChild.textContent="Início do trecho: "+formatTime(previewStartSeconds);
        clipLabel.hidden=available<1;
        if(previewStartSeconds>0){
          try{trackAudio.currentTime=previewStartSeconds;}catch{}
        }
      };
      trackAudio.addEventListener("loadedmetadata",refreshClip);
      if(trackAudio.readyState>=1)refreshClip();
      clipRange.addEventListener("input",()=>{
        if(trackAudio!==audio)return;
        previewStartSeconds=storyMusicStartSeconds(Number(clipRange.value),trackAudio.duration);
        clipLabel.firstChild.textContent="Início do trecho: "+formatTime(previewStartSeconds);
        try{trackAudio.currentTime=previewStartSeconds;}catch{}
        void trackAudio.play().catch(()=>{found.textContent="Toque em ouvir para reproduzir o trecho.";});
      });
    }
    if(track.kind==="openverse"){
      const licenseLabel=document.createElement("label");
      licenseLabel.className="studio-music-license-check";
      const checkbox=document.createElement("input");
      checkbox.type="checkbox";
      checkbox.setAttribute("aria-label","Confirmo que verifiquei a licença e a autoria desta gravação");
      checkbox.addEventListener("change",()=>{
        licensedTrackConfirmed=checkbox.checked?track:null;
      });
      licenseLabel.append(checkbox);
      addText(licenseLabel,"span","Confirmei a autoria e a licença desta gravação para usar no Story.");
      player.append(licenseLabel);
    }
    const actions=addText(player,"div","","studio-music-preview-actions");
    if(storyMusicCanPublish(track)){
      const choose=addText(actions,"button",
        officialStorySongEmbed(track)?"Usar player no Story":"Selecionar para o Story",
        "studio-catalog-select");
      choose.type="button";choose.onclick=()=>void chooseForStory(track);
    }else{
      const reason=addText(actions,"span","Prévia do catálogo não pode ser incorporada","studio-music-preview-limited");
      reason.setAttribute("role","status");
    }
    const stop=addText(actions,"button","Parar prévia","studio-music-stop");
    stop.type="button";stop.onclick=stopPreview;
    if(token!==previewToken)stopPreview();
    player.scrollIntoView?.({block:"nearest",behavior:"smooth"});
  };
  const formatVersion=track=>{
    const result=[track.artist||"Artista desconhecido"];
    if(track.album && track.album.toLocaleLowerCase("pt-BR")!==track.title.toLocaleLowerCase("pt-BR"))
      result.push(track.album);
    result.push(track.kind==="openverse"?"Licença "+(track.license==="cc0"?"CC0":"CC BY "+track.licenseVersion):
      track.kind==="file"?"Áudio próprio":PROVIDER_NAMES[track.provider]||"Música");
    return result.join(" · ");
  };
  const draw=()=>{
    if(closed||!listing.isConnected)return;
    listing.replaceChildren();
    if(!items.length){
      addText(listing,"p",query.value.trim().length<2
        ?"Pesquise uma música ou artista.":"Nenhum resultado disponível.","studio-music-empty");
      return;
    }
    for(const track of items){
      const article=document.createElement("article");article.className="studio-catalog-song";
      if(track.artwork){const img=document.createElement("img");img.src=track.artwork;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";article.append(img);}
      const info=addText(article,"div","","studio-catalog-info");
      addText(info,"strong",track.title);
      addText(info,"small",formatVersion(track));
      const buttons=addText(article,"div","","studio-music-row-actions");
      const listen=addText(buttons,"button","▶ Ouvir prévia","studio-music-listen");
      listen.type="button";listen.setAttribute("aria-label","Ouvir prévia de "+track.title);
      listen.onclick=()=>preview(track);
      if(storyMusicCanPublish(track)){
        const choose=addText(buttons,"button",
          "Selecionar",
          "studio-catalog-select");
        choose.type="button";choose.setAttribute("aria-label","Selecionar "+track.title);
        choose.onclick=()=>void chooseForStory(track);
      }else{
        addText(buttons,"small","Prévia do catálogo não pode ser publicada","studio-music-preview-limited");
      }
      listing.append(article);
    }
  };
  const search=async()=>{
    const term=query.value.trim(),ticket=++seq;
    controller?.abort();stopPreview();items=[];
    if(term.length<2){found.textContent="";draw();return;}
    const cacheKey=term.toLocaleLowerCase("pt-BR");
    const cached=searchCache.get(cacheKey);
    if(cached && cached.until>Date.now()){
      items=cached.items;
      found.textContent=items.length+" resultados · "+items.filter(storyMusicCanPublish).length+" com opção de uso no Story";
      draw();return;
    }
    found.textContent="Consultando Apple Music, Deezer, Spotify e faixas licenciadas…";draw();
    const current=new AbortController();controller=current;
    let remaining=3,failed=0;
    const received=[];
    const update=tracks=>{
      if(closed||ticket!==seq||current.signal.aborted||!listing.isConnected)return;
      received.push(...tracks);
      items=dedupeStorySongRecordings(received);
      found.textContent=items.length+" resultados · "+items.filter(storyMusicCanPublish).length+" utilizáveis no Story"+
        (remaining?" · buscando mais…":failed?" · algumas fontes indisponíveis":"");
      draw();
      if(!remaining && items.length)searchCache.set(cacheKey,{items,until:Date.now()+120000});
      if(!remaining && !items.length)found.textContent="Nenhuma música encontrada. Tente outro título ou artista.";
    };
    // Stream licensed and catalog results independently.
    const settle=(promise,extract)=>Promise.resolve(promise).then(data=>{
      if(closed||ticket!==seq)return;
      remaining--;
      update(extract(data));
    }).catch(error=>{
      if(closed||ticket!==seq||current.signal.aborted)return;
      remaining--;failed++;update([]);
    });
    const catalogTask=settle(searchCatalog(term,{signal:current.signal}),res=>res?.items||[]);
    const licensedTask=settle(searchLicensed(term,{signal:current.signal}),res=>Array.isArray(res)?res:[]);
    // Spotify is optional: if the Neon proxy lacks private developer
    // credentials, Apple/Deezer and user-owned music keep responding.
    const spotifyTask=settle(searchSpotify(term,{signal:current.signal}),res=>Array.isArray(res)?res:[]);
    // If the direct playable catalogue finds nothing, let Apple's public
    // song/artist metadata correct a mistyped query. Apple previews themselves
    // are never displayed as usable Story tracks, nor streamed as soundtrack.
    void catalogTask.then(async()=>{
      if(closed||ticket!==seq||current.signal.aborted||items.length)return;
      remaining++;
      update([]);
      try {
        const appleResults=await searchApple(term,{signal:current.signal});
        if(closed||ticket!==seq||current.signal.aborted||items.length)return;
        const correction=suggestStoryQueryFromApple(term,appleResults);
        if(!correction)return;
        found.textContent="Procurando gravações disponíveis de "+correction+"…";
        const match=await searchCatalog(correction,{signal:current.signal});
        if(closed||ticket!==seq||current.signal.aborted)return;
        update(match?.items||[]);
      } catch(error) {
        if(!current.signal.aborted)failed++;
      } finally {
        remaining--;
        update([]);
      }
    });
    void licensedTask;
    void spotifyTask;
  };
  query.addEventListener("input",()=>{
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>void search(),180);
  });
  draw();query.focus?.();return cleanup;
}
