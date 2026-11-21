// 《墨守》0.4「你当机关龙」· 规则（不碰画面，node 里也能跑，机器人靠它量数）
// 坐标：x 是横向 0–360；wy 是「往上走了多远」，龙头 wy 一直变大，画面跟着往下滚。
const C = require('./config.js');
const { rng, clamp } = require('../util.js');

const HALF = C.BLOCK / 2;
const laneX = (i) => C.CELL * i + C.CELL / 2;

// —— 生成一整关（同一个 seed 永远一样）——
function buildLevel(lv, R) {
  const blocks = [];
  const fences = [];
  const items = [];
  const foes = [];
  const rows = []; // 每排的 wy（算速度和「第几排」用）
  let wy = 230;
  let bi = 0;
  let gi = 0;
  let fi = 0;
  let firstBlock = true;
  let powerAt = 0;
  let pi = 0;
  let gapN = 0;
  const counts = C.BLOCK_COUNTS.slice();
  for (let r = 0; r < lv.rows; r++) {
    const num = lv.num + Math.floor(r / C.NUM_EVERY);
    if (r % 2 === 0) {
      // 空地：栅栏 + 零件（+ 道具）
      const h = C.GAP_ROWS[gi++ % C.GAP_ROWS.length] * C.CELL;
      const nf = C.FENCES[fi++ % C.FENCES.length];
      const bounds = [1, 2, 3, 4].sort(() => R() - 0.5).slice(0, nf);
      bounds.forEach((k) => {
        const len = C.CELL * (R() < 0.5 ? 1.2 : 2);
        const y0 = wy + 10 + R() * Math.max(0, h - len - 20);
        fences.push({ x: C.CELL * k, wy0: y0, wy1: y0 + len });
      });
      const nb = r === 0 ? 2 : 1 + Math.floor(R() * 3);
      for (let k = 0; k < nb; k++) {
        items.push({ kind: 'part', x: laneX(Math.floor(R() * C.LANES)) + (R() < 0.5 ? -14 : 14), wy: wy + 30 + R() * (h - 60), n: 1 + Math.floor(R() * (r < 6 ? 3 : r < 24 ? 4 : 5)), alive: true });
      }
      gapN++;
      if (gapN % C.CHEST_EVERY === 2) items.push({ kind: 'chest', x: laneX(Math.floor(R() * C.LANES)), wy: wy + h * 0.6, n: 0, alive: true });
      else if (wy - powerAt > C.POWER_EVERY * lv.v && r > 1) {
        powerAt = wy;
        items.push({ kind: C.POWERS[pi++ % C.POWERS.length], x: laneX(Math.floor(R() * C.LANES)), wy: wy + h / 2, n: 0, alive: true });
      }
      const T = lv.types || {};
      if (T.rock && r > 2 && R() < T.rock) blocks.push({ kind: 'brick', type: 'rock', x: laneX(Math.floor(R() * C.LANES)), wy: wy + h - 20, n: 2 + Math.floor(R() * num), alive: true, num });
      if (lv.foe && r > 2 && R() < lv.foe) foes.push({ x: 30 + R() * 300, wy: wy + h * 0.45, vx: (R() < 0.5 ? -1 : 1) * (55 + R() * 30 + (lv.elite || 0) * 20), alive: true, stun: 0 });
      rows.push(wy);
      wy += h;
    } else {
      // 一排方块
      if (bi % counts.length === 0) counts.sort(() => R() - 0.5);
      const cnt = firstBlock ? 1 + Math.floor(R() * 3) : counts[bi++ % counts.length];
      firstBlock = false;
      const lanes = [0, 1, 2, 3, 4].sort(() => R() - 0.5).slice(0, cnt);
      const vals = lanes.map((_, k) => (k === 0 && R() < 0.5 ? 1 + Math.floor(R() * num * 2) : 1 + Math.floor(R() * num)));
      // 整排堵死时保证有一格小的（原作是碰运气，我们不让玩家死得冤）
      if (cnt === 5) {
        const lo = Math.max(1, Math.ceil(num / 3));
        const m = vals.indexOf(Math.min.apply(null, vals));
        if (vals[m] > lo) vals[m] = 1 + Math.floor(R() * lo);
      }
      lanes.forEach((ln, k) => {
        const tower = r > 2 && R() < lv.tower;
        let type = null;
        if (!tower && r > 1) {
          for (const [ty, pr] of Object.entries(lv.types || {})) if (ty !== 'rock' && !type && R() < pr) type = ty;
        }
        const n = tower ? Math.max(2, Math.ceil(vals[k] * 0.8)) : type === 'powder' ? 1 + Math.floor(R() * 3) : vals[k];
        blocks.push({ kind: tower ? 'tower' : 'brick', type, x: laneX(ln), wy: wy + HALF, n, n0: 0, alive: true, cd: C.TOWER.first + R() * 0.8, num, ph: R() * 2.4, rg: 0 });
      });
      rows.push(wy);
      wy += C.CELL;
    }
  }
  // 城门前补给：一段空地，三颗大零件
  for (let k = 0; k < 3; k++) items.push({ kind: 'part', x: laneX(1 + k), wy: wy + 60 + k * 30, n: 3 + Math.floor(R() * 3), alive: true });
  wy += C.CELL * 3;
  rows.push(wy);
  const gate = { kind: 'gate', boss: lv.boss || null, x: C.FIELD.w / 2, wy: wy + HALF, n: lv.gate, n0: lv.gate, alive: true, cd: 1, rg: 0 };
  if (gate.boss === 'beast') gate.door = { x: C.FIELD.w / 2, w: 112, vx: 70 + (lv.elite || 0) * 20 };
  blocks.push(gate);
  blocks.forEach((b) => (b.n0 = b.n));
  return { blocks, fences, items, foes, rows, gate, endWY: gate.wy };
}

