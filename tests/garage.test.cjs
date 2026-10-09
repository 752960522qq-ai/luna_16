const assert=require('node:assert/strict');
const B=require('../app/src/main/assets/engine.js'),{Progress,KEY}=require('../app/src/main/assets/progress.js');
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};};
const tick=(e,t)=>{for(let i=0;i<t*120;i++)e.update(1/120);};
const e=new B.Engine({mode:'lan',countdown:0,seed:42}),p=e.players[0];
assert.equal(B.vehicleSpec(p.vehicleId).name,'悍驴导弹车');assert.deepEqual(p.weapons,['uav','missile','sam','mg']);
assert.equal(e.command(0,{type:'select',weapon:'artillery'}).ok,false);assert.equal(p.selected,'missile');
p.selected='artillery';assert.equal(e.command(0,{type:'fire'}).ok,false);assert.equal(p.cd.artillery,0);assert.equal(e.shots.length,0);
assert.equal(e.command(0,{type:'artillery-mode',mode:'direct'}).ok,false);assert.equal(B.WEAPONS.artillery.cooldown,5);assert.equal(B.ARTILLERY_RANGE,1000);
p.weapons.push('artillery');assert.equal(e.command(0,{type:'select',weapon:'artillery'}).ok,true);assert.equal(e.command(0,{type:'fire'}).ok,true);
const drive=new B.Engine({mode:'lan',countdown:0,seed:42}),truck=drive.players[0];Object.assign(truck,{x:1000,z:1000,y:B.terrain(1000,1000),yaw:0});
drive.command(0,{type:'control',throttle:1,steer:0});tick(drive,.5);assert.ok(truck.speed>25&&truck.speed<=B.vehicleSpec(truck.vehicleId).speed);assert.ok(truck.wheelTravel>0);
drive.command(0,{type:'control',throttle:0,steer:0});tick(drive,3);const stopped=truck.wheelTravel;tick(drive,.5);assert.ok(Math.abs(truck.wheelTravel-stopped)<.00001);
drive.command(0,{type:'control',throttle:-1,steer:0});tick(drive,.5);assert.ok(truck.speed<0&&truck.wheelTravel<stopped);assert.equal(drive.snapshot(0).own.wheelTravel,truck.wheelTravel);
for(const difficulty of['easy','standard','hard']){const a=new B.Engine({mode:'ai',countdown:0,seed:18,difficulty});tick(a,90);assert.ok(a.shots.every(s=>s.kind!=='artillery'));assert.ok(a.trails.every(s=>s.kind!=='artillery'));assert.ok(a.players.every(p=>p.weapons.length===4));}
const store=storage(),profile=new Progress(store);assert.equal(profile.coins,0);assert.deepEqual(profile.owned,[B.DEFAULT_VEHICLE]);assert.equal(profile.equip('not-owned'),false);
assert.equal(profile.reward('round-1','win'),100);assert.equal(profile.reward('round-1','win'),0);assert.equal(profile.reward('round-2','draw'),50);assert.equal(profile.reward('round-3','loss'),25);assert.equal(profile.reward('round-4','abort'),0);assert.equal(new Progress(store).coins,175);
store.setItem(KEY,JSON.stringify({version:1,coins:-10,selected:'bad',owned:['bad'],claimed:[12]}));const invalid=new Progress(store);assert.equal(invalid.coins,0);assert.deepEqual(invalid.owned,[B.DEFAULT_VEHICLE]);assert.equal(invalid.selected,B.DEFAULT_VEHICLE);
store.setItem(KEY,'broken');assert.equal(new Progress(store).coins,0);
const blocked=new Progress({getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}});assert.equal(blocked.reward('offline','win'),100);assert.equal(blocked.saved,false);assert.equal(blocked.reward('offline','win'),0);
const infinite=new Progress(store,{infiniteCoins:true});assert.equal(infinite.coins,Number.MAX_SAFE_INTEGER);assert.equal(infinite.purchase('longnose_artillery'),true);assert.equal(infinite.coins,Number.MAX_SAFE_INTEGER);assert.equal(new Progress(store,{infiniteCoins:true}).coins,Number.MAX_SAFE_INTEGER);
const hard=new B.Engine({mode:'ai',difficulty:'hard',countdown:0,seed:42}),ai=hard.players[1];ai.cd.sam=100;ai.cd.uav=100;ai.cd.missile=100;
hard.command(0,{type:'select',weapon:'uav'});const launched=hard.command(0,{type:'fire'}),u=hard.shots.find(s=>s.id===launched.id);Object.assign(u,{x:ai.x+100,y:ai.y+45,z:ai.z-110,speed:0});hard.command(0,{type:'vehicle'});
tick(hard,.25);assert.equal(hard.shots.some(s=>s.owner===1&&s.kind==='bullet'),false);tick(hard,5);assert.ok(ai.stats.intercepted>0,'gunner should still be able to intercept');
for(const kind of ['uav','missile']){
 let kills=0;
 for(let seed=1;seed<=64;seed++){
  const t=new B.Engine({seed,mode:'ai',difficulty:'hard',countdown:0}),gunner=t.players[1],owner=t.players[0];
  Object.assign(gunner,{x:1000,z:1000,y:B.terrain(1000,1000)});Object.assign(owner,{x:1000,z:1700,y:B.terrain(1000,1700)});
  gunner.cd.sam=gunner.cd.uav=gunner.cd.missile=100;for(const a of Object.values(gunner.aim))a.yaw=0;
  t.command(0,{type:'select',weapon:kind});const r=t.command(0,{type:'fire'}),q=t.shots.find(s=>s.id===r.id);
  Object.assign(q,{x:gunner.x-115,y:gunner.y+65,z:gunner.z-240,yaw:Math.PI/2,pitch:0,speed:B.WEAPONS[kind].speed});t.command(0,{type:'vehicle'});
  tick(t,3);if(gunner.stats.intercepted)kills++;
 }
 assert.ok(kills>0&&kills<60,`${kind}: gunner should sometimes hit and sometimes miss, got ${kills}/64`);
 console.log(`PASS seeded long-range crossing ${kind}: ${kills}/64 MG interceptions (not a universal gameplay rate)`);
}
for(const[id,w]of Object.entries(B.WEAPONS))assert.equal(w.cooldown,B.C[id]);
console.log('PASS starter loadout / command rejection / reserved artillery, actual travel in both directions, mounted AI weapons, currency persistence / deduplication / invalid storage, and reduced gunner reaction');
