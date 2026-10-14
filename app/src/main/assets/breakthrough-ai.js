/* Objective decisions and equipment use for both breakthrough teams. */
(function(root){
 'use strict';
 function create(B){
  const SCOUTS=['uav','reconPlane'];
  const active=(e,p,kind)=>e.shots.find(s=>s.owner===p.id&&s.kind===kind&&s.hp>0);
  const point=goal=>({...goal,y:goal.y+(goal.h||2)*.5});
  function objective(e,p){
   const forts=e.structures.filter(s=>s.team!==p.team&&s.hp>0&&s.kind==='outpost');
   if(e.breach(p.team))return e.structures.find(s=>s.team!==p.team&&s.hp>0&&s.kind==='base')||forts[0];
   return forts.find(s=>s.label==='ABC'[(p.id%5)%3])||forts.sort((a,b)=>B.dist(p,a)-B.dist(p,b))[0];
  }
  function chooseGoal(e,p){
   const enemy=p.intel.lock,valid=enemy&&e.t-enemy.t<(enemy.life??B.intelLife(p));
   // Assault vehicles only interrupt their objective for an immediate threat.
   // One vehicle per team also responds to detected intruders near its front.
   const defender=p.id%5===4;
   if(valid&&(B.dist(p,enemy)<300||(defender&&(p.team===0?enemy.z>1650:enemy.z<850))))return enemy;
   return objective(e,p)||(valid?enemy:null);
  }
  function guide(e,p,s,goal,dt){
   const q=point(goal),yaw=Math.atan2(q.x-s.x,s.z-q.z),pitch=Math.atan2(q.y-s.y,Math.max(1,B.dist(s,q)));
   s.yaw=B.wrap(s.yaw+B.clamp(B.wrap(yaw-s.yaw),-1.6*dt,1.6*dt));
   s.pitch+=B.clamp(pitch-s.pitch,-dt,dt);
  }
  function pilot(e,p,brain,goal,dt){
   const s=e.shots.find(s=>s.id===p.pilot&&s.hp>0);
   if(!s){p.pilot=null;return false;}
   p.drive={throttle:0,steer:0};p.mg=false;
   if(s.kind==='uav'){
    const scan=brain.flightGoal||goal;
    if(p.intel.lock?.visible&&B.dist(s,p.intel.lock)<350||B.dist(s,scan)<180){e.startOrbit(s);p.pilot=null;return false;}
    guide(e,p,s,{...scan,y:B.terrain(scan.x,scan.z)+70,h:0},dt);
   }else if(s.kind==='bomber'){
    const aim=brain.flightGoal||goal,fall=Math.sqrt(Math.max(0,s.y-B.terrain(aim.x,aim.z))*2/9.81);
    const yaw=Math.atan2(aim.x-s.x,s.z-aim.z);
    s.yaw=B.wrap(s.yaw+B.clamp(B.wrap(yaw-s.yaw),-1.6*dt,1.6*dt));s.pitch=0;
    const impact={x:s.x+Math.sin(s.yaw)*s.speed*fall,z:s.z-Math.cos(s.yaw)*s.speed*fall};
    if(s.bombs&&B.dist(impact,aim)<22)e.command(p.id,{type:'bomb'});
    if(!s.bombs){e.command(p.id,{type:'vehicle'});return false;}
   }else guide(e,p,s,goal,dt);
   return true;
  }
  function fireEquipment(e,p,brain,kind,goal){
   p.drive={throttle:0,steer:0};p.mg=false;
   if(Math.abs(p.speed)>1)return true;
   p.selected=kind;
   if(['uav','reconPlane','bomber'].includes(kind)){
    p.aim[kind]={yaw:Math.atan2(goal.x-p.x,p.z-goal.z),pitch:kind==='uav'?.35:0};
   }
   const r=e.command(p.id,{type:'fire'});
   if(r.ok&&['uav','bomber'].includes(kind))brain.flightGoal={...goal};
   brain.tactic=null;brain.nextTactic=e.t+1;return r.ok;
  }
  function equipment(e,p,brain,goal){
   if(e.restricted(p)){brain.tactic=null;return false;}
   const has=k=>e.hasWeapon(p,k),ready=k=>has(k)&&!p.cd[k];
   if(brain.tactic){if(e.t>brain.tactic.until){brain.tactic=null;return false;}return fireEquipment(e,p,brain,brain.tactic.kind,goal);}
   if(e.t<brain.nextTactic)return false;
   let kind=null;
   const air=[...p.intel.air.values()].find(c=>c.visible&&B.dist3({...p,y:p.y+2},c)<300);
   if(air&&ready('sam'))kind='sam';
   else if(air&&has('mg')){
    const d=B.direction(air.yaw,air.pitch),lead=B.dist3({...p,y:p.y+2},air)/B.weaponSpec(p,'mg').speed;
    const q={x:air.x+d.x*air.speed*lead,y:air.y+d.y*air.speed*lead,z:air.z+d.z*air.speed*lead};
    p.selected='mg';e.setAim(p,{yaw:Math.atan2(q.x-p.x,p.z-q.z),pitch:Math.atan2(q.y-p.y-2,Math.max(1,B.dist(p,q)))});
    p.mg=true;p.drive={throttle:0,steer:0};return true;
   }
   else if(has('repair')&&!p.repairUsed&&p.hp<p.maxHp*.35)kind='repair';
   else if(ready('rapidFire')&&B.dist(p,goal)<480)kind='rapidFire';
   else if(ready('observation'))kind='observation';
   else kind=SCOUTS.find(k=>ready(k)&&!active(e,p,k))||null;
   if(!kind&&ready('bomber')&&!active(e,p,'bomber')&&B.dist(p,goal)<1100)kind='bomber';
   if(!kind&&ready('highExplosive')&&!p.heArmed&&p.intel.lock?.visible)kind='highExplosive';
   if(!kind){brain.nextTactic=e.t+.5;return false;}
   // Fixed rapid-fire launchers must face the target before the burst starts.
   if(kind==='rapidFire'){
    const yaw=Math.atan2(goal.x-p.x,p.z-goal.z),error=B.wrap(yaw-p.yaw);
    if(Math.abs(error)>.05){p.drive={throttle:0,steer:B.clamp(error*2,-1,1)};return true;}
   }
   brain.tactic={kind,until:e.t+4};return fireEquipment(e,p,brain,kind,goal);
  }
  function mainAttack(e,p,brain,goal){
   const kind=p.weapons.includes('missile')?'missile':p.weapons.includes('tankCannon')?'tankCannon':p.weapons.includes('autocannon')?'autocannon':'artillery';
   p.selected=kind;p.mg=false;
   const spec=B.weaponSpec(p,kind),range=spec.range||Math.min(1000,spec.speed*spec.life),d=B.dist(p,goal);
   const desired=Math.min(range*(kind==='artillery'?.8:.7),kind==='artillery'?850:kind==='missile'?650:400);
   const arc=kind==='artillery';
   let solution=null;
   if(arc){const old=brain.gunSolution;if(old&&old.id===goal.id&&e.t-old.at<.2&&B.dist(p,old)<1&&B.dist(goal,old.goal)<2)solution=old.aim;else{solution=B.solveArtillery(p,goal);brain.gunSolution={id:goal.id,at:e.t,x:p.x,z:p.z,goal:{x:goal.x,z:goal.z},aim:solution};}}
   const clear=arc?!!solution:e.clearShot(p,goal);
   if(d>desired||!clear){e.approach(p,goal,range);return;}
   p.drive={throttle:0,steer:0};
   if(Math.abs(p.speed)>1)return;
   const aim=arc?solution:B.Wire.isWire(p)?B.Wire.aimAt(B,p,point(goal)):{yaw:Math.atan2(goal.x-p.x,p.z-goal.z),pitch:Math.atan2(point(goal).y-B.muzzle(p,kind).y,Math.max(1,d))};
   if(!aim)return;
   const v=B.vehicleSpec(p.vehicleId),error=B.wrap(aim.yaw-p.yaw);
   if(v.launcherFixed||v.launcherYaw!==undefined&&Math.abs(error)>v.launcherYaw*.9||v.turretYaw!==undefined&&Math.abs(error)>v.turretYaw*.9){
    if(Math.abs(error)>.04){if(p.spadeDeployed){p.selected='spade';e.command(p.id,{type:'fire'});p.selected=kind;}p.drive.steer=B.clamp(error*2,-1,1);return;}
   }
   e.setAim(p,aim);
   if(arc&&e.hasWeapon(p,'spade')&&!p.spadeDeployed){p.selected='spade';e.command(p.id,{type:'fire'});p.selected=kind;}
   if(!p.cd[kind])e.command(p.id,{type:'fire'});
  }
  function run(e,dt){for(const p of e.players){
   if(p.id===0||p.hp<=0)continue;
   p.controlAt=e.t;
   const brain=p.battleBrain||(p.battleBrain={nextTactic:0,tactic:null,flightGoal:null});
   const goal=chooseGoal(e,p);if(!goal){p.drive={throttle:0,steer:0};continue;}
   if(p.repairUntil){p.drive={throttle:0,steer:0};continue;}
   if(B.Wire.isWire(p)){p.scopeActive=true;if(!e.restricted(p)&&!p.thermalActive&&p.thermalCharge>30)p.thermalActive=true;if(p.guidedMissile){p.selected='missile';const q=point(goal);e.setAim(p,B.Wire.aimAt(B,p,q));p.drive={throttle:0,steer:0};p.mg=false;continue;}}
   if(pilot(e,p,brain,goal,dt))continue;
   if(p.burstRemaining){p.drive={throttle:0,steer:0};continue;}
   if(equipment(e,p,brain,goal))continue;
   mainAttack(e,p,brain,goal);
  }}
  return {run,chooseGoal,objective};
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireBreakthroughAI=api;
})(typeof window!=='undefined'?window:globalThis);
