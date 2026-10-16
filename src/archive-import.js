import { extractDate, toISO } from "./date-parser.js";

const maxFileBytes = 100 * 1024 * 1024;
const passwordIterations = 210_000;
const mediaTypes = new Map([
  ["jpg", ["image", "image/jpeg"]], ["jpeg", ["image", "image/jpeg"]],
  ["png", ["image", "image/png"]], ["webp", ["image", "image/webp"]],
  ["heic", ["image", "image/heic"]], ["mp4", ["video", "video/mp4"]],
  ["webm", ["video", "video/webm"]], ["mp3", ["audio", "audio/mpeg"]]
]);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function archiveImportMarkup() {
  return `<section class="archive-import panel" aria-labelledby="archiveImportTitle">
    <div class="admin-heading"><div><span class="section-kicker">Migração privada</span><h2 id="archiveImportTitle">Importar cartas e mídias antigas</h2></div></div>
    <p class="admin-description">Selecione a pasta extraída completa do Loooply-main. As cartas e mídias serão enviadas para o Supabase privado; textos MSG associados às mídias também serão preservados.</p>
    <form data-archive-import-form>
      <div class="field"><label for="archiveSourceFolder">Pasta Loooply-main</label><input id="archiveSourceFolder" type="file" webkitdirectory directory multiple required><small class="field-hint">Selecione a pasta que contém midia-index.json (na raiz ou em data/), midia/ e as cartas .txt.</small></div>
      <div class="field"><label for="archiveImportPurpose">Motivo desta importação</label><textarea id="archiveImportPurpose" name="purpose" minlength="20" maxlength="500" rows="2" required placeholder="Descreva o motivo da importação para a auditoria."></textarea></div>
      <button class="primary-button compact-button" type="submit">Importar acervo <span aria-hidden="true">↗</span></button>
      <div class="archive-import-progress" data-archive-import-status role="status" aria-live="polite">Nenhum arquivo selecionado.</div>
      <ul class="archive-import-errors" data-archive-import-errors hidden></ul>
    </form>
  </section>`;
}

function normalizedPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").normalize("NFC");
}

function keyPath(value) {
  return normalizedPath(value).toLocaleLowerCase("pt-BR");
}

function selectedRootFiles(fileList) {
  const files = [...fileList];
  if (!files.length) throw new Error("Selecione a pasta extraída Loooply-main.");
  const rootName = (files[0].webkitRelativePath || files[0].name).split("/")[0];
  const map = new Map();
  for (const file of files) {
    const fullPath = normalizedPath(file.webkitRelativePath || file.name);
    const parts = fullPath.split("/");
    if (parts[0] !== rootName) continue;
    const relative = parts.slice(1).join("/");
    if (relative) map.set(keyPath(relative), { file, path: relative });
  }
  return map;
}

function fileNameFromPath(value) {
  return normalizedPath(value).split("/").at(-1) || "";
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: passwordIterations, hash: "SHA-256" }, key, 256);
  return { password_salt: base64Url(salt), password_hash: base64Url(new Uint8Array(bits)) };
}

async function readCardText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(bytes);
  return text.replace(/^\uFEFF/, "");
}

