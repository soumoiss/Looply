// One model for mobile Story typography and encoded image/video pixels.
// Size is in pixels at a reference 390px-wide portrait editing canvas.
export const STORY_TEXT_REFERENCE_WIDTH = 390;
export const STORY_TEXT_MIN_SIZE = 18;
export const STORY_TEXT_MAX_SIZE = 94;
export const STORY_TEXT_FONTS = Object.freeze({
  modern: {label:"Moderna", family:'"Manrope", system-ui, sans-serif', face:"Manrope", weight:"700"},
  handwritten: {label:"Escrita", family:'"Caveat", "Segoe Print", cursive', face:"Caveat", weight:"700"},
  serif: {label:"Serifada", family:'"Playfair Display", Georgia, serif', face:"Playfair Display", weight:"700"},
  bold: {label:"Impacto", family:'"Anton", Impact, sans-serif', face:"Anton", weight:"400"},
  mono: {label:"Máquina", family:'"Space Mono", "Courier New", monospace', face:"Space Mono", weight:"700"},
});
export const STORY_TEXT_DEFAULT_FONT = "modern";
export const STORY_TEXT_MAX_CHARACTERS = 500;

export function storyTextNormalize(value) {
  return Array.from(String(value??"").replace(/\r\n?/g,"\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g,""))
    .slice(0,STORY_TEXT_MAX_CHARACTERS).join("");
}
export function storyTextClampSize(value) {
  const amount=Number(value);
  return Math.min(STORY_TEXT_MAX_SIZE,Math.max(STORY_TEXT_MIN_SIZE,
    Number.isFinite(amount)?amount:34));
}
export function storyTextPinchSize(initialSize,startDistance,currentDistance) {
  if(!Number.isFinite(startDistance)||startDistance<=0)return storyTextClampSize(initialSize);
  return storyTextClampSize(storyTextClampSize(initialSize)*Math.max(0,currentDistance)/startDistance);
}
export function storyTextClampPosition(x,y) {
  const clamp=value=>Number.isFinite(value)?Math.max(.07,Math.min(.93,value)):.5;
  return {x:clamp(x),y:clamp(y)};
}
export function storyTextFont(font) {
  return STORY_TEXT_FONTS[font]||STORY_TEXT_FONTS[STORY_TEXT_DEFAULT_FONT];
}
export function storyTextFontCss(font,size) {
  const definition=storyTextFont(font);
  return `${definition.weight} ${size}px ${definition.family}`;
}
export async function storyTextEnsureFonts(fontIds,fonts=typeof document!=="undefined"?document.fonts:null) {
  if(!fonts?.load)return false;
  const faces=[...new Set(fontIds)].map(id=>storyTextFont(id));
  const results=await Promise.allSettled(faces.map(def=>fonts.load(`${def.weight} 32px "${def.face}"`)));
  // System, Georgia and monospace are genuinely distinct local fallbacks.
  // Handwritten and Impacto require their named web font: do not silently
  // display the same generic sans-serif under several labels.
  const safeLocalFallbacks=new Set(["modern","serif","mono"]);
  return results.every((result,index)=>
    (result.status==="fulfilled"&&result.value.length>0) ||
    safeLocalFallbacks.has(Object.keys(STORY_TEXT_FONTS).find(key=>STORY_TEXT_FONTS[key]===faces[index]))
  );
}
const splitGraphemes=text=>{
  if(typeof Intl!=="undefined"&&typeof Intl.Segmenter==="function")
    return [...new Intl.Segmenter("pt-BR",{granularity:"grapheme"}).segment(text)].map(s=>s.segment);
  return Array.from(text);
};
// Does not stretch long lines with CanvasRenderingContext2D.fillText(maxWidth).
// Both the canvas renderer and the DOM preview use these line breaks.
export function storyTextWrap(ctx,value,maxWidth) {
  const lines=[];
  const paragraphs=storyTextNormalize(value).split("\n");
  for(const paragraph of paragraphs){
    if(paragraph===""){lines.push("");continue;}
    let line="";
    for(const grapheme of splitGraphemes(paragraph)){
      const candidate=line+grapheme;
      if(line&&ctx.measureText(candidate).width>maxWidth){
        // Prefer the most recent word break when available.
        const split=Math.max(line.lastIndexOf(" "),line.lastIndexOf("\t"));
        if(split>0){
          lines.push(line.slice(0,split).trimEnd());
          line=line.slice(split).trimStart()+grapheme;
        }else{lines.push(line);line=grapheme;}
      }else line=candidate;
    }
    lines.push(line);
  }
  return lines.length?lines:[""];
}
export function storyTextLayerLayout(ctx,layer,width,height) {
  const px=storyTextClampSize(layer.size)*(width/STORY_TEXT_REFERENCE_WIDTH);
  const font=storyTextFont(layer.font);
  ctx.font=storyTextFontCss(layer.font,px);
  const x=storyTextClampPosition(Number(layer.x),Number(layer.y));
  const maxWidth=width*.85;
  const lines=storyTextWrap(ctx,layer.text,maxWidth);
  const lineHeight=px*1.14;
  const startY=x.y*height-(lines.length-1)*lineHeight/2;
  const top=startY-px*.6;
  const bottom=startY+(lines.length-1)*lineHeight+px*.6;
  return {x:x.x*width,y:x.y*height,px,font,lines,lineHeight,maxWidth,startY,
    fits:top>=height*.06 && bottom<=height*.94};
}
export function storyTextPaintLayer(ctx,layer,width,height) {
  const layout=storyTextLayerLayout(ctx,layer,width,height);
  ctx.save();
  ctx.font=storyTextFontCss(layer.font,layout.px);
  ctx.fillStyle=layer.color||"#ffffff";
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.shadowColor="#000a";ctx.shadowBlur=Math.max(2,layout.px*.1);
  layout.lines.forEach((line,index)=>ctx.fillText(line,layout.x,layout.startY+index*layout.lineHeight));
  ctx.restore();
  return layout;
}


// Executable pointer handler shared by touch, pen and mouse. Text selection is
// separate from opening the keyboard. Drag and pinch never trigger edit().
export function bindStoryTextGestures(element,{
  getPosition,setPosition,getSize,setSize,getBounds,select,edit,
  clock=()=>performance.now()
}) {
  const pointers=new Map();
  let drag=null,pinch=null,hadGesture=false,lastTap=0;
  const distance=points=>Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
  const onDown=event=>{
    event.preventDefault?.();event.stopPropagation?.();
    select();
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    try{element.setPointerCapture?.(event.pointerId);}catch{}
    if(pointers.size===1){
      hadGesture=false;
      const pos=getPosition();
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,
        left:pos.x,top:pos.y,moved:false};
      pinch=null;
    }else if(pointers.size===2){
      pinch={distance:Math.max(1,distance([...pointers.values()])),size:getSize()};
      hadGesture=true;drag=null;lastTap=0;
    }
  };
  const onMove=event=>{
    if(!pointers.has(event.pointerId))return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size>=2&&pinch){
      setSize(storyTextPinchSize(pinch.size,pinch.distance,
        distance([...pointers.values()].slice(0,2))));
      hadGesture=true;lastTap=0;
    }else if(pointers.size===1&&drag&&drag.id===event.pointerId&&!hadGesture){
      const bounds=getBounds();
      if(!(bounds.width>0&&bounds.height>0))return;
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(Math.hypot(dx,dy)>5)drag.moved=true;
      if(drag.moved){
        lastTap=0;
        setPosition(storyTextClampPosition(drag.left+dx/bounds.width,
          drag.top+dy/bounds.height));
      }
    }
    event.preventDefault?.();
  };
  const onUp=event=>{
    if(!pointers.has(event.pointerId))return;
    const tapped=!hadGesture && drag && !drag.moved && pointers.size===1;
    pointers.delete(event.pointerId);
    if(pointers.size<2)pinch=null;
    if(pointers.size===0){
      drag=null;hadGesture=false;
      if(tapped){
        const now=clock();
        if(lastTap && now-lastTap<340){lastTap=0;edit();}
        else lastTap=now;
      }
    }
  };
  const onCancel=event=>{
    if(!pointers.has(event.pointerId))return;
    pointers.delete(event.pointerId);drag=null;pinch=null;hadGesture=true;lastTap=0;
    if(pointers.size===0)hadGesture=false;
  };
  const onClick=event=>{event.preventDefault?.();event.stopPropagation?.();};
  const onKey=event=>{
    if(event.key==="Enter"||event.key===" "){
      event.preventDefault?.();select();edit();
    }
  };
  const events=[
    ["pointerdown",onDown],["pointermove",onMove],["pointerup",onUp],
    ["pointercancel",onCancel],["click",onClick],["keydown",onKey]
  ];
  events.forEach(([name,fn])=>element.addEventListener(name,fn));
  return ()=>events.forEach(([name,fn])=>element.removeEventListener(name,fn));
}
