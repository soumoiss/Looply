import { PROVIDER_NAMES, officialSongPreview, officialStorySongEmbed, searchStorySongs, searchAppleMusicPublic } from "./story-music-catalog.js?v=story-music-official-widget-20261028";
import { searchLicensedStorySongs, downloadLicensedStorySong } from "./story-licensed-music.js";
import { dedupeStorySongRecordings } from "./story-music-dedupe.js";
import { suggestStoryQueryFromApple } from "./story-apple-search-correction.js";

// Apple/Deezer: official PREVIEWS only. Audius: linked public stream after
// publication. User-owned or user-checked CC audio: encoded into the file.
// No Spotify app link, hidden application launch or fake synthetic tracks.
export function storyMusicCanPublish(track) {
  return track?.kind==="file" ||
    (track?.kind==="catalog" && track.provider==="audius" && Boolean(track.id)) ||
    track?.kind==="openverse";
}
export function openStoryMusicPicker({modal,body,builtin,onSelect,onStatus,isAdmin=false,
  searchCatalog=searchStorySongs,searchLicensed=searchLicensedStorySongs,
  searchApple=searchAppleMusicPublic}) {
  modal("Escolher música",
    '<div class="studio-music-picker">' +
    '<label class="studio-music-search-label"><input type="search" data-studio-music-query placeholder="Música, artista ou versão…" autocomplete="off" aria-label="Pesquisar músicas"></label>' +
    '<nav class="studio-music-providers" aria-label="Resultados musicais"><span class="studio-music-all" data-studio-provider="all">Todas</span></nav>' +
    '<p class="studio-music-found" data-studio-music-found role="status" aria-live="polite"></p>' +
    '<section class="studio-music-preview" data-studio-music-preview hidden aria-label="Prévia da música"></section>' +
    '<div class="studio-music-results" data-studio-music-results></div>' +
    '<label class="studio-audio-upload">Áudio próprio<input type="file" data-studio-audio-file accept="audio/*"></label>' +
    '</div>');
  const query=body.querySelector("[data-studio-music-query]");
  const listing=body.querySelector("[data-studio-music-results]");
  const found=body.querySelector("[data-studio-music-found]");
  const player=body.querySelector("[data-studio-music-preview]");
  const fileInput=body.querySelector("[data-studio-audio-file]");
  let items=[],seq=0,timer=null,controller=null,importController=null,importBusy=false;
  let catalogAwaitingUserAudio=null;
  const validatedStreams=new Set(), searchCache=new Map();
  let audio=null,iframe=null,fileUrl=null,previewToken=0,closed=false;
  const needsOwnAudio=track=>track.kind==="catalog" && track.provider!=="audius";
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
    player.replaceChildren();player.hidden=true;
  };
  const cleanup=()=>{
    closed=true;seq++;if(timer)clearTimeout(timer);
    controller?.abort();importController?.abort();
    stopPreview();
  };
  const checkAudiusStream=async track=>{
    if(track.provider!=="audius")return true;
    const url=officialSongPreview(track)?.src;
    if(!url)throw Error("Não foi encontrado fluxo de áudio nesta música.");
    if(validatedStreams.has(url))return true;
    const probe=document.createElement("audio");
    probe.preload="metadata";probe.muted=true;
    // The browser validates an actual playable media source; no downloaded
    // commercial preview is ever used as a substitute.
    await new Promise((resolve,reject)=>{
      let settled=false;
      const done=error=>{
        if(settled)return;settled=true;
        clearTimeout(timerId);probe.pause();probe.removeAttribute("src");probe.load();
        error?reject(error):resolve();
      };
      const timerId=setTimeout(()=>done(Error("O streaming demorou demais para carregar. Escolha outra música.")),6500);
      probe.addEventListener("canplay",()=>done(null),{once:true});
      probe.addEventListener("loadeddata",()=>done(null),{once:true});
      probe.addEventListener("error",()=>done(Error("O arquivo de áudio não está disponível no Audius.")),{once:true});
      probe.src=url;probe.load();
    });
    validatedStreams.add(url);
    return true;
  };
  const chooseForStory=async track=>{
    if(closed||importBusy)return;
    if(needsOwnAudio(track)){
      // A search result is metadata, not a license or an audio file. For
      // Apple/Deezer catalog choices the author may supply a recording that
      // they are permitted to synchronize with their Story.
      catalogAwaitingUserAudio=track;
      found.textContent="Selecione um áudio que você tenha autorização para usar com esta música. A prévia da plataforma não será copiada.";
      fileInput.click();
      return;
    }
    if(track.kind==="openverse"){
      // Search results contain license declarations, NOT legal verification.
      if(!window.confirm("Você verificou na origem a autoria e a licença desta gravação para uso no Story?"))return;
      importBusy=true;
      const task=new AbortController();importController?.abort();importController=task;
      found.textContent="Importando áudio…";
      try{
        const imported=await downloadLicensedStorySong(track,{signal:task.signal});
        if(closed||task.signal.aborted)return;
        stopPreview();onSelect(imported);
        onStatus?.("Áudio confirmado para incorporação.",false);
      }catch(error){
        if(!closed&&!task.signal.aborted)found.textContent="Não foi possível importar esta faixa.";
      }finally{importBusy=false;}
      return;
    }
    if(!storyMusicCanPublish(track)){found.textContent="Este resultado não possui áudio utilizável.";return;}
    if(track.provider==="audius"){
      importBusy=true;
      found.textContent="Conferindo o áudio desta música…";
      try { await checkAudiusStream(track); }
      catch(error){if(!closed)found.textContent=error.message||"Não foi possível confirmar o som.";return;}
      finally {importBusy=false;}
      if(closed)return;
    }
    stopPreview();
    onSelect(track);
  };
  const makeAudio=src=>{
    const el=document.createElement("audio");audio=el;
    el.controls=true;el.autoplay=false;el.preload="metadata";
    el.setAttribute("aria-label","Ouvir prévia da música");
    el.src=src;player.append(el);
    el.addEventListener("playing",()=>{
      if(el!==audio||closed)return;
      if(el.currentSrc && el.readyState>=2)validatedStreams.add(el.currentSrc);
      found.textContent="Som iniciado. Você pode selecionar esta música.";
    });
    el.addEventListener("error",()=>{if(el===audio && !closed)found.textContent="Não foi possível reproduzir o áudio.";});
    void el.play().catch(()=>{
      if(el===audio && !closed)found.textContent="Toque em reproduzir para ouvir a prévia.";
    });
  };
  const preview=track=>{
    if(closed)return;
    stopPreview();
    player.hidden=false;
    const token=previewToken;
    addText(player,"strong",track.title+" · "+(track.artist||"Áudio próprio"),"studio-music-preview-title");
    if(track.kind==="catalog" && (track.provider==="apple" || track.provider==="deezer") && track.url){
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
    const actions=addText(player,"div","","studio-music-preview-actions");
    if(storyMusicCanPublish(track)){
      const choose=addText(actions,"button",
        track?.provider==="audius"?"Vincular streaming ao Story":
        officialStorySongEmbed(track)?"Usar player no Story":"Selecionar para o Story",
        "studio-catalog-select");
      choose.type="button";choose.onclick=()=>void chooseForStory(track);
    }else{
      const chooseOwn=addText(actions,"button","Vincular meu áudio autorizado","studio-catalog-select");
      chooseOwn.type="button";
      chooseOwn.onclick=()=>void chooseForStory(track);
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
          track?.provider==="audius"?"Usar streaming":"Selecionar",
          "studio-catalog-select");
        choose.type="button";choose.setAttribute("aria-label","Selecionar "+track.title);
        choose.onclick=()=>void chooseForStory(track);
      }else{
        const linkAudio=addText(buttons,"button","Vincular meu áudio autorizado","studio-catalog-select");
        linkAudio.type="button";
        linkAudio.setAttribute("aria-label","Vincular áudio autorizado a "+track.title);
        linkAudio.onclick=()=>void chooseForStory(track);
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
    found.textContent="Consultando Apple Music, Deezer, Audius e faixas licenciadas…";draw();
    const current=new AbortController();controller=current;
    let remaining=2,failed=0;
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
    // Stream results independently: don't hold back usable Audius songs while
    // a Creative Commons index is slow or temporarily unavailable.
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
  };
  query.addEventListener("input",()=>{
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>void search(),180);
  });
  fileInput.addEventListener("change",event=>{
    const file=event.target.files?.[0];
    if(!file){catalogAwaitingUserAudio=null;return;}
    if(!file.type.startsWith("audio/")||file.size<=0||file.size>15*1024*1024){
      onStatus?.("Escolha um áudio válido de até 15 MB.",true);
      catalogAwaitingUserAudio=null;fileInput.value="";return;
    }
    const catalog=catalogAwaitingUserAudio;
    catalogAwaitingUserAudio=null;
    if(catalog && !window.confirm("Você confirma que possui autorização para sincronizar este arquivo de áudio com o Story e compartilhá-lo com outros usuários?")){
      fileInput.value="";return;
    }
    preview(catalog
      ? {kind:"file",title:catalog.title,artist:catalog.artist,file,
          catalogProvider:catalog.provider,catalogUrl:catalog.url,
          licenseVerifiedByUser:true}
      : {kind:"file",title:file.name.slice(0,120),artist:"Áudio próprio",file});
    fileInput.value="";
  });
  draw();query.focus?.();return cleanup;
}
