// 《墨守》0.6 · 守城模式：龙顺着弯路爬向城门，阿铸在城下左右滑射箭，城墙点位上的机关自动打。
// 一关 3 波；倒计时到 0 全场的龙当场碎掉（照《土豆兄弟》），进波间机关台。
// 边城的新动法：蓄力冲刺（龙头亮红光 1 秒，整条往前冲一截）+ 越短越快。
const D = require('./data.js');
const B = require('./build.js');
const P = require('../path.js');
const { clamp } = require('../util.js');

const GAP = 23; // 节距
const SEG_R = 13;
const PLAYER_Y = 664;
const WALL_Y = 590;
// 点位：城外高低不同的箭楼、土台，散在路边（路：顶上往下 → y96 往右 → x314 往下 → y310 往左 → x46 往下 → y524 往右 → 城门）
// 按解锁顺序排：先开离城门近的
const SPOTS = [
  // 路：顶上往下 → y96 往右 → x314 往下 → y239 往左 → x46 往下 → y381 往右 → x314 往下 → y524 往左 → 城门
  // 照《王国保卫战》摆：弯道内侧一个点盖两段；两条横路中间的点离两条路一样远，三个点交叉成杀伤区；入口最后开
  { x: 264, y: 452, name: '东南弯台', why: '第三、四条横路之间的右弯内侧，盖三段' },
  { x: 96, y: 310, name: '西弯箭楼', why: '第二、三条横路之间的左弯内侧，盖三段' },
  { x: 180, y: 452, name: '南中土台', why: '第三、四条横路正中间，和东南弯台交叉：城门前的杀伤区', buff: 'beacon' },
  { x: 264, y: 167, name: '东北弯台', why: '第一、二条横路之间的右弯内侧，放减速拖慢', buff: 'high' },
  { x: 228, y: 572, name: '城门东台', why: '贴着进城的最后一段，最后一道防线' },
  { x: 180, y: 310, name: '中路土台', why: '第二、三条横路正中间，和西弯交叉：中间的杀伤区' },
  { x: 96, y: 167, name: '入口箭楼', why: '靠入口，盖得少，后开' },
  { x: 130, y: 572, name: '城门西台', why: '进城最后一段的另一边，和城门东台夹住' },
];
// 关内花铜钱开下一个点位（一关里越开越贵）
const SPOT_COST = [50, 90, 140, 200, 280];
const BOLT_CD = 0.36;

function slotPos(i) {
  return SPOTS[i];
}
// 风水位（照 Emberward 符文格、明日方舟高台）：高台射程 +30%，烽火台攻速 +20%
const BUFF = { high: { name: '高台', tip: '射程 +30%' }, beacon: { name: '烽火台', tip: '攻速 +20%' } };
function rangeOf(r, m, si) {
  if (!m.rng) return 0;
  const k = si !== undefined && SPOTS[si] && SPOTS[si].buff === 'high' ? 1.3 : 1;
  return (m.rng + B.stats(r).range) * k;
}

function newDefend(r) {
  const path = P.build(4, true, 'snake');
  const st = {
    r, path, t: 0, mode: 'play', events: [],
    px: D.FIELD.w / 2, targetX: D.FIELD.w / 2, boltCd: 0,
    dragons: [], bolts: [], shots: [], zones: [], pools: [],
    waveT: 0, waveDur: 0, spawnT: 0, spawned: 0, bossAlive: false,
    cd: r.slots.map(() => 0.5), heat: r.slots.map(() => 0),
  };
  startWave(st);
  return st;
}

function ev(st, e) {
  st.events.push(e);
}
const lastWave = (st) => st.r.wave >= st.r.lv.waves - 1;

function startWave(st) {
  const r = st.r;
  st.waveDur = D.WAVE_SEC[Math.min(r.wave, D.WAVE_SEC.length - 1)];
  st.waveT = st.waveDur;
  st.spawnT = 0;
  st.spawned = 0;
  st.dmgBy = {};
  st.mode = 'play';
  st.cd = r.slots.map((_, i) => (st.cd[i] !== undefined ? Math.min(st.cd[i], 0.6) : 0.6));
  st.heat = r.slots.map(() => 0);
  if (lastWave(st) && r.lv.boss === 'tietou') {
    spawnDragon(st, true);
    st.bossAlive = true;
  }
  ev(st, { t: 'waveStart', wave: r.wave });
}

