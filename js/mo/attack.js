// 《墨守》0.6 · 进攻模式：开小工程车 / 机关龙往上冲，车上的机关自动打前面的城砖、弩塔。
// 底子照 0.4「你当机关龙」（5 条道、撞砖停下啃）；改成：车有血（啃一口掉 1 血），机关装在车格上，路上分 3 段，段与段之间进驿站（波间机关台），最后撞开城门。
const D = require('./data.js');
const B = require('./build.js');
const { clamp } = require('../util.js');

const LANES = 5;
const CELL = 72;
const BLOCK = 66;
const HALF = BLOCK / 2;
const HEAD_Y = 520;
const HEAD_R = 14;
const SEG = 22;
const laneX = (i) => CELL * i + CELL / 2;

function buildLevel(st) {
  const r = st.r;
  const lv = r.lv;
  const R = r.R;
  const blocks = [];
  const fences = [];
  const items = [];
  const legEnds = [];
  let wy = 220;
  const rush = lv.challenge === 'rush';
  for (let leg = 0; leg < lv.waves; leg++) {
    const rowsPer = 10 + leg * 2;
    for (let k = 0; k < rowsPer; k++) {
      const num = lv.num + leg + Math.floor(k / 6);
      if (k % 2 === 0) {
        const h = CELL * (2 + Math.floor(R() * 2));
        if (R() < 0.6) {
          const bx = CELL * (1 + Math.floor(R() * 4));
          const y0 = wy + 10 + R() * (h - 100);
          fences.push({ x: bx, wy0: y0, wy1: y0 + CELL * 1.4 });
        }
        const nr = 1 + Math.floor(R() * 2);
        for (let q = 0; q < nr; q++) items.push({ kind: 'repair', x: laneX(Math.floor(R() * 5)), wy: wy + 30 + R() * (h - 60), n: 2 + Math.floor(R() * 4), alive: true });
        wy += h;
      } else {
        const cnt = Math.min(5, (rush ? 4 : 3) + Math.floor(R() * 3));
        const lanes = [0, 1, 2, 3, 4].sort(() => R() - 0.5).slice(0, cnt);
        const vals = lanes.map(() => 1 + Math.floor(R() * num));
        if (cnt === 5) vals[vals.indexOf(Math.max.apply(null, vals))] = 1 + Math.floor(R() * Math.ceil(num / 3));
        lanes.forEach((ln, i) => {
          const tower = k > 2 && R() < 0.12 + leg * 0.03;
          let type = null;
          if (!tower) for (const [ty, p] of Object.entries(lv.types || {})) if (!type && R() < p) type = ty;
          const n = tower ? Math.max(3, vals[i]) : type === 'powder' ? 1 + Math.floor(R() * 3) : vals[i];
          blocks.push({ kind: tower ? 'tower' : 'brick', type, x: laneX(ln), wy: wy + HALF, n, n0: n, alive: true, cd: 0.6 + R(), num, stun: 0 });
        });
        wy += CELL;
      }
    }
    wy += CELL * 1.5;
    legEnds.push(wy); // 驿站
    wy += CELL;
  }
  const gate = { kind: 'gate', boss: lv.boss || null, x: D.FIELD.w / 2, wy: wy + HALF + 40, n: (lv.boss ? 30 : 16) + lv.num * 3, n0: 0, alive: true, cd: 1.5 };
  gate.n0 = gate.n;
  blocks.push(gate);
  return { blocks, fences, items, legEnds, gate, endWY: gate.wy };
}

