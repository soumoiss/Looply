import { icon } from "./icons.js";
import { normalizeYouTubePlaylistUrl } from "./youtube-playlist.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function profileAreaMarkup(profile) {
  const username = escapeHtml(profile.username);
  const displayName = escapeHtml(profile.display_name);
  const bio = escapeHtml(profile.bio || "");
  const visibility = profile.profile_visibility || "members";
  const visibilityLabel = visibility === "private" ? "Perfil privado" : visibility === "public" ? "Público" : "Visível para membros";
  const avatarUrl = profile.avatarUrl ? escapeHtml(profile.avatarUrl) : "";
  const avatar = profile.avatarUrl
    ? `<img class="profile-avatar-edit-image" src="${escapeHtml(profile.avatarUrl)}" alt="Sua foto de perfil" referrerpolicy="no-referrer">`
    : `<span class="profile-avatar-edit-fallback" aria-hidden="true">${escapeHtml((profile.display_name || profile.username || "?").slice(0, 1).toLocaleUpperCase("pt-BR"))}</span>`;
  return `<section class="people-area profile-page-area" aria-labelledby="peopleTitle">
    <article class="profile-overview" aria-label="Resumo do seu perfil">
      <div class="profile-overview-avatar">${avatar}</div>
      <div class="profile-overview-copy"><span class="section-kicker">Meu espaço</span><h2>${displayName || username}</h2>
        <span class="profile-overview-username">@${username}</span>${bio ? `<p>${bio}</p>` : `<p>Conte um pouco sobre você.</p>`}
        <span class="profile-visibility-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.5 8.2-8 10-4.5-1.8-8-5-8-10V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${escapeHtml(visibilityLabel)}</span></div>
      <a class="profile-overview-shortcut" href="#profileEditor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Editar perfil</a>
    </article>
    <section class="profile-editor-card" id="profileEditor" aria-labelledby="profileEditorTitle">
      <header class="profile-editor-heading"><div><span class="section-kicker">Personalização</span><h2 id="profileEditorTitle">Editar perfil</h2><p>Atualize seu nome, foto, apresentação e privacidade.</p></div><span class="profile-editor-mark" aria-hidden="true">✦</span></header>
      <form class="profile-editor-form" data-profile-edit data-has-avatar="${profile.avatar_path ? "true" : "false"}">
        <div class="profile-avatar-editor">
          <div class="profile-avatar-edit-preview" data-avatar-preview data-original-avatar-url="${avatarUrl}">${avatar}</div>
          <div class="profile-avatar-controls"><div><strong>Sua foto de perfil</strong><span class="field-hint">JPEG, PNG ou WebP · até 10 MB</span></div>
            <div class="profile-avatar-actions"><label class="profile-photo-picker" for="profileAvatar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v13H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>Câmera</label>
              <input class="profile-photo-input" id="profileAvatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" capture="user" data-avatar-input>
              <label class="profile-photo-picker" for="profileAvatarGallery"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="9" r="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 17 5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>Galeria</label>
              <input class="profile-photo-input" id="profileAvatarGallery" name="avatarGallery" type="file" accept="image/jpeg,image/png,image/webp" data-avatar-input>
              <input type="hidden" name="removeAvatar" value="false" data-avatar-remove-state>
              <button class="profile-photo-remove" type="button" data-avatar-remove ${profile.avatarUrl ? "" : "hidden"}>${profile.avatarUrl ? "Remover foto" : "Cancelar seleção"}</button></div>
          </div>
        </div>
        <div class="profile-edit-grid">
          <div class="field"><span class="profile-username-label">Username</span><strong class="profile-username-readonly">@${username}</strong><span class="field-hint">Seu username confirmado não pode ser alterado.</span></div>
          <div class="field"><label for="editDisplayName">Nome de exibição</label><input id="editDisplayName" name="displayName" value="${displayName}" maxlength="80" required></div>
        </div>
        <div class="field"><label for="editBio">Sobre mim</label><textarea id="editBio" name="bio" maxlength="280" rows="3">${bio}</textarea></div>
        <div class="field"><label for="editPlaylistUrl">URL da playlist do YouTube <span class="field-hint">(opcional)</span></label><input id="editPlaylistUrl" name="playlistUrl" type="url" maxlength="260" value="${escapeHtml(profile.playlist_url || "")}" placeholder="https://www.youtube.com/playlist?list=..."><span class="field-hint">Use uma playlist pública do YouTube para personalizar a aba Música.</span></div>
        <div class="profile-privacy-field"><div><label for="profileVisibility">Quem pode encontrar seu perfil?</label><span class="field-hint">A visibilidade do perfil não altera as permissões de cada story ou mídia.</span></div>
          <select id="profileVisibility" name="visibility">
            <option value="members" ${visibility === "members" ? "selected" : ""}>Membros</option>
            <option value="public" ${visibility === "public" ? "selected" : ""}>Público</option>
            <option value="private" ${visibility === "private" ? "selected" : ""}>Privado</option>
          </select>
        </div>
        <footer class="profile-edit-footer"><span class="form-status" data-status role="status" aria-live="polite"></span><button class="primary-button compact-button" type="submit">Salvar alterações</button></footer>
      </form>
      <dialog class="profile-crop-dialog" data-profile-crop-dialog aria-labelledby="profileCropTitle">
        <form method="dialog" class="profile-crop-shell">
          <header class="profile-crop-heading"><h2 id="profileCropTitle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v14a4 4 0 0 0 4 4h10M3 7h14a4 4 0 0 1 4 4v10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>Recortar foto</h2><button type="submit" class="profile-icon-button" aria-label="Fechar recorte"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></header>
          <p>Escolha a região quadrada que será usada no perfil.</p><div class="profile-crop-window"><img data-crop-source alt="Prévia para recorte"></div>
          <label for="profileCropZoom">Zoom</label><input id="profileCropZoom" data-crop-zoom type="range" min="1" max="3" step="0.01" value="1">
          <label for="profileCropX">Mover para esquerda ou direita</label><input id="profileCropX" data-crop-x type="range" min="0" max="100" value="50">
          <label for="profileCropY">Mover para cima ou para baixo</label><input id="profileCropY" data-crop-y type="range" min="0" max="100" value="50">
          <div class="profile-crop-actions"><button type="button" class="text-button" data-crop-cancel><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>Cancelar</button><button type="button" class="primary-button compact-button" data-crop-save><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>Salvar recorte</button></div>
        </form>
      </dialog>
    </section>
  </section>`;
}