// 这一波第几条龙是哪一种（手写编组；没写的关就是普通长龙）
function kindOf(r, wave, idx) {
  const plan = D.PLANS[r.lv.id];
  const w = plan && plan[Math.min(wave, plan.length - 1)];
  return w ? w[idx % w.length] : 'normal';
}
// 一条龙：节的血一节比一节多一点；按编组摆兵种节（普通长龙才随机夹）
function spawnDragon(st, boss) {
  const r = st.r;
  const lv = r.lv;
  const kind = boss ? 'normal' : kindOf(r, r.wave, st.spawned);
  let len = boss ? lv.len + 8 : Math.max(8, lv.len - 4 + r.wave * 2 + st.spawned * 2);
  let vk = 1;
  if (kind === 'longSlow') {
    len = Math.round(len * 1.5);
    vk = 0.75;
  } else if (kind === 'fastShort') {
    len = Math.max(6, Math.round(len * 0.6));
    vk = 1.45;
  } else if (kind === 'twin') len = Math.max(6, Math.round(len * 0.55));
  const base = (4 + r.wave * 2.2 + st.spawned * 1) * lv.hp * 1.25;
  // 第一波第一条龙直接出现在路的前段，放下机关几秒内就有得打（1-1 更靠前）
  const head0 = r.wave === 0 && st.spawned === 0 && !boss ? (lv.id === '1-1' ? 520 : 260) : 0;
  const n = kind === 'twin' ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const off = head0 - k * (len * GAP + 70);
    const segs = [];
    for (let i = 0; i < len; i++) {
      let type = null;
      if (kind === 'normal' && i > 0) for (const [ty, p] of Object.entries(lv.types || {})) if (!type && r.R() < p) type = ty;
      if (kind === 'shieldHead' && i >= 1 && i <= 3) type = 'shield';
      if (kind === 'powderChain' && i % 3 === 2) type = 'powder';
      if (kind === 'goldTail' && i === len - 1) type = 'gold';
      let hp = Math.round(base * (1 + i * 0.03) * (type === 'powder' ? 0.5 : type === 'gold' ? 1.5 : 1));
      if (boss && i === 0) hp *= 10;
      segs.push({ hp, hp0: hp, type, s: -i * GAP - 10 + off, alive: true, burnT: 0, frozen: 0, chest: false, id: i });
    }
    st.dragons.push({ segs, kind, len0: len, v: (36 + r.wave * 3 + lv.hp * 4) * (boss ? 0.7 : 1) * vk, boss, dashCd: 6 + r.R() * 3, glow: 0, dash: 0, slowT: 0, slowK: 0, freezeT: 0, blockT: 0 });
  }
  if (kind !== 'normal') ev(st, { t: 'dragonIn', kind, x: st.path.at(0).x, y: 70 });
  st.spawned++;
}

const alive = (d) => d.segs.filter((g) => g.alive);
function segXY(st, g) {
  return st.path.at(Math.max(0, g.s));
}
function forEachSeg(st, fn) {
  for (const d of st.dragons) for (const g of d.segs) if (g.alive && g.s > -5) fn(g, d);
}

