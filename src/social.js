import { icon } from "./icons.js";
import { signProfileAvatars } from "./profiles.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "agora há pouco";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function profileLabel(profile) {
  if (!profile) return "Perfil restrito";
  const name = escapeHtml(profile.display_name || profile.username || "Membro");
  const username = profile.username ? ` <span>@${escapeHtml(profile.username)}</span>` : "";
  return `${name}${username}`;
}

function commentMediaMarkup(media) {
  if (!media?.length) return "";
  return `<div class="comment-media-grid">${media.map((item) => {
    if (!item.signedUrl) return `<span class="media-unavailable">Anexo temporariamente indisponível.</span>`;
    const url = escapeHtml(item.signedUrl);
    const label = escapeHtml(item.file_name || (item.mime_type.startsWith("video/") ? "Vídeo anexado ao comentário" : "Imagem anexada ao comentário"));
    return item.mime_type.startsWith("video/")
      ? `<video src="${url}" controls preload="metadata" aria-label="${label}"></video>`
      : `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" alt="${label}" loading="lazy" referrerpolicy="no-referrer"></a>`;
  }).join("")}</div>`;
}

function commentAttachmentField(commentId, postId) {
  const id = `comment-media-${commentId || postId}`;
  return `<label class="comment-attachment-label" for="${escapeHtml(id)}">${icon("plus")} Foto ou vídeo <span>Você pode escolher pela galeria ou câmera do celular.</span></label>
    <input class="visually-hidden" id="${escapeHtml(id)}" name="commentMedia" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm">`;
}

function commentMarkup(comment, canReply) {
  const replyForm = canReply
    ? `<details class="reply-details"><summary>Responder</summary>
        <form class="comment-form reply-form" data-social-comment data-post-id="${escapeHtml(comment.post_id)}" data-parent-comment-id="${escapeHtml(comment.id)}">
          <label class="visually-hidden" for="reply-${escapeHtml(comment.id)}">Sua resposta</label>
          <textarea id="reply-${escapeHtml(comment.id)}" name="body" maxlength="2000" required placeholder="Escreva uma resposta..."></textarea>
          ${commentAttachmentField(comment.id, comment.post_id)}
          <button class="text-button" type="submit">Enviar resposta</button>
          <span class="form-status" data-status role="status" aria-live="polite"></span>
        </form>
      </details>`
    : "";

  return `<article class="comment-item${canReply ? "" : " comment-reply"}" id="comment-${escapeHtml(comment.id)}">
    <div class="comment-meta"><strong>${profileLabel(comment.author)}</strong><time datetime="${escapeHtml(comment.created_at)}">${escapeHtml(formatDate(comment.created_at))}</time></div>
    <p>${escapeHtml(comment.body)}</p>${commentMediaMarkup(comment.media)}${replyForm}
  </article>`;
}

