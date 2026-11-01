import { StoryFaceLens } from "./story-ar.js";
import { icon } from "./icons.js";
import { DEFAULT_STORY_EFFECTS, loadStoryEffectCatalog, loadStoryEffectManifest } from "./story-ar-catalog.js";
import { normalizePublicationMedia, uploadResumable } from "./social.js";
import { encodeStorySong, appleStoryTrackId } from "./story-music-catalog.js?v=story-music-official-widget-20261028";
import { openStoryMusicPicker } from "./story-music-picker.js?v=story-music-official-widget-20261028";
import { isExplicitStoryPublishGesture, preventImplicitStorySubmit } from "./story-publish-intent.js";
import { attachStoryMusic } from "./story-audio-mixer.js";
import { storyMusicStartSeconds } from "./story-music-clip.js";
import { captionWithLicensedMusic } from "./story-licensed-music.js";
import { STORY_TEXT_FONTS, STORY_TEXT_DEFAULT_FONT, storyTextNormalize, storyTextClampSize,
  storyTextPinchSize, storyTextClampPosition, storyTextFont, storyTextFontCss,
  storyTextLayerLayout, storyTextPaintLayer, storyTextEnsureFonts, bindStoryTextGestures } from "./story-text-layers.js";

const FILTERS = Object.freeze({ none:"none", glow:"brightness(1.07) contrast(1.04) saturate(1.12)", golden:"sepia(.18) saturate(1.24) contrast(1.07)", cool:"saturate(.86) hue-rotate(10deg) brightness(1.05)", mono:"grayscale(1) contrast(1.12)" });
const LIMIT = 30_000;
const escapeHtml = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("\'","&#39;");
export const STORY_CANVAS_SIZE = Object.freeze({ width: 1080, height: 1920 });
export const STORY_ASPECTS = Object.freeze({
  "9:16": { width:1080, height:1920 },
  "16:9": { width:1920, height:1080 },
  "3:4": { width:1440, height:1920 },
  "2:5": { width:768, height:1920 },
  "1:1": { width:1080, height:1080 }
});
export function storyCanvasSize(ratio = "9:16") {
  const size = STORY_ASPECTS[ratio] || STORY_ASPECTS["9:16"];
  return { width:size.width, height:size.height };
}
export function containRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}
// Central crop matching object-fit: cover: 9:16 canvas stays completely filled,
// including when the phone exposes a landscape or square camera sensor.
export function cameraCoverCrop(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  if (sourceRatio > targetRatio) {
    const width = sourceHeight * targetRatio;
    return { x:(sourceWidth-width)/2, y:0, width, height:sourceHeight };
  }
  const height = sourceWidth / targetRatio;
  return { x:0, y:(sourceHeight-height)/2, width:sourceWidth, height };
}
// Never force a 9:16 crop on a 4:3 camera. Pinch zoom is the *only*
// user-directed source crop, and the encoder will letterbox the result.
export function cameraCaptureCrop(sourceWidth, sourceHeight, targetWidth, targetHeight, zoom=1) {
  if(!containRect(sourceWidth,sourceHeight,targetWidth,targetHeight))return null;
  const factor=Math.max(1,Number.isFinite(zoom)?zoom:1);
  const width=sourceWidth/factor,height=sourceHeight/factor;
  return {x:(sourceWidth-width)/2,y:(sourceHeight-height)/2,width,height};
}
// Real physical illumination: continuously enabled torch, not a screen flare.
export async function setRearCameraTorch(track, on) {
  if(!track || track.readyState!=="live" || typeof track.applyConstraints!=="function")
    throw Error("Câmera traseira indisponível.");
  const capabilities=track.getCapabilities?.();
  if(capabilities?.torch===false)throw Error("Lanterna traseira indisponível neste navegador.");
  await track.applyConstraints({ advanced: [{ torch: on }] });
  const reported=track.getSettings?.().torch;
  if ((typeof reported==="boolean" && reported!==on) ||
      (on && reported!==true && capabilities?.torch!==true))
    throw Error("O navegador não confirmou o estado da lanterna traseira.");
  return {requested:on,confirmed:reported===on};
}
export function cameraMediaConstraints(facing, ratio="9:16") {
  // Output aspect ratio applies to the story CANVAS, not the camera sensor.
  // Do not request portrait 9:16 from a 4:3 sensor: browser crop-and-scale
  // may hide most of a face before our preview even receives a frame.
  return {video:{
    facingMode:{ideal:facing},
    width:{ideal:1280},height:{ideal:960},
    resizeMode:{ideal:"none"}
  },audio:true};
}
// Relax unsupported video sensor constraints WITHOUT dropping microphone audio.
// The last camera-only attempt allows photos when Android denies microphone,
// but never pretends that such a stream can record videos with sound.
export function storyCameraCaptureAttempts(facing,ratio="9:16") {
  return [
    cameraMediaConstraints(facing,ratio),
    {video:{facingMode:{ideal:facing}},audio:true},
    {video:{facingMode:{ideal:facing}},audio:false}
  ];
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
        '<div class="studio-camera-framing studio-camera-only" data-studio-camera-framing>' +
          '<video class="studio-camera" data-studio-video autoplay playsinline muted></video>' +
          '<canvas class="studio-lens" data-studio-lens aria-hidden="true"></canvas>' +
        '</div>' +
        '<div class="studio-screen-light" data-studio-screen-light aria-hidden="true"></div>' +
        '<div class="studio-grid-lines" data-studio-grid hidden></div>' +
        '<div class="studio-aspect-frame studio-camera-only" data-studio-aspect-frame aria-hidden="true"></div>' +
        '<div class="studio-text-background" data-studio-background hidden></div>' +
        '<div class="studio-edited-media" data-studio-edited hidden></div>' +
        '<div class="studio-overlays" data-studio-overlays></div>' +
        '<header class="studio-top studio-camera-only">' +
          '<button type="button" class="studio-icon" data-studio-close aria-label="Fechar">' + icon("close") + '</button>' +
          '<button type="button" class="studio-icon" data-studio-flash aria-label="Flash" title="Flash">ϟ</button>' +
          '<button type="button" class="studio-icon" data-studio-settings aria-label="Configurações">' + icon("settings") + '</button>' +
        '</header>' +
        '<div class="studio-side studio-camera-only">' +
          '<button type="button" class="studio-icon" data-studio-text-mode aria-label="Criar story de texto">Aa</button>' +
          '<button type="button" class="studio-icon" data-studio-boomerang aria-label="Alternar Boomerang" aria-pressed="false">∞</button>' +
          '<button type="button" class="studio-icon" data-studio-grid-toggle aria-label="Grade de alinhamento" aria-pressed="false">' + icon("grid") + '</button>' +
          '<button type="button" class="studio-icon studio-ratio-button" data-studio-ratio aria-label="Proporção da captura">9:16</button>' +
          '<button type="button" class="studio-icon" data-studio-camera-more aria-label="Mais recursos da câmera" aria-expanded="false">' + icon("chevronDown") + '</button>' +
          '<div class="studio-camera-extra" data-studio-camera-extra hidden>' +
            '<button type="button" class="studio-icon" data-studio-timer aria-label="Temporizador">' + icon("clock") + '</button>' +
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
            '<label class="studio-gallery-button" title="Abrir galeria"><span data-studio-thumb aria-hidden="true">' + icon("image") + '</span><input type="file" data-studio-file accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" aria-label="Selecionar da galeria"></label>' +
            '<button type="button" class="studio-shutter" data-studio-shutter aria-label="Toque para foto; segure para vídeo"><span></span></button>' +
            '<button type="button" class="studio-icon" data-studio-flip aria-label="Inverter câmera">' + icon("cameraSwitch") + '</button>' +
          '</div>' +
          '<nav class="studio-modes" aria-label="Modos de publicação">' +
            '<button type="button" data-studio-post>POST</button><b>STORY</b>' +
          '</nav>' +
          '<div class="studio-progress" data-studio-progress hidden></div>' +
        '</section>' +
        '<header class="studio-edit-top studio-edit-only" hidden>' +
          '<button type="button" class="studio-icon" data-studio-back aria-label="Voltar à câmera">' + icon("back") + '</button>' +
          '<span class="studio-edit-top-spacer" aria-hidden="true"></span>' +
        '</header>' +
        '<div class="studio-edit-tools studio-edit-only" hidden>' +
          '<button type="button" class="studio-icon" data-studio-add-text aria-label="Adicionar texto">Aa</button>' +
          '<button type="button" class="studio-icon studio-layer-edit-action" data-studio-edit-selected aria-label="Editar texto selecionado" hidden>' + icon("pencil") + '</button>' +

          '<button type="button" class="studio-icon studio-music-side-button" data-studio-music-open aria-label="Adicionar música" title="Adicionar música">' + icon("music") + '<span class="visually-hidden" data-studio-track-label>Adicionar música</span><span class="visually-hidden" data-studio-track-hint>Trilha sonora</span><i class="studio-music-indicator" data-studio-music-indicator hidden aria-hidden="true"></i></button>' +
          '<button type="button" class="studio-icon" data-studio-effects-open aria-label="Filtros de imagem e vídeo">✦</button>' +
          '<button type="button" class="studio-icon" data-studio-editor-more aria-label="Mais recursos de edição" aria-expanded="false">' + icon("chevronDown") + '</button>' +
          '<div class="studio-editor-extra" data-studio-editor-extra hidden><button type="button" class="studio-icon" data-studio-mentions-open aria-label="Mencionar pessoas">@</button></div>' +

        '</div>' +
        '<div class="studio-edit-bottom studio-edit-only" hidden>' +
          '<textarea data-studio-caption name="body" maxlength="700" rows="2" placeholder="Adicione uma legenda..." aria-label="Legenda do story"></textarea>' +
          '<div class="studio-publish-row">' +
            '<button type="button" class="studio-pill studio-publish-public" data-studio-publicar><span aria-hidden="true">◉</span> Publicar story</button>' +
            '<button type="button" class="studio-pill" data-studio-publish-friends hidden>Publicar para amigos</button>' +
            '<button type="button" class="studio-pill" data-studio-friends><span class="studio-star">★</span> Amigos próximos</button>' +
            '<button type="button" class="studio-next" data-studio-send aria-label="Mais opções de compartilhamento">' + icon("forward") + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="studio-modal" data-studio-modal hidden><section class="studio-modal-panel" data-studio-panel>' +
          '<div class="studio-modal-head"><strong data-studio-modal-title>Editar</strong><button type="button" class="studio-icon" data-studio-modal-close aria-label="Fechar painel">' + icon("close") + '</button></div>' +
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
// Decode the JPEG that will be attached to the Story, rather than trusting
// the size of the canvas element or the 9:16 label in the UI.
export async function verifyStoryImagePixels(blob, size, bitmapFactory=(file)=>createImageBitmap(file)) {
  const bitmap=await bitmapFactory(blob);
  try {
    if(bitmap.width!==size.width || bitmap.height!==size.height)
      throw Error("A foto gerada não corresponde à proporção selecionada.");
    return {width:bitmap.width,height:bitmap.height};
  }finally{bitmap.close?.();}
}
export async function verifyStoryVideoPixels(blob, size, videoFactory=()=>document.createElement("video")) {
  const element=videoFactory();
  const objectUrl=URL.createObjectURL(blob);
  try {
    element.preload="metadata";element.muted=true;element.playsInline=true;
    element.src=objectUrl;element.load?.();
    if(element.readyState<1)await waitEvent(element,"loadedmetadata");
    if(element.videoWidth!==size.width || element.videoHeight!==size.height)
      throw Error("O vídeo gerado não corresponde à proporção selecionada.");
    return {width:element.videoWidth,height:element.videoHeight};
  }finally{element.pause?.();element.removeAttribute?.("src");element.load?.();URL.revokeObjectURL(objectUrl);}
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
  // Preserve the whole source frame. The unused area stays black instead of
  // being filled by a zoomed/blurred duplicate of the image.
  const contain = Math.min(w / sw, h / sh);
  const drawW = sw * contain, drawH = sh * contain;
  ctx.drawImage(media, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
}
function paintLayers(ctx, root, w, h) {
  root.querySelectorAll("[data-studio-overlay]").forEach(el => {
    storyTextPaintLayer(ctx,{
      text:el.dataset.text ?? el.textContent,
      x:Number(el.dataset.x),y:Number(el.dataset.y),
      size:Number(el.dataset.size),font:el.dataset.fontId||STORY_TEXT_DEFAULT_FONT,
      color:el.dataset.color
    },w,h);
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
  return storyTextNormalize(value);
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
  const settings = { facing: "user", face: "none", grid: false, flash: "off", zoom: 1, ratio:"9:16", maxDuration: 30000 };
  let availableEffects = DEFAULT_STORY_EFFECTS, selectedManifest = {id:"none",type:"none",strength:0,params:{}};
  let stream = null, face = null, file = null, url = null, mode = "camera", active = false;
  let recorder = null, frames = null, captureStream = null, chunks = [], hold = null, held = false, pointer = null;
  let startedAt = 0, progressAnimation = null, lensReady = false, music = null, audioPreview = null, publishing = false;
  let selectedMentionIds = [];
  let selectedLayer=null;
  let editorPlaneLock=null;
  const freezeEditorPlane=()=>{
    if(editorPlaneLock)return;
    const bounds=overlayRoot.getBoundingClientRect(),stageBounds=stage.getBoundingClientRect();
    if(!(bounds.width>0&&bounds.height>0))return;
    const keys=["width","height","left","top","right","bottom","transform","aspectRatio"];
    editorPlaneLock=[edits,overlayRoot].map(element=>({
      element,previous:Object.fromEntries(keys.map(key=>[key,element.style[key]]))
    }));
    for(const {element} of editorPlaneLock){
      Object.assign(element.style,{
        width:bounds.width+"px",height:bounds.height+"px",
        left:(bounds.left-stageBounds.left)+"px",top:(bounds.top-stageBounds.top)+"px",
        right:"auto",bottom:"auto",transform:"none",aspectRatio:"auto"
      });
    }
  };
  const unfreezeEditorPlane=()=>{
    if(!editorPlaneLock)return;
    for(const {element,previous} of editorPlaneLock)Object.assign(element.style,previous);
    editorPlaneLock=null;
  };
  const measureCanvas=document.createElement("canvas");
  const measureContext=measureCanvas.getContext("2d");
  let stopMusicPreview = () => {};
  let sourceKind = "none", sourceFromCamera = false, isBoomerang = false, currentBackground = "#7c3ed7", editFilter = "none", lastThumb = null;
  let zoomMode = "digital", zoomLimit = 3, zoomBase = 1, zoomTrack = null;
  let zoomBusy = false, zoomPending = null, pinch = null;
  let cameraTimerSeconds = 0, handsfreeRecording = false;
  let collageCanvas = null, collageShots = 0;
  let cameraRequestId = 0, photoPending = false, timerPending = false;
  const currentCanvasSize = () => storyCanvasSize(settings.ratio);
  const applyAspect = () => {
    const size = currentCanvasSize();
    const frame = $("[data-studio-aspect-frame]");
    frame.style.aspectRatio = size.width + " / " + size.height;
    stage.style.setProperty("--studio-camera-ratio", String(size.width / size.height));
    stage.dataset.aspect = settings.ratio.replace(":", "x");
    $("[data-studio-ratio]").textContent = settings.ratio;
    $("[data-studio-ratio]").setAttribute("aria-label", "Proporção da captura: " + settings.ratio);
  };
  applyAspect();
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
    unfreezeEditorPlane();
    edits.replaceChildren(); edits.hidden = true; revokeUrl();
    overlayRoot.replaceChildren(); file = null; sourceKind = "none"; sourceFromCamera = false; selectedMentionIds = [];
    selectedLayer=null;
    $("[data-studio-edit-selected]").hidden=true;
  };
  const flashButton = $("[data-studio-flash]");
  const resetFlash = () => {
    settings.flash = "off";
    stage.dataset.screenFlash = "off";
    flashButton.setAttribute("aria-pressed", "false");
    flashButton.textContent = "ϟ";
    flashButton.title = settings.facing === "environment" ? "Lanterna traseira (contínua)" : "Iluminação da tela";
    flashButton.setAttribute("aria-label", flashButton.title);
  };
  const updateZoomPreview = () => {
    const digitalFactor = zoomMode === "digital" ? settings.zoom : 1;
    const mirror = settings.facing === "user" ? "scaleX(-1) " : "";
    video.style.transform = mirror + "scale(" + digitalFactor + ")";
    backdropVideo.style.transform = mirror + "scale(" + digitalFactor + ")";
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
    const sourceW=video.videoWidth,sourceH=video.videoHeight;
    if(!sourceW||!sourceH)throw Error("A câmera ainda não está pronta.");
    // Show the WHOLE sensor image by default. Match CSS object-fit:contain
    // and keep the same letterboxed layout in the final recording.
    const crop=cameraCaptureCrop(sourceW,sourceH,canvas.width,canvas.height,1);
    if(!crop)throw Error("Não foi possível preparar o enquadramento.");
    const baseFit=containRect(crop.width,crop.height,canvas.width,canvas.height);
    if(!baseFit)throw Error("Não foi possível enquadrar a câmera.");
    // Match CSS transform:scale() of a contained video, even after an
    // explicit pinch. Hardware sensor zoom has already changed source pixels.
    const factor=zoomMode==="digital"?Math.max(1,settings.zoom):1;
    const fit={
      x:canvas.width/2+(baseFit.x-canvas.width/2)*factor,
      y:canvas.height/2+(baseFit.y-canvas.height/2)*factor,
      width:baseFit.width*factor,height:baseFit.height*factor
    };
    ctx.fillStyle="#08070b";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    const drawLayer=layer=>{
      const layerW=layer.videoWidth||layer.width||sourceW;
      const layerH=layer.videoHeight||layer.height||sourceH;
      const scaleX=layerW/sourceW,scaleY=layerH/sourceH;
      ctx.save();
      if(settings.facing==="user"){
        ctx.translate(canvas.width,0);ctx.scale(-1,1);
      }
      ctx.drawImage(layer,crop.x*scaleX,crop.y*scaleY,crop.width*scaleX,crop.height*scaleY,
        fit.x,fit.y,fit.width,fit.height);
      ctx.restore();
    };
    drawLayer(video);
    if(settings.face!=="none"&&lensReady&&lens.width&&lens.height)drawLayer(lens);
  };
  const stopCamera = () => {
    ++cameraRequestId; // Invalidate any pending getUserMedia before it resolves.
    if(hold){clearTimeout(hold);hold=null;}
    timerPending=false;
    pointer=null;held=false;handsfreeRecording=false;
    stage.dataset.recording="false";
    if (recorder?.state === "recording") recorder.stop();
    if(frames!=null){cancelAnimationFrame(frames);frames=null;}
    captureStream?.getTracks().forEach(t=>t.stop());captureStream=null;
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
    showMode("camera");
    const ticket=cameraRequestId;
    // Ask for the selected output ratio, but do not assert a sensor mode
    // exists. Actual track/video dimensions are measured after negotiation.
    let acquired=null, lastCaptureError=null;
    for(const constraints of storyCameraCaptureAttempts(facing,settings.ratio)){
      try{
        acquired=await navigator.mediaDevices.getUserMedia(constraints);
        break;
      }catch(error){
        lastCaptureError=error;
        if(ticket!==cameraRequestId||!active)return;
      }
    }
    if(!acquired)throw lastCaptureError||Error("A câmera está indisponível.");
    if(ticket!==cameraRequestId||!active){
      acquired?.getTracks().forEach(track=>track.stop());
      return;
    }
    stream=acquired;
    const track=stream.getVideoTracks()[0];
    if(!track){stopCamera();throw Error("Nenhuma câmera de vídeo ficou disponível.");}
    const actualFacing = track?.getSettings?.().facingMode;
    settings.facing = ["user", "environment"].includes(actualFacing) ? actualFacing : facing;
    settings.zoom = 1; zoomMode = "digital"; zoomLimit = 3; zoomTrack = null; zoomPending = null;
    const capabilities = track?.getCapabilities?.();
    const hardwareZoom = capabilities?.zoom;
    if (hardwareZoom && Number.isFinite(hardwareZoom.min) && Number.isFinite(hardwareZoom.max)) {
      zoomBase = Math.max(hardwareZoom.min, Math.min(1, hardwareZoom.max));
      try {
        await track.applyConstraints({ advanced: [{ zoom: zoomBase }] });
        if (stream && track.readyState === "live") {
          zoomTrack = track; zoomMode = "hardware";
          zoomLimit = Math.max(1, Math.min(6, hardwareZoom.max / zoomBase));
        }
      } catch { /* Inaccessible sensor zoom: pinch uses the digital fallback. */ }
    }
    if(ticket!==cameraRequestId||!active)return;
    video.srcObject = stream;
    // The front camera is the sole video layer: no duplicate blurred playback
    // and no automatic crop/zoom.
    backdropVideo.srcObject = null;
    updateZoomPreview();
    video.style.filter = "none";
    resetFlash();
    showMode("camera");
    try { await video.play(); } catch {}
    if(ticket!==cameraRequestId||!active)return;
    const trackSettings=track.getSettings?.()||{};
    // Useful for device diagnostics without implying a physical test here.
    console.info("Looply camera negotiated frame",{
      requested:settings.ratio,trackWidth:trackSettings.width,trackHeight:trackSettings.height,
      videoWidth:video.videoWidth,videoHeight:video.videoHeight,
      mirror:settings.facing==="user",hasMicrophone:stream.getAudioTracks().some(t=>t.readyState==="live")
    });
    if(!stream.getAudioTracks().some(t=>t.readyState==="live")){
      status("Câmera pronta para fotos. Para gravar vídeo com voz, autorize o microfone nas configurações do Android.",true);
    }
    face = new StoryFaceLens(video, lens, () => settings.facing);
    face.start();
    if(settings.face!=="none"){
      const current=face;
      void current.prepare().then(ok=>{
      if(ok&&face===current){lensReady=true;void current.setLens(selectedManifest);}
      });
    }
  };
  const open = async () => {
    if (active) return;
    active = true; clearPreview(); status(""); showMode("camera");
    $("[data-studio-visibility]").value="public";
    $("[data-studio-publish-friends]").hidden=true;
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    try { await startCamera(); }
    catch (error) { status(error.message || "Câmera indisponível. Use a galeria.", true); }
  };
  const close = () => {
    if (publishing) return;
    stopMusicPreview(); stopMusicPreview = () => {};
    stopRecordingTimer(); stopCamera(); clearPreview();
    $("[data-studio-publish-friends]").hidden=true;
    if (audioPreview) { audioPreview.pause(); audioPreview = null; }
    music = null; $("[data-studio-track-label]").textContent = "Adicionar música";
    $("[data-studio-track-hint]").textContent = "Trilha sonora";
    $("[data-studio-music-indicator]").hidden = true;
    $("[data-studio-music-open]").setAttribute("aria-label","Adicionar música");
    active = false;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  };
  const showEditor = (mediaFile, kind, captured = false) => {
    file = mediaFile || null; sourceKind = kind; sourceFromCamera = captured;
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
        $("[data-studio-thumb]").innerHTML = icon("play");
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
    if(photoPending || !active || mode!=="camera")return;
    if (!video.videoWidth) { status("A câmera ainda está iniciando.", true); return; }
    const ticket=cameraRequestId;
    photoPending=true;
    try {
      await flashPhoto();
      if(ticket!==cameraRequestId || !active || mode!=="camera")return;
      const canvas = document.createElement("canvas");
      const captureSize = currentCanvasSize();
      canvas.width = captureSize.width;
      canvas.height = captureSize.height;
      const ctx = canvas.getContext("2d");
      drawLiveFrame(ctx, canvas);
      if (settings.grid) {
        // Real four-shot collage, 2×2, each captured panel remains 9:16.
        if (!collageCanvas) {
          collageCanvas = document.createElement("canvas");
          collageCanvas.width=captureSize.width; collageCanvas.height=captureSize.height;
          collageCanvas.getContext("2d").fillStyle="#000";
          collageCanvas.getContext("2d").fillRect(0,0,collageCanvas.width,collageCanvas.height);
        }
        const cellWidth = collageCanvas.width/2, cellHeight=collageCanvas.height/2;
        const cellX=(collageShots%2)*cellWidth, cellY=Math.floor(collageShots/2)*cellHeight;
        collageCanvas.getContext("2d").drawImage(canvas,cellX,cellY,cellWidth,cellHeight);
        collageShots++;
        if (collageShots<4) {
          status("Layout: "+collageShots+"/4 fotos capturadas. Capture a próxima.");
          return;
        }
        const composite=await blobFromCanvas(collageCanvas,"image/jpeg");
        await verifyStoryImagePixels(composite,captureSize);
        if(ticket!==cameraRequestId || !active || mode!=="camera")return;
        collageCanvas=null;collageShots=0;settings.grid=false;
        $("[data-studio-grid]").hidden=true;
        $("[data-studio-grid-toggle]").setAttribute("aria-pressed","false");
        showEditor(new File([composite],"story-layout-"+Date.now()+".jpg",{type:"image/jpeg"}),"image",true);
        return;
      }
      const blob = await blobFromCanvas(canvas, "image/jpeg");
      await verifyStoryImagePixels(blob,captureSize);
      if(ticket!==cameraRequestId || !active || mode!=="camera")return;
      showEditor(new File([blob], "story-" + Date.now() + ".jpg", { type: "image/jpeg" }), "image",true);
    } finally {
      photoPending=false;
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
    if(photoPending || timerPending || recorder?.state==="recording")return;
    if (settings.grid) throw new Error("Layout é uma sequência de quatro fotos. Desative o layout para gravar vídeos.");
    if (!stream || !video.videoWidth) throw new Error("Câmera ainda não está pronta.");
    // A video recording must never silently succeed without a microphone.
    const audioTracks=stream.getAudioTracks().filter(track=>track.readyState==="live" && track.enabled);
    if(!audioTracks.length) throw new Error("Microfone indisponível. Autorize o áudio para gravar vídeo com som.");
    const mime = videoFormat();
    if (!mime) throw new Error("Gravação de vídeo não suportada neste navegador.");
    const canvas = document.createElement("canvas");
    const recordingSize = currentCanvasSize();
    canvas.width = recordingSize.width;
    canvas.height = recordingSize.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    const savedFrames = [];
    const snap = document.createElement("canvas");
    // A 16:9 / square recording must not turn into a 9:16 Boomerang.
    snap.width = Math.max(2,Math.round(recordingSize.width / 3));
    snap.height = Math.max(2,Math.round(recordingSize.height / 3));
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
    const recordingRecorder=recorder;
    const recordingChunks=[];
    recorder.ondataavailable = e => { if (e.data?.size) recordingChunks.push(e.data); };
    const recordingTicket=cameraRequestId;
    recorder.onstop = async () => {
      if(recordingTicket!==cameraRequestId||recorder!==recordingRecorder)return;
      handsfreeRecording = false;
      $("[data-studio-handsfree]")?.setAttribute("aria-pressed","false");
      cancelAnimationFrame(frames);
      captureStream?.getTracks().forEach(track => { if (!stream?.getTracks().includes(track)) track.stop(); });
      stopRecordingTimer();
      let output = new Blob(recordingChunks, { type: recordingRecorder.mimeType || mime });
      recorder = null;
      if (output.size && active && mode === "camera" && recordingTicket===cameraRequestId) {
        if (isBoomerang && savedFrames.length >= 3) {
          status("Criando Boomerang…");
          try { output = await renderBoomerang(savedFrames, snap.width, snap.height, mime); }
          catch (error) { status(error.message, true); return; }
        }
        const ext = output.type.includes("mp4") ? "mp4" : "webm";
        try {
          await verifyStoryVideoPixels(output,isBoomerang
            ? {width:snap.width,height:snap.height} : recordingSize);
          if(recordingTicket!==cameraRequestId || !active || mode!=="camera")return;
          showEditor(new File([output], "story-" + Date.now() + "." + ext, { type: output.type.split(";")[0] }), "video",true);
        } catch(error) {
          status("O vídeo não pôde ser validado. Grave novamente.",true);
          console.warn("Story video dimensions validation failed",error);
        }
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
    thumb.innerHTML = icon(normalized.type.startsWith("image/") ? "image" : "play");
    showEditor(normalized, normalized.type.startsWith("video/") ? "video" : "image");
  };
  const selectLayer = el => {
    selectedLayer = el?.isConnected ? el : null;
    overlayRoot.querySelectorAll("[data-studio-overlay]").forEach(item=>{
      item.classList.toggle("is-selected", item===selectedLayer);
      item.setAttribute("aria-selected",String(item===selectedLayer));
    });
    $("[data-studio-edit-selected]").hidden = !selectedLayer;
  };
  const layerValues=el=>({
    text:el.dataset.text??el.textContent,
    x:Number(el.dataset.x),y:Number(el.dataset.y),
    size:Number(el.dataset.size),
    font:el.dataset.fontId||STORY_TEXT_DEFAULT_FONT,
    color:el.dataset.color
  });
  const renderLayer=el=>{
    if(!el?.isConnected || !measureContext)return;
    const size=currentCanvasSize();
    const values=layerValues(el);
    const layout=storyTextLayerLayout(measureContext,values,size.width,size.height);
    const rect=overlayRoot.getBoundingClientRect();
    el.textContent=layout.lines.join("\n");
    el.style.left=(values.x*100)+"%";
    el.style.top=(values.y*100)+"%";
    el.style.fontSize=(layout.px * ((rect.width||390)/size.width))+"px";
    el.style.fontWeight=layout.font.weight;
    el.style.fontFamily=layout.font.family;
    el.style.color=values.color||"#ffffff";
    el.style.lineHeight="1.14";
    el.style.whiteSpace="pre";
  };
  const rerenderLayers=()=>overlayRoot.querySelectorAll("[data-studio-overlay]").forEach(renderLayer);
  if(typeof ResizeObserver==="function"){
    const observer=new ResizeObserver(rerenderLayers);
    observer.observe(overlayRoot);
    dialog.addEventListener("close",()=>rerenderLayers());
  }
  const addLayer = (text, sticker = false) => {
    const el = document.createElement("div");
    el.dataset.studioOverlay="true";
    el.dataset.x="0.5";el.dataset.y="0.44";
    el.dataset.size=sticker?"48":"34";el.dataset.color="#ffffff";
    el.dataset.fontId=STORY_TEXT_DEFAULT_FONT;
    el.dataset.sticker=String(sticker);
    el.dataset.text=cleanName(text);
    el.className="studio-overlay";
    el.tabIndex=0;el.setAttribute("role","button");
    el.setAttribute("aria-label","Selecionar, arrastar ou redimensionar texto");
    overlayRoot.append(el);
    renderLayer(el);
    selectLayer(el);
    bindStoryTextGestures(el,{
      getPosition:()=>({x:Number(el.dataset.x),y:Number(el.dataset.y)}),
      setPosition:point=>{
        el.dataset.x=String(point.x);el.dataset.y=String(point.y);renderLayer(el);
      },
      getSize:()=>Number(el.dataset.size),
      setSize:size=>{el.dataset.size=String(size);renderLayer(el);},
      getBounds:()=>overlayRoot.getBoundingClientRect(),
      select:()=>selectLayer(el),
      edit:()=>openLayerEditor(el)
    });
    el.addEventListener("keydown",event=>{
      if(event.key==="Delete"||event.key==="Backspace"){
        event.preventDefault();el.remove();selectLayer(null);
      }
    });
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
    // The general X button must cancel an unsaved newly created text too.
    overlayRoot.querySelectorAll('[data-studio-overlay][data-text-draft="true"]').forEach(layer=>{
      layer.remove();
      if(selectedLayer===layer)selectLayer(null);
    });
    unfreezeEditorPlane();
  };
  const openLayerEditor = (el, createdNow=false) => {
    if(!el?.isConnected)return;
    if(createdNow)el.dataset.textDraft="true";
    selectLayer(el);
    // Mobile keyboard changes the visual viewport height: freeze the actual
    // media/text content plane until edit completes, never the saved x/y.
    freezeEditorPlane();
    const choices=Object.entries(STORY_TEXT_FONTS).map(([key,item])=>
      '<button type="button" class="studio-font-choice" data-layer-font-choice="'+key+
      '" aria-pressed="false">'+escapeHtml(item.label)+'</button>').join("");
    modal("Editar texto", '<label class="studio-layer-text-label">Texto<textarea data-layer-text rows="4" maxlength="500" placeholder="Escreva seu texto"></textarea></label>'+
      '<fieldset class="studio-font-fieldset"><legend>Estilo da fonte</legend><div class="studio-font-choices">'+choices+'</div></fieldset>'+
      '<input type="hidden" data-layer-font value="modern">'+
      '<div class="studio-font-sample" data-layer-font-sample aria-hidden="true">Aa ÁÉÍÓÚ ç ✨</div>'+
      '<label>Cor<input type="color" data-layer-color value="#ffffff"></label>'+
      '<label>Tamanho<input type="range" data-layer-size min="18" max="94" step="1" value="34"></label>'+
      '<p data-layer-status class="studio-font-status" role="status" aria-live="polite"></p>'+
      '<div class="studio-modal-actions"><button type="button" data-layer-cancel>Cancelar</button><button type="button" data-layer-delete>Remover</button><button type="button" data-layer-save>Concluir</button></div>');
    const textarea=body.querySelector("[data-layer-text]");
    const fontInput=body.querySelector("[data-layer-font]");
    const colorInput=body.querySelector("[data-layer-color]");
    const sizeInput=body.querySelector("[data-layer-size]");
    const sample=body.querySelector("[data-layer-font-sample]");
    const message=body.querySelector("[data-layer-status]");
    textarea.value=el.dataset.text??el.textContent;
    fontInput.value=el.dataset.fontId||STORY_TEXT_DEFAULT_FONT;
    colorInput.value=el.dataset.color||"#ffffff";
    sizeInput.value=String(storyTextClampSize(el.dataset.size));
    const choicesButtons=[...body.querySelectorAll("[data-layer-font-choice]")];
    const refreshSample=()=>{
      const font=storyTextFont(fontInput.value);
      sample.style.fontFamily=font.family;sample.style.fontWeight=font.weight;
      sample.style.fontSize=Math.min(40,Number(sizeInput.value))+"px";
      sample.style.color=colorInput.value;
      sample.textContent=textarea.value.trim().slice(0,45)||"Aa ÁÉÍÓÚ ç ✨";
      choicesButtons.forEach(button=>{
        button.setAttribute("aria-pressed",String(button.dataset.layerFontChoice===fontInput.value));
        const item=storyTextFont(button.dataset.layerFontChoice);
        button.style.fontFamily=item.family;button.style.fontWeight=item.weight;
      });
    };
    refreshSample();
    const loadChoice=async key=>{
      const available=await storyTextEnsureFonts([key]);
      if(!textarea.isConnected)return;
      if(!available){
        message.textContent="Não foi possível carregar essa fonte. Confira a conexão.";
        return;
      }
      fontInput.value=key;message.textContent="";refreshSample();
    };
    choicesButtons.forEach(button=>button.onclick=()=>void loadChoice(button.dataset.layerFontChoice));
    textarea.addEventListener("input",refreshSample);
    sizeInput.addEventListener("input",refreshSample);
    colorInput.addEventListener("input",refreshSample);
    body.querySelector("[data-layer-save]").onclick=async()=>{
      const button=body.querySelector("[data-layer-save]");
      if(button.disabled)return;
      const value=storyTextNormalize(textarea.value);
      if(!value.trim()){message.textContent="Digite algum texto antes de concluir.";return;}
      button.disabled=true;
      try{
        const loaded=await storyTextEnsureFonts([fontInput.value]);
        if(!loaded)throw Error("A fonte selecionada não terminou de carregar.");
        if(!el.isConnected)return;
        const size=currentCanvasSize();
        const layout=storyTextLayerLayout(measureContext,{
          text:value,x:Number(el.dataset.x),y:Number(el.dataset.y),
          size:storyTextClampSize(sizeInput.value),font:fontInput.value,color:colorInput.value
        },size.width,size.height);
        if(!layout.fits)throw Error("O texto ultrapassa a área do Story. Reduza o tamanho ou mude sua posição.");
        el.dataset.text=value;
        delete el.dataset.textDraft;
        el.dataset.fontId=fontInput.value;
        el.dataset.color=colorInput.value;
        el.dataset.size=String(storyTextClampSize(sizeInput.value));
        renderLayer(el);modalClose();selectLayer(el);
      }catch(error){
        message.textContent=error.message||"Não foi possível preparar esta fonte.";
      }finally{button.disabled=false;}
    };
    body.querySelector("[data-layer-cancel]").onclick=()=>{
      if(createdNow){el.remove();selectLayer(null);}
      modalClose();
    };
    body.querySelector("[data-layer-delete]").onclick=()=>{el.remove();selectLayer(null);modalClose();};
    // The keyboard only opens on explicit edit, never on selection or drag.
    textarea.focus({preventScroll:true});
  };
  // The song is catalog metadata, never a
  // visible draggable sticker or a commercial audio file mixed into video.
  const removeCatalogCredit = () => overlayRoot.querySelectorAll("[data-studio-music-credit]").forEach(el => el.remove());
  const selectStoryMusic = track => {
    removeCatalogCredit();
    music = track;
    $("[data-studio-track-label]").textContent = track.title;
    $("[data-studio-track-hint]").textContent = track.artist || "Áudio selecionado";
    $("[data-studio-music-indicator]").hidden = false;
    $("[data-studio-music-open]").setAttribute("aria-label","Alterar música: "+track.title);
    $("[data-studio-music-open]").title = "Alterar música: "+track.title;
    modalClose();
    if(isAdmin)status("ADM: áudio selecionado para publicação: "+track.kind+" / "+(track.provider||"local"));
  };
  const openMusic = () => {
    stopMusicPreview();
    stopMusicPreview = openStoryMusicPicker({
      modal, body, builtin: BUILTIN, onSelect: selectStoryMusic, onStatus: status, isAdmin
    });
    if (music) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.studioMusicRemove = "";
      remove.className = "studio-remove-selected-music";
      remove.textContent = "Remover música selecionada";
      remove.setAttribute("aria-label","Remover a música deste Story");
      body.querySelector(".studio-music-picker")?.append(remove);
    }
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
      // Audience selection updates draft state only.
      $("[data-studio-publish-friends]").hidden=false;
      status("Amigos próximos selecionados. Toque em Publicar para amigos para enviar.");
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
  const makeCanvas = (w = currentCanvasSize().width, h = currentCanvasSize().height) => {
    const c = document.createElement("canvas");
    // Preserve every selected export ratio; the previous separate min() clamps
    // turned a 1920x1080 Story into a square 1080x1080 file.
    c.width = w; c.height = h;
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
          // Preserve speech from a recorded Story; music plays behind the
          // original audio rather than masking it with a second full-volume
          // soundtrack. Own/CC source remains baked into the exported media.
          source = attachStoryMusic(audioCtx, destination, buffer, {
            volume:videoMedia ? 0.35 : 0.85,
            startSeconds:storyMusicStartSeconds(music.startSeconds,buffer.duration)
          });
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
        if (source) source.start(0, source.loopStart || 0);
      } else if (source) source.start(0, source.loopStart || 0);
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
    if(layered){
      const activeLayers=[...overlayRoot.querySelectorAll("[data-studio-overlay]")];
      const fontIds=activeLayers.map(layer=>layer.dataset.fontId||STORY_TEXT_DEFAULT_FONT);
      if(!await storyTextEnsureFonts(fontIds))
        throw Error("As fontes do Story não carregaram. Confira sua conexão antes de publicar.");
      const size=currentCanvasSize();
      for(const layer of activeLayers){
        if(layer.dataset.sticker==="true")continue;
        const layout=storyTextLayerLayout(measureContext,layerValues(layer),size.width,size.height);
        if(!layout.fits)throw Error("Um texto está fora da área do Story. Arraste-o para o centro ou reduza seu tamanho.");
      }
      rerenderLayers();
    }
    if (sourceKind === "video" && (!music || music.kind === "catalog") && !layered && editFilter === "none") return file;
    if (sourceKind === "video") return exportVideo(null, Boolean(music && music.kind !== "catalog"), armedAudioContext);
    const canvas = await renderStill();
    if (music && music.kind !== "catalog") return exportVideo(canvas, true, armedAudioContext);
    const blob = await blobFromCanvas(canvas, "image/jpeg");
    return new File([blob], "story-" + Date.now() + ".jpg", { type: "image/jpeg" });
  };
  const explicitStoryPublication=Symbol("user-clicked-publish-story");
  const requestStoryPublish=event=>{
    if(!isExplicitStoryPublishGesture(event))return;
    // Only designated buttons generate this intent: never form submit,
    // picker selection, keyboard Enter or a modal closing.
    void publish(explicitStoryPublication);
  };
  const publish = async (authorization) => {
    if (authorization !== explicitStoryPublication || !active || !["edit","text"].includes(mode)) return;
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
      // Apple metadata identifies the author-authorized background stream;
      // it does not alter or embed the original media file.
      if(music?.kind==="catalog" && !appleStoryTrackId(music))
        throw new Error("A prévia do catálogo não pode ser incorporada ao Story. Escolha um áudio próprio ou autorizado.");
      const media = await exportFinal(armedAudioContext);
      const normalized = normalizePublicationMedia(media);
      if (!normalized || !FORMATS[normalized.type] || normalized.size > 100 * 1024 * 1024) {
        throw new Error("Mídia inválida ou maior que 100 MB.");
      }
      // Validate the actual post-editor file, not just the source canvas. This
      // runs before any Neon story record or uploaded object is created.
      if(sourceFromCamera){
        const expected=currentCanvasSize();
        const dimensions=normalized.type.startsWith("image/")
          ? await verifyStoryImagePixels(normalized,expected)
          : await verifyStoryVideoPixels(normalized,expected);
        console.info("Looply story final encoded pixels",dimensions);
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
      // Re-read the authenticated persisted media association, not merely
      // the button state or the upload request result.
      const {data:verifiedMedia,error:mediaReadError}=await client.from("story_media")
        .select("id,story_id,storage_path,kind,mime_type")
        .eq("story_id",storyId).eq("storage_path",uploadedPath).maybeSingle();
      if(mediaReadError || !verifiedMedia ||
         verifiedMedia.kind !== (normalized.type.startsWith("video/")?"video":"image") ||
         verifiedMedia.mime_type !== normalized.type)
        throw mediaReadError || Error("O Neon não confirmou a mídia publicada.");
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
    if (mode !== "camera" || handsfreeRecording || photoPending || timerPending || recorder?.state==="recording") return;
    e.preventDefault(); pointer = e.pointerId; held = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    hold = setTimeout(() => { held = true; try { beginRecording(); } catch (error) { status(error.message, true); } }, 340);
  };
  const releaseShutter = async e => {
    if (pointer !== e.pointerId) return;
    pointer = null;
    if (hold) { clearTimeout(hold); hold = null; }
    stage.dataset.recording = "false";
    if (held) finishRecording(); else {
      if(timerPending || photoPending)return;
      const shotTicket=cameraRequestId;
      timerPending=true;
      try {
        if (cameraTimerSeconds) {
          const seconds=cameraTimerSeconds;
          status("Capturando em "+seconds+" s…");
          await new Promise(resolve=>setTimeout(resolve,seconds*1000));
        }
        if(shotTicket!==cameraRequestId||!active||mode!=="camera")return;
        await capturePhoto().catch(error=>status(error.message,true));
      } finally {timerPending=false;}
    }
  };
  const handlers = {
    "[data-studio-close]": close,
    "[data-studio-back]": async () => { clearPreview(); await startCamera().catch(error => status(error.message, true)); },
    "[data-studio-text-mode]": createText,
    "[data-studio-grid-toggle]": () => {
      settings.grid = !settings.grid; collageCanvas=null; collageShots=0;
      $("[data-studio-grid]").hidden = !settings.grid;
      $("[data-studio-grid-toggle]").setAttribute("aria-pressed",String(settings.grid));
      status(settings.grid?"Layout 2×2 ativado: capture quatro fotos.":"Layout desativado.");
    },
    "[data-studio-camera-more]": () => { const e=$("[data-studio-camera-extra]");e.hidden=!e.hidden;$("[data-studio-camera-more]").setAttribute("aria-expanded",String(!e.hidden)); },
    "[data-studio-ratio]": () => {
      modal("Proporção da captura", '<div class="studio-ratio-options" role="radiogroup" aria-label="Escolher proporção">' +
        Object.keys(STORY_ASPECTS).map(ratio => '<button type="button" role="radio" aria-checked="' + String(ratio === settings.ratio) + '" data-ratio-value="' + ratio + '">' + ratio + '</button>').join("") + '</div>');
      body.querySelectorAll("[data-ratio-value]").forEach(button => button.onclick = async () => {
        if(settings.ratio === button.dataset.ratioValue){modalClose();return;}
        settings.ratio = button.dataset.ratioValue;
        collageCanvas=null; collageShots=0; applyAspect(); modalClose();
        if(mode === "camera" && active){
          status("Ajustando câmera para " + settings.ratio + "…");
          await startCamera(settings.facing).catch(error=>status(error.message,true));
        }
      });
    },
    "[data-studio-editor-more]": () => { const e=$("[data-studio-editor-extra]");e.hidden=!e.hidden;$("[data-studio-editor-more]").setAttribute("aria-expanded",String(!e.hidden)); },
    "[data-studio-timer]": () => { modal("Temporizador", '<p class="studio-hint">Escolha quanto esperar antes da fotografia.</p><div class="studio-modal-actions"><button type="button" data-timer-value="0">Desligado</button><button type="button" data-timer-value="3">3 s</button><button type="button" data-timer-value="10">10 s</button></div>');body.querySelectorAll("[data-timer-value]").forEach(b=>b.onclick=()=>{cameraTimerSeconds=Number(b.dataset.timerValue);modalClose();status(cameraTimerSeconds?"Foto em "+cameraTimerSeconds+" segundos.":"Temporizador desligado.");}); },
    "[data-studio-handsfree]": () => { if(mode!=="camera")return;if(recorder?.state==="recording"){finishRecording();handsfreeRecording=false;}else{try{beginRecording();handsfreeRecording=true;}catch(error){status(error.message,true);}}$("[data-studio-handsfree]").setAttribute("aria-pressed",String(handsfreeRecording)); },
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
        flashButton.title = turnOn ? "Desligar luz da tela (sem flash físico)" : "Luz da tela para selfies";
        flashButton.setAttribute("aria-label",flashButton.title);
        status(turnOn ? "Iluminação da tela ativada. Não usa o LED traseiro." : "Iluminação da tela desligada.");
        return;
      }
      try {
        const physical=await setRearCameraTorch(track,turnOn);
        settings.flash=turnOn?"on":"off";
        flashButton.setAttribute("aria-pressed",String(turnOn));
        flashButton.title=turnOn?"Desligar lanterna traseira contínua":"Ligar lanterna traseira contínua";
        flashButton.setAttribute("aria-label",flashButton.title);
        status(turnOn
          ? (physical.confirmed?"Estado da lanterna contínua confirmado pelo navegador.":"Comando enviado à lanterna contínua; estado físico não informado pelo navegador.")
          : "Lanterna traseira desligada.");
      }catch(error){
        resetFlash();
        status("Lanterna traseira indisponível: "+(error.message||"recurso não suportado"),true);
      }
    },
    "[data-studio-settings]": () => {
      modal("Configurações da câmera", '<label>Tempo máximo de vídeo<select data-studio-length><option value="15000">15 segundos</option><option value="30000">30 segundos</option></select></label>' +
        '<p class="studio-hint">A câmera frontal utiliza a tela branca como iluminação. Na traseira, o flash aciona a lanterna física se o navegador autorizar. Para dar zoom, pinçe a imagem com dois dedos.</p>');
      body.querySelector("[data-studio-length]").value = String(settings.maxDuration);
      body.querySelector("[data-studio-length]").onchange = e => { settings.maxDuration = +e.target.value; modalClose(); };
    },
    "[data-studio-post]": () => {
      close();
      const composer = root.querySelector("[data-toggle-composer]");
      if (composer?.getAttribute("aria-expanded") !== "true") composer?.click();
      root.querySelector("#postBody")?.focus({ preventScroll: true });
      root.querySelector("[data-social-post]")?.scrollIntoView({ behavior: "smooth" });
    },
    "[data-studio-reel]": () => {
      const firstReel = root.querySelector("[data-open-reel]");
      if (firstReel) { close(); firstReel.click(); }
      else { status("Nenhum Reel disponível no Feed. Publique um vídeo no Feed para iniciar os Reels.", true); }
    },
    "[data-studio-music-open]": openMusic,
    "[data-studio-effects-open]": () => { modal("Filtros da imagem e vídeo", '<p class="studio-hint">Filtro aplicado também ao arquivo final.</p><div class="studio-filter-options">'+Object.entries({none:"Original",glow:"Natural",golden:"Dourado",cool:"Azulado",mono:"Preto e branco"}).map(([key,name])=>'<button type="button" data-studio-filter="'+key+'" aria-pressed="'+String(editFilter===key)+'">'+name+'</button>').join("")+'</div>');body.querySelectorAll("[data-studio-filter]").forEach(button=>button.onclick=()=>{editFilter=button.dataset.studioFilter;edits.style.filter=FILTERS[editFilter];body.querySelectorAll("[data-studio-filter]").forEach(el=>el.setAttribute("aria-pressed",String(el===button)));status("Filtro: "+button.textContent);}); },
    "[data-studio-music-remove]": () => {
      music = null;
      removeCatalogCredit();
      $("[data-studio-track-label]").textContent = "Adicionar música";
      $("[data-studio-track-hint]").textContent = "Trilha sonora";
      $("[data-studio-music-indicator]").hidden = true;
      $("[data-studio-music-open]").setAttribute("aria-label","Adicionar música");
      $("[data-studio-music-open]").title = "Adicionar música";
      modalClose();
      status("Música removida do Story.");
    },
    "[data-studio-add-text]": () => openLayerEditor(addLayer("", false),true),
    "[data-studio-edit-selected]": () => {if(selectedLayer?.isConnected)openLayerEditor(selectedLayer);},
    "[data-studio-mentions-open]": openMentions,
    "[data-studio-stickers]": () => {
      modal("Figurinhas", '<div class="studio-stickers">' + ["❤️","✨","🌟","😍","🎉","🔥","🥳","💜"].map(t => '<button type="button" data-sticker="' + t + '">' + t + '</button>').join("") + '</div>');
      body.querySelectorAll("[data-sticker]").forEach(b => b.onclick = () => { addLayer(b.dataset.sticker, true); modalClose(); });
    },
    "[data-studio-modal-close]": modalClose,
    "[data-studio-publicar]": event => { $("[data-studio-visibility]").value = "public"; requestStoryPublish(event); },
    "[data-studio-friends]": openAudience,
    "[data-studio-publish-friends]": event => {
      if($("[data-studio-visibility]").value!=="selected")return;
      requestStoryPublish(event);
    },
    "[data-studio-send]": () => {
      modal("Compartilhar Story", '<p class="studio-hint">Escolha quem poderá visualizar sua publicação.</p><div class="studio-modal-actions"><button type="button" data-share-public>Publicar Story</button><button type="button" data-share-friends>Amigos próximos</button></div>');
      body.querySelector("[data-share-public]").onclick=event=>{
        modalClose();$("[data-studio-visibility]").value="public";requestStoryPublish(event);
      };
      body.querySelector("[data-share-friends]").onclick=()=>{modalClose();openAudience();};
    }
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
      lensReady=true;
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
    // Pressing Enter in music search, text editor or IME is not publishing.
    preventImplicitStorySubmit(e);
  });
  dialog.addEventListener("cancel", e => { e.preventDefault(); close(); });
  dialog.addEventListener("close", () => { active = false; stopCamera(); unfreezeEditorPlane(); revokeUrl(); });
  return () => {
    close();
    if (lastThumb) { URL.revokeObjectURL(lastThumb); lastThumb = null; }
  };
}
