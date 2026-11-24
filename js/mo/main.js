// 《墨守》0.6 · 主程序：地图 → 一关（守城 / 进攻，3 波）→ 波间机关台 + 小店 → 结算 → 局外工坊。
// 规则在 defend.js / attack.js / build.js，数据在 data.js；画法借 ram/draw.js（祝有好收获画风）。
const PF = require('../platform.js');
const SH = require('../shell.js');
const D = require('./data.js');
const B = require('./build.js');
const F = require('./defend.js');
const A = require('./attack.js');
const RD = require('../ram/draw.js');
const RC = require('../ram/config.js');
const { clamp, easeOutBack, roundRect, bigText, mix } = require('../util.js');

const SAVE = 'moshou06_v1';
const meta = Object.assign(
  { mojing: 0, pages: 0, chars: {}, shenji: {}, cleared: {}, slotsLv: 0, benchLv: 0, wallHpLv: 0, cartLv: 0, dragonLv: 0, recipes: D.START_RECIPES.slice(), builder: 'azhu', runs: 0, seenTeach: {} },
  PF.load(SAVE) || {}
);
const saveMeta = () => PF.save(SAVE, meta);
// 这一趟战役：开局选定的机关师 + 打到哪了。换机关师 = 从 1-1 重新开始（墨晶、配方、神机保留）
if (!meta.camp) meta.camp = meta.cleared && Object.keys(meta.cleared).length ? { builder: meta.builder, cleared: Object.assign({}, meta.cleared) } : null;
if (!meta.ever) meta.ever = Object.assign({}, meta.cleared || {});
const bUnlocked = (b) => !b.locked || (b.unlockIf && meta.ever[b.unlockIf]);
function metaNow() {
  return {
    slots: D.META.slots.base + meta.slotsLv,
    bench: D.META.bench.base + meta.benchLv,
    wallHp: D.META.wallHp.base + meta.wallHpLv * D.META.wallHp.step,
    cartSlots: D.META.cartSlots.base + meta.cartLv,
    dragonLen: D.META.dragonLen.base + meta.dragonLv,
    recipes: meta.recipes,
    shenji: meta.shenji,
  };
}

const { ctx, width: W, height: H, dpr } = SH.view;
const FW = 360;
const FH = 720;
const scale = Math.min(W / FW, H / FH);
const ox = (W - FW * scale) / 2;
const oy = (H - FH * scale) / 2;
const CITY = RC.CHAPTERS[0];
const IMG = { bg: PF.loadImage('素材/bg_city.jpg'), hero: PF.loadImage('素材/hero.png'), azIdle: PF.loadImage('素材/azhu_idle.png'), azSwing: PF.loadImage('素材/azhu_swing.png') };

// —— 阿铸的动作帧（AI 视频抽帧做的，代码只管放在哪、多大、什么时候播）——
// 待机 7 帧往返播（1-2-…-7-6-…-2），每帧 160 毫秒；挥锤 12 帧，第 10 帧砸地（震屏、火花放在这一帧）
const AZ = {
  idle: { fw: 144, fh: 275, cols: 7, seq: [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1], ms: 160 },
  swing: { fw: 174, fh: 313, cols: 6, dur: [70, 70, 70, 70, 70, 70, 50, 50, 50, 250, 120, 120], hit: 9 },
};
const AZ_SWING_TOTAL = AZ.swing.dur.reduce((a, b) => a + b, 0);
const LINE = RD.LINE;

const G = {
  scr: meta.camp ? 'map' : 'pick', // pick | map | brief | play | shop | result | meta
  lvIdx: 0, r: null, st: null, t: 0,
  fx: [], pops: [], shake: 0, flash: 0, flashCol: '#fff', hitstop: 0,
  btns: [], drag: null, sel: -1, benchSel: [], banner: 0, teach: null,
  bot: null, speed: 1, result: null, sndCd: {}, cardsAt: 0,
  az: { anim: 'idle', t: 0 }, azAt: null,
};

// 阿铸挥一锤：砸地那一帧调 onHit
function azSwing(onHit) {
  G.az = { anim: 'swing', t: 0, onHit, fired: false };
}
function stepAz(dt) {
  const a = G.az;
  a.t += dt * 1000;
  if (a.anim !== 'swing') return;
  let acc = 0;
  for (let i = 0; i <= AZ.swing.hit; i++) acc += AZ.swing.dur[i - 1] || 0;
  if (!a.fired && a.t >= acc) {
    a.fired = true;
    if (a.onHit) a.onHit();
  }
  if (a.t >= AZ_SWING_TOTAL) G.az = { anim: 'idle', t: 0 };
}
// 以脚底中点对齐：x 是脚底中间，footY 是脚底，h 是待机时人物的高度
function drawAzhu(x, footY, h) {
  const a = G.az;
  const sc = h / AZ.idle.fh;
  let img;
  let f;
  let A;
  if (a.anim === 'swing' && IMG.azSwing.ok) {
    A = AZ.swing;
    img = IMG.azSwing;
    let acc = 0;
    f = A.dur.length - 1;
    for (let i = 0; i < A.dur.length; i++) {
      acc += A.dur[i];
      if (a.t < acc) {
        f = i;
        break;
      }
    }
  } else if (IMG.azIdle.ok) {
    A = AZ.idle;
    img = IMG.azIdle;
    f = A.seq[Math.floor(a.t / A.ms) % A.seq.length];
  } else return;
  const sx = (f % A.cols) * A.fw;
  const sy = Math.floor(f / A.cols) * A.fh;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, footY - 2, h * 0.22, h * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, sx, sy, A.fw, A.fh, x - (A.fw * sc) / 2, footY - A.fh * sc, A.fw * sc, A.fh * sc);
}

function snd(name, gap, vol, rate) {
  const now = PF.now();
  if (gap && G.sndCd[name] && now - G.sndCd[name] < gap) return;
  G.sndCd[name] = now;
  PF.sound(name, vol, rate);
}

// —— 进一关 ——
function unlocked(i) {
  const lv = D.LEVELS[i];
  const c = meta.camp ? meta.camp.cleared : {};
  if (lv.challenge) return !!c['1-8'];
  return i === 0 || !!c[D.LEVELS[i - 1].id];
}
function startLevel(i) {
  G.lvIdx = i;
  const lv = D.LEVELS[i];
  const seed = ((PF.now() % 1000000007) ^ (meta.runs * 2654435761)) >>> 0;
  G.r = B.newRun(metaNow(), lv, meta.camp.builder, seed || 1);
  G.st = lv.mode === 'defend' ? F.newDefend(G.r) : A.newAttack(G.r);
  G.scr = 'play';
  G.fx.length = 0;
  G.pops.length = 0;
  G.banner = 1.6;
  G.benchSel = [];
  G.sel = -1;
  G.teach = lv.teach && !meta.seenTeach[lv.id] ? { text: lv.teach, t: 0 } : null;
  G.tut = lv.id === '1-1' && !meta.tutDone ? { step: 0, t: 0 } : null;
  if (G.tut) G.teach = null;
  meta.seenTeach[lv.id] = 1;
  saveMeta();
  handleEvents();
}
const S = () => (G.r.lv.mode === 'defend' ? F : A);

// —— 坐标 ——
const toField = (px, py) => [(px - ox) / scale, (py - oy) / scale];
const inR = (fx, fy, b) => fx >= b.x && fx <= b.x + b.w && fy >= b.y && fy <= b.y + b.h;
function btn(id, x, y, w, h, label, col, sub, opt) {
  opt = opt || {};
  G.btns.push({ id, x, y, w, h });
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, x + 2, y + 4, w, h, 12);
  ctx.fill();
  ctx.fillStyle = opt.dis ? '#4a3e34' : col;
  ctx.strokeStyle = opt.on ? '#ffd65a' : LINE;
  ctx.lineWidth = opt.on ? 3 : 2;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();
  bigText(ctx, label, x + w / 2, y + h / 2 - (sub ? 7 : 0), opt.size || (h < 40 ? 14 : 20), opt.dis ? '#a89880' : '#fff8e6', LINE);
  if (sub) bigText(ctx, sub, x + w / 2, y + h / 2 + 12, 11, '#ffe9b0', LINE);
}

function onTouch(type, id, px, py) {
  const [fx, fy] = toField(px, py);
  if (type === 'down') {
    for (let i = G.btns.length - 1; i >= 0; i--) {
      if (inR(fx, fy, G.btns[i])) {
        press(G.btns[i].id);
        return;
      }
    }
    if (G.scr === 'play') G.sel = -1;
  } else if (type === 'move') {
    if (G.drag && G.drag.id === id && G.scr === 'play') G.st.targetX = clamp(G.drag.x0 + (fx - G.drag.fx0) * 1.15, 14, FW - 14);
  } else if (type === 'up') {
    if (G.drag && G.drag.id === id) G.drag = null;
  }
}

