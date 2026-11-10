import {signPeople} from "./profile-api.js";
const mk=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
function face(profile){
 const n=mk("span","cp-avatar",Array.from(String(profile?.display_name||profile?.username||"L"))[0]?.toUpperCase()||"L");
 if(/^https:\/\//i.test(profile?.avatarUrl||"")){
  const img=mk("img");img.src=profile.avatarUrl;img.alt="";img.referrerPolicy="no-referrer";img.onerror=()=>img.remove();n.prepend(img);
 }
 return n;
}
const glyphs={
 image:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m4 18 5-5 4 4 3-3 5 4"/></svg>',
 video:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="6" width="14" height="12" rx="3"/><path d="m17 10 4-3v10l-4-3"/></svg>'
};
export function polishPremiumComposer({composer,client,ownId,profile,mode="native"}){
 if(!composer||composer.dataset.cpPolished)return;
 composer.dataset.cpPolished="true";
 const fields=composer.querySelector("[data-composer-fields]");
 if(!fields)return;
 fields.classList.add("cp-fields");
 const head=fields.querySelector(".post-create-header");
 head?.classList.add("cp-head");
 const h=head?.querySelector("strong");
 if(h)h.textContent=mode==="external"?"Novo Reel":"Nova publicação";
 const topSubmit=head?.querySelector('button[type="submit"]');
 if(topSubmit){topSubmit.textContent="Publicar";topSubmit.classList.add("cp-publish");}
 const identity=mk("section","cp-identity");
 const profileRow=mk("div","cp-person");
 const nameBlock=mk("div","cp-name");
 nameBlock.append(mk("strong","",profile?.display_name||profile?.username||"Looply"),mk("small","","@"+String(profile?.username||"")));
 profileRow.append(face(profile),nameBlock);
 identity.append(profileRow);
 const privacy=fields.querySelector("#postVisibility");
 if(privacy){
  const modes=mk("div","cp-visibility");
  modes.setAttribute("role","group");modes.setAttribute("aria-label","Privacidade");
  for(const [value,label] of [["public","Todos"],["private","Só eu"],["selected","Pessoas"]]){
   const button=mk("button","cp-visibility-option",label);
   button.type="button";button.dataset.cpVisibility=value;
   button.setAttribute("aria-pressed",String(privacy.value===value));
   modes.append(button);
  }
  identity.append(modes);
  modes.addEventListener("click",event=>{
   const b=event.target.closest("[data-cp-visibility]");
   if(!b)return;
   privacy.value=b.dataset.cpVisibility;
   privacy.dispatchEvent(new Event("change",{bubbles:true}));
   for(const btn of modes.querySelectorAll("[data-cp-visibility]"))
    btn.setAttribute("aria-pressed",String(btn===b));
  });
 }
 head?.after(identity);
 const native=mode!=="external";
 if(native){
  const preview=fields.querySelector("[data-post-preview]");
  const choose=fields.querySelector("[data-select-post-media]");
  const frame=mk("div","cp-media");
  if(preview)frame.append(preview);
  if(choose){
   choose.classList.add("cp-media-choose");
   choose.replaceChildren();
   const image=mk("span","cp-media-symbol");image.innerHTML=glyphs.image;
   choose.append(image,mk("strong","","Foto ou vídeo"));
   frame.append(choose);
  }
  identity.after(frame);
 }else{
  const input=fields.querySelector("#postExternalUrl");
  const label=fields.querySelector('label[for="postExternalUrl"]');
  if(input){
   const external=mk("div","cp-external");
   external.append(mk("span","cp-external-icon","↗"));
   if(label)label.remove();
   input.placeholder="Link do Reel";
   external.append(input);
   identity.after(external);
  }
 }
 const body=fields.querySelector("#postBody");
 if(body){body.placeholder="Legenda";body.classList.add("cp-caption");}
 const mediaLabel=fields.querySelector(".media-picker-label");
 if(mediaLabel)mediaLabel.hidden=true;
 const submitOptions=fields.querySelector(".composer-options");
 if(submitOptions)submitOptions.classList.add("cp-actions");
 const bottomSubmit=submitOptions?.querySelector('button[type="submit"]');
 if(bottomSubmit){bottomSubmit.replaceChildren(mk("span","", "Publicar"),mk("span","cp-button-arrow","↗"));}
 if(privacy){
  const oldLabel=fields.querySelector('label[for="postVisibility"]');oldLabel?.classList.add("cp-hidden-label");
  privacy.classList.add("cp-hidden-select");
 }
 const chooser=fields.querySelector("[data-recipient-picker]");
 const select=fields.querySelector("#postRecipients");
 if(!chooser||!select)return;
 chooser.classList.add("cp-recipient-area");
 select.classList.add("cp-native-recipients");
 const headPeople=mk("div","cp-recipient-head");
 headPeople.append(mk("strong","","Pessoas"),mk("small","cp-recipient-counter","0 selecionadas"));
 const search=mk("input","cp-recipient-search");search.type="search";search.placeholder="Buscar pessoas";search.setAttribute("aria-label","Buscar pessoas");
 const grid=mk("div","cp-recipient-grid");grid.setAttribute("role","group");grid.setAttribute("aria-label","Selecionar quem pode ver");
 chooser.append(headPeople,search,grid);
 let people=[],loading=false,loaded=false,filter="";
 const selected=new Set();
 const counter=headPeople.querySelector(".cp-recipient-counter");
 function draw(){
  grid.replaceChildren();
  const matching=people.filter(p=>(String(p.username||"")+" "+String(p.display_name||"")).toLocaleLowerCase("pt-BR").includes(filter));
  for(const p of matching){
   const cell=mk("button","cp-recipient");cell.type="button";cell.dataset.cpPerson=p.id;
   cell.setAttribute("aria-pressed",String(selected.has(p.id)));
   cell.append(face(p),mk("strong","",p.display_name||p.username||"Membro"),mk("small","","@"+String(p.username||"")));
   const check=mk("span","cp-recipient-check",selected.has(p.id)?"✓":"+");cell.append(check);
   grid.append(cell);
  }
  if(!matching.length&&!loading)grid.append(mk("span","cp-no-people",people.length?"Nenhum resultado.":"Nenhuma pessoa encontrada."));
  counter.textContent=selected.size+" "+(selected.size===1?"selecionada":"selecionadas");
 }
 async function loadPeople(){
  if(loaded||loading)return;
  loading=true;grid.replaceChildren(mk("span","cp-no-people","Carregando…"));
  try{
   const r=await client.from("profiles").select("id,username,display_name,avatar_path")
    .neq("id",ownId).order("username").limit(500);
   if(r.error)throw r.error;
   people=await signPeople(client,(r.data||[]).filter(p=>p.id&&p.username));
   loaded=true;
   const previously=[...select.selectedOptions].map(o=>o.value);
   select.replaceChildren();
   for(const p of people){
    const opt=mk("option","",p.display_name||p.username);opt.value=p.id;
    opt.selected=previously.includes(p.id);select.append(opt);
    if(opt.selected)selected.add(p.id);
   }
   select.disabled=!people.length;
  }catch(error){
   console.error("Looply composer recipients",error);
   const fallback=[...select.options];
   people=fallback.map(o=>({id:o.value,username:o.textContent.split("@").pop(),display_name:o.textContent.split("·")[0].trim()})).filter(p=>p.id);
   select.disabled=!people.length;
   loaded=true;
  }finally{loading=false;draw();}
 }
 grid.addEventListener("click",event=>{
  const b=event.target.closest("[data-cp-person]");if(!b)return;
  const id=b.dataset.cpPerson;
  if(selected.has(id))selected.delete(id);else{
   if(selected.size>=20)return;selected.add(id);
  }
  for(const o of select.options)o.selected=selected.has(o.value);
  draw();
 });
 search.addEventListener("input",e=>{filter=e.target.value.trim().toLocaleLowerCase("pt-BR");draw();});
 privacy?.addEventListener("change",()=>{
  if(privacy.value==="selected"){
   chooser.hidden=false;void loadPeople();
  }else chooser.hidden=true;
 });
 chooser.hidden=privacy?.value!=="selected";
 if(!chooser.hidden)void loadPeople();
 composer.addEventListener("reset",()=>{
  selected.clear();
  filter="";search.value="";
  privacy.value="public";chooser.hidden=true;
  identity.querySelectorAll("[data-cp-visibility]").forEach(btn=>btn.setAttribute("aria-pressed",String(btn.dataset.cpVisibility==="public")));
  draw();
 });
}
