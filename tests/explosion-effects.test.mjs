import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import * as T from '../app/src/main/assets/three.module.js';
import {ExplosionEffects} from '../app/src/main/assets/explosion-effects.js';
import {EXPLOSION_SEQUENCES as specs} from '../app/src/main/assets/effects/sequences.js';
const B=createRequire(import.meta.url)('../app/src/main/assets/engine.js');
const effects=new ExplosionEffects({loadAsync:async()=>new T.Texture()});await effects.ready;
let total=0;
for(const [size,spec]of Object.entries(specs)){
 const data=fs.readFileSync(new URL('../app/src/main/assets/'+spec.path,import.meta.url));total+=data.length;
 assert.equal(createHash('sha256').update(data).digest('hex'),spec.sha256);
 assert.equal(spec.frames,48);assert.ok(spec.columns*spec.tile<=2048&&spec.rows*spec.tile<=2048);
 const e={x:0,y:2,z:0,visualSize:size,grounded:true,age:0,life:spec.duration};
 const a=effects.create(e),b=effects.create(e);assert.equal(a.material.map,b.material.map);
 assert.notEqual(a.userData.explosion.uv,b.userData.explosion.uv);
 const shader={uniforms:{},fragmentShader:'#include <map_fragment>'};a.material.onBeforeCompile(shader);
 assert.ok(shader.fragmentShader.includes('vMapUv * explosionUV.zw + explosionUV.xy'));
 for(const progress of [0,.15,.5,.8,1]){effects.update(a,{...e,age:e.life*progress});
  assert.ok(a.userData.explosion.frame>=0&&a.userData.explosion.frame<48);
  const uv=a.userData.explosion.uv.value;assert.ok(uv.x>=0&&uv.y>=0&&uv.x+uv.z<=1&&uv.y+uv.w<=1);
 }
 assert.equal(a.material.opacity,0);assert.equal(b.userData.explosion.frame,0);
 assert.equal(a.material.blending,spec.additive?T.AdditiveBlending:T.NormalBlending);
 const engine=new B.Engine({mode:'lan',mapId:'city',countdown:0});engine.effect({x:1000,y:2,z:1000},'explosion',0,24,size);
 assert.equal(engine.effects[0].life,spec.duration);assert.equal(engine.snapshot(0).effects[0].visualSize,size);
 engine.t=spec.duration;engine.update(.01);assert.equal(engine.effects.length,0);
}
assert.ok(total<1000000);
for(const [vehicle,kind,size]of [['b_tank','tankCannon','small'],['hero_tank','tankCannon','small'],['handlv_missile','missile','medium'],['kfz_artillery','artillery','medium'],['cougar_artillery','artillery','large'],['longnose_artillery','artillery','large'],['kfz_artillery','bomb','large'],['black_turtle','uav','small']]){
 const e=new B.Engine({mode:'lan',countdown:0,mapId:'city',vehicles:[vehicle]});
 e.explode({kind,owner:0,hp:1,x:1000,y:200,z:1000});assert.equal(e.effects.find(x=>x.kind==='explosion').visualSize,size);
}
const capped=new B.Engine({mode:'lan',countdown:0});for(let i=0;i<100;i++)capped.effect({x:0,y:0,z:0},'explosion',0,4,'small');
assert.equal(capped.effects.length,40);assert.equal(capped.effects[0].visualScale,.35);
assert.equal(B.WEAPONS.autocannon.directDamage,17);assert.equal(B.VEHICLES.cougar_artillery.artillery.range,1000);
console.log('PASS three supplied sequences/hashes, 48-frame mobile atlases <1MB, independent shared-texture UVs, alpha/additive blend, fade/removal, bounded effects, weapon size mapping and unchanged damage/range');