function newRun(levelIdx, meta, seed) {
  const lv = C.level(levelIdx);
  const R = rng(seed || 1);
  const L = buildLevel(lv, R);
  const startLen = C.START_LEN + ((meta && meta.startLv) || 0);
  const head = { x: laneX(2), wy: 0 };
  const trail = [];
  for (let i = 0; i <= startLen * C.SEG + 40; i += 2) trail.push({ x: head.x, wy: -i });
  trail.reverse();
  return {
    lv, R, t: 0, mode: 'play',
    head, targetX: head.x, len: startLen, startLen, maxLen: startLen,
    trail,
    blocks: L.blocks, fences: L.fences, items: L.items, foes: L.foes, seen: {}, rows: L.rows, gate: L.gate, endWY: L.endWY,
    bolts: [], chewing: null, chewT: 0, combo: 0,
    shield: 0, magnet: 0,
    score: 0, parts: 0, broke: 0, towersBroke: 0, boltHits: 0,
    events: [], short: 0,
    cars: {}, carOrder: [], cards: null, picks: 0,
    armor: 0, armorT: 0, fireCd: 1, bowCd: 1, shots: [], chewN: 0,
    partLuck: ((meta && meta.partLv) || 0) * 0.1,
    pendingCards: meta && meta.cardLv ? 1 : 0,
  };
}

// —— 三选一：特殊车厢 ——
const carLv = (st, id) => st.cars[id] || 0;
function openCards(st) {
  const pool = C.CARS.filter((c) => {
    const lv = carLv(st, c.id);
    if (lv >= 3) return false;
    return lv > 0 || st.carOrder.length < C.MAX_CARS;
  });
  if (!pool.length) {
    st.len += 5;
    ev(st, { t: 'part', x: st.head.x, wy: st.head.wy + 20, n: 5 });
    return;
  }
  const pick = [];
  const left = pool.slice();
  while (pick.length < 3 && left.length) pick.push(left.splice(Math.floor(st.R() * left.length), 1)[0].id);
  st.cards = pick;
  st.mode = 'cards';
  ev(st, { t: 'cards' });
}
function pick(st, i) {
  if (st.mode !== 'cards' || !st.cards || !st.cards[i]) return;
  const id = st.cards[i];
  const lv = carLv(st, id) + 1;
  st.cars[id] = lv;
  if (lv === 1) st.carOrder.push(id);
  if (id === 'armor') st.armor = armorMax(st);
  st.cards = null;
  st.mode = 'play';
  st.picks++;
  ev(st, { t: 'pick', id, lv, evo: lv === 3 });
}
const armorMax = (st) => [0, 2, 3, 5][carLv(st, 'armor')];

