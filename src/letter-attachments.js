// Attachments for the visible letters composer. Scoped to letters, not a global file picker.
// Storage paths are authorized by the existing Neon storage endpoint and letter RLS.
const MAX_FILES = 8;
const MAX_BYTES = 25 * 1024 * 1024;
const PRIVATE_MAX_BYTES = 15 * 1024 * 1024;
const AUDIO_SECONDS = 180;
const MIME = new Map(Object.entries({
  jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",
  mp4:"video/mp4",webm:"video/webm",mp3:"audio/mpeg",m4a:"audio/mp4",ogg:"audio/ogg",
  pdf:"application/pdf",txt:"text/plain",csv:"text/csv",rtf:"application/rtf",
  doc:"application/msword",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"
}));
const APPROVED = new Set(MIME.values());
const enc = new TextEncoder();

function mimeOf(file) {
  const declared = String(file.type || "").split(";")[0].trim().toLowerCase();
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  if (declared && declared !== "application/octet-stream") return declared;
  return MIME.get(extension) || "application/octet-stream";
}
function b64(bytes) {
  let value = "";
  for (let i = 0; i < bytes.length; i += 16384) {
    value += String.fromCharCode(...bytes.subarray(i, i + 16384));
  }
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function unb64(value) {
  const src = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const data = atob(src + "=".repeat((4 - src.length % 4) % 4));
  return Uint8Array.from(data, c => c.charCodeAt(0));
}
async function privateKey(password, salt) {
  const raw = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {name:"PBKDF2", salt:unb64(salt), iterations:310000, hash:"SHA-256"},
    raw, {name:"AES-GCM", length:256}, false, ["encrypt", "decrypt"]
  );
}
function aad(letterId, name) {
  return enc.encode("looply:letter-file:v1:" + letterId + ":" + name);
}
export async function encodeAttachment(file) {
  const text = "LOOPLY-LETTER-BINARY-V1\n" + b64(new Uint8Array(await file.arrayBuffer()));
  return new File([text], "file-" + crypto.randomUUID() + ".txt", {type:"text/plain"});
}
export async function decodeAttachment(blob, attachment) {
  const text = await blob.text();
  if (!text.startsWith("LOOPLY-LETTER-BINARY-V1\n")) throw Error("Anexo não reconhecido.");
  const declared = String(attachment.type || "").toLowerCase();
  const safe = /^(image\/(jpeg|png|gif|webp|heic)|audio\/(wav|mpeg|mp4|ogg|webm)|video\/(mp4|webm|quicktime)|application\/pdf|text\/plain)$/.test(declared);
  return new Blob([unb64(text.slice("LOOPLY-LETTER-BINARY-V1\n".length).trim())],
    {type:safe ? declared : "application/octet-stream"});
}
export async function encryptAttachment(file, letterId, password, salt) {
  const key = await privateKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt(
    {name:"AES-GCM", iv, additionalData:aad(letterId, file.name)}, key, await file.arrayBuffer()
  );
  // A textual, base64-encoded encrypted envelope is supported by the existing
  // private bucket's text/plain file policy; the cleartext never reaches storage.
  const envelope = "LOOPLY-LETTER-ENC-V1\n" + b64(new Uint8Array(bytes));
  const blob = new File([envelope], "protected-" + crypto.randomUUID() + ".txt", {type:"text/plain"});
  return {blob, iv:b64(iv)};
}
export async function decryptAttachment(content, attachment, letter, password) {
  const text = await content.text();
  if (!text.startsWith("LOOPLY-LETTER-ENC-V1\n")) throw Error("Formato de anexo protegido inválido.");
  const key = await privateKey(password, letter.password_salt);
  const bytes = await crypto.subtle.decrypt(
    {name:"AES-GCM", iv:unb64(attachment.iv), additionalData:aad(letter.id, attachment.name)},
    key, unb64(text.slice("LOOPLY-LETTER-ENC-V1\n".length).trim())
  );
  return new Blob([bytes], {type:attachment.type || "application/octet-stream"});
}
const safeName = name => String(name || "arquivo").normalize("NFKD")
  .replace(/[^a-zA-Z0-9._-]/g, "-").slice(-95) || "arquivo";
const fileSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.ceil(n / 1024) + " KB";

