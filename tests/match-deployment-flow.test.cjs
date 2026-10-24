const assert=require('node:assert/strict');
const B=require('../app/src/main/assets/engine.js');
const {BreakthroughEngine}=require('../app/src/main/assets/breakthrough.js');
const {CombatArena,DarkForestArena}=require('../app/src/main/assets/combat-arena.js');
const lineup=['warhorse','gladiator_kfz','b_tank','annihilator_fv'];

// 5v5 waits at the battle deployment screen, then keeps the complete queue for
// two distinct lives while excluding each destroyed vehicle.
let game=new BreakthroughEngine({mode:'lan',seed:21,countdown:0,lineup,vehicleQueues:[lineup],deploymentSlots:[0]});
let p=game.players[0];assert.equal(p.awaitingDeployment,true);assert.deepEqual(p.lineup,lineup);game.update(.05);assert.equal(game.t,0);
assert.equal(game.command(0,{type:'deploy',vehicleId:'not-a-vehicle'}).ok,false);
assert.equal(game.command(0,{type:'deploy',vehicleId:'gladiator_kfz'}).ok,true);p=game.players[0];assert.equal(p.vehicleId,'gladiator_kfz');assert.equal(p.awaitingDeployment,false);assert.deepEqual(p.lineup,lineup);
game.damage(p,5,10000,'missile');assert.deepEqual(game.snapshot(0).respawn.lineup.map(x=>x.id),lineup);assert.ok(game.snapshot(0).respawn.available);
for(const next of ['warhorse','b_tank']){p=game.players[0];game.t=p.respawnAt;assert.equal(game.command(0,{type:'respawn',vehicleId:next}).ok,true);p=game.players[0];assert.equal(p.vehicleId,next);game.damage(p,5,10000,'missile');}
assert.equal(game.players[0].respawns,2);assert.equal(game.snapshot(0).respawn.available,false);

// 1v1 can select from the queue after match formation but never respawns.
game=new CombatArena({mode:'lan',seed:22,countdown:0,teamSize:1,survival:true,vehicles:[lineup[0]],vehicleQueues:[lineup],humanSlots:[0],deploymentSlots:[0]});
p=game.players[0];assert.deepEqual(p.lineup,lineup);assert.equal(p.respawns,0);assert.equal(game.command(0,{type:'deploy',vehicleId:'gladiator_kfz'}).ok,true);assert.equal(game.players[0].vehicleId,'gladiator_kfz');assert.equal(game.canRespawn(game.players[0]),false);assert.equal(game.snapshot(0).battleMode,'duel');game.damage(game.players[0],1,10000,'missile');game.update(.05);assert.equal(game.over,true);assert.equal(game.winnerTeam,1);

// Dark Forest gets the post-match selection and remains one-life free-for-all.
game=new CombatArena({mode:'lan',seed:23,countdown:0,freeForAll:true,battleMode:'dark_forest',vehicles:[lineup[0]],vehicleQueues:[lineup],humanSlots:[0],deploymentSlots:[0]});
assert.ok(game instanceof DarkForestArena);p=game.players[0];assert.deepEqual(p.lineup,lineup);assert.equal(p.respawns,0);game.update(.05);assert.equal(game.t,0);assert.equal(game.command(0,{type:'deploy',vehicleId:'gladiator_kfz'}).ok,true);assert.equal(game.players[0].vehicleId,'gladiator_kfz');assert.equal(game.players[0].respawns,0);
console.log('PASS post-match queue deployment, frozen combat before deployment, full 5v5 queue with two distinct respawns, 1v1 one-life, and Dark Forest one-life');
