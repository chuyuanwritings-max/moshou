// 《墨守》0.4「你当机关龙」· 主程序：手指、画面、特效、声音、结算和局外升级。
// 规则在 sim.js，画法在 draw.js，平台差别只在 platform.js。
const PF = require('./platform.js');
const C = require('./config.js');
const S = require('./sim.js');
const D = require('./draw.js');
const { clamp, easeOutBack, roundRect, bigText, mix } = require('./util.js');

const SAVE = 'moshou_ram_v1';
const meta = Object.assign({ coins: 0, startLv: 0, level: 0, best: 0, runs: 0, muted: false, seenHint: false }, PF.load(SAVE) || {});
const saveMeta = () => PF.save(SAVE, meta);
PF.setMuted(meta.muted);

const view = PF.setup(onTouch);
const { ctx, width: W, height: H, dpr } = view;
const F = C.FIELD;
const scale = Math.min(W / F.w, H / F.h);
const ox = (W - F.w * scale) / 2;
const oy = (H - F.h * scale) / 2;

const G = {
  mode: 'play', // play | end | result
  st: null,
  fx: [],
  pops: [],
  shake: 0,
  flash: 0,
  flashColor: '#fff',
  hitstop: 0,
  banner: 0,
  drag: null,
  endT: 0,
  result: null,
  buttons: [],
  sndCd: {},
  speed: 1, // 测试用：一帧跑几步
  bot: null, // 测试用：自动玩
  botMem: {},
  log: [],
  hintT: 0,
  resultAt: 0,
  t: 0,
};

function snd(name, gapMs, vol, rate) {
  const now = PF.now();
  if (gapMs && G.sndCd[name] && now - G.sndCd[name] < gapMs) return;
  G.sndCd[name] = now;
  PF.sound(name, vol, rate);
}

function startRun() {
  const seed = ((PF.now() % 1000000007) ^ (meta.runs * 2654435761)) >>> 0;
  G.st = S.newRun(meta.level, meta, seed || 1);
  G.mode = 'play';
  G.fx.length = 0;
  G.pops.length = 0;
  G.result = null;
  G.banner = 1.6;
  G.drag = null;
  G.botMem = {};
  G.hintT = meta.seenHint ? 0 : 4;
}

// —— 坐标：世界 wy → 屏幕 y ——
const sy = (wy) => C.HEAD_Y - (wy - G.st.head.wy);

// —— 手指 ——
function toField(px, py) {
  return [(px - ox) / scale, (py - oy) / scale];
}
function onTouch(type, id, px, py) {
  const [fx, fy] = toField(px, py);
  if (type === 'down') {
    if (G.mode === 'result') {
      for (const b of G.buttons) {
        if (fx >= b.x && fx <= b.x + b.w && fy >= b.y && fy <= b.y + b.h) press(b.id);
      }
      return;
    }
    if (fx < 40 && fy < 40) {
      meta.muted = !meta.muted;
      PF.setMuted(meta.muted);
      saveMeta();
      return;
    }
    if (G.mode === 'play') G.drag = { id, fx0: fx, hx0: G.st.targetX };
  } else if (type === 'move') {
    if (G.drag && G.drag.id === id && G.mode === 'play') {
      G.st.targetX = clamp(G.drag.hx0 + (fx - G.drag.fx0) * 1.15, 14, F.w - 14);
      if (Math.abs(fx - G.drag.fx0) > 20 && !meta.seenHint) {
        meta.seenHint = true;
        saveMeta();
      }
    }
  } else if (type === 'up') {
    if (G.drag && G.drag.id === id) G.drag = null;
  }
}

function press(id) {
  if (id === 'again' || id === 'next') {
    snd('tap');
    startRun();
  } else if (id === 'up') {
    const lv = meta.startLv;
    if (lv >= C.UPGRADES.startLen.max) return;
    const cost = C.UPGRADES.startLen.cost(lv);
    if (meta.coins < cost) {
      snd('alarm', 200, 0.3);
      return;
    }
    meta.coins -= cost;
    meta.startLv++;
    saveMeta();
    snd('upgrade');
    G.result.upFlash = 0.6;
  }
}

