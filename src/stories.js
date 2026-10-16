import { uploadResumable } from "./social.js";

const maxStoryBytes = 100 * 1024 * 1024;
const storyMimeTypes = new Map([
  ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"],
  ["video/mp4", "mp4"], ["video/webm", "webm"]
]);
let storiesChannel = null;
let storyRefreshTimer = null;
const refreshers = new WeakMap();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function safeSignedUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? escapeHtml(url.href) : "";
  } catch {
    return "";
  }
}

function rawSignedUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function profileName(profile) {
  return String(profile?.display_name || profile?.username || "Membro");
}

function initials(value) {
  return Array.from(String(value || "").trim())[0]?.toLocaleUpperCase("pt-BR") || "?";
}

function storyAvatar(profile, label, own = false) {
  const name = profileName(profile);
  const imageUrl = safeSignedUrl(profile?.avatarUrl);
  return '<span class="story-avatar-frame' + (own ? " is-own-story" : "") + '">' +
    (imageUrl
      ? '<img class="story-avatar-image" src="' + imageUrl + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
      : '<span class="story-avatar-initial" aria-hidden="true">' + escapeHtml(initials(name)) + "</span>") +
    (label === "Seu story" ? '<span class="story-add-mark" aria-hidden="true">+</span>' : "") +
    '</span><span class="story-avatar-label">' + escapeHtml(label) + "</span>";
}

export function groupActiveStories(stories, now = Date.now()) {
  const grouped = new Map();
  for (const story of Array.isArray(stories) ? stories : []) {
    const createdAt = Date.parse(story?.created_at || "");
    const expiresAt = Date.parse(story?.expires_at || "");
    const effectiveExpiry = Number.isFinite(expiresAt)
      ? expiresAt
      : Number.isFinite(createdAt) ? createdAt + 24 * 60 * 60 * 1000 : NaN;
    if (!story?.author_id || !Number.isFinite(effectiveExpiry) || effectiveExpiry <= now) continue;
    const item = { ...story, expires_at: new Date(effectiveExpiry).toISOString() };
    let group = grouped.get(item.author_id);
    if (!group) {
      group = { author_id: item.author_id, author: item.author || null, stories: [] };
      grouped.set(item.author_id, group);
    }
    if (!group.author && item.author) group.author = item.author;
    group.stories.push(item);
  }
  const result = [...grouped.values()];
  for (const group of result) group.stories.sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
  return result.sort((left, right) =>
    Date.parse(right.stories.at(-1)?.created_at || 0) - Date.parse(left.stories.at(-1)?.created_at || 0)
  );
}

export function storyMediaUrlTtl(expiresAt, now = Date.now()) {
  const expiry = Date.parse(expiresAt || "");
  if (!Number.isFinite(expiry)) return 0;
  const secondsBeforeExpiry = Math.floor((expiry - now - 5000) / 1000);
  return Math.max(0, Math.min(1800, Math.floor(secondsBeforeExpiry / 30) * 30));
}

export async function loadStories(client) {
  const { data, error } = await client.from("stories")
    .select("id,author_id,body,visibility,created_at,expires_at,author:profiles!stories_author_id_fkey(id,username,display_name,avatar_path),media:story_media!story_media_story_id_fkey(id,storage_path,kind,mime_type,alt_text,created_at)")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;

  const rows = data || [];
  const mediaItems = rows.flatMap((story) => {
    const media = Array.isArray(story.media) ? story.media : story.media ? [story.media] : [];
    return media.map((item) => ({ ...item, storyId: story.id, storyExpiresAt: story.expires_at }));
  });
  const signedAt = Date.now();
  const signGroups = new Map();
  for (const item of mediaItems) {
    item.signedUrl = null;
    const ttl = storyMediaUrlTtl(item.storyExpiresAt, signedAt);
    if (!ttl) continue;
    const group = signGroups.get(ttl) || [];
    group.push(item);
    signGroups.set(ttl, group);
  }
  await Promise.all([...signGroups].map(async ([ttl, items]) => {
    const { data: signed, error: signedError } = await client.storage.from("looply-media")
      .createSignedUrls(items.map((item) => item.storage_path), ttl);
    items.forEach((item, index) => {
      item.signedUrl = signedError ? null : signed?.[index]?.signedUrl || null;
    });
  }));

  const avatarPaths = [...new Set(rows.map((story) => story.author?.avatar_path).filter(Boolean))];
  const avatarUrls = new Map();
  if (avatarPaths.length) {
    const { data: signed, error: signedError } = await client.storage.from("looply-avatars")
      .createSignedUrls(avatarPaths, 1800);
    if (!signedError) avatarPaths.forEach((path, index) => avatarUrls.set(path, signed?.[index]?.signedUrl || null));
  }

  const mediaByStory = new Map();
  for (const item of mediaItems) {
    const list = mediaByStory.get(item.storyId) || [];
    list.push(item);
    mediaByStory.set(item.storyId, list);
  }
  for (const story of rows) {
    story.media = mediaByStory.get(story.id) || [];
    if (story.author) story.author.avatarUrl = avatarUrls.get(story.author.avatar_path) || null;
  }
  return rows;
}

