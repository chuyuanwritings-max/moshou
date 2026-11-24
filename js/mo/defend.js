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
  // 照《王国保卫战》摆：弯道内侧一个点盖两段路；三个点交叉盖住同一段是杀伤区；入口最没用，最后开
  { x: 264, y: 260, name: '东弯箭楼', why: '右边竖路转中间横路的弯道内侧，盖两段' },
  { x: 96, y: 360, name: '西弯箭楼', why: '中间横路转左边竖路的弯道内侧，和东弯夹住中间横路' },
  { x: 180, y: 360, name: '中路土台', why: '中间横路正下方，和两个弯道点交叉：第一个杀伤区' },
  { x: 96, y: 474, name: '南弯箭楼', why: '左边竖路转下面横路的弯道内侧，接住漏下来的' },
  { x: 228, y: 548, name: '城门东台', why: '贴着进城的最后一段：最后一道防线' },
  { x: 264, y: 146, name: '东北弯台', why: '上面横路转右边竖路的弯道内侧，适合放减速，拖慢进杀伤区' },
  { x: 110, y: 146, name: '入口箭楼', why: '入口最没用，倒数第二个开，补漏、提前削血' },
  { x: 180, y: 474, name: '城门北台', why: '最后一个弯的外侧，和南弯、城门东台组成第二个杀伤区' },
];
const BOLT_CD = 0.36;

function slotPos(i) {
  return SPOTS[i];
}
function rangeOf(r, m) {
  return m.rng ? m.rng + B.stats(r).range : 0;
}

function newDefend(r) {
  const path = P.build(3, true, 'snake');
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
  st.mode = 'play';
  st.cd = r.slots.map((_, i) => (st.cd[i] !== undefined ? Math.min(st.cd[i], 0.6) : 0.6));
  st.heat = r.slots.map(() => 0);
  if (lastWave(st) && r.lv.boss === 'tietou') {
    spawnDragon(st, true);
    st.bossAlive = true;
  }
  ev(st, { t: 'waveStart', wave: r.wave });
}

// 一条龙：节的血一节比一节多一点，兵种节随机夹在里面
function spawnDragon(st, boss) {
  const r = st.r;
  const lv = r.lv;
  const len = boss ? lv.len + 8 : lv.len + r.wave * 3 + st.spawned * 2;
  const base = (4 + r.wave * 3 + st.spawned * 1.5) * lv.hp;
  const segs = [];
  for (let i = 0; i < len; i++) {
    let type = null;
    if (i > 0) for (const [ty, p] of Object.entries(lv.types || {})) if (!type && r.R() < p) type = ty;
    let hp = Math.round(base * (1 + i * 0.03) * (type === 'powder' ? 0.5 : 1));
    if (boss && i === 0) hp *= 10;
    segs.push({ hp, hp0: hp, type, s: -i * GAP - 10, alive: true, burnT: 0, frozen: 0, chest: false, id: i });
  }
  st.dragons.push({ segs, len0: len, v: (52 + r.wave * 5 + lv.hp * 5) * (boss ? 0.7 : 1), boss, dashCd: 6 + r.R() * 3, glow: 0, dash: 0, slowT: 0, slowK: 0, freezeT: 0, blockT: 0 });
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
  g.hp -= dmg;
  const stt = B.stats(r);
  if (opt.machine && stt.burn > 0) {
    g.burnT = 2;
    g.burn = stt.burn;
  }
  if (opt.machine && stt.freeze > 0 && r.R() * 100 < stt.freeze) d.freezeT = Math.max(d.freezeT, 0.5);
  if (opt.machine && stt.slow > 0) {
    d.slowT = 1;
    d.slowK = Math.max(d.slowK, stt.slow / 100);
  }
  if (opt.knock && stt.knock > 0) knock(d, stt.knock * 6);
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
    if (head.s >= st.path.len) {
      head.alive = false;
      const dmg = d.boss && head.id === 0 ? 30 : 3 + head.hp / 25;
      const real = B.hurtSelf(r, dmg);
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
    if (Math.hypot(p.x - x, p.y - y) > range) return;
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
    st.cd[i] -= dt;
    if (st.cd[i] > 0) return;
    const cd = m.cd * D.TIER_CD[mc.tier - 1] * B.cdMul(r);
    const dmg = m.dmg * D.TIER_DMG[mc.tier - 1] * B.dmgMul(r, m);
    const t4 = mc.tier >= 4;
    if (m.kind === 'heal') {
      st.cd[i] = 1;
      B.heal(r, dmg * mc.tier);
      ev(st, { t: 'healTick', x: pos.x, y: pos.y });
      return;
    }
    const tg = pickTarget(st, pos.x, pos.y, rangeOf(r, m));
    if (!tg) {
      st.cd[i] = 0.2;
      return;
    }
    st.cd[i] = cd;
    const o = { machine: true, knock: true };
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
          const R = rangeOf(r, m);
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
  });
}

function stepShots(st, dt) {
  for (let i = st.shots.length - 1; i >= 0; i--) {
    const s = st.shots[i];
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
        st.shots.splice(i, 1);
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
        if (s.pool) st.pools.push({ x: s.tx, y: s.ty, R: s.R * 0.8, dps: s.pool, t: 3 });
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
  // 区域：网、泥、火墙、岩浆
  for (let i = st.zones.length - 1; i >= 0; i--) {
    const z = st.zones[i];
    z.t -= dt;
    if (z.kind === 'fire') {
      forEachSeg(st, (g, d) => {
        const p = segXY(st, g);
        if (Math.abs(p.y - z.y) < 20) {
          g.hp -= z.dps * dt;
          if (g.hp <= 0) kill(st, g, d);
        }
      });
    } else if (z.dps) {
      forEachSeg(st, (g, d) => {
        if (g.s > z.s0 && g.s < z.s1) {
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
  stepShots(st, dt);
  moveDragons(st, dt);
  if (st.mode !== 'play') return;
  if (st.bossAlive && !st.dragons.some((d) => d.boss)) {
    st.bossAlive = false;
    ev(st, { t: 'bossDown' });
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

module.exports = { newDefend, step, nextWave, slotPos, rangeOf, segXY, alive, botX, SPOTS, WALL_Y, PLAYER_Y, SEG_R, GAP };
