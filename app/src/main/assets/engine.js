/* Blindfire 0.7 — deterministic, host-authoritative 3D simulation. */
(function (root) {
  'use strict';
  const W = 2000, H = 2000, RECON_RANGE = 300, INTEL_LIFE = 5, TAU = Math.PI * 2, GRAVITY = 34, ARTILLERY_RANGE = 1000, SHELL_SPEED = Math.sqrt(GRAVITY * ARTILLERY_RANGE), TRAIL_LIFE = 8, ORBIT_RADIUS = 50;
  const RECON_RANGES = Object.freeze({vehicle:300,uav:400,missile:200});
  const reconRange = kind => RECON_RANGES[kind] || RECON_RANGES.vehicle;
  const ARTILLERY = {
    curve: { speed: SHELL_SPEED, minPitch: Math.PI/4, maxPitch: 1.52, defaultPitch: 1.05 },
    direct: { speed: 310, minPitch: -.22, maxPitch: .5*Math.asin(GRAVITY*ARTILLERY_RANGE/(310*310)), defaultPitch: .08 }
  };
  const artilleryParams = p => ARTILLERY[p.artilleryMode] || ARTILLERY.curve;
  const C = { uav: 10, missile: 22, artillery: 5, sam: 25, mg: 0 };
  const PITCH = { uav: [.06, 1.25], missile: [-1.25, 1.25], artillery: [ARTILLERY.curve.minPitch, ARTILLERY.curve.maxPitch], sam: [-1.25, 1.4], mg: [-.18, 1.4] };
  const DEFAULT_PITCH = { uav: .25, missile: .24, artillery: ARTILLERY.curve.defaultPitch, sam: .65, mg: .38 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const direction = (yaw, pitch) => ({ x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });
  const terrain = (worldX, worldZ) => { const x=worldX*800/W,z=worldZ*1200/H;return 7 + 4 * Math.sin(x * .009) * Math.cos(z * .008) + 3 * Math.sin(z * .013 + x * .006)
    + 26 * Math.exp(-((x - 685) ** 2 / 23000 + (z - 330) ** 2 / 37000))
    + 21 * Math.exp(-((x - 105) ** 2 / 18000 + (z - 815) ** 2 / 28000)); };
  // Shared physical village layout: renderer and collision rules use this data.
  const BUILDINGS = [];
  for (const [cx, cz] of [[620, 510], [1440, 1450], [1390, 690], [530, 1360]]) {
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
  function ballistic(p, maxPoints = 220) {
    const a = p.aim.artillery, start = muzzle(p, 'artillery'), d = direction(a.yaw, a.pitch), speed = artilleryParams(p).speed;
    const points = [{ ...start }]; let hit = null, time = 0;
    for (let i = 1; i <= maxPoints; i++) {
      time = i * .09;
      const q = { x: start.x + d.x * speed * time, y: start.y + d.y * speed * time - .5 * GRAVITY * time * time, z: start.z + d.z * speed * time };
      if (q.x < 0 || q.x > W || q.z < 0 || q.z > H) { points.push(q); break; }
      if (q.y <= surface(q.x, q.z)) {
        let lo=time-.09,hi=time;
        for(let j=0;j<12;j++){const mid=(lo+hi)/2,x=start.x+d.x*speed*mid,z=start.z+d.z*speed*mid,y=start.y+d.y*speed*mid-.5*GRAVITY*mid*mid;if(y>surface(x,z))lo=mid;else hi=mid;}
        time=hi;q.x=start.x+d.x*speed*time;q.z=start.z+d.z*speed*time;q.y=surface(q.x,q.z);points.push(q);hit=q;break;
      }
      points.push(q);
    }
    return { points, hit, range: hit ? dist(start, hit) : null, time, speed, mode: p.artilleryMode || 'curve' };
  }
  class Engine {
    constructor(opts = {}) {
      this.seed = opts.seed || (Date.now() >>> 0); this.rng = this.seed; this.mode = opts.mode || 'ai'; this.difficulty = opts.difficulty || 'standard';
      this.t = 0; this.limit = 180; this.countdown = opts.countdown === undefined ? 3 : opts.countdown;
      this.over = false; this.winner = null; this.reason = ''; this.id = 0;
      this.shots = []; this.trails = []; this.effects = []; this.sounds = []; this.players = [this.player(0), this.player(1)];
      for (let i = 0; i < 80; i++) {
        const a = this.players[0], b = this.players[1];
        a.x = 150 + this.random() * (W-300); a.z = 150 + this.random() * (H-300);
        b.x = 150 + this.random() * (W-300); b.z = 150 + this.random() * (H-300);
        if (dist(a, b) > 950 && clearGround(a.x, a.z) && clearGround(b.x, b.z)) break;
        if (i === 79) { a.x = 250; a.z = 1750; b.x = 1750; b.z = 250; }
      }
      for (const p of this.players) {
        p.y = terrain(p.x, p.z); p.yaw = Math.atan2(W / 2 - p.x, p.z - H / 2);
        for (const a of Object.values(p.aim)) a.yaw = p.yaw;
        this.note(p.id, '敌方位置未知 · 侦察或观察空中尾迹', 'info');
      }
      this.aiClock = 0; this.aiScan = { x: W/2, z: H/2 }; this.aiMoveUntil = 0; this.aiAttackAt = 0;
      this.hardAI = { sample:null, velocity:{x:0,z:0}, clue:0, guess:null, resume:null, scan:0, move:null, moveUntil:0, thinkAt:0 };
    }
    player(id) {
      return { id, x: 400, y: 7, z: 1000, hp: 100, yaw: 0, speed: 0, selected: 'missile', pilot: null, artilleryMode: 'curve',
        drive: { throttle: 0, steer: 0 }, aim: Object.fromEntries(Object.keys(C).map(k => [k, { yaw: 0, pitch: DEFAULT_PITCH[k] }])),
        cd: Object.fromEntries(Object.keys(C).map(k => [k, 0])), mg: false, mgClock: 0, controlAt: 0,
        intel: { lock: null, air: new Map(), clues: [] }, log: [], stats: { damage: 0, launches: 0, intercepted: 0, detections: 0, moves: 0 }, lastLock: -10 };
    }
    random() { let z = this.rng += 0x6D2B79F5; z = Math.imul(z ^ z >>> 15, z | 1); z ^= z + Math.imul(z ^ z >>> 7, z | 61); return ((z ^ z >>> 14) >>> 0) / 4294967296; }
    note(id, text, kind = 'info') { const p = this.players[id]; p.log.unshift({ text, kind, t: this.t, id: ++this.id }); p.log.length = Math.min(5, p.log.length); }
    sound(kind, p, owner) { this.sounds.push({ id: ++this.id, kind, x: p.x, y: p.y, z: p.z, owner, t: this.t }); if(this.sounds.length>64)this.sounds.shift(); }
    effect(p, kind, owner, radius = 24) { this.effects.push({ id: ++this.id, x: p.x, y: p.y, z: p.z, kind, owner, radius, born: this.t, life: kind === 'crater' ? 12 : 1.15 }); if (this.effects.length > 40) this.effects.shift(); if(kind==='explosion')this.sound('explosion',p,owner); }
    command(id, action) {
      const p = this.players[id];
      if (!p || !action || typeof action !== 'object' || this.over) return { ok: false, reason: '本局已结束' };
      const k = action.type;
      if (k === 'select' && Object.prototype.hasOwnProperty.call(C, action.weapon)) {
        p.selected = action.weapon; p.mg = false; return { ok: true };
      }
      if (k === 'vehicle') { p.pilot = null; p.drive = { throttle: 0, steer: 0 }; p.mg = false; return { ok: true }; }
      if (k === 'pilot') {
        const s = this.shots.find(s => s.owner === id && s.id === action.id && ['uav','missile'].includes(s.kind) && s.hp > 0);
        if (!s) return { ok: false, reason: '飞行器已失去连接' };
        s.orbit = null; p.pilot = s.id; p.mg = false; p.drive = { throttle: 0, steer: 0 }; return { ok: true };
      }
      if(k==='artillery-mode') {
        if(p.pilot||p.selected!=='artillery'||!Object.prototype.hasOwnProperty.call(ARTILLERY,action.mode))return {ok:false,reason:'先选择火炮，再切换射击模式'};
        p.artilleryMode=action.mode;p.aim.artillery.pitch=ARTILLERY[action.mode].defaultPitch;
        return {ok:true};
      }
      if(k==='uav-orbit') {
        const s=this.shots.find(s=>s.owner===id&&s.kind==='uav'&&s.hp>0&&(action.id===undefined||s.id===action.id));
        if(!s||typeof action.active!=='boolean')return {ok:false,reason:'当前没有可控制的无人机'};
        if(this.t<this.countdown)return {ok:false,reason:'正在进入战场'};
        if(action.active){this.startOrbit(s);if(p.pilot===s.id){p.pilot=null;p.drive={throttle:0,steer:0};}this.note(id,'无人机自动盘旋 · 半径50米 / 持续侦察','scout');}
        else {s.orbit=null;p.pilot=s.id;p.drive={throttle:0,steer:0};p.mg=false;this.note(id,'无人机已切回手动飞行','scout');}
        return {ok:true};
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
      let airTarget=null;
      if (weapon==='sam') {
        airTarget=this.samTarget(id,{x:p.x,y:p.y+5.7,z:p.z});
        if(!airTarget)return {ok:false,reason:'300m 内没有可锁定的空中目标'};
        p.aim.sam={yaw:Math.atan2(airTarget.x-p.x,p.z-airTarget.z),pitch:clamp(Math.atan2(airTarget.y-p.y-5.7,dist(p,airTarget)),-1.25,1.4)};
      }
      const s = this.launch(p, weapon); p.cd[weapon] = C[weapon]; p.stats.launches++;
      if(airTarget)s.targetId=airTarget.id;
      if (['uav','missile'].includes(weapon)) { p.pilot = s.id; p.drive = { throttle: 0, steer: 0 }; }
      this.note(id, { uav:'无人机起飞 · 300m 共享侦察', missile:'导弹出筒 · 手动飞行 / 300m 侦察', artillery:'炮弹出膛 · 白色尾迹持续8秒', sam:'防空导弹自动锁定 · 25秒装填' }[weapon], weapon === 'uav' ? 'scout' : 'attack');
      return { ok: true, id: s.id };
    }
    setAim(p, a) {
      if (!Number.isFinite(a.yaw) || !Number.isFinite(a.pitch)) return { ok: false, reason: '无效瞄准' };
      const s = this.shots.find(s => s.id === p.pilot && s.owner === p.id && s.hp > 0);
      if (s) { s.yaw = wrap(a.yaw); s.pitch = clamp(a.pitch, -1.3, 1.4); }
      else { const q=artilleryParams(p),lim = p.selected==='artillery'?[q.minPitch,q.maxPitch]:PITCH[p.selected]; p.aim[p.selected] = { yaw: wrap(a.yaw), pitch: clamp(a.pitch, lim[0], lim[1]) }; }
      return { ok: true };
    }
    launch(p, kind) {
      const start = muzzle(p, kind), a = p.aim[kind], speed = kind==='artillery'?artilleryParams(p).speed:{ uav: 58, missile: 155, sam: 225, bullet: 720 }[kind];
      const d = direction(a.yaw, a.pitch);
      const s = { id: ++this.id, owner: p.id, kind, ...start, yaw: a.yaw, pitch: a.pitch, vx: d.x * speed, vy: d.y * speed, vz: d.z * speed,
        speed, hp: kind === 'uav' ? 27 : kind === 'missile' ? 18 : 1, born: this.t, ttl: { uav: 40, missile: 14, artillery: null, sam: 8, bullet: .55 }[kind],
        distance: 0, sampleAt: this.t, noticed: 0 };
      this.shots.push(s);
      if(kind==='artillery')s.artilleryMode=p.artilleryMode;
      this.sound(kind,start,p.id);
      if (kind !== 'bullet') this.trails.push({ id: s.id, owner: p.id, kind, points: [{ ...start, t: this.t, d: 0 }] });
      return s;
    }
    shootMG(p) {
      const a = p.aim.mg, d = direction(a.yaw, a.pitch), m = muzzle(p, 'mg');
      this.shots.push({ id: ++this.id, owner: p.id, kind: 'bullet', ...m, yaw: a.yaw, pitch: a.pitch, vx: d.x * 720, vy: d.y * 720, vz: d.z * 720,
        speed: 720, hp: 1, born: this.t, ttl: .55, distance: 0, noticed: 0 });
      this.sound('mg',m,p.id);
    }
    startOrbit(s) {
      const radius=ORBIT_RADIUS,x=clamp(s.x+Math.cos(s.yaw)*radius,radius,W-radius),z=clamp(s.z+Math.sin(s.yaw)*radius,radius,H-radius);
      let altitude=s.y;for(let i=0;i<32;i++){const a=i/32*TAU;altitude=Math.max(altitude,surface(x+Math.cos(a)*radius,z+Math.sin(a)*radius)+20);}
      s.orbit={x,z,radius,altitude,angle:Math.atan2(s.z-z,s.x-x),joining:Math.abs(Math.hypot(s.x-x,s.z-z)-radius)>1};
    }
    stepOrbit(s,dt) {
      const o=s.orbit,dx=s.x-o.x,dz=s.z-o.z,d=Math.hypot(dx,dz);
      if(o.joining&&Math.abs(d-o.radius)<=1){o.joining=false;o.angle=Math.atan2(dz,dx);}
      if(o.joining){
        const a=Math.atan2(dz,dx),x=o.x+Math.cos(a)*o.radius,z=o.z+Math.sin(a)*o.radius;
        const yaw=Math.atan2(x-s.x,s.z-z),pitch=clamp(Math.atan2(o.altitude-s.y,Math.max(25,dist(s,{x,z}))),-.35,.45);
        s.yaw=wrap(s.yaw+clamp(wrap(yaw-s.yaw),-2.4*dt,2.4*dt));s.pitch+=clamp(pitch-s.pitch,-dt,dt);return false;
      }
      const old={x:s.x,y:s.y,z:s.z};o.angle+=s.speed/o.radius*dt;
      s.x=o.x+Math.cos(o.angle)*o.radius;s.z=o.z+Math.sin(o.angle)*o.radius;s.y+=clamp(o.altitude-s.y,-20*dt,20*dt);
      s.vx=(s.x-old.x)/dt;s.vy=(s.y-old.y)/dt;s.vz=(s.z-old.z)/dt;s.yaw=Math.atan2(s.vx,-s.vz);s.pitch=Math.atan2(s.vy,Math.hypot(s.vx,s.vz));return true;
    }
    samTarget(id,from) {
      return this.shots.filter(q=>q.hp>0&&q.owner!==id&&['uav','missile','sam'].includes(q.kind)&&dist3(from,q)<=RECON_RANGE)
        .sort((a,b)=>(a.kind==='missile'?-1000:0)+dist3(from,a)-((b.kind==='missile'?-1000:0)+dist3(from,b)))[0]||null;
    }
    guideSAM(s,dt) {
      let q=this.shots.find(q=>q.id===s.targetId&&q.owner!==s.owner&&q.hp>0);
      if(!q){q=this.samTarget(s.owner,s);s.targetId=q?q.id:null;}
      if(!q)return;
      const lead=Math.min(1.1,dist3(s,q)/s.speed),x=q.x+q.vx*lead,y=q.y+q.vy*lead,z=q.z+q.vz*lead;
      const yaw=Math.atan2(x-s.x,s.z-z),pitch=Math.atan2(y-s.y,Math.hypot(x-s.x,z-s.z));
      s.yaw=wrap(s.yaw+clamp(wrap(yaw-s.yaw),-3.4*dt,3.4*dt));s.pitch+=clamp(pitch-s.pitch,-3.4*dt,3.4*dt);
    }
    sensors(id) {
      const p=this.players[id];return [{kind:'vehicle',x:p.x,y:p.y+4,z:p.z},...this.shots.filter(s=>s.owner===id&&s.hp>0&&['uav','missile'].includes(s.kind))];
    }
    inReconRange(id,target) { return this.sensors(id).some(s=>dist3(s,target)<=reconRange(s.kind)); }
    update(dt) {
      if (this.over || !Number.isFinite(dt) || dt <= 0) return; dt = Math.min(.05, dt); this.t += dt;
      this.effects = this.effects.filter(e => this.t - e.born < e.life);
      this.sounds=this.sounds.filter(e=>this.t-e.t<1.2);
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
        if(s.kind==='sam')this.guideSAM(s,dt);
        const orbitStep=s.kind==='uav'&&s.orbit&&this.stepOrbit(s,dt);
        if (!orbitStep&&['uav','missile','sam'].includes(s.kind)) {
          const d = direction(s.yaw, s.pitch); s.vx = d.x * s.speed; s.vy = d.y * s.speed; s.vz = d.z * s.speed;
        }
        const gravity = s.kind === 'artillery' ? GRAVITY : s.kind === 'bullet' ? 4 : 0;
        if(!orbitStep){s.x += s.vx * dt; s.y += s.vy * dt - .5 * gravity * dt * dt; s.z += s.vz * dt; s.vy -= gravity * dt;}s.distance += dist3(prev, s);
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
        if (s.x < -35 || s.x > W + 35 || s.z < -35 || s.z > H + 35 || s.kind!=='artillery' && (s.y > 420 || this.t - s.born > s.ttl)) {
          s.hp = 0; if (!['bullet','artillery'].includes(s.kind)) { this.effect(s, 'spark', s.owner, 8); this.note(s.owner, '飞行器已离场或耗尽续航', 'info'); }
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
          this.players[s.owner].stats.intercepted++; this.note(s.owner, s.kind==='sam'?'空中目标击落 · 自动拦截成功':'空中目标击落 · 机枪命中', 'defense');
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
      this.sound('impact',{...target,y:target.y+3},target.id);this.sound('confirm',target,owner);
      if (target.hp <= 0) this.finish(owner, '摧毁敌方发射车');
    }
    removeDead() {
      for(const s of this.shots)if(s.hp<=0)for(const p of this.players)if(this.inReconRange(p.id,s))p.intel.air.delete(s.id);
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
        const visible=this.inReconRange(p.id,target);
        if (visible) {
          if (!p.intel.lock || this.t - p.intel.lock.t > 5) { p.stats.detections++; this.note(p.id, '发现热源 —— 敌方位置确认', 'lock'); }
          p.intel.lock = { x: foe.x, y: foe.y, z: foe.z, yaw: foe.yaw, t: this.t, visible:true };
        }
        else if(p.intel.lock)p.intel.lock.visible=false;
        for(const c of p.intel.air.values())c.visible=false;
        for(const s of this.shots)if(s.owner!==p.id&&s.kind!=='bullet'&&this.inReconRange(p.id,s))p.intel.air.set(s.id,{id:s.id,kind:s.kind,x:s.x,y:s.y,z:s.z,yaw:s.yaw,pitch:s.pitch,speed:s.speed,t:this.t,visible:true});
        for(const [id,c]of p.intel.air)if(this.t-c.t>=INTEL_LIFE)p.intel.air.delete(id);
      }
    }
    finish(winner, reason) { if (this.over) return; this.over = true; this.winner = winner; this.reason = reason; for (const p of this.players) { p.mg = false; p.drive = { throttle: 0, steer: 0 }; } }
    hardTarget(lead=0) {
      const p=this.players[1],lock=p.intel.lock,h=this.hardAI;
      if(!lock||this.t-lock.t>=INTEL_LIFE)return null;
      const age=this.t-lock.t,time=Math.min(5,age+lead);
      const x=clamp(lock.x+h.velocity.x*time,20,W-20),z=clamp(lock.z+h.velocity.z*time,20,H-20);
      return {x,z,y:terrain(x,z)+3,age,visible:lock.visible};
    }
    hardRelocate(awayYaw) {
      const p=this.players[1],h=this.hardAI;
      for(let i=0;i<12;i++){
        const yaw=awayYaw===undefined?p.yaw+(this.random()>.5?1:-1)*(.5+this.random()):awayYaw+(i%2?-.8:.8);
        const x=clamp(p.x+Math.sin(yaw)*(100+i*3),25,W-25),z=clamp(p.z-Math.cos(yaw)*(100+i*3),25,H-25);
        if(clearGround(x,z,10)){h.move={x,z};h.moveUntil=this.t+5;return;}
      }
    }
    hardDrive() {
      const p=this.players[1],h=this.hardAI;
      if(!h.move||this.t>=h.moveUntil||dist(p,h.move)<15){h.move=null;return false;}
      const yaw=Math.atan2(h.move.x-p.x,p.z-h.move.z),error=wrap(yaw-p.yaw);
      p.drive={throttle:Math.abs(error)>1.5?.35:.95,steer:clamp(error/.6,-1,1)};return true;
    }
    hardScanPoint() {
      const route=[[250,250],[1750,250],[1750,625],[250,625],[250,1000],[1750,1000],[1750,1375],[250,1375],[250,1750],[1750,1750]],q=route[this.hardAI.scan%route.length];
      return {x:q[0],z:q[1]};
    }
    hardArtillery(target) {
      const p=this.players[1],d=dist(p,target);if(d>ARTILLERY_RANGE)return false;
      const mode=d<130?'direct':'curve',q=ARTILLERY[mode];
      let aimTarget=target,yaw=0,pitch=q.defaultPitch,time=0;
      for(let i=0;i<4;i++){
        if(i)aimTarget=this.hardTarget(time)||target;
        yaw=Math.atan2(aimTarget.x-p.x,p.z-aimTarget.z);
        const range=Math.max(1,dist(p,aimTarget)-Math.cos(pitch)*7),height=aimTarget.y-(p.y+5.7+Math.sin(pitch)*7),v2=q.speed*q.speed;
        const disc=v2*v2-GRAVITY*(GRAVITY*range*range+2*height*v2);if(disc<0)return false;
        pitch=Math.atan((v2+(mode==='curve'?1:-1)*Math.sqrt(disc))/(GRAVITY*range));
        if(pitch<q.minPitch||pitch>q.maxPitch)return false;time=range/(q.speed*Math.cos(pitch));
      }
      const error=(this.random()-.5)*(.006+target.age*.008);
      p.artilleryMode=mode;p.selected='artillery';p.aim.artillery={yaw:yaw+error,pitch};
      return this.command(1,{type:'fire'}).ok;
    }
    updateHardAI(dt) {
      const p=this.players[1],h=this.hardAI;p.controlAt=this.t;
      // Velocity and search hints come exclusively from the same expiring intel as the player.
      const lock=p.intel.lock;
      if(lock&&lock.visible&&(!h.sample||lock.t>h.sample.t)){
        if(h.sample&&lock.t-h.sample.t<.5){const dt=lock.t-h.sample.t;if(dt>0)h.velocity={x:clamp((lock.x-h.sample.x)/dt,-33,33),z:clamp((lock.z-h.sample.z)/dt,-33,33)};}
        else h.velocity={x:0,z:0};h.sample={x:lock.x,z:lock.z,t:lock.t};
      }
      const clue=p.intel.clues.at(-1);
      if(clue&&clue.id!==h.clue){h.clue=clue.id;h.guess={x:clamp(clue.x+(clue.kind==='direction'?Math.sin(clue.yaw)*600:0),70,W-70),z:clamp(clue.z-(clue.kind==='direction'?Math.cos(clue.yaw)*600:0),70,H-70),until:clue.until};}
      const known=this.hardTarget(),threat=this.samTarget(1,{...p,y:p.y+5.7});let pilot=this.shots.find(s=>s.id===p.pilot&&s.hp>0);
      if(pilot&&pilot.kind==='uav'&&threat){this.startOrbit(pilot);p.pilot=null;pilot=null;}
      const aimFlight=target=>{const yaw=Math.atan2(target.x-pilot.x,pilot.z-target.z),pitch=clamp(Math.atan2(target.y-pilot.y,Math.max(1,dist(pilot,target))),-1.25,1.4);pilot.yaw=wrap(pilot.yaw+clamp(wrap(yaw-pilot.yaw),-1.35*dt,1.35*dt));pilot.pitch+=clamp(pitch-pilot.pitch,-dt,dt);p.drive={throttle:0,steer:0};return Math.abs(wrap(yaw-pilot.yaw))<.04&&Math.abs(pitch-pilot.pitch)<.04;};
      if(pilot){
        if(pilot.kind==='uav'){
          if(!known&&this.t-pilot.born>39.6)h.resume={x:pilot.x,z:pilot.z,owner:pilot.id};
          if(known&&dist3(pilot,known)<180){this.startOrbit(pilot);p.pilot=null;this.aiAttackAt=this.t+.35;}
          else if(known){aimFlight({...known,y:terrain(known.x,known.z)+65});return;}
          else {
            const guessed=h.guess&&h.guess.until>this.t,resuming=!guessed&&h.resume&&h.resume.owner!==pilot.id;
            let goal=guessed?h.guess:resuming?h.resume:this.hardScanPoint();
            if(dist(pilot,goal)<85){if(resuming)h.resume=null;else{h.guess=null;h.scan++;}goal=this.hardScanPoint();}
            aimFlight({...goal,y:terrain(goal.x,goal.z)+65});return;
          }
        }else if(pilot.kind==='missile'){
          if(known)pilot.aiGoal=this.hardTarget(dist(pilot,known)/pilot.speed);
          const goal=pilot.aiGoal;
          if(goal){
            const distance=dist(pilot,goal);let waypoint=goal;
            if(distance>190){const f=Math.min(1,200/distance),x=pilot.x+(goal.x-pilot.x)*f,z=pilot.z+(goal.z-pilot.z)*f;let height=surface(pilot.x,pilot.z);for(let i=1;i<=6;i++)height=Math.max(height,surface(pilot.x+(x-pilot.x)*i/6,pilot.z+(z-pilot.z)*i/6));waypoint={x,z,y:height+55};}
            const aligned=aimFlight(waypoint);if(distance<=190&&aligned){p.pilot=null;this.hardRelocate();}else return;
          }
          else if(!threat)return;
          else p.pilot=null;
        }
      }
      p.mg=false;
      if(threat){
        if(!p.cd.sam){p.drive={throttle:0,steer:0};p.selected='sam';if(Math.abs(p.speed)<=2)this.command(1,{type:'fire'});return;}
        const lead=dist3({...p,y:p.y+5.7},threat)/720,goal={x:threat.x+threat.vx*lead,y:threat.y+threat.vy*lead,z:threat.z+threat.vz*lead};
        p.selected='mg';p.aim.mg={yaw:Math.atan2(goal.x-p.x,p.z-goal.z),pitch:clamp(Math.atan2(goal.y-p.y-5.7,Math.max(1,dist(p,goal))),PITCH.mg[0],PITCH.mg[1])};p.mg=true;
        if(!h.move&&threat.kind==='missile')this.hardRelocate(threat.yaw+Math.PI/2);if(!this.hardDrive())p.drive={throttle:0,steer:0};return;
      }
      if(this.hardDrive())return;
      p.drive={throttle:0,steer:0};if(this.t<h.thinkAt)return;h.thinkAt=this.t+.15;
      if(known&&this.t>=this.aiAttackAt){
        if(Math.abs(p.speed)>2)return;
        if(!p.cd.artillery&&this.hardArtillery(known)){this.aiAttackAt=this.t+.7;this.hardRelocate();return;}
        if(!p.cd.missile){const goal=this.hardTarget(dist(p,known)/155)||known;p.selected='missile';p.aim.missile={yaw:Math.atan2(goal.x-p.x,p.z-goal.z),pitch:dist(p,goal)>190?.3:clamp(Math.atan2(goal.y-p.y-5.7,Math.max(1,dist(p,goal))),PITCH.missile[0],PITCH.missile[1])};const r=this.command(1,{type:'fire'});if(r.ok){this.shots.find(s=>s.id===r.id).aiGoal={...goal};this.aiAttackAt=this.t+.7;return;}}
      }
      const scout=this.shots.find(s=>s.owner===1&&s.kind==='uav'&&s.hp>0);
      if(!known&&scout){if(scout.orbit)this.command(1,{type:'pilot',id:scout.id});return;}
      if(!known&&!scout&&!p.cd.uav&&Math.abs(p.speed)<=2){const goal=h.guess&&h.guess.until>this.t?h.guess:h.resume||this.hardScanPoint();p.selected='uav';p.aim.uav={yaw:Math.atan2(goal.x-p.x,p.z-goal.z),pitch:.32};this.command(1,{type:'fire'});}
    }
    updateAI(dt) {
      if(this.difficulty==='hard'){this.updateHardAI(dt);return;}
      const p = this.players[1]; p.controlAt = this.t; this.aiClock -= dt;
      const known = p.intel.lock && this.t - p.intel.lock.t < INTEL_LIFE ? p.intel.lock : null;
      const piloted = this.shots.find(s => s.id === p.pilot && s.hp > 0);
      const turnToward = (s, target, maxPitch = 1.1) => {
        const yaw = Math.atan2(target.x - s.x, s.z - target.z), pitch = clamp(Math.atan2(target.y - s.y, dist(s, target)), -1.2, maxPitch);
        s.yaw = wrap(s.yaw + clamp(wrap(yaw - s.yaw), -dt * 1.25, dt * 1.25)); s.pitch += clamp(pitch - s.pitch, -dt, dt); p.drive = { throttle: 0, steer: 0 };
      };
      if (piloted) {
        if (piloted.kind === 'uav') {
          if (known) { p.pilot = null; this.aiAttackAt = this.t + 1.1; }
          else {
            if (dist(piloted, this.aiScan) < 60 || piloted.x < 55 || piloted.x > W - 55 || piloted.z < 55 || piloted.z > H - 55) this.aiScan = { x: 90 + this.random() * (W-180), z: 90 + this.random() * (H-180) };
            turnToward(piloted, { ...this.aiScan, y: terrain(this.aiScan.x, this.aiScan.z) + 82 });
          }
        } else if (known) {
          const err = this.difficulty === 'easy' ? 15 : 5;
          turnToward(piloted, { x: known.x + Math.sin(piloted.id) * err, y: terrain(known.x, known.z) + 3, z: known.z + Math.cos(piloted.id) * err });
        }
        return;
      }
      if (this.t < this.aiMoveUntil) { p.drive = { throttle: .72, steer: Math.sin(this.t) * .45 }; return; }
      p.drive = { throttle: 0, steer: 0 }; p.mg = false;
      if (this.aiClock > 0) return; this.aiClock = .4;
      if (this.samTarget(1,{...p,y:p.y+5.7}) && !p.cd.sam && this.difficulty !== 'easy') {
        p.selected = 'sam'; this.command(1, { type:'fire' }); return;
      }
      if (known && this.t >= this.aiAttackAt) {
        const k = !p.cd.missile ? 'missile' : !p.cd.artillery&&dist(p,known)<ARTILLERY_RANGE ? 'artillery' : null;
        if (k) {
          const d = dist(p, known), yaw = Math.atan2(known.x - p.x, p.z - known.z);p.artilleryMode=d<900?'direct':'curve';
          const q=artilleryParams(p),arg=clamp(GRAVITY*d/(q.speed*q.speed),0,1),pitch=p.artilleryMode==='curve'?(Math.PI-Math.asin(arg))*.5:Math.asin(arg)*.5;
          p.selected = k; p.aim[k] = { yaw: yaw + (this.random()-.5) * (this.difficulty === 'easy' ? .1 : .025), pitch: k === 'artillery' ? clamp(pitch,q.minPitch,q.maxPitch) : .15 };
          if (this.command(1,{type:'fire'}).ok) { this.aiAttackAt = this.t + (this.difficulty === 'easy' ? 8 : 5.7); if (k === 'artillery') this.aiMoveUntil = this.t + 1.8; } return;
        }
      }
      if (!known && !p.cd.uav && !this.shots.some(s => s.owner === 1 && s.kind === 'uav')) {
        p.selected = 'uav'; p.aim.uav = { yaw: Math.atan2(this.aiScan.x-p.x,p.z-this.aiScan.z), pitch: .38 }; this.command(1,{type:'fire'}); return;
      }
      if (!known && p.intel.clues.length && !p.cd.artillery) {
        const c = p.intel.clues[p.intel.clues.length-1], yaw = c.kind === 'direction' ? c.yaw : Math.atan2(c.x-p.x,p.z-c.z);
        p.selected = 'artillery';p.artilleryMode='curve'; p.aim.artillery = { yaw, pitch: .65 + this.random() * .35 }; this.command(1,{type:'fire'}); this.aiMoveUntil = this.t + 1.5;
      }
    }
    snapshot(id) {
      const p = this.players[id], lock = p.intel.lock, age = lock ? this.t - lock.t : Infinity;
      const shots = this.shots.filter(s => s.owner === id).map(s => ({
        id: s.id, kind: s.kind, mine: true, x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, speed: s.speed,
        hp:s.hp,remaining:s.ttl===null?null:Math.max(0,s.ttl-(this.t-s.born)),...(s.kind==='sam'?{locked:!!this.shots.find(q=>q.id===s.targetId&&q.hp>0)}:{}),...(s.kind==='uav'?{orbit:s.orbit?{x:s.orbit.x,z:s.orbit.z,radius:s.orbit.radius,altitude:s.orbit.altitude,joining:s.orbit.joining}:null}:{}),...(s.kind==='artillery'?{artilleryMode:s.artilleryMode}:{})
      }));
      for(const c of p.intel.air.values())if(this.t-c.t<INTEL_LIFE)shots.push({id:c.id,kind:c.kind,mine:false,x:c.x,y:c.y,z:c.z,yaw:c.yaw,pitch:c.pitch,speed:c.speed,retained:!c.visible,left:Math.max(0,INTEL_LIFE-(this.t-c.t))});
      const r=v=>Math.round(v*100)/100;
      const trails = this.trails.map(tr => ({ id: tr.id, kind: tr.kind, mine: tr.owner === id, points: tr.points.filter(q => tr.owner === id || q.d > 45 && this.observable(id, q)).map(q => ({ x:r(q.x),y:r(q.y),z:r(q.z),age:r(this.t-q.t) })) })).filter(tr => tr.points.length > 1);
      const listener=this.shots.find(s=>s.owner===id&&s.id===p.pilot)||{x:p.x,y:p.y+5,z:p.z,yaw:p.yaw};
      const sounds=this.sounds.flatMap(e=>{if(e.kind==='confirm')return e.owner===id?[{id:e.id,kind:e.kind,gain:.65,pan:0}]:[];const distance=dist3(listener,e),range=e.kind==='explosion'?650:380;if(distance>range)return [];return [{id:e.id,kind:e.kind,gain:Math.max(.03,(1-distance/range)**2),pan:clamp(Math.sin(Math.atan2(e.x-listener.x,listener.z-e.z)-listener.yaw),-1,1)}];});
      return { version: 6, field:{width:W,height:H,recon:RECON_RANGE,reconRanges:{...RECON_RANGES},intelLife:INTEL_LIFE}, seed: this.seed, t: this.t, started: this.t >= this.countdown, countdown: Math.max(0,this.countdown-this.t), remaining: Math.max(0,this.limit-Math.max(0,this.t-this.countdown)),
        over: this.over, outcome: this.over ? this.winner === null ? 'draw' : this.winner === id ? 'win' : 'loss' : null, reason: this.reason,
        own: { x:p.x,y:p.y,z:p.z,yaw:p.yaw,hp:p.hp,speed:p.speed,selected:p.selected,pilot:p.pilot,artilleryMode:p.artilleryMode,aim:JSON.parse(JSON.stringify(p.aim)),cd:{...p.cd},mg:p.mg,stats:{...p.stats} },
        enemy: age < INTEL_LIFE ? { x:lock.x,y:lock.y,z:lock.z,yaw:lock.yaw,precise:true,retained:!lock.visible,left:Math.max(0,INTEL_LIFE-age),age } : null,
        clues:p.intel.clues.map(c=>({...c,left:c.until-this.t})), shots, trails, sounds,
        effects:this.effects.filter(e=>e.owner===id || this.observable(id,e)).map(e=>({...e,age:this.t-e.born})), log:p.log.map(e=>({...e})),
        threats:shots.filter(s=>!s.mine&&!s.retained&&['missile','uav','sam'].includes(s.kind)&&dist3(s,{...p,y:p.y+5.7})<=RECON_RANGE).length };
    }
  }
  const api = { Engine,W,H,RECON_RANGE,RECON_RANGES,reconRange,INTEL_LIFE,C,PITCH,DEFAULT_PITCH,GRAVITY,ARTILLERY_RANGE,SHELL_SPEED,TRAIL_LIFE,ORBIT_RADIUS,ARTILLERY,artilleryParams,BUILDINGS,clamp,wrap,dist,dist3,direction,terrain,surface,muzzle,ballistic,lineOfSight,segmentDistance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; root.Blindfire = api;
})(typeof window !== 'undefined' ? window : globalThis);
