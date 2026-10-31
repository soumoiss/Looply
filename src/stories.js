import { decodeStorySong, encodeStorySong, appleStoryTrackId, resolveAppleStoryPreview } from "./story-music-catalog.js?v=story-music-official-widget-20261028";
import { startStoryMediaPlayback, stopStoryMediaPlayback } from "./story-viewer-playback.js?v=feed-media-audio-20261029";
import { icon } from "./icons.js";
import { cachedSignedUrls, cachedSignedUrl } from "./storage-url-cache.js";
import { invokeAdminAction } from "./admin.js";
import { decodeStoryBody } from "./story-text-style.js";
import { storyStudioMarkup, bindStoryStudio } from "./story-studio.js?v=story-publish-official-20261028";

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

export async function loadStories(client, viewerId = null) {
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
  // The server's own view receipts control ring state; private content is
  // never included in this lookup.
  const seen = new Set();
  if (viewerId && rows.length) {
    const ids = rows.map(item=>item.id);
    for(let index=0;index<ids.length;index+=75){
      const {data,error} = await client.from("story_views")
        .select("story_id").eq("viewer_id",viewerId)
        .in("story_id",ids.slice(index,index+75)).limit(200);
      if(!error)(data||[]).forEach(item=>seen.add(item.story_id));
      else console.warn("Story views unavailable",error?.code||"network");
    }
  }
  for (const story of rows) {
    story.seen = story.author_id === viewerId || seen.has(story.id);
    story.media = mediaByStory.get(story.id) || [];
    if (story.author) story.author.avatarUrl = avatarUrls.get(story.author.avatar_path) || null;
  }
  return rows;
}

