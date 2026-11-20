// 一局的全部规则（不画图、不出声）：龙怎么爬、兵种、七件武器、三选一、拉总闸、输赢。
// 画面和声音从 st.events 里取（main.js 每帧清空）。测试机器人在 node 里直接跑这个文件。
const C = require('./config.js');
const { rng, clamp } = require('./util.js');
const { build } = require('./path.js');

const W = {};
C.WEAPONS.forEach((w) => (W[w.id] = w));
const TR = C.TYPE_RULE;

function pickType(lv, rand) {
  let r = rand();
  for (const k in lv.types) {
    if (r < lv.types[k]) return k;
    r -= lv.types[k];
  }
  return 'basic';
}

function newRun(levelIndex, meta, seed) {
  const lv = C.level(levelIndex);
  const ch = C.CHAPTERS[lv.ch];
  const rand = rng(seed || 1);
  const path = build(lv.rows, levelIndex % 2 === 1, ch.path);
  const buddy = C.BUDDIES.find((b) => b.id === (meta && meta.buddy)) || null;
  // 机关匣：第一个放得很靠前（开局十秒内就能开），其余均匀撒开
  const chestAt = new Set([2]);
  for (let k = 1; k < lv.chests; k++) {
    const base = Math.floor(2 + (k * (lv.n - 4)) / lv.chests);
    chestAt.add(clamp(base + Math.floor(rand() * 3) - 1, 3, lv.n - 1));
  }
  const segs = [];
  for (let i = 0; i < lv.n; i++) {
    const chest = chestAt.has(i);
    const ram = i === lv.n - 1;
    const type = chest || ram || i < 3 ? 'basic' : pickType(lv, rand);
    let hp = lv.hp * (1 + lv.growth * Math.pow(i / Math.max(1, lv.n - 1), C.DRAGON.curve)) * (0.85 + 0.3 * rand());
    if (ram) hp *= C.DRAGON.tailMul;
    if (chest) hp *= 1.5;
    if (C.TYPES[type]) hp *= C.TYPES[type].hpMul;
    hp = Math.max(5, Math.round(hp / 5) * 5);
    segs.push(mkSeg(i, -i * C.DRAGON.gap - 20, hp, type, chest, ram, rand() * 3.5));
  }
  const st = {
    level: levelIndex,
    lv,
    ch,
    path,
    rand,
    buddy,
    bowLv: (meta && meta.bowLv) || 0,
    t: 0,
    segs,
    total: lv.n,
    nextId: lv.n,
    bullets: [],
    px: C.FIELD.w / 2,
    fireCd: 0.3,
    weapons: { bow: 1 }, // 带着的武器和等级
    wcd: {}, // 各武器冷却
    blades: [],
    pots: [],
    fires: [],
    hammers: [],
    beam: null,
    frostT: 0,
    freezeT: 0,
    frostSlow: 1,
    mode: 'play',
    cards: null,
    pendingCards: 0,
    firstCards: true,
    kills: 0,
    gold: 0,
    rushed: false,
    lever: { offer: 0, used: false },
    adsUsed: 0,
    danger: 0,
    comboTimes: [],
    comboShown: 0,
    events: [],
    nextBulletId: 1,
    endT: 0,
    seenTypes: {},
  };
  st.pal = buddy ? { state: 'home', cd: buddy.cd * 0.5, x: st.px + 34, y: C.FIELD.playerY - 20, t: 0, n: 0, target: -1, fx: 0, fy: 0 } : null;
  st.shells = [];
  st.slowT = 0;
  st.mods = mods(st);
  placeSegs(st);
  return st;
}

function mkSeg(id, s, hp, type, chest, ram, ph) {
  return { id, s, hp, max: hp, chest: !!chest, ram: !!ram, type: type || 'basic', r: type === 'mini' ? 11 : C.DRAGON.r, ph: ph || 0, litT: 0, noRegen: 0, frozT: 0, regenFx: 0, flash: 0, x: 0, y: -99, a: 0 };
}

