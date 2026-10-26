// Open-source mobile AR camera: MediaPipe Face Landmarker + WebGL + Three.js.
// All effects render on-device; face video never leaves the user's browser.
import {FaceWarpGPU,fallbackFaceWarp} from "./story-ar-warp.js";
import {paintFaceEffect} from "./story-ar-paint.js";
import {StoryGlasses3D} from "./story-ar-3d.js";
// Only use a published, pinned stable version. 0.10.22 does NOT exist on npm.
const TASKS_VERSION = "0.10.34";
const TASKS_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + TASKS_VERSION;
const WASM_URL = TASKS_URL + "/wasm";
const BUNDLE_URL = TASKS_URL + "/vision_bundle.mjs";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
export class StoryFaceLens {
  constructor(video,canvas,getFacingMode){
    this.video=video;this.canvas=canvas;this.getFacingMode=getFacingMode;
    this.lens="none";this.effect={id:"none",type:"none",strength:0,params:{}};
    this.running=false;this.faceLandmarker=null;this.frame=null;
    this.ready=false;this.lastError=null;this.lastDetect=0;this.lastDraw=0;this.lastVideoTime=-1;
    this.landmarks=null;this.warper=null;this.glasses=null;this.source=document.createElement("canvas");
    this.selectionSerial=0;this.preparePromise=null;
  }
  async prepare(){
    if(this.faceLandmarker)return true;
    if(this.preparePromise)return this.preparePromise;
    const task=async()=>{
    try{
      const vision=await import(BUNDLE_URL);
      const fileset=await vision.FilesetResolver.forVisionTasks(WASM_URL);
      const options={
        baseOptions:{modelAssetPath:MODEL_URL,delegate:"GPU"},runningMode:"VIDEO",
        numFaces:1,outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true
      };
      try{this.faceLandmarker=await vision.FaceLandmarker.createFromOptions(fileset,options);}
      catch(error){
        // Some older Android/iOS GPUs cannot run the MediaPipe GPU delegate.
        options.baseOptions.delegate="CPU";
        this.faceLandmarker=await vision.FaceLandmarker.createFromOptions(fileset,options);
      }
      this.ready=true;this.lastError=null;return true;
    }catch(error){
      this.lastError=error;this.ready=false;
      console.warn("Loooply: não foi possível inicializar AR",error);return false;
    }
    };
    this.preparePromise=task().finally(()=>{this.preparePromise=null;});
    return this.preparePromise;
  }
  async setLens(effect){
    const manifest=typeof effect==="string"
      ? {id:effect,type:effect==="none"?"none":"paint",strength:.45,params:{}}
      : effect;
    this.effect=manifest||{id:"none",type:"none",strength:0,params:{}};
    this.lens=this.effect.id;
    const serial=++this.selectionSerial;
    this.clear();
    if(this.lens==="sunglasses"&&!this.glasses){
      try{
        const glasses=new StoryGlasses3D();
        await glasses.prepare();
        if(serial===this.selectionSerial&&this.running)this.glasses=glasses;
        else glasses.dispose();
      }catch(error){this.lastError=error;console.warn("Lente 3D: usando alternativa Canvas",error);}
    }
  }
  start(){if(!this.running){this.running=true;this.render();}}
  stop(){
    this.running=false;this.selectionSerial++;
    if(this.frame)cancelAnimationFrame(this.frame);this.frame=null;
    this.clear();this.landmarks=null;this.lastDetect=0;this.lastVideoTime=-1;
    this.faceLandmarker?.close?.();this.faceLandmarker=null;this.ready=false;
    this.warper?.dispose();this.warper=null;this.glasses?.dispose();this.glasses=null;
  }
  clear(){const ctx=this.canvas?.getContext("2d");ctx?.clearRect(0,0,this.canvas.width,this.canvas.height);}
  render(){
    if(!this.running)return;
    const video=this.video,canvas=this.canvas,now=performance.now();
    // Draw at most 30 fps; inference runs at most 15 fps on mobile.
    if(this.lens!=="none"&&this.faceLandmarker&&video?.videoWidth&&video?.videoHeight&&now-this.lastDraw>=33){
      this.lastDraw=now;
      const w=Math.min(720,video.videoWidth),h=Math.max(1,Math.round(w*video.videoHeight/video.videoWidth));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      if(this.source.width!==w||this.source.height!==h){this.source.width=w;this.source.height=h;}
      const ctx=canvas.getContext("2d"),source=this.source.getContext("2d",{alpha:false});
      if(now-this.lastDetect>=64&&video.currentTime!==this.lastVideoTime){
        try{
          const result=this.faceLandmarker.detectForVideo(video,now);
          this.landmarks=result.faceLandmarks?.[0]||null;
          this.lastDetect=now;this.lastVideoTime=video.currentTime;
        }catch(error){this.lastError=error;this.landmarks=null;}
      }
      ctx.clearRect(0,0,w,h);
      if(this.landmarks){
        const mirrored=this.getFacingMode()==="user";
        source.save();
        if(mirrored){source.translate(w,0);source.scale(-1,1);}
        source.drawImage(video,0,0,w,h);
        source.restore();
        if(this.effect.type==="warp"){
          let warped=false;
          try{
            if(!this.warper)this.warper=new FaceWarpGPU();
            warped=this.warper.draw(this.source,this.landmarks,this.lens,this.effect.strength,mirrored);
            if(warped)ctx.drawImage(this.warper.canvas,0,0,w,h);
          }catch(error){
            this.lastError=error;this.warper?.dispose();this.warper=null;
          }
          if(!warped){
            ctx.drawImage(this.source,0,0,w,h);
            fallbackFaceWarp(ctx,this.source,this.landmarks,this.lens,this.effect.strength,mirrored);
          }
        }else{
          ctx.drawImage(this.source,0,0,w,h);
          if(!(this.lens==="sunglasses"&&this.glasses?.paint(ctx,this.landmarks,w,h,mirrored)))
            paintFaceEffect(ctx,this.landmarks,w,h,mirrored,this.effect);
        }
      }
    }else if(this.lens==="none"&&canvas.width&&canvas.height)this.clear();
    this.frame=requestAnimationFrame(()=>this.render());
  }
}
export function drawStoryLens(context,overlayCanvas,targetWidth,targetHeight){
  if(overlayCanvas?.width&&overlayCanvas?.height)
    context.drawImage(overlayCanvas,0,0,targetWidth,targetHeight);
}
