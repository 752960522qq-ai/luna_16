import * as THREE from './three.module.js';
import {surfaceBelt,batchParts,floatGeometry} from './vehicle-parts.js';
// Supplied metre-scale -Z-forward model. Bake transforms once, retain authored UVs.
export function articulateCrimson(raw){
 raw.updateMatrixWorld(true);
 const node=new THREE.Group(),turret=new THREE.Group(),barrel=new THREE.Group(),mgYaw=new THREE.Group(),mgPitch=new THREE.Group(),tracks={belts:[]},wheels=[];
 node.name='crimsonHull';turret.name='crimsonTurret';barrel.name='crimsonGun';mgYaw.name='crimsonMGYaw';mgPitch.name='crimsonMGPitch';
 const sx=3.27/3.40898299,transform=new THREE.Matrix4().makeScale(sx,1,1);
 turret.position.set(0,1.48777964,-.07192205);node.add(turret);
 barrel.position.set(.01455052*sx,1.75495126-turret.position.y,-1.00224992-turret.position.z);turret.add(barrel);
 mgYaw.position.set(1,2.64-turret.position.y,.43-turret.position.z);turret.add(mgYaw);mgYaw.add(mgPitch);
 node.updateMatrixWorld(true);
 const batches=new Map(),collect=(parent,geo,material)=>{if(!batches.has(parent))batches.set(parent,[]);batches.get(parent).push({geo,material});};
 raw.traverse(o=>{
  if(!o.isMesh)return;
  const geo=floatGeometry(o.geometry).applyMatrix4(o.matrixWorld).applyMatrix4(transform),name=o.name;
  if(/^track_[lr]_/.test(name)){tracks.belts.push(surfaceBelt(node,geo,o.material));return;}
  if(/^wheel_[lr]_/.test(name)){
   geo.computeBoundingBox();const box=geo.boundingBox,center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),pivot=new THREE.Group();pivot.name=name+'Pivot';pivot.position.copy(center);node.add(pivot);node.updateMatrixWorld(true);
   wheels.push({pivot,side:center.x<0?'left':'right',radius:(size.y+size.z)/4,axis:'x',axisSign:1});collect(pivot,geo,o.material);return;
  }
  let parent=node;
  if(/^(bone_mg_aa|mg_dshkm)/.test(name)){
   parent=mgPitch;
   // Supplied roof gun points aft; rotate the geometry about its own mount to -Z.
   geo.translate(-1,-2.64,-.43).rotateY(Math.PI).translate(1,2.64,.43);
  }else if(o.parent?.name==='Gun')parent=barrel;
  else if(o.parent?.name==='Turret')parent=turret;
  collect(parent,geo,o.material);
 });
 for(const[parent,entries]of batches){batchParts(parent,entries);for(const e of entries)e.geo.dispose();}
 if(wheels.length!==14||tracks.belts.length!==2)throw Error('赤红钢流 running gear incomplete');
 return{node,model:true,turret,barrel,mgYaw,mgPitch,tracks,wheels,turretAxis:'y',barrelSign:1,mainGun:'tankCannon',source:'User supplied T54_1949_default_9m.glb'};
}
