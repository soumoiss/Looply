import { StoryFaceLens } from "./story-ar.js";
import { normalizePublicationMedia, uploadResumable } from "./social.js";
import { encodeStorySong } from "./story-music-catalog.js";
import { openStoryMusicPicker } from "./story-music-picker.js";

const FILTERS = Object.freeze({
  none: "none", warm: "sepia(.25) saturate(1.22) contrast(1.03)",
  cool: "hue-rotate(175deg) saturate(.83) contrast(1.07)",
  mono: "grayscale(1) contrast(1.12)", vivid: "saturate(1.55) contrast(1.09)"
});
const LIMIT = 30_000;
const FORMATS = Object.freeze({
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm"
});
const BUILTIN = Object.freeze([
  { id: "brisa", title: "Brisa", artist: "Loooply Sounds", bpm: 92, notes: [0, 4, 7, 12, 7, 4, 2, 7] },
  { id: "aurora", title: "Aurora", artist: "Loooply Sounds", bpm: 108, notes: [0, 7, 9, 4, 5, 9, 7, 2] },
  { id: "noite", title: "Noite Azul", artist: "Loooply Sounds", bpm: 78, notes: [0, 3, 7, 10, 7, 3, 5, 2] },
  { id: "pulso", title: "Pulso", artist: "Loooply Sounds", bpm: 122, notes: [0, 0, 7, 7, 5, 5, 3, 3] }
]);

export function storyStudioMarkup(recipientOptions) {
  return '<dialog class="story-studio" data-story-create-dialog aria-label="Criar story">' +
    '<form class="studio-shell" data-studio-form novalidate>' +
      '<div class="studio-stage" data-studio-stage>' +
        '<video class="studio-camera" data-studio-video autoplay playsinline muted></video>' +
        '<canvas class="studio-lens" data-studio-lens aria-hidden="true"></canvas>' +
        '<div class="studio-screen-light" data-studio-screen-light aria-hidden="true"></div>' +
        '<div class="studio-grid-lines" data-studio-grid hidden></div>' +
        '<div class="studio-text-background" data-studio-background hidden></div>' +
        '<div class="studio-edited-media" data-studio-edited hidden></div>' +
        '<div class="studio-overlays" data-studio-overlays></div>' +
        '<header class="studio-top studio-camera-only">' +
          '<button type="button" class="studio-icon" data-studio-close aria-label="Fechar">×</button>' +
          '<button type="button" class="studio-icon" data-studio-flash aria-label="Flash" title="Flash">ϟ</button>' +
          '<button type="button" class="studio-icon" data-studio-settings aria-label="Configurações">⚙</button>' +
        '</header>' +
        '<div class="studio-side studio-camera-only">' +
          '<button type="button" class="studio-icon" data-studio-text-mode aria-label="Criar story de texto">Aa</button>' +
          '<button type="button" class="studio-icon" data-studio-boomerang aria-label="Alternar Boomerang" aria-pressed="false">∞</button>' +
          '<button type="button" class="studio-icon" data-studio-grid-toggle aria-label="Grade">⊞</button>' +
        '</div>' +
        '<section class="studio-camera-bottom studio-camera-only">' +
          '<div class="studio-lens-chooser" aria-label="Filtros e lentes">' +
            '<button type="button" class="is-active" data-studio-filter="none">Original</button>' +
            '<button type="button" data-studio-filter="warm">Quente</button>' +
            '<button type="button" data-studio-filter="cool">Frio</button>' +
            '<button type="button" data-studio-filter="mono">P&B</button>' +
            '<button type="button" data-studio-filter="vivid">Vivo</button>' +
            '<button type="button" data-studio-face="eyes">Olhos</button>' +
            '<button type="button" data-studio-face="halo">Brilho</button>' +
            '<button type="button" data-studio-face="none">Sem lente</button>' +
          '</div>' +
          '<div class="studio-capture-row">' +
            '<label class="studio-gallery-button" title="Abrir galeria"><span data-studio-thumb>▧</span><input type="file" data-studio-file accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" aria-label="Selecionar da galeria"></label>' +
            '<button type="button" class="studio-shutter" data-studio-shutter aria-label="Toque para foto; segure para vídeo"><span></span></button>' +
            '<button type="button" class="studio-icon" data-studio-flip aria-label="Inverter câmera">⇄</button>' +
          '</div>' +
          '<nav class="studio-modes" aria-label="Modos de publicação">' +
            '<button type="button" data-studio-post>POST</button><b>STORY</b>' +
          '</nav>' +
          '<div class="studio-progress" data-studio-progress hidden></div>' +
        '</section>' +
        '<header class="studio-edit-top studio-edit-only" hidden>' +
          '<button type="button" class="studio-icon" data-studio-back aria-label="Voltar à câmera">←</button>' +
          '<button type="button" class="studio-audio-pill" data-studio-music-open>♪ <span data-studio-track-label>Adicionar música</span></button>' +
          '<button type="button" class="studio-icon studio-audio-remove" data-studio-music-remove hidden aria-label="Remover música">×</button>' +
        '</header>' +
        '<div class="studio-edit-tools studio-edit-only" hidden>' +
          '<button type="button" class="studio-icon" data-studio-add-text aria-label="Adicionar texto">Aa</button>' +
          '<button type="button" class="studio-icon" data-studio-stickers aria-label="Adicionar figurinhas">☺</button>' +
          '<button type="button" class="studio-icon" data-studio-music-open aria-label="Adicionar música">♪</button>' +
          '<button type="button" class="studio-icon" data-studio-enhance aria-label="Aprimorar visual">✦</button>' +
        '</div>' +
        '<div class="studio-edit-bottom studio-edit-only" hidden>' +
          '<textarea data-studio-caption name="body" maxlength="700" rows="2" placeholder="Adicione uma legenda..." aria-label="Legenda do story"></textarea>' +
          '<div class="studio-publish-row">' +
            '<button type="button" class="studio-pill" data-studio-publicar>Seu story</button>' +
            '<button type="button" class="studio-pill" data-studio-friends><span class="studio-star">★</span> Amigos próximos</button>' +
            '<button type="submit" class="studio-next" data-studio-send aria-label="Publicar story">➜</button>' +
          '</div>' +
        '</div>' +
        '<div class="studio-modal" data-studio-modal hidden><section class="studio-modal-panel" data-studio-panel>' +
          '<div class="studio-modal-head"><strong data-studio-modal-title>Editar</strong><button type="button" class="studio-icon" data-studio-modal-close>×</button></div>' +
          '<div data-studio-modal-body></div></section></div>' +
        '<p class="studio-feedback" data-studio-status role="status" aria-live="polite"></p>' +
      '</div>' +
      '<select name="recipientIds" data-studio-people multiple hidden>' + recipientOptions + '</select>' +
      '<input name="visibility" data-studio-visibility value="public" type="hidden">' +
    '</form>' +
  '</dialog>';
}

