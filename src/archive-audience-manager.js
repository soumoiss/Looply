function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function bindArchiveGalleryControls(root) {
  const library = root.querySelector(".archive-media-library");
  if (!library) return;
  const apply = () => {
    const grid = library.querySelector("[data-archive-media-grid]");
    const tiles = grid ? [...grid.querySelectorAll(".archive-media-tile")] : [];
    const query = String(library.querySelector("[data-archive-gallery-search]")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const kind = library.querySelector("[data-archive-gallery-type]")?.value || "all";
    const access = library.querySelector("[data-archive-gallery-access]")?.value || "all";
    const view = library.querySelector("[data-archive-gallery-view][aria-pressed='true']")?.dataset.archiveGalleryView || "grid";
    let visible = 0;
    for (const tile of tiles) {
      const matches = (!query || String(tile.dataset.search || "").includes(query))
        && (kind === "all" || tile.dataset.kind === kind)
        && (access === "all" || tile.dataset.access === access);
      tile.hidden = !matches;
      if (matches) visible += 1;
    }
    if (grid) grid.dataset.view = view;
    const count = library.querySelector("[data-archive-media-count]");
    if (count) count.textContent = visible + " de " + tiles.length + " arquivo(s)";
    const empty = library.querySelector("[data-archive-gallery-empty]");
    if (empty) empty.hidden = visible > 0 || tiles.length === 0;
    root.dispatchEvent(new CustomEvent("archive-gallery-filter"));
  };
  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-archive-gallery-search]")) apply();
  });
  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-archive-gallery-type], [data-archive-gallery-access]")) apply();
  });
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-archive-gallery-view]");
    if (!button || !library.contains(button)) return;
    for (const option of library.querySelectorAll("[data-archive-gallery-view]")) {
      option.setAttribute("aria-pressed", String(option === button));
    }
    apply();
  });
  root.addEventListener("archive-gallery-refresh", apply);
  apply();
}

async function adminRequest(client, body) {
  const { data, error } = await client.functions.invoke("looply-admin", { body });
  if (error || data?.error) throw new Error(data?.error || error?.message || "A solicitação administrativa falhou.");
  return data || {};
}

function visibilityLabel(item) {
  if (item.visibility !== "exclusive") return "Visível para todos os membros";
  const recipients = Array.isArray(item.recipients) ? item.recipients : [];
  if (recipients.length === 1) return "Exclusivo para @" + (recipients[0].profile?.username || "usuário selecionado");
  return "Exclusivo para " + recipients.length + " usuários";
}

function mediaPreview(item) {
  const url = escapeHtml(item.signed_url || "");
  const title = escapeHtml(item.file_name || item.source_path);
  if (!url) return '<span class="archive-audience-preview-empty">Prévia indisponível</span>';
  if (item.kind === "image" && !String(item.mime_type || "").includes("heic")) return '<img src="' + url + '" alt="' + title + '" loading="lazy" referrerpolicy="no-referrer">';
  if (item.kind === "video") return '<video src="' + url + '" controls playsinline preload="metadata" aria-label="' + title + '"></video>';
  if (item.kind === "audio") return '<audio src="' + url + '" controls preload="metadata" aria-label="' + title + '"></audio>';
  return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">Abrir ' + title + '</a>';
}

function audienceItemMarkup(item, profiles) {
  const id = escapeHtml(item.id);
  const recipients = Array.isArray(item.recipients) ? item.recipients : [];
  const selectedId = item.visibility === "exclusive" && recipients.length === 1 ? String(recipients[0].user_id) : "";
  const needsChoice = item.visibility === "exclusive"
    && (!selectedId || !profiles.some((person) => String(person.id) === selectedId));
  const existingOption = needsChoice
    ? '<option value="__existing__" selected disabled>Exclusivo — escolha um destino</option>'
    : "";
  const people = profiles.map((person) => {
    const personId = escapeHtml(person.id);
    const display = escapeHtml(person.display_name || person.username || "Perfil");
    const username = escapeHtml(person.username || "");
    return '<option value="' + personId + '"' + (person.id === selectedId ? " selected" : "") + '>' + display + (username ? " · @" + username : "") + '</option>';
  }).join("");
  const options = '<option value=""' + (item.visibility === "exclusive" ? "" : " selected") + '>Todos os membros</option>' +
    existingOption + '<optgroup label="Exclusivo para">' + people + '</optgroup>';
  return '<article class="archive-audience-item" data-audience-item="' + id + '">' +
    '<div class="archive-audience-preview">' + mediaPreview(item) + '</div>' +
    '<div class="archive-audience-fields"><strong>' + escapeHtml(item.file_name || item.source_path) + '</strong>' +
    '<span data-audience-current>' + escapeHtml(visibilityLabel(item)) + '</span>' +
    '<label>Quem pode ver esta mídia<select data-audience-select data-media-id="' + id + '">' + options + '</select></label>' +
    '<button type="button" class="primary-button compact-button" data-save-audience data-media-id="' + id + '">Salvar acesso</button>' +
    '<span class="form-status" data-audience-status role="status" aria-live="polite"></span></div></article>';
}