function setStatus(form, message, kind = "success") {
  const target = form.querySelector("[data-status]");
  if (!target) return;
  target.textContent = message;
  target.dataset.kind = kind;
}

function avatarSaveErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const status = Number(error?.statusCode || error?.status || 0);
  if (message === "avatar-required") return "Escolha e recorte uma foto de perfil antes de continuar.";
  if (message === "avatar-replacement-required") return "Escolha uma nova foto antes de substituir a atual. A foto existente foi preservada.";
  if (message === "profile-fields") return "Confira o nome e a apresentação do perfil.";
  if (message === "unsupported avatar" || message === "avatar-not-square") return "A imagem precisa ser JPEG, PNG ou WebP, recortada em 512 × 512 px e ter até 10 MB.";
  if (message === "avatar-upload-invalid-result" || message === "avatar-upload-validation-failed") return "O armazenamento não confirmou a nova foto. A foto anterior foi preservada; tente novamente.";
  if (message === "avatar-rollback-failed") return "Não foi possível confirmar a restauração da foto anterior. Recarregue o perfil antes de tentar novamente; nenhuma confirmação de sucesso foi exibida.";
  if (message === "profile-update-not-confirmed") return "O servidor não confirmou a atualização do perfil. Nenhuma alteração de foto foi considerada concluída.";
  if (message.includes("session expired") || status === 401) return "Sua sessão expirou. Entre novamente e tente salvar a foto.";
  if (status === 403 || code.includes("42501") || message.includes("row-level security") || message.includes("permission")) return "Sua conta não tem permissão para salvar a foto. A foto atual foi preservada.";
  if (status === 413 || code.includes("file_size") || message.includes("too large") || message.includes("payload too large")) return "A imagem excede o limite aceito pelo armazenamento. Escolha uma imagem menor que 10 MB.";
  if (code.includes("mime") || message.includes("mime type") || message.includes("content type") || message.includes("unsupported format")) return "O formato da imagem não é aceito. Use JPEG, PNG ou WebP.";
  if (error instanceof TypeError || message.includes("fetch") || message.includes("network") || message.includes("failed to fetch")) return "Falha de conexão ao salvar a foto. Verifique a internet e tente novamente; a foto atual foi preservada.";
  if (status >= 500) return "O serviço de armazenamento está temporariamente indisponível. A foto atual foi preservada.";
  return "Não foi possível salvar a foto. A alteração não foi confirmada e a foto anterior foi preservada. Tente novamente.";
}

