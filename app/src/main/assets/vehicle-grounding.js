import * as THREE from './three.module.js';
const rotation=new THREE.Matrix4(),point=new THREE.Vector3();
// Cache stationary vehicles and reuse scratch storage in the render loop.
export function applyGroundContact(group,player,terrain,mapId){
 const data=group.userData,contact=data.groundContact;if(!contact)return;
 const left=player.trackTravel?.left??player.wheelTravel??0,right=player.trackTravel?.right??player.wheelTravel??0;
 const old=data.groundState;
 if(old&&old.mapId===mapId&&old.x===player.x&&old.z===player.z&&old.yaw===player.yaw&&old.left===left&&old.right===right){group.position.y=old.height;group.rotation.set(old.pitch,-player.yaw,old.roll,'YXZ');return;}
 const c=Math.cos(player.yaw),s=Math.sin(player.yaw),mid=(contact.front+contact.rear)/2;
 const heightAt=(x,z)=>terrain(player.x+c*x-s*z,player.z+s*x+c*z);
 const pitch=-Math.atan2(heightAt(0,contact.rear)-heightAt(0,contact.front),contact.rear-contact.front);
 const roll=Math.atan2(heightAt(contact.halfWidth,mid)-heightAt(-contact.halfWidth,mid),2*contact.halfWidth);
 group.rotation.set(pitch,-player.yaw,roll,'YXZ');
 let minY=contact.minY;
 for(const belt of data.tracks?.belts||[])if(belt.supportAt){const travel=(belt.side==='left'?left:right)*(belt.travelSign||1);minY=Math.min(minY,contact.minY+(belt.supportAt(travel)-belt.contactMin)*data.node.scale.y);}
 let support=-Infinity;rotation.makeRotationFromEuler(group.rotation);
 for(let i=0;i<3;i++)for(let j=0;j<3;j++){point.set((i-1)*contact.halfWidth,minY,j===0?contact.front:j===1?mid:contact.rear).applyMatrix4(rotation);support=Math.max(support,terrain(player.x+point.x,player.z+point.z)-point.y);}
 // The road surface is 13 cm above terrain.
 group.position.y=support+.15;
 data.groundState={mapId,x:player.x,z:player.z,yaw:player.yaw,left,right,height:group.position.y,pitch,roll};
}

// Wheel/track geometry is measured in the truck's local frame even when it is
// already attached to a moving truck during asynchronous model loading.
export function contactFromRunningGear(asset){
 asset.node.updateWorldMatrix(true,true);const parentInverse=asset.node.parent?asset.node.parent.matrixWorld.clone().invert():new THREE.Matrix4(),bounds=new THREE.Box3(),instance=new THREE.Matrix4();
 const roots=asset.tracks?.mesh?[asset.tracks.mesh]:(asset.wheels||[]).map(w=>w.pivot);
 for(const root of roots)root.traverse(mesh=>{if(!mesh.isMesh)return;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const transform=parentInverse.clone().multiply(mesh.matrixWorld);if(mesh.isInstancedMesh){for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,instance);bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(transform.clone().multiply(instance)));}}else bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(transform));});
 if(bounds.isEmpty()||!Number.isFinite(bounds.min.y))throw Error('No valid local running gear bounds');return{minY:bounds.min.y,halfWidth:Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x)),front:bounds.min.z,rear:bounds.max.z};
}
