// 《墨守》（打龙塔防，暂名）原型 0.3 · 主程序：画面切换、手指、局外（金币 / 弩机 / 机关伙伴）、特效和声音。
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
  fx2: [], // 结算页上面一层的火花
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
function snd(name, gapMs, vol, rate) {
  const now = PF.now();
  if (gapMs && G.sndCd[name] && now - G.sndCd[name] < gapMs) return;
  G.sndCd[name] = now;
  PF.sound(name, vol, rate);
}

// —— 开一局 ——
function startRun() {
  const seed = ((PF.now() % 1000000007) ^ (meta.runs * 2654435761)) >>> 0;
  G.st = S.newRun(meta.level, meta, seed || 1);
  G.st.phasedOf = (g) => S.phased(G.st, g);
  G.bg = makeBg(G.st);
  G.typeShow = null;
  G.evoShow = null;
  G.mode = 'play';
  G.result = null;
  G.fx.length = 0;
  G.targetX = G.st.px;
  G.banner = 1.3;
  G.hint = meta.level === 0 && !meta.seenHint;
  G.hintMoved = 0;
  G.runStartReal = PF.now();
  // 弩机刚升过级：开局在阿铸头上亮一下，箭也换了样子
  G.bowShow = meta.bowLv > (meta.bowSeen || 0) ? 1.8 : 0;
  G.palShow = st0Buddy() && meta.palSeen !== meta.buddy ? 1.8 : 0;
  meta.bowSeen = meta.bowLv;
  meta.palSeen = meta.buddy;
  G.goldBump = 0;
  G.timing.restartAt = PF.now();
  meta.runs++;
  saveMeta();
}

// 生图到了以后：把文件名加进 config.js 的 ASSETS（例：'bg_city.jpg'），放进 原型/素材/
const IMGS = (C.ASSETS || []).map((f) => {
  const k = f.replace(/\.[a-z]+$/, '');
  D.IMG[k] = PF.loadImage('素材/' + f);
  return k;
});
let imgsReady = 0;
function st0Buddy() {
  return G.st && G.st.buddy;
}
function makeBg(st) {
  const k = scale * dpr;
  const c = PF.createOffscreen(Math.ceil(F.w * k), Math.ceil(F.h * k));
  const x = c.getContext('2d');
  x.setTransform(k, 0, 0, k, 0, 0);
  D.drawScene(x, st);
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
const FXMAX = 420;
const roomFor = (n) => G.fx.length + n < FXMAX;
function shards(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 60 + Math.random() * 180;
    G.fx.push({ k: 'sq', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.3, max: 0.8, s: 2 + Math.random() * 3, c: col || (Math.random() < 0.5 ? D.P.brass : D.P.brassHi) });
  }
}
// 打碎：几片转着飞的铜壳 + 一两个小齿轮
function chunks(x, y, n, cols) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
    const v = 120 + Math.random() * 160;
    G.fx.push({ k: 'chunk', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 24, life: 0.7, max: 0.7, w: 6 + Math.random() * 5, h: 4 + Math.random() * 3, c: cols[i % cols.length] });
  }
  for (let i = 0; i < 2; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2;
    const v = 90 + Math.random() * 120;
    G.fx.push({ k: 'gear', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: 0, spin: (Math.random() < 0.5 ? -1 : 1) * 14, life: 0.8, max: 0.8, r: 3.5 + Math.random() * 2 });
  }
}
// 火花：细长的亮线，往外飞
function sparks(x, y, n, col, sp) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (sp || 1) * (160 + Math.random() * 220);
    G.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.18 + Math.random() * 0.12, max: 0.3, c: col || '#fff2b0' });
  }
}
function pop(x, y, r, col, life) {
  G.fx.push({ k: 'pop', x, y, r, life: life || 0.12, max: life || 0.12, c: col || '#ffffff' });
}
function puff(x, y, n, r) {
  for (let i = 0; i < n; i++) {
    G.fx.push({ k: 'puff', x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 0.6, max: 0.6, s: (r || 6) + Math.random() * 4 });
  }
}
function text(x, y, s, size, col, life) {
  G.fx.push({ k: 'txt', x, y, vx: 0, vy: -40, life: life || 0.6, max: life || 0.6, s, size, c: col || '#fff' });
}
function ring(x, y, r, col, life, w) {
  G.fx.push({ k: 'ring', x, y, r, life: life || 0.3, max: life || 0.3, c: col, w: w || 4 });
}
// 金币从打碎的地方飞到右上角的金币数
function coinFly(x, y, delay) {
  G.fx.push({ k: 'coin', x0: x, y0: y, x, y, life: 0.55 + (delay || 0), max: 0.55 + (delay || 0), d: delay || 0 });
}
// 大爆炸：白光 → 橙色火球 → 两圈冲击波 → 焦痕
function boom(x, y, r, big) {
  pop(x, y, r * 0.9, '#fff7e0', 0.1);
  G.fx.push({ k: 'fire', x, y, r, life: 0.35, max: 0.35 });
  ring(x, y, r, '#ffb347', 0.35, 6);
  if (big) ring(x, y, r * 1.5, '#fff2b0', 0.45, 3);
  G.fx.unshift({ k: 'scorch', x, y, r: r * 0.6, life: 1.2, max: 1.2 });
  if (roomFor(20)) {
    sparks(x, y, big ? 14 : 8, '#ffb347', big ? 1.3 : 1);
    chunks(x, y, big ? 5 : 3, [D.P.brass, D.P.brassLo, '#4a4f5c']);
  }
}