function storyButtonMarkup(group, userId) {
  const own = group.author_id === userId;
  const author = group.author || {};
  const label = own ? "Seu story" : profileName(author);
  return '<button class="story-avatar-button" type="button" data-story-open="' + escapeHtml(group.author_id) +
    '" aria-label="Abrir stories de ' + escapeHtml(label) + '">' +
    storyAvatar(author, label, own) + '<span class="story-count">' + group.stories.length + "</span></button>";
}

function storyListMarkup(groups, userId, profile) {
  const ownGroup = groups.find((group) => group.author_id === userId);
  const otherGroups = groups.filter((group) => group.author_id !== userId);
  const ownStory = ownGroup ? storyButtonMarkup(ownGroup, userId) : "";
  const others = otherGroups.map((group) => storyButtonMarkup(group, userId)).join("");
  const ownAvatar = ownGroup?.author || profile;
  const createShortcut = '<button class="story-avatar-button story-create-shortcut" type="button" data-story-create-open aria-label="Adicionar story">' +
    storyAvatar(ownAvatar, "Seu story", true) + "</button>";
  return ownStory ? ownStory + others : createShortcut + others;
}

export function storiesMarkup(stories, error, people, peopleError, userId, profile) {
  const groups = groupActiveStories(stories);
  const eligiblePeople = (people || []).filter((person) =>
    person.id !== userId && person.profile_visibility !== "private"
  );
  const recipientOptions = eligiblePeople.map((person) =>
    '<option value="' + escapeHtml(person.id) + '">' +
      escapeHtml(person.display_name || person.username) + " · @" + escapeHtml(person.username) +
    "</option>"
  ).join("");
  const peopleHint = peopleError
    ? "Não foi possível carregar os perfis; atualize antes de enviar para pessoas escolhidas."
    : eligiblePeople.length ? "Selecione uma ou mais pessoas visíveis."
      : "Nenhum outro perfil visível está disponível.";
  return '<section class="story-area" aria-labelledby="storyAreaTitle">' +
    '<div class="story-area-heading"><div><span class="section-kicker">Stories</span><h2 id="storyAreaTitle">Stories</h2></div>' +
    '<button class="text-button" type="button" data-story-create-open>Adicionar story</button></div>' +
    '<div class="story-list" data-story-list aria-label="Stories ativos">' +
      storyListMarkup(groups, userId, profile) +
    "</div><p class=\"story-feed-status\" data-story-feed-status role=\"status\">" +
      (error
        ? 'Não foi possível carregar os stories. <button type="button" class="text-button" data-story-refresh>Tentar novamente</button>'
        : groups.length ? "" : "Nenhum story ativo.") +
    "</p>" +
    '<dialog class="story-create-dialog" data-story-create-dialog aria-labelledby="storyCreateTitle">' +
      '<div class="story-dialog-heading"><div><span class="section-kicker">Story</span><h2 id="storyCreateTitle">Adicionar story</h2></div>' +
      '<button class="icon-button" type="button" data-story-create-close aria-label="Fechar">×</button></div>' +
      '<form class="story-create-form" data-story-create>' +
        '<label for="storyBody">Texto <span>(opcional, até 1.000 caracteres)</span></label>' +
        '<textarea id="storyBody" name="body" maxlength="1000" rows="3" placeholder="Adicione um texto"></textarea>' +
        '<label class="story-media-label" for="storyMedia">Foto ou vídeo <span>(opcional, até 100 MB)</span></label>' +
        '<input id="storyMedia" name="media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm">' +
        '<div class="story-media-preview" data-story-preview aria-live="polite"></div>' +
        '<label for="storyVisibility">Quem pode ver?</label>' +
        '<select id="storyVisibility" name="visibility"><option value="public">Todos os membros</option><option value="selected">Pessoas escolhidas</option><option value="private">Só você</option></select>' +
        '<div class="story-recipient-picker" data-story-recipient-picker hidden>' +
          '<label for="storyRecipients">Pessoas escolhidas</label>' +
          '<select id="storyRecipients" name="recipientIds" multiple size="4" ' + (eligiblePeople.length ? "" : "disabled") + ">" + recipientOptions + "</select>" +
          '<small>' + escapeHtml(peopleHint) + "</small>" +
        "</div>" +
        '<div class="story-form-actions"><button class="primary-button compact-button" type="submit">Publicar story</button>' +
        '<span class="form-status" data-story-create-status role="status" aria-live="polite"></span></div>' +
      "</form>" +
    "</dialog>" +
    '<dialog class="story-viewer-dialog" data-story-viewer aria-label="Visualizador de stories">' +
      '<div class="story-viewer-shell">' +
        '<div class="story-progress-list" data-story-progress-list></div>' +
        '<header class="story-viewer-header"><div class="story-viewer-author">' +
          '<span data-story-viewer-avatar></span><span><strong data-story-viewer-name></strong><time data-story-viewer-time></time></span>' +
        '</div><button class="icon-button" type="button" data-story-close aria-label="Fechar stories">×</button></header>' +
        '<div class="story-viewer-media" data-story-viewer-media></div>' +
        '<p class="story-viewer-caption" data-story-viewer-caption></p>' +
        '<div class="story-viewer-actions"><button class="text-button" type="button" data-story-prev>Anterior</button>' +
          '<button class="text-button" type="button" data-story-delete hidden>Excluir</button>' +
          '<button class="text-button" type="button" data-story-next>Próximo</button></div>' +
      "</div>" +
    "</dialog>" +
  "</section>";
}