export async function signProfileAvatars(client, profiles) {
  const withUrls = (profiles || []).map((profile) => ({ ...profile, avatarUrl: "" }));
  const withAvatars = withUrls.filter((profile) => profile.avatar_path);
  if (!withAvatars.length) return withUrls;
  const { data, error } = await client.storage.from("looply-avatars").createSignedUrls(
    withAvatars.map((profile) => profile.avatar_path),
    1800
  );
  if (!error && data) {
    withAvatars.forEach((profile, index) => { profile.avatarUrl = data[index]?.signedUrl || ""; });
  }
  return withUrls;
}

export function renderSearchResults(container, profiles) {
  if (!profiles.length) {
    container.innerHTML = `<p class="search-empty">Nenhum perfil visível foi encontrado.</p>`;
    return;
  }
  container.innerHTML = profiles.map((profile) => `<article class="person-result">
    <span class="person-result-avatar" aria-hidden="true">${profile.avatarUrl
      ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : escapeHtml((profile.display_name || profile.username).slice(0, 1).toLocaleUpperCase("pt-BR"))}</span>
    <div><strong>${escapeHtml(profile.display_name || profile.username)}</strong><span>@${escapeHtml(profile.username)}</span></div>
    <div class="person-result-actions"><button class="text-button" type="button" data-profile-open="${escapeHtml(profile.id)}">Abrir perfil</button><button class="text-button" type="button" data-chat-start="${escapeHtml(profile.id)}">Conversar</button></div>
  </article>`).join("");
}

function renderOpenedProfile(container, profile, posts, postsError, showBack = true) {
  const mediaMarkup = (post) => (post.media || []).map((media) => {
    if (!media.signedUrl) return `<span class="media-unavailable">Mídia temporariamente indisponível.</span>`;
    const url = escapeHtml(media.signedUrl);
    const label = escapeHtml(media.alt_text || (media.kind === "video" ? "Vídeo do perfil" : "Foto do perfil"));
    return media.kind === "video"
      ? `<video src="${url}" controls preload="metadata" aria-label="${label}"></video>`
      : `<img src="${url}" alt="${label}" loading="lazy" referrerpolicy="no-referrer">`;
  }).join("");
  const postList = postsError
    ? `<p class="search-empty">Não foi possível carregar as publicações deste perfil.</p>`
    : posts.length
      ? posts.map((post) => `<article class="profile-post"><time datetime="${escapeHtml(post.created_at)}">${escapeHtml(new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(post.created_at)))}</time><p>${escapeHtml(post.body)}</p>${post.media?.length ? `<div class="profile-post-media-grid">${mediaMarkup(post)}</div>` : ""}</article>`).join("")
      : `<p class="search-empty">Este perfil não tem publicações visíveis para você.</p>`;
  const avatar = profile.avatarUrl
    ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : escapeHtml((profile.display_name || profile.username).slice(0, 1).toLocaleUpperCase("pt-BR"));
  container.innerHTML = `<section class="opened-profile" aria-label="Perfil de ${escapeHtml(profile.username)}">
    ${showBack ? `<button class="text-button" type="button" data-profile-close>${icon("back")} Voltar aos resultados</button>` : `<a class="text-button" href="usuarios.html">${icon("back")} Pessoas</a>`}
    <div class="opened-profile-heading"><span class="person-result-avatar" aria-hidden="true">${avatar}</span>
      <div><h3>${escapeHtml(profile.display_name || profile.username)}</h3><span>@${escapeHtml(profile.username)}</span></div>
    </div>
    ${profile.bio ? `<p class="opened-profile-bio">${escapeHtml(profile.bio)}</p>` : ""}
    <h4>Publicações visíveis</h4><div class="profile-post-list">${postList}</div>
  </section>`;
}

