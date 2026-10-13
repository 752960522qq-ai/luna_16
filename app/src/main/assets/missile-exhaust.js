import * as T from './three.module.js';
import {FLAME_SEQUENCE as spec} from './effects/flame-sequence.js';
// Crossed planes follow the missile's local +Z tail; no camera-facing flame drift.
export class MissileExhaust {
 constructor(loader=new T.TextureLoader()){this.texture=null;this.ready=loader.loadAsync(spec.path).then(texture=>{texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=T.LinearFilter;this.texture=texture;}).catch(error=>{this.error=String(error);});}
 attach(root){const bounds=new T.Box3().setFromObject(root),tail=bounds.max.z,uv={value:new T.Vector4()},material=new T.MeshBasicMaterial({map:this.texture,transparent:true,depthWrite:false,toneMapped:false,side:T.DoubleSide,blending:spec.additive?T.AdditiveBlending:T.NormalBlending});
 material.onBeforeCompile=shader=>{shader.uniforms.flameUV=uv;shader.fragmentShader='uniform vec4 flameUV;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',T.ShaderChunk.map_fragment.replace(/vMapUv/g,'(vMapUv * flameUV.zw + flameUV.xy)'));};material.customProgramCacheKey=()=> 'missile-flame-v1';
 const group=new T.Group();group.name='missileExhaust';group.position.z=tail+.65;for(const angle of [0,Math.PI/2]){const plane=new T.Mesh(new T.PlaneGeometry(.65,1.5),material);plane.userData.flightDecoration=true;plane.rotation.x=Math.PI/2;plane.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),angle));group.add(plane);}root.add(group);root.userData.exhaust={group,material,uv};this.update(root,0);}
 update(root,time){const {group,material,uv}=root.userData.exhaust;group.visible=!!this.texture;if(!this.texture)return;if(material.map!==this.texture){material.map=this.texture;material.needsUpdate=true;}const frame=Math.floor(time*40)%spec.frames;uv.value.set((frame%8*196+2)/1568,1-(Math.floor(frame/8)*196+194)/1176,192/1568,192/1176);group.scale.setScalar(.9+.1*Math.sin(time*53));}
}
