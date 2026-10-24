import * as T from './three.module.js';
import{mergeGeometries}from './BufferGeometryUtils.js';
const models=new Map();
// A sub-22-pixel distant vehicle needs a silhouette, not individually animated wheels.
export function lowVehicle(spec,friendly=false){const key=spec.id+':'+friendly;let source=models.get(key);if(!source){const {width:w,length:l,height:h}=spec.dimensions,body=[],dark=[];
 const box=(list,width,height,length,x,y,z)=>list.push(new T.BoxGeometry(width,height,length).translate(x,y,z));
 box(body,w*.84,h*.5,l*.76,0,h*.45,0);if(spec.id==='crimson_steel')body.push(new T.SphereGeometry(1,8,4).scale(w*.4,h*.25,l*.23).translate(0,h*.78,-l*.01));else box(body,w*.5,h*.27,l*.35,0,h*.81,-l*.06);
 box(dark,w*.19,h*.3,l*.82,-w*.4,h*.17,0);box(dark,w*.19,h*.3,l*.82,w*.4,h*.17,0);
 if(spec.branch==='missile')box(body,w*.55,h*.18,l*.37,0,h*.97,-l*.02);else box(body,.14,.14,l*.55,0,h*.85,-l*.43);
 source=new T.Group();source.name='distantVehicleSilhouette';for(const [parts,color]of [[body,friendly?'#536b54':'#725a45'],[dark,'#303b35']]){const geometry=mergeGeometries(parts);for(const g of parts)g.dispose();source.add(new T.Mesh(geometry,new T.MeshLambertMaterial({color})));}models.set(key,source);}
 return source.clone(true);
}
export function useLowVehicle(camera,p,spec,viewportHeight,previous=false){const d=spec.dimensions,extent=Math.max(d.width,d.height,d.length),distance=Math.hypot(camera.position.x-p.x,camera.position.y-p.y,camera.position.z-p.z),pixels=extent*Math.max(1,viewportHeight)*(camera.zoom||1)/(Math.max(.1,distance)*2*Math.tan(camera.fov*Math.PI/360));return pixels<(previous?27:22);}
