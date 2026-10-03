'use strict';
const assert = require('node:assert/strict');
const { Engine, dist } = require('../app/src/main/assets/engine.js');
const tests=[];
function test(name, fn){tests.push([name,fn]);}
function game(){return new Engine({seed:17,mode:'lan',countdown:0});}
function advance(e,seconds){for(let t=0;t<seconds;t+=1/60)e.update(1/60);}

test('random spawns, both perspectives initially hide the other launcher',()=>{
  for(let seed=1;seed<100;seed++){
    const e=new Engine({seed,mode:'lan'});
    assert.ok(dist(e.players[0],e.players[1])>=600);
    for(const id of [0,1]){const s=e.snapshot(id);assert.equal(s.enemy,null);assert.equal(s.clues.length,0);assert.equal(s.own.hp,100);assert.equal(s.shots.length,0);}
  }
});
test('commands reject invalid coordinates, cooldowns and moving fire',()=>{
  const e=game(),p=e.players[0];assert.equal(e.command(0,{type:'missile',x:NaN,y:500}).ok,false);
  assert.equal(e.command(0,{type:'uav',x:500,y:500}).ok,true);
  assert.equal(e.command(0,{type:'uav',x:500,y:500}).ok,false);
  assert.equal(e.command(0,{type:'move',x:p.x>400?40:760,y:p.y>600?40:1160}).ok,true);
  assert.ok(dist(p,p.destination)<=210.001);
  assert.equal(e.command(0,{type:'artillery',x:400,y:500}).ok,false);
  assert.equal(e.command(0,{type:'sam'}).ok,false);
  advance(e,4.6);assert.equal(p.destination,null);assert.equal(e.command(0,{type:'artillery',x:400,y:500}).ok,true);
});
test('UAV travels, detects, can be shot down, precision expires and ghost stays stale',()=>{
  const e=game();Object.assign(e.players[0],{x:300,y:950});Object.assign(e.players[1],{x:400,y:280});
  e.command(0,{type:'uav',x:400,y:280});const drone=e.shots[0];assert.equal(drone.y,950);
  advance(e,6);assert.ok(drone.y<500);assert.ok(e.snapshot(0).enemy.precise);
  const before={...e.snapshot(0).enemy};e.intercept(drone,1);advance(e,.1);
  assert.ok(e.snapshot(0).clues.some(c=>c.kind==='probe'));
  e.players[1].x+=200;advance(e,5.5);
  const stale=e.snapshot(0).enemy;assert.equal(stale.precise,false);assert.equal(stale.x,before.x);assert.equal(stale.hp,null);
  advance(e,17);assert.equal(e.snapshot(0).enemy,null);
});
test('hostile trajectory evidence contains no launch origin, destination or hidden current position',()=>{
  const e=game();const a=e.players[0],b=e.players[1];e.command(1,{type:'missile',x:a.x,y:a.y});advance(e,.8);
  const s=e.snapshot(0);assert.ok(s.clues.some(c=>c.kind==='direction'));
  assert.equal(s.enemy,null);assert.ok(s.shots.length);
  for(const shot of s.shots){assert.equal(shot.mine,false);for(const k of ['sx','sy','tx','ty','targetId','owner'])assert.equal(k in shot,false);assert.ok(shot.trail.every(p=>dist(p,b)>100));}
  assert.equal('players' in s,false);
});
test('direct missile and artillery damage, ending and result perspective',()=>{
  const e=game();Object.assign(e.players[0],{x:200,y:950});Object.assign(e.players[1],{x:400,y:300});
  e.command(0,{type:'missile',x:400,y:300});advance(e,3.2);assert.equal(e.players[1].hp,20);
  e.command(0,{type:'artillery',x:400,y:300});advance(e,1.2);assert.equal(e.players[1].hp,0);
  assert.equal(e.snapshot(0).outcome,'win');assert.equal(e.snapshot(1).outcome,'loss');assert.equal(e.players[0].stats.damage,100);
});
test('SAM intercepts air targets and never consumes a shot on artillery',()=>{
  const e=game();Object.assign(e.players[0],{x:400,y:900});
  const s=e.projectile('missile',1,{x:700,y:900},{x:400,y:900},245);s.distance=150;advance(e,.1);
  e.random=()=>0;assert.equal(e.command(0,{type:'sam'}).ok,true);advance(e,1.5);
  assert.equal(e.players[0].hp,100);assert.equal(e.players[0].stats.intercepted,1);assert.ok(e.players[0].cd.sam>0);
  const f=game();const a=f.players[0];f.projectile('artillery',1,{x:a.x+200,y:a.y},{x:a.x,y:a.y},820);
  assert.equal(f.threats(0,300).length,0);assert.equal(f.command(0,{type:'sam'}).ok,false);assert.equal(f.players[0].cd.sam,0);
});
test('continuous MG has no cooldown, stops on release and intercepts drones',()=>{
  const e=game();Object.assign(e.players[0],{x:400,y:900});e.random=()=>0;
  const u=e.projectile('uav',1,{x:500,y:900},{x:500,y:900},100);u.state='orbit';u.distance=200;u.tx=470;
  e.command(0,{type:'mg',active:true});advance(e,1);assert.equal(e.players[0].stats.intercepted,1);
  e.command(0,{type:'mg',active:false});assert.equal(e.players[0].mg,false);assert.equal('mg' in e.players[0].cd,false);
});
test('decoy mimics a heat source and absorbs strikes without damaging a remote enemy',()=>{
  const e=game();Object.assign(e.players[1],{x:400,y:300});e.command(1,{type:'decoy'});e.players[1].x=700;e.players[1].y=700;
  const u=e.projectile('uav',0,{x:390,y:300},{x:400,y:300},100);e.scout(u);
  assert.equal(e.snapshot(0).enemy.hp,null);assert.equal(e.snapshot(0).enemy.x,400);
  e.explode({x:400,y:300,kind:'missile',owner:0,hp:1});assert.equal(e.players[1].hp,100);assert.equal(e.decoys[0].hp,0);
});
test('unseen enemy coordinates cannot alter AI target choices',()=>{
  const a=new Engine({seed:203,countdown:0}),b=new Engine({seed:203,countdown:0});
  a.players[0].x=45;a.players[0].y=60;b.players[0].x=745;b.players[0].y=1130;
  for(let i=0;i<25;i++)assert.deepEqual(a.aiTarget(a.players[1]),b.aiTarget(b.players[1]));
});
test('time limits and equal HP result in a draw',()=>{const e=game();advance(e,180.2);assert.equal(e.over,true);assert.equal(e.snapshot(0).outcome,'draw');});

let failed=0;for(const [name,fn] of tests){try{fn();console.log('PASS',name);}catch(err){failed++;console.error('FAIL',name,err.message);}}
if(failed)process.exit(1);console.log(`${tests.length} meaningful rules checks passed`);
