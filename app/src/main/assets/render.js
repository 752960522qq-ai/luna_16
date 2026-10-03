import * as THREE from './three.module.js';
const B = window.Blindfire, FORWARD = new THREE.Vector3(0, 0, -1);
const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
const palette = { body: mat('#496153'), hostile: mat('#785049'), hostileAir: mat('#905b50'), trim: mat('#273b35'), dark: mat('#1b2729'), steel: mat('#7c8b82'), glass: mat('#14343e'), tire: mat('#202425'), white: mat('#edf1d9'), sand: mat('#c2bca0'), roof: mat('#8b8571'), flame: new THREE.MeshBasicMaterial({color:'#ffb461'}), bullet: new THREE.MeshBasicMaterial({color:'#ffeabd'}) };
function box(g,x,y,z,w,h,d,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);g.add(m);return m;}
function cylinder(g,x,y,z,top,bottom,h,material,sides=10){const m=new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,h,sides),material);m.position.set(x,y,z);g.add(m);return m;}
function truck(hostile=false){
  const g=new THREE.Group(),body=hostile?palette.hostile:palette.body;
  box(g,0,2.1,0,8.5,1.7,19,palette.dark);box(g,0,3.4,-5.8,8.7,3,6.6,body);box(g,0,5.6,-6.2,8.3,1.3,5.4,body);
  box(g,0,5.2,-9.56,6.7,1.6,.12,palette.glass);for(const x of[-4.38,4.38])box(g,x,5.2,-6.6,.12,1.5,2.7,palette.glass);
  box(g,0,2.65,-9.7,8.9,.5,.5,palette.steel);box(g,0,3.25,-9.68,4.8,.65,.14,palette.dark);for(const x of[-3.3,3.3])box(g,x,3.2,-9.77,1.15,.65,.14,palette.white);
  box(g,0,3.2,4,8,1,11,body);box(g,0,4.1,2,5.5,1,6,palette.trim);
  const turret=new THREE.Group();turret.position.set(0,4.7,1.5);g.add(turret);cylinder(turret,0,0,0,2.7,2.7,.9,palette.steel);
  const arm=new THREE.Group();arm.position.y=.7;turret.add(arm);box(arm,0,0,1,5.3,1,8,body);
  for(const x of[-1.5,1.5]){const tube=cylinder(arm,x,.9,0,.8,.8,10,palette.trim);tube.rotation.x=Math.PI/2;box(arm,x,.9,-5.1,1.4,1.4,.15,palette.dark);}
  const gun=cylinder(arm,0,1.4,-5,.37,.48,8,palette.steel);gun.rotation.x=Math.PI/2;
  const mg=new THREE.Group();mg.position.set(3,1.2,0);turret.add(mg);box(mg,0,0,-1,.6,.6,4,palette.dark);box(mg,0,-.6,.1,1,.8,1,body);
  const wheels=[];for(const x of[-4.2,4.2])for(const z of[-6,-2,3,7]){const wheel=cylinder(g,x,1.45,z,1.65,1.65,1.1,palette.tire,12);wheel.rotation.z=Math.PI/2;wheels.push(wheel);const hub=cylinder(g,x+Math.sign(x)*.6,1.45,z,.8,.8,.12,palette.steel);hub.rotation.z=Math.PI/2;}
  const antenna=cylinder(g,-3,7,3,.035,.035,5,palette.dark,4);antenna.rotation.z=-.06;for(const x of[-4.48,4.48])box(g,x,3.1,6,.15,1.3,3,palette.steel);
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
    this.canvas=canvas;this.mini=mini;this.miniCtx=mini.getContext('2d');this.meshes=new Map();this.trailMeshes=new Map();this.effectMeshes=new Map();this.ready=false;this.cameraKey=null;
    try{
      this.gl=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',alpha:false});this.gl.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));this.gl.outputColorSpace=THREE.SRGBColorSpace;
      this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#b8cbd0');this.scene.fog=new THREE.Fog('#b8c5ba',230,1450);this.camera=new THREE.PerspectiveCamera(62,1,.35,2500);
      this.scene.add(new THREE.HemisphereLight('#ddeef1','#484535',2.1));const sun=new THREE.DirectionalLight('#fff0d2',2.3);sun.position.set(-240,520,-250);this.scene.add(sun);
      this.createLandscape();this.ownTruck=truck();this.enemyTruck=truck(true);this.scene.add(this.ownTruck,this.enemyTruck);this.enemyTruck.visible=false;
      this.arc=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#d3ffe6',dashSize:7,gapSize:4,transparent:true,opacity:.9}));this.scene.add(this.arc);
      this.hitRing=new THREE.Mesh(new THREE.RingGeometry(6,7.5,32),new THREE.MeshBasicMaterial({color:'#d3ffe6',side:THREE.DoubleSide,transparent:true,opacity:.9}));this.hitRing.rotation.x=-Math.PI/2;this.scene.add(this.hitRing);
      this.enemyMarker=new THREE.Group();const ring=new THREE.Mesh(new THREE.RingGeometry(10,11.2,32),new THREE.MeshBasicMaterial({color:'#ffad7f',side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;this.enemyMarker.add(ring);const pin=new THREE.Mesh(new THREE.OctahedronGeometry(2.2),new THREE.MeshBasicMaterial({color:'#ffad7f'}));pin.position.y=21;this.enemyMarker.add(pin);this.scene.add(this.enemyMarker);
      this.ready=true;this.resize();canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.ready=false;document.getElementById('graphicsError').classList.remove('hidden');});canvas.addEventListener('webglcontextrestored',()=>location.reload());
    }catch(e){console.error('3D renderer unavailable',e);document.getElementById('graphicsError').classList.remove('hidden');}
    window.addEventListener('resize',()=>this.resize());
  }
  createLandscape(){
    const geo=new THREE.PlaneGeometry(1800,2200,100,125);geo.rotateX(-Math.PI/2);geo.translate(400,0,600);const pos=geo.attributes.position,colors=[];
    const green=new THREE.Color('#82896a'),sand=new THREE.Color('#b6a784'),rock=new THREE.Color('#9b9581');
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),h=B.terrain(x,z);pos.setY(i,h);const color=green.clone().lerp(sand,Math.min(1,.18+.32*(Math.sin(x*.04+z*.014)+1))).lerp(rock,B.clamp((h-16)/35,0,.65));const jitter=.93+.07*Math.sin(x*2+z*1.3);colors.push(color.r*jitter,color.g*jitter,color.b*jitter);}
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();this.scene.add(new THREE.Mesh(geo,mat('#ffffff',{vertexColors:true})));
    this.road([[95,1050],[250,890],[370,625],[265,470],[370,265],[665,130]],9);this.road([[230,1130],[370,960],[575,745],[595,530],[725,420]],7);this.road([[265,475],[395,565],[575,745]],6);
    for(const b of B.BUILDINGS){const g=new THREE.Group();g.position.set(b.x,B.terrain(b.x,b.z),b.z);box(g,0,b.h/2,0,b.w,b.h,b.d,palette.sand);box(g,0,b.h+.4,0,b.w+1,.8,b.d+1,palette.roof);for(const x of[-b.w*.28,b.w*.28])for(const y of[3.8,7.3])if(y<b.h-1)box(g,x,y,-b.d/2-.03,2,1.7,.1,palette.glass);box(g,0,1.9,-b.d/2-.05,2.6,3.8,.12,palette.dark);this.scene.add(g);}
    let seed=7919;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};const treeCount=230,trees=new THREE.InstancedMesh(new THREE.ConeGeometry(4.6,14,6),mat('#4e6553'),treeCount),trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.4,.65,5,5),mat('#6d6351'),treeCount),dummy=new THREE.Object3D();
    for(let i=0;i<treeCount;i++){let x,z;do{x=-120+random()*1070;z=-80+random()*1360;}while(B.BUILDINGS.some(b=>Math.hypot(b.x-x,b.z-z)<35));const h=B.terrain(x,z),scale=.55+random()*.7;dummy.position.set(x,h+9*scale,z);dummy.scale.set(scale,scale,scale);dummy.rotation.y=random()*6;dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);dummy.position.y=h+2.5*scale;dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);}this.scene.add(trees,trunks);
    const ridgeMat=mat('#899c93');for(let i=0;i<24;i++){const angle=i/24*Math.PI*2,r=1150+random()*150,g=new THREE.Mesh(new THREE.ConeGeometry(150+random()*140,110+random()*150,6),ridgeMat);g.position.set(400+Math.sin(angle)*r,40,600+Math.cos(angle)*r);g.rotation.y=random()*3;this.scene.add(g);}
    const cloudMat=new THREE.MeshBasicMaterial({color:'#e5ece2',transparent:true,opacity:.32,depthWrite:false});for(let i=0;i<8;i++){const cloud=new THREE.Mesh(new THREE.SphereGeometry(1,12,6),cloudMat);cloud.position.set(-450+random()*1900,230+random()*100,-450+random()*2100);cloud.scale.set(110+random()*65,12+random()*8,40+random()*45);this.scene.add(cloud);}
    const boundary=[];for(const[x,z]of[[0,0],[B.W,0],[B.W,B.H],[0,B.H],[0,0]])boundary.push(new THREE.Vector3(x,B.terrain(x,z)+.8,z));const border=new THREE.Line(new THREE.BufferGeometry().setFromPoints(boundary),new THREE.LineDashedMaterial({color:'#dec693',dashSize:15,gapSize:12,transparent:true,opacity:.55}));border.computeLineDistances();this.scene.add(border);
    this.shadows=[];for(let i=0;i<2;i++){const shadow=new THREE.Mesh(new THREE.CircleGeometry(1,24),new THREE.MeshBasicMaterial({color:'#263a2a',transparent:true,opacity:.28,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.scale.set(8,14,1);this.scene.add(shadow);this.shadows.push(shadow);}
  }
  road(points,width){const vertices=[],marks=[];
    for(let j=0;j<points.length-1;j++){const[a,b]=[points[j],points[j+1]],len=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/len,nz=(b[0]-a[0])/len;for(let i=0;i<len;i+=12){const s=i/len,t=Math.min(1,(i+12)/len),q=(f,o)=>{const x=a[0]+(b[0]-a[0])*f+nx*o,z=a[1]+(b[1]-a[1])*f+nz*o;return[x,B.terrain(x,z)+.13,z];};vertices.push(...q(s,-width),...q(t,-width),...q(s,width),...q(t,-width),...q(t,width),...q(s,width));if(i%36<12)marks.push(...q(s,-.24),...q(t,-.24),...q(s,.24),...q(t,-.24),...q(t,.24),...q(s,.24));}}
    for(const[v,color]of[[vertices,'#5c625a'],[marks,'#bfc2aa']]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();this.scene.add(new THREE.Mesh(g,mat(color,{side:THREE.DoubleSide})));}
  }
  resize(){if(!this.ready)return;this.gl.setSize(innerWidth,innerHeight,false);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.mini.width=228;this.mini.height=228;}
  orient(g,s){g.position.set(s.x,s.y,s.z);g.rotation.set(s.pitch,-s.yaw,0,'YXZ');}
  updateTruck(g,p,selected,t){g.position.set(p.x,p.y,p.z);g.rotation.y=-p.yaw;const a=p.aim[selected];g.userData.turret.rotation.y=-(a.yaw-p.yaw);g.userData.arm.rotation.x=a.pitch;g.userData.mg.rotation.x=selected==='mg'?a.pitch:0;for(const w of g.userData.wheels)w.rotation.x=t*p.speed/1.65;}
  draw(view,t,dt=.016){if(!this.ready)return;const demo=!view;
    const p=view?view.own:{x:195,y:B.terrain(195,935),z:935,yaw:.62,speed:0,aim:Object.fromEntries(Object.keys(B.C).map(k=>[k,{yaw:.62,pitch:.35}])),selected:'missile',pilot:null};
    this.updateTruck(this.ownTruck,p,p.selected,t);this.shadows[0].position.set(p.x,p.y+.15,p.z);this.shadows[0].rotation.z=p.yaw;
    const enemy=view&&view.enemy;this.enemyTruck.visible=!!enemy&&enemy.precise;this.enemyMarker.visible=!!enemy;
    if(enemy){this.enemyMarker.position.set(enemy.x,enemy.y+.8,enemy.z);this.enemyMarker.rotation.y=t*.8;this.enemyMarker.children[1].material.color.set(enemy.precise?'#ffad7f':'#b49c70');if(enemy.precise){this.updateTruck(this.enemyTruck,{...enemy,speed:0,aim:p.aim},'missile',t);this.shadows[1].position.set(enemy.x,enemy.y+.15,enemy.z);}}this.shadows[1].visible=!!enemy&&enemy.precise;
    const active=new Set();for(const s of view?view.shots:[]){active.add(s.id);let g=this.meshes.get(s.id);if(!g){g=aircraft(s.kind,!s.mine);this.meshes.set(s.id,g);this.scene.add(g);}this.orient(g,s);if(g.userData.prop)g.userData.prop.rotation.z=t*50;if(g.userData.flame)g.userData.flame.scale.y=.75+.25*Math.sin(t*70);}
    for(const[id,g]of this.meshes)if(!active.has(id)){this.scene.remove(g);this.disposeGroup(g);this.meshes.delete(id);}
    const trailIds=new Set();for(const tr of view?view.trails:[]){trailIds.add(tr.id);let line=this.trailMeshes.get(tr.id);if(!line){line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#ffffff',transparent:true,opacity:.72}));line.frustumCulled=false;this.scene.add(line);this.trailMeshes.set(tr.id,line);}line.geometry.dispose();line.geometry=new THREE.BufferGeometry().setFromPoints(tr.points.map(q=>new THREE.Vector3(q.x,q.y,q.z)));line.material.opacity=.66*Math.max(.12,1-tr.points[tr.points.length-1].age/8);}
    for(const[id,line]of this.trailMeshes)if(!trailIds.has(id)){this.scene.remove(line);line.geometry.dispose();line.material.dispose();this.trailMeshes.delete(id);}
    const effectIds=new Set();for(const e of view?view.effects:[]){effectIds.add(e.id);let g=this.effectMeshes.get(e.id);if(!g){if(e.kind==='crater'){g=new THREE.Mesh(new THREE.CircleGeometry(e.radius,16),new THREE.MeshBasicMaterial({color:'#4b473b',transparent:true,opacity:.4,depthWrite:false}));g.rotation.x=-Math.PI/2;}else g=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:e.kind==='spark'?'#fff4bf':'#ffc570',transparent:true,opacity:.8,depthWrite:false}));this.effectMeshes.set(e.id,g);this.scene.add(g);}g.position.set(e.x,e.y,e.z);if(e.kind!=='crater'){g.scale.setScalar(Math.max(.2,e.radius*(.2+e.age*.8)));g.material.opacity=Math.max(0,.7*(1-e.age/e.life));}}
    for(const[id,g]of this.effectMeshes)if(!effectIds.has(id)){this.scene.remove(g);g.geometry.dispose();g.material.dispose();this.effectMeshes.delete(id);}
    const pilot=view&&view.shots.find(s=>s.id===p.pilot&&s.mine);this.arc.visible=!demo&&!pilot&&p.selected==='artillery';this.hitRing.visible=this.arc.visible;
    if(this.arc.visible){const arc=B.ballistic(p);this.arc.geometry.dispose();this.arc.geometry=new THREE.BufferGeometry().setFromPoints(arc.points.map(q=>new THREE.Vector3(q.x,q.y,q.z)));this.arc.computeLineDistances();this.hitRing.visible=!!arc.hit;if(arc.hit)this.hitRing.position.set(arc.hit.x,arc.hit.y+.35,arc.hit.z);}
    const desired=new THREE.Vector3(),target=new THREE.Vector3();let key;
    if(demo){desired.set(145+Math.sin(t*.07)*25,60,998);target.set(242,15,846);key='demo';this.camera.fov=55;}
    else if(pilot){const d=B.direction(pilot.yaw,pilot.pitch),back=pilot.kind==='uav'?28:20;desired.set(pilot.x-d.x*back,pilot.y-d.y*back+10,pilot.z-d.z*back);desired.y=Math.max(desired.y,B.terrain(desired.x,desired.z)+4);target.set(pilot.x+d.x*45,pilot.y+d.y*45-3,pilot.z+d.z*45);key='flight'+pilot.id;this.camera.fov=68;}
    else{const a=p.aim[p.selected],d=B.direction(a.yaw,0),side=p.selected==='artillery'?10:0;desired.set(p.x-d.x*48+Math.cos(a.yaw)*side,p.y+29,p.z-d.z*48+Math.sin(a.yaw)*side);target.set(p.x+d.x*48,p.y+7+Math.sin(a.pitch-B.DEFAULT_PITCH[p.selected])*110,p.z+d.z*48);key='truck';this.camera.fov=62;}
    if(key!==this.cameraKey){this.camera.position.copy(desired);this.look=target.clone();this.cameraKey=key;}else{this.camera.position.lerp(desired,1-Math.exp(-dt*11));this.look.lerp(target,1-Math.exp(-dt*13));}this.camera.lookAt(this.look);this.camera.updateProjectionMatrix();this.gl.render(this.scene,this.camera);
    if(view){this.drawMini(view);this.updateReticle(p,pilot);this.drawScope(p,!pilot&&p.selected==='artillery');}
  }
  updateReticle(p,pilot){const a=pilot||p.aim[p.selected],d=B.direction(a.yaw,a.pitch),m=pilot||B.muzzle(p,p.selected),q=new THREE.Vector3(m.x+d.x*300,m.y+d.y*300,m.z+d.z*300).project(this.camera),el=document.getElementById('reticle');el.style.left=`${B.clamp((q.x*.5+.5)*100,5,95)}%`;el.style.top=`${B.clamp((-q.y*.5+.5)*100,15,72)}%`;
    if(p.selected==='artillery'&&!pilot&&this.hitRing.visible){const v=this.hitRing.position.clone().project(this.camera),impact=document.getElementById('impactLabel'),x=(v.x*.5+.5)*innerWidth,y=(-v.y*.5+.5)*innerHeight,r=document.getElementById('ballisticPanel').getBoundingClientRect();const covered=x>r.left-45&&x<r.right+45&&y+14>r.top&&y<r.bottom;impact.classList.toggle('hidden',covered||v.z>1||Math.abs(v.x)>1||Math.abs(v.y)>1);impact.style.left=`${(v.x*.5+.5)*100}%`;impact.style.top=`${(-v.y*.5+.5)*100}%`;}else document.getElementById('impactLabel').classList.add('hidden');
  }
  drawScope(p,visible){const panel=document.getElementById('ballisticPanel');panel.classList.toggle('hidden',!visible);if(!visible)return;const canvas=document.getElementById('ballisticScope'),c=canvas.getContext('2d'),arc=B.ballistic(p),start=arc.points[0],range=B.dist(start,arc.points[arc.points.length-1])||1,maxY=Math.max(...arc.points.map(q=>q.y))-start.y+20;c.clearRect(0,0,240,116);c.strokeStyle='#739783';c.lineWidth=1;c.beginPath();c.moveTo(12,94);c.lineTo(228,94);c.stroke();c.strokeStyle='#c7ffd9';c.lineWidth=2;c.beginPath();arc.points.forEach((q,i)=>{const x=12+B.dist(start,q)/range*216,y=90-(q.y-start.y)/maxY*73;if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.stroke();c.font='16px monospace';c.fillStyle='#bdd5b7';c.fillText(arc.range===null?'OUT':`${arc.range.toFixed(0)} m / ${arc.time.toFixed(1)} s`,12,112);}
  drawMini(v){const c=this.miniCtx,w=228,h=228,sc=.15,own=v.own;c.clearRect(0,0,w,h);c.save();c.beginPath();c.arc(w/2,h/2,w/2-3,0,Math.PI*2);c.clip();c.fillStyle='rgba(13,30,28,.9)';c.fillRect(0,0,w,h);const map=q=>({x:w/2+(q.x-own.x)*sc,y:h/2+(q.z-own.z)*sc});c.strokeStyle='#436052';c.lineWidth=1;
    for(let x=0;x<=B.W;x+=100){const a=map({x,z:0}),b=map({x,z:B.H});c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}for(let z=0;z<=B.H;z+=100){const a=map({x:0,z}),b=map({x:B.W,z});c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}
    for(const b of B.BUILDINGS){const q=map(b);c.fillStyle='#8d927a';c.fillRect(q.x-b.w*sc/2,q.y-b.d*sc/2,b.w*sc,b.d*sc);}
    for(const clue of v.clues){const q=map(clue);c.fillStyle='rgba(229,179,99,.16)';c.beginPath();if(clue.kind==='probe')c.arc(q.x,q.y,clue.radius*sc,0,Math.PI*2);else{c.moveTo(q.x,q.y);c.arc(q.x,q.y,clue.radius*sc,clue.yaw-Math.PI/2-clue.spread,clue.yaw-Math.PI/2+clue.spread);c.closePath();}c.fill();}
    for(const tr of v.trails){c.strokeStyle=tr.mine?'#a9cdbd':'#e8d4b2';c.lineWidth=1;c.beginPath();tr.points.forEach((p,i)=>{const q=map(p);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});c.stroke();}
    if(v.enemy){const q=map(v.enemy);c.strokeStyle=v.enemy.precise?'#ffb185':'#ae9978';c.lineWidth=2;c.beginPath();c.arc(q.x,q.y,v.enemy.precise?6:13,0,Math.PI*2);c.moveTo(q.x-9,q.y);c.lineTo(q.x+9,q.y);c.moveTo(q.x,q.y-9);c.lineTo(q.x,q.y+9);c.stroke();}
    c.save();c.translate(w/2,h/2);c.rotate(own.yaw);c.fillStyle='#d0ffe0';c.beginPath();c.moveTo(0,-9);c.lineTo(-6,7);c.lineTo(0,4);c.lineTo(6,7);c.closePath();c.fill();c.restore();const pilot=v.shots.find(s=>s.id===own.pilot);if(pilot){const q=map(pilot);c.fillStyle='#d0ffe0';c.beginPath();c.arc(q.x,q.y,3,0,7);c.fill();}c.restore();c.strokeStyle='#799185';c.lineWidth=2;c.beginPath();c.arc(w/2,h/2,w/2-2,0,7);c.stroke();c.font='18px monospace';c.fillStyle='#c6d8c7';c.textAlign='center';c.fillText('N',w/2,22);
  }
  disposeGroup(g){g.traverse(m=>{if(m.geometry)m.geometry.dispose();});}
  get stats(){return this.ready?{webgl:true,calls:this.gl.info.render.calls,triangles:this.gl.info.render.triangles}:{webgl:false};}
}
