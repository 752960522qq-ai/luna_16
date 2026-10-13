import {CREW_CLIPS} from './audio/crew-bank.js';
const types={missile:'Missile_Vehicle_Spotted',artillery:'Self_Propelled_Artillery_Spotted',tank:'Tank_Spotted'};
const air={uav:'Enemy_Drone_Spotted',reconPlane:'Enemy_Recon_Aircraft_Spotted',bomber:'Air_Raid_Alert'};
const launch={uav:'Friendly_Drone_Airborne',reconPlane:'Friendly_Recon_Approaching_Target',bomber:'Friendly_Fighter_Attack_Run',missile:'friendly_Missile_Launched'};
export function voiceClips(event){
 if(event.kind==='spotted'){if(event.distance>1000)return [];const clips=[types[event.targetKind],`Direction_${String(event.clock).padStart(2,'0')}_OClock`];if(event.distance<200)clips.push('Close_Range');else clips.push('Firing_Distance',`Range_${Math.max(200,Math.min(1000,Math.round(event.distance/100)*100))}m`);return clips.filter(Boolean);}
 if(event.kind==='air')return air[event.targetKind]?[air[event.targetKind]]:[];
 if(event.kind==='launch')return launch[event.targetKind]?[launch[event.targetKind]]:[];
 return {start:['Orders_Received_Prepare_For_Battle'],hit:['Target_Hit'],hurt:['We_Are_Hit'],kill:['Target_Destroyed'],destroyed:['Vehicle_Destroyed_All_Units_Withdraw'],win:['Mission_Victory_Great_Job'],loss:['Mission_Failed_We_Will_Return']}[event.kind]||[];
}
export class CrewVoice {
 constructor(audio){this.audio=audio;this.buffers=new Map();this.reset();}
 load(){if(this.loading||!this.audio.ctx)return;this.loading=Promise.allSettled(CREW_CLIPS.map(async name=>{const r=await fetch(new URL(`audio/crew/${name}.mp3`,import.meta.url));if(!r.ok)throw Error(name);this.buffers.set(name,await this.audio.ctx.decodeAudioData(await r.arrayBuffer()));})).then(results=>{this.errors=results.flatMap((r,i)=>r.status==='rejected'?[CREW_CLIPS[i]]:[]);this.loaded=true;});}
 reset(){this.generation=(this.generation||0)+1;for(const source of this.sources||[])try{source.stop();}catch(_){}this.sources=new Set();this.current=null;this.queue=[];this.seen=new Set();this.cooldowns=new Map();this.terminal=false;this.lastTime=-1;}
 sync(view,playing){if(!view){this.reset();return;}if(view.t<this.lastTime)this.reset();this.lastTime=view.t;
 // Result/death lines continue after settlement. Pause preserves the active sentence.
 if(!playing||!this.audio.enabled||!this.audio.ctx||this.audio.ctx.state!=='running')return;
 this.load();if(!this.loaded)return;
 for(const event of view.crewEvents||[]){if(this.seen.has(event.id))continue;this.seen.add(event.id);if(view.t-event.t>4)continue;this.accept(event);}
 if(this.seen.size>512)this.seen=new Set([...this.seen].slice(-256));
 if(!this.current)this.next();}
 accept(event){const clips=voiceClips(event);if(!clips.length||clips.some(c=>!this.buffers.has(c)))return false;
 const interrupt=['win','loss','destroyed'].includes(event.kind);
 if(interrupt){this.generation++;for(const source of this.sources)try{source.stop();}catch(_){}this.sources.clear();this.current=null;this.queue=[];this.terminal=true;this.queue.push({event,clips});this.next();return true;}
 if(this.terminal)return false;
 const cooldown=['spotted','air'].includes(event.kind)?'discovery':['hit','hurt'].includes(event.kind)?event.kind:null;
 if(cooldown&&event.t-(this.cooldowns.get(cooldown)??-Infinity)<10)return false;
 if(event.kind!=='kill'&&(this.current||this.queue.length))return false;
 if(cooldown)this.cooldowns.set(cooldown,event.t);
 this.queue.push({event,clips});this.next();return true;}
 next(){if(this.current||!this.queue.length)return;const message=this.queue.shift(),ctx=this.audio.ctx,token=this.generation;this.current=message;let at=ctx.currentTime+.015;
 // Schedule the complete compound report atomically: no interleaving between clips.
 for(const [index,name]of message.clips.entries()){const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=this.buffers.get(name);gain.gain.value=.9;source.connect(gain);gain.connect(this.audio.master);this.sources.add(source);source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();if(token!==this.generation)return;if(index===message.clips.length-1){this.current=null;this.next();}};source.start(at);at+=source.buffer.duration+.045;}
 }
 stop(){this.reset();}
}
