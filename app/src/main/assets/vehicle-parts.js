import * as THREE from './three.module.js';
import {mergeGeometries} from './BufferGeometryUtils.js';
// Keep complete connected pieces, UVs, normals and materials when adding articulation.
export function components(mesh){
 const geo=mesh.geometry,pos=geo.attributes.position,ix=geo.index,par=Array.from({length:pos.count},(_,i)=>i),weld=new Map();
 const find=i=>{while(par[i]!==i){par[i]=par[par[i]];i=par[i];}return i;},join=(a,b)=>{par[find(b)]=find(a);};
 for(let i=0;i<pos.count;i++){const k=[pos.getX(i),pos.getY(i),pos.getZ(i)].map(n=>Math.round(n*10000)).join(',');if(weld.has(k))join(i,weld.get(k));else weld.set(k,i);}
 for(let i=0;i<ix.count;i+=3){join(ix.getX(i),ix.getX(i+1));join(ix.getX(i),ix.getX(i+2));}
 const cs=new Map();for(let i=0;i<pos.count;i++){const k=find(i);if(!cs.has(k))cs.set(k,{box:new THREE.Box3(),indices:[]});cs.get(k).box.expandByPoint(new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i)));}
 for(let i=0;i<ix.count;i++)cs.get(find(ix.getX(i))).indices.push(ix.getX(i));return [...cs.values()];
}
// Decode normalized integer attributes before applying model-space transforms.
// Writing metre coordinates back into quantized Int16 positions corrupts the mesh.
export function floatGeometry(geo){return geometry(geo,geo.index?Array.from(geo.index.array):Array.from({length:geo.attributes.position.count},(_,i)=>i));}
export function geometry(geo,indices,center=new THREE.Vector3()){
 const ids=[...new Set(indices)],map=new Map(ids.map((id,i)=>[id,i])),out=new THREE.BufferGeometry();
 for(const[name,a]of Object.entries(geo.attributes)){const v=new Float32Array(ids.length*a.itemSize);for(let i=0;i<ids.length;i++)for(let k=0;k<a.itemSize;k++)v[i*a.itemSize+k]=a.getComponent(ids[i],k)-(name==='position'?center.getComponent(k):0);out.setAttribute(name,new THREE.BufferAttribute(v,a.itemSize));}
 out.setIndex(indices.map(i=>map.get(i)));out.computeBoundingSphere();return out;
}
export function articulateBear(scene,scale){
 const raw=scene.getObjectByName('Object_11').parent,turret=new THREE.Group();turret.name='bearTurret';turret.position.set(0,-1,1.1);raw.add(turret);
 for(const n of ['Object_7','Object_9','Object_10']){const mesh=scene.getObjectByName(n);turret.attach(mesh);}
 const barrel=scene.getObjectByName('Object_11'),pitch=new THREE.Group();pitch.name='bearBarrelPitch';pitch.position.set(0,1.5,.6);turret.add(pitch);pitch.attach(barrel);
 const wheels=[];
 for(const name of ['Object_13','Object_14']){
  const mesh=scene.getObjectByName(name),geo=mesh.geometry,body=[];
  for(const c of components(mesh)){
   const size=c.box.getSize(new THREE.Vector3()),center=c.box.getCenter(new THREE.Vector3());
   if(size.y>.18&&size.y<1&&size.z>.18&&size.z<1&&Math.abs(center.x)>1&&center.z<.45){
    const pivot=new THREE.Group();pivot.position.copy(center);pivot.name='bearRollingWheel';
    pivot.add(new THREE.Mesh(geometry(geo,c.indices,center),mesh.material));mesh.parent.add(pivot);wheels.push({pivot,radius:Math.max(size.y,size.z)*scale/2,axis:'x',axisSign:1});
   }else body.push(...c.indices);
  }
  mesh.geometry=geometry(geo,body);geo.dispose();
 }
 const original=scene.getObjectByName('Object_12'),track=new THREE.InstancedMesh(new THREE.BoxGeometry(.43,.15,.09),original.material,192);track.name='bearAnimatedTreadLinks';original.parent.add(track);original.visible=false;track.frustumCulled=false;
 const tracks={mesh:track,scale,count:96};rollTracks(tracks,0);
 return {turret,barrel:pitch,wheels,tracks};
}
export function rollTracks(track,travel){
 if(track.lastTravel===travel)return;track.lastTravel=travel;
 // Separate rigid tread pads circulate around both closed belts without stretching vertices.
 const L=5.29,R=.59,cy=-.53,cz=-.165,per=2*L+2*Math.PI*R,dummy=new THREE.Object3D();
 for(let side=0;side<2;side++)for(let i=0;i<track.count;i++){
  const s=((i/track.count*per-travel/track.scale)%per+per)%per;let y,z,a;
  if(s<L){y=s-L/2;z=R;a=0;}
  else if(s<L+Math.PI*R){a=-(s-L)/R;y=L/2-R*Math.sin(a);z=R*Math.cos(a);}
  else if(s<2*L+Math.PI*R){a=-Math.PI;y=L/2-(s-L-Math.PI*R);z=-R;}
  else{const q=(s-2*L-Math.PI*R)/R;a=-Math.PI-q;y=-L/2-R*Math.sin(q);z=-R*Math.cos(q);}
  dummy.position.set(side?1.53:-1.50,y+cy,z+cz);dummy.rotation.set(a,0,0);dummy.updateMatrix();track.mesh.setMatrixAt(side*track.count+i,dummy.matrix);
 }
 track.mesh.instanceMatrix.needsUpdate=true;
}
export function articulateAvenger(model){
 const source=model.getObjectByName('mesh_331_mat_70_0'),geo=source.geometry,parts=components(source),upper=parts.filter(c=>c.box.min.z>390&&c.box.max.x<120),ids=new Set(upper),body=parts.filter(c=>!ids.has(c)).flatMap(c=>c.indices);
 if(!upper.length)return null;
 const center=new THREE.Vector3(-160,0,430),pivot=new THREE.Group();pivot.name='avengerLauncherYaw';pivot.position.copy(center);source.parent.add(pivot);
 pivot.add(new THREE.Mesh(geometry(geo,upper.flatMap(c=>c.indices),center),source.material));source.geometry=geometry(geo,body);geo.dispose();return pivot;
}

