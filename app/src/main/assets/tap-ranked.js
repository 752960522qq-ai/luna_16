import './forest-records.js';
import {tapLeaderboards} from './tap-leaderboards.js';

const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}};
const blank=()=>({points:0,matches:0,kills:0,deaths:0,wins:0,losses:0,draws:0,lossStreak:0,...globalThis.BlindfireForestRecords.empty()});
const protocol='feigun-102-crimson1';
const managerOwners=new WeakMap();
export function nativeRankedAvailable(host=globalThis.tap){return typeof host?.getOnlineBattleManager==='function';}

// TapTap orders all commands. Only the room owner's clock advances simulation;
// every device applies those commands at identical fixed 1/60 s steps.
// This is peer simulation over TapTap relay, not an authoritative game server.
export class TapRankedLink {
  constructor(emit,{mode='duel',name='',avatar=0,vehicleId='handlv_missile',lineup=[vehicleId],host=()=>globalThis.tap,
    scores=tapLeaderboards,storage=globalThis.localStorage,arenaFactory=opts=>new globalThis.BlindfireArena.CombatArena(opts),
    now=Date.now,random=Math.random,timers=globalThis}={}){
    Object.assign(this,{emit,mode,name,avatar,vehicleId,lineup:[...new Set(lineup)].slice(0,4),host,scores,storage,arenaFactory,now,random,timers});
    this.closed=false;this.queue=[];this.pending=new Set();this.lastFrame=-1;this.lastTick=0;this.clockTick=0;this.record=blank();this.rank=null;
  }
  call(method,data={}){
    return new Promise((resolve,reject)=>{
      if(this.closed){reject(Error('连接已结束'));return;}
      let settled=false;
      const timer=this.timers.setTimeout(()=>done(reject,Error('联机请求超时，请重新匹配')),12000);
      const done=(fn,r)=>{if(settled){if(this.closed&&fn===resolve&&!managerOwners.has(this.manager))try{this.manager.disconnect({});}catch{}return;}settled=true;this.timers.clearTimeout(timer);this.pending.delete(cancel);fn(r);};
      const cancel=()=>done(reject,Error('连接已结束'));this.pending.add(cancel);
      try{this.manager[method]({...data,success:r=>done(resolve,r),fail:e=>done(reject,Error(e?.errMsg||'联机服务暂不可用'))});}catch(e){done(reject,e);}
    });
  }
  fail(message){if(this.closed||this.finished)return;this.emit({status:'error',error:message});this.close();}
  save(){this.storage.setItem(this.key,JSON.stringify({record:this.record,outbox:this.outbox||null,completed:this.completed||[]}));}
  async join(){
    if(!nativeRankedAvailable(this.host()))throw Error('请使用支持多人联机的新版 TapTap 客户端');
    this.manager=this.host().getOnlineBattleManager();
    const owner=managerOwners.get(this.manager);if(owner&&!owner.closed)throw Error('已有排位连接，请先退出当前对局');managerOwners.set(this.manager,this);
    const entered=info=>{if(!this.room||this.closed||info.roomId!==this.room.id)return;const p=info.playerInfo;if(p&&!this.room.players.some(x=>x.id===p.id))this.room.players.push(p);this.queued();};
    const left=info=>{if(!this.room||this.closed||this.finished||info.roomId&&info.roomId!==this.room.id)return;
      if(this.arena){const slot=this.slots.get(info.playerId);if(this.mode==='survival'&&this.arena.players[slot]?.hp<=0){this.room.players=this.room.players.filter(p=>p.id!==info.playerId);return;}this.fail('有玩家断开连接，本局不计排位积分，请重新匹配');return;}
      this.room.players=this.room.players.filter(x=>x.id!==info.playerId);
      if(info.playerId===this.room.ownerId){this.fail('匹配房间已关闭，请重新匹配');return;}this.queued();};
    const roomChanged=info=>{if(this.room&&!this.closed&&info.id===this.room.id){if(info.ownerId){this.room.ownerId=info.ownerId;this.clockTick=this.lastTick;}if(info.customProperties)this.room.customProperties=info.customProperties;}};
    const started=info=>this.started(info),frame=info=>this.frame(info);
    // Current API names plus the aliases used by older H5 bridge versions.
    this.listener={onDisconnected:()=>this.fail('网络连接中断，本局不计排位积分'),onBattleServiceError:()=>this.fail('联机服务异常，请重新匹配'),
      onPlayerEntered:entered,playerEnterRoom:entered,onPlayerLeft:left,playerLeaveRoom:left,onPlayerOffline:left,playerOffline:left,
      onRoomPropertiesChanged:roomChanged,onRoomPropertiesChange:roomChanged,onFrameSyncStarted:started,onFrameSyncStart:started,
      onFrameReceived:frame,onFrame:frame,onFrameSyncStopped:()=>{if(!this.finished)this.fail('对战同步已停止，本局不计排位积分');},onFrameSyncStop:()=>{if(!this.finished)this.fail('对战同步已停止，本局不计排位积分');}};
    this.manager.registerListener(this.listener);
    const res=await this.call('connect');if(this.closed)return;this.playerId=res.playerId;
    if(!this.playerId)throw Error('未取得联机身份，请重试');
    this.key='bf-tap-ranked-v1:'+this.playerId+':'+this.mode;
    const saved=parse(this.storage.getItem(this.key));this.record={...blank(),...saved.record};this.outbox=saved.outbox;this.completed=Array.isArray(saved.completed)?saved.completed:[];
    // Flush failed writes before accepting another match so an older score
    // can never arrive after a newer result from this client.
    if(this.outbox){await this.scores.submit(this.mode,this.outbox.points);this.outbox=null;this.save();}
    this.record.points=await this.scores.current(this.mode);if(this.closed)return;this.save();
    this.rank={...this.record,...globalThis.BlindfireRanks.describe(this.record.points)};
    this.rank.militaryRank=this.rank.name;
    const cfg=globalThis.BlindfireCampaign.mode(this.mode),seed=1+Math.floor(this.random()*0x7ffffffe);
    const props={protocol,mode:this.mode,mapId:this.random()<.5?'hills':'city',seed,readyAt:this.now()+15000+Math.floor(this.random()*10001)};
    const profile={name:this.name,avatar:this.avatar,vehicleId:this.vehicleId,lineup:this.lineup,...this.record};
    const r=await this.call('matchRoom',{data:{roomCfg:{type:protocol+'-'+this.mode,maxPlayerCount:Math.min(10,globalThis.BlindfireCampaign.playerCount(cfg)),matchParams:{},customProperties:JSON.stringify(props)},playerCfg:{customStatus:1,customProperties:JSON.stringify(profile)}}});
    if(this.closed)return;this.room=r.roomInfo;
    if(!this.room?.id||!this.room.players?.some(p=>p.id===this.playerId))throw Error('房间信息不完整，请重试');
    const actual=parse(this.room.customProperties);
    if(actual.protocol!==protocol||actual.mode!==this.mode||!Number.isFinite(actual.readyAt)||!Number.isInteger(actual.seed))throw Error('房间版本不一致，请更新游戏');
    this.queued();
    this.queueTimer=this.timers.setInterval(()=>{
      if(this.closed||this.arena)return;
      if(this.starting){if(this.now()-this.startingAt>12000)this.fail('未收到战斗同步，请重新匹配');return;}
      if(this.now()-actual.readyAt>20000){this.fail('匹配房间未能开始，请重新匹配');return;}
      this.queued();if(this.room.ownerId===this.playerId&&this.now()>=actual.readyAt){this.starting=true;this.startingAt=this.now();this.call('startFrameSync').catch(e=>this.fail(e.message));}
    },250);
  }
  queued(){if(this.room)this.emit({status:'queued',waiting:this.room.players.length,rank:this.rank});}
  started(info){
    if(this.closed||this.arena||!this.room||info.roomInfo?.id!==this.room.id)return;
    const room=info.roomInfo,props=parse(room.customProperties),cfg=globalThis.BlindfireCampaign.mode(this.mode),B=globalThis.Blindfire;
    if(props.protocol!==protocol||props.mode!==this.mode||!room.players?.length){this.fail('对战数据版本不一致');return;}
    this.room=room;this.matchId=room.id+':'+info.frameSyncId;
    const ordered=[...room.players].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    this.slots=new Map(ordered.map((p,i)=>[p.id,cfg.freeForAll?i:(i%2)*cfg.size+Math.floor(i/2)]));this.slot=this.slots.get(this.playerId);
    if(this.slot===undefined){this.fail('出战身份无效');return;}
    const humans=new Map(ordered.map(p=>[this.slots.get(p.id),{id:p.id,...parse(p.customProperties)}]));
    let rng=props.seed>>>0;const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
    const usedNames=new Set([...humans.values()].map(p=>p.name));
    const names=globalThis.BlindfireBotNames.names(40,random).filter(name=>!usedNames.has(name)),base=parse(ordered[0].customProperties),candidates=B.matchCandidates(base.vehicleId);
    this.roster=Array.from({length:globalThis.BlindfireCampaign.playerCount(cfg)},(_,slot)=>{
      const human=humans.get(slot),p=human||{name:names[slot],avatar:slot%8,vehicleId:candidates[Math.floor(random()*candidates.length)],points:base.points||0,matches:24+slot*17+globalThis.BlindfireRanks.describe(base.points).index*11,kills:30+slot*21,deaths:17+slot*13};
      return {...p,vehicleId:B.VEHICLES[p.vehicleId]?p.vehicleId:B.DEFAULT_VEHICLE,lineup:(human?.lineup||[p.vehicleId]).filter(id=>B.VEHICLES[id]).slice(0,4),slot,team:cfg.freeForAll?slot:Math.floor(slot/cfg.size),militaryRank:globalThis.BlindfireRanks.describe(p.points).name,kdi:globalThis.BlindfireCampaign.kdi(p)};
    });
    const rankIndex=ordered.reduce((n,p)=>n+globalThis.BlindfireRanks.describe(parse(p.customProperties).points).index,0)/ordered.length;
    const lossStreak=ordered.reduce((n,p)=>n+(parse(p.customProperties).lossStreak||0),0)/ordered.length;
    this.arena=this.arenaFactory({mode:'ai',vehicles:this.roster.map(p=>p.vehicleId),countdown:8,teamSize:cfg.size,freeForAll:!!cfg.freeForAll,uniformVehicle:true,mapId:props.mapId,seed:props.seed,lineup:[B.DEFAULT_VEHICLE],vehicleQueues:this.roster.map(p=>p.lineup||[p.vehicleId]),survival:['duel','survival'].includes(this.mode),humanSlots:[...humans.keys()],deploymentSlots:[...humans.keys()],difficulty:rankIndex>=8?'hard':'standard'});
    for(const p of this.arena.players){p.respawns=0;if(!humans.has(p.id))p.botTuning=globalThis.BlindfireBotBalance.tuning(rankIndex,lossStreak);}
    this.timers.clearInterval(this.queueTimer);this.lastReceived=this.now();this.publish();
    this.inputTimer=this.timers.setInterval(()=>this.flush(),50);
    this.watchdog=this.timers.setInterval(()=>{if(!this.finished&&this.now()-this.lastReceived>12000)this.fail('战斗同步超时，本局不计排位积分');},1000);
  }
  send(action){if(this.closed||!this.arena||this.finished)return;
    if(['control','aim','mg'].includes(action.type))this.queue=this.queue.filter(a=>a.type!==action.type);
    if(this.queue.length>=30){this.fail('操作队列拥堵，请重新连接');return;}this.queue.push(action);
  }
  flush(){if(this.closed||this.finished)return;
    const commands=this.queue.splice(0,30),owner=this.room.ownerId===this.playerId;
    if(!commands.length&&!owner)return;
    const data={commands};if(owner)data.tick=++this.clockTick;
    this.call('sendFrameInput',{data:JSON.stringify(data)}).catch(e=>this.fail(e.message));
  }
  frame(raw){if(this.closed||!this.arena||this.finished)return;
    const frame=parse(raw);if(!Number.isInteger(frame.id)||frame.id<=this.lastFrame)return;
    this.lastFrame=frame.id;this.lastReceived=this.now();let tick=this.lastTick;
    const inputs=Array.isArray(frame.inputs)?frame.inputs:[];
    for(const input of inputs){const id=input.playerId||input.player_id,slot=this.slots.get(id);if(slot===undefined)continue;
      const data=parse(input.data);for(const action of (Array.isArray(data.commands)?data.commands:[]).slice(0,30)){if(action&&typeof action.type==='string')this.arena.command(slot,action);}
      if(id===this.room.ownerId&&Number.isInteger(data.tick))tick=Math.max(tick,data.tick);
    }
    if(tick-this.lastTick>120){this.fail('同步积压过多，本局不计排位积分');return;}
    while(this.lastTick<tick&&!this.arena.over){for(let i=0;i<3&&!this.arena.over;i++)this.arena.update(1/60);this.lastTick++;}
    if(this.arena.over){this.finished=true;this.timers.clearInterval(this.inputTimer);this.timers.clearInterval(this.watchdog);}
    const personalEnd=this.arena.over||(this.mode==='survival'&&this.arena.players[this.slot].hp<=0);
    if(personalEnd&&!this.settling&&!this.personalResult){this.settling=true;this.settle().catch(e=>this.emit({status:'reconnecting',error:e.message}));}
    else this.publish();
  }
  publish(result){
    const view=this.arena.snapshot(this.slot),settled=result||this.personalResult;
    if(this.finished&&!settled){view.over=false;view.settled=false;}
    if(settled&&this.mode==='survival'){view.outcome=settled.outcome;view.placement=settled.placement;}
    this.emit({status:settled?'finished':'battle',matchId:this.matchId,roster:this.roster,slot:this.slot,rank:this.rank,view,result:settled});
  }
  async settle(){
    const v=this.arena.snapshot(this.slot),before=this.record.points;
    const change=this.mode==='survival'?globalThis.BlindfireRanks.applyPlacement(before,v.placement||8):globalThis.BlindfireRanks.apply(before,v.outcome);
    const outcome=change.outcome||v.outcome;
    if(!this.completed.includes(this.matchId)){
      const s={...this.record};s.points=change.points;s.matches++;s.kills+=v.own.stats.kills||0;s.deaths+=v.own.hp<=0?1:0;if(this.mode==='survival')Object.assign(s,globalThis.BlindfireForestRecords.add(s,v.placement||8));else s[outcome==='win'?'wins':outcome==='draw'?'draws':'losses']++;s.lossStreak=outcome==='win'?0:outcome==='loss'?s.lossStreak+1:s.lossStreak;
      this.record=s;this.completed.push(this.matchId);this.completed=this.completed.slice(-100);this.outbox={matchId:this.matchId,points:s.points};this.save();
    }
    this.rank={...this.record,...globalThis.BlindfireRanks.describe(this.record.points)};
    this.rank.militaryRank=this.rank.name;
    this.personalResult={before_points:before,after_points:this.record.points,outcome,placement:v.placement,resultType:this.mode==='survival'?'placement':'duel'};
    this.publish(this.personalResult);
    try{await this.scores.submit(this.mode,this.record.points);this.outbox=null;this.save();}catch{throw Error('排位积分已保存在本机，下一次匹配前将重试上传；请勿清除游戏数据');}
  }
  close(){if(this.closed)return;this.closed=true;for(const t of [this.queueTimer,this.inputTimer,this.watchdog])this.timers.clearInterval(t);for(const cancel of [...this.pending])cancel();
    try{this.manager?.unregisterListener?.(this.listener);}catch{}
    // Once sync has begun TapTap rejects room APIs until the owner stops sync.
    // disconnect removes this player and prevents a stale room leaking callbacks.
    if(this.manager&&managerOwners.get(this.manager)===this){managerOwners.delete(this.manager);try{this.manager.disconnect({});}catch{}}
  }
}
