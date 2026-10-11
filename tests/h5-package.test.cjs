const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const{spawnSync}=require('node:child_process'),{open}=require('./browser-helpers.cjs');
const zip=path.resolve(process.env.H5_ZIP||'build/blindfire-v0.9-taptap-h5.zip'),assets=fs.mkdtempSync(path.join(os.tmpdir(),'blindfire-h5-'));
const extracted=spawnSync('python3',['-c',"import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; names=z.namelist(); assert not any(p.startswith('/') or '..' in p.split('/') for p in names); assert {p.split('/')[0] for p in names}=={'blindfire'}; assert all('/' in p for p in names); assert 'blindfire/index.html' in names; assert json.loads(z.read('blindfire/manifest.webmanifest'))['orientation']=='portrait'; assert len(open(sys.argv[1],'rb').read())<300*1024*1024; z.extractall(sys.argv[2])",zip,assets],{encoding:'utf8'});
assert.equal(extracted.status,0,extracted.stderr);
// Captured by executing Progress.save() from the previous delivered portrait H5 ZIP.
const previous=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/previous-h5-profile.json'),'utf8'));
(async()=>{
 const{browser,server,url}=await open({assets:path.join(assets,'blindfire'),basePath:'/games/blindfire/0.9/'}),page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 try{
  await page.goto(url);await page.waitForFunction(()=>window.GameDebug?.renderer.modelsReady);
  await page.evaluate(p=>localStorage.setItem('bf-profile-v1',JSON.stringify(p)),previous);await page.reload();await page.waitForFunction(()=>window.GameDebug?.renderer.modelsReady);
  let state=await page.evaluate(()=>({coins:GameDebug.profile.coins,owned:GameDebug.profile.owned,selected:GameDebug.profile.selected,claimed:GameDebug.profile.claimed,tutorial:GameDebug.profile.tutorialDone,infinite:GameDebug.profile.infiniteCoins}));
  assert.equal(state.coins,previous.coins);assert.deepEqual(state.owned,previous.owned);assert.equal(state.selected,previous.selected);assert.deepEqual(state.claimed,previous.claimed);assert.equal(state.tutorial,true);assert.equal(state.infinite,false);
  await page.evaluate(()=>GameDebug.profile.save());await page.reload();await page.waitForFunction(()=>window.GameDebug?.renderer.modelsReady);assert.equal(await page.evaluate(()=>GameDebug.profile.selected),'b_tank');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bf-profile-v1')).version),2);
  await page.evaluate(()=>{GameDebug.profile.research.tank=789;GameDebug.profile.save();});await page.reload();await page.waitForFunction(()=>window.GameDebug?.renderer.modelsReady);assert.equal(await page.evaluate(()=>GameDebug.profile.research.tank),789);
  assert.equal(await page.locator('#openLAN').isVisible(),false);
  for(const [width,height] of [[320,568],[360,500],[360,640],[390,844],[430,932],[768,1024]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(100);assert.equal(await page.locator('#portraitHint').isVisible(),false);
   const dimensions=await page.evaluate(()=>{const c=document.getElementById('world').getBoundingClientRect();return{width:c.width,height:c.height,aspect:GameDebug.renderer.camera.aspect,overflow:document.documentElement.scrollWidth>innerWidth};});assert.equal(dimensions.width,width);assert.equal(dimensions.height,height);assert.ok(Math.abs(dimensions.aspect-width/height)<.001);assert.equal(dimensions.overflow,false);
   await page.locator('#startAI').scrollIntoViewIfNeeded();const b=await page.locator('#startAI').boundingBox();assert.ok(b.y>=0&&b.y+b.height<=height);
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#startAI').click();await page.waitForFunction(()=>GameDebug.view?.started);
  for(const id of ['joystick','fireButton','pauseButton']){const b=await page.locator('#'+id).boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=390&&b.y+b.height<=844,id);}
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);assert.equal(await page.locator('#portraitHint').isVisible(),true);const t=await page.evaluate(()=>GameDebug.engine.t);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>GameDebug.engine.t),t);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.equal(await page.locator('#portraitHint').isVisible(),false);await page.locator('#resume').click();await page.waitForTimeout(150);assert.ok(await page.evaluate(t=>GameDebug.engine.t>t,t));
  fs.mkdirSync('test-output/h5',{recursive:true});await page.screenshot({path:'test-output/h5/portrait-b-tank.png'});
  assert.deepEqual(errors,[]);assert.equal(requests.some(u=>/^https?:/.test(u)&&new URL(u).origin!==new URL(url).origin),false);
  console.log('PASS TapTap ZIP root/size; previous delivered v1 save -> v2 -> reload; coins/owned/selected/research; six portrait sizes; landscape pause and return; B tank render; no external dependencies');
 }finally{await browser.close();server.close();fs.rmSync(assets,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