// Moving original tread links keeps their shape, UVs and texture intact.
function beltPath(z0,z1,cy,r){const L=z1-z0,per=2*L+2*Math.PI*r;return {per,path:(s,out={})=>{s=(s%per+per)%per;if(s<L){out.y=cy-r;out.z=z0+s;out.a=0;}else if(s<L+Math.PI*r){const q=(s-L)/r;out.y=cy-r*Math.cos(q);out.z=z1+r*Math.sin(q);out.a=-q;}else if(s<2*L+Math.PI*r){out.y=cy+r;out.z=z1-(s-L-Math.PI*r);out.a=-Math.PI;}else{const q=(s-2*L-Math.PI*r)/r;out.y=cy+r*Math.cos(q);out.z=z0-r*Math.sin(q);out.a=-Math.PI-q;}return out;}};}

function makeBelt(scene,entries){
 const bounds=new THREE.Box3();for(const e of entries){e.geo.computeBoundingBox();bounds.union(e.geo.boundingBox);}
 const cy=(bounds.min.y+bounds.max.y)/2,r=(bounds.max.y-bounds.min.y)/2,z0=bounds.min.z+r,z1=bounds.max.z-r,L=z1-z0,{path,per}=beltPath(z0,z1,cy,r),batches=new Map();
 for(const e of entries){const {y,z}=e.center;e.s=z>=z0&&z<=z1?(y<cy?z-z0:L+Math.PI*r+z1-z):z>z1?L+r*Math.atan2(z-z1,cy-y):2*L+Math.PI*r+r*Math.atan2(z0-z,y-cy);e.initial=path(e.s);if(!batches.has(e.material))batches.set(e.material,[]);batches.get(e.material).push(e);}
 const belts=[];for(const [material,es]of batches){let offset=0;for(const e of es){e.offset=offset;e.count=e.geo.attributes.position.count;offset+=e.count;}const merged=mergeGeometries(es.map(e=>e.geo)),mesh=new THREE.Mesh(merged,material);mesh.name='movingOriginalTreads';mesh.frustumCulled=false;scene.add(mesh);belts.push({side:bounds.getCenter(new THREE.Vector3()).x<0?'left':'right',mesh,entries:es,path,rest:merged.attributes.position.array.slice(),normals:merged.attributes.normal?.array.slice()});}
 return belts;
}
export function animateBelts(scene,groups){
 scene.updateMatrixWorld(true);const inverse=scene.matrixWorld.clone().invert(),belts=[];
 for(const group of groups){if(!group)throw Error('Track group missing');const entries=[];group.traverse(mesh=>{if(!mesh.isMesh)return;const geo=floatGeometry(mesh.geometry).applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));geo.computeBoundingBox();entries.push({geo,center:geo.boundingBox.getCenter(new THREE.Vector3()),material:mesh.material});mesh.visible=false;});belts.push(...makeBelt(scene,entries));}
 return {belts};
}
export function rollBelts(tracks,travel){
 for(const belt of tracks.belts){const current=(typeof travel==='object'?travel[belt.side]:travel);if(belt.lastTravel===current)continue;belt.lastTravel=current;if(belt.gpu){belt.uniform.value=(typeof travel==='object'?travel[belt.side]:travel)*(belt.travelSign||1);continue;}const pos=belt.mesh.geometry.attributes.position,normal=belt.mesh.geometry.attributes.normal;for(const e of belt.entries){const q=belt.path(e.s-(typeof travel==='object'?travel[belt.side]:travel)),angle=q.a-e.initial.a,c=Math.cos(angle),s=Math.sin(angle),dy=q.y-e.initial.y,dz=q.z-e.initial.z;for(let i=e.offset;i<e.offset+e.count;i++){const k=i*3,x=belt.rest[k],y=belt.rest[k+1]-e.center.y,z=belt.rest[k+2]-e.center.z;pos.setXYZ(i,x,e.center.y+dy+c*y-s*z,e.center.z+dz+s*y+c*z);if(normal){const ny=belt.normals[k+1],nz=belt.normals[k+2];normal.setXYZ(i,belt.normals[k],c*ny-s*nz,s*ny+c*nz);}}}pos.needsUpdate=true;if(normal)normal.needsUpdate=true;}
}
export function articulateKFZ(scene){
 scene.updateMatrixWorld(true);const inverse=scene.matrixWorld.clone().invert(),wheels=[];
 for(const suffix of ['', '1'])for(const base of ['polySurface610','polySurface95','pCylinder12','pCylinder13','pCylinder14','pCylinder15','pCylinder1','pCylinder2']){const child=scene.getObjectByName(base+suffix);if(!child)throw Error('KFZ wheel missing: '+base+suffix);const bounds=new THREE.Box3().setFromObject(child),c=bounds.getCenter(new THREE.Vector3()).applyMatrix4(inverse),size=bounds.getSize(new THREE.Vector3()),pivot=new THREE.Group();pivot.position.copy(c);pivot.name='kfzRollingWheel';scene.add(pivot);scene.updateMatrixWorld(true);pivot.attach(child);wheels.push({pivot,side:c.x<0?'left':'right',radius:Math.max(size.y,size.z)/2,axis:'x',axisSign:1});}
 // Each original rigid link shares a phase across its material pieces. No CPU vertex deformation.
 scene.updateMatrixWorld(true);const belts=[];
 for(const name of ['L_Track_GP','R_Track_GP']){const group=scene.getObjectByName(name),entries=[];
  for(const link of group.children){const meshes=[];link.traverse(o=>{if(o.isMesh)meshes.push(o);});const bounds=new THREE.Box3();const parts=meshes.map(mesh=>{const geo=floatGeometry(mesh.geometry).applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));geo.computeBoundingBox();bounds.union(geo.boundingBox);return {geo,material:mesh.material};});const center=bounds.getCenter(new THREE.Vector3());let yy=0,zz=0,yz=0;for(const part of parts){const p=part.geo.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i)-center.y,z=p.getZ(i)-center.z;yy+=y*y;zz+=z*z;yz+=y*z;}}const restAngle=.5*Math.atan2(-2*yz,zz-yy);for(const part of parts)entries.push({...part,center,restAngle});}
  group.visible=false;const bs=gpuRigidBelts(scene,entries,true);for(const b of bs)b.travelSign=-1;belts.push(...bs);
 }
 return {wheels,tracks:{belts}};
}
export function articulateTank(raw){
 if(raw.userData.blindfireRig==='grey-panzer-ii-f-v1')return articulateGreyTank(raw);
 raw.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(raw),size=bb.getSize(new THREE.Vector3()),c=bb.getCenter(new THREE.Vector3());
 // The radio antenna is above the specified body height; retain it without shrinking the hull.
 const transform=new THREE.Matrix4().makeScale(2.28/size.x,2.02/(2797.44873046875-bb.min.y),4.81/size.z).multiply(new THREE.Matrix4().makeTranslation(-c.x,-bb.min.y,-c.z));
 const scene=new THREE.Group(),meshes=[];raw.traverse(o=>{if(o.isMesh)meshes.push(o);});
 const turret=new THREE.Group();turret.position.set(.16,1.43,.35);turret.name='tankTurret';scene.add(turret);const barrel=new THREE.Group();barrel.position.set(-.02,.22,.68);barrel.name='tankBarrel';turret.add(barrel);scene.updateMatrixWorld(true);
 const wheels=new Map(),trackSources=[],batches=new Map();const collect=(parent,geo,material)=>{if(!batches.has(parent))batches.set(parent,[]);batches.get(parent).push({geo,material});};
 for(const original of meshes){const geo=floatGeometry(original.geometry).applyMatrix4(transform.clone().multiply(original.matrixWorld)),mesh=new THREE.Mesh(geo,original.material),body=[];
  for(const part of components(mesh)){const b=part.box,center=b.getCenter(new THREE.Vector3()),sz=b.getSize(new THREE.Vector3());let parent=scene;
   if(['Object_17','Object_18','Object_19','Object_20'].includes(original.name)){trackSources.push({geo,ids:part.indices,center,material:mesh.material});continue;}
   if(original.name==='Object_21'||(center.y>1.36&&Math.abs(center.x)<.95&&center.z>-.65&&center.z<1.4))parent=turret;
   if(original.name==='Object_3'&&b.min.y>1.55&&center.z>1.05)parent=barrel;
   if(Math.abs(center.x)>.74&&b.max.y<.98&&sz.z<.92&&sz.y<.95){const candidates=[...[-1.109,-.458,.265,1.13].map(z=>({z,y:.79,r:.14})),...[-1.232,-.618,-.004,.610,1.225].map(z=>({z,y:.332,r:.30})),{z:-1.918,y:.574,r:.43},{z:1.972,y:.592,r:.43}],wheel=candidates.reduce((a,w)=>Math.hypot(w.z-center.z,w.y-center.y)<Math.hypot(a.z-center.z,a.y-center.y)?w:a),{z,y,r}=wheel,key=(center.x>0?'R':'L')+z;let radial=0;const positions=geo.attributes.position;for(const i of part.indices)radial=Math.max(radial,Math.hypot(positions.getY(i)-y,positions.getZ(i)-z));
    // Suspension and end-wheel pieces must never orbit a nearby return roller.
    if(radial<=r+.055){if(!wheels.has(key)){const pivot=new THREE.Group();pivot.position.set(center.x,y,z);pivot.name='tankRollingWheel';scene.add(pivot);wheels.set(key,{pivot,side:center.x<0?'right':'left',radius:r,axis:'x',axisSign:-1});}parent=wheels.get(key).pivot;}
   }
   if(parent===scene){body.push(...part.indices);continue;}
   collect(parent,geometry(geo,part.indices),mesh.material);
  }
  if(body.length)collect(scene,geometry(geo,body),mesh.material);
 }
 scene.updateMatrixWorld(true);for(const [parent,entries]of batches){batchParts(parent,entries);for(const e of entries)e.geo.dispose();}
 const tracks={belts:[]};for(const side of [-1,1]){const entries=trackSources.filter(e=>Math.sign(e.center.x)===side).map(e=>({geo:geometry(e.geo,e.ids),center:e.center,material:e.material}));const belts=gpuRigidBelts(scene,entries);for(const b of belts)b.side=b.side==='left'?'right':'left';tracks.belts.push(...belts);}
 rollBelts(tracks,0);scene.rotation.y=Math.PI;return {node:scene,model:true,turret,barrel,wheels:[...wheels.values()],tracks,turretAxis:'y',source:'Panzer II'};
}