function press(id) {
  const r = G.r;
  snd('tap', 40, 0.4);
  if (id.startsWith('node')) {
    const i = +id.slice(4);
    if (!unlocked(i)) return;
    G.lvIdx = i;
    G.bldView = null;
    G.scr = 'brief';
  } else if (id === 'go') startLevel(G.lvIdx);
  else if (id === 'back') G.scr = 'map';
  else if (id.startsWith('bld_')) G.bldView = id.slice(4);
  else if (id === 'pickGo') {
    const b = D.BUILDERS.find((x) => x.id === (G.bldView || 'azhu'));
    if (!bUnlocked(b)) return;
    meta.camp = { builder: b.id, cleared: {} };
    meta.builder = b.id;
    saveMeta();
    G.scr = 'map';
    snd('evolve', 0, 0.5);
  } else if (id === 'restart') G.confirm = true;
  else if (id === 'restartNo') G.confirm = false;
  else if (id === 'restartYes') {
    G.confirm = false;
    G.bldView = null;
    G.scr = 'pick';
  } else if (id === 'meta') G.scr = 'meta';
  else if (id === 'old') SH.go('menu');
  else if (id.startsWith('card')) {
    B.pickCard(r, +id.slice(4));
    snd('pick', 0, 0.5);
  } else if (id.startsWith('mat_')) {
    const el = id.slice(4);
    const used = G.benchSel.filter((e) => e === el).length;
    if (G.benchSel.length < r.bench2 && r.mats[el] > used) G.benchSel.push(el);
    tutAdvance('mat');
  } else if (id.startsWith('bs')) {
    G.benchSel.splice(+id.slice(2), 1);
  } else if (id === 'combine') {
    const mc = B.combine(r, G.benchSel);
    if (mc) {
      G.benchSel = [];
      G.sel = r.bench.length - 1;
      tutAdvance('combine');
      azSwing(() => {
        snd('clang', 0, 0.6);
        snd('upgrade', 0, 0.5);
        G.shake = Math.max(G.shake, 6);
        if (G.azAt) {
          sparks(G.azAt.x, G.azAt.y, 14, '#ffd65a');
          chunks(G.azAt.x, G.azAt.y, 6, '#c9933a', 0.8);
        }
      });
      if (r.lv.mode === 'defend') pop(D.M[mc.id].name + '：点亮着的点位放下', FW / 2, 600, '#ffd65a', 15);
      else pop(D.M[mc.id].name + '：点上面车上的格子装上去', FW / 2, 268, '#ffd65a', 15);
    }
  } else if (id.startsWith('tray')) {
    const i = +id.slice(4);
    G.sel = G.sel === i ? -1 : i;
  } else if (id === 'buySpot') {
    if (F.buySpot(r)) {
      snd('upgrade', 0, 0.6);
      const p = F.slotPos(r.slots.length - 1);
      sparks(p.x, p.y, 14, '#ffd65a');
      pop('修好新点位！', p.x, p.y - 30, '#ffd65a', 15);
      tutAdvance('buySpot');
    } else {
      snd('alarm', 200, 0.3);
      pop('铜钱不够', FW / 2, 600, '#ff8a5a', 14);
    }
  } else if (id.startsWith('spot')) {
    const si = +id.slice(4);
    if (G.sel >= 0) {
      const res = B.place(r, G.sel, si);
      if (res && res.blocked) pop('一夫当关：只能放 1 件', FW / 2, 560, '#ff8a5a', 15);
      else if (res) {
        snd(res.res === 'merge' ? 'evolve' : 'clang', 0, 0.5);
        const p = F.slotPos(si);
        pop(res.res === 'merge' ? '叠成 ' + res.slot.tier + ' 阶！' : '放下 ' + D.M[res.slot.id].name, p.x, p.y - 26, '#ffd65a', 15);
        tutAdvance('place');
        G.spotView = { i: si, t: 1.6 };
      }
      G.sel = -1;
    } else if (r.slots[si]) G.spotView = { i: si, t: 1.6 };
  } else if (id.startsWith('slot')) {
    const si = +id.slice(4);
    if (G.sel >= 0) {
      const res = B.place(r, G.sel, si);
      if (res && res.blocked) pop('一夫当关：只能放 1 件', FW / 2, 120, '#ff8a5a', 16);
      else if (res) {
        snd(res.res === 'merge' ? 'evolve' : 'clang', 0, 0.5);
        if (res.res === 'merge') pop('合成 ' + D.M[res.slot.id].name + ' ' + res.slot.tier + ' 阶！', FW / 2, 120, '#ffd65a', 18);
      }
      G.sel = -1;
    }
  } else if (id === 'sell') {
    if (G.sel >= 0) B.sell(r, G.sel);
    G.sel = -1;
  } else if (id.startsWith('buy')) {
    if (B.buy(r, +id.slice(3))) snd('coin', 0, 0.6);
    else snd('alarm', 200, 0.3);
  } else if (id.startsWith('lock')) {
    const i = +id.slice(4);
    r.locked[i] = !r.locked[i];
  } else if (id === 'refresh') {
    if (!B.refresh(r)) snd('alarm', 200, 0.3);
  } else if (id === 'nextWave') {
    G.scr = 'play';
    G.benchSel = [];
    G.sel = -1;
    S().nextWave(G.st);
    G.banner = 1.2;
    handleEvents();
  } else if (id === 'again') startLevel(G.lvIdx);
  else if (id === 'toMap') G.scr = 'map';
  else if (id.startsWith('up_')) buyMeta(id.slice(3));
  else if (id.startsWith('rec_')) {
    const mid = id.slice(4);
    if (meta.pages >= 3 && meta.recipes.indexOf(mid) < 0) {
      meta.pages -= 3;
      meta.recipes.push(mid);
      saveMeta();
      snd('evolve', 0, 0.5);
    }
  }
}

const META_KEYS = { slots: 'slotsLv', bench: 'benchLv', wallHp: 'wallHpLv', cartSlots: 'cartLv', dragonLen: 'dragonLv' };
function metaCost(k) {
  const m = D.META[k];
  const lv = meta[META_KEYS[k]];
  const maxLv = k === 'wallHp' ? m.max : m.max - m.base;
  if (lv >= maxLv) return null;
  return typeof m.cost === 'function' ? m.cost(lv) : m.cost[lv];
}
function buyMeta(k) {
  const c = metaCost(k);
  if (c === null || meta.mojing < c) {
    snd('alarm', 200, 0.3);
    return;
  }
  meta.mojing -= c;
  meta[META_KEYS[k]]++;
  saveMeta();
  snd('upgrade', 0, 0.6);
}

// —— 第一关教学：点两次金 → 点合 → 点亮着的点位 → 龙出发 ——
const TUT = [
  { text: '龙要来了！先打一件机关：点两次「金」', target: 'mat_jin' },
  { text: '金 + 金 = 连弩。点「合」，阿铸打一件', target: 'combine' },
  { text: '点路边亮着的点位，把连弩放下（圈里的才打得到）', target: 'spot' },
  { text: '放好了！龙来了。打碎龙节会掉材料，飞到下面', target: null },
];
function tutAdvance(what) {
  const T = G.tut;
  if (!T) return;
  if (T.step === 0 && what === 'mat' && G.benchSel.length >= 2) T.step = 1;
  else if (T.step === 1 && what === 'combine') T.step = 2;
  else if (T.step === 2 && what === 'place') {
    T.step = 3;
    T.t = 0;
    meta.tutDone = true;
    saveMeta();
  }
}
function drawTut() {
  const T = G.tut;
  const step = TUT[T.step];
  // 指着要点的东西
  const b = step.target === 'spot' ? G.btns.find((x) => x.id.startsWith('spot') && !G.r.slots[+x.id.slice(4)]) : step.target ? G.btns.find((x) => x.id === step.target) : null;
  if (b) {
    const k = 0.5 + 0.5 * Math.sin(G.t * 8);
    ctx.strokeStyle = 'rgba(255,214,90,' + (0.6 + 0.4 * k) + ')';
    ctx.lineWidth = 4;
    roundRect(ctx, b.x - 4 - k * 3, b.y - 4 - k * 3, b.w + 8 + k * 6, b.h + 8 + k * 6, 12);
    ctx.stroke();
    // 小手
    const hx = b.x + b.w / 2 + 14;
    const hy = b.y + b.h / 2 + 10 + k * 6;
    ctx.fillStyle = '#fff8e6';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + 10, hy + 22);
    ctx.lineTo(hx + 3, hy + 20);
    ctx.lineTo(hx - 2, hy + 28);
    ctx.lineTo(hx - 6, hy + 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  const y = T.step === 2 ? 70 : 560;
  ctx.fillStyle = 'rgba(26,18,12,0.92)';
  ctx.strokeStyle = '#ffd65a';
  ctx.lineWidth = 2;
  roundRect(ctx, 14, y, FW - 28, 54, 12);
  ctx.fill();
  ctx.stroke();
  bigText(ctx, '第 ' + (Math.min(T.step, 2) + 1) + ' 步 / 3', 28, y + 16, 11, '#ffd65a', LINE, 'left');
  wrap(step.text, 28, y + 36, FW - 56, 13);
}

// 机关台上做好的机关，自动摆上城墙 / 车：有一样的就叠上去升阶，没有就放空位
function autoPlace(r) {
  let msg = '';
  for (let bi = r.bench.length - 1; bi >= 0; bi--) {
    const mc = r.bench[bi];
    let si = r.slots.findIndex((x) => x && x.id === mc.id && x.tier === mc.tier && x.tier < 4);
    if (si < 0) si = r.slots.findIndex((x) => !x);
    if (si < 0) continue;
    const res = B.place(r, bi, si);
    if (res && !res.blocked) msg = res.res === 'merge' ? '叠成 ' + res.slot.tier + ' 阶' : '摆上第 ' + (si + 1) + ' 格';
  }
  return msg;
}

// —— 特效 ——
function pop(text, x, y, col, size) {
  G.pops.push({ text, x, y, col: col || '#fff8e6', size: size || 16, t: 0, life: 0.8 });
}
function chunks(x, y, n, col, k) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.8;
    const v = (90 + Math.random() * 170) * (k || 1);
    G.fx.push({ k: 'chunk', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.5 + Math.random() * 0.4, s: 3 + Math.random() * 4, col });
  }
}
function sparks(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 120 + Math.random() * 200;
    G.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.2 + Math.random() * 0.15, col: col || '#fff3c4' });
  }
}
// 击杀 0.2 秒：白色放射刺光 + 碎粒 + 一缕白烟（照《土豆兄弟》逐帧）
function killFx(x, y, col) {
  G.fx.push({ k: 'star', x, y, t: 0, life: 0.2 });
  chunks(x, y, 7, col, 1);
  G.fx.push({ k: 'smoke', x, y, t: 0, life: 0.5 });
}
// 材料飞进右上角口袋（0.1 秒闪一圈）
function orb(x, y, el) {
  const i = D.ELS.indexOf(el);
  const live = G.r && G.r.lv.mode === 'defend';
  const tx = live ? 28 + i * 40 : 214 + i * 28;
  const ty = live ? 663 : 32;
  G.fx.push({ k: 'orb', x, y, x0: x, y0: y, tx, ty, t: 0, life: 0.55, col: D.EL[el].col });
}

