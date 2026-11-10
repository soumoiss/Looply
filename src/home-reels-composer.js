/* Roupa fiel ao modelo premium v3 sobre o form REAL de criação de post. */
import {signPeople} from "./profile-api.js";
const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
const uri=value=>{try{const url=new URL(value);return url.protocol==="https:"?url.href:"";}catch{return "";}};
export function enhancePublicationComposer({form,client,userId,profile,external=false}){
  const fields=form?.querySelector("[data-composer-fields]");
  if(!fields||fields.dataset.premiumComposerV2)return;
  fields.dataset.premiumComposerV2="";
  fields.classList.add("looply-compose-v2");
  const header=fields.querySelector(".post-create-header");
  const textarea=fields.querySelector("#postBody");
  const filePicker=fields.querySelector("[data-select-post-media]");
  const preview=fields.querySelector("[data-post-preview]");
  const visibility=fields.querySelector("#postVisibility");
  const originalRecipients=fields.querySelector("[data-recipient-picker]");
  const select=fields.querySelector("#postRecipients");
  const status=fields.querySelector("[data-status]");
  const mediaInput=fields.querySelector("#postFiles");
  if(!header||!textarea||!visibility)return;
  header.classList.add("looply-compose-head");
  const heading=header.querySelector("strong");
  if(heading)heading.textContent=external?"Compartilhar Reel":"Nova publicação";
  const headerSubmit=header.querySelector('button[type="submit"]');
  if(headerSubmit){headerSubmit.textContent="Publicar";headerSubmit.classList.add("looply-compose-submit");}
  const close=header.querySelector("[data-close-composer]");
  if(close)close.textContent="×";
  const hero=el("div","looply-compose-identity");
  const face=el("span","looply-compose-avatar");
  const signed=uri(profile?.avatarUrl);
  if(signed){
    const img=el("img");img.src=signed;img.referrerPolicy="no-referrer";img.alt="";img.onerror=()=>img.remove();face.append(img);
  }else face.textContent=String(profile?.display_name||profile?.username||"L").slice(0,1).toUpperCase();
  const named=el("div","looply-compose-name");
  named.append(el("strong","",profile?.display_name||profile?.username||"Você"),el("small","","@"+String(profile?.username||"")));
  const picker=el("span","looply-compose-visibility");
  picker.append(el("span","looply-compose-eye","◉"),visibility);
  hero.append(face,named,picker);
  header.after(hero);
  textarea.placeholder="No que você está pensando?";
  textarea.rows=3;textarea.classList.add("looply-compose-textarea");
  hero.after(textarea);
  if(preview){
    textarea.after(preview);
    const empty=preview.querySelector(".post-preview-empty");
    if(empty)empty.replaceWith(el("span","looply-compose-preview-empty","✧"));
  }
  if(filePicker){
    const label=el("span","looply-compose-upload-icon","▧");
    filePicker.prepend(label);
    filePicker.classList.add("looply-compose-upload");
    if(preview)preview.after(filePicker);
    else textarea.after(filePicker);
  }
  if(mediaInput)mediaInput.classList.add("looply-compose-file-input");
  const priorLabel=fields.querySelector('.media-picker-label');
  if(priorLabel)priorLabel.classList.add("looply-compose-legacy-label");
  // No helper prose. Functional validation errors remain readable.
  fields.querySelectorAll(".field-hint,.feed-external-hint").forEach(n=>n.hidden=true);
  const bottom=fields.querySelector(".composer-options");
  if(bottom)bottom.classList.add("looply-compose-actions");
  const label=fields.querySelector('label[for="postBody"]');
  if(label)label.hidden=true;
  const vLabel=fields.querySelector('label[for="postVisibility"]');
  if(vLabel)vLabel.hidden=true;

  const grid=el("div","looply-compose-people-grid");
  grid.dataset.composePeopleGrid="";
  const chips=el("div","looply-compose-chips");chips.dataset.composeChips="";
  const search=el("input","looply-compose-people-search");search.type="search";
  search.placeholder="Buscar pessoas";search.setAttribute("aria-label","Buscar pessoas");
  if(originalRecipients&&select){
    originalRecipients.classList.add("looply-compose-recipient-picker");
    const title=el("div","looply-compose-recipient-title");
    title.append(el("strong","","Pessoas específicas"),el("small","","0 selecionadas"));
    title.querySelector("small").dataset.composeCount="";
    const tools=el("div","looply-compose-recipient-tools");tools.append(search);
    originalRecipients.prepend(title,tools,chips,grid);
    select.classList.add("looply-compose-original-select");
    const oldLabel=originalRecipients.querySelector('label[for="postRecipients"]');
    if(oldLabel)oldLabel.hidden=true;
    const options=[...select.options];
    const items=options.filter(option=>option.value).map(option=>({
      id:option.value,username:(option.textContent.match(/@([\w.-]+)/)||[])[1]||"",
      display_name:option.textContent.split(" · @")[0].trim(),avatarUrl:""
    }));
    let people=items;
    function draw(){
      const term=search.value.trim().toLocaleLowerCase("pt-BR");
      const selectedIds=new Set([...select.selectedOptions].map(option=>option.value));
      grid.replaceChildren();chips.replaceChildren();
      for(const person of people.filter(p=>(p.display_name+" @"+p.username).toLocaleLowerCase("pt-BR").includes(term))){
        const btn=el("button","looply-compose-person");btn.type="button";
        btn.dataset.composePerson=person.id;btn.setAttribute("aria-pressed",String(selectedIds.has(person.id)));
        const avatar=el("span","looply-compose-person-avatar");
        if(uri(person.avatarUrl)){
          const img=el("img");img.alt="";img.src=uri(person.avatarUrl);img.referrerPolicy="no-referrer";
          img.onerror=()=>img.replaceWith(el("span","",String(person.display_name||person.username||"?")[0].toUpperCase()));
          avatar.append(img);
        }else avatar.textContent=String(person.display_name||person.username||"?").slice(0,1).toUpperCase();
        btn.append(avatar,el("strong","",person.display_name||person.username),el("small","","@"+person.username),el("span","looply-compose-tick",selectedIds.has(person.id)?"✓":"+"));
        grid.append(btn);
      }
      if(!grid.children.length)grid.append(el("div","looply-compose-no-people","Nenhum usuário"));
      for(const p of people.filter(p=>selectedIds.has(p.id))){
        const chip=el("button","looply-compose-chip","@"+p.username+" ×");chip.type="button";chip.dataset.composeRemove=p.id;chips.append(chip);
      }
      title.querySelector("small").textContent=selectedIds.size+" selecionada"+(selectedIds.size===1?"":"s");
    }
    const toggle=(id,forceOff=false)=>{
      const option=options.find(option=>option.value===id);
      if(!option)return;
      const picked=options.filter(option=>option.selected).length;
      if(!forceOff&&!option.selected&&picked>=20){
        if(status)status.textContent="Máximo de 20 pessoas.";return;
      }
      option.selected=forceOff?false:!option.selected;
      if(status)status.textContent="";
      draw();
    };
    grid.addEventListener("click",event=>{
      const button=event.target.closest("[data-compose-person]");
      if(button)toggle(button.dataset.composePerson);
    });
    chips.addEventListener("click",event=>{
      const button=event.target.closest("[data-compose-remove]");
      if(button)toggle(button.dataset.composeRemove,true);
    });
    search.addEventListener("input",draw);
    select.addEventListener("change",draw);
    const visibilitySync=()=>{
      originalRecipients.hidden=visibility.value!=="selected";
      if(visibility.value==="selected"&&!grid.children.length)draw();
    };
    visibility.addEventListener("change",visibilitySync);
    visibilitySync();draw();
    // Only eligible, server-provided post recipients are shown.
    if(items.length){
      const ids=items.map(p=>p.id);
      void client.from("profiles").select("id,username,display_name,avatar_path").in("id",ids).then(async ({data,error})=>{
        if(error||!data)return;
        const signed=await signPeople(client,data);
        const map=new Map(signed.map(p=>[p.id,p]));
        people=items.map(p=>({...p,...(map.get(p.id)||{}),id:p.id}));
        if(form.isConnected)draw();
      }).catch(()=>{});
    }
  }
}
