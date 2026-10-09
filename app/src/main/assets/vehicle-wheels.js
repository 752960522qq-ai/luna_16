import * as THREE from './three.module.js';

// Split whole connected wheel components while retaining UVs and materials.
export function splitAvengerWheels(model){
 model.updateMatrixWorld(true);
 const source=model.getObjectByName('mesh_331_mat_70_0');
 if(!source?.isMesh||!source.geometry.index)throw Error('Avenger wheel mesh missing');
 const geo=source.geometry,pos=geo.getAttribute('position'),index=geo.index,parent=Array.from({length:pos.count},(_,i)=>i),weld=new Map();
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
 for(let i=0;i<pos.count;i++){
  const key=[pos.getX(i),pos.getY(i),pos.getZ(i)].map(v=>Math.round(v*1000)).join(',');
  if(weld.has(key))join(i,weld.get(key));else weld.set(key,i);
 }
 for(let i=0;i<index.count;i+=3){join(index.getX(i),index.getX(i+1));join(index.getX(i),index.getX(i+2));}
 const components=new Map();
 for(let i=0;i<pos.count;i++){
  const id=find(i);let c=components.get(id);
  if(!c){c={id,vertices:[],box:new THREE.Box3()};components.set(id,c);}
  c.vertices.push(i);c.box.expandByPoint(new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i)));
 }
 geo.computeBoundingBox();const bounds=geo.boundingBox,size=bounds.getSize(new THREE.Vector3());
 const tires=[...components.values()].filter(c=>{
  const s=c.box.getSize(new THREE.Vector3());return c.vertices.length>=500&&c.vertices.length<=1500&&
   Math.abs(s.x-s.z)<s.x*.02&&s.y<s.x*.6&&c.box.max.z<bounds.min.z+size.z*.23;
 }).sort((a,b)=>a.box.min.x-b.box.min.x||a.box.min.y-b.box.min.y);
 if(tires.length!==4)throw Error(`Expected 4 Avenger wheels, found ${tires.length}`);
 const destinations=new Map(),centers=tires.map(c=>c.box.getCenter(new THREE.Vector3()));
 for(const c of components.values())destinations.set(c.id,tires.findIndex(t=>t.box.clone().expandByScalar(.5).containsBox(c.box))+1);
 const triangles=Array.from({length:5},()=>[]);
 for(let i=0;i<index.count;i+=3){const target=triangles[destinations.get(find(index.getX(i)))];for(let k=0;k<3;k++)target.push(index.getX(i+k));}
 function part(indices,center){
  const vertices=[...new Set(indices)],remap=new Map(vertices.map((id,i)=>[id,i])),out=new THREE.BufferGeometry();
  for(const[name,a]of Object.entries(geo.attributes)){
   const values=new Float32Array(vertices.length*a.itemSize);
   for(let i=0;i<vertices.length;i++)for(let k=0;k<a.itemSize;k++)values[i*a.itemSize+k]=a.getComponent(vertices[i],k)-(name==='position'?center.getComponent(k):0);
   out.setAttribute(name,new THREE.BufferAttribute(values,a.itemSize));
  }
  out.setIndex(indices.map(id=>remap.get(id)));out.computeBoundingBox();out.computeBoundingSphere();return out;
 }
 const body=part(triangles[0],new THREE.Vector3()),wheels=[];
 const scale=new THREE.Vector3(1,0,0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(source.parent.matrixWorld)).length();
 const axisSign=Math.sign(new THREE.Vector3(0,1,0).transformDirection(source.parent.matrixWorld).x)||1;
 for(let i=0;i<4;i++){
  const pivot=new THREE.Group();pivot.name=`rollingWheel${i}`;pivot.position.copy(centers[i]);
  const mesh=new THREE.Mesh(part(triangles[i+1],centers[i]),source.material);mesh.name=`texturedWheel${i}`;pivot.add(mesh);source.parent.add(pivot);
  wheels.push({pivot,radius:tires[i].box.getSize(new THREE.Vector3()).x*.5*scale,axisSign,triangles:triangles[i+1].length/3});
 }
 source.geometry=body;geo.dispose();return wheels;
}
