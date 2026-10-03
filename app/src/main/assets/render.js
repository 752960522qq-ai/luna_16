(function (root) {
  'use strict';
  const { W, H } = root.Blindfire, TAU = Math.PI * 2;
  const COLORS = { own: '#91dac4', enemy: '#ffb275', red: '#ff8b75', grid: '#758662', ink: '#ced8bd' };
  function seeded(seed) { let n = seed >>> 0; return () => { n = Math.imul(n, 1664525) + 1013904223 | 0; return (n >>> 0) / 4294967296; }; }
  function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  function text(ctx, value, x, y, size = 13, color = COLORS.ink, align = 'left') {
    ctx.font = `${size}px BFUI, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y);
  }
  function makeTerrain(seed) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'), random = seeded(seed ^ 386147);
    ctx.fillStyle = '#1a2922'; ctx.fillRect(0, 0, W, H);
    // Analytic elevation contours are painted once, not per animation frame.
    function elevation(x, y) {
      return Math.sin(x / 160 + 1.5) * 0.7 + Math.cos(y / 180) * 0.8 + Math.sin((x + y) / 240) * 0.7 + Math.cos((x - y) / 115) * 0.3;
    }
    for (let i = 0; i < 26; i++) {
      const x = random() * W, y = random() * H, r = 50 + random() * 170;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, i % 2 ? '#788d4420' : '#0c201a55'); grad.addColorStop(1, '#14211b00');
      ctx.fillStyle = grad; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const step = 22;
    ctx.lineWidth = 0.9;
    for (let level = -2; level < 2.4; level += 0.18) {
      ctx.strokeStyle = Math.round(level * 100) % 3 === 0 ? '#76834c55' : '#6d805336'; ctx.beginPath();
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
        const corners = [[x,y],[x+step,y],[x+step,y+step],[x,y+step]];
        const vals = corners.map(a => elevation(a[0], a[1])), cuts = [];
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          if ((vals[i] < level) !== (vals[j] < level)) {
            const f = (level - vals[i]) / (vals[j] - vals[i]);
            cuts.push([corners[i][0] + (corners[j][0] - corners[i][0]) * f, corners[i][1] + (corners[j][1] - corners[i][1]) * f]);
          }
        }
        for (let i = 0; i + 1 < cuts.length; i += 2) { ctx.moveTo(...cuts[i]); ctx.lineTo(...cuts[i + 1]); }
      }
      ctx.stroke();
    }
    // A river, a road and two settlements provide recognizable landmarks.
    function river() { ctx.beginPath(); ctx.moveTo(-40, 880); ctx.bezierCurveTo(245, 985, 250, 620, 440, 625); ctx.bezierCurveTo(685, 625, 610, 340, 850, 310); }
    ctx.strokeStyle = '#395853'; ctx.lineWidth = 31; river(); ctx.stroke();
    ctx.strokeStyle = '#24423b'; ctx.lineWidth = 23; river(); ctx.stroke();
    ctx.strokeStyle = '#728e7340'; ctx.lineWidth = 1; river(); ctx.stroke();
    ctx.strokeStyle = '#8b8a5c52'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(80, -30); ctx.bezierCurveTo(150, 300, 420, 420, 355, 720); ctx.bezierCurveTo(270, 920, 450, 960, 730, 1230); ctx.stroke();
    ctx.strokeStyle = '#c0b9773c'; ctx.lineWidth = 1; ctx.setLineDash([5, 7]); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 520; i++) {
      const x = random() * W, y = random() * H;
      if (elevation(x, y) < -0.1 || random() < 0.27) {
        const r = 2 + random() * 4; ctx.fillStyle = '#0b201c88'; circle(ctx, x + 2, y + 2, r + 1); ctx.fill();
        ctx.fillStyle = random() > .5 ? '#52694366' : '#294631'; circle(ctx, x, y, r); ctx.fill();
      }
    }
    for (const town of [[236, 370], [462, 982]]) {
      ctx.save(); ctx.translate(...town); ctx.rotate(-0.25);
      for (let i = 0; i < 19; i++) {
        const x = (i % 5) * 20 - 40 + random() * 7, y = Math.floor(i / 5) * 23 - 40;
        ctx.fillStyle = '#0d1b16'; ctx.fillRect(x + 3, y + 4, 13, 18); ctx.fillStyle = '#85876365'; ctx.fillRect(x, y, 12, 16);
        ctx.strokeStyle = '#a2a37b45'; ctx.lineWidth = 1; line(ctx, x + 2, y + 2, x + 10, y + 2);
      }
      ctx.restore();
    }
    text(ctx, '北侧镇', 195, 439, 13, '#9ea98278'); text(ctx, '旧营地', 413, 1047, 13, '#9ea98278'); text(ctx, '松岭', 590, 180, 14, '#9ea98278');
    const shade = ctx.createLinearGradient(0, 0, W, H); shade.addColorStop(0, '#06181219'); shade.addColorStop(.5, '#13221500'); shade.addColorStop(1, '#07140a25');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H); return c;
  }
  class Renderer {
    constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.seed = null; this.terrain = null; this.aim = null; this.damageFlash = 0; }
    resize() {
      const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      if (!rect.width || !rect.height) return;
      if (this.canvas.width !== Math.round(rect.width * dpr) || this.canvas.height !== Math.round(rect.height * dpr)) {
        this.canvas.width = Math.round(rect.width * dpr); this.canvas.height = Math.round(rect.height * dpr);
      }
      this.width = rect.width; this.height = rect.height; this.dpr = dpr;
      this.scale = Math.min((rect.width - 22) / W, (rect.height - 45) / H);
      this.ox = (rect.width - W * this.scale) / 2; this.oy = (rect.height - H * this.scale) / 2 + 3;
    }
    toWorld(clientX, clientY) {
      this.resize(); const rect = this.canvas.getBoundingClientRect();
      const x = (clientX - rect.left - this.ox) / this.scale, y = (clientY - rect.top - this.oy) / this.scale;
      return x >= 0 && y >= 0 && x <= W && y <= H ? { x, y } : null;
    }
    prepare(seed) { if (seed !== this.seed) { this.seed = seed; this.terrain = makeTerrain(seed); } }
    draw(v, selected, realTime) {
      if (!v) return; this.resize(); this.prepare(v.seed);
      const ctx = this.ctx, sc = this.scale, unit = 1 / sc;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillStyle = '#13221c'; ctx.fillRect(0, 0, this.width, this.height);
      ctx.save(); ctx.translate(this.ox, this.oy); ctx.scale(sc, sc);
      ctx.drawImage(this.terrain, 0, 0); ctx.strokeStyle = '#71846366'; ctx.lineWidth = unit * .6; ctx.strokeRect(0, 0, W, H);
      ctx.strokeStyle = '#adc88809'; ctx.lineWidth = unit * .4;
      for (let x = 100; x < W; x += 100) line(ctx, x, 0, x, H);
      for (let y = 100; y < H; y += 100) line(ctx, 0, y, W, y);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      const p = v.own;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(realTime * .26); ctx.fillStyle = '#c1dd9806';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 360, 0, .4); ctx.closePath(); ctx.fill(); ctx.restore();
      // Information regions are geometric evidence, never hidden true coordinates.
      for (const c of v.clues.slice(-3)) {
        const opacity = Math.min(1, (c.until - v.t) / 4); ctx.save(); ctx.globalAlpha = opacity;
        ctx.fillStyle = '#f5b9690b'; ctx.strokeStyle = '#e7aa6155'; ctx.lineWidth = unit * .8; ctx.setLineDash([7 * unit, 5 * unit]);
        if (c.kind === 'direction') {
          ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.radius, c.angle - c.spread, c.angle + c.spread); ctx.closePath(); ctx.fill(); ctx.stroke();
          const r = Math.min(200, c.radius * .38);
          const lx = c.x + Math.cos(c.angle) * r, ly = c.y + Math.sin(c.angle) * r;
          if (lx > 70 && lx < W - 70 && ly > 40 && ly < H - 30 && (!v.enemy || Math.hypot(lx-v.enemy.x,ly-v.enemy.y)>150)) text(ctx, '疑似来源', lx, ly, 9 * unit, '#dfb874ab', 'center');
        } else { circle(ctx, c.x, c.y, c.radius); ctx.fill(); ctx.stroke(); text(ctx, c.source === 'loss' ? '无人机损失区' : '防空活动区', c.x, c.y - c.radius * .5, 9 * unit, '#dfb874ab', 'center'); }
        ctx.restore();
      }
      for (const e of v.effects.filter(e => e.kind === 'crater')) {
        ctx.globalAlpha = Math.min(1, (e.life - (v.t - e.born)) / 4); ctx.fillStyle = '#0a131acc'; circle(ctx, e.x, e.y, e.radius); ctx.fill();
        ctx.strokeStyle = '#7d725330'; ctx.lineWidth = 2; circle(ctx, e.x, e.y, e.radius + 3); ctx.stroke(); ctx.globalAlpha = 1;
      }
      for (const s of v.shots.filter(s => s.mine && s.kind === 'uav' && s.state !== 'dive')) {
        ctx.fillStyle = '#92dac408'; circle(ctx, s.x, s.y, 150); ctx.fill(); ctx.strokeStyle = '#92dac439'; ctx.lineWidth = unit * .7; ctx.setLineDash([3 * unit, 7 * unit]); ctx.stroke(); ctx.setLineDash([]);
        const scan = realTime % 2 / 2 * 150; ctx.strokeStyle = '#92dac424'; circle(ctx, s.x, s.y, scan); ctx.stroke();
      }
      if (selected === 'sam' || v.threats) {
        ctx.strokeStyle = '#8cd6c434'; ctx.lineWidth = unit * .7; ctx.setLineDash([4 * unit, 5 * unit]); circle(ctx, p.x, p.y, 300); ctx.stroke(); ctx.setLineDash([]);
      }
      if (p.mg) { ctx.strokeStyle = '#f5b96966'; ctx.lineWidth = unit; circle(ctx, p.x, p.y, 140); ctx.stroke(); }
      for (const d of v.decoys) {
        ctx.strokeStyle = '#8cd6c476'; ctx.fillStyle = '#8cd6c419'; ctx.lineWidth = unit; ctx.setLineDash([2 * unit, 3 * unit]); circle(ctx, d.x, d.y, 10 * unit); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        text(ctx, '诱饵', d.x, d.y + 20 * unit, 8 * unit, '#96bdaa', 'center');
      }
      if (p.destination) {
        ctx.strokeStyle = '#b6d9a38a'; ctx.lineWidth = unit; ctx.setLineDash([3 * unit, 4 * unit]); line(ctx, p.x, p.y, p.destination.x, p.destination.y); circle(ctx, p.destination.x, p.destination.y, 10 * unit); ctx.stroke(); ctx.setLineDash([]);
      }
      if (v.enemy) this.enemy(v.enemy, v.t, unit);
      this.launcher(p.x, p.y, p.angle, COLORS.own, unit, realTime);
      text(ctx, p.destination ? '机动中' : '我方', p.x, p.y + 23 * unit, 9 * unit, COLORS.own, 'center');
      for (const s of v.shots) this.projectile(s, unit);
      for (const e of v.tracers) { ctx.strokeStyle = '#ffd189'; ctx.lineWidth = unit * .9; line(ctx, e.x, e.y, e.tx, e.ty); }
      for (const e of v.effects.filter(e => e.kind !== 'crater')) {
        const f = (v.t - e.born) / e.life, r = e.radius * Math.min(1, f * 2.4);
        ctx.globalAlpha = Math.max(0, 1 - f); ctx.fillStyle = e.kind === 'blast' ? '#ffd18b22' : '#a7e7dc16'; circle(ctx, e.x, e.y, r); ctx.fill();
        ctx.strokeStyle = e.kind === 'blast' ? '#ffd18b' : '#a7e7dc'; ctx.lineWidth = (1 - f) * 2 * unit; ctx.stroke();
        for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + e.id; line(ctx, e.x + Math.cos(a) * r * .5, e.y + Math.sin(a) * r * .5, e.x + Math.cos(a) * r * 1.2, e.y + Math.sin(a) * r * 1.2); }
        ctx.globalAlpha = 1;
      }
      if (this.aim) {
        const a = this.aim; ctx.strokeStyle = '#a6d9a499'; ctx.lineWidth = unit; ctx.setLineDash([3 * unit, 5 * unit]); line(ctx, p.x, p.y, a.x, a.y); ctx.setLineDash([]);
        circle(ctx, a.x, a.y, selected === 'artillery' ? 80 : selected === 'missile' ? 95 : 10 * unit); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#9aa98966'; ctx.font = `${7 * unit}px monospace`; ctx.textAlign = 'center';
      for (let i = 0; i < 8; i++) ctx.fillText(String.fromCharCode(65 + i), 50 + i * 100, -4 * unit);
      ctx.textAlign = 'right'; for (let i = 0; i < 12; i++) ctx.fillText(String(i + 1).padStart(2, '0'), -3 * unit, 54 + i * 100);
      ctx.restore();
      if (this.damageFlash > realTime) { ctx.strokeStyle = '#ff7b6b55'; ctx.lineWidth = 7; ctx.strokeRect(0, 0, this.width, this.height); }
    }
    launcher(x, y, angle, color, unit, t) {
      const ctx = this.ctx; ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.lineWidth = unit;
      circle(ctx, 0, 0, (17 + Math.sin(t * 2) * 2) * unit); ctx.globalAlpha = .25; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.rotate(angle); ctx.scale(unit, unit); ctx.fillStyle = '#111e1a'; ctx.fillRect(-6, -9, 12, 18); ctx.fillStyle = color; ctx.fillRect(-4, -7, 8, 14);
      ctx.fillStyle = '#33473c'; ctx.fillRect(-3, -2, 6, 7); ctx.fillStyle = '#cce9d6'; ctx.fillRect(-2, -6, 4, 3);
      ctx.strokeStyle = color; ctx.lineWidth = 1; line(ctx, -8, -6, -8, 6); line(ctx, 8, -6, 8, 6); line(ctx, 0, -8, 0, -15); ctx.restore();
    }
    enemy(e, t, unit) {
      const ctx = this.ctx, x = e.x, y = e.y; ctx.save(); ctx.strokeStyle = COLORS.red; ctx.fillStyle = '#ff8b7517'; ctx.lineWidth = unit;
      if (e.precise) {
        circle(ctx, x, y, 17 * unit); ctx.fill(); ctx.stroke();
        const r = (22 + Math.sin(t * 4) * 2) * unit;
        for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; line(ctx, x + Math.cos(a) * (r - 5 * unit), y + Math.sin(a) * (r - 5 * unit), x + Math.cos(a) * (r + 5 * unit), y + Math.sin(a) * (r + 5 * unit)); }
        ctx.fillStyle = COLORS.red; circle(ctx, x, y, 3 * unit); ctx.fill();
        text(ctx, `热源 / ${e.left.toFixed(1)}s`, x, y - 31 * unit, 9 * unit, COLORS.red, 'center');
        if (e.hp !== null) text(ctx, `${e.hp} HP`, x, y + 30 * unit, 8 * unit, '#e6b7a2', 'center');
      } else {
        ctx.globalAlpha = Math.min(.65, e.ghostLeft / 12); ctx.setLineDash([3 * unit, 4 * unit]); circle(ctx, x, y, (22 + (22 - e.ghostLeft) * .6) * unit); ctx.stroke(); ctx.setLineDash([]);
        text(ctx, '旧位置 · 已过期', x, y - 30 * unit, 8 * unit, COLORS.red, 'center');
      }
      ctx.restore();
    }
    projectile(s, unit) {
      const ctx = this.ctx, color = s.mine ? COLORS.own : COLORS.enemy;
      if (s.trail.length > 1) {
        for (let i = 1; i < s.trail.length; i++) {
          ctx.globalAlpha = .1 + i / s.trail.length * .55; ctx.strokeStyle = color; ctx.lineWidth = unit * (s.kind === 'missile' ? 1.8 : .8);
          line(ctx, s.trail[i-1].x, s.trail[i-1].y, s.trail[i].x, s.trail[i].y);
        }
        ctx.globalAlpha = 1;
      }
      if (s.kind === 'artillery') { ctx.fillStyle = '#07171288'; circle(ctx, s.x, s.y, 3 * unit); ctx.fill(); }
      ctx.save(); ctx.translate(s.x, s.y - (s.air || 0) * 45); ctx.rotate(s.angle); ctx.scale(unit, unit); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.3;
      if (s.kind === 'uav') {
        line(ctx, -6, -6, 6, 6); line(ctx, 6, -6, -6, 6);
        for (const a of [[-6,-6],[6,-6],[-6,6],[6,6]]) { circle(ctx, a[0], a[1], 3); ctx.stroke(); }
        ctx.fillRect(-3, -2, 7, 4); ctx.fillStyle = '#e1f5ce'; ctx.fillRect(3, -1, 2, 2);
      } else if (s.kind === 'artillery') { ctx.fillStyle = '#ffdca3'; circle(ctx, 0, 0, 2.8); ctx.fill(); }
      else {
        ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -2.5); ctx.lineTo(-2, 0); ctx.lineTo(-4, 2.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffdb98'; ctx.beginPath(); ctx.moveTo(-4, -1.5); ctx.lineTo(-11, 0); ctx.lineTo(-4, 1.5); ctx.fill();
      }
      ctx.restore();
    }
  }
  let menuTerrain;
  function drawMenu(canvas, t) {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), ctx = canvas.getContext('2d');
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
    if (!menuTerrain) menuTerrain = makeTerrain(20261003);
    const w = rect.width, h = rect.height; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#101a19'; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = .6; ctx.drawImage(menuTerrain, 0, 0, w, h); ctx.globalAlpha = 1;
    const cx = w * .78, cy = h * .38, r = w * .43;
    ctx.strokeStyle = '#b2cf7652'; ctx.lineWidth = .7;
    for (let i = 1; i < 5; i++) { circle(ctx, cx, cy, r * i / 4); ctx.stroke(); }
    ctx.setLineDash([2, 7]); line(ctx, cx-r, cy, cx+r, cy); line(ctx, cx, cy-r, cx, cy+r); ctx.setLineDash([]);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * .22); ctx.fillStyle = '#b9db7330'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, -.36, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    const dx = cx + Math.cos(t * .17 + .8) * r * .67, dy = cy + Math.sin(t * .17 + .8) * r * .67;
    ctx.strokeStyle = '#c5db89'; ctx.lineWidth = 1; line(ctx, dx-4, dy-4, dx+4, dy+4); line(ctx, dx+4, dy-4, dx-4, dy+4);
    for (const a of [[-5,-5],[5,-5],[-5,5],[5,5]]) { circle(ctx, dx+a[0], dy+a[1], 2.7); ctx.stroke(); }
    ctx.strokeStyle = '#e9b66388'; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(w*.17, h*.65); ctx.bezierCurveTo(w*.5,h*.53,w*.52,h*.4,w*.69,h*.36); ctx.stroke(); ctx.setLineDash([]);
    text(ctx, '搜索信号中', cx - 32, cy + r + 16, 8, '#afbf886a', 'center');
    const fade = ctx.createLinearGradient(0, 0, 0, h); fade.addColorStop(0, '#101a1919'); fade.addColorStop(.5, '#101a1933'); fade.addColorStop(.72, '#101a19ce'); fade.addColorStop(1, '#101a19fa'); ctx.fillStyle = fade; ctx.fillRect(0, 0, w, h);
  }
  root.BlindfireRenderer = { Renderer, drawMenu, resetFonts: () => { menuTerrain = null; } };
})(window);
