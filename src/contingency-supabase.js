import {createClient} from "https://esm.sh/@supabase/supabase-js@2.117.3";
import {authenticateOriginalAccount} from "./auth-gateway.js";
const config=window.LOOPLY_CONFIG||{};
const client=createClient(config.supabaseUrl,config.publishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:"looply-contingencia-auth"}
});
const $=selector=>document.querySelector(selector);
const state={user:null,profile:null,people:new Map(),selectedTab:"feed",records:new Map()};
const tabs=[
  {id:"feed",label:"Publicações",table:"posts",fields:"id,author_id,body,created_at,external_url"},
  {id:"chat",label:"Mensagens",table:"chat_messages",fields:"id,conversation_id,sender_id,body,created_at"},
  {id:"letters",label:"Cartas",table:"community_letters",fields:"id,sender_id,recipient_id,subject,body,is_protected,created_at"},
  {id:"music",label:"Músicas",table:"music_dedications",fields:"id,sender_id,recipient_id,title,artist,dedication_note,listen_url,created_at"}
];
const asText=value=>String(value??"");
const formatDate=value=>value?new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"";
const names=id=>{
  const p=state.people.get(id);
  return p?.display_name||p?.username||"Membro";
};
function make(tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=asText(text);
  return node;
}
function status(message,type=""){
  const node=$("#contingency-status");
  node.textContent=message;
  node.dataset.kind=type;
}
function setBusy(busy){
  $("#login-submit").disabled=busy;
  $("#login-submit").textContent=busy?"Entrando…":"Entrar";
}
function displayAuthenticated(){
  $("#contingency-login").hidden=true;
  $("#contingency-library").hidden=false;
  $("#contingency-identity").textContent="@"+state.profile.username;
  const first=(state.profile.display_name||state.profile.username||"?").trim()[0];
  $("#contingency-avatar").textContent=first.toLocaleUpperCase("pt-BR");
}
function statusError(error){
  const status=Number(error?.status||error?.cause?.status||0);
  if(status===402||/quota|restricted|exceeded|unavailable/i.test(asText(error?.message)))
    return "O Supabase também está indisponível. Nenhuma senha foi alterada.";
  if(status===429||/rate_limited/i.test(asText(error?.message)))
    return "Muitas tentativas. Tente novamente mais tarde.";
  if(/invalid_credentials/i.test(asText(error?.message)))
    return "Não foi possível validar essas credenciais no arquivo original.";
  return "Não foi possível abrir o arquivo original. Tente novamente.";
}
async function verifyUser(){
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user?.id)throw error||Error("unauthenticated");
  const {data:profile,error:profileError}=await client.from("profiles")
    .select("id,username,display_name").eq("id",user.id).maybeSingle();
  if(profileError||!profile||profile.id!==user.id)throw profileError||Error("profile_unavailable");
  state.user=user;state.profile=profile;
  displayAuthenticated();
  void loadPeople();
  await openTab(state.selectedTab);
}
async function loadPeople(){
  const {data,error}=await client.from("profiles").select("id,username,display_name").limit(150);
  if(error)return;
  for(const p of data||[])state.people.set(p.id,p);
  if(state.profile)state.people.set(state.profile.id,state.profile);
  if(state.records.has(state.selectedTab))renderCards(state.selectedTab,state.records.get(state.selectedTab));
}
function cardFor(tab,record){
  const article=make("article","entry");
  const head=make("div","entry-head");
  let title="Publicação",body="";
  if(tab==="feed"){
    title=names(record.author_id);
    body=record.body||"";
  }else if(tab==="chat"){
    title=names(record.sender_id);
    body=record.body||"";
  }else if(tab==="letters"){
    title=record.subject||"Carta";
    body=record.is_protected?"Carta protegida":(record.body||"");
  }else if(tab==="music"){
    title=record.title||"Música";
    body=[record.artist,record.dedication_note].filter(Boolean).join(" — ");
  }
  head.append(make("strong","entry-name",title),make("time","entry-date",formatDate(record.created_at)));
  article.append(head);
  if(body)article.append(make("p","entry-body",body));
  if(tab==="feed"&&record.external_url){
    try{
      const url=new URL(record.external_url);
      if(url.protocol==="https:"&&["instagram.com","www.instagram.com","www.tiktok.com","youtube.com","www.youtube.com","youtu.be"].includes(url.hostname)){
        const link=make("a","entry-link","Abrir publicação");
        link.href=url.href;link.target="_blank";link.rel="noopener noreferrer";
        article.append(link);
      }
    }catch{}
  }
  if(tab==="music"&&record.listen_url){
    try{
      const url=new URL(record.listen_url);
      if(url.protocol==="https:"){
        const link=make("a","entry-link","Ouvir");link.href=url.href;link.rel="noopener noreferrer";article.append(link);
      }
    }catch{}
  }
  return article;
}
function renderCards(tab,records){
  const dest=$("#contingency-results");dest.replaceChildren();
  if(!records?.length){
    dest.append(make("p","empty","Nenhum conteúdo disponível neste arquivo."));
    return;
  }
  const frag=document.createDocumentFragment();
  for(const record of records)frag.append(cardFor(tab,record));
  dest.append(frag);
}
async function openTab(tab){
  const tabConfig=tabs.find(x=>x.id===tab);
  if(!tabConfig||!state.user)return;
  state.selectedTab=tab;
  for(const button of document.querySelectorAll("[data-tab]")){
    button.setAttribute("aria-selected",String(button.dataset.tab===tab));
  }
  $("#contingency-results").replaceChildren(make("p","empty","Carregando…"));
  if(state.records.has(tab)){
    renderCards(tab,state.records.get(tab));return;
  }
  const result=await client.from(tabConfig.table).select(tabConfig.fields)
    .order("created_at",{ascending:false}).limit(75);
  if(tab!==state.selectedTab)return;
  if(result.error){
    const text=result.error.status===402?
      "O acervo está temporariamente indisponível.":"Não foi possível carregar esta coleção.";
    $("#contingency-results").replaceChildren(make("p","empty",text));
    return;
  }
  state.records.set(tab,result.data||[]);
  renderCards(tab,result.data||[]);
}
$("#contingency-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const username=$("#contingency-username").value.trim();
  const password=$("#contingency-password").value;
  if(!username||!password){status("Informe seu usuário e senha.");return;}
  setBusy(true);status("");
  try{
    await authenticateOriginalAccount(client,username,password);
    await verifyUser();
    $("#contingency-password").value="";
  }catch(error){
    // Do not leak usernames, passwords, provider responses or tokens to logs.
    status(statusError(error),"error");
  }finally{setBusy(false);}
});
$("#contingency-signout").addEventListener("click",async()=>{
  await client.auth.signOut();
  state.user=null;state.profile=null;state.records.clear();state.people.clear();
  $("#contingency-library").hidden=true;$("#contingency-login").hidden=false;
  $("#contingency-password").value="";status("");
});
for(const btn of document.querySelectorAll("[data-tab]")){
  btn.addEventListener("click",()=>void openTab(btn.dataset.tab));
}
try{
  const {data:{session},error}=await client.auth.getSession();
  if(session&&!error)await verifyUser();
}catch{/* Existing session is not treated as authorization without server verification. */}