// —— 特效 ——
function chunks(x, y, n, col, power) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
    const v = (80 + Math.random() * 180) * (power || 1);
    G.fx.push({ k: 'chunk', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, t: 0, s: 3 + Math.random() * 5, col, rot: Math.random() * 6 });
  }
}
function puff(x, y, n, col) {
  for (let i = 0; i < n; i++) G.fx.push({ k: 'puff', x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 40, life: 0.5 + Math.random() * 0.3, t: 0, s: 6 + Math.random() * 6, col: col || 'rgba(244,239,230,0.7)' });
}
function sparks(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 120 + Math.random() * 200;
    G.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.2, t: 0, col: col || '#ffd65a' });
  }
}
function pop(text, x, y, col, size) {
  G.pops.push({ text, x, y, col: col || '#fff8e6', size: size || 18, t: 0, life: 0.7 });
}
function dropCar(st) {
  const segs = S.segments(st, st.len + 1);
  const p = segs[segs.length - 1];
  if (!p) return;
  G.fx.push({ k: 'car', x: p.x, y: sy(p.wy), vx: (Math.random() - 0.5) * 120, vy: -60, life: 0.6, t: 0, rot: 0, vr: (Math.random() - 0.5) * 12 });
}

function handleEvents(st) {
  const ch = S.chapter(st);
  for (const e of st.events) {
    const y = e.wy !== undefined ? sy(e.wy) : 0;
    if (e.t === 'chew') {
      const by = y + S.HALF;
      chunks(e.hx !== undefined ? e.hx : e.x, by, e.kind === 'gate' ? 3 : 2, e.kind === 'gate' ? '#a0302a' : ch.brick[1], 0.7);
      if (e.combo % 3 === 0) puff(e.hx, by + 6, 1);
      dropCar(st);
      snd('hit', 35, 0.35, 0.9 + Math.min(e.combo, 30) * 0.035);
      G.shake = Math.max(G.shake, e.kind === 'gate' ? 3 : 1.6);
      PF.vibrate(false);
    } else if (e.t === 'bump') {
      snd('thud', 80, 0.5);
      G.shake = Math.max(G.shake, 3);
    } else if (e.t === 'break') {
      if (e.kind === 'gate') {
        chunks(F.w / 2, y, 40, '#a0302a', 2);
        chunks(F.w / 2, y, 30, '#7d6a55', 2);
        sparks(F.w / 2, y, 30);
        G.flash = 0.5;
        G.flashColor = '#fff3c4';
        G.shake = 16;
        G.hitstop = 0.12;
        snd('boom', 0, 0.8);
      } else {
        chunks(e.x, y, 12, ch.brick[1], 1.2);
        chunks(e.x, y, 5, ch.brick[2], 1);
        puff(e.x, y + 10, 4);
        G.shake = Math.max(G.shake, e.how === 'bomb' ? 4 : 5);
        G.hitstop = Math.max(G.hitstop, 0.035);
        pop('+' + e.n0 * 10, e.x, y - 10, '#ffd65a', 16);
        if (e.kind === 'tower') {
          sparks(e.x, y, 14);
          snd('clang', 60, 0.6);
          pop('拆了弩塔！', e.x, y - 34, '#ffb74a', 16);
        }
        snd(e.how === 'shield' ? 'crit' : 'break', 50, 0.65);
      }
    } else if (e.t === 'part') {
      sparks(e.x, y, 6, '#f3d27a');
      pop('+' + e.n, e.x, y - 16, '#9dff7a', 20);
      snd('coin', 40, 0.5, 1 + Math.min(st.len, 60) * 0.006);
    } else if (e.t === 'power') {
      const name = { shield: '铜甲！撞墙不掉节', magnet: '磁石！零件自己飞来' }[e.kind];
      pop(name, F.w / 2, C.HEAD_Y - 90, '#ffd65a', 20);
      snd('chest', 0, 0.6);
    } else if (e.t === 'bomb') {
      G.flash = 0.35;
      G.flashColor = '#ffb04a';
      G.shake = 10;
      sparks(e.x, y, 24, '#ff9a3a');
      pop('火药桶！炸掉 ' + e.cnt + ' 块', F.w / 2, C.HEAD_Y - 90, '#ffb04a', 20);
      snd('blast', 0, 0.8);
    } else if (e.t === 'fire') {
      snd('shoot', 120, 0.25, 0.7);
    } else if (e.t === 'boltHit') {
      G.flash = 0.18;
      G.flashColor = '#ff4a2a';
      G.shake = Math.max(G.shake, 5);
      sparks(e.x, y, 10, '#ffe0a0');
      pop('-1', e.x + 14, y - 10, '#ff6a4a', 20);
      dropCar(st);
      snd('clang', 50, 0.6);
      PF.vibrate(true);
    } else if (e.t === 'deflect') {
      sparks(e.x, y, 8, '#fff');
      snd('clang', 50, 0.4, 1.6);
    } else if (e.t === 'win') {
      G.mode = 'end';
      G.endT = 1.2;
      snd('win', 0, 0.7);
    } else if (e.t === 'lose') {
      G.mode = 'end';
      G.endT = 0.75;
      G.flash = 0.3;
      G.flashColor = '#000';
      snd('lose', 0, 0.6);
    }
  }
  st.events.length = 0;
}