function postMarkup(post, userId) {
  const comments = Array.isArray(post.comments) ? [...post.comments] : [];
  comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const replies = new Map();
  for (const comment of comments) {
    if (comment.parent_comment_id) {
      const siblings = replies.get(comment.parent_comment_id) || [];
      siblings.push(comment);
      replies.set(comment.parent_comment_id, siblings);
    }
  }
  const roots = comments.filter((comment) => !comment.parent_comment_id);
  const commentList = roots.length
    ? roots.map((comment) => `<div class="comment-thread">${commentMarkup(comment, true)}${(replies.get(comment.id) || []).map((reply) => commentMarkup(reply, false)).join("")}</div>`).join("")
    : `<p class="empty-comments">Ainda não há comentários. Você pode começar a conversa.</p>`;
  const labels = { public: "Público", private: "Só você", selected: "Pessoas escolhidas" };
  const liked = Boolean(post.likedByMe);
  const likeCount = Number(post.likeCount || 0);
  const externalUrl = (() => {
    try {
      const url = new URL(post.external_url || "");
      const hosts = ["instagram.com","www.instagram.com","tiktok.com","www.tiktok.com","vm.tiktok.com","youtube.com","www.youtube.com","m.youtube.com","youtu.be"];
      return url.protocol === "https:" && hosts.includes(url.hostname.toLowerCase()) ? url : null;
    } catch { return null; }
  })();
  let externalMarkup = "";
  if (externalUrl) {
    let provider = externalUrl.hostname.includes("instagram") ? "Instagram" : externalUrl.hostname.includes("tiktok") ? "TikTok" : "Link externo";
    let embed = "";
    if (externalUrl.hostname.includes("youtube.com") || externalUrl.hostname === "youtu.be") {
      const pathParts = externalUrl.pathname.split("/").filter(Boolean);
      const id = externalUrl.hostname === "youtu.be" ? pathParts[0] : externalUrl.pathname === "/watch" ? externalUrl.searchParams.get("v") : ["shorts", "embed"].includes(pathParts[0]) ? pathParts[1] : null;
      if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
        provider = "YouTube";
        embed = '<div class="post-external-embed"><iframe src="https://www.youtube-nocookie.com/embed/' + escapeHtml(id) + '" title="Vídeo do YouTube" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>';
      }
    }
    externalMarkup = '<section class="post-external"><strong>' + provider + '</strong>' + (embed || '<p>A incorporação depende das permissões do serviço. Abra o conteúdo original se não houver reprodução disponível.</p>') + '<a href="' + escapeHtml(externalUrl.href) + '" target="_blank" rel="noopener noreferrer">Abrir conteúdo original ↗</a></section>';
  }
  const mediaMarkup = (post.media || []).map((item) => {
    if (!item.signedUrl) return `<div class="media-unavailable" role="status">Mídia temporariamente indisponível.</div>`;
    const source = escapeHtml(item.signedUrl);
    const alt = escapeHtml(item.alt_text || (item.kind === "video" ? "Vídeo compartilhado no Looply" : "Imagem compartilhada no Looply"));
    return item.kind === "video"
      ? `<figure class="post-media"><video src="${source}" controls preload="metadata" aria-label="${alt}"></video>${item.alt_text ? `<figcaption>${escapeHtml(item.alt_text)}</figcaption>` : ""}</figure>`
      : `<figure class="post-media"><img src="${source}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">${item.alt_text ? `<figcaption>${escapeHtml(item.alt_text)}</figcaption>` : ""}</figure>`;
  }).join("");

  return `<article class="post-card" id="post-${escapeHtml(post.id)}" data-post-card="${escapeHtml(post.id)}">
    <header class="post-header">
      <div class="post-author"><span class="post-avatar" aria-hidden="true">${post.author?.avatarUrl ? '<img src="' + escapeHtml(post.author.avatarUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : escapeHtml((post.author?.display_name || post.author?.username || "M").slice(0, 1).toLocaleUpperCase("pt-BR"))}</span>
        <div><strong>${profileLabel(post.author)}</strong><time datetime="${escapeHtml(post.created_at)}">${escapeHtml(formatDate(post.created_at))}</time></div>
      </div>
      <div class="post-controls"><span class="visibility-pill">${labels[post.visibility] || "Publicação"}</span>${post.author_id === userId ? `<button class="post-delete-button" type="button" data-delete-post="${escapeHtml(post.id)}" aria-label="Excluir sua publicação">Excluir</button>` : ""}</div>
    </header>
    <p class="post-body">${escapeHtml(post.body)}</p>
    ${mediaMarkup ? `<div class="post-media-grid">${mediaMarkup}</div>` : ""}
    ${externalMarkup}
    <div class="post-interactions">
      <button class="post-icon-button post-like-button${liked ? " is-liked" : ""}" type="button" data-toggle-like="${escapeHtml(post.id)}" aria-pressed="${liked ? "true" : "false"}" aria-label="${liked ? "Descurtir publicação" : "Curtir publicação"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.7c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>${likeCount}</span></button>
      <button class="post-icon-button" type="button" data-share-post="${escapeHtml(post.id)}" aria-label="Compartilhar publicação"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Compartilhar</span></button>
      ${post.author_id !== userId ? '<button class="post-icon-button" type="button" data-private-reply="' + escapeHtml(post.author_id) + '" data-private-post="' + escapeHtml(post.id) + '">Responder em particular</button>' : ""}
      <span class="post-action-status" data-post-status="${escapeHtml(post.id)}" role="status" aria-live="polite"></span>
    </div>
    <section class="post-comments" aria-label="Comentários">
      <h3>Comentários <span>${comments.length}</span></h3>
      <div class="comment-list">${commentList}</div>
      <form class="comment-form" data-social-comment data-post-id="${escapeHtml(post.id)}">
        <label class="visually-hidden" for="comment-${escapeHtml(post.id)}">Adicionar comentário</label>
        <textarea id="comment-${escapeHtml(post.id)}" name="body" maxlength="2000" required placeholder="Escreva um comentário..."></textarea>
        ${commentAttachmentField("new", post.id)}
        <button class="text-button" type="submit">Comentar</button>
        <span class="form-status" data-status role="status" aria-live="polite"></span>
      </form>
    </section>
  </article>`;
}