export function createLetterAttachmentComposer(root, notify) {
  const input = root.querySelector("#letterFileInput");
  const importButton = root.querySelector("#letterImport");
  const recordButton = root.querySelector("#letterRecord");
  const stopButton = root.querySelector("#letterStopRecord");
  const list = root.querySelector("#letterFileList");
  const status = root.querySelector("#letterFileStatus");
  const selected = [];
  const previews = new Set();
  let recorder = null, stream = null, timer = null, started = 0;
  const cancelledRecorders = new WeakSet();

  const say = value => { if (status) status.textContent = value; };
  function revoke() {
    for (const url of previews) URL.revokeObjectURL(url);
    previews.clear();
  }
  function render() {
    if (!list) return;
    revoke();
    list.replaceChildren();
    selected.forEach((entry, index) => {
      const row = document.createElement("li");
      row.className = "letter-file-item";
      const detail = document.createElement("span");
      detail.className = "letter-file-title";
      detail.textContent = entry.file.name + " · " + fileSize(entry.file.size);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "letter-file-remove";
      remove.setAttribute("aria-label", "Remover " + entry.file.name);
      remove.textContent = "×";
      remove.addEventListener("click", () => { selected.splice(index, 1); render(); say(""); });
      row.append(detail, remove);
      const type = entry.mime;
      if (type.startsWith("audio/") || type.startsWith("image/") || type.startsWith("video/")) {
        const url = URL.createObjectURL(entry.file);
        previews.add(url);
        const media = document.createElement(type.startsWith("image/") ? "img" : type.startsWith("video/") ? "video" : "audio");
        media.src = url;
        media.className = "letter-file-preview";
        if (media.tagName !== "IMG") media.controls = true;
        if (media.tagName === "VIDEO") media.playsInline = true;
        if (media.tagName === "IMG") media.alt = entry.file.name;
        media.preload = "metadata";
        row.append(media);
      }
      list.append(row);
    });
  }
  function add(file) {
    if (!(file instanceof Blob) || !file.size) { say("Arquivo vazio ou inválido."); return; }
    if (selected.length >= MAX_FILES) { say("Máximo de 8 anexos por carta."); return; }
    if (file.size > MAX_BYTES) { say(file.name + ": limite de 25 MB por anexo."); return; }
    const mime = mimeOf(file);
    if (!APPROVED.has(mime) && file.size > PRIVATE_MAX_BYTES) { say(file.name + ": formatos adicionais até 15 MB."); return; }
    if (selected.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) return;
    selected.push({file, mime});
    say("");
  }
  importButton?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", () => {
    Array.from(input.files || []).forEach(add);
    input.value = "";
    render();
  });
  function stop(discardAudio = false) {
    if (discardAudio && recorder) cancelledRecorders.add(recorder);
    if (recorder && recorder.state === "recording") recorder.stop();
    else if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    clearInterval(timer); timer = null;
  }
  recordButton?.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      say("Microfone indisponível. Importe uma gravação pelo gerenciador de arquivos.");
      return;
    }
    if (selected.length >= MAX_FILES) { say("Máximo de 8 anexos."); return; }
    recordButton.disabled = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio:true});
      const codec = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"]
        .find(value => MediaRecorder.isTypeSupported(value));
      if (!codec) throw Error("Gravação não suportada neste navegador.");
      const chunks = [];
      const current = new MediaRecorder(stream, {mimeType:codec});
      recorder = current;
      const type = codec.split(";")[0];
      current.addEventListener("dataavailable", event => { if (event.data?.size) chunks.push(event.data); });
      current.addEventListener("stop", () => {
        const ignored = cancelledRecorders.has(current);
        clearInterval(timer); timer = null;
        stream?.getTracks().forEach(t => t.stop()); stream = null;
        recorder = null;
        recordButton.disabled = false;
        stopButton.hidden = true;
        if (ignored) { say(""); return; }
        const blob = new Blob(chunks, {type});
        if (!blob.size) { say("A gravação não produziu áudio."); return; }
        const extension = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
        const before = selected.length;
        add(new File([blob], "audio-" + Date.now() + "." + extension, {type}));
        render();
        if (selected.length > before) say("Áudio anexado.");
      }, {once:true});
      current.addEventListener("error", () => say("Erro na gravação. Tente novamente."));
      current.start(250);
      stopButton.hidden = false;
      started = Date.now();
      say("Gravando · 0:00");
      timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        say("Gravando · " + Math.floor(elapsed / 60) + ":" + String(elapsed % 60).padStart(2, "0"));
        if (elapsed >= AUDIO_SECONDS) stop();
      }, 500);
    } catch (error) {
      stream?.getTracks().forEach(t => t.stop()); stream = null;
      recordButton.disabled = false;
      say(error?.name === "NotAllowedError" ? "Permita o acesso ao microfone." : "Não foi possível iniciar a gravação.");
    }
  });
  stopButton?.addEventListener("click", () => stop());
  window.addEventListener("pagehide", () => stop(true));
  return {
    get count() { return selected.length; },
    validate(isProtected = false) {
      if (isProtected && selected.some(item => item.file.size > PRIVATE_MAX_BYTES)) {
        say("Anexos com senha devem ter até 15 MB."); return false;
      }
      return true;
    },
    clear() { stop(true); selected.length = 0; render(); say(""); },
    stop,
    async upload(letterId, options = {}) {
      const uploaded = [];
      const metadata = [];
      try {
        for (const item of selected) {
          if (options.password && item.file.size > PRIVATE_MAX_BYTES) {
            throw Error("Anexos de cartas protegidas devem ter até 15 MB.");
          }
          say("Enviando " + (metadata.length + 1) + " de " + selected.length + "...");
          const sealed = options.password
            ? await encryptAttachment(item.file, letterId, options.password, options.salt)
            : null;
          const encoded = !sealed && !APPROVED.has(item.mime) ? await encodeAttachment(item.file) : null;
          const blob = sealed ? sealed.blob : encoded || item.file;
          if (blob.size > MAX_BYTES) throw Error("Arquivo excede o limite após proteção.");
          const path = letterId + "/" + crypto.randomUUID() + "-" + safeName(blob.name);
          const {error} = await options.client.storage.from("looply-letters").upload(path, blob, {
            contentType:sealed || encoded ? "text/plain" : item.mime, upsert:false
          });
          if (error) throw Error("Falha ao enviar " + item.file.name + ": " + (error.message || "armazenamento indisponível"));
          uploaded.push(path);
          metadata.push({
            path, name:item.file.name, type:item.mime, size:item.file.size,
            ...(sealed ? {encrypted:true,iv:sealed.iv} : {}),
            ...(encoded ? {encoded:true} : {})
          });
        }
        say("");
        return {metadata, uploaded};
      } catch (error) {
        error.uploaded = uploaded;
        throw error;
      }
    }
  };
}

