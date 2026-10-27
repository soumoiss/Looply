import { StoryFaceLens } from "./story-ar.js";
import { DEFAULT_STORY_EFFECTS, loadStoryEffectCatalog, loadStoryEffectManifest } from "./story-ar-catalog.js";
import { normalizePublicationMedia, uploadResumable } from "./social.js";
import { encodeStorySong } from "./story-music-catalog.js";
import { openStoryMusicPicker } from "./story-music-picker.js";
import { attachStoryMusic } from "./story-audio-mixer.js";
import { captionWithLicensedMusic } from "./story-licensed-music.js";

const FILTERS = Object.freeze({ none:"none", glow:"brightness(1.07) contrast(1.04) saturate(1.12)", golden:"sepia(.18) saturate(1.24) contrast(1.07)", cool:"saturate(.86) hue-rotate(10deg) brightness(1.05)", mono:"grayscale(1) contrast(1.12)" });
const LIMIT = 30_000;
const escapeHtml = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("\'","&#39;");
export const STORY_CANVAS_SIZE = Object.freeze({ width: 1080, height: 1920 });
export function containRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}
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
        '<video class="studio-camera-backdrop studio-camera-only" data-studio-backdrop-video autoplay playsinline muted aria-hidden="true"></video>' +
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
          '<button type="button" class="studio-icon" data-studio-grid-toggle aria-label="Grade de alinhamento" aria-pressed="false">⊞</button>' +
          '<button type="button" class="studio-icon" data-studio-camera-more aria-label="Mais recursos da câmera" aria-expanded="false">⌄</button>' +
          '<div class="studio-camera-extra" data-studio-camera-extra hidden>' +
            '<button type="button" class="studio-icon" data-studio-timer aria-label="Temporizador">◷</button>' +
            '<button type="button" class="studio-icon" data-studio-handsfree aria-label="Gravar sem segurar" aria-pressed="false">●</button>' +
          '</div>' +
        '</div>' +
        '<section class="studio-camera-bottom studio-camera-only">' +
          '<div class="studio-lens-chooser" data-studio-lens-chooser aria-label="Efeitos AR para o rosto">' +
            DEFAULT_STORY_EFFECTS.map(effect =>
              '<button type="button" data-studio-lens="' + effect.id + '"' + (effect.id === "none" ? ' class="is-active" aria-pressed="true"' : ' aria-pressed="false"') + '>' +
              '<span class="studio-lens-thumbnail" aria-hidden="true">' + effect.symbol + '</span>' +
              '<span class="studio-lens-title">' + effect.name + '</span></button>').join("") +
          '</div>' +
          '<div class="studio-capture-row">' +
            '<label class="studio-gallery-button" title="Abrir galeria"><span data-studio-thumb>▧</span><input type="file" data-studio-file accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" aria-label="Selecionar da galeria"></label>' +
            '<button type="button" class="studio-shutter" data-studio-shutter aria-label="Toque para foto; segure para vídeo"><span></span></button>' +
            '<button type="button" class="studio-icon" data-studio-flip aria-label="Inverter câmera">⟳</button>' +
          '</div>' +
          '<nav class="studio-modes" aria-label="Modos de publicação">' +
            '<button type="button" data-studio-post>POST</button><b>STORY</b><span aria-disabled="true" title="Reels disponíveis no Feed">REEL</span><span aria-disabled="true" title="Transmissões ao vivo ainda não disponíveis">LIVE</span>' +
          '</nav>' +
          '<div class="studio-progress" data-studio-progress hidden></div>' +
        '</section>' +
        '<header class="studio-edit-top studio-edit-only" hidden>' +
          '<button type="button" class="studio-icon" data-studio-back aria-label="Voltar à câmera">←</button>' +
          '<button type="button" class="studio-audio-pill" data-studio-music-open aria-label="Pesquisar ou alterar música">♫ <span class="studio-audio-copy"><span data-studio-track-label>Adicionar música</span><small data-studio-track-hint>Trilha sonora</small></span></button>' +
          '<button type="button" class="studio-icon studio-audio-remove" data-studio-music-remove hidden aria-label="Remover música">×</button>' +
        '</header>' +
        '<div class="studio-edit-tools studio-edit-only" hidden>' +
          '<button type="button" class="studio-icon" data-studio-add-text aria-label="Adicionar texto">Aa</button>' +
          '<button type="button" class="studio-icon" data-studio-stickers aria-label="Adicionar figurinhas">☺</button>' +
          '<button type="button" class="studio-icon" data-studio-music-open aria-label="Adicionar música">♫</button>' +
          '<button type="button" class="studio-icon" data-studio-effects-open aria-label="Filtros de imagem e vídeo">✦</button>' +
          '<button type="button" class="studio-icon" data-studio-editor-more aria-label="Mais recursos de edição" aria-expanded="false">⌄</button>' +
          '<div class="studio-editor-extra" data-studio-editor-extra hidden><button type="button" class="studio-icon" data-studio-mentions-open aria-label="Mencionar pessoas">@</button></div>' +

        '</div>' +
        '<div class="studio-edit-bottom studio-edit-only" hidden>' +
          '<textarea data-studio-caption name="body" maxlength="700" rows="2" placeholder="Adicione uma legenda..." aria-label="Legenda do story"></textarea>' +
          '<div class="studio-publish-row">' +
            '<button type="button" class="studio-pill studio-publish-public" data-studio-publicar><span aria-hidden="true">◉</span> Seu story</button>' +
            '<button type="button" class="studio-pill" data-studio-friends><span class="studio-star">★</span> Amigos próximos</button>' +
            '<button type="button" class="studio-next" data-studio-send aria-label="Mais opções de compartilhamento">➜</button>' +
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
function videoFormat(withAudio=false) {
  if (typeof MediaRecorder !== "function") return null;
  const audioFirst = ["video/webm;codecs=vp8,opus","video/webm;codecs=vp9,opus",
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',"video/mp4","video/webm"];
  const videoFirst = ["video/mp4","video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus","video/webm"];
  return (withAudio?audioFirst:videoFirst).find(type=>MediaRecorder.isTypeSupported(type))||null;
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
  if (!sw || !sh) return;
  // Fill the 9:16 canvas with a softened backdrop, then preserve the entire
  // source image/video in the foreground. No automatic crop or zoom.
  const cover = Math.max(w / sw, h / sh) * 1.12;
  const coverW = sw * cover, coverH = sh * cover;
  ctx.save();
  ctx.filter = "blur(28px) brightness(.58)";
  ctx.drawImage(media, (w - coverW) / 2, (h - coverH) / 2, coverW, coverH);
  ctx.restore();
  const contain = Math.min(w / sw, h / sh);
  const drawW = sw * contain, drawH = sh * contain;
  ctx.drawImage(media, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
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

export function bindStoryStudio(root, client, userId, refresh, isAdmin = false) {
  const dialog = root.querySelector("[data-story-create-dialog]");
  if (dialog) dialog.dataset.admin = isAdmin ? "true" : "false";
  if (!dialog?.classList.contains("story-studio")) return () => {};
  const $ = selector => dialog.querySelector(selector);
  const stage = $("[data-studio-stage]");
  const video = $("[data-studio-video]");
  const backdropVideo = $("[data-studio-backdrop-video]");
  const lens = $("[data-studio-lens]");
  const edits = $("[data-studio-edited]");
  const overlayRoot = $("[data-studio-overlays]");
  const body = $("[data-studio-modal-body]");
  const feedback = $("[data-studio-status]");
  const caption = $("[data-studio-caption]");
  const settings = { facing: "user", face: "none", grid: false, flash: "off", zoom: 1, maxDuration: 30000 };
  let availableEffects = DEFAULT_STORY_EFFECTS, selectedManifest = {id:"none",type:"none",strength:0,params:{}};
  let stream = null, face = null, file = null, url = null, mode = "camera", active = false;
  let recorder = null, frames = null, captureStream = null, chunks = [], hold = null, held = false, pointer = null;
  let startedAt = 0, progressAnimation = null, lensReady = false, music = null, audioPreview = null, publishing = false;
  let selectedMentionIds = [];
  let stopMusicPreview = () => {};
  let sourceKind = "none", isBoomerang = false, currentBackground = "#7c3ed7", editFilter = "none", lastThumb = null;
  let zoomMode = "digital", zoomLimit = 3, zoomBase = 1, zoomTrack = null;
  let zoomBusy = false, zoomPending = null, pinch = null;
  let cameraTimerSeconds = 0, handsfreeRecording = false;
  const status = (text, bad = false) => {
    // Keep member feedback useful without exposing implementation details.
    const message = isAdmin || !bad || /Este serviço não autoriza incorporar essa música/.test(text)
      ? text : "Não foi possível concluir essa ação. Confira a mídia e tente novamente.";
    feedback.textContent = message;
    feedback.dataset.error = bad ? "true" : "false";
    if(bad) console.warn("Loooply Stories:",text);
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
    overlayRoot.replaceChildren(); file = null; sourceKind = "none"; selectedMentionIds = [];
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
    const mirror = settings.facing === "user" ? "scaleX(-1) " : "";
    video.style.transform = mirror + "scale(" + digitalFactor + ")";
    backdropVideo.style.transform = mirror + "scale(" + digitalFactor * 1.08 + ")";
    lens.style.transform = mirror + "scale(" + digitalFactor + ")";
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
    const sx = (sourceW - cropW) / 2, sy = (sourceH - cropH) / 2;
    const frame = containRect(cropW, cropH, canvas.width, canvas.height);
    if (!frame) throw new Error("Não foi possível preparar o enquadramento.");
    const cover = Math.max(canvas.width / cropW, canvas.height / cropH) * 1.12;
    const coverW = cropW * cover, coverH = cropH * cover;
    ctx.save();
    ctx.filter = "blur(28px) brightness(.58)";
    ctx.drawImage(video, sx, sy, cropW, cropH,
      (canvas.width - coverW) / 2, (canvas.height - coverH) / 2, coverW, coverH);
    ctx.restore();
    const drawLayer = layer => {
      const scaleX = layer.width / sourceW, scaleY = layer.height / sourceH;
      ctx.save();
      if (settings.facing === "user") {
        ctx.translate(frame.x * 2 + frame.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(layer, sx * scaleX, sy * scaleY, cropW * scaleX, cropH * scaleY,
        frame.x, frame.y, frame.width, frame.height);
      ctx.restore();
    };
    drawLayer(video);
    if (lens.width && lens.height) drawLayer(lens);
  };
  const stopCamera = () => {
    if (recorder?.state === "recording") recorder.stop();
    stream?.getTracks().forEach(t => t.stop()); stream = null;
    video.srcObject = null; backdropVideo.srcObject = null; face?.stop(); face = null; lensReady = false;
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
    const constraints = { video: {
      facingMode: { ideal: facing },
      width: { ideal: 1080 }, height: { ideal: 1920 },
      aspectRatio: { ideal: 9 / 16 },
      resizeMode: { ideal: "none" }
    }, audio: true };
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
    backdropVideo.srcObject = stream;
    updateZoomPreview();
    video.style.filter = "none";
    resetFlash();
    showMode("camera");
    try { await video.play(); } catch {}
    try { await backdropVideo.play(); } catch {}
    face = new StoryFaceLens(video, lens, () => settings.facing);
    face.start();
    if(settings.face!=="none"){
      const current=face;
      void current.prepare().then(ok=>{
        if(ok&&face===current)void current.setLens(selectedManifest);
      });
    }
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
    $("[data-studio-track-hint]").textContent = "Trilha sonora";
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
      canvas.width = STORY_CANVAS_SIZE.width;
      canvas.height = STORY_CANVAS_SIZE.height;
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
    canvas.width = STORY_CANVAS_SIZE.width;
    canvas.height = STORY_CANVAS_SIZE.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    const savedFrames = [];
    const snap = document.createElement("canvas");
    snap.width = 360; snap.height = 640;
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
    const container = $("[data-studio-modal]");
    container.dataset.sheet = title === "Escolher música" ? "music" : "general";
    container.hidden = false;
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
    $("[data-studio-track-hint]").textContent = track.artist || "Áudio selecionado";
    modalClose();
    if(isAdmin)status("ADM: áudio selecionado para publicação: "+track.kind+" / "+(track.provider||"local"));
  };
  const openMusic = () => {
    stopMusicPreview();
    stopMusicPreview = openStoryMusicPicker({
      modal, body, builtin: BUILTIN, onSelect: selectStoryMusic, onStatus: status, isAdmin
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
  const openMentions = () => {
    const people = [...$("[data-studio-people]").options];
    const visibility = $("[data-studio-visibility]").value;
    if (visibility === "private") { status("Menções ficam disponíveis em Stories públicos ou para destinatários selecionados.", true); return; }
    const allowed = visibility === "selected"
      ? new Set([...$("[data-studio-people]").selectedOptions].map(option => option.value))
      : null;
    let chosen = new Set(selectedMentionIds);
    modal("Mencionar pessoas", '<label class="visually-hidden" for="studioMentionSearch">Pesquisar pessoas</label><input id="studioMentionSearch" type="search" placeholder="Pesquisar nome ou @usuário..." autocomplete="off"><div class="studio-mention-list" data-studio-mention-list role="listbox" aria-label="Perfis visíveis"></div><div class="studio-modal-actions"><button type="button" data-studio-mention-cancel>Cancelar</button><button type="button" class="studio-modal-primary" data-studio-mention-done>Confirmar seleção</button></div>');
    const search = body.querySelector("#studioMentionSearch");
    const list = body.querySelector("[data-studio-mention-list]");
    const renderPeople = () => {
      const term = String(search.value || "").trim().toLocaleLowerCase("pt-BR").replace(/^@/, "");
      const matches = people.filter(option => {
        if (allowed && !allowed.has(option.value)) return false;
        const value = ((option.textContent || "") + " " + (option.dataset.username || "")).toLocaleLowerCase("pt-BR");
        return !term || value.includes(term);
      });
      list.innerHTML = matches.length ? matches.map(option => {
        const id = escapeHtml(option.value);
        const name = escapeHtml(option.dataset.displayName || option.textContent.split(" · @")[0] || "Membro");
        const username = escapeHtml(option.dataset.username || "");
        const avatar = option.dataset.avatar || "";
        let safeAvatar = "";
        try { const parsed = new URL(avatar); if (parsed.protocol === "https:") safeAvatar = escapeHtml(parsed.href); } catch {}
        const image = safeAvatar ? '<img src="' + safeAvatar + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span aria-hidden="true">' + escapeHtml(name.slice(0,1).toLocaleUpperCase("pt-BR")) + '</span>';
        const checked = chosen.has(option.value);
        return '<button type="button" class="studio-mention-person' + (checked ? ' is-selected' : '') + '" role="option" aria-selected="' + checked + '" data-mention-person="' + id + '">' + image + '<span><strong>' + name + '</strong><small>@' + username + '</small></span><span class="studio-mention-check" aria-hidden="true">' + (checked ? '✓' : '') + '</span></button>';
      }).join("") : '<p class="studio-mention-empty">Nenhuma pessoa encontrada.</p>';
    };
    renderPeople();
    search.addEventListener("input", renderPeople);
    list.addEventListener("click", event => {
      const option = event.target.closest("[data-mention-person]");
      if (!option) return;
      const id = option.dataset.mentionPerson;
      if (chosen.has(id)) chosen.delete(id);
      else if (chosen.size >= 20) { status("Selecione no máximo 20 pessoas.", true); return; }
      else chosen.add(id);
      renderPeople();
    });
    body.querySelector("[data-studio-mention-cancel]").onclick = modalClose;
    body.querySelector("[data-studio-mention-done]").onclick = () => {
      selectedMentionIds = [...chosen];
      overlayRoot.querySelectorAll("[data-story-mention-layer]").forEach(layer => layer.remove());
      for (const id of selectedMentionIds) {
        const option = people.find(item => item.value === id);
        if (!option) continue;
        const layer = addLayer("@" + String(option.dataset.username || ""));
        layer.dataset.storyMentionLayer = "";
        layer.dataset.mentionUserId = id;
      }
      modalClose();
      status(selectedMentionIds.length ? selectedMentionIds.length + " menção(ões) adicionada(s). Arraste para posicionar." : "Menções removidas.");
    };
  };
  const makeCanvas = (w = STORY_CANVAS_SIZE.width, h = STORY_CANVAS_SIZE.height) => {
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
  const exportVideo = async (still, withMusic, armedAudioContext = null) => {
    const mime = videoFormat(Boolean(withMusic));
    if (!mime) throw new Error("Não é possível exportar o vídeo com edição neste navegador.");
    const canvas = still || makeCanvas();
    const ctx = canvas.getContext("2d", { alpha: false });
    let framesStream = null;
    let audioCtx = null, source = null;
    let videoMedia = null, recorded = null, raf = null;
    try {
      const duration = sourceKind === "video" ? LIMIT : (withMusic ? 7000 : 15000);
      if (sourceKind === "video") {
        videoMedia = document.createElement("video");
        videoMedia.src = url; videoMedia.playsInline = true; videoMedia.muted = false;
        await waitEvent(videoMedia, "loadedmetadata");
        // Keep makeCanvas()'s 9:16 output. fillCanvas() composes the
        // complete source frame over a blurred background without cropping.
      }
      framesStream = canvas.captureStream(24);
      if (withMusic || videoMedia) {
        const AudioEngine = window.AudioContext || window.webkitAudioContext;
        if (!AudioEngine) throw new Error("Este navegador não suporta edição de áudio.");
        audioCtx = armedAudioContext || new AudioEngine();
        const destination = audioCtx.createMediaStreamDestination();
        if (videoMedia) audioCtx.createMediaElementSource(videoMedia).connect(destination);
        if (withMusic) {
          const buffer = music.kind === "builtin"
            ? makeSynthBuffer(audioCtx, music)
            : await audioCtx.decodeAudioData(await music.file.arrayBuffer());
          source = attachStoryMusic(audioCtx, destination, buffer);
        }
        destination.stream.getAudioTracks().forEach(t => framesStream.addTrack(t));
        await audioCtx.resume();
        if (audioCtx.state !== "running") throw new Error("A captura de áudio não foi ativada.");
        if(withMusic && !framesStream.getAudioTracks().some(t=>t.readyState==="live"))
          throw new Error("O gravador não recebeu a trilha de áudio.");
      }
      recorded = new MediaRecorder(framesStream, { mimeType: mime });
      const received = [];
      const completion = new Promise((resolve, reject) => {
        recorded.ondataavailable = e => { if (e.data.size) received.push(e.data); };
        recorded.onerror = () => reject(new Error("Falha ao processar vídeo."));
        recorded.onstop = () => resolve(new Blob(received, { type: recorded.mimeType || mime }));
      });
      recorded.start(250);
      // Start the soundtrack after the recorder begins: don't lose its first notes.
      if (videoMedia) {
        await videoMedia.play();
        if (source) source.start();
      } else if (source) source.start();
      if (videoMedia) {
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
      videoMedia?.pause();
      if (recorded?.state === "recording") { try { recorded.stop(); } catch {} }
      if (source) { try { source.stop(); } catch {} source.disconnect(); }
      framesStream?.getTracks().forEach(t => t.stop());
      if (audioCtx && audioCtx.state !== "closed") await audioCtx.close().catch(() => {});
    }
  };
  const exportFinal = async (armedAudioContext = null) => {
    if (sourceKind === "none") throw new Error("Adicione uma foto, vídeo ou texto.");
    const layered = overlayRoot.childElementCount > 0;
    if (sourceKind === "video" && (!music || music.kind === "catalog") && !layered && editFilter === "none") return file;
    if (sourceKind === "video") return exportVideo(null, Boolean(music && music.kind !== "catalog"), armedAudioContext);
    const canvas = await renderStill();
    if (music && music.kind !== "catalog") return exportVideo(canvas, true, armedAudioContext);
    const blob = await blobFromCanvas(canvas, "image/jpeg");
    return new File([blob], "story-" + Date.now() + ".jpg", { type: "image/jpeg" });
  };
  const publish = async () => {
    if (publishing) return;
    publishing = true;
    // Start WebAudio directly within the Publish tap, BEFORE awaiting image
    // encoding/Neon calls. Mobile browsers may suspend contexts created after
    // the transient gesture, resulting in an apparently valid but silent video.
    let armedAudioContext = null;
    if (music && (music.kind === "builtin" || music.kind === "file")) {
      const AudioEngine = window.AudioContext || window.webkitAudioContext;
      if (AudioEngine) {
        armedAudioContext = new AudioEngine();
        void armedAudioContext.resume().catch(error => {
          if (isAdmin) status("ADM: falha ao liberar captura sonora: "+error.message,true);
        });
      }
    }
    const buttons = dialog.querySelectorAll("button");
    buttons.forEach(b => { b.disabled = true; });
    let storyId = null, uploadedPath = null;
    try {
      const visibility = $("[data-studio-visibility]").value;
      const selected = [...$("[data-studio-people]").selectedOptions].map(o => o.value);
      const mentionIds = [...new Set(selectedMentionIds)];
      if (mentionIds.length && visibility === "private") throw new Error("Menções ficam disponíveis em Stories públicos ou para destinatários selecionados.");
      if (visibility === "selected" && mentionIds.some(id => !selected.includes(id))) throw new Error("Mencione apenas pessoas selecionadas para ver este Story.");
      if (visibility === "selected" && !selected.length) throw new Error("Escolha seus amigos próximos.");
      status("Preparando sua mídia…");
      // Never publish only catalog metadata: this used to produce silent
      // Apple/Deezer Stories because their previews cannot be synchronized.
      if(music?.kind==="catalog" && music.provider!=="audius")
        throw new Error("Este serviço não autoriza incorporar essa música ao Story. Para publicar com som, escolha uma trilha original, Audius ou um áudio próprio autorizado.");
      if(music?.kind==="catalog" && music.provider==="audius" && !music.id)
        throw new Error("A faixa selecionada não possui áudio disponível para o Story.");
      const media = await exportFinal(armedAudioContext);
      const normalized = normalizePublicationMedia(media);
      if (!normalized || !FORMATS[normalized.type] || normalized.size > 100 * 1024 * 1024) {
        throw new Error("Mídia inválida ou maior que 100 MB.");
      }
      const text = music?.kind === "catalog"
        ? encodeStorySong(caption.value,music)
        : captionWithLicensedMusic(caption.value,music);
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
      if (mentionIds.length) {
        const mentioned = await client.rpc("v5_add_story_mentions", { p_story_id: storyId, p_user_ids: mentionIds });
        if (mentioned.error) throw mentioned.error;
      }
      status("Story publicado!");
      publishing = false; close(); await refresh();
    } catch (error) {
      console.error("Loooply Stories Studio:", error);
      if (uploadedPath) await client.storage.from("looply-media").remove([uploadedPath]).catch(() => {});
      if (storyId) await client.from("stories").delete().eq("id", storyId).eq("author_id", userId);
      status(error.message || "Não foi possível publicar. Tente novamente.", true);
    } finally {
      if(armedAudioContext && armedAudioContext.state!=="closed")
        void armedAudioContext.close().catch(()=>{});
      publishing = false;
      buttons.forEach(b=>{b.disabled=false;});
    }
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
    "[data-studio-mentions-open]": openMentions,
    "[data-studio-stickers]": () => {
      modal("Figurinhas", '<div class="studio-stickers">' + ["❤️","✨","🌟","😍","🎉","🔥","🥳","💜"].map(t => '<button type="button" data-sticker="' + t + '">' + t + '</button>').join("") + '</div>');
      body.querySelectorAll("[data-sticker]").forEach(b => b.onclick = () => { addLayer(b.dataset.sticker, true); modalClose(); });
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
  const lensChooser=$("[data-studio-lens-chooser]");
  const renderLensCatalog=options=>{
    lensChooser.replaceChildren();
    for(const effect of options){
      const b=document.createElement("button");
      b.type="button";b.dataset.studioLens=effect.id;
      b.setAttribute("aria-pressed",String(effect.id===settings.face));
      b.classList.toggle("is-active",effect.id===settings.face);
      const icon=document.createElement("span");icon.className="studio-lens-thumbnail";
      icon.setAttribute("aria-hidden","true");icon.textContent=effect.symbol;
      const title=document.createElement("span");title.className="studio-lens-title";title.textContent=effect.name;
      b.append(icon,title);lensChooser.append(b);
    }
  };
  void loadStoryEffectCatalog().then(items=>{
    availableEffects=items;
    if(dialog.isConnected)renderLensCatalog(items);
  });
  let lensSelection=0;
  lensChooser.addEventListener("click",async event=>{
    const button=event.target.closest("[data-studio-lens]");
    if(!button)return;
    const item=availableEffects.find(x=>x.id===button.dataset.studioLens);
    if(!item)return;
    const ticket=++lensSelection;
    if(item.id==="none"){
      settings.face="none";selectedManifest={id:"none",type:"none",strength:0,params:{}};
      await face?.setLens(selectedManifest);
      renderLensCatalog(availableEffects);status("Sem lente.");
      return;
    }
    status("Carregando lente "+item.name+"…");
    try{
      const manifest=await loadStoryEffectManifest(item);
      if(ticket!==lensSelection)return;
      const current=face;
      if(!current)throw new Error("Ative a câmera para escolher um efeito.");
      const ok=await current.prepare();
      if(!ok)throw new Error("O rastreamento facial não foi iniciado neste aparelho.");
      if(ticket!==lensSelection||face!==current)return;
      selectedManifest=manifest;settings.face=item.id;
      await current.setLens(manifest);
      renderLensCatalog(availableEffects);
      status("Lente "+item.name+" ativada.");
    }catch(error){
      status(error.message||"Não foi possível carregar a lente.",true);
    }
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