const chapter = (st) => C.CHAPTERS[st.lv.ch];
// 幽影砖：2.4 秒一轮，实 1.4 秒、虚 1.0 秒
const phased = (st, b) => b.type === 'ghost' && (st.t + b.ph) % 2.4 > 1.4;
function rowIndex(st) {
  let i = 0;
  while (i < st.rows.length && st.rows[i] < st.head.wy) i++;
  return i;
}
function speedNow(st) {
  return st.lv.v + C.V_EVERY * Math.floor(rowIndex(st) / C.NUM_EVERY);
}

// 车厢位置：沿龙头走过的路往回量
function segments(st, max) {
  const out = [{ x: st.head.x, wy: st.head.wy }];
  const n = Math.min(st.len, max || 999);
  let need = C.SEG;
  let px = st.head.x;
  let py = st.head.wy;
  for (let i = st.trail.length - 1; i >= 0 && out.length < n; i--) {
    const p = st.trail[i];
    let d = Math.hypot(px - p.x, py - p.wy);
    while (d >= need && out.length < n) {
      const t = need / d;
      px = px + (p.x - px) * t;
      py = py + (p.wy - py) * t;
      out.push({ x: px, wy: py });
      d = Math.hypot(px - p.x, py - p.wy);
      need = C.SEG;
    }
    need -= d;
    px = p.x;
    py = p.wy;
  }
  return out;
}

function ev(st, e) {
  st.events.push(e);
}

function breakBlock(st, b, how) {
  b.alive = false;
  st.broke++;
  st.score += b.n0 * 10;
  if (b.kind === 'tower') {
    st.towersBroke++;
    // 拆了弩塔崩出零件
    for (let k = 0; k < 3; k++) st.items.push({ kind: 'part', x: clamp(b.x + (k - 1) * 22, 16, C.FIELD.w - 16), wy: b.wy + 26 + k * 6, n: 1, alive: true, pop: 0.4 });
    st.items.push({ kind: 'chest', x: b.x, wy: b.wy + 10, n: 0, alive: true, pop: 0.5 });
  }
  if (b.type === 'powder') {
    const self = how === 'chew';
    ev(st, { t: 'kaboom', x: b.x, wy: b.wy, self });
    if (self && st.shield <= 0) {
      st.len -= 3;
      if (st.len <= 0) lose(st, 0);
    }
    for (const o of st.blocks) {
      if (!o.alive || o.kind === 'gate' || Math.abs(o.wy - b.wy) > 4 || Math.abs(Math.abs(o.x - b.x) - C.CELL) > 4) continue;
      o.n -= 4;
      if (o.n <= 0) breakBlock(st, o, 'boom');
    }
  }
  const pw = carLv(st, 'powder');
  if (pw && b.kind !== 'gate' && (how !== 'powder' || pw >= 3)) {
    const dmg = [0, 3, 4, 6][pw];
    ev(st, { t: 'powder', x: b.x, wy: b.wy });
    for (const o of st.blocks) {
      if (!o.alive || o.kind === 'gate' || Math.abs(o.wy - b.wy) > 4 || Math.abs(Math.abs(o.x - b.x) - C.CELL) > 4) continue;
      o.n -= dmg;
      if (o.n <= 0) breakBlock(st, o, 'powder');
    }
  }
  ev(st, { t: 'break', x: b.x, wy: b.wy, n0: b.n0, kind: b.kind, how: how || 'chew' });
  if (b.kind === 'gate') {
    st.mode = 'win';
    st.score += st.len * 20;
    ev(st, { t: 'win' });
  }
}