function storyButtonMarkup(group, userId) {
  const own = group.author_id === userId;
  const author = group.author || {};
  const label = own ? "Seu story" : profileName(author);
  const allSeen = group.stories.every(item=>item.seen===true);
  return '<button class="story-avatar-button ' + (allSeen ? "is-story-seen" : "is-story-unseen") +
    '" type="button" data-story-open="' + escapeHtml(group.author_id) +
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
  const eligiblePeople = (people || []).filter(person => person.id !== userId);
  const recipientOptions = eligiblePeople.map((person) =>
    '<option value="' + escapeHtml(person.id) + '" data-username="' + escapeHtml(person.username) + '" data-display-name="' + escapeHtml(person.display_name || person.username) + '" data-avatar="' + escapeHtml(person.avatarUrl || "") + '">' +
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
          '<span data-story-viewer-avatar></span><span class="story-viewer-person"><span class="story-viewer-identity"><strong data-story-viewer-name></strong><time data-story-viewer-time></time></span><small class="story-song-label" data-story-viewer-music-label hidden></small></span>' +
          '<span class="story-close-friends-indicator" data-story-close-friends hidden title="Story para amigos próximos" aria-label="Somente amigos próximos">★</span>' +
        '</div><div class="story-viewer-header-controls">' +
          '<button class="story-sound-toggle" type="button" data-story-sound-toggle aria-label="Ativar música do story" hidden>🔊 <span>Ativar som</span></button>' +
          '<button class="story-play-toggle" type="button" data-story-play-toggle aria-label="Pausar story" aria-pressed="false">' + icon("pause") + '</button>' +
          '<button class="icon-button" type="button" data-story-close aria-label="Fechar stories">✕</button></div></header>' +
        '<div class="story-viewer-stage" data-story-touch-surface>' +
          '<button class="story-tap-zone story-tap-zone-prev" type="button" data-story-prev aria-label="Story anterior"></button>' +
          '<div class="story-media-backdrop" data-story-media-backdrop aria-hidden="true"></div>' +
          '<div class="story-viewer-media" data-story-viewer-media></div>' +
          '<button class="story-tap-zone story-tap-zone-next" type="button" data-story-next aria-label="Próximo story"></button>' +
        '</div>' +
        '<p class="story-viewer-caption" data-story-viewer-caption></p>' +
        '<footer class="story-viewer-actions">' +
          '<nav class="story-viewer-owner-actions" data-story-owner-actions aria-label="Gerenciar meu story" hidden>' +
            '<button type="button" class="story-owner-action" data-story-insights-open><span aria-hidden="true">◉</span><small data-story-view-count>Atividade</small></button>' +
            '<button type="button" class="story-owner-action" data-story-share><span aria-hidden="true">➤</span><small>Compartilhar</small></button>' +


            '<button type="button" class="story-owner-action" data-story-mention-add><span aria-hidden="true">@</span><small>Mencionar</small></button>' +
            '<button type="button" class="story-owner-action" data-story-more aria-expanded="false"><span aria-hidden="true">⋮</span><small>Mais</small></button>' +
          '</nav>' +
          '<div class="story-viewer-reply-actions" data-story-reply-actions hidden>' +
            '<button class="story-like-button" type="button" data-story-like aria-label="Curtir story" aria-pressed="false"><span aria-hidden="true">♡</span><span class="sr-only" data-story-like-label>Curtir</span></button>' +
            '<form class="story-reply-form" data-story-reply><label class="visually-hidden" for="storyReplyMessage">Responder em particular</label>' +
              '<input id="storyReplyMessage" name="reply" maxlength="2000" placeholder="Enviar mensagem..." autocomplete="off" required>' +
              '<button type="submit" aria-label="Enviar resposta privada">➤</button></form>' +
            '<button type="button" class="story-aux-action" data-story-quick-reactions-toggle aria-label="Enviar reação rápida" aria-expanded="false">☺</button>' +
            '<button type="button" class="story-aux-action" data-story-share aria-label="Compartilhar story">➤</button>' +
            '<span class="story-reply-status" data-story-reply-status role="status" aria-live="polite"></span>' +
          '</div>' +
          '<button type="button" class="story-repost-visible" data-story-repost hidden aria-label="Republicar story em que fui mencionado">↻ Repostar no meu story</button>' +
        '</footer>' +
        '<div class="story-quick-reactions" data-story-quick-reactions hidden role="group" aria-label="Reações rápidas">' +
          ['❤️','🔥','👏','😍','😂','😮','😢','💜'].map(emoji => '<button type="button" data-story-quick-reaction="' + emoji + '" aria-label="Reagir com ' + emoji + '">' + emoji + '</button>').join('') +
        '</div>' +
        '<div class="story-owner-menu" data-story-owner-menu hidden role="group" aria-label="Outras opções do Story">' +
          '<button type="button" data-story-save>Salvar mídia</button>' +
          '<button class="story-delete-button" type="button" data-story-delete>Excluir Story</button>' +
          '<button type="button" data-story-more-close>Cancelar</button></div>' +
        '<div class="story-share-panel" data-story-share-panel hidden role="group" aria-label="Compartilhar story">' +
          '<strong>Compartilhar story</strong>' +
          '<label>Enviar para<select data-story-share-person><option value="">Selecione um perfil</option>' + recipientOptions + '</select></label>' +
          '<button type="button" data-story-share-send>Enviar na conversa</button>' +
          '<button type="button" data-story-share-native>Compartilhar pelo aparelho</button>' +
          '<button type="button" data-story-share-copy>Copiar link</button>' +
          '<button type="button" data-story-share-close>Cancelar</button>' +
        '</div>' +
        '<div class="story-mention-dialog" data-story-mention-dialog hidden role="dialog" aria-label="Mencionar no Story">' +
          '<strong>Mencionar alguém</strong>' +
          '<label>Perfil<select data-story-mention-person><option value="">Selecione um perfil</option>' + recipientOptions + '</select></label>' +
          '<div><button type="button" data-story-mention-confirm>Confirmar</button><button type="button" data-story-mention-cancel>Cancelar</button></div></div>' +
        '<div class="story-viewer-action-status" data-story-action-status role="status" aria-live="polite" hidden></div>' +
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
    viewedThisSession: new Set(), viewPending: new Set(), likedStories: new Set(), likePending: new Set(),
    replyPending: new Set(), replyDrafts: new Map(), slideVersion: 0, insightsToken: 0,
    ignoreTapUntil: 0, paused: false
  };
  const soundToggle = viewer.querySelector("[data-story-sound-toggle]");
  const soundStatus = (kind = "hidden") => {
    if (!soundToggle) return;
    soundToggle.hidden = kind === "hidden";
    // A temporary CDN/network error must not permanently disable retry.
    soundToggle.disabled = false;
    soundToggle.dataset.kind = kind;
    const label = soundToggle.querySelector("span");
    const text = kind === "unavailable" ? "Tentar música" : kind === "retry" ? "Tentar música" : "Ativar som";
    if (label) label.textContent = text;
    soundToggle.setAttribute("aria-label", text);
  };
  const playStoryAudio = async audio => {
    if (!audio || state.paused || !viewer.open || viewer.querySelector("#story-audio") !== audio) return false;
    const activeVersion = state.slideVersion;
    const isCurrent = () => viewer.open && !state.paused && state.slideVersion === activeVersion
      && viewer.querySelector("#story-audio") === audio;
    const played = await startStoryMediaPlayback(audio, { owner: viewer, onBlocked: error => {
      if(isCurrent()) soundStatus(error?.name === "NotAllowedError" ? "blocked" : "retry");
    }});
    if (played && isCurrent()) soundStatus("hidden");
    return played && isCurrent();
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
  const recordVisibleStoryView = async (storyId, version) => {
    if (!viewer.open || state.slideVersion !== version || state.active?.stories?.[state.index]?.id !== storyId ||
        state.viewedThisSession.has(storyId) || state.viewPending.has(storyId)) return;
    state.viewPending.add(storyId);
    try {
      const { data, error } = await client.rpc("record_story_view", { p_story_id: storyId });
      if (error || typeof data !== "boolean") throw error || Error("story_view_unconfirmed");
      state.viewedThisSession.add(storyId);
      for(const group of state.groups)for(const item of group.stories)
        if(item.id===storyId)item.seen=true;
      renderList();
    } catch (error) {
      console.warn("Looply story view could not be recorded.", error);
    } finally { state.viewPending.delete(storyId); }
  };
  const resumeStoryTimer = () => {
    if (state.paused || !viewer.open) return;
    const timerVersion = state.slideVersion;
    const mediaHost = viewer.querySelector("[data-story-viewer-media]");
    const video = mediaHost.querySelector("video");
    if (video && !video.paused && Number.isFinite(video.duration)) {
      const remaining = Math.max(1000, (video.duration - video.currentTime) * 1000);
      setProgressDuration(remaining);
      state.timer = setTimeout(() => { if (state.slideVersion === timerVersion && viewer.open && !state.paused) advance(1); }, remaining);
    } else if (!video) {
      setProgressDuration(7000);
      state.timer = setTimeout(() => { if (state.slideVersion === timerVersion && viewer.open && !state.paused) advance(1); }, 7000);
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
      if (video && !video.paused) stopStoryMediaPlayback(video, { owner: viewer });
      if (audio && !audio.paused) stopStoryMediaPlayback(audio, { owner: viewer });
      if (progress) progress.style.animationPlayState = "paused";
    } else {
      if (progress) progress.style.animationPlayState = "running";
      if (video && video.paused) void startStoryMediaPlayback(video);
      if (audio && audio.paused) void playStoryAudio(audio);

      resumeStoryTimer();
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
    const version = ++state.slideVersion;
    ++state.insightsToken;
    const previousAudio = viewer.querySelector("#story-audio");
    if (previousAudio) { stopStoryMediaPlayback(previousAudio, { owner: viewer }); previousAudio.currentTime = 0; }
    soundStatus("hidden");
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
    const waitsForVideo = Boolean(mediaUrl && media?.kind === "video");
    const backdrop = viewer.querySelector("[data-story-media-backdrop]");
    // Only photos are duplicated as a visually blurred background; no extra video
    // element or sound source is created.
    backdrop.style.backgroundImage = mediaUrl && media?.kind !== "video"
      ? 'url("' + mediaUrl.replaceAll('"', '%22') + '")'
      : "none";
    backdrop.hidden = !(mediaUrl && media?.kind !== "video");
    viewer.classList.toggle("story-viewer-text-only", !media && Boolean(String(story.body || "").trim()));
    viewer.querySelector("[data-story-viewer-name]").textContent = profileName(author);
    const storyTime = viewer.querySelector("[data-story-viewer-time]");
    const timeLabels = storyTimeLabels(story.created_at);
    storyTime.textContent = timeLabels.exact ? `${timeLabels.relative} · ${timeLabels.exact}` : timeLabels.relative;
    storyTime.dateTime = story.created_at;
    storyTime.title = timeLabels.exact ? "Publicado em " + timeLabels.exact : "";
    storyTime.setAttribute("aria-label", timeLabels.exact ? "Publicado em " + timeLabels.exact : "Publicado agora");
    viewer.querySelector("[data-story-close-friends]").hidden = story.visibility !== "selected";
    viewer.querySelector("[data-story-owner-menu]").hidden = true;
    viewer.querySelector("[data-story-mention-dialog]").hidden = true;
    viewer.querySelector("[data-story-share-panel]").hidden = true;
    const repostButton = viewer.querySelector("[data-story-repost]");
    repostButton.hidden = true;
    repostButton.disabled = false;
    if (story.author_id !== userId && story.visibility === "public") {
      void client.from("story_mentions").select("id")
        .eq("story_id", story.id).eq("mentioned_user_id", userId).maybeSingle()
        .then(({data,error}) => {
          if (!error && data?.id && viewer.open && state.slideVersion === version) {
            repostButton.hidden = false;
            repostButton.disabled = false;
          } else if(error) console.warn("Story mention lookup failed",error?.code||"network");
        }).catch(() => {});
    }
    viewer.querySelector("[data-story-quick-reactions]").hidden = true;
    viewer.querySelector("[data-story-quick-reactions-toggle]").setAttribute("aria-expanded","false");
    viewer.querySelector("[data-story-action-status]").hidden = true;
    const avatarHost = viewer.querySelector("[data-story-viewer-avatar]");
    avatarHost.innerHTML = storyAvatar(author, "", false);
    const caption = viewer.querySelector("[data-story-viewer-caption]");
    const catalogSong = decodeStorySong(story.body || "");
    const storyText = decodeStoryBody(catalogSong.text);
    caption.textContent = storyText.text;
    const songLabel = viewer.querySelector("[data-story-viewer-music-label]");
    const credit = storyText.text.match(/🎵\s*"([^"]+)"\s*—\s*([^\n(]+)/);
    const soundName = catalogSong.song?.title ? [catalogSong.song.title,catalogSong.song.artist].filter(Boolean).join(" · ") : credit ? credit[1]+" · "+credit[2].trim() : "";
    songLabel.textContent = soundName ? "♫ "+soundName : "";
    songLabel.hidden = !soundName;
    // Top metadata only. Never create a provider iframe, music modal or
    // floating player inside the published Story viewer.
    songLabel.setAttribute("role","note");
    songLabel.removeAttribute("tabindex");
    songLabel.title = soundName;
    caption.style.fontFamily = !media && storyText.styled ? storyText.fontFamily : "";
    caption.style.fontSize = !media && storyText.styled ? `${storyText.size}pt` : "";
    viewer.querySelectorAll("[data-story-viewer-music]").forEach(oldMusic=>{
      if(oldMusic instanceof HTMLMediaElement)stopStoryMediaPlayback(oldMusic, { owner: viewer });
      oldMusic.remove();
    });
    // Restore the October 26 behavior: a separate, invisible <audio>
    // accompanies an Apple song reference, with no iframe, modal, widget,
    // new visual control or change to the original photo/video dimensions.
    // Apple provides only a short-lived sample URL; look it up at viewing
    // time using the stable track ID, never persist CDN URLs in the story.
    const oldApplePreview=storyText.music?.provider==="itunes"
      ? storyText.music.previewUrl : "";
    const appleSong=catalogSong.song?.provider==="apple" &&
      appleStoryTrackId(catalogSong.song) ? catalogSong.song : null;
    if(oldApplePreview || appleSong){
      const music=document.createElement("audio");
      music.id="story-audio";
      music.dataset.storyViewerMusic="";
      music.className="story-viewer-music-hidden";
      music.controls=false;
      music.autoplay=!waitsForVideo;
      music.preload="auto";
      music.loop=true;
      music.setAttribute("aria-label","Música do Story");
      viewer.querySelector("[data-story-touch-surface]").append(music);
      const current=()=>viewer.open && state.slideVersion===version && music.isConnected
        && viewer.querySelector("#story-audio")===music;
      const begin=()=>{
        if(!current() || state.paused)return;
        const video=viewer.querySelector("[data-story-viewer-media] video");
        if(video?.paused)return; // The video 'playing' event starts its soundtrack.
        if(video && Number.isFinite(video.currentTime)){
          try{music.currentTime=video.currentTime;}catch{}
        }
        void playStoryAudio(music);
      };
      music.addEventListener("error",()=>{
        if(!current())return;
        music.dataset.playback="unavailable";
        soundStatus("retry");
      });
      if(oldApplePreview){
        music.src=oldApplePreview;
        // Read media state only after the previous slide is removed.
        queueMicrotask(begin);
      }else{
        // The pending element remains on the current slide only. A late
        // response must not restart audio after advancing or closing Stories.
        void resolveAppleStoryPreview(appleSong).then(src=>{
          if(!current())return;
          if(!src){
            music.dataset.playback="unavailable";
            soundStatus("retry");
            return;
          }
          music.src=src;
          begin();
        }).catch(()=>{
          if(current()){
            music.dataset.playback="unavailable";
            soundStatus("retry");
          }
        });
      }
    }
    const mediaHost = viewer.querySelector("[data-story-viewer-media]");
    const slideAudio = viewer.querySelector("#story-audio");
    mediaHost.querySelectorAll("video").forEach((video) => {
      stopStoryMediaPlayback(video, { owner: viewer });
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
        video.muted = false;
        video.volume = 1;
        video.preload = "metadata";
        video.setAttribute("aria-label", media.alt_text || "Vídeo do story");
        video.addEventListener("loadedmetadata", () => {
          if (state.slideVersion !== version || !viewer.open) return;
          if (Number.isFinite(video.duration) && video.duration > 0) setProgressDuration(video.duration * 1000);
        }, { once: true });
        video.addEventListener("playing", () => {
          if (!video.isConnected || mediaHost.querySelector("video") !== video || state.slideVersion !== version || !viewer.open) return;
          if (story.author_id !== userId) void recordVisibleStoryView(story.id, version);
          const songAudio = slideAudio;
          if(songAudio && !songAudio.paused && Number.isFinite(songAudio.currentTime)
            && Math.abs(songAudio.currentTime-video.currentTime)>1.25){
            try{songAudio.currentTime=video.currentTime||0;}catch{/* Live streams may not seek. */}
          }
          if (songAudio?.paused && !state.paused) {
            // Start the soundtrack only after the video really starts, including
            // after a browser requires a tap to permit video playback.
            try { songAudio.currentTime = video.currentTime || 0; } catch { /* Live streams may not seek. */ }
            void playStoryAudio(songAudio);
          }
          clearTimer();
          if (Number.isFinite(video.duration) && video.duration > 0) {
            const remaining = Math.max(1000, (video.duration - video.currentTime) * 1000);
            setProgressDuration(remaining);
            state.timer = setTimeout(() => { if (viewer.open && state.slideVersion === version && !state.paused) advance(1); }, remaining);
          }
        });
        video.addEventListener("error", () => {
          if (state.slideVersion === version && viewer.open && mediaHost.querySelector("video") === video) showMediaUnavailable(mediaHost);
        }, { once: true });
        video.addEventListener("pause", () => {
          if (!video.isConnected || mediaHost.querySelector("video") !== video) return;
          clearTimer();
          const songAudio = slideAudio;
          if (songAudio && !songAudio.paused) stopStoryMediaPlayback(songAudio, { owner: viewer });
        });
        video.addEventListener("ended", () => {
          // A delayed event from an older slide must never advance the active Story.
          if (video.isConnected && mediaHost.querySelector("video") === video && !state.paused) advance(1);
        }, { once: true });
        mediaHost.append(video);
        // Start unmuted video in the same viewer-opening click. If a browser
        // blocks it, a subsequent tap on the Story retries without a popup.
        void startStoryMediaPlayback(video);
      } else {
        const image = document.createElement("img");
        image.alt = media.alt_text || "Foto do story";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("load", () => {
          if (state.slideVersion !== version || !viewer.open || !image.isConnected || !image.naturalWidth) return;
          if (story.author_id !== userId) void recordVisibleStoryView(story.id, version);
          setProgressDuration(7000);
          clearTimer();
          if (!state.paused) state.timer = setTimeout(() => {
            if (viewer.open && state.slideVersion === version && !state.paused) advance(1);
          }, 7000);
        }, { once: true });
        image.addEventListener("error", () => {
          if (state.slideVersion === version && viewer.open && image.isConnected) showMediaUnavailable(mediaHost);
        }, { once: true });
        mediaHost.append(image);
        image.src = mediaUrl;
      }
    } else if (media) {
      showMediaUnavailable(mediaHost);
    } else if (story.body) {
      if (viewer.open && story.author_id !== userId) void recordVisibleStoryView(story.id, version);
      setProgressDuration(7000);
      state.timer = setTimeout(() => { if (viewer.open && state.slideVersion === version && !state.paused) advance(1); }, 7000);
    }

    const currentGroupIndex = state.groups.findIndex((group) => group.author_id === story.author_id);
    viewer.querySelector("[data-story-prev]").disabled = state.index === 0 && currentGroupIndex <= 0;
    const canDelete = story.author_id === userId || isAdmin;
    viewer.querySelector("[data-story-delete]").hidden = !canDelete;
    viewer.querySelector("[data-story-delete]").textContent = story.author_id === userId ? "Excluir" : "Excluir como ADM";
    viewer.querySelector("[data-story-owner-actions]").hidden = !(story.author_id === userId || isAdmin);
    const insightsButton = viewer.querySelector("[data-story-insights-open]");
    if (insightsButton) {
      insightsButton.hidden = story.author_id !== userId;
      insightsButton.setAttribute("aria-label", "Ver visualizações do meu story");
    }
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
    if (replyInput) replyInput.value = state.replyDrafts.get(story.id) || "";
    if (story.author_id === userId) {
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
  const showMediaUnavailable = mediaHost => {
    const box = document.createElement("div");
    box.className = "story-media-unavailable";
    const message = document.createElement("p");
    message.textContent = "Não foi possível carregar a mídia deste story.";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "text-button";
    retry.dataset.storyMediaRetry = "";
    retry.textContent = "Tentar carregar novamente";
    box.append(message, retry);
    mediaHost.replaceChildren(box);
  };
  const currentStory = () => state.active?.stories?.[state.index] || null;
  const loadStoryInsights = async (story) => {
    if (!viewer.open || story.author_id !== userId) return;
    const token = ++state.insightsToken;
    const isCurrent = () => viewer.open && state.insightsToken === token &&
      currentStory()?.id === story.id;
    const panel = viewer.querySelector("[data-story-insights-panel]");
    const summary = viewer.querySelector("[data-story-insights-summary]");
    const list = viewer.querySelector("[data-story-insights-list]");
    panel.hidden = false;
    summary.textContent = "Carregando visualizações…";
    list.replaceChildren();
    clearTimer();
    try {
      const views = [];
      // The count uses one row per viewer (story_id, viewer_id is a PK).
      for (let offset = 0; offset < 5000; offset += 500) {
        const { data, error } = await client.from("story_views")
          .select("viewer_id,viewed_at")
          .eq("story_id", story.id).order("viewed_at", { ascending: false }).range(offset, offset + 499);
        if (error) throw error;
        if (!isCurrent()) return;
        views.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      const viewerIds = [...new Set(views.map(view => view.viewer_id).filter(Boolean))];
      let profiles = [];
      if (viewerIds.length) {
        const { data: rows, error: profilesError } = await client.from("profiles")
          .select("id,username,display_name,avatar_path").in("id",viewerIds);
        if (profilesError) throw profilesError;
        profiles = rows || [];
      }
      const profileMap = new Map(profiles.map(profile => [profile.id,profile]));
      views.forEach(view => { view.viewer = profileMap.get(view.viewer_id) || null; });
      const avatarPaths = [...new Set(views.map((view) => view.viewer?.avatar_path).filter(Boolean))];
      const avatarUrls = new Map();
      if (avatarPaths.length) {
        const { data: signedAvatars, error: avatarError } = await cachedSignedUrls(client, "looply-avatars", avatarPaths, 1800);
        if (!avatarError) avatarPaths.forEach((path, index) => {
          const url = signedAvatars?.[index]?.signedUrl;
          if (url) avatarUrls.set(path, url);
        });
      }
      if (!isCurrent()) return;
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
      if (isCurrent()) summary.textContent = "Não foi possível carregar as visualizações agora.";
    }
  };
  const refresh = async () => {
    try {
      state.groups = groupActiveStories(await loadStories(client,userId));
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
    if (story && story.author_id === userId && !viewer.querySelector("[data-story-insights-panel]").hidden) {
      void loadStoryInsights(story);
    }
  };
  refreshers.set(root, refresh);
  root.__looplyStudioStop = bindStoryStudio(root, client, userId, refresh, isAdmin);
  cleanupExpiredStories(client);

  const actionStatus = (message, error = false) => {
    const messageNode = viewer.querySelector("[data-story-action-status]");
    if (!messageNode) return;
    messageNode.textContent = message;
    messageNode.dataset.error = String(error);
    messageNode.hidden = !message;
  };
  const sharePanel = viewer.querySelector("[data-story-share-panel]");
  const storyShareUrl = story => {
    const url = new URL("home.html", window.location.href);
    url.searchParams.set("storyId", story.id);
    return url.href;
  };
  const availableToShare = async story => {
    if (!story || Date.parse(story.expires_at) <= Date.now()) return false;
    const { data, error } = await client.from("stories").select("id")
      .eq("id", story.id).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw error;
    return data?.id === story.id;
  };
  const shareCurrentStory = async (method) => {
    const story = currentStory();
    if (!story) return;
    const version = state.slideVersion;
    const button = sharePanel.querySelector(
      method === "send" ? "[data-story-share-send]" :
      method === "native" ? "[data-story-share-native]" : "[data-story-share-copy]");
    if (button.disabled) return;
    button.disabled = true;
    try {
      if (!(await availableToShare(story))) throw Error("story_expired");
      const url = storyShareUrl(story);
      if (method === "send") {
        const recipientId = sharePanel.querySelector("[data-story-share-person]").value;
        if (!recipientId || recipientId === userId) {
          actionStatus("Selecione outra pessoa para compartilhar.", true);
          return;
        }
        if (story.visibility === "private" && recipientId !== story.author_id) {
          actionStatus("Este story é privado e não pode ser encaminhado.", true);
          return;
        }
        if (story.visibility === "selected" && recipientId !== story.author_id) {
          const { data: permitted, error: permissionError } = await client.from("story_recipients")
            .select("recipient_id").eq("story_id", story.id).eq("recipient_id", recipientId).maybeSingle();
          if (permissionError) throw permissionError;
          if (!permitted) {
            actionStatus("Esse perfil não tem permissão para visualizar o story.", true);
            return;
          }
        }
        const created = await client.functions.invoke("looply-chat", {
          body: { action: "create_direct", targetId: recipientId }
        });
        if (created.error || !created.data?.conversationId) throw created.error || Error("conversation_unconfirmed");
        const { data: message, error } = await client.from("chat_messages")
          .insert({ conversation_id: created.data.conversationId, sender_id: userId,
            body: "Story compartilhado: " + url }).select("id").maybeSingle();
        if (error || !message?.id) throw error || Error("share_message_unconfirmed");
        if (viewer.open && currentStory()?.id === story.id && state.slideVersion === version) {
          sharePanel.hidden = true;
          actionStatus("Story enviado na conversa.");
          resumeStoryTimer();
        }
      } else if (method === "native") {
        if (!navigator.share) {
          actionStatus("Compartilhamento do aparelho indisponível. Use Copiar link.", true);
          return;
        }
        await navigator.share({ title: "Story no Looply", text: "Veja este story no Looply", url });
        if (viewer.open && currentStory()?.id === story.id && state.slideVersion === version) {
          sharePanel.hidden = true;
          resumeStoryTimer();
        }
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        if (viewer.open && currentStory()?.id === story.id) actionStatus("Link copiado.");
      } else {
        actionStatus("Link do story: " + url);
      }
    } catch (error) {
      if (error?.name !== "AbortError" && viewer.open && currentStory()?.id === story.id) {
        console.warn("Looply story sharing failed.", error);
        actionStatus(error?.message === "story_expired"
          ? "Este story não está mais disponível."
          : "Não foi possível compartilhar este story.", true);
      }
    } finally { button.disabled = false; }
  };
  const repostCurrentStory = async () => {
    const story = currentStory(), button = viewer.querySelector("[data-story-repost]");
    if (!story || button.disabled || button.hidden || story.author_id === userId) return;
    button.disabled = true;
    const version = state.slideVersion;
    let createdId = null, uploadedPath = null;
    try {
      if (story.visibility !== "public" || !(await availableToShare(story)))
        throw Error("Story não disponível para repostagem.");
      const { data: mention, error: mentionError } = await client.from("story_mentions")
        .select("id").eq("story_id", story.id).eq("mentioned_user_id", userId).maybeSingle();
      if (mentionError || !mention?.id) throw Error("A menção não foi confirmada.");
      const media = Array.isArray(story.media) ? story.media[0] : story.media;
      const source = rawSignedUrl(media?.signedUrl);
      if (!media || !source || !["image","video"].includes(media.kind))
        throw Error("A mídia original não está disponível.");
      const fetched = await fetch(source, { credentials: "omit", cache: "no-store" });
      if (!fetched.ok) throw Error("A mídia original não está disponível.");
      const blob = await fetched.blob();
      if (!blob.size || blob.size > 100 * 1024 * 1024) throw Error("Tamanho de mídia não suportado.");
      const mime = String(media.mime_type || blob.type || "").split(";")[0].toLowerCase();
      const extensions = {
        "image/jpeg":"jpg","image/png":"png","image/webp":"webp",
        "video/mp4":"mp4","video/webm":"webm"
      };
      const extension = extensions[mime];
      if (!extension || (media.kind === "video") !== mime.startsWith("video/"))
        throw Error("Formato de mídia não suportado.");
      const authorHandle = String(story.author?.username || "").replace(/[^a-zA-Z0-9_.]/g,"");
      const decoded = decodeStorySong(story.body || "");
      const captionText = decodeStoryBody(decoded.text || "").text || "";
      const credit = authorHandle ? "Repost de @" + authorHandle : "Story republicado";
      const caption = credit + (captionText ? "\n" + captionText : "");
      const repostBody = decoded.song ? encodeStorySong(caption, decoded.song) : caption;
      const created = await client.rpc("v5_create_story", {
        p_body: repostBody, p_visibility: "public", p_recipient_ids: []
      });
      if (created.error || !/^[0-9a-f-]{36}$/i.test(String(created.data || "")))
        throw Error("Não foi possível criar seu story.");
      createdId = created.data;
      uploadedPath = "stories/" + createdId + "/" + crypto.randomUUID() + "." + extension;
      const copy = new File([blob], "repost." + extension, { type: mime });
      const uploaded = await client.storage.from("looply-media").upload(uploadedPath,copy,{contentType:mime});
      if (uploaded.error) throw Error("Não foi possível copiar a mídia.");
      const attached = await client.rpc("v5_attach_story_media", {
        p_story_id: createdId, p_storage_path: uploadedPath,
        p_kind: media.kind, p_mime_type: mime, p_byte_size: copy.size
      });
      if (attached.error || !attached.data) throw Error("Não foi possível publicar a mídia.");
      const verified = await client.from("story_media").select("id")
        .eq("story_id",createdId).eq("storage_path",uploadedPath).maybeSingle();
      if (verified.error || !verified.data?.id) throw Error("A publicação não foi confirmada.");
      sharePanel.hidden = true;
      if (viewer.open && state.slideVersion === version) actionStatus("Repostado no seu story.");
      await refresh();
    } catch(error) {
      console.warn("Looply mentioned story repost unsuccessful", error?.message || "unavailable");
      if (uploadedPath) {
        try { await client.storage.from("looply-media").remove([uploadedPath]); } catch {}
      }
      if (createdId) {
        try { await client.from("stories").delete().eq("id",createdId).eq("author_id",userId); } catch {}
      }
      if (viewer.open && state.slideVersion === version)
        actionStatus("Não foi possível repostar. Tente novamente.",true);
    } finally {
      button.disabled = false;
    }
  };
  // If Android/WebView consumed the opening gesture before the remote
  // media became ready, a tap anywhere on the Story media stage retries
  // playback immediately. No provider modal, redirect or right-side player.
  // Ignore navigation zones: their click handler will render and play the next
  // Story using the same gesture.
  viewer.addEventListener("pointerdown", event => {
    if(!viewer.open || state.paused ||
      !event.target.closest("[data-story-touch-surface]") ||
      event.target.closest("[data-story-prev], [data-story-next]"))return;
    const video=viewer.querySelector("[data-story-viewer-media] video");
    if(video?.paused && video.dataset.playback==="gesture-required")
      void startStoryMediaPlayback(video,{owner:viewer});
    const sound=viewer.querySelector("#story-audio");
    if(sound?.paused && sound.dataset.playback==="gesture-required")
      void playStoryAudio(sound);
  },{passive:true});

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
      // Showing the dialog before starting media preserves the opening tap's
      // playback activation on mobile; no intermediate music modal is shown.
      openStoryDialog(viewer);
      renderSlide();
      return;
    }
    if (event.target.closest("[data-story-media-retry]")) {
      const current = currentStory();
      if (!current) return;
      const retryVersion = state.slideVersion;
      try {
        showStatus("Carregando mídia do story…");
        const refreshed = await loadStories(client,userId);
        if (!viewer.open || state.slideVersion !== retryVersion || currentStory()?.id !== current.id) return;
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
    if (event.target.closest("[data-story-share]")) {
      sharePanel.hidden = !sharePanel.hidden;
      if (!sharePanel.hidden) {
        clearTimer();
        viewer.querySelector("[data-story-quick-reactions]").hidden = true;
      } else resumeStoryTimer();
      return;
    }
    if (event.target.closest("[data-story-share-close]")) {
      sharePanel.hidden = true;
      resumeStoryTimer();
      return;
    }
    if (event.target.closest("[data-story-repost]")) { await repostCurrentStory(); return; }
    if (event.target.closest("[data-story-share-send]")) { await shareCurrentStory("send"); return; }
    if (event.target.closest("[data-story-share-copy]")) { await shareCurrentStory("copy"); return; }
    if (event.target.closest("[data-story-share-native]")) { await shareCurrentStory("native"); return; }
    if (event.target.closest("[data-story-quick-reactions-toggle]")) {
      const picker=viewer.querySelector("[data-story-quick-reactions]");
      picker.hidden=!picker.hidden;
      viewer.querySelector("[data-story-quick-reactions-toggle]").setAttribute("aria-expanded",String(!picker.hidden));
      if(!picker.hidden) clearTimer();
      else resumeStoryTimer();
      return;
    }
    const reaction = event.target.closest("[data-story-quick-reaction]");
    if (reaction) {
      const story=currentStory();
      const emoji=reaction.dataset.storyQuickReaction;
      if(!story || story.author_id===userId || state.replyPending.has(story.id) ||
        !['❤️','🔥','👏','😍','😂','😮','😢','💜'].includes(emoji)) return;
      state.replyPending.add(story.id);
      reaction.disabled=true;
      try {
        const {data,error}=await client.rpc("send_story_reply",{p_story_id:story.id,p_body:emoji});
        if(error) throw error;
        const payload=Array.isArray(data)?data[0]:data;
        if(!payload?.conversation_id) throw Error("reply_not_confirmed");
        actionStatus("Reação enviada por mensagem privada.");
        viewer.querySelector("[data-story-quick-reactions]").hidden=true;
        viewer.querySelector("[data-story-quick-reactions-toggle]").setAttribute("aria-expanded","false");
        resumeStoryTimer();
      } catch (error) {
        actionStatus("Não foi possível enviar a reação. Confira as permissões e tente novamente.",true);
      } finally {reaction.disabled=false;state.replyPending.delete(story.id);}
      return;
    }
    if (event.target.closest("[data-story-more]")) {
      const panel=viewer.querySelector("[data-story-owner-menu]");
      panel.hidden=!panel.hidden;
      viewer.querySelector("[data-story-more]").setAttribute("aria-expanded",String(!panel.hidden));
      return;
    }
    if (event.target.closest("[data-story-more-close]")) {
      viewer.querySelector("[data-story-owner-menu]").hidden=true;
      viewer.querySelector("[data-story-more]").setAttribute("aria-expanded","false");
      return;
    }
    if (event.target.closest("[data-story-save]")) {
      const story=currentStory();
      if (!story || (story.author_id!==userId && !isAdmin)) return;
      const media=Array.isArray(story.media)?story.media[0]:story.media;
      const src=rawSignedUrl(media?.signedUrl);
      if (!src) {actionStatus("Mídia indisponível para salvar.",true);return;}
      try {
        const response=await fetch(src,{credentials:"omit"});
        if(!response.ok)throw Error("download unavailable");
        const blob=await response.blob();
        if(!blob.size)throw Error("empty media");
        const temporary=URL.createObjectURL(blob);
        const anchor=document.createElement("a");
        anchor.href=temporary;
        const mime=String(blob.type || media?.mime_type || "").toLowerCase();
        const extension=mime.includes("mp4") ? "mp4" : mime.includes("webm") ? "webm"
          : mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
        anchor.download="looply-story-"+story.id+"."+extension;
        document.body.append(anchor);anchor.click();anchor.remove();
        setTimeout(()=>URL.revokeObjectURL(temporary),15000);
        actionStatus("Download iniciado.");
      } catch (error) {actionStatus("Não foi possível salvar esta mídia neste navegador.",true);}
      viewer.querySelector("[data-story-owner-menu]").hidden=true;
      return;
    }
    if (event.target.closest("[data-story-mention-add]")) {
      const story=currentStory();
      if (!story || story.author_id!==userId) {actionStatus("Apenas o autor pode adicionar menções.",true);return;}
      if (story.visibility==="private") {actionStatus("Menções não são permitidas em Stories privados.",true);return;}
      const selector=viewer.querySelector("[data-story-mention-person]");
      [...selector.options].forEach(option=>{if(option.value)option.disabled=option.value===userId;});
      viewer.querySelector("[data-story-mention-dialog]").hidden=false;
      clearTimer();
      return;
    }
    if (event.target.closest("[data-story-mention-cancel]")) {
      viewer.querySelector("[data-story-mention-dialog]").hidden=true;
      resumeStoryTimer();
      return;
    }
    if (event.target.closest("[data-story-mention-confirm]")) {
      const story=currentStory();
      const selector=viewer.querySelector("[data-story-mention-person]");
      if (!story || story.author_id!==userId || !selector?.value)return;
      const button=viewer.querySelector("[data-story-mention-confirm]");
      button.disabled=true;
      try {
        const {error}=await client.rpc("v5_add_story_mentions",{p_story_id:story.id,p_user_ids:[selector.value]});
        if(error)throw error;
        viewer.querySelector("[data-story-mention-dialog]").hidden=true;
        actionStatus("Menção adicionada.");
        resumeStoryTimer();
      }catch(error){actionStatus("Não foi possível mencionar esse perfil. Confira a privacidade do Story.",true);}
      finally{button.disabled=false;}
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
    if (event.target.closest("[data-story-sound-toggle]")) {
      const audio = viewer.querySelector("#story-audio");
      if (!audio) return;
      soundToggle.disabled = true;
      if (audio.dataset.playback === "unavailable") {
        audio.load();
        audio.dataset.playback = "retrying";
      }
      const played = await playStoryAudio(audio);
      if (!played && audio.dataset.playback !== "gesture-required") soundStatus("retry");
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
        if (viewer.open && currentStory()?.id === story.id) {
          button.setAttribute("aria-pressed", isLiked ? "false" : "true");
          viewer.querySelector("[data-story-like-label]").textContent = isLiked ? "Curtir" : "Curtido";
          const icon = button.querySelector("[aria-hidden]");
          if (icon) icon.textContent = isLiked ? "♡" : "♥";
        }
      } catch (error) {
        console.error("Looply story reaction failed.", error);
        const status = viewer.querySelector("[data-story-reply-status]");
        status.textContent = "Não foi possível registrar sua curtida. Tente novamente.";
      } finally {
        state.likePending.delete(story.id);
        if (currentStory()?.id === story.id) button.disabled = false;
      }
      return;
    }
    if (event.target.closest("[data-story-insights-open]")) {
      const story = currentStory();
      if (story && story.author_id === userId) await loadStoryInsights(story);
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
  const viewport = window.visualViewport;
  const syncStoryKeyboard = () => {
    const focused = viewer.open && viewer.contains(document.activeElement) &&
      document.activeElement?.matches("input,textarea");
    const obscured = focused && viewport
      ? Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop)) : 0;
    viewer.style.setProperty("--story-keyboard-inset", Math.round(obscured) + "px");
  };
  viewport?.addEventListener("resize", syncStoryKeyboard);
  viewport?.addEventListener("scroll", syncStoryKeyboard);
  viewer.addEventListener("focusin", syncStoryKeyboard);
  viewer.addEventListener("focusout", () => requestAnimationFrame(syncStoryKeyboard));
  root.__looplyStoryKeyboardCleanup = () => {
    viewport?.removeEventListener("resize", syncStoryKeyboard);
    viewport?.removeEventListener("scroll", syncStoryKeyboard);
    viewer.style.removeProperty("--story-keyboard-inset");
  };
  replyForm.addEventListener("input", event => {
    if (event.target.matches('input[name="reply"]') && currentStory()) {
      state.replyDrafts.set(currentStory().id, event.target.value);
    }
  });
  let replyFocusActive = false;
  let resumeAfterReplyFocus = false;
  replyForm.addEventListener("focusin", () => {
    if (replyFocusActive) return;
    replyFocusActive = true;
    resumeAfterReplyFocus = !state.paused;
    // Typing must not allow a video to advance and replace the reply target.
    setStoryPaused(true);
  });
  replyForm.addEventListener("focusout", (event) => {
    if (replyForm.contains(event.relatedTarget)) return;
    replyFocusActive = false;
    if (resumeAfterReplyFocus && viewer.open) setStoryPaused(false);
  });
  touchSurface.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, form, [data-story-prev], [data-story-next]")) return;
    if (Date.now() < state.ignoreTapUntil) return;
    setStoryPaused(!state.paused);
  });
  touchSurface.addEventListener("pointerdown", (event) => {
    // If mobile autoplay was denied, the next natural tap on the image/video
    // retries directly inside the user's gesture. No music box or modal.
    const backgroundAudio=viewer.querySelector("#story-audio");
    const currentVideo=viewer.querySelector("[data-story-viewer-media] video");
    if(!state.paused){
      const retryAudio=backgroundAudio?.dataset.playback==="gesture-required";
      const retryVideo=currentVideo?.dataset.playback==="gesture-required";
      if(retryAudio||retryVideo){
        state.ignoreTapUntil=Date.now()+450;
        if(retryAudio)void playStoryAudio(backgroundAudio);
        if(retryVideo)void startStoryMediaPlayback(currentVideo);
      }
    }
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
    if (event.target.closest("input,select,textarea,[contenteditable=true]")) return;
    if (event.key === "ArrowRight") { event.preventDefault(); advance(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); advance(-1); }
  });
  viewer.addEventListener("close", () => {
    clearTimer();
    ++state.slideVersion;
    ++state.insightsToken;
    state.paused = false;
    viewer.style.removeProperty("--story-keyboard-inset");
    viewer.querySelectorAll("[data-story-viewer-music]").forEach(audio => {
      stopStoryMediaPlayback(audio, { owner: viewer }); audio.removeAttribute("src"); audio.remove();
    });
    viewer.querySelectorAll("[data-story-viewer-media] video").forEach(video => {
      stopStoryMediaPlayback(video, { owner: viewer }); video.removeAttribute("src"); video.load();
    });
    soundStatus("hidden");
  });
  document.addEventListener("visibilitychange", () => {
    if (!viewer.open) return;
    const audio = viewer.querySelector("#story-audio");
    const video = viewer.querySelector("[data-story-viewer-media] video");
    if (document.hidden) {
      if (audio && !audio.paused) stopStoryMediaPlayback(audio, { owner: viewer });
      if (video && !video.paused) stopStoryMediaPlayback(video, { owner: viewer });
    } else if (!state.paused) {
      if (video?.paused) void startStoryMediaPlayback(video, { owner: viewer });
      if (audio?.paused) void playStoryAudio(audio);
    }
  });
  window.addEventListener("online", () => {
    const audio = viewer.open && !state.paused ? viewer.querySelector("#story-audio") : null;
    if (!audio || !["unavailable", "retrying"].includes(audio.dataset.playback)) return;
    audio.load();
    void playStoryAudio(audio);
  });
  root.addEventListener("submit", async (event) => {
    const replyForm = event.target.closest("form[data-story-reply]");
    if (replyForm) {
      event.preventDefault();
      const story = currentStory();
      const body = String(new FormData(replyForm).get("reply") || "").trim();
      const submit = replyForm.querySelector('button[type="submit"]');
      const replyStatus = viewer.querySelector("[data-story-reply-status]");
      if (!story || story.author_id === userId || !body || state.replyPending.has(story.id)) return;
      state.replyPending.add(story.id);
      submit.disabled = true;
      state.replyDrafts.set(story.id, body);
      replyStatus.textContent = "Enviando em particular…";
      try {
        const { data, error } = await client.rpc("send_story_reply", { p_story_id: story.id, p_body: body });
        if (error) throw error;
        const reply = Array.isArray(data) ? data[0] : data;
        if (!reply?.conversation_id || !reply?.message_id || reply.story_id !== story.id) throw new Error("story_reply_unconfirmed");
        state.replyDrafts.delete(story.id);
        if (viewer.open && currentStory()?.id === story.id) {
          replyStatus.textContent = "Resposta enviada. Abrindo conversa…";
          window.location.assign(`conversa.html?id=${encodeURIComponent(reply.conversation_id)}`);
        }
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
        state.replyPending.delete(story.id);
        submit.disabled = false;
      }
      return;
    }

  });
  const requestedStoryId = new URL(window.location.href).searchParams.get("storyId");
  if (requestedStoryId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedStoryId)) {
    void (async () => {
      let group = state.groups.find(item => item.stories.some(story => story.id === requestedStoryId));
      if (!group) {
        await refresh();
        group = state.groups.find(item => item.stories.some(story => story.id === requestedStoryId));
      }
      const activeStories = group ? activeStoriesFor(group) : [];
      const storyIndex = activeStories.findIndex(story => story.id === requestedStoryId);
      if (!group || storyIndex < 0) {
        showStatus("Este story não está mais disponível.");
        return;
      }
      state.active = { ...group, stories: activeStories };
      state.index = storyIndex;
      openStoryDialog(viewer);
      renderSlide();
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.hash);
    })();
  }
}

/** Reuse the existing bound Story controller; never recreate a camera/viewer or editor. */
export async function refreshStoriesInPlace(root) {
  const refresh = refreshers.get(root);
  return refresh ? await refresh() : false;
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
    root.__looplyStoryKeyboardCleanup?.();
    delete root.__looplyStoryKeyboardCleanup;
    root.__looplyStudioStop?.();
    delete root.__looplyStudioStop;
    root.__looplyStoryClose?.();
    delete root.__looplyStoryClose;
    delete root.__looplyRefreshStoryInsights;
  }
}