export async function showProfileInContainer(client, profileId, container, { showBack = true } = {}) {
  container.innerHTML = `<p class="search-empty" role="status">Carregando perfil...</p>`;
  const { data: profile, error } = await client.from("profiles").select("id,username,display_name,bio,avatar_path").eq("id", profileId).maybeSingle();
  if (error || !profile) {
    container.innerHTML = `<p class="search-empty" role="alert">Este perfil não está disponível para sua conta.</p>`;
    return;
  }
  if (profile.avatar_path) {
    const { data: signedAvatar } = await client.storage.from("looply-avatars").createSignedUrl(profile.avatar_path, 1800);
    profile.avatarUrl = signedAvatar?.signedUrl || "";
  }
  const { data: posts, error: postsError } = await client.from("posts")
    .select("id,body,created_at,media:post_media(id,storage_path,kind,mime_type,alt_text)")
    .eq("author_id", profileId).order("created_at", { ascending: false }).limit(12);
  const visiblePosts = posts || [];
  const media = visiblePosts.flatMap((post) => (post.media || []).map((item) => item));
  if (!postsError && media.length) {
    const { data: signed, error: signedError } = await client.storage.from("looply-media").createSignedUrls(media.map((item) => item.storage_path), 1800);
    if (!signedError && signed) media.forEach((item, index) => { item.signedUrl = signed[index]?.signedUrl || null; });
  }
  renderOpenedProfile(container, profile, visiblePosts, postsError, showBack);
}

