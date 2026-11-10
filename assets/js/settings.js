import { mountAppPage } from "../../src/page-runtime.js?v=one-session-entry-20261031";
import {
  applyProfilePreferences,availableThemes,availableFonts,
  recommendedThemeFont,getThemePalette,getCurrentAppearance
} from "../../src/theme.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character])
);
const validThemes=new Set(availableThemes.map(item=>item.id));
const validFonts=new Set(availableFonts.map(item=>item.id));
const validSizes=new Set(["small","normal","large","very_large"]);
const sizeLabels={small:"Pequeno",normal:"Normal",large:"Grande",very_large:"Muito grande"};
const normalized = value => ({
  theme:validThemes.has(value?.theme)?value.theme:"lilas",
  font_family:validFonts.has(value?.font_family)?value.font_family:"system",
  font_size:validSizes.has(value?.font_size)?value.font_size:"normal"
});
const own=(a,b)=>Object.prototype.hasOwnProperty.call(a,b);
const cat=window.LooplyThemeCatalog;
const themeIds={base:["lilas","noite","system","oceano","rosa","floresta","aurora","coral","menta","sunset","grafite"],
  creative:["hacker","bts","blackpink","bob_esponja","jovens_titas","teen_wolf","cyberpunk","kawaii","vaporwave"]};