function lose(st, short) {
  if (st.mode !== 'play') return;
  st.mode = 'lose';
  st.short = short || 0;
  ev(st, { t: 'lose', short: st.short });
}

// 横着动：栅栏和旁边的方块挡住
function steer(st, dt) {
  const h = st.head;
  const r = C.HEAD_R;
  const want = clamp(st.targetX, r + 3, C.FIELD.w - r - 3);
  let nx = h.x + clamp(want - h.x, -C.STEER_MAX * dt, C.STEER_MAX * dt);
  for (const f of st.fences) {
    if (h.wy + r > f.wy0 && h.wy - r < f.wy1) {
      if (h.x <= f.x && nx > f.x - r - 3) nx = Math.min(nx, f.x - r - 3);
      if (h.x >= f.x && nx < f.x + r + 3) nx = Math.max(nx, f.x + r + 3);
    }
  }
  for (const b of st.blocks) {
    if (!b.alive || b.kind === 'gate' || phased(st, b)) continue;
    if (Math.abs(h.wy - b.wy) < HALF + r * 0.4) {
      if (h.x <= b.x - HALF && nx > b.x - HALF - r) nx = Math.min(nx, b.x - HALF - r);
      if (h.x >= b.x + HALF && nx < b.x + HALF + r) nx = Math.max(nx, b.x + HALF + r);
    }
  }
  h.x = nx;
}

// 往前冲：碰到方块就停下啃
function advance(st, dt) {
  const h = st.head;
  const r = C.HEAD_R;
  const next = h.wy + speedNow(st) * dt;
  let hit = null;
  let hitD = 1e9;
  for (const b of st.blocks) {
    if (!b.alive || phased(st, b)) continue;
    const front = b.wy - HALF - r;
    if (front < h.wy - 0.5 || front > next) continue;
    const dx = b.kind === 'gate' ? 0 : Math.abs(h.x - b.x);
    if (dx >= HALF + r * 0.55) continue;
    const d = (front - h.wy) * 1000 + dx;
    if (d < hitD) {
      hitD = d;
      hit = b;
    }
  }
  if (hit) {
    h.wy = hit.wy - HALF - r;
    if (st.chewing !== hit) {
      if (!st.chewing) ev(st, { t: 'bump', x: hit.x, wy: hit.wy, kind: hit.kind });
      if (hit.kind === 'gate' && !st.reachedGate) st.reachedGate = st.len;
      st.chewing = hit;
      st.chewT = 0;
    }
  } else {
    h.wy = next;
    if (st.chewing) st.combo = 0;
    st.chewing = null;
  }
  // 撞到栅栏的下端：往原来那边推开
  for (const f of st.fences) {
    if (h.wy + r > f.wy0 && h.wy - r < f.wy1 && Math.abs(h.x - f.x) < r + 3) {
      h.x = h.x < f.x ? f.x - r - 3 : f.x + r + 3;
    }
  }
}

function chew(st, dt) {
  const b = st.chewing;
  if (!b || !b.alive) return;
  if (phased(st, b)) {
    st.chewing = null;
    return;
  }
  b.rg = 0;
  if (b.door && Math.abs(st.head.x - b.door.x) > b.door.w / 2) {
    st.clankT = (st.clankT || 0) - dt;
    if (st.clankT <= 0) {
      st.clankT = 0.35;
      ev(st, { t: 'clank', x: st.head.x, wy: b.wy - HALF });
    }
    return;
  }
  if (st.shield > 0 && b.kind !== 'gate') {
    breakBlock(st, b, 'shield');
    st.chewing = null;
    return;
  }
  // 大方块啃得快一点，不拖
  const tooth = carLv(st, 'tooth');
  const each = C.CHEW * (b.kind === 'gate' ? 0.75 : clamp(9 / b.n0, 0.45, 1)) * [1, 0.7, 0.6, 0.5][tooth];
  st.chewT += dt;
  while (st.chewT >= each && b.alive && st.mode === 'play') {
    st.chewT -= each;
    b.n--;
    st.chewN++;
    const free = tooth && st.chewN % (tooth >= 3 ? 2 : 3) === 0;
    if (!free) st.len--;
    st.combo++;
    ev(st, { t: 'chew', x: b.x, wy: b.wy, n: b.n, kind: b.kind, combo: st.combo, hx: st.head.x, free });
    if (b.n <= 0) breakBlock(st, b);
    if (st.len <= 0) lose(st, b.alive ? b.n : 0);
  }
}

