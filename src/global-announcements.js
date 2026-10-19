const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export async function mountGlobalAnnouncements({ client, user }) {
  if (!client || !user?.id) return () => {};

  let disposed = false;
  let currentOverlay = null;
  const knownRead = new Set();
  const queued = new Map();
  const presented = new Set();

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
    const kicker = document.createElement("p");
    kicker.className = "looply-announcement-kicker";
    kicker.textContent = "Comunicado Looply";
    const title = document.createElement("h2");
    title.id = "looply-announcement-title";
    title.textContent = announcement.title;
    const body = document.createElement("p");
    body.className = "looply-announcement-body";
    body.textContent = announcement.body;
    const status = document.createElement("p");
    status.className = "looply-announcement-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const actions = document.createElement("div");
    actions.className = "looply-announcement-actions";
    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.textContent = "Li o comunicado";
    actions.append(readButton);
    card.append(kicker, title, body, status, actions);
    overlay.append(card);
    document.body.append(overlay);
    currentOverlay = overlay;
    readButton.focus();

    readButton.addEventListener("click", async () => {
      if (readButton.disabled) return;
      readButton.disabled = true;
      status.textContent = "Registrando leitura…";
      try {
        const { error } = await client.from("global_announcement_reads").insert({
          announcement_id: announcement.id,
          user_id: user.id
        });
        if (error && error.code !== "23505") throw error;
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

  function enqueue(announcement) {
    if (disposed || !announcement?.id || knownRead.has(announcement.id) || presented.has(announcement.id)) return;
    if (announcement.is_active === false) return;
    const now = Date.now();
    if (announcement.starts_at && new Date(announcement.starts_at).valueOf() > now) return;
    if (announcement.expires_at && new Date(announcement.expires_at).valueOf() <= now) return;
    queued.set(announcement.id, announcement);
    presentNext();
  }

  const channel = client.channel(`looply-announcements-${user.id}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "global_announcements" }, ({ new: announcement }) => enqueue(announcement))
    .subscribe();

  try {
    const now = new Date().toISOString();
    const { data: announcements, error } = await client.from("global_announcements")
      .select("id,title,body,created_at,starts_at,expires_at,is_active")
      .eq("is_active", true)
      .lte("starts_at", now)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    const ids = (announcements || []).map((item) => item.id);
    if (ids.length) {
      const { data: reads, error: readsError } = await client.from("global_announcement_reads")
        .select("announcement_id").eq("user_id", user.id).in("announcement_id", ids);
      if (readsError) throw readsError;
      (reads || []).forEach((row) => knownRead.add(row.announcement_id));
    }
    (announcements || []).forEach(enqueue);
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
