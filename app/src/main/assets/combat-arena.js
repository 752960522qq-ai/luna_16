(function(root){'use strict';const node=typeof module!=='undefined'&&module.exports;
const B=node?require('./engine.js'):root.Blindfire,Base=(node?require('./breakthrough.js'):root.BlindfireBreakthrough).BreakthroughEngine;
class DarkForestArena extends B.Engine{
 constructor(opts={}){super({...opts,battleMode:'dark_forest'});this.humanSlots=new Set(opts.humanSlots||[0]);for(const p of this.players){p.team=p.id;p.respawns=0;if(!p.lineup?.length)p.lineup=[p.vehicleId];p.awaitingDeployment=(opts.deploymentSlots||[]).includes(p.id);}}
}
class CombatArena extends Base{
 constructor(opts={}){if(opts.freeForAll||opts.battleMode==='dark_forest'||(opts.survival&&opts.teamSize===8))return new DarkForestArena(opts);super(opts);this.arenaSurvival=opts.survival===true;this.humanSlots=new Set(opts.humanSlots||[0]);if(this.arenaSurvival){this.structures=[];for(let i=B.BUILDINGS.length-1;i>=0;i--)if(B.BUILDINGS[i].structureId)B.BUILDINGS.splice(i,1);B.invalidateSceneryIndex();this.navigation.refresh();this.limit=180;for(const p of this.players){p.respawns=0;if(!p.lineup?.length)p.lineup=[p.vehicleId];p.awaitingDeployment=(opts.deploymentSlots||[]).includes(p.id);}}}
 canRespawn(p){return this.arenaSurvival?false:super.canRespawn(p);}
 restricted(p){return this.arenaSurvival?false:super.restricted(p);}
 breach(team){return this.arenaSurvival?true:super.breach(team);}
 update(dt){if(!this.arenaSurvival)return super.update(dt);B.Engine.prototype.update.call(this,dt);if(!this.over){const alive=this.players.filter(p=>p.hp>0);if(alive.length===1)this.finishTeam(alive[0].team,'1v1 · 敌方载具被摧毁');else if(!alive.length)this.finishTeam(null,'双方载具均被摧毁');}if(!this.over&&this.t-this.countdown>=this.limit){const score=[0,0];for(const p of this.players)if(p.hp>0)score[p.team]+=10000+p.hp;this.finishTeam(score[0]===score[1]?null:score[0]>score[1]?0:1,'时间结束，比较存活载具与剩余耐久');}}
 snapshot(id){const v=super.snapshot(id);if(this.arenaSurvival){v.arenaSurvival=true;v.battleMode='duel';v.zone=null;}return v;}
}
const api={CombatArena,DarkForestArena};if(node)module.exports=api;root.BlindfireArena=api;
})(typeof window!=='undefined'?window:globalThis);
