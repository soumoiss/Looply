// Face-anchored Story lenses. This intentionally uses MediaPipe's FaceLandmarker
// rather than CSS filters: every accessory is positioned from live face landmarks.
const TASKS_VERSION = "0.10.22";
const TASKS_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

function point(landmarks, index, width, height, mirrored) {
  const landmark = landmarks[index];
  if (!landmark) return null;
  return { x: (mirrored ? 1 - landmark.x : landmark.x) * width, y: landmark.y * height };
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function drawLens(context, landmarks, width, height, lens, mirrored) {
  if (!landmarks?.length || lens === "none") return;
  const leftEye = point(landmarks, 33, width, height, mirrored);
  const rightEye = point(landmarks, 263, width, height, mirrored);
  const forehead = point(landmarks, 10, width, height, mirrored);
  const chin = point(landmarks, 152, width, height, mirrored);
  if (!leftEye || !rightEye || !forehead || !chin) return;
  const faceWidth = distance(leftEye, rightEye) * 2.25;
  const eyeDistance = distance(leftEye, rightEye);
  context.save();
  if (lens === "glasses") {
    const radius = Math.max(15, eyeDistance * .39);
    context.lineWidth = Math.max(3, radius * .13);
    context.strokeStyle = "#17131de6";
    context.fillStyle = "#6ca9d244";
    for (const eye of [leftEye, rightEye]) {
      context.beginPath(); context.arc(eye.x, eye.y, radius, 0, Math.PI * 2);
      context.fill(); context.stroke();
    }
    context.beginPath(); context.moveTo(leftEye.x + radius, leftEye.y); context.lineTo(rightEye.x - radius, rightEye.y); context.stroke();
  } else if (lens === "halo") {
    const y = forehead.y - faceWidth * .18;
    context.lineWidth = Math.max(5, faceWidth * .08);
    context.strokeStyle = "#ffe680e8";
    context.shadowColor = "#ffcf3f"; context.shadowBlur = faceWidth * .16;
    context.beginPath(); context.ellipse(forehead.x, y, faceWidth * .34, faceWidth * .1, 0, 0, Math.PI * 2); context.stroke();
  } else if (lens === "mask") {
    const centerX = (forehead.x + chin.x) / 2;
    const centerY = (forehead.y + chin.y) / 2;
    context.fillStyle = "#a273ef42";
    context.strokeStyle = "#f0dcffcc";
    context.lineWidth = Math.max(2, faceWidth * .025);
    context.beginPath(); context.ellipse(centerX, centerY, faceWidth * .42, Math.abs(chin.y - forehead.y) * .55, 0, 0, Math.PI * 2); context.fill(); context.stroke();
  } else if (lens === "eyes") {
    const radius = Math.max(18, eyeDistance * .42);
    context.fillStyle = "#fff";
    context.strokeStyle = "#7041c7";
    context.lineWidth = Math.max(3, radius * .12);
    for (const eye of [leftEye, rightEye]) {
      context.beginPath(); context.arc(eye.x, eye.y, radius, 0, Math.PI * 2); context.fill(); context.stroke();
      context.fillStyle = "#191426"; context.beginPath(); context.arc(eye.x, eye.y, radius * .28, 0, Math.PI * 2); context.fill(); context.fillStyle = "#fff";
    }
  }
  context.restore();
}

export class StoryFaceLens {
  constructor(video, canvas, getFacingMode) {
    this.video = video; this.canvas = canvas; this.getFacingMode = getFacingMode;
    this.lens = "none"; this.running = false; this.faceLandmarker = null; this.frame = null;
    this.ready = false; this.lastError = null;
  }

  async prepare() {
    if (this.faceLandmarker) return true;
    try {
      const vision = await import(TASKS_URL);
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      this.faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" }, runningMode: "VIDEO",
        numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true
      });
      this.ready = true; this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = error; this.ready = false;
      console.warn("Looply face lenses could not initialize.", error);
      return false;
    }
  }

  setLens(lens) { this.lens = ["none", "glasses", "halo", "mask", "eyes"].includes(lens) ? lens : "none"; }
  start() { if (!this.running) { this.running = true; this.render(); } }
  stop() { this.running = false; if (this.frame) cancelAnimationFrame(this.frame); this.frame = null; this.clear(); }
  clear() { const ctx = this.canvas?.getContext("2d"); if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  render() {
    if (!this.running) return;
    const video = this.video, canvas = this.canvas;
    if (video?.videoWidth && video?.videoHeight && canvas) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
      const context = canvas.getContext("2d"); context.clearRect(0, 0, canvas.width, canvas.height);
      if (this.lens !== "none" && this.faceLandmarker) {
        const result = this.faceLandmarker.detectForVideo(video, performance.now());
        drawLens(context, result.faceLandmarks?.[0], canvas.width, canvas.height, this.lens, this.getFacingMode() === "user");
      }
    }
    this.frame = requestAnimationFrame(() => this.render());
  }
}

export function drawStoryLens(context, overlayCanvas, targetWidth, targetHeight) {
  if (overlayCanvas?.width && overlayCanvas?.height) context.drawImage(overlayCanvas, 0, 0, targetWidth, targetHeight);
}
