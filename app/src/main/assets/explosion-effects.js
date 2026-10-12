import * as THREE from './three.module.js';
import {EXPLOSION_SEQUENCES} from './effects/sequences.js';

// One texture per sequence, reused by every concurrent blast. Per-material UV
// uniforms keep independently aged effects from changing each other's frames.
export class ExplosionEffects {
  constructor(loader=new THREE.TextureLoader()) {
    this.textures=new Map();
    this.ready=Promise.all(Object.entries(EXPLOSION_SEQUENCES).map(async([size,spec])=>{
      const texture=await loader.loadAsync(spec.path);
      texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;
      texture.minFilter=texture.magFilter=THREE.LinearFilter;
      this.textures.set(size,texture);
    }));
  }
  create(effect) {
    const size=effect.visualSize||'medium',spec=EXPLOSION_SEQUENCES[size]||EXPLOSION_SEQUENCES.medium;
    const uv={value:new THREE.Vector4()},material=new THREE.MeshBasicMaterial({
      map:this.textures.get(size)||this.textures.get('medium'),transparent:true,
      depthWrite:false,toneMapped:false,side:THREE.DoubleSide,
      blending:spec.additive?THREE.AdditiveBlending:THREE.NormalBlending
    });
    material.onBeforeCompile=shader=>{
      shader.uniforms.explosionUV=uv;
      shader.fragmentShader='uniform vec4 explosionUV;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
        THREE.ShaderChunk.map_fragment.replace(/vMapUv/g,'(vMapUv * explosionUV.zw + explosionUV.xy)'));
    };
    material.customProgramCacheKey=()=> 'explosion-atlas-v1';
    const node=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);
    node.name='explosion-'+size;node.userData.explosion={spec,uv,size};
    this.update(node,effect);return node;
  }
  update(node,effect) {
    const {spec,uv}=node.userData.explosion;
    const progress=Math.max(0,Math.min(1,effect.age/effect.life));
    const frame=Math.min(spec.frames-1,Math.floor(progress*spec.frames));
    uv.value.set((frame%spec.columns*spec.tile+spec.padding)/(spec.columns*spec.tile),
      1-(Math.floor(frame/spec.columns)*spec.tile+spec.padding+spec.content)/(spec.rows*spec.tile),
      spec.content/(spec.columns*spec.tile),spec.content/(spec.rows*spec.tile));
    node.userData.explosion.frame=frame;
    const diameter=spec.diameter*(effect.visualScale??1);
    node.scale.setScalar(diameter);
    node.position.set(effect.x,effect.y+(effect.grounded?diameter*.28:0),effect.z);
    node.material.opacity=1-THREE.MathUtils.smoothstep(progress,.72,1);
  }
}