function newAttack(r) {
  const st = {
    r, t: 0, mode: 'play', events: [],
    head: { x: laneX(2), wy: 0 }, targetX: laneX(2), trail: [],
    bolts: [], shots: [], chewing: null, chewT: 0, leg: 0,
    cd: r.slots.map(() => 0.6), guard: 0, guardT: 0, golem: 0,
    car: r.lv.car, rush: r.lv.challenge === 'rush',
  };
  for (let i = 0; i <= 400; i += 2) st.trail.push({ x: st.head.x, wy: -400 + i });
  Object.assign(st, buildLevel(st));
  return st;
}
const ev = (st, e) => st.events.push(e);
const has = (st, kind) => st.r.slots.some((s) => s && D.M[s.id].atk === kind);
function tierOf(st, kind) {
  let t = 0;
  st.r.slots.forEach((s) => s && D.M[s.id].atk === kind && (t = Math.max(t, s.tier)));
  return t;
}

// 车格的位置：小工程车两格挨着车头；机关龙一节一格
function segments(st, n) {
  const out = [{ x: st.head.x, wy: st.head.wy }];
  let need = SEG;
  let px = st.head.x;
  let py = st.head.wy;
  for (let i = st.trail.length - 1; i >= 0 && out.length < n; i--) {
    const p = st.trail[i];
    let d = Math.hypot(px - p.x, py - p.wy);
    while (d >= need && out.length < n) {
      const t = need / d;
      px += (p.x - px) * t;
      py += (p.wy - py) * t;
      out.push({ x: px, wy: py });
      d = Math.hypot(px - p.x, py - p.wy);
      need = SEG;
    }
    need -= d;
    px = p.x;
    py = p.wy;
  }
  return out;
}
const bodyLen = (st) => (st.car === 'dragon' ? st.r.slots.length + 1 : 2);
function speed(st) {
  let v = (st.car === 'dragon' ? 110 : 132) + st.leg * 10;
  if (st.rush) v *= 2;
  return v;
}

function breakBlock(st, b, how) {
  b.alive = false;
  if (st.chewing === b) st.chewing = null;
  const el = b.kind === 'gate' ? null : B.gainKill(st.r, b.kind === 'tower' || !!b.type);
  ev(st, { t: 'break', x: b.x, wy: b.wy, kind: b.kind, type: b.type, el, how });
  if (b.type === 'powder') {
    ev(st, { t: 'kaboom', x: b.x, wy: b.wy, self: how === 'chew' });
    if (how === 'chew') B.hurtSelf(st.r, 3);
    for (const o of st.blocks) if (o.alive && o.kind !== 'gate' && Math.abs(o.wy - b.wy) < 4 && Math.abs(Math.abs(o.x - b.x) - CELL) < 4) hurt(st, o, 4, 'boom');
  }
  if (b.kind === 'gate') {
    st.mode = 'win';
    ev(st, { t: 'win' });
  }
}
function hurt(st, b, dmg, how) {
  if (!b.alive) return;
  if (b.type === 'iron' && (how === 'shoot' || how === 'fire')) {
    ev(st, { t: 'clank', x: b.x, wy: b.wy - HALF });
    return;
  }
  b.n -= b.kind === 'gate' ? dmg / 2 : dmg;
  ev(st, { t: 'hit', x: b.x, wy: b.wy - HALF, dmg: Math.max(1, Math.round(dmg)) });
  if (b.n <= 0) {
    b.n = 0;
    breakBlock(st, b, how);
  }
}
function blockAhead(st, x, range, skip) {
  let best = null;
  for (const b of st.blocks) {
    if (!b.alive || (skip && skip.indexOf(b) >= 0)) continue;
    const d = b.wy - st.head.wy;
    if (d < -10 || d > range) continue;
    if (b.kind !== 'gate' && Math.abs(b.x - x) > HALF) continue;
    if (!best || b.wy < best.wy) best = b;
  }
  return best;
}