const sy = (wy) => A.HEAD_Y - (wy - G.st.head.wy);
function handleEvents() {
  const st = G.st;
  if (!st) return;
  const atk = G.r.lv.mode === 'attack';
  for (const e of st.events) {
    const x = e.x;
    const y = atk && e.wy !== undefined ? sy(e.wy) : e.y;
    switch (e.t) {
      case 'hit':
        if (e.dmg >= 1) pop(String(e.dmg), x + (Math.random() - 0.5) * 12, y - 14, e.crit ? '#ffd65a' : '#ffffff', e.crit ? 18 : 12);
        snd('hit', 30, 0.25, 0.9 + Math.random() * 0.3);
        break;
      case 'kill':
      case 'break':
        killFx(x, y, atk ? CITY.brick[1] : RD.BRASS);
        if (e.el) orb(x, y, e.el);
        G.shake = Math.max(G.shake, e.boss || e.kind === 'gate' ? 12 : 3);
        G.hitstop = Math.max(G.hitstop, e.boss ? 0.12 : 0.02);
        snd(e.boss || e.kind === 'gate' ? 'boom' : 'break', 35, 0.5, 0.9 + Math.random() * 0.25);
        if (e.kind === 'tower') pop('拆了弩塔！', x, y - 30, '#ffb74a', 15);
        break;
      case 'boom':
      case 'kaboom':
        sparks(x, y, 16, '#ff9a3a');
        G.shake = Math.max(G.shake, 7);
        snd('blast', 60, 0.5);
        if (e.self) pop('炸了！-3', x, y - 30, '#ff6a4a', 18);
        break;
      case 'glow':
        snd('alarm', 200, 0.3, 1.4);
        break;
      case 'dash':
        snd('whoosh', 100, 0.5);
        G.shake = Math.max(G.shake, 4);
        break;
      case 'breach':
        G.flash = 0.25;
        G.flashCol = '#ff4a2a';
        G.shake = Math.max(G.shake, e.boss ? 14 : 6);
        pop('-' + e.dmg, FW / 2, F.WALL_Y - 30, '#ff6a4a', 22);
        snd('ram', 80, 0.6);
        PF.vibrate(true);
        break;
      case 'boltHit':
        G.flash = 0.18;
        G.flashCol = '#ff4a2a';
        pop('-' + e.dmg, x + 12, y - 10, '#ff6a4a', 18);
        snd('clang', 50, 0.5);
        break;
      case 'deflect':
        sparks(x, y, 6, '#fff');
        snd('clang', 50, 0.4, 1.6);
        break;
      case 'chew':
        if (Math.random() < 0.5) chunks(x, y + A.HALF, 2, CITY.brick[1], 0.6);
        snd('hit', 35, 0.3, 1.1);
        break;
      case 'repair':
        pop('+' + e.n + ' 血', x, y - 14, '#9dff7a', 16);
        snd('coin', 40, 0.5);
        break;
      case 'lobBoom':
        G.fx.push({ k: 'ring', x, y, R: e.R, t: 0, life: 0.3 });
        sparks(x, y, 12, '#ffb04a');
        snd('blast', 60, 0.4);
        break;
      case 'chain':
        if (!atk) G.fx.push({ k: 'bolt', pts: [e.from].concat(e.pts), t: 0, life: 0.2 });
        snd('zap', 80, 0.4);
        break;
      case 'frost':
        sparks(x, y, 10, '#bfe8ff');
        snd('freeze', 100, 0.4);
        break;
      case 'hammer':
        G.shake = Math.max(G.shake, 4);
        snd('thud', 60, 0.5);
        break;
      case 'overheat':
        pop('过热', x, y - 20, '#ff8a5a', 13);
        break;
      case 'waveClear':
        if (e.pts) e.pts.forEach((p) => chunks(p.x, p.y, 3, '#8a8a8a', 0.8));
        G.flash = 0.3;
        G.flashCol = '#ffffff';
        snd('win', 0, 0.5);
        G.waveClearAt = PF.now();
        break;
      case 'win':
        finish(true);
        break;
      case 'lose':
        finish(false, e.left);
        break;
      case 'bossDown':
        pop('打倒铁头龙！', FW / 2, 280, '#ffd65a', 24);
        break;
    }
  }
  st.events.length = 0;
  if (st.mode === 'shop' && G.scr === 'play') {
    const res = B.waveEnd(G.r);
    G.scr = 'shop';
    G.waveRes = res;
    G.cardsAt = PF.now();
  }
}

// —— 结算：局外奖励 ——
function finish(win, left) {
  const lv = G.r.lv;
  const i = G.lvIdx;
  const first = win && !meta.cleared[lv.id];
  let mojing = win ? 30 + i * 8 + (lv.boss ? 30 : 0) : 8 + G.r.wave * 4;
  let pages = win ? 1 + (lv.boss ? 1 : 0) : 0;
  const chars = [];
  if (win) {
    const c = G.r.R() < 0.5 ? '墨' : '斗';
    chars.push(c);
    if (lv.boss) chars.push(c === '墨' ? '斗' : '墨');
  }
  meta.mojing += mojing;
  meta.pages += pages;
  chars.forEach((c) => (meta.chars[c] = (meta.chars[c] || 0) + 1));
  // 神机凑齐了没有
  const sj = D.SHENJI[0];
  let newShenji = false;
  if (!meta.shenji[sj.id] && sj.chars.every((c) => (meta.chars[c] || 0) >= sj.need)) {
    meta.shenji[sj.id] = true;
    newShenji = true;
  }
  const newB = [];
  if (win) {
    meta.camp.cleared[lv.id] = true;
    const before = D.BUILDERS.filter(bUnlocked).length;
    meta.ever[lv.id] = true;
    meta.cleared[lv.id] = true;
    D.BUILDERS.forEach((b) => b.unlockIf === lv.id && newB.push(b.name));
    if (D.BUILDERS.filter(bUnlocked).length === before) newB.length = 0;
  }
  meta.runs++;
  saveMeta();
  G.result = { win, first, mojing, pages, chars, newShenji, newB, left, wave: G.r.wave, t: 0 };
  setTimeout0(() => (G.scr = 'result'), win ? 700 : 500);
}
function setTimeout0(fn, ms) {
  if (G.bot) fn();
  else if (typeof setTimeout === 'function') setTimeout(fn, ms);
  else fn();
}

// —— 每帧 ——
let last = PF.now();
let acc = 0;
function frame() {
  const now = PF.now();
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.t += dt;
  if (G.hitstop > 0) {
    G.hitstop -= dt;
    dt *= 0.2;
  }
  if (G.tut) {
    G.tut.t += dt;
    if (G.tut.step >= 3 && G.tut.t > 3.5) G.tut = null;
  }
  const tutHold = G.tut && G.tut.step < 3 && !G.bot;
  if (G.scr === 'play' && G.st && !tutHold) {
    acc += dt * G.speed;
    let n = 0;
    while (acc >= 1 / 60 && n++ < 40 && G.scr === 'play') {
      acc -= 1 / 60;
      if (G.r.lv.mode === 'attack') G.st.targetX = S().botX(G.st);
      if (G.bot && G.r.lv.mode === 'defend' && Math.random() < 0.02) botCombine();
      S().step(G.st, 1 / 60);
      handleEvents();
    }
  }
  if (G.bot && G.scr === 'shop') botShop();
  if (G.banner > 0) G.banner -= dt;
  if (G.spotView) {
    G.spotView.t -= dt;
    if (G.spotView.t <= 0) G.spotView = null;
  }
  if (G.teach) {
    G.teach.t += dt;
    if (G.teach.t > 5) G.teach = null;
  }
  stepAz(dt);
  stepFx(dt);
  render();
}
function botCombine() {
  const r = G.r;
  for (let k = 0; k < 10; k++) {
    const m = D.MACHINES.find((mm) => r.recipes.indexOf(mm.id) >= 0 && mm.els.every((e) => r.mats[e] >= mm.els.filter((x) => x === e).length));
    if (!m) break;
    B.combine(r, m.els);
  }
  autoPlace(r);
}
function botShop() {
  const r = G.r;
  while (r.cards) B.pickCard(r, 0);
  for (let k = 0; k < 10; k++) {
    const m = D.MACHINES.find((mm) => r.recipes.indexOf(mm.id) >= 0 && mm.els.every((e) => r.mats[e] >= mm.els.filter((x) => x === e).length));
    if (!m) break;
    B.combine(r, m.els);
  }
  press('nextWave');
}

