// 《墨守》（打龙塔防，暂名）原型 0.1 · 主程序：画面切换、手指、局外（金币 / 弩机 / 机关伙伴）、特效和声音。
// 规则在 sim.js，画法在 draw.js，平台差别只在 platform.js。
const PF = require('./platform.js');
const C = require('./config.js');
const S = require('./sim.js');
const D = require('./draw.js');
const { clamp, easeOutBack, roundRect, bigText, mix } = require('./util.js');

const SAVE = 'moshou_v1';
const meta = Object.assign(
  { gold: 0, bowLv: 0, buddies: [], buddy: null, level: 0, best: 0, runs: 0, seenHint: false, muted: false },
  PF.load(SAVE) || {}
);
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
  bg: null,
  t: 0,
  fx: [],
  shake: 0,
  hitstop: 0,
  flash: 0,
  flashColor: '#fff',
  recoil: 0,
  targetX: F.w / 2,
  drag: null,
  buttons: [],
  result: null,
  endTimer: 0,
  banner: 0,
  hint: false,
  hintMoved: 0,
  heartCd: 0,
  sndCd: {},
  speed: 1, // 测试用：一帧跑几步
  bot: null, // 测试用：自动玩
  log: [], // 每局记录（测试量数用）
  timing: { loseAt: 0, restartAt: 0 },
  resultAt: 0,
};

// —— 声音（同一种声音太密时跳过）——
function snd(name, gapMs, vol) {
  const now = PF.now();
  if (gapMs && G.sndCd[name] && now - G.sndCd[name] < gapMs) return;
  G.sndCd[name] = now;
  PF.sound(name, vol);
}

// —— 开一局 ——
function startRun() {
  const seed = ((PF.now() % 1000000007) ^ (meta.runs * 2654435761)) >>> 0;
  G.st = S.newRun(meta.level, meta, seed || 1);
  G.bg = makeBg(G.st);
  G.mode = 'play';
  G.result = null;
  G.fx.length = 0;
  G.targetX = G.st.px;
  G.banner = 1.3;
  G.hint = meta.level === 0 && !meta.seenHint;
  G.hintMoved = 0;
  G.runStartReal = PF.now();
  G.timing.restartAt = PF.now();
  meta.runs++;
  saveMeta();
}

function makeBg(st) {
  const k = scale * dpr;
  const c = PF.createOffscreen(Math.ceil(F.w * k), Math.ceil(F.h * k));
  const x = c.getContext('2d');
  x.setTransform(k, 0, 0, k, 0, 0);
  D.drawBackground(x, st.path, st.level);
  return c;
}

// —— 一局结束 ——
function endRun(win) {
  const st = G.st;
  const r = {
    win,
    level: st.level,
    left: st.segs.length,
    total: st.total,
    kills: st.kills,
    gold: st.gold,
    near: !win && !!st.nearMiss,
    doubled: false,
    newBuddy: null,
    t: st.t,
  };
  meta.gold += st.gold;
  if (win) {
    const nb = C.BUDDIES.find((b) => b.unlockLevel === st.level && meta.buddies.indexOf(b.id) < 0);
    if (nb) {
      meta.buddies.push(nb.id);
      meta.buddy = nb.id;
      r.newBuddy = nb;
    }
    meta.level = st.level + 1;
    meta.best = Math.max(meta.best, meta.level);
  }
  saveMeta();
  G.log.push({ level: st.level, win, t: st.t, left: r.left, total: r.total, near: r.near, real: (PF.now() - G.runStartReal) / 1000, ads: st.adsUsed });
  G.result = r;
  G.mode = 'result';
  G.resultAt = PF.now();
}

// —— 特效 ——
function shards(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 60 + Math.random() * 180;
    G.fx.push({ k: 'sq', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.3, max: 0.8, s: 2 + Math.random() * 3, c: col || (Math.random() < 0.5 ? D.P.brass : D.P.brassHi) });
  }
}
function puff(x, y, n, r) {
  for (let i = 0; i < n; i++) {
    G.fx.push({ k: 'puff', x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 0.6, max: 0.6, s: (r || 6) + Math.random() * 4 });
  }
}
function text(x, y, s, size, col, life) {
  G.fx.push({ k: 'txt', x, y, vx: 0, vy: -40, life: life || 0.6, max: life || 0.6, s, size, c: col || '#fff' });
}
function ring(x, y, r, col) {
  G.fx.push({ k: 'ring', x, y, r, life: 0.3, max: 0.3, c: col });
}