export function createLetterAttachmentReader(root, client) {
  const box = root.querySelector("#readCartaAttachments");
  const urls = new Set();
  let version = 0;
  function clear() {
    version++;
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
    box?.replaceChildren();
  }
  async function render(letter, password = null) {
    clear();
    const current = version;
    if (!box || (letter.is_protected && !password)) return;
    const paths = Array.isArray(letter.attachments) ? letter.attachments : [];
    if (!paths.length) return;
    const title = document.createElement("strong");
    title.textContent = "Anexos";
    box.append(title);
    for (const item of paths.slice(0, MAX_FILES)) {
      if (!item?.path?.startsWith(letter.id + "/") || !item.name) continue;
      const row = document.createElement("div");
      row.className = "letter-read-file";
      const label = document.createElement("span");
      label.textContent = String(item.name).slice(0,160);
      const open = document.createElement("button");
      open.type = "button";
      open.className = "letter-read-file-open";
      open.textContent = item.encrypted ? "Desbloquear arquivo" : "Abrir";
      row.append(label, open);
      box.append(row);
      open.addEventListener("click", async () => {
        open.disabled = true;
        open.textContent = "Abrindo...";
        try {
          const {data, error} = await client.storage.from("looply-letters").createSignedUrl(item.path, 300);
          if (error || !data?.signedUrl) throw Error("Não foi possível acessar este anexo.");
          if (current !== version) return;
          let url = data.signedUrl;
          if (item.encrypted || item.encoded) {
            if (item.encrypted && !password) throw Error("Desbloqueie a carta.");
            const response = await fetch(url, {credentials:"omit"});
            if (!response.ok) throw Error("Falha ao recuperar o arquivo.");
            const source = await response.blob();
            const blob = item.encrypted
              ? await decryptAttachment(source, item, letter, password)
              : await decodeAttachment(source, item);
            if (current !== version) return;
            url = URL.createObjectURL(blob);
            urls.add(url);
          }
          const mediaType = String(item.type || "");
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.download = String(item.name);
          anchor.textContent = "Baixar " + item.name;
          row.append(anchor);
          if (mediaType.startsWith("audio/") || mediaType.startsWith("video/") || mediaType.startsWith("image/")) {
            const media = document.createElement(mediaType.startsWith("image/") ? "img" : mediaType.startsWith("video/") ? "video" : "audio");
            media.src = url;
            media.className = "letter-read-media";
            if (media.tagName !== "IMG") media.controls = true;
            if (media.tagName === "VIDEO") media.playsInline = true;
            if (media.tagName === "IMG") media.alt = String(item.name);
            row.append(media);
          }
          open.remove();
        } catch (error) {
          if (current === version) { open.disabled = false; open.textContent = "Tentar novamente"; }
        }
      });
    }
  }
  return {clear, render};
}