function mods(st) {
  const base = C.BOW.dmg * (1 + C.UPGRADE.pct * st.bowLv);
  const bl = st.weapons.bow || 1;
  return {
    base, // 弩机一箭（只算局外升级）：所有武器的伤害按它的倍数算
    dmg: base * (bl >= 5 ? 1.2 : 1),
    interval: C.BOW.interval * (bl >= 3 ? 0.78 : 1) * (bl >= 5 ? 0.85 : 1),
    n: bl >= 5 ? 5 : 1 + (bl >= 2 ? 1 : 0) + (bl >= 4 ? 1 : 0),
    pierce: bl >= 5 ? 1 : 0,
    // 武器有多「重」：画面上箭的样子、打中的声音跟着变
    tier: st.bowLv + (bl - 1),
  };
}

function placeSegs(st) {
  for (const g of st.segs) {
    const p = st.path.at(g.s);
    g.x = p.x;
    g.y = p.y;
    g.a = p.a;
  }
}

function speedNow(st) {
  const front = st.segs[0];
  const tail = st.segs[st.segs.length - 1];
  if (!st.rushed && front && tail.s < 10 && front.s < st.path.len * C.DRAGON.rushUntil) return C.DRAGON.rush;
  st.rushed = true;
  if (st.freezeT > 0) return 0;
  const gone = 1 - st.segs.length / st.total;
  const steam = st.slowT > 0 && st.buddy ? st.buddy.slow : 1; // 蒸汽龟的蒸汽卡住齿轮
  const frost = st.frostT > 0 ? st.frostSlow : 1;
  return st.lv.v * (1 + st.lv.accel * st.t) * (1 + C.DRAGON.rage * gone * gone) * frost * steam;
}

// 幽影节：实一会儿、虚一会儿；被照妖灯照着就一直是实的
function phased(st, g) {
  if (g.type !== 'ghost' || g.litT > 0) return false;
  return (st.t + g.ph) % (TR.ghostSolid + TR.ghostPhase) > TR.ghostSolid;
}

const QUIET = { fire: 1, lamp: 1 }; // 持续伤害：不每帧出「打中」
function damage(st, g, dmg, x, y, crit, src) {
  if (g.hp <= 0) return;
  src = src || 'bow';
  if (phased(st, g) && src !== 'chain' && src !== 'lamp') {
    st.events.push({ t: 'phase', x, y });
    return;
  }
  let mul = 1;
  if (g.type === 'shield' && src === 'bow') mul = TR.shieldBow;
  if (g.type === 'clay') mul = TR.clay[src] || TR.clay.other;
  if (src === 'pot' || src === 'fire' || src === 'frost') g.noRegen = TR.coreStop;
  g.hp -= dmg * mul;
  if (!QUIET[src] || g.flash <= 0) g.flash = 0.08;
  if (!QUIET[src]) st.events.push({ t: 'hit', x, y, dmg: Math.round(dmg * mul), crit, src, weak: mul > 1, resist: mul < 1, type: g.type });
  if (g.hp <= 0) kill(st, g);
}

function kill(st, g) {
  const i = st.segs.indexOf(g);
  if (i < 0) return;
  st.segs.splice(i, 1);
  st.kills++;
  st.gold += C.GOLD.perKill;
  st.comboTimes.push(st.t);
  st.events.push({ t: 'kill', x: g.x, y: g.y, chest: g.chest, front: i === 0, ram: g.ram, max: g.max, combo: st.comboTimes.length, type: g.type });
  if (g.chest) {
    st.pendingCards++;
    st.events.push({ t: 'chest', x: g.x, y: g.y });
  }
  if (g.type === 'powder') {
    // 火药节：炸伤旁边一片（送分的，盯着它打）
    st.events.push({ t: 'powder', x: g.x, y: g.y, r: TR.powderR });
    const near = st.segs.filter((o) => o.s >= 0 && Math.hypot(o.x - g.x, o.y - g.y) < TR.powderR);
    for (const o of near) damage(st, o, g.max * TR.powderMul, o.x, o.y, false, 'blast');
  }
  if (g.type === 'split') {
    // 分裂节：变成两小节，插回原处
    const hp = Math.max(5, Math.round((g.max * TR.splitHp) / 5) * 5);
    const a = mkSeg(st.nextId++, g.s, hp, 'mini');
    const b = mkSeg(st.nextId++, g.s - C.DRAGON.gap, hp, 'mini');
    a.x = b.x = g.x;
    a.y = b.y = g.y;
    st.segs.splice(i, 0, a, b);
    st.total += 2;
    st.events.push({ t: 'split', x: g.x, y: g.y });
  }
}

