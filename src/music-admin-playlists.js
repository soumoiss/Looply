// Admin playlist inspector backed by Neon Auth + Postgres RLS (no legacy Supabase Edge Function).
// Only admins authenticated by v3_self_is_admin() can see this panel or insert private notes.
import { fetchPlaylistItems } from "./youtube-playlist.js";
import { signProfileAvatars } from "./profiles.js";
const h = (v) => String(v??"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const defaults=Object.freeze({misol:"PLUZFdmgmipvI",yara:"PLCn4CAsA_tiM",patati:"PLE0tcB0gaSzM",peixinho:"PLD5PXwJcU-Sg"});
const fallback="PLMeQ_QyqhY7s";
function playlistId(value) {
  try { const u=new URL(String(value||"")); if(!["youtube.com","www.youtube.com","music.youtube.com"].includes(u.hostname)||u.pathname!=="/playlist")return "";
    const id=u.searchParams.get("list")||"";return /^[\w-]{5,120}$/.test(id)?id:"";
  }catch{return "";}
}
export async function mountMusicAdminPlaylistPanel(root,client){
  const {data:admin,error:adminError}=await client.rpc("v3_self_is_admin");
  if(adminError||admin!==true)return;
  const {data,error}=await client.from("profiles").select("id,username,display_name,playlist_url,avatar_path").order("username").limit(250);
  if(error||!Array.isArray(data))return;
  let users=data;try{users=await signProfileAvatars(client,data);}catch{}
  const panel=document.createElement("section");
  panel.className="music-admin-playlists";
  panel.setAttribute("aria-label","Administração das playlists");
  panel.innerHTML='<div class="music-admin-playlists-heading"><span class="section-kicker">Área administrativa</span><h2>Playlists dos usuários</h2></div>'+
    '<div class="field"><label for="adminSearchOwner">Pesquisar usuário</label><input id="adminSearchOwner" type="search" placeholder="Nome ou @usuário" autocomplete="off"></div>'+
    '<div class="field"><label for="adminMusicOwner">Selecionar usuário</label><select id="adminMusicOwner"></select></div>'+
    '<div class="music-admin-owner-avatar" data-admin-owner-avatar></div>'+
    '<div class="music-admin-playlist-player" data-admin-music-player></div>'+
    '<form data-admin-music-comment-form class="music-admin-comment-form">'+
    '<div class="field"><label for="adminMusicTrack">Música da playlist</label><select id="adminMusicTrack" name="videoId" required></select></div>'+
    '<div class="field"><label for="adminMusicCommentBody">Comentário privado · ADM</label><textarea id="adminMusicCommentBody" name="body" required maxlength="2000" rows="3" placeholder="Somente o dono da playlist verá esta mensagem."></textarea></div>'+
    '<button class="primary-button compact-button" type="submit">Enviar comentário privado</button><span data-admin-music-status role="status" aria-live="polite"></span></form>';
  const musicArea=root.querySelector("[data-music-area]");
  (musicArea||root.firstElementChild||root).before(panel);
  const search=panel.querySelector("#adminSearchOwner"),owner=panel.querySelector("#adminMusicOwner"),track=panel.querySelector("#adminMusicTrack"),player=panel.querySelector("[data-admin-music-player]"),status=panel.querySelector("[data-admin-music-status]");
  const selectedUser=()=>users.find(u=>u.id===owner.value);
  const idOf=(user)=>playlistId(user?.playlist_url)||defaults[String(user?.username||"").toLowerCase()]||fallback;
  const renderUsers=()=>{
    const active=owner.value;
    const filtered=users.filter(u=>(u.display_name+" "+u.username).toLocaleLowerCase("pt-BR").includes(search.value.toLocaleLowerCase("pt-BR").trim()));
    owner.innerHTML=filtered.map(u=>'<option value="'+h(u.id)+'">'+h(u.display_name||u.username)+' · @'+h(u.username)+'</option>').join("");
    if(filtered.some(u=>u.id===active))owner.value=active;
    else if(filtered.length)owner.value=filtered[0].id;
    if(!filtered.length)owner.innerHTML='<option value="">Nenhum usuário encontrado</option>';
    void showUser();
  };
  let sequence=0;
  const showUser=async()=>{
    const request=++sequence,u=selectedUser(),playlist=idOf(u);
    const avatar=panel.querySelector("[data-admin-owner-avatar]");
    avatar.replaceChildren();
    if(u?.avatarUrl){const img=document.createElement("img");img.src=u.avatarUrl;img.alt="Foto do usuário";img.width=38;img.height=38;img.style.cssText="width:38px;height:38px;border-radius:50%;object-fit:cover;";avatar.append(img);}
    if(u){const info=document.createElement("span");info.textContent=" "+(u.display_name||u.username)+" · @"+u.username;avatar.append(info);}
    player.replaceChildren();
    track.replaceChildren(new Option("Carregando faixas…",""));
    if(!u){status.textContent="Selecione um usuário.";return;}
    if(!playlist){status.textContent="Este usuário não configurou uma playlist válida.";return;}
    const iframe=document.createElement("iframe");
    iframe.title="Playlist de "+(u.display_name||u.username);
    iframe.src="https://www.youtube-nocookie.com/embed/videoseries?list="+encodeURIComponent(playlist)+"&listType=playlist&playsinline=1";
    iframe.allow="autoplay; encrypted-media; picture-in-picture; web-share";
    iframe.allowFullscreen=true;iframe.referrerPolicy="strict-origin-when-cross-origin";player.append(iframe);
    try{
      const {data:session,error:sessionError}=await client.auth.getSession();
      if(sessionError||!session?.session?.access_token)throw Error("Sessão necessária.");
      const tracks=await fetchPlaylistItems(playlist,session.session.access_token);
      if(request!==sequence)return;
      track.replaceChildren(new Option(tracks.length?"Escolha uma música":"Playlist sem faixas disponíveis",""));
      for(const t of tracks){const opt=new Option(t.title||"Música",t.videoId);opt.dataset.title=t.title||"Música";track.add(opt);}
      status.textContent=tracks.length?tracks.length+" músicas recuperadas da playlist.":"Não há músicas públicas retornadas pela API.";
    }catch(err){
      if(request!==sequence)return;
      track.replaceChildren(new Option("Lista de músicas indisponível",""));
      status.textContent="O player incorporado continua disponível, mas a API da playlist não retornou faixas: "+String(err?.message||"falha");
    }
  };
  search.addEventListener("input",renderUsers);
  owner.addEventListener("change",()=>{void showUser();});
  renderUsers();
  panel.querySelector("form").addEventListener("submit",async(e)=>{
    e.preventDefault();const form=e.currentTarget,submit=form.querySelector('[type="submit"]'),u=selectedUser();
    const videoId=String(form.elements.videoId.value||""),title=track.selectedOptions[0]?.dataset.title||track.selectedOptions[0]?.textContent||"",body=String(form.elements.body.value||"").trim();
    if(!u||!/^[A-Za-z0-9_-]{11}$/.test(videoId)||!body||body.length>2000){status.textContent="Selecione uma faixa e escreva uma mensagem válida.";return;}
    submit.disabled=true;status.textContent="Verificando autorização e salvando...";
    try{
      const {data:adminAgain,error:aError}=await client.rpc("v3_self_is_admin");if(aError||adminAgain!==true)throw Error("Permissão de administrador ausente.");
      const {data:session,error:sError}=await client.auth.getSession();
      const authorId=session?.session?.user?.id;
      if(sError||!authorId)throw Error("Sua sessão expirou.");
      const {data:created,error:insertError}=await client.from("admin_music_track_comments").insert({author_id:authorId,recipient_id:u.id,playlist_id:idOf(u),video_id:videoId,track_title:title.slice(0,160),body}).select("id");
      if(insertError||!created?.length)throw insertError||Error("Banco não confirmou a publicação.");
      form.elements.body.value="";status.textContent="Comentário salvo no Neon. Apenas o destinatário e o ADM podem vê-lo.";
    }catch(err){status.textContent="Falha ao publicar: "+String(err?.message||"não autorizado");}
    finally{submit.disabled=false;}
  });
}