function stepFx(dt) {
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i];
    f.t += dt;
    if (f.t >= f.life) {
      G.fx.splice(i, 1);
      continue;
    }
    if (f.vx !== undefined) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.k === 'chunk') f.vy += 500 * dt;
    }
    if (f.k === 'orb') {
      const k = f.t / f.life;
      f.x = f.x0 + (f.tx - f.x0) * k * k;
      f.y = f.y0 + (f.ty - f.y0) * k - Math.sin(k * Math.PI) * 40;
    }
  }
  for (let i = G.pops.length - 1; i >= 0; i--) {
    const p = G.pops[i];
    p.t += dt;
    p.y -= 34 * dt;
    if (p.t > p.life) G.pops.splice(i, 1);
  }
  G.shake *= Math.pow(0.003, dt);
  if (G.flash > 0) G.flash -= dt;
}

// —— 画 ——
function render() {
  G.btns = [];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#120d0a';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, FW, FH);
  ctx.clip();
  if (G.scr === 'pick') drawPick();
  else if (G.scr === 'map' || G.scr === 'brief') drawMap();
  else if (G.scr === 'meta') drawMeta();
  else {
    ctx.save();
    ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
    if (G.r.lv.mode === 'defend') drawDefend();
    else drawAttack();
    drawFx();
    ctx.restore();
    drawHud();
    if (G.scr === 'play' && G.r.lv.mode === 'defend') drawLiveBench();
    if (G.tut && G.scr === 'play') drawTut();
    if (G.scr === 'shop') drawShop();
    if (G.scr === 'result') drawResult();
  }
  if (G.scr === 'brief') drawBrief();
  ctx.restore();
}

function drawBg(dark) {
  if (IMG.bg.ok) {
    const sc = Math.max(FW / IMG.bg.width, FH / IMG.bg.height);
    ctx.drawImage(IMG.bg, (FW - IMG.bg.width * sc) / 2, (FH - IMG.bg.height * sc) / 2, IMG.bg.width * sc, IMG.bg.height * sc);
  } else {
    ctx.fillStyle = CITY.ground;
    ctx.fillRect(0, 0, FW, FH);
  }
  ctx.fillStyle = 'rgba(10,6,4,' + dark + ')';
  ctx.fillRect(0, 0, FW, FH);
}