function finish() {
  const st = G.st;
  const win = st.mode === 'win';
  const coins = Math.round(st.score / 40) + st.parts;
  meta.coins += coins;
  meta.runs++;
  if (win) meta.level++;
  meta.best = Math.max(meta.best, meta.level);
  saveMeta();
  G.log.push({ level: st.lv.idx, win, t: st.t, short: st.short, len: st.len, maxLen: st.maxLen });
  const prog = clamp(st.head.wy / st.endWY, 0, 1);
  const left = st.rows.filter((w) => w > st.head.wy).length;
  G.result = { win, coins, short: st.short, prog, left, lv: st.lv.idx, gate: st.gate.n0, t: 0, upFlash: 0, maxLen: st.maxLen };
  G.mode = 'result';
  G.resultAt = PF.now();
}

// —— 每帧 ——
let last = PF.now();
let acc = 0;
function frame() {
  const now = PF.now();
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.t += dt;
  const st = G.st;
  if (G.hitstop > 0) {
    G.hitstop -= dt;
    dt *= 0.15;
  }
  if (G.mode === 'play' || G.mode === 'end') {
    acc += dt * G.speed;
    let n = 0;
    while (acc >= 1 / 60 && n++ < 40) {
      acc -= 1 / 60;
      if (G.mode === 'play') {
        if (G.bot) st.targetX = S.botThink(st, G.bot, G.botMem);
        S.step(st, 1 / 60);
        handleEvents(st);
      }
    }
    if (G.mode === 'end') {
      G.endT -= dt * G.speed;
      if (G.endT <= 0) finish();
    }
  }
  if (G.bot && G.mode === 'result' && PF.now() - G.resultAt > 300) press('again');
  stepFx(dt);
  if (G.banner > 0) G.banner -= dt;
  if (G.hintT > 0) G.hintT -= dt;
  if (G.result) {
    G.result.t += dt;
    if (G.result.upFlash > 0) G.result.upFlash -= dt;
  }
  render();
  PF.nextFrame(frame);
}

