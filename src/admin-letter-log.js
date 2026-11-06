// Silent audit log of private-letter reads and unlocks, shown only in the ADM panel.
// Nothing here creates notifications: rows are written by the database and are
// readable only by the verified Peixinho administrator (RLS).
const PAGE_SIZE = 25;
const TABLE = "looply_admin_letter_access_log";
const SELECT = "id,event_kind,letter_source,letter_id,letter_label,created_at,"
  + "actor:profiles!looply_admin_letter_access_log_actor_id_fkey(username,display_name)";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const exactTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
});

export function formatLogTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const parts = Object.fromEntries(exactTime.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function letterLogRowMarkup(row) {
  const unlocked = row.event_kind === "unlock";
  const who = row.actor?.display_name || row.actor?.username || "Usuário removido";
  const handle = row.actor?.username ? `@${row.actor.username}` : "";
  const label = String(row.letter_label || "").trim() || (row.letter_source === "archive" ? "Carta original" : "Carta privada");
  const verb = unlocked ? "desbloqueou" : "leu";
  return `<li class="letter-log-row" data-letter-log-kind="${unlocked ? "unlock" : "read"}">
    <span class="letter-log-mark" aria-hidden="true">${unlocked
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="3"/></svg>'}</span>
    <span class="letter-log-copy">
      <strong>${escapeHtml(who)} <small>${escapeHtml(handle)}</small></strong>
      <span>${verb} <b>${escapeHtml(label)}</b></span>
      <time datetime="${escapeHtml(row.created_at)}">${escapeHtml(formatLogTimestamp(row.created_at))}</time>
    </span>
    <span class="letter-log-tag">${unlocked ? "Desbloqueio" : "Leitura"}</span>
  </li>`;
}

export function adminLetterLogMarkup() {
  return `<section class="admin-broadcast-panel letter-log-panel" aria-labelledby="letterLogTitle" data-letter-log>
    <div class="admin-broadcast-heading"><div><h3 id="letterLogTitle">Atividade de cartas privadas</h3></div>
      <button class="text-button" type="button" data-letter-log-refresh>Atualizar</button></div>
    <div class="letter-log-filters" role="tablist" aria-label="Filtrar registro">
      <button type="button" role="tab" aria-selected="true" data-letter-log-filter="all">Tudo</button>
      <button type="button" role="tab" aria-selected="false" data-letter-log-filter="unlock">Desbloqueios</button>
      <button type="button" role="tab" aria-selected="false" data-letter-log-filter="read">Leituras</button>
    </div>
    <ul class="letter-log-list" data-letter-log-list aria-live="polite"></ul>
    <p class="letter-log-status" data-letter-log-status role="status"></p>
    <button class="text-button letter-log-more" type="button" data-letter-log-more hidden>Carregar mais</button>
  </section>`;
}

export function mountAdminLetterLog(root, client, mountPoint = null) {
  const anchor = mountPoint || root.querySelector(".admin-description");
  if (!anchor || root.querySelector("[data-letter-log]")) return () => {};
  if (mountPoint) anchor.innerHTML = adminLetterLogMarkup();
  else anchor.insertAdjacentHTML("afterend", adminLetterLogMarkup());
  const panel = root.querySelector("[data-letter-log]");
  const list = panel.querySelector("[data-letter-log-list]");
  const status = panel.querySelector("[data-letter-log-status]");
  const more = panel.querySelector("[data-letter-log-more]");
  let filter = "all", offset = 0, loading = false, stopped = false, signature = "";

  async function load({ append = false } = {}) {
    if (loading || stopped) return;
    loading = true;
    status.textContent = append ? "Carregando…" : "";
    try {
      const from = append ? offset : 0;
      let query = client.from(TABLE).select(SELECT);
      if (filter !== "all") query = query.eq("event_kind", filter);
      const { data, error } = await query
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data || [];
      if (!append) {
        const next = rows.map(row => row.id).join(",");
        if (next === signature && list.childElementCount) { loading = false; return; }
        signature = next;
        list.innerHTML = rows.map(letterLogRowMarkup).join("");
        offset = rows.length;
      } else {
        list.insertAdjacentHTML("beforeend", rows.map(letterLogRowMarkup).join(""));
        offset += rows.length;
      }
      more.hidden = rows.length < PAGE_SIZE;
      status.textContent = list.childElementCount ? "" : "Nenhuma leitura ou desbloqueio registrado ainda.";
    } catch (error) {
      console.error("Looply private-letter log unavailable", error);
      status.textContent = "Não foi possível carregar o registro. Confirme se a atualização do banco foi aplicada.";
    } finally { loading = false; }
  }

  panel.addEventListener("click", event => {
    const tab = event.target.closest("[data-letter-log-filter]");
    if (tab) {
      filter = tab.dataset.letterLogFilter; signature = "";
      panel.querySelectorAll("[data-letter-log-filter]").forEach(button =>
        button.setAttribute("aria-selected", String(button === tab)));
      void load();
      return;
    }
    if (event.target.closest("[data-letter-log-refresh]")) { signature = ""; void load(); return; }
    if (event.target.closest("[data-letter-log-more]")) void load({ append: true });
  });

  void load();
  // The log is quiet by design; a slow refresh keeps it current while the panel is open.
  const timer = setInterval(() => { if (document.visibilityState === "visible" && offset <= PAGE_SIZE) void load(); }, 20000);
  return () => { stopped = true; clearInterval(timer); };
}
