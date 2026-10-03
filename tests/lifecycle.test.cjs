const assert = require('node:assert/strict');
const { open } = require('./browser-helpers.cjs');

(async () => {
  const { browser, server, url } = await open();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors = [], failures = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.nativeCalls = [];
    window.Native = {
      host() { nativeCalls.push('host'); queueMicrotask(() => onNativeNetwork({ type: 'listening', code: '123456', ips: ['127.0.0.1'] })); },
      join() { nativeCalls.push('join'); }, send() {},
      leave() { nativeCalls.push('leave'); }, vibrate() {}, finishApp() {}
    };
  });
  const touch = await context.newCDPSession(page), fingers = new Map();
  async function point(type, id, x, y) {
    if (type === 'touchEnd') fingers.delete(id);
    else fingers.set(id, { id, x, y, radiusX: 4, radiusY: 4, force: 1 });
    // Ending one point is represented by its removal from the active set.
    // CDP touchEnd ends the entire sequence and must have an empty point list.
    await touch.send('Input.dispatchTouchEvent', { type: type === 'touchEnd' && fingers.size ? 'touchMove' : type, touchPoints: [...fingers.values()] });
  }
  async function cancel() {
    if (!fingers.size) return;
    fingers.clear();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  }
  async function start() {
    await page.evaluate(() => {
      GameDebug.start(314);
      const e = GameDebug.engine, p = e.players[0]; e.mode = 'lan'; e.countdown = 0;
      Object.assign(p, { x: 400, z: 1000, y: Blindfire.terrain(400, 1000), speed: 0 });
    });
    await page.waitForFunction(() => GameDebug.view.started);
  }
  async function check(name, run) {
    try { await run(); console.log('PASS', name); }
    catch (e) { failures.push(name + ': ' + e.message); console.log('FAIL', name, e.message); }
    finally { await cancel(); }
  }
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.GameDebug && GameDebug.renderer.ready&&GameDebug.renderer.modelsReady);
    await check('the first joystick finger keeps control when another finger touches it', async () => {
      await start(); const j = await page.locator('#joystick').boundingBox(), x = j.x + j.width / 2, y = j.y + j.height / 2;
      await point('touchStart', 1, x, y - 35);
      await page.waitForFunction(() => GameDebug.engine.players[0].drive.throttle > .5);
      await point('touchStart', 2, x + 8, y + 30); await page.waitForTimeout(100);
      assert.ok(await page.evaluate(() => GameDebug.engine.players[0].drive.throttle > .5), 'a second finger reversed the vehicle');
      await point('touchEnd', 2); await page.waitForTimeout(100);
      assert.ok(await page.evaluate(() => GameDebug.engine.players[0].drive.throttle > .5), 'releasing the second finger stopped the first');
      await point('touchEnd', 1); await page.waitForFunction(() => GameDebug.engine.players[0].drive.throttle === 0);
    });
    await check('the first fire-button finger keeps firing until it is released', async () => {
      await start(); await page.locator('[data-weapon="mg"]').click();
      const f = await page.locator('#fireButton').boundingBox(), x = f.x + f.width / 2, y = f.y + f.height / 2;
      await point('touchStart', 1, x, y); await page.waitForFunction(() => GameDebug.view.own.mg);
      await point('touchStart', 2, x + 9, y + 9); await point('touchEnd', 2); await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => GameDebug.view.own.mg), true, 'a second finger stopped held machine-gun fire');
      await point('touchEnd', 1); await page.waitForFunction(() => !GameDebug.view.own.mg);
    });
    await check('real three-finger touch supports driving, aiming and firing; cancellation clears all input', async () => {
      await start(); await page.locator('[data-weapon="mg"]').click();
      const j = await page.locator('#joystick').boundingBox(), f = await page.locator('#fireButton').boundingBox();
      const yaw = await page.evaluate(() => GameDebug.view.own.aim.mg.yaw);
      await point('touchStart', 1, j.x + j.width / 2, j.y + 15);
      await point('touchStart', 2, 255, 340); await point('touchMove', 2, 300, 315);
      await point('touchStart', 3, f.x + f.width / 2, f.y + f.height / 2);
      await page.waitForFunction(old => GameDebug.view.own.speed > 3 && GameDebug.view.own.mg && Math.abs(GameDebug.view.own.aim.mg.yaw - old) > .15, yaw);
      await cancel(); await page.waitForFunction(() => GameDebug.engine.players[0].drive.throttle === 0 && !GameDebug.view.own.mg);
      await page.waitForFunction(() => Math.abs(GameDebug.view.own.speed) < 1);
    });
    for (const role of ['host', 'guest']) await check(`backgrounding a waiting ${role} closes the room and keeps the interruption on repeated notifications`, async () => {
      await page.evaluate(() => GameDebug.returnMenu()); await page.locator('#openLAN').click();
      if (role === 'host') { await page.locator('#hostRoom').click(); await page.waitForSelector('.room-code'); }
      else {
        await page.locator('#joinRoom').click(); await page.locator('#hostIP').fill('127.0.0.1'); await page.locator('#hostCode').fill('123456'); await page.locator('#connectRoom').click();
      }
      await page.evaluate(() => { onNativePause(); onNativePause(); onNativeResume(); });
      assert.equal(await page.locator('#interruptedBack').isVisible(), true, 'background room remained open');
      assert.equal(await page.evaluate(() => GameDebug.netRole), null);
      await page.locator('#interruptedBack').click(); assert.equal(await page.locator('#menu').isVisible(), true);
    });
    await check('connected multiplayer keeps its interruption after duplicate background notifications', async () => {
      await page.evaluate(() => GameDebug.returnMenu()); await page.locator('#openLAN').click(); await page.locator('#hostRoom').click(); await page.waitForSelector('.room-code');
      await page.evaluate(() => onNativeNetwork({ type: 'connected', role: 'host' })); await page.waitForFunction(() => GameDebug.engine !== null);
      await page.evaluate(() => { onNativePause(); onNativePause(); });
      assert.equal(await page.locator('#interruptedBack').isVisible(), true, 'the disconnected game became a frozen training session');
      assert.equal(await page.locator('#resume').isVisible(), false); assert.equal(await page.evaluate(() => GameDebug.engine === null), true);
    });
    await check('a stale connection for another role cannot start a newly opened room', async () => {
      await page.evaluate(() => GameDebug.returnMenu()); await page.locator('#openLAN').click(); await page.locator('#hostRoom').click(); await page.waitForSelector('.room-code');
      await page.evaluate(() => onNativeNetwork({ type: 'connected', role: 'guest' }));
      assert.equal(await page.evaluate(() => GameDebug.engine === null), true, 'a stale guest callback started a host game');
      assert.equal(await page.locator('.room-code').isVisible(), true);
      await page.locator('#cancelWaiting').click();
      await page.evaluate(() => onNativeNetwork({ type: 'connected', role: 'host' }));
      assert.equal(await page.locator('#battle').isVisible(), false);
    });
    await check('solo backgrounding pauses once and resumes with released controls', async () => {
      await start(); await page.keyboard.down('w'); await page.waitForFunction(() => GameDebug.view.own.speed > 3);
      await page.evaluate(() => { onNativePause(); onNativePause(); });
      const time = await page.evaluate(() => GameDebug.engine.t); await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => GameDebug.engine.t), time); await page.keyboard.up('w');
      await page.evaluate(() => onNativeResume()); await page.locator('#resume').click();
      await page.waitForFunction(t => GameDebug.engine.t > t, time);
      assert.equal(await page.evaluate(() => GameDebug.engine.players[0].drive.throttle), 0);
    });
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    console.log('PASS mobile touch ownership, simultaneous controls, background rooms, duplicate pause and stale callbacks');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
