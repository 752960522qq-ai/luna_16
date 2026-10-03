const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const output=process.env.TEST_OUTPUT || path.resolve('test-output');
const fs=require('node:fs');fs.mkdirSync(output,{recursive:true});
const http=require('node:http');
const errors=[];
(async()=>{
  const assets=path.resolve('app/src/main/assets');
  const server=http.createServer((req,res)=>{const file=path.join(assets,req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);try{const data=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff')?'font/woff':'text/html');res.end(data);}catch(_){res.statusCode=404;res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/?test=1`;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],env:process.env});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>!!window.GameDebug);await page.waitForTimeout(250);
  await page.screenshot({path:path.join(output,'blindfire-menu.png')});
  await page.getByRole('button',{name:/作战指南/}).click();assert.equal(await page.locator('.guide-list li').count(),7);await page.locator('#guideClose').click();
  await page.locator('#startAI').click();await page.waitForFunction(()=>window.GameDebug.view.started);assert.equal(await page.locator('#intelBadge').textContent(),'敌情未知');
  const bounds=await page.locator('#map').boundingBox();await page.locator('[data-action="uav"]').click();await page.mouse.click(bounds.x+bounds.width*.5,bounds.y+bounds.height*.3);
  const launched=await page.evaluate(()=>window.GameDebug.view.shots.filter(s=>s.mine&&s.kind==='uav').length);assert.equal(launched,1);
  assert.ok((await page.locator('[data-action="uav"] small').textContent()).includes('冷却'));
  await page.locator('[data-action="missile"]').click();assert.equal(await page.evaluate(()=>window.GameDebug.selected),'missile');
  await page.locator('#pauseButton').click();const before=await page.evaluate(()=>window.GameDebug.engine.t);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.GameDebug.engine.t),before);
  await page.locator('#pauseGuide').click();await page.locator('#guideClose').click();await page.locator('#resume').click();
  // Exercise real rendering of a deterministic combat state after gameplay rules
  // have generated reconnaissance, hostile evidence, flight and relocation.
  await page.evaluate(()=>{
    window.GameDebug.start(8086);const e=window.GameDebug.engine;e.mode='lan';e.countdown=0;
    Object.assign(e.players[0],{x:260,y:960});Object.assign(e.players[1],{x:585,y:275});
    e.command(0,{type:'uav',x:585,y:275});e.command(1,{type:'uav',x:400,y:680});
    for(let i=0;i<420;i++)e.update(1/60);
    e.command(0,{type:'missile',x:585,y:275});e.command(1,{type:'missile',x:260,y:960});
    for(let i=0;i<52;i++)e.update(1/60);
    e.command(0,{type:'decoy'});e.command(0,{type:'move',x:385,y:990});
  });await page.waitForTimeout(100);await page.screenshot({path:path.join(output,'blindfire-battle.png')});
  for(const [width,height] of [[360,640],[412,915],[320,568],[768,1024]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    const layout=await page.evaluate(()=>{const c=document.querySelector('.controls').getBoundingClientRect();const map=document.querySelector('#map').getBoundingClientRect();return {bottom:c.bottom,h:innerHeight,mapHeight:map.height,overflow:document.body.scrollWidth>innerWidth};});
    assert.ok(layout.bottom<=layout.h+1,`${width}x${height} controls clipped`);assert.ok(layout.mapHeight>190,`${width}x${height} map too small`);assert.equal(layout.overflow,false);
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.GameDebug.engine.finish(0,'摧毁敌方发射车');window.GameDebug.dispatch({type:'mg',active:false});});await page.waitForTimeout(130);
  assert.ok((await page.locator('#modalCard h3').textContent()).includes('胜利'));await page.locator('#again').click();assert.equal(await page.locator('#modal').isVisible(),false);
  await page.evaluate(()=>window.GameDebug.returnMenu());await page.locator('#openLAN').click();await page.locator('#hostRoom').click();assert.ok((await page.locator('#modalCard h3').textContent()).includes('APK'));
  assert.deepEqual(errors,[]);console.log('PASS UI touch targeting, cooldown, pause/guide/resume, win/rematch, LAN fallback and 4 screen sizes');
  await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
