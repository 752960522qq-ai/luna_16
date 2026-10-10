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
function geometry(geo,indices,center=new THREE.Vector3()){
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
function beltPath(z0,z1,cy,r){const L=z1-z0,per=2*L+2*Math.PI*r;return {per,path:s=>{s=(s%per+per)%per;if(s<L)return {y:cy-r,z:z0+s,a:0};if(s<L+Math.PI*r){const q=(s-L)/r;return {y:cy-r*Math.cos(q),z:z1+r*Math.sin(q),a:-q};}if(s<2*L+Math.PI*r)return {y:cy+r,z:z1-(s-L-Math.PI*r),a:-Math.PI};const q=(s-2*L-Math.PI*r)/r;return {y:cy+r*Math.cos(q),z:z0-r*Math.sin(q),a:-Math.PI-q};}};}
function makeBelt(scene,entries){
 const bounds=new THREE.Box3();for(const e of entries){e.geo.computeBoundingBox();bounds.union(e.geo.boundingBox);}
 const cy=(bounds.min.y+bounds.max.y)/2,r=(bounds.max.y-bounds.min.y)/2,z0=bounds.min.z+r,z1=bounds.max.z-r,L=z1-z0,{path,per}=beltPath(z0,z1,cy,r),batches=new Map();
 for(const e of entries){const {y,z}=e.center;e.s=z>=z0&&z<=z1?(y<cy?z-z0:L+Math.PI*r+z1-z):z>z1?L+r*Math.atan2(z-z1,cy-y):2*L+Math.PI*r+r*Math.atan2(z0-z,y-cy);e.initial=path(e.s);if(!batches.has(e.material))batches.set(e.material,[]);batches.get(e.material).push(e);}
 const belts=[];for(const [material,es]of batches){let offset=0;for(const e of es){e.offset=offset;e.count=e.geo.attributes.position.count;offset+=e.count;}const merged=mergeGeometries(es.map(e=>e.geo)),mesh=new THREE.Mesh(merged,material);mesh.name='movingOriginalTreads';mesh.frustumCulled=false;scene.add(mesh);belts.push({side:bounds.getCenter(new THREE.Vector3()).x<0?'left':'right',mesh,entries:es,path,rest:merged.attributes.position.array.slice(),normals:merged.attributes.normal?.array.slice()});}
 return belts;
}
export function animateBelts(scene,groups){
 scene.updateMatrixWorld(true);const inverse=scene.matrixWorld.clone().invert(),belts=[];
 for(const group of groups){if(!group)throw Error('Track group missing');const entries=[];group.traverse(mesh=>{if(!mesh.isMesh)return;const geo=mesh.geometry.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));geo.computeBoundingBox();entries.push({geo,center:geo.boundingBox.getCenter(new THREE.Vector3()),material:mesh.material});mesh.visible=false;});belts.push(...makeBelt(scene,entries));}
 return {belts};
}
export function rollBelts(tracks,travel){
 for(const belt of tracks.belts){if(belt.gpu){belt.uniform.value=(typeof travel==='object'?travel[belt.side]:travel)*(belt.travelSign||1);continue;}const pos=belt.mesh.geometry.attributes.position,normal=belt.mesh.geometry.attributes.normal;for(const e of belt.entries){const q=belt.path(e.s-(typeof travel==='object'?travel[belt.side]:travel)),angle=q.a-e.initial.a,c=Math.cos(angle),s=Math.sin(angle),dy=q.y-e.initial.y,dz=q.z-e.initial.z;for(let i=e.offset;i<e.offset+e.count;i++){const k=i*3,x=belt.rest[k],y=belt.rest[k+1]-e.center.y,z=belt.rest[k+2]-e.center.z;pos.setXYZ(i,x,e.center.y+dy+c*y-s*z,e.center.z+dz+s*y+c*z);if(normal){const ny=belt.normals[k+1],nz=belt.normals[k+2];normal.setXYZ(i,belt.normals[k],c*ny-s*nz,s*ny+c*nz);}}}pos.needsUpdate=true;if(normal)normal.needsUpdate=true;}
}
export function articulateKFZ(scene){
 scene.updateMatrixWorld(true);const inverse=scene.matrixWorld.clone().invert(),wheels=[];
 for(const suffix of ['', '1'])for(const base of ['polySurface610','polySurface95','pCylinder12','pCylinder13','pCylinder14','pCylinder15','pCylinder1','pCylinder2']){const child=scene.getObjectByName(base+suffix);if(!child)throw Error('KFZ wheel missing: '+base+suffix);const bounds=new THREE.Box3().setFromObject(child),c=bounds.getCenter(new THREE.Vector3()).applyMatrix4(inverse),size=bounds.getSize(new THREE.Vector3()),pivot=new THREE.Group();pivot.position.copy(c);pivot.name='kfzRollingWheel';scene.add(pivot);scene.updateMatrixWorld(true);pivot.attach(child);wheels.push({pivot,side:c.x<0?'left':'right',radius:Math.max(size.y,size.z)/2,axis:'x',axisSign:1});}
 // Each original rigid link shares a phase across its material pieces. No CPU vertex deformation.
 scene.updateMatrixWorld(true);const belts=[];
 for(const name of ['L_Track_GP','R_Track_GP']){const group=scene.getObjectByName(name),entries=[];
  for(const link of group.children){const meshes=[];link.traverse(o=>{if(o.isMesh)meshes.push(o);});const bounds=new THREE.Box3();const parts=meshes.map(mesh=>{const geo=mesh.geometry.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));geo.computeBoundingBox();bounds.union(geo.boundingBox);return {geo,material:mesh.material};});const center=bounds.getCenter(new THREE.Vector3());for(const part of parts)entries.push({...part,center});}
  group.visible=false;const bs=gpuRigidBelts(scene,entries);for(const b of bs)b.travelSign=-1;belts.push(...bs);
 }
 return {wheels,tracks:{belts}};
}
export function articulateTank(raw){
 raw.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(raw),size=bb.getSize(new THREE.Vector3()),c=bb.getCenter(new THREE.Vector3());
 // The radio antenna is above the specified body height; retain it without shrinking the hull.
 const transform=new THREE.Matrix4().makeScale(2.28/size.x,2.02/(2797.44873046875-bb.min.y),4.81/size.z).multiply(new THREE.Matrix4().makeTranslation(-c.x,-bb.min.y,-c.z));
 const scene=new THREE.Group(),meshes=[];raw.traverse(o=>{if(o.isMesh)meshes.push(o);});
 const turret=new THREE.Group();turret.position.set(.16,1.43,.35);turret.name='tankTurret';scene.add(turret);const barrel=new THREE.Group();barrel.position.set(-.02,.22,.68);barrel.name='tankBarrel';turret.add(barrel);scene.updateMatrixWorld(true);
 const wheels=new Map(),trackSources=[],batches=new Map();const collect=(parent,geo,material)=>{if(!batches.has(parent))batches.set(parent,[]);batches.get(parent).push({geo,material});};
 for(const original of meshes){const geo=original.geometry.clone().applyMatrix4(transform.clone().multiply(original.matrixWorld)),mesh=new THREE.Mesh(geo,original.material),body=[];
  for(const part of components(mesh)){const b=part.box,center=b.getCenter(new THREE.Vector3()),sz=b.getSize(new THREE.Vector3());let parent=scene;
   const oldY=center.y/(2.02/(2797.44873046875-bb.min.y))* (2.02/size.y);
   if(['Object_17','Object_18','Object_19','Object_20'].includes(original.name)){trackSources.push({geo,ids:part.indices,center,material:mesh.material});continue;}
   if(original.name==='Object_21'||(center.y>1.36&&Math.abs(center.x)<.95&&center.z>-.65&&center.z<1.4))parent=turret;
   if(original.name==='Object_3'&&b.min.y>1.55&&center.z>1.05)parent=barrel;
   if(Math.abs(center.x)>.74&&b.max.y<.98&&sz.z<.92&&sz.y<.95){const zs=oldY>.44?[-1.109,-.458,.265,1.13]:[-1.918,-1.232,-.618,-.004,.610,1.225,1.972],z=zs.reduce((a,z)=>Math.abs(z-center.z)<Math.abs(a-center.z)?z:a),y=z===-1.918?.574:z===1.972?.592:oldY>.44?.79:.332,key=(center.x>0?'R':'L')+z;
    if(!wheels.has(key)){const pivot=new THREE.Group();pivot.position.set(center.x,y,z);pivot.name='tankRollingWheel';scene.add(pivot);wheels.set(key,{pivot,side:center.x<0?'right':'left',radius:oldY>.44?.14:z===-1.918||z===1.972?.43:.30,axis:'x',axisSign:-1});}parent=wheels.get(key).pivot;
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

// Tread motion runs in the vertex shader: no per-frame vertex/normal uploads.
function gpuRigidBelts(scene,entries){
 const bounds=new THREE.Box3();for(const e of entries){e.geo.computeBoundingBox();bounds.union(e.geo.boundingBox);}const cy=(bounds.min.y+bounds.max.y)/2,r=(bounds.max.y-bounds.min.y)/2,z0=bounds.min.z+r,z1=bounds.max.z-r,L=z1-z0,{path,per}=beltPath(z0,z1,cy,r),batches=new Map(),step=per/100;
 for(const e of entries){const {y,z}=e.center,s=z>=z0&&z<=z1?(y<cy?z-z0:L+Math.PI*r+z1-z):z>z1?L+r*Math.atan2(z-z1,cy-y):2*L+Math.PI*r+r*Math.atan2(z0-z,y-cy),phase=s,q=path(phase),a=new Float32Array(e.geo.attributes.position.count*4);for(let i=0;i<e.geo.attributes.position.count;i++)a.set([phase,q.y,q.z,q.a],i*4);e.geo.setAttribute('treadPhase',new THREE.BufferAttribute(a,4));if(!batches.has(e.material))batches.set(e.material,[]);batches.get(e.material).push(e.geo);}
 const belts=[];for(const [source,geos]of batches){const material=source.clone(),uniform={value:0};material.onBeforeCompile=shader=>{shader.uniforms.treadTravel=uniform;shader.vertexShader=`attribute vec4 treadPhase; uniform float treadTravel;
vec3 treadPoint(float s){s=mod(mod(s,${per.toFixed(8)})+${per.toFixed(8)},${per.toFixed(8)});float L=${L.toFixed(8)},r=${r.toFixed(8)},cy=${cy.toFixed(8)},z0=${z0.toFixed(8)},z1=${z1.toFixed(8)};if(s<L)return vec3(cy-r,z0+s,0.);if(s<L+3.14159265*r){float a=(s-L)/r;return vec3(cy-r*cos(a),z1+r*sin(a),-a);}if(s<2.*L+3.14159265*r)return vec3(cy+r,z1-(s-L-3.14159265*r),-3.14159265);float a=(s-2.*L-3.14159265*r)/r;return vec3(cy+r*cos(a),z0-r*sin(a),-3.14159265-a);}
`+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvec3 tq=treadPoint(treadPhase.x-treadTravel);float ta=tq.z-treadPhase.w;mat2 tr=mat2(cos(ta),sin(ta),-sin(ta),cos(ta));objectNormal.yz=tr*objectNormal.yz;').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.yz=tq.xy+tr*(position.yz-treadPhase.yz);');};material.customProgramCacheKey=()=>`rigid-belt:${z0}:${z1}:${cy}:${r}`;const merged=mergeGeometries(geos),mesh=new THREE.Mesh(merged,material);mesh.name='gpuOriginalTreads';mesh.frustumCulled=false;scene.add(mesh);belts.push({mesh,uniform,side:bounds.getCenter(new THREE.Vector3()).x<0?'left':'right',gpu:true});for(const geo of geos)geo.dispose();}return belts;
}
function surfaceBelt(scene,geo,source){
 geo.computeBoundingBox();const side=geo.boundingBox.getCenter(new THREE.Vector3()).x<0?'left':'right',material=source.clone(),uniform={value:0};
 material.onBeforeCompile=shader=>{shader.uniforms.treadTravel=uniform;shader.vertexShader='uniform float treadTravel;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.y += treadTravel * 0.14;\n#endif');};material.customProgramCacheKey=()=> 'continuous-tread-scroll';const mesh=new THREE.Mesh(geo,material);mesh.name='continuousOriginalTread';scene.add(mesh);return {mesh,uniform,side,gpu:true};
}
function batchParts(parent,entries){
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