function steer(st, dt) {
  const h = st.head;
  let nx = h.x + clamp(clamp(st.targetX, 18, 342) - h.x, -1100 * dt, 1100 * dt);
  for (const f of st.fences) {
    if (h.wy + HEAD_R > f.wy0 && h.wy - HEAD_R < f.wy1) {
      if (h.x <= f.x && nx > f.x - HEAD_R - 3) nx = Math.min(nx, f.x - HEAD_R - 3);
      if (h.x >= f.x && nx < f.x + HEAD_R + 3) nx = Math.max(nx, f.x + HEAD_R + 3);
    }
  }
  for (const b of st.blocks) {
    if (!b.alive || b.kind === 'gate' || Math.abs(h.wy - b.wy) >= HALF + HEAD_R * 0.4) continue;
    if (h.x <= b.x - HALF && nx > b.x - HALF - HEAD_R) nx = Math.min(nx, b.x - HALF - HEAD_R);
    if (h.x >= b.x + HALF && nx < b.x + HALF + HEAD_R) nx = Math.max(nx, b.x + HALF + HEAD_R);
  }
  h.x = nx;
}
function advance(st, dt) {
  const h = st.head;
  const next = h.wy + speed(st) * dt;
  let hit = null;
  for (const b of st.blocks) {
    if (!b.alive) continue;
    const front = b.wy - HALF - HEAD_R;
    if (front < h.wy - 0.5 || front > next) continue;
    if (b.kind !== 'gate' && Math.abs(h.x - b.x) >= HALF + HEAD_R * 0.55) continue;
    if (!hit || b.wy < hit.wy) hit = b;
  }
  if (hit) {
    h.wy = hit.wy - HALF - HEAD_R;
    if (st.chewing !== hit) {
      st.chewing = hit;
      st.chewT = 0;
      ev(st, { t: 'bump', x: hit.x, wy: hit.wy });
    }
  } else {
    h.wy = next;
    st.chewing = null;
  }
  // 到驿站：停下进波间机关台
  if (st.leg < st.legEnds.length - 1 && h.wy >= st.legEnds[st.leg]) {
    st.leg++;
    st.bolts = [];
    st.shots = [];
    st.mode = 'shop';
    ev(st, { t: 'waveClear', leg: st.leg });
  }
}
function chew(st, dt) {
  const b = st.chewing;
  if (!b || !b.alive) return;
  const ct = tierOf(st, 'chew');
  const each = 0.09 / (1 + 0.3 * ct) * (b.kind === 'gate' ? 0.8 : 1);
  st.chewT += dt;
  while (st.chewT >= each && b.alive && st.mode === 'play') {
    st.chewT -= each;
    b.n -= 1;
    st.r.hp -= 1;
    ev(st, { t: 'chew', x: st.head.x, wy: b.wy, kind: b.kind });
    if (b.n <= 0) breakBlock(st, b, 'chew');
    if (st.r.hp <= 0) {
      st.r.hp = 0;
      st.mode = 'lose';
      ev(st, { t: 'lose', left: b.alive ? Math.ceil(b.n) : 0 });
    }
  }
}