function handleEvents(st) {
  for (const e of st.events) {
    switch (e.t) {
      case 'shoot':
        G.recoil = 1;
        snd('shoot', 70, 0.35);
        break;
      case 'hit':
        if (e.crit) {
          const now = PF.now();
          if (!G.critTextAt || now - G.critTextAt > 160) {
            G.critTextAt = now;
            text(e.x, e.y - 14, e.dmg + '!', 15, '#fff27a', 0.5);
          }
          snd('crit', 60);
        } else {
          snd('hit', 45, 0.4);
        }
        break;
      case 'kill':
        shards(e.x, e.y, e.chest ? 14 : 8, e.chest ? null : null);
        puff(e.x, e.y, 2);
        G.shake = Math.max(G.shake, 1.5);
        snd('break', 35);
        break;
      case 'chest':
        G.hitstop = Math.max(G.hitstop, 0.08);
        G.shake = Math.max(G.shake, 3);
        G.fx.push({ k: 'rays', x: e.x, y: e.y, life: 0.5, max: 0.5 });
        shards(e.x, e.y, 10, D.P.gold);
        snd('chest');
        PF.vibrate(false);
        break;
      case 'blast':
        ring(e.x, e.y, e.r, '#ffa0d8');
        snd('blast', 80, 0.5);
        break;
      case 'combo':
        G.fx.push({ k: 'combo', x: F.w / 2, y: 150, life: 0.9, max: 0.9, s: '×' + e.n + ' 连碎', size: 26 });
        G.shake = Math.max(G.shake, 4);
        G.hitstop = Math.max(G.hitstop, 0.04);
        snd('combo');
        break;
      case 'pick':
        snd('pick');
        break;
      case 'lever':
        snd('alarm');
        PF.vibrate(true);
        break;
      case 'leverPull':
        snd('salvo');
        G.flash = 0.35;
        G.flashColor = '#fff3d0';
        G.shake = 9;
        for (let k = 0; k < 6; k++) G.fx.push({ k: 'ball', x: 30 + k * 60, y: F.gateY - 20, tx: st.segs[k] ? st.segs[k].x : 180, ty: st.segs[k] ? st.segs[k].y : 300, life: 0.4, max: 0.4 });
        if (st.segs[0]) text(st.segs[0].x, st.segs[0].y - 20, '退 10 节', 18, D.P.gold, 1);
        PF.vibrate(true);
        break;
      case 'win': {
        G.hitstop = 0.15;
        G.shake = 8;
        G.flash = 0.25;
        G.flashColor = '#fff3d0';
        snd('win');
        PF.vibrate(true);
        for (let k = 0; k < 5; k++) puff(F.w / 2 + (Math.random() - 0.5) * 200, 300 + (Math.random() - 0.5) * 300, 4, 10);
        G.mode = 'end';
        G.endTimer = 1.3;
        break;
      }
      case 'lose':
        G.shake = 10;
        G.flash = 0.3;
        G.flashColor = '#ff3b2f';
        snd('lose');
        PF.vibrate(true);
        G.timing.loseAt = PF.now();
        G.mode = 'end';
        G.endTimer = 0.6;
        break;
    }
  }
  st.events.length = 0;
}