// —— 伤害 ——
// 本波伤害榜：记每种机关打了多少
let CUR = null;
function credit(st, mid, n) {
  if (!mid || !(n > 0)) return;
  st.dmgBy = st.dmgBy || {};
  st.dmgBy[mid] = (st.dmgBy[mid] || 0) + n;
}
function hit(st, g, d, raw, opt) {
  if (!g.alive) return;
  const r = st.r;
  opt = opt || {};
  let dmg = raw;
  if (g.type === 'shield' && opt.direct) dmg *= 0.2;
  if (d.boss && g.id === 0 && opt.direct) dmg *= 0.2;
  if (g.frozen > 0 && opt.frostBonus) dmg *= 1.5;
  let crit = false;
  if (!opt.noCrit) [dmg, crit] = B.rollCrit(r, dmg, opt.critBonus);
  credit(st, CUR, Math.min(dmg, Math.max(0, g.hp)));
  g.hp -= dmg;
  const stt = B.stats(r);
  if (opt.machine && stt.burn > 0) {
    g.burnT = 2;
    g.burn = stt.burn;
  }
  // 冰冻属性：同一条龙 2 秒内只定一次，Boss 不吃
  if (opt.machine && stt.freeze > 0 && !d.boss && st.t - (d.frzAt || -9) > 2 && r.R() * 100 < stt.freeze) {
    d.frzAt = st.t;
    d.freezeT = Math.max(d.freezeT, 0.5);
  }
  if (opt.machine && stt.slow > 0) {
    d.slowT = 1;
    d.slowK = Math.max(d.slowK, stt.slow / 100);
  }
  // 击退：同一条龙 0.3 秒内只推一次（一发炸到好几节不叠推）
  if (opt.knock && stt.knock > 0 && st.t - (d.knAt || -9) > 0.3) {
    d.knAt = st.t;
    knock(d, stt.knock * 6);
  }
  const p = segXY(st, g);
  if (!opt.quiet) ev(st, { t: 'hit', x: p.x, y: p.y, dmg: Math.round(dmg), crit, big: dmg > 30 });
  if (g.hp <= 0) kill(st, g, d);
}
function knock(d, px) {
  for (const g of d.segs) g.s -= px;
}
function kill(st, g, d) {
  g.alive = false;
  const p = segXY(st, g);
  const special = !!g.type || (d.boss && g.id === 0);
  const el = B.gainKill(st.r, special);
  ev(st, { t: 'kill', x: p.x, y: p.y, type: g.type, el, boss: d.boss && g.id === 0 });
  if (g.type === 'gold') {
    st.r.coins += 15;
    ev(st, { t: 'gold', x: p.x, y: p.y });
  }
  // 整条龙都碎了：收尾奖励
  if (!d.segs.some((o) => o.alive)) {
    const bonus = 3 + Math.floor(d.len0 / 4);
    st.r.coins += bonus;
    ev(st, { t: 'dragonDown', x: p.x, y: p.y, bonus, boss: d.boss });
  }
  if (g.type === 'powder') {
    ev(st, { t: 'boom', x: p.x, y: p.y });
    forEachSeg(st, (o, od) => {
      if (Math.abs(o.s - g.s) < 50 && od === d && o !== g) hit(st, o, od, 15 * st.r.lv.hp, { noCrit: true, quiet: true });
    });
  }
}