// Continuous source belts keep their authored silhouette; shader UV travel shows tread links.
function greyTrackSurface(scene,geo,source){
 geo.computeBoundingBox();const b=geo.boundingBox,cy=(b.min.y+b.max.y)/2,r=(b.max.y-b.min.y)/2,z0=b.min.z+r,z1=b.max.z-r,L=z1-z0,uv=new Float32Array(geo.attributes.position.count*2),p=geo.attributes.position;
 for(let i=0;i<p.count;i++){const y=p.getY(i),z=p.getZ(i),s=z>=z0&&z<=z1?(y<cy?z-z0:L+Math.PI*r+z1-z):z>z1?L+r*Math.atan2(z-z1,cy-y):2*L+Math.PI*r+r*Math.atan2(z0-z,y-cy);uv[i*2]=(p.getX(i)-b.min.x)/(b.max.x-b.min.x);uv[i*2+1]=s/.12;}geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
 const data=new Uint8Array(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const k=(y*32+x)*4,v=y<4?70:y<7?215:(x<3||x>28)?135:175;data.set([v,v,v,255],k);}const map=new THREE.DataTexture(data,32,32,THREE.RGBAFormat);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;const material=source.clone();material.map=map;material.bumpMap=map;material.bumpScale=.012;const belt=surfaceBelt(scene,geo,material);material.dispose();return belt;
}

