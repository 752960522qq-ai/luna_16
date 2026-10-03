/* Blindfire v0.1: authoritative rules. No browser or network dependency. */
(function (root) {
  'use strict';
  const W = 800, H = 1200, TAU = Math.PI * 2;
  const C = { uav: 10, missile: 22, artillery: 5, move: 6, decoy: 20, sam: 18 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const point = (x, y) => ({ x, y });
  class Engine {
    constructor(opts = {}) {
      this.seed = opts.seed || (Date.now() >>> 0); this.rng = this.seed;
      this.mode = opts.mode || 'ai'; this.difficulty = opts.difficulty || 'standard';
      this.t = 0; this.limit = 180; this.countdown = opts.countdown === undefined ? 3 : opts.countdown;
      this.over = false; this.winner = null; this.reason = ''; this.id = 0;
      this.shots = []; this.decoys = []; this.effects = []; this.tracers = [];
      this.players = [this.player(0), this.player(1)];
      const a = this.players[0], b = this.players[1];
      for (let i = 0; i < 80; i++) {
        a.x = 110 + this.random() * 580; a.y = 170 + this.random() * 860;
        b.x = 110 + this.random() * 580; b.y = 170 + this.random() * 860;
        if (dist(a, b) >= 650) break;
      }
      if (dist(a, b) < 600) { a.x = 110; a.y = 170; b.x = 690; b.y = 1030; }
      this.aiNext = 1.8; this.aiMoveAt = 0;
      this.note(0, '行动开始：敌方位置未知', 'info'); this.note(1, '行动开始：敌方位置未知', 'info');
    }
    player(id) {
      return { id, x: 400, y: 1000, hp: 100, angle: id ? Math.PI : 0,
        cd: Object.fromEntries(Object.keys(C).map(k => [k, 0])), destination: null,
        mg: false, mgClock: 0, intel: { lock: null, clues: [] }, log: [],
        stats: { damage: 0, launches: 0, intercepted: 0, detections: 0, moves: 0 },
        lastSeenNotice: -10, lastSignal: -10 };
    }
    random() {
      let z = this.rng += 0x6D2B79F5;
      z = Math.imul(z ^ z >>> 15, z | 1);
      z ^= z + Math.imul(z ^ z >>> 7, z | 61);
      return ((z ^ z >>> 14) >>> 0) / 4294967296;
    }
    note(id, text, kind = 'info') {
      const p = this.players[id]; p.log.unshift({ text, kind, t: this.t, id: ++this.id });
      p.log.length = Math.min(6, p.log.length);
    }
    effect(x, y, kind, owner, radius = 50) {
      this.effects.push({ id: ++this.id, x, y, kind, owner, radius, born: this.t, life: kind === 'crater' ? 22 : 1.3 });
      if (this.effects.length > 90) this.effects.shift();
    }
    command(id, action) {
      if (this.over || this.t < this.countdown || !action || !this.players[id]) return { ok: false, reason: '尚未开始' };
      const p = this.players[id], k = action.type;
      if (k === 'mg') { p.mg = !!action.active && !p.destination; return { ok: true }; }
      if (!['uav', 'missile', 'artillery', 'move', 'decoy', 'sam', 'dive'].includes(k)) return { ok: false, reason: '未知指令' };
      if (p.destination) return { ok: false, reason: '机动中无法发射，请等待停车' };
      if (p.cd[k] > 0) return { ok: false, reason: '装备冷却中' };
      let target;
      if (['uav', 'missile', 'artillery', 'move', 'dive'].includes(k)) {
        if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) return { ok: false, reason: '请选择地图位置' };
        target = point(clamp(action.x, 32, W - 32), clamp(action.y, 32, H - 32));
      }
      if (k === 'move') {
        const d = dist(p, target);
        if (d < 18) return { ok: false, reason: '目标距离太近' };
        // A relocation can cover at most 210 m-equivalent and takes real time.
        if (d > 210) target = point(p.x + (target.x - p.x) * 210 / d, p.y + (target.y - p.y) * 210 / d);
        p.destination = target; p.cd.move = C.move; p.mg = false; p.stats.moves++;
        this.note(id, '开始机动 · 移动期间停止发射', 'move'); return { ok: true };
      }
      if (k === 'decoy') {
        this.decoys.push({ id: ++this.id, owner: id, x: p.x, y: p.y, until: this.t + 24, hp: 1 });
        p.cd.decoy = C.decoy; this.note(id, '热源诱饵已留在当前位置', 'info'); return { ok: true };
      }
      if (k === 'sam') {
        const threats = this.threats(id, 300);
        if (!threats.length) return { ok: false, reason: '防空范围内没有可拦截目标' };
        threats.sort((a, b) => (a.kind === 'missile' ? -1000 : 0) + dist(a, p) - ((b.kind === 'missile' ? -1000 : 0) + dist(b, p)));
        const s = this.projectile('sam', id, p, threats[0], 480); s.targetId = threats[0].id; s.hp = 1;
        p.cd.sam = C.sam; this.note(id, '防空导弹出击', 'defense'); return { ok: true };
      }
      if (k === 'dive') {
        const drones = this.shots.filter(s => s.owner === id && s.kind === 'uav' && s.hp > 0 && s.state !== 'dive');
        if (!drones.length) return { ok: false, reason: '没有可用的侦察无人机' };
        drones.sort((a, b) => dist(a, target) - dist(b, target));
        const s = drones[0]; s.state = 'dive'; s.tx = target.x; s.ty = target.y; s.speed = 230;
        this.note(id, '无人机转入自杀攻击', 'attack'); return { ok: true };
      }
      if (k === 'uav' && this.shots.filter(s => s.owner === id && s.kind === 'uav' && s.hp > 0).length >= 2) return { ok: false, reason: '最多同时指挥两架无人机' };
      this.projectile(k, id, p, target, { uav: 100, missile: 245, artillery: 820 }[k]);
      p.cd[k] = C[k]; p.stats.launches++;
      this.note(id, { uav: '无人机起飞 · 前往指定区域', missile: '导弹发射 · 弹道可能暴露方向', artillery: '火炮开火 · 注意机动避反击' }[k], k === 'uav' ? 'scout' : 'attack');
      return { ok: true };
    }
    projectile(kind, owner, start, target, speed) {
      const s = { id: ++this.id, kind, owner, x: start.x, y: start.y, sx: start.x, sy: start.y,
        tx: target.x, ty: target.y, speed, hp: kind === 'uav' ? 24 : 20,
        state: 'travel', born: this.t, age: 0, distance: 0, trail: [], trailClock: 0,
        noticed: false, angle: Math.atan2(target.y - start.y, target.x - start.x), orbitAngle: 0, orbitTime: 0 };
      if (kind === 'artillery') s.duration = Math.max(0.7, dist(start, target) / speed);
      this.shots.push(s); return s;
    }
    threats(id, range) {
      const p = this.players[id];
      return this.shots.filter(s => s.owner !== id && s.hp > 0 && ['uav', 'missile'].includes(s.kind) && s.distance > 100 && dist(p, s) < range);
    }
    clue(id, clue) {
      const clues = this.players[id].intel.clues;
      clues.push({ ...clue, born: this.t, until: this.t + (clue.kind === 'probe' ? 20 : 15), id: ++this.id });
      if (clues.length > 5) clues.shift();
    }
    observeShot(s) {
      if (s.noticed || s.kind === 'sam' || s.distance < (s.kind === 'artillery' ? 95 : 135)) return;
      s.noticed = true;
      const id = 1 - s.owner;
      this.clue(id, { kind: 'direction', x: s.x, y: s.y, angle: s.angle + Math.PI + (this.random() - 0.5) * 0.12,
        spread: s.kind === 'uav' ? 0.58 : 0.4, radius: s.kind === 'uav' ? 690 : 750, source: s.kind });
      this.note(id, s.kind === 'uav' ? '发现敌方无人机 · 已标出反向搜索扇区' : '侦测到敌方弹道 · 来源方向已标记', 'warning');
    }
    scout(s) {
      if (s.state === 'dive' || s.hp <= 0) return;
      const p = this.players[s.owner], enemy = this.players[1 - s.owner];
      const targets = [enemy, ...this.decoys.filter(d => d.owner !== s.owner && d.hp > 0)];
      const seen = targets.filter(a => dist(s, a) < 150).sort((a, b) => dist(s, a) - dist(s, b));
      if (!seen.length) return;
      const a = seen[0], old = p.intel.lock;
      p.intel.lock = { x: a.x, y: a.y, hp: a === enemy ? Math.ceil(enemy.hp) : null, until: this.t + 5, ghostUntil: this.t + 22 };
      if (!old || old.until < this.t || dist(old, a) > 140) {
        p.stats.detections++; this.note(s.owner, '发现热源 · 精确位置确认（5秒）', 'lock');
      }
      if (a === enemy && this.t - enemy.lastSeenNotice > 8) {
        enemy.lastSeenNotice = this.t; this.note(enemy.id, '侦察告警 · 敌方无人机正在扫描你', 'danger');
      }
    }
    intercept(s, defender) {
      if (s.hp <= 0) return;
      s.hp = 0; const p = this.players[defender]; p.stats.intercepted++;
      this.effect(s.x, s.y, 'intercept', defender, 38);
      this.note(defender, (s.kind === 'uav' ? '敌方无人机' : '敌方导弹') + '已被拦截', 'defense');
      if (s.kind === 'uav') {
        this.clue(s.owner, { kind: 'probe', x: s.x, y: s.y, radius: 260, source: 'loss' });
        this.note(s.owner, '无人机被击落 · 附近可能存在敌方防空', 'danger');
      } else this.note(s.owner, '导弹被拦截', 'warning');
    }
    explode(s) {
      const radius = { missile: 95, artillery: 80, uav: 42 }[s.kind];
      this.effect(s.x, s.y, 'blast', s.owner, radius); this.effect(s.x, s.y, 'crater', s.owner, radius * 0.38);
      const p = this.players[1 - s.owner], d = dist(p, s); let damage = 0;
      if (s.kind === 'missile') damage = d < 30 ? 80 : d < 62 ? 60 - (d - 30) / 32 * 15 : d < radius ? 45 : 0;
      if (s.kind === 'artillery') damage = d < 25 ? 40 : d < radius ? 20 - (d - 25) / 55 * 10 : 0;
      if (s.kind === 'uav') damage = d < radius ? 30 : 0;
      if (damage) {
        damage = Math.round(damage); const applied = Math.min(p.hp, damage);
        p.hp = Math.max(0, p.hp - damage); this.players[s.owner].stats.damage += applied;
        this.note(p.id, '遭受打击 −' + damage + ' HP', 'hit');
        this.note(s.owner, '命中敌方 · ' + damage + ' 伤害', 'hit-enemy');
        if (this.players[s.owner].intel.lock && this.players[s.owner].intel.lock.until > this.t && dist(this.players[s.owner].intel.lock, p) < 50) this.players[s.owner].intel.lock.hp = p.hp;
      } else this.note(s.owner, '打击结束 · 未确认命中', 'miss');
      for (const d of this.decoys) if (d.owner !== s.owner && d.hp > 0 && dist(d, s) < radius) {
        d.hp = 0; this.note(d.owner, '热源诱饵被敌方击中', 'defense'); this.note(s.owner, '热源信号消失 · 可能是诱饵', 'warning');
        const lock = this.players[s.owner].intel.lock;
        if (lock && dist(lock, d) < 5) lock.until = this.t;
      }
      s.hp = 0;
    }
    update(dt) {
      if (this.over) return;
      dt = clamp(dt, 0, 0.05); this.t += dt;
      if (this.t < this.countdown) return;
      for (const p of this.players) {
        for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
        p.intel.clues = p.intel.clues.filter(c => c.until > this.t);
        if (p.intel.lock && p.intel.lock.ghostUntil < this.t) p.intel.lock = null;
        if (p.destination) {
          const d = dist(p, p.destination), step = 48 * dt;
          p.angle = Math.atan2(p.destination.y - p.y, p.destination.x - p.x) + Math.PI / 2;
          if (d <= step) { p.x = p.destination.x; p.y = p.destination.y; p.destination = null; this.note(p.id, '机动完成 · 可以再次发射', 'move'); }
          else { p.x += (p.destination.x - p.x) / d * step; p.y += (p.destination.y - p.y) / d * step; }
        }
      }
      if (this.mode === 'ai') this.ai();
      // Newly launched objects may be appended by the AI before this loop.
      for (const s of this.shots.slice()) {
        if (s.hp <= 0) continue;
        s.age += dt;
        if (s.kind === 'sam') {
          const target = this.shots.find(a => a.id === s.targetId && a.hp > 0);
          if (!target) { s.hp = 0; continue; }
          s.tx = target.x; s.ty = target.y;
        }
        const before = point(s.x, s.y);
        if (s.kind === 'artillery') {
          const f = Math.min(1, s.age / s.duration); s.x = s.sx + (s.tx - s.sx) * f; s.y = s.sy + (s.ty - s.sy) * f;
          if (f >= 1) this.explode(s);
        } else if (s.kind === 'uav' && s.state === 'orbit') {
          s.orbitTime += dt; s.orbitAngle += dt * 1.2;
          s.x = clamp(s.tx + Math.cos(s.orbitAngle) * 48, 24, W - 24); s.y = clamp(s.ty + Math.sin(s.orbitAngle) * 48, 24, H - 24);
          s.angle = s.orbitAngle + Math.PI / 2;
          if (s.orbitTime >= 20 || s.age > 38) { s.hp = 0; this.note(s.owner, '无人机滞空结束', 'info'); }
        } else {
          const d = Math.hypot(s.tx - s.x, s.ty - s.y), step = s.speed * dt;
          s.angle = Math.atan2(s.ty - s.y, s.tx - s.x);
          if (d <= Math.max(step, s.kind === 'sam' ? 16 : 2)) {
            s.x = s.tx; s.y = s.ty;
            if (s.kind === 'uav' && s.state !== 'dive') { s.state = 'orbit'; s.orbitAngle = 0; }
            else if (s.kind === 'sam') {
              const target = this.shots.find(a => a.id === s.targetId && a.hp > 0);
              if (target && this.random() < 0.92) this.intercept(target, s.owner);
              else this.note(s.owner, '防空导弹脱靶', 'warning'); s.hp = 0;
            } else this.explode(s);
          } else { s.x += (s.tx - s.x) / d * step; s.y += (s.ty - s.y) / d * step; }
        }
        s.distance += dist(before, s);
        if (s.hp > 0) this.observeShot(s);
        if (s.kind === 'uav') this.scout(s);
        s.trailClock += dt;
        if (s.trailClock >= 0.06) {
          s.trailClock = 0; s.trail.push({ x: s.x, y: s.y, born: this.t, travelled: s.distance });
          if (s.trail.length > (s.kind === 'uav' ? 9 : 18)) s.trail.shift();
        }
        if (s.age > 42) s.hp = 0;
      }
      for (const p of this.players) {
        if (!p.mg || p.destination) continue;
        p.mgClock -= dt;
        if (p.mgClock <= 0) {
          const threats = this.threats(p.id, 140).sort((a, b) => dist(p, a) - dist(p, b));
          if (threats.length) {
            const s = threats[0]; p.mgClock = 0.13;
            this.tracers.push({ id: ++this.id, x: p.x, y: p.y, tx: s.x, ty: s.y, owner: p.id, born: this.t });
            if (this.random() < 0.43) { s.hp -= 10; if (s.hp <= 0) { s.hp = 1; this.intercept(s, p.id); } }
            if (this.t - p.lastSignal > 4) {
              p.lastSignal = this.t; this.clue(1 - p.id, { kind: 'probe', x: s.x, y: s.y, radius: 175, source: 'mg' });
            }
          }
        }
      }
      this.shots = this.shots.filter(s => s.hp > 0);
      this.decoys = this.decoys.filter(d => d.hp > 0 && d.until > this.t);
      this.effects = this.effects.filter(e => e.born + e.life > this.t);
      this.tracers = this.tracers.filter(e => e.born + 0.15 > this.t);
      if (this.players.some(p => p.hp <= 0)) this.finish(this.players[0].hp <= 0 ? (this.players[1].hp <= 0 ? -1 : 1) : 0, '摧毁敌方发射车');
      else if (this.t >= this.limit + this.countdown) this.finish(this.players[0].hp === this.players[1].hp ? -1 : (this.players[0].hp > this.players[1].hp ? 0 : 1), '时间结束 · 按剩余耐久判定');
    }
    finish(winner, reason) { this.over = true; this.winner = winner; this.reason = reason; this.players.forEach(p => { p.mg = false; }); }
    aiTarget(p) {
      const lock = p.intel.lock;
      if (lock && lock.ghostUntil > this.t) {
        const error = lock.until > this.t ? (this.difficulty === 'easy' ? 30 : 10) : 110;
        return point(clamp(lock.x + (this.random() - 0.5) * error, 50, W - 50), clamp(lock.y + (this.random() - 0.5) * error, 50, H - 50));
      }
      const clues = p.intel.clues;
      if (clues.length) {
        const c = clues[clues.length - 1];
        if (c.kind === 'probe') {
          const a = this.random() * TAU, r = this.random() * c.radius * 0.65;
          return point(clamp(c.x + Math.cos(a) * r, 50, W - 50), clamp(c.y + Math.sin(a) * r, 50, H - 50));
        }
        const a = c.angle + (this.random() - 0.5) * c.spread, r = 100 + this.random() * (c.radius - 100);
        return point(clamp(c.x + Math.cos(a) * r, 50, W - 50), clamp(c.y + Math.sin(a) * r, 50, H - 50));
      }
      return point(90 + this.random() * 620, 120 + this.random() * 960);
    }
    ai() {
      const p = this.players[1];
      // Decisions use only this player's intel and visible airborne threats.
      // They never read the other launcher's true position.
      const near = this.threats(1, 140); p.mg = near.length > 0 && !p.destination;
      const incoming = this.threats(1, 300);
      if (!p.destination && p.cd.sam <= 0 && incoming.length && this.difficulty !== 'easy') this.command(1, { type: 'sam' });
      if (this.aiMoveAt && this.t > this.aiMoveAt && !p.destination && p.cd.move <= 0) {
        const a = this.random() * TAU;
        if (p.cd.decoy <= 0 && this.random() > 0.4) this.command(1, { type: 'decoy' });
        this.command(1, { type: 'move', x: p.x + Math.cos(a) * 150, y: p.y + Math.sin(a) * 150 }); this.aiMoveAt = 0;
      }
      if (this.t < this.aiNext || p.destination) return;
      this.aiNext = this.t + (this.difficulty === 'easy' ? 2.8 : 1.3) + this.random() * 1.5;
      const target = this.aiTarget(p), known = p.intel.lock && p.intel.lock.until > this.t;
      if (p.cd.uav <= 0 && (!known || this.random() < 0.3)) this.command(1, { type: 'uav', ...target });
      else if (known && p.cd.missile <= 0) {
        this.command(1, { type: 'missile', ...target }); this.aiMoveAt = this.t + 1.1;
      } else if (known && this.shots.some(s => s.owner === 1 && s.kind === 'uav' && s.state !== 'dive') && this.random() < 0.22) this.command(1, { type: 'dive', ...target });
      else if (p.cd.artillery <= 0 && (p.intel.clues.length || p.intel.lock || this.random() < 0.38)) {
        this.command(1, { type: 'artillery', ...target }); if (this.random() > 0.6) this.aiMoveAt = this.t + 0.9;
      } else if (p.cd.missile <= 0 && p.intel.clues.length && this.random() < 0.45) { this.command(1, { type: 'missile', ...target }); this.aiMoveAt = this.t + 1; }
    }
    snapshot(id) {
      const p = this.players[id], lock = p.intel.lock;
      const enemy = lock && lock.ghostUntil > this.t ? { x: lock.x, y: lock.y, hp: lock.until > this.t ? lock.hp : null,
        precise: lock.until > this.t, left: Math.max(0, lock.until - this.t), ghostLeft: lock.ghostUntil - this.t } : null;
      // Both clients render the same sanitized view. Enemy launch origins,
      // destinations, routes, current HP and cooldowns never enter this view.
      const shots = this.shots.filter(s => s.owner === id || (s.distance > 110 && s.kind !== 'sam') || (s.kind === 'sam' && s.distance > 70)).map(s => {
        const mine = s.owner === id;
        const q = { id: s.id, kind: s.kind, mine, x: s.x, y: s.y, angle: s.angle, state: s.state, age: s.age,
          trail: s.trail.filter(t => mine || t.travelled > 110).map(t => ({ x: t.x, y: t.y })),
          air: s.kind === 'artillery' ? Math.sin(Math.min(1, s.age / s.duration) * Math.PI) : 0 };
        if (mine) { q.tx = s.tx; q.ty = s.ty; q.hp = s.hp; q.orbitLeft = Math.max(0, 20 - s.orbitTime); }
        return q;
      });
      return { version: 1, seed: this.seed, t: this.t, started: this.t >= this.countdown, countdown: Math.max(0, this.countdown - this.t),
        remaining: Math.max(0, this.limit + this.countdown - this.t), over: this.over,
        outcome: this.over ? (this.winner < 0 ? 'draw' : this.winner === id ? 'win' : 'loss') : null,
        reason: this.reason, own: { x: p.x, y: p.y, hp: p.hp, angle: p.angle, destination: p.destination && { ...p.destination },
          cd: { ...p.cd }, mg: p.mg, stats: { ...p.stats } }, enemy, clues: p.intel.clues.map(c => ({ ...c })),
        shots, decoys: this.decoys.filter(d => d.owner === id).map(d => ({ x: d.x, y: d.y, left: d.until - this.t })),
        effects: this.effects.map(e => ({ ...e })),
        // Enemy ground tracers would expose exact launcher coordinates. Only the
        // observer's own muzzle origin is shown; clues carry hostile MG evidence.
        tracers: this.tracers.filter(e => e.owner === id).map(e => ({ ...e })),
        log: p.log.map(e => ({ ...e })), threats: this.threats(id, 300).length,
        nearby: this.threats(id, 140).length };
    }
  }
  root.Blindfire = { Engine, W, H, C, dist, clamp };
  if (typeof module !== 'undefined') module.exports = root.Blindfire;
})(typeof globalThis !== 'undefined' ? globalThis : this);
