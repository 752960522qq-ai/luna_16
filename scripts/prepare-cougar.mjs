import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,textureCompress,meshopt} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import sharp from 'sharp';
import * as T from '../app/src/main/assets/three.module.js';
await MeshoptDecoder.ready;await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const doc=await io.read('../upload/m53m55_sd_wot.glb'),scene=doc.getRoot().listScenes()[0],source=doc.getRoot().listNodes().filter(n=>n.getMesh()),bounds=new T.Box3();
for(const n of source){const w=new T.Matrix4().fromArray(n.getWorldMatrix());for(const p of n.getMesh().listPrimitives()){const a=p.getAttribute('POSITION').getArray();for(let i=0;i<a.length;i+=3)bounds.expandByPoint(new T.Vector3(...a.slice(i,i+3)).applyMatrix4(w));}}
const sy=3.55/(bounds.max.y-bounds.min.y),sx=3.58/(bounds.max.x-bounds.min.x),cx=(bounds.max.x+bounds.min.x)/2,cz=-.16;
// Keep wheel circles round: the same scale is used along Y and Z. Extend only the forward gun tube to reach the specified overall 9.75 m length.
const transform=new T.Matrix4().makeScale(-sx,sy,-sy).multiply(new T.Matrix4().makeTranslation(-cx,-bounds.min.y,-cz)),rear=-(bounds.min.z-cz)*sy,targetNose=rear-9.75,hinge=-( -.68-cz)*sy,oldNose=-(3.26275-cz)*sy,stretch=(targetNose-hinge)/(oldNose-hinge);
const names=['M53_Turret','M53_Gun','M53_Hull','M53_Wheels','M53_Tracks'];
for(let k=0;k<source.length;k++){const n=source[k],m=new T.Matrix4().multiplyMatrices(transform,new T.Matrix4().fromArray(n.getWorldMatrix())),normal=new T.Matrix3().getNormalMatrix(m);for(const p of n.getMesh().listPrimitives()){
const a=p.getAttribute('POSITION').getArray();for(let i=0;i<a.length;i+=3){const v=new T.Vector3(...a.slice(i,i+3)).applyMatrix4(m);if(k===1&&v.z<hinge)v.z=hinge+(v.z-hinge)*stretch;a[i]=v.x;a[i+1]=v.y;a[i+2]=v.z;}p.getAttribute('POSITION').setArray(a);
const na=p.getAttribute('NORMAL');if(na){const a=na.getArray();for(let i=0;i<a.length;i+=3){const v=new T.Vector3(...a.slice(i,i+3)).applyMatrix3(normal).normalize();a[i]=v.x;a[i+1]=v.y;a[i+2]=v.z;}na.setArray(a);}}
const baked=doc.createNode(names[k]).setMesh(n.getMesh());scene.addChild(baked);n.setMesh(null);}
scene.setExtras({source:'user-supplied m53m55_sd_wot.glb',noseAxis:'-Z',dimensions:[9.75,3.58,3.55],wheelCirclePreserved:true,barrelLengthAdapted:true});
await doc.transform(prune(),dedup(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024]}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
await io.write('app/src/main/assets/models/m53m55.glb',doc);console.log('Prepared M53/M55 with baked -Z forward geometry; circular wheels; independent source meshes');