// The grey source supplies named parts; bind complete meshes instead of guessing fragments.
function articulateGreyTank(raw){
 raw.updateMatrixWorld(true);const sources=[];raw.traverse(o=>{if(o.isMesh)sources.push(o);});const trackBox=new THREE.Box3();for(const o of sources)if(/^Track(?:_|\d)/.test(o.name))trackBox.union(new THREE.Box3().setFromObject(o));const c=trackBox.getCenter(new THREE.Vector3()),scale=4.81/(trackBox.max.z-trackBox.min.z),transform=new THREE.Matrix4().makeScale(scale,scale,scale).multiply(new THREE.Matrix4().makeTranslation(-c.x,-trackBox.min.y,-c.z)),scene=new THREE.Group(),batches=new Map(),wheels=[],tracks={belts:[]};
 const parts=sources.map(o=>{const geo=floatGeometry(o.geometry).applyMatrix4(transform.clone().multiply(o.matrixWorld));geo.computeBoundingBox();return {name:o.name,geo,material:o.material,center:geo.boundingBox.getCenter(new THREE.Vector3())};});const hullTurret=parts.find(p=>/^Turret_Torreta/.test(p.name)),turret=new THREE.Group();turret.name='tankTurret';turret.position.copy(hullTurret.center);turret.position.y=hullTurret.geo.boundingBox.min.y;scene.add(turret);const gun=parts.find(p=>/^20_mm_Guns/.test(p.name)),barrel=new THREE.Group();barrel.name='tankBarrel';barrel.position.set(gun.center.x-turret.position.x,gun.center.y-turret.position.y,gun.geo.boundingBox.min.z-turret.position.z);turret.add(barrel);scene.updateMatrixWorld(true);
 const collect=(parent,p)=>{if(!batches.has(parent))batches.set(parent,[]);batches.get(parent).push(p);};
 for(const p of parts){let parent=scene;
  if(/^Track(?:_|\d)/.test(p.name)){const b=greyTrackSurface(scene,p.geo,p.material);b.side=b.side==='left'?'right':'left';b.travelSign=-1;tracks.belts.push(b);continue;}
  if(/^(Wheel(?:_Wheels|\d+_Wheels)|Micro_Wheel|Rear_Wheel|Sprocket(?:_|\d))/.test(p.name)){const pivot=new THREE.Group();pivot.position.copy(p.center);pivot.name='tankRollingWheel';scene.add(pivot);const size=p.geo.boundingBox.getSize(new THREE.Vector3());wheels.push({pivot,side:p.center.x<0?'right':'left',radius:Math.max(size.y,size.z)/2,axis:'x',axisSign:-1});parent=pivot;}
  else if(/^(20_mm|MG_Guns|Mantelete)/.test(p.name))parent=barrel;
  else if(/^(Turret|Cupula|Commander_View|Support_Cupula|Gunner_Sights|MG_Sights|Nech_Shield)/.test(p.name))parent=turret;
  collect(parent,p);
 }
 scene.updateMatrixWorld(true);for(const[parent,entries]of batches){batchParts(parent,entries);for(const e of entries)e.geo.dispose();}rollBelts(tracks,0);scene.rotation.y=Math.PI;scene.userData.blindfireRig='grey-panzer-ii-f-v1';return {node:scene,model:true,turret,barrel,wheels,tracks,turretAxis:'y',source:'Grey Panzer II Ausf. F'};
}

