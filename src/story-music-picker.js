import { PROVIDER_NAMES, searchStorySongs, storySongSearchLinks } from "./story-music-catalog.js";

// A native, in-app multi-provider finder; only original/user-owned audio is
// available to mix into published video. Catalog results are credit metadata.
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
    '<p class="studio-music-found" data-studio-music-found role="status" aria-live="polite">Busque no catálogo ou escolha uma trilha original.</p>' +
    '<div class="studio-music-results" data-studio-music-results></div>' +
    '<div class="studio-music-external" data-studio-music-external></div>' +
    '<label class="studio-audio-upload">Ou use seu próprio áudio<input type="file" data-studio-audio-file accept="audio/*"></label>' +
    '<p class="studio-hint">Apple Music, Deezer e Audius: a escolha identifica o título e o artista no Story e permite abrir a música original. Para tocar áudio no vídeo publicado, escolha uma trilha original ou um arquivo de áudio que você pode usar.</p>' +
    '</div>');
  const input=body.querySelector("[data-studio-music-query]");
  const listing=body.querySelector("[data-studio-music-results]");
  const found=body.querySelector("[data-studio-music-found]");
  const external=body.querySelector("[data-studio-music-external]");
  const tabs=body.querySelectorAll("[data-studio-provider]");
  let provider="all",items=[],seq=0,timer=null,controller=null;
  const addText=(parent,tag,text,cls) => {
    const el=document.createElement(tag);el.textContent=text;
    if(cls)el.className=cls;parent.append(el);return el;
  };
  const draw=()=>{
    if(!listing.isConnected)return;
    const q=input.value.toLocaleLowerCase("pt-BR").trim();
    listing.replaceChildren();let count=0;
    if(provider==="all"||provider==="builtin")for(const track of builtin.filter(t=>(t.title+" "+t.artist).toLocaleLowerCase("pt-BR").includes(q))){
      const b=document.createElement("button");b.type="button";b.className="studio-track";
      addText(b,"strong","♪ "+track.title);addText(b,"small","Loooply Sounds · áudio original");
      b.onclick=()=>onSelect({...track,kind:"builtin"});
      listing.append(b);count++;
    }
    for(const track of items.filter(t=>provider==="all"||t.provider===provider)){
      const row=document.createElement("article");row.className="studio-catalog-song";
      if(track.artwork){
        const img=document.createElement("img");img.src=track.artwork;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";row.append(img);
      }
      const info=document.createElement("div");info.className="studio-catalog-info";
      addText(info,"strong",track.title);
      addText(info,"small",track.artist+" · "+PROVIDER_NAMES[track.provider]);
      row.append(info);
      const button=addText(row,"button","Escolher","studio-catalog-select");
      button.type="button";button.setAttribute("aria-label","Escolher "+track.title+" de "+track.artist);
      button.onclick=()=>onSelect(track);
      listing.append(row);count++;
    }
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
    controller?.abort();controller=null;items=[];showExternal();
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
  input.addEventListener("input",()=>{
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>void search(),400);
  });
  tabs.forEach(tab=>tab.addEventListener("click",()=>{
    provider=tab.dataset.studioProvider;
    tabs.forEach(t=>t.setAttribute("aria-pressed",String(t===tab)));
    draw();
  }));
  body.querySelector("[data-studio-audio-file]").addEventListener("change",event=>{
    const audio=event.target.files?.[0];
    if(!audio||!audio.type.startsWith("audio/")||audio.size>15*1024*1024){
      onStatus("Escolha um arquivo de áudio válido até 15 MB.",true);return;
    }
    onSelect({kind:"file",title:audio.name.slice(0,120),file:audio});
  });
  draw();input.focus();
}