// 机关图标：五行颜色的圆 + 名字第一个字 + 阶数小点
function machineIcon(id, tier, x, y, s, hl) {
  const m = D.M[id];
  ctx.save();
  ctx.translate(x, y);
  const els = m.els;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(2, 3, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, s, Math.PI / 2, Math.PI * 1.5);
  ctx.fillStyle = D.EL[els[0]].col;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, s, -Math.PI / 2, Math.PI / 2);
  ctx.fillStyle = D.EL[els[1]].col;
  ctx.fill();
  ctx.strokeStyle = hl ? '#ffd65a' : LINE;
  ctx.lineWidth = hl ? 3 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.stroke();
  bigText(ctx, m.name[0], 0, 1, s * 1.05, '#fff8e6', LINE);
  for (let i = 0; i < tier; i++) {
    ctx.fillStyle = '#ffd65a';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc((i - (tier - 1) / 2) * 7, s + 5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// —— 守城 ——
let pathCache = null;
function drawDefend() {
  const st = G.st;
  drawBg(0.42);
  if (!pathCache) {
    pathCache = PF.createOffscreen(FW, FH);
    const g = pathCache.getContext('2d');
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const pts = [];
    for (let s = 0; s <= st.path.len; s += 6) pts.push(st.path.at(s));
    for (const [w, c] of [[40, '#1E1A16'], [36, '#7a5a34'], [26, '#9a7446']]) {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
    }
    g.setLineDash([4, 10]);
    g.strokeStyle = 'rgba(30,26,22,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
  }
  ctx.drawImage(pathCache, 0, 0);
  // 区域：网、泥、火墙、岩浆
  for (const z of st.zones) {
    if (z.kind === 'fire') {
      ctx.fillStyle = 'rgba(255,110,40,' + (0.25 + 0.15 * Math.sin(G.t * 20)) + ')';
      ctx.fillRect(0, z.y - 18, FW, 36);
      continue;
    }
    ctx.fillStyle = z.kind === 'mud' ? 'rgba(110,80,40,0.55)' : 'rgba(90,200,80,0.35)';
    for (let s = Math.max(0, z.s0); s < Math.min(st.path.len, z.s1); s += 14) {
      const p = st.path.at(s);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const z of st.pools) {
    ctx.fillStyle = 'rgba(255,90,20,0.35)';
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.R, 0, Math.PI * 2);
    ctx.fill();
  }
  // 龙：尾巴往头画
  for (const d of st.dragons) {
    const segs = F.alive(d);
    for (let i = segs.length - 1; i >= 0; i--) {
      const g = segs[i];
      if (g.s < -20) continue;
      const p = F.segXY(st, g);
      if (i === 0) {
        if (d.glow > 0) {
          ctx.fillStyle = 'rgba(255,40,20,' + (0.35 + 0.25 * Math.sin(G.t * 30)) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(d.boss ? 1.7 : 1.15, d.boss ? 1.7 : 1.15);
        RD.drawHead(ctx, 0, 0, p.a + Math.PI / 2, d.dash > 0 ? 1 : 0, G.t, 0);
        if (d.boss) {
          ctx.fillStyle = '#7c8791';
          ctx.strokeStyle = LINE;
          ctx.lineWidth = 1.5;
          ctx.rotate(p.a + Math.PI / 2);
          roundRect(ctx, -12, -20, 24, 10, 3);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      } else {
        RD.drawCar(ctx, p.x, p.y, p.a + Math.PI / 2, g.id, G.t, g.frozen > 0 ? 0.3 : 0);
        if (g.type === 'shield') {
          ctx.fillStyle = '#aab4bd';
          ctx.strokeStyle = LINE;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(p.a) * 10, p.y + Math.sin(p.a) * 10, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (g.type === 'powder') {
          ctx.fillStyle = '#9b3b26';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffcf4a';
          ctx.beginPath();
          ctx.arc(p.x + 5, p.y - 7, 2.5 + Math.sin(G.t * 20), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (g.burnT > 0) {
        ctx.fillStyle = 'rgba(255,120,40,0.5)';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 8, 5 + Math.sin(G.t * 25) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      bigText(ctx, String(Math.ceil(g.hp)), p.x, p.y + 1, g.hp >= 100 ? 9 : 11, '#fff8e6', LINE);
    }
  }
  // 城墙 + 城门（龙撞进门扣血）
  const wy = F.WALL_Y;
  ctx.fillStyle = '#6f5d4a';
  ctx.fillRect(0, wy - 6, FW, 50);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(-2, wy - 6, FW + 4, 50);
  for (let x = 4; x < FW; x += 30) {
    if (Math.abs(x + 9 - FW / 2) < 34) continue;
    ctx.fillStyle = '#7d6a55';
    ctx.fillRect(x, wy - 18, 18, 12);
    ctx.strokeRect(x, wy - 18, 18, 12);
  }
  ctx.fillStyle = '#3a2a1c';
  roundRect(ctx, FW / 2 - 24, wy - 4, 48, 46, 18);
  ctx.fill();
  drawAzhu(326, 640, 100);
  G.azAt = { x: 326, y: 634 };
  // 点位：城外高低不同的箭楼、土台
  const r = G.r;
  const hand = G.sel >= 0 ? D.M[r.bench[G.sel].id] : null;
  F.SPOTS.forEach((p, i) => {
    const open = i < r.slots.length;
    const mc = r.slots[i];
    // 射程圈：选中手上的机关时，空点位都画一圈；点了某个点位就画它的圈
    const showR = hand && open && (!mc || (mc.id === r.bench[G.sel].id && mc.tier === r.bench[G.sel].tier)) ? F.rangeOf(r, hand) : G.spotView && G.spotView.i === i && mc ? F.rangeOf(r, D.M[mc.id]) : 0;
    if (showR) {
      ctx.fillStyle = 'rgba(255,214,90,0.10)';
      ctx.strokeStyle = 'rgba(255,214,90,0.7)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, showR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 台子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x + 3, p.y + 14, 22, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = open ? '#8d7962' : 'rgba(70,58,46,0.7)';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    roundRect(ctx, p.x - 20, p.y - 8, 40, 22, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = open ? '#a8937a' : 'rgba(90,76,60,0.7)';
    roundRect(ctx, p.x - 17, p.y - 14, 34, 12, 4);
    ctx.fill();
    ctx.stroke();
    if (!open) {
      const cost = i === r.slots.length ? F.spotCost(r) : null;
      if (cost !== null) {
        const can = r.coins >= cost;
        G.btns.push({ id: 'buySpot', x: p.x - 26, y: p.y - 22, w: 52, h: 40 });
        ctx.fillStyle = can ? 'rgba(200,150,40,0.9)' : 'rgba(60,48,36,0.85)';
        roundRect(ctx, p.x - 26, p.y - 4, 52, 18, 9);
        ctx.fill();
        bigText(ctx, '修 ' + cost, p.x, p.y + 5, 11, can ? '#fff8e6' : '#a89880', LINE);
      } else bigText(ctx, '锁', p.x, p.y + 2, 11, '#a89880', LINE);
      return;
    }
    G.btns.push({ id: 'spot' + i, x: p.x - 24, y: p.y - 30, w: 48, h: 48 });
    if (mc) machineIcon(mc.id, mc.tier, p.x, p.y - 14, 14, G.spotView && G.spotView.i === i);
    else if (hand) {
      ctx.strokeStyle = 'rgba(255,214,90,' + (0.6 + 0.4 * Math.sin(G.t * 10)) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 8, 16, 0, Math.PI * 2);
      ctx.stroke();
      bigText(ctx, '放', p.x, p.y - 8, 12, '#ffd65a', LINE);
    }
  });
  // 子弹
  ctx.strokeStyle = '#fff3c4';
  ctx.lineWidth = 2.5;
  for (const b of st.bolts) {
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x, b.y + 14);
    ctx.stroke();
  }
  for (const s of st.shots) {
    if (s.kind === 'bolt') {
      ctx.fillStyle = s.mid === 'huochong' ? '#ff8a3a' : '#f1ede2';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.mid === 'huochong' ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.kind === 'lob') {
      const k = s.t / s.dur;
      const x = s.x + (s.tx - s.x) * k;
      const y = s.y + (s.ty - s.y) * k - Math.sin(k * Math.PI) * 80;
      ctx.fillStyle = s.mid === 'zhengqi' ? '#e8f0f4' : '#6e3b1c';
      ctx.strokeStyle = LINE;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (s.kind === 'blade') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(G.t * 20);
      ctx.strokeStyle = '#cfe8ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 1.4);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// —— 进攻 ——
function drawAttack() {
  const st = G.st;
  RD.drawGround(ctx, CITY, st.head.wy);
  const vis = (wy, m) => sy(wy) > -m && sy(wy) < FH + m;
  for (const f of st.fences) if (vis((f.wy0 + f.wy1) / 2, 160)) RD.drawFence(ctx, f.x, sy(f.wy1), sy(f.wy0));
  st.legEnds.forEach((wy, i) => {
    if (i >= st.legEnds.length - 1 || !vis(wy, 30)) return;
    const y = sy(wy);
    ctx.fillStyle = 'rgba(200,64,44,0.85)';
    ctx.fillRect(0, y - 12, FW, 24);
    bigText(ctx, '驿 站 · 停下来合机关', FW / 2, y, 14, '#fff8e6', LINE);
  });
  for (const it of st.items) {
    if (!it.alive || !vis(it.wy, 30)) continue;
    RD.drawGear(ctx, it.x, sy(it.wy), 10, G.t);
    bigText(ctx, '+' + it.n, it.x, sy(it.wy) - 18, 13, '#9dff7a', LINE);
  }
  for (const b of st.blocks) if (b.alive && vis(b.wy, 220)) RD.drawBlock(ctx, CITY, b, sy(b.wy), G.t, st.chewing === b ? 2.5 : 0, false);
  for (const bo of st.bolts) RD.drawBolt(ctx, bo.x, sy(bo.wy));
  for (const s of st.shots) RD.drawShot(ctx, s.x, sy(s.wy));
  // 车
  const segs = A.segments(st, A.bodyLen(st)).map((p) => ({ x: p.x, y: sy(p.wy) }));
  const r = G.r;
  if (st.car === 'dragon') {
    for (let i = segs.length - 1; i >= 1; i--) {
      const p = segs[i];
      const q = segs[i - 1];
      const a = Math.atan2(q.x - p.x, p.y - q.y);
      RD.drawCar(ctx, p.x, p.y, a, i, G.t, G.flash > 0 && G.flashCol === '#ff4a2a' ? G.flash * 3 : 0);
      if (r.slots[i - 1]) machineIcon(r.slots[i - 1].id, r.slots[i - 1].tier, p.x, p.y, 9);
    }
    RD.drawHead(ctx, segs[0].x, segs[0].y, 0, st.chewing ? 1 : 0, G.t, st.guard > 0 ? 1 : 0);
  } else {
    // 小工程车：一辆黄铜车，车上的格子
    const p = segs[0];
    ctx.save();
    ctx.translate(p.x, p.y + 8);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, -20, -18, 44, 52, 8);
    ctx.fill();
    ctx.fillStyle = '#3a2a1c';
    for (const [wx, wyy] of [[-22, -10], [17, -10], [-22, 18], [17, 18]]) ctx.fillRect(wx, wyy, 5, 10);
    ctx.fillStyle = RD.BRASS;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    roundRect(ctx, -18, -22, 36, 50, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7a1e14';
    roundRect(ctx, -12, -30, 24, 12, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    r.slots.forEach((s, i) => {
      const cx = p.x + (r.slots.length > 1 ? (i % 2 ? 9 : -9) : 0);
      const cy = p.y + 4 + Math.floor(i / 2) * 18;
      if (s) machineIcon(s.id, s.tier, cx, cy, 8);
      else {
        ctx.strokeStyle = 'rgba(30,26,22,0.6)';
        ctx.strokeRect(cx - 7, cy - 7, 14, 14);
      }
    });
    if (st.guard > 0) {
      ctx.strokeStyle = 'rgba(120,220,100,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawFx() {
  for (const f of G.fx) {
    const a = 1 - f.t / f.life;
    ctx.save();
    ctx.globalAlpha = clamp(a * 1.5, 0, 1);
    if (f.k === 'chunk') {
      ctx.fillStyle = f.col;
      ctx.fillRect(f.x - f.s / 2, f.y - f.s / 2, f.s, f.s);
    } else if (f.k === 'spark') {
      ctx.strokeStyle = f.col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x - f.vx * 0.04, f.y - f.vy * 0.04);
      ctx.stroke();
    } else if (f.k === 'star') {
      // 白色放射刺光
      ctx.translate(f.x, f.y);
      ctx.fillStyle = '#ffffff';
      const k = 1 + (f.t / f.life) * 0.6;
      for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(0, -22 * k * (i % 2 ? 0.6 : 1));
        ctx.lineTo(3, -3);
        ctx.fill();
      }
    } else if (f.k === 'smoke') {
      ctx.fillStyle = 'rgba(240,236,228,0.5)';
      ctx.beginPath();
      ctx.arc(f.x, f.y - f.t * 30, 6 + f.t * 16, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.k === 'orb') {
      ctx.fillStyle = f.col;
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (f.k === 'ring') {
      ctx.strokeStyle = '#ffb04a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.R * (0.5 + f.t / f.life), 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.k === 'bolt') {
      ctx.strokeStyle = '#9fe8ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      f.pts.forEach((p, i) => (i ? ctx.lineTo(p.x + (Math.random() - 0.5) * 6, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.restore();
  }
  for (const p of G.pops) {
    ctx.save();
    ctx.globalAlpha = clamp(1 - (p.t / p.life - 0.6) / 0.4, 0, 1);
    bigText(ctx, p.text, p.x, p.y, p.size * easeOutBack(Math.min(1, p.t / 0.15)), p.col, LINE);
    ctx.restore();
  }
  if (G.flash > 0) {
    ctx.fillStyle = G.flashCol;
    ctx.globalAlpha = Math.min(0.45, G.flash);
    ctx.fillRect(0, 0, FW, FH);
    ctx.globalAlpha = 1;
  }
}

function drawHud() {
  const r = G.r;
  const st = G.st;
  ctx.fillStyle = 'rgba(20,14,10,0.78)';
  ctx.fillRect(0, 0, FW, 52);
  bigText(ctx, r.lv.id + ' · ' + (r.lv.mode === 'defend' ? '守城' : '进攻'), 10, 14, 13, '#fff8e6', LINE, 'left');
  const wv = Math.min(r.wave + 1, r.lv.waves);
  if (r.lv.mode === 'defend') bigText(ctx, '第 ' + wv + '/' + r.lv.waves + ' 波' + (G.scr === 'play' ? ' · ' + Math.max(0, Math.ceil(st.waveT)) + ' 秒' : ''), 10, 34, 12, '#ffd65a', LINE, 'left');
  else bigText(ctx, '第 ' + wv + '/' + r.lv.waves + ' 段', 10, 34, 12, '#ffd65a', LINE, 'left');
  // 血
  const bx = 112;
  const bw = 90;
  ctx.fillStyle = '#3a2c20';
  roundRect(ctx, bx, 8, bw, 12, 6);
  ctx.fill();
  ctx.fillStyle = r.hp / r.hpMax < 0.3 ? '#ff5a3a' : '#6fcf5a';
  roundRect(ctx, bx, 8, Math.max(6, (bw * r.hp) / r.hpMax), 12, 6);
  ctx.fill();
  bigText(ctx, Math.ceil(r.hp) + '/' + r.hpMax, bx + bw / 2, 14, 10, '#fff8e6', LINE);
  RD.drawGear(ctx, bx + 6, 36, 7, G.t);
  bigText(ctx, String(r.coins), bx + 18, 36, 13, '#ffd65a', LINE, 'left');
  // 五行口袋
  D.ELS.forEach((e, i) => {
    const x = 214 + i * 28;
    ctx.fillStyle = D.EL[e].col;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, 18, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    bigText(ctx, D.EL[e].name, x, 18, 10, LINE, '#fff8e6');
    bigText(ctx, String(r.mats[e]), x, 38, 12, '#fff8e6', LINE);
  });
  if (G.banner > 0 && G.scr === 'play' && !(G.tut && G.tut.step < 3)) {
    ctx.save();
    ctx.globalAlpha = clamp(G.banner / 0.3, 0, 1);
    ctx.fillStyle = 'rgba(20,14,10,0.8)';
    ctx.fillRect(0, 250, FW, 80);
    bigText(ctx, r.wave === 0 ? r.lv.story : '第 ' + (r.wave + 1) + ' 波', FW / 2, 280, r.wave === 0 ? 16 : 24, '#ffd65a', LINE);
    bigText(ctx, r.lv.mode === 'defend' ? '合机关、摆点位，守住城门！' : '车自己开，你在驿站合机关、装上车', FW / 2, 308, 14, '#fff8e6', LINE);
    ctx.restore();
  }
  if (G.teach && G.scr === 'play' && G.banner <= 0) {
    ctx.fillStyle = 'rgba(26,18,12,0.88)';
    roundRect(ctx, 16, 430, FW - 32, 40, 10);
    ctx.fill();
    bigText(ctx, G.teach.text, FW / 2, 450, 12, '#ffe9b0', LINE);
  }
}

// —— 守城：打的时候常驻在下面的机关台（照《赵云与阿斗》边打边合）——
function canMake(r) {
  return D.MACHINES.some((m) => r.recipes.indexOf(m.id) >= 0 && m.els.every((e) => r.mats[e] >= m.els.filter((x) => x === e).length));
}
function drawLiveBench() {
  const r = G.r;
  const y0 = 642;
  ctx.fillStyle = 'rgba(16,10,6,0.86)';
  roundRect(ctx, 4, y0, FW - 8, 76, 12);
  ctx.fill();
  if (canMake(r)) {
    ctx.strokeStyle = 'rgba(255,214,90,' + (0.5 + 0.4 * Math.sin(G.t * 8)) + ')';
    ctx.lineWidth = 3;
    roundRect(ctx, 4, y0, FW - 8, 76, 12);
    ctx.stroke();
  }
  // 五种材料（点了放进格子）
  D.ELS.forEach((e, i) => {
    const x = 10 + i * 40;
    const left = r.mats[e] - G.benchSel.filter((q) => q === e).length;
    btn('mat_' + e, x, y0 + 6, 36, 30, D.EL[e].name + left, left > 0 ? D.EL[e].dark : '#3a3028', '', { size: 12, dis: left <= 0 });
  });
  // 格子 + 合
  for (let i = 0; i < r.bench2; i++) {
    const x = 214 + i * 34;
    const e = G.benchSel[i];
    G.btns.push({ id: 'bs' + i, x, y0: 0, y: y0 + 6, w: 30, h: 30 });
    ctx.fillStyle = e ? D.EL[e].col : '#2a2018';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y0 + 6, 30, 30, 7);
    ctx.fill();
    ctx.stroke();
    if (e) bigText(ctx, D.EL[e].name, x + 15, y0 + 21, 14, LINE, '#fff8e6');
  }
  const pv = B.preview(r, G.benchSel);
  const lbl = pv.state === 'ok' ? '合 ' + pv.m.name : pv.state === 'locked' ? '没配方' : pv.state === 'none' ? '合不出' : '放 2 个';
  btn('combine', 214 + r.bench2 * 34, y0 + 6, FW - 222 - r.bench2 * 34, 30, lbl, pv.state === 'ok' ? '#3f8a3a' : '#4a3e34', '', { size: 12, dis: pv.state !== 'ok' });
  // 第二行：手上的机关（点一下选中，再点地图上亮着的点位）
  if (r.bench.length) {
    bigText(ctx, '手上：', 12, y0 + 56, 11, '#cbb8a8', LINE, 'left');
    r.bench.forEach((m, i) => {
      const x = 64 + i * 34;
      if (x > FW - 20) return;
      G.btns.push({ id: 'tray' + i, x: x - 15, y: y0 + 41, w: 30, h: 30 });
      machineIcon(m.id, m.tier, x, y0 + 55, 11, G.sel === i);
    });
    if (G.sel >= 0) bigText(ctx, '点亮着的点位放下', FW - 12, y0 + 56, 11, '#ffd65a', LINE, 'right');
  } else {
    const tip = pv.state === 'ok' ? pv.m.tip.split(' / ')[0] : canMake(r) ? '有能合的！点两个材料' : '打碎龙节会掉材料，飞进上面';
    bigText(ctx, tip, FW / 2, y0 + 56, 11, pv.state === 'ok' ? '#ffd65a' : '#cbb8a8', LINE);
  }
}

// —— 波间：属性卡 → 机关台 + 小店 ——
function drawShop() {
  const r = G.r;
  ctx.fillStyle = 'rgba(12,8,6,0.9)';
  ctx.fillRect(0, 52, FW, FH - 52);
  if (r.cards) return drawCards();
  const res = G.waveRes || { coins: 0 };
  bigText(ctx, '第 ' + r.wave + ' 波守住了' + (res.coins ? '  收获 +' + res.coins : ''), FW / 2, 72, 16, '#ffd65a', LINE);
  // 点位
  bigText(ctx, r.lv.mode === 'defend' ? '守城点位（想换位置：点下面的机关，再点这里）' : '车上的格子（点下面的机关，再点这里装上去）', FW / 2, 96, 11, '#cbb8a8', LINE);
  const n = r.slots.length;
  const sw = Math.min(40, (FW - 30) / n - 4);
  r.slots.forEach((s, i) => {
    const x = FW / 2 - (n * (sw + 4)) / 2 + i * (sw + 4);
    G.btns.push({ id: 'slot' + i, x, y: 106, w: sw, h: sw });
    ctx.fillStyle = '#4a3a2a';
    ctx.strokeStyle = G.sel >= 0 ? '#ffd65a' : LINE;
    ctx.lineWidth = 2;
    roundRect(ctx, x, 106, sw, sw, 8);
    ctx.fill();
    ctx.stroke();
    if (s) machineIcon(s.id, s.tier, x + sw / 2, 106 + sw / 2 - 2, sw * 0.36);
  });
  // 羁绊
  const bc = B.bondCount(r);
  D.ELS.forEach((e, i) => {
    const x = 40 + i * 70;
    ctx.fillStyle = bc[e] >= 2 ? D.EL[e].col : '#4a3e34';
    roundRect(ctx, x - 28, 152, 56, 18, 9);
    ctx.fill();
    bigText(ctx, D.EL[e].name + ' ' + bc[e] + '/6', x, 161, 11, bc[e] >= 2 ? LINE : '#a89880', bc[e] >= 2 ? '#fff8e6' : LINE);
  });
  if (r.lv.mode === 'defend') {
    bigText(ctx, '守城时合成在打的时候做；这里升级、买东西', FW / 2, 196, 12, '#cbb8a8', LINE);
  } else {
  // 机关台（进攻：在驿站合）
  bigText(ctx, '机关台：点材料放进来', FW / 2, 186, 12, '#fff8e6', LINE);
  D.ELS.forEach((e, i) => {
    const x = 22 + i * 64;
    const left = r.mats[e] - G.benchSel.filter((q) => q === e).length;
    btn('mat_' + e, x, 198, 54, 36, D.EL[e].name + ' ' + left, left > 0 ? D.EL[e].dark : '#3a3028', '', { size: 15, dis: left <= 0 });
  });
  for (let i = 0; i < r.bench2; i++) {
    const x = 70 + i * 58;
    const e = G.benchSel[i];
    G.btns.push({ id: 'bs' + i, x, y: 244, w: 48, h: 48 });
    ctx.fillStyle = e ? D.EL[e].col : '#2a2018';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    roundRect(ctx, x, 244, 48, 48, 10);
    ctx.fill();
    ctx.stroke();
    if (e) bigText(ctx, D.EL[e].name, x + 24, 268, 20, LINE, '#fff8e6');
  }
  const pv = B.preview(r, G.benchSel);
  const lbl = pv.state === 'ok' ? '合成 ' + pv.m.name : pv.state === 'locked' ? '配方没开：' + pv.m.name : pv.state === 'none' ? '合不出' : '放 2 个';
  btn('combine', 70 + r.bench2 * 58, 244, FW - 86 - r.bench2 * 58, 48, lbl, pv.state === 'ok' ? '#3f8a3a' : '#4a3e34', pv.state === 'ok' ? pv.m.tip.split(' / ')[r.lv.mode === 'defend' ? 0 : 1] : '', { size: 14, dis: pv.state !== 'ok' });
  }
  drawAzhu(36, 298, 70);
  G.azAt = { x: 46, y: 292 };
  // 做好的机关
  bigText(ctx, r.bench.length ? '手上的机关（点一下选中，再点上面的格子装上去）' : '合好的机关会放在这里', FW / 2, 306, 11, '#cbb8a8', LINE);
  r.bench.forEach((m, i) => {
    const x = 24 + i * 46;
    if (x > FW - 70) return;
    G.btns.push({ id: 'tray' + i, x: x - 18, y: 318, w: 40, h: 40 });
    machineIcon(m.id, m.tier, x + 2, 336, 15, G.sel === i);
  });
  if (G.sel >= 0) btn('sell', FW - 62, 318, 52, 32, '拆掉', '#6b3a2a', '', { size: 13 });
  // 小店
  bigText(ctx, '小 店', 40, 382, 15, '#ffd65a', LINE);
  btn('refresh', FW - 118, 368, 108, 28, '刷新 ' + B.refreshCost(r), '#5a4a3a', '', { size: 13 });
  r.shop.forEach((o, i) => {
    const x = 12 + (i % 2) * 172;
    const y = 404 + Math.floor(i / 2) * 104;
    drawOffer(o, i, x, y, 164, 96);
  });
  btn('nextWave', 60, 628, FW - 120, 60, r.lv.mode === 'defend' ? '下一波' : '继续冲', '#c8402c', '', { size: 24 });
}

function drawOffer(o, i, x, y, w, h) {
  const r = G.r;
  ctx.fillStyle = o.sold ? '#2a2018' : '#3a2a1e';
  ctx.strokeStyle = r.locked[i] ? '#ffd65a' : '#9a6a22';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  if (o.sold) {
    bigText(ctx, '已买', x + w / 2, y + h / 2, 16, '#8a7a66', LINE);
    return;
  }
  let name;
  let desc;
  if (o.kind === 'item') {
    const it = D.IT[o.id];
    name = it.name + '（' + it.tier + ' 阶）';
    desc = it.desc || Object.keys(it.st).map((k) => D.STATS[k].name + (it.st[k] > 0 ? ' +' : ' ') + it.st[k] + D.STATS[k].unit).join('，');
  } else if (o.kind === 'machine') {
    name = '机关：' + D.M[o.id].name;
    desc = D.M[o.id].tip.split(' / ')[r.lv.mode === 'defend' ? 0 : 1];
    machineIcon(o.id, 1, x + w - 18, y + 18, 11);
  } else {
    name = D.EL[o.id].name + ' × ' + o.n;
    desc = '材料';
  }
  bigText(ctx, name, x + 8, y + 18, 13, '#fff8e6', LINE, 'left');
  wrap(desc, x + 8, y + 40, w - 16, 11);
  G.btns.push({ id: 'buy' + i, x, y, w: w - 40, h });
  const can = r.coins >= o.price;
  btn('lock' + i, x + w - 38, y + h - 30, 32, 24, r.locked[i] ? '锁' : '开', '#4a3a2a', '', { size: 11 });
  bigText(ctx, o.price + ' 铜钱', x + 8, y + h - 16, 13, can ? '#ffd65a' : '#a06a5a', LINE, 'left');
}
function wrap(text, x, y, maxW, size) {
  ctx.font = '900 ' + size + 'px "PingFang SC", "Heiti SC", sans-serif';
  let line = '';
  let yy = y;
  for (const c of text) {
    if (ctx.measureText(line + c).width > maxW) {
      bigText(ctx, line, x, yy, size, '#ffe9c4', LINE, 'left');
      line = c;
      yy += size + 5;
    } else line += c;
  }
  if (line) bigText(ctx, line, x, yy, size, '#ffe9c4', LINE, 'left');
}
function drawCards() {
  const r = G.r;
  bigText(ctx, '升级了！挑一个属性', FW / 2, 120, 22, '#ffd65a', LINE);
  r.cards.forEach((c, i) => {
    const y = 160 + i * 112;
    const st = D.STATS[c.k];
    const el = D.EL[st.el];
    ctx.fillStyle = '#3a2a1e';
    ctx.strokeStyle = el.col;
    ctx.lineWidth = 3;
    roundRect(ctx, 30, y, FW - 60, 96, 14);
    ctx.fill();
    ctx.stroke();
    G.btns.push({ id: 'card' + i, x: 30, y, w: FW - 60, h: 96 });
    ctx.fillStyle = el.col;
    ctx.beginPath();
    ctx.arc(76, y + 48, 26, 0, Math.PI * 2);
    ctx.fill();
    bigText(ctx, el.name, 76, y + 48, 24, LINE, '#fff8e6');
    bigText(ctx, st.name + ' +' + c.v + st.unit, 120, y + 38, 22, '#fff8e6', LINE, 'left');
    bigText(ctx, ['一', '二', '三', '四'][c.tier] + ' 阶', 120, y + 66, 13, '#ffd65a', LINE, 'left');
  });
}

function drawResult() {
  const g = G.result;
  ctx.fillStyle = 'rgba(12,8,6,0.88)';
  ctx.fillRect(0, 0, FW, FH);
  bigText(ctx, g.win ? (G.r.lv.mode === 'defend' ? '守住了！' : '城门破了！') : G.r.lv.mode === 'defend' ? '城墙破了' : g.left ? '差 ' + g.left + ' 点就撞开了' : '车撞烂了', FW / 2, 180, 34, g.win ? '#ffd65a' : '#ff8a5a', LINE);
  bigText(ctx, '墨晶 +' + g.mojing + (g.pages ? '   配方残页 +' + g.pages : ''), FW / 2, 240, 17, '#fff8e6', LINE);
  if (g.chars.length) bigText(ctx, '神机字块：' + g.chars.join(' '), FW / 2, 272, 17, '#9fe8ff', LINE);
  const sj = D.SHENJI[0];
  bigText(ctx, '墨斗：墨 ' + (meta.chars['墨'] || 0) + '/' + sj.need + '  斗 ' + (meta.chars['斗'] || 0) + '/' + sj.need, FW / 2, 300, 13, '#cbb8a8', LINE);
  if (g.newShenji) bigText(ctx, '凑齐神机「墨斗」！开局送一件机关', FW / 2, 330, 16, '#ffd65a', LINE);
  if (g.newB && g.newB.length) bigText(ctx, '解锁新机关师：' + g.newB.join('、') + '（下次重来时可选）', FW / 2, 356, 13, '#9dff7a', LINE);
  btn('again', 60, 380, FW - 120, 64, g.win ? '再打一次' : '再来！', '#c8402c');
  btn('toMap', 60, 460, FW - 120, 56, '回地图', '#3f6a5a');
  btn('meta', 60, 530, FW - 120, 50, '工坊（花墨晶变强）', '#8a5a1e', '', { size: 16 });
}

// —— 地图 ——
const NODE_POS = [[180, 640], [96, 580], [190, 520], [270, 455], [170, 395], [80, 330], [175, 265], [265, 200], [80, 140], [280, 120]];
function drawMap() {
  drawBg(0.45);
  ctx.fillStyle = 'rgba(20,14,10,0.8)';
  ctx.fillRect(0, 0, FW, 64);
  bigText(ctx, '墨守 · 边城', 14, 22, 20, '#ffd65a', LINE, 'left');
  bigText(ctx, '墨晶 ' + meta.mojing + '   残页 ' + meta.pages, 14, 46, 12, '#fff8e6', LINE, 'left');
  btn('meta', FW - 92, 12, 80, 40, '工坊', '#8a5a1e');
  // 连线
  ctx.strokeStyle = 'rgba(255,214,90,0.5)';
  ctx.lineWidth = 4;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  NODE_POS.slice(0, 8).forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.stroke();
  ctx.setLineDash([]);
  D.LEVELS.forEach((lv, i) => {
    const [x, y] = NODE_POS[i];
    const open = unlocked(i);
    const done = !!meta.camp.cleared[lv.id];
    const R = lv.boss ? 26 : lv.challenge ? 20 : 22;
    G.btns.push({ id: 'node' + i, x: x - R, y: y - R, w: R * 2, h: R * 2 });
    ctx.fillStyle = !open ? '#4a3e34' : lv.mode === 'defend' ? '#3f6a5a' : '#a0402c';
    ctx.strokeStyle = done ? '#ffd65a' : LINE;
    ctx.lineWidth = done ? 4 : 2.5;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    bigText(ctx, lv.challenge ? '挑战' : lv.id.slice(2), x, y - 3, lv.challenge ? 12 : 16, open ? '#fff8e6' : '#8a7a66', LINE);
    bigText(ctx, lv.mode === 'defend' ? '守' : '攻', x, y + 12, 10, '#ffe9b0', LINE);
    if (lv.boss) bigText(ctx, 'Boss', x, y - R - 8, 11, '#ff8a5a', LINE);
  });
  btn('old', 10, FH - 44, 120, 34, '0.5 旧玩法', '#4a3a2a', '', { size: 12 });
  const cb = D.BUILDERS.find((x) => x.id === meta.camp.builder);
  drawAzhu(312, FH - 62, 120);
  bigText(ctx, '机关师：' + cb.name, FW - 14, FH - 34, 13, '#ffd65a', LINE, 'right');
  btn('restart', FW - 130, FH - 26 - 0, 120, 22, '换人 = 从头再来', '#4a3a2a', '', { size: 11 });
  if (G.confirm) {
    ctx.fillStyle = 'rgba(10,6,4,0.82)';
    ctx.fillRect(0, 0, FW, FH);
    ctx.fillStyle = '#2b1f16';
    roundRect(ctx, 30, 250, FW - 60, 200, 14);
    ctx.fill();
    bigText(ctx, '换机关师要从 1-1 重新开始', FW / 2, 286, 17, '#ffd65a', LINE);
    wrap('这一趟的关卡进度会清掉；墨晶、配方、神机、解锁的机关师都还在。', 50, 320, FW - 100, 12);
    btn('restartYes', 50, 380, 120, 50, '重新开始', '#c8402c', '', { size: 16 });
    btn('restartNo', FW - 170, 380, 120, 50, '算了', '#3f6a5a', '', { size: 16 });
  }
}
function drawBrief() {
  const lv = D.LEVELS[G.lvIdx];
  ctx.fillStyle = 'rgba(10,6,4,0.8)';
  ctx.fillRect(0, 0, FW, FH);
  ctx.fillStyle = '#2b1f16';
  ctx.strokeStyle = '#9a6a22';
  ctx.lineWidth = 3;
  roundRect(ctx, 12, 70, FW - 24, 630, 16);
  ctx.fill();
  ctx.stroke();
  bigText(ctx, lv.id + (lv.boss ? ' · Boss' : '') + (lv.challenge ? ' · 挑战' : ''), FW / 2, 98, 20, '#ffd65a', LINE);
  wrap(lv.story, 30, 128, FW - 60, 14);
  const mode = lv.mode === 'defend' ? '守城：边打边合机关，自己挑路边的点位放，射程圈里的才打得到' : (lv.car === 'dragon' ? '进攻：机关龙（' + metaNow().dragonLen + ' 格）' : '进攻：小工程车（' + metaNow().cartSlots + ' 格）') + '自己开，你在驿站合机关、装上车';
  wrap(mode, 30, 170, FW - 60, 12);
  const cb = D.BUILDERS.find((x) => x.id === meta.camp.builder);
  bigText(ctx, '机关师：' + cb.name + '（这一趟一直用他）', FW / 2, 230, 14, '#ffd65a', LINE);
  wrap('擅长：' + cb.good + '　加：' + cb.plus + '　减：' + cb.minus, 30, 260, FW - 60, 12);
  btn('go', 50, 630, FW - 100, 56, '出 发', '#c8402c', '', { size: 22 });
  btn('back', FW - 62, 78, 40, 30, '×', '#4a3a2a', '', { size: 16 });
}

// —— 开一趟战役：选机关师（选了就一直用，换人要从头再来）——
function drawPick() {
  drawBg(0.6);
  ctx.fillStyle = 'rgba(20,14,10,0.85)';
  ctx.fillRect(0, 0, FW, 64);
  bigText(ctx, '选一位机关师', 14, 24, 20, '#ffd65a', LINE, 'left');
  bigText(ctx, '选了这一趟就一直用他；想换人得从 1-1 重新开始', 14, 48, 11, '#fff8e6', LINE, 'left');
  const n = D.BUILDERS.filter(bUnlocked).length;
  bigText(ctx, '已解锁 ' + n + ' / ' + D.BUILDERS.length + '（往后打才能解锁更多）', FW / 2, 84, 13, '#fff8e6', LINE);
  D.BUILDERS.forEach((b, i) => {
    const x = 26 + (i % 6) * 52;
    const y = 100 + Math.floor(i / 6) * 58;
    const ok = bUnlocked(b);
    const view = (G.bldView || 'azhu') === b.id;
    G.btns.push({ id: 'bld_' + b.id, x, y, w: 46, h: 52 });
    ctx.fillStyle = ok ? '#3a2a1e' : '#241a12';
    ctx.strokeStyle = view ? '#ffd65a' : b.change ? '#7a4aa0' : LINE;
    ctx.lineWidth = view ? 3 : 1.5;
    roundRect(ctx, x, y, 46, 52, 8);
    ctx.fill();
    ctx.stroke();
    bigText(ctx, ok ? b.name[0] : '？', x + 23, y + 20, 20, ok ? '#fff8e6' : '#6a5a48', LINE);
    bigText(ctx, b.name.length > 3 ? b.name.slice(0, 3) : b.name, x + 23, y + 42, 10, ok ? '#ffe9b0' : '#7a6a56', LINE);
    if (!ok) bigText(ctx, '锁', x + 38, y + 8, 9, '#ffd65a', LINE);
  });
  const b = D.BUILDERS.find((x) => x.id === (G.bldView || 'azhu'));
  const ok = bUnlocked(b);
  const dy = 340;
  ctx.fillStyle = 'rgba(31,22,15,0.95)';
  roundRect(ctx, 20, dy, FW - 40, 200, 12);
  ctx.fill();
  bigText(ctx, b.name + (b.change ? '（换打法）' : ''), 34, dy + 22, 18, ok ? '#ffd65a' : '#a89880', LINE, 'left');
  if (!ok) bigText(ctx, '未解锁：' + b.unlock, FW - 34, dy + 22, 11, '#ff9a6a', LINE, 'right');
  wrap('擅长：' + b.good + ' · ' + b.line, 34, dy + 54, FW - 68, 13);
  wrap('加：' + b.plus, 34, dy + 92, FW - 68, 13);
  wrap('减：' + b.minus, 34, dy + 146, FW - 68, 13);
  btn('pickGo', 50, 570, FW - 100, 60, ok ? '就选' + b.name + '，开始' : '还没解锁', ok ? '#c8402c' : '#4a3e34', '', { size: 20, dis: !ok });
  btn('old', 10, FH - 44, 120, 34, '0.5 旧玩法', '#4a3a2a', '', { size: 12 });
}

// —— 工坊（局外）——
function drawMeta() {
  drawBg(0.6);
  ctx.fillStyle = 'rgba(20,14,10,0.85)';
  ctx.fillRect(0, 0, FW, 64);
  bigText(ctx, '工坊', 14, 24, 22, '#ffd65a', LINE, 'left');
  bigText(ctx, '墨晶 ' + meta.mojing + '   配方残页 ' + meta.pages, 14, 48, 12, '#fff8e6', LINE, 'left');
  btn('toMap', FW - 92, 12, 80, 40, '回地图', '#3f6a5a', '', { size: 15 });
  const NOW = {
    slots: () => '现在 ' + metaNow().slots + ' 个',
    bench: () => '现在 ' + metaNow().bench + ' 格（3 格才能合三合，下一版加）',
    wallHp: () => '现在 ' + metaNow().wallHp,
    cartSlots: () => '现在 ' + metaNow().cartSlots + ' 格',
    dragonLen: () => '现在 ' + metaNow().dragonLen + ' 节',
  };
  Object.keys(META_KEYS).forEach((k, i) => {
    const c = metaCost(k);
    const y = 76 + i * 54;
    btn('up_' + k, 16, y, FW - 32, 48, D.META[k].name + (c === null ? '（满）' : '  ' + c + ' 墨晶'), c !== null && meta.mojing >= c ? '#8a5a1e' : '#4a3e34', NOW[k](), { size: 15 });
  });
  bigText(ctx, '配方书（每张 3 张残页）', FW / 2, 362, 15, '#ffd65a', LINE);
  D.MACHINES.forEach((m, i) => {
    const x = 20 + (i % 5) * 66;
    const y = 382 + Math.floor(i / 5) * 76;
    const own = meta.recipes.indexOf(m.id) >= 0;
    G.btns.push({ id: 'rec_' + m.id, x, y, w: 60, h: 70 });
    ctx.fillStyle = own ? '#3a2a1e' : '#241a12';
    roundRect(ctx, x, y, 60, 70, 8);
    ctx.fill();
    machineIcon(m.id, 1, x + 30, y + 26, 15);
    bigText(ctx, m.name, x + 30, y + 56, 11, own ? '#fff8e6' : '#7a6a56', LINE);
    if (!own) bigText(ctx, '锁', x + 50, y + 10, 11, '#ffd65a', LINE);
  });
  const sj = D.SHENJI[0];
  bigText(ctx, '神机图谱 · 墨斗：' + (meta.shenji[sj.id] ? '已凑齐（开局送一件机关）' : '墨 ' + (meta.chars['墨'] || 0) + '/' + sj.need + '  斗 ' + (meta.chars['斗'] || 0) + '/' + sj.need), FW / 2, 628, 13, '#9fe8ff', LINE);
  bigText(ctx, '（其余 11 件神机、21 个机关师、三合以上机关在后面的版本加）', FW / 2, 652, 10, '#a89880', LINE);
}

SH.register('mo', { onTouch, frame, enter: () => (last = PF.now()) });
PF.exposeForTest('__mo', { G, meta, D, B, F, A, startLevel, press, saveMeta, scale, ox, oy, metaNow });