const fontGroups={
  neutral:["system","sans","rounded","manrope","dm_sans","jakarta","space_grotesk","montserrat"],
  soft:["nunito","quicksand","fredoka","baloo_2","outfit","urbanist"],
  editorial:["serif","cormorant","playfair","fraunces","cinzel","oswald"],
  expressive:["caveat","syne","bangers","permanent_marker","righteous","anton","bebas_neue"],
  tech:["ibm_plex_mono","orbitron","rajdhani","chakra_petch","vt323","pixelfy","special_elite"]
};
function themeOptions(ids, selected){
  return ids.filter(id=>validThemes.has(id)).map(id=>{
    const entry=availableThemes.find(theme=>theme.id===id);
    return '<option value="'+id+'" '+(id===selected?"selected":"")+'>'+escapeHtml(entry.label)+'</option>';
  }).join("");
}
function fontOptions(ids,selected){
  return ids.filter(id=>validFonts.has(id)).map(id=>{
    const entry=availableFonts.find(font=>font.id===id);
    return '<option value="'+id+'" '+(id===selected?"selected":"")+'>'+escapeHtml(entry.label)+'</option>';
  }).join("");
}
function settingsMarkup(initial){
  const theme=initial.theme,family=initial.font_family,size=initial.font_size;
  return '<form class="panel settings-form" data-settings-form>'+
    '<fieldset><legend>Tema</legend><label for="settingsTheme">Aparência</label>'+
    '<select id="settingsTheme" name="theme" aria-label="Escolher tema">'+
      '<optgroup label="Looply">'+themeOptions(themeIds.base,theme)+'</optgroup>'+
      '<optgroup label="Temas especiais">'+themeOptions(themeIds.creative,theme)+'</optgroup>'+
    '</select></fieldset>'+
    '<fieldset><legend>Texto</legend><label for="settingsFont">Fonte</label>'+
    '<select id="settingsFont" name="font_family" aria-label="Escolher fonte">'+
      '<optgroup label="Neutras e modernas">'+fontOptions(fontGroups.neutral,family)+'</optgroup>'+
      '<optgroup label="Suaves e arredondadas">'+fontOptions(fontGroups.soft,family)+'</optgroup>'+
      '<optgroup label="Clássicas e dramáticas">'+fontOptions(fontGroups.editorial,family)+'</optgroup>'+
      '<optgroup label="Expressivas e pop">'+fontOptions(fontGroups.expressive,family)+'</optgroup>'+
      '<optgroup label="Tecnologia e games">'+fontOptions(fontGroups.tech,family)+'</optgroup>'+
    '</select>'+
    '<label for="settingsSize">Tamanho</label><select id="settingsSize" name="font_size">'+
      Object.entries(sizeLabels).map(([id,label])=>
        '<option value="'+id+'" '+(size===id?"selected":"")+'>'+label+'</option>').join("")+
    '</select></fieldset>'+
    '<div class="settings-preview" data-settings-preview aria-live="polite">'+
      '<div class="settings-preview-swatch" aria-hidden="true" data-settings-swatches></div>'+
      '<div class="settings-preview-copy"><strong data-settings-preview-name></strong>'+
      '<small data-settings-preview-font></small></div></div>'+
    '<div class="settings-actions"><button class="primary-button compact-button" type="submit">'+
      'Salvar preferências</button><span class="form-status" data-settings-status role="status" aria-live="polite"></span></div>'+
  '</form>';
}
await mountAppPage({page:"settings",render:async ({root,client,user,profile})=>{
  const initial=normalized(profile);
  root.innerHTML=settingsMarkup(initial);
  const form=root.querySelector("[data-settings-form]");
  const status=form.querySelector("[data-settings-status]");
  const save=form.querySelector('button[type="submit"]');
  const formTheme=form.querySelector("#settingsTheme");
  const formFont=form.querySelector("#settingsFont");
  const formSize=form.querySelector("#settingsSize");
  const read=()=>normalized({theme:formTheme.value,font_family:formFont.value,font_size:formSize.value});
  const put=value=>{formTheme.value=value.theme;formFont.value=value.font_family;formSize.value=value.font_size;};
  let committed=initial,revision=0,processed=0,busy=false,timer=null;
  const show=(message,kind="info")=>{status.textContent=message;status.dataset.kind=kind;};
  const preview=values=>{
    applyProfilePreferences(values);
    const resolved=values.theme==="system"?
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches?"noite":"lilas"):values.theme;
    const palette=getThemePalette(resolved);
    const swatches=[palette.bg,palette.surfaceStrong,palette.primary,palette.lilac];
    form.querySelector("[data-settings-swatches]").innerHTML=swatches.map(hex=>
      '<span style="background:'+escapeHtml(hex)+'"></span>').join("");
    const selected=availableThemes.find(t=>t.id===values.theme);
    const font=availableFonts.find(f=>f.id===values.font_family);
    form.querySelector("[data-settings-preview-name]").textContent=selected?.label||"Looply";
    form.querySelector("[data-settings-preview-font]").textContent=(font?.label||"Sistema")+
      " · "+sizeLabels[values.font_size];
  };
  async function flush(){
    if(busy)return;
    clearTimeout(timer);
    busy=true;save.disabled=true;
    while(processed<revision){
      const requested=revision,value=read();
      show("Salvando…");
      try{
        const {data,error}=await client.from("profiles").update(value).eq("id",user.id)
          .select("theme,font_family,font_size").single();
        if(error||!data)throw error||Error("Preferências não confirmadas");
        committed=normalized(data);
        processed=requested;
        if(revision===requested){
          preview(committed);show("Salvo","success");
        }
      }catch(error){
        console.error("Looply appearance preference update failed",error);
        processed=requested;
        if(revision===requested){
          put(committed);preview(committed);
          show("Não foi possível salvar. Tente novamente.","error");
        }
      }
    }
    busy=false;save.disabled=false;
  }
  function schedule(){
    ++revision;
    preview(read());
    show("Aplicando…");
    clearTimeout(timer);
    timer=setTimeout(()=>void flush(),360);
  }
  formTheme.addEventListener("change",()=>{
    const suggested=recommendedThemeFont(formTheme.value);
    if(suggested&&validFonts.has(suggested))formFont.value=suggested;
    schedule();
  });
  formFont.addEventListener("change",schedule);
  formSize.addEventListener("change",schedule);
  form.addEventListener("submit",event=>{
    event.preventDefault();
    if(processed>=revision)++revision;
    void flush();
  });
  preview(initial);
}});