function blobFromCanvas(canvas, type, quality = .89) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Falha na conversão de imagem.")), type, quality));
}
function videoFormat() {
  if (typeof MediaRecorder !== "function") return null;
  return ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find(type => MediaRecorder.isTypeSupported(type)) || null;
}
function waitEvent(target, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Tempo de mídia esgotado.")), 12000);
    target.addEventListener(event, () => { clearTimeout(timeout); resolve(); }, { once: true });
    target.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Falha ao abrir a mídia.")); }, { once: true });
  });
}
function drawCover(ctx, media, w, h) {
  const sw = media.videoWidth || media.naturalWidth || w;
  const sh = media.videoHeight || media.naturalHeight || h;
  const scale = Math.max(w / sw, h / sh);
  ctx.drawImage(media, (w - sw * scale) / 2, (h - sh * scale) / 2, sw * scale, sh * scale);
}
function paintLayers(ctx, root, w, h) {
  root.querySelectorAll("[data-studio-overlay]").forEach(el => {
    const x = (+el.dataset.x || 0.5) * w;
    const y = (+el.dataset.y || 0.5) * h;
    const size = (+el.dataset.size || 36) * (w / 390);
    ctx.font = (el.dataset.font || "700 ") + size + "px " + (el.dataset.family || "system-ui");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = el.dataset.color || "#ffffff";
    ctx.shadowColor = "#0009"; ctx.shadowBlur = 10;
    String(el.textContent || "").split("\n").slice(0, 8).forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.1, w * .85));
    ctx.shadowBlur = 0;
  });
}
function makeSynthBuffer(context, track) {
  const sr = 22050, seconds = 12;
  const buffer = context.createBuffer(1, sr * seconds, sr);
  const arr = buffer.getChannelData(0);
  const beat = 60 / track.bpm;
  for (let i = 0; i < arr.length; i++) {
    const t = i / sr, step = Math.floor(t / beat) % track.notes.length;
    const pitch = 220 * Math.pow(2, track.notes[step] / 12), phase = (t % beat);
    const amp = Math.min(1, phase * 25) * Math.exp(-phase * 3) * .13;
    arr[i] = amp * (Math.sin(2 * Math.PI * pitch * t) + .30 * Math.sin(4 * Math.PI * pitch * t));
  }
  return buffer;
}
function cleanName(value) {
  return String(value || "").replace(/[\u0000-\u001F<>]/g, "").slice(0, 120);
}

