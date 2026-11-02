// Canvas viewport: zoom and pan are visual only, not transmitted as paint events.
export const clampGarticZoom = value => Math.min(5,Math.max(1,Number(value)||1));
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
export function computeGarticViewport(view, from, to, width, height){
  const scale=clampGarticZoom(view.scale*to.distance/Math.max(1,from.distance));
  const anchoredX=(from.x-view.x)/view.scale,anchoredY=(from.y-view.y)/view.scale;
  return {scale,
    x:clamp(to.x-anchoredX*scale,width*(1-scale),0),
    y:clamp(to.y-anchoredY*scale,height*(1-scale),0)};
}
export function attachGarticViewport(canvas,{state,canDraw,currentTool,onPreview,onCommit}){
  if(!canvas?.parentElement)throw Error("gartic_canvas_missing");
  const viewport=canvas.parentElement, fingers=new Map();
  let drawing=null,pinch=null,pan=null,suppress=false;
  const dimensions=()=>({width:viewport.clientWidth,height:viewport.clientHeight});
  const limit=()=>{
    const {width,height}=dimensions();
    state.scale=clampGarticZoom(state.scale);
    state.x=clamp(state.x,width*(1-state.scale),0);
    state.y=clamp(state.y,height*(1-state.scale),0);
  };
  const render=()=>{
    limit();
    canvas.style.transform=`translate3d(${state.x}px,${state.y}px,0) scale(${state.scale})`;
    const status=viewport.querySelector("[data-gartic-zoom-status]");
    if(status)status.textContent=Math.round(state.scale*100)+"%";
  };
  const local=e=>{
    const rect=viewport.getBoundingClientRect();
    return {x:e.clientX-rect.left,y:e.clientY-rect.top};
  };
  const normalized=e=>{
    const rect=canvas.getBoundingClientRect();
    return [Math.round(clamp((e.clientX-rect.left)*1000/rect.width,0,1000)),
      Math.round(clamp((e.clientY-rect.top)*1000/rect.height,0,1000))];
  };
  const pair=()=>{
    const [a,b]=[...fingers.values()];
    return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,
      distance:Math.hypot(a.x-b.x,a.y-b.y)};
  };
  const onDown=e=>{
    if(e.button>0||e.pointerType==="mouse"&&e.buttons===0)return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    fingers.set(e.pointerId,local(e));
    if(fingers.size===2){
      if(drawing){drawing=null;onPreview(null);}
      suppress=true;pan=null;pinch=pair();return;
    }
    if(fingers.size!==1||suppress)return;
    if(!canDraw() || currentTool()==="pan"){
      if(state.scale>1)pan={point:local(e),x:state.x,y:state.y};
      return;
    }
    const tool=currentTool();
    const start=normalized(e);
    drawing={tool,points:[start]};
    onPreview(drawing);
    if(tool==="fill"){
      const fill=drawing;drawing=null;
      void onCommit(fill);
    }
  };
  const onMove=e=>{
    if(!fingers.has(e.pointerId))return;
    e.preventDefault();
    fingers.set(e.pointerId,local(e));
    if(fingers.size===2 && pinch){
      const next=pair(),{width,height}=dimensions();
      Object.assign(state,computeGarticViewport(state,pinch,next,width,height));
      pinch=next;render();return;
    }
    if(suppress)return;
    if(pan){
      const next=local(e);state.x=pan.x+next.x-pan.point.x;state.y=pan.y+next.y-pan.point.y;render();return;
    }
    if(!drawing || !canDraw())return;
    const point=normalized(e),last=drawing.points[drawing.points.length-1];
    if(last && Math.hypot(point[0]-last[0],point[1]-last[1])<2)return;
    if(["circle","line","rectangle"].includes(drawing.tool))
      drawing.points=[drawing.points[0],point];
    else if(drawing.points.length<140)drawing.points.push(point);
    onPreview(drawing);
  };
  const onEnd=e=>{
    if(!fingers.has(e.pointerId))return;
    fingers.delete(e.pointerId);
    if(fingers.size<2)pinch=null;
    if(suppress){if(!fingers.size)suppress=false;drawing=null;pan=null;onPreview(null);return;}
    if(pan){pan=null;return;}
    if(!drawing)return;
    const stroke=drawing;drawing=null;onPreview(null);
    if(e.type==="pointercancel")return;
    if(stroke.points.length===1&&stroke.tool!=="fill")stroke.points.push(stroke.points[0]);
    void onCommit(stroke);
  };
  canvas.style.touchAction="none";canvas.style.transformOrigin="0 0";
  canvas.addEventListener("pointerdown",onDown);
  canvas.addEventListener("pointermove",onMove);
  canvas.addEventListener("pointerup",onEnd);
  canvas.addEventListener("pointercancel",onEnd);
  canvas.addEventListener("lostpointercapture",onEnd);
  const wheel=e=>{
    if(!e.ctrlKey)return;
    e.preventDefault();
    zoom(e.deltaY<0?1.12:.89,local(e));
  };
  function zoom(factor,center=null){
    const {width,height}=dimensions();
    center ||= {x:width/2,y:height/2};
    const to={...center,distance:factor*100},from={...center,distance:100};
    Object.assign(state,computeGarticViewport(state,from,to,width,height));render();
  }
  viewport.addEventListener("wheel",wheel,{passive:false});
  render();
  return {zoom,reset(){state.scale=1;state.x=0;state.y=0;render();},
    render,destroy(){
      for(const [name,cb] of [["pointerdown",onDown],["pointermove",onMove],
       ["pointerup",onEnd],["pointercancel",onEnd],["lostpointercapture",onEnd]])
        canvas.removeEventListener(name,cb);
      viewport.removeEventListener("wheel",wheel);
      fingers.clear();
    }};
}
