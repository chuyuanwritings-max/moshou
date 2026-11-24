// 《墨守》0.6 · 主程序：地图 → 一关（守城 / 进攻，3 波）→ 波间机关台 + 小店 → 结算 → 局外工坊。
// 规则在 defend.js / attack.js / build.js，数据在 data.js；画法借 ram/draw.js（祝有好收获画风）。
const PF = require('../platform.js');
const SH = require('../shell.js');
const D = require('./data.js');
const B = require('./build.js');
const F = require('./defend.js');
const A = require('./attack.js');
const RD = require('../ram/draw.js');
const CS = require('../cs.js');
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
const IMG = { bg: PF.loadImage('素材/bg_city.jpg'), hero: PF.loadImage('素材/hero.png'), azIdle: PF.loadImage('素材/azhu_idle.png'), azSwing: PF.loadImage('素材/azhu_swing.png'), pano: PF.loadImage('素材/pano_city.jpg') };

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
  G.finished = false;
  const lv = D.LEVELS[i];
  const seed = ((PF.now() % 1000000007) ^ (meta.runs * 2654435761)) >>> 0;
  G.r = B.newRun(metaNow(), lv, meta.camp.builder, seed || 1);
  G.st = lv.mode === 'defend' ? F.newDefend(G.r) : A.newAttack(G.r);
  G.scr = 'play';
  G.fx.length = 0;
  G.pops.length = 0;
  G.combo = { n: 0, t: -9, best: 0, bump: 0 };
  G.banner = 1.6;
  G.benchSel = [];
  G.sel = -1;
  G.teach = lv.teach && !meta.seenTeach[lv.id] ? { text: lv.teach, t: 0 } : null;
  G.tut = lv.id === '1-1' && !meta.tutDone ? { step: 0, t: 0 } : null;
  if (G.tut) G.teach = null;
  meta.seenTeach[lv.id] = 1;
  saveMeta();
  handleEvents();
  // 开局运镜（模板 F）：摇过边城，硬切推到这一关的敌人；同一关第二次起只播短版
  G.cs = null;
  if (!G.bot) {
    G.cs = CS.levelPan(ctx, {
      id: lv.id,
      img: IMG.bg,
      pano: IMG.pano,
      place: lv.id + ' · ' + lv.story,
      title: lv.mode === 'defend' ? (lv.boss ? '铁头龙来了！' : '机关长龙来了！') : lv.boss ? '弩车守着城门！' : '撞开城门！',
      drawFocus: (g, x, y) => drawPanFocus(g, x, y, lv),
      sfx: (n) => snd(n === 'impact' ? 'boom' : n, 0, 0.6),
      onEnd: () => {
        G.cs = null;
        G.banner = 1.4;
      },
    });
  }
}
// 运镜最后推到的那个敌人：守城画龙（Boss 关大一号、发红光），进攻画要撞的城门
function drawPanFocus(g, x, y, lv) {
  g.save();
  g.translate(x, y);
  if (lv.mode === 'defend') {
    const k = lv.boss ? 2.1 : 1.6;
    if (lv.boss) {
      const gr = g.createRadialGradient(0, 0, 4, 0, 0, 90);
      gr.addColorStop(0, 'rgba(255,80,40,0.7)');
      gr.addColorStop(1, 'rgba(255,80,40,0)');
      g.fillStyle = gr;
      g.fillRect(-100, -100, 200, 200);
    }
    g.scale(k, k);
    // 龙头朝左：冲着画面左边的边城爬过来
    for (let i = 7; i >= 1; i--) RD.drawCar(g, i * 22, Math.sin(i * 0.9) * 6, -Math.PI / 2, i, 0, 0);
    RD.drawHead(g, 0, 0, -Math.PI / 2, 1, 0, lv.boss ? 1 : 0);
  } else {
    // 城门：砖墙 + 拱门 + 门上的数字
    g.fillStyle = '#7a5a3a';
    g.strokeStyle = LINE;
    g.lineWidth = 4;
    g.fillRect(-90, -70, 180, 140);
    g.strokeRect(-90, -70, 180, 140);
    g.strokeStyle = 'rgba(30,20,12,0.5)';
    g.lineWidth = 2;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 6; c++) g.strokeRect(-90 + c * 30 + (r % 2 ? 15 : 0), -70 + r * 20, 30, 20);
    g.fillStyle = '#2a1a10';
    g.beginPath();
    g.moveTo(-36, 70);
    g.lineTo(-36, 0);
    g.arc(0, 0, 36, Math.PI, 0);
    g.lineTo(36, 70);
    g.closePath();
    g.fill();
    if (lv.boss) {
      g.fillStyle = '#c8402c';
      g.fillRect(-20, -100, 40, 26);
      g.strokeStyle = LINE;
      g.strokeRect(-20, -100, 40, 26);
    }
  }
  g.restore();
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

// 手上的机关会在同一帧里被放走、叠掉、拆掉；凡是用 G.sel / G.dragM 之前先查它还指着东西，
// 指空了就清掉（检验报告 A9：放下最后一件的同一帧再点原格子，会把游戏点死）
function fixSel() {
  const r = G.r;
  const n = r ? r.bench.length : 0;
  if (G.sel >= n) G.sel = -1;
  const d = G.dragM;
  if (d && ((d.bi !== undefined && !(r && r.bench[d.bi])) || (d.si !== undefined && !(r && r.slots[d.si])))) G.dragM = null;
}

function onTouch(type, id, px, py) {
  fixSel();
  if (type === 'down' && G.cs) {
    G.cs.skip(); // 点一下跳过开局运镜
    return;
  }
  const [fx, fy] = toField(px, py);
  if (type === 'down') {
    for (let i = G.btns.length - 1; i >= 0; i--) {
      if (inR(fx, fy, G.btns[i])) {
        const bid = G.btns[i].id;
        // 手上的机关：按住就能拖
        if (bid.startsWith('tray') && !G.tip && !G.recipesOpen) {
          const bi = +bid.slice(4);
          if (!G.r || !G.r.bench[bi]) return; // 按钮表是上一帧画的，这格可能刚空
          G.dragM = { id, bi, fx, fy, fx0: fx, fy0: fy, moved: false, was: G.sel === bi };
          G.sel = bi;
          return;
        }
        // 场上的机关：按住也能拖（合、挪、换）
        const si = bid.startsWith('spot') ? +bid.slice(4) : bid.startsWith('slot') ? +bid.slice(4) : -1;
        if (si >= 0 && G.r && G.r.slots[si] && G.sel < 0 && !G.tip && !G.recipesOpen) {
          G.dragM = { id, si, kind: bid.slice(0, 4), fx, fy, fx0: fx, fy0: fy, moved: false };
          return;
        }
        press(bid);
        return;
      }
    }
    if (G.scr === 'play') G.sel = -1;
  } else if (type === 'move') {
    if (G.dragM && G.dragM.id === id) {
      G.dragM.fx = fx;
      G.dragM.fy = fy;
      if (Math.hypot(fx - G.dragM.fx0, fy - G.dragM.fy0) > 8) G.dragM.moved = true;
    }
    if (G.drag && G.drag.id === id && G.scr === 'play') G.st.targetX = clamp(G.drag.x0 + (fx - G.drag.fx0) * 1.15, 14, FW - 14);
  } else if (type === 'up') {
    if (G.dragM && G.dragM.id === id) {
      const d = G.dragM;
      G.dragM = null;
      if (d.si !== undefined) {
        // 从场上拖：合 / 挪 / 换；没拖动就当点一下（看射程）
        const tgt = d.moved ? dropTarget(fx, fy, d.si) : null;
        if (tgt && tgt.startsWith('tray')) {
          // 场上的拖回手上
          const m = G.r.slots[d.si];
          G.r.slots[d.si] = null;
          if (G.scr === 'play') m.installT = INSTALL_SEC; // 收回手上再放，也要重新装
          const same = G.r.bench.find((x) => x.id === m.id && x.tier + m.tier <= 4);
          if (same) same.tier += m.tier;
          else G.r.bench.push(m);
          snd('clang', 0, 0.5);
          G.sel = -1;
        } else if (tgt) {
          const to = +tgt.slice(4);
          const res = B.moveSlot(G.r, d.si, to);
          if (res && res.full) pop('已经满阶', FW / 2, 300, '#ff9a6a', 15);
          if (res && G.scr === 'play' && (res.res === 'move' || res.res === 'swap')) {
            // 波中挪动 / 对调：挪过去的（对调时两件都）要装 3 秒才开火
            G.r.slots[to].installT = INSTALL_SEC;
            if (res.res === 'swap' && G.r.slots[d.si]) G.r.slots[d.si].installT = INSTALL_SEC;
            showTip('install');
          }
          if (res) {
            snd(res.res === 'merge' ? 'evolve' : 'clang', 0, 0.5);
            if (res.res === 'merge') {
              chargeUp();
              PF.vibrate(true);
              const p = G.r.lv.mode === 'defend' && G.scr === 'play' ? F.slotPos(to) : { x: FW / 2, y: G.scr === 'play' ? 540 : 120 };
              pop('叠成 ' + res.slot.tier + ' 阶！', p.x, p.y - 26, '#ffd65a', 16);
              sparks(p.x, p.y - 10, 12, '#ffd65a');
            }
            if (G.scr === 'play') G.spotView = { i: to, t: 1.6 };
          }
        } else if (!d.moved) press(d.kind + d.si);
      } else if (!d.moved) {
        if (d.was) G.sel = -1;
      } else {
        const tgt = dropTarget(fx, fy);
        if (tgt && tgt.startsWith('tray')) {
          // 手上两件同名的拖到一起：叠成高阶
          const j = +tgt.slice(4);
          const a = G.r.bench[d.bi];
          const b = G.r.bench[j];
          if (j !== d.bi && canStack(a, b)) {
            b.tier += a.tier;
            G.r.bench.splice(d.bi, 1);
            chargeUp();
            snd('evolve', 0, 0.5);
            PF.vibrate(true);
            pop('叠成 ' + b.tier + ' 阶！', FW / 2, G.scr === 'play' ? 600 : 560, '#ffd65a', 16);
          }
          G.sel = -1;
        } else if (tgt) {
          G.sel = d.bi;
          press(tgt);
        } else G.sel = -1;
      }
    }
    if (G.drag && G.drag.id === id) G.drag = null;
  }
}

