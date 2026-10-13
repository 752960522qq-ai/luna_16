import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from '../app/src/main/assets/three.module.js';
import {MissileExhaust} from '../app/src/main/assets/missile-exhaust.js';
import {FLAME_SEQUENCE as spec} from '../app/src/main/assets/effects/flame-sequence.js';
const bytes=fs.readFileSync(new URL('../app/src/main/assets/'+spec.path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),spec.sha256);assert.ok(spec.sourceArchive.startsWith('Flame03'));
const exhaust=new MissileExhaust({loadAsync:async()=>new T.Texture()});await exhaust.ready;
const root=new T.Group();root.add(new T.Mesh(new T.BoxGeometry(.1,.1,1.17)));exhaust.attach(root);const {group,uv}=root.userData.exhaust;assert.equal(group.children.length,2);assert.ok(group.position.z>.585);const normals=group.children.map(plane=>new T.Vector3(0,0,1).applyQuaternion(plane.quaternion));assert.ok(Math.abs(normals[0].dot(normals[1]))<1e-6);for(const t of [0,.4,1.199,1.2,100]){exhaust.update(root,t);const u=uv.value;assert.ok(u.x>=0&&u.y>=0&&u.x+u.z<=1&&u.y+u.w<=1);}
for(const pitch of [-.8,0,.8])for(const yaw of [0,Math.PI/2,Math.PI]){root.rotation.set(0,0,0);root.quaternion.setFromEuler(new T.Euler(pitch,yaw,0,'YXZ'));root.updateMatrixWorld(true);const tail=group.getWorldPosition(new T.Vector3()).normalize(),forward=new T.Vector3(0,0,-1).applyQuaternion(root.quaternion);assert.ok(tail.dot(forward)<-.99);}
console.log('PASS Flame03 archive/hash, bounded 48-frame UV, perpendicular crossed planes and tail attachment across missile pitch/yaw');