async function parseCard(file, profileByName) {
  const name = fileNameFromPath(file.webkitRelativePath || file.name);
  const match = name.match(/^(Misol|Patati|YARA)carta(privada)?([0-9]+)\.txt$/i);
  if (!match) return null;
  const username = match[1].toLocaleLowerCase("pt-BR");
  const recipientId = profileByName.get(username);
  if (!recipientId) throw new Error(`O perfil autorizado @${username} não foi encontrado.`);
  if (file.size > 100_000) throw new Error(`Uma carta excede o limite de 100.000 caracteres: ${name}`);
  const source = (await readCardText(file)).replace(/\r/g, "");
  const lines = source.split("\n");
  const protectedMatch = (lines[0] || "").trim().match(/^Essa carta é protegida pela senha:\s*(.*)$/i);
  const isPrivate = Boolean(match[2]);
  const isProtected = Boolean(protectedMatch);
  let body = source;
  let password = "";
  let hint = "";
  if (protectedMatch) {
    password = protectedMatch[1].trim();
    hint = (lines[1] || "").trim().match(/^Dica\s*:\s*(.*)$/i)?.[1]?.trim() || "";
    body = lines.slice(2).join("\n");
  }
  if (isProtected && !password) throw new Error(`A carta protegida não contém senha válida: ${name}`);
  const card = {
    recipient_id: recipientId,
    original_file: name,
    card_number: Number(match[3]),
    is_private: isPrivate,
    is_protected: isProtected,
    password_hint: hint.slice(0, 300),
    sent_date: (() => { const date = extractDate(body); return date ? toISO(date) : null; })(),
    body: isProtected ? null : body,
    secret_body: isProtected ? body : null
  };
  if (isProtected) Object.assign(card, await hashPassword(password));
  return card;
}

