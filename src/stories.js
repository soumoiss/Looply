import { icon } from "./icons.js";
import { cachedSignedUrls, cachedSignedUrl } from "./storage-url-cache.js";
import { invokeAdminAction } from "./admin.js";
import { decodeStoryBody } from "./story-text-style.js";
import { storyStudioMarkup, bindStoryStudio } from "./story-studio.js";

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

function openStoryDialog(dialog) {
  if (!dialog) return false;
  if (dialog.open) return true;
  try {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      return true;
    }
  } catch (error) {
    console.warn("Looply story dialog could not enter the modal layer.", error);
  }
  // Fallback for embedded/mobile browsers with incomplete <dialog> support.
  dialog.setAttribute("open", "");
  dialog.classList.add("story-dialog-fallback-open");
  return true;
}

function closeStoryDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
    return;
  }
  dialog.removeAttribute("open");
  dialog.classList.remove("story-dialog-fallback-open");
  dialog.dispatchEvent(new Event("close"));
}

function profileName(profile) {
  return String(profile?.display_name || profile?.username || "Membro");
}

function storyTimeLabels(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { relative: "agora", exact: "" };
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"], [Number.POSITIVE_INFINITY, "year"]];
  let amount = seconds;
  let unit = "second";
  for (const [limit, currentUnit] of units) {
    unit = currentUnit;
    if (Math.abs(amount) < limit) break;
    amount = Math.round(amount / limit);
  }
  const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto", style: "short" }).format(amount, unit);
  const exact = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  return { relative, exact };
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
    .order("id", { ascending: true })
    .range(0, 499);
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
    const storage = client.storage.from("looply-media");
    const { data: signed, error: signedError } = await cachedSignedUrls(client, "looply-media", items.map((item) => item.storage_path), ttl);
    await Promise.all(items.map(async (item, index) => {
      item.signedUrl = !signedError ? signed?.[index]?.signedUrl || null : null;
      if (item.signedUrl) return;
      // Some Storage responses fail per-object while the batch request itself succeeds.
      // Retry the individual path so one malformed item cannot blank every story in the group.
      const remainingTtl = storyMediaUrlTtl(item.storyExpiresAt, Date.now());
      if (!remainingTtl) return;
      const single = await cachedSignedUrl(client, "looply-media", item.storage_path, remainingTtl);
      if (single.error) {
        console.warn("Looply story media URL could not be signed.", {
          storyId: item.storyId,
          errorCode: single.error.statusCode || single.error.name || "storage-sign-failed"
        });
        return;
      }
      item.signedUrl = single.data?.signedUrl || null;
    }));
  }));

  const avatarPaths = [...new Set(rows.map((story) => story.author?.avatar_path).filter(Boolean))];
  const avatarUrls = new Map();
  if (avatarPaths.length) {
    const { data: signed, error: signedError } = await cachedSignedUrls(client, "looply-avatars", avatarPaths, 1800);
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
  return '<section class="story-area" id="stories" aria-labelledby="storyAreaTitle">' +
    '<div class="story-area-heading"><div><span class="section-kicker">Stories</span><h2 id="storyAreaTitle">Stories</h2></div>' +
    '<button class="text-button" type="button" data-story-create-open>Adicionar story</button></div>' +
    '<div class="story-list" data-story-list aria-label="Stories ativos">' +
      storyListMarkup(groups, userId, profile) +
    "</div><p class=\"story-feed-status\" data-story-feed-status role=\"status\">" +
      (error
        ? 'Não foi possível carregar os stories. <button type="button" class="text-button" data-story-refresh>Tentar novamente</button>'
        : groups.length ? "" : "Nenhum story ativo.") +
    "</p>" +
    storyStudioMarkup(recipientOptions) +
    '<dialog class="story-viewer-dialog" data-story-viewer aria-label="Visualizador de stories">' +
      '<div class="story-viewer-shell">' +
        '<div class="story-progress-list" data-story-progress-list></div>' +
        '<header class="story-viewer-header"><div class="story-viewer-author">' +
          '<span data-story-viewer-avatar></span><span><strong data-story-viewer-name></strong><time data-story-viewer-time></time></span>' +
        '</div><button class="icon-button" type="button" data-story-close aria-label="Fechar stories">' + icon("close") + '</button></header>' +
        '<div class="story-viewer-stage" data-story-touch-surface>' +
          '<button class="story-tap-zone story-tap-zone-prev" type="button" data-story-prev aria-label="Story anterior"></button>' +
          '<div class="story-viewer-media" data-story-viewer-media></div>' +
          '<button class="story-tap-zone story-tap-zone-next" type="button" data-story-next aria-label="Próximo story"></button>' +
          '<button class="story-play-toggle" type="button" data-story-play-toggle aria-label="Pausar story" aria-pressed="false">' + icon("pause") + '</button>' +
        '</div>' +
        '<p class="story-viewer-caption" data-story-viewer-caption></p>' +
        '<footer class="story-viewer-actions">' +
          '<div class="story-viewer-owner-actions" data-story-owner-actions hidden>' +
            '<button class="story-insights-button" type="button" data-story-insights-open>◉ <span data-story-view-count>Ver visualizações</span></button>' +
            '<button class="story-delete-button" type="button" data-story-delete>Excluir</button>' +
          '</div>' +
          '<div class="story-viewer-reply-actions" data-story-reply-actions hidden>' +
            '<button class="story-like-button" type="button" data-story-like aria-pressed="false"><span aria-hidden="true">♡</span><span data-story-like-label>Curtir</span></button>' +
            '<form class="story-reply-form" data-story-reply><label class="visually-hidden" for="storyReplyMessage">Responder em particular</label>' +
              '<input id="storyReplyMessage" name="reply" maxlength="2000" placeholder="Responder em particular…" autocomplete="off" required>' +
              '<button type="submit" aria-label="Enviar resposta">➤</button></form>' +
            '<span class="story-reply-status" data-story-reply-status role="status" aria-live="polite"></span>' +
          '</div>' +
        '</footer>' +
        '<section class="story-insights-panel" data-story-insights-panel hidden aria-label="Visualizações do story">' +
          '<header><strong>Atividade do story</strong><button type="button" class="icon-button" data-story-insights-close aria-label="Fechar atividade">' + icon("close") + '</button></header>' +
          '<p data-story-insights-summary>Carregando visualizações…</p><ul data-story-insights-list></ul>' +
        '</section>' +
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

export function bindStories(root, client, userId, initialStories = [], initialError = null, profile = null, isAdmin = false) {
  const list = root.querySelector("[data-story-list]");
  const status = root.querySelector("[data-story-feed-status]");
  const createDialog = root.querySelector("[data-story-create-dialog]");
  const viewer = root.querySelector("[data-story-viewer]");
  if (viewer) viewer.dataset.admin = isAdmin ? "true" : "false";
  if (!list || !viewer || !createDialog) return;

  const state = {
    groups: groupActiveStories(initialStories), active: null, index: 0, timer: null,
    viewedThisSession: new Set(), likedStories: new Set(), likePending: new Set(), ignoreTapUntil: 0, paused: false
  };
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
  const resumeStoryTimer = () => {
    if (state.paused || !viewer.open) return;
    const mediaHost = viewer.querySelector("[data-story-viewer-media]");
    const video = mediaHost.querySelector("video");
    if (video && !video.paused && Number.isFinite(video.duration)) {
      const remaining = Math.max(1000, (video.duration - video.currentTime) * 1000);
      setProgressDuration(remaining);
      state.timer = setTimeout(() => advance(1), remaining);
    } else if (!video) {
      setProgressDuration(7000);
      state.timer = setTimeout(() => advance(1), 7000);
    }
  };
  const setStoryPaused = (paused) => {
    state.paused = Boolean(paused);
    const mediaHost = viewer.querySelector("[data-story-viewer-media]");
    const video = mediaHost.querySelector("video");
    const audio = viewer.querySelector("#story-audio");
    const button = viewer.querySelector("[data-story-play-toggle]");
    const progress = viewer.querySelector(".story-progress-item.is-current i");
    if (state.paused) {
      clearTimer();
      if (video && !video.paused) video.pause();
      if (audio && !audio.paused) audio.pause();
      if (progress) progress.style.animationPlayState = "paused";
    } else {
      if (progress) progress.style.animationPlayState = "running";
      if (video && video.paused) void video.play().catch(() => {});
      if (audio && audio.paused) void audio.play().catch(() => {});
      else resumeStoryTimer();
    }
    if (button) {
      button.setAttribute("aria-pressed", state.paused ? "true" : "false");
      button.setAttribute("aria-label", state.paused ? "Reproduzir story" : "Pausar story");
      button.innerHTML = icon(state.paused ? "play" : "pause");
    }
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
    const groupIndex = state.groups.findIndex((group) => group.author_id === state.active?.author_id);
    if (groupIndex < 0) return;
    let targetGroupIndex = groupIndex;
    let targetIndex = state.index + direction;
    let targetStories = activeStoriesFor(state.groups[targetGroupIndex]);
    while (targetIndex < 0 || targetIndex >= targetStories.length) {
      targetGroupIndex += direction;
      if (targetGroupIndex < 0 || targetGroupIndex >= state.groups.length) {
        if (direction > 0) {
          closeStoryDialog(viewer);
          void refresh();
          cleanupExpiredStories(client);
        }
        return;
      }
      targetStories = activeStoriesFor(state.groups[targetGroupIndex]);
      targetIndex = direction > 0 ? 0 : targetStories.length - 1;
      if (!targetStories.length) continue;
    }
    state.active = { ...state.groups[targetGroupIndex], stories: targetStories };
    state.index = targetIndex;
    renderSlide();
  };
  const renderSlide = () => {
    clearTimer();
    const previousAudio = viewer.querySelector("#story-audio");
    if (previousAudio) { previousAudio.pause(); previousAudio.currentTime = 0; }
    if (!state.active) return;
    const stories = activeStoriesFor(state.active);
    state.active.stories = stories;
    if (!stories.length || state.index >= stories.length) {
      closeStoryDialog(viewer);
      void refresh();
      return;
    }
    const story = stories[state.index];
    if (!story) return;
    state.paused = false;
    const playToggle = viewer.querySelector("[data-story-play-toggle]");
    if (playToggle) {
      playToggle.setAttribute("aria-pressed", "false");
      playToggle.setAttribute("aria-label", "Pausar story");
      playToggle.innerHTML = icon("pause");
    }
    viewer.querySelector("[data-story-progress-list]").innerHTML = stories.map((item, index) =>
      '<span class="story-progress-item' + (index < state.index ? " is-done" : index === state.index ? " is-current" : "") + '">' +
        (index === state.index ? '<i></i>' : "") +
      "</span>"
    ).join("");
    const author = story.author || state.active.author || {};
    const media = Array.isArray(story.media) ? story.media[0] : story.media;
    const mediaUrl = rawSignedUrl(media?.signedUrl);
    viewer.classList.toggle("story-viewer-text-only", !media && Boolean(String(story.body || "").trim()));
    viewer.querySelector("[data-story-viewer-name]").textContent = profileName(author);
    const storyTime = viewer.querySelector("[data-story-viewer-time]");
    const timeLabels = storyTimeLabels(story.created_at);
    storyTime.textContent = timeLabels.exact ? `${timeLabels.relative} · ${timeLabels.exact}` : timeLabels.relative;
    storyTime.dateTime = story.created_at;
    storyTime.title = timeLabels.exact ? "Publicado em " + timeLabels.exact : "";
    storyTime.setAttribute("aria-label", timeLabels.exact ? "Publicado em " + timeLabels.exact : "Publicado agora");
    const avatarHost = viewer.querySelector("[data-story-viewer-avatar]");
    avatarHost.innerHTML = storyAvatar(author, "", false);
    const caption = viewer.querySelector("[data-story-viewer-caption]");
    const storyText = decodeStoryBody(story.body || "");
    caption.textContent = storyText.text;
    caption.style.fontFamily = !media && storyText.styled ? storyText.fontFamily : "";
    caption.style.fontSize = !media && storyText.styled ? `${storyText.size}pt` : "";
    const oldMusic = viewer.querySelector("[data-story-viewer-music]");
    oldMusic?.remove();
    if (storyText.music?.previewUrl) {
      const music = document.createElement("audio");
      music.id = "story-audio";
      music.dataset.storyViewerMusic = "";
      music.className = "story-viewer-music-hidden";
      music.preload = "auto";
      music.autoplay = true;
      music.loop = true;
      music.src = storyText.music.previewUrl;
      music.addEventListener("error", () => { music.dataset.playback = "unavailable"; }, { once: true });
      viewer.querySelector("[data-story-touch-surface]").append(music);
      void music.play().catch(() => { music.dataset.playback = "gesture-required"; });
    }
    const mediaHost = viewer.querySelector("[data-story-viewer-media]");
    mediaHost.querySelectorAll("video").forEach((video) => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
    mediaHost.replaceChildren();
    if (mediaUrl) {
      if (media.kind === "video") {
        const video = document.createElement("video");
        video.src = mediaUrl;
        video.controls = false;
        video.autoplay = true;
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
    } else if (media) {
      const missing = document.createElement("div");
      missing.className = "story-media-unavailable";
      const message = document.createElement("p");
      message.textContent = "Não foi possível carregar a mídia deste story.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "text-button";
      retry.dataset.storyMediaRetry = "";
      retry.textContent = "Tentar carregar novamente";
      missing.append(message, retry);
      mediaHost.append(missing);
    } else if (story.body) {
      setProgressDuration(7000);
      state.timer = setTimeout(() => advance(1), 7000);
    }

    const currentGroupIndex = state.groups.findIndex((group) => group.author_id === story.author_id);
    viewer.querySelector("[data-story-prev]").disabled = state.index === 0 && currentGroupIndex <= 0;
    const canDelete = story.author_id === userId || isAdmin;
    viewer.querySelector("[data-story-delete]").hidden = !canDelete;
    viewer.querySelector("[data-story-delete]").textContent = story.author_id === userId ? "Excluir" : "Excluir como ADM";
    viewer.querySelector("[data-story-owner-actions]").hidden = !(story.author_id === userId || isAdmin);
    const insightsButton = viewer.querySelector("[data-story-insights-open]");
    if (insightsButton) insightsButton.setAttribute("aria-label", isAdmin && story.author_id !== userId ? "Ver visualizações do story do membro" : "Ver visualizações");
    viewer.querySelector("[data-story-reply-actions]").hidden = story.author_id === userId;
    viewer.querySelector("[data-story-insights-panel]").hidden = true;
    const replyStatus = viewer.querySelector("[data-story-reply-status]");
    if (replyStatus) replyStatus.textContent = "";
    const likeButton = viewer.querySelector("[data-story-like]");
    likeButton.dataset.storyId = story.id;
    likeButton.disabled = false;
    likeButton.setAttribute("aria-pressed", state.likedStories.has(story.id) ? "true" : "false");
    viewer.querySelector("[data-story-like-label]").textContent = state.likedStories.has(story.id) ? "Curtido" : "Curtir";
    const likeIcon = likeButton.querySelector("[aria-hidden]");
    if (likeIcon) likeIcon.textContent = state.likedStories.has(story.id) ? "♥" : "♡";
    const replyInput = viewer.querySelector("[data-story-reply] input");
    if (replyInput) replyInput.value = "";
    if (story.author_id !== userId && !state.viewedThisSession.has(story.id)) {
      state.viewedThisSession.add(story.id);
      void client.rpc("record_story_view", { p_story_id: story.id }).then(({ error }) => {
        if (error) console.warn("Looply story view could not be recorded.", error);
      }).catch((error) => console.warn("Looply story view could not be recorded.", error));
    }
    if (story.author_id === userId || isAdmin) {
      const viewCount = viewer.querySelector("[data-story-view-count]");
      viewCount.textContent = "Carregando visualizações…";
      void client.from("story_views").select("viewer_id", { count: "exact", head: true }).eq("story_id", story.id)
        .then(({ count, error }) => {
          if (!error && state.active?.stories?.[state.index]?.id === story.id) {
            viewCount.textContent = count === 1 ? "1 visualização" : `${count || 0} visualizações`;
          }
        });
    }
    if (story.author_id !== userId) {
      const storyId = story.id;
      void client.from("story_likes").select("story_id").eq("story_id", storyId).eq("user_id", userId).maybeSingle()
        .then(({ data, error }) => {
          if (error || state.likePending.has(storyId)) return;
          if (data) state.likedStories.add(storyId);
          else state.likedStories.delete(storyId);
          if (state.active?.stories?.[state.index]?.id === storyId) {
            likeButton.setAttribute("aria-pressed", data ? "true" : "false");
            viewer.querySelector("[data-story-like-label]").textContent = data ? "Curtido" : "Curtir";
            if (likeIcon) likeIcon.textContent = data ? "♥" : "♡";
          }
        });
    }
  };
  const currentStory = () => state.active?.stories?.[state.index] || null;
  const loadStoryInsights = async (story) => {
    const panel = viewer.querySelector("[data-story-insights-panel]");
    const summary = viewer.querySelector("[data-story-insights-summary]");
    const list = viewer.querySelector("[data-story-insights-list]");
    panel.hidden = false;
    summary.textContent = "Carregando visualizações…";
    list.replaceChildren();
    clearTimer();
    try {
      const { data, error } = await client.from("story_views")
        .select("viewed_at,viewer:profiles!story_views_viewer_id_fkey(username,display_name,avatar_path)")
        .eq("story_id", story.id).order("viewed_at", { ascending: false }).limit(500);
      if (error) throw error;
      const views = data || [];
      const avatarPaths = [...new Set(views.map((view) => view.viewer?.avatar_path).filter(Boolean))];
      const avatarUrls = new Map();
      if (avatarPaths.length) {
        const { data: signedAvatars, error: avatarError } = await cachedSignedUrls(client, "looply-avatars", avatarPaths, 1800);
        if (!avatarError) avatarPaths.forEach((path, index) => {
          const url = signedAvatars?.[index]?.signedUrl;
          if (url) avatarUrls.set(path, url);
        });
      }
      summary.textContent = views.length === 1 ? "1 pessoa viu este story." : `${views.length} pessoas viram este story.`;
      if (!views.length) {
        const empty = document.createElement("li");
        empty.className = "story-insights-empty";
        empty.textContent = "As visualizações aparecerão aqui.";
        list.append(empty);
      }
      for (const view of views) {
        const item = document.createElement("li");
        const avatar = document.createElement("span");
        avatar.className = "story-insights-avatar";
        const avatarUrl = avatarUrls.get(view.viewer?.avatar_path);
        if (avatarUrl) {
          const image = document.createElement("img");
          image.src = avatarUrl;
          image.alt = "";
          image.loading = "lazy";
          image.referrerPolicy = "no-referrer";
          avatar.append(image);
        } else {
          avatar.textContent = initials(profileName(view.viewer));
          avatar.setAttribute("aria-hidden", "true");
        }
        const person = document.createElement("span");
        person.className = "story-insights-person";
        const name = document.createElement("strong");
        const username = document.createElement("small");
        const viewedAt = document.createElement("time");
        const exactTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(view.viewed_at));
        name.textContent = profileName(view.viewer);
        username.textContent = "@" + String(view.viewer?.username || "membro");
        viewedAt.dateTime = view.viewed_at;
        viewedAt.textContent = exactTime;
        person.append(name, username);
        item.append(avatar, person, viewedAt);
        list.append(item);
      }
    } catch (error) {
      console.error("Looply story insights could not load.", error);
      summary.textContent = "Não foi possível carregar as visualizações agora.";
    }
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
          if (viewer.open) closeStoryDialog(viewer);
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
  root.__looplyStoryClose = () => { if (viewer.open) closeStoryDialog(viewer); };
  root.__looplyRefreshStoryInsights = () => {
    const story = currentStory();
    if (story && (story.author_id === userId || isAdmin) && !viewer.querySelector("[data-story-insights-panel]").hidden) {
      void loadStoryInsights(story);
    }
  };
  refreshers.set(root, refresh);
  root.__looplyStudioStop = bindStoryStudio(root, client, userId, refresh);
  cleanupExpiredStories(client);

  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-story-refresh]")) {
      showStatus("Atualizando stories…");
      await refresh();
      scheduleNextExpiry();
      return;
    }
    const storyButton = event.target.closest("[data-story-open]");
    if (storyButton) {
      const authorId = storyButton.dataset.storyOpen;
      let group = state.groups.find((item) => item.author_id === authorId);
      let activeStories = group ? activeStoriesFor(group) : [];
      if (!activeStories.length) {
        await refresh();
        group = state.groups.find((item) => item.author_id === authorId);
        activeStories = group ? activeStoriesFor(group) : [];
      }
      if (!group || !activeStories.length) {
        showStatus("Este story não está mais disponível. A lista foi atualizada.");
        return;
      }
      state.active = { ...group, stories: activeStories };
      state.index = 0;
      renderSlide();
      openStoryDialog(viewer);
      return;
    }
    if (event.target.closest("[data-story-media-retry]")) {
      const current = currentStory();
      if (!current) return;
      try {
        showStatus("Carregando mídia do story…");
        const refreshed = await loadStories(client);
        state.groups = groupActiveStories(refreshed);
        const group = state.groups.find((item) => item.author_id === current.author_id);
        const nextStory = group?.stories.find((item) => item.id === current.id);
        if (!nextStory) throw new Error("story-not-found");
        state.active = { ...group, stories: activeStoriesFor(group) };
        state.index = state.active.stories.findIndex((item) => item.id === current.id);
        renderSlide();
        showStatus("");
      } catch (error) {
        console.warn("Looply story media retry failed.", error);
        showStatus("A mídia continua indisponível. Verifique sua conexão e tente novamente.", true);
      }
      return;
    }
    if (event.target.closest("[data-story-close]")) {
      closeStoryDialog(viewer);
      return;
    }
    if (event.target.closest("[data-story-prev]")) {
      if (Date.now() < state.ignoreTapUntil) return;
      advance(-1);
      return;
    }
    if (event.target.closest("[data-story-next]")) {
      if (Date.now() < state.ignoreTapUntil) return;
      advance(1);
      return;
    }
    if (event.target.closest("[data-story-play-toggle]")) {
      setStoryPaused(!state.paused);
      return;
    }
    if (event.target.closest("[data-story-like]")) {
      const story = currentStory();
      const button = viewer.querySelector("[data-story-like]");
      if (!story || story.author_id === userId || state.likePending.has(story.id)) return;
      const isLiked = state.likedStories.has(story.id);
      state.likePending.add(story.id);
      button.disabled = true;
      try {
        const result = isLiked
          ? await client.from("story_likes").delete().eq("story_id", story.id).eq("user_id", userId)
          : await client.from("story_likes").insert({ story_id: story.id, user_id: userId });
        if (result.error) throw result.error;
        if (isLiked) state.likedStories.delete(story.id);
        else state.likedStories.add(story.id);
        button.setAttribute("aria-pressed", isLiked ? "false" : "true");
        viewer.querySelector("[data-story-like-label]").textContent = isLiked ? "Curtir" : "Curtido";
        const icon = button.querySelector("[aria-hidden]");
        if (icon) icon.textContent = isLiked ? "♡" : "♥";
      } catch (error) {
        console.error("Looply story reaction failed.", error);
        const status = viewer.querySelector("[data-story-reply-status]");
        status.textContent = "Não foi possível registrar sua curtida. Tente novamente.";
      } finally {
        state.likePending.delete(story.id);
        button.disabled = false;
      }
      return;
    }
    if (event.target.closest("[data-story-insights-open]")) {
      const story = currentStory();
      if (story && (story.author_id === userId || isAdmin)) await loadStoryInsights(story);
      return;
    }
    if (event.target.closest("[data-story-insights-close]")) {
      viewer.querySelector("[data-story-insights-panel]").hidden = true;
      const story = currentStory();
      const media = Array.isArray(story?.media) ? story.media[0] : story?.media;
      if (!media || media.kind !== "video") {
        setProgressDuration(7000);
        state.timer = setTimeout(() => advance(1), 7000);
      }
      return;
    }
    if (event.target.closest("[data-story-delete]")) {
      const current = state.active?.stories?.[state.index];
      if (!current || (current.author_id !== userId && !isAdmin)) return;
      const button = viewer.querySelector("[data-story-delete]");
      button.disabled = true;
      try {
        if (isAdmin && current.author_id !== userId) {
          const { data, error } = await invokeAdminAction(client, { action: "delete_content", contentType: "story", contentId: current.id, confirmDelete: true });
          if (error) throw error;
          if (data?.deleted !== true) throw new Error("admin_delete_not_confirmed");
        } else {
          const paths = (Array.isArray(current.media) ? current.media : current.media ? [current.media] : [])
            .map((item) => item.storage_path).filter(Boolean);
          if (paths.length) {
            const { error } = await client.storage.from("looply-media").remove(paths);
            if (error) throw error;
          }
          const { error } = await client.from("stories").delete().eq("id", current.id).eq("author_id", userId);
          if (error) throw error;
        }
        closeStoryDialog(viewer);
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
    if (event.target === viewer) closeStoryDialog(viewer);
  });
  const touchSurface = viewer.querySelector("[data-story-touch-surface]");
  let pointerStart = null;
  const replyForm = viewer.querySelector("[data-story-reply]");
  replyForm.addEventListener("focusin", clearTimer);
  replyForm.addEventListener("focusout", (event) => {
    if (!replyForm.contains(event.relatedTarget)) resumeStoryTimer();
  });
  touchSurface.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, form, [data-story-prev], [data-story-next]")) return;
    if (Date.now() < state.ignoreTapUntil) return;
    setStoryPaused(!state.paused);
  });
  touchSurface.addEventListener("pointerdown", (event) => {
    if (event.isPrimary && event.pointerType !== "mouse") pointerStart = { x: event.clientX, y: event.clientY };
  });
  touchSurface.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      state.ignoreTapUntil = Date.now() + 500;
      advance(deltaX < 0 ? 1 : -1);
    }
    else if (deltaY > 90) closeStoryDialog(viewer);
  });
  touchSurface.addEventListener("pointercancel", () => { pointerStart = null; });
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") { event.preventDefault(); advance(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); advance(-1); }
  });
  viewer.addEventListener("close", () => {
    clearTimer();
    const audio = viewer.querySelector("#story-audio");
    if (audio) { audio.pause(); audio.currentTime = 0; }
    viewer.querySelectorAll("video").forEach((video) => { video.pause(); video.removeAttribute("src"); });
  });
  root.addEventListener("submit", async (event) => {
    const replyForm = event.target.closest("form[data-story-reply]");
    if (replyForm) {
      event.preventDefault();
      const story = currentStory();
      const body = String(new FormData(replyForm).get("reply") || "").trim();
      const submit = replyForm.querySelector('button[type="submit"]');
      const replyStatus = viewer.querySelector("[data-story-reply-status]");
      if (!story || story.author_id === userId || !body) return;
      submit.disabled = true;
      replyStatus.textContent = "Enviando em particular…";
      try {
        const { data, error } = await client.rpc("send_story_reply", { p_story_id: story.id, p_body: body });
        if (error) throw error;
        const reply = Array.isArray(data) ? data[0] : data;
        if (!reply?.conversation_id) throw new Error("story_reply_unavailable");
        replyStatus.textContent = "Resposta enviada em particular. Abrindo conversa…";
        setTimeout(() => window.location.assign(`conversa.html?id=${encodeURIComponent(reply.conversation_id)}`), 650);
      } catch (error) {
        console.error("Looply story reply failed.", {
          code: error?.code || error?.cause?.code || "unknown",
          message: error?.message || "unknown"
        });
        const code = error?.code || error?.cause?.code || "";
        const message = String(error?.message || "");
        if (code === "42501") {
          replyStatus.textContent = "Não foi possível responder: o story pode ter expirado, não estar mais disponível para você ou o perfil não aceitar esta conversa.";
        } else if (code === "22023") {
          replyStatus.textContent = "Escreva uma resposta de até 2.000 caracteres.";
        } else if (code === "PGRST202" || /send_story_reply/i.test(message) && /schema cache|could not find/i.test(message)) {
          replyStatus.textContent = "O serviço de resposta ainda não está disponível. Atualize a página e tente novamente.";
        } else {
          replyStatus.textContent = "A resposta não foi enviada. Verifique a conexão e tente novamente; sua mensagem não foi marcada como enviada.";
        }
      } finally {
        submit.disabled = false;
      }
      return;
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
        root.__looplyRefreshStoryInsights?.();
    }, 350);
  };
  storiesChannel = client.channel("looply-stories-" + userId)
    .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "story_media" }, scheduleRefresh)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "story_views" }, () => root.__looplyRefreshStoryInsights?.())
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
    root.__looplyStudioStop?.();
    delete root.__looplyStudioStop;
    root.__looplyStoryClose?.();
    delete root.__looplyStoryClose;
    delete root.__looplyRefreshStoryInsights;
  }
}


