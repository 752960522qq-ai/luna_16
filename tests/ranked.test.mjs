import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {createArena} from '../server/ranked-server.mjs';
const require=createRequire(import.meta.url),R=require('../app/src/main/assets/rank-rules.js');
assert.equal(R.RANKS.length,18);assert.equal(R.describe(0).name,'列兵');assert.equal(R.apply(0,'win').name,'下士');assert.equal(R.apply(0,'loss').points,0);
for(let i=0;i<17;i++){const p=R.starts[i],n=R.RANKS[i].stars;assert.equal(R.describe(p).name,R.RANKS[i].name);assert.equal(R.apply(p+(n-1)*2,'win').name,R.RANKS[i+1].name);}
assert.equal(R.apply(R.starts[4]+1,'loss').points,R.starts[4]);assert.equal(R.apply(R.starts[8]+2,'loss').points,R.starts[8]);assert.equal(R.RANKS[16].stars,5);assert.equal(R.describe(R.starts[17]+2000).starsEarned,1000);assert.equal(R.apply(R.starts[17]+2000,'loss').starsEarned,999);
class FakeWorker extends EventEmitter{postMessage(p){this.last=p;}terminate(){return Promise.resolve();}}
const workerDataSeen=[];const app=createArena({workerFactory:data=>{workerDataSeen.push(data);return new FakeWorker();}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
async function call(path,body={}){const r=await fetch(origin+'/api/ranked/'+path,{method:'POST',body:JSON.stringify({version:1,...body})});return{status:r.status,...await r.json()};}
try{const users=[];for(let i=0;i<10;i++)users.push(await call('session'));assert.equal((await call('me',{token:'bad'})).status,401);
 for(let i=0;i<9;i++)assert.equal((await call('join',{token:users[i].token,...(i===0?{lineup:['warhorse','gladiator_kfz']}: {})})).status,'queued');
 const lineup=['warhorse','gladiator_kfz'];const started=await call('join',{token:users[9].token});assert.equal(started.status,'battle');assert.equal(app.matches.size,1);const match=[...app.matches.values()][0];assert.equal(new Set(match.members.map(x=>x.slot)).size,10);assert.deepEqual(workerDataSeen[0].vehicleQueues[match.members.findIndex(x=>x.id===users[0].rank.id)],['warhorse','gladiator_kfz']);
 const a=await call('poll',{token:users[0].token,commands:[{seq:1,action:{type:'set-score',points:999}}]});assert.equal(a.status,400);
 const first=app.sessions.get(users[0].rank.id);await call('poll',{token:users[0].token,commands:[{seq:2,action:{type:'control',throttle:1,steer:0}}]});assert.equal(match.worker.last.slot,first.slot);assert.equal(first.seq,2);
 await call('leave',{token:users[0].token});assert.equal((await call('me',{token:users[0].token})).rank.losses,1);
 match.worker.emit('message',{type:'finish',winner:0,reason:'测试结算'});match.worker.emit('message',{type:'finish',winner:0,reason:'重复回调'});
 for(const u of users){const r=await call('me',{token:u.token});assert.equal(r.rank.wins+r.rank.losses+r.rank.draws,1);}
 assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM results').get().n,10);console.log('PASS all 18 rank thresholds; 10 real slots, authenticated commands, lineup forwarded to worker, authoritative one-time results and leave penalty');
}finally{await app.close();}
// Exercise the real production engine worker, rather than only its transport fixture.
const {Worker}=await import('node:worker_threads');const w=new Worker(new URL('../server/match-worker.cjs',import.meta.url),{workerData:{seed:123,mode:'breakthrough'}});
try{const views=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('engine timeout')),15000);w.on('error',reject);w.on('message',p=>{if(p.type==='state'){clearTimeout(t);resolve(p.views);}});});assert.equal(views.length,10);assert.equal(views.filter(v=>v.team.id===0).length,5);assert.equal(views.filter(v=>v.team.id===1).length,5);assert.equal(new Set(views.map(v=>v.own.vehicleId)).size,1);assert(views.every(v=>v.respawn.available===false));console.log('PASS production 5v5 engine: ten player views, 5+5 teams, and human lineup transport to deployment');}finally{await w.terminate();}
