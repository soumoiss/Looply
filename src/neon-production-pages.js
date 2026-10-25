import "./theme.js";
import {neon,activeSession,selfProfile,escapeText} from "./neon-production-client.js";
const paths=[["home","Início","home.html"],["letters","Cartas","cartas.html"],["music","Músicas","musicas.html"],["gallery","Galeria","galeria.html"],["chat","Chat","chat.html"],["notifications","Notificações","notificacoes.html"],["users","Usuários","usuarios.html"],["profile","Meu perfil","perfil.html"],["settings","Configurações","configuracoes.html"],["admin","Administração","admin.html"]];
const current=location.pathname.split("/").pop()||"home.html";
const root=document.getElementById("pageContent"),header=document.querySelector("[data-site-header]");
function status(message){if(root)root.innerHTML='<section class="panel page-notice" role="status">'+escapeText(message)+'</section>'}
function navMarkup(profile){const links=paths.map(([key,label,url])=>'<a class="header-action" href="'+url+'"'+(current===url?' aria-current="page"':'')+'>'+label+'</a>').join("");return '<div class="header-inner" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px"><a href="home.html" class="header-action"><strong>Looply</strong></a><nav aria-label="Navegação principal" style="display:flex;flex-wrap:wrap;gap:9px">'+links+'</nav><span style="margin-left:auto">@'+escapeText(profile.username)+'</span><button type="button" id="neonLogout" class="header-action">Sair</button></div>'}
function card(title,body){return '<section class="panel" style="margin-bottom:14px;padding:20px"><h2>'+escapeText(title)+'</h2>'+body+'</section>'}
function unavailable(name){return card(name,'<p>Esta seção está sendo conectada ao Neon e ao Cloudflare. Os dados existentes estão preservados; funções de escrita e mídias ainda não foram liberadas neste ambiente.</p>')}
async function home(profile){const result=await neon.from("v3_feed_posts").select("id,author_id,body,created_at,external_url").order("created_at",{ascending:false}).limit(35);if(result.error)throw Error("O feed não pôde ser carregado com as permissões atuais.");const posts=result.data||[];return card("Olá, "+(profile.display_name||profile.username)+'!','<p>Bem-vindo de volta ao Looply.</p>')+card("Publicações",posts.length?posts.map(p=>'<article style="border-top:1px solid #ddd;padding:14px 0"><small>'+escapeText(p.created_at?new Date(p.created_at).toLocaleString("pt-BR"):"")+'</small><p style="white-space:pre-wrap">'+escapeText(p.body||"Publicação sem texto")+'</p>'+(p.external_url?'<p><a href="'+escapeText(p.external_url)+'" target="_blank" rel="noopener noreferrer">Abrir link</a></p>':"")+'</article>').join(""):'<p>Ainda não há publicações visíveis para esta conta.</p>')}
function profilePage(profile){return card("Meu perfil",'<p><strong>@'+escapeText(profile.username)+'</strong></p><p>'+escapeText(profile.display_name||profile.username)+'</p><p>'+escapeText(profile.bio||"Sem biografia.")+'</p><p>Você já está conectado ao seu perfil original. O envio de foto poderá ser ativado depois.</p>')}
async function render(){
 if(!root||!header)return;
 let session;
 try{session=await activeSession()}catch(e){status(e.message);return}
 if(!session){location.replace("login.html?next="+encodeURIComponent(current));return}
 let profile;
 try{profile=await selfProfile()}catch(e){status(e.message);return}
 header.innerHTML=navMarkup(profile);
 document.getElementById("neonLogout")?.addEventListener("click",async()=>{const r=await neon.auth.signOut();if(r.error){status("Não foi possível sair da conta.");return}location.replace("login.html")});
 try{if(current==="home.html")root.innerHTML=await home(profile);else if(current==="perfil.html")root.innerHTML=profilePage(profile);else if(current==="admin.html"&&session.user?.role!=="admin"){location.replace("home.html");return}else {const name=paths.find(p=>p[2]===current)?.[1]||"Looply";root.innerHTML=unavailable(name)}}
 catch(e){status(e.message)}
}
void render();
