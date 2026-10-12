import * as THREE from './three.module.js';
// Refit only when the silhouette or viewing direction changes, not when driving straight.
export class ChaseCamera{
 constructor(){this.bounds=new THREE.Box3();this.point=new THREE.Vector3();this.size=new THREE.Vector3();this.fit=new THREE.PerspectiveCamera(62,1,.35,8000);this.last=null;this.refits=0;this.localBounds=new Map();}
 update(truck,player,aim,desired,target){
  const state=[player.vehicleId,player.yaw,aim.yaw,aim.pitch,truck.rotation.x,truck.rotation.z];
  const changed=!this.last||state.some((n,i)=>i===0?n!==this.last[i]:Math.abs(n-this.last[i])>.01);
  const dx=Math.sin(aim.yaw),dz=-Math.cos(aim.yaw),baseY=truck.position.y;
  if(changed){
   truck.updateMatrixWorld(true);const model=truck.userData.node;let cached=this.localBounds.get(player.vehicleId);if(model&&!cached){model.updateMatrixWorld(true);cached=new THREE.Box3().setFromObject(truck).applyMatrix4(truck.matrixWorld.clone().invert());this.localBounds.set(player.vehicleId,cached);}if(cached)this.bounds.copy(cached).applyMatrix4(truck.matrixWorld);else this.bounds.setFromObject(truck);this.bounds.getSize(this.size);
   this.height=Math.max(this.size.y,2.5);this.distance=Math.max(12,this.height/(.35*2*Math.tan(62*Math.PI/360)));
   target.set(player.x,baseY+this.height*.55,player.z);
   for(let pass=0;pass<4;pass++){
    desired.set(player.x-dx*this.distance,baseY+this.height*.65+this.distance*.18,player.z-dz*this.distance);
    this.fit.position.copy(desired);this.fit.lookAt(target);this.fit.updateMatrixWorld(true);
    let low=Infinity,high=-Infinity;
    for(let i=0;i<8;i++){this.point.set(i&1?this.bounds.max.x:this.bounds.min.x,i&2?this.bounds.max.y:this.bounds.min.y,i&4?this.bounds.max.z:this.bounds.min.z).project(this.fit);low=Math.min(low,this.point.y);high=Math.max(high,this.point.y);}
    const fraction=(high-low)/2;if(Math.abs(fraction-.35)<.002)break;this.distance*=fraction/.35;
   }
   this.last=state;this.refits++;
  }
  target.set(player.x,baseY+this.height*.55,player.z);
  desired.set(player.x-dx*this.distance,baseY+this.height*.65+this.distance*.18,player.z-dz*this.distance);
 }
}