// —— 龙怎么动 ——
function moveDragons(st, dt) {
  const r = st.r;
  for (const d of st.dragons) {
    const segs = alive(d);
    if (!segs.length) continue;
    let v = d.v * (1 + 0.1 * Math.floor((d.len0 - segs.length) / 10)); // 越短越快
    // 蓄力冲刺：亮红光 1 秒，然后冲 0.35 秒
    d.dashCd -= dt;
    if (d.dashCd <= 0 && d.glow <= 0 && d.dash <= 0 && segs[0].s > 40) {
      d.glow = 1;
      ev(st, { t: 'glow', boss: d.boss });
    }
    if (d.glow > 0) {
      d.glow -= dt;
      if (d.glow <= 0) {
        d.dash = 0.35;
        d.dashCd = 6 + r.R() * 3;
        ev(st, { t: 'dash' });
      }
    }
    if (d.dash > 0) {
      d.dash -= dt;
      v *= 5;
    }
    if (d.slowT > 0) {
      d.slowT -= dt;
      v *= 1 - d.slowK;
    } else d.slowK = 0;
    for (const z of st.zones) if (segs[0].s > z.s0 && segs[0].s < z.s1) v *= z.k;
    if (d.freezeT > 0) {
      d.freezeT -= dt;
      v = 0;
    }
    if (d.blockT > 0) {
      d.blockT -= dt;
      v = 0;
    }
    const head = segs[0];
    head.s += v * dt;
    // 后面的节跟上（中间断了也追上来）
    for (let i = 1; i < segs.length; i++) {
      const want = segs[i - 1].s - GAP;
      const g = segs[i];
      if (g.s < want) g.s = Math.min(want, g.s + Math.max(v, 30) * 1.8 * dt);
      else g.s = want;
    }
    // 撞城门：头一节冲进门，城墙掉血，这一节没了
    if (head.s >= st.path.len && !st.logUsed && !(d.boss && head.id === 0)) {
      // 城门滚木（照植物大战僵尸的小推车）：每关一次，第一次有龙头撞门时滚木砸下来，把整条推回去、停 1.5 秒，不掉血
      st.logUsed = true;
      knock(d, 150);
      d.blockT = Math.max(d.blockT, 1.5);
      ev(st, { t: 'log', x: segXY(st, head).x, y: segXY(st, head).y });
      continue;
    }
    if (head.s >= st.path.len) {
      head.alive = false;
      const dmg = d.boss && head.id === 0 ? 25 : 2 + head.hp / 30;
      const real = B.hurtSelf(r, dmg);
      if (d.boss && head.id === 0) st.bossBreached = true;
      // 掉血返材料（照赵云与阿斗卖血换馒头）：城墙每掉 10% 血，蹦出一份随机材料
      const lostTenth = Math.floor((1 - r.hp / r.hpMax) * 10);
      r.refunded = r.refunded || 0;
      while (r.refunded < lostTenth && r.hp > 0) {
        r.refunded++;
        const el = D.ELS[Math.floor(r.R() * 5)];
        r.mats[el]++;
        ev(st, { t: 'refund', el, x: 180, y: WALL_Y - 20 });
      }
      ev(st, { t: 'breach', dmg: Math.round(real), boss: d.boss && head.id === 0 });
      if (r.hp <= 0) {
        st.mode = 'lose';
        ev(st, { t: 'lose' });
        return;
      }
    }
    // 燃烧
    for (const g of segs) {
      if (g.burnT > 0) {
        g.burnT -= dt;
        g.hp -= g.burn * dt;
        if (g.hp <= 0 && g.alive) kill(st, g, d);
      }
      if (g.frozen > 0) g.frozen -= dt;
    }
  }
  st.dragons = st.dragons.filter((d) => d.segs.some((g) => g.alive));
}

// —— 阿铸射箭 ——
function stepPlayer(st, dt) {
  st.px += clamp(st.targetX - st.px, -900 * dt, 900 * dt);
  st.boltCd -= dt;
  if (st.boltCd <= 0) {
    st.boltCd = BOLT_CD * B.cdMul(st.r);
    st.bolts.push({ x: st.px, y: PLAYER_Y - 30, left: 1 + B.stats(st.r).pierce });
    ev(st, { t: 'shoot' });
  }
  for (let i = st.bolts.length - 1; i >= 0; i--) {
    const b = st.bolts[i];
    b.y -= 760 * dt;
    let done = b.y < -20;
    forEachSeg(st, (g, d) => {
      if (done) return;
      const p = segXY(st, g);
      if (Math.abs(p.x - b.x) < SEG_R + 3 && Math.abs(p.y - b.y) < SEG_R + 8 && !b.hitIds) b.hitIds = [];
      if (b.hitIds && b.hitIds.indexOf(g) < 0 && Math.abs(p.x - b.x) < SEG_R + 3 && Math.abs(p.y - b.y) < SEG_R + 8) {
        b.hitIds.push(g);
        hit(st, g, d, 6 * B.dmgMul(st.r, { els: ['jin'] }), { direct: true });
        b.left--;
        if (b.left <= 0) done = true;
      }
    });
    if (done) st.bolts.splice(i, 1);
  }
}

