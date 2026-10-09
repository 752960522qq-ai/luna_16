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
 const track=scene.getObjectByName('Object_12'),pos=track.geometry.attributes.position,base=pos.array.slice();
 return {turret,barrel:pitch,wheels,tracks:{mesh:track,base,normals:track.geometry.attributes.normal.array.slice(),scale}};
}
export function rollTracks(track,travel){
 // Move the real track belt continuously around its closed stadium-shaped path.
 const p=track.mesh.geometry.attributes.position,L=5.29,R=.635,cy=-.53,cz=-.165,per=2*L+2*Math.PI*R,shift=-travel/track.scale;
 for(let i=0;i<p.count;i++){
  const x=track.base[i*3],y=track.base[i*3+1]-cy,z=track.base[i*3+2]-cz;let s,r,oldAngle=0;
  if(y>L/2){const a=Math.atan2(y-L/2,z);s=L+a*R;oldAngle=-a;r=Math.hypot(y-L/2,z);}
  else if(y<-L/2){let a=Math.atan2(-(y+L/2),-z);if(a<0)a+=Math.PI*2;s=2*L+Math.PI*R+a*R;oldAngle=-Math.PI-a;r=Math.hypot(y+L/2,z);}
  else if(z>=0){s=y+L/2;r=z;}else{s=L+Math.PI*R+L/2-y;oldAngle=-Math.PI;r=-z;}
  s=((s+shift)%per+per)%per;let yy,zz,angle=0;
  if(s<L){yy=s-L/2;zz=r;}else if(s<L+Math.PI*R){const a=(s-L)/R;angle=-a;yy=L/2+r*Math.sin(a);zz=r*Math.cos(a);}
  else if(s<2*L+Math.PI*R){angle=-Math.PI;yy=L/2-(s-L-Math.PI*R);zz=-r;}else{const a=(s-2*L-Math.PI*R)/R;angle=-Math.PI-a;yy=-L/2-r*Math.sin(a);zz=-r*Math.cos(a);}
  p.setXYZ(i,x,yy+cy,zz+cz);const d=angle-oldAngle,c=Math.cos(d),sn=Math.sin(d),nx=track.normals[i*3],ny=track.normals[i*3+1],nz=track.normals[i*3+2];track.mesh.geometry.attributes.normal.setXYZ(i,nx,ny*c-nz*sn,ny*sn+nz*c);
 }
 p.needsUpdate=true;track.mesh.geometry.attributes.normal.needsUpdate=true;
}
export function articulateAvenger(model){
 const source=model.getObjectByName('mesh_331_mat_70_0'),geo=source.geometry,parts=components(source),upper=parts.filter(c=>c.box.min.z>390&&c.box.max.x<120),ids=new Set(upper),body=parts.filter(c=>!ids.has(c)).flatMap(c=>c.indices);
 if(!upper.length)return null;
 const center=new THREE.Vector3(-160,0,430),pivot=new THREE.Group();pivot.name='avengerLauncherYaw';pivot.position.copy(center);source.parent.add(pivot);
 pivot.add(new THREE.Mesh(geometry(geo,upper.flatMap(c=>c.indices),center),source.material));source.geometry=geometry(geo,body);geo.dispose();return pivot;
}
