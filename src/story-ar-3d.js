// Procedural sunglasses mesh: Three.js MIT, no proprietary AR SDK.
const THREE_MODULE="https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
export class StoryGlasses3D{
  async prepare(){
    const THREE=await import(THREE_MODULE);
    this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(1);
    this.scene=new THREE.Scene();
    this.camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,1200);
    this.camera.position.z=500;this.camera.lookAt(0,0,0);
    this.group=new THREE.Group();
    const frame=new THREE.MeshStandardMaterial({color:0x3b3450,metalness:.76,roughness:.25});
    const glass=new THREE.MeshPhongMaterial({color:0x101d32,opacity:.9,transparent:true,shininess:120,side:THREE.DoubleSide});
    for(const x of [-.34,.34]){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.29,.035,10,36),frame);
      ring.position.x=x;this.group.add(ring);
      const lens=new THREE.Mesh(new THREE.CircleGeometry(.27,36),glass);
      lens.position.set(x,0,-.015);this.group.add(lens);
      const arm=new THREE.Mesh(new THREE.BoxGeometry(.32,.045,.055),frame);
      arm.position.set(x+Math.sign(x)*.38,.04,-.06);arm.rotation.y=Math.sign(x)*.23;this.group.add(arm);
    }
    const bridge=new THREE.Mesh(new THREE.BoxGeometry(.14,.037,.055),frame);
    bridge.position.z=.035;this.group.add(bridge);
    this.scene.add(this.group);this.scene.add(new THREE.AmbientLight(0xffffff,1.55));
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-2,3,5);this.scene.add(light);
  }
  paint(ctx,points,w,h,mirror){
    if(!this.renderer)return false;
    const at=i=>points[i]?{x:(mirror?1-points[i].x:points[i].x)*w,y:points[i].y*h}:null;
    const l=at(33),r=at(263),nose=at(1);
    if(!l||!r||!nose)return false;
    const dw=Math.hypot(l.x-r.x,l.y-r.y),mx=(l.x+r.x)/2,my=(l.y+r.y)/2;
    this.group.position.set(mx-w/2,h/2-my,0);
    this.group.scale.setScalar(dw/.68);
    this.group.rotation.z=-Math.atan2(r.y-l.y,r.x-l.x);
    this.group.rotation.y=Math.max(-.3,Math.min(.3,(mx-nose.x)/dw));
    Object.assign(this.camera,{left:-w/2,right:w/2,top:h/2,bottom:-h/2});
    this.camera.updateProjectionMatrix();
    if(this.renderer.domElement.width!==w||this.renderer.domElement.height!==h)this.renderer.setSize(w,h,false);
    this.renderer.clear();this.renderer.render(this.scene,this.camera);
    ctx.drawImage(this.renderer.domElement,0,0,w,h);return true;
  }
  dispose(){this.renderer?.dispose();this.renderer?.forceContextLoss?.();this.renderer=null;}
}