// —— 城墙上的机关 ——
function pickTarget(st, x, y, range) {
  let best = null;
  let bd = null;
  forEachSeg(st, (g, d) => {
    if (g.s < 0) return;
    const p = segXY(st, g);
    if (Math.hypot(p.x - x, p.y - y) > range + SEG_R) return; // 碰到节的边就算打得到
    if (!best || g.s > best.g.s) {
      best = { g, d, p };
      bd = g.s;
    }
  });
  return best;
}
function stepMachines(st, dt) {
  const r = st.r;
  const stt = B.stats(r);
  r.slots.forEach((mc, i) => {
    if (!mc) return;
    const m = D.M[mc.id];
    const pos = slotPos(i);
    if (st.cd[i] === undefined) st.cd[i] = 0.5;
    if (st.heat[i] === undefined) st.heat[i] = 0;
    // 波中挪过位置：先「安装」3 秒，装好才开火（Cc 11-24 定，防拖着机关追龙）
    if (mc.installT > 0) {
      mc.installT -= dt;
      return;
    }
    st.cd[i] -= dt;
    if (st.cd[i] > 0) return;
    const cd = m.cd * D.TIER_CD[mc.tier - 1] * B.cdMul(r);
    const dmg = m.dmg * D.TIER_DMG[mc.tier - 1] * B.dmgMul(r, m);
    const t4 = mc.tier >= 4;
    if (m.kind === 'heal') {
      st.cd[i] = 1;
      B.heal(r, m.dmg * mc.tier); // 每秒回 2/4/6/8
      ev(st, { t: 'healTick', x: pos.x, y: pos.y });
      return;
    }
    const tg = pickTarget(st, pos.x, pos.y, rangeOf(r, m, i));
    if (!tg) {
      st.cd[i] = 0.2;
      return;
    }
    st.cd[i] = cd / (pos.buff === 'beacon' ? 1.2 : 1);
    const o = { machine: true, knock: true };
    const n0 = [st.zones.length, st.pools.length, st.shots.length];
    CUR = mc.id;
    switch (m.kind) {
      case 'bolt': {
        if (m.overheat && !t4) {
          st.heat[i]++;
          if (st.heat[i] >= m.overheat) {
            st.heat[i] = 0;
            st.cd[i] = 2;
            ev(st, { t: 'overheat', x: pos.x, y: pos.y });
          }
        }
        const n = t4 && m.id === 'nu' ? 3 : 1;
        for (let k = 0; k < n; k++) st.shots.push({ kind: 'bolt', x: pos.x + (k - (n - 1) / 2) * 8, y: pos.y - 10, g: tg.g, d: tg.d, dmg, crit: m.critBonus, left: 1 + stt.pierce, mid: m.id });
        ev(st, { t: 'mShoot', x: pos.x, y: pos.y, mid: m.id });
        break;
      }
      case 'net': {
        const k = 1 - Math.min(0.8, 0.3 + stt.slow / 100);
        st.zones.push({ s0: tg.g.s - 70, s1: tg.g.s + 70, k, t: 3, kind: 'net', dps: t4 ? 6 : 0 });
        ev(st, { t: 'net', x: tg.p.x, y: tg.p.y });
        break;
      }
      case 'mud': {
        st.zones.push({ s0: tg.g.s - 50, s1: tg.g.s + 50, k: 0.25, t: 2, kind: 'mud' });
        if (t4) st.zones.push({ s0: tg.g.s - 220, s1: tg.g.s - 120, k: 0.25, t: 2, kind: 'mud' });
        ev(st, { t: 'mud', x: tg.p.x, y: tg.p.y });
        break;
      }
      case 'frost': {
        tg.d.freezeT = Math.max(tg.d.freezeT, 1 + stt.freeze / 50);
        const segs = alive(tg.d).slice(0, 3);
        segs.forEach((g) => {
          g.frozen = t4 ? 3 : 0;
          hit(st, g, tg.d, dmg, o);
        });
        ev(st, { t: 'frost', x: tg.p.x, y: tg.p.y });
        break;
      }
      case 'lob': {
        const R = (m.r || 40) * (1 + stt.aoe / 100);
        st.shots.push({ kind: 'lob', x: pos.x, y: pos.y - 10, tx: tg.p.x, ty: tg.p.y, t: 0, dur: 0.45, R, dmg, pool: m.pool || (t4 && m.id === 'pi' ? 5 : 0), mid: m.id });
        if (m.selfHurt && !t4) B.hurtSelf(r, m.selfHurt);
        ev(st, { t: 'lobThrow', x: pos.x, y: pos.y });
        break;
      }
      case 'hammer': {
        let k = 1;
        if (m.rage) k += 1 - r.hp / r.hpMax;
        hit(st, tg.g, tg.d, dmg * k, o);
        if (t4) alive(tg.d).slice(0, 4).forEach((g) => hit(st, g, tg.d, dmg * 0.4, { machine: true, quiet: true }));
        ev(st, { t: 'hammer', x: tg.p.x, y: tg.p.y });
        break;
      }
      case 'fireWall': {
        st.pools.push({ x: tg.p.x, y: tg.p.y, R: 46 * (1 + stt.aoe / 100), dps: dmg, t: 2, fire: true });
        if (t4) st.pools.push({ x: pos.x + (tg.p.x - pos.x) * 0.5, y: pos.y + (tg.p.y - pos.y) * 0.5, R: 40, dps: dmg, t: 2, fire: true });
        ev(st, { t: 'fireWall', y: tg.p.y });
        break;
      }
      case 'chain': {
        const segs = alive(tg.d);
        const i0 = segs.indexOf(tg.g);
        const jumps = (t4 ? 10 : m.jumps) + stt.pierce;
        const pts = [];
        for (let k = 0; k <= jumps && i0 + k < segs.length; k++) {
          const g = segs[i0 + k];
          pts.push(segXY(st, g));
          hit(st, g, tg.d, dmg * Math.pow(0.88, k), { machine: true, quiet: k > 0 });
        }
        ev(st, { t: 'chain', from: pos, pts });
        break;
      }
      case 'blade': {
        const n = t4 ? 3 : 1;
        for (let k = 0; k < n; k++) {
          const a = Math.atan2(tg.p.y - pos.y, tg.p.x - pos.x) + (k - (n - 1) / 2) * 0.4;
          const R = rangeOf(r, m, i);
          st.shots.push({ kind: 'blade', x: pos.x, y: pos.y, ox: pos.x, oy: pos.y, tx: pos.x + Math.cos(a) * R, ty: pos.y + Math.sin(a) * R, t: 0, dmg, hitSet: [], back: false });
        }
        ev(st, { t: 'bladeThrow', x: pos.x, y: pos.y });
        break;
      }
      case 'golem': {
        const front = st.dragons.reduce((a, d) => (!a || (alive(d)[0] && alive(d)[0].s > alive(a)[0].s) ? d : a), null);
        if (front) {
          front.blockT = 2 + mc.tier * 0.5;
          const p = segXY(st, alive(front)[0]);
          ev(st, { t: 'golem', x: p.x, y: p.y });
        }
        break;
      }
    }
    CUR = null;
    // 这一下新生出来的箭、区域、火池，记上是谁的
    [st.zones, st.pools, st.shots].forEach((arr, k) => {
      for (let j = n0[k]; j < arr.length; j++) if (!arr[j].mid) arr[j].mid = mc.id;
    });
  });
}