export function bindArchiveAudienceManager(root, client, isAdmin) {
  if (!isAdmin) return;
  const library = root.querySelector(".archive-media-library");
  const grid = library?.querySelector("[data-archive-media-grid]");
  if (!library || !grid) return;
  const details = document.createElement("details");
  details.className = "archive-audience-manager";
  details.innerHTML = '<summary>Administrar acesso por mídia</summary>' +
    '<p>Defina se cada foto, vídeo ou áudio fica disponível para todos os membros ou somente para uma pessoa. A consulta e cada alteração ficam registradas na auditoria administrativa.</p>' +
    '<form data-audience-load><label>Motivo administrativo<textarea name="purpose" minlength="20" maxlength="500" required placeholder="Descreva por que está revisando os acessos da galeria."></textarea></label>' +
    '<button type="submit" class="primary-button compact-button">Carregar mídias para administrar</button><span class="form-status" data-audience-load-status role="status" aria-live="polite"></span></form>' +
    '<div class="archive-audience-list" data-audience-list hidden></div>';
  library.insertBefore(details, library.querySelector(".archive-gallery-toolbar"));
  const list = details.querySelector("[data-audience-list]");
  const loadForm = details.querySelector("[data-audience-load]");
  const loadButton = loadForm.querySelector('button[type="submit"]');
  const loadStatus = details.querySelector("[data-audience-load-status]");
  const state = { items: new Map(), profiles: [] };

  async function loadItems(purpose) {
    const items = [];
    for (let offset = 0; offset <= 10000; offset += 100) {
      const result = await adminRequest(client, { resourceType: "archive_media", purpose, offset });
      const page = Array.isArray(result.data) ? result.data : [];
      items.push(...page);
      if (page.length < 100) break;
    }
    const profiles = [];
    for (let offset = 0; offset <= 10000; offset += 100) {
      const result = await adminRequest(client, { resourceType: "profiles", purpose, offset });
      const page = Array.isArray(result.data) ? result.data : [];
      profiles.push(...page);
      if (page.length < 100) break;
    }
    return { items, profiles };
  }

  loadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const purpose = String(new FormData(loadForm).get("purpose") || "").trim();
    if (purpose.length < 20 || purpose.length > 500) {
      loadStatus.textContent = "Descreva o motivo em pelo menos 20 caracteres.";
      loadStatus.dataset.kind = "error";
      return;
    }
    loadButton.disabled = true;
    loadStatus.textContent = "Carregando mídias e opções de destinatário…";
    loadStatus.dataset.kind = "";
    try {
      const result = await loadItems(purpose);
      state.profiles = result.profiles;
      state.items = new Map(result.items.map((item) => [String(item.id), item]));
      list.innerHTML = result.items.length
        ? result.items.map((item) => audienceItemMarkup(item, state.profiles)).join("")
        : '<p class="archive-media-empty">Nenhuma mídia disponível para administrar.</p>';
      list.hidden = false;
      loadStatus.textContent = result.items.length + " mídia(s) carregada(s).";
      loadStatus.dataset.kind = "success";
    } catch (error) {
      console.error("Looply archive audience load failed", error);
      loadStatus.textContent = "Não foi possível carregar as mídias administrativas. Confira o motivo e o acesso de administrador.";
      loadStatus.dataset.kind = "error";
    } finally {
      loadButton.disabled = false;
    }
  });

  details.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-save-audience]");
    if (!button) return;
    const id = String(button.dataset.mediaId || "");
    const select = details.querySelector('[data-audience-select][data-media-id="' + id + '"]');
    const card = button.closest("[data-audience-item]");
    const status = card?.querySelector("[data-audience-status]");
    const purpose = String(loadForm.querySelector('[name="purpose"]').value || "").trim();
    const recipientId = String(select?.value || "");
    if (purpose.length < 20 || purpose.length > 500) {
      if (status) { status.textContent = "Descreva o motivo em pelo menos 20 caracteres."; status.dataset.kind = "error"; }
      return;
    }
    if (!select || recipientId === "__existing__") {
      if (status) { status.textContent = "Escolha todos os membros ou um destinatário."; status.dataset.kind = "error"; }
      return;
    }
    button.disabled = true;
    if (status) { status.textContent = "Salvando acesso…"; status.dataset.kind = ""; }
    try {
      await adminRequest(client, {
        action: "set_archive_media_audience",
        resourceType: "archive_media",
        mediaId: id,
        recipientId: recipientId || null,
        purpose
      });
      const item = state.items.get(id);
      if (item) {
        item.visibility = recipientId ? "exclusive" : "members";
        item.recipients = recipientId ? [{
          user_id: recipientId,
          profile: state.profiles.find((person) => String(person.id) === recipientId) || null
        }] : [];
      }
      const label = card?.querySelector("[data-audience-current]");
      if (label && item) label.textContent = visibilityLabel(item);
      if (status) {
        status.textContent = recipientId
          ? "Acesso salvo: exclusivo para @" + (state.profiles.find((person) => String(person.id) === recipientId)?.username || "usuário selecionado") + "."
          : "Acesso salvo para todos os membros.";
        status.dataset.kind = "success";
      }
    } catch (error) {
      console.error("Looply archive audience update failed", error);
      if (status) { status.textContent = "Não foi possível salvar. Verifique o acesso de administrador e tente novamente."; status.dataset.kind = "error"; }
    } finally {
      button.disabled = false;
    }
  });
}
