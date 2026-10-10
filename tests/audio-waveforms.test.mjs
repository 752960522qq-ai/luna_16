import assert from 'node:assert/strict';import {GameAudio} from '../app/src/main/assets/audio.js';
const audio=new GameAudio();audio.ctx={sampleRate:48000,createBuffer(ch,n,rate){const data=new Float32Array(n);return {duration:n/rate,getChannelData:()=>data};}};
for(const [kind,length]of [['autocannon',.28],['reload',1.2],['artillery',1.05]]){const b=audio.makeBuffer(kind,length),a=b.getChannelData(0),rms=Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);assert.ok(rms>.01,kind);assert.ok(a.every(v=>Number.isFinite(v)&&Math.abs(v)<=.95));console.log('PASS synthesized',kind,'RMS',rms.toFixed(3));}