function handleEvents(st) {
  for (const e of st.events) {
    switch (e.t) {
      case 'shoot':
        G.recoil = 1;
        snd('shoot', 70, 0.35);
        break;
      case 'hit': {
        const heavy = st.mods.tier >= 4;
        // 打在盾上 / 重甲上：灰火花「挡」；用对了武器：黄字「克！」
        if (e.resist || e.weak) {
          const now = PF.now();
          const key = e.resist ? 'resAt' : 'weakAt';
          if (!G[key] || now - G[key] > (e.resist ? 350 : 250)) {
            G[key] = now;
            if (e.resist) {
              text(e.x, e.y - 12, e.type === 'shield' ? '挡' : '硬', 13, '#b8c0cc', 0.4);
              snd('clang', 90, 0.4);
            } else text(e.x, e.y - 16, '克！' + e.dmg, 15, '#ffcf4a', 0.55);
          }
          if (e.resist) {
            if (roomFor(3)) sparks(e.x, e.y + 8, 1, '#c8d0dc', 0.5);
            break;
          }
        }
        if (e.crit) {
          const now = PF.now();
          if (!G.critTextAt || now - G.critTextAt > 160) {
            G.critTextAt = now;
            text(e.x, e.y - 14, e.dmg + '!', 15, '#fff27a', 0.5);
            G.fx.push({ k: 'rays', x: e.x, y: e.y, life: 0.2, max: 0.2, r: 18 });
          }
          snd('crit', 60);
        } else {
          snd(heavy ? 'hitHeavy' : 'hit', 45, heavy ? 0.5 : 0.4);
        }
        // 打中冒火花：武器越重，火花越多越亮
        if (roomFor(4)) sparks(e.x, e.y, heavy ? 2 : 1, D.boltTier(st.mods.tier).core, 0.6);
        break;
      }
      case 'kill': {
        const combo = Math.min(12, e.combo || 1);
        pop(e.x, e.y, 24, '#ffffff', 0.1);
        ring(e.x, e.y, 26, D.P.brassHi, 0.25, 3);
        if (roomFor(16)) {
          chunks(e.x, e.y, e.chest ? 6 : 4, e.chest ? [D.P.lac, D.P.lacHi, D.P.gold] : e.ram ? ['#6b7080', '#a9afbf', '#3c3f4a'] : [D.P.brass, D.P.brassHi, D.P.brassLo]);
          sparks(e.x, e.y, 5, '#fff2b0');
        }
        coinFly(e.x, e.y);
        G.shake = Math.max(G.shake, e.front ? 3 : 2);
        // 连着碎，声音一下比一下高
        snd('break', 30, 0.6, 1 + (combo - 1) * 0.05);
        if (e.ram) {
          boom(e.x, e.y, 54, true);
          G.hitstop = Math.max(G.hitstop, 0.12);
          G.shake = Math.max(G.shake, 9);
          G.flash = 0.25;
          G.flashColor = '#fff3d0';
          snd('ram');
          PF.vibrate(true);
          for (let k = 1; k < 5; k++) coinFly(e.x + (Math.random() - 0.5) * 30, e.y, k * 0.05);
        }
        break;
      }
      case 'chest':
        G.hitstop = Math.max(G.hitstop, 0.09);
        G.shake = Math.max(G.shake, 4);
        G.fx.push({ k: 'rays', x: e.x, y: e.y, life: 0.5, max: 0.5 });
        shards(e.x, e.y, 10, D.P.gold);
        snd('chest');
        PF.vibrate(false);
        break;
      case 'blast':
        boom(e.x, e.y, e.r, false);
        G.shake = Math.max(G.shake, 3.5);
        snd('blast', 80, 0.55);
        break;
      // —— 伙伴 ——
      case 'palGo':
        if (st.buddy.id === 'que') snd('chirp', 100, 0.5);
        else if (st.buddy.id === 'quan') snd('bark', 100, 0.55);
        break;
      case 'peck':
        snd('peck', 30, 0.5);
        sparks(e.x, e.y - 6, e.chest ? 4 : 2, e.chest ? D.P.gold : '#fff2b0', 0.7);
        if (e.chest) pop(e.x, e.y, 14, D.P.gold, 0.08);
        break;
      case 'bite':
        snd('bite');
        G.fx.push({ k: 'chomp', x: e.x, y: e.y, life: 0.32, max: 0.32 });
        ring(e.x, e.y, 34, '#ffffff', 0.3, 5);
        text(e.x, e.y - 30, '退！', 20, D.P.gold, 0.7);
        G.shake = Math.max(G.shake, 6);
        G.hitstop = Math.max(G.hitstop, 0.06);
        PF.vibrate(false);
        break;
      case 'mortar':
        snd('mortar');
        puff(e.x, e.y, 3, 5);
        break;
      case 'shell': {
        boom(e.x, e.y, e.r, true);
        G.shake = Math.max(G.shake, 8);
        G.hitstop = Math.max(G.hitstop, 0.06);
        snd('boom');
        PF.vibrate(false);
        // 留一团蒸汽：龙爬慢
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          G.fx.push({ k: 'cloud', x: e.x + Math.cos(a) * e.r * 0.55, y: e.y + Math.sin(a) * e.r * 0.45, s: 12 + Math.random() * 8, life: st.buddy.slowSec, max: st.buddy.slowSec, ph: Math.random() * 6 });
        }
        text(e.x, e.y - e.r * 0.6, '慢！', 18, '#cfe6ff', 0.8);
        break;
      }
      case 'combo':
        G.fx.push({ k: 'combo', x: F.w / 2, y: 150, life: 0.9, max: 0.9, s: '×' + e.n + ' 连碎', size: 26 });
        G.shake = Math.max(G.shake, 4);
        G.hitstop = Math.max(G.hitstop, 0.04);
        snd('combo');
        break;
      case 'pick': {
        const w = S.W[e.id];
        ring(st.px, F.playerY - 14, 40, w.color, 0.4, 5);
        pop(st.px, F.playerY - 14, 30, w.color, 0.15);
        sparks(st.px, F.playerY - 14, 10, w.color);
        if (e.lv >= 5) {
          // 进化：一局里最爽的那一下
          snd('evolve');
          G.flash = 0.4;
          G.flashColor = '#fff3d0';
          G.shake = 8;
          G.hitstop = Math.max(G.hitstop, 0.15);
          G.evoShow = { id: e.id, t: 1.6 };
          for (let k = 0; k < 4; k++) ring(st.px, F.playerY - 14, 50 + k * 30, w.color, 0.5 + k * 0.1, 6);
          sparks(st.px, F.playerY - 14, 24, w.color, 1.4);
          PF.vibrate(true);
        } else {
          snd('pick');
          text(st.px, F.playerY - 60, w.name + (e.lv > 1 ? ' Lv' + e.lv : ' 到手'), 20, w.color, 0.9);
        }
        break;
      }
      case 'phase': {
        const now = PF.now();
        if (!G.phaseAt || now - G.phaseAt > 400) {
          G.phaseAt = now;
          text(e.x, e.y - 12, '虚', 14, '#9fd6ec', 0.45);
        }
        break;
      }
      case 'powder':
        boom(e.x, e.y, e.r, true);
        G.shake = Math.max(G.shake, 7);
        G.hitstop = Math.max(G.hitstop, 0.05);
        snd('boom', 60, 0.7);
        text(e.x, e.y - 24, '轰！', 20, '#ffb347', 0.7);
        break;
      case 'split':
        shards(e.x, e.y, 10, '#8fffb0');
        text(e.x, e.y - 20, '裂！', 16, '#8fffb0', 0.6);
        snd('crit', 60, 0.5);
        break;
      case 'regen':
        text(e.x + 10, e.y - 10, '+', 16, '#7dff9a', 0.5);
        break;
      case 'newType':
        G.typeShow = { type: e.type, t: 3.2 };
        snd('alarm', 300, 0.25);
        break;
      case 'bladeThrow':
        snd('whoosh', 120, 0.45);
        break;
      case 'potThrow':
        snd('mortar', 120, 0.5);
        break;
      case 'potBoom':
        boom(e.x, e.y, e.r, false);
        G.shake = Math.max(G.shake, 4);
        snd('blast', 70, 0.6);
        break;
      case 'chain':
        G.fx.push({ k: 'bolt', pts: e.pts, life: 0.22, max: 0.22, evo: e.evo, seed: Math.random() * 100 });
        for (const q of e.pts.slice(1)) sparks(q.x, q.y, 2, '#d8ecff', 0.6);
        snd('zap', 80, 0.5);
        break;
      case 'frost':
        for (const q of e.pts) {
          ring(q.x, q.y, 24, '#d8ecff', 0.35, 4);
          sparks(q.x, q.y, 2, '#ffffff', 0.5);
        }
        if (e.evo) {
          G.flash = 0.25;
          G.flashColor = '#d8ecff';
          text(F.w / 2, 300, '冰封！', 30, '#d8ecff', 1);
        }
        snd('freeze', 100, 0.55);
        break;
      case 'hammer':
        G.shake = Math.max(G.shake, e.push ? 9 : 5);
        G.hitstop = Math.max(G.hitstop, 0.05);
        ring(e.x, e.y, 40, '#ffe1a0', 0.3, 7);
        pop(e.x, e.y, 26, '#fff7e0', 0.1);
        if (roomFor(12)) chunks(e.x, e.y, 3, [D.P.brass, '#7F602C', '#6b5a48']);
        snd('thud', 60, 0.8);
        PF.vibrate(false);
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
    if (p.k === 'sq' || p.k === 'chunk' || p.k === 'gear') {
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.rot += p.spin * dt;
    } else if (p.k === 'spark') {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
    } else if (p.k === 'coin') {
      const u = clamp(1 - (p.life - 0) / (p.max - p.d), 0, 1);
      const e2 = u * u;
      p.x = p.x0 + (F.w - 64 - p.x0) * e2;
      p.y = p.y0 + (21 - p.y0) * e2 - Math.sin(u * Math.PI) * 40;
      if (p.life - dt <= 0) {
        G.goldBump = 1;
        snd('coin', 60, 0.12);
      }
    } else if (p.k === 'puff' || p.k === 'txt') {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  if (G.fx.length > FXMAX) G.fx.splice(0, G.fx.length - FXMAX);
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
      ctx.lineWidth = (p.w || 4) * k + 1;
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
      const rr = p.r || 46;
      D.star(ctx, 0, 0, rr * (1.4 - k * 0.4), rr * 0.26, 10);
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
    } else if (p.k === 'chunk') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.fillStyle = D.P.line;
      ctx.fillRect(-p.w / 2 - 1, -p.h / 2 - 1, p.w + 2, p.h + 2);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (p.k === 'gear') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.fillStyle = D.P.line;
      D.star(ctx, 0, 0, p.r + 2.5, p.r, 6);
      ctx.fillStyle = D.P.brassHi;
      D.star(ctx, 0, 0, p.r + 1.5, p.r - 0.5, 6);
      ctx.fillStyle = D.P.line;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (p.k === 'spark') {
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.strokeStyle = p.c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (p.k === 'pop') {
      ctx.globalAlpha = k * 0.9;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1.3 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.k === 'fire') {
      const u = 1 - k;
      ctx.globalAlpha = k;
      ctx.fillStyle = '#ff7a2a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.5 + u * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd65a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.35 + u * 0.3) * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.k === 'scorch') {
      ctx.globalAlpha = k * 0.45;
      ctx.fillStyle = '#0d0806';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.k === 'coin') {
      if (p.life > p.max - p.d) continue;
      ctx.fillStyle = D.P.line;
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      ctx.fillStyle = D.P.gold;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      ctx.fillStyle = '#fffbe0';
      ctx.fillRect(p.x - 2, p.y - 2, 2, 2);
    } else if (p.k === 'cloud') {
      ctx.globalAlpha = Math.min(1, k * 3) * 0.55;
      ctx.fillStyle = '#dfe9f5';
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(G.t * 2 + p.ph) * 4, p.y + Math.cos(G.t * 1.7 + p.ph) * 3, p.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.k === 'bolt') {
      // 雷链：一段段折线，白芯蓝边
      let sd = p.seed;
      const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280 - 0.5);
      for (const [w, c] of [[5, 'rgba(120,170,255,' + (k * 0.8).toFixed(2) + ')'], [2, 'rgba(255,255,255,' + k.toFixed(2) + ')']]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(p.pts[0].x, p.pts[0].y);
        sd = p.seed;
        for (let i = 1; i < p.pts.length; i++) {
          const a = p.pts[i - 1];
          const b = p.pts[i];
          for (let j = 1; j <= 3; j++) {
            const u = j / 3;
            const jit = j < 3 ? 9 : 0;
            ctx.lineTo(a.x + (b.x - a.x) * u + rnd() * jit, a.y + (b.y - a.y) * u + rnd() * jit);
          }
        }
        ctx.stroke();
      }
    } else if (p.k === 'chomp') {
      // 木犬咬下去：上下两排牙合上
      const u = 1 - k;
      const close = Math.min(1, u * 3);
      const gap = 22 * (1 - close);
      ctx.globalAlpha = Math.min(1, k * 2);
      for (const d of [-1, 1]) {
        const y0 = p.y + d * (gap + 6);
        ctx.fillStyle = D.P.line;
        ctx.fillRect(p.x - 22, y0 - 5, 44, 10);
        ctx.fillStyle = '#f4ead8';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(p.x - 20 + i * 9, y0 - d * 3);
          ctx.lineTo(p.x - 16 + i * 9, y0 - d * 11);
          ctx.lineTo(p.x - 12 + i * 9, y0 - d * 3);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
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
  const gb = 1 + (G.goldBump || 0) * 0.35;
  ctx.save();
  ctx.translate(F.w - 64, 21);
  ctx.scale(gb, gb);
  coinIcon(0, 0, 8);
  ctx.restore();
  bigText(ctx, '' + (meta.gold + st.gold), F.w - 50, 21, 15 * (1 + (G.goldBump || 0) * 0.15), D.P.gold, D.P.line, 'left');
  // 带着的武器（最多 4 件），右下角写等级，进化了加金框
  let ix = 20;
  for (const w of C.WEAPONS) {
    const lv = st.weapons[w.id];
    if (!lv) continue;
    ctx.fillStyle = 'rgba(20,12,10,0.65)';
    roundRect(ctx, ix - 14, 40, 28, 28, 6);
    ctx.fill();
    if (lv >= 5) {
      ctx.strokeStyle = D.P.gold;
      ctx.lineWidth = 2;
      roundRect(ctx, ix - 14, 40, 28, 28, 6);
      ctx.stroke();
    }
    D.drawWeaponIcon(ctx, w.id, ix, 54, 20);
    bigText(ctx, lv >= 5 ? '★' : '' + lv, ix + 10, 64, 9, lv >= 5 ? D.P.gold : '#fffaf0');
    ix += 32;
  }
}

// 第一次看见一个兵种：上方弹一张小牌「铜盾节 箭打不动 · 克：回旋刃 雷链 …」，不停游戏
function drawTypeShow(st) {
  const ts = G.typeShow;
  const T = C.TYPES[ts.type];
  const k = Math.min(1, ts.t * 2, (3.2 - ts.t) * 5);
  ctx.save();
  ctx.globalAlpha = Math.max(0, k);
  const y = 96;
  ctx.fillStyle = 'rgba(20,12,10,0.88)';
  roundRect(ctx, 20, y, F.w - 40, 58, 10);
  ctx.fill();
  ctx.strokeStyle = D.P.gold;
  ctx.lineWidth = 1.5;
  roundRect(ctx, 20, y, F.w - 40, 58, 10);
  ctx.stroke();
  D.drawTypeIcon(ctx, ts.type, 48, y + 29, 30, st);
  bigText(ctx, T.name, 74, y + 18, 16, D.P.gold, D.P.line, 'left');
  bigText(ctx, T.tip, 74, y + 40, 13, '#fffaf0', D.P.line, 'left');
  if (T.fear.length) {
    bigText(ctx, '克', 238, y + 29, 14, '#ff9a6a', D.P.line, 'left');
    T.fear.slice(0, 3).forEach((id, i) => D.drawWeaponIcon(ctx, id, 266 + i * 24, y + 29, 20));
  }
  ctx.restore();
}

// 进化：中间一张大图标 + 新名字
function drawEvoShow() {
  const e = G.evoShow;
  const w = S.W[e.id];
  const u = 1.6 - e.t;
  const sc = easeOutBack(clamp(u / 0.25, 0, 1));
  ctx.save();
  ctx.globalAlpha = Math.min(1, e.t * 2);
  ctx.translate(F.w / 2, 300);
  ctx.save();
  ctx.rotate(G.t * 1.5);
  ctx.fillStyle = 'rgba(255,214,90,0.3)';
  D.star(ctx, 0, 0, 100, 34, 14);
  ctx.restore();
  ctx.scale(sc, sc);
  D.drawWeaponIcon(ctx, e.id, 0, 0, 90);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = Math.min(1, e.t * 2);
  bigText(ctx, '进化！' + w.evo, F.w / 2, 380, 30, D.P.gold);
  ctx.restore();
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

function wrapText(str, n) {
  const out = [];
  for (let i = 0; i < str.length; i += n) out.push(str.slice(i, i + n));
  return out;
}
function drawCards(st) {
  ctx.fillStyle = 'rgba(10,6,5,0.76)';
  ctx.fillRect(-50, -50, F.w + 100, F.h + 100);
  const t = (PF.now() - G.cardsAt) / 1000;
  ctx.save();
  ctx.translate(F.w / 2, 190);
  ctx.rotate(G.t * 0.8);
  ctx.fillStyle = 'rgba(255,214,90,0.25)';
  D.star(ctx, 0, 0, 70, 20, 12);
  ctx.restore();
  bigText(ctx, '选一个', F.w / 2, 190, 26, D.P.gold);
  const cw = 108;
  const ch = 210;
  st.cards.forEach((id, i) => {
    const w = S.W[id];
    const cur = st.weapons[id] || 0;
    const next = cur + 1;
    const evo = next >= 5;
    const x = 9 + i * (cw + 9);
    const y = 236;
    const pop = easeOutBack(clamp((t - i * 0.07) / 0.22, 0, 1));
    G.buttons.push({ id: 'card' + i, x, y, w: cw, h: ch });
    ctx.save();
    ctx.translate(x + cw / 2, y + ch / 2);
    ctx.scale(pop, pop);
    const pref = st.buddy && st.buddy.prefer === id;
    ctx.fillStyle = D.P.line;
    roundRect(ctx, -cw / 2 - 3, -ch / 2 - 3, cw + 6, ch + 8, 12);
    ctx.fill();
    ctx.fillStyle = evo ? '#5a3f1a' : '#3b2a22';
    roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 10);
    ctx.fill();
    if (evo) {
      ctx.strokeStyle = D.P.gold;
      ctx.lineWidth = 2.5;
      roundRect(ctx, -cw / 2 + 2, -ch / 2 + 2, cw - 4, ch - 4, 9);
      ctx.stroke();
    }
    ctx.fillStyle = w.color;
    ctx.fillRect(-cw / 2 + 6, -ch / 2 + 6, cw - 12, 4);
    // 新 / Lv
    bigText(ctx, cur ? (evo ? '进化' : 'Lv' + cur + '→' + next) : '新！', 0, -ch / 2 + 22, 13, cur ? (evo ? D.P.gold : '#cbb8a8') : '#7dff9a');
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, -32, -ch / 2 + 32, 64, 60, 10);
    ctx.fill();
    D.drawWeaponIcon(ctx, id, 0, -ch / 2 + 62, 48);
    bigText(ctx, evo ? w.evo : w.name, 0, -ch / 2 + 110, 20, evo ? D.P.gold : '#fffaf0');
    // 这一级干什么（两三行）
    wrapText(w.lvDesc[next - 1], 7).slice(0, 3).forEach((ln, k) => bigText(ctx, ln, 0, -ch / 2 + 134 + k * 16, 12, '#e9dccb'));
    // 克哪些兵种（只标这一关会出的）
    const cs = S.counters(st, id);
    if (cs.length) {
      bigText(ctx, '克', -cw / 2 + 16, ch / 2 - 18, 13, '#ff9a6a');
      cs.slice(0, 3).forEach((tp, k) => D.drawTypeIcon(ctx, tp, -cw / 2 + 38 + k * 24, ch / 2 - 18, 18, st));
    }
    if (pref) D.drawBuddy(ctx, st.buddy.id, cw / 2 - 12, -ch / 2 + 16, G.t, 0.9);
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
  button('upgrade', F.w / 2 - 110, 516, 220, 46, '弩机 Lv.' + meta.bowLv + '→' + (meta.bowLv + 1) + '  ' + cost, { icon: 'coin', size: 16, color: can ? '#8a5a1e' : null, hi: '#c98a2b', disabled: !can || !live, pop: can ? 1 + Math.sin(G.t * 6) * 0.02 : 1 });
  // 带哪只伙伴
  const cur = C.BUDDIES.find((b) => b.id === meta.buddy);
  bigText(ctx, cur ? '带' + cur.name + '：' + cur.note : '带谁上城墙', F.w / 2, 590, 13, cur ? D.P.gold : '#cbb8a8');
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

// 结算页点了升级：中间弹出一把大弩，放光
function drawUpgradeShow() {
  const k = G.upShow / 1.1;
  const u = 1 - k;
  const sc = 3.2 * easeOutBack(clamp(u / 0.25, 0, 1));
  ctx.globalAlpha = Math.min(1, k * 3) * 0.7;
  ctx.fillStyle = '#0a0605';
  ctx.fillRect(-50, -50, F.w + 100, F.h + 100);
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(F.w / 2, 300);
  ctx.globalAlpha = Math.min(1, k * 3);
  ctx.save();
  ctx.rotate(G.t * 1.5);
  ctx.fillStyle = 'rgba(255,214,90,0.3)';
  D.star(ctx, 0, 0, 110, 36, 14);
  ctx.restore();
  ctx.scale(sc, sc);
  D.drawCrossbow(ctx, 0, 22, 0, G.t, meta.bowLv);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 3);
  bigText(ctx, '弩机 Lv.' + meta.bowLv, F.w / 2, 380, 30, D.P.gold);
  bigText(ctx, '伤害 +' + Math.round(C.UPGRADE.pct * 100 * meta.bowLv) + '%', F.w / 2, 410, 16, '#fffaf0');
  ctx.restore();
  ctx.globalAlpha = 1;
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
    snd('upgradeBig');
    G.upShow = 1.1;
    G.flash = 0.2;
    G.flashColor = '#fff3d0';
    G.shake = 6;
    for (let k = 0; k < 18; k++) G.fx2.push(mkSpark(F.w / 2, 300));
    PF.vibrate(true);
  } else if (id.indexOf('buddy_') === 0) {
    const bid = id.slice(6);
    meta.buddy = meta.buddy === bid ? null : bid;
    saveMeta();
    snd('tap');
  }
}
function mkSpark(x, y) {
  const a = Math.random() * Math.PI * 2;
  const v = 150 + Math.random() * 260;
  return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.3, max: 0.8, c: Math.random() < 0.5 ? D.P.gold : '#fff2b0' };
}
function drawFx2() {
  const dt = 1 / 60;
  for (let i = G.fx2.length - 1; i >= 0; i--) {
    const p = G.fx2[i];
    p.life -= dt;
    if (p.life <= 0) { G.fx2.splice(i, 1); continue; }
    p.vy += 300 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = D.P.line;
    ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
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
  // 图片读完了：重画一次背景
  const nReady = IMGS.filter((k) => D.IMG[k].ok).length;
  if (nReady !== imgsReady) {
    imgsReady = nReady;
    if (G.st) G.bg = makeBg(G.st);
  }
  G.recoil = Math.max(0, G.recoil - dt * 12);
  G.shake = Math.max(0, G.shake - dt * 30);
  G.flash = Math.max(0, G.flash - dt);
  G.banner = Math.max(0, G.banner - dt);
  if (G.banner <= 0) {
    G.bowShow = Math.max(0, (G.bowShow || 0) - dt);
    G.palShow = Math.max(0, (G.palShow || 0) - dt);
  }
  G.goldBump = Math.max(0, (G.goldBump || 0) - dt * 5);
  G.upShow = Math.max(0, (G.upShow || 0) - dt);
  if (G.typeShow) G.typeShow.t -= G.st && G.st.mode === 'play' ? dt : 0;
  if (G.evoShow) G.evoShow.t -= dt;

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
    const gl = st.path.goal;
    if (gl.y > F.gateY - 40) roundRect(ctx, gl.x - 20, F.gateY - 26, 40, 66, 18);
    else {
      ctx.beginPath();
      ctx.arc(gl.x, gl.y, 30, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  D.drawDragonAll(ctx, st, G.t);
  D.drawWeapons(ctx, st, G.t);
  // 蒸汽龟的蒸汽罩着时：整条龙蒙一层白汽（看得出变慢了）
  if (st.slowT > 0) {
    ctx.globalAlpha = Math.min(1, st.slowT) * 0.18;
    ctx.fillStyle = '#dfe9f5';
    for (const g of st.segs) if (g.y > -20) { ctx.beginPath(); ctx.arc(g.x, g.y, C.DRAGON.r + 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  D.drawBullets(ctx, st);
  // 阿铸 + 伙伴
  const moving = Math.abs(G.targetX - st.px) > 2;
  if (G.bowShow > 0) {
    const k = Math.min(1, G.bowShow);
    ctx.globalAlpha = k * (0.35 + 0.2 * Math.sin(G.t * 10));
    ctx.fillStyle = D.P.gold;
    ctx.beginPath();
    ctx.arc(st.px, F.playerY - 16, 34 + (1.8 - G.bowShow) * 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  D.drawHero(ctx, st.px, F.playerY, G.t, G.recoil, moving, st.bowLv);
  D.drawPal(ctx, st, G.t);
  D.drawShells(ctx, st, G.t);
  drawFx();
  if (G.bowShow > 0 && G.banner <= 0 && G.mode === 'play') {
    ctx.globalAlpha = Math.min(1, G.bowShow * 2);
    bigText(ctx, '弩机 Lv.' + st.bowLv, st.px, F.playerY - 74 - (1.8 - G.bowShow) * 8, 18, D.P.gold);
    ctx.globalAlpha = 1;
  }
  if (G.palShow > 0 && G.banner <= 0 && G.mode === 'play' && st.pal) {
    ctx.globalAlpha = Math.min(1, G.palShow * 2);
    bigText(ctx, st.buddy.name + ' 上城墙！', F.w / 2, 380, 22, '#fffaf0');
    bigText(ctx, st.buddy.note, F.w / 2, 406, 14, D.P.gold);
    ctx.globalAlpha = 1;
  }
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
    bigText(ctx, '第' + (st.level + 1) + '关 · ' + st.ch.name, 0, 0, 34, D.P.gold);
    bigText(ctx, st.ch.foe + '来了', 0, 34, 15, '#fffaf0');
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  if (G.mode === 'play' && st.mode === 'play' && st.lever.offer > 0) drawLever(st);
  if (G.typeShow && G.typeShow.t > 0 && G.mode === 'play' && st.mode === 'play') drawTypeShow(st);
  if (G.evoShow && G.evoShow.t > 0 && G.mode === 'play') drawEvoShow();
  if (G.mode === 'play' && st.mode === 'cards') drawCards(st);
  if (G.mode === 'result') drawResult();
  if (G.mode === 'result' && G.upShow > 0) drawUpgradeShow();
  if (G.mode === 'result') drawFx2();
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
