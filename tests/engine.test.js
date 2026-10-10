const assert=require('node:assert/strict');
const {Engine,vehicleSpec,artilleryParams,C,W,H,RECON_RANGE,RECON_RANGES,INTEL_LIFE,terrain,dist,dist3,ballistic,muzzle,GRAVITY,SHELL_SPEED,TRAIL_LIFE,ARTILLERY,ORBIT_RADIUS}=require('../app/src/main/assets/engine.js');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
// Full-loadout fixture exercises the reserved artillery implementation for future vehicles.
function setup(opts={}){const e=new Engine({seed:42,mode:'lan',vehicles:['handlv_missile','handlv_missile'],countdown:0,...opts});for(const[p,x,z]of[[e.players[0],400,1030],[e.players[1],630,120]]){Object.assign(p,{x,z,y:terrain(x,z),yaw:0});for(const a of Object.values(p.aim))a.yaw=0;}for(const p of e.players)p.weapons.push('artillery');return e;}
function tick(e,time){for(let t=0;t<time-1e-8;t+=1/120)e.update(Math.min(1/120,time-t));}
function weapon(e,id,k,yaw=0,pitch=.24){assert.equal(e.command(id,{type:'vehicle'}).ok,true);assert.equal(e.command(id,{type:'select',weapon:k}).ok,true);assert.equal(e.command(id,{type:'aim',yaw,pitch}).ok,true);}
function target(e,position){weapon(e,1,'uav',0,.1);const r=e.command(1,{type:'fire'});const s=e.shots.find(s=>s.id===r.id);Object.assign(s,position,{speed:0});return s;}
test('random separated spawns and completely hidden initial enemy',()=>{for(let seed=1;seed<=50;seed++){const e=new Engine({seed,mode:'lan'});assert.ok(dist(e.players[0],e.players[1])>950);for(let id=0;id<2;id++){const v=e.snapshot(id);assert.equal(v.enemy,null);assert.equal(v.own.hp,100);assert.equal(v.shots.length,0);assert.equal(v.version,9);}}assert.equal('decoy' in C,false);});
test('the physical field is exactly 2km by 2km and all spawns cover it',()=>{assert.equal(W,2000);assert.equal(H,2000);assert.equal(RECON_RANGE,300);assert.equal(INTEL_LIFE,5);const xs=[],zs=[];for(let seed=1;seed<=80;seed++){const e=new Engine({seed,mode:'lan'});for(const p of e.players){assert.ok(p.x>0&&p.x<W&&p.z>0&&p.z<H);xs.push(p.x);zs.push(p.z);}}assert.ok(Math.max(...xs)>1700&&Math.max(...zs)>1700);const e=setup(),p=e.players[0];Object.assign(p,{x:1990,z:1990,yaw:Math.PI/2,speed:33});e.command(0,{type:'control',throttle:1,steer:0});tick(e,.5);assert.ok(p.x<=1990);});
test('vehicle 300m boundary reveals enemies and removes world/radar intel together after 5 seconds',()=>{const e=setup(),p=e.players[0],foe=e.players[1];Object.assign(foe,{x:p.x,z:p.z-301,y:p.y});e.updateIntel();assert.equal(e.snapshot(0).enemy,null);foe.z=p.z-300;e.updateIntel();assert.equal(e.snapshot(0).enemy.retained,false);const last=foe.z;foe.z=p.z-330;e.updateIntel();assert.equal(e.snapshot(0).enemy.z,last);tick(e,4.8);assert.ok(e.snapshot(0).enemy);tick(e,.25);assert.equal(e.snapshot(0).enemy,null);});
test('UAV 400m and cruise missile 200m boundaries preserve five-second intel from either camera',()=>{
 for(const [kind,range]of[['uav',400],['missile',200]])for(const id of[0,1]){
  const e=setup(),foe=e.players[1-id];weapon(e,id,kind);const r=e.command(id,{type:'fire'}),s=e.shots.find(s=>s.id===r.id);
  Object.assign(s,{x:foe.x+range+1,y:foe.y+4,z:foe.z,speed:0,pitch:0});e.updateIntel();assert.equal(e.snapshot(id).enemy,null);
  s.x=foe.x+range;e.updateIntel();assert.equal(e.snapshot(id).enemy.retained,false);assert.equal(e.snapshot(id).own.pilot,r.id);
  e.command(id,{type:'vehicle'});e.updateIntel();assert.equal(e.snapshot(id).enemy.retained,false);
  const last=foe.x;s.x=foe.x+range+1;foe.z-=5;e.updateIntel();assert.equal(e.snapshot(id).enemy.retained,true);assert.equal(e.snapshot(id).enemy.x,last);
  s.hp=0;e.removeDead();tick(e,4.8);assert.ok(e.snapshot(id).enemy);tick(e,.25);assert.equal(e.snapshot(id).enemy,null);
  assert.deepEqual(e.snapshot(id).field.reconRanges,RECON_RANGES);
 }
});
test('overlapping vehicle, UAV and missile recon expires only after every live sensor loses contact',()=>{
 const e=setup(),p=e.players[0],foe=e.players[1];Object.assign(p,{x:1000,z:1600,y:terrain(1000,1600)});Object.assign(foe,{x:1000,z:1100,y:terrain(1000,1100)});
 weapon(e,0,'uav');const uid=e.command(0,{type:'fire'}).id,u=e.shots.find(s=>s.id===uid);Object.assign(u,{x:1300,y:foe.y+4,z:foe.z,speed:0,pitch:0});
 weapon(e,0,'missile');const mid=e.command(0,{type:'fire'}).id,m=e.shots.find(s=>s.id===mid);Object.assign(m,{x:1199,y:foe.y+4,z:foe.z,speed:0,pitch:0});e.updateIntel();assert.equal(e.snapshot(0).enemy.retained,false);
 u.hp=0;e.removeDead();e.updateIntel();assert.equal(e.snapshot(0).enemy.retained,false);
 m.x=1201;e.updateIntel();assert.equal(e.snapshot(0).enemy.retained,true);Object.assign(p,{z:1400,y:foe.y});e.updateIntel();assert.equal(e.snapshot(0).enemy.retained,false);
});
test('continuous detection refreshes the five-second clock and reacquisition refreshes stale intel',()=>{const e=setup(),p=e.players[0],foe=e.players[1];Object.assign(foe,{x:p.x+100,z:p.z,y:terrain(p.x+100,p.z)});tick(e,6);assert.ok(e.snapshot(0).enemy);assert.equal(e.snapshot(0).enemy.retained,false);foe.x=p.x+400;tick(e,3);assert.ok(e.snapshot(0).enemy.left<2.1);foe.x=p.x+100;tick(e,.05);assert.equal(e.snapshot(0).enemy.retained,false);assert.ok(e.snapshot(0).enemy.left>4.9);foe.x=p.x+400;tick(e,4.9);assert.ok(e.snapshot(0).enemy);tick(e,.2);assert.equal(e.snapshot(0).enemy,null);});
test('detected enemy air contacts retain only their last known pose for 5 seconds',()=>{const e=setup(),p=e.players[0],q=target(e,{x:p.x,y:p.y+40,z:p.z-200});e.updateIntel();const seen=e.snapshot(0).shots.find(s=>s.id===q.id);assert.ok(seen&&!seen.mine);q.x=p.x+700;e.updateIntel();const retained=e.snapshot(0).shots.find(s=>s.id===q.id);assert.equal(retained.x,seen.x);assert.equal(retained.retained,true);q.hp=0;e.removeDead();tick(e,4.9);assert.ok(e.snapshot(0).shots.some(s=>s.id===q.id));tick(e,.2);assert.equal(e.snapshot(0).shots.some(s=>s.id===q.id),false);});
test('manual drive, terrain height, input timeout and moving fire restriction',()=>{const e=setup(),p=e.players[0],z=p.z;e.command(0,{type:'control',throttle:1,steer:.2});tick(e,.3);assert.ok(p.z<z-3);assert.ok(p.yaw>0);assert.equal(p.y,terrain(p.x,p.z));assert.equal(e.command(0,{type:'fire'}).ok,false);tick(e,1.6);assert.equal(p.drive.throttle,0);assert.ok(p.speed<1);});
test('artillery physics matches the parabolic preview and cooldown',()=>{const e=setup(),p=e.players[0];Object.assign(p,{z:1800,y:terrain(p.x,1800)});weapon(e,0,'artillery',0,.65);const arc=ballistic(p),m=muzzle(p,'artillery');assert.ok(arc.hit);assert.ok(arc.range>600);assert.equal(e.command(0,{type:'fire'}).ok,true);assert.equal(p.pilot,null);assert.equal(e.command(0,{type:'fire'}).ok,false);tick(e,.7);const s=e.shots.find(s=>s.kind==='artillery');assert.ok(Math.abs(s.y-(m.y+Math.sin(p.aim.artillery.pitch)*artilleryParams(p).speed*.7-.5*GRAVITY*.7*.7))<.01);tick(e,arc.time-.7+.08);const crater=e.effects.find(e=>e.kind==='crater');assert.ok(crater);assert.ok(dist(crater,arc.hit)<.05,`preview error ${dist(crater,arc.hit)}`);assert.equal(p.stats.launches,1);});
test('white trails remain after impact and each segment expires after 8 seconds',()=>{const e=setup(),p=e.players[0];Object.assign(p,{z:1800,y:terrain(p.x,1800)});weapon(e,0,'artillery',0,1.0);const arc=ballistic(p),r=e.command(0,{type:'fire'});tick(e,arc.time+.08);assert.equal(e.shots.some(s=>s.id===r.id),false);assert.ok(e.snapshot(0).trails.some(t=>t.id===r.id));const last=e.trails.find(t=>t.id===r.id).points.at(-1).t;tick(e,last+TRAIL_LIFE-e.t+.05);assert.equal(e.snapshot(0).trails.some(t=>t.id===r.id),false);});
test('missile and UAV launch into their own manually piloted chase state',()=>{for(const k of ['missile','uav']){const e=setup();weapon(e,0,k,0,.3);const r=e.command(0,{type:'fire'}),p=e.players[0];assert.equal(p.pilot,r.id);const s=e.shots.find(s=>s.id===r.id);const yaw=s.yaw;e.command(0,{type:'control',throttle:.5,steer:.6});tick(e,.3);assert.ok(s.yaw>yaw+.15);assert.ok(s.pitch>.4);assert.equal(e.snapshot(0).own.pilot,r.id);e.command(0,{type:'vehicle'});assert.equal(p.pilot,null);assert.ok(e.shots.some(s=>s.id===r.id));}});
test('UAV can be reacquired and reveals heat with five-second retention',()=>{const e=setup();weapon(e,0,'uav',0,.3);const r=e.command(0,{type:'fire'}),s=e.shots.find(s=>s.id===r.id),foe=e.players[1];assert.equal(e.snapshot(0).enemy,null);Object.assign(s,{x:foe.x,z:foe.z+60,y:foe.y+65,pitch:0});tick(e,.1);assert.equal(e.snapshot(0).enemy.precise,true);assert.equal(e.players[0].stats.detections,1);e.command(0,{type:'vehicle'});assert.equal(e.command(0,{type:'pilot',id:s.id}).ok,true);s.hp=0;tick(e,.1);assert.equal(e.players[0].pilot,null);tick(e,4.8);assert.equal(e.snapshot(0).enemy.retained,true);tick(e,.3);assert.equal(e.snapshot(0).enemy,null);});
test('manual missile direct hit gives 80 damage without automatic targeting',()=>{const e=setup(),p=e.players[0],foe=e.players[1];Object.assign(foe,{x:p.x,z:p.z-200,y:terrain(p.x,p.z-200)});const pitch=Math.atan2(foe.y+vehicleSpec(foe.vehicleId).dimensions.height/2-(p.y+1.65),200);weapon(e,0,'missile',0,pitch);e.command(0,{type:'fire'});tick(e,1.5);assert.equal(foe.hp,20);assert.equal(p.stats.damage,80);assert.equal(p.pilot,null);});
test('automatic SAM ignores manual aim, keeps vehicle view and reloads for 25 seconds',()=>{const e=setup(),p=e.players[0],q=target(e,{x:p.x,y:p.y+38,z:p.z-140});weapon(e,0,'sam',Math.PI/2,.3);const r=e.command(0,{type:'fire'});assert.equal(r.ok,true);assert.equal(p.pilot,null);assert.equal(p.cd.sam,25);assert.equal(e.shots.find(s=>s.id===r.id).targetId,q.id);assert.equal(e.command(0,{type:'pilot',id:r.id}).ok,false);tick(e,.75);assert.equal(e.shots.some(s=>s.id===q.id),false);assert.equal(p.stats.intercepted,1);assert.ok(e.players[1].intel.clues.some(c=>c.kind==='probe'));tick(e,24.15);target(e,{x:p.x,y:p.y+38,z:p.z-140});assert.equal(e.command(0,{type:'fire'}).ok,false);tick(e,.15);assert.equal(e.command(0,{type:'fire'}).ok,true);});
test('automatic SAM turns and intercepts a moving airborne target',()=>{const e=setup(),p=e.players[0],q=target(e,{x:p.x+80,y:p.y+85,z:p.z-220,speed:58,yaw:1.1,pitch:.05});weapon(e,0,'sam',-2,1.3);assert.equal(e.command(0,{type:'fire'}).ok,true);tick(e,1.7);assert.equal(e.shots.some(s=>s.id===q.id),false);assert.equal(p.stats.intercepted,1);});
test('automatic SAM needs an actual airborne target and prioritizes missiles',()=>{const e=setup(),p=e.players[0];weapon(e,0,'sam');assert.equal(e.command(0,{type:'fire'}).ok,false);assert.equal(p.cd.sam,0);const drone=target(e,{x:p.x,y:p.y+40,z:p.z-120});weapon(e,1,'missile');const r=e.command(1,{type:'fire'}),missile=e.shots.find(s=>s.id===r.id);Object.assign(missile,{x:p.x+80,y:p.y+70,z:p.z-150});assert.equal(e.samTarget(0,{...p,y:p.y+5.7}).id,missile.id);assert.notEqual(drone.id,missile.id);});
test('MG only hits along the manually aimed barrel; no cooldown',()=>{const e=setup(),p=e.players[0],q=target(e,{x:p.x+95,y:p.y+40,z:p.z-120});weapon(e,0,'mg',0,.2);e.command(0,{type:'mg',active:true});tick(e,.75);assert.equal(q.hp,27);const yaw=Math.atan2(95,120),pitch=Math.atan2(40-5.7,Math.hypot(95,120));e.command(0,{type:'aim',yaw,pitch});tick(e,.8);assert.equal(e.shots.some(s=>s.id===q.id),false);assert.equal(p.stats.intercepted,1);assert.equal(p.cd.mg,0);e.command(0,{type:'mg',active:false});});
test('artillery cannot be selected or intercepted by automatic air defense',()=>{const e=setup();weapon(e,1,'artillery',0,.6);const r=e.command(1,{type:'fire'}),q=e.shots.find(s=>s.id===r.id),p=e.players[0];Object.assign(q,{x:p.x,y:p.y+38,z:p.z-140,vx:0,vy:0,vz:0});weapon(e,0,'sam');assert.equal(e.command(0,{type:'fire'}).ok,false);tick(e,.6);assert.ok(e.shots.some(s=>s.id===q.id));assert.equal(p.stats.intercepted,0);});
test('unobserved enemy position, launcher origin and commands are not transmitted',()=>{const e=setup();weapon(e,1,'missile',Math.PI,.35);e.command(1,{type:'fire'});tick(e,1);const v=e.snapshot(0);assert.equal(v.enemy,null);for(const s of v.shots.filter(s=>!s.mine))for(const k of ['owner','sx','sy','sz','tx','ty','tz','targetId','hp','remaining'])assert.equal(k in s,false);assert.equal('decoys' in v,false);assert.equal(e.command(0,{type:'decoy'}).ok,false);assert.equal(e.command(0,{type:'aim',yaw:NaN,pitch:0}).ok,false);assert.equal(e.command(0,{type:'control',throttle:Infinity,steer:0}).ok,false);});
test('AI searches with its own information instead of reading the hidden opponent',()=>{const a=setup({mode:'ai'}),b=setup({mode:'ai'});for(const e of[a,b]){const p=e.players[1];Object.assign(p,{x:170,z:180,y:terrain(170,180)});}Object.assign(a.players[0],{x:750,z:1120,y:terrain(750,1120)});Object.assign(b.players[0],{x:680,z:1090,y:terrain(680,1090)});tick(a,2);tick(b,2);assert.deepEqual(a.players[1].aim,b.players[1].aim);assert.deepEqual(a.shots.map(s=>[s.kind,s.x,s.y,s.z,s.yaw,s.pitch]),b.shots.map(s=>[s.kind,s.x,s.y,s.z,s.yaw,s.pitch]));assert.equal(a.players[1].intel.lock,null);});
test('bounded snapshot, full round completion and HP outcome',()=>{const e=setup();for(let i=0;i<180*30;i++){e.update(1/30);if(i%150===0){for(let id=0;id<2;id++){const p=e.players[id];weapon(e,id,'artillery',id?Math.PI:0,.6);e.command(id,{type:'fire'});}assert.ok(Buffer.byteLength(JSON.stringify(e.snapshot(1)))<65536);}}tick(e,.1);assert.equal(e.over,true);assert.equal(e.winner,null);assert.equal(e.snapshot(0).outcome,'draw');});
test('artillery mode changes aim limits with a shared physical muzzle speed while preserving shared reload',()=>{
 const e=setup(),p=e.players[0];weapon(e,0,'artillery');
 assert.equal(e.command(0,{type:'artillery-mode',mode:'direct'}).ok,true);assert.equal(p.aim.artillery.pitch,.08);
 e.command(0,{type:'aim',yaw:0,pitch:-1});assert.equal(p.aim.artillery.pitch,ARTILLERY.direct.minPitch);
 e.command(0,{type:'aim',yaw:0,pitch:1});assert.equal(p.aim.artillery.pitch,ARTILLERY.direct.maxPitch);
 const r=e.command(0,{type:'fire'});assert.equal(e.shots.find(s=>s.id===r.id).speed,artilleryParams(p).speed);assert.equal(p.cd.artillery,5);
 assert.equal(e.command(0,{type:'artillery-mode',mode:'curve'}).ok,true);assert.equal(p.cd.artillery,5);assert.equal(e.command(0,{type:'fire'}).ok,false);
 assert.equal(e.command(0,{type:'artillery-mode',mode:'invalid'}).ok,false);e.command(0,{type:'aim',yaw:0,pitch:0});assert.equal(p.aim.artillery.pitch,ARTILLERY.curve.minPitch);
 weapon(e,0,'missile');assert.equal(e.command(0,{type:'artillery-mode',mode:'direct'}).ok,false);
});
test('curve reaches about 1.2km and both modes land at their preview',()=>{
 for(const[mode,pitch]of[['curve',Math.PI/4],['direct',.12]]){
  const e=setup(),p=e.players[0];Object.assign(p,{x:1000,z:1880,y:terrain(1000,1880)});weapon(e,0,'artillery');e.command(0,{type:'artillery-mode',mode});e.command(0,{type:'aim',yaw:0,pitch});
  const arc=ballistic(p);assert.ok(arc.hit);if(mode==='curve'){assert.ok(arc.range>1170&&arc.range<1240);assert.ok(Math.max(...arc.points.map(q=>q.y))>200);}
  e.command(0,{type:'fire'});tick(e,arc.time+.05);const crater=e.effects.find(e=>e.kind==='crater');assert.ok(crater);assert.ok(dist(crater,arc.hit)<.05);
 }
});
test('UAV orbit holds a 50m radius, shares recon and resumes without resetting energy',()=>{
 const e=setup(),p=e.players[0];weapon(e,0,'uav');const r=e.command(0,{type:'fire'}),s=e.shots.find(s=>s.id===r.id);
 Object.assign(s,{x:1000,y:100,z:1000,yaw:0,pitch:0});tick(e,2);const born=s.born,before=e.snapshot(0).shots.find(q=>q.id===s.id).remaining,position={x:s.x,y:s.y,z:s.z};
 assert.equal(e.command(0,{type:'uav-orbit',id:s.id,active:true}).ok,true);assert.equal(dist3(s,position),0);assert.equal(p.pilot,null);assert.equal(s.orbit.radius,ORBIT_RADIUS);assert.equal(s.orbit.joining,false);
 Object.assign(e.players[1],{x:s.orbit.x,z:s.orbit.z,y:terrain(s.orbit.x,s.orbit.z)});
 for(let i=0;i<1440;i++){e.update(1/120);assert.ok(e.shots.includes(s));assert.ok(Math.abs(dist(s,s.orbit)-50)<1e-7);}
 assert.ok(e.snapshot(0).enemy);const visible=e.snapshot(1).shots.find(q=>q.id===s.id);assert.ok(visible);assert.equal('orbit' in visible,false);
 assert.equal(e.command(0,{type:'uav-orbit',id:s.id,active:false}).ok,true);assert.equal(p.pilot,s.id);assert.equal(s.orbit,null);assert.equal(s.born,born);assert.ok(e.snapshot(0).shots.find(q=>q.id===s.id).remaining<before-11.9);
 const yaw=s.yaw;e.command(0,{type:'control',throttle:0,steer:.7});tick(e,.3);assert.ok(s.yaw>yaw+.1);
 e.command(0,{type:'uav-orbit',id:s.id,active:true});tick(e,40-e.t+.1);assert.equal(e.shots.includes(s),false);assert.equal(p.pilot,null);
});
test('orbit near a map boundary joins safely and cannot be commanded by an opponent',()=>{
 for(const[x,z,yaw]of[[1975,1000,0],[25,1000,Math.PI],[1000,1975,Math.PI/2],[1000,25,-Math.PI/2]]){
  const e=setup();weapon(e,0,'uav');const r=e.command(0,{type:'fire'}),s=e.shots.find(s=>s.id===r.id);Object.assign(s,{x,y:120,z,yaw,pitch:0});
  assert.equal(e.command(1,{type:'uav-orbit',id:s.id,active:true}).ok,false);e.command(0,{type:'uav-orbit',id:s.id,active:true});
  tick(e,7);assert.ok(e.shots.includes(s),'orbit drone left the map');assert.equal(s.orbit.joining,false);assert.ok(Math.abs(dist(s,s.orbit)-50)<1e-7);assert.ok(s.x>=0&&s.x<=W&&s.z>=0&&s.z<=H);
 }
});
test('orbiting drones remain vulnerable to automatic air defense',()=>{
 const e=setup(),p=e.players[0];weapon(e,1,'uav');const r=e.command(1,{type:'fire'}),q=e.shots.find(s=>s.id===r.id);Object.assign(q,{x:p.x,y:p.y+85,z:p.z-130,yaw:0,pitch:0});
 e.command(1,{type:'uav-orbit',id:q.id,active:true});weapon(e,0,'sam');assert.equal(e.command(0,{type:'fire'}).ok,true);tick(e,2);assert.equal(e.shots.includes(q),false);assert.equal(p.stats.intercepted,1);
});
test('confirmed sounds are spatial, bounded and omit exact sources from opponent packets',()=>{
 const e=setup(),p=e.players[0],foe=e.players[1];weapon(e,1,'missile');e.command(1,{type:'fire'});assert.equal(e.snapshot(0).sounds.length,0);
 e.sound('explosion',{x:p.x+150,y:p.y+10,z:p.z},1);const sound=e.snapshot(0).sounds.find(s=>s.kind==='explosion');assert.ok(sound&&sound.gain>0&&sound.gain<1&&sound.pan>.9);
 assert.deepEqual(Object.keys(sound).sort(),['gain','id','kind','pan']);
 e.damage(foe,0,10);assert.ok(e.snapshot(0).sounds.some(s=>s.kind==='confirm'));assert.equal(e.snapshot(1).sounds.some(s=>s.kind==='confirm'),false);assert.ok(e.snapshot(1).sounds.some(s=>s.kind==='impact'));
 for(let i=0;i<100;i++)e.sound('mg',p,0);assert.ok(e.sounds.length<=64);assert.ok(e.snapshot(0).sounds.length<=64);tick(e,1.21);assert.equal(e.sounds.length,0);
 const launchCount=p.stats.launches;weapon(e,0,'sam');assert.equal(e.command(0,{type:'fire'}).ok,false);assert.equal(p.stats.launches,launchCount);assert.equal(e.sounds.some(s=>s.kind==='sam'),false);
});
test('artillery has no age fuse or altitude cutoff and explodes only at a surface',()=>{
 const e=setup();weapon(e,0,'artillery',0,1.4);const r=e.command(0,{type:'fire'}),s=e.shots.find(s=>s.id===r.id);
 Object.assign(s,{x:900,z:1100,y:1500,vx:0,vy:0,vz:0,born:-100});assert.equal(s.ttl,null);tick(e,1);
 assert.ok(e.shots.includes(s));assert.equal(e.effects.some(x=>x.kind==='explosion'),false);assert.equal(e.snapshot(0).shots.find(x=>x.id===s.id).remaining,null);
 tick(e,9);assert.equal(e.shots.includes(s),false);assert.ok(e.effects.some(x=>x.kind==='crater'));assert.equal(s.y,terrain(s.x,s.z));
});
test('hard AI does not read unknown opponent positions',()=>{
 const a=setup({mode:'ai',difficulty:'hard'}),b=setup({mode:'ai',difficulty:'hard'});
 for(const e of[a,b])Object.assign(e.players[1],{x:1000,z:300,y:terrain(1000,300)});
 Object.assign(a.players[0],{x:200,z:1850,y:terrain(200,1850)});Object.assign(b.players[0],{x:1800,z:1850,y:terrain(1800,1850)});tick(a,4);tick(b,4);
 assert.deepEqual(a.players[1].aim,b.players[1].aim);assert.deepEqual(a.shots.map(s=>[s.kind,s.x,s.y,s.z,s.yaw,s.pitch]),b.shots.map(s=>[s.kind,s.x,s.y,s.z,s.yaw,s.pitch]));assert.equal(a.players[1].intel.lock,null);
 assert.equal(a.players[1].hp,100);assert.equal(a.players[1].cd.uav,b.players[1].cd.uav);
});
test('hard AI infers a search area from observed launch direction',()=>{
 const e=setup({mode:'ai',difficulty:'hard'}),p=e.players[1];p.intel.clues.push({id:99,kind:'direction',x:800,z:800,yaw:Math.PI/2,until:15});tick(e,.1);
 assert.equal(e.hardAI.guess.x,1400);assert.equal(e.hardAI.guess.z,800);assert.ok(e.shots.some(s=>s.owner===1&&s.kind==='uav'));assert.equal(p.intel.lock,null);
});
test('hard AI uses legal SAM reload and MG fallback without increasing damage or HP',()=>{
 for(const ready of[true,false]){
  const e=setup({mode:'ai',difficulty:'hard'}),p=e.players[1];p.cd.uav=30;p.cd.sam=ready?0:10;
  weapon(e,0,'uav');const r=e.command(0,{type:'fire'}),q=e.shots.find(s=>s.id===r.id);Object.assign(q,{x:p.x+100,y:p.y+45,z:p.z-110,speed:0});e.command(0,{type:'vehicle'});
  tick(e,.02);if(ready){assert.ok(p.cd.sam>24.9&&p.cd.sam<=25);assert.ok(e.shots.some(s=>s.owner===1&&s.kind==='sam'));}else{assert.equal(p.selected,'mg');assert.equal(p.mg,false);assert.equal(p.selected,'mg');}
  tick(e,4);assert.equal(e.shots.includes(q),false);assert.equal(p.stats.intercepted,1);assert.equal(p.hp,100);
 }
});
test('hard AI maintains UAV recon, uses an achievable artillery arc and relocates after firing',()=>{
 const e=setup({mode:'ai',difficulty:'hard'}),p=e.players[1],foe=e.players[0];Object.assign(p,{x:1000,z:1200,y:terrain(1000,1200)});Object.assign(foe,{x:1000,z:650,y:terrain(1000,650)});
 weapon(e,1,'uav');const r=e.command(1,{type:'fire'}),s=e.shots.find(s=>s.id===r.id);Object.assign(s,{x:1000,z:700,y:terrain(1000,700)+65,pitch:0});e.updateIntel();const origin={x:p.x,z:p.z};
 tick(e,1.5);assert.ok(s.orbit);assert.equal(p.artilleryMode,'direct');assert.ok(e.shots.some(s=>s.owner===1&&s.kind==='artillery'));assert.ok(dist(p,origin)>5);assert.ok(e.snapshot(1).enemy);tick(e,11);assert.ok(p.stats.damage>=40);assert.ok(foe.hp<=60);
});
test('hard AI predicts only observed movement and expires active tracking after five seconds',()=>{
 const e=setup({mode:'ai',difficulty:'hard'}),p=e.players[1],foe=e.players[0];Object.assign(p,{x:1000,z:1000,y:terrain(1000,1000)});Object.assign(foe,{x:1120,z:1000,y:terrain(1120,1000),yaw:Math.PI/2});p.cd.uav=p.cd.missile=p.cd.artillery=100;
 e.command(0,{type:'control',throttle:1,steer:0});tick(e,.4);const goal=e.hardTarget(1.5);assert.ok(e.hardAI.velocity.x>10);assert.ok(goal.x>p.intel.lock.x+15);
 const last=p.intel.lock.x;Object.assign(foe,{x:1850,z:1850,y:terrain(1850,1850),drive:{throttle:0,steer:0}});tick(e,1);assert.equal(p.intel.lock.x,last);assert.ok(e.hardTarget());tick(e,4.1);assert.equal(e.hardTarget(),null);
});
console.log(`${passed} 3D engine checks passed`);
