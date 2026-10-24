import {FarSceneryMaterials} from './scenery-material-lod.js';
import {simplifyScenery} from './map-lod.js';
import * as THREE from './three.module.js';
import {GLTFLoader} from './GLTFLoader.js';
import {MeshoptDecoder} from './meshopt_decoder.module.js';
export class HillsEnvironment {
 async load(){
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),textureLoader=new THREE.TextureLoader();
  const [tree,grass,...rocks]=await Promise.all(['tree','grass','rock-0','rock-1','rock-2'].map(n=>loader.loadAsync(`models/hills/${n}.glb`)));
  this.models={tree:tree.scene,grass:grass.scene,rocks:rocks.map(r=>r.scene)};
  this.lowTemplates=new WeakMap();
  this.textures={};for(const name of ['grass','wall','asphalt']){const t=await textureLoader.loadAsync(`textures/hills/${name}.webp`);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;this.textures[name]=t;}
 }
 material(name,repeat=1){const map=this.textures[name].clone();map.repeat.set(repeat,repeat);map.needsUpdate=true;const m=new THREE.MeshLambertMaterial({map});m.userData.ownedMap=true;return m;}
 populate(group,B,{lod,rocks=true,grass=true}={}){
  this.farMaterials?.dispose();this.farMaterials=new FarSceneryMaterials();
  const object=new THREE.Object3D(),matrix=new THREE.Matrix4();this.lowTemplates||=new WeakMap();
  const batch=(model,placements,name)=>{
   if(!placements.length)return;
   model.updateMatrixWorld(true);const parts=[];model.traverse(o=>{if(o.isMesh)parts.push(o);});
   // Terrain sampling and placement transforms are computed once, shared by every part.
   const cells=new Map();
   for(const p of placements){
    const key=Math.floor(p.x/200)+','+Math.floor(p.z/200);let cell=cells.get(key);if(!cell)cells.set(key,cell=[]);
    object.position.set(p.x,p.y??B.terrain(p.x,p.z),p.z);object.rotation.set(0,p.yaw||0,0);object.scale.setScalar(p.scale||1);object.updateMatrix();cell.push(object.matrix.clone());
   }
   for(const part of parts){
    const highGeometry=part.geometry.clone(),material=part.material.clone();let lowGeometry=null;
    if(lod){let template=this.lowTemplates.get(part.geometry);if(!template){template=simplifyScenery(part.geometry,name==='concealmentBushes'?20:80);this.lowTemplates.set(part.geometry,template);}lowGeometry=template.clone();}
    for(const cell of cells.values()){
     const mesh=new THREE.InstancedMesh(highGeometry,material,cell.length);mesh.name=name;
     for(let i=0;i<cell.length;i++){matrix.multiplyMatrices(cell[i],part.matrixWorld);mesh.setMatrixAt(i,matrix);}
     mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);
     if(lod){
      const stride=name==='concealmentBushes'?4:1,count=Math.ceil(cell.length/stride),farMaterial=this.farMaterials.material(part.material,name.startsWith('hillsRock')?256:128),low=new THREE.InstancedMesh(lowGeometry,farMaterial,count);low.name=name+'Low';
      for(let i=0;i<count;i++){mesh.getMatrixAt(i*stride,matrix);low.setMatrixAt(i,matrix);}
      low.computeBoundingBox();low.computeBoundingSphere();group.add(low);lod.add(mesh,low,name==='concealmentBushes'?150:250);
     }
    }
   }
  };
  batch(this.models.tree,B.TREES,'hillsTrees');
  if(rocks){const variants=[[],[],[]];for(const rock of B.ROCKS)variants[rock.variant].push(rock);for(let i=0;i<3;i++)batch(this.models.rocks[i],variants[i],'hillsRock'+i);}
  if(grass){const items=[];for(const patch of B.BUSHES)for(let i=0;i<48;i++){const angle=i*2.399963,r=patch.radius*Math.sqrt((i+.5)/48);items.push({x:patch.x+Math.cos(angle)*r,z:patch.z+Math.sin(angle)*r,yaw:angle,scale:.65+.35*(Math.sin(i*7)+1)});}batch(this.models.grass,items,'concealmentBushes');}
 }
}