export function bindStoryStudio(root, client, userId, refresh) {
  const dialog = root.querySelector("[data-story-create-dialog]");
  if (!dialog?.classList.contains("story-studio")) return () => {};
  const $ = selector => dialog.querySelector(selector);
  const stage = $("[data-studio-stage]");
  const video = $("[data-studio-video]");
  const lens = $("[data-studio-lens]");
  const edits = $("[data-studio-edited]");
  const overlayRoot = $("[data-studio-overlays]");
  const body = $("[data-studio-modal-body]");
  const feedback = $("[data-studio-status]");
  const caption = $("[data-studio-caption]");
  const settings = { facing: "user", filter: "none", face: "none", grid: false, flash: "off", zoom: 1, maxDuration: 30000 };
  let stream = null, face = null, file = null, url = null, mode = "camera", active = false;
  let recorder = null, frames = null, captureStream = null, chunks = [], hold = null, held = false, pointer = null;
  let startedAt = 0, progressAnimation = null, lensReady = false, music = null, audioPreview = null, publishing = false;
  let stopMusicPreview = () => {};
  let sourceKind = "none", isBoomerang = false, currentBackground = "#7c3ed7", editFilter = "none", lastThumb = null;
  let zoomMode = "digital", zoomLimit = 3, zoomBase = 1, zoomTrack = null;
  let zoomBusy = false, zoomPending = null, pinch = null;
  const status = (text, bad = false) => {
    feedback.textContent = text; feedback.dataset.error = bad ? "true" : "false";
  };
  const showMode = name => {
    mode = name;
    stage.dataset.mode = name;
    dialog.dataset.mode = name;
    dialog.querySelectorAll(".studio-camera-only").forEach(e => e.hidden = name !== "camera");
    dialog.querySelectorAll(".studio-edit-only").forEach(e => e.hidden = name !== "edit");
    $("[data-studio-background]").hidden = name !== "text";
    $("[data-studio-background]").hidden = !(name === "text" || (name === "edit" && sourceKind === "text"));
    if (sourceKind === "text") $("[data-studio-background]").style.background = currentBackground;
  };
  const revokeUrl = () => { if (url) URL.revokeObjectURL(url); url = null; };
  const clearPreview = () => {
    edits.replaceChildren(); edits.hidden = true; revokeUrl();
    overlayRoot.replaceChildren(); file = null; sourceKind = "none";
  };
  const flashButton = $("[data-studio-flash]");
  const resetFlash = () => {
    settings.flash = "off";
    stage.dataset.screenFlash = "off";
    flashButton.setAttribute("aria-pressed", "false");
    flashButton.textContent = "ϟ";
    flashButton.title = "Ativar flash";
  };
  const updateZoomPreview = () => {
    const digitalFactor = zoomMode === "digital" ? settings.zoom : 1;
    video.style.transform = (settings.facing === "user" ? "scaleX(-1) " : "") + "scale(" + digitalFactor + ")";
    lens.style.transform = "scale(" + digitalFactor + ")";
  };
  const setZoom = amount => {
    if (!stream || mode !== "camera") return;
    settings.zoom = Math.max(1, Math.min(zoomLimit, Number(amount) || 1));
    if (zoomMode !== "hardware") { updateZoomPreview(); return; }
    zoomPending = zoomBase * settings.zoom;
    if (zoomBusy) return;
    zoomBusy = true;
    const track = zoomTrack;
    const commit = async () => {
      try {
        while (zoomPending != null && zoomMode === "hardware" && track === zoomTrack && track.readyState === "live") {
          const requested = zoomPending; zoomPending = null;
          await track.applyConstraints({ advanced: [{ zoom: requested }] });
        }
      } catch (error) {
        if (track === zoomTrack) {
          zoomMode = "digital";
          zoomLimit = 3;
          settings.zoom = Math.min(3, settings.zoom);
          updateZoomPreview();
          status("Zoom digital ativado; este dispositivo não permite zoom físico.");
        }
      } finally { zoomBusy = false; }
    };
    void commit();
  };
  const flashPhoto = async () => {
    if (settings.facing !== "user" || settings.flash !== "on") return;
    stage.dataset.screenFlash = "firing";
    // Wait for the white screen to illuminate the face before freezing the frame.
    await new Promise(resolve => setTimeout(resolve, 350));
  };
  const drawLiveFrame = (ctx, canvas) => {
    const sourceW = video.videoWidth, sourceH = video.videoHeight;
    if (!sourceW || !sourceH) throw new Error("A câmera ainda não está pronta.");
    const factor = zoomMode === "digital" ? settings.zoom : 1;
    const cropW = sourceW / factor, cropH = sourceH / factor;
    ctx.save();
    ctx.filter = FILTERS[settings.filter];
    if (settings.facing === "user") {
      ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    }
    ctx.drawImage(video, (sourceW - cropW) / 2, (sourceH - cropH) / 2,
      cropW, cropH, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    if (lens.width && lens.height) {
      // Apply the same digital crop to the facial layer as to the camera frame.
      const x = lens.width * (1 - 1 / factor) / 2;
      const y = lens.height * (1 - 1 / factor) / 2;
      ctx.drawImage(lens, x, y, lens.width / factor, lens.height / factor,
        0, 0, canvas.width, canvas.height);
    }
  };
  const stopCamera = () => {
    if (recorder?.state === "recording") recorder.stop();
    stream?.getTracks().forEach(t => t.stop()); stream = null;
    video.srcObject = null; face?.stop(); face = null; lensReady = false;
    zoomTrack = null; zoomPending = null; pinch = null; zoomMode = "digital";
    settings.zoom = 1; resetFlash(); updateZoomPreview();
  };
  const stopRecordingTimer = () => {
    if (progressAnimation) cancelAnimationFrame(progressAnimation);
    progressAnimation = null; $("[data-studio-progress]").hidden = true;
  };
  const startCamera = async (facing = settings.facing) => {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      throw new Error("A câmera exige HTTPS e um navegador compatível. Use a galeria.");
    }
    stopCamera();
    // Do not request a forced portrait 1080x1920 crop or any initial zoom.
    // Prefer the camera sensor's natural field of view.
    const constraints = { video: { facingMode: { ideal: facing }, resizeMode: { ideal: "none" } }, audio: true };
    try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
    catch {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
    }
    const track = stream.getVideoTracks()[0];
    const actualFacing = track?.getSettings?.().facingMode;
    settings.facing = ["user", "environment"].includes(actualFacing) ? actualFacing : facing;
    settings.zoom = 1; zoomMode = "digital"; zoomLimit = 3; zoomTrack = null; zoomPending = null;
    const capabilities = track?.getCapabilities?.();
    const hardwareZoom = capabilities?.zoom;
    if (hardwareZoom && Number.isFinite(hardwareZoom.min) && Number.isFinite(hardwareZoom.max)) {
      zoomBase = Math.max(.1, hardwareZoom.min);
      try {
        await track.applyConstraints({ advanced: [{ zoom: zoomBase }] });
        if (stream && track.readyState === "live") {
          zoomTrack = track; zoomMode = "hardware";
          zoomLimit = Math.max(1, Math.min(6, hardwareZoom.max / zoomBase));
        }
      } catch { /* Inaccessible sensor zoom: pinch uses the digital fallback. */ }
    }
    video.srcObject = stream;
    updateZoomPreview();
    video.style.filter = FILTERS[settings.filter];
    resetFlash();
    showMode("camera");
    try { await video.play(); } catch {}
    face = new StoryFaceLens(video, lens, () => settings.facing);
    face.setLens(settings.face);
    face.start();
  };
  const open = async () => {
    if (active) return;
    active = true; clearPreview(); status(""); showMode("camera");
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    try { await startCamera(); }
    catch (error) { status(error.message || "Câmera indisponível. Use a galeria.", true); }
  };
  const close = () => {
    if (publishing) return;
    stopMusicPreview(); stopMusicPreview = () => {};
    stopRecordingTimer(); stopCamera(); clearPreview();
    if (audioPreview) { audioPreview.pause(); audioPreview = null; }
    music = null; $("[data-studio-track-label]").textContent = "Adicionar música";
    $("[data-studio-music-remove]").hidden = true;
    active = false;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  };
  const showEditor = (mediaFile, kind) => {
    file = mediaFile || null; sourceKind = kind;
    if (file) {
      const holder = $("[data-studio-thumb]").closest(".studio-gallery-button");
      if (lastThumb) URL.revokeObjectURL(lastThumb);
      if (kind === "image") {
        lastThumb = URL.createObjectURL(file);
        holder.style.background = "center / cover no-repeat url(" + JSON.stringify(lastThumb) + ")";
        $("[data-studio-thumb]").textContent = "";
      } else {
        lastThumb = null;
        holder.style.background = "#454254af";
        $("[data-studio-thumb]").textContent = "▶";
      }
    }
    revokeUrl(); edits.replaceChildren(); edits.hidden = kind === "text";
    if (file) {
      url = URL.createObjectURL(file);
      const el = document.createElement(file.type.startsWith("video/") ? "video" : "img");
      el.src = url;
      if (el instanceof HTMLVideoElement) { el.autoplay = true; el.loop = true; el.muted = true; el.playsInline = true; }
      edits.append(el);
    }
    stopCamera(); showMode("edit"); status("");
  };
  const createText = () => {
    stopCamera(); clearPreview(); sourceKind = "text";
    showMode("text"); showEditor(null, "text");
    addLayer("Toque para editar", false);
  };
  const capturePhoto = async () => {
    if (!video.videoWidth) { status("A câmera ainda está iniciando.", true); return; }
    await flashPhoto();
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(video.videoWidth, 1080);
      canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
      const ctx = canvas.getContext("2d");
      drawLiveFrame(ctx, canvas);
      const blob = await blobFromCanvas(canvas, "image/jpeg");
      showEditor(new File([blob], "story-" + Date.now() + ".jpg", { type: "image/jpeg" }), "image");
    } finally {
      stage.dataset.screenFlash = settings.facing === "user" && settings.flash === "on" ? "ready" : "off";
    }
  };
  const drawCamera = (ctx, canvas) => drawLiveFrame(ctx, canvas);
  const renderBoomerang = async (images, w, h, mime) => {
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const videoStream = canvas.captureStream(24);
    const encoder = new MediaRecorder(videoStream, { mimeType: mime });
    const chunks = [];
    const done = new Promise((resolve, reject) => {
      encoder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
      encoder.onerror = () => reject(new Error("Falha no Boomerang."));
      encoder.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }));
    });
    try {
      encoder.start(100);
      const sequence = images.concat(images.slice(1, -1).reverse());
      for (let cycle = 0; cycle < 3; cycle++) for (const image of sequence) {
        ctx.putImageData(image, 0, 0);
        await new Promise(resolve => setTimeout(resolve, 85));
      }
      encoder.stop();
      const output = await done;
      if (!output.size) throw new Error("Boomerang vazio.");
      return output;
    } finally {
      if (encoder.state === "recording") encoder.stop();
      videoStream.getTracks().forEach(t => t.stop());
    }
  };
  const finishRecording = () => {
    stage.dataset.recording = "false";
    if (recorder?.state === "recording") recorder.stop();
  };
  const beginRecording = () => {
    if (!stream || !video.videoWidth) throw new Error("Câmera ainda não está pronta.");
    const mime = videoFormat();
    if (!mime) throw new Error("Gravação de vídeo não suportada neste navegador.");
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth, 1080);
    canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
    const ctx = canvas.getContext("2d", { alpha: false });
    const savedFrames = [];
    const snap = document.createElement("canvas");
    snap.width = 360; snap.height = Math.round(360 * canvas.height / canvas.width);
    const snapContext = snap.getContext("2d");
    let lastFrame = 0;
    const loop = () => {
      if (!stream) return;
      drawCamera(ctx, canvas);
      if (isBoomerang && performance.now() - lastFrame > 85) {
        lastFrame = performance.now();
        snapContext.drawImage(canvas, 0, 0, snap.width, snap.height);
        if (savedFrames.length < 30) savedFrames.push(snapContext.getImageData(0, 0, snap.width, snap.height));
      }
      frames = requestAnimationFrame(loop);
    };
    loop();
    captureStream = canvas.captureStream(24);
    stream.getAudioTracks().forEach(track => captureStream.addTrack(track));
    recorder = new MediaRecorder(captureStream, { mimeType: mime });
    chunks = [];
    recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      cancelAnimationFrame(frames);
      captureStream?.getTracks().forEach(track => { if (!stream?.getTracks().includes(track)) track.stop(); });
      stopRecordingTimer();
      let output = new Blob(chunks, { type: recorder.mimeType || mime });
      recorder = null;
      if (output.size && active && mode === "camera") {
        if (isBoomerang && savedFrames.length >= 3) {
          status("Criando Boomerang…");
          try { output = await renderBoomerang(savedFrames, snap.width, snap.height, mime); }
          catch (error) { status(error.message, true); return; }
        }
        const ext = output.type.includes("mp4") ? "mp4" : "webm";
        showEditor(new File([output], "story-" + Date.now() + "." + ext, { type: output.type.split(";")[0] }), "video");
      } else if (active) status("A gravação ficou vazia.", true);
    };
    recorder.start(250); startedAt = performance.now();
    stage.dataset.recording = "true";
    const progress = $("[data-studio-progress]"); progress.hidden = false;
    const tick = () => {
      if (recorder?.state !== "recording") return;
      const elapsed = performance.now() - startedAt;
      const end = isBoomerang ? 2100 : settings.maxDuration;
      progress.style.width = Math.min(100, elapsed / end * 100) + "%";
      if (elapsed >= end) { finishRecording(); return; }
      progressAnimation = requestAnimationFrame(tick);
    };
    tick();
  };
  const chooseFile = selected => {
    const normalized = normalizePublicationMedia(selected);
    if (!normalized || !FORMATS[normalized.type] || normalized.size > 100 * 1024 * 1024) {
      status("Escolha foto JPEG/PNG/WebP ou vídeo MP4/WebM de até 100 MB.", true); return;
    }
    const thumb = $("[data-studio-thumb]");
    thumb.textContent = normalized.type.startsWith("image/") ? "▣" : "▶";
    showEditor(normalized, normalized.type.startsWith("video/") ? "video" : "image");
  };
  const addLayer = (text, sticker = false) => {
    const el = document.createElement("div");
    el.dataset.studioOverlay = "true"; el.dataset.x = "0.5"; el.dataset.y = "0.44";
    el.dataset.size = sticker ? "48" : "34"; el.dataset.color = "#ffffff";
    el.dataset.font = "700 "; el.dataset.family = "system-ui";
    el.className = "studio-overlay";
    el.textContent = cleanName(text);
    el.tabIndex = 0; el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Editar ou arrastar elemento");
    overlayRoot.append(el);
    let start = null;
    el.addEventListener("pointerdown", e => {
      start = { x: e.clientX, y: e.clientY, left: +el.dataset.x, top: +el.dataset.y };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", e => {
      if (!start) return;
      const rect = overlayRoot.getBoundingClientRect();
      el.dataset.x = String(Math.max(.10, Math.min(.90, start.left + (e.clientX - start.x) / rect.width)));
      el.dataset.y = String(Math.max(.08, Math.min(.90, start.top + (e.clientY - start.y) / rect.height)));
      el.style.left = (+el.dataset.x * 100) + "%";
      el.style.top = (+el.dataset.y * 100) + "%";
    });
    el.addEventListener("pointerup", () => { start = null; });
    el.addEventListener("click", () => openLayerEditor(el));
    return el;
  };
  const modal = (title, html) => {
    $("[data-studio-modal-title]").textContent = title;
    body.innerHTML = html;
    $("[data-studio-modal]").hidden = false;
  };
  const modalClose = () => {
    stopMusicPreview(); stopMusicPreview = () => {};
    $("[data-studio-modal]").hidden = true; body.replaceChildren();
  };
  const openLayerEditor = el => {
    const fonts = '<option value="system-ui">Moderna</option><option value="Georgia">Clássica</option><option value="cursive">Manuscrita</option><option value="monospace">Mono</option>';
    modal("Editar texto", '<textarea data-layer-text rows="3" maxlength="120" placeholder="Seu texto"></textarea>' +
      '<label>Fonte<select data-layer-font>' + fonts + '</select></label>' +
      '<label>Cor<input type="color" data-layer-color value="#ffffff"></label>' +
      '<label>Tamanho<input type="range" data-layer-size min="18" max="65" value="34"></label>' +
      '<div class="studio-modal-actions"><button type="button" data-layer-delete>Remover</button><button type="button" data-layer-save>Concluir</button></div>');
    body.querySelector("[data-layer-text]").value = el.textContent;
    body.querySelector("[data-layer-font]").value = el.dataset.family;
    body.querySelector("[data-layer-color]").value = el.dataset.color;
    body.querySelector("[data-layer-size]").value = el.dataset.size;
    body.querySelector("[data-layer-save]").onclick = () => {
      el.textContent = cleanName(body.querySelector("[data-layer-text]").value);
      el.dataset.family = body.querySelector("[data-layer-font]").value;
      el.dataset.color = body.querySelector("[data-layer-color]").value;
      el.dataset.size = body.querySelector("[data-layer-size]").value;
      el.style.fontFamily = el.dataset.family; el.style.color = el.dataset.color;
      el.style.fontSize = el.dataset.size + "px"; modalClose();
    };
    body.querySelector("[data-layer-delete]").onclick = () => { el.remove(); modalClose(); };
  };
  // The song is metadata (and an authorized stream for Audius), never a
  // visible draggable sticker or a commercial audio file mixed into video.
  const removeCatalogCredit = () => overlayRoot.querySelectorAll("[data-studio-music-credit]").forEach(el => el.remove());
  const selectStoryMusic = track => {
    removeCatalogCredit();
    music = track;
    $("[data-studio-track-label]").textContent = track.title;
    $("[data-studio-music-remove]").hidden = false;
    modalClose();
    status(track.kind === "catalog"
      ? track.provider === "audius"
        ? "Música selecionada. A reprodução do Audius será tentada automaticamente no Story."
        : "Música identificada; apenas o player oficial pode reproduzir a prévia."
      : "Música adicionada ao Story: o áudio será incorporado à mídia publicada.");
  };
  const openMusic = () => {
    stopMusicPreview();
    stopMusicPreview = openStoryMusicPicker({
      modal, body, builtin: BUILTIN, onSelect: selectStoryMusic, onStatus: status
    });
  };
  const openAudience = () => {
    const people = $("[data-studio-people]");
    modal("Amigos próximos", '<p>Selecione de 1 a 20 pessoas que poderão assistir a este story.</p><div data-studio-audience-list></div>' +
      '<button type="button" data-studio-audience-done class="studio-modal-primary">Usar seleção</button>');
    const list = body.querySelector("[data-studio-audience-list]");
    [...people.options].forEach(option => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox"; checkbox.value = option.value; checkbox.checked = option.selected;
      label.append(checkbox, document.createTextNode(option.textContent)); list.append(label);
    });
    body.querySelector("[data-studio-audience-done]").onclick = () => {
      const ids = [...list.querySelectorAll("input:checked")].map(e => e.value);
      if (ids.length < 1 || ids.length > 20) { status("Selecione entre 1 e 20 pessoas.", true); return; }
      [...people.options].forEach(o => { o.selected = ids.includes(o.value); });
      $("[data-studio-visibility]").value = "selected"; modalClose();
      $("[data-studio-friends]").classList.add("is-selected");
      status("Story para " + ids.length + " pessoas selecionadas.");
    };
  };
  const makeCanvas = (w = 720, h = 1280) => {
    const c = document.createElement("canvas");
    c.width = Math.min(1080, w); c.height = Math.min(1920, h);
    return c;
  };
  const fillCanvas = async (canvas, media, filter) => {
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (sourceKind === "text") {
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, currentBackground); g.addColorStop(1, "#171025");
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (media) {
      ctx.filter = FILTERS[filter] || "none";
      drawCover(ctx, media, canvas.width, canvas.height);
      ctx.filter = "none";
    }
    paintLayers(ctx, overlayRoot, canvas.width, canvas.height);
  };
  const renderStill = async () => {
    const canvas = makeCanvas();
    if (file?.type.startsWith("image/")) {
      const img = new Image(); img.src = url;
      if (!img.complete) await waitEvent(img, "load");
      await fillCanvas(canvas, img, editFilter);
    } else await fillCanvas(canvas, null, editFilter);
    return canvas;
  };
  const exportVideo = async (still, withMusic) => {
    const mime = videoFormat();
    if (!mime) throw new Error("Não é possível exportar o vídeo com edição neste navegador.");
    const canvas = still || makeCanvas();
    const ctx = canvas.getContext("2d", { alpha: false });
    let framesStream = null;
    let audioCtx = null, source = null;
    let videoMedia = null, recorded = null, raf = null;
    try {
      const duration = sourceKind === "video" ? LIMIT : (withMusic ? 12000 : 15000);
      if (sourceKind === "video") {
        videoMedia = document.createElement("video");
        videoMedia.src = url; videoMedia.playsInline = true; videoMedia.muted = false;
        await waitEvent(videoMedia, "loadedmetadata");
        if (videoMedia.videoWidth && videoMedia.videoHeight) {
          canvas.width = Math.min(1080, videoMedia.videoWidth);
          canvas.height = Math.round(canvas.width * videoMedia.videoHeight / videoMedia.videoWidth);
        }
      }
      framesStream = canvas.captureStream(24);
      if (withMusic || videoMedia) {
        const AudioEngine = window.AudioContext || window.webkitAudioContext;
        if (!AudioEngine) throw new Error("Este navegador não suporta edição de áudio.");
        audioCtx = new AudioEngine();
        const destination = audioCtx.createMediaStreamDestination();
        if (videoMedia) audioCtx.createMediaElementSource(videoMedia).connect(destination);
        if (withMusic) {
          const buffer = music.kind === "builtin"
            ? makeSynthBuffer(audioCtx, music)
            : await audioCtx.decodeAudioData(await music.file.arrayBuffer());
          source = audioCtx.createBufferSource(); source.buffer = buffer; source.loop = true;
          source.connect(destination);
        }
        destination.stream.getAudioTracks().forEach(t => framesStream.addTrack(t));
        await audioCtx.resume(); if (source) source.start();
      }
      recorded = new MediaRecorder(framesStream, { mimeType: mime });
      const received = [];
      const completion = new Promise((resolve, reject) => {
        recorded.ondataavailable = e => { if (e.data.size) received.push(e.data); };
        recorded.onerror = () => reject(new Error("Falha ao processar vídeo."));
        recorded.onstop = () => resolve(new Blob(received, { type: recorded.mimeType || mime }));
      });
      recorded.start(250);
      if (videoMedia) {
        await videoMedia.play();
        const redraw = () => {
          fillCanvas(canvas, videoMedia, editFilter);
          if (!videoMedia.paused && !videoMedia.ended) raf = requestAnimationFrame(redraw);
        };
        redraw();
      }
      const ms = videoMedia && Number.isFinite(videoMedia.duration)
        ? Math.min(duration, Math.max(350, videoMedia.duration * 1000)) : duration;
      await new Promise(resolve => {
        const timer = setTimeout(resolve, ms);
        videoMedia?.addEventListener("ended", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      if (recorded.state === "recording") recorded.stop();
      const output = await completion;
      if (!output.size) throw new Error("A exportação gerou um vídeo vazio.");
      return new File([output], "story-" + Date.now() + (mime.includes("mp4") ? ".mp4" : ".webm"), { type: mime.split(";")[0] });
    } finally {
      if (raf) cancelAnimationFrame(raf);
      videoMedia?.pause(); if (source) { try { source.stop(); } catch {} } framesStream?.getTracks().forEach(t => t.stop());
      if (audioCtx) await audioCtx.close().catch(() => {});
    }
  };
  const exportFinal = async () => {
    if (sourceKind === "none") throw new Error("Adicione uma foto, vídeo ou texto.");
    const layered = overlayRoot.childElementCount > 0;
    if (sourceKind === "video" && (!music || music.kind === "catalog") && !layered && editFilter === "none") return file;
    if (sourceKind === "video") return exportVideo(null, Boolean(music && music.kind !== "catalog"));
    const canvas = await renderStill();
    if (music && music.kind !== "catalog") return exportVideo(canvas, true);
    const blob = await blobFromCanvas(canvas, "image/jpeg");
    return new File([blob], "story-" + Date.now() + ".jpg", { type: "image/jpeg" });
  };
  const publish = async () => {
    if (publishing) return;
    publishing = true;
    const buttons = dialog.querySelectorAll("button");
    buttons.forEach(b => { b.disabled = true; });
    let storyId = null, uploadedPath = null;
    try {
      const visibility = $("[data-studio-visibility]").value;
      const selected = [...$("[data-studio-people]").selectedOptions].map(o => o.value);
      if (visibility === "selected" && !selected.length) throw new Error("Escolha seus amigos próximos.");
      status("Preparando sua mídia…");
      const media = await exportFinal();
      const normalized = normalizePublicationMedia(media);
      if (!normalized || !FORMATS[normalized.type] || normalized.size > 100 * 1024 * 1024) {
        throw new Error("Mídia inválida ou maior que 100 MB.");
      }
      const text = music?.kind === "catalog"
        ? encodeStorySong(caption.value,music)
        : String(caption.value || "").trim().slice(0,700);
      status("Criando story no Neon…");
      const created = await client.rpc("v5_create_story", {
        p_body: text, p_visibility: visibility, p_recipient_ids: visibility === "selected" ? selected : []
      });
      if (created.error || !created.data) throw created.error || new Error("Neon não confirmou a criação.");
      storyId = created.data;
      uploadedPath = "stories/" + storyId + "/" + crypto.randomUUID() + "." + FORMATS[normalized.type];
      await uploadResumable(client, uploadedPath, normalized, n => status("Enviando ao Neon Storage: " + n + "%"));
      const attached = await client.rpc("v5_attach_story_media", {
        p_story_id: storyId, p_storage_path: uploadedPath,
        p_kind: normalized.type.startsWith("video/") ? "video" : "image",
        p_mime_type: normalized.type, p_byte_size: normalized.size
      });
      if (attached.error) throw attached.error;
      status("Story publicado!");
      publishing = false; close(); await refresh();
    } catch (error) {
      console.error("Loooply Stories Studio:", error);
      if (uploadedPath) await client.storage.from("looply-media").remove([uploadedPath]).catch(() => {});
      if (storyId) await client.from("stories").delete().eq("id", storyId).eq("author_id", userId);
      status(error.message || "Não foi possível publicar. Tente novamente.", true);
    } finally { publishing = false; buttons.forEach(b => { b.disabled = false; }); }
  };
  const activateShutter = async e => {
    if (mode !== "camera") return;
    e.preventDefault(); pointer = e.pointerId; held = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    hold = setTimeout(() => { held = true; try { beginRecording(); } catch (error) { status(error.message, true); } }, 340);
  };
  const releaseShutter = async e => {
    if (pointer !== e.pointerId) return;
    pointer = null;
    if (hold) { clearTimeout(hold); hold = null; }
    stage.dataset.recording = "false";
    if (held) finishRecording(); else await capturePhoto().catch(error => status(error.message, true));
  };
  const handlers = {
    "[data-studio-close]": close,
    "[data-studio-back]": async () => { clearPreview(); await startCamera().catch(error => status(error.message, true)); },
    "[data-studio-text-mode]": createText,
    "[data-studio-grid-toggle]": () => { settings.grid = !settings.grid; $("[data-studio-grid]").hidden = !settings.grid; },
    "[data-studio-flip]": async () => { await startCamera(settings.facing === "user" ? "environment" : "user").catch(error => status(error.message, true)); },
    "[data-studio-boomerang]": () => { isBoomerang = !isBoomerang; $("[data-studio-boomerang]").setAttribute("aria-pressed", String(isBoomerang)); status(isBoomerang ? "Boomerang ativado: segure para gravar." : "Boomerang desativado."); },
    "[data-studio-flash]": async () => {
      const track = stream?.getVideoTracks()[0];
      if (!track || track.readyState !== "live") { status("Abra a câmera para ativar o flash.", true); return; }
      const turnOn = settings.flash !== "on";
      if (settings.facing === "user") {
        settings.flash = turnOn ? "on" : "off";
        stage.dataset.screenFlash = turnOn ? "ready" : "off";
        flashButton.setAttribute("aria-pressed", String(turnOn));
        flashButton.textContent = turnOn ? "ϟ" : "ϟ";
        flashButton.title = turnOn ? "Desligar iluminação frontal" : "Ligar iluminação frontal";
        status(turnOn ? "Luz branca da tela ativada para selfies." : "Luz da tela desligada.");
        return;
      }
      const capabilities = track.getCapabilities?.();
      if (capabilities && capabilities.torch === false) {
        resetFlash(); status("A câmera traseira deste aparelho não disponibiliza a lanterna pelo navegador.", true); return;
      }
      try {
        // A torch constraint turns on the physical rear LED while previewing;
        // verify the reported setting whenever browsers expose it.
        await track.applyConstraints({ advanced: [{ torch: turnOn }] });
        const confirmed = track.getSettings?.().torch;
        if (turnOn && confirmed !== true && capabilities?.torch !== true) {
          throw new Error("O navegador não confirmou suporte à lanterna física.");
        }
        settings.flash = turnOn ? "on" : "off";
        flashButton.setAttribute("aria-pressed", String(turnOn));
        flashButton.title = turnOn ? "Desligar lanterna traseira" : "Ligar lanterna traseira";
        status(turnOn ? "Lanterna traseira ligada." : "Lanterna traseira desligada.");
      } catch (error) {
        resetFlash();
        status("Não foi possível ligar a lanterna traseira: " + (error.message || "recurso indisponível"), true);
      }
    },
    "[data-studio-settings]": () => {
      modal("Configurações da câmera", '<label>Tempo máximo de vídeo<select data-studio-length><option value="15000">15 segundos</option><option value="30000">30 segundos</option></select></label>' +
        '<p class="studio-hint">A câmera frontal utiliza a tela branca como iluminação. Na traseira, o flash aciona a lanterna física se o navegador autorizar. Para dar zoom, pinçe a imagem com dois dedos.</p>');
      body.querySelector("[data-studio-length]").value = String(settings.maxDuration);
      body.querySelector("[data-studio-length]").onchange = e => { settings.maxDuration = +e.target.value; modalClose(); };
    },
    "[data-studio-post]": () => { close(); root.querySelector("[data-toggle-composer]")?.click(); root.querySelector("[data-social-post]")?.scrollIntoView({ behavior: "smooth" }); },
    "[data-studio-music-open]": openMusic,
    "[data-studio-music-remove]": () => { music = null; removeCatalogCredit(); $("[data-studio-track-label]").textContent = "Adicionar música"; $("[data-studio-music-remove]").hidden = true; },
    "[data-studio-add-text]": () => openLayerEditor(addLayer("Seu texto", false)),
    "[data-studio-stickers]": () => {
      modal("Figurinhas", '<div class="studio-stickers">' + ["❤️","✨","🌟","😍","🎉","🔥","🥳","💜"].map(t => '<button type="button" data-sticker="' + t + '">' + t + '</button>').join("") + '</div>');
      body.querySelectorAll("[data-sticker]").forEach(b => b.onclick = () => { addLayer(b.dataset.sticker, true); modalClose(); });
    },
    "[data-studio-enhance]": () => {
      const keys = Object.keys(FILTERS); editFilter = keys[(keys.indexOf(editFilter) + 1) % keys.length];
      edits.style.filter = FILTERS[editFilter]; status("Ajuste visual: " + (editFilter === "none" ? "original" : editFilter));
    },
    "[data-studio-modal-close]": modalClose,
    "[data-studio-publicar]": () => { $("[data-studio-visibility]").value = "public"; void publish(); },
    "[data-studio-friends]": openAudience
  };
  root.addEventListener("click", event => {
    if (event.target.closest("[data-story-create-open]")) { event.preventDefault(); event.stopPropagation(); void open(); return; }
    if (!dialog.contains(event.target)) return;
    for (const [selector, handler] of Object.entries(handlers)) {
      if (event.target.closest(selector)) { event.preventDefault(); event.stopPropagation(); handler(event); return; }
    }
  }, true);
  $("[data-studio-file]").addEventListener("change", e => {
    if (e.target.files?.[0]) chooseFile(e.target.files[0]);
  });
  dialog.querySelectorAll("[data-studio-filter]").forEach(button => button.onclick = () => {
    settings.filter = button.dataset.studioFilter; video.style.filter = FILTERS[settings.filter];
    dialog.querySelectorAll("[data-studio-filter]").forEach(b => b.classList.toggle("is-active", b === button));
  });
  dialog.querySelectorAll("[data-studio-face]").forEach(button => button.onclick = async () => {
    settings.face = button.dataset.studioFace;
    if (settings.face !== "none") {
      status("Ativando lente facial…");
      const ok = await face?.prepare();
      if (!ok) { status("Lentes faciais indisponíveis neste navegador.", true); settings.face = "none"; return; }
    }
    face?.setLens(settings.face); status("Lente: " + settings.face);
  });
  // No zoom on load; only a deliberate two-finger pinch changes magnification.
  const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  stage.addEventListener("touchstart", event => {
    if (mode !== "camera" || event.touches.length !== 2 || event.target.closest("button, .studio-modal, .studio-camera-bottom")) return;
    pinch = { distance: Math.max(1, distance(event.touches)), initial: settings.zoom };
    event.preventDefault();
  }, { passive: false });
  stage.addEventListener("touchmove", event => {
    if (!pinch || mode !== "camera") return;
    if (event.touches.length !== 2) { pinch = null; return; }
    setZoom(pinch.initial * distance(event.touches) / pinch.distance);
    event.preventDefault();
  }, { passive: false });
  stage.addEventListener("touchend", event => {
    if (event.touches.length < 2) pinch = null;
  }, { passive: true });
  stage.addEventListener("touchcancel", () => { pinch = null; }, { passive: true });
  const shutter = $("[data-studio-shutter]");
  shutter.addEventListener("pointerdown", activateShutter);
  shutter.addEventListener("pointerup", releaseShutter);
  shutter.addEventListener("pointercancel", e => { if (hold) clearTimeout(hold); pointer = null; if (held) finishRecording(); });
  shutter.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void capturePhoto(); } });
  $("[data-studio-form]").addEventListener("submit", e => {
    e.preventDefault(); e.stopPropagation(); void publish();
  });
  dialog.addEventListener("cancel", e => { e.preventDefault(); close(); });
  dialog.addEventListener("close", () => { active = false; stopCamera(); revokeUrl(); });
  return () => {
    close();
    if (lastThumb) { URL.revokeObjectURL(lastThumb); lastThumb = null; }
  };
}