function stepItems(st, dt) {
  const h = st.head;
  for (const it of st.items) {
    if (!it.alive) continue;
    if (it.pop > 0) {
      it.pop -= dt;
      it.wy += 60 * dt;
    }
    const dy = it.wy - h.wy;
    const mr = st.magnet > 0 ? 200 : [0, 170, 260, 900][carLv(st, 'magnet')];
    if (mr && it.kind === 'part' && dy > -40 && dy < mr) {
      const d = Math.hypot(it.x - h.x, dy) || 1;
      const pull = Math.min(d, 520 * dt);
      it.x -= ((it.x - h.x) / d) * pull;
      it.wy -= (dy / d) * pull;
    }
    if (Math.hypot(it.x - h.x, it.wy - h.wy) < C.HEAD_R + 15) {
      it.alive = false;
      if (it.kind === 'chest') {
        ev(st, { t: 'chest', x: it.x, wy: it.wy });
        openCards(st);
        continue;
      }
      if (it.kind === 'part') {
        const extra = [0, 1, 2, 3][carLv(st, 'forge')] + (st.R() < st.partLuck ? 1 : 0);
        st.len += it.n + extra;
        st.parts += it.n + extra;
        st.maxLen = Math.max(st.maxLen, st.len);
        ev(st, { t: 'part', x: it.x, wy: it.wy, n: it.n + extra });
      } else if (it.kind === 'bomb') {
        let cnt = 0;
        for (const b of st.blocks) {
          if (b.alive && b.kind !== 'gate' && b.wy > h.wy - 20 && b.wy < h.wy + 460) {
            breakBlock(st, b, 'bomb');
            cnt++;
          }
        }
        st.bolts.length = 0;
        if (st.chewing && !st.chewing.alive) st.chewing = null;
        ev(st, { t: 'bomb', x: it.x, wy: it.wy, cnt });
      } else {
        st[it.kind] = C.POWER_TIME[it.kind];
        ev(st, { t: 'power', kind: it.kind, x: it.x, wy: it.wy });
      }
    }
  }
}

function stepTowers(st, dt) {
  const h = st.head;
  for (const b of st.blocks) {
    if (!b.alive || b.kind !== 'tower') continue;
    const d = b.wy - h.wy;
    if (d < 20 || d > C.TOWER.range) continue;
    b.cd -= dt;
    if (b.cd <= 0) {
      b.cd = C.TOWER.cd;
      st.bolts.push({ x: b.x, wy: b.wy - HALF });
      if (st.lv.elite) {
        if (b.x - C.CELL > 0) st.bolts.push({ x: b.x - C.CELL, wy: b.wy - HALF });
        if (b.x + C.CELL < C.FIELD.w) st.bolts.push({ x: b.x + C.CELL, wy: b.wy - HALF });
      }
      ev(st, { t: 'fire', x: b.x, wy: b.wy - HALF });
    }
  }
  if (!st.bolts.length) return;
  const segs = segments(st, 40);
  for (let i = st.bolts.length - 1; i >= 0; i--) {
    const bo = st.bolts[i];
    bo.wy -= C.TOWER.boltV * dt;
    let hitIdx = -1;
    for (let k = 0; k < segs.length; k++) {
      if (Math.abs(segs[k].x - bo.x) < 12 && Math.abs(segs[k].wy - bo.wy) < 13) {
        hitIdx = k;
        break;
      }
    }
    if (hitIdx >= 0) {
      st.bolts.splice(i, 1);
      if (st.shield > 0 || st.armor > 0) {
        if (st.shield <= 0) {
          st.armor--;
          st.armorT = 0;
        }
        ev(st, { t: 'deflect', x: bo.x, wy: bo.wy, armor: st.shield <= 0 });
        continue;
      }
      st.len--;
      st.boltHits++;
      st.combo = 0;
      ev(st, { t: 'boltHit', x: segs[hitIdx].x, wy: segs[hitIdx].wy });
      if (st.len <= 0) lose(st, 1);
    } else if (bo.wy < h.wy - 420) st.bolts.splice(i, 1);
  }
}