function stepFx(dt) {
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i];
    f.t += dt;
    if (f.t >= f.life) {
      G.fx.splice(i, 1);
      continue;
    }
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.k === 'chunk' || f.k === 'car') f.vy += 520 * dt;
    if (f.k === 'puff') f.vx *= 0.96;
    if (f.k === 'car') f.rot += f.vr * dt;
  }
  for (let i = G.pops.length - 1; i >= 0; i--) {
    const p = G.pops[i];
    p.t += dt;
    p.y -= 30 * dt;
    if (p.t >= p.life) G.pops.splice(i, 1);
  }
  G.shake *= Math.pow(0.002, dt);
  if (G.shake < 0.2) G.shake = 0;
  if (G.flash > 0) G.flash -= dt;
}

// —— 画 ——
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#120d0a';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, F.w, F.h);
  ctx.clip();
  const sh = G.shake;
  ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
  drawWorld();
  ctx.restore();
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  drawHud();
  if (G.mode === 'result') drawResult();
  ctx.restore();
}

function drawWorld() {
  const st = G.st;
  const ch = S.chapter(st);
  const t = G.t;
  D.drawGround(ctx, ch, st.head.wy);
  const vis = (wy, m) => {
    const y = sy(wy);
    return y > -m && y < F.h + m;
  };
  for (const f of st.fences) {
    if (vis((f.wy0 + f.wy1) / 2, 160)) D.drawFence(ctx, f.x, sy(f.wy1), sy(f.wy0));
  }
  for (const it of st.items) if (it.alive && vis(it.wy, 40)) D.drawItem(ctx, it, sy(it.wy), t);
  for (const b of st.blocks) {
    if (!b.alive || !vis(b.wy, 200)) continue;
    const chewing = st.chewing === b && st.mode === 'play';
    D.drawBlock(ctx, ch, b, sy(b.wy), t, chewing ? 2.5 : 0);
  }
  for (const bo of st.bolts) D.drawBolt(ctx, bo.x, sy(bo.wy));
  drawDragon(st, t);
  for (const f of G.fx) drawFx(f);
  drawLenTag(st);
  for (const p of G.pops) {
    ctx.save();
    ctx.globalAlpha = clamp(1 - (p.t / p.life - 0.6) / 0.4, 0, 1);
    const k = easeOutBack(Math.min(1, p.t / 0.18));
    bigText(ctx, p.text, p.x, p.y, p.size * k, p.col, D.LINE);
    ctx.restore();
  }
  if (G.flash > 0) {
    ctx.fillStyle = G.flashColor;
    ctx.globalAlpha = Math.min(0.5, G.flash);
    ctx.fillRect(0, 0, F.w, F.h);
    ctx.globalAlpha = 1;
  }
}

