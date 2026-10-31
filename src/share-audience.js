// The Android Sharesheet UI is deliberately standalone: there are no third-
// party picker packages or externally loaded icon fonts.
export const MAX_SELECTED_SHARE_PEOPLE=20;

export function normalizeShareAudience(visibility,recipientIds=[],ownerId=""){
  const mode=visibility==="selected"?"selected":"public";
  const ids=recipientIds.map(String);
  if(mode==="public")return {visibility:"public",recipientIds:[]};
  if(!ids.length||ids.length>MAX_SELECTED_SHARE_PEOPLE||
      new Set(ids).size!==ids.length||ids.some(id=>!/^[-a-f0-9]{36}$/i.test(id)||id===ownerId))
    throw Error("Escolha de 1 a 20 pessoas diferentes para visualizar a publicação.");
  return {visibility:"selected",recipientIds:ids};
}

export function shareProvider(url){
  if(!url)return "Mídia compartilhada";
  try{
    const host=new URL(url).hostname.toLowerCase();
    if(host.endsWith("instagram.com"))return "Instagram";
    if(host.endsWith("tiktok.com"))return "TikTok";
    if(host==="youtube.com"||host.endsWith(".youtube.com")||host==="youtu.be")return "YouTube";
  }catch{}
  return "Link externo";
}
export function shareSearchMatches(person,query){
  const normalize=x=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const q=normalize(query);
  return !q||normalize(person.display_name).includes(q)||normalize(person.username).includes(q);
}
const el=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
};
const labelFor=person=>person.display_name?.trim()||person.username?.trim()||"Usuário";