const visibleSegs = (st) => st.segs.filter((g) => g.s >= 0 && g.y > 40 && g.y < C.FIELD.gateY);
// 龙最密的地方（霹雳罐、蒸汽龟用）：返回最多 k 个落点，互相隔开
function densest(st, R, k) {
  const vis = visibleSegs(st);
  const scored = vis.map((g) => {
    let n = 0;
    for (const o of vis) if (Math.hypot(o.x - g.x, o.y - g.y) < R) n++;
    return { g, n: n + g.s / 100000 };
  });
  scored.sort((a, b) => b.n - a.n);
  const out = [];
  for (const sc of scored) {
    if (out.every((o) => Math.hypot(o.x - sc.g.x, o.y - sc.g.y) > R * 1.4)) out.push(sc.g);
    if (out.length >= k) break;
  }
  return out;
}

// —— 七件武器 ——
function stepWeapons(st, dt) {
  const m = st.mods;
  const F = C.FIELD;
  const base = m.base;
  const lv = (id) => st.weapons[id] || 0;
  const ready = (id, cd) => {
    st.wcd[id] = (st.wcd[id] === undefined ? cd * 0.4 : st.wcd[id]) - dt;
    if (st.wcd[id] > 0) return false;
    st.wcd[id] += cd;
    return true;
  };
  const vis = visibleSegs(st);

  // 回旋刃：往上飞、飞回来，一路穿透，不怕盾
  const bl = lv('blade');
  if (bl && ready('blade', W.blade.cd * (bl >= 3 ? 0.72 : 1))) {
    const offs = bl >= 5 ? [-46, 0, 46] : [0];
    for (const o of offs) st.blades.push({ x: clamp(st.px + o, 16, F.w - 16), y: F.playerY - 30, vy: -470, back: false, hit: {}, r: bl >= 2 ? 17 : 12, dmg: base * W.blade.dmg * (bl >= 4 ? 1.5 : 1), rot: 0, flown: 0 });
    st.events.push({ t: 'bladeThrow' });
  }
  for (let i = st.blades.length - 1; i >= 0; i--) {
    const b = st.blades[i];
    b.rot += dt * 22;
    if (!b.back) {
      b.y += b.vy * dt;
      b.flown += -b.vy * dt;
      if (b.y < 30 || b.flown > 600) {
        b.back = true;
        b.hit = {};
      }
    } else {
      b.y += 520 * dt;
      b.x += clamp(st.px - b.x, -260 * dt, 260 * dt);
      if (b.y > F.playerY - 24) {
        st.blades.splice(i, 1);
        continue;
      }
    }
    for (const g of st.segs) {
      if (g.s < 0 || b.hit[g.id] || phased(st, g)) continue;
      if (Math.abs(g.x - b.x) < b.r + g.r && Math.abs(g.y - b.y) < b.r + g.r) {
        b.hit[g.id] = 1;
        damage(st, g, b.dmg, g.x, g.y, false, 'blade');
      }
    }
  }

  // 霹雳罐：抛到龙最密的地方，炸开 + 地上留火
  const pl = lv('pot');
  if (pl && ready('pot', W.pot.cd)) {
    const R = 46 + (pl >= 2 ? 14 : 0);
    const tg = densest(st, R, pl >= 5 ? 3 : 1);
    tg.forEach((g, k) => st.pots.push({ x0: st.px, y0: F.playerY - 30, tx: g.x, ty: g.y, target: g.id, t: -k * 0.12, T: 0.6, R, dmg: base * W.pot.dmg * (pl >= 4 ? 1.5 : 1), burn: 2 + (pl >= 3 ? 1.5 : 0) }));
    if (tg.length) st.events.push({ t: 'potThrow' });
  }
  for (let i = st.pots.length - 1; i >= 0; i--) {
    const p = st.pots[i];
    p.t += dt;
    const g = st.segs.find((o) => o.id === p.target);
    if (g) {
      p.tx = g.x;
      p.ty = g.y;
    }
    if (p.t >= p.T) {
      st.pots.splice(i, 1);
      st.events.push({ t: 'potBoom', x: p.tx, y: p.ty, r: p.R });
      st.fires.push({ x: p.tx, y: p.ty, r: p.R * 0.85, t: p.burn, max: p.burn, dps: base * W.pot.burn });
      const near = st.segs.filter((o) => o.s >= 0 && Math.hypot(o.x - p.tx, o.y - p.ty) < p.R);
      for (const o of near) damage(st, o, p.dmg, o.x, o.y, false, 'pot');
    }
  }
  for (let i = st.fires.length - 1; i >= 0; i--) {
    const f = st.fires[i];
    f.t -= dt;
    if (f.t <= 0) {
      st.fires.splice(i, 1);
      continue;
    }
    for (const g of st.segs.slice()) if (g.s >= 0 && Math.hypot(g.x - f.x, g.y - f.y) < f.r) damage(st, g, f.dps * dt, g.x, g.y, false, 'fire');
  }

  // 雷链：劈最前面一节，沿着龙身往后跳
  const cl = lv('chain');
  if (cl && vis.length && ready('chain', W.chain.cd * (cl >= 3 ? 0.75 : 1))) {
    const hops = cl >= 5 ? vis.length : 4 + (cl >= 2 ? 2 : 0) + (cl >= 4 ? 2 : 0);
    const hitList = vis.slice(0, hops);
    const pts = [{ x: st.px, y: F.playerY - 40 }].concat(hitList.map((g) => ({ x: g.x, y: g.y })));
    st.events.push({ t: 'chain', pts, evo: cl >= 5 });
    for (const g of hitList) damage(st, g, base * W.chain.dmg, g.x, g.y, false, 'chain');
  }

  // 寒气筒：冻住前几节，龙变慢；冻住的不回血
  const fl = lv('frost');
  if (st.frostT > 0) st.frostT -= dt;
  if (st.freezeT > 0) st.freezeT -= dt;
  if (fl && vis.length && ready('frost', W.frost.cd)) {
    const k = 4 + (fl >= 3 ? 3 : 0);
    const dur = 1.6 + (fl >= 2 ? 0.8 : 0);
    const list = fl >= 5 ? vis : vis.slice(0, k);
    st.frostT = dur;
    st.frostSlow = fl >= 4 ? 0.4 : 0.55;
    if (fl >= 5) st.freezeT = 1.5;
    st.events.push({ t: 'frost', pts: list.map((g) => ({ x: g.x, y: g.y })), evo: fl >= 5 });
    for (const g of list) {
      g.frozT = dur;
      damage(st, g, base * W.frost.dmg, g.x, g.y, false, 'frost');
    }
  }

  // 千斤锤：大锤砸最前面一节
  const hl = lv('hammer');
  if (hl && vis.length && ready('hammer', W.hammer.cd * (hl >= 3 ? 0.75 : 1))) {
    const dmg = base * W.hammer.dmg * (1 + (hl >= 2 ? 0.4 : 0) + (hl >= 4 ? 0.4 : 0));
    const tg = vis.slice(0, hl >= 5 ? 3 : 1);
    tg.forEach((g, k) => st.hammers.push({ target: g.id, x: g.x, y: g.y, t: -k * 0.14, T: 0.35, dmg, push: hl >= 5 && k === tg.length - 1 }));
  }
  for (let i = st.hammers.length - 1; i >= 0; i--) {
    const h = st.hammers[i];
    h.t += dt;
    const g = st.segs.find((o) => o.id === h.target);
    if (g) {
      h.x = g.x;
      h.y = g.y;
    }
    if (h.t >= h.T) {
      st.hammers.splice(i, 1);
      st.events.push({ t: 'hammer', x: h.x, y: h.y, push: h.push });
      if (g) damage(st, g, h.dmg, h.x, h.y, false, 'hammer');
      for (const o of st.segs.slice()) if (o !== g && o.s >= 0 && Math.hypot(o.x - h.x, o.y - h.y) < 36) damage(st, o, h.dmg * 0.35, o.x, o.y, false, 'hammer');
      if (h.push) {
        for (const o of st.segs) o.s -= C.DRAGON.gap * 0.4;
        placeSegs(st);
      }
    }
  }

  // 照妖灯：头顶一道光柱一直烧；照到的幽影变实
  const ll = lv('lamp');
  if (ll) {
    let w = 12 + (ll >= 2 ? 6 : 0) + (ll >= 4 ? 6 : 0);
    let x = st.px;
    if (ll >= 5) {
      w *= 1.8;
      x = clamp(st.px + Math.sin(st.t * 2.2) * 44, 10, F.w - 10);
    }
    st.beam = { x, w, lv: ll };
    const dps = base * W.lamp.dmg * (ll >= 3 ? 1.5 : 1);
    for (const g of st.segs.slice()) {
      if (g.s < 0 || g.y > F.playerY - 30 || Math.abs(g.x - x) > w / 2 + g.r) continue;
      g.litT = 0.2;
      damage(st, g, dps * dt, g.x, g.y, false, 'lamp');
    }
  } else st.beam = null;
}