function stepShots(st, dt) {
  for (let i = st.shots.length - 1; i >= 0; i--) {
    const s = st.shots[i];
    CUR = s.mid || null;
    if (s.kind === 'bolt') {
      if (!s.g.alive) {
        st.shots.splice(i, 1);
        continue;
      }
      const p = segXY(st, s.g);
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const d = Math.hypot(dx, dy);
      const step = 640 * dt;
      if (d <= step + 6) {
        hit(st, s.g, s.d, s.dmg, { machine: true, direct: true, critBonus: s.crit, knock: true });
        // 穿透：箭接着飞向同一条龙的下一节
        s.left--;
        const nx = s.left > 0 ? s.d.segs.find((g) => g.alive && g.s < s.g.s && g.s > -5) : null;
        if (nx) s.g = nx;
        else st.shots.splice(i, 1);
      } else {
        s.x += (dx / d) * step;
        s.y += (dy / d) * step;
        s.a = Math.atan2(dy, dx);
      }
    } else if (s.kind === 'lob') {
      s.t += dt;
      if (s.t >= s.dur) {
        forEachSeg(st, (g, d) => {
          const p = segXY(st, g);
          if (Math.hypot(p.x - s.tx, p.y - s.ty) < s.R) hit(st, g, d, s.dmg, { machine: true, knock: true });
        });
        if (s.pool) st.pools.push({ x: s.tx, y: s.ty, R: s.R * 0.8, dps: s.pool, t: 3, mid: s.mid });
        ev(st, { t: 'lobBoom', x: s.tx, y: s.ty, R: s.R, mid: s.mid });
        st.shots.splice(i, 1);
      }
    } else if (s.kind === 'blade') {
      s.t += dt / 0.45;
      const k = s.back ? 2 - s.t : s.t;
      s.x = s.ox + (s.tx - s.ox) * k;
      s.y = s.oy + (s.ty - s.oy) * k;
      if (!s.back && s.t >= 1) {
        s.back = true;
        s.hitSet = [];
      }
      forEachSeg(st, (g, d) => {
        if (s.hitSet.indexOf(g) >= 0) return;
        const p = segXY(st, g);
        if (Math.abs(p.x - s.x) < 22 && Math.abs(p.y - s.y) < 22) {
          s.hitSet.push(g);
          hit(st, g, d, s.dmg, { machine: true });
        }
      });
      if (s.back && s.t >= 2) st.shots.splice(i, 1);
    }
  }
  CUR = null;
  // 区域：网、泥、火墙、岩浆
  for (let i = st.zones.length - 1; i >= 0; i--) {
    const z = st.zones[i];
    z.t -= dt;
    if (z.kind === 'fire') {
      forEachSeg(st, (g, d) => {
        const p = segXY(st, g);
        if (Math.abs(p.y - z.y) < 20) {
          credit(st, z.mid, Math.min(z.dps * dt, g.hp));
          g.hp -= z.dps * dt;
          if (g.hp <= 0) kill(st, g, d);
        }
      });
    } else if (z.dps) {
      forEachSeg(st, (g, d) => {
        if (g.s > z.s0 && g.s < z.s1) {
          credit(st, z.mid, Math.min(z.dps * dt, g.hp));
          g.hp -= z.dps * dt;
          if (g.hp <= 0) kill(st, g, d);
        }
      });
    }
    if (z.t <= 0) st.zones.splice(i, 1);
  }
  for (let i = st.pools.length - 1; i >= 0; i--) {
    const z = st.pools[i];
    z.t -= dt;
    forEachSeg(st, (g, d) => {
      const p = segXY(st, g);
      if (Math.hypot(p.x - z.x, p.y - z.y) < z.R) {
        credit(st, z.mid, Math.min(z.dps * dt, g.hp));
        g.hp -= z.dps * dt;
        if (g.hp <= 0) kill(st, g, d);
      }
    });
    if (z.t <= 0) st.pools.splice(i, 1);
  }
}