async function loadPosts(client) {
  const { data, error } = await client
    .from("posts")
    .select("id,author_id,body,visibility,external_url,created_at,author:profiles!posts_author_id_fkey(id,username,display_name,avatar_path),comments(id,post_id,author_id,parent_comment_id,body,created_at,author:profiles!comments_author_id_fkey(id,username,display_name,avatar_path),media:comment_media(id,storage_path,mime_type,byte_size,created_at)),media:post_media(id,storage_path,kind,mime_type,byte_size,alt_text,created_at)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  const posts = data || [];
  if (posts.length) {
    const { data: currentUserData } = await client.auth.getUser();
    const currentUserId = currentUserData?.user?.id;
    const postIds = posts.map((post) => post.id);
    const [{ data: likes, error: likesError }, { data: mine, error: mineError }] = await Promise.all([
      client.from("post_likes").select("post_id").in("post_id", postIds),
      currentUserId ? client.from("post_likes").select("post_id").in("post_id", postIds).eq("user_id", currentUserId) : Promise.resolve({data:[],error:null})
    ]);
    if (likesError) throw likesError;
    if (mineError) throw mineError;
    const counts = new Map();
    for (const like of likes || []) counts.set(like.post_id, (counts.get(like.post_id) || 0) + 1);
    const mineIds = new Set((mine || []).map((like) => like.post_id));
    for (const post of posts) { post.likeCount = counts.get(post.id) || 0; post.likedByMe = mineIds.has(post.id); }
  }
  const profileRows = [];
  for (const post of posts) {
    if (post.author) profileRows.push(post.author);
    for (const comment of post.comments || []) if (comment.author) profileRows.push(comment.author);
  }
  const signedProfiles = await signProfileAvatars(client, [...new Map(profileRows.filter((p) => p.id).map((p) => [p.id, p])).values()]);
  const profilesById = new Map(signedProfiles.map((p) => [p.id, p]));
  for (const post of posts) {
    if (post.author) post.author = profilesById.get(post.author.id) || post.author;
    for (const comment of post.comments || []) if (comment.author) comment.author = profilesById.get(comment.author.id) || comment.author;
  }
  const media = posts.flatMap((post) => (post.media || []).map((item) => ({ ...item, postId: post.id })));
  const commentMedia = posts.flatMap((post) => (post.comments || []).flatMap((comment) =>
    (comment.media || []).map((item) => Object.assign(item, { commentId: comment.id }))));
  const allMedia = [...media, ...commentMedia];
  if (allMedia.length) {
    const { data: signed, error: signedError } = await client.storage
      .from("looply-media")
      .createSignedUrls(allMedia.map((item) => item.storage_path), 1800);
    if (!signedError && signed) {
      allMedia.forEach((item, index) => { item.signedUrl = signed[index]?.signedUrl || null; });
    }
    const byPost = new Map();
    for (const item of media) {
      const items = byPost.get(item.postId) || [];
      items.push(item);
      byPost.set(item.postId, items);
    }
    for (const post of posts) post.media = byPost.get(post.id) || [];
  }
  return posts;
}

const mediaExtensions = new Map([
  ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"],
  ["video/mp4", "mp4"], ["video/webm", "webm"]
]);
const maxMediaBytes = 100 * 1024 * 1024;
const maxMediaCount = 8;
const maxCommentMediaCount = 4;

function selectedMedia(formData) {
  const files = formData.getAll("media").filter((file) => file instanceof File && file.size > 0);
  if (files.length > maxMediaCount) throw new Error("too many files");
  for (const file of files) {
    if (!mediaExtensions.has(file.type) || file.size > maxMediaBytes) throw new Error("unsupported file");
  }
  return files;
}

function selectedCommentMedia(formData) {
  const files = formData.getAll("commentMedia").filter((file) => file instanceof File && file.size > 0);
  if (files.length > maxCommentMediaCount) throw new Error("too many comment files");
  for (const file of files) {
    if (!mediaExtensions.has(file.type) || file.size > maxMediaBytes) throw new Error("unsupported file");
  }
  return files;
}

export async function uploadResumable(client, path, file, onProgress) {
  const { data, error } = await client.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (error || !accessToken) throw new Error("session expired");
  const publishableKey = window.LOOPLY_CONFIG?.publishableKey;
  if (!publishableKey) throw new Error("Supabase publishable key is missing.");
  if (file.size <= 6 * 1024 * 1024) {
    const { error: uploadError } = await client.storage.from("looply-media").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream",
      upsert: false
    });
    if (uploadError) throw uploadError;
    onProgress(100);
    return;
  }
  const projectUrl = new URL(window.LOOPLY_CONFIG.supabaseUrl);
  const endpoint = projectUrl.hostname.endsWith(".supabase.co")
    ? `${projectUrl.protocol}//${projectUrl.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co")}/storage/v1/upload/resumable`
    : new URL("/storage/v1/upload/resumable", projectUrl).toString();
  const tus = await import("https://esm.sh/tus-js-client@4.3.1");
  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${accessToken}`, apikey: publishableKey },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: "looply-media", objectName: path, contentType: file.type, cacheControl: "3600" },
      onError: reject,
      onProgress: (uploaded, total) => onProgress(Math.floor((uploaded / total) * 100)),
      onSuccess: resolve
    });
    upload.start();
  });
}

export async function loadSocialData(client) {
  const [peopleResult, postsResult] = await Promise.all([
    client.from("profiles").select("id,username,display_name,profile_visibility").order("username").limit(100),
    loadPosts(client).then((posts) => ({ posts }), (error) => ({ error }))
  ]);
  return {
    people: peopleResult.data || [],
    peopleError: peopleResult.error,
    posts: postsResult.posts || [],
    postsError: postsResult.error
  };
}

function feedMarkup(posts, error, userId) {
  if (error) {
    return `<div class="social-message social-error" role="alert">O feed não carregou. Confira a conexão e as permissões e tente atualizar.
      <button class="text-button" type="button" data-social-action="refresh">Atualizar feed</button></div>`;
  }
  if (!posts.length) {
    return `<div class="social-message"><strong>Nenhuma publicação ainda.</strong></div>`;
  }
  return posts.map((post) => postMarkup(post, userId)).join("");
}

export function socialMarkup({ people, peopleError, posts, postsError }, userId) {
  const eligiblePeople = (people || []).filter((person) =>
    person.id !== userId && person.profile_visibility !== "private"
  );
  const recipients = eligiblePeople.map((person) =>
    `<option value="${escapeHtml(person.id)}">${escapeHtml(person.display_name || person.username)} · @${escapeHtml(person.username)}</option>`
  ).join("");
  const peopleHint = peopleError
    ? `<span class="field-hint field-error">Não foi possível carregar os perfis. As publicações escolhidas ficarão indisponíveis até atualizar a página.</span>`
    : eligiblePeople.length
      ? `<span class="field-hint">Escolha de 1 a 20 perfis visíveis. Só as pessoas selecionadas terão acesso.</span>`
      : `<span class="field-hint">Não há outros perfis visíveis para compartilhar ainda.</span>`;

  return `<section class="social-area" aria-labelledby="socialTitle">
    <div class="social-heading"><div><span class="section-kicker">Publicações</span><h2 id="socialTitle">Feed</h2></div>
      <span class="realtime-state" data-realtime-status role="status">Conectando atualizações...</span></div>
    <form class="post-composer" data-social-post>
      <header class="post-composer-heading"><strong>Nova publicação</strong><button class="post-add-button" type="button" data-toggle-composer aria-expanded="false" aria-controls="postComposerFields" aria-label="Abrir formulário de nova publicação" title="Nova publicação"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></header>
      <div class="post-composer-fields" id="postComposerFields" data-composer-fields hidden>
      <label for="postBody">Texto</label>
      <textarea id="postBody" name="body" maxlength="5000" required placeholder="Escreva uma publicação"></textarea>
      <label class="media-picker-label" for="postFiles">Fotos e vídeos <span>até 8 arquivos, 100 MB por arquivo</span></label>
      <input id="postFiles" name="media" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm">
      <label for="postExternalUrl">Link externo (Instagram, TikTok ou YouTube)</label>
      <input id="postExternalUrl" name="externalUrl" type="url" inputmode="url" maxlength="2048" placeholder="https://..." autocomplete="url">
      <span class="field-hint">YouTube pode ser incorporado quando compatível. Instagram e TikTok abrem o conteúdo original quando a incorporação não é autorizada.</span>
      <label class="visually-hidden" for="mediaAlt">Descrição das mídias</label>
      <input id="mediaAlt" name="altText" class="media-alt-input" type="text" maxlength="500" placeholder="Descrição acessível das fotos ou vídeos (opcional)">
      <div class="composer-options">
        <label for="postVisibility">Quem pode ver?</label>
        <select id="postVisibility" name="visibility">
          <option value="public">Público</option>
          <option value="private">Só eu</option>
          <option value="selected">Pessoas escolhidas</option>
        </select>
        <button class="primary-button compact-button" type="submit">Publicar <span aria-hidden="true">↗</span></button>
      </div>
      <div class="recipient-picker" data-recipient-picker hidden>
        <label for="postRecipients">Escolha quem poderá ver</label>
        <select id="postRecipients" name="recipientIds" multiple size="4" ${people.length ? "" : "disabled"}>${recipients}</select>
        ${peopleHint}
      </div>
      <div class="form-status" data-status role="status" aria-live="polite"></div>
      </div>
    </form>
    <div class="feed-list" data-social-feed>${feedMarkup(posts, postsError, userId)}</div>
  </section>`;
}

function setStatus(form, message, isError = false) {
  const target = form.querySelector("[data-status]");
  if (!target) return;
  target.textContent = message;
  target.dataset.kind = isError ? "error" : "success";
}

function explainWriteError(error) {
  console.error("Looply social action failed", error);
  const message = String(error?.message || "");
  if (/too many files/i.test(message)) return "Escolha no máximo 8 arquivos para esta publicação.";
  if (/too many comment files/i.test(message)) return "Anexe no máximo 4 fotos ou vídeos a cada comentário.";
  if (/unsupported file/i.test(message)) return "Use uma foto JPEG, PNG ou WebP, ou um vídeo MP4 ou WebM de até 100 MB.";
  if (/duplicate|unique/i.test(message)) return "Essa publicação ou interação já foi registrada.";
  if (/permission|policy|row-level|42501/i.test(message)) return "Sua conta não tem permissão para essa ação ou o conteúdo não está mais disponível.";
  if (/recipient|recipients/i.test(message)) return "Revise os perfis escolhidos para compartilhar.";
  return "Não foi possível salvar agora. Confira sua conexão e tente novamente.";
}

export async function refreshSocialFeed(root, client, userId) {
  const feed = root.querySelector("[data-social-feed]");
  if (!feed || !client) return;
  feed.setAttribute("aria-busy", "true");
  try {
    const posts = await loadPosts(client);
    const currentUserId = userId || (await client.auth.getUser()).data.user?.id;
    feed.innerHTML = feedMarkup(posts, null, currentUserId);
  } catch (error) {
    feed.innerHTML = feedMarkup([], error);
  } finally {
    feed.removeAttribute("aria-busy");
  }
}

export function bindSocialEvents(root, client, getUserId) {
  root.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-composer]");
    if (!toggle) return;
    const fields = root.querySelector("[data-composer-fields]");
    if (!fields) return;
    fields.hidden = !fields.hidden;
    toggle.setAttribute("aria-expanded", String(!fields.hidden));
    toggle.setAttribute("aria-label", fields.hidden ? "Abrir formulário de nova publicação" : "Fechar formulário de nova publicação");
    if (!fields.hidden) root.querySelector("#postBody")?.focus({ preventScroll: true });
  });

  root.addEventListener("change", (event) => {
    if (event.target.matches("#postVisibility")) {
      const picker = root.querySelector("[data-recipient-picker]");
      if (picker) picker.hidden = event.target.value !== "selected";
    }
    if (event.target.matches('input[name="commentMedia"]')) {
      const label = root.querySelector(`label[for="${CSS.escape(event.target.id)}"] span`);
      if (label) label.textContent = event.target.files.length
        ? `${event.target.files.length} arquivo(s) selecionado(s) · até 4`
        : "Você pode escolher pela galeria ou câmera do celular.";
    }
  });

  root.addEventListener("click", async (event) => {
    if (event.target.closest('[data-social-action="refresh"]')) refreshSocialFeed(root, client, getUserId?.());
    const privateReply = event.target.closest("[data-private-reply]");
    if (privateReply && client) {
      const authorId = privateReply.dataset.privateReply;
      const postId = privateReply.dataset.privatePost;
      if (!authorId || !postId || privateReply.disabled) return;
      privateReply.disabled = true;
      try {
        const { data: conversationId, error } = await client.rpc("create_direct_conversation", { p_target_id: authorId });
        if (error) throw error;
        const sourceUrl = new URL("home.html#post-" + encodeURIComponent(postId), window.location.href).href;
        window.location.href = "chat.html?conversation=" + encodeURIComponent(conversationId) + "&post=" + encodeURIComponent(sourceUrl);
      } catch (error) {
        console.error("Looply private post reply failed", error);
        const status = root.querySelector('[data-post-status="' + CSS.escape(postId) + '"]');
        if (status) status.textContent = explainWriteError(error);
      } finally { privateReply.disabled = false; }
      return;
    }
    const likeButton = event.target.closest("[data-toggle-like]");
    if (likeButton && client) {
      const postId = likeButton.dataset.toggleLike;
      const userId = getUserId?.();
      if (!postId || !userId || likeButton.disabled) return;
      likeButton.disabled = true;
      try {
        if (likeButton.getAttribute("aria-pressed") === "true") {
          const { error } = await client.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
          if (error) throw error;
        } else {
          const { error } = await client.from("post_likes").upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
          if (error) throw error;
        }
        await refreshSocialFeed(root, client, userId);
      } catch (error) {
        console.error("Looply post like failed", error);
        const status = root.querySelector('[data-post-status="' + CSS.escape(postId) + '"]');
        if (status) status.textContent = explainWriteError(error);
      } finally { likeButton.disabled = false; }
      return;
    }
    const shareButton = event.target.closest("[data-share-post]");
    if (shareButton) {
      const postId = shareButton.dataset.sharePost;
      const url = new URL("home.html#post-" + encodeURIComponent(postId), window.location.href).href;
      try {
        if (navigator.share) await navigator.share({ title: "Publicação no Looply", url });
        else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
        else window.prompt("Copie o link da publicação", url);
        const status = root.querySelector('[data-post-status="' + CSS.escape(postId) + '"]');
        if (status) status.textContent = "Link pronto para compartilhar.";
      } catch (error) {
        if (error?.name !== "AbortError") {
          const status = root.querySelector('[data-post-status="' + CSS.escape(postId) + '"]');
          if (status) status.textContent = "Não foi possível compartilhar agora.";
        }
      }
      return;
    }
    const deleteButton = event.target.closest("[data-delete-post]");
    if (!deleteButton || !client) return;
    const userId = getUserId?.();
    if (!userId || !window.confirm("Excluir esta publicação e todas as mídias e comentários associados? Esta ação não pode ser desfeita.")) return;
    deleteButton.disabled = true;
    try {
      const postId = deleteButton.dataset.deletePost;
      const { data: media, error: mediaError } = await client.from("post_media").select("storage_path").eq("post_id", postId);
      if (mediaError) throw mediaError;
      const { data: commentMedia, error: commentMediaError } = await client.from("comment_media").select("storage_path").eq("post_id", postId);
      if (commentMediaError) throw commentMediaError;
      const paths = [...(media || []).map((item) => item.storage_path), ...(commentMedia || []).map((item) => item.storage_path)];
      if (paths.length) {
        const { error } = await client.storage.from("looply-media").remove(paths);
        if (error) throw error;
      }
      const { error } = await client.from("posts").delete().eq("id", postId).eq("author_id", userId);
      if (error) throw error;
      await refreshSocialFeed(root, client, userId);
    } catch (error) {
      console.error("Looply post deletion failed", error);
      const feedback = document.createElement("p");
      feedback.className = "social-message social-error";
      feedback.setAttribute("role", "alert");
      feedback.textContent = "Não foi possível excluir a publicação. Ela continua salva; tente novamente.";
      root.querySelector("[data-social-feed]")?.prepend(feedback);
    } finally {
      deleteButton.disabled = false;
    }
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-social-post], form[data-social-comment]");
    if (!form || !client) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    let createdPostId = null;
    let createdCommentId = null;
    const uploadedPaths = [];
    try {
      const formData = new FormData(form);
      const body = String(formData.get("body") || "").trim();
      if (!body) throw new Error("empty body");
      if (form.matches("[data-social-post]")) {
        const files = selectedMedia(formData);
        const visibility = String(formData.get("visibility") || "public");
        const externalUrl = String(formData.get("externalUrl") || "").trim();
        if (!["public", "private", "selected"].includes(visibility)) throw new Error("invalid visibility");
        if (externalUrl) {
          let parsed;
          try { parsed = new URL(externalUrl); } catch { throw new Error("unsupported external URL"); }
          const allowedHosts = ["instagram.com","www.instagram.com","tiktok.com","www.tiktok.com","vm.tiktok.com","youtube.com","www.youtube.com","m.youtube.com","youtu.be"];
          if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname.toLowerCase())) throw new Error("unsupported external URL");
        }
        if (visibility === "selected") {
          const recipientIds = formData.getAll("recipientIds").map(String);
          if (recipientIds.length < 1 || recipientIds.length > 20) throw new Error("invalid recipients");
          const { data, error } = await client.rpc("create_selected_post", { p_body: body, p_recipient_ids: recipientIds });
          if (error) throw error;
          createdPostId = data;
        } else {
          const { data, error } = await client.from("posts").insert({ body, visibility, external_url: externalUrl || null }).select("id").single();
          if (error) throw error;
          createdPostId = data.id;
        }
        const altText = String(formData.get("altText") || "").trim().slice(0, 500);
        for (const [index, file] of files.entries()) {
          const extension = mediaExtensions.get(file.type);
          const mediaId = crypto.randomUUID();
          const path = `posts/${createdPostId}/${mediaId}.${extension}`;
          setStatus(form, `Enviando arquivo ${index + 1} de ${files.length}: 0%`);
          uploadedPaths.push(path);
          await uploadResumable(client, path, file, (percentage) => {
            setStatus(form, `Enviando arquivo ${index + 1} de ${files.length}: ${percentage}%`);
          });
          const { error: mediaError } = await client.from("post_media").insert({
            post_id: createdPostId,
            storage_path: path,
            kind: file.type.startsWith("video/") ? "video" : "image",
            mime_type: file.type,
            byte_size: file.size,
            alt_text: altText
          });
          if (mediaError) throw mediaError;
        }
        if (visibility === "selected" && externalUrl) {
          const { error: linkError } = await client.from("posts").update({ external_url: externalUrl }).eq("id", createdPostId);
          if (linkError) throw linkError;
        }
        form.reset();
        const composerFields = root.querySelector("[data-composer-fields]");
        const composerToggle = root.querySelector("[data-toggle-composer]");
        if (composerFields) composerFields.hidden = true;
        if (composerToggle) { composerToggle.setAttribute("aria-expanded", "false"); composerToggle.setAttribute("aria-label", "Abrir formulário de nova publicação"); }
        const picker = root.querySelector("[data-recipient-picker]");
        if (picker) picker.hidden = true;
        setStatus(form, files.length ? "Sua publicação e as mídias foram salvas." : "Sua publicação foi salva.");
      } else {
        const postId = form.dataset.postId;
        const parentCommentId = form.dataset.parentCommentId || null;
        const files = selectedCommentMedia(formData);
        const { data: comment, error } = await client.from("comments").insert({ post_id: postId, parent_comment_id: parentCommentId, body }).select("id").single();
        if (error) throw error;
        createdCommentId = comment.id;
        for (const [index, file] of files.entries()) {
          const path = `comments/${postId}/${comment.id}/${crypto.randomUUID()}.${mediaExtensions.get(file.type)}`;
          setStatus(form, `Enviando anexo ${index + 1} de ${files.length}: 0%`);
          uploadedPaths.push(path);
          await uploadResumable(client, path, file, (percentage) => setStatus(form, `Enviando anexo ${index + 1} de ${files.length}: ${percentage}%`));
          const { error: mediaError } = await client.from("comment_media").insert({
            comment_id: comment.id, post_id: postId, storage_path: path, mime_type: file.type, byte_size: file.size
          });
          if (mediaError) throw mediaError;
        }
        form.reset();
        setStatus(form, parentCommentId ? "Sua resposta foi salva." : "Seu comentário foi salvo.");
      }
      await refreshSocialFeed(root, client);
    } catch (error) {
      if (createdPostId) {
        if (uploadedPaths.length) {
          const { error: cleanupError } = await client.storage.from("looply-media").remove(uploadedPaths);
          if (cleanupError) console.error("Could not clean up uploaded media", cleanupError);
        }
        const { error: deleteError } = await client.from("posts").delete().eq("id", createdPostId);
        if (deleteError) console.error("Could not clean up partially created post", deleteError);
      }
      if (createdCommentId) {
        if (uploadedPaths.length) {
          const { error: cleanupError } = await client.storage.from("looply-media").remove(uploadedPaths);
          if (cleanupError) console.error("Could not clean up uploaded comment media", cleanupError);
        }
        const { error: deleteError } = await client.from("comments").delete().eq("id", createdCommentId);
        if (deleteError) console.error("Could not clean up partially created comment", deleteError);
      }
      setStatus(form, explainWriteError(error), true);
      if (button) button.disabled = false;
    } finally {
      if (button) button.disabled = false;
    }
  });
}

let realtimeChannel = null;
let realtimeUserId = null;
let refreshTimer = null;

export function setupSocialRealtime(client, userId, root) {
  if (!client || !userId) return;
  if (realtimeChannel && realtimeUserId === userId) return;
  if (realtimeChannel) client.removeChannel(realtimeChannel);
  realtimeUserId = userId;
  const status = root.querySelector("[data-realtime-status]");
  realtimeChannel = client
    .channel(`looply-social-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => scheduleRefresh(root, client, userId))
    .on("postgres_changes", { event: "*", schema: "public", table: "post_media" }, () => scheduleRefresh(root, client, userId))
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => scheduleRefresh(root, client, userId))
    .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, () => scheduleRefresh(root, client, userId))
    .on("postgres_changes", { event: "*", schema: "public", table: "comment_media" }, () => scheduleRefresh(root, client, userId))
    .subscribe((state) => {
      const currentStatus = root.querySelector("[data-realtime-status]");
      if (!currentStatus) return;
      currentStatus.textContent = state === "SUBSCRIBED" ? "Atualizações ao vivo" : "Reconectando atualizações...";
    });
}

function scheduleRefresh(root, client, userId) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshSocialFeed(root, client, userId), 350);
}

export function disposeSocialRealtime(client) {
  clearTimeout(refreshTimer);
  if (realtimeChannel && client) client.removeChannel(realtimeChannel);
  realtimeChannel = null;
  realtimeUserId = null;
}