function hurtBlock(st, b, dmg, how) {
  if (!b.alive || phased(st, b)) return;
  if (b.type === 'iron' && (how === 'fire' || how === 'bow')) {
    ev(st, { t: 'clank', x: b.x, wy: b.wy - HALF });
    return;
  }
  b.rg = 0;
  b.n -= b.kind === 'gate' ? Math.ceil(dmg / 2) : dmg;
  if (b.n <= 0) {
    b.n = 0;
    breakBlock(st, b, how);
    if (st.chewing === b) st.chewing = null;
  }
}
// 前面这条道上最近的砖（城门横跨全宽）
function blockAhead(st, x, range, skip) {
  let best = null;
  for (const b of st.blocks) {
    if (!b.alive || b === skip) continue;
    const d = b.wy - st.head.wy;
    if (d < 0 || d > range) continue;
    if (b.kind !== 'gate' && Math.abs(b.x - x) > HALF) continue;
    if (!best || b.wy < best.wy) best = b;
  }
  return best;
}
function stepCars(st, dt) {
  const f = carLv(st, 'fire');
  if (f) {
    st.fireCd -= dt;
    const range = f >= 3 ? 230 : 150;
    if (st.fireCd <= 0) {
      const b = blockAhead(st, st.head.x, range);
      if (b) {
        st.fireCd = [0, 2.0, 1.6, 1.4][f];
        const dmg = [0, 3, 5, 8][f];
        ev(st, { t: 'fire', x: st.head.x, wy: st.head.wy, to: b.wy - HALF, lv: f });
        hurtBlock(st, b, dmg, 'fire');
        if (f >= 3) {
          const b2 = blockAhead(st, st.head.x, range + C.CELL * 2, b);
          if (b2 && b2.alive) hurtBlock(st, b2, dmg, 'fire');
        }
      } else st.fireCd = 0.2;
    }
  }
  const bw = carLv(st, 'bow');
  if (bw) {
    st.bowCd -= dt;
    if (st.bowCd <= 0) {
      st.bowCd = [0, 1.2, 0.85, 0.85][bw];
      const segs = segments(st, 4);
      const p = segs[Math.min(segs.length - 1, 1 + st.carOrder.indexOf('bow'))] || st.head;
      const dirs = bw >= 3 ? [-0.22, 0, 0.22] : [0];
      for (const d of dirs) st.shots.push({ x: p.x, wy: p.wy + 10, vx: d * 520 });
      ev(st, { t: 'bowShot', x: p.x, wy: p.wy });
    }
  }
  for (let i = st.shots.length - 1; i >= 0; i--) {
    const sh = st.shots[i];
    sh.wy += 560 * dt;
    sh.x += sh.vx * dt;
    let hit = null;
    for (const b of st.blocks) {
      if (!b.alive || phased(st, b)) continue;
      if (Math.abs(b.wy - sh.wy) < HALF && (b.kind === 'gate' || Math.abs(b.x - sh.x) < HALF)) {
        hit = b;
        break;
      }
    }
    if (hit) {
      st.shots.splice(i, 1);
      ev(st, { t: 'shotHit', x: sh.x, wy: hit.wy - HALF });
      hurtBlock(st, hit, 1, 'bow');
    } else if (sh.wy > st.head.wy + 700 || sh.x < 0 || sh.x > C.FIELD.w) st.shots.splice(i, 1);
  }
  const am = armorMax(st);
  if (am && st.armor < am) {
    st.armorT += dt;
    if (st.armorT >= (carLv(st, 'armor') >= 3 ? 3 : 5)) {
      st.armorT = 0;
      st.armor++;
    }
  }
}