function drawDragon(st, t) {
  if (st.len <= 0 && G.mode !== 'play') return;
  const segs = S.segments(st, 60);
  const pts = segs.map((p) => ({ x: p.x, y: sy(p.wy) }));
  // 车厢之间的铁链
  ctx.strokeStyle = D.LINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  const hurt = G.flash > 0 && G.flashColor === '#ff4a2a' ? G.flash * 4 : 0;
  for (let i = pts.length - 1; i >= 1; i--) {
    const p = pts[i];
    const q = pts[i - 1];
    D.drawCar(ctx, p.x, p.y, Math.atan2(q.x - p.x, p.y - q.y), i, t, hurt);
    // 小烟囱冒汽
    if (i % 3 === 1 && Math.random() < 0.03) puff(p.x, p.y - 4, 1, 'rgba(240,236,228,0.8)');
  }
  const hd = pts[0];
  const nx = pts[1] || { x: hd.x, y: hd.y + 10 };
  D.drawHead(ctx, hd.x, hd.y, Math.atan2(hd.x - nx.x, nx.y - hd.y), st.chewing ? 1 : 0, t, st.shield);
  if (st.magnet > 0) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#ff6a4a';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(hd.x, hd.y, 60 + (t * 60) % 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// 头上的节数（画在碎石上面，永远看得清）
function drawLenTag(st) {
  if (st.len <= 0) return;
  const x = st.head.x;
  const y = C.HEAD_Y - 36;
  const danger = st.chewing && st.chewing.n >= st.len;
  ctx.fillStyle = danger ? 'rgba(120,20,10,0.8)' : 'rgba(20,14,10,0.6)';
  roundRect(ctx, x - 20, y - 13, 40, 26, 9);
  ctx.fill();
  bigText(ctx, String(st.len), x, y, 20, danger ? '#ff8a6a' : '#fff8e6', D.LINE);
}

function drawFx(f) {
  const a = 1 - f.t / f.life;
  ctx.save();
  ctx.globalAlpha = clamp(a * 1.4, 0, 1);
  if (f.k === 'chunk') {
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot + f.t * 8);
    ctx.fillStyle = f.col;
    ctx.strokeStyle = D.LINE;
    ctx.lineWidth = 1;
    ctx.fillRect(-f.s / 2, -f.s / 2, f.s, f.s);
    ctx.strokeRect(-f.s / 2, -f.s / 2, f.s, f.s);
  } else if (f.k === 'puff') {
    ctx.fillStyle = f.col;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.s * (1 + f.t * 2), 0, Math.PI * 2);
    ctx.fill();
  } else if (f.k === 'spark') {
    ctx.strokeStyle = f.col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(f.x - f.vx * 0.04, f.y - f.vy * 0.04);
    ctx.stroke();
  } else if (f.k === 'car') {
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    ctx.fillStyle = D.BRASS;
    ctx.strokeStyle = D.LINE;
    ctx.lineWidth = 1.5;
    roundRect(ctx, -10, -10, 20, 20, 5);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawHud() {
  const st = G.st;
  const ch = S.chapter(st);
  // 顶栏：第几关 · 地方 + 离城门多远
  ctx.fillStyle = 'rgba(20,14,10,0.72)';
  ctx.fillRect(0, 0, F.w, 46);
  bigText(ctx, '第' + (st.lv.idx + 1) + '关 · ' + ch.name, 52, 16, 14, '#fff8e6', D.LINE, 'left');
  const prog = clamp(st.head.wy / (st.endWY - 60), 0, 1);
  const bx = 52;
  const bw = F.w - 120;
  ctx.fillStyle = '#3a2c20';
  roundRect(ctx, bx, 30, bw, 8, 4);
  ctx.fill();
  ctx.fillStyle = D.BRASS;
  roundRect(ctx, bx, 30, Math.max(8, bw * prog), 8, 4);
  ctx.fill();
  // 终点小城门
  ctx.fillStyle = D.RED;
  ctx.strokeStyle = D.LINE;
  ctx.lineWidth = 1.5;
  roundRect(ctx, bx + bw + 4, 24, 18, 18, 3);
  ctx.fill();
  ctx.stroke();
  bigText(ctx, String(st.gate.n), bx + bw + 40, 33, 14, '#ffd65a', D.LINE);
  // 声音开关
  bigText(ctx, meta.muted ? '静' : '♪', 22, 22, 16, '#fff8e6', D.LINE);
  // 道具剩余时间
  let ix = F.w - 30;
  for (const k of ['shield', 'magnet']) {
    if (st[k] > 0) {
      D.drawPowerIcon(ctx, k, ix, 70, 0.8);
      bigText(ctx, Math.ceil(st[k]) + '', ix, 92, 12, '#fff8e6', D.LINE);
      ix -= 36;
    }
  }
  // 开局横幅
  if (G.banner > 0 && G.mode === 'play') {
    const k = easeOutBack(clamp((1.6 - G.banner) / 0.3, 0, 1));
    ctx.save();
    ctx.globalAlpha = clamp(G.banner / 0.3, 0, 1);
    ctx.fillStyle = 'rgba(20,14,10,0.78)';
    ctx.fillRect(0, 230, F.w, 92);
    bigText(ctx, ch.name + ' · 冲破城门！', F.w / 2, 262, 26 * k, '#ffd65a', D.LINE);
    bigText(ctx, '城门 ' + st.gate.n0 + ' · 你有 ' + st.len + ' 节', F.w / 2, 298, 16, '#fff8e6', D.LINE);
    ctx.restore();
  }
  // 第一次玩：教一下
  if (G.hintT > 0 && G.mode === 'play' && G.banner <= 0) {
    ctx.save();
    ctx.globalAlpha = clamp(G.hintT, 0, 1);
    const hx = F.w / 2 + Math.sin(G.t * 3) * 60;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(hx, 640, 16, 0, Math.PI * 2);
    ctx.fill();
    bigText(ctx, '按住左右拖 · 吃零件变长 · 撞数字小的砖', F.w / 2, 600, 14, '#fff8e6', D.LINE);
    ctx.restore();
  }
}

function button(id, x, y, w, h, label, col, sub) {
  G.buttons.push({ id, x, y, w, h });
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, x + 3, y + 5, w, h, 14);
  ctx.fill();
  ctx.fillStyle = col;
  ctx.strokeStyle = D.LINE;
  ctx.lineWidth = 2.5;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.stroke();
  bigText(ctx, label, x + w / 2, y + h / 2 - (sub ? 8 : 0), sub ? 22 : 26, '#fff8e6', D.LINE);
  if (sub) bigText(ctx, sub, x + w / 2, y + h / 2 + 16, 13, '#ffe9b0', D.LINE);
}