function setFormStatus(form, message, isError = false) {
  const status = form?.querySelector("[data-story-create-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = isError ? "error" : "success";
}

function activeStoriesFor(group) {
  return (group?.stories || []).filter((story) => Date.parse(story.expires_at) > Date.now());
}

function cleanupExpiredStories(client) {
  if (!client?.functions?.invoke) return;
  void client.functions.invoke("looply-stories-cleanup", { body: {} }).then(({ error }) => {
    if (error) console.warn("Looply story cleanup will retry on a later visit.", error);
  }).catch((error) => console.warn("Looply story cleanup request failed.", error));
}

export function bindStories(root, client, userId, initialStories = [], initialError = null, profile = null) {
  const list = root.querySelector("[data-story-list]");
  const status = root.querySelector("[data-story-feed-status]");
  const createDialog = root.querySelector("[data-story-create-dialog]");
  const viewer = root.querySelector("[data-story-viewer]");
  if (!list || !viewer || !createDialog) return;

  const state = { groups: groupActiveStories(initialStories), active: null, index: 0, timer: null, previewUrl: null };
  const showStatus = (message, isError = false) => {
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = isError ? "error" : "info";
  };
  const renderList = () => {
    list.innerHTML = storyListMarkup(state.groups, userId, profile);
    if (!state.groups.length) showStatus("Nenhum story ativo.");
    else showStatus("");
  };
  const clearTimer = () => {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  };
  const setProgressDuration = (duration) => {
    const activeProgress = viewer.querySelector(".story-progress-item.is-current i");
    if (activeProgress) {
      activeProgress.style.animationDuration = duration + "ms";
      activeProgress.style.animationPlayState = "running";
    }
  };
  const advance = (direction = 1) => {
    if (!state.active) return;
    clearTimer();
    const activeStories = activeStoriesFor(state.active);
    state.active.stories = activeStories;
    if (!activeStories.length) {
      viewer.close();
      return;
    }
    state.index += direction;
    if (state.index < 0) state.index = 0;
    if (state.index >= activeStories.length) {
      viewer.close();
      void refresh();
      cleanupExpiredStories(client);
      return;
    }
    renderSlide();
  };
  const renderSlide = () => {
    clearTimer();
    if (!state.active) return;
    const stories = activeStoriesFor(state.active);
    state.active.stories = stories;
    if (!stories.length || state.index >= stories.length) {
      viewer.close();
      void refresh();
      return;
    }
    const story = stories[state.index];
    viewer.querySelector("[data-story-progress-list]").innerHTML = stories.map((item, index) =>
      '<span class="story-progress-item' + (index < state.index ? " is-done" : index === state.index ? " is-current" : "") + '">' +
        (index === state.index ? '<i></i>' : "") +
      "</span>"
    ).join("");
    const author = story.author || state.active.author || {};
    const media = Array.isArray(story.media) ? story.media[0] : story.media;
    const mediaUrl = rawSignedUrl(media?.signedUrl);
    viewer.querySelector("[data-story-viewer-name]").textContent = profileName(author);
    viewer.querySelector("[data-story-viewer-time]").textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(story.created_at));
    const avatarHost = viewer.querySelector("[data-story-viewer-avatar]");
    avatarHost.innerHTML = storyAvatar(author, "", false);
    const caption = viewer.querySelector("[data-story-viewer-caption]");
    caption.textContent = story.body || "";
    const mediaHost = viewer.querySelector("[data-story-viewer-media]");
    mediaHost.replaceChildren();
    if (mediaUrl) {
      if (media.kind === "video") {
        const video = document.createElement("video");
        video.src = mediaUrl;
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.setAttribute("aria-label", media.alt_text || "Vídeo do story");
        video.addEventListener("loadedmetadata", () => {
          if (Number.isFinite(video.duration) && video.duration > 0) setProgressDuration(video.duration * 1000);
        }, { once: true });
        video.addEventListener("play", () => {
          clearTimer();
          if (Number.isFinite(video.duration) && video.duration > 0) {
            const remaining = Math.max(1000, (video.duration - video.currentTime) * 1000);
            setProgressDuration(remaining);
            state.timer = setTimeout(() => advance(1), remaining);
          }
        });
        video.addEventListener("pause", clearTimer);
        video.addEventListener("ended", () => advance(1), { once: true });
        mediaHost.append(video);
      } else {
        const image = document.createElement("img");
        image.src = mediaUrl;
        image.alt = media.alt_text || "Foto do story";
        image.referrerPolicy = "no-referrer";
        mediaHost.append(image);
        setProgressDuration(7000);
        state.timer = setTimeout(() => advance(1), 7000);
      }
    } else if (!story.body) {
      const missing = document.createElement("p");
      missing.className = "story-media-unavailable";
      missing.textContent = "Mídia temporariamente indisponível.";
      mediaHost.append(missing);
    } else {
      setProgressDuration(7000);
      state.timer = setTimeout(() => advance(1), 7000);
    }

    viewer.querySelector("[data-story-prev]").disabled = state.index === 0;
    viewer.querySelector("[data-story-delete]").hidden = story.author_id !== userId;
  };
  const refresh = async () => {
    try {
      state.groups = groupActiveStories(await loadStories(client));
      renderList();
      if (state.active) {
        const replacement = state.groups.find((group) => group.author_id === state.active.author_id);
        if (replacement) state.active = replacement;
        else {
          state.active = null;
          if (viewer.open) viewer.close();
        }
      }
      scheduleNextExpiry();
      return true;
    } catch (error) {
      console.error("Looply stories refresh failed.", error);
      showStatus("Não foi possível atualizar os stories.", true);
      return false;
    }
  };
  const scheduleNextExpiry = () => {
    clearTimeout(root.__looplyStoryExpiryTimer);
    root.__looplyStoryExpiryTimer = null;
    const expirations = state.groups.flatMap((group) => group.stories.map((story) => Date.parse(story.expires_at)))
      .filter((expiry) => Number.isFinite(expiry) && expiry > Date.now());
    if (!expirations.length) {
      root.__looplyStoryExpiryTimer = null;
      return;
    }
    const delay = Math.min(Math.max(1000, Math.min(...expirations) - Date.now() + 100), 2147483647);
    root.__looplyStoryExpiryTimer = setTimeout(() => {
      root.__looplyStoryExpiryTimer = null;
      cleanupExpiredStories(client);
      void refresh();
    }, delay);
  };
  renderList();
  scheduleNextExpiry();
  root.__looplyStoryStop = clearTimer;
  refreshers.set(root, refresh);
  cleanupExpiredStories(client);

  root.addEventListener("change", (event) => {
    if (event.target.matches("#storyVisibility")) {
      const picker = root.querySelector("[data-story-recipient-picker]");
      if (picker) picker.hidden = event.target.value !== "selected";
    }
    if (event.target.matches("#storyMedia")) {
      const preview = root.querySelector("[data-story-preview]");
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = null;
      preview?.replaceChildren();
      const file = event.target.files?.[0];
      if (!file || !preview) return;
      if (!storyMimeTypes.has(file.type) || file.size > maxStoryBytes) {
        preview.textContent = "Use uma imagem JPEG, PNG ou WebP, ou um vídeo MP4 ou WebM de até 100 MB.";
        return;
      }
      state.previewUrl = URL.createObjectURL(file);
      const item = document.createElement(file.type.startsWith("video/") ? "video" : "img");
      item.src = state.previewUrl;
      if (item instanceof HTMLVideoElement) item.controls = true;
      else item.alt = "Prévia do story";
      preview.append(item);
    }
  });

  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-story-create-open]")) {
      createDialog.showModal();
      return;
    }
    if (event.target.closest("[data-story-create-close]")) {
      createDialog.close();
      return;
    }
    if (event.target.closest("[data-story-refresh]")) {
      showStatus("Atualizando stories…");
      await refresh();
      scheduleNextExpiry();
      return;
    }
    const storyButton = event.target.closest("[data-story-open]");
    if (storyButton) {
      showStatus("Carregando story…");
      if (!await refresh()) return;
      const group = state.groups.find((item) => item.author_id === storyButton.dataset.storyOpen);
      if (!group) return;
      state.active = { ...group, stories: activeStoriesFor(group) };
      state.index = 0;
      renderSlide();
      viewer.showModal();
      return;
    }
    if (event.target.closest("[data-story-close]")) {
      viewer.close();
      return;
    }
    if (event.target.closest("[data-story-prev]")) {
      advance(-1);
      return;
    }
    if (event.target.closest("[data-story-next]")) {
      advance(1);
      return;
    }
    if (event.target.closest("[data-story-delete]")) {
      const current = state.active?.stories?.[state.index];
      if (!current || current.author_id !== userId) return;
      const button = viewer.querySelector("[data-story-delete]");
      button.disabled = true;
      try {
        const paths = (Array.isArray(current.media) ? current.media : current.media ? [current.media] : [])
          .map((item) => item.storage_path).filter(Boolean);
        if (paths.length) {
          const { error } = await client.storage.from("looply-media").remove(paths);
          if (error) throw error;
        }
        const { error } = await client.from("stories").delete().eq("id", current.id).eq("author_id", userId);
        if (error) throw error;
        viewer.close();
        await refresh();
        scheduleNextExpiry();
      } catch (error) {
        console.error("Looply story deletion failed.", error);
        showStatus("Não foi possível excluir o story. Ele continua salvo.", true);
      } finally {
        button.disabled = false;
      }
    }
  });

  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) viewer.close();
  });
  viewer.addEventListener("close", () => {
    clearTimer();
    viewer.querySelectorAll("video").forEach((video) => { video.pause(); video.removeAttribute("src"); });
  });
  createDialog.addEventListener("close", () => {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
    root.querySelector("[data-story-preview]")?.replaceChildren();
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-story-create]");
    if (!form) return;
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    let storyId = null;
    let uploadedPath = null;
    try {
      const formData = new FormData(form);
      const body = String(formData.get("body") || "").trim().slice(0, 1000);
      const file = formData.get("media");
      const media = file instanceof File && file.size ? file : null;
      const visibility = String(formData.get("visibility") || "public");
      const recipientIds = [...new Set(formData.getAll("recipientIds").map(String))];
      if (media && (!storyMimeTypes.has(media.type) || media.size > maxStoryBytes)) throw new Error("invalid_media");
      if (!body && !media) throw new Error("empty_story");
      if (visibility === "selected" && (recipientIds.length < 1 || recipientIds.length > 20)) throw new Error("invalid_recipients");

      setFormStatus(form, "Salvando story…");
      const { data, error } = await client.from("stories")
        .insert({ author_id: userId, body, visibility })
        .select("id").single();
      if (error) throw error;
      storyId = data.id;

      if (visibility === "selected") {
        const { error: recipientsError } = await client.from("story_recipients").insert(
          recipientIds.map((recipientId) => ({ story_id: storyId, recipient_id: recipientId }))
        );
        if (recipientsError) throw recipientsError;
      }

      if (media) {
        const extension = storyMimeTypes.get(media.type);
        uploadedPath = "stories/" + storyId + "/" + crypto.randomUUID() + "." + extension;
        await uploadResumable(client, uploadedPath, media, (percent) => setFormStatus(form, "Enviando mídia: " + percent + "%"));
        const { error: mediaError } = await client.from("story_media").insert({
          story_id: storyId,
          storage_path: uploadedPath,
          kind: media.type.startsWith("video/") ? "video" : "image",
          mime_type: media.type,
          byte_size: media.size,
          alt_text: ""
        });
        if (mediaError) throw mediaError;
      }

      form.reset();
      createDialog.close();
      await refresh();
      showStatus("Story publicado. Ele expira após 24 horas.");
    } catch (error) {
      console.error("Looply story creation failed.", error);
      if (uploadedPath) await client.storage.from("looply-media").remove([uploadedPath]).catch(() => {});
      if (storyId) await client.from("stories").delete().eq("id", storyId).eq("author_id", userId);
      const message = error?.message === "empty_story" ? "Adicione um texto ou uma mídia."
        : error?.message === "invalid_media" ? "O arquivo precisa ser uma imagem JPEG/PNG/WebP ou vídeo MP4/WebM de até 100 MB."
          : error?.message === "invalid_recipients" ? "Escolha de 1 a 20 pessoas para este story."
            : "Não foi possível publicar o story. Confira a conexão e tente novamente.";
      setFormStatus(form, message, true);
    } finally {
      submit.disabled = false;
    }
  });
}

export function setupStoriesRealtime(client, userId, root) {
  const refresh = refreshers.get(root);
  if (!client || !refresh) return;
  const scheduleRefresh = () => {
    clearTimeout(storyRefreshTimer);
    storyRefreshTimer = setTimeout(() => {
      storyRefreshTimer = null;
      void refresh();
    }, 350);
  };
  storiesChannel = client.channel("looply-stories-" + userId)
    .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "story_media" }, scheduleRefresh)
    .subscribe((status) => {
      const state = root.querySelector("[data-story-feed-status]");
      if (state && status === "SUBSCRIBED") state.textContent = state.textContent || "Atualizações em tempo real ativas.";
    });
}

export function disposeStoriesRealtime(client, root) {
  clearTimeout(storyRefreshTimer);
  storyRefreshTimer = null;
  if (storiesChannel && client) void client.removeChannel(storiesChannel);
  storiesChannel = null;
  if (root) {
    refreshers.delete(root);
    if (root.__looplyStoryExpiryTimer) clearTimeout(root.__looplyStoryExpiryTimer);
    root.__looplyStoryExpiryTimer = null;
    root.__looplyStoryStop?.();
    delete root.__looplyStoryStop;
  }
}
