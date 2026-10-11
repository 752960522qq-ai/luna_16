import * as THREE from './three.module.js';
// Reuse GPU buffers; grow geometrically only when a line exceeds its capacity.
export function updatePolyline(line,points,distances=false){
 let geometry=line.geometry,position=geometry.attributes.position;
 if(!position||position.count<points.length){
  let capacity=position?.count||16;while(capacity<points.length)capacity*=2;
  geometry.dispose();geometry=line.geometry=new THREE.BufferGeometry();
  position=new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('position',position);
  if(distances)geometry.setAttribute('lineDistance',new THREE.BufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage));
 }
 if(distances&&!geometry.attributes.lineDistance)geometry.setAttribute('lineDistance',new THREE.BufferAttribute(new Float32Array(position.count),1).setUsage(THREE.DynamicDrawUsage));
 const distance=geometry.attributes.lineDistance;let length=0;
 for(let i=0;i<points.length;i++){const p=points[i];position.setXYZ(i,p.x,p.y,p.z);if(distances){if(i){const q=points[i-1];length+=Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z);}distance.setX(i,length);}}
 geometry.setDrawRange(0,points.length);position.needsUpdate=true;if(distances)distance.needsUpdate=true;
 line.frustumCulled=false;
}
