import * as T from './three.module.js';
import {floatGeometry,surfaceBelt,batchParts} from './vehicle-parts.js';
import './premium-model-data.js';
const DATA=globalThis.BlindfirePremiumModels||window.BlindfirePremiumModels;
function pieces(raw){raw.updateMatrixWorld(true);const list=[];raw.traverse(o=>{if(o.isMesh)list.push({name:o.name,geo:floatGeometry(o.geometry).applyMatrix4(o.matrixWorld),material:o.material});});return list;}
function base(id){const data=DATA[id],node=new T.Group(),wheels=data.wheels.map(w=>{const pivot=new T.Group();pivot.name=w.name;pivot.position.fromArray(w.pivot);node.add(pivot);return{...w,pivot,axis:'x',axisSign:1};});return{node,wheels,tracks:{belts:[]},data};}
function collectRig(raw,asset,parentFor){const batches=new Map();for(const e of pieces(raw)){
 if(e.name.startsWith('Track_')){asset.tracks.belts.push(surfaceBelt(asset.node,e.geo,e.material));continue;}
 const w=asset.wheels.find(w=>e.name.startsWith(w.name+'_')),parent=w?.pivot||parentFor(e.name)||asset.node;
 if(!batches.has(parent))batches.set(parent,[]);batches.get(parent).push(e);
 }asset.node.updateMatrixWorld(true);for(const[parent,entries]of batches){batchParts(parent,entries);for(const e of entries)e.geo.dispose();}
 asset.wheels=asset.wheels.filter(w=>w.pivot.children.length);if(asset.wheels.length!==20||asset.tracks.belts.length!==2)throw Error('Incomplete '+raw.name+' running gear');return asset;
}
export function articulateJudicator(raw){const a=base('grand_judicator'),turret=new T.Group(),barrel=new T.Group();turret.name='JudicatorTurret';turret.position.fromArray(a.data.mounts.turret);a.node.add(turret);barrel.name='JudicatorElevation';barrel.position.fromArray(a.data.mounts.pivot).sub(turret.position);turret.add(barrel);Object.assign(a,{turret,barrel,model:true,mainGun:'tankCannon',turretAxis:'y',barrelSign:1,source:'Supplied Tiger I'});return collectRig(raw,a,name=>name.startsWith('Turret_')?turret:name.startsWith('Gun_')?barrel:null);}
export function articulateValkyrie(raw){const a=base('silver_valkyrie');a.launchers=['left','right'].map((side,index)=>{const yaw=new T.Group(),pitch=new T.Group(),loaded=new T.Group();yaw.name='Valkyrie_'+side;yaw.position.fromArray(a.data.mounts.launchers[index].pivot);a.node.add(yaw);yaw.add(pitch);pitch.add(loaded);return{side,yaw,pitch,loaded};});const mgYaw=new T.Group(),mgPitch=new T.Group();mgYaw.position.fromArray(a.data.mounts.mg.pivot);a.node.add(mgYaw);mgYaw.add(mgPitch);Object.assign(a,{mgYaw,mgPitch,model:true,mainGun:'missile',source:'Supplied Raketenjagdpanzer 2'});return collectRig(raw,a,name=>{for(const l of a.launchers){if(name.startsWith('Launcher_'+l.side+'_'))return l.pitch;if(name.startsWith('Missile_'+l.side+'_'))return l.loaded;}return name.startsWith('MG_')?mgPitch:null;});}