// 松手的地方有没有点位 / 车格（放宽一点，手指好放）
function dropTarget(fx, fy, skip) {
  let best = null;
  let bd = 1e9;
  for (const b of G.btns) {
    if (!(b.id.startsWith('spot') || b.id.startsWith('slot') || b.id.startsWith('tray'))) continue;
    if (skip !== undefined && +b.id.slice(4) === skip && !b.id.startsWith('tray')) continue;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const d = Math.hypot(cx - fx, cy - fy);
    if (d < Math.max(b.w, b.h) * 0.9 && d < bd) {
      bd = d;
      best = b.id;
    }
  }
  return best;
}
function drawDragM() {
  const d = G.dragM;
  if (!d || !d.moved) return;
  const m = d.si !== undefined ? G.r.slots[d.si] : G.r.bench[d.bi];
  if (!m) return;
  const tgt = dropTarget(d.fx, d.fy, d.si);
  if (tgt && d.si !== undefined && !tgt.startsWith('tray')) {
    const t = G.r.slots[+tgt.slice(4)];
    if (canStack(t, m)) bigText(ctx, '叠成 ' + (m.tier + t.tier) + ' 阶', d.fx, d.fy - 52, 13, '#ffd65a', LINE);
  }
  if (tgt && tgt.startsWith('spot') && G.r.lv.mode === 'defend') {
    const p = F.slotPos(+tgt.slice(4));
    const tsi = +tgt.slice(4);
    const R = F.rangeOf(G.r, D.M[m.id], tsi);
    const bf = F.SPOTS[tsi].buff;
    if (bf) bigText(ctx, F.BUFF[bf].name + '：' + F.BUFF[bf].tip, d.fx, d.fy - 66, 12, '#9dff7a', LINE);
    if (R) {
      ctx.strokeStyle = 'rgba(120,255,120,0.9)';
      ctx.fillStyle = 'rgba(120,255,120,0.12)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  machineIcon(m.id, m.tier, d.fx, d.fy - 24, 18, true);
}

function press(id) {
  fixSel();
  const r = G.r;
  snd('tap', 40, 0.4);
  if (G.recipesOpen && id !== 'recipesClose' && !id.startsWith('make_')) return;
  if (G.tip) {
    if (id !== 'tipNext') return;
    G.tip.i++;
    if (G.tip.i >= TIPS[G.tip.key].length) G.tip = null;
    return;
  }
  if (id.startsWith('node')) {
    const i = +id.slice(4);
    if (!unlocked(i)) return;
    G.lvIdx = i;
    G.bldView = null;
    G.scr = 'brief';
  } else if (id === 'go') startLevel(G.lvIdx);
  else if (id === 'back') G.scr = 'map';
  else if (id.startsWith('bld_')) G.bldView = id.slice(4);
  else if (id === 'pickBack') G.scr = 'map';
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
    if (G.cardsAt && PF.now() - G.cardsAt < 400) return;
    B.pickCard(r, +id.slice(4));
    snd('pick', 0, 0.5);
  } else if (id.startsWith('mat_')) {
    const el = id.slice(4);
    const used = G.benchSel.filter((e) => e === el).length;
    if (G.benchSel.length < r.bench2 && r.mats[el] > used) G.benchSel.push(el);
    tutAdvance('mat');
  } else if (id === 'recipes') G.recipesOpen = true;
  else if (id === 'recipesClose') G.recipesOpen = false;
  else if (id.startsWith('bs')) {
    G.benchSel.splice(+id.slice(2), 1);
  } else if (id === 'combine' || id.startsWith('make_')) {
    if (id.startsWith('make_')) G.benchSel = D.M[id.slice(5)].els.slice();
    const mc = B.combine(r, G.benchSel);
    if (mc) {
      G.benchSel = [];
      G.sel = -1; // 合完不自动选中，免得点点位时误换
      const lucky = r.lastLucky;
      if (lucky) {
        pop('大成功！直接 ' + (mc.stacked ? mc.tier : 2) + ' 阶', FW / 2, G.scr === 'play' ? 545 : 200, '#ffd65a', 22);
        snd('evolve', 0, 0.7);
        G.flash = 0.15;
      } else if (mc.stacked) pop('手上的' + D.M[mc.id].name + '叠成 ' + mc.tier + ' 阶', FW / 2, G.scr === 'play' ? 580 : 520, '#ffd65a', 14);
      tutAdvance('combine');
      chargeUp();
      G.bagua = { t: 0, a0: G.baguaAng || 0, gold: lucky };
      PF.vibrate(true);
      if (lucky && typeof setTimeout === 'function') setTimeout(() => PF.vibrate(true), 120);
      azSwing(() => {
        snd('clang', 0, 0.6);
        snd('upgrade', 0, 0.5);
        G.shake = Math.max(G.shake, 6);
        if (G.azAt) {
          sparks(G.azAt.x, G.azAt.y, 14, '#ffd65a');
          chunks(G.azAt.x, G.azAt.y, 6, '#c9933a', 0.8);
        }
      });
      if (!mc.stacked) {
        if (r.lv.mode === 'defend') pop(D.M[mc.id].name + '：拖到亮着的点位', FW / 2, 560, '#ffd65a', 15);
        else pop(D.M[mc.id].name + '：拖到车上的格子', FW / 2, G.scr === 'play' ? 540 : 520, '#ffd65a', 15);
      }
    }
  } else if (id.startsWith('tray')) {
    const i = +id.slice(4);
    if (!r || !r.bench[i]) return;
    G.sel = G.sel === i ? -1 : i;
  } else if (id === 'smash') {
    if (G.scr !== 'play') return;
    if ((r.charge || 0) < CHARGE_MAX) {
      pop('还差 ' + (CHARGE_MAX - (r.charge || 0)) + ' 格：合成、叠阶都攒', smashPos().x - 60, smashPos().y - 34, '#cbb8a8', 12);
      return;
    }
    if (S().smash(G.st)) {
      r.charge = 0;
      azSwing(() => {});
      handleEvents();
    } else pop(r.lv.mode === 'defend' ? '路上还没有龙' : '前面没有砖', smashPos().x - 40, smashPos().y - 34, '#cbb8a8', 13);
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
      else if (res && res.full) pop('已经满阶（最高 4 阶）', FW / 2, 300, '#ff9a6a', 15);
      else if (res) {
        if (res.res === 'swap' && G.scr === 'play') {
          // 换下来的那件回到手上：再放出去也要装 3 秒（不然等于免费挪）
          const back = r.bench[r.bench.length - 1];
          if (back) back.installT = INSTALL_SEC;
        }
        snd(res.res === 'merge' ? 'evolve' : 'clang', 0, 0.5);
        if (res.res === 'merge') chargeUp();
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
      else if (res && res.full) pop('已经满阶（最高 4 阶）', FW / 2, 300, '#ff9a6a', 15);
      else if (res) {
        snd(res.res === 'merge' ? 'evolve' : 'clang', 0, 0.5);
        if (res.res === 'merge') chargeUp();
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
    r.slots.concat(r.bench).forEach((m) => m && (m.installT = 0)); // 波间挪的不用等
    G.scr = 'play';
    G.benchSel = [];
    G.sel = -1;
    S().nextWave(G.st);
    G.banner = r.wave >= r.lv.waves - 1 ? 1.8 : 1.2;
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
  { text: '龙要来了！两个一样的元素就能合一件机关：你有两个金，点「连弩」', target: 'make_nu' },
  { text: '连弩到手上了。按住它，拖到路边亮着的点位放下（圈里的才打得到）', target: 'spot' },
  { text: '放好了！龙来了。打碎龙节会掉材料，凑够了「能合」那里就会亮', target: null },
];
function tutAdvance(what) {
  const T = G.tut;
  if (!T) return;
  if (T.step === 0 && what === 'combine') T.step = 1;
  else if (T.step === 1 && what === 'place') {
    T.step = 2;
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
  const y = T.step === 1 ? 70 : 520;
  ctx.fillStyle = 'rgba(26,18,12,0.92)';
  ctx.strokeStyle = '#ffd65a';
  ctx.lineWidth = 2;
  roundRect(ctx, 14, y, FW - 28, 54, 12);
  ctx.fill();
  ctx.stroke();
  bigText(ctx, '第 ' + (Math.min(T.step, 1) + 1) + ' 步 / 2', 28, y + 16, 11, '#ffd65a', LINE, 'left');
  wrap(step.text, 28, y + 36, FW - 56, 13);
}

// —— 提示卡：第一次碰到某件事时弹出来，框出要看的地方，游戏停住，点「下一步」继续；每张只出现一次 ——
// target：按钮 id，或者以 * 结尾表示「这一类按钮」（比如 buy* = 小店四张卡）
const TIPS = {
  combine2: [{ text: '下面亮了：又能合了。「能合」那里列着的，点一下就合', target: 'make_*' }],
  recipes: [{ text: '不一样的元素也能合！比如木 + 火 = 火龙车、金 + 水 = 雷链。能合的会直接列出来；全部组合点「合成表」看', target: 'make_*|recipes' }],
  merge: [{ text: '手上这件和场上某件同名！把它拖到标着「叠↑」的点位（进攻是车格），阶数相加（最高 4 阶），打得更狠。场上的机关也能直接拖到另一件一样的上面叠', target: 'spot*|slot*' }],
  mergeShop: [{ text: '手上这件和上面某格同名！把它拖到标着「叠」的格子，阶数相加（最高 4 阶）', target: 'slot*' }],
  smash: [{ text: '阿铸攒满了！每合一次、叠一次都会给他攒一格。点他身上的锤子：砸离城门最近的龙，整条停 2 秒（进攻是砸碎车前面一片砖）', target: 'smash' }],
  install: [{ text: '打的时候挪了位置：机关要先「装」3 秒（看那一圈转满）才开火。所以先想好摆哪；波间挪不用等', target: 'spot*|slot*' }],
  buySpot: [{ text: '铜钱够了：点「修」开一个新点位，多放一件机关', target: 'buySpot' }],
  cards: [{ text: '升级了！挑一个属性，这一关一直有效。圆圈的颜色就是五行', target: 'card*' }],
  shop: [
    { text: '这是小店：用打来的铜钱买道具和机关，买了这一关一直有效', target: 'buy*|lock*' },
    { text: '「锁」：这件先留着，下一波还在店里', target: 'lock*' },
    { text: '「刷新」：换一批新的，越刷越贵', target: 'refresh' },
    { text: '上面是你的点位。手上的机关（最下面）按住拖上来就能放；拖到一样的机关上会叠成高一阶', target: 'slot*' },
    { text: '准备好了就点「下一波」', target: 'nextWave' },
  ],
  attack: [
    { text: '进攻：车自己开、自己躲砖。车上的机关自动打前面的砖，撞上砖啃一口掉 1 血', target: null },
    { text: '和守城一样边开边合：砖碎了掉材料，能合的点一下，合好按住拖到这一排车上的格子', target: 'slot*' },
  ],
  station: [
    { text: '到驿站了：这里挑属性、逛小店；合机关在路上随时做', target: 'buy*|lock*' },
    { text: '上面一排是车上的格子，手上的机关也能在这里拖上去。准备好了点「继续冲」', target: 'slot*|nextWave' },
  ],
};
function showTip(key) {
  meta.tips = meta.tips || {};
  if (meta.tips[key] || G.tip || G.bot) return;
  meta.tips[key] = 1;
  saveMeta();
  G.tip = { key, i: 0 };
}
function tipRect() {
  const st = TIPS[G.tip.key][G.tip.i];
  if (!st.target) return null;
  const bs = G.btns.filter((b) => st.target.split('|').some((t) => (t.endsWith('*') ? b.id.startsWith(t.slice(0, -1)) : b.id === t)));
  if (!bs.length) return null;
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w));
  const y1 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function drawTip() {
  const steps = TIPS[G.tip.key];
  const st = steps[G.tip.i];
  const R = tipRect();
  // 压暗，框出要看的地方
  ctx.fillStyle = 'rgba(8,5,3,0.55)';
  if (R) {
    ctx.fillRect(0, 0, FW, R.y - 6);
    ctx.fillRect(0, R.y + R.h + 6, FW, FH);
    ctx.fillRect(0, R.y - 6, R.x - 6, R.h + 12);
    ctx.fillRect(R.x + R.w + 6, R.y - 6, FW, R.h + 12);
    const k = 0.5 + 0.5 * Math.sin(G.t * 8);
    ctx.strokeStyle = 'rgba(255,214,90,' + (0.6 + 0.4 * k) + ')';
    ctx.lineWidth = 4;
    roundRect(ctx, R.x - 6, R.y - 6, R.w + 12, R.h + 12, 12);
    ctx.stroke();
  } else ctx.fillRect(0, 0, FW, FH);
  const lines = countLines(st.text, FW - 60, 14);
  const ch = 40 + lines * 19 + 46; // 卡高按行数算，按钮不压字
  const below = R && R.y + R.h < 440;
  const y = below ? Math.min(FH - ch - 10, R.y + R.h + 20) : R ? Math.max(60, R.y - ch - 20) : 300;
  ctx.fillStyle = 'rgba(26,18,12,0.96)';
  ctx.strokeStyle = '#ffd65a';
  ctx.lineWidth = 2;
  roundRect(ctx, 16, y, FW - 32, ch, 12);
  ctx.fill();
  ctx.stroke();
  if (steps.length > 1) bigText(ctx, (G.tip.i + 1) + ' / ' + steps.length, 30, y + 16, 11, '#ffd65a', LINE, 'left');
  wrap(st.text, 30, y + 40, FW - 60, 14);
  btn('tipNext', FW - 130, y + ch - 42, 104, 34, G.tip.i < steps.length - 1 ? '下一步' : '知道了', '#c8402c', '', { size: 14 });
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
  const live = !!G.r;
  const tx = live ? 20 + i * 41 : 214 + i * 28;
  const ty = live ? 618 : 32;
  G.fx.push({ k: 'orb', x, y, x0: x, y0: y, tx, ty, t: 0, life: 0.55, col: D.EL[el].col });
}

const sy = (wy) => A.HEAD_Y - (wy - G.st.head.wy);
// 同名的拖到一起就合：阶数相加，最高 4 阶
const canStack = (a, b) => !!(a && b && a.id === b.id && a.tier + b.tier <= 4);
function handleEvents() {
  const st = G.st;
  if (!st) return;
  if (!G.combo) G.combo = { n: 0, t: -9, best: 0, bump: 0 };
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
      case 'break': {
        killFx(x, y, atk ? CITY.brick[1] : RD.BRASS);
        if (e.el) orb(x, y, e.el);
        G.shake = Math.max(G.shake, e.boss || e.kind === 'gate' ? 12 : 3);
        G.hitstop = Math.max(G.hitstop, e.boss ? 0.12 : 0.02);
        // 连碎：1.2 秒内接着碎就连上，声音一下比一下高
        const cb = G.combo;
        if (G.t - cb.t < 1.2) cb.n++;
        else cb.n = 1;
        cb.t = G.t;
        cb.bump = 1;
        if (cb.n > cb.best) cb.best = cb.n;
        const rate = cb.n >= 3 ? 0.9 + Math.min(cb.n, 14) * 0.055 : 0.9 + Math.random() * 0.25;
        snd(e.boss || e.kind === 'gate' ? 'boom' : 'break', 35, 0.5, rate);
        const bonus = { 10: 5, 20: 10, 30: 20 }[cb.n] || (cb.n > 30 && cb.n % 10 === 0 ? 20 : 0);
        if (bonus) {
          G.r.coins += bonus;
          pop('连碎 ×' + cb.n + '！ +' + bonus + ' 铜钱', FW / 2, 140, '#ffd65a', 18);
          G.shake = Math.max(G.shake, 6 + Math.min(cb.n, 40) / 5);
          snd('upgrade', 0, 0.5);
        }
        if (e.kind === 'tower') pop('拆了弩塔！', x, y - 30, '#ffb74a', 15);
        break;
      }
      case 'dragonIn': {
        const K = D.DRAGON_KINDS[e.kind];
        pop(K.name + '！', FW / 2, 120, '#ffb74a', 20);
        if (!G.seenKinds) G.seenKinds = {};
        if (!G.seenKinds[e.kind]) {
          G.seenKinds[e.kind] = 1;
          pop(K.tip, FW / 2, 146, '#fff8e6', 11);
        }
        snd('alarm', 0, 0.3, 1.2);
        break;
      }
      case 'gold':
        pop('金库！+15', x, y - 30, '#ffd65a', 18);
        sparks(x, y, 16, '#ffd65a');
        snd('coin', 0, 0.7);
        break;
      case 'log':
        G.shake = Math.max(G.shake, 10);
        sparks(x, y, 18, '#c9933a');
        chunks(x, y, 10, '#8a6a3a', 1.2);
        pop('城门滚木！推回去了', x, y - 30, '#ffd65a', 18);
        snd('thud', 0, 0.8);
        snd('ram', 0, 0.5);
        PF.vibrate(true);
        break;
      case 'refund':
        orb(x, y, e.el);
        pop('掉血换材料 +1 ' + D.EL[e.el].name, x, y - 30, '#9dff7a', 13);
        break;
      case 'smash':
        // 阿铸一锤：大震、白闪、顿一下
        G.shake = Math.max(G.shake, 16);
        G.flash = 0.2;
        G.flashCol = '#ffffff';
        G.hitstop = Math.max(G.hitstop, 0.15);
        sparks(x, y, 28, '#ffd65a');
        chunks(x, y, 12, '#c9933a', 1.4);
        G.fx.push({ k: 'ring', x, y, R: 70, t: 0, life: 0.35 });
        pop('阿铸一锤！', x, y - 74, '#ffd65a', 24);
        snd('boom', 0, 0.8);
        snd('thud', 0, 0.7);
        PF.vibrate(true);
        break;
      case 'dragonDown':
        // 整条龙碎光：慢一下 + 大字 + 奖励
        G.hitstop = Math.max(G.hitstop, 0.3);
        G.shake = Math.max(G.shake, 8);
        G.flash = 0.12;
        G.flashCol = '#ffd65a';
        sparks(x, y, 20, '#ffd65a');
        pop('整条龙碎了！ +' + e.bonus, x, y - 36, '#ffd65a', 20);
        snd('win', 0, 0.4);
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
        G.r.breached = true;
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
        if (e.pts && e.pts.length) G.r.leftover = true; // 有龙没赶在倒计时前打光
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
      case 'bossBreach':
        pop('铁头龙冲进去了！', FW / 2, 280, '#ff8a5a', 20);
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
  if (G.finished) return;
  G.finished = true;
  const lv = G.r.lv;
  const i = G.lvIdx;
  const first = win && !meta.cleared[lv.id];
  let mojing = win ? 30 + i * 8 + (lv.boss ? 30 : 0) : 8 + G.r.wave * 4;
  if (win && !first) mojing = Math.round(mojing * 0.3); // 重复通关只给三成，防挂机刷
  let pages = win ? 1 + (lv.boss ? 1 : 0) : 0;
  const chars = [];
  if (win) {
    const c = G.r.R() < 0.5 ? '墨' : '斗';
    chars.push(c);
    if (lv.boss) chars.push(c === '墨' ? '斗' : '墨');
  }
  // 三星：守城 = 过关 / 城门没掉血 / 每一波都赶在倒计时前打光；进攻 = 过关 / 车血过半 / 车血八成以上
  let stars = 0;
  const why = [];
  if (win) {
    stars = 1;
    if (lv.mode === 'defend') {
      if (!G.r.breached) stars++;
      else why.push('城门别掉血');
      if (!G.r.leftover) stars++;
      else why.push('每波都赶在倒计时前打光');
    } else {
      const k = G.r.hp / G.r.hpMax;
      if (k >= 0.5) stars++;
      else why.push('车血留一半');
      if (k >= 0.8) stars++;
      else why.push('车血留八成');
    }
  }
  meta.stars = meta.stars || {};
  const oldStars = meta.stars[lv.id] || 0;
  const starBonus = Math.max(0, stars - oldStars) * 20; // 每颗新星首次 +20 墨晶
  if (stars > oldStars) meta.stars[lv.id] = stars;
  mojing += starBonus;
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
  G.result = { win, first, mojing, pages, chars, newShenji, newB, left, wave: G.r.wave, t: 0, stars, oldStars, starBonus, why, combo: G.combo ? G.combo.best : 0 };
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
  fixSel();
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
    if (G.tut.step >= 2 && G.tut.t > 3.5) G.tut = null;
  }
  if (G.cs) {
    if (G.bot) G.cs.skip();
    else G.cs.update(dt * 1000);
  }
  const tutHold = (G.tut && G.tut.step < 2 && !G.bot) || !!G.tip || !!G.recipesOpen || !!G.cs;
  if (G.scr === 'play' && G.st && !tutHold) {
    acc += dt * G.speed;
    let n = 0;
    while (acc >= 1 / 60 && n++ < 40 && G.scr === 'play') {
      acc -= 1 / 60;
      if (G.r.lv.mode === 'attack') G.st.targetX = S().botX(G.st);
      if (G.bot && Math.random() < 0.02) botCombine();
      if (G.bot && (G.r.charge || 0) >= CHARGE_MAX) press('smash');
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
  if (G.bagua) {
    G.bagua.t += dt;
    if (G.bagua.t >= (G.bagua.gold ? 0.7 : 0.38)) {
      G.baguaAng = G.bagua.a0 + Math.PI * (G.bagua.gold ? 2 : 1);
      G.bagua = null;
    }
  }
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
  if (G.combo) G.combo.bump = Math.max(0, G.combo.bump - dt * 6);
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
    if (G.scr === 'play') drawLiveBench();
    if (G.scr === 'play') drawSmashBtn();
    if (G.tut && G.scr === 'play') drawTut();
    if (G.scr === 'shop') drawShop();
    if (G.scr === 'result') drawResult();
  }
  if (G.scr === 'brief') drawBrief();
  if (G.scr === 'play' || G.scr === 'shop') drawDragM();
  if (G.recipesOpen) drawRecipes();
  if (G.tip) drawTip();
  if (G.cs) G.cs.draw();
  ctx.restore();
  checkTips();
}

// 什么时候弹哪张提示
function checkTips() {
  if (G.tip || G.bot || !G.r || G.cs) return;
  const r = G.r;
  const seen = (k) => meta.tips && meta.tips[k];
  const stackIdx = () => r.bench.findIndex((m) => r.slots.some((x) => canStack(x, m)));
  if (G.scr === 'play' && !G.tut && (r.lv.mode === 'defend' || seen('attack'))) {
    const mk = B.makeable(r);
    if (!seen('recipes') && mk.some((m) => m.els[0] !== m.els[1])) return showTip('recipes');
    if (!seen('merge') && stackIdx() >= 0) {
      G.sel = stackIdx();
      return showTip('merge');
    }
    if (!seen('combine2') && mk.length && G.st.t > 3) return showTip('combine2');
    if (!seen('smash') && (r.charge || 0) >= CHARGE_MAX) return showTip('smash');
    if (r.lv.mode === 'defend' && !seen('buySpot') && F.spotCost(r) !== null && r.coins >= F.spotCost(r)) return showTip('buySpot');
  }
  if (G.scr === 'play' && r.lv.mode === 'attack' && G.st.t > 0.5) showTip('attack');
  if (G.scr === 'shop') {
    if (r.cards) return showTip('cards');
    if (!seen('mergeShop') && stackIdx() >= 0 && (seen('shop') || seen('station'))) {
      G.sel = stackIdx();
      return showTip('mergeShop');
    }
    showTip(r.lv.mode === 'defend' ? 'shop' : 'station');
  }
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

// —— 阿铸一锤（Cc 11-24 定）：每合成一次、叠阶一次攒一格，8 格满了点一下砸 ——
const CHARGE_MAX = 8;
function chargeUp() {
  const r = G.r;
  if (!r) return;
  const before = r.charge || 0;
  r.charge = Math.min(CHARGE_MAX, before + 1);
  if (r.charge === CHARGE_MAX && before < CHARGE_MAX) {
    snd('upgrade', 0, 0.6);
    const b = smashPos();
    pop('阿铸攒满了！', b.x - 30, b.y - 36, '#ffd65a', 15);
  }
}
const smashPos = () => (G.r.lv.mode === 'defend' ? { x: 330, y: 552 } : { x: 330, y: 518 });
function drawSmashBtn() {
  const r = G.r;
  const c = r.charge || 0;
  const { x, y } = smashPos();
  const R = 22;
  const full = c >= CHARGE_MAX;
  G.btns.push({ id: 'smash', x: x - R - 4, y: y - R - 4, w: R * 2 + 8, h: R * 2 + 8 });
  if (full) {
    const k = 0.5 + 0.5 * Math.sin(G.t * 8);
    ctx.fillStyle = 'rgba(255,214,90,' + (0.25 + 0.35 * k) + ')';
    ctx.beginPath();
    ctx.arc(x, y, R + 8 + k * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = full ? '#c8402c' : 'rgba(30,22,16,0.85)';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 8 格能量：一圈小弧
  for (let i = 0; i < CHARGE_MAX; i++) {
    const a0 = -Math.PI / 2 + (i / CHARGE_MAX) * Math.PI * 2 + 0.06;
    const a1 = -Math.PI / 2 + ((i + 1) / CHARGE_MAX) * Math.PI * 2 - 0.06;
    ctx.strokeStyle = i < c ? '#ffd65a' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, R + 3, a0, a1);
    ctx.stroke();
  }
  bigText(ctx, '锤', x, y - (full ? 4 : 0), full ? 17 : 15, full ? '#fff8e6' : '#cbb8a8', LINE);
  if (full) bigText(ctx, '点！', x, y + 12, 10, '#ffe9b0', LINE);
  else bigText(ctx, c + '/' + CHARGE_MAX, x, y + R + 12, 9, '#cbb8a8', LINE);
}

// 风水位的记号：高台插小旗，烽火台点火盆；下面一行小字写加成
function drawBuffMark(p, open) {
  const a = open ? 1 : 0.55;
  ctx.save();
  ctx.globalAlpha = a;
  if (p.buff === 'high') {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + 22, p.y + 12);
    ctx.lineTo(p.x + 22, p.y - 20);
    ctx.stroke();
    ctx.fillStyle = '#3f8ad8';
    ctx.beginPath();
    ctx.moveTo(p.x + 22, p.y - 20);
    ctx.lineTo(p.x + 36, p.y - 15);
    ctx.lineTo(p.x + 22, p.y - 10);
    ctx.fill();
  } else {
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(p.x + 18, p.y + 2, 10, 10);
    ctx.fillStyle = '#ff9a3a';
    ctx.beginPath();
    ctx.arc(p.x + 23, p.y - 2 + Math.sin(G.t * 12) * 1.5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe07a';
    ctx.beginPath();
    ctx.arc(p.x + 23, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  bigText(ctx, F.BUFF[p.buff].name + ' ' + F.BUFF[p.buff].tip, p.x, p.y + 25, 9, p.buff === 'high' ? '#a8d4ff' : '#ffc07a', LINE);
  ctx.restore();
}
// 波中挪过的机关：压暗 + 一圈进度 +「装」字，转满才开火
const INSTALL_SEC = 3;
function drawInstall(x, y, R, left) {
  const k = 1 - left / INSTALL_SEC;
  ctx.fillStyle = 'rgba(10,6,4,0.55)';
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffd65a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
  ctx.stroke();
  bigText(ctx, '装', x, y, Math.max(10, R * 0.7), '#ffd65a', LINE);
}
// 名字第一个字撞了的，换一个字
const ICON_CH = { huixuan: '刃', huochong: '铳' };
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
  bigText(ctx, ICON_CH[id] || m.name[0], 0, 1, s * 1.05, '#fff8e6', LINE);
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
        } else if (g.type === 'gold') {
          ctx.fillStyle = '#ffd65a';
          ctx.strokeStyle = LINE;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.4 * Math.sin(G.t * 6)) + ')';
          ctx.beginPath();
          ctx.arc(p.x - 3, p.y - 4, 3, 0, Math.PI * 2);
          ctx.fill();
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
  drawAzhu(330, 598, 86);
  G.azAt = { x: 330, y: 592 };
  // 点位：城外高低不同的箭楼、土台
  const r = G.r;
  const hand = G.sel >= 0 ? D.M[r.bench[G.sel].id] : null;
  F.SPOTS.forEach((p, i) => {
    const open = i < r.slots.length;
    const mc = r.slots[i];
    // 射程圈：选中手上的机关时，空点位都画一圈；点了某个点位就画它的圈
    const showR = hand && open && (!mc || canStack(mc, r.bench[G.sel])) ? F.rangeOf(r, hand, i) : G.spotView && G.spotView.i === i && mc ? F.rangeOf(r, D.M[mc.id], i) : 0;
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
    if (p.buff) drawBuffMark(p, open);
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
    if (mc && !(G.dragM && G.dragM.si === i && G.dragM.moved)) {
      machineIcon(mc.id, mc.tier, p.x, p.y - 14, 14, G.spotView && G.spotView.i === i);
      if (mc.installT > 0) drawInstall(p.x, p.y - 14, 19, mc.installT);
    }
    if (mc && hand && canStack(mc, r.bench[G.sel])) {
      ctx.fillStyle = '#c8402c';
      roundRect(ctx, p.x + 4, p.y - 38, 30, 18, 9);
      ctx.fill();
      bigText(ctx, '叠↑', p.x + 19, p.y - 29, 11, '#fff8e6', LINE);
    }
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
    bigText(ctx, '驿 站 · 升级、买东西', FW / 2, y, 14, '#fff8e6', LINE);
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

// 波次进度条：一格一波，打过的变亮，最后一波插红旗（Boss 关是龙头）
function drawWaveBar(x0, y0, w) {
  const r = G.r;
  const st = G.st;
  const n = r.lv.waves;
  const gw = w / n;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * gw;
    let k = i < r.wave ? 1 : i === r.wave && st.waveDur ? clamp(1 - st.waveT / st.waveDur, 0, 1) : 0;
    if (r.lv.mode === 'attack' && i === r.wave && st.legEnds) {
      // 进攻：这一段开了多远
      const a = i > 0 ? st.legEnds[i - 1] : 220;
      const b = st.legEnds[i] || a + 1;
      k = clamp((st.head.wy - a) / (b - a), 0, 1);
    }
    if (G.scr !== 'play' && i === r.wave) k = 0;
    ctx.fillStyle = '#3a2c20';
    roundRect(ctx, x + 1, y0, gw - 2, 10, 4);
    ctx.fill();
    if (k > 0) {
      ctx.fillStyle = i === n - 1 ? '#ff6a4a' : '#ffd65a';
      roundRect(ctx, x + 1, y0, Math.max(4, (gw - 2) * k), 10, 4);
      ctx.fill();
    }
  }
  // 红旗
  const fx = x0 + w - 6;
  ctx.strokeStyle = '#e8d8c0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(fx, y0 + 12);
  ctx.lineTo(fx, y0 - 6);
  ctx.stroke();
  ctx.fillStyle = '#e8402c';
  ctx.beginPath();
  ctx.moveTo(fx, y0 - 6);
  ctx.lineTo(fx - 10, y0 - 2);
  ctx.lineTo(fx, y0 + 2);
  ctx.fill();
  const lab = r.lv.mode === 'attack' ? (r.lv.boss ? '最后撞城门：弩车守着' : '最后一段撞城门') : r.lv.boss ? '最后一波：铁头龙' : '最后一波是大波';
  bigText(ctx, lab, x0 + w / 2, y0 + 26, 10, '#ffb0a0', LINE);
  // 连碎计数
  const cb = G.combo;
  if (cb && cb.n >= 3 && G.t - cb.t < 1.2 && G.scr === 'play') {
    const sz = 16 + Math.min(cb.n, 30) * 0.4 + cb.bump * 6;
    bigText(ctx, '连碎 ×' + cb.n, FW - 12, 74, sz, cb.n >= 10 ? '#ffd65a' : '#fff8e6', LINE, 'right');
  }
}
function drawHud() {
  const r = G.r;
  const st = G.st;
  ctx.fillStyle = 'rgba(20,14,10,0.78)';
  ctx.fillRect(0, 0, FW, 52);
  bigText(ctx, r.lv.id + ' · ' + (r.lv.mode === 'defend' ? '守城' : '进攻'), 10, 14, 13, '#fff8e6', LINE, 'left');
  const wv = Math.min(r.wave + 1, r.lv.waves);
  if (r.lv.mode === 'defend') bigText(ctx, '第 ' + wv + '/' + r.lv.waves + ' 波' + (G.scr === 'play' ? (st.waveT <= 0 && st.bossAlive ? ' · 打倒铁头龙才结束' : ' · ' + Math.max(0, Math.ceil(st.waveT)) + ' 秒') : ''), 10, 34, 12, '#ffd65a', LINE, 'left');
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
  // 守城：右上是波次进度条（材料在下面机关台看）；进攻：五行口袋
  drawWaveBar(214, 10, 136);
  if (false) D.ELS.forEach((e, i) => {
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
  if (G.banner > 0 && G.scr === 'play' && !(G.tut && G.tut.step < 2)) {
    ctx.save();
    ctx.globalAlpha = clamp(G.banner / 0.3, 0, 1);
    ctx.fillStyle = 'rgba(20,14,10,0.8)';
    ctx.fillRect(0, 250, FW, 80);
    const lastW = r.wave > 0 && r.wave >= r.lv.waves - 1;
    if (lastW) {
      // 最后一波：全屏警告
      ctx.fillStyle = 'rgba(120,20,10,0.55)';
      ctx.fillRect(0, 250, FW, 80);
      bigText(ctx, r.lv.boss && r.lv.mode === 'defend' ? '铁头龙来了！' : '最后一波！', FW / 2, 282, 30, '#ffdf7a', LINE);
      bigText(ctx, '撑过这一波就赢了', FW / 2, 312, 14, '#fff8e6', LINE);
    } else {
      bigText(ctx, r.wave === 0 ? r.lv.story : '第 ' + (r.wave + 1) + ' 波', FW / 2, 280, r.wave === 0 ? 16 : 24, '#ffd65a', LINE);
      bigText(ctx, r.lv.mode === 'defend' ? '合机关、摆点位，守住城门！' : '车自己开；你边开边合机关，拖上车', FW / 2, 308, 14, '#fff8e6', LINE);
    }
    ctx.restore();
  }
  if (G.teach && G.scr === 'play' && G.banner <= 0) {
    ctx.fillStyle = 'rgba(26,18,12,0.88)';
    roundRect(ctx, 16, 430, FW - 32, 40, 10);
    ctx.fill();
    bigText(ctx, G.teach.text, FW / 2, 450, 12, '#ffe9b0', LINE);
  }
}

// 放了第一个材料后，哪些材料能跟它合出（已解锁的）机关
function partners(r) {
  if (G.benchSel.length !== 1) return null;
  const a = G.benchSel[0];
  const set = new Set();
  D.MACHINES.forEach((m) => {
    if (r.recipes.indexOf(m.id) < 0) return;
    const i = m.els.indexOf(a);
    if (i >= 0) set.add(m.els[1 - i]);
  });
  return set;
}
// 材料按钮：能配的亮绿圈，配不上的变暗
function matBtn(r, e, x, y, w, h, size, label) {
  const left = r.mats[e] - G.benchSel.filter((q) => q === e).length;
  const pt = partners(r);
  const ok = !pt || pt.has(e);
  btn('mat_' + e, x, y, w, h, label, left > 0 && ok ? D.EL[e].dark : '#3a3028', '', { size, dis: left <= 0 || !ok });
  if (pt && ok && left > 0) {
    ctx.strokeStyle = 'rgba(120,255,120,' + (0.6 + 0.4 * Math.sin(G.t * 10)) + ')';
    ctx.lineWidth = 3;
    roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 12);
    ctx.stroke();
  }
}
// 黑白太极 + 八卦：垫在机关台格子底下，合成成功时转半圈
function drawBagua(cx, cy, R) {
  const sp = G.bagua ? G.bagua : null;
  let ang = 0;
  let glow = 0;
  if (sp) {
    const dur = sp.gold ? 0.7 : 0.38;
    const k = Math.min(1, sp.t / dur);
    ang = sp.a0 + Math.PI * (sp.gold ? 2 : 1) * (1 - Math.pow(1 - k, 3)); // 大成功转一整圈
    glow = 1 - k;
  } else ang = G.baguaAng || 0;
  ctx.save();
  ctx.translate(cx, cy);
  if (glow > 0) {
    ctx.fillStyle = sp.gold ? 'rgba(255,200,40,' + 0.85 * glow + ')' : 'rgba(255,240,180,' + 0.6 * glow + ')';
    ctx.beginPath();
    ctx.arc(0, 0, R * (1.15 + glow * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.rotate(ang);
  // 八卦：外圈八组卦线
  ctx.fillStyle = 'rgba(30,24,18,0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  const TRI = ['111', '011', '101', '001', '110', '010', '100', '000'];
  ctx.fillStyle = '#d8cdb8';
  TRI.forEach((t, i) => {
    ctx.save();
    ctx.rotate((i / 8) * Math.PI * 2);
    for (let k = 0; k < 3; k++) {
      const yy = -R + 3 + k * 4;
      if (t[k] === '1') ctx.fillRect(-7, yy, 14, 2.4);
      else {
        ctx.fillRect(-7, yy, 5.5, 2.4);
        ctx.fillRect(1.5, yy, 5.5, 2.4);
      }
    }
    ctx.restore();
  });
  // 太极
  const r2 = R * 0.56;
  ctx.fillStyle = '#f4efe6';
  ctx.beginPath();
  ctx.arc(0, 0, r2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1E1A16';
  ctx.beginPath();
  ctx.arc(0, 0, r2, -Math.PI / 2, Math.PI / 2);
  ctx.arc(0, r2 / 2, r2 / 2, Math.PI / 2, -Math.PI / 2, true);
  ctx.arc(0, -r2 / 2, r2 / 2, Math.PI / 2, -Math.PI / 2, false);
  ctx.fill();
  ctx.fillStyle = '#f4efe6';
  ctx.beginPath();
  ctx.arc(0, r2 / 2, r2 / 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1E1A16';
  ctx.beginPath();
  ctx.arc(0, -r2 / 2, r2 / 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1E1A16';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
// 合成表：全部 15 件机关要什么材料、做什么用
function drawRecipes() {
  const r = G.r;
  ctx.fillStyle = 'rgba(8,5,3,0.9)';
  ctx.fillRect(0, 0, FW, FH);
  bigText(ctx, '合 成 表', FW / 2, 40, 22, '#ffd65a', LINE);
  bigText(ctx, '两个一样的元素就能合；不一样的组合要先在工坊开配方', FW / 2, 66, 11, '#cbb8a8', LINE);
  D.MACHINES.forEach((m, i) => {
    const x = 12 + (i % 2) * 172;
    const y = 82 + Math.floor(i / 2) * 76;
    const own = (r ? r.recipes : meta.recipes).indexOf(m.id) >= 0;
    ctx.fillStyle = own ? '#2f2218' : '#1c140e';
    ctx.strokeStyle = own ? '#9a6a22' : '#3a2c20';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, 164, 70, 10);
    ctx.fill();
    ctx.stroke();
    // 两个元素
    m.els.forEach((e, k) => {
      ctx.fillStyle = own ? D.EL[e].col : '#4a3e34';
      ctx.beginPath();
      ctx.arc(x + 16 + k * 26, y + 20, 10, 0, Math.PI * 2);
      ctx.fill();
      bigText(ctx, D.EL[e].name, x + 16 + k * 26, y + 20, 11, LINE, '#fff8e6');
    });
    bigText(ctx, '=', x + 64, y + 20, 13, '#fff8e6', LINE);
    machineIcon(m.id, 1, x + 88, y + 20, 11);
    bigText(ctx, m.name, x + 104, y + 20, 13, own ? '#fff8e6' : '#7a6a56', LINE, 'left');
    if (r && G.scr !== 'map' && B.makeable(r).indexOf(m) >= 0 && (G.scr === 'play' || G.scr === 'shop')) {
      // 现在能合：整格可以点
      G.btns.push({ id: 'make_' + m.id, x, y, w: 164, h: 70 });
      ctx.strokeStyle = '#ffd65a';
      ctx.lineWidth = 3;
      roundRect(ctx, x, y, 164, 70, 10);
      ctx.stroke();
      bigText(ctx, '点一下合', x + 158, y + 60, 10, '#ffd65a', LINE, 'right');
    }
    ctx.save();
    wrap((own ? '' : '（没开）') + m.tip.split(' / ')[r && r.lv.mode === 'attack' ? 1 : 0] + (m.cost ? '；代价：' + m.cost : ''), x + 8, y + 44, 150, 10);
    ctx.restore();
  });
  btn('recipesClose', FW / 2 - 60, FH - 46, 120, 38, '关上', '#c8402c', '', { size: 16 });
}

// —— 守城：打的时候常驻在下面的机关台（照《赵云与阿斗》边打边合）——
function canMake(r) {
  return D.MACHINES.some((m) => r.recipes.indexOf(m.id) >= 0 && m.els.every((e) => r.mats[e] >= m.els.filter((x) => x === e).length));
}
function drawLiveBench() {
  const r = G.r;
  const y0 = 600;
  ctx.fillStyle = 'rgba(16,10,6,0.9)';
  roundRect(ctx, 4, y0, FW - 8, 116, 12);
  ctx.fill();
  const mk = B.makeable(r);
  if (mk.length) {
    ctx.strokeStyle = 'rgba(255,214,90,' + (0.5 + 0.4 * Math.sin(G.t * 8)) + ')';
    ctx.lineWidth = 3;
    roundRect(ctx, 4, y0, FW - 8, 116, 12);
    ctx.stroke();
  }
  // 第一行：五种材料各有几个（只看，不用点）+ 八卦 + 合成表
  D.ELS.forEach((e, i) => {
    const x = 8 + i * 41;
    ctx.fillStyle = r.mats[e] ? D.EL[e].col : '#3a3028';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + 12, y0 + 18, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    bigText(ctx, D.EL[e].name, x + 12, y0 + 18, 11, LINE, '#fff8e6');
    bigText(ctx, '×' + r.mats[e], x + 30, y0 + 18, 12, r.mats[e] ? '#fff8e6' : '#7a6a56', LINE);
  });
  // 下一份掉什么（照 Isle of Arrows 预告下一块；没得合时保底凑一对）
  const ne = B.nextDrop(r);
  ctx.fillStyle = D.EL[ne].col;
  ctx.strokeStyle = '#ffd65a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(225, y0 + 14, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  bigText(ctx, D.EL[ne].name, 225, y0 + 14, 9, LINE, '#fff8e6');
  bigText(ctx, '下一份', 225, y0 + 30, 8, '#ffd65a', LINE);
  drawBagua(258, y0 + 20, 15);
  btn('recipes', FW - 82, y0 + 6, 72, 26, '合成表', '#5a3a1e', '', { size: 12 });
  // 第二行：现在能合的，点一下就合
  if (mk.length) {
    // 一排 5 个；更多的在「合成表」里点
    mk.slice(0, 5).forEach((m, i) => {
      const x = 10 + i * 69;
      const stk = r.slots.some((s) => s && s.id === m.id && s.tier < 4);
      G.btns.push({ id: 'make_' + m.id, x, y: y0 + 38, w: 66, h: 32 });
      ctx.fillStyle = m.els[0] !== m.els[1] ? '#5a6a1e' : '#3f6a2a';
      ctx.strokeStyle = stk ? '#ffd65a' : LINE;
      ctx.lineWidth = stk ? 2.5 : 1.5;
      roundRect(ctx, x, y0 + 38, 66, 32, 9);
      ctx.fill();
      ctx.stroke();
      machineIcon(m.id, 1, x + 12, y0 + 54, 9);
      bigText(ctx, m.name, x + 24, y0 + 48, 11, '#fff8e6', LINE, 'left');
      bigText(ctx, stk ? '能叠↑' : m.els.map((e) => D.EL[e].name).join('+'), x + 24, y0 + 62, 9, stk ? '#ffd65a' : '#d8e8c8', LINE, 'left');
    });
    if (mk.length > 5) {
      // 合成表按钮右上角的小红点：还有几个能合
      ctx.fillStyle = '#e8402c';
      ctx.beginPath();
      ctx.arc(FW - 14, y0 + 8, 10, 0, Math.PI * 2);
      ctx.fill();
      bigText(ctx, '+' + (mk.length - 5), FW - 14, y0 + 8, 10, '#fff8e6', LINE);
    }
  } else bigText(ctx, (r.lv.mode === 'defend' ? '打碎龙节' : '打碎砖') + '会掉材料；凑够两个就能合，能合的会出现在这里', FW / 2, y0 + 52, 11, '#cbb8a8', LINE);
  // 第三行：手上的机关（按住拖到点位）
  bigText(ctx, '手上：', 12, y0 + 94, 11, '#cbb8a8', LINE, 'left');
  r.bench.forEach((m, i) => {
    const x = 60 + i * 32;
    if (x > FW - 18) return;
    if (G.dragM && G.dragM.bi === i && G.dragM.moved) return;
    G.btns.push({ id: 'tray' + i, x: x - 15, y: y0 + 79, w: 30, h: 30 });
    machineIcon(m.id, m.tier, x, y0 + 93, 11, G.sel === i);
  });
  if (r.bench.length && r.bench.length <= 5) bigText(ctx, r.lv.mode === 'defend' ? '按住拖到点位' : '按住拖到车格', FW - 12, y0 + 94, 11, '#ffd65a', LINE, 'right');
  if (r.lv.mode === 'attack') drawCarStrip(y0 - 44);
}
// 进攻：机关台上面一排车上的格子（拖上来装、拖到一样的上面叠）
function drawCarStrip(y) {
  const r = G.r;
  const n = r.slots.length;
  const sw = Math.min(34, (FW - 70) / n - 3);
  ctx.fillStyle = 'rgba(16,10,6,0.82)';
  roundRect(ctx, 4, y - 4, FW - 8, sw + 8, 10);
  ctx.fill();
  bigText(ctx, '车上：', 12, y + sw / 2, 11, '#cbb8a8', LINE, 'left');
  const hm = G.dragM && G.dragM.bi !== undefined ? r.bench[G.dragM.bi] : G.sel >= 0 ? r.bench[G.sel] : null;
  r.slots.forEach((m, i) => {
    const x = 56 + i * (sw + 3);
    G.btns.push({ id: 'slot' + i, x, y, w: sw, h: sw });
    const stk = canStack(m, hm);
    ctx.fillStyle = stk ? '#6b4a1e' : '#4a3a2a';
    ctx.strokeStyle = hm ? '#ffd65a' : LINE;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, sw, sw, 7);
    ctx.fill();
    ctx.stroke();
    if (m && !(G.dragM && G.dragM.si === i && G.dragM.moved)) {
      machineIcon(m.id, m.tier, x + sw / 2, y + sw / 2 - 1, sw * 0.32);
      if (m.installT > 0) drawInstall(x + sw / 2, y + sw / 2 - 1, sw * 0.45, m.installT);
    }
    if (stk) bigText(ctx, '叠↑', x + sw - 6, y + 5, 9, '#ffd65a', LINE);
  });
}

// —— 波间：属性卡 → 机关台 + 小店 ——
function drawShop() {
  const r = G.r;
  G.btns.length = 0;
  ctx.fillStyle = 'rgba(12,8,6,0.9)';
  ctx.fillRect(0, 52, FW, FH - 52);
  if (r.cards) return drawCards();
  const res = G.waveRes || { coins: 0 };
  btn('recipes', FW - 84, 58, 74, 26, '合成表', '#5a3a1e', '', { size: 12 });
  bigText(ctx, '第 ' + r.wave + ' 波守住了' + (res.coins ? '  收获 +' + res.coins : ''), FW / 2, 72, 16, '#ffd65a', LINE);
  // 点位
  bigText(ctx, r.lv.mode === 'defend' ? '守城点位（从左到右 = 地图上开的先后）' : '车上的格子（手上的机关按住拖上来）', FW / 2, 96, 11, '#cbb8a8', LINE);
  const n = r.slots.length;
  const sw = Math.min(40, (FW - 30) / n - 4);
  r.slots.forEach((s, i) => {
    const x = FW / 2 - (n * (sw + 4)) / 2 + i * (sw + 4);
    G.btns.push({ id: 'slot' + i, x, y: 106, w: sw, h: sw });
    const hm = G.sel >= 0 ? r.bench[G.sel] : null;
    const canMerge = canStack(s, hm);
    ctx.fillStyle = canMerge ? '#6b4a1e' : '#4a3a2a';
    ctx.strokeStyle = G.sel >= 0 ? '#ffd65a' : LINE;
    ctx.lineWidth = 2;
    roundRect(ctx, x, 106, sw, sw, 8);
    ctx.fill();
    ctx.stroke();
    if (s) machineIcon(s.id, s.tier, x + sw / 2, 106 + sw / 2 - 2, sw * 0.36);
    if (canMerge) {
      ctx.fillStyle = '#c8402c';
      roundRect(ctx, x + sw - 18, 100, 22, 16, 8);
      ctx.fill();
      bigText(ctx, '叠', x + sw - 7, 108, 10, '#fff8e6', LINE);
    }
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
    // 本波伤害榜：谁出力最多
    const db = Object.entries(G.st.dmgBy || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);
    bigText(ctx, '这一波谁打得最狠', 14, 186, 12, '#ffd65a', LINE, 'left');
    const top = db.length ? db[0][1] : 1;
    db.forEach(([mid, v], i) => {
      const y = 200 + i * 15;
      machineIcon(mid, 1, 24, y + 5, 6);
      bigText(ctx, D.M[mid].name, 36, y + 5, 10, '#fff8e6', LINE, 'left');
      ctx.fillStyle = i === 0 ? '#ffd65a' : '#c9933a';
      roundRect(ctx, 92, y, Math.max(4, 62 * v / top), 10, 4);
      ctx.fill();
      bigText(ctx, String(Math.round(v)), 92 + Math.max(4, 62 * v / top) + 4, y + 5, 10, '#fff8e6', LINE, 'left');
    });
    if (!db.length) bigText(ctx, '（还没有机关出手）', 14, 206, 10, '#a89880', LINE, 'left');
    // 下一波预告
    const pv = F.previewWave(r);
    const TN = { shield: '铜盾节（正面只吃 2 成，炸它）', powder: '火药节（碎了炸旁边）', iron: '铁节' };
    ctx.fillStyle = pv.last ? 'rgba(120,30,16,0.8)' : 'rgba(40,28,18,0.9)';
    roundRect(ctx, 196, 180, FW - 206, 84, 10);
    ctx.fill();
    bigText(ctx, pv.last ? (pv.boss ? '下一波：铁头龙！' : '下一波：最后一波！') : '下一波', 206, 194, 12, pv.last ? '#ffdf7a' : '#ffd65a', LINE, 'left');
    bigText(ctx, pv.kinds.map((k) => D.DRAGON_KINDS[k].name).join(' + ') + (pv.boss ? ' + 铁头龙' : ''), 206, 212, 10, '#fff8e6', LINE, 'left');
    const lines = [];
    [...new Set(pv.kinds)].forEach((k) => D.DRAGON_KINDS[k].short && lines.push(D.DRAGON_KINDS[k].name + '：' + D.DRAGON_KINDS[k].short));
    if (pv.kinds.indexOf('normal') >= 0) pv.types.forEach((ty) => lines.push(TN[ty] || ty));
    lines.slice(0, 3).forEach((t, i) => bigText(ctx, '· ' + t, 206, 228 + i * 13, 9, '#e8c8a8', LINE, 'left'));
  } else {
  // 进攻的驿站：合成在路上做；这里看下一段有什么（照 Thronefall 白天预告夜里的敌人）
  const st = G.st;
  const leg = st.leg;
  const a = leg > 0 ? st.legEnds[leg - 1] : 0;
  const b = st.legEnds[leg] || 1e9;
  const last = leg >= st.legEnds.length - 1;
  const bl = st.blocks.filter((x) => x.alive && x.wy > a && (x.wy <= b || last));
  const towers = bl.filter((x) => x.kind === 'tower').length;
  const bricks = bl.filter((x) => x.kind === 'brick');
  const big = bricks.reduce((m, x) => Math.max(m, x.n), 0);
  const laneN = [0, 0, 0, 0, 0];
  bricks.forEach((x) => (laneN[Math.max(0, Math.min(4, Math.floor(x.x / A.CELL)))] += x.n));
  const easy = laneN.indexOf(Math.min(...laneN));
  bigText(ctx, '合机关在路上随时做；驿站挑属性、逛小店', FW / 2, 186, 11, '#cbb8a8', LINE);
  ctx.fillStyle = last ? 'rgba(120,30,16,0.8)' : 'rgba(40,28,18,0.9)';
  roundRect(ctx, 14, 200, FW - 28, 82, 10);
  ctx.fill();
  bigText(ctx, last ? '下一段：最后一段，撞开城门！' : '下一段', 26, 216, 13, last ? '#ffdf7a' : '#ffd65a', LINE, 'left');
  bigText(ctx, '砖 ' + bricks.length + ' 块（最硬 ' + big + '）· 弩塔 ' + towers + ' 座' + (last ? ' · 城门 ' + st.gate.n : ''), 26, 238, 11, '#fff8e6', LINE, 'left');
  bigText(ctx, '弩塔会射车：远程机关（连弩、火铳、雷链）先拆它', 26, 256, 10, '#e8c8a8', LINE, 'left');
  bigText(ctx, '砖最少的是第 ' + (easy + 1) + ' 条道；车会自己找空的道走', 26, 272, 10, '#e8c8a8', LINE, 'left');
  }
  G.azAt = { x: FW / 2, y: 268 };
  // 小店
  bigText(ctx, '小 店', 40, 318, 15, '#ffd65a', LINE);
  btn('refresh', FW - 118, 304, 108, 28, '刷新 ' + B.refreshCost(r), '#5a4a3a', '', { size: 13 });
  r.shop.forEach((o, i) => {
    const x = 12 + (i % 2) * 172;
    const y = 338 + Math.floor(i / 2) * 96;
    drawOffer(o, i, x, y, 164, 88);
  });
  // 手上的机关：放在最下面，拖到上面的格子
  ctx.fillStyle = 'rgba(40,28,18,0.9)';
  roundRect(ctx, 8, 534, FW - 16, 66, 12);
  ctx.fill();
  bigText(ctx, r.bench.length ? '手上的机关：按住拖到上面的格子' : '手上的机关（合好、买到的放这里）', 18, 548, 11, '#cbb8a8', LINE, 'left');
  r.bench.forEach((m, i) => {
    const x = 32 + i * 40;
    if (x > FW - 78) return;
    if (G.dragM && G.dragM.bi === i && G.dragM.moved) return;
    G.btns.push({ id: 'tray' + i, x: x - 18, y: 556, w: 40, h: 40 });
    machineIcon(m.id, m.tier, x, 576, 15, G.sel === i);
  });
  if (G.sel >= 0) btn('sell', FW - 66, 558, 54, 32, '拆掉', '#6b3a2a', '', { size: 13 });
  btn('nextWave', 60, 620, FW - 120, 58, r.lv.mode === 'defend' ? '下一波' : '继续冲', '#c8402c', '', { size: 24 });
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
  btn('lock' + i, x + w - 38, y + h - 30, 32, 24, r.locked[i] ? '已锁' : '锁', r.locked[i] ? '#9a6a22' : '#4a3a2a', '', { size: 11, on: r.locked[i] });
  bigText(ctx, o.price + ' 铜钱', x + 8, y + h - 16, 13, can ? '#ffd65a' : '#a06a5a', LINE, 'left');
}
function countLines(text, maxW, size) {
  ctx.font = '900 ' + size + 'px "PingFang SC", "Heiti SC", sans-serif';
  let line = '';
  let n = 1;
  for (const c of text) {
    if (ctx.measureText(line + c).width > maxW) {
      n++;
      line = c;
    } else line += c;
  }
  return n;
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
  G.btns.length = 0;
  ctx.fillStyle = 'rgba(12,8,6,0.88)';
  ctx.fillRect(0, 0, FW, FH);
  bigText(ctx, g.win ? (G.r.lv.mode === 'defend' ? '守住了！' : '城门破了！') : G.r.lv.mode === 'defend' ? '城墙破了' : g.left ? '差 ' + g.left + ' 点就撞开了' : '车撞烂了', FW / 2, 180, 34, g.win ? '#ffd65a' : '#ff8a5a', LINE);
  if (g.win) {
    // 三颗星
    for (let i = 0; i < 3; i++) drawStar(FW / 2 - 50 + i * 50, 92, 20, i < g.stars, i >= g.oldStars && i < g.stars);
    if (g.why.length) bigText(ctx, '还差：' + g.why.join('、'), FW / 2, 128, 11, '#cbb8a8', LINE);
  }
  if (g.combo >= 5) bigText(ctx, '最高连碎 ×' + g.combo, FW / 2, 212, 13, '#ffd65a', LINE);
  bigText(ctx, '墨晶 +' + g.mojing + (g.starBonus ? '（新星 +' + g.starBonus + '）' : '') + (g.win && !g.first ? '（重打三成）' : '') + (g.pages ? '   残页 +' + g.pages : ''), FW / 2, 240, 15, '#fff8e6', LINE);
  if (g.chars.length) bigText(ctx, '神机字块：' + g.chars.join(' '), FW / 2, 272, 17, '#9fe8ff', LINE);
  const sj = D.SHENJI[0];
  bigText(ctx, '墨斗：墨 ' + (meta.chars['墨'] || 0) + '/' + sj.need + '  斗 ' + (meta.chars['斗'] || 0) + '/' + sj.need, FW / 2, 300, 13, '#cbb8a8', LINE);
  if (g.newShenji) bigText(ctx, '凑齐神机「墨斗」！开局送一件机关', FW / 2, 330, 16, '#ffd65a', LINE);
  if (g.newB && g.newB.length) bigText(ctx, '解锁新机关师：' + g.newB.join('、') + '（下次重来时可选）', FW / 2, 356, 13, '#9dff7a', LINE);
  btn('again', 60, 380, FW - 120, 64, g.win ? '再打一次' : '再来！', '#c8402c');
  btn('toMap', 60, 460, FW - 120, 56, '回地图', '#3f6a5a');
  btn('meta', 60, 530, FW - 120, 50, '工坊（花墨晶变强）', '#8a5a1e', '', { size: 16 });
}

// 五角星：on = 拿到；fresh = 这次新拿的（会闪）
function drawStar(x, y, R, on, fresh) {
  const k = fresh ? 1 + 0.15 * Math.sin(G.t * 10) : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? R * 0.45 : R;
    if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = on ? '#ffd65a' : '#3a2c20';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = Math.max(1.5, R / 8);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
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
    const ns = (meta.stars || {})[lv.id] || 0;
    if (ns) for (let k = 0; k < 3; k++) drawStar(x - 14 + k * 14, y + R + 7, 6, k < ns);
  });
  btn('old', 10, FH - 44, 120, 34, '0.5 旧玩法', '#4a3a2a', '', { size: 12 });
  const cb = D.BUILDERS.find((x) => x.id === meta.camp.builder);
  drawAzhu(312, FH - 62, 120);
  bigText(ctx, '机关师：' + cb.name, FW - 14, FH - 34, 13, '#ffd65a', LINE, 'right');
  btn('restart', FW - 130, FH - 26 - 0, 120, 22, '换人 = 从头再来', '#4a3a2a', '', { size: 11 });
  if (G.confirm) {
    G.btns.length = 0;
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
  G.btns.length = 0;
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
  const mode = lv.mode === 'defend' ? '守城：边打边合机关，自己挑路边的点位放，射程圈里的才打得到' : (lv.car === 'dragon' ? '进攻：机关龙（' + metaNow().dragonLen + ' 格）' : '进攻：小工程车（' + metaNow().cartSlots + ' 格）') + '自己开，你边开边合机关、拖到车上的格子；驿站升级、买东西';
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
  if (meta.camp) btn('pickBack', FW - 78, 12, 68, 34, '返回', '#3f6a5a', '', { size: 14 }); // 后悔了：回地图，原来的进度还在
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