function step(st, dt) {
  if (st.mode !== 'play') return;
  st.t += dt;
  const r = st.r;
  // 出龙：开波一条，之后隔一段再来
  st.spawnT -= dt;
  const bossWave = lastWave(st) && r.lv.boss;
  if (st.spawnT <= 0 && st.waveT > 6) {
    spawnDragon(st, false);
    st.spawnT = st.waveDur * (bossWave ? 0.6 : 0.42);
  }
  stepMachines(st, dt);
  if (r.hp <= 0) {
    // 蒸汽炮把自己烫没了也算输
    r.hp = 0;
    st.mode = 'lose';
    ev(st, { t: 'lose' });
    return;
  }
  stepShots(st, dt);
  moveDragons(st, dt);
  if (st.mode !== 'play') return;
  if (st.bossAlive && !st.dragons.some((d) => d.boss)) {
    st.bossAlive = false;
    ev(st, { t: st.bossBreached ? 'bossBreach' : 'bossDown' });
  }
  // 回复：每 5 秒回一次
  st.regenT = (st.regenT || 0) + dt;
  if (st.regenT >= 5) {
    st.regenT -= 5;
    const rg = B.stats(r).regen;
    if (rg > 0 && r.hp < r.hpMax) {
      B.heal(r, rg);
      ev(st, { t: 'healTick', x: 180, y: WALL_Y });
    }
  }
  st.waveT -= dt;
  const timeUp = st.waveT <= 0 && !st.bossAlive;
  if (timeUp) endWave(st);
}

