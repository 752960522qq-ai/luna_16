import{REMOTE_ORIGIN}from'./net-config.js';
const pending=new Map();let requestNumber=0;
const requestPrefix=Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
window.onNativeRemoteResponse=e=>{const p=e&&pending.get(e.id);if(!p)return;pending.delete(e.id);p.resolve(e);};
function nativeRequest(path,body,signal,timeout){
 const bridge=window.Native,id=requestPrefix+'_'+(++requestNumber);
 return new Promise((resolve,reject)=>{
  const abort=()=>{pending.delete(id);try{bridge.cancelRemoteRequest(id);}catch(_){}reject(new DOMException('请求已取消','AbortError'));};
  pending.set(id,{resolve:e=>{signal.removeEventListener('abort',abort);resolve(e);}});signal.addEventListener('abort',abort,{once:true});
  try{bridge.remoteRequest(id,path,body,timeout);}catch(e){pending.delete(id);signal.removeEventListener('abort',abort);reject(e);}
 });
}
function parseResponse(status,body){
 let result;try{result=JSON.parse(body);}catch(_){const e=new Error(status===403?'联机请求被服务入口拦截（403），请切换网络后重试':`联机服务响应异常（${status||'网络错误'}），请稍后重试`);e.status=status;throw e;}
 if(status<200||status>=300){const e=new Error(result.error||`远程连接失败（${status}）`);e.status=status;throw e;}return result;
}
export class RemoteLink{
 constructor(emit){this.emit=emit;this.closed=false;this.role=null;this.code=null;this.key=null;this.queue=[];this.state=null;this.stateSeq=0;this.ack=0;this.seenState=0;this.connected=false;this.lastGood=performance.now();this.timer=null;this.inflight=null;this.rtt=0;this.feedback=[];this.feedbackSeq=0;this.seenFeedback=0;}
 async request(path,data,timeout=15000){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeout);this.inflight=abort;
  try{
   const body=JSON.stringify({version:5,...data});
   if(typeof window.Native?.remoteRequest==='function'){const r=await nativeRequest(path,body,abort.signal,timeout);if(r.error)throw new Error(r.error);return parseResponse(r.status,r.body);}
   // Simple CORS request: JSON text without the preflight blocked by the service gateway.
   const response=await fetch(REMOTE_ORIGIN+'/api/rooms/'+path,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body,signal:abort.signal,cache:'no-store'});return parseResponse(response.status,await response.text());
  }
  finally{clearTimeout(timer);if(this.inflight===abort)this.inflight=null;}
 }
 async host(){this.role='host';try{const r=await this.request('create',{});if(this.closed){this.release(r);return;}this.code=r.code;this.key=r.token;this.emit({type:'listening',code:r.code,remote:true});this.poll();}catch(e){if(!this.closed)this.emit({type:'error',message:e.message});}}
 async join(code){this.role='guest';try{const r=await this.request('join',{code});if(this.closed){this.release(r);return;}this.code=r.code;this.key=r.token;this.poll();}catch(e){if(!this.closed)this.emit({type:'error',message:e.message});}}
 send(data){if(this.closed)return;let p;try{p=JSON.parse(data);}catch(_){return;}if(this.role==='host'&&p.type==='state'){this.feedback=this.feedback.filter(e=>Date.now()-e.t<5000);this.state={...p,feedback:this.feedback};this.stateSeq++;}else if(this.role==='host'&&p.type==='feedback'){this.feedback.push({id:++this.feedbackSeq,message:String(p.message).slice(0,200),t:Date.now()});this.feedback=this.feedback.slice(-8);}else if(this.role==='guest'&&p.type==='command'){this.queue.push(p);if(this.queue.length>100){this.emit({type:'closed',message:'网络延迟过高，请重新连接'});this.close();}}}
 async poll(){
  if(this.closed)return;const begin=performance.now(),batch=this.queue.slice(0,40);
  try{
   const data={code:this.code,token:this.key,...(this.role==='host'?{state:this.state,stateSeq:this.stateSeq,ack:this.ack}:{commands:batch})};
   const r=await this.request('exchange',data,8000);if(this.closed)return;this.lastGood=performance.now();this.rtt=Math.round(performance.now()-begin);
   if(r.closed){this.emit({type:'closed',message:r.message||'房间已关闭'});this.close();return;}
   if(r.joined&&!this.connected){this.connected=true;this.emit({type:'connected',role:this.role,remote:true});}
   if(this.role==='host'){for(const p of r.commands||[]){if(p.seq<=this.ack)continue;this.emit({type:'data',data:JSON.stringify(p)});this.ack=p.seq;}}
   else{const sent=new Set(batch.map(p=>p.seq));this.queue=this.queue.filter(p=>!sent.has(p.seq));if(r.state&&r.stateSeq>this.seenState){this.seenState=r.stateSeq;this.emit({type:'data',data:JSON.stringify(r.state)});for(const f of r.state.feedback||[]){if(f.id>this.seenFeedback){this.seenFeedback=f.id;this.emit({type:'data',data:JSON.stringify({type:'feedback',message:f.message})});}}}}
   if(this.connected)this.emit({type:'heartbeat',rtt:this.rtt});
  }catch(e){if(this.closed)return;if([400,401,403,404,409,410].includes(e.status)){this.emit({type:'closed',message:e.message});this.close();return;}if(performance.now()-this.lastGood>20000){this.emit({type:'closed',message:e.message||'网络长时间未响应，请重新连接'});this.close();return;}}
  if(!this.closed)this.timer=setTimeout(()=>this.poll(),Math.max(35,(this.connected?140:500)-(performance.now()-begin)));
 }
 release(r){this.request('leave',{code:r.code,token:r.token},6000).catch(()=>{});}
 close(){if(this.closed)return;this.closed=true;clearTimeout(this.timer);if(this.code&&this.key){this.inflight?.abort();this.release({code:this.code,token:this.key});}}
 get stats(){return{connected:this.connected&&!this.closed,role:this.role,rtt:this.rtt,queued:this.queue.length};}
}
