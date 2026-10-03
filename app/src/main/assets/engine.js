/* Blindfire 0.2 — deterministic, host-authoritative 3D simulation. */
(function (root) {
  'use strict';
  const W = 800, H = 1200, TAU = Math.PI * 2, GRAVITY = 34, SHELL_SPEED = 170, TRAIL_LIFE = 8;
  const C = { uav: 10, missile: 22, artillery: 5, sam: 18, mg: 0 };
  const PITCH = { uav: [.06, 1.25], missile: [-1.25, 1.25], artillery: [.12, 1.35], sam: [-1.25, 1.4], mg: [-.18, 1.4] };
  const DEFAULT_PITCH = { uav: .25, missile: .24, artillery: .4, sam: .65, mg: .38 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const direction = (yaw, pitch) => ({ x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });
  const terrain = (x, z) => 7 + 4 * Math.sin(x * .009) * Math.cos(z * .008) + 3 * Math.sin(z * .013 + x * .006)
    + 26 * Math.exp(-((x - 685) ** 2 / 23000 + (z - 330) ** 2 / 37000))
    + 21 * Math.exp(-((x - 105) ** 2 / 18000 + (z - 815) ** 2 / 28000));
  // Shared physical village layout: renderer and collision rules use this data.
  const BUILDINGS = [];
  for (const [cx, cz] of [[265, 475], [575, 745]]) {
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      BUILDINGS.push({ x: cx + (col - 1.5) * 32, z: cz + (row - 1) * 39, w: 17 + col % 2 * 4, d: 20, h: 9 + (row + col) % 3 * 4 });
    }
  }
  function surface(x, z) {
    let y = terrain(x, z);
    for (const b of BUILDINGS) if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) y = Math.max(y, terrain(b.x, b.z) + b.h);
    return y;
  }
  function clearGround(x, z, radius = 5) {
    return x >= 18 && x <= W - 18 && z >= 18 && z <= H - 18 && !BUILDINGS.some(b => Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius);
  }
  function lineOfSight(a, b) {
    const steps = Math.ceil(dist3(a, b) / 12);
    for (let i = 1; i < steps; i++) {
      const f = i / steps, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
      if (a.y + (b.y - a.y) * f < surface(x, z) + .6) return false;
    }
    return true;
  }
  function segmentDistance(a, b, p) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const f = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / (dx * dx + dy * dy + dz * dz || 1), 0, 1);
    return Math.hypot(a.x + dx * f - p.x, a.y + dy * f - p.y, a.z + dz * f - p.z);
  }
  function muzzle(p, kind) {
    const a = p.aim[kind], d = direction(a.yaw, a.pitch);
    return { x: p.x + d.x * 7, y: terrain(p.x, p.z) + 5.7 + d.y * 7, z: p.z + d.z * 7 };
  }
  function ballistic(p, maxPoints = 160) {
    const a = p.aim.artillery, start = muzzle(p, 'artillery'), d = direction(a.yaw, a.pitch);
    const points = [{ ...start }]; let hit = null, time = 0;
    for (let i = 1; i <= maxPoints; i++) {
      time = i * .09;
      const q = { x: start.x + d.x * SHELL_SPEED * time, y: start.y + d.y * SHELL_SPEED * time - .5 * GRAVITY * time * time, z: start.z + d.z * SHELL_SPEED * time };
      if (q.x < 0 || q.x > W || q.z < 0 || q.z > H) { points.push(q); break; }
      if (q.y <= surface(q.x, q.z)) {
        let lo=time-.09,hi=time;
        for(let j=0;j<12;j++){const mid=(lo+hi)/2,x=start.x+d.x*SHELL_SPEED*mid,z=start.z+d.z*SHELL_SPEED*mid,y=start.y+d.y*SHELL_SPEED*mid-.5*GRAVITY*mid*mid;if(y>surface(x,z))lo=mid;else hi=mid;}
        time=hi;q.x=start.x+d.x*SHELL_SPEED*time;q.z=start.z+d.z*SHELL_SPEED*time;q.y=surface(q.x,q.z);points.push(q);hit=q;break;
      }
      points.push(q);
    }
    return { points, hit, range: hit ? dist(start, hit) : null, time };
  }
  class Engine {
    constructor(opts = {}) {
      this.seed = opts.seed || (Date.now() >>> 0); this.rng = this.seed; this.mode = opts.mode || 'ai'; this.difficulty = opts.difficulty || 'standard';
      this.t = 0; this.limit = 180; this.countdown = opts.countdown === undefined ? 3 : opts.countdown;
      this.over = false; this.winner = null; this.reason = ''; this.id = 0;
      this.shots = []; this.trails = []; this.effects = []; this.players = [this.player(0), this.player(1)];
      for (let i = 0; i < 80; i++) {
        const a = this.players[0], b = this.players[1];
        a.x = 120 + this.random() * 530; a.z = 170 + this.random() * 860;
        b.x = 120 + this.random() * 530; b.z = 170 + this.random() * 860;
        if (dist(a, b) > 650 && clearGround(a.x, a.z) && clearGround(b.x, b.z)) break;
        if (i === 79) { a.x = 170; a.z = 1010; b.x = 635; b.z = 180; }
      }
      for (const p of this.players) {
        p.y = terrain(p.x, p.z); p.yaw = Math.atan2(W / 2 - p.x, p.z - H / 2);
        for (const a of Object.values(p.aim)) a.yaw = p.yaw;
        this.note(p.id, '敌方位置未知 · 侦察或观察空中尾迹', 'info');
      }
      this.aiClock = 0; this.aiScan = { x: 400, z: 600 }; this.aiMoveUntil = 0; this.aiAttackAt = 0;
    }
    player(id) {
      return { id, x: 400, y: 7, z: 1000, hp: 100, yaw: 0, speed: 0, selected: 'missile', pilot: null,
        drive: { throttle: 0, steer: 0 }, aim: Object.fromEntries(Object.keys(C).map(k => [k, { yaw: 0, pitch: DEFAULT_PITCH[k] }])),
        cd: Object.fromEntries(Object.keys(C).map(k => [k, 0])), mg: false, mgClock: 0, controlAt: 0,
        intel: { lock: null, clues: [] }, log: [], stats: { damage: 0, launches: 0, intercepted: 0, detections: 0, moves: 0 }, lastLock: -10 };
    }
    random() { let z = this.rng += 0x6D2B79F5; z = Math.imul(z ^ z >>> 15, z | 1); z ^= z + Math.imul(z ^ z >>> 7, z | 61); return ((z ^ z >>> 14) >>> 0) / 4294967296; }
    note(id, text, kind = 'info') { const p = this.players[id]; p.log.unshift({ text, kind, t: this.t, id: ++this.id }); p.log.length = Math.min(5, p.log.length); }
    effect(p, kind, owner, radius = 24) { this.effects.push({ id: ++this.id, x: p.x, y: p.y, z: p.z, kind, owner, radius, born: this.t, life: kind === 'crater' ? 12 : 1.15 }); if (this.effects.length > 40) this.effects.shift(); }
    command(id, action) {
      const p = this.players[id];
      if (!p || !action || typeof action !== 'object' || this.over) return { ok: false, reason: '本局已结束' };
      const k = action.type;
      if (k === 'select' && Object.prototype.hasOwnProperty.call(C, action.weapon)) {
        p.selected = action.weapon; p.mg = false; return { ok: true };
      }
      if (k === 'vehicle') { p.pilot = null; p.drive = { throttle: 0, steer: 0 }; p.mg = false; return { ok: true }; }
      if (k === 'pilot') {
        const s = this.shots.find(s => s.owner === id && s.id === action.id && ['uav','missile','sam'].includes(s.kind) && s.hp > 0);
        if (!s) return { ok: false, reason: '飞行器已失去连接' };
        p.pilot = s.id; p.mg = false; p.drive = { throttle: 0, steer: 0 }; return { ok: true };
      }
      if (k === 'control') {
        if (!Number.isFinite(action.throttle) || !Number.isFinite(action.steer)) return { ok: false, reason: '无效操作' };
        p.drive = { throttle: clamp(action.throttle, -1, 1), steer: clamp(action.steer, -1, 1) }; p.controlAt = this.t;
        if (action.yaw !== undefined || action.pitch !== undefined) return this.setAim(p, action);
        return { ok: true };
      }
      if (k === 'aim') return this.setAim(p, action);
      if (this.t < this.countdown) return { ok: false, reason: '正在进入战场' };
      if (k === 'mg') {
        if (p.pilot || p.selected !== 'mg') return { ok: false, reason: '先选择高射机枪' };
        p.mg = action.active === true; return { ok: true };
      }
      if (k === 'detonate') {
        const s = this.shots.find(s => s.id === p.pilot && s.owner === id && ['missile','uav'].includes(s.kind));
        if (!s) return { ok: false, reason: '当前飞行器不可引爆' };
        this.explode(s); this.removeDead(); return { ok: true };
      }
      if (k !== 'fire') return { ok: false, reason: '未知指令' };
      if (p.pilot) return { ok: false, reason: '返回发射车后使用装备' };
      const weapon = p.selected;
      if (weapon === 'mg') return { ok: false, reason: '按住开火持续射击' };
      if (Math.abs(p.speed) > 2 || Math.abs(p.drive.throttle) > .1) return { ok: false, reason: '停车后才能发射' };
      if (p.cd[weapon] > 0) return { ok: false, reason: '装备冷却中' };
      if (weapon === 'uav' && this.shots.some(s => s.kind === 'uav' && s.owner === id && s.hp > 0)) return { ok: false, reason: '点击接管无人机，继续操纵现有飞机' };
      const s = this.launch(p, weapon); p.cd[weapon] = C[weapon]; p.stats.launches++;
      if (weapon !== 'artillery') { p.pilot = s.id; p.drive = { throttle: 0, steer: 0 }; }
      this.note(id, { uav:'无人机起飞 · 已切换手动飞行', missile:'导弹出筒 · 手动控制航向', artillery:'炮弹出膛 · 白色尾迹持续8秒', sam:'防空导弹发射 · 手动靠近空中目标' }[weapon], weapon === 'uav' ? 'scout' : 'attack');
      return { ok: true, id: s.id };
    }
    setAim(p, a) {
      if (!Number.isFinite(a.yaw) || !Number.isFinite(a.pitch)) return { ok: false, reason: '无效瞄准' };
      const s = this.shots.find(s => s.id === p.pilot && s.owner === p.id && s.hp > 0);
      if (s) { s.yaw = wrap(a.yaw); s.pitch = clamp(a.pitch, -1.3, 1.4); }
      else { const lim = PITCH[p.selected]; p.aim[p.selected] = { yaw: wrap(a.yaw), pitch: clamp(a.pitch, lim[0], lim[1]) }; }
      return { ok: true };
    }
    launch(p, kind) {
      const start = muzzle(p, kind), a = p.aim[kind], speed = { uav: 58, missile: 155, artillery: SHELL_SPEED, sam: 225, bullet: 720 }[kind];
      const d = direction(a.yaw, a.pitch);
      const s = { id: ++this.id, owner: p.id, kind, ...start, yaw: a.yaw, pitch: a.pitch, vx: d.x * speed, vy: d.y * speed, vz: d.z * speed,
        speed, hp: kind === 'uav' ? 27 : kind === 'missile' ? 18 : 1, born: this.t, ttl: { uav: 40, missile: 14, artillery: 14, sam: 8, bullet: .55 }[kind],
        distance: 0, sampleAt: this.t, noticed: 0 };
      this.shots.push(s);
      if (kind !== 'bullet') this.trails.push({ id: s.id, owner: p.id, kind, points: [{ ...start, t: this.t, d: 0 }] });
      return s;
    }
    shootMG(p) {
      const a = p.aim.mg, d = direction(a.yaw, a.pitch), m = muzzle(p, 'mg');
      this.shots.push({ id: ++this.id, owner: p.id, kind: 'bullet', ...m, yaw: a.yaw, pitch: a.pitch, vx: d.x * 720, vy: d.y * 720, vz: d.z * 720,
        speed: 720, hp: 1, born: this.t, ttl: .55, distance: 0, noticed: 0 });
    }
    update(dt) {
      if (this.over || !Number.isFinite(dt) || dt <= 0) return; dt = Math.min(.05, dt); this.t += dt;
      this.effects = this.effects.filter(e => this.t - e.born < e.life);
      for (const tr of this.trails) tr.points = tr.points.filter(p => this.t - p.t < TRAIL_LIFE);
      this.trails = this.trails.filter(tr => tr.points.length);
      if (this.t < this.countdown) return;
      if (this.mode === 'ai') this.updateAI(dt);
      for (const p of this.players) {
        for (const k of Object.keys(C)) p.cd[k] = Math.max(0, p.cd[k] - dt);
        p.intel.clues = p.intel.clues.filter(c => c.until > this.t);
        // Stale touch input cannot leave a disconnected or backgrounded vehicle driving.
        if (this.t - p.controlAt > .7) p.drive = { throttle: 0, steer: 0 };
        const piloted = this.shots.find(s => s.id === p.pilot && s.hp > 0);
        if (piloted) {
          const rate = piloted.kind === 'uav' ? 1.1 : 1.35;
          piloted.yaw = wrap(piloted.yaw + p.drive.steer * rate * dt);
          piloted.pitch = clamp(piloted.pitch + p.drive.throttle * .85 * dt, -1.3, 1.4);
          p.speed *= Math.max(0, 1 - 8 * dt);
        } else {
          p.pilot = null;
          const target = p.drive.throttle * (p.drive.throttle < 0 ? 16 : 33);
          p.speed += (target - p.speed) * Math.min(1, dt * 6);
          const turn = p.drive.steer * dt * 1.2 * (Math.abs(p.speed) > .5 ? Math.sign(p.speed) : .5);
          p.yaw = wrap(p.yaw + turn); for (const a of Object.values(p.aim)) a.yaw = wrap(a.yaw + turn);
          const nx = p.x + Math.sin(p.yaw) * p.speed * dt, nz = p.z - Math.cos(p.yaw) * p.speed * dt;
          if (clearGround(nx, nz)) { p.x = nx; p.z = nz; } else if (clearGround(nx, p.z)) p.x = nx; else if (clearGround(p.x, nz)) p.z = nz; else p.speed = 0;
          p.y = terrain(p.x, p.z);
        }
        if (p.mg && !p.pilot && p.selected === 'mg') { p.mgClock -= dt; if (p.mgClock <= 0) { this.shootMG(p); p.mgClock = .09; } } else p.mgClock = 0;
      }
      for (const s of [...this.shots]) {
        if (s.hp <= 0) continue;
        const prev = { x: s.x, y: s.y, z: s.z };
        if (['uav','missile','sam'].includes(s.kind)) {
          const d = direction(s.yaw, s.pitch); s.vx = d.x * s.speed; s.vy = d.y * s.speed; s.vz = d.z * s.speed;
        }
        const gravity = s.kind === 'artillery' ? GRAVITY : s.kind === 'bullet' ? 4 : 0;
        s.x += s.vx * dt; s.y += s.vy * dt - .5 * gravity * dt * dt; s.z += s.vz * dt; s.vy -= gravity * dt; s.distance += dist3(prev, s);
        if (s.kind === 'artillery') { s.yaw = Math.atan2(s.vx, -s.vz); s.pitch = Math.atan2(s.vy, Math.hypot(s.vx, s.vz)); }
        this.intercept(s, prev);
        if (s.hp <= 0) continue;
        if (s.kind !== 'bullet' && this.t - s.sampleAt >= .15) {
          const tr = this.trails.find(tr => tr.id === s.id);
          if (tr) tr.points.push({ x: s.x, y: s.y, z: s.z, t: this.t, d: s.distance }); s.sampleAt = this.t;
        }
        this.observeShot(s);
        const target = this.players[1 - s.owner], vehicle = { x: target.x, y: target.y + 3, z: target.z };
        if (['missile','uav','artillery'].includes(s.kind) && segmentDistance(prev, s, vehicle) < 7) { this.explode(s, true); continue; }
        if (s.kind === 'bullet' && segmentDistance(prev, s, vehicle) < 6) { this.damage(target, s.owner, 1); s.hp = 0; continue; }
        if (s.y <= surface(s.x, s.z)) {
          // Find a swept terrain/building impact so fast rounds do not tunnel.
          let lo = 0, hi = 1; for (let j = 0; j < 8; j++) { const f = (lo + hi) / 2, x = prev.x + (s.x - prev.x) * f, y = prev.y + (s.y - prev.y) * f, z = prev.z + (s.z - prev.z) * f; if (y > surface(x, z)) lo = f; else hi = f; }
          s.x = prev.x + (s.x - prev.x) * hi; s.z = prev.z + (s.z - prev.z) * hi; s.y = surface(s.x, s.z);
          if (s.kind === 'bullet' || s.kind === 'sam') { s.hp = 0; this.effect(s, 'spark', s.owner, 5); } else this.explode(s);
          continue;
        }
        if (s.x < -35 || s.x > W + 35 || s.z < -35 || s.z > H + 35 || s.y > 420 || this.t - s.born > s.ttl) {
          s.hp = 0; if (s.kind !== 'bullet') { this.effect(s, 'spark', s.owner, 8); this.note(s.owner, '飞行器已离场或耗尽续航', 'info'); }
        }
      }
      this.removeDead(); this.updateIntel();
      if (!this.over && this.t - this.countdown >= this.limit) {
        const [a, b] = this.players; this.finish(a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1, '交火时间结束');
      }
    }
    intercept(s, prev) {
      if (!['bullet','sam'].includes(s.kind)) return;
      for (const q of this.shots) {
        if (q.hp <= 0 || q.owner === s.owner || !['uav','missile','sam'].includes(q.kind)) continue;
        const radius = s.kind === 'sam' ? 12 : q.kind === 'uav' ? 5 : 3;
        if (segmentDistance(prev, s, q) > radius) continue;
        q.hp -= s.kind === 'sam' ? 100 : 9; s.hp = 0; this.effect(q, 'spark', s.owner, s.kind === 'sam' ? 18 : 3);
        if (q.hp <= 0) {
          this.players[s.owner].stats.intercepted++; this.note(s.owner, '空中目标击落 · 手动拦截成功', 'defense');
          this.note(q.owner, q.kind === 'uav' ? '无人机被击落 · 该区域存在防空火力' : '导弹被敌方拦截', 'danger');
          if (q.kind === 'uav') this.players[q.owner].intel.clues.push({ id: ++this.id, kind: 'probe', x: q.x, z: q.z, radius: 140, until: this.t + 14 });
          this.effect(q, 'explosion', q.owner, 17);
        }
        break;
      }
    }
    explode(s, direct = false) {
      if (s.hp <= 0) return; s.hp = 0; const target = this.players[1 - s.owner];
      const d = dist3(s, { x: target.x, y: target.y + 3, z: target.z }); let amount = 0;
      if (s.kind === 'missile') amount = direct || d <= 10 ? 80 : d <= 34 ? Math.round(60 - (d - 10) / 24 * 15) : 0;
      if (s.kind === 'artillery') amount = direct || d <= 9 ? 40 : d <= 32 ? Math.round(20 - (d - 9) / 23 * 10) : 0;
      if (s.kind === 'uav') amount = direct || d < 15 ? 30 : 0;
      this.effect(s, 'explosion', s.owner, s.kind === 'missile' ? 34 : s.kind === 'artillery' ? 28 : 16);
      if (s.y - terrain(s.x, s.z) < 20) this.effect({ ...s, y: terrain(s.x, s.z) + .25 }, 'crater', s.owner, s.kind === 'missile' ? 14 : 8);
      if (amount) this.damage(target, s.owner, amount);
      else this.note(s.owner, s.kind === 'uav' ? '无人机坠毁 · 未命中热源' : '爆炸未命中敌方发射车', 'info');
    }
    damage(target, owner, amount) {
      const dealt = Math.min(target.hp, amount); target.hp -= dealt; this.players[owner].stats.damage += dealt;
      this.note(target.id, `发射车受损 −${dealt} HP · 注意尾迹来源`, 'hit'); this.note(owner, `命中敌方 −${dealt} HP`, 'hit-enemy');
      if (target.hp <= 0) this.finish(owner, '摧毁敌方发射车');
    }
    removeDead() {
      for (const p of this.players) if (p.pilot && !this.shots.some(s => s.id === p.pilot && s.hp > 0)) { p.pilot = null; p.drive = { throttle: 0, steer: 0 }; }
      this.shots = this.shots.filter(s => s.hp > 0);
    }
    observable(id, q) {
      const p = this.players[id], eye = { x: p.x, y: p.y + 9, z: p.z };
      if (dist(eye, q) < 640 && lineOfSight(eye, q)) return true;
      const s = this.shots.find(s => s.id === p.pilot && s.owner === id);
      return !!s && dist3(s, q) < 550 && lineOfSight(s, q);
    }
    observeShot(s) {
      const id = 1 - s.owner;
      if (s.kind === 'bullet' || s.distance < 65 || s.noticed & 1 << id || !this.observable(id, s)) return;
      s.noticed |= 1 << id; const p = this.players[id];
      p.intel.clues.push({ id: ++this.id, kind: 'direction', x: s.x, z: s.z, yaw: wrap(s.yaw + Math.PI), radius: 500, spread: .32, until: this.t + 15 });
      if (p.intel.clues.length > 5) p.intel.clues.shift();
      this.note(id, s.kind === 'uav' ? '目视无人机 · 航迹可判断来源' : '发现白色尾迹 · 反向观察发射方向', 'warning');
    }
    updateIntel() {
      for (const p of this.players) {
        const foe = this.players[1 - p.id], target = { x: foe.x, y: foe.y + 4, z: foe.z };
        let visible = dist(p, foe) < 205 && lineOfSight({ x: p.x, y: p.y + 7, z: p.z }, target);
        for (const s of this.shots) if (s.owner === p.id && s.kind === 'uav' && dist3(s, target) < 215 && lineOfSight(s, target)) visible = true;
        if (visible) {
          if (!p.intel.lock || this.t - p.intel.lock.t > 5) { p.stats.detections++; this.note(p.id, '发现热源 —— 敌方位置确认', 'lock'); }
          p.intel.lock = { x: foe.x, y: foe.y, z: foe.z, yaw: foe.yaw, t: this.t };
        }
      }
    }
    finish(winner, reason) { if (this.over) return; this.over = true; this.winner = winner; this.reason = reason; for (const p of this.players) { p.mg = false; p.drive = { throttle: 0, steer: 0 }; } }
    updateAI(dt) {
      const p = this.players[1]; p.controlAt = this.t; this.aiClock -= dt;
      const known = p.intel.lock && this.t - p.intel.lock.t < 18 ? p.intel.lock : null;
      const piloted = this.shots.find(s => s.id === p.pilot && s.hp > 0);
      const turnToward = (s, target, maxPitch = 1.1) => {
        const yaw = Math.atan2(target.x - s.x, s.z - target.z), pitch = clamp(Math.atan2(target.y - s.y, dist(s, target)), -1.2, maxPitch);
        s.yaw = wrap(s.yaw + clamp(wrap(yaw - s.yaw), -dt * 1.25, dt * 1.25)); s.pitch += clamp(pitch - s.pitch, -dt, dt); p.drive = { throttle: 0, steer: 0 };
      };
      if (piloted) {
        if (piloted.kind === 'uav') {
          if (known) { p.pilot = null; this.aiAttackAt = this.t + 1.1; }
          else {
            if (dist(piloted, this.aiScan) < 60 || piloted.x < 55 || piloted.x > W - 55 || piloted.z < 55 || piloted.z > H - 55) this.aiScan = { x: 90 + this.random() * 620, z: 90 + this.random() * 1020 };
            turnToward(piloted, { ...this.aiScan, y: terrain(this.aiScan.x, this.aiScan.z) + 82 });
          }
        } else if (piloted.kind === 'sam') {
          // AI observes exactly the same visible airspace as the player.
          const q = this.shots.filter(s => s.owner !== 1 && ['uav','missile'].includes(s.kind) && this.observable(1, s)).sort((a,b) => dist3(a,piloted)-dist3(b,piloted))[0];
          if (q) turnToward(piloted, q); else p.pilot = null;
        } else if (known) {
          const err = this.difficulty === 'easy' ? 15 : 5;
          turnToward(piloted, { x: known.x + Math.sin(piloted.id) * err, y: terrain(known.x, known.z) + 3, z: known.z + Math.cos(piloted.id) * err });
        }
        return;
      }
      if (this.t < this.aiMoveUntil) { p.drive = { throttle: .72, steer: Math.sin(this.t) * .45 }; return; }
      p.drive = { throttle: 0, steer: 0 }; p.mg = false;
      if (this.aiClock > 0) return; this.aiClock = .4;
      const threats = this.shots.filter(s => s.owner !== 1 && ['uav','missile'].includes(s.kind) && dist3({ ...p, y: p.y + 5 }, s) < 370 && this.observable(1, s));
      if (threats.length && !p.cd.sam && this.difficulty !== 'easy') {
        const q = threats.sort((a,b) => dist(a,p)-dist(b,p))[0]; p.selected = 'sam'; p.aim.sam = { yaw: Math.atan2(q.x-p.x,p.z-q.z), pitch: clamp(Math.atan2(q.y-p.y-7,dist(q,p)), .12, 1.35) }; this.command(1, { type:'fire' }); return;
      }
      if (known && this.t >= this.aiAttackAt) {
        const k = !p.cd.missile ? 'missile' : !p.cd.artillery ? 'artillery' : null;
        if (k) {
          const d = dist(p, known), yaw = Math.atan2(known.x - p.x, p.z - known.z), arg = clamp(GRAVITY * d / (SHELL_SPEED * SHELL_SPEED), 0, 1);
          p.selected = k; p.aim[k] = { yaw: yaw + (this.random()-.5) * (this.difficulty === 'easy' ? .1 : .025), pitch: k === 'artillery' ? Math.max(.18,.5*Math.asin(arg)) : .15 };
          if (this.command(1,{type:'fire'}).ok) { this.aiAttackAt = this.t + (this.difficulty === 'easy' ? 8 : 5.7); if (k === 'artillery') this.aiMoveUntil = this.t + 1.8; } return;
        }
      }
      if (!known && !p.cd.uav && !this.shots.some(s => s.owner === 1 && s.kind === 'uav')) {
        p.selected = 'uav'; p.aim.uav = { yaw: Math.atan2(this.aiScan.x-p.x,p.z-this.aiScan.z), pitch: .38 }; this.command(1,{type:'fire'}); return;
      }
      if (!known && p.intel.clues.length && !p.cd.artillery) {
        const c = p.intel.clues[p.intel.clues.length-1], yaw = c.kind === 'direction' ? c.yaw : Math.atan2(c.x-p.x,p.z-c.z);
        p.selected = 'artillery'; p.aim.artillery = { yaw, pitch: .55 + this.random() * .25 }; this.command(1,{type:'fire'}); this.aiMoveUntil = this.t + 1.5;
      }
    }
    snapshot(id) {
      const p = this.players[id], lock = p.intel.lock, age = lock ? this.t - lock.t : Infinity;
      const shots = this.shots.filter(s => s.owner === id || s.kind !== 'bullet' && s.distance > 45 && this.observable(id, s)).map(s => ({
        id: s.id, kind: s.kind, mine: s.owner === id, x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, speed: s.speed,
        ...(s.owner === id ? { hp: s.hp, remaining: Math.max(0,s.ttl-(this.t-s.born)) } : {})
      }));
      const r=v=>Math.round(v*100)/100;
      const trails = this.trails.map(tr => ({ id: tr.id, kind: tr.kind, mine: tr.owner === id, points: tr.points.filter(q => tr.owner === id || q.d > 45 && this.observable(id, q)).map(q => ({ x:r(q.x),y:r(q.y),z:r(q.z),age:r(this.t-q.t) })) })).filter(tr => tr.points.length > 1);
      return { version: 2, seed: this.seed, t: this.t, started: this.t >= this.countdown, countdown: Math.max(0,this.countdown-this.t), remaining: Math.max(0,this.limit-Math.max(0,this.t-this.countdown)),
        over: this.over, outcome: this.over ? this.winner === null ? 'draw' : this.winner === id ? 'win' : 'loss' : null, reason: this.reason,
        own: { x:p.x,y:p.y,z:p.z,yaw:p.yaw,hp:p.hp,speed:p.speed,selected:p.selected,pilot:p.pilot,aim:JSON.parse(JSON.stringify(p.aim)),cd:{...p.cd},mg:p.mg,stats:{...p.stats} },
        enemy: age < 22 ? { x:lock.x,y:lock.y,z:lock.z,yaw:lock.yaw,precise:age<5,left:Math.max(0,5-age),age } : null,
        clues:p.intel.clues.map(c=>({...c,left:c.until-this.t})), shots, trails,
        effects:this.effects.filter(e=>e.owner===id || this.observable(id,e)).map(e=>({...e,age:this.t-e.born})), log:p.log.map(e=>({...e})),
        threats:shots.filter(s=>!s.mine&&['missile','uav'].includes(s.kind)&&dist3(s,{...p,y:p.y+5})<350).length };
    }
  }
  const api = { Engine,W,H,C,PITCH,DEFAULT_PITCH,GRAVITY,SHELL_SPEED,TRAIL_LIFE,BUILDINGS,clamp,wrap,dist,dist3,direction,terrain,surface,muzzle,ballistic,lineOfSight,segmentDistance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; root.Blindfire = api;
})(typeof window !== 'undefined' ? window : globalThis);
