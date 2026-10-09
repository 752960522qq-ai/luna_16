(function(root){
 const B=typeof module!=='undefined'&&module.exports?require('./engine.js'):root.Blindfire;
 const STEPS=[
 ['欢迎来到盲区交火','你和敌人都驾驶悍驴导弹车。按“继续”开始实战教学。',true],
 ['目标：先侦察，再击毁','双方开局互相不可见。利用空中轨迹判断敌人方向，发现位置后攻击。',true],
 ['驾驶车辆','推动左侧摇杆向前，实际移动10米。'],
 ['观察敌方无人机','看向前上方：敌方无人机在450米以外经过，并未侦察到你。注意天空中的白色轨迹。'],
 ['尾迹也是情报','小地图黄色可疑区域表示敌人可能的来源方向，不能当作精确位置。圈出的区域就是接下来的搜索方向。',true],
 ['沿轨迹侦察','选择无人机并开火。向前方黄色区域飞行；左右拖动调整航向，上下控制俯仰。目标在正前方。'],
 ['确认热源与盘旋','已发现敌方悍驴！点击“50m盘旋”，让无人机留在附近持续侦察。此时敌人不会反击。'],
 ['返回车辆，发射导弹','盘旋会自动返回车辆；也可点击返回车辆。选择导弹并开火。按红点方向飞向敌车，贴近敌人后撞击或点击自爆。'],
 ['你也被侦察了','导弹命中！敌方无人机正在进入我方范围，并且也发现了你。每一次行动都会交换情报。',true],
 ['拦截来袭导弹','敌方巡航导弹来袭。返回车辆，选择防空导弹并开火，自动锁定近处空中目标。'],
 ['机枪最后防线','选择高射机枪。拖动画面将准星对准敌方无人机，按住开火将它击落。'],
 ['自由交火','现在自由操作，击毁敌方车辆完成教学。首次完成奖励100战币。']
 ];
 class Tutorial{
  constructor(engine){this.engine=engine;this.step=-1;this.at=0;this.done=false;engine.mode='tutorial';engine.limit=3600;engine.countdown=0;
   const p=engine.players[0],enemy=engine.players[1];let x=1000,z=1600;
   for(let i=0;i<200;i++){if(B.clearGround(x,z)&&B.clearGround(x,z-650))break;x+=7;if(x>1300){x=900;z-=11;}}
   for(const [q,zz]of[[p,z],[enemy,z-650]]){q.x=x;q.z=zz;q.y=B.terrain(x,zz);q.yaw=0;for(const a of Object.values(q.aim))a.yaw=0;}
   this.start={x:p.x,z:p.z};this.advance();
  }
  get instruction(){return STEPS[this.step];}
  allow(action){
   const permitted={5:['uav'],6:['uav'],7:['missile'],9:['sam'],10:['mg']}[this.step];
   if(this.step<5&&['fire','detonate','mg','select'].includes(action.type))return false;
   if(permitted&&action.type==='select'&&!permitted.includes(action.weapon))return false;
   if(permitted&&action.type==='fire'&&!permitted.includes(this.engine.players[0].selected))return false;
   if(action.type==='mg'&&action.active&&this.step!==10&&this.step!==11)return false;
   return true;
  }
  advance(){
   this.step++;this.at=this.engine.t;const e=this.engine,p=e.players[0],enemy=e.players[1];
   if(this.step===3){
    const s=e.launch(enemy,'uav');Object.assign(s,{x:p.x-170,z:p.z-490,y:p.y+115,yaw:Math.PI/2,pitch:0,ttl:90});this.flyby=s.id;
    p.aim.missile={yaw:0,pitch:.24};
   }
   if(this.step===4){const s=e.shots.find(s=>s.id===this.flyby);if(s)s.hp=0;
    p.intel.clues=[{id:++e.id,kind:'direction',x:p.x,z:p.z-460,yaw:0,radius:500,spread:.34,tutorial:true,until:e.t+120}];}
   if(this.step===5){p.selected='uav';p.aim.uav={yaw:Math.atan2(enemy.x-p.x,p.z-enemy.z),pitch:.22};}
   if(this.step===7){p.pilot=null;p.selected='missile';p.aim.missile={yaw:Math.atan2(enemy.x-p.x,p.z-enemy.z),pitch:.08};this.beforeHp=enemy.hp;}
   if(this.step===8){
    const s=e.launch(enemy,'uav');Object.assign(s,{x:p.x,z:p.z-160,y:p.y+45,yaw:0,pitch:0,ttl:180});e.startOrbit(s);enemy.pilot=null;this.drone=s.id;e.updateIntel();
   }
   if(this.step===9){p.pilot=null;this.beforeIntercept=p.stats.intercepted;this.spawnThreat();}
   if(this.step===10){
    const s=e.shots.find(s=>s.id===this.drone);if(s){s.hp=27;s.orbit=null;s.speed=0;s.x=p.x;s.z=p.z-120;s.y=p.y+30;s.pitch=0;}
    p.pilot=null;p.selected='mg';p.aim.mg={yaw:0,pitch:Math.atan2(24.3,120)};this.beforeIntercept=p.stats.intercepted;
   }
  }
  spawnThreat(){const e=this.engine,p=e.players[0],enemy=e.players[1],s=e.launch(enemy,'missile');Object.assign(s,{x:p.x,z:p.z-280,y:p.y+60,speed:28,yaw:Math.PI,pitch:-.15,ttl:24});enemy.pilot=null;this.threat=s.id;this.threatAt=e.t;}
  tick(){
   const e=this.engine,p=e.players[0],enemy=e.players[1];
   if(this.step===2&&B.dist(p,this.start)>=10)this.advance();
   else if(this.step===3&&e.t-this.at>=7)this.advance();
   else if(this.step===5&&p.intel.lock?.visible)this.advance();
   else if(this.step===6&&e.shots.some(s=>s.owner===0&&s.kind==='uav'&&s.orbit))this.advance();
   else if(this.step===7&&enemy.hp<this.beforeHp)this.advance();
   else if(this.step===9){
    if(p.stats.intercepted>this.beforeIntercept&&!e.shots.some(s=>s.id===this.threat))this.advance();
    else if(!e.shots.some(s=>s.id===this.threat)&&e.t-this.threatAt>12){p.hp=p.maxHp;p.cd.sam=0;this.spawnThreat();}
   }else if(this.step===10&&!e.shots.some(s=>s.id===this.drone)&&p.stats.intercepted>this.beforeIntercept)this.advance();
   if(this.step>=7&&this.step<11&&enemy.hp<=0){enemy.hp=20;e.over=false;e.winner=null;e.reason='';}
   if(e.over&&e.winner===0&&this.step===11)this.done=true;
  }
 }
 const api={Tutorial,STEPS};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.BlindfireTutorial=api;
})(typeof window!=='undefined'?window:globalThis);
