import * as T from './three.module.js';
export class MapLOD{
 constructor(){this.entries=[];this.position=new T.Vector3(Infinity,Infinity,Infinity);this.last=-Infinity;this.fov=0;this.zoom=1;}
 add(high,low=null,distance=320){
  const hi=Array.isArray(high)?high:[high],lo=low?(Array.isArray(low)?low:[low]):[],bounds=new T.Box3();
  for(const mesh of hi){mesh.updateMatrixWorld(true);bounds.union(new T.Box3().setFromObject(mesh));}
  for(const mesh of lo)mesh.visible=false;
  const entry={hi,lo,bounds,distance,near:null};this.entries.push(entry);return entry;
 }
 update(camera,now=performance.now(),force=false){
  const zoom=camera.zoom||1;
  if(!force&&now-this.last<100&&this.position.distanceToSquared(camera.position)<625&&this.fov===camera.fov&&this.zoom===zoom)return;
  this.last=now;this.position.copy(camera.position);this.fov=camera.fov;this.zoom=zoom;
  const scale=Math.tan(T.MathUtils.degToRad(camera.fov/2))/(zoom*Math.tan(Math.PI/6)),scale2=scale*scale,p=camera.position;
  for(const e of this.entries){
   const b=e.bounds,dx=Math.max(b.min.x-p.x,0,p.x-b.max.x),dy=Math.max(b.min.y-p.y,0,p.y-b.max.y),dz=Math.max(b.min.z-p.z,0,p.z-b.max.z);
   const limit=e.distance*(e.near===true?1.12:e.near===false?.88:1),near=(dx*dx+dy*dy+dz*dz)*scale2<=limit*limit;
   if(near===e.near)continue;e.near=near;for(const m of e.hi)m.visible=near;for(const m of e.lo)m.visible=!near;
  }
 }
}
// Simplify immutable scenery only at scene creation, preserving original UVs.
export function simplifyScenery(source,target=140){
 const p=source.attributes.position,normal=source.attributes.normal,uv=source.attributes.uv,index=source.index;let result;
 source.computeBoundingBox();const size=source.boundingBox.getSize(new T.Vector3()),extent=Math.max(size.x,size.y,size.z),origin=source.boundingBox.min;
 if(!extent)return source.clone();
 // Authoring units differ across assets: use the part's own bounds, not world metres.
 for(const fraction of [.025,.045,.065,.09,.13,.18,.25,.33]){
  const step=extent*fraction;
  const cells=new Map(),remap=new Uint32Array(p.count),positions=[],normals=[],uvs=[],indices=[];
  for(let i=0;i<p.count;i++){const key=`${Math.round((p.getX(i)-origin.x)/step)},${Math.round((p.getY(i)-origin.y)/step)},${Math.round((p.getZ(i)-origin.z)/step)}`;let id=cells.get(key);if(id===undefined){id=positions.length/3;cells.set(key,id);positions.push(p.getX(i),p.getY(i),p.getZ(i));if(normal)normals.push(normal.getX(i),normal.getY(i),normal.getZ(i));if(uv)uvs.push(uv.getX(i),uv.getY(i));}remap[i]=id;}
  const seen=new Set();for(let i=0;i<(index?index.count:p.count);i+=3){const a=remap[index?index.getX(i):i],b=remap[index?index.getX(i+1):i+1],c=remap[index?index.getX(i+2):i+2];if(a===b||b===c||a===c)continue;const key=[a,b,c].sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);indices.push(a,b,c);}
  if(!indices.length)continue;
  result?.dispose();result=new T.BufferGeometry();result.setAttribute('position',new T.Float32BufferAttribute(positions,3));if(normal)result.setAttribute('normal',new T.Float32BufferAttribute(normals,3));if(uv)result.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));result.setIndex(indices);if(indices.length/3<=target)break;
 }
 return result || source.clone();
}
