// GPU radial deformation: actual camera pixels, not overlay emoji.
export class FaceWarpGPU {
  constructor(){
    this.canvas=document.createElement("canvas");
    const gl=this.canvas.getContext("webgl",{alpha:false,antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error("WebGL indisponível");
    this.gl=gl;
    const shader=(type,code)=>{
      const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const v=shader(gl.VERTEX_SHADER,
      "attribute vec2 p;varying vec2 uv;void main(){uv=(p+1.0)*0.5;gl_Position=vec4(p,0.,1.);}");
    const f=shader(gl.FRAGMENT_SHADER,[
      "precision mediump float;varying vec2 uv;",
      "uniform sampler2D tex;uniform vec2 c1,c2,aspect;uniform float rad,power;uniform int mode;",
      "vec2 warped(vec2 p,vec2 c){",
      "vec2 d=(p-c)*aspect;float t=length(d)/max(.001,rad);",
      "float fall=pow(max(0.,1.-t*t),2.);return c+(p-c)*(1.-power*fall);}",
      "void main(){vec2 p=uv;",
      "if(mode==1){p=warped(p,c1);p=warped(p,c2);}",
      "else if(mode==2){p=warped(p,c1);}",
      "gl_FragColor=texture2D(tex,clamp(p,vec2(0.),vec2(1.)));}"
    ].join(""));
    const program=gl.createProgram();gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error("Shader AR inválido");
    gl.useProgram(program);this.program=program;
    const buffer=gl.createBuffer();this.buffer=buffer;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const att=gl.getAttribLocation(program,"p");gl.enableVertexAttribArray(att);
    gl.vertexAttribPointer(att,2,gl.FLOAT,false,0,0);
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    this.u=Object.fromEntries(["c1","c2","aspect","rad","power","mode"].map(x=>[x,gl.getUniformLocation(program,x)]));
  }
  draw(source,points,id,strength,mirror){
    const w=source.width,h=source.height;
    const pt=i=>points[i]?{x:mirror?1-points[i].x:points[i].x,y:1-points[i].y}:null;
    const l=pt(33),r=pt(263),upper=pt(13),lower=pt(14);
    if(!l||!r||!upper||!lower)return false;
    const eyes=Math.hypot((l.x-r.x)*w,(l.y-r.y)*h);
    const c=id==="big-eyes"?l:{x:(upper.x+lower.x)/2,y:(upper.y+lower.y)/2};
    const other=id==="big-eyes"?r:c;
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    const gl=this.gl;gl.viewport(0,0,w,h);gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
    gl.uniform2f(this.u.c1,c.x,c.y);gl.uniform2f(this.u.c2,other.x,other.y);
    gl.uniform2f(this.u.aspect,w/h,1);
    gl.uniform1f(this.u.rad,eyes*(id==="big-eyes"?.38:.70)/h);
    gl.uniform1f(this.u.power,strength);gl.uniform1i(this.u.mode,id==="big-eyes"?1:2);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return true;
  }
  dispose(){const g=this.gl;g.deleteTexture(this.texture);g.deleteBuffer(this.buffer);g.deleteProgram(this.program);g.getExtension("WEBGL_lose_context")?.loseContext();}
}
export function fallbackFaceWarp(ctx,source,points,id,strength,mirror){
  const w=source.width,h=source.height;
  const p=i=>points[i]?{x:(mirror?1-points[i].x:points[i].x)*w,y:points[i].y*h}:null;
  const l=p(33),r=p(263),mouth=p(13);
  if(!l||!r||!mouth)return;
  const d=Math.hypot(l.x-r.x,l.y-r.y);
  const centers=id==="big-eyes"?[l,r]:[mouth];
  for(const c of centers){
    const radius=d*(id==="big-eyes"?.38:.70),z=1+strength*.9;
    ctx.save();ctx.beginPath();ctx.arc(c.x,c.y,radius,0,Math.PI*2);ctx.clip();
    ctx.drawImage(source,c.x-radius/z,c.y-radius/z,2*radius/z,2*radius/z,c.x-radius,c.y-radius,2*radius,2*radius);
    ctx.restore();
  }
}
