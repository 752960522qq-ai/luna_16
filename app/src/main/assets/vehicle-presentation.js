// Visual-only interpolation: simulation, hit tests and server snapshots remain untouched.
const angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const fields=['x','y','z','speed','wheelTravel'];
const pose=p=>({x:p.x||0,y:p.y||0,z:p.z||0,speed:p.speed||0,wheelTravel:p.wheelTravel||0,yaw:p.yaw||0,trackTravel:p.trackTravel?{...p.trackTravel}:null,vehicleId:p.vehicleId,lifeSerial:p.lifeSerial,hp:p.hp});
const blend=(s,now)=>{const t=Math.max(0,Math.min(1,(now-s.at)/s.interval)),v={...s.current};for(const k of fields)v[k]=s.previous[k]+(s.current[k]-s.previous[k])*t;v.yaw=angle(s.previous.yaw,s.current.yaw,t);if(s.current.trackTravel&&s.previous.trackTravel)v.trackTravel={left:s.previous.trackTravel.left+(s.current.trackTravel.left-s.previous.trackTravel.left)*t,right:s.previous.trackTravel.right+(s.current.trackTravel.right-s.previous.trackTravel.right)*t};return v;};
export class VehiclePresentation{
 constructor(){this.states=new Map();}
 clear(){this.states.clear();}
 sample(id,p,stamp,now){if(!p||!Number.isFinite(stamp)||p.retained)return p;let s=this.states.get(id);const discontinuity=s&&(stamp<s.stamp||p.vehicleId!==s.current.vehicleId||p.lifeSerial!==undefined&&p.lifeSerial!==s.current.lifeSerial||Math.hypot(p.x-s.current.x,p.z-s.current.z)>80||p.hp<=0||s.current.hp<=0);
  if(!s||discontinuity){s={previous:pose(p),current:pose(p),stamp,at:now,interval:1/60};this.states.set(id,s);}
  else if(stamp!==s.stamp){s.previous=blend(s,now);s.current=pose(p);s.interval=Math.max(1/120,Math.min(.2,now-s.at));s.stamp=stamp;s.at=now;}
  const visual=blend(s,now),result={...p};for(const k of fields)result[k]=visual[k];result.yaw=visual.yaw;if(visual.trackTravel)result.trackTravel=visual.trackTravel;return result;
 }
 forgetExcept(ids){for(const id of this.states.keys())if(!ids.has(id))this.states.delete(id);}
}
// Adjust only the 3D framebuffer after sustained expensive frames in 8+ vehicle battles.
export class BattleRenderBudget{
 constructor(base){this.base=base;this.ratio=base;this.duration=0;this.frames=0;this.since=0;}
 update(dt,heavy){if(!heavy){this.duration=0;this.frames=0;this.since=0;return this.ratio=this.base;}if(!Number.isFinite(dt)||dt<=0)return this.ratio;this.duration+=Math.min(dt,.1);this.since+=Math.min(dt,.1);this.frames++;if(this.since<3||this.frames<30)return this.ratio;const average=this.duration/this.frames;this.since=0;this.duration=0;this.frames=0;if(average>1/40)this.ratio=Math.max(Math.min(1,this.base),Math.round((this.ratio-.15)*100)/100);else if(average<1/58)this.ratio=Math.min(this.base,Math.round((this.ratio+.1)*100)/100);return this.ratio;}
}
