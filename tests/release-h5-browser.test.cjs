const assert=require('node:assert/strict'),path=require('node:path'),{open}=require('./browser-helpers.cjs');
(async()=>{
 const {browser,server,url}=await open({assets:path.resolve(process.env.H5_ASSETS||'app/src/main/assets')}),errors=[],missing=[];
 try{
  const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(r.url())});
  await page.goto(url+'&fullUnlockTest=1&infiniteCoins=1');await page.waitForFunction(()=>window.GameDebug?.renderer.modelsReady,{timeout:90000});await page.evaluate(()=>GameDebug.renderer.environmentPromise);
  const state=await page.evaluate(async()=>{
   const T=await import('./three.module.js'),B=Blindfire,r=GameDebug.renderer;r.ready=false;await r.structureRenderer.ready;
   const engine=new BlindfireBreakthrough.BreakthroughEngine({mode:'lan',seed:31,countdown:0,lineup:['handlv_missile']}),view=engine.snapshot(0);r.structureRenderer.update(view.structures);r.scene.updateMatrixWorld(true);
   const sizes=[];for(const s of view.structures.filter(s=>s.kind==='outpost')){const asset=r.structureRenderer.instances.get(s.id).userData.structureAsset,box=new T.Box3().setFromObject(asset),size=box.getSize(new T.Vector3());sizes.push({visual:size.toArray(),collision:[s.w,s.h,s.d],hp:s.hp,recon:s.recon,ground:box.min.y-s.y});}
   const po2=r.airModels.po2.clone(true),hub=po2.getObjectByName('Po2Propeller'),blade=po2.getObjectByName('Line03-FACES'),rudder=po2.getObjectByName('Circle10-FACES'),directions=[];
   for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){r.orient(po2,{x:0,y:100,z:0,yaw,pitch:.15});po2.updateMatrixWorld(true);const forward=hub.position.clone().setY(0).transformDirection(po2.matrixWorld),d=B.direction(yaw,.15);directions.push(forward.dot(new T.Vector3(d.x,d.y,d.z)));}
   const lod=[];for(const map of ['city','hills']){r.setMap(map,2500);r.camera.position.set(1250,350,2900);r.camera.lookAt(1250,0,1000);r.mapLOD.update(r.camera,1000,true);r.gl.render(r.scene,r.camera);lod.push({map,batches:r.mapLOD.entries.length,far:r.mapLOD.entries.filter(e=>e.near===false).length});}
   return{owned:GameDebug.profile.owned,coins:GameDebug.profile.coins,infinite:GameDebug.profile.infiniteCoins,vehicles:Object.keys(B.VEHICLES),sizes,directions,bladeParent:blade.parent.name,rudderParent:rudder.parent.name,lod};
  });
  assert.deepEqual(state.owned,['handlv_missile']);assert.equal(state.coins,0);assert.equal(state.infinite,false);for(const id of ['katyusha','silver_valkyrie','grand_judicator'])assert.ok(state.vehicles.includes(id),id);
  assert.equal(state.sizes.length,6);for(const s of state.sizes){assert.equal(s.collision[0],54);for(let i=0;i<3;i++)assert.ok(Math.abs(s.visual[i]-s.collision[i])<.03,JSON.stringify(s));assert.ok(Math.abs(s.ground)<.02);assert.equal(s.recon,500);}
  assert.ok(Math.min(...state.directions)>.99);assert.equal(state.bladeParent,'Po2Propeller');assert.notEqual(state.rudderParent,'Po2Propeller');for(const l of state.lod)assert.ok(l.batches>0&&l.far>0);
  for(const [w,h]of [[844,390],[932,430],[568,320]]){await page.setViewportSize({width:w,height:h});await page.waitForFunction(()=>document.body.classList.contains('h5-landscape'));assert.equal(await page.locator('#portraitHint').isVisible(),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.body.classList.contains('h5-portrait'));assert.equal(await page.locator('#portraitHint').isVisible(),true);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);console.log('PASS locked H5, all vehicles, enlarged outpost visual/collider agreement, PO-2 headings/propeller, both LOD maps and phone landscape layouts',JSON.stringify(state));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