export function makeMediaCatalog(index, fileMap) {
  const items = new Map();
  const upsert = (entry, forcedVisibility = null, forcedUsername = null) => {
    const sourcePath = normalizedPath(entry.path);
    if (!/^midia\/(?:[^/]+|misol\/[^/]+|yara\/[^/]+)$/i.test(sourcePath)) return;
    const extension = sourcePath.split(".").at(-1).toLowerCase();
    if (!mediaTypes.has(extension)) return;
    const current = items.get(keyPath(sourcePath));
    const owner = forcedUsername || (/^midia\/misol\//i.test(sourcePath) ? "misol" : /^midia\/yara\//i.test(sourcePath) ? "yara" : null);
    const exclusive = forcedVisibility === "exclusive" || Boolean(owner);
    const entryKind = mediaTypes.get(extension)[0];
    items.set(keyPath(sourcePath), {
      source_path: sourcePath,
      file_name: fileNameFromPath(sourcePath),
      description: String(entry.description || ""),
      kind: entryKind,
      mime_type: mediaTypes.get(extension)[1],
      visibility: exclusive ? "exclusive" : "members",
      recipient_names: exclusive ? [owner] : [],
      source_date: entry.uploadedAt || entry.modified || ""
    });
    if (current?.visibility === "exclusive" && !exclusive) items.set(keyPath(sourcePath), current);
  };

  for (const type of ["fotos", "videos", "audios"]) {
    for (const entry of Array.isArray(index[type]) ? index[type] : []) upsert(entry);
  }
  for (const [owner, entries] of Object.entries(index.exclusivo || {})) {
    const username = String(owner).toLocaleLowerCase("pt-BR");
    if (!["misol", "yara"].includes(username)) continue;
    for (const entry of Array.isArray(entries) ? entries : []) upsert(entry, "exclusive", username);
  }

  return [...items.values()];
}

export function findMediaIndexEntry(fileMap) {
  return fileMap.get(keyPath("data/midia-index.json")) || fileMap.get(keyPath("midia-index.json")) || null;
}

async function uploadResumable(client, path, file, contentType, onProgress) {
  const { data, error } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error("A sessão administrativa expirou.");
  const configuredUrl = window.LOOPLY_CONFIG?.supabaseUrl;
  if (!configuredUrl) throw new Error("A configuração do Supabase não foi encontrada.");
  const projectUrl = new URL(configuredUrl);
  const endpoint = projectUrl.hostname.endsWith(".supabase.co")
    ? `${projectUrl.protocol}//${projectUrl.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co")}/storage/v1/upload/resumable`
    : new URL("/storage/v1/upload/resumable", projectUrl).toString();
  const tus = await import("https://esm.sh/tus-js-client@4.3.1");
  const uploadFile = file.type === contentType ? file : new File([file], file.name, { type: contentType });
  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(uploadFile, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}` },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: "looply-media", objectName: path, contentType, cacheControl: "3600" },
      onError: reject,
      onProgress: (uploaded, total) => onProgress(Math.floor((uploaded / total) * 100)),
      onSuccess: resolve
    });
    upload.start();
  });
}

function classifyFailure(error) {
  const message = String(error?.message || "");
  if (/duplicate|already exists|alreadyexits|object.*exists|409/i.test(message)) return "O arquivo já existe no Storage; verificando o registro.";
  return message.slice(0, 240) || "Falha sem detalhe retornado pelo serviço.";
}

export function bindArchiveImport(root, client) {
  const mount = root.querySelector("[data-archive-import]");
  if (!mount) return;
  mount.innerHTML = archiveImportMarkup();
  const form = mount.querySelector("[data-archive-import-form]");
  const input = mount.querySelector("#archiveSourceFolder");
  const status = mount.querySelector("[data-archive-import-status]");
  const errorsList = mount.querySelector("[data-archive-import-errors]");

  input?.addEventListener("change", () => {
    status.textContent = input.files?.length ? `${input.files.length} arquivo(s) selecionado(s).` : "Nenhum arquivo selecionado.";
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!input?.files?.length) { status.textContent = "Selecione a pasta extraída Loooply-main."; return; }
    const purpose = String(new FormData(form).get("purpose") || "").trim();
    if (purpose.length < 20 || purpose.length > 500) { status.textContent = "Descreva o motivo da importação (20 a 500 caracteres)."; return; }
    const button = form.querySelector('button[type="submit"]');
    const errors = [];
    errorsList.replaceChildren();
    errorsList.hidden = true;
    if (button) button.disabled = true;
    try {
      const fileMap = selectedRootFiles(input.files);
      const indexEntry = findMediaIndexEntry(fileMap);
      if (!indexEntry) throw new Error("Não encontrei midia-index.json. Selecione a pasta completa Loooply-main.");
      const index = JSON.parse(await indexEntry.file.text());
      const profileResult = await client.from("profiles").select("id,username").in("username", ["misol", "patati", "yara"]);
      if (profileResult.error) throw profileResult.error;
      const profileByName = new Map((profileResult.data || []).map((profile) => [profile.username, profile.id]));
      const cards = [];
      for (const entry of fileMap.values()) {
        const name = fileNameFromPath(entry.path);
        if (!/^(misol|patati|yara)carta(privada)?[0-9]+\.txt$/i.test(name)) continue;
        try {
          const card = await parseCard(entry.file, profileByName);
          if (card) cards.push(card);
        } catch (error) { errors.push(`${name}: ${String(error?.message || "falha ao ler carta")}`); }
      }
      cards.sort((a, b) => a.recipient_id.localeCompare(b.recipient_id) || Number(b.is_private) - Number(a.is_private) || a.card_number - b.card_number);
      if (errors.length) throw new Error("Corrija os arquivos de carta inválidos antes de iniciar a importação.");
      if (!cards.length) throw new Error("Nenhuma carta elegível foi encontrada na pasta selecionada.");

      const catalog = makeMediaCatalog(index, fileMap);
      const indexedPaths = new Set(catalog.map((item) => keyPath(item.source_path)));
      const unindexedCount = [...fileMap.values()].filter(({ path }) => {
        const normalized = normalizedPath(path);
        return /^midia\//i.test(normalized)
          && mediaTypes.has(normalized.split(".").at(-1).toLowerCase())
          && !indexedPaths.has(keyPath(normalized));
      }).length;
      const media = [];
      let missingMediaCount = 0;
      for (const item of catalog) {
        const fileEntry = fileMap.get(keyPath(item.source_path));
        if (!fileEntry) { missingMediaCount += 1; continue; }
        if (fileEntry.file.size < 1 || fileEntry.file.size > maxFileBytes) { errors.push(`${item.source_path}: tamanho fora do limite permitido.`); continue; }
        const folder = item.source_path.slice(0, item.source_path.lastIndexOf("/"));
        const sidecarName = `MSG_${fileNameFromPath(item.source_path)}.txt`;
        const sidecar = fileMap.get(keyPath(`${folder}/${sidecarName}`));
        if (sidecar) item.description = (await readCardText(sidecar.file)).trim() || item.description;
        if (item.description.length > 10_000) { errors.push(`${item.source_path}: a descrição associada excede 10.000 caracteres.`); continue; }
        const recipientIds = item.recipient_names.map((username) => profileByName.get(username)).filter(Boolean);
        if (item.visibility === "exclusive" && recipientIds.length !== 1) { errors.push(`${item.source_path}: não foi possível associar o destinatário exclusivo.`); continue; }
        if (item.source_date && Number.isNaN(new Date(item.source_date).valueOf())) { errors.push(`${item.source_path}: data original inválida.`); continue; }
        media.push({
          ...item,
          storage_path: `legacy-archive/${item.source_path}`,
          byte_size: fileEntry.file.size,
          recipient_ids: recipientIds
        });
      }
      if (errors.length) throw new Error("Corrija os arquivos de mídia inválidos antes de iniciar a importação.");

      let cardsImported = 0;
      const cardBatches = [];
      for (let i = 0; i < cards.length; i += 4) cardBatches.push(cards.slice(i, i + 4));
      for (const [indexNumber, batch] of cardBatches.entries()) {
        status.textContent = `Importando cartas ${Math.min(cards.length, indexNumber * 4 + batch.length)} de ${cards.length}…`;
        const { data, error } = await client.functions.invoke("looply-admin", {
          body: { action: "import_archived_cards", resourceType: "archived_cards", purpose, cards: batch }
        });
        if (error || !Number.isFinite(Number(data?.importedCount))) throw error || new Error(data?.error || "Falha ao confirmar a importação das cartas.");
        cardsImported += Number(data.importedCount);
      }

      let completed = 0;
      let failed = 0;
      let cursor = 0;
      const workers = Array.from({ length: Math.min(2, media.length) }, async () => {
        while (cursor < media.length) {
          const position = cursor++;
          const item = media[position];
          const file = fileMap.get(keyPath(item.source_path)).file;
          status.textContent = `Enviando mídia ${position + 1} de ${media.length}: ${item.file_name} (0%)`;
          try {
            try {
              await uploadResumable(client, item.storage_path, file, item.mime_type, (percentage) => {
                status.textContent = `Enviando mídia ${position + 1} de ${media.length}: ${item.file_name} (${percentage}%)`;
              });
            } catch (uploadError) {
              // Registration checks the object through the privileged server Storage API, making retries safe.
              status.textContent = `${item.file_name}: ${classifyFailure(uploadError)}`;
            }
            const { data, error } = await client.functions.invoke("looply-admin", {
              body: { action: "register_archive_media", resourceType: "archive_media", purpose, media: item }
            });
            if (error || !data?.mediaId) throw error || new Error(data?.error || "O objeto não foi localizado no bucket privado.");
            completed += 1;
          } catch (error) {
            failed += 1;
            errors.push(`${item.source_path}: ${String(error?.message || "falha ao registrar mídia").slice(0, 200)}`);
          }
          status.textContent = `Mídias registradas: ${completed} de ${media.length} · falhas: ${failed} · ${cardsImported} cartas.`;
        }
      });
      await Promise.all(workers);
      status.textContent = `Importação concluída: ${cardsImported} cartas · ${completed} de ${media.length} mídias registradas · ${missingMediaCount} item(ns) catalogado(s) ausente(s) ignorado(s) · ${errors.length} falha(s) · ${unindexedCount} arquivo(s) fora do catálogo ignorado(s). Repetir a importação é seguro.`;
      if (errors.length) {
        errorsList.hidden = false;
        for (const message of errors.slice(0, 100)) {
          const row = document.createElement("li");
          row.textContent = message;
          errorsList.append(row);
        }
      }
    } catch (error) {
      console.error("Looply archive import failed");
      status.textContent = String(error?.message || "A importação não foi concluída.");
      if (errors.length) {
        errorsList.hidden = false;
        for (const message of errors) {
          const row = document.createElement("li");
          row.textContent = message;
          errorsList.append(row);
        }
      }
    } finally {
      if (button) button.disabled = false;
    }
  });
}
