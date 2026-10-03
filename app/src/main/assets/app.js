(function () {
  'use strict';
  const $ = id => document.getElementById(id), { Engine, C } = window.Blindfire;
  const renderer = new BlindfireRenderer.Renderer($('map'));
  let engine = null, view = null, screen = 'menu', selected = 'uav', paused = false;
  let difficulty = 'standard', netRole = null, connected = false, lastFrame = performance.now(), lastSend = 0, lastHud = 0;
  let lastLog = 0, oldHp = 100, toastUntil = 0, modalKind = null, mgPointer = null, mapPointer = null, seq = 0, remoteSeq = 0;
  let commandCount = 0, commandWindow = 0, lastPeerAt = 0;
  const native = window.Native || null, isTest = new URLSearchParams(location.search).has('test');
  try { difficulty = localStorage.getItem('bf-difficulty') || 'standard'; } catch (_) {}
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const audio = {
    enabled: true, ctx: null,
    init() { if (!this.enabled) return; try { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); } catch (_) {} },
    play(kind) {
      if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
      const ctx = this.ctx, now = ctx.currentTime;
      const settings = { click:[660,400,.045,.055], scout:[900,1600,.15,.05], lock:[700,1300,.22,.09], attack:[160,45,.32,.13],
        defense:[1200,300,.17,.07], hit:[90,25,.38,.18], warning:[400,250,.12,.055], mg:[240,70,.035,.03] }[kind] || [550,400,.05,.035];
      const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = ['attack','hit','mg'].includes(kind) ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(settings[0], now); osc.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
      gain.gain.setValueAtTime(settings[3], now); gain.gain.exponentialRampToValueAtTime(.001, now + settings[2]);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(now); osc.stop(now + settings[2] + .01);
    }
  };
  try { audio.enabled = localStorage.getItem('bf-sound') !== 'off'; } catch (_) {}
  function soundUI() { document.querySelectorAll('.sound-button').forEach(b => { b.classList.toggle('muted', !audio.enabled); b.setAttribute('aria-label', audio.enabled ? '关闭声音' : '开启声音'); }); }
  function vibrate(ms) { try { if (native && native.vibrate) native.vibrate(ms); else if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {} }
  function toast(message) { $('toast').textContent = message; $('toast').classList.remove('hidden'); toastUntil = performance.now() + 2300; }
  function showModal(kind, html, handlers = {}) {
    modalKind = kind; $('modalCard').innerHTML = html; $('modal').classList.remove('hidden');
    for (const [id, fn] of Object.entries(handlers)) { const el = $(id); if (el) el.addEventListener('click', fn); }
  }
  function closeModal() { $('modal').classList.add('hidden'); $('modalCard').innerHTML = ''; modalKind = null; }
  function setScreen(next) {
    screen = next; $('menu').classList.toggle('hidden', next !== 'menu'); $('battle').classList.toggle('hidden', next !== 'battle');
    if (next === 'battle') renderer.resize();
  }
  function select(type) {
    selected = type;
    document.querySelectorAll('[data-action]').forEach(b => b.classList.toggle('selected', b.dataset.action === type));
    if (view) updateHUD();
  }
  function startAI(seed) {
    disconnect(false); audio.init(); closeModal();
    engine = new Engine({ mode: 'ai', difficulty, seed }); view = engine.snapshot(0); paused = false; selected = 'uav';
    lastLog = 0; oldHp = 100; renderer.aim = null; lastFrame = performance.now();
    toastUntil = 0; $('toast').classList.add('hidden');
    $('modeLabel').textContent = `单人训练 / ${difficulty === 'easy' ? '新兵' : '标准'}`;
    setScreen('battle'); select('uav'); updateHUD();
  }
  function returnMenu() {
    disconnect(false); engine = null; view = null; paused = false; renderer.aim = null; closeModal(); setScreen('menu');
  }
  function sendNet(data) { if (native && connected) { try { native.send(JSON.stringify(data)); } catch (_) {} } }
  function dispatch(action) {
    if (!view || view.over) return;
    if (!view.started) { toast('正在进入战场'); return; }
    if (paused && !netRole) return;
    audio.init();
    if (netRole === 'guest') { sendNet({ type:'command', seq: ++seq, action }); return; }
    if (!engine) return;
    const result = engine.command(0, action);
    if (!result.ok) { toast(result.reason); audio.play('warning'); }
    else { audio.play(action.type === 'uav' ? 'scout' : ['missile','artillery','dive'].includes(action.type) ? 'attack' : action.type === 'sam' ? 'defense' : 'click'); if (action.type !== 'mg') vibrate(12); }
    view = engine.snapshot(0); updateHUD();
  }
  function result() {
    if (modalKind === 'result' || !view) return;
    const outcome = view.outcome, title = { win:'交火胜利', loss:'发射车损失', draw:'本局平局' }[outcome];
    const s = view.own.stats, time = Math.round(Math.min(180, Math.max(0, view.t - 3)));
    showModal('result', `<span class="eyebrow">AFTER ACTION / ${netRole ? 'DUEL' : 'SOLO'}</span><h3 class="result-heading ${outcome}">${title}</h3><p>${escape(view.reason)}${outcome === 'loss' && view.own.hp > 0 ? ' · 剩余耐久低于对方' : ''}</p><div class="result-grid"><div><small>造成伤害</small><b>${s.damage}<span>HP</span></b></div><div><small>剩余耐久</small><b>${view.own.hp}<span>HP</span></b></div><div><small>确认热源</small><b>${s.detections}<span>次</span></b></div><div><small>成功拦截</small><b>${s.intercepted}<span>次</span></b></div><div><small>装备发射</small><b>${s.launches}<span>次</span></b></div><div><small>交火时间</small><b>${time}<span>秒</span></b></div></div>${netRole ? '' : '<button id="again" class="btn">再次出战</button>'}<button id="backMenu" class="btn secondary">返回主菜单</button>`, { again: () => startAI(), backMenu: returnMenu });
    audio.play(outcome === 'win' ? 'lock' : 'hit');
  }
  function updateHUD() {
    if (!view) return; const p = view.own;
    const m = Math.floor(view.remaining / 60), s = Math.floor(view.remaining % 60); $('timer').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    $('hpBar').style.width = p.hp + '%'; $('hpBar').style.background = p.hp < 35 ? '#ff866c' : '#a6d9a4'; $('hpNumber').textContent = p.hp;
    const badge = $('intelBadge'); badge.className = 'intel-badge';
    if (view.enemy && view.enemy.precise) { badge.textContent = `精确定位 ${view.enemy.left.toFixed(1)}s`; badge.classList.add('lock'); }
    else if (view.enemy) { badge.textContent = '旧位置 · 已过期'; badge.classList.add('suspect'); }
    else if (view.clues.length) { badge.textContent = view.clues.some(c => c.kind === 'probe') ? '疑似区域' : '方向线索'; badge.classList.add('suspect'); }
    else badge.textContent = '敌情未知';
    const uavs = view.shots.filter(a => a.mine && a.kind === 'uav'); $('uavCounter').textContent = uavs.length ? `${uavs.length}/2` : ''; $('scanCount').textContent = 'UAV / ' + uavs.length;
    for (const b of document.querySelectorAll('.weapon')) {
      const k = b.dataset.action, cd = p.cd[k], sub = b.querySelector('small');
      b.classList.toggle('cooling', cd > 0); b.querySelector('.cooldown').style.width = cd > 0 ? (cd / C[k] * 100) + '%' : '0%';
      sub.textContent = cd > 0 ? `冷却 ${cd.toFixed(1)}s` : ({uav:'侦察',missile:'精确',artillery:'区域'}[k] + ' / 就绪');
    }
    for (const k of ['move','decoy']) { const b = document.querySelector(`[data-action="${k}"]`); b.querySelector('small').textContent = p.cd[k] > 0 ? Math.ceil(p.cd[k]) + 's' : ''; }
    $('samButton').querySelector('small').textContent = p.cd.sam > 0 ? Math.ceil(p.cd.sam) + 's' : view.threats ? `${view.threats}个目标` : '就绪';
    $('samButton').classList.toggle('ready-threat', view.threats > 0 && p.cd.sam <= 0);
    $('mgButton').classList.toggle('firing', p.mg); $('mgButton').querySelector('small').textContent = p.mg ? (view.nearby ? '正在射击' : '搜索目标') : '按住拦截';
    document.querySelector('[data-action="dive"]').disabled = !uavs.some(a => a.state !== 'dive');
    const hints = { uav:'无人机侦察 · 点击地图指定盘旋区域', missile:'巡航导弹 · 点击地图发射，命中80伤害', artillery:'曲射火炮 · 点击地图炮击，命中40伤害', move:'机动 · 点击目的地，最远210，途中停止发射', dive:'无人机俯冲 · 点击攻击点，命中30伤害', sam:'防空导弹 · 自动拦截附近敌方飞行器' };
    $('actionHint').textContent = p.destination ? '正在机动 · 抵达后恢复发射' : (hints[selected] || hints.uav);
    $('mapAlert').classList.toggle('hidden', !view.threats);
    if (view.threats) $('mapAlert').textContent = `空中威胁 × ${view.threats} · 防空导弹 / 按住机枪`;
    const countdown = $('countdown'); countdown.classList.toggle('hidden', view.started);
    if (!view.started) countdown.innerHTML = `${Math.ceil(view.countdown)}<small>正在进入未知空域</small>`;
    if (view.log.length && view.log[0].id !== lastLog) {
      const log = view.log[0]; lastLog = log.id; $('eventLine').querySelector('span').textContent = log.text;
      $('eventLine').className = 'event-line ' + (['hit','danger'].includes(log.kind) ? 'danger' : log.kind === 'warning' ? 'warning' : '');
      if (log.kind === 'lock') { audio.play('lock'); vibrate(25); }
      else if (log.kind === 'defense') audio.play('defense');
      else if (log.kind === 'hit-enemy') audio.play('hit');
    }
    if (p.hp < oldHp) { renderer.damageFlash = performance.now()/1000 + .45; audio.play('hit'); vibrate(65); }
    oldHp = p.hp;
    if (view.over) result();
  }
  function guide(backToPause = false) {
    showModal('guide', `<span class="eyebrow">FIELD MANUAL / 01</span><h3>先找人，再交火。</h3><ol class="guide-list"><li><b>选择无人机，点击地图。</b>无人机从你的车旁起飞，到指定区域盘旋20秒，侦察半径150。最多同时两架。</li><li><b>看弹道，判断来源。</b>橙色是敌方飞行器与弹道，琥珀扇形是疑似来源方向；无人机被击落，会留下防空活动区域。</li><li><b>红色十字 = 已确认热源。</b>离开侦察范围后5秒失去精确定位，再保留一段时间的旧位置。敌人可能已移动，也可能留下诱饵。</li><li><b>选装备，点击目标。</b>导弹直击80、近炸45–60；火炮直击40、范围10–20；指挥现有无人机俯冲造成30。曲射炮弹不可拦截。</li><li><b>攻击后换位置。</b>选择“机动”，点击目的地，最远210；移动过程中无法发射。先释放诱饵再移动可以误导敌人。</li><li><b>用防空争取反击机会。</b>防空导弹拦截范围300、成功率92%、冷却18秒。按住高射机枪，可持续攻击140范围内的无人机和导弹。机枪无冷却。</li><li><b>双方100 HP，交火限时3分钟。</b>摧毁敌方获胜；时间结束时剩余耐久较高者获胜，相同则平局。AI同样需要侦察和判断。</li></ol><div class="hint-box">冷却：无人机10秒 · 导弹22秒 · 火炮5秒<br>地形用于辨认方位，首版允许车辆自由穿越。<br>双人对战：两台安卓设备连接同一 Wi-Fi 或热点。</div><button id="guideClose" class="btn">了解，准备行动</button>`, { guideClose: () => { if (backToPause) showPause(); else closeModal(); } });
  }
  function showPause() {
    if (screen !== 'battle' || !view || view.over) { if (modalKind) closeModal(); return; }
    dispatch({type:'mg',active:false}); if (!netRole) paused = true;
    showModal('pause', `<span class="eyebrow">TACTICAL PAUSE</span><h3>作战菜单</h3><p>${netRole ? '双人对局仍在继续，尽快返回战场。' : '训练已暂停。'}</p><button id="resume" class="btn">继续交火</button><button id="pauseGuide" class="btn secondary">作战指南</button><button id="toggleSound" class="btn secondary">声音：${audio.enabled ? '开启' : '关闭'}</button><button id="quitRound" class="btn danger">${netRole ? '离开双人对局' : '结束训练'}</button>`, {
      resume: () => { paused = false; audio.init(); closeModal(); lastFrame = performance.now(); },
      pauseGuide: () => guide(true), toggleSound: () => { audio.enabled = !audio.enabled; try { localStorage.setItem('bf-sound', audio.enabled ? 'on':'off'); } catch (_) {} soundUI(); showPause(); }, quitRound: returnMenu
    });
  }
  function disconnect(notify) {
    const wasConnected = connected; connected = false; netRole = null; seq = 0; remoteSeq = 0;
    if (native) { try { native.leave(); } catch (_) {} }
    if (notify && wasConnected) interrupted('对方已断开连接，本局结束。');
  }
  function interrupted(message) {
    connected = false; engine = null; paused = false;
    showModal('interrupted', `<span class="eyebrow">LINK LOST</span><h3>交火中断</h3><p>${escape(message)}</p><p>请重新创建或加入房间。</p><button id="interruptedBack" class="btn">返回主菜单</button>`, { interruptedBack:returnMenu });
  }
  function lanMenu() {
    showModal('lan', `<span class="eyebrow">LOCAL DUEL / A × B</span><h3>双人交火</h3><p>两台手机连接同一 Wi-Fi，或让其中一台开启热点，另一台连接。</p><button id="hostRoom" class="btn">创建房间 · 玩家 A</button><button id="joinRoom" class="btn secondary">加入房间 · 玩家 B</button><div class="hint-box">无需账号。创建房间后，把显示的地址与6位房间码告诉另一位玩家。</div><button id="lanBack" class="btn secondary">返回</button>`, { hostRoom:hostRoom, joinRoom:joinRoom, lanBack:closeModal });
  }
  function needNative() {
    if (native || isTest && window.Native) return true;
    showModal('native', '<span class="eyebrow">ANDROID EDITION</span><h3>安装 APK 后双人对战</h3><p>网页版可进行单人训练。双人房间由 Android 版在同一网络内建立。</p><button id="nativeBack" class="btn">返回</button>', { nativeBack:lanMenu }); return false;
  }
  function hostRoom() {
    if (!needNative()) return; disconnect(false); netRole = 'host';
    showModal('waiting', '<span class="eyebrow">CREATING ROOM</span><h3>正在创建房间</h3><p>正在准备本地连接…</p><button id="cancelHost" class="btn secondary">取消</button>', { cancelHost:() => { disconnect(false); lanMenu(); } });
    try { native.host(); } catch (_) { interrupted('无法创建房间，请检查网络后重试。'); }
  }
  function joinRoom() {
    if (!needNative()) return;
    showModal('join', `<span class="eyebrow">JOIN / PLAYER B</span><h3>加入房间</h3><div class="field"><label for="hostIP">玩家 A 的地址</label><input id="hostIP" inputmode="decimal" placeholder="例如 192.168.1.10" maxlength="15" autocomplete="off"></div><div class="field"><label for="hostCode">6位房间码</label><input id="hostCode" inputmode="numeric" placeholder="000000" maxlength="6" autocomplete="off"></div><p id="joinError" class="connection-error"></p><button id="connectRoom" class="btn">连接并出战</button><button id="joinBack" class="btn secondary">返回</button>`, {
      connectRoom: () => {
        const ip = $('hostIP').value.trim(), code = $('hostCode').value.trim();
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.split('.').some(n => Number(n)>255)) { $('joinError').textContent = '请输入玩家 A 显示的 IPv4 地址'; return; }
        if (!/^\d{6}$/.test(code)) { $('joinError').textContent = '请输入6位数字房间码'; return; }
        disconnect(false); netRole = 'guest'; $('hostIP').blur(); $('hostCode').blur();
        showModal('waiting', '<span class="eyebrow">CONNECTING / B</span><h3>正在连接房间</h3><p>请保持两台手机在同一网络。</p><button id="cancelJoin" class="btn secondary">取消</button>', {cancelJoin:()=>{ disconnect(false); joinRoom(); }});
        try { native.join(ip, code); } catch (_) { interrupted('连接失败，请核对地址与房间码。'); }
      }, joinBack:lanMenu
    });
  }
  function validView(v) { return v && v.version === 1 && v.own && Number.isFinite(v.own.x) && Number.isFinite(v.own.y) && Number.isFinite(v.t) && v.own.cd && v.own.stats && ['shots','clues','effects','tracers','decoys','log'].every(k => Array.isArray(v[k]) && v[k].length < 150); }
  window.onNativeNetwork = function (event) {
    if (!event || !event.type) return;
    if (event.type === 'listening' && netRole === 'host') {
      const ips = (event.ips || []).filter(a => /^\d{1,3}(\.\d{1,3}){3}$/.test(a));
      showModal('waiting', `<span class="eyebrow">ROOM OPEN / PLAYER A</span><h3>等待玩家 B</h3><small class="room-note">房间码</small><div class="room-code">${escape(event.code)}</div><small class="room-note">连接地址（任选可达地址）</small>${ips.map(a => `<div class="room-address">${escape(a)}</div>`).join('') || '<p class="connection-error">未找到地址，请连接 Wi-Fi 或开启热点后重试。</p>'}<div class="room-status">● 房间已开放</div><p>玩家 B 点击“加入房间”，输入地址和房间码。连接后自动开始。</p><button id="cancelWaiting" class="btn secondary">取消房间</button>`, {cancelWaiting:()=>{disconnect(false);lanMenu();}});
    } else if (event.type === 'connected') {
      connected = true; lastPeerAt = performance.now(); seq = 0; remoteSeq = 0; oldHp = 100; lastLog = 0; paused = false; audio.init();
      if (netRole === 'host') { engine = new Engine({mode:'lan'}); view = engine.snapshot(0); $('modeLabel').textContent = '双人交火 / 玩家 A'; closeModal(); setScreen('battle'); select('uav'); sendNet({type:'state',view:engine.snapshot(1)}); }
    } else if (event.type === 'data' && connected) {
      lastPeerAt = performance.now(); let packet;
      try { if (typeof event.data !== 'string' || event.data.length > 65536) return; packet = JSON.parse(event.data); } catch (_) { return; }
      if (netRole === 'guest' && packet.type === 'state' && validView(packet.view)) {
        view = packet.view;
        if (screen !== 'battle') { closeModal(); $('modeLabel').textContent = '双人交火 / 玩家 B'; setScreen('battle'); select('uav'); }
      } else if (netRole === 'guest' && packet.type === 'feedback') { toast(packet.message); }
      else if (netRole === 'host' && packet.type === 'command' && engine) {
        const now = performance.now(); if (now - commandWindow > 1000) { commandWindow = now; commandCount = 0; }
        if (!Number.isSafeInteger(packet.seq) || packet.seq <= remoteSeq || ++commandCount > 24) return;
        remoteSeq = packet.seq; const r = engine.command(1, packet.action);
        if (!r.ok) sendNet({type:'feedback',message:r.reason});
      }
    } else if (event.type === 'closed' && netRole) {
      if (view && view.over) { connected = false; return; }
      interrupted(event.message || '连接已断开，请检查两台手机的 Wi-Fi。');
    } else if (event.type === 'error' && netRole) interrupted(event.message || '连接失败，请核对地址与房间码。');
  };
  document.querySelectorAll('.sound-button').forEach(b => b.addEventListener('click', () => { audio.enabled = !audio.enabled; try { localStorage.setItem('bf-sound', audio.enabled?'on':'off'); } catch (_) {} audio.init(); soundUI(); }));
  document.querySelectorAll('[data-difficulty]').forEach(b => b.addEventListener('click', () => { difficulty = b.dataset.difficulty; try { localStorage.setItem('bf-difficulty',difficulty); } catch (_) {} document.querySelectorAll('[data-difficulty]').forEach(c => c.classList.toggle('chosen',c.dataset.difficulty === difficulty)); audio.init(); audio.play('click'); }));
  document.querySelectorAll('[data-difficulty]').forEach(b => b.classList.toggle('chosen', b.dataset.difficulty === difficulty));
  $('startAI').addEventListener('click', () => startAI()); $('openLAN').addEventListener('click', lanMenu); $('openGuide').addEventListener('click', () => guide()); $('pauseButton').addEventListener('click', showPause);
  document.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.action; audio.init();
    if (k === 'sam') dispatch({type:'sam'});
    else if (k === 'decoy') { dispatch({type:'decoy'}); select('move'); }
    else { select(k); audio.play('click'); }
  }));
  $('mgButton').addEventListener('pointerdown', e => { e.preventDefault(); mgPointer = e.pointerId; try { $('mgButton').setPointerCapture(e.pointerId); } catch (_) {} dispatch({type:'mg',active:true}); });
  function stopMG(e) { if (mgPointer === null || e && e.pointerId !== undefined && mgPointer !== e.pointerId) return; mgPointer = null; dispatch({type:'mg',active:false}); }
  $('mgButton').addEventListener('pointerup',stopMG); $('mgButton').addEventListener('pointercancel',stopMG); $('mgButton').addEventListener('lostpointercapture',stopMG);
  $('map').addEventListener('pointerdown',e => { if (modalKind || !view || !view.started || view.over) return; e.preventDefault(); mapPointer = e.pointerId; renderer.aim = renderer.toWorld(e.clientX,e.clientY); try { $('map').setPointerCapture(e.pointerId); } catch (_) {} });
  $('map').addEventListener('pointermove',e => { if (mapPointer === e.pointerId) renderer.aim = renderer.toWorld(e.clientX,e.clientY); });
  $('map').addEventListener('pointerup',e => { if (mapPointer !== e.pointerId) return; mapPointer = null; const a = renderer.toWorld(e.clientX,e.clientY); renderer.aim = null; if (a && !modalKind) dispatch({type:selected,x:a.x,y:a.y}); });
  $('map').addEventListener('pointercancel',() => {mapPointer=null;renderer.aim=null;});
  window.showPause = showPause;
  window.onNativeBack = function () {
    if (modalKind === 'interrupted') { returnMenu(); return; }
    if (modalKind === 'pause') { paused=false; closeModal(); return; }
    if (screen === 'battle') { if (view && view.over) returnMenu(); else showPause(); }
    else if (modalKind) { if (['waiting','join','interrupted'].includes(modalKind)) { disconnect(false); lanMenu(); } else closeModal(); }
    else if (native && native.finishApp) native.finishApp();
  };
  window.onNativePause = function () {
    stopMG(); if (screen === 'battle' && view && !view.over) { if (netRole) { disconnect(false); interrupted('设备切至后台，双人连接已结束。'); } else showPause(); }
    if (audio.ctx) audio.ctx.suspend().catch(()=>{});
  };
  window.onNativeResume = function () { lastFrame=performance.now(); };
  window.addEventListener('blur', stopMG);
  document.addEventListener('visibilitychange',() => { if (document.hidden) window.onNativePause(); else window.onNativeResume(); });
  let lastMGSound=0;
  function frame(now) {
    const elapsed=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
    if (screen==='menu') BlindfireRenderer.drawMenu($('menuRadar'),now/1000);
    else if (screen==='battle') {
      if (engine && (!paused || netRole) && !engine.over) {
        // Fixed small substeps keep fast artillery and intercepts stable after a
        // slower animation frame without simulating time spent in the background.
        let left=elapsed;while(left>0){const dt=Math.min(left,1/60);engine.update(dt);left-=dt;}
        view=engine.snapshot(0);
      }
      if (netRole==='host' && connected && engine && now-lastSend>66) {lastSend=now;sendNet({type:'state',view:engine.snapshot(1)});}
      if (view) renderer.draw(view,selected,now/1000);
      if(now-lastHud>90){lastHud=now;updateHUD();}
      if(view && view.own.mg && view.nearby && now-lastMGSound>130){lastMGSound=now;audio.play('mg');}
    }
    if (toastUntil && now>toastUntil) {$('toast').classList.add('hidden');toastUntil=0;}
    if (netRole==='guest' && connected && now-lastPeerAt>12000) {disconnect(false);interrupted('对方长时间未响应，请重新连接。');}
    requestAnimationFrame(frame);
  }
  if(document.fonts)document.fonts.ready.then(()=>{renderer.seed=null;BlindfireRenderer.resetFonts();});
  soundUI();requestAnimationFrame(frame);
  if (isTest) window.GameDebug={start:startAI,get engine(){return engine;},get view(){return view;},get renderer(){return renderer;},get selected(){return selected;},dispatch,updateHUD,pause:showPause,returnMenu};
})();
