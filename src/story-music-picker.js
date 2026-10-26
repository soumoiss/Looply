import { PROVIDER_NAMES, officialSongPreview, searchStorySongs, storySongSearchLinks } from "./story-music-catalog.js";

// Catalog previews use provider-owned official embeds or permitted streaming.
// Never download/cache the external audio or merge commercial clips into Stories.
export function openStoryMusicPicker({modal,body,builtin,onSelect,onStatus}) {
  modal("Escolher música",
    '<div class="studio-music-picker">' +
    '<label class="studio-music-search-label"><span>Pesquisar em várias plataformas</span>' +
    '<input type="search" data-studio-music-query placeholder="Nome da música ou artista…" autocomplete="off" aria-label="Pesquisar músicas"></label>' +
    '<nav class="studio-music-providers" aria-label="Fonte musical">' +
    '<button type="button" data-studio-provider="all" aria-pressed="true">Todas</button>' +
    '<button type="button" data-studio-provider="apple">Apple Music</button>' +
    '<button type="button" data-studio-provider="deezer">Deezer</button>' +
    '<button type="button" data-studio-provider="audius">Audius</button>' +
    '<button type="button" data-studio-provider="builtin">Originais</button></nav>' +
    '<p class="studio-music-found" data-studio-music-found role="status" aria-live="polite">Escolha uma faixa para ouvir antes de publicar.</p>' +
    '<section class="studio-music-preview" data-studio-music-preview hidden aria-label="Prévia da música"></section>' +
    '<div class="studio-music-results" data-studio-music-results></div>' +
    '<div class="studio-music-external" data-studio-music-external></div>' +
    '<label class="studio-audio-upload">Ou escolha seu áudio para ouvir antes de usar<input type="file" data-studio-audio-file accept="audio/*"></label>' +
    '<p class="studio-hint">Pré-escute aqui antes de escolher. Apple Music e Deezer usam o reprodutor oficial; a prévia pode exigir um toque nele. Faixas comerciais não são copiadas para os Stories. Trilhas originais, arquivos próprios e transmissões autorizadas têm reprodução conforme a origem.</p>' +
    '</div>');
  const input=body.querySelector("[data-studio-music-query]");
  const listing=body.querySelector("[data-studio-music-results]");
  const found=body.querySelector("[data-studio-music-found]");
  const external=body.querySelector("[data-studio-music-external]");
  const player=body.querySelector("[data-studio-music-preview]");
  const tabs=body.querySelectorAll("[data-studio-provider]");
  let provider="all",items=[],seq=0,timer=null,controller=null;
  let audio=null,soundContext=null,soundSource=null,fileUrl=null,previewToken=0;
  let currentTrack=null;

  const addText=(parent,tag,text,cls)=>{
    const el=document.createElement(tag);el.textContent=text;
    if(cls)el.className=cls;
    parent.append(el);return el;
  };
  const stopPreview=()=>{
    previewToken++;
    if(soundSource){try{soundSource.stop();}catch{} soundSource.disconnect();soundSource=null;}
    if(soundContext){void soundContext.close().catch(()=>{});soundContext=null;}
    if(audio){audio.pause();audio.removeAttribute("src");audio.load();audio=null;}
    if(fileUrl){URL.revokeObjectURL(fileUrl);fileUrl=null;}
    player.replaceChildren();
    player.hidden=true;
    currentTrack=null;
  };
  const cleanup=()=>{
    ++seq; if(timer)clearTimeout(timer);controller?.abort();
    stopPreview();
  };
  const playOriginal=(track)=>{
    const AudioEngine=window.AudioContext||window.webkitAudioContext;
    if(!AudioEngine){addText(player,"p","Este navegador não permite prévia de áudio sintetizado.");return;}
    soundContext=new AudioEngine();
    const rate=soundContext.sampleRate,seconds=12,buffer=soundContext.createBuffer(1,rate*seconds,rate);
    const samples=buffer.getChannelData(0),beat=60/track.bpm;
    for(let i=0;i<samples.length;i++){
      const t=i/rate,step=Math.floor(t/beat)%track.notes.length;
      const pitch=220*Math.pow(2,track.notes[step]/12),phase=t%beat;
      const amp=Math.min(1,phase*25)*Math.exp(-phase*3)*.13;
      samples[i]=amp*(Math.sin(2*Math.PI*pitch*t)+.30*Math.sin(4*Math.PI*pitch*t));
    }
    soundSource=soundContext.createBufferSource();
    soundSource.buffer=buffer;soundSource.loop=true;
    soundSource.connect(soundContext.destination);
    const played=soundContext.resume();
    soundSource.start();
    void played.catch(()=>onStatus("Não foi possível pré-ouvir esta trilha.",true));
  };
  const preview=(track)=>{
    stopPreview();
    currentTrack=track;
    const token=previewToken;
    player.hidden=false;
    addText(player,"strong",track.title+" · "+(track.artist||"Áudio do dispositivo"),"studio-music-preview-title");
    const message=addText(player,"p","Carregando prévia…","studio-music-preview-hint");
    const mark=text=>{
      if(token===previewToken && message.isConnected) message.textContent=text;
    };
    const makeAudio=(src,loop=false)=>{
      audio=document.createElement("audio");
      const el=audio;
      el.controls=true;el.autoplay=false;el.preload="auto";el.loop=loop;
      el.setAttribute("aria-label","Pré-escutar "+track.title);
      el.src=src;
      el.addEventListener("playing",()=>mark("Prévia tocando."));
      el.addEventListener("waiting",()=>mark("Carregando áudio…"));
      el.addEventListener("error",()=>{
        mark("A prévia não pôde ser reproduzida. Tente outra faixa ou abra o serviço oficial.");
      });
      player.insertBefore(el,message);
      // Invoked during the user's click, preserving the mobile audio gesture.
      void el.play().then(()=>mark("Prévia tocando.")).catch(()=>{
        mark("Toque no ▶ do reprodutor abaixo para ouvir. Caso falhe, abra a fonte oficial.");
      });
    };
    if(track.kind==="builtin"){
      playOriginal(track);
      mark("Prévia da trilha original reproduzindo.");
    }else if(track.kind==="file"){
      fileUrl=URL.createObjectURL(track.file);
      makeAudio(fileUrl,true);
    }else{
      const config=officialSongPreview(track);
      if(config?.kind==="audio"){
        makeAudio(config.src);
        if(track.provider==="apple")mark("Prévia promocional do iTunes. Se necessário, toque no ▶ abaixo.");
      }else if(config?.kind==="embed"){
        const iframe=document.createElement("iframe");
        iframe.className="studio-music-official-player";
        iframe.title="Reprodutor oficial "+PROVIDER_NAMES[config.provider];
        iframe.src=config.src;iframe.loading="eager";
        iframe.allow="autoplay; encrypted-media";
        iframe.referrerPolicy="strict-origin-when-cross-origin";
        player.insertBefore(iframe,message);
        mark("Toque no ▶ do reprodutor oficial para ouvir.");
      }else{
        mark("Esta faixa não tem prévia disponível. Você pode ouvi-la no serviço oficial.");
      }
      const link=addText(player,"a",track.provider==="apple"?"Abrir no iTunes / Apple Music ↗":
        "Abrir no "+PROVIDER_NAMES[track.provider]+" ↗","studio-music-preview-source");
      link.href=track.url;link.target="_blank";link.rel="noopener noreferrer";
      if(track.provider==="apple")
        addText(player,"small","Prévia promocional cedida pelo iTunes, somente para identificar a faixa. O áudio não é incorporado ao Story.","studio-music-preview-hint");
    }
    const actions=document.createElement("div");actions.className="studio-music-preview-actions";
    const choose=addText(actions,"button","Usar esta música","studio-catalog-select");
    choose.type="button";choose.onclick=()=>{stopPreview();onSelect(track);};
    const stop=addText(actions,"button","Parar prévia","studio-music-stop");
    stop.type="button";stop.onclick=stopPreview;
    player.append(actions);
    player.scrollIntoView({block:"nearest",behavior:"smooth"});
  };
  const draw=()=>{
    if(!listing.isConnected)return;
    const q=input.value.toLocaleLowerCase("pt-BR").trim();
    listing.replaceChildren();let count=0;
    const row=(track,label)=>{
      const article=document.createElement("article");article.className="studio-catalog-song";
      if(track.artwork){const img=document.createElement("img");img.src=track.artwork;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";article.append(img);}
      const info=document.createElement("div");info.className="studio-catalog-info";
      addText(info,"strong",track.title);
      addText(info,"small",track.artist+" · "+label);article.append(info);
      const actions=document.createElement("div");actions.className="studio-music-row-actions";
      const listen=addText(actions,"button","▶ Ouvir prévia","studio-music-listen");
      listen.type="button";listen.setAttribute("aria-label","Ouvir prévia de "+track.title);
      listen.onclick=()=>preview(track);
      const choose=addText(actions,"button","Escolher","studio-catalog-select");
      choose.type="button";choose.setAttribute("aria-label","Escolher "+track.title);
      choose.onclick=()=>{stopPreview();onSelect(track);};
      actions.append(listen,choose);article.append(actions);
      listing.append(article);count++;
    };
    if(provider==="all"||provider==="builtin"){
      for(const track of builtin.filter(t=>(t.title+" "+t.artist).toLocaleLowerCase("pt-BR").includes(q))){
        row({...track,kind:"builtin"},"Trilha original");
      }
    }
    for(const track of items.filter(t=>provider==="all"||t.provider===provider))row(track,PROVIDER_NAMES[track.provider]);
    if(!count)addText(listing,"p","Nenhuma música nesse filtro. Experimente Todas ou outra busca.","studio-music-empty");
  };
  const showExternal=()=>{
    external.replaceChildren();
    const term=input.value.trim();
    if(term.length<2)return;
    addText(external,"strong","Encontrar também em");
    for(const link of storySongSearchLinks(term)){
      const a=document.createElement("a");a.textContent=link.name+" ↗";
      a.href=link.url;a.target="_blank";a.rel="noopener noreferrer";external.append(a);
    }
  };
  const search=async()=>{
    const term=input.value.trim(),id=++seq;
    controller?.abort();controller=null;items=[];stopPreview();showExternal();
    if(term.length<2){found.textContent="Digite uma música ou artista para buscar em todas as plataformas.";draw();return;}
    found.textContent="Procurando simultaneamente em Apple Music, Deezer e Audius…";
    draw();controller=new AbortController();
    try{
      const result=await searchStorySongs(term,{signal:controller.signal});
      if(id!==seq||!listing.isConnected)return;
      items=result.items;
      const online=result.providers.filter(p=>p.available).map(p=>PROVIDER_NAMES[p.provider]);
      const down=result.providers.filter(p=>!p.available).map(p=>PROVIDER_NAMES[p.provider]);
      found.textContent=items.length+" músicas encontradas"+(online.length?" · "+online.join(", "):"")+
        (down.length?" · Indisponível: "+down.join(", "):"");
      draw();
    }catch(error){
      if(id!==seq||!listing.isConnected)return;
      found.textContent="Busca externa indisponível. As trilhas originais ainda funcionam.";
      draw();onStatus?.("Não foi possível carregar os catálogos musicais.",true);
    }
  };
  input.addEventListener("input",()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>void search(),400);});
  tabs.forEach(tab=>tab.addEventListener("click",()=>{
    provider=tab.dataset.studioProvider;
    tabs.forEach(t=>t.setAttribute("aria-pressed",String(t===tab)));
    stopPreview();draw();
  }));
  body.querySelector("[data-studio-audio-file]").addEventListener("change",event=>{
    const file=event.target.files?.[0];
    if(!file||!file.type.startsWith("audio/")||file.size>15*1024*1024){
      onStatus("Escolha um áudio válido de até 15 MB.",true);return;
    }
    preview({kind:"file",title:file.name.slice(0,120),artist:"Arquivo pessoal",file});
  });
  draw();input.focus();return cleanup;
}
