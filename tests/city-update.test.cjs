const assert=require('node:assert/strict'),B=require('../app/src/main/assets/engine.js');
const e=new B.Engine({mode:'tutorial',mapId:'city',vehicles:['longnose_artillery',B.DEFAULT_VEHICLE],countdown:0,seed:49});
assert.equal(B.W,2000);assert.equal(B.H,2000);assert.ok(B.BUILDINGS.length>200);assert.ok(B.BUILDINGS.some(b=>b.h>60));assert.equal(B.clearGround(B.LAKE.x,B.LAKE.z),false);
for(const b of B.BUILDINGS)assert.ok(B.surface(b.x,b.z)>=b.h);
const p=e.players[0],q=e.players[1];Object.assign(p,{x:200,z:400,y:B.terrain(200,400)});Object.assign(q,{x:200,z:410,y:B.terrain(200,410)});e.updateIntel();assert.ok(e.snapshot(0).enemy);q.x=1800;q.z=200;e.t+=7.9;e.updateIntel();assert.ok(e.snapshot(0).enemy);e.t+=.2;e.updateIntel();assert.equal(e.snapshot(0).enemy,null);assert.equal(e.snapshot(0).field.intelLife,8);
new B.Engine({mode:'tutorial',mapId:'hills'});assert.equal(B.BUILDINGS.length,48);assert.equal(B.TREES.length,800);console.log('PASS city collision/high rises/lake, eight-second Bear intel, map restoration');