export function bindProfileEvents(root, client, onProfileUpdated) {
  const syncProfileOverview = (form) => {
    const area = form.closest(".profile-page-area");
    const preview = form.querySelector("[data-avatar-preview]");
    const overviewAvatar = area?.querySelector(".profile-overview-avatar");
    const overviewName = area?.querySelector(".profile-overview-copy h2");
    const overviewBio = area?.querySelector(".profile-overview-copy p");
    const visibilityBadge = area?.querySelector(".profile-visibility-badge");
    if (overviewName) overviewName.textContent = form.elements.displayName.value.trim()
      || form.querySelector(".profile-username-readonly")?.textContent.replace(/^@/, "").trim() || "Meu perfil";
    if (overviewBio) overviewBio.textContent = form.elements.bio.value.trim() || "Conte um pouco sobre você.";
    if (overviewAvatar && preview?.firstElementChild) overviewAvatar.replaceChildren(preview.firstElementChild.cloneNode(true));
    if (visibilityBadge) {
      const visibility = form.elements.visibility.value;
      visibilityBadge.textContent = visibility === "private" ? "◉ Perfil privado"
        : visibility === "public" ? "◉ Público" : "◉ Visível para membros";
    }
  };

  const renderAvatarPreview = (preview, url, form) => {
    if (!preview) return;
    const fallbackName = form.elements.displayName.value.trim()
      || form.querySelector(".profile-username-readonly")?.textContent.replace(/^@/, "").trim() || "?";
    const fallbackInitial = Array.from(fallbackName)[0]?.toLocaleUpperCase("pt-BR") || "?";
    if (url) {
      const image = document.createElement("img");
      image.className = "profile-avatar-edit-image";
      image.src = url;
      image.alt = "Prévia da foto de perfil";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => {
        if (!preview.contains(image)) return;
        image.remove();
        const fallback = document.createElement("span");
        fallback.className = "profile-avatar-edit-fallback";
        fallback.setAttribute("aria-hidden", "true");
        fallback.textContent = fallbackInitial;
        preview.append(fallback);
        syncProfileOverview(form);
      }, { once: true });
      preview.replaceChildren(image);
      syncProfileOverview(form);
      return;
    }
    const fallback = document.createElement("span");
    fallback.className = "profile-avatar-edit-fallback";
    fallback.setAttribute("aria-hidden", "true");
    fallback.textContent = fallbackInitial;
    preview.replaceChildren(fallback);
    syncProfileOverview(form);
  };

  root.addEventListener("input", (event) => {
    const form = event.target.closest("form[data-profile-edit]");
    if (form && ["displayName", "bio"].includes(event.target.name)) syncProfileOverview(form);
  });
  root.addEventListener("change", (event) => {
    const form = event.target.closest("form[data-profile-edit]");
    if (form && event.target.name === "visibility") syncProfileOverview(form);
  });


  const cropDialog = root.querySelector("[data-profile-crop-dialog]");
  const cropImage = cropDialog?.querySelector("[data-crop-source]");
  const cropZoom = cropDialog?.querySelector("[data-crop-zoom]");
  const cropX = cropDialog?.querySelector("[data-crop-x]");
  const cropY = cropDialog?.querySelector("[data-crop-y]");
  let cropContext = null;
  const updateCropPreview = () => {
    if (!cropImage || !cropContext) return;
    const { width, height } = cropContext, zoom = Number(cropZoom.value || 1), unit = Math.min(width, height);
    const dw = width / unit * zoom * 100, dh = height / unit * zoom * 100;
    cropImage.style.width = `${dw}%`; cropImage.style.height = `${dh}%`;
    cropImage.style.left = `${(100-dw)*Number(cropX.value||50)/100}%`;
    cropImage.style.top = `${(100-dh)*Number(cropY.value||50)/100}%`;
  };
  [cropZoom,cropX,cropY].forEach((el)=>el?.addEventListener("input",updateCropPreview));
  root.addEventListener("change", async (event) => {
    const input=event.target.closest("input[data-avatar-input]"); if(!input)return;
    const form=input.closest("form[data-profile-edit]"), file=input.files?.[0]; if(!file||!form||!cropDialog||!cropImage)return;
    for (const other of form.querySelectorAll("input[data-avatar-input]")) {
      if (other !== input && other.name === "avatar") other.name = "avatarCamera";
    }
    input.name = "avatar";
    const fail=(message)=>{input.value="";setStatus(form,message,"error");};
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>2*1024*1024){fail("Escolha JPEG, PNG ou WebP de até 2 MB. Sua foto atual foi preservada.");return;}
    try {
      const bitmap=await createImageBitmap(file);
      if(bitmap.width<128||bitmap.height<128||bitmap.width>12000||bitmap.height>12000){bitmap.close();fail("A imagem precisa ter pelo menos 128 × 128 px e no máximo 12.000 px por lado.");return;}
      cropContext={file,width:bitmap.width,height:bitmap.height,form,input,bitmap};
      cropImage.src=URL.createObjectURL(file);cropZoom.value="1";cropX.value="50";cropY.value="50";updateCropPreview();
      if(!cropDialog.open)cropDialog.showModal();
      setStatus(form,"Selecione a área quadrada e confirme. A foto atual continua salva até o envio terminar.","info");
    } catch(error){console.error("Looply avatar image validation failed",error);fail("Não foi possível ler essa imagem. Tente outro arquivo.");}
  });
  const closeCrop=(discard)=>{
    if(!cropContext)return;const {form,input,bitmap}=cropContext;
    if(discard){input.value="";setStatus(form,"Recorte cancelado. A foto atual foi preservada.","info");}
    bitmap.close();if(cropImage?.src.startsWith("blob:"))URL.revokeObjectURL(cropImage.src);cropImage?.removeAttribute("src");cropContext=null;
    if(cropDialog?.open)cropDialog.close();
  };
  cropDialog?.querySelector("[data-crop-cancel]")?.addEventListener("click",()=>closeCrop(true));
  cropDialog?.querySelector(".profile-icon-button")?.addEventListener("click",(event)=>{event.preventDefault();closeCrop(true);});
  cropDialog?.addEventListener("cancel",(event)=>{event.preventDefault();closeCrop(true);});
  cropDialog?.querySelector("[data-crop-save]")?.addEventListener("click",async()=>{
    if(!cropContext)return;const button=cropDialog.querySelector("[data-crop-save]");button.disabled=true;
    try{
      const {form,input,bitmap,width,height}=cropContext,scale=Math.max(512/width,512/height)*Number(cropZoom.value||1);
      const dw=width*scale,dh=height*scale,dx=(512-dw)*Number(cropX.value||50)/100,dy=(512-dh)*Number(cropY.value||50)/100;
      const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;const ctx=canvas.getContext("2d",{alpha:false});
      if(!ctx)throw new Error("canvas unavailable");ctx.fillStyle="#fff";ctx.fillRect(0,0,512,512);ctx.drawImage(bitmap,dx,dy,dw,dh);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob((v)=>v?resolve(v):reject(new Error("crop failed")),"image/jpeg",.92));
      if(!blob||blob.size>10*1024*1024)throw new Error("invalid crop result");
      const cropped=new File([blob],"profile-photo.jpg",{type:"image/jpeg",lastModified:Date.now()}),transfer=new DataTransfer();transfer.items.add(cropped);input.files=transfer.files;
      if(form.dataset.avatarPreviewUrl)URL.revokeObjectURL(form.dataset.avatarPreviewUrl);
      const url=URL.createObjectURL(cropped);form.dataset.avatarPreviewUrl=url;
      const state=form.querySelector("[data-avatar-remove-state]");if(state)state.value="false";
      const remove=form.querySelector("[data-avatar-remove]");if(remove){remove.hidden=false;remove.textContent="Cancelar seleção";}
      renderAvatarPreview(form.querySelector("[data-avatar-preview]"),url,form);setStatus(form,"Recorte quadrado de 512 × 512 px pronto. Salve para enviar.","success");closeCrop(false);
    }catch(error){console.error("Looply avatar crop failed",error);if(cropContext?.form)setStatus(cropContext.form,"Não foi possível recortar essa imagem. A foto atual foi preservada.","error");}
    finally{button.disabled=false;}
  });


  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-profile-edit], form[data-profile-search]");
    if (!form || !client) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const values = new FormData(form);
      if (form.matches("[data-profile-edit]")) {
        const displayName = String(values.get("displayName") || "").trim();
        const bio = String(values.get("bio") || "").trim();
        const playlistUrlInput = String(values.get("playlistUrl") || "").trim();
        const playlistUrl = normalizeYouTubePlaylistUrl(playlistUrlInput);
        const visibility = String(values.get("visibility") || "members");
        const avatarFile = values.get("avatar");
        const hasAvatarFile = avatarFile instanceof File && avatarFile.size > 0;
        const removeAvatar = String(values.get("removeAvatar") || "false") === "true" && !hasAvatarFile;
        if (removeAvatar) throw new Error("avatar-replacement-required");
        if (form.dataset.hasAvatar !== "true" && !hasAvatarFile) throw new Error("avatar-required");
        if (!displayName || displayName.length > 80 || bio.length > 280 || (playlistUrlInput && !playlistUrl)) throw new Error("profile-fields");
        const userId = (await client.auth.getUser()).data.user?.id;
        if (!userId) throw new Error("session expired");
        let newAvatarPath = null;
        let oldAvatarPath = null;
        if (hasAvatarFile || removeAvatar) {
          const { data: currentProfile, error: currentError } = await client.from("profiles").select("avatar_path").eq("id", userId).single();
          if (currentError) throw currentError;
          oldAvatarPath = currentProfile.avatar_path;
        }
        if (hasAvatarFile) {
          const extensions = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
          const extension = extensions.get(avatarFile.type);
          if (!extension || avatarFile.size > 10 * 1024 * 1024) throw new Error("unsupported avatar");
          const validatedBitmap = await createImageBitmap(avatarFile);
          const squareValid = validatedBitmap.width === 512 && validatedBitmap.height === 512;
          validatedBitmap.close();
          if (!squareValid) throw new Error("avatar-not-square");
          newAvatarPath = `avatars/${userId}/${crypto.randomUUID()}.${extension}`;
          const { data: uploadData, error: uploadError } = await client.storage.from("looply-avatars").upload(newAvatarPath, avatarFile, { contentType: avatarFile.type, upsert: false, cacheControl: "3600" });
          if (uploadError) throw uploadError;
          if (!uploadData?.path || uploadData.path !== newAvatarPath) throw new Error("avatar-upload-invalid-result");
        }
        const updates = { display_name: displayName, bio, profile_visibility: visibility };
        updates.playlist_url = playlistUrl || null;
        if (hasAvatarFile || removeAvatar) updates.avatar_path = newAvatarPath;
        const { data: updatedProfile, error: updateError } = await client.from("profiles")
          .update(updates).eq("id", userId).select("id,avatar_path").maybeSingle();
        if (updateError || !updatedProfile) {
          if (newAvatarPath) {
            const { error: cleanupError } = await client.storage.from("looply-avatars").remove([newAvatarPath]);
            if (cleanupError) console.error("Could not clean up uncommitted profile avatar", cleanupError);
          }
          if (updateError) throw updateError;
          throw new Error("profile-update-not-confirmed");
        }
        if (newAvatarPath) {
          // Storage SELECT is intentionally allowed only after profiles.avatar_path points at this object.
          // Signing before the profile update fails the bucket's read-visible-profile RLS policy.
          const { data: validationUrl, error: validationError } = await client.storage.from("looply-avatars").createSignedUrl(newAvatarPath, 60);
          if (validationError || !validationUrl?.signedUrl) {
            const { data: rolledBackProfile, error: rollbackError } = await client.from("profiles")
              .update({ avatar_path: oldAvatarPath }).eq("id", userId).select("id").maybeSingle();
            if (!rollbackError && rolledBackProfile) {
              const { error: cleanupError } = await client.storage.from("looply-avatars").remove([newAvatarPath]);
              if (cleanupError) console.error("Could not clean up rolled-back profile avatar", cleanupError);
              throw new Error("avatar-upload-validation-failed");
            }
            console.error("Could not roll back profile avatar after storage validation failed", rollbackError);
            throw new Error("avatar-rollback-failed");
          }
        }
        if (newAvatarPath) form.dataset.hasAvatar = "true";
        if (oldAvatarPath && (newAvatarPath || removeAvatar)) {
          const { error: removeError } = await client.storage.from("looply-avatars").remove([oldAvatarPath]);
          if (removeError) console.error("Could not remove previous profile avatar", removeError);
        }
        const previewUrl = form.dataset.avatarPreviewUrl;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setStatus(form, "Perfil atualizado.");
        await onProfileUpdated?.();
      } else {
        const query = String(values.get("query") || "").trim().toLowerCase();
        if (!/^[a-z0-9_]{3,30}$/.test(query)) throw new Error("username");
        const { data, error } = await client.from("profiles").select("id,username,display_name,avatar_path").ilike("username", `${query}%`).order("username").limit(20);
        if (error) throw error;
        renderSearchResults(root.querySelector("[data-profile-results]"), await signProfileAvatars(client, data || []));
      }
    } catch (error) {
      console.error("Looply profile action failed", error);
      if (form.matches("[data-profile-edit]")) {
        setStatus(form, avatarSaveErrorMessage(error), "error");
      } else {
        const results = root.querySelector("[data-profile-results]");
        if (results) results.innerHTML = `<p class="search-empty" role="alert">Não foi possível buscar agora. Confira sua conexão e tente novamente.</p>`;
      }
    } finally {
      if (button) button.disabled = false;
    }
  });

  root.addEventListener("click", async (event) => {
    const avatarRemove = event.target.closest("[data-avatar-remove]");
    if (avatarRemove) {
      const form = avatarRemove.closest("form[data-profile-edit]");
      const input = form?.querySelector("[data-avatar-input]");
      const preview = form?.querySelector("[data-avatar-preview]");
      const removeState = form?.querySelector("[data-avatar-remove-state]");
      if (!form || !input || !preview || !removeState) return;
      const hadSelection = Boolean(input.files?.length);
      const pendingUrl = form.dataset.avatarPreviewUrl;
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      delete form.dataset.avatarPreviewUrl;
      if (hadSelection) input.value = "";
      const originalUrl = preview.dataset.originalAvatarUrl || "";
      if (hadSelection) {
        removeState.value = "false";
        renderAvatarPreview(preview, originalUrl, form);
        avatarRemove.textContent = originalUrl ? "Remover foto" : "Escolher foto";
        setStatus(form, "Seleção cancelada.", "success");
      } else if (removeState.value === "true") {
        removeState.value = "false";
        renderAvatarPreview(preview, originalUrl, form);
        avatarRemove.textContent = "Remover foto";
        setStatus(form, "Remoção desfeita.", "success");
      } else if (originalUrl) {
        removeState.value = "true";
        renderAvatarPreview(preview, "", form);
        avatarRemove.textContent = "Desfazer";
        setStatus(form, "A foto será removida ao salvar.", "success");
      } else {
        renderAvatarPreview(preview, "", form);
        avatarRemove.hidden = true;
        setStatus(form, "Seleção cancelada.", "success");
      }
      if (removeState.value === "false" && !originalUrl && !input.files?.length) avatarRemove.hidden = true;
      else avatarRemove.hidden = false;
      return;
    }
    const openButton = event.target.closest("[data-profile-open]");
    const closeButton = event.target.closest("[data-profile-close]");
    const chatButton = event.target.closest("[data-chat-start]");
    const container = root.querySelector("[data-profile-results]");
    if (chatButton && client) {
      chatButton.disabled = true;
      try {
        const { data, error } = await client.functions.invoke("looply-chat", { body: { action: "create_direct", targetId: chatButton.dataset.chatStart } });
        if (error) throw error;
        if (!data?.conversationId) throw new Error("conversation unavailable");
        window.location.assign(`conversa.html?id=${encodeURIComponent(data.conversationId)}`);
      } catch (error) {
        console.error("Looply profile conversation failed", error);
        chatButton.disabled = false;
        chatButton.textContent = "Tentar novamente";
      }
      return;
    }
    if (closeButton && container) {
      const query = root.querySelector("#peopleQuery")?.value || "";
      if (query.length >= 3) {
        const { data } = await client.from("profiles").select("id,username,display_name,avatar_path").ilike("username", `${query.toLowerCase()}%`).order("username").limit(20);
        renderSearchResults(container, await signProfileAvatars(client, data || []));
      }
    }
    if (!openButton || !client || !container) return;
    await showProfileInContainer(client, openButton.dataset.profileOpen, container);
  });
}