function stepFx(dt) {
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const p = G.fx[i];
    p.life -= dt;
    if (p.life <= 0) {
      G.fx.splice(i, 1);
      continue;
    }
    if (p.k === 'sq') {
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    } else if (p.k === 'puff' || p.k === 'txt') {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  if (G.fx.length > 400) G.fx.splice(0, G.fx.length - 400);
}

function drawFx() {
  for (const p of G.fx) {
    const k = p.life / p.max;
    if (p.k === 'sq') {
      ctx.fillStyle = D.P.line;
      ctx.fillRect(p.x - p.s / 2 - 0.8, p.y - p.s / 2 - 0.8, p.s + 1.6, p.s + 1.6);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    } else if (p.k === 'puff') {
      ctx.globalAlpha = k * 0.75;
      ctx.fillStyle = D.P.steam;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s * (1.6 - k * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.k === 'txt') {
      ctx.globalAlpha = Math.min(1, k * 2);
      bigText(ctx, p.s, p.x, p.y, p.size, p.c);
      ctx.globalAlpha = 1;
    } else if (p.k === 'ring') {
      ctx.globalAlpha = k;
      ctx.strokeStyle = p.c;
      ctx.lineWidth = 4 * k + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1.2 - k * 0.6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (p.k === 'rays') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(G.t * 2);
      ctx.globalAlpha = k;
      ctx.fillStyle = D.P.gold;
      D.star(ctx, 0, 0, 46 * (1.4 - k * 0.4), 12, 10);
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (p.k === 'combo') {
      const s = easeOutBack(clamp((p.max - p.life) / 0.2, 0, 1));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(s, s);
      ctx.globalAlpha = Math.min(1, k * 3);
      bigText(ctx, p.s, 0, 0, p.size, D.P.gold);
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (p.k === 'ball') {
      const u = 1 - k;
      const x = p.x + (p.tx - p.x) * u;
      const y = p.y + (p.ty - p.y) * u - Math.sin(u * Math.PI) * 60;
      ctx.fillStyle = D.P.line;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff9a3c';
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// —— 按钮 ——
function button(id, x, y, w, h, label, opt) {
  opt = opt || {};
  G.buttons.push({ id, x, y, w, h, disabled: !!opt.disabled });
  const press = G.pressId === id ? 0.94 : 1;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(press * (opt.pop || 1), press * (opt.pop || 1));
  const col = opt.disabled ? '#5a4b44' : opt.color || D.P.lac;
  const hi = opt.disabled ? '#6d5d55' : opt.hi || D.P.lacHi;
  ctx.fillStyle = D.P.line;
  roundRect(ctx, -w / 2 - 2, -h / 2 - 2, w + 4, h + 6, 10);
  ctx.fill();
  ctx.fillStyle = mix(col, '#000000', 0.35);
  roundRect(ctx, -w / 2, -h / 2 + 3, w, h, 9);
  ctx.fill();
  ctx.fillStyle = col;
  roundRect(ctx, -w / 2, -h / 2, w, h, 9);
  ctx.fill();
  ctx.fillStyle = hi;
  ctx.fillRect(-w / 2 + 8, -h / 2 + 4, w - 16, 3);
  bigText(ctx, label, opt.icon ? 10 : 0, 1, opt.size || 20, opt.disabled ? '#a89890' : '#fffaf0', D.P.line);
  if (opt.icon === 'ad') adIcon(-w / 2 + 22, 1);
  if (opt.icon === 'coin') coinIcon(-w / 2 + 20, 1, 8);
  ctx.restore();
}
function adIcon(x, y) {
  ctx.fillStyle = D.P.line;
  roundRect(ctx, x - 11, y - 8, 22, 16, 4);
  ctx.fill();
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 5);
  ctx.lineTo(x + 5, y);
  ctx.lineTo(x - 3, y + 5);
  ctx.fill();
}
function coinIcon(x, y, r) {
  ctx.fillStyle = D.P.line;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = D.P.gold;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = D.P.brassLo;
  ctx.fillRect(x - r * 0.35, y - r * 0.35, r * 0.7, r * 0.7);
}

// —— 局内 HUD ——
function drawHud(st) {
  // 关卡
  ctx.fillStyle = 'rgba(20,12,10,0.7)';
  roundRect(ctx, 8, 8, 70, 26, 8);
  ctx.fill();
  bigText(ctx, '第' + (st.level + 1) + '关', 43, 21, 14, '#fffaf0');
  // 龙还剩多少
  const bw = 150;
  const bx = F.w / 2 - bw / 2 + 6;
  ctx.fillStyle = D.P.line;
  roundRect(ctx, bx - 2, 12, bw + 4, 18, 6);
  ctx.fill();
  ctx.fillStyle = '#3a1410';
  roundRect(ctx, bx, 14, bw, 14, 5);
  ctx.fill();
  const f = st.segs.length / st.total;
  ctx.fillStyle = D.P.lac;
  roundRect(ctx, bx, 14, Math.max(6, bw * f), 14, 5);
  ctx.fill();
  ctx.fillStyle = D.P.lacHi;
  ctx.fillRect(bx + 3, 15, Math.max(0, bw * f - 6), 3);
  bigText(ctx, '' + st.segs.length, bx + bw / 2, 21, 12, '#fffaf0');
  // 小龙头图标
  ctx.fillStyle = D.P.line;
  ctx.fillRect(bx - 22, 11, 18, 18);
  ctx.fillStyle = D.P.brass;
  ctx.fillRect(bx - 20, 13, 14, 14);
  ctx.fillStyle = D.P.red;
  ctx.fillRect(bx - 12, 16, 4, 3);
  // 金币
  coinIcon(F.w - 64, 21, 8);
  bigText(ctx, '' + (meta.gold + st.gold), F.w - 50, 21, 15, D.P.gold, D.P.line, 'left');
  // 已经拿到的技能
  let ix = 14;
  for (const s of C.SKILLS) {
    const lv = st.skills[s.id];
    if (!lv) continue;
    ctx.fillStyle = 'rgba(20,12,10,0.6)';
    roundRect(ctx, ix - 11, 40, 22, 22, 5);
    ctx.fill();
    D.drawIcon(ctx, s.id, ix, 51, 16);
    if (lv > 1) bigText(ctx, '' + lv, ix + 9, 60, 9, '#fffaf0');
    ix += 26;
  }
}

function drawLever(st) {
  const k = st.lever.offer / C.AD.leverWindow;
  const x = F.w / 2;
  const y = 430;
  const pulse = 1 + Math.sin(G.t * 18) * 0.05;
  // 倒计时圈
  ctx.strokeStyle = D.P.line;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(x, y, 76, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = D.P.gold;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, y, 76, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
  ctx.stroke();
  button('lever', x - 66, y - 30, 132, 60, '拉总闸', { pop: pulse, size: 20, icon: 'ad' });
}

function drawCards(st) {
  ctx.fillStyle = 'rgba(10,6,5,0.72)';
  ctx.fillRect(-50, -50, F.w + 100, F.h + 100);
  const t = (PF.now() - G.cardsAt) / 1000;
  // 开了的机关匣
  ctx.save();
  ctx.translate(F.w / 2, 205);
  ctx.rotate(G.t * 0.8);
  ctx.fillStyle = 'rgba(255,214,90,0.25)';
  D.star(ctx, 0, 0, 70, 20, 12);
  ctx.restore();
  bigText(ctx, '选一个', F.w / 2, 205, 26, D.P.gold);
  const cw = 104;
  const ch = 150;
  st.cards.forEach((id, i) => {
    const s = C.SKILLS.find((k) => k.id === id);
    const x = 14 + i * (cw + 12);
    const y = 260;
    const pop = easeOutBack(clamp((t - i * 0.07) / 0.22, 0, 1));
    G.buttons.push({ id: 'card' + i, x, y, w: cw, h: ch });
    ctx.save();
    ctx.translate(x + cw / 2, y + ch / 2);
    ctx.scale(pop, pop);
    const pref = st.buddy && st.buddy.prefer === id;
    ctx.fillStyle = D.P.line;
    roundRect(ctx, -cw / 2 - 3, -ch / 2 - 3, cw + 6, ch + 8, 12);
    ctx.fill();
    ctx.fillStyle = '#3b2a22';
    roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 10);
    ctx.fill();
    ctx.fillStyle = pref ? D.P.gold : s.color;
    ctx.fillRect(-cw / 2 + 6, -ch / 2 + 6, cw - 12, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, -34, -ch / 2 + 18, 68, 68, 10);
    ctx.fill();
    D.drawIcon(ctx, id, 0, -ch / 2 + 52, 52);
    bigText(ctx, s.name, 0, 30, 22, '#fffaf0');
    // 等级小格
    const lv = st.skills[id];
    for (let k = 0; k < s.max; k++) {
      ctx.fillStyle = D.P.line;
      ctx.fillRect(-s.max * 7 + k * 14, 50, 11, 9);
      ctx.fillStyle = k < lv ? s.color : k === lv ? '#fffaf0' : '#5a4b44';
      ctx.fillRect(-s.max * 7 + k * 14 + 1.5, 51.5, 8, 6);
    }
    if (pref) {
      D.drawBuddy(ctx, st.buddy.id, cw / 2 - 12, -ch / 2 + 14, G.t, 0.9);
    }
    ctx.restore();
  });
}

function drawHint(st) {
  const x = st.px + Math.sin(G.t * 3) * 70;
  const y = 700;
  ctx.globalAlpha = 0.9;
  // 两个箭头
  ctx.fillStyle = '#fffaf0';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(st.px + d * 110, y - 6);
    ctx.lineTo(st.px + d * 124, y - 18);
    ctx.lineTo(st.px + d * 110, y - 30);
    ctx.fill();
  }
  // 手指
  ctx.fillStyle = D.P.line;
  roundRect(ctx, x - 9, y - 30, 18, 34, 8);
  ctx.fill();
  ctx.fillStyle = '#f5dcc8';
  roundRect(ctx, x - 7, y - 28, 14, 30, 7);
  ctx.fill();
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(x - 4, y - 25, 8, 6);
  ctx.globalAlpha = 1;
}

// —— 结算页 ——
function drawResult() {
  const r = G.result;
  const t = (PF.now() - G.resultAt) / 1000;
  ctx.fillStyle = 'rgba(10,6,5,0.9)';
  ctx.fillRect(-50, -50, F.w + 100, F.h + 100);
  const pop = easeOutBack(clamp(t / 0.25, 0, 1));
  ctx.save();
  ctx.translate(F.w / 2, 150);
  ctx.scale(pop, pop);
  if (r.win) {
    ctx.save();
    ctx.rotate(G.t);
    ctx.fillStyle = 'rgba(255,214,90,0.22)';
    D.star(ctx, 0, 0, 120, 40, 14);
    ctx.restore();
    bigText(ctx, '守住了！', 0, -10, 46, D.P.gold);
    bigText(ctx, '第' + (r.level + 1) + '关', 0, 44, 18, '#fffaf0');
  } else {
    if (r.near) bigText(ctx, '差一点！', 0, -56, 26, D.P.gold);
    bigText(ctx, '还差', -78, 8, 22, '#fffaf0');
    bigText(ctx, '' + r.left, 0, 6, 64, r.near ? D.P.gold : '#ff8a6a');
    bigText(ctx, '节', 70, 8, 22, '#fffaf0');
  }
  ctx.restore();

  // 打碎了多少：一条龙的进度条
  if (!r.win) {
    const bw = 260;
    const bx = F.w / 2 - bw / 2;
    ctx.fillStyle = D.P.line;
    roundRect(ctx, bx - 3, 222, bw + 6, 22, 7);
    ctx.fill();
    ctx.fillStyle = '#3a1410';
    roundRect(ctx, bx, 225, bw, 16, 5);
    ctx.fill();
    ctx.fillStyle = D.P.brass;
    roundRect(ctx, bx, 225, (bw * (r.total - r.left)) / r.total, 16, 5);
    ctx.fill();
    ctx.fillStyle = D.P.brassHi;
    ctx.fillRect(bx + 3, 226, Math.max(0, (bw * (r.total - r.left)) / r.total - 6), 3);
  }

  // 金币
  const gy = r.win && r.newBuddy ? 250 : 282;
  coinIcon(F.w / 2 - 54, gy, 11);
  bigText(ctx, '+' + (r.doubled ? r.gold * 2 : r.gold), F.w / 2 - 36, gy, 26, D.P.gold, D.P.line, 'left');
  const live = t > 0.3;
  if (!r.doubled && G.st.adsUsed < C.AD.maxPerRun) {
    button('double', F.w / 2 + 34, gy - 18, 96, 36, '翻倍', { icon: 'ad', size: 16, color: '#2f6b4a', hi: '#4f9a6c', disabled: !live });
  }

  // 新伙伴
  if (r.win && r.newBuddy) {
    const b = r.newBuddy;
    const bp = easeOutBack(clamp((t - 0.35) / 0.3, 0, 1));
    ctx.save();
    ctx.translate(F.w / 2, 330);
    ctx.scale(bp, bp);
    ctx.fillStyle = D.P.line;
    roundRect(ctx, -120, -38, 240, 76, 12);
    ctx.fill();
    ctx.fillStyle = '#3b2a22';
    roundRect(ctx, -117, -35, 234, 70, 10);
    ctx.fill();
    ctx.fillStyle = D.P.gold;
    ctx.fillRect(-111, -29, 222, 3);
    D.drawBuddy(ctx, b.id, -78, 4, G.t, 2.2);
    bigText(ctx, '新伙伴 ' + b.name, 26, -10, 20, D.P.gold);
    bigText(ctx, b.note, 26, 16, 12, '#fffaf0');
    ctx.restore();
  }

  // 大按钮：再来
  const by = 420;
  button('again', F.w / 2 - 110, by, 220, 66, r.win ? '下一关' : '再守一次', { size: 28, pop: 1 + Math.sin(G.t * 5) * 0.025, disabled: !live });

  // 弩机升级
  const cost = C.UPGRADE.cost(meta.bowLv);
  const can = meta.gold >= cost;
  button('upgrade', F.w / 2 - 110, 516, 220, 46, '升级弩机  ' + cost, { icon: 'coin', size: 17, color: can ? '#8a5a1e' : null, hi: '#c98a2b', disabled: !can || !live });
  // 带哪只伙伴
  bigText(ctx, '带谁上城墙', F.w / 2, 590, 13, '#cbb8a8');
  C.BUDDIES.forEach((b, i) => {
    const x = F.w / 2 - 84 + i * 84;
    const y = 630;
    const have = meta.buddies.indexOf(b.id) >= 0;
    const on = meta.buddy === b.id;
    G.buttons.push({ id: 'buddy_' + b.id, x: x - 32, y: y - 28, w: 64, h: 56, disabled: !have || !live });
    ctx.fillStyle = D.P.line;
    roundRect(ctx, x - 32, y - 28, 64, 56, 10);
    ctx.fill();
    ctx.fillStyle = on ? '#6b4a1e' : '#2e221d';
    roundRect(ctx, x - 29, y - 25, 58, 50, 8);
    ctx.fill();
    if (on) {
      ctx.strokeStyle = D.P.gold;
      ctx.lineWidth = 2;
      roundRect(ctx, x - 29, y - 25, 58, 50, 8);
      ctx.stroke();
    }
    if (have) {
      D.drawBuddy(ctx, b.id, x, y - 4, G.t, 1.6);
      bigText(ctx, b.name, x, y + 17, 11, '#fffaf0');
    } else {
      ctx.globalAlpha = 0.35;
      ctx.save();
      ctx.translate(x, y - 4);
      ctx.scale(1.6, 1.6);
      ctx.fillStyle = '#000';
      ctx.fillRect(-10, -8, 20, 14);
      ctx.restore();
      ctx.globalAlpha = 1;
      bigText(ctx, '?', x, y - 4, 20, '#7a6a60');
      bigText(ctx, '第' + (b.unlockLevel + 1) + '关', x, y + 17, 10, '#7a6a60');
    }
  });
}

// —— 手指 ——
function toField(x, y) {
  return [(x - ox) / scale, (y - oy) / scale];
}
function hitButton(fx, fy) {
  for (let i = G.buttons.length - 1; i >= 0; i--) {
    const b = G.buttons[i];
    if (fx >= b.x && fx <= b.x + b.w && fy >= b.y && fy <= b.y + b.h) return b;
  }
  return null;
}
function onTouch(type, id, x, y) {
  const [fx, fy] = toField(x, y);
  if (type === 'down') {
    // 静音按钮（左下角）
    if (fx < 44 && fy > F.h - 44 && G.mode !== 'result') {
      meta.muted = !meta.muted;
      PF.setMuted(meta.muted);
      saveMeta();
      return;
    }
    const b = hitButton(fx, fy);
    if (b && !b.disabled) {
      G.pressId = b.id;
      press(b.id);
      return;
    }
    if (G.mode === 'play' && G.st && G.st.mode === 'play') G.drag = { id, fx, px: G.st.px };
  } else if (type === 'move') {
    if (G.drag && G.drag.id === id && G.st) {
      G.targetX = G.drag.px + (fx - G.drag.fx) * 1.25;
      G.hintMoved = Math.max(G.hintMoved, Math.abs(fx - G.drag.fx));
    }
  } else if (type === 'up') {
    if (G.drag && G.drag.id === id) G.drag = null;
    G.pressId = null;
  }
}

function press(id) {
  const st = G.st;
  if (id === 'lever') {
    S.pullLever(st);
    return;
  }
  if (id.indexOf('card') === 0) {
    S.pick(st, +id.slice(4));
    if (st.mode === 'cards') G.cardsAt = PF.now();
    G.drag = null;
    return;
  }
  if (G.mode !== 'result') return;
  if (id === 'again') {
    snd('tap');
    startRun();
  } else if (id === 'double') {
    const r = G.result;
    if (r.doubled) return;
    r.doubled = true;
    st.adsUsed++;
    meta.gold += r.gold;
    saveMeta();
    snd('coin');
    for (let k = 0; k < 6; k++) setTimeoutSafe(() => snd('coin'), k * 70);
  } else if (id === 'upgrade') {
    const cost = C.UPGRADE.cost(meta.bowLv);
    if (meta.gold < cost) return;
    meta.gold -= cost;
    meta.bowLv++;
    saveMeta();
    snd('upgrade');
  } else if (id.indexOf('buddy_') === 0) {
    const bid = id.slice(6);
    meta.buddy = meta.buddy === bid ? null : bid;
    saveMeta();
    snd('tap');
  }
}
function setTimeoutSafe(fn, ms) {
  if (typeof setTimeout === 'function') setTimeout(fn, ms);
}

// —— 每一帧 ——
let last = PF.now();
function frame() {
  const now = PF.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.t += dt;
  const st = G.st;

  // 规则
  for (let k = 0; k < G.speed; k++) {
    if (G.hitstop > 0) {
      G.hitstop -= dt;
      break;
    }
    if (G.mode === 'play' && st.mode === 'play') {
      if (G.bot) G.targetX = G.bot(st);
      const before = st.mode;
      S.step(st, dt, G.targetX);
      if (st.mode === 'cards' && before !== 'cards') G.cardsAt = PF.now();
      if (G.bot && st.lever.offer > 0 && G.botLever && st.lever.offer < C.AD.leverWindow - 0.5) S.pullLever(st);
      handleEvents(st);
    } else if (G.mode === 'play' && st.mode === 'cards' && G.bot) {
      S.pick(st, Math.floor(Math.random() * st.cards.length));
      handleEvents(st);
    }
  }
  if (G.mode === 'end') {
    G.endTimer -= dt;
    if (G.endTimer <= 0) endRun(st.mode === 'win');
  }
  if (G.bot && G.mode === 'result' && G.botAgain && PF.now() - G.resultAt > 350) press('again');

  // 心跳
  if (G.mode === 'play' && st.danger > 0) {
    G.heartCd -= dt;
    if (G.heartCd <= 0) {
      snd('heart');
      G.heartCd = 0.75 - st.danger * 0.35;
    }
  }
  if (G.hint && G.hintMoved > 30) {
    G.hint = false;
    meta.seenHint = true;
    saveMeta();
  }
  stepFx(dt);
  G.recoil = Math.max(0, G.recoil - dt * 12);
  G.shake = Math.max(0, G.shake - dt * 30);
  G.flash = Math.max(0, G.flash - dt);
  G.banner = Math.max(0, G.banner - dt);

  render(dt);
  PF.nextFrame(frame);
}

function render() {
  const st = G.st;
  G.buttons = [];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#120d0a';
  ctx.fillRect(0, 0, W, H);
  const sx = (Math.random() - 0.5) * G.shake;
  const sy = (Math.random() - 0.5) * G.shake;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + sx * scale), dpr * (oy + sy * scale));
  // 背景（离屏画好的）
  if (G.bg) ctx.drawImage(G.bg, 0, 0, F.w, F.h);
  // 上下多出来的屏幕：天和地延伸
  if (oy > 0) {
    ctx.fillStyle = D.P.sky0;
    ctx.fillRect(-50, -oy / scale - 10, F.w + 100, oy / scale + 10);
    ctx.fillStyle = D.P.walkLo;
    ctx.fillRect(-50, F.h, F.w + 100, oy / scale + 10);
  }
  // 危险：城门发红
  if (st.danger > 0) {
    ctx.globalAlpha = st.danger * (0.5 + 0.5 * Math.sin(G.t * 12));
    ctx.fillStyle = '#ff3b2f';
    roundRect(ctx, F.w / 2 - 20, F.gateY - 26, 40, 66, 18);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  D.drawDragon(ctx, st, G.t);
  D.drawBullets(ctx, st);
  // 阿铸 + 伙伴
  const moving = Math.abs(G.targetX - st.px) > 2;
  if (meta.buddy && st.buddy) D.drawBuddy(ctx, st.buddy.id, st.px + 34, F.playerY + (st.buddy.id === 'que' ? -24 + Math.sin(G.t * 4) * 3 : 14), G.t, 1);
  D.drawPlayer(ctx, st.px, F.playerY, G.t, G.recoil, moving);
  drawFx();
  // 危险时屏幕四周发红
  if (st.danger > 0 && G.mode === 'play') {
    const a = st.danger * 0.35 * (0.6 + 0.4 * Math.sin(G.t * 12));
    ctx.fillStyle = 'rgba(255,40,30,' + a.toFixed(3) + ')';
    ctx.fillRect(-50, -50, F.w + 100, 60);
    ctx.fillRect(-50, F.h - 10, F.w + 100, 60);
    ctx.fillRect(-50, -50, 62, F.h + 100);
    ctx.fillRect(F.w - 12, -50, 62, F.h + 100);
  }
  drawHud(st);
  if (G.hint && G.mode === 'play') drawHint(st);
  if (G.banner > 0 && G.mode === 'play') {
    const k = G.banner / 1.3;
    const pop = easeOutBack(clamp((1.3 - G.banner) / 0.25, 0, 1));
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 2.5);
    ctx.translate(F.w / 2, 330);
    ctx.scale(pop, pop);
    bigText(ctx, '第' + (st.level + 1) + '关', 0, 0, 40, D.P.gold);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  if (G.mode === 'play' && st.mode === 'play' && st.lever.offer > 0) drawLever(st);
  if (G.mode === 'play' && st.mode === 'cards') drawCards(st);
  if (G.mode === 'result') drawResult();
  // 静音键
  if (G.mode !== 'result') {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(14, F.h - 28, 6, 10);
    ctx.beginPath();
    ctx.moveTo(20, F.h - 28);
    ctx.lineTo(28, F.h - 34);
    ctx.lineTo(28, F.h - 12);
    ctx.lineTo(20, F.h - 18);
    ctx.fill();
    if (meta.muted) {
      ctx.strokeStyle = '#ff6a5a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(10, F.h - 36);
      ctx.lineTo(34, F.h - 10);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (G.flash > 0) {
    ctx.globalAlpha = Math.min(0.7, G.flash * 2);
    ctx.fillStyle = G.flashColor;
    ctx.fillRect(-50, -50, F.w + 100, F.h + 100);
    ctx.globalAlpha = 1;
  }
}

startRun();
PF.exposeForTest('__moshou', { G, meta, S, C, startRun, press, scale, ox, oy, W, H, saveMeta });
PF.nextFrame(frame);
