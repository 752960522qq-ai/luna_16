const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
(async()=>{
  const assets=path.resolve('app/src/main/assets');
  const server=http.createServer((req,res)=>{const file=path.join(assets,req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff')?'font/woff':'text/html');res.end(fs.readFileSync(file));}catch(_){res.statusCode=404;res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/?test=1`;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],env:process.env});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const a=await context.newPage(),b=await context.newPage(),errors=[];let host=null,guest=null,linked=false,frames=0;
  for(const p of [a,b]){
    p.on('pageerror',e=>errors.push(e.message));
    await p.exposeBinding('bridgeCall',async(source,kind,data)=>{
      if(kind==='host'){host=source.page;await host.evaluate(()=>window.onNativeNetwork({type:'listening',code:'123456',ips:['127.0.0.1']}));}
      else if(kind==='join'){
        assert.equal(data.ip,'127.0.0.1');assert.equal(data.code,'123456');guest=source.page;linked=true;
        await guest.evaluate(()=>window.onNativeNetwork({type:'connected',role:'guest'}));
        await host.evaluate(()=>window.onNativeNetwork({type:'connected',role:'host'}));
      } else if(kind==='send' && linked){
        const other=source.page===host?guest:host;
        const packet=JSON.parse(data);if(packet.type==='state')frames++;
        await other.evaluate(d=>window.onNativeNetwork({type:'data',data:d}),data);
      } else if(kind==='leave'&&linked){
        linked=false;const other=source.page===host?guest:host;
        await other.evaluate(()=>window.onNativeNetwork({type:'closed',message:'对方已断开连接。'}));
      }
    });
    await p.addInitScript(()=>{window.Native={host:()=>window.bridgeCall('host'),join:(ip,code)=>window.bridgeCall('join',{ip,code}),send:data=>window.bridgeCall('send',data),leave:()=>window.bridgeCall('leave'),vibrate:()=>{},finishApp:()=>{}};});
    await p.goto(base);await p.waitForFunction(()=>!!window.GameDebug);
  }
  await a.locator('#openLAN').click();await a.locator('#hostRoom').click();await a.waitForSelector('.room-code');assert.equal(await a.locator('.room-code').textContent(),'123456');
  await b.locator('#openLAN').click();await b.locator('#joinRoom').click();await b.locator('#hostIP').fill('127.0.0.1');await b.locator('#hostCode').fill('123456');await b.locator('#connectRoom').click();
  await a.waitForFunction(()=>window.GameDebug.view&&window.GameDebug.view.started);await b.waitForFunction(()=>window.GameDebug.view&&window.GameDebug.view.started);
  for(const p of [a,b]){assert.equal(await p.evaluate(()=>window.GameDebug.view.enemy),null);assert.equal(await p.evaluate(()=>window.GameDebug.view.own.hp),100);}
  assert.ok((await b.locator('#modeLabel').textContent()).includes('玩家 B'));
  const target=await a.evaluate(()=>({x:window.GameDebug.view.own.x,y:window.GameDebug.view.own.y}));
  await b.evaluate(t=>window.GameDebug.dispatch({type:'missile',...t}),target);
  await b.waitForFunction(()=>window.GameDebug.view.own.cd.missile>0);
  await a.waitForFunction(()=>window.GameDebug.view.own.hp===20,{},{timeout:7000});
  await b.waitForFunction(()=>window.GameDebug.view.own.stats.damage===80);
  assert.equal(await b.evaluate(()=>window.GameDebug.view.own.stats.damage),80);
  assert.equal(await b.evaluate(()=>window.GameDebug.view.enemy),null);
  assert.ok(await a.evaluate(()=>window.GameDebug.view.clues.some(c=>c.kind==='direction')));
  assert.ok(frames>40);
  await b.evaluate(()=>window.GameDebug.returnMenu());await a.waitForSelector('#interruptedBack');
  assert.ok((await a.locator('#modalCard h3').textContent()).includes('中断'));
  assert.deepEqual(errors,[]);console.log('PASS two browser clients: room, countdown, hidden perspectives, guest command, damage/cooldown synchronization and disconnect');
  await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
