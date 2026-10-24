import * as THREE from './three.module.js';
import {mergeGeometries} from './BufferGeometryUtils.js';

// One detailed batch per material/cell; one flat-colour silhouette per distant cell.
// Shells retain the dimensions of every building, including tall chimneys.
export function batchBuildings(groups,landscape,lod,cellSize=250){
 const cells=new Map(),farMaterial=new THREE.MeshLambertMaterial({vertexColors:true});
 const cellFor=g=>{const key=Math.floor(g.position.x/cellSize)+':'+Math.floor(g.position.z/cellSize);let cell=cells.get(key);if(!cell)cells.set(key,cell={batches:new Map(),shells:[]});return cell;};
 for(const group of groups){
  group.updateMatrixWorld(true);const cell=cellFor(group);
  // Main wall and roof are always the first two meshes, detail stays near-only.
  const shellMeshes=new Set(group.children.slice(0,2));
  group.traverse(mesh=>{
   if(!mesh.isMesh)return;
   const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),material=mesh.material;
   let batch=cell.batches.get(material);if(!batch)cell.batches.set(material,batch=[]);batch.push(geometry);
   if(shellMeshes.has(mesh)){
    const shell=geometry.clone(),count=shell.attributes.position.count,colors=new Float32Array(count*3),color=material.color;
    for(let i=0;i<count;i++){colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b;}
    shell.setAttribute('color',new THREE.BufferAttribute(colors,3));cell.shells.push(shell);
   }
   mesh.geometry.dispose();
  });
 }
 for(const cell of cells.values()){
  const hi=[];
  for(const [material,parts]of cell.batches){const mesh=new THREE.Mesh(mergeGeometries(parts),material);mesh.name='buildingDetail';mesh.geometry.computeBoundingSphere();landscape.add(mesh);hi.push(mesh);for(const p of parts)p.dispose();}
  const low=new THREE.Mesh(mergeGeometries(cell.shells),farMaterial);low.name='buildingSilhouette';low.geometry.computeBoundingSphere();landscape.add(low);for(const p of cell.shells)p.dispose();lod.add(hi,low,380);
 }
 if(!cells.size)farMaterial.dispose();
 return cells.size;
}

export function freezeStaticScenery(group){
 group.updateMatrixWorld(true);
 group.traverse(node=>{node.matrixAutoUpdate=false;node.matrixWorldAutoUpdate=false;});
}
