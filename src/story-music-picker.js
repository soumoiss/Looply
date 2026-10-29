import { PROVIDER_NAMES, officialSongPreview, officialStorySongEmbed, searchStorySongs } from "./story-music-catalog.js?v=story-music-official-widget-20261028";
import { searchLicensedStorySongs, downloadLicensedStorySong } from "./story-licensed-music.js";
import { dedupeStorySongRecordings } from "./story-music-dedupe.js";

// Apple/Deezer: official PREVIEWS only. Audius: linked public stream after
// publication. User-owned or user-checked CC audio: encoded into the file.
// No Spotify app link, hidden application launch or fake synthetic tracks.
export function storyMusicCanPublish(track) {
  return track?.kind==="file" ||
    (track?.kind==="catalog" && track.provider==="audius" && Boolean(track.id)) ||
    track?.kind==="openverse";
}
export function openStoryMusicPicker({modal,body,builtin,onSelect,onStatus,isAdmin=false,
  searchCatalog=searchStorySongs,searchLicensed=searchLicensedStorySongs}) {
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
  const chooseForStory=async track=>{
    if(closed||importBusy)return;
    if(needsOwnAudio(track)){
      found.textContent="Esta faixa oferece apenas prévia. Escolha uma música com áudio utilizável ou adicione seu arquivo.";
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
    stopPreview();
    onSelect(track);
  };
  const makeAudio=src=>{
    const el=document.createElement("audio");audio=el;
    el.controls=true;el.autoplay=false;el.preload="metadata";
    el.setAttribute("aria-label","Ouvir prévia da música");
    el.src=src;player.append(el);
    el.addEventListener("error",()=>{if(el===audio && !closed)found.textContent="Não foi possível reproduzir a prévia.";});
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
      const choose=addText(actions,"button",officialStorySongEmbed(track)?"Usar player no Story":"Selecionar para o Story","studio-catalog-select");
      choose.type="button";choose.onclick=()=>void chooseForStory(track);
    }else{
      const reason=addText(actions,"span","Prévia apenas · sem áudio para publicação","studio-music-preview-limited");
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
        const choose=addText(buttons,"button",officialStorySongEmbed(track)?"Usar player":"Selecionar","studio-catalog-select");
        choose.type="button";choose.setAttribute("aria-label","Selecionar "+track.title);
        choose.onclick=()=>void chooseForStory(track);
      }else{
        addText(buttons,"span","Prévia apenas","studio-music-preview-limited");
      }
      listing.append(article);
    }
  };
  const search=async()=>{
    const term=query.value.trim(),ticket=++seq;
    controller?.abort();stopPreview();items=[];
    if(term.length<2){found.textContent="";draw();return;}
    found.textContent="Buscando músicas…";draw();
    const current=new AbortController();controller=current;
    const [commercial,licensed]=await Promise.allSettled([
      searchCatalog(term,{signal:current.signal}),searchLicensed(term,{signal:current.signal})
    ]);
    if(closed||ticket!==seq||!listing.isConnected)return;
    const catalog=commercial.status==="fulfilled"?(commercial.value.items||[]):[];
    const open=licensed.status==="fulfilled"?licensed.value:[];
    items=dedupeStorySongRecordings([...catalog,...open]);
    const unavailable=commercial.status==="rejected"||licensed.status==="rejected";
    found.textContent=items.length+" resultados"+(unavailable?" · algumas fontes indisponíveis":"");
    draw();
  };
  query.addEventListener("input",()=>{
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>void search(),380);
  });
  fileInput.addEventListener("change",event=>{
    const file=event.target.files?.[0];
    if(!file)return;
    if(!file.type.startsWith("audio/")||file.size<=0||file.size>15*1024*1024){
      onStatus?.("Escolha um áudio válido de até 15 MB.",true);fileInput.value="";return;
    }
    preview({kind:"file",title:file.name.slice(0,120),artist:"Áudio próprio",file});
  });
  draw();query.focus?.();return cleanup;
}
