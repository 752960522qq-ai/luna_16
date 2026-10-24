import * as THREE from './three.module.js';
import {components,floatGeometry,geometry,surfaceBelt,batchParts} from './vehicle-parts.js';
// Authored SU-100P faces/UVs are retained; only rigid wheel and gun pivots are separated.
export function articulateFalcon(raw){
 raw.updateMatrixWorld(true);
 const scene=new THREE.Group(),turret=new THREE.Group(),barrel=new THREE.Group(),wheels=[],tracks={belts:[]};
 const scale=3.10/3.18, centerZ=-.576, groundY=-.034;
 const transform=new THREE.Matrix4().makeScale(scale,scale,scale).multiply(new THREE.Matrix4().makeRotationY(Math.PI)).multiply(new THREE.Matrix4().makeTranslation(0,-groundY,-centerZ));
 const point=(x,y,z)=>new THREE.Vector3(x,y,z).applyMatrix4(transform);
 const pivot=point(0,1.815,-.10);turret.name='falconGunTraverse';turret.position.copy(pivot);scene.add(turret);barrel.name='falconGunElevation';turret.add(barrel);
 const axles=[[-2.312,.347,.315],[-1.538,.347,.315],[-.782,.347,.315],[-.014,.347,.315],[.773,.347,.315],[1.597,.347,.315],[-3.128,.635,.235],[2.323,.644,.348],[-1.906,.797,.122],[-.392,.797,.122],[1.144,.797,.122]];
 for(const side of [-1,1])for(const[z,y,r]of axles){const p=new THREE.Group();p.position.copy(point(side*1.32,y,z));p.name='falconWheel'+wheels.length;scene.add(p);wheels.push({pivot:p,side:p.position.x<0?'left':'right',radius:r*scale,axis:'x',axisSign:1,source:[side*1.32,y,z]});}
 scene.updateMatrixWorld(true);const batches=new Map(),collect=(parent,geo,material)=>{if(!batches.has(parent))batches.set(parent,[]);batches.get(parent).push({geo,material});};
 raw.traverse(o=>{if(!o.isMesh)return;const source=floatGeometry(o.geometry).applyMatrix4(o.matrixWorld),geo=source.clone();
  if(["Object_3","Object_22"].includes(o.name)){const a=geo.attributes.position;const extension=4.656/(4.048*scale);for(let i=0;i<a.count;i++)if(a.getZ(i)>-.1)a.setZ(i,-.1+(a.getZ(i)+.1)*extension);geo.computeVertexNormals();}
  geo.applyMatrix4(transform);
  if(['Object_2','Object_7'].includes(o.name)){tracks.belts.push(surfaceBelt(scene,geo,o.material));source.dispose();return;}
  if(['Object_3','Object_22'].includes(o.name)){collect(barrel,geo,o.material);source.dispose();return;}
  if(['Object_8','Object_9','Object_10','Object_11'].includes(o.name)){collect(turret,geo,o.material);source.dispose();return;}
  if(/^Object_1[2-7]$/.test(o.name)){
   for(const c of components(new THREE.Mesh(source))){const p=c.box.getCenter(new THREE.Vector3()),size=c.box.getSize(new THREE.Vector3());let parent=scene;
    if(Math.abs(p.x)>1&&size.y<.9&&size.z<.9){const candidates=wheels.filter(w=>Math.sign(w.source[0])===Math.sign(p.x));const w=candidates.sort((a,b)=>Math.hypot(p.y-a.source[1],p.z-a.source[2])-Math.hypot(p.y-b.source[1],p.z-b.source[2]))[0];let radial=0;for(const i of c.indices)radial=Math.max(radial,Math.hypot(source.attributes.position.getY(i)-w.source[1],source.attributes.position.getZ(i)-w.source[2]));if(radial<=w.radius/scale+.04)parent=w.pivot;}
    collect(parent,geometry(source,c.indices).applyMatrix4(transform),o.material);
   }geo.dispose();
  }else collect(scene,geo,o.material);
  source.dispose();
 });
 for(const[parent,entries]of batches){batchParts(parent,entries);for(const e of entries)e.geo.dispose();}
 const rolling=wheels.filter(w=>w.pivot.children.length);for(const w of wheels)if(!w.pivot.children.length)w.pivot.removeFromParent();
 if(tracks.belts.length!==2||rolling.length<16)throw Error('SU-100P rig incomplete: '+rolling.length+' wheels, '+tracks.belts.length+' belts');
 return{node:scene,model:true,turret,barrel,turretAxis:'y',barrelSign:1,mainGun:'artillery',wheels:rolling,tracks,source:'User supplied SU-100P'};
}