function drawResult() {
  const r = G.result;
  G.buttons.length = 0;
  ctx.fillStyle = 'rgba(12,8,6,0.84)';
  ctx.fillRect(0, 0, F.w, F.h);
  const k = easeOutBack(clamp(r.t / 0.3, 0, 1));
  if (r.win) {
    bigText(ctx, '城门破了！', F.w / 2, 200, 44 * k, '#ffd65a', D.LINE);
    bigText(ctx, '最长 ' + r.maxLen + ' 节', F.w / 2, 252, 18, '#fff8e6', D.LINE);
  } else {
    const title = r.short > 0 ? '差 ' + r.short + ' 节！' : '龙被拆光了';
    bigText(ctx, title, F.w / 2, 200, 44 * k, '#ff8a5a', D.LINE);
    bigText(ctx, '离城门还有 ' + r.left + ' 排', F.w / 2, 252, 18, '#fff8e6', D.LINE);
    ctx.fillStyle = '#3a2c20';
    roundRect(ctx, 70, 270, F.w - 140, 8, 4);
    ctx.fill();
    ctx.fillStyle = D.BRASS;
    roundRect(ctx, 70, 270, Math.max(8, (F.w - 140) * r.prog), 8, 4);
    ctx.fill();
  }
  D.drawGear(ctx, F.w / 2 - 78, 312, 12, G.t);
  bigText(ctx, '+' + r.coins + '   共 ' + meta.coins, F.w / 2 + 14, 312, 20, '#ffd65a', D.LINE);
  button(r.win ? 'next' : 'again', 60, 360, F.w - 120, 78, r.win ? '下一关' : '再来！', r.win ? '#3f8a3a' : '#c8402c');
  const lv = meta.startLv;
  const max = lv >= C.UPGRADES.startLen.max;
  const cost = C.UPGRADES.startLen.cost(lv);
  const can = !max && meta.coins >= cost;
  button('up', 80, 462, F.w - 160, 66, max ? '起步已满' : '起步 +1 节', can ? '#b07a1e' : '#5a4a3a', max ? '' : '现在 ' + (C.START_LEN + lv) + ' 节 · 要 ' + cost + ' 铜钱');
  if (r.upFlash > 0) {
    ctx.save();
    ctx.globalAlpha = r.upFlash;
    bigText(ctx, '起步变长了！', F.w / 2, 560, 22, '#9dff7a', D.LINE);
    ctx.restore();
  }
}

startRun();
PF.exposeForTest('__ram', { G, meta, S, C, startRun, press, saveMeta, scale, ox, oy });
PF.nextFrame(frame);