function fire(st) {
  const m = st.mods;
  const n = m.n;
  const step = n > 1 ? Math.min(C.BOW.spreadDeg, 70 / (n - 1)) : 0;
  for (let i = 0; i < n; i++) {
    const deg = (i - (n - 1) / 2) * step;
    const a = (-90 + deg) * (Math.PI / 180);
    st.bullets.push({ id: st.nextBulletId++, x: st.px + Math.cos(a) * 10, y: C.FIELD.playerY - 26, vx: Math.cos(a) * C.BOW.speed, vy: Math.sin(a) * C.BOW.speed, pierce: m.pierce, last: -1 });
  }
  st.events.push({ t: 'shoot' });
}

function step(st, dtReal, targetX) {
  if (st.mode !== 'play') return;
  let dt = dtReal;
  if (st.lever.offer > 0) {
    st.lever.offer -= dtReal;
    dt *= C.AD.leverSlow;
    if (st.lever.offer <= 0) {
      st.lever.offer = 0;
      st.lever.used = true;
    }
  }
  st.t += dt;
  const F = C.FIELD;
  const m = st.mods;

  // 阿铸走过去（有上限，免得瞬移）
  if (typeof targetX === 'number') {
    const tx = clamp(targetX, 18, F.w - 18);
    const maxMove = 1500 * dtReal;
    st.px += clamp(tx - st.px, -maxMove, maxMove);
  }

  // 放箭
  st.fireCd -= dt;
  while (st.fireCd <= 0) {
    fire(st);
    st.fireCd += m.interval;
  }

  // 龙往前爬：只有最前面那节自己走，后面的追前一节；中间断了，后半截追上来
  const v = speedNow(st);
  const gap = C.DRAGON.gap;
  for (let i = 0; i < st.segs.length; i++) {
    const g = st.segs[i];
    if (i === 0) g.s += v * dt;
    else {
      const target = st.segs[i - 1].s - gap;
      if (g.s >= target) g.s = target;
      else g.s = Math.min(target, g.s + (v + C.DRAGON.catchUp) * dt);
    }
    if (g.flash > 0) g.flash -= dtReal;
    if (g.litT > 0) g.litT -= dt;
    if (g.frozT > 0) g.frozT -= dt;
    // 墨核节：没被烧、没被冻就回血
    if (g.type === 'core') {
      if (g.noRegen > 0) g.noRegen -= dt;
      else if (g.hp < g.max) {
        g.hp = Math.min(g.max, g.hp + g.max * TR.coreRegen * dt);
        g.regenFx -= dt;
        if (g.regenFx <= 0 && g.y > 0) {
          g.regenFx = 0.7;
          st.events.push({ t: 'regen', x: g.x, y: g.y });
        }
      }
    }
    // 第一次看见某个兵种：告诉画面（弹一张「怕什么」的小牌）
    if (g.type !== 'basic' && g.type !== 'mini' && !st.seenTypes[g.type] && g.s > 0 && g.y > 60) {
      st.seenTypes[g.type] = 1;
      st.events.push({ t: 'newType', type: g.type });
    }
  }
  placeSegs(st);

  // 箭
  for (let b = st.bullets.length - 1; b >= 0; b--) {
    const u = st.bullets[b];
    u.x += u.vx * dt;
    u.y += u.vy * dt;
    let dead = u.x < 4 || u.x > F.w - 4 || u.y < 0 || u.y > F.h;
    if (!dead) {
      for (let k = 0; k < st.segs.length; k++) {
        const g = st.segs[k];
        if (g.s < 0 || g.id === u.last || phased(st, g)) continue;
        const R = g.r + C.BOW.r;
        const dx = g.x - u.x;
        const dy = g.y - u.y;
        if (dx * dx + dy * dy < R * R) {
          damage(st, g, m.dmg, u.x, u.y, false, 'bow');
          if (u.pierce > 0) {
            u.pierce--;
            u.last = g.id;
          } else dead = true;
          break;
        }
      }
    }
    if (dead) st.bullets.splice(b, 1);
  }

  stepWeapons(st, dt);
  if (st.pal) stepBuddy(st, dt);
  if (st.slowT > 0) st.slowT -= dt;

  // 连碎
  while (st.comboTimes.length && st.comboTimes[0] < st.t - 1) st.comboTimes.shift();
  const c = st.comboTimes.length;
  if (c >= 5 && c >= st.comboShown + 5) {
    st.comboShown = c;
    st.events.push({ t: 'combo', n: c });
  }
  if (c < 3) st.comboShown = 0;

  // 赢
  if (st.segs.length === 0) {
    st.mode = 'win';
    st.endT = st.t;
    st.gold += C.GOLD.winBase + C.GOLD.winPerLevel * st.level;
    st.events.push({ t: 'win' });
    return;
  }

  const front = st.segs[0];
  const left = st.path.len - front.s;
  st.danger = left < gap * 4 ? 1 - left / (gap * 4) : 0;

  // 拉总闸：龙头离终点只剩一节时亮一次
  if (!st.lever.used && st.lever.offer === 0 && st.adsUsed < C.AD.maxPerRun && left < gap * 1.3) {
    st.lever.offer = C.AD.leverWindow;
    st.events.push({ t: 'lever' });
  }

  // 输
  if (front.s >= st.path.len) {
    st.mode = 'lose';
    st.endT = st.t;
    st.lever.offer = 0;
    st.nearMiss = C.isNearMiss(st.segs.length, st.total);
    st.events.push({ t: 'lose', left: st.segs.length });
    return;
  }

  // 开机关匣：停下来三选一
  if (st.pendingCards > 0) openCards(st);
}