function stepEnemies(st, dt) {
  const h = st.head;
  for (const b of st.blocks) {
    if (!b.alive) continue;
    const d = b.wy - h.wy;
    if (b.type === 'rock' && d < 560) {
      b.wy -= 75 * dt;
      // 滚到龙头上：顶住，变成正在啃的那块
      if (Math.abs(h.x - b.x) < HALF + C.HEAD_R * 0.55 && b.wy - HALF - C.HEAD_R < h.wy && b.wy > h.wy - HALF) {
        b.wy = h.wy + HALF + C.HEAD_R;
        if (st.chewing !== b) {
          st.chewing = b;
          st.chewT = 0;
          ev(st, { t: 'bump', x: b.x, wy: b.wy, kind: 'rock' });
        }
      }
      if (b.wy < h.wy - 320) b.alive = false;
    }
    if ((b.type === 'clay' || b.boss === 'general') && st.chewing !== b && b.n < b.n0 && d < 600) {
      b.rg += dt;
      if (b.rg >= (b.boss ? 0.45 : 0.7)) {
        b.rg = 0;
        b.n++;
        ev(st, { t: 'regen', x: b.boss ? h.x : b.x, wy: b.wy });
      }
    }
    if (b.door) {
      const dr = b.door;
      dr.x += dr.vx * dt;
      if (dr.x < dr.w / 2 + 4 || dr.x > C.FIELD.w - dr.w / 2 - 4) {
        dr.vx = -dr.vx;
        dr.x = clamp(dr.x, dr.w / 2 + 4, C.FIELD.w - dr.w / 2 - 4);
      }
    }
    if (b.boss === 'ballista' && d < 620) {
      b.cd -= dt;
      if (b.cd <= 0) {
        b.cd = st.lv.elite ? 1.3 : 1.7;
        const lanes = [0, 1, 2, 3, 4].sort(() => st.R() - 0.5).slice(0, 3);
        for (const ln of lanes) st.bolts.push({ x: laneX(ln), wy: b.wy - HALF - 40 });
        ev(st, { t: 'volley', wy: b.wy });
      }
    }
    if (d < 470 && d > 0) {
      const key = b.boss || b.type;
      if (key && !st.seen[key]) {
        st.seen[key] = 1;
        ev(st, { t: b.boss ? 'newBoss' : 'newType', key });
      }
    }
  }
  if (!st.foes.length) return;
  const segs = segments(st, 40);
  for (const f of st.foes) {
    if (!f.alive) continue;
    const d = f.wy - h.wy;
    if (d < -340) {
      f.alive = false;
      continue;
    }
    if (d > 700) continue;
    if (d < 470 && !st.seen.foe) {
      st.seen.foe = 1;
      ev(st, { t: 'newType', key: 'foe' });
    }
    if (f.stun > 0) f.stun -= dt;
    else {
      f.x += f.vx * dt;
      if (f.x < 18 || f.x > C.FIELD.w - 18) {
        f.vx = -f.vx;
        f.x = clamp(f.x, 18, C.FIELD.w - 18);
      }
    }
    if (Math.hypot(f.x - h.x, f.wy - h.wy) < 22) {
      f.alive = false;
      st.len += 2;
      st.parts += 2;
      ev(st, { t: 'foeEat', x: f.x, wy: f.wy });
      continue;
    }
    if (f.stun > 0) continue;
    for (let k = 1; k < segs.length; k++) {
      if (Math.hypot(segs[k].x - f.x, segs[k].wy - f.wy) < 15) {
        f.stun = 1.2;
        f.vx = -f.vx;
        if (st.shield > 0 || st.armor > 0) {
          if (st.shield <= 0) st.armor--;
          ev(st, { t: 'deflect', x: f.x, wy: f.wy, armor: true });
        } else {
          st.len -= 3;
          ev(st, { t: 'foeCut', x: segs[k].x, wy: segs[k].wy });
          if (st.len <= 0) lose(st, 0);
        }
        break;
      }
    }
  }
}

