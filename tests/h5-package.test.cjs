const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const{spawnSync}=require('node:child_process'),{open}=require('./browser-helpers.cjs');
const zip=path.resolve(process.env.H5_ZIP||'build/blindfire-v0.7-taptap-h5.zip'),assets=fs.mkdtempSync(path.join(os.tmpdir(),'blindfire-h5-'));
const extracted=spawnSync('python3',['-c',"import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert 'index.html' in z.namelist(); assert not any(p.startswith('/') or '..' in p.split('/') for p in z.namelist()); z.extractall(sys.argv[2])",zip,assets],{encoding:'utf8'});
assert.equal(extracted.status,0,extracted.stderr);
(async()=>{
 const{browser,server,url}=await open({assets,basePath:'/games/blindfire/0.7/'}),page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),requests=[],errors=[];
 page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(url);await page.waitForFunction(()=>window.GameDebug?.renderer.modelsReady);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#openLAN').isVisible(),false);assert.equal(await page.evaluate(()=>typeof Native),'undefined');
  await page.locator('[data-difficulty="hard"]').click();await page.locator('#startAI').click();await page.waitForFunction(()=>GameDebug.view.started);assert.equal(await page.evaluate(()=>GameDebug.engine.difficulty),'hard');
  await page.evaluate(()=>{const e=GameDebug.engine,B=Blindfire;e.mode='lan';const p=e.players[0];Object.assign(p,{x:1000,z:1880,y:B.terrain(1000,1880),yaw:0});GameDebug.select('artillery');GameDebug.dispatch({type:'aim',yaw:0,pitch:Math.PI/4});});
  await page.waitForFunction(()=>GameDebug.renderer.landingArrow.visible);assert.equal(await page.locator('#impactLabel').count(),0);
  await page.locator('#artilleryMode').click();await page.waitForFunction(()=>GameDebug.view.own.artilleryMode==='direct');await page.locator('#artilleryMode').click();await page.locator('#fireButton').click();await page.waitForFunction(()=>GameDebug.engine.shots.some(s=>s.kind==='artillery'));
  await page.evaluate(()=>{const e=GameDebug.engine,p=e.players[0],B=Blindfire;for(const k of['uav','missile']){e.command(0,{type:'vehicle'});e.command(0,{type:'select',weapon:k});const r=e.command(0,{type:'fire'}),s=e.shots.find(q=>q.id===r.id);Object.assign(s,{x:p.x+(k==='uav'?50:-50),z:p.z-120,y:p.y+60,pitch:0});}e.command(0,{type:'vehicle'});GameDebug.select('artillery');});
  await page.waitForFunction(()=>GameDebug.view.shots.some(s=>s.mine&&s.kind==='uav')&&GameDebug.view.shots.some(s=>s.mine&&s.kind==='missile'));
  const circles=await page.evaluate(()=>{const r=GameDebug.renderer,c=r.miniCtx,original=c.arc,radii=[];c.arc=function(x,y,rad,...args){radii.push(rad);return original.call(this,x,y,rad,...args);};try{r.drawMini(GameDebug.view);}finally{c.arc=original;}return radii;});for(const radius of[30,40,20])assert.ok(circles.includes(radius),`missing recon radar radius ${radius}`);
  await page.locator('#uavOrbit').click();await page.waitForFunction(()=>GameDebug.view.shots.some(s=>s.mine&&s.kind==='uav'&&s.orbit));await page.locator('#uavOrbit').click();await page.waitForFunction(()=>GameDebug.view.own.pilot!==null);await page.locator('#returnVehicle').click();
  const remote=await page.evaluate(async()=>{const{RemoteLink}=await import('./online.js'),events=[],link=new RemoteLink(e=>events.push(e));await link.host();return events;});assert.equal(remote[0].type,'error');assert.ok(remote[0].message.includes('暂时关闭'));
  await page.locator('#pauseButton').click();const before=await page.evaluate(()=>GameDebug.engine.t);await page.waitForTimeout(160);assert.equal(await page.evaluate(()=>GameDebug.engine.t),before);await page.locator('#resume').click();
  await page.screenshot({path:path.resolve(process.env.TEST_OUTPUT||'test-output','blindfire-v0.7-h5.png')});
  assert.ok(requests.every(u=>u.startsWith(url.split('?')[0])||u.startsWith('data:')||u.startsWith('blob:'+new URL(url).origin+'/')),JSON.stringify(requests.filter(u=>!u.startsWith(url.split('?')[0]))));assert.equal(requests.some(u=>u.includes('/api/rooms/')),false);assert.deepEqual(errors,[]);
  console.log('PASS actual H5 ZIP at nested hosting path: local modules/fonts/GLB/audio, hard training, red landing arrow, fire, 300/400/200 radar rings, UAV orbit, pause and zero external/remote requests');
 }finally{await browser.close();server.close();fs.rmSync(assets,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
