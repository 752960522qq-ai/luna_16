import {CREW_CLIPS} from './audio/crew-bank.js';
const types={missile:'Missile_Vehicle_Spotted',artillery:'Self_Propelled_Artillery_Spotted',tank:'Tank_Spotted'};
const air={uav:'Enemy_Drone_Spotted',reconPlane:'Enemy_Recon_Aircraft_Spotted',bomber:'Air_Raid_Alert'};
const launch={uav:'Friendly_Drone_Airborne',reconPlane:'Recon_Aircraft_On_Course',bomber:'Fighter_Attack_Approach',missile:'Missile_Launched'};
export const CREW_READY_ENABLED=false;
export const VOICE_POOLS=Object.freeze({start:['Prepare_For_Battle','All_Units_To_Positions','Board_Vehicles'],hit:['Target_Hit','Target_Heavily_Damaged','Good_Hit'],hurt:['We_Are_Hit','Vehicle_Hit','Enemy_Hit_Us'],kill:['Enemy_Destroyed','Target_Destroyed','Send_Them_To_Hell'],destroyed:['Vehicle_Destroyed_Retreat','Vehicle_Destroyed_Evacuate'],win:['Mission_Victory_Clear_Battlefield','Mission_Victory_Well_Done'],loss:['Mission_Failed_Withdraw','Mission_Failed_Encouragement'],artilleryFire:['Fire_Short','Launch','Open_Fire'],mapAim:['Firing_Solution_Calculated','Firing_Data_Set_Prepare_To_Fire'],reloadReady:['Ammunition_Loaded','High_Explosive_Ready','Shrapnel_Round_Ready'],close:['Direct_Fire','Close_Range']});
export const READY_TEXT={driver:'驾驶员就位',gunner:'炮长就位',loader:'二炮手就位',radio:'无线电员就位'};
const choose=(pool,random)=>pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
export function voiceClips(event,random=Math.random){
 if(event.kind==='spotted'){if(event.distance>1000)return [];const clips=[types[event.targetKind],`Clock_${String(event.clock).padStart(2,'0')}`];if(event.distance<200)clips.push(choose(VOICE_POOLS.close,random));else clips.push('Firing_Range',`Range_${String(Math.max(200,Math.min(1000,Math.round(event.distance/100)*100))).padStart(4,'0')}m`);return clips.filter(Boolean);}
 if(event.kind==='ready'&&!CREW_READY_ENABLED)return [];
 if(event.kind==='ready')return ['driver','gunner','loader','radio'].filter(r=>event.roles?.includes(r)).map(r=>'ready_'+r);
 if(event.kind==='air')return air[event.targetKind]?[air[event.targetKind]]:[];
 if(event.kind==='launch')return launch[event.targetKind]?[launch[event.targetKind]]:[];
 return VOICE_POOLS[event.kind]?[choose(VOICE_POOLS[event.kind],random)]:[];
}
export class CrewVoice {
 constructor(audio){this.audio=audio;this.random=Math.random;this.buffers=new Map();this.reset();}
 load(){if(this.loading||!this.audio.ctx)return;this.loading=Promise.allSettled(CREW_CLIPS.map(async name=>{const r=await fetch(new URL(`audio/crew/${name}.mp3`,import.meta.url));if(!r.ok)throw Error(name);this.buffers.set(name,await this.audio.ctx.decodeAudioData(await r.arrayBuffer()));})).then(results=>{this.errors=results.flatMap((r,i)=>r.status==='rejected'?[CREW_CLIPS[i]]:[]);this.loaded=true;this.prepareReady();});}
 prepareReady(){if(!CREW_READY_ENABLED)return;if(this.readyRequested)return;this.readyRequested=true;
  if(globalThis.Native?.prepareCrewVoices){globalThis.onNativeCrewVoice=async(role,data)=>{if(!READY_TEXT[role])return;if(!data){(this.readyUnavailable||=new Set()).add(role);return;}try{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));this.buffers.set('ready_'+role,await this.audio.ctx.decodeAudioData(bytes.buffer));if(!this.current)this.next();}catch(e){console.warn('Crew ready voice unavailable',role);}};Native.prepareCrewVoices();}
 }
 reset(){this.generation=(this.generation||0)+1;globalThis.speechSynthesis?.cancel();for(const source of this.sources||[])try{source.stop();}catch(_){}this.sources=new Set();this.current=null;this.queue=[];this.seen=new Set();this.cooldowns=new Map();this.terminal=false;this.lastTime=-1;}
 sync(view,playing){if(!view){this.reset();return;}if(view.t<this.lastTime)this.reset();this.lastTime=view.t;
 // Result/death lines continue after settlement. Pause preserves the active sentence.
 if(!playing||!this.audio.enabled||!this.audio.ctx||this.audio.ctx.state!=='running')return;
 this.load();if(!this.loaded)return;
 for(const event of view.crewEvents||[]){if(this.seen.has(event.id))continue;this.seen.add(event.id);if(view.t-event.t>4&&!['start','ready'].includes(event.kind))continue;this.accept(event);}
 if(this.seen.size>512)this.seen=new Set([...this.seen].slice(-256));
 if(!this.current)this.next();}
 accept(event){const clips=voiceClips(event,this.random);if(!clips.length||clips.some(c=>!c.startsWith('ready_')&&!this.buffers.has(c)))return false;
 const interrupt=['win','loss','destroyed'].includes(event.kind);
 if(interrupt){this.generation++;globalThis.speechSynthesis?.cancel();for(const source of this.sources)try{source.stop();}catch(_){}this.sources.clear();this.current=null;this.queue=[];this.terminal=true;this.queue.push({event,clips});this.next();return true;}
 if(this.terminal)return false;
 const cooldown=['spotted','air'].includes(event.kind)?'discovery':['hit','hurt'].includes(event.kind)?event.kind:event.kind==='mapAim'?'mapAim':null;
 if(cooldown&&event.t-(this.cooldowns.get(cooldown)??-Infinity)<(event.kind==='mapAim'?15:10))return false;
 if(!['kill','ready'].includes(event.kind)&&(this.current||this.queue.length))return false;
 if(cooldown)this.cooldowns.set(cooldown,event.t);
 if(event.kind==='ready')for(const clip of clips)this.queue.push({event,clips:[clip]});else this.queue.push({event,clips});this.next();return true;}
 next(){if(this.current||!this.queue.length)return;const message=this.queue.shift(),ctx=this.audio.ctx,token=this.generation;this.current=message;let at=ctx.currentTime+.015;
 // Schedule the complete compound report atomically: no interleaving between clips.
 for(const [index,name]of message.clips.entries()){if(name.startsWith('ready_')&&!this.buffers.has(name)){this.speakReady(message,token,index);return;}
 const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=this.buffers.get(name);gain.gain.value=.9;if(name.startsWith('ready_')&&ctx.createBiquadFilter){const high=ctx.createBiquadFilter(),low=ctx.createBiquadFilter();high.type='highpass';high.frequency.value=350;low.type='lowpass';low.frequency.value=3000;source.connect(high);high.connect(low);low.connect(gain);}else source.connect(gain);gain.connect(this.audio.voiceGain||this.audio.master);this.sources.add(source);source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();if(token!==this.generation)return;if(index===message.clips.length-1){this.current=null;this.next();}};source.start(at);at+=source.buffer.duration+.045;}
 }
 speakReady(message,token){const role=message.clips[0].slice(6),done=()=>{if(token!==this.generation)return;this.current=null;this.next();};
  // Android synthesizes cached WAVs, played through WebAudio radio filters. Browser fallback uses its speech engine.
  if(globalThis.Native?.prepareCrewVoices){const until=performance.now()+8000;const retry=()=>{if(token!==this.generation)return;if(this.buffers.has(message.clips[0])){this.current=null;this.queue.unshift(message);this.next();}else if(!this.readyUnavailable?.has(role)&&performance.now()<until)setTimeout(retry,100);else{console.warn('Chinese system speech missing: '+READY_TEXT[role]);done();}};retry();return;}
  if(globalThis.speechSynthesis&&globalThis.SpeechSynthesisUtterance){const utterance=new SpeechSynthesisUtterance(READY_TEXT[role]);utterance.lang='zh-CN';utterance.rate=1.05;utterance.onend=done;utterance.onerror=done;speechSynthesis.speak(utterance);}else done();
 }
 stop(){this.reset();}
}
