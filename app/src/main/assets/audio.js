/* Offline procedural vehicle and weapon audio. Gameplay sounds use confirmed host events. */
export class GameAudio {
  constructor(){this._enabled=true;this.ctx=null;this.buffers=new Map();this.seen=new Set();this.voices=new Set();this.counts={};this.engineLevel=0;this.lastTime=-1;}
  get enabled(){return this._enabled;}
  set enabled(value){this._enabled=!!value;if(this.master)this.master.gain.setTargetAtTime(this._enabled?.7:0,this.ctx.currentTime,.025);if(!this._enabled)this.stopLoops();}
  init(){
    if(!this.enabled)return;
    try{
      if(!this.ctx){
        const Audio=window.AudioContext||window.webkitAudioContext;this.ctx=new Audio();const ctx=this.ctx;
        this.master=ctx.createGain();this.master.gain.value=.7;const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-18;limiter.knee.value=16;limiter.ratio.value=4;limiter.attack.value=.004;limiter.release.value=.15;
        this.analyser=ctx.createAnalyser();this.analyser.fftSize=1024;this.master.connect(limiter);limiter.connect(this.analyser);this.analyser.connect(ctx.destination);
        for(const[k,seconds]of Object.entries({uav:.75,missile:1.05,artillery:1.05,sam:.7,mg:.14,impact:.35,explosion:1.8,confirm:.12}))this.buffers.set(k,this.makeBuffer(k,seconds));
        this.engineGain=ctx.createGain();this.engineGain.gain.value=0;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=850;filter.connect(this.engineGain);this.engineGain.connect(this.master);
        this.engineOsc=ctx.createOscillator();this.engineOsc.type='sawtooth';this.engineOsc.frequency.value=44;this.engineOsc.connect(filter);this.engineOsc.start();
        this.engineHarmonic=ctx.createOscillator();this.engineHarmonic.type='triangle';this.engineHarmonic.frequency.value=88;const blend=ctx.createGain();blend.gain.value=.35;this.engineHarmonic.connect(blend);blend.connect(filter);this.engineHarmonic.start();
        this.droneGain=ctx.createGain();this.droneGain.gain.value=0;this.droneGain.connect(this.master);this.droneOsc=ctx.createOscillator();this.droneOsc.type='triangle';this.droneOsc.frequency.value=195;this.droneOsc.connect(this.droneGain);this.droneOsc.start();
      }
      if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
    }catch(e){this.error=String(e);}
  }
  makeBuffer(kind,seconds){
    const rate=this.ctx.sampleRate,buffer=this.ctx.createBuffer(1,Math.ceil(rate*seconds),rate),data=buffer.getChannelData(0);let seed=12379,low=0,mid=0;
    for(let i=0;i<data.length;i++){
      const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/2147483648-1;low+=.025*(white-low);mid+=.22*(white-mid);
      let v=0;
      if(kind==='artillery')v=.9*mid*Math.exp(-t/ .12)+Math.sin(2*Math.PI*(65*t-17*t*t))*.65*Math.exp(-t/.28)+low*2.2*Math.exp(-t/.46);
      else if(kind==='mg')v=(white*.62+mid*.7)*Math.exp(-t/.024)+Math.sin(2*Math.PI*145*t)*.28*Math.exp(-t/.065);
      else if(kind==='explosion')v=low*3.4*Math.exp(-t/.6)+mid*.65*Math.exp(-t/.25)+Math.sin(2*Math.PI*(48*t-6*t*t))*.42*Math.exp(-t/.5);
      else if(kind==='impact')v=white*.25*Math.exp(-t/.018)+(Math.sin(2*Math.PI*1430*t)+.55*Math.sin(2*Math.PI*2630*t))*.30*Math.exp(-t/.11);
      else if(kind==='confirm')v=(Math.sin(2*Math.PI*930*t)+.45*Math.sin(2*Math.PI*1400*t))*.33*Math.exp(-t/.035);
      else if(kind==='uav')v=Math.sin(2*Math.PI*(125*t+120*t*t))*.14*Math.exp(-t/.5)+mid*.24*Math.exp(-t/.3);
      else{const sam=kind==='sam';v=(mid*.68+low*1.5)*Math.exp(-t/(sam?.2:.37))+Math.sin(2*Math.PI*((sam?140:95)*t-18*t*t))*.3*Math.exp(-t/.17);}
      const attack=Math.min(1,t/.0018),release=Math.min(1,(seconds-t)/.02);data[i]=Math.max(-.95,Math.min(.95,v*attack*release));
    }
    return buffer;
  }
  reset(){this.seen.clear();this.lastTime=-1;this.stopLoops();for(const source of this.voices)try{source.stop();}catch(_){}this.voices.clear();}
  stopLoops(){this.engineLevel=0;if(this.ctx&&this.engineGain){const t=this.ctx.currentTime;this.engineGain.gain.setTargetAtTime(0,t,.03);this.droneGain.gain.setTargetAtTime(0,t,.03);}}
  play(kind){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const tones={click:[540,390,.045,.04],lock:[770,1300,.15,.07],warning:[350,210,.12,.055]},s=tones[kind]||tones.click,ctx=this.ctx,t=ctx.currentTime,o=ctx.createOscillator(),gain=ctx.createGain();
    o.type='sine';o.frequency.setValueAtTime(s[0],t);o.frequency.exponentialRampToValueAtTime(s[1],t+s[2]);gain.gain.setValueAtTime(s[3],t);gain.gain.exponentialRampToValueAtTime(.001,t+s[2]);o.connect(gain);gain.connect(this.master);o.onended=()=>{o.disconnect();gain.disconnect();};o.start(t);o.stop(t+s[2]+.01);
  }
  event(event){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running'||!this.buffers.has(event.kind)||this.voices.size>=28)return;
    const ctx=this.ctx,source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner?ctx.createStereoPanner():null;
    source.buffer=this.buffers.get(event.kind);gain.gain.value=Math.max(0,Math.min(1,event.gain))*(event.kind==='confirm'?.45:event.kind==='mg'?.38:.6);source.connect(gain);
    if(pan){pan.pan.value=Math.max(-1,Math.min(1,event.pan));gain.connect(pan);pan.connect(this.master);}else gain.connect(this.master);
    this.voices.add(source);this.counts[event.kind]=(this.counts[event.kind]||0)+1;
    source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();if(pan)pan.disconnect();};source.start();
  }
  sync(view,playing){
    if(!view){this.stopLoops();return;}if(view.t<this.lastTime)this.reset();this.lastTime=view.t;
    for(const e of view.sounds||[]){if(this.seen.has(e.id))continue;this.seen.add(e.id);if(playing)this.event(e);}
    if(this.seen.size>256)this.seen=new Set([...this.seen].slice(-128));
    if(!playing||view.over||!this.enabled||!this.ctx||this.ctx.state!=='running'){this.stopLoops();return;}
    const own=view.own,pilot=view.shots.find(s=>s.mine&&s.id===own.pilot),distance=pilot?Math.hypot(pilot.x-own.x,pilot.y-own.y,pilot.z-own.z):0;
    this.engineLevel=(.032+Math.min(1,Math.abs(own.speed)/33)*.055)*Math.max(0,1-distance/180)**2;
    const t=this.ctx.currentTime,rpm=44+Math.abs(own.speed)*1.6;this.engineOsc.frequency.setTargetAtTime(rpm,t,.13);this.engineHarmonic.frequency.setTargetAtTime(rpm*2,t,.13);this.engineGain.gain.setTargetAtTime(this.engineLevel,t,.07);
    const listener=pilot||own,drone=view.shots.find(s=>s.mine&&s.kind==='uav'),d=drone?Math.hypot(drone.x-listener.x,drone.y-listener.y,drone.z-listener.z):Infinity;
    this.droneGain.gain.setTargetAtTime(.035*Math.max(0,1-d/160)**2,t,.09);
  }
  get stats(){return{enabled:this.enabled,state:this.ctx?this.ctx.state:'idle',engine:this.engineLevel,voices:this.voices.size,events:{...this.counts},buffers:this.buffers.size,error:this.error||null};}
}