function step(st, dt) {
  if (st.pendingCards && st.mode === 'play' && st.t > 0.8) {
    st.pendingCards = 0;
    openCards(st);
  }
  if (st.mode !== 'play') return;
  st.t += dt;
  if (st.shield > 0) st.shield = Math.max(0, st.shield - dt);
  if (st.magnet > 0) st.magnet = Math.max(0, st.magnet - dt);
  steer(st, dt);
  stepEnemies(st, dt);
  if (st.mode !== 'play') return;
  advance(st, dt);
  chew(st, dt);
  if (st.mode !== 'play') return;
  stepItems(st, dt);
  if (st.mode !== 'play') return;
  stepTowers(st, dt);
  stepCars(st, dt);
  // 记下龙头走过的路（车厢跟着走）
  const last = st.trail[st.trail.length - 1];
  if (Math.hypot(st.head.x - last.x, st.head.wy - last.wy) >= 2) st.trail.push({ x: st.head.x, wy: st.head.wy });
  const keep = Math.min(st.len, 60) * C.SEG / 2 + 60;
  if (st.trail.length > keep * 1.5) st.trail.splice(0, st.trail.length - keep);
  st.maxLen = Math.max(st.maxLen, st.len);
}

// —— 机器人：看前面的一排，挑扣得最少、零件最多的道 ——
// skill.look：看多远；skill.miss：挑错的机会；skill.react：多久重新想一次
function botThink(st, skill, mem) {
  mem.cd = (mem.cd || 0) - 1 / 60;
  if (mem.cd > 0 && mem.lane !== undefined) return laneX(mem.lane);
  mem.cd = skill.react;
  const h = st.head;
  const cost = [0, 0, 0, 0, 0];
  const gain = [0, 0, 0, 0, 0];
  // 前面最近的一排方块
  let rowWy = null;
  for (const b of st.blocks) {
    if (!b.alive) continue;
    const d = b.wy - h.wy;
    if (d > -10 && d < skill.look && (rowWy === null || b.wy < rowWy)) rowWy = b.wy;
  }
  if (rowWy !== null) {
    for (const b of st.blocks) {
      if (!b.alive || Math.abs(b.wy - rowWy) > 4) continue;
      if (b.kind === 'gate') {
        if (b.door) return b.door.x;
        for (let i = 0; i < 5; i++) cost[i] += b.n;
      } else {
        const extra = b.kind === 'tower' ? -2 : b.type === 'powder' ? 3 : b.type === 'ghost' ? -b.n * 0.5 : 0;
        cost[Math.floor(b.x / C.CELL)] += b.n + extra;
      }
    }
  }
  for (const it of st.items) {
    if (!it.alive) continue;
    const d = it.wy - h.wy;
    if (d > 0 && d < skill.look * 0.8 && (rowWy === null || it.wy < rowWy)) gain[clamp(Math.floor(it.x / C.CELL), 0, 4)] += it.kind === 'part' ? it.n : 3;
  }
  for (const bo of st.bolts) cost[clamp(Math.floor(bo.x / C.CELL), 0, 4)] += 2;
  const cur = clamp(Math.floor(h.x / C.CELL), 0, 4);
  const score = cost.map((c, i) => (c >= st.len ? 1000 + c : c) - gain[i] * 0.9 + Math.abs(i - cur) * 0.3);
  const order = [0, 1, 2, 3, 4].sort((a, b) => score[a] - score[b]);
  let pick = order[0];
  if (st.R() < skill.miss) pick = order[1];
  mem.lane = pick;
  return laneX(pick);
}

const BOT_PREF = ['forge', 'fire', 'bow', 'tooth', 'powder', 'armor', 'magnet'];
function botPick(st) {
  if (st.mode !== 'cards') return;
  let best = 0;
  st.cards.forEach((id, i) => {
    if (BOT_PREF.indexOf(id) < BOT_PREF.indexOf(st.cards[best])) best = i;
  });
  pick(st, best);
}

module.exports = { newRun, pick, botPick, openCards, carLv, phased, step, segments, speedNow, rowIndex, chapter, botThink, laneX, HALF };
