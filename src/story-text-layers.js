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
  return results.every(result=>result.status==="fulfilled"&&result.value.length>0);
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
  return {x:x.x*width,y:x.y*height,px,font,lines,lineHeight,maxWidth,
    startY:x.y*height-(lines.length-1)*lineHeight/2};
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