// —— 车上的机关 ——
function stepMachines(st, dt) {
  const r = st.r;
  const stt = B.stats(r);
  const segs = segments(st, bodyLen(st));
  const range = 260 + stt.range;
  r.slots.forEach((mc, i) => {
    if (!mc) return;
    const m = D.M[mc.id];
    const pos = segs[Math.min(segs.length - 1, st.car === 'dragon' ? i + 1 : 1)] || st.head;
    st.cd[i] -= dt;
    if (st.cd[i] > 0) return;
    const cd = m.cd * D.TIER_CD[mc.tier - 1] * B.cdMul(r);
    const dmg = (m.dmg * D.TIER_DMG[mc.tier - 1] * B.dmgMul(r, m)) / 8;
    st.cd[i] = cd;
    switch (m.atk) {
      case 'shoot':
      case 'shoot2': {
        const n = mc.tier >= 4 && m.id === 'nu' ? 3 : 1;
        for (let k = 0; k < n; k++) st.shots.push({ x: pos.x + (k - (n - 1) / 2) * 10, wy: pos.wy + 12, dmg: B.rollCrit(r, dmg, m.critBonus)[0], left: (m.atk === 'shoot2' ? 2 : 1) + stt.pierce });
        ev(st, { t: 'mShoot', x: pos.x, wy: pos.wy });
        break;
      }
      case 'lobAhead': {
        const b = blockAhead(st, st.head.x, range);
        if (!b) {
          st.cd[i] = 0.2;
          break;
        }
        const R = (m.r || 40) * 2 * (1 + stt.aoe / 100);
        for (const o of st.blocks) if (o.alive && Math.hypot(o.x - b.x, o.wy - b.wy) < R) hurt(st, o, dmg, 'lob');
        if (m.selfHurt && mc.tier < 4) B.hurtSelf(r, m.selfHurt);
        ev(st, { t: 'lobBoom', x: b.x, wy: b.wy, R });
        break;
      }
      case 'fireRow': {
        const b = blockAhead(st, st.head.x, range);
        if (!b) {
          st.cd[i] = 0.2;
          break;
        }
        for (const o of st.blocks) if (o.alive && Math.abs(o.wy - b.wy) < 4) hurt(st, o, dmg * 2, 'fire');
        ev(st, { t: 'fireRow', wy: b.wy });
        break;
      }
      case 'chainRow': {
        const b = blockAhead(st, st.head.x, range);
        if (!b) {
          st.cd[i] = 0.2;
          break;
        }
        const row = st.blocks.filter((o) => o.alive && Math.abs(o.wy - b.wy) < 4).sort((a, c) => Math.abs(a.x - b.x) - Math.abs(c.x - b.x));
        row.slice(0, (mc.tier >= 4 ? 5 : 3) + stt.pierce).forEach((o) => hurt(st, o, dmg, 'chain'));
        ev(st, { t: 'chain', wy: b.wy, xs: row.map((o) => o.x) });
        break;
      }
      case 'freezeTower':
      case 'mud': {
        let any = false;
        for (const o of st.blocks) {
          if (o.alive && o.kind === 'tower' && o.wy - st.head.wy < range && o.wy > st.head.wy) {
            o.stun = m.atk === 'mud' ? 3 : 2 + stt.freeze / 20;
            any = true;
            if (m.atk === 'freezeTower') hurt(st, o, dmg, 'frost');
          }
        }
        if (any) ev(st, { t: m.atk === 'mud' ? 'mud' : 'frost', x: st.head.x, wy: st.head.wy + 120 });
        else st.cd[i] = 0.3;
        break;
      }
      case 'netGuard':
        st.guard = Math.min(mc.tier + 1, st.guard + 1);
        break;
      case 'golem':
        st.golem = 1;
        break;
      case 'heal':
        st.cd[i] = 1;
        B.heal(r, m.dmg * mc.tier);
        break;
      case 'chew':
        st.cd[i] = 99;
        break;
    }
  });
  for (let i = st.shots.length - 1; i >= 0; i--) {
    const s = st.shots[i];
    s.wy += 560 * dt;
    let done = s.wy > st.head.wy + 700;
    for (const b of st.blocks) {
      if (done || !b.alive) continue;
      if (Math.abs(b.wy - s.wy) < HALF && (b.kind === 'gate' || Math.abs(b.x - s.x) < HALF)) {
        if (s.hitSet && s.hitSet.indexOf(b) >= 0) continue;
        (s.hitSet = s.hitSet || []).push(b);
        hurt(st, b, s.dmg, 'shoot');
        s.left--;
        if (s.left <= 0) done = true;
      }
    }
    if (done) st.shots.splice(i, 1);
  }
}

