// Deterministic drawing operations shared by the local painter and all viewers.
export const GARTIC_WIDTH=1000,GARTIC_HEIGHT=650;
const validHex=value=>/^#[\da-f]{6}$/i.test(value)?value:"#242432";
const point=(p)=>[Math.max(0,Math.min(GARTIC_WIDTH,Number(p?.[0])||0)),Math.max(0,Math.min(GARTIC_HEIGHT,(Number(p?.[1])||0)*.65))];
export function floodFill(ctx,x,y,color,tolerance=20) {
  const W=GARTIC_WIDTH,H=GARTIC_HEIGHT;
  x=Math.max(0,Math.min(W-1,Math.floor(x)));y=Math.max(0,Math.min(H-1,Math.floor(y)));
  const picture=ctx.getImageData(0,0,W,H),pixels=picture.data,at=4*(y*W+x);
  const source=[pixels[at],pixels[at+1],pixels[at+2]];
  const target=[parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16)];
  if(source.every((v,i)=>Math.abs(v-target[i])<=tolerance))return false;
  const stack=new Int32Array(W*H),seen=new Uint8Array(W*H);let length=0;
  stack[length++]=y*W+x;seen[y*W+x]=1;
  let changed=0;
  while(length){
    const id=stack[--length],idx=id*4;
    if(Math.abs(pixels[idx]-source[0])>tolerance ||
       Math.abs(pixels[idx+1]-source[1])>tolerance ||
       Math.abs(pixels[idx+2]-source[2])>tolerance)continue;
    pixels[idx]=target[0];pixels[idx+1]=target[1];pixels[idx+2]=target[2];pixels[idx+3]=255;changed++;
    const xx=id%W,yy=(id/W)|0;
    for(const next of [xx>0?id-1:-1,xx<W-1?id+1:-1,yy>0?id-W:-1,yy<H-1?id+W:-1]){
      if(next>=0&&!seen[next]){seen[next]=1;stack[length++]=next;}
    }
  }
  if(changed)ctx.putImageData(picture,0,0);
  return changed>0;
}
export function applyGarticStroke(ctx,stroke){
  const points=Array.isArray(stroke?.points)?stroke.points.filter(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=1000)):[];
  if(!points.length)return;
  const tool=["pen","eraser","fill","line","circle","rectangle"].includes(stroke.tool)?stroke.tool:"pen";
  const color=tool==="eraser"?"#ffffff":validHex(stroke.color);
  if(tool==="fill"){const [x,y]=point(points[0]);floodFill(ctx,x,y,color);return;}
  const p=points.map(point),[x0,y0]=p[0],[x1,y1]=p[p.length-1];
  ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=Math.max(1,Math.min(35,Number(stroke.width)||5));
  ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();
  if(tool==="line"){ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);}
  else if(tool==="rectangle"){ctx.rect(Math.min(x0,x1),Math.min(y0,y1),Math.abs(x1-x0),Math.abs(y1-y0));}
  else if(tool==="circle"){
    const rx=Math.abs(x1-x0)/2,ry=Math.abs(y1-y0)/2;
    ctx.ellipse((x0+x1)/2,(y0+y1)/2,Math.max(.2,rx),Math.max(.2,ry),0,0,Math.PI*2);
  }else{
    ctx.moveTo(x0,y0);
    if(p.length===1){ctx.arc(x0,y0,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();ctx.restore();return;}
    for(const [x,y] of p.slice(1))ctx.lineTo(x,y);
  }
  ctx.stroke();ctx.restore();
}