// —— 机关伙伴：三只三种打法 ——
const segById = (st, id) => st.segs.find((g) => g.id === id);
const visible = (st) => st.segs.filter((g) => g.s >= 0 && g.y > 50);
function moveTo(p, x, y, v, dt) {
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= v * dt || d < 1) {
    p.x = x;
    p.y = y;
    return true;
  }
  p.x += (dx / d) * v * dt;
  p.y += (dy / d) * v * dt;
  p.fx = dx / d;
  return false;
}
function stepBuddy(st, dt) {
  const b = st.buddy;
  const p = st.pal;
  const homeX = clamp(st.px + (b.id === 'gui' ? -48 : 36), 16, C.FIELD.w - 16);
  const homeY = C.FIELD.playerY + (b.id === 'que' ? -26 : b.id === 'gui' ? 14 : 16);
  const m = st.mods;
  if (b.id === 'que') {
    if (p.state === 'home') {
      moveTo(p, homeX, homeY, 900, dt);
      p.cd -= dt;
      if (p.cd <= 0) {
        const vis = visible(st);
        const chests = vis.filter((g) => g.chest);
        // 先挑最靠前的机关匣；没有就挑最硬的那节
        const g = chests.length ? chests[0] : vis.reduce((a, o) => (!a || o.hp > a.hp ? o : a), null);
        if (g) {
          p.state = 'fly';
          p.target = g.id;
          st.events.push({ t: 'palGo', x: p.x, y: p.y });
        } else p.cd = 0.3;
      }
    } else if (p.state === 'fly') {
      const g = segById(st, p.target);
      if (!g) p.state = 'back';
      else if (moveTo(p, g.x, g.y - 12, b.fly, dt)) {
        p.state = 'peck';
        p.n = b.pecks;
        p.t = 0;
      }
    } else if (p.state === 'peck') {
      const g = segById(st, p.target);
      if (!g) p.state = 'back';
      else {
        p.x = g.x;
        p.y = g.y - 12;
        p.t -= dt;
        if (p.t <= 0) {
          p.t = 0.08;
          p.n--;
          st.events.push({ t: 'peck', x: g.x, y: g.y, chest: g.chest });
          damage(st, g, m.base * b.peckDmg * (g.chest ? b.chestMul : 1), g.x, g.y - 6, false, "pal");
          if (p.n <= 0) p.state = 'back';
        }
      }
    } else if (p.state === 'back') {
      if (moveTo(p, homeX, homeY, b.fly, dt)) {
        p.state = 'home';
        p.cd = b.cd;
      }
    }
  } else if (b.id === 'quan') {
    if (p.state === 'home') {
      p.x = homeX;
      p.y = homeY;
      p.cd -= dt;
      const g = st.segs[0];
      if (p.cd <= 0 && g && g.s >= 0 && g.y > 60) {
        p.state = 'leap';
        p.t = 0;
        p.sx = p.x;
        p.sy = p.y;
        st.events.push({ t: 'palGo', x: p.x, y: p.y });
      }
    } else if (p.state === 'leap' || p.state === 'back') {
      const T = 0.32;
      p.t += dt;
      const u = Math.min(1, p.t / T);
      const g = st.segs[0];
      // 往前扑：落点跟着龙头；跳回来：落回阿铸身边
      const tx = p.state === 'leap' ? (g ? g.x : p.sx) : homeX;
      const ty = p.state === 'leap' ? (g ? g.y : p.sy) : homeY;
      p.x = p.sx + (tx - p.sx) * u;
      p.y = p.sy + (ty - p.sy) * u - Math.sin(u * Math.PI) * 70;
      p.fx = tx < p.sx ? -1 : 1;
      if (u >= 1) {
        if (p.state === 'leap') {
          if (g) {
            const push = b.push * C.DRAGON.gap;
            st.events.push({ t: 'bite', x: g.x, y: g.y });
            damage(st, g, m.base * b.biteDmg, g.x, g.y, false, "pal");
            for (const o of st.segs) o.s -= push;
            placeSegs(st);
          }
          p.state = 'back';
          p.t = 0;
          p.sx = p.x;
          p.sy = p.y;
        } else {
          p.state = 'home';
          p.cd = b.cd;
        }
      }
    }
  } else if (b.id === 'gui') {
    p.x = homeX;
    p.y = homeY;
    p.cd -= dt;
    if (p.recoil > 0) p.recoil -= dt;
    if (p.cd <= 0) {
      // 往龙最密的地方打；一样密就打离城门近的
      const vis = visible(st);
      let best = null;
      let bestN = 0;
      for (const g of vis) {
        let n = 0;
        for (const o of vis) if (Math.hypot(o.x - g.x, o.y - g.y) < b.shellR) n++;
        if (n > bestN || (n === bestN && best && g.s > best.s)) {
          best = g;
          bestN = n;
        }
      }
      if (best) {
        st.shells.push({ x0: p.x, y0: p.y - 14, tx: best.x, ty: best.y, target: best.id, t: 0, T: b.flight });
        st.events.push({ t: 'mortar', x: p.x, y: p.y - 14 });
        p.cd = b.cd;
        p.recoil = 0.25;
      } else p.cd = 0.3;
    }
  }
  // 炮弹：飞的时候跟着目标那节（打不空）
  for (let i = st.shells.length - 1; i >= 0; i--) {
    const sh = st.shells[i];
    sh.t += dt;
    const g = segById(st, sh.target);
    if (g) {
      sh.tx = g.x;
      sh.ty = g.y;
    }
    if (sh.t >= sh.T) {
      st.shells.splice(i, 1);
      st.events.push({ t: 'shell', x: sh.tx, y: sh.ty, r: b.shellR });
      st.slowT = b.slowSec;
      const near = st.segs.filter((o) => o.s >= 0 && Math.hypot(o.x - sh.tx, o.y - sh.ty) < b.shellR);
      for (const o of near) damage(st, o, m.base * b.shellDmg, o.x, o.y, false, "blast");
    }
  }
}