export function mountShareAudience({client,root=document,onError=()=>{}}={}){
  const qs=id=>root.getElementById(id);
  const radios=[...root.querySelectorAll('input[name="shareAudience"]')];
  const picker=qs("peoplePicker"),peopleList=qs("sharePeopleList"),search=qs("sharePersonSearch");
  const trigger=qs("choosePeople"),summary=qs("chosenPeople"),counter=qs("chosenCount");
  const confirm=qs("confirmPeople"),publish=qs("publish"),note=qs("shareAudienceNote");
  const selection=new Set();
  let draft=new Set(),people=[],ownerId="",loadingPromise=null,images=new Map();
  let loaded=false;
  const mode=()=>radios.find(r=>r.checked)?.value==="selected"?"selected":"public";
  const chosenPeople=()=>people.filter(p=>selection.has(p.id));

  function renderChips(){
    summary.replaceChildren();
    for(const person of chosenPeople()){
      const chip=el("span","share-person-chip");
      chip.append(el("span","",labelFor(person)));
      const remove=el("button","share-chip-remove","×");
      remove.type="button";remove.setAttribute("aria-label","Remover "+labelFor(person));
      remove.addEventListener("click",()=>{selection.delete(person.id);renderChips();});
      chip.append(remove);summary.append(chip);
    }
    counter.textContent=selection.size ? selection.size+" pessoa(s) escolhida(s)" : "Nenhuma pessoa selecionada";
    trigger.textContent=selection.size?"Alterar seleção":"Escolher pessoas";
    if(mode()==="selected")note.textContent="Somente as pessoas selecionadas poderão visualizar esta publicação.";
    else note.textContent="Todos os usuários autorizados do Looply poderão visualizar.";
  }
  function renderPeople(){
    peopleList.replaceChildren();
    const shown=people.filter(p=>shareSearchMatches(p,search.value));
    if(!shown.length)peopleList.append(el("p","share-empty",loaded?"Nenhum usuário encontrado.":"Carregando usuários…"));
    for(const person of shown){
      const row=el("label","share-person-row");
      const check=el("input");
      check.type="checkbox";check.value=person.id;check.checked=draft.has(person.id);
      check.addEventListener("change",()=>{
        if(check.checked){
          if(draft.size>=MAX_SELECTED_SHARE_PEOPLE){
            check.checked=false;onError("Selecione no máximo 20 pessoas.");return;
          }
          draft.add(person.id);
        }else draft.delete(person.id);
        confirm.disabled=draft.size===0;
        qs("peopleCount").textContent=draft.size+" selecionada(s)";
      });
      const photo=el("span","share-person-avatar",(labelFor(person).charAt(0)||"?").toUpperCase());
      const signed=images.get(person.id);
      if(signed){
        const img=el("img");img.alt="";img.loading="lazy";img.src=signed;
        photo.replaceChildren(img);
      }
      const names=el("span","share-person-names");
      names.append(el("strong","",labelFor(person)),el("small","","@"+person.username));
      row.append(check,photo,names);
      peopleList.append(row);
    }
    confirm.disabled=draft.size===0;
    qs("peopleCount").textContent=draft.size+" selecionada(s)";
  }
  async function loadPeople(){
    if(loaded)return;
    if(loadingPromise)return loadingPromise;
    loadingPromise=(async()=>{
      const [userResult,profiles]=await Promise.all([
        client.auth.getUser(), client.from("profiles")
          .select("id,username,display_name,avatar_path")
          .order("display_name",{ascending:true}).limit(100)
      ]);
      if(userResult.error||!userResult.data?.user?.id)throw Error("Entre novamente para escolher os destinatários.");
      if(profiles.error)throw Error("Não foi possível carregar os usuários.");
      ownerId=userResult.data.user.id;
      people=(profiles.data||[]).filter(p=>p.id!==ownerId && /^[a-f0-9-]{36}$/i.test(p.id));
      loaded=true;
      renderPeople();
      // Avatar paths are private R2 objects; ask for a short-lived, authenticated
      // signed URL and never reveal raw storage credentials or public links.
      await Promise.all(people.map(async p=>{
        if(!p.avatar_path)return;
        try{
          const signed=await client.storage.from("looply-avatars").createSignedUrl(p.avatar_path,300);
          if(signed.data?.signedUrl)images.set(p.id,signed.data.signedUrl);
        }catch{}
      }));
      if(picker.open)renderPeople();
    })();
    try{await loadingPromise;}finally{loadingPromise=null;}
  }
  async function openPicker(){
    draft=new Set(selection);
    search.value="";
    picker.showModal();
    renderPeople();
    try{
      await loadPeople();
      if(!people.length){onError("Não há outros usuários disponíveis.");}
    }catch(e){onError(e?.message||"Não foi possível carregar os usuários.");}
  }
  function closePicker(){if(picker.open)picker.close();}
  for(const radio of radios)radio.addEventListener("change",()=>{
    if(mode()==="public")selection.clear();
    renderChips();
    qs("selectedAudience").hidden=mode()!=="selected";
    if(mode()==="selected")void openPicker();
  });
  search.addEventListener("input",renderPeople);
  trigger.addEventListener("click",()=>void openPicker());
  qs("cancelPeople").addEventListener("click",closePicker);
  picker.addEventListener("close",()=>{if(!selection.size&&mode()==="selected"){
    // Keep the user's explicit choice but disable submit until recipients exist.
    qs("selectedAudience").hidden=false;
  }});
  confirm.addEventListener("click",()=>{
    if(draft.size===0)return;
    selection.clear();draft.forEach(id=>selection.add(id));
    renderChips();closePicker();
  });
  qs("peoplePicker").addEventListener("click",event=>{
    if(event.target===picker)closePicker();
  });
  renderChips();
  return {
    async audience(){
      if(mode()==="public")return normalizeShareAudience("public");
      await loadPeople();
      const authorized=chosenPeople().map(p=>p.id);
      if(authorized.length!==selection.size)throw Error("Um dos destinatários não está disponível. Revise a seleção.");
      return normalizeShareAudience("selected",authorized,ownerId);
    },
    current:()=>({mode:mode(),selected:[...selection]}),
    dispose(){closePicker();}
  };
}
