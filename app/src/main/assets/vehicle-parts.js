import * as THREE from './three.module.js';
// Keep complete connected pieces, UVs, normals and materials when adding articulation.
function components(mesh){
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
