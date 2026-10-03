const assert=require('node:assert/strict');
const {open}=require('./browser-helpers.cjs');
(async()=>{
 const{browser,server,url}=await open(),page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(url);await page.waitForFunction(()=>window.GameDebug&&GameDebug.renderer.modelsReady);
  await page.locator('#startAI').click();await page.waitForFunction(()=>GameDebug.audio.stats.state==='running');
  const results=await page.evaluate(async()=>{
   const{GameAudio}=await import('./audio.js'),a=new GameAudio();a.init();await a.ctx.resume();
   const wait=ms=>new Promise(r=>setTimeout(r,ms));
   const own={x:1000,y:10,z:1000,yaw:0,speed:0,pilot:null},view={t:10,own,shots:[],sounds:[],over:false};
   const rms=()=>{const d=new Float32Array(a.analyser.fftSize);a.analyser.getFloatTimeDomainData(d);return Math.sqrt(d.reduce((s,x)=>s+x*x,0)/d.length);};
   a.sync(view,true);await wait(180);const idle={level:a.stats.engine,rms:rms()};
   own.speed=30;a.sync(view,true);await wait(350);const driving={level:a.stats.engine,rms:rms(),rpm:a.engineOsc.frequency.value};
   const buffers=[...a.buffers].map(([kind,b])=>{const d=b.getChannelData(0);return{kind,seconds:b.duration,rms:Math.sqrt(d.reduce((s,x)=>s+x*x,0)/d.length)};});
   view.sounds=buffers.map((b,i)=>({id:i+1,kind:b.kind,gain:.8,pan:.3}));a.sync(view,true);const first={...a.stats.events};a.sync(view,true);const duplicate={...a.stats.events};
   a.enabled=false;view.sounds=[{id:101,kind:'mg',gain:1,pan:0}];a.sync(view,true);await wait(350);const muted={rms:rms(),level:a.stats.engine};
   a.enabled=true;a.sync(view,true);const unmuted={...a.stats.events};
   view.sounds=[{id:102,kind:'mg',gain:1,pan:0}];a.sync(view,false);a.sync(view,true);const paused={...a.stats.events};
   own.pilot=77;view.shots=[{id:77,mine:true,kind:'missile',x:1400,y:90,z:1000}];a.sync(view,true);const distant=a.stats.engine;
   a.sync(null,false);const menu=a.stats.engine;a.reset();const reset=a.voices.size,error=a.stats.error;await a.ctx.close();
   return{idle,driving,buffers,first,duplicate,muted,unmuted,paused,distant,menu,reset,error};
  });
  assert.ok(results.idle.rms>1e-4);assert.ok(results.driving.level>results.idle.level);assert.ok(results.driving.rpm>85);assert.equal(results.buffers.length,8);
  for(const b of results.buffers){assert.ok(b.rms>.01,b.kind+' buffer is silent');assert.ok(b.seconds>.1);assert.equal(results.first[b.kind],1);}
  assert.deepEqual(results.duplicate,results.first);assert.deepEqual(results.unmuted,results.first);assert.deepEqual(results.paused,results.first);
  assert.ok(results.muted.rms<1e-4,JSON.stringify(results.muted));assert.equal(results.muted.level,0);assert.equal(results.distant,0);assert.equal(results.menu,0);assert.equal(results.reset,0);assert.equal(results.error,null);
  await page.evaluate(()=>onNativePause());await page.waitForFunction(()=>GameDebug.audio.stats.state==='suspended');assert.equal(await page.evaluate(()=>GameDebug.audio.stats.engine),0);
  await page.evaluate(()=>onNativeResume());await page.locator('#resume').click();await page.waitForFunction(()=>GameDebug.audio.stats.state==='running');assert.deepEqual(errors,[]);
  console.log('PASS real WebAudio: eight non-silent weapon/hit/explosion buffers, RPM engine, event deduplication, mute, pause, distance attenuation and native background/resume');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
