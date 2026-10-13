import * as T from './three.module.js';
const fitCamera=new T.PerspectiveCamera(),box=new T.Box3(),point=new T.Vector3(),corners=[];
export function flightCoverage(camera,model){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;model.updateMatrixWorld(true);model.traverse(o=>{if(!o.isMesh||o.userData.flightDecoration)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();box.copy(o.geometry.boundingBox);for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){point.set(x,y,z).applyMatrix4(o.matrixWorld).project(camera);x0=Math.min(x0,point.x);x1=Math.max(x1,point.x);y0=Math.min(y0,point.y);y1=Math.max(y1,point.y);}});return Math.max((x1-x0)/2,(y1-y0)/2);}
// Fit the flown model rather than using a fixed metre offset across very different asset sizes.
export function frameFlight(camera,model,pilot,direction,desired,target,terrain){
 fitCamera.fov=68;fitCamera.aspect=camera.aspect;fitCamera.near=.04;fitCamera.far=8000;fitCamera.updateProjectionMatrix();model.updateMatrixWorld(true);
 let back=pilot.kind==='uav'?9:2;for(let i=0;i<7;i++){desired.set(pilot.x-direction.x*back,pilot.y-direction.y*back+back*.32,pilot.z-direction.z*back);desired.y=Math.max(desired.y,terrain(desired.x,desired.z)+.12);target.set(pilot.x+direction.x*back*.4,pilot.y+direction.y*back*.4,pilot.z+direction.z*back*.4);fitCamera.position.copy(desired);fitCamera.lookAt(target);fitCamera.updateMatrixWorld();const coverage=flightCoverage(fitCamera,model);if(!Number.isFinite(coverage))break;back=T.MathUtils.clamp(back*Math.sqrt(coverage/.35),.7,40);}
 return back;
}
