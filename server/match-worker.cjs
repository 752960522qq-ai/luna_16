const {parentPort,workerData:d}=require('node:worker_threads');
const {CombatArena}=require('../app/src/main/assets/combat-arena.js');
const B=require('../app/src/main/assets/engine.js');
const {mode,playerCount}=require('../app/src/main/assets/campaign-data.js');
const cfg=mode(d.mode),humanSlots=d.humanSlots||Array.from({length:playerCount(cfg)},(_,i)=>i);
const engine=new CombatArena({mode:'ai',vehicles:d.vehicles,vehicleQueues:d.vehicleQueues,countdown:12,difficulty:d.difficulty||'standard',teamSize:cfg.size,freeForAll:!!cfg.freeForAll,uniformVehicle:true,mapId:d.mapId||'hills',seed:d.seed,lineup:[B.DEFAULT_VEHICLE],survival:['duel','survival'].includes(cfg.id),humanSlots,deploymentSlots:humanSlots});
for(const p of engine.players){p.respawns=0;if(!humanSlots.includes(p.id))p.botTuning=d.botTuning||require('../app/src/main/assets/bot-balance.js').tuning(0,0);}
let last=performance.now(),sendAt=0,ended=false;
function publish(){parentPort.postMessage({type:'state',views:engine.players.map(p=>engine.snapshot(p.id))});}
parentPort.on('message',packet=>{
 if(packet.type==='command'&&!engine.over&&humanSlots.includes(packet.slot)){try{engine.command(packet.slot,packet.action);}catch{}}
 if(packet.type==='leave'&&!engine.over){const p=engine.players[packet.slot];if(p){p.hp=0;p.awaitingDeployment=false;p.respawns=0;p.destroyedVehicles=[...p.lineup];engine.checkSurvivor();}}
});
const timer=setInterval(()=>{const now=performance.now();let dt=Math.min(.25,(now-last)/1000);last=now;while(dt>0&&!engine.over){const step=Math.min(dt,1/60);engine.update(step);dt-=step;}if(now-sendAt>=125){publish();sendAt=now;}if(engine.over&&!ended){ended=true;publish();parentPort.postMessage({type:'finish',winner:cfg.freeForAll?engine.winner:engine.winnerTeam,reason:engine.reason,stats:engine.players.map(p=>({kills:p.stats.kills,deaths:p.hp<=0?1:0,placement:cfg.freeForAll?engine.snapshot(p.id).placement:undefined}))});clearInterval(timer);}},16);
publish();