// 波末：全场的龙当场碎掉，没捡的材料自动进口袋
function endWave(st) {
  const pts = [];
  forEachSeg(st, (g) => pts.push(segXY(st, g)));
  st.dragons = [];
  st.bolts = [];
  st.shots = [];
  st.zones = [];
  st.pools = [];
  ev(st, { t: 'waveClear', pts, last: lastWave(st) });
  if (lastWave(st)) {
    st.mode = 'win';
    ev(st, { t: 'win' });
  } else {
    st.mode = 'shop';
  }
}

function nextWave(st) {
  startWave(st);
}

// 机器人：站到最前面那一节的下面
function botX(st) {
  let best = null;
  forEachSeg(st, (g) => {
    if (g.s > 0 && (!best || g.s > best.s)) best = g;
  });
  return best ? segXY(st, best).x : D.FIELD.w / 2;
}

// 阿铸一锤（Cc 11-24 定）：砸离城门最近的那条龙——前 5 节各吃一大锤，整条停 2 秒
function smash(st) {
  const r = st.r;
  let best = null;
  for (const d of st.dragons) {
    const h = alive(d)[0];
    if (h && h.s > -5 && (!best || h.s > alive(best)[0].s)) best = d;
  }
  if (!best) return false;
  const dmg = (7 + r.wave * 2.2) * r.lv.hp * 1.25 * 3;
  const segs = alive(best).filter((g) => g.s > -5).slice(0, 5);
  const p = segXY(st, segs[0]);
  best.blockT = Math.max(best.blockT, 2);
  CUR = null;
  segs.forEach((g) => hit(st, g, best, dmg, { noCrit: true }));
  ev(st, { t: 'smash', x: p.x, y: p.y });
  return true;
}

// 下一波预告：几条龙、每条大约几节、夹什么兵种节、是不是 Boss（和 step / spawnDragon 同一套算法）
function previewWave(r) {
  const D_ = D.WAVE_SEC[Math.min(r.wave, D.WAVE_SEC.length - 1)];
  const boss = r.wave >= r.lv.waves - 1 && r.lv.boss;
  const gap = D_ * (boss ? 0.6 : 0.42);
  let n = 0;
  for (let t = 0; t < D_ - 6; t += gap) n++;
  const len0 = Math.max(8, r.lv.len - 4 + r.wave * 2);
  const kinds = [];
  for (let k = 0; k < n; k++) kinds.push(kindOf(r, r.wave, k));
  return { n, kinds, len0, len1: Math.max(8, r.lv.len - 4 + r.wave * 2 + (n - 1) * 2), types: Object.keys(r.lv.types || {}), boss, last: r.wave >= r.lv.waves - 1 };
}

// 花铜钱开下一个点位
function spotCost(r) {
  const n = r.spotsBought || 0;
  return r.slots.length >= SPOTS.length ? null : SPOT_COST[Math.min(n, SPOT_COST.length - 1)];
}
function buySpot(r) {
  const c = spotCost(r);
  if (c === null || r.coins < c) return false;
  r.coins -= c;
  r.spotsBought = (r.spotsBought || 0) + 1;
  r.slots.push(null);
  return true;
}

module.exports = { BUFF, smash, previewWave, spotCost, buySpot, newDefend, step, nextWave, slotPos, rangeOf, segXY, alive, botX, SPOTS, WALL_Y, PLAYER_Y, SEG_R, GAP };