// Tread motion runs in the vertex shader: no per-frame vertex/normal uploads.
function gpuRigidBelts(scene,entries,alignCenters=false){
 const bounds=new THREE.Box3();for(const e of entries){e.geo.computeBoundingBox();bounds.union(e.geo.boundingBox);}const pathBounds=alignCenters?new THREE.Box3().setFromPoints(entries.map(e=>e.center)):bounds;const cy=(pathBounds.min.y+pathBounds.max.y)/2,r=(pathBounds.max.y-pathBounds.min.y)/2,z0=pathBounds.min.z+r,z1=pathBounds.max.z-r,L=z1-z0,{path,per}=beltPath(z0,z1,cy,r),batches=new Map();
 const phaseOf=({y,z})=>z>=z0&&z<=z1?(y<cy?z-z0:L+Math.PI*r+z1-z):z>z1?L+r*Math.atan2(z-z1,cy-y):2*L+Math.PI*r+r*Math.atan2(z0-z,y-cy);const centers=alignCenters?[...new Set(entries.map(e=>e.center))].sort((a,b)=>phaseOf(a)-phaseOf(b)):[],phases=new Map(centers.map((c,i)=>[c,phaseOf(centers[0])+i*per/centers.length]));
 for(const e of entries){const {y,z}=e.center,s=z>=z0&&z<=z1?(y<cy?z-z0:L+Math.PI*r+z1-z):z>z1?L+r*Math.atan2(z-z1,cy-y):2*L+Math.PI*r+r*Math.atan2(z0-z,y-cy),phase=alignCenters?phases.get(e.center):s,q=path(phase),a=new Float32Array(e.geo.attributes.position.count*4);if(alignCenters){const delta=((q.a-e.restAngle+Math.PI/2)%Math.PI+Math.PI)%Math.PI-Math.PI/2;e.geo.applyMatrix4(new THREE.Matrix4().makeTranslation(0,q.y,q.z).multiply(new THREE.Matrix4().makeRotationX(delta)).multiply(new THREE.Matrix4().makeTranslation(0,-e.center.y,-e.center.z)));e.geo.computeBoundingBox();e.center=new THREE.Vector3(e.center.x,q.y,q.z);}for(let i=0;i<e.geo.attributes.position.count;i++)a.set([phase,e.center.y,e.center.z,q.a],i*4);e.geo.setAttribute('treadPhase',new THREE.BufferAttribute(a,4));if(!batches.has(e.material))batches.set(e.material,[]);batches.get(e.material).push(e.geo);}
 if(alignCenters){bounds.makeEmpty();for(const e of entries)bounds.union(e.geo.boundingBox);}
 const supportLinks=entries.map(e=>{const b=e.geo.boundingBox,rest=path(e.geo.attributes.treadPhase.getX(0));return {restY:rest.y,restZ:rest.z,restA:rest.a,phase:e.geo.attributes.treadPhase.getX(0),y:e.center.y,z:e.center.z,halfY:Math.max(Math.abs(b.min.y-e.center.y),Math.abs(b.max.y-e.center.y)),halfZ:Math.max(Math.abs(b.min.z-e.center.z),Math.abs(b.max.z-e.center.z))};});
 const supportPoint={};const supportAt=travel=>{let low=Infinity;for(const e of supportLinks){const q=path(e.phase-travel,supportPoint),a=q.a-e.restA;low=Math.min(low,q.y+Math.cos(a)*(e.y-e.restY)-Math.sin(a)*(e.z-e.restZ)-Math.abs(Math.cos(a))*e.halfY-Math.abs(Math.sin(a))*e.halfZ);}return low;};
 const belts=[];for(const [source,geos]of batches){const material=source.clone(),uniform={value:0};material.onBeforeCompile=shader=>{shader.uniforms.treadTravel=uniform;shader.vertexShader=`attribute vec4 treadPhase; uniform float treadTravel;
vec3 treadPoint(float s){s=mod(mod(s,${per.toFixed(8)})+${per.toFixed(8)},${per.toFixed(8)});float L=${L.toFixed(8)},r=${r.toFixed(8)},cy=${cy.toFixed(8)},z0=${z0.toFixed(8)},z1=${z1.toFixed(8)};if(s<L)return vec3(cy-r,z0+s,0.);if(s<L+3.14159265*r){float a=(s-L)/r;return vec3(cy-r*cos(a),z1+r*sin(a),-a);}if(s<2.*L+3.14159265*r)return vec3(cy+r,z1-(s-L-3.14159265*r),-3.14159265);float a=(s-2.*L-3.14159265*r)/r;return vec3(cy+r*cos(a),z0-r*sin(a),-3.14159265-a);}
`+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvec3 tq=treadPoint(treadPhase.x-treadTravel);float ta=tq.z-treadPhase.w;mat2 tr=mat2(cos(ta),sin(ta),-sin(ta),cos(ta));objectNormal.yz=tr*objectNormal.yz;').replace('#include <begin_vertex>','#include <begin_vertex>\nvec3 tRest=treadPoint(treadPhase.x);transformed.yz=tq.xy+tr*(position.yz-tRest.xy);');};material.customProgramCacheKey=()=>`rigid-belt:${z0}:${z1}:${cy}:${r}`;const merged=mergeGeometries(geos),mesh=new THREE.Mesh(merged,material);mesh.name='gpuOriginalTreads';mesh.frustumCulled=false;scene.add(mesh);belts.push({mesh,uniform,side:bounds.getCenter(new THREE.Vector3()).x<0?'left':'right',gpu:true,supportAt,contactMin:bounds.min.y,contactBounds:bounds.clone()});for(const geo of geos)geo.dispose();}return belts;
}
export function surfaceBelt(scene,geo,source){
 geo.computeBoundingBox();const bounds=geo.boundingBox,side=bounds.getCenter(new THREE.Vector3()).x<0?'left':'right',material=source.clone(),uniform={value:0};
 // Calibrate texture travel against the ground run in model metres. UV orientation differs per asset.
 const pos=geo.attributes.position,uv=geo.attributes.uv,samples=[];
 if(uv)for(let i=0;i<pos.count;i++)if(pos.getY(i)<bounds.min.y+(bounds.max.y-bounds.min.y)*.18)samples.push(i);
 let slopeU=0,slopeV=0;
 if(samples.length>2){const mean=k=>samples.reduce((a,i)=>a+k(i),0)/samples.length,mz=mean(i=>pos.getZ(i)),mu=mean(i=>uv.getX(i)),mv=mean(i=>uv.getY(i));let zz=0,zu=0,zv=0;for(const i of samples){const z=pos.getZ(i)-mz;zz+=z*z;zu+=z*(uv.getX(i)-mu);zv+=z*(uv.getY(i)-mv);}if(zz>1e-8){slopeU=zu/zz;slopeV=zv/zz;}}
 if(Math.abs(slopeU)>=Math.abs(slopeV))slopeV=0;else slopeU=0;
 material.onBeforeCompile=shader=>{shader.uniforms.treadTravel=uniform;shader.vertexShader='uniform float treadTravel;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv += vec2('+(-slopeU).toFixed(9)+','+(-slopeV).toFixed(9)+') * treadTravel;\n#endif');};material.customProgramCacheKey=()=> 'continuous-tread-scroll:'+slopeU+':'+slopeV;const mesh=new THREE.Mesh(geo,material);mesh.name='continuousOriginalTread';scene.add(mesh);return {mesh,uniform,side,gpu:true,uvSlope:{u:slopeU,v:slopeV},contactMin:bounds.min.y,contactBounds:bounds.clone()};
}

export function batchParts(parent,entries){
 parent.updateWorldMatrix(true,false);const inv=parent.matrixWorld.clone().invert(),groups=new Map();for(const e of entries){const ids=e.geo.index?Array.from(e.geo.index.array):Array.from({length:e.geo.attributes.position.count},(_,i)=>i),geo=geometry(e.geo,ids).applyMatrix4(inv),key=e.material.uuid+Object.keys(geo.attributes).sort().join(',');if(!groups.has(key))groups.set(key,{material:e.material,geos:[]});groups.get(key).geos.push(geo);}for(const {material,geos}of groups.values()){const merged=mergeGeometries(geos);parent.add(new THREE.Mesh(merged,material));for(const geo of geos)geo.dispose();}
}
export function articulateTierTwo(raw,id){
 raw.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(raw),size=bb.getSize(new THREE.Vector3()),center=bb.getCenter(new THREE.Vector3()),hero=id==='hero_tank',scale=hero?9.9/size.x:1;
 const transform=new THREE.Matrix4().makeRotationY(hero?-Math.PI/2:Math.PI/2).multiply(new THREE.Matrix4().makeScale(scale,scale,scale)).multiply(new THREE.Matrix4().makeTranslation(-center.x,-bb.min.y,-center.z)),scene=new THREE.Group(),meshes=[];raw.traverse(o=>{if(o.isMesh)meshes.push(o);});
 const point=o=>new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(transform),yaw=new THREE.Group(),pitch=new THREE.Group();yaw.name=hero?'heroTurret':'turtleLauncher';pitch.name=hero?'heroCannonPitch':'turtleLauncherPitch';
 if(hero){yaw.position.copy(point(raw.getObjectByName('IS2_turret')));pitch.position.copy(point(raw.getObjectByName('IS2_barrel'))).sub(yaw.position);}else{const mount=meshes.find(o=>o.name.startsWith('mount')),weapon=meshes.find(o=>o.name.startsWith('weapon'));const mb=new THREE.Box3().setFromObject(mount).applyMatrix4(transform),wb=new THREE.Box3().setFromObject(weapon).applyMatrix4(transform);yaw.position.set(mb.getCenter(new THREE.Vector3()).x,mb.min.y,mb.getCenter(new THREE.Vector3()).z);pitch.position.copy(wb.getCenter(new THREE.Vector3())).sub(yaw.position);}
 scene.add(yaw);yaw.add(pitch);scene.updateMatrixWorld(true);const batches=new Map(),wheels=[],tracks={belts:[]};const collect=(parent,e)=>{if(!batches.has(parent))batches.set(parent,[]);batches.get(parent).push(e);};
 for(const original of meshes){const geo=geometry(original.geometry,Array.from(original.geometry.index.array)).applyMatrix4(transform.clone().multiply(original.matrixWorld));let parent=scene;const name=original.name;
  if(hero){if(name.startsWith('IS2_turret')||name.startsWith('IS2_reargun'))parent=yaw;if(name.startsWith('IS2_barrel'))parent=pitch;}
  else{if(name.startsWith('mount'))parent=yaw;if(name.startsWith('weapon')||name.startsWith('ammo'))parent=pitch;}
  if((hero&&name.startsWith('IS2_tracks'))||(!hero&&name.startsWith('track'))){if(hero){for(const c of components(new THREE.Mesh(geo)))tracks.belts.push(surfaceBelt(scene,geometry(geo,c.indices),original.material));geo.dispose();}else tracks.belts.push(surfaceBelt(scene,geo,original.material));continue;}
  if(!hero&&name.startsWith('wheel')){geo.computeBoundingBox();const c=geo.boundingBox.getCenter(new THREE.Vector3()),sz=geo.boundingBox.getSize(new THREE.Vector3()),pivot=new THREE.Group();pivot.position.copy(c);pivot.name='turtleRollingWheel';scene.add(pivot);scene.updateMatrixWorld(true);wheels.push({pivot,side:c.x<0?'left':'right',radius:Math.max(sz.y,sz.z)/2,axis:'x',axisSign:1});parent=pivot;}
  if(hero&&name.startsWith('IS2_body')){const body=[];for(const c of components(new THREE.Mesh(geo))){const sz=c.box.getSize(new THREE.Vector3()),pos=c.box.getCenter(new THREE.Vector3());if(Math.abs(pos.x)>1&&pos.y<1.25&&sz.y>.22&&sz.z>.22&&sz.y<1.15&&sz.z<1.15){const pivot=new THREE.Group();pivot.position.copy(pos);pivot.name='heroRollingWheel';scene.add(pivot);scene.updateMatrixWorld(true);wheels.push({pivot,side:pos.x<0?'left':'right',radius:Math.max(sz.y,sz.z)/2,axis:'x',axisSign:1});collect(pivot,{geo:geometry(geo,c.indices),material:original.material});}else body.push(...c.indices);}if(body.length)collect(scene,{geo:geometry(geo,body),material:original.material});geo.dispose();continue;}
  collect(parent,{geo,material:original.material});
 }
 for(const [parent,entries]of batches){batchParts(parent,entries);for(const e of entries)e.geo.dispose();}return {node:scene,model:true,turret:hero?yaw:null,launcher:hero?null:yaw,barrel:pitch,turretAxis:'y',launcherAxis:'y',barrelSign:1,mainGun:hero?'tankCannon':null,launcherWeapon:hero?null:'missile',wheels,tracks,source:hero?'IS-2':'9P149 Shturm-S'};
}

// M53/M55: preserve connected source pieces; separate the rear spade from hull and complete wheel assemblies from suspension.
export function articulateCougar(scene){
 scene.updateMatrixWorld(true);const turret=new THREE.Group(),barrel=new THREE.Group(),spade=new THREE.Group(),wheels=[],tracks={belts:[]};
 turret.name='cougarTurret';turret.position.set(0,1.25,1.8);scene.add(turret);
 barrel.name='cougarBarrelPitch';barrel.position.set(0,1.03,-1);turret.add(barrel);
 spade.name='cougarSpade';spade.position.set(0,1.23,3.3);scene.add(spade);scene.updateMatrixWorld(true);
 const collect=new Map(),add=(parent,geo,material)=>{if(!collect.has(parent))collect.set(parent,[]);collect.get(parent).push({geo,material});};
 for(const name of ['M53_Turret','M53_Gun','M53_Hull','M53_Wheels','M53_Tracks']){
 const mesh=scene.getObjectByName(name),geo=geometry(mesh.geometry,Array.from(mesh.geometry.index.array)).applyMatrix4(mesh.matrixWorld),cs=components(new THREE.Mesh(geo));
 if(name==='M53_Tracks'){for(const c of cs)tracks.belts.push(surfaceBelt(scene,geometry(geo,c.indices),mesh.material));}
 else if(name==='M53_Wheels'){
 const centers=[];for(const c of cs){const s=c.box.getSize(new THREE.Vector3()),p=c.box.getCenter(new THREE.Vector3());if(Math.abs(p.x)>1&&s.y>.5&&s.y<1.15&&s.z>.5&&s.z<1.15&&s.x<.65&&Math.abs(s.y-s.z)<.13&&!centers.some(q=>Math.abs(q.x-p.x)<.5&&Math.hypot(q.y-p.y,q.z-p.z)<.12)){p.radius=Math.max(s.y,s.z)/2;centers.push(p);}}
 const groups=centers.map((p,i)=>{const pivot=new THREE.Group();pivot.name='cougarWheel'+i;pivot.position.copy(p);scene.add(pivot);wheels.push({pivot,side:p.x<0?'left':'right',radius:p.radius,axis:'x',axisSign:1});return pivot;});scene.updateMatrixWorld(true);
 for(const c of cs){const p=c.box.getCenter(new THREE.Vector3()),sz=c.box.getSize(new THREE.Vector3()),i=centers.findIndex(q=>Math.abs(q.x-p.x)<.35&&Math.hypot(q.y-p.y,q.z-p.z)<.14&&sz.y<1.15&&sz.z<1.15);add(i<0?scene:groups[i],geometry(geo,c.indices),mesh.material);}
 }else if(name==='M53_Hull'){for(const c of cs)add(c.box.min.z>3.3?spade:scene,geometry(geo,c.indices),mesh.material);}
 else add(name==='M53_Gun'?barrel:turret,geo.clone(),mesh.material);
 mesh.removeFromParent();geo.dispose();
 }
 scene.updateMatrixWorld(true);for(const [parent,entries]of collect){batchParts(parent,entries);for(const e of entries)e.geo.dispose();}
 // Choose a deployment angle that reaches ground without moving fixed hull parts or forcing blade vertices below ground.
 scene.updateMatrixWorld(true);const verts=[];spade.traverse(o=>{if(o.isMesh){const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++)verts.push(spade.worldToLocal(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld)));}});
 let deployedAngle=0;for(let angle=0;angle<1.1;angle+=.01){const low=Math.min(...verts.map(p=>spade.position.y+p.y*Math.cos(angle)-p.z*Math.sin(angle)));if(low<.03)break;deployedAngle=angle;}
 if(wheels.length<16||!verts.length)throw Error('M53 wheel/spade extraction incomplete: '+wheels.length);
 return{node:scene,model:true,turret,barrel,spade,spadeAngle:deployedAngle,turretAxis:'y',barrelSign:1,mainGun:'artillery',wheels,tracks,source:'Supplied M53/M55'};
}
