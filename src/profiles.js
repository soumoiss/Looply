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
  const avatar = profile.avatarUrl
    ? `<img class="profile-avatar-edit-image" src="${escapeHtml(profile.avatarUrl)}" alt="Sua foto de perfil" referrerpolicy="no-referrer">`
    : `<span class="profile-avatar-edit-fallback" aria-hidden="true">${escapeHtml((profile.display_name || profile.username || "?").slice(0, 1).toLocaleUpperCase("pt-BR"))}</span>`;
  return `<section class="people-area" aria-labelledby="peopleTitle">
    <details class="profile-editor">
      <summary>Editar meu perfil</summary>
      <form data-profile-edit>
        <div class="profile-avatar-editor"><div class="profile-avatar-edit-preview">${avatar}</div><div><label for="profileAvatar">Foto de perfil</label><input id="profileAvatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp"><span class="field-hint">Escolha ou tire uma foto pelo celular. JPEG, PNG ou WebP; até 10 MB.</span></div></div>
        <div class="profile-edit-grid">
          <div class="field"><span class="profile-username-label">Username</span><strong class="profile-username-readonly">@${username}</strong><span class="field-hint">Seu username confirmado não pode ser alterado.</span></div>
          <div class="field"><label for="editDisplayName">Nome de exibição</label><input id="editDisplayName" name="displayName" value="${displayName}" maxlength="80" required></div>
        </div>
        <div class="field"><label for="editBio">Sobre mim</label><textarea id="editBio" name="bio" maxlength="280" rows="3">${bio}</textarea></div>
        <div class="profile-edit-footer">
          <label for="profileVisibility">Visibilidade do perfil</label>
          <select id="profileVisibility" name="visibility">
            <option value="members" ${visibility === "members" ? "selected" : ""}>Membros</option>
            <option value="public" ${visibility === "public" ? "selected" : ""}>Público</option>
            <option value="private" ${visibility === "private" ? "selected" : ""}>Privado</option>
          </select>
          <button class="text-button" type="submit">Salvar perfil</button>
        </div>
        <span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>
    </details>
    <div class="people-search">
      <div class="people-search-heading"><span class="section-kicker">Encontre seus amigos</span><h2 id="peopleTitle">Pessoas do Looply</h2><p>Busque pelo início do username. Os perfis privados não aparecem para outras pessoas.</p></div>
      <form class="people-search-form" data-profile-search>
        <label class="visually-hidden" for="peopleQuery">Username para buscar</label>
        <span aria-hidden="true">⌕</span>
        <input id="peopleQuery" name="query" type="text" minlength="3" maxlength="30" pattern="[A-Za-z0-9_]{3,30}" placeholder="username (3 ou mais caracteres)" required>
        <button class="text-button" type="submit">Buscar</button>
      </form>
      <div class="profile-results" data-profile-results aria-live="polite"></div>
    </div>
  </section>`;
}

function setStatus(form, message, kind = "success") {
  const target = form.querySelector("[data-status]");
  if (!target) return;
  target.textContent = message;
  target.dataset.kind = kind;
}

async function signProfileAvatars(client, profiles) {
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

function renderSearchResults(container, profiles) {
  if (!profiles.length) {
    container.innerHTML = `<p class="search-empty">Nenhum perfil visível foi encontrado.</p>`;
    return;
  }
  container.innerHTML = profiles.map((profile) => `<article class="person-result">
    <span class="person-result-avatar" aria-hidden="true">${profile.avatarUrl
      ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : escapeHtml((profile.display_name || profile.username).slice(0, 1).toLocaleUpperCase("pt-BR"))}</span>
    <div><strong>${escapeHtml(profile.display_name || profile.username)}</strong><span>@${escapeHtml(profile.username)}</span></div>
    <button class="text-button" type="button" data-profile-open="${escapeHtml(profile.id)}">Abrir perfil</button>
  </article>`).join("");
}

function renderOpenedProfile(container, profile, posts, postsError) {
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
    <button class="text-button" type="button" data-profile-close>← Voltar aos resultados</button>
    <div class="opened-profile-heading"><span class="person-result-avatar" aria-hidden="true">${avatar}</span>
      <div><h3>${escapeHtml(profile.display_name || profile.username)}</h3><span>@${escapeHtml(profile.username)}</span></div>
    </div>
    ${profile.bio ? `<p class="opened-profile-bio">${escapeHtml(profile.bio)}</p>` : ""}
    <h4>Publicações visíveis</h4><div class="profile-post-list">${postList}</div>
  </section>`;
}

export function bindProfileEvents(root, client, onProfileUpdated) {
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
        const visibility = String(values.get("visibility") || "members");
        const avatarFile = values.get("avatar");
        const hasAvatarFile = avatarFile instanceof File && avatarFile.size > 0;
        if (!displayName || displayName.length > 80 || bio.length > 280) throw new Error("profile-fields");
        const userId = (await client.auth.getUser()).data.user?.id;
        if (!userId) throw new Error("session expired");
        let newAvatarPath = null;
        let oldAvatarPath = null;
        if (hasAvatarFile) {
          const extensions = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
          const extension = extensions.get(avatarFile.type);
          if (!extension || avatarFile.size > 10 * 1024 * 1024) throw new Error("unsupported avatar");
          const { data: currentProfile, error: currentError } = await client.from("profiles").select("avatar_path").eq("id", userId).single();
          if (currentError) throw currentError;
          oldAvatarPath = currentProfile.avatar_path;
          newAvatarPath = `avatars/${userId}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await client.storage.from("looply-avatars").upload(newAvatarPath, avatarFile, { contentType: avatarFile.type, upsert: false, cacheControl: "3600" });
          if (uploadError) throw uploadError;
        }
        const updates = { display_name: displayName, bio, profile_visibility: visibility };
        if (newAvatarPath) updates.avatar_path = newAvatarPath;
        const { error } = await client.from("profiles").update(updates).eq("id", userId);
        if (error) {
          if (newAvatarPath) await client.storage.from("looply-avatars").remove([newAvatarPath]);
          throw error;
        }
        if (newAvatarPath && oldAvatarPath) {
          const { error: removeError } = await client.storage.from("looply-avatars").remove([oldAvatarPath]);
          if (removeError) console.error("Could not remove previous profile avatar", removeError);
        }
        if (error) throw error;
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
        const message = "Não foi possível salvar. Confira os campos e tente novamente.";
        setStatus(form, message, "error");
      } else {
        const results = root.querySelector("[data-profile-results]");
        if (results) results.innerHTML = `<p class="search-empty" role="alert">Não foi possível buscar agora. Confira sua conexão e tente novamente.</p>`;
      }
    } finally {
      if (button) button.disabled = false;
    }
  });

  root.addEventListener("click", async (event) => {
    const openButton = event.target.closest("[data-profile-open]");
    const closeButton = event.target.closest("[data-profile-close]");
    const container = root.querySelector("[data-profile-results]");
    if (closeButton && container) {
      const query = root.querySelector("#peopleQuery")?.value || "";
      if (query.length >= 3) {
        const { data } = await client.from("profiles").select("id,username,display_name,avatar_path").ilike("username", `${query.toLowerCase()}%`).order("username").limit(20);
        renderSearchResults(container, await signProfileAvatars(client, data || []));
      }
    }
    if (!openButton || !client || !container) return;
    const profileId = openButton.dataset.profileOpen;
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
    renderOpenedProfile(container, profile, visiblePosts, postsError);
  });
}

