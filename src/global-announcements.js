const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export async function mountGlobalAnnouncements({ client, user, profileId }) {
  if (!client || !user?.id || !profileId) return () => {};
  // The Neon Auth account UUID is different from the Looply profile UUID.
  // RLS for global_announcement_reads requires the verified legacy profile ID.
  const receiptUserId = profileId;

  let disposed = false;
  let currentOverlay = null;
  const knownRead = new Set();
  const queued = new Map();
  const presented = new Set();
  const preparing = new Set();

  function presentNext() {
    if (disposed || currentOverlay || !queued.size) return;
    const [id, announcement] = queued.entries().next().value;
    queued.delete(id);
    if (knownRead.has(id) || presented.has(id)) return presentNext();
    presented.add(id);

    const overlay = document.createElement("div");
    overlay.className = "looply-announcement-overlay";
    overlay.setAttribute("role", "presentation");
    const card = document.createElement("section");
    card.className = "looply-announcement-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "looply-announcement-title");
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "looply-announcement-close";
    closeButton.setAttribute("aria-label", "Fechar temporariamente");
    closeButton.textContent = "×";
    const kicker = document.createElement("p");
    kicker.className = "looply-announcement-kicker";
    kicker.textContent = "Comunicado Looply";
    const title = document.createElement("h2");
    title.id = "looply-announcement-title";
    title.textContent = announcement.title;
    const body = document.createElement("p");
    body.className = "looply-announcement-body";
    body.textContent = announcement.body;
    let media = null;
    if (announcement.media_url) {
      const mediaLink = document.createElement("a");
      mediaLink.className = "looply-announcement-media-link";
      mediaLink.href = announcement.media_url;
      mediaLink.target = "_blank";
      mediaLink.rel = "noopener noreferrer";
      mediaLink.setAttribute("aria-label", "Abrir mídia do comunicado em tamanho original");
      media = document.createElement(announcement.media_kind === "video" ? "video" : "img");
      media.className = "looply-announcement-media";
      media.src = announcement.media_url;
      if (media.tagName === "VIDEO") { media.controls = true; media.playsInline = true; media.preload = "metadata"; }
      else { media.alt = "Mídia do comunicado"; media.loading = "lazy"; }
      mediaLink.append(media);
      mediaLink.addEventListener("click", (event) => { if (event.target === media) { /* open original in a new tab */ } });
      card.append(closeButton);
      card.append(kicker, title, body, mediaLink);
    } else {
      card.append(closeButton, kicker, title, body);
    }
    const status = document.createElement("p");
    status.className = "looply-announcement-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const actions = document.createElement("div");
    actions.className = "looply-announcement-actions";
    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.textContent = "Marcar como lido";
    actions.append(readButton);
    card.append(status, actions);
    overlay.append(card);
    document.body.append(overlay);
    currentOverlay = overlay;
    closeButton.addEventListener("click", () => {
      overlay.classList.add("is-closing");
      window.setTimeout(() => {
        if (currentOverlay !== overlay) return;
        overlay.remove();
        currentOverlay = null;
        presentNext();
      }, 180);
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeButton.click();
    });
    readButton.focus();

    readButton.addEventListener("click", async () => {
      if (readButton.disabled) return;
      readButton.disabled = true;
      status.textContent = "Registrando leitura…";
      try {
        // The server resolves the verified Looply identity itself. This
        // acknowledgment is idempotent even when a different device read first.
        const { data, error } = await client.rpc("v23_mark_global_announcement_read", {
          p_announcement_id: announcement.id
        });
        if (error || data !== true) throw error || Error("announcement_ack_unconfirmed");
        knownRead.add(announcement.id);
        overlay.remove();
        currentOverlay = null;
        presentNext();
      } catch (error) {
        console.warn("Looply announcement read receipt failed", error);
        status.textContent = "Não foi possível registrar a leitura. Confira a conexão e tente novamente.";
        readButton.disabled = false;
      }
    });
  }

  async function enqueue(announcement) {
    if (disposed || !announcement?.id || knownRead.has(announcement.id) || presented.has(announcement.id)
      || preparing.has(announcement.id) || queued.has(announcement.id)) return;
    if (announcement.is_active === false) return;
    const now = Date.now();
    if (announcement.starts_at && new Date(announcement.starts_at).valueOf() > now) return;
    if (announcement.expires_at && new Date(announcement.expires_at).valueOf() <= now) return;
    preparing.add(announcement.id);
    try {
      const path = String(announcement.media_url || "");
      if (/^announcements\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp|gif|mp4|webm)$/i.test(path)) {
        const media_kind = /\.(mp4|webm)$/i.test(path) ? "video" : "image";
        const {data:signed,error}=await client.storage.from("looply-announcements").createSignedUrl(path,1800);
        announcement={...announcement,media_url:error?null:signed?.signedUrl||null,media_kind};
      } else if(path && !/^https:\/\//.test(path)) {
        announcement={...announcement,media_url:null};
      }
      if (!disposed && !knownRead.has(announcement.id) && !presented.has(announcement.id)) {
        queued.set(announcement.id,announcement);
        presentNext();
      }
    } catch(error) {
      console.warn("Looply announcement media could not be signed",error);
      if (!disposed && !knownRead.has(announcement.id)) {
        queued.set(announcement.id,{...announcement,media_url:null});
        presentNext();
      }
    } finally {preparing.delete(announcement.id);}
  }

  const channel = client.channel(`looply-announcements-${user.id}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "global_announcements" }, ({ new: announcement }) => { void enqueue(announcement); })
    .subscribe();

  try {
    const now = new Date().toISOString();
    const { data: announcements, error } = await client.from("global_announcements")
      .select("id,title,body,media_url,created_at,starts_at,expires_at,is_active")
      .eq("is_active", true)
      .lte("starts_at", now)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const ids = (announcements || []).map((item) => item.id);
    if (ids.length) {
      const { data: reads, error: readsError } = await client.from("global_announcement_reads")
        .select("announcement_id").eq("user_id", receiptUserId).in("announcement_id", ids);
      if (readsError) throw readsError;
      (reads || []).forEach((row) => knownRead.add(row.announcement_id));
    }
    (announcements || []).forEach(item => { void enqueue(item); });
  } catch (error) {
    console.warn("Looply global announcements could not be loaded", error);
  }

  return () => {
    disposed = true;
    queued.clear();
    currentOverlay?.remove();
    currentOverlay = null;
    void client.removeChannel(channel);
  };
}
