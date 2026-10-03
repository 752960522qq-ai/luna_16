import assert from'node:assert/strict';
import{openRelay}from'./room-server.mjs';
import engine from'../app/src/main/assets/engine.js';
const{server,raw,url}=await openRelay();
async function post(path,data){const r=await fetch(url+'/api/rooms/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:5,...data})});return{status:r.status,...await r.json()};}
try{
 const host=await post('create',{});assert.equal(host.role,'host');assert.match(host.code,/^\d{4}$/);assert.equal(host.token.length,48);
 const join=await Promise.all([post('join',{code:host.code}),post('join',{code:host.code})]);assert.equal(join.filter(x=>x.status===200).length,1);const guest=join.find(x=>x.status===200);
 assert.equal((await post('exchange',{code:host.code,token:'0'.repeat(48),commands:[]})).status,401);
 const state={type:'state',view:new engine.Engine({mode:'lan'}).snapshot(1)};const h=await post('exchange',{code:host.code,token:host.token,state,stateSeq:1,ack:0});assert.equal(h.joined,true);
 const commands=[{type:'command',seq:1,action:{type:'select',weapon:'artillery'}},{type:'command',seq:2,action:{type:'artillery-mode',mode:'direct'}},{type:'command',seq:3,action:{type:'fire'}}];
 const g=await post('exchange',{code:guest.code,token:guest.token,commands});assert.deepEqual(g.state,state);assert.equal('host_key' in g,false);assert.equal('token' in g,false);
 await post('exchange',{code:guest.code,token:guest.token,commands});let received=await post('exchange',{code:host.code,token:host.token,state,stateSeq:1,ack:0});assert.deepEqual(received.commands,commands);
 received=await post('exchange',{code:host.code,token:host.token,state,stateSeq:1,ack:3});assert.deepEqual(received.commands,[]);await post('exchange',{code:guest.code,token:guest.token,commands});assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM commands').get().n,0);
 assert.equal((await post('exchange',{code:guest.code,token:guest.token,commands:[{type:'command',seq:4,action:{type:'decoy'}}]})).status,400);
 assert.equal((await post('create',{version:3})).status,409);
 await post('leave',{code:guest.code,token:guest.token});assert.equal((await post('exchange',{code:host.code,token:host.token,state:null,stateSeq:1,ack:3})).closed,true);
 const room=await post('create',{});raw.prepare('UPDATE rooms SET last_host=? WHERE code=?').run(Date.now()-26000,room.code);assert.equal((await post('join',{code:room.code})).status,404);
 console.log('PASS HTTPS room relay over real HTTP/SQLite: single guest race, token isolation, filtered state, ordered commands, idempotent retry/ack, invalid version/action, closure and stale host');
}finally{await new Promise(r=>server.close(r));raw.close();}
