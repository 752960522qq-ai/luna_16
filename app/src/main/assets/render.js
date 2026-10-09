import * as THREE from './three.module.js';
import { GLTFLoader } from './GLTFLoader.js';
import { splitAvengerWheels } from './vehicle-wheels.js';
const B = window.Blindfire, FORWARD = new THREE.Vector3(0, 0, -1);
const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
const palette = { body: mat('#496153'), hostile: mat('#785049'), hostileAir: mat('#905b50'), trim: mat('#273b35'), dark: mat('#1b2729'), steel: mat('#7c8b82'), glass: mat('#14343e'), tire: mat('#202425'), white: mat('#edf1d9'), sand: mat('#c2bca0'), roof: mat('#8b8571'), flame: new THREE.MeshBasicMaterial({color:'#ffb461'}), bullet: new THREE.MeshBasicMaterial({color:'#ffeabd'}) };
function box(g,x,y,z,w,h,d,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);g.add(m);return m;}
function cylinder(g,x,y,z,top,bottom,h,material,sides=10){const m=new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,h,sides),material);m.position.set(x,y,z);g.add(m);return m;}
function truck(hostile=false){
  const g=new THREE.Group(),body=hostile?palette.hostile:palette.body;
  // 8x8 chassis + armored cab. Keep original overall dimensions so hitboxes/camera remain unchanged.
  box(g,0,2.05,0,8.5,1.25,19.2,palette.dark);box(g,0,2.95,3.9,8.15,.8,11.1,body);
  box(g,0,3.65,-6.15,8.35,2.7,6.6,body);const roof=box(g,0,5.75,-6.0,8.05,1.15,5.6,body);roof.rotation.x=.055;
  // Split windshield, side glass, door seams and mirrors.
  for(const x of[-2.0,2.0]){const w=box(g,x,5.18,-9.48,3.5,1.4,.12,palette.glass);w.rotation.x=.055;}
  box(g,0,5.18,-9.55,.2,1.55,.16,palette.dark);for(const x of[-4.2,4.2]){box(g,x,5.05,-6.45,.12,1.35,2.5,palette.glass);box(g,x,4.15,-4.9,.13,2.35,.16,palette.dark);box(g,x,4.3,-5.2,.18,.18,.75,palette.steel);}
  for(const x of[-4.72,4.72]){box(g,x,5.2,-7.55,.08,1.1,.08,palette.dark);box(g,x,5.65,-7.9,.48,.7,.18,palette.dark);}
  // Front bumper, grille, lamps and towing points.
  box(g,0,2.55,-9.78,8.9,.5,.55,palette.steel);box(g,0,3.35,-9.72,5.4,.92,.18,palette.dark);
  for(const x of[-2.2,-1.45,-.72,0,.72,1.45,2.2])box(g,x,3.35,-9.83,.13,.68,.2,palette.steel);
  for(const x of[-3.25,3.25]){const lamp=cylinder(g,x,3.35,-9.88,.47,.47,.15,palette.white,24);lamp.rotation.x=Math.PI/2;const marker=cylinder(g,x,2.8,-9.89,.23,.23,.13,palette.steel,20);marker.rotation.x=Math.PI/2;}
  // Rear equipment deck, storage bins, steps and mud guards.
  box(g,0,3.55,4.8,7.75,.7,8.6,body);box(g,0,4.05,7.55,5.2,.75,2.0,palette.trim);
  for(const x of[-3.65,3.65]){box(g,x,3.72,5.1,.95,1.15,3.8,palette.trim);box(g,x,2.25,-5.25,.75,.18,3.0,palette.steel);box(g,x,1.82,8.55,1.45,1.35,.14,palette.dark);}
  for(const x of[-4.55,4.55])box(g,x,2.58,.3,.5,.22,17.0,body);
  box(g,0,2.55,9.72,8.65,.45,.45,palette.steel);
  // High-detail rotating launcher pedestal.
  const turret=new THREE.Group();turret.position.set(0,4.55,1.25);g.add(turret);cylinder(turret,0,0,0,2.85,2.85,.85,palette.steel,36);cylinder(turret,0,.62,0,2.45,2.45,.45,body,36);
  const arm=new THREE.Group();arm.position.y=1.05;turret.add(arm);box(arm,0,0,.9,5.45,.9,8.2,body);
  for(const x of[-2.55,2.55])box(arm,x,.15,.65,.32,1.35,6.9,palette.steel);
  // Twin launch tubes, reinforcing collars and rear caps.
  for(const x of[-1.55,1.55]){
    const tube=cylinder(arm,x,.85,0,.84,.84,10,palette.trim,36);tube.rotation.x=Math.PI/2;
    for(const z of[-4.2,-1.5,1.5,4.2]){const ring=cylinder(arm,x,.85,z,.92,.92,.22,palette.steel,36);ring.rotation.x=Math.PI/2;}
    const front=cylinder(arm,x,.85,-5.12,.76,.76,.24,palette.dark,36);front.rotation.x=Math.PI/2;
    const rear=cylinder(arm,x,.85,5.12,.74,.74,.20,palette.steel,36);rear.rotation.x=Math.PI/2;
  }
  // Manually aimed artillery tube between launchers.
  const gun=cylinder(arm,0,1.4,-.4,.34,.34,8.8,palette.steel,28);gun.rotation.x=Math.PI/2;const muzzle=cylinder(arm,0,1.4,-4.95,.46,.46,.44,palette.dark,28);muzzle.rotation.x=Math.PI/2;const breech=cylinder(arm,0,1.4,3.7,.49,.49,1.0,palette.dark,28);breech.rotation.x=Math.PI/2;
  // Roof machine gun remains a separate animated group.
  const mg=new THREE.Group();mg.position.set(3.05,1.55,.9);turret.add(mg);box(mg,0,0,.55,.62,.58,1.45,palette.dark);box(mg,.52,-.2,.6,.72,.5,.34,palette.steel);const mgBarrel=cylinder(mg,0,0,-1.55,.13,.13,4.4,palette.dark,20);mgBarrel.rotation.x=Math.PI/2;box(mg,0,-.55,1.3,1.15,.72,1.1,body);
  // Roof hatch, optics, exhaust and antennas.
  cylinder(g,-2.7,6.42,-4.6,.75,.75,.18,body,28);cylinder(g,-2.7,6.82,-4.6,.22,.22,.68,palette.steel,20);
  const exhaust=cylinder(g,-3.7,4.85,7.4,.22,.22,4.2,palette.dark,20);const cap=cylinder(g,-3.7,6.96,7.4,.28,.28,.38,palette.steel,20);
  for(const [x,z,h] of [[-3.2,3,5.3],[3.25,4,3.7]]){cylinder(g,x,7+h/2,z,.045,.045,h,palette.dark,8);cylinder(g,x,7,z,.1,.1,.24,palette.steel,16);}
  // Higher-poly wheels with separate rims/hubs.
  const wheels=[];for(const x of[-4.25,4.25])for(const z of[-6.2,-2.1,2.9,7.0]){
    const wheel=cylinder(g,x,1.45,z,1.62,1.62,1.18,palette.tire,32);wheel.rotation.z=Math.PI/2;wheels.push(wheel);
    const rim=cylinder(g,x+Math.sign(x)*.62,1.45,z,.78,.78,.16,palette.steel,28);rim.rotation.z=Math.PI/2;
    const hub=cylinder(g,x+Math.sign(x)*.72,1.45,z,.31,.31,.18,palette.dark,20);hub.rotation.z=Math.PI/2;
  }
  g.userData={turret,arm,mg,wheels};return g;
}
function aircraft(kind,hostile){
  const g=new THREE.Group(),body=hostile?palette.hostileAir:palette.white;
  if(kind==='uav'){
    box(g,0,0,0,2.3,1.2,5,body);box(g,0,.1,.5,13,.22,2.3,body);box(g,0,.3,2,5,.2,1.4,body);box(g,0,.85,2,.22,1.5,1.5,palette.trim);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(1.1,2,8),body);nose.rotation.x=-Math.PI/2;nose.position.z=-3.1;g.add(nose);box(g,0,-.7,-1,.65,.6,.65,palette.dark);g.userData.prop=box(g,0,.05,-4.3,3.4,.13,.15,palette.dark);
  }else if(kind==='bullet')box(g,0,0,0,.2,.2,3,palette.bullet);
  else{
    const r=kind==='artillery'?.3:kind==='sam'?.4:.65,len=kind==='artillery'?1.3:kind==='sam'?4:6;
    const shaft=cylinder(g,0,0,0,r,r,len,body,8);shaft.rotation.x=Math.PI/2;
    const nose=new THREE.Mesh(new THREE.ConeGeometry(r,len*.32,8),palette.steel);nose.rotation.x=-Math.PI/2;nose.position.z=-len*.66;g.add(nose);
    if(kind!=='artillery'){box(g,0,0,len*.3,r*5,.16,1.4,palette.trim);box(g,0,0,len*.3,.16,r*5,1.4,palette.trim);const flame=new THREE.Mesh(new THREE.ConeGeometry(r*.72,2.9,6),palette.flame);flame.rotation.x=Math.PI/2;flame.position.z=len/2+1.3;g.add(flame);g.userData.flame=flame;}
  }return g;
}
export class Renderer{
  constructor(canvas,mini){
    this.canvas=canvas;this.mini=mini;this.miniCtx=mini.getContext('2d');this.meshes=new Map();this.trailMeshes=new Map();this.effectMeshes=new Map();this.ready=false;this.cameraKey=null;this.modelsReady=false;
    try{
      this.gl=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',alpha:false});this.gl.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));this.gl.outputColorSpace=THREE.SRGBColorSpace;
      this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#b8cbd0');this.scene.fog=new THREE.Fog('#b8c5ba',230,2400);this.camera=new THREE.PerspectiveCamera(62,1,.35,4000);
      this.scene.add(new THREE.HemisphereLight('#ddeef1','#484535',2.1));const sun=new THREE.DirectionalLight('#fff0d2',2.3);sun.position.set(-240,520,-250);this.scene.add(sun);
      this.createLandscape();this.ownTruck=truck();this.enemyTruck=truck(true);this.scene.add(this.ownTruck,this.enemyTruck);this.enemyTruck.visible=false;
      this.modelsPromise=this.loadVehicles().catch(e=>{this.modelError=String(e);console.error('Vehicle model unavailable',e);const panel=document.getElementById('graphicsError');panel.querySelector('h3').textContent='车辆模型载入失败';panel.querySelector('p').textContent='请重新打开游戏后重试。';panel.classList.remove('hidden');});
      this.arc=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#ffe58a',dashSize:7,gapSize:4,transparent:true,opacity:1,depthTest:false,depthWrite:false}));this.arc.renderOrder=11;this.scene.add(this.arc);
      this.hitRing=new THREE.Mesh(new THREE.RingGeometry(5,7,32),new THREE.MeshBasicMaterial({color:'#ff514b',side:THREE.DoubleSide,transparent:true,opacity:.7,depthTest:false,depthWrite:false}));this.hitRing.rotation.x=-Math.PI/2;this.hitRing.renderOrder=12;this.scene.add(this.hitRing);
      const arrowShape=new THREE.Shape();for(const [i,[x,y]]of[[-3,12],[3,12],[3,1],[9,1],[0,-12],[-9,1],[-3,1]].entries()){if(i)arrowShape.lineTo(x,y);else arrowShape.moveTo(x,y);}arrowShape.closePath();
      this.landingArrow=new THREE.Mesh(new THREE.ShapeGeometry(arrowShape),new THREE.MeshBasicMaterial({color:'#ff3434',side:THREE.DoubleSide,depthTest:false,depthWrite:false}));this.landingArrow.name='artilleryLandingArrow';this.landingArrow.renderOrder=13;this.scene.add(this.landingArrow);
      const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(arrowShape.getPoints()),new THREE.LineBasicMaterial({color:'#ffe3d9',depthTest:false,depthWrite:false}));outline.renderOrder=14;this.landingArrow.add(outline);
      this.enemyMarker=new THREE.Group();const ring=new THREE.Mesh(new THREE.RingGeometry(10,11.2,32),new THREE.MeshBasicMaterial({color:'#ffad7f',side:THREE.DoubleSide,depthTest:false,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.renderOrder=10;this.enemyMarker.add(ring);const pin=new THREE.Mesh(new THREE.OctahedronGeometry(2.2),new THREE.MeshBasicMaterial({color:'#ffad7f',depthTest:false,depthWrite:false}));pin.position.y=21;pin.renderOrder=10;this.enemyMarker.add(pin);this.scene.add(this.enemyMarker);
      this.ready=true;this.resize();canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.ready=false;document.getElementById('graphicsError').classList.remove('hidden');});canvas.addEventListener('webglcontextrestored',()=>location.reload());
    }catch(e){console.error('3D renderer unavailable',e);document.getElementById('graphicsError').classList.remove('hidden');}
    window.addEventListener('resize',()=>this.resize());
  }
  async loadVehicles(){
    const loader=new GLTFLoader(),models=await Promise.all(['friendly','enemy'].map(k=>loader.loadAsync(`models/m1097_${k}.glb`)));
    for(let i=0;i<models.length;i++){
      const scene=models[i].scene,bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      scene.position.add(new THREE.Vector3(-center.x,-bounds.min.y,-center.z));const model=new THREE.Group();model.rotation.y=Math.PI/2;model.scale.setScalar(14/size.x);model.add(scene);
      const wheels=splitAvengerWheels(model),g=i===0?this.ownTruck:this.enemyTruck;this.disposeGroup(g);g.clear();g.add(model);g.userData={model:true,source:'M1097 Avenger',patches:2,wheels};
    }
    this.modelsReady=true;
  }
  createLandscape(){
    const geo=new THREE.PlaneGeometry(B.W+1000,B.H+1000,140,140);geo.rotateX(-Math.PI/2);geo.translate(B.W/2,0,B.H/2);const pos=geo.attributes.position,colors=[];
    const green=new THREE.Color('#82896a'),sand=new THREE.Color('#b6a784'),rock=new THREE.Color('#9b9581');
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),h=B.terrain(x,z);pos.setY(i,h);const color=green.clone().lerp(sand,Math.min(1,.18+.32*(Math.sin(x*.04+z*.014)+1))).lerp(rock,B.clamp((h-16)/35,0,.65));const jitter=.93+.07*Math.sin(x*2+z*1.3);colors.push(color.r*jitter,color.g*jitter,color.b*jitter);}
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();this.scene.add(new THREE.Mesh(geo,mat('#ffffff',{vertexColors:true})));
    this.road([[140,1850],[530,1360],[960,990],[620,510],[810,220],[1770,140]],9);this.road([[610,1910],[1440,1450],[1530,1070],[1390,690],[1840,370]],7);this.road([[620,510],[960,990],[1440,1450]],6);this.road([[530,1360],[960,990],[1390,690]],6);
    for(const b of B.BUILDINGS){const g=new THREE.Group();g.position.set(b.x,B.terrain(b.x,b.z),b.z);box(g,0,b.h/2,0,b.w,b.h,b.d,palette.sand);box(g,0,b.h+.4,0,b.w+1,.8,b.d+1,palette.roof);for(const x of[-b.w*.28,b.w*.28])for(const y of[3.8,7.3])if(y<b.h-1)box(g,x,y,-b.d/2-.03,2,1.7,.1,palette.glass);box(g,0,1.9,-b.d/2-.05,2.6,3.8,.12,palette.dark);this.scene.add(g);}
    let seed=7919;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};const treeCount=800,trees=new THREE.InstancedMesh(new THREE.ConeGeometry(4.6,14,6),mat('#4e6553'),treeCount),trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.4,.65,5,5),mat('#6d6351'),treeCount),dummy=new THREE.Object3D();
    for(let i=0;i<treeCount;i++){let x,z;do{x=-150+random()*(B.W+300);z=-150+random()*(B.H+300);}while(B.BUILDINGS.some(b=>Math.hypot(b.x-x,b.z-z)<35));const h=B.terrain(x,z),scale=.55+random()*.7;dummy.position.set(x,h+9*scale,z);dummy.scale.set(scale,scale,scale);dummy.rotation.y=random()*6;dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);dummy.position.y=h+2.5*scale;dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);}this.scene.add(trees,trunks);
    const ridgeMat=mat('#899c93');for(let i=0;i<24;i++){const angle=i/24*Math.PI*2,r=2300+random()*200,g=new THREE.Mesh(new THREE.ConeGeometry(150+random()*140,110+random()*150,6),ridgeMat);g.position.set(B.W/2+Math.sin(angle)*r,40,B.H/2+Math.cos(angle)*r);g.rotation.y=random()*3;this.scene.add(g);}
    const cloudMat=new THREE.MeshBasicMaterial({color:'#e5ece2',transparent:true,opacity:.32,depthWrite:false});for(let i=0;i<12;i++){const cloud=new THREE.Mesh(new THREE.SphereGeometry(1,12,6),cloudMat);cloud.position.set(-300+random()*(B.W+600),230+random()*100,-300+random()*(B.H+600));cloud.scale.set(110+random()*65,12+random()*8,40+random()*45);this.scene.add(cloud);}
    const boundary=[];for(const[x,z]of[[0,0],[B.W,0],[B.W,B.H],[0,B.H],[0,0]])boundary.push(new THREE.Vector3(x,B.terrain(x,z)+.8,z));const border=new THREE.Line(new THREE.BufferGeometry().setFromPoints(boundary),new THREE.LineDashedMaterial({color:'#dec693',dashSize:15,gapSize:12,transparent:true,opacity:.55}));border.computeLineDistances();this.scene.add(border);
    this.shadows=[];for(let i=0;i<2;i++){const shadow=new THREE.Mesh(new THREE.CircleGeometry(1,24),new THREE.MeshBasicMaterial({color:'#263a2a',transparent:true,opacity:.28,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.scale.set(8,14,1);this.scene.add(shadow);this.shadows.push(shadow);}
  }
  road(points,width){const vertices=[],marks=[];
    for(let j=0;j<points.length-1;j++){const[a,b]=[points[j],points[j+1]],len=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/len,nz=(b[0]-a[0])/len;for(let i=0;i<len;i+=12){const s=i/len,t=Math.min(1,(i+12)/len),q=(f,o)=>{const x=a[0]+(b[0]-a[0])*f+nx*o,z=a[1]+(b[1]-a[1])*f+nz*o;return[x,B.terrain(x,z)+.13,z];};vertices.push(...q(s,-width),...q(t,-width),...q(s,width),...q(t,-width),...q(t,width),...q(s,width));if(i%36<12)marks.push(...q(s,-.24),...q(t,-.24),...q(s,.24),...q(t,-.24),...q(t,.24),...q(s,.24));}}
    for(const[v,color]of[[vertices,'#5c625a'],[marks,'#bfc2aa']]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();this.scene.add(new THREE.Mesh(g,mat(color,{side:THREE.DoubleSide})));}
  }
  resize(){if(!this.ready)return;this.gl.setSize(innerWidth,innerHeight,false);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.mini.width=228;this.mini.height=228;}
  orient(g,s){g.position.set(s.x,s.y,s.z);g.rotation.set(s.pitch,-s.yaw,0,'YXZ');}
  updateTruck(g,p,selected,t){g.position.set(p.x,p.y,p.z);g.rotation.y=-p.yaw;if(g.userData.model){for(const w of g.userData.wheels)w.pivot.rotation.y=-(p.wheelTravel||0)/w.radius*w.axisSign;return;}const a=p.aim[selected];g.userData.turret.rotation.y=-(a.yaw-p.yaw);g.userData.arm.rotation.x=a.pitch;g.userData.mg.rotation.x=selected==='mg'?a.pitch:0;for(const w of g.userData.wheels)w.rotation.x=-(p.wheelTravel||0)/1.65;}
  draw(view,t,dt=.016){if(!this.ready)return;const demo=!view;
    const p=view?view.own:{x:195,y:B.terrain(195,935),z:935,yaw:.62,speed:0,aim:Object.fromEntries(Object.keys(B.C).map(k=>[k,{yaw:.62,pitch:.35}])),selected:'missile',pilot:null};
    this.updateTruck(this.ownTruck,p,p.selected,t);this.shadows[0].position.set(p.x,p.y+.15,p.z);this.shadows[0].rotation.z=p.yaw;
    const enemy=view&&view.enemy;this.enemyTruck.visible=!!enemy&&enemy.precise;this.enemyMarker.visible=!!enemy;
    if(enemy){this.enemyMarker.position.set(enemy.x,enemy.y+.8,enemy.z);this.enemyMarker.rotation.y=t*.8;this.enemyMarker.children[1].material.color.set(enemy.retained?'#b49c70':'#ffad7f');if(enemy.precise){this.updateTruck(this.enemyTruck,{...enemy,speed:0,aim:p.aim},'missile',t);this.shadows[1].position.set(enemy.x,enemy.y+.15,enemy.z);}}this.shadows[1].visible=!!enemy&&enemy.precise;
    const active=new Set();for(const s of view?view.shots:[]){active.add(s.id);let g=this.meshes.get(s.id);if(!g){g=aircraft(s.kind,!s.mine);this.meshes.set(s.id,g);this.scene.add(g);}this.orient(g,s);if(g.userData.prop)g.userData.prop.rotation.z=t*50;if(g.userData.flame)g.userData.flame.scale.y=.75+.25*Math.sin(t*70);}
    for(const[id,g]of this.meshes)if(!active.has(id)){this.scene.remove(g);this.disposeGroup(g);this.meshes.delete(id);}
    const trailIds=new Set();for(const tr of view?view.trails:[]){trailIds.add(tr.id);let line=this.trailMeshes.get(tr.id);if(!line){line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#ffffff',transparent:true,opacity:.72}));line.frustumCulled=false;this.scene.add(line);this.trailMeshes.set(tr.id,line);}line.geometry.dispose();line.geometry=new THREE.BufferGeometry().setFromPoints(tr.points.map(q=>new THREE.Vector3(q.x,q.y,q.z)));line.material.opacity=.66*Math.max(.12,1-tr.points[tr.points.length-1].age/8);}
    for(const[id,line]of this.trailMeshes)if(!trailIds.has(id)){this.scene.remove(line);line.geometry.dispose();line.material.dispose();this.trailMeshes.delete(id);}
    const effectIds=new Set();for(const e of view?view.effects:[]){effectIds.add(e.id);let g=this.effectMeshes.get(e.id);if(!g){if(e.kind==='crater'){g=new THREE.Mesh(new THREE.CircleGeometry(e.radius,16),new THREE.MeshBasicMaterial({color:'#4b473b',transparent:true,opacity:.4,depthWrite:false}));g.rotation.x=-Math.PI/2;}else g=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:e.kind==='spark'?'#fff4bf':'#ffc570',transparent:true,opacity:.8,depthWrite:false}));this.effectMeshes.set(e.id,g);this.scene.add(g);}g.position.set(e.x,e.y,e.z);if(e.kind!=='crater'){g.scale.setScalar(Math.max(.2,e.radius*(.2+e.age*.8)));g.material.opacity=Math.max(0,.7*(1-e.age/e.life));}}
    for(const[id,g]of this.effectMeshes)if(!effectIds.has(id)){this.scene.remove(g);g.geometry.dispose();g.material.dispose();this.effectMeshes.delete(id);}
    const pilot=view&&view.shots.find(s=>s.id===p.pilot&&s.mine);this.arc.visible=!demo&&!pilot&&p.selected==='artillery';this.hitRing.visible=this.arc.visible;this.landingArrow.visible=false;
    this.lastArc=this.arc.visible?B.ballistic(p):null;
    if(this.arc.visible){const arc=this.lastArc;this.arc.geometry.dispose();this.arc.geometry=new THREE.BufferGeometry().setFromPoints(arc.points.map(q=>new THREE.Vector3(q.x,q.y,q.z)));this.arc.computeLineDistances();this.hitRing.visible=!!arc.hit;if(arc.hit)this.hitRing.position.set(arc.hit.x,arc.hit.y+.35,arc.hit.z);}
    const desired=new THREE.Vector3(),target=new THREE.Vector3();let key;
    if(demo){desired.set(145+Math.sin(t*.07)*25,60,998);target.set(242,15,846);key='demo';this.camera.fov=55;}
    else if(pilot){const d=B.direction(pilot.yaw,pilot.pitch),back=pilot.kind==='uav'?28:20;desired.set(pilot.x-d.x*back,pilot.y-d.y*back+10,pilot.z-d.z*back);desired.y=Math.max(desired.y,B.terrain(desired.x,desired.z)+4);target.set(pilot.x+d.x*45,pilot.y+d.y*45-3,pilot.z+d.z*45);key='flight'+pilot.id;this.camera.fov=68;}
    else{const a=p.selected==='sam'?{yaw:p.yaw,pitch:B.DEFAULT_PITCH.sam}:p.aim[p.selected],d=B.direction(a.yaw,0),side=p.selected==='artillery'?10:0,basePitch=p.selected==='artillery'?B.artilleryParams(p).defaultPitch:B.DEFAULT_PITCH[p.selected];desired.set(p.x-d.x*38+Math.cos(a.yaw)*side,p.y+22,p.z-d.z*38+Math.sin(a.yaw)*side);target.set(p.x+d.x*48,p.y+7+Math.sin(a.pitch-basePitch)*110,p.z+d.z*48);key='truck';this.camera.fov=62;}
    if(key!==this.cameraKey){this.camera.position.copy(desired);this.look=target.clone();this.cameraKey=key;}else{this.camera.position.lerp(desired,1-Math.exp(-dt*11));this.look.lerp(target,1-Math.exp(-dt*13));}this.camera.lookAt(this.look);this.camera.updateProjectionMatrix();
    const landing=this.lastArc&&this.lastArc.hit;this.landingArrow.visible=!!landing;
    if(landing){const distance=this.camera.position.distanceTo(new THREE.Vector3(landing.x,landing.y,landing.z)),scale=B.clamp(distance*2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))/innerHeight*(28/24),.6,9);this.landingArrow.scale.setScalar(scale);this.landingArrow.position.set(landing.x,landing.y+scale*(15+Math.sin(t*3)*1.5),landing.z);this.landingArrow.quaternion.copy(this.camera.quaternion);}
    this.gl.render(this.scene,this.camera);
    if(view){this.drawMini(view);this.updateReticle(p,pilot);this.drawScope(p,this.lastArc);}
  }
  updateReticle(p,pilot){const a=pilot||p.aim[p.selected],d=B.direction(a.yaw,a.pitch),m=pilot||B.muzzle(p,p.selected),q=new THREE.Vector3(m.x+d.x*300,m.y+d.y*300,m.z+d.z*300).project(this.camera),el=document.getElementById('reticle');el.style.left=`${B.clamp((q.x*.5+.5)*100,5,95)}%`;el.style.top=`${B.clamp((-q.y*.5+.5)*100,15,72)}%`;
    el.classList.toggle('hidden',!pilot&&p.selected==='sam');
  }
  drawScope(p,arc){const panel=document.getElementById('ballisticPanel');panel.classList.toggle('hidden',!arc);if(!arc)return;panel.querySelector('span').textContent=p.artilleryMode==='direct'?'平射弹道':'曲射弹道';const canvas=document.getElementById('ballisticScope'),c=canvas.getContext('2d'),start=arc.points[0],range=B.dist(start,arc.points[arc.points.length-1])||1,maxY=Math.max(...arc.points.map(q=>q.y))-start.y+20;c.clearRect(0,0,240,116);c.strokeStyle='#739783';c.lineWidth=1;c.beginPath();c.moveTo(12,94);c.lineTo(228,94);c.stroke();c.strokeStyle='#c7ffd9';c.lineWidth=2;c.beginPath();arc.points.forEach((q,i)=>{const x=12+B.dist(start,q)/range*216,y=90-(q.y-start.y)/maxY*73;if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.stroke();c.font='16px monospace';c.fillStyle='#bdd5b7';c.fillText(arc.range===null?'OUT':`${arc.range.toFixed(0)} m / ${arc.time.toFixed(1)} s`,12,112);}
  drawMini(v){const c=this.miniCtx,w=228,h=228,sc=200/B.W,own=v.own;c.clearRect(0,0,w,h);c.save();c.fillStyle='rgba(13,30,28,.9)';c.fillRect(0,0,w,h);c.beginPath();c.rect(14,14,200,200);c.clip();const map=q=>({x:14+q.x*sc,y:14+q.z*sc});this.mapPoint=map;c.strokeStyle='#436052';c.lineWidth=1;
    for(let x=0;x<=B.W;x+=250){const a=map({x,z:0}),b=map({x,z:B.H});c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}for(let z=0;z<=B.H;z+=250){const a=map({x:0,z}),b=map({x:B.W,z});c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}
    c.strokeStyle='#8fe9ad77';for(const s of[own,...v.shots.filter(s=>s.mine&&['uav','missile'].includes(s.kind))]){const q=map(s);c.beginPath();c.arc(q.x,q.y,B.reconRange(s.kind)*sc,0,Math.PI*2);c.stroke();}
    for(const s of v.shots.filter(s=>s.mine&&s.kind==='uav'&&s.orbit)){const q=map(s.orbit);c.strokeStyle='#86d9ef';c.setLineDash([3,2]);c.beginPath();c.arc(q.x,q.y,s.orbit.radius*sc,0,Math.PI*2);c.stroke();c.setLineDash([]);}
    for(const b of B.BUILDINGS){const q=map(b);c.fillStyle='#8d927a';c.fillRect(q.x-b.w*sc/2,q.y-b.d*sc/2,b.w*sc,b.d*sc);}
    for(const clue of v.clues){const q=map(clue);c.fillStyle='rgba(229,179,99,.16)';c.beginPath();if(clue.kind==='probe')c.arc(q.x,q.y,clue.radius*sc,0,Math.PI*2);else{c.moveTo(q.x,q.y);c.arc(q.x,q.y,clue.radius*sc,clue.yaw-Math.PI/2-clue.spread,clue.yaw-Math.PI/2+clue.spread);c.closePath();}c.fill();}
    for(const tr of v.trails){c.strokeStyle=tr.mine?'#a9cdbd':'#e8d4b2';c.lineWidth=1;c.beginPath();tr.points.forEach((p,i)=>{const q=map(p);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});c.stroke();}
    if(v.enemy){const q=map(v.enemy);c.strokeStyle=v.enemy.retained?'#ae9978':'#ffb185';c.lineWidth=2;c.beginPath();c.arc(q.x,q.y,6,0,Math.PI*2);c.moveTo(q.x-9,q.y);c.lineTo(q.x+9,q.y);c.moveTo(q.x,q.y-9);c.lineTo(q.x,q.y+9);c.stroke();}
    for(const s of v.shots.filter(s=>s.kind!=='bullet')){const q=map(s);c.fillStyle=s.mine?'#d0ffe0':s.retained?'#ae9978':'#ffb185';c.beginPath();c.arc(q.x,q.y,s.kind==='uav'?3.5:2.5,0,7);c.fill();}
    if(this.lastArc&&this.lastArc.hit){const q=map(this.lastArc.hit);c.fillStyle='#ffdf62';c.strokeStyle='#142720';c.lineWidth=2;c.beginPath();c.arc(q.x,q.y,6,0,Math.PI*2);c.fill();c.stroke();c.strokeStyle='#ffe991';c.lineWidth=2;c.beginPath();c.moveTo(q.x-10,q.y);c.lineTo(q.x+10,q.y);c.moveTo(q.x,q.y-10);c.lineTo(q.x,q.y+10);c.stroke();this.miniImpact={x:q.x,y:q.y,range:this.lastArc.range};}else this.miniImpact=null;
    const q=map(own);c.save();c.translate(q.x,q.y);c.rotate(own.yaw);c.fillStyle='#d0ffe0';c.beginPath();c.moveTo(0,-8);c.lineTo(-5,6);c.lineTo(0,3);c.lineTo(5,6);c.closePath();c.fill();c.restore();c.restore();c.strokeStyle='#799185';c.lineWidth=2;c.strokeRect(13,13,202,202);c.font='13px monospace';c.fillStyle='#c6d8c7';c.textAlign='center';c.fillText('N',w/2,12);
  }
  disposeGroup(g){g.traverse(m=>{if(m.geometry)m.geometry.dispose();});}
  get stats(){return this.ready?{webgl:true,models:this.modelsReady,calls:this.gl.info.render.calls,triangles:this.gl.info.render.triangles}:{webgl:false};}
}
