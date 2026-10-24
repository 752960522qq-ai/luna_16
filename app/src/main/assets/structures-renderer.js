import * as THREE from './three.module.js';
import {GLTFLoader} from './GLTFLoader.js';
import {MeshoptDecoder} from './meshopt_decoder.module.js';
// Shared immutable geometry/textures; only team indicators are per-instance.
export class StructureRenderer{
 constructor(scene){this.scene=scene;this.models={};this.instances=new Map();const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);this.ready=Promise.all(['outpost','base_bunker'].map(async id=>{this.models[id]=(await loader.loadAsync(`models/${id}.glb`)).scene;}));}
 labels(structures,camera,now=performance.now()){
  if(now-(this.lastLabels??-Infinity)<100)return;this.lastLabels=now;
  this.overlay||=(()=>{const el=document.createElement('div');el.className='structure-dots';document.getElementById('battle').appendChild(el);return el;})();this.labelNodes||=new Map();this.labelPoint||=new THREE.Vector3();
  const ids=new Set();for(const s of structures){
   ids.add(s.id);let node=this.labelNodes.get(s.id);if(!node){node=document.createElement('span');node.className='structure-dot '+(s.team===0?'blue':'red');this.labelNodes.set(s.id,node);this.overlay.appendChild(node);}
   const q=this.labelPoint.set(s.x,s.y+s.h+2,s.z),dx=camera.position.x-s.x,dy=camera.position.y-s.y,dz=camera.position.z-s.z;
   if(dx*dx+dy*dy+dz*dz>850*850){node.hidden=true;continue;}
   q.project(camera);node.hidden=q.z<0||q.z>1||Math.abs(q.x)>1||Math.abs(q.y)>1;
   if(!node.hidden){const left=(q.x*.5+.5)*100+'%',top=(-q.y*.5+.5)*100+'%';if(node.style.left!==left)node.style.left=left;if(node.style.top!==top)node.style.top=top;}
   const text=(s.team===0?'蓝方':'红方')+' '+s.label+' '+s.hp+'/'+s.maxHp;if(node.dataset.text!==text){node.dataset.text=text;node.textContent=text;}
  }
  for(const[id,node]of this.labelNodes)if(!ids.has(id)){node.remove();this.labelNodes.delete(id);}
 }

 update(structures=[]){const active=new Set();for(const s of structures){active.add(s.id);let g=this.instances.get(s.id);if(!g&&this.models[s.model]){const asset=this.models[s.model].clone(true),bounds=new THREE.Box3().setFromObject(asset),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=new THREE.Vector3(s.w/size.x,s.h/size.y,s.d/size.z);asset.scale.multiply(scale);asset.position.add(new THREE.Vector3(-center.x*scale.x,-bounds.min.y*scale.y,-center.z*scale.z));g=new THREE.Group();g.add(asset);g.userData.structureAsset=asset;g.name='structure-'+s.id;const foundation=new THREE.Mesh(new THREE.BoxGeometry(s.w,6,s.d),new THREE.MeshLambertMaterial({color:'#686b67'}));foundation.position.y=-3;g.add(foundation);const flag=new THREE.Mesh(new THREE.BoxGeometry(4,2,.15),new THREE.MeshBasicMaterial({color:s.team===0?'#5bb9ff':'#ff6464'}));flag.position.set(0,s.h+1,0);g.add(flag);this.instances.set(s.id,g);this.scene.add(g);}if(g){g.visible=true;g.position.set(s.x,s.y,s.z);g.rotation.y=s.yaw;g.scale.y=s.hp>0?1:.2;}}for(const[id,g]of this.instances)if(!active.has(id))g.visible=false;}
}