function stepEnemies(st, dt) {
  const h = st.head;
  for (const b of st.blocks) {
    if (!b.alive) continue;
    const d = b.wy - h.wy;
    if (b.stun > 0) {
      b.stun -= dt;
      continue;
    }
    if (b.kind === 'tower' && d > 20 && d < 430) {
      b.cd -= dt;
      if (b.cd <= 0) {
        b.cd = 1.8;
        st.bolts.push({ x: b.x, wy: b.wy - HALF });
        ev(st, { t: 'fire', x: b.x, wy: b.wy });
      }
    }
    if (b.boss === 'ballista' && d < 620) {
      b.cd -= dt;
      if (b.cd <= 0) {
        b.cd = 1.7;
        [0, 1, 2, 3, 4].sort(() => st.r.R() - 0.5).slice(0, 3).forEach((ln) => st.bolts.push({ x: laneX(ln), wy: b.wy - HALF - 40 }));
        ev(st, { t: 'volley' });
      }
    }
  }
  const segs = segments(st, bodyLen(st));
  for (let i = st.bolts.length - 1; i >= 0; i--) {
    const bo = st.bolts[i];
    bo.wy -= 220 * dt;
    const hitSeg = segs.find((g) => Math.abs(g.x - bo.x) < 14 && Math.abs(g.wy - bo.wy) < 14);
    if (hitSeg) {
      st.bolts.splice(i, 1);
      if (st.guard > 0 || st.golem > 0) {
        if (st.guard > 0) st.guard--;
        else st.golem = 0;
        ev(st, { t: 'deflect', x: bo.x, wy: bo.wy });
        continue;
      }
      const real = B.hurtSelf(st.r, 4);
      ev(st, { t: 'boltHit', x: bo.x, wy: bo.wy, dmg: Math.round(real) });
      if (st.r.hp <= 0) {
        st.mode = 'lose';
        ev(st, { t: 'lose', left: 0 });
        return;
      }
    } else if (bo.wy < h.wy - 400) st.bolts.splice(i, 1);
  }
  for (const it of st.items) {
    if (it.alive && Math.hypot(it.x - h.x, it.wy - h.wy) < HEAD_R + 16) {
      it.alive = false;
      B.heal(st.r, it.n);
      ev(st, { t: 'repair', x: it.x, wy: it.wy, n: it.n });
    }
  }
}

function step(st, dt) {
  if (st.mode !== 'play') return;
  st.t += dt;
  steer(st, dt);
  advance(st, dt);
  if (st.mode !== 'play') return;
  chew(st, dt);
  if (st.mode !== 'play') return;
  stepMachines(st, dt);
  stepEnemies(st, dt);
  const last = st.trail[st.trail.length - 1];
  if (Math.hypot(st.head.x - last.x, st.head.wy - last.wy) >= 2) st.trail.push({ x: st.head.x, wy: st.head.wy });
  if (st.trail.length > 600) st.trail.splice(0, 200);
}
function nextWave(st) {
  st.mode = 'play';
  st.cd = st.r.slots.map(() => 0.4);
  ev(st, { t: 'waveStart', wave: st.leg });
}

// 机器人：挑前面最便宜的道
function botX(st) {
  const h = st.head;
  let rowWy = null;
  for (const b of st.blocks) if (b.alive && b.wy > h.wy - 10 && b.wy - h.wy < 260 && (rowWy === null || b.wy < rowWy)) rowWy = b.wy;
  if (rowWy === null) return h.x;
  const cost = [0, 0, 0, 0, 0];
  for (const b of st.blocks) {
    if (!b.alive || Math.abs(b.wy - rowWy) > 4) continue;
    if (b.kind === 'gate') return h.x;
    cost[clamp(Math.floor(b.x / CELL), 0, 4)] += b.n + (b.type === 'powder' ? 3 : 0);
  }
  const cur = clamp(Math.floor(h.x / CELL), 0, 4);
  let best = 0;
  for (let i = 1; i < 5; i++) if (cost[i] + Math.abs(i - cur) * 0.3 < cost[best] + Math.abs(best - cur) * 0.3) best = i;
  return laneX(best);
}

module.exports = { newAttack, step, nextWave, segments, bodyLen, botX, laneX, HALF, HEAD_Y, HEAD_R, CELL, BLOCK };
