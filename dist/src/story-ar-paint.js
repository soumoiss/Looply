// Landmark-locked 2D artwork, used for clown makeup, face mask and 3D fallback.
export function paintFaceEffect(ctx,landmarks,w,h,mirror,manifest){
  const at=i=>landmarks[i]?{x:(mirror?1-landmarks[i].x:landmarks[i].x)*w,y:landmarks[i].y*h}:null;
  const l=at(33),r=at(263),nose=at(1),chin=at(152),brow=at(10);
  if(!l||!r||!nose||!chin||!brow)return;
  const ew=Math.hypot(l.x-r.x,l.y-r.y),params=manifest?.params||{};
  ctx.save();
  if(manifest.id==="clown"){
    ctx.globalAlpha=.6;ctx.fillStyle=params.cheekColor||"#ff5189";
    for(const i of [205,425]){const v=at(i);if(!v)continue;
      ctx.beginPath();ctx.ellipse(v.x,v.y,ew*.27,ew*.19,0,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=.93;ctx.fillStyle=params.noseColor||"#f32c4c";
    ctx.beginPath();ctx.arc(nose.x,nose.y,ew*.14,0,Math.PI*2);ctx.fill();
    const a=at(61),b=at(291),m=at(17);
    if(a&&b&&m){ctx.strokeStyle=params.lipColor||"#c71746";ctx.lineWidth=Math.max(4,ew*.10);ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(m.x,m.y+ew*.10,b.x,b.y);ctx.stroke();}
    ctx.globalAlpha=.83;
    for(const eye of [l,r]){ctx.fillStyle="#26b7f7";
      ctx.beginPath();ctx.moveTo(eye.x,eye.y-ew*.31);
      ctx.lineTo(eye.x-ew*.14,eye.y-ew*.09);ctx.lineTo(eye.x+ew*.14,eye.y-ew*.09);
      ctx.closePath();ctx.fill();}
  }else if(manifest.id==="skincare"){
    const outline=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,
      148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
    ctx.beginPath();
    let first=true;
    for(const i of outline){const v=at(i);if(!v)continue;if(first){ctx.moveTo(v.x,v.y);first=false;}else ctx.lineTo(v.x,v.y);}
    ctx.closePath();
    // Eye and mouth cutouts use evenodd winding, so the face remains visible.
    for(const indices of [[33,160,158,133,153,144],[263,387,385,362,380,373],[61,40,0,267,291,314,17,84]]){
      const p=at(indices[0]);if(!p)continue;ctx.moveTo(p.x,p.y);
      for(const i of indices.slice(1)){const v=at(i);if(v)ctx.lineTo(v.x,v.y);}
      ctx.closePath();
    }
    const g=ctx.createLinearGradient(brow.x,brow.y,chin.x,chin.y);
    g.addColorStop(0,params.topColor||"#a2ffce");g.addColorStop(1,params.bottomColor||"#49acac");
    ctx.globalAlpha=.68;ctx.fillStyle=g;ctx.fill("evenodd");
    ctx.globalAlpha=.7;ctx.strokeStyle="#d6fff1";ctx.lineWidth=Math.max(2,ew*.027);
    ctx.beginPath();ctx.ellipse(brow.x,brow.y+ew*.16,ew*.52,ew*.13,0,Math.PI,Math.PI*2);ctx.stroke();
  }else if(manifest.id==="sunglasses"){
    // Procedural 2D fallback only when Three.js/WebGL 3D initialization fails.
    const theta=Math.atan2(r.y-l.y,r.x-l.x),mx=(l.x+r.x)/2,my=(l.y+r.y)/2;
    ctx.translate(mx,my);ctx.rotate(theta);ctx.lineWidth=Math.max(3,ew*.055);
    ctx.fillStyle="#142139ea";ctx.strokeStyle="#22202f";
    for(const s of [-1,1]){
      const x=s*ew*.5;
      ctx.beginPath();ctx.roundRect(x-ew*.35,-ew*.23,ew*.70,ew*.46,ew*.13);ctx.fill();ctx.stroke();
      ctx.fillStyle="#b8c4ee48";ctx.beginPath();ctx.ellipse(x-ew*.06,-ew*.13,ew*.2,ew*.04,-.22,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#142139ea";
    }
    ctx.beginPath();ctx.moveTo(-ew*.15,0);ctx.lineTo(ew*.15,0);ctx.stroke();
  }
  ctx.restore();
}