// 三选一：没带的武器（新拿）或带着的升一级。克这一关兵种的武器、伙伴偏爱的出得更勤
function cardPool(st) {
  const held = Object.keys(st.weapons);
  return C.WEAPONS.filter((w) => (st.weapons[w.id] ? st.weapons[w.id] < 5 : held.length < C.MAX_WEAPONS));
}
function counters(st, id) {
  return Object.keys(st.lv.types).filter((t) => C.TYPES[t].fear.indexOf(id) >= 0);
}
function openCards(st) {
  const pool = cardPool(st);
  if (!pool.length) {
    st.pendingCards = 0;
    return;
  }
  const prefer = st.buddy && st.buddy.prefer;
  const weight = (w) => (w.id === prefer ? 3 : 1) * (counters(st, w.id).length ? 2.5 : 1) * (st.weapons[w.id] ? 1.3 : 1);
  const picks = [];
  if (st.firstCards) {
    // 第一次开匣：保证有一张克这一关兵种的（没有就给伙伴偏爱的）
    const c = pool.filter((w) => counters(st, w.id).length && w.id !== 'bow');
    const first = c.length ? c[Math.floor(st.rand() * c.length)] : pool.find((w) => w.id === prefer);
    if (first) picks.push(first.id);
  }
  st.firstCards = false;
  while (picks.length < Math.min(3, pool.length)) {
    const left = pool.filter((w) => picks.indexOf(w.id) < 0);
    const ws = left.map(weight);
    let r = st.rand() * ws.reduce((a, b) => a + b, 0);
    let k = 0;
    while (r > ws[k]) r -= ws[k++];
    picks.push(left[k].id);
  }
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(st.rand() * (i + 1));
    const tmp = picks[i];
    picks[i] = picks[j];
    picks[j] = tmp;
  }
  st.cards = picks;
  st.mode = 'cards';
  st.cardT = 0;
}

function pick(st, i) {
  if (st.mode !== 'cards' || !st.cards || !st.cards[i]) return null;
  const id = st.cards[i];
  st.weapons[id] = (st.weapons[id] || 0) + 1;
  st.mods = mods(st);
  st.pendingCards--;
  st.cards = null;
  st.mode = 'play';
  st.events.push({ t: 'pick', id, lv: st.weapons[id] });
  if (st.pendingCards > 0) openCards(st);
  return id;
}

// 拉总闸（看广告换）：龙往回退 10 节
function pullLever(st) {
  if (st.lever.offer <= 0 || st.mode !== 'play') return false;
  st.lever.offer = 0;
  st.lever.used = true;
  st.adsUsed++;
  const back = C.AD.leverPush * C.DRAGON.gap;
  for (const g of st.segs) g.s -= back;
  placeSegs(st);
  st.events.push({ t: 'leverPull' });
  return true;
}

module.exports = { newRun, step, pick, pullLever, mods, phased, counters, W };
