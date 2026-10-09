/* HTTPS relay. Each client owns a private token; only the guest's filtered view is relayed. */
const VERSION=7,WAIT=600000,DEAD=25000,ACTIVE=120000,MAX=81920;
function token(bytes=24){return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
function code(){let n;do{n=crypto.getRandomValues(new Uint16Array(1))[0];}while(n>=60000);return String(n%10000).padStart(4,'0');}
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
const result=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','X-Content-Type-Options':'nosniff'}});
const statement=(db,sql,args=[])=>db.prepare(sql).bind(...args);
function validCommand(p){return p&&p.type==='command'&&Number.isSafeInteger(p.seq)&&p.seq>0&&p.seq<1e9&&p.action&&['select','vehicle','pilot','artillery-mode','uav-orbit','control','aim','mg','detonate','fire'].includes(p.action.type)&&JSON.stringify(p).length<=1500;}
function validState(s){const v=s&&s.view;return s&&s.type==='state'&&v&&v.version===VERSION&&v.own&&Number.isFinite(v.t)&&Number.isFinite(v.own.x)&&Number.isFinite(v.own.z)&&Array.isArray(v.shots)&&Array.isArray(v.sounds)&&JSON.stringify(s).length<=65536;}
export async function rooms(request,env){
 if(env.ROOMS_ENABLED!=='true')return result({error:'远程联机暂时关闭'},503);
 if(request.method==='OPTIONS')return result({ok:true});
 if(request.method!=='POST')return result({error:'请求方式不支持'},405);
 if(!env.DB)return result({error:'远程房间暂不可用，请稍后重试'},503);
 let body;try{const text=await request.text();if(text.length>MAX)return result({error:'请求过大'},413);body=JSON.parse(text);}catch(_){return result({error:'请求格式错误'},400);}
 if(body.version!==VERSION)return result({error:'双方请更新到同一游戏版本'},409);
 const db=env.DB,path=new URL(request.url).pathname,now=Date.now();
 try{
  if(path==='/api/rooms/create'){
   const key=token(),secret=await hash(key);await statement(db,'DELETE FROM rooms WHERE expires_at < ?',[now]).run();
   for(let i=0;i<40;i++){
    const id=code();const r=await statement(db,'INSERT OR IGNORE INTO rooms(code,host_key,status,created_at,last_host,expires_at) VALUES(?,?,?,?,?,?)',[id,secret,'waiting',now,now,now+WAIT]).run();
    if(r.meta.changes)return result({code:id,token:key,role:'host',version:VERSION});
   }
   return result({error:'房间繁忙，请重新创建'},503);
  }
  if(typeof body.code!=='string'||!/^\d{4}$/.test(body.code))return result({error:'请输入4位数字房间码'},400);
  if(path==='/api/rooms/join'){
   const key=token(),secret=await hash(key),room=await statement(db,'UPDATE rooms SET guest_key=?,last_guest=?,status=\'joined\',expires_at=? WHERE code=? AND status=\'waiting\' AND guest_key IS NULL AND expires_at>? AND last_host>? RETURNING code',[secret,now,now+ACTIVE,body.code,now,now-DEAD]).first();
   if(!room)return result({error:'房间不存在、已过期或已有玩家'},404);
   return result({code:body.code,token:key,role:'guest',version:VERSION});
  }
  if(typeof body.token!=='string'||!/^[a-f0-9]{48}$/.test(body.token))return result({error:'连接凭据无效'},401);
  const secret=await hash(body.token),room=await statement(db,'SELECT * FROM rooms WHERE code=?',[body.code]).first();
  if(!room)return result({error:'房间已过期',closed:true},410);
  const role=secret===room.host_key?'host':secret===room.guest_key?'guest':null;
  if(!role)return result({error:'连接凭据无效'},401);
  if(path==='/api/rooms/leave'){
   await db.batch([statement(db,'UPDATE rooms SET status=\'closed\',state=NULL,expires_at=? WHERE code=?',[now+WAIT,body.code]),statement(db,'DELETE FROM commands WHERE room_code=?',[body.code])]);return result({ok:true});
  }
  if(path!=='/api/rooms/exchange')return result({error:'接口不存在'},404);
  const peer=role==='host'?room.last_guest:room.last_host;
  if(room.status==='closed'||room.expires_at<now||(room.status==='joined'&&peer&&now-peer>DEAD)){
   await statement(db,'UPDATE rooms SET status=\'closed\',state=NULL,expires_at=? WHERE code=?',[now+WAIT,body.code]).run();return result({closed:true,message:'对方已离开或连接超时'});
  }
  if(role==='host'){
   if(!Number.isSafeInteger(body.ack)||body.ack<0||!Number.isSafeInteger(body.stateSeq)||body.stateSeq<0)return result({error:'同步序号无效'},400);
   if(body.state!==null&&!validState(body.state))return result({error:'对战状态无效'},400);
   const state=body.state?JSON.stringify(body.state):null;
   const updates=[statement(db,'UPDATE rooms SET last_host=?,expires_at=?,acked_seq=MAX(acked_seq,?) WHERE code=? AND status!=\'closed\'',[now,now+(room.status==='waiting'?WAIT:ACTIVE),body.ack,body.code]),statement(db,'DELETE FROM commands WHERE room_code=? AND seq<=?',[body.code,body.ack])];
   if(state)updates.push(statement(db,'UPDATE rooms SET state=?,state_seq=? WHERE code=? AND state_seq<? AND status=\'joined\'',[state,body.stateSeq,body.code,body.stateSeq]));
   updates.push(statement(db,'SELECT seq,payload FROM commands WHERE room_code=? AND seq>? ORDER BY seq LIMIT 50',[body.code,body.ack]));
   const out=await db.batch(updates);return result({joined:room.status==='joined',commands:out.at(-1).results.map(p=>JSON.parse(p.payload))});
  }
  if(!Array.isArray(body.commands)||body.commands.length>40||!body.commands.every(validCommand))return result({error:'操作格式无效'},400);
  const commands=body.commands,seq=commands.reduce((n,p)=>Math.max(n,p.seq),0);
  const updates=[statement(db,'UPDATE rooms SET last_guest=?,expires_at=?,guest_seq=MAX(guest_seq,?) WHERE code=? AND status=\'joined\'',[now,now+ACTIVE,seq,body.code])];
  for(const p of commands)updates.push(statement(db,'INSERT OR IGNORE INTO commands(room_code,seq,payload) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM rooms WHERE code=? AND status=\'joined\' AND acked_seq<?)',[body.code,p.seq,JSON.stringify(p),body.code,p.seq]));
  updates.push(statement(db,'SELECT status,state,state_seq FROM rooms WHERE code=?',[body.code]));
  const out=await db.batch(updates),current=out.at(-1).results[0];
  if(!current||current.status==='closed')return result({closed:true,message:'对方已离开'});
  return result({joined:true,state:current.state?JSON.parse(current.state):null,stateSeq:current.state_seq,accepted:seq});
 }catch(e){console.error('Room relay failure',e.message);return result({error:'远程连接暂不可用，请稍后重试'},503);}
}
