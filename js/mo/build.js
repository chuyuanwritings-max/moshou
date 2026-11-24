// 《墨守》0.6 · 局内构筑（两种模式共用）：属性、材料、合机关、合阶、小店、升级卡。
// 一关 = 一局：机关、道具、属性只在这一关有效；局外的东西在 meta 里。
const D = require('./data.js');
const { rng } = require('../util.js');

function newRun(meta, lv, builderId, seed) {
  const R = rng(seed || 1);
  const b = D.BUILDERS.find((x) => x.id === builderId) || D.BUILDERS[0];
  const slots = lv.mode === 'defend' ? meta.slots : lv.car === 'dragon' ? meta.dragonLen : meta.cartSlots;
  const r = {
    R, lv, builder: b, mode: lv.mode,
    coins: 0, mats: { jin: 0, mu: 0, shui: 0, huo: 0, tu: 0 },
    xp: 0, lvl: 0, cardsLeft: 0, picks: {},
    slots: new Array(slots).fill(null), bench: [], items: [],
    shop: [], locked: [false, false, false, false], refreshN: 0,
    wave: 0, recipes: meta.recipes.slice(), bench2: meta.bench, // 机关台格数
    hpMax: 0, hp: 0, dunUsed: false, stats: null, dirty: true,
    log: { kills: 0, made: 0, bought: 0 },
  };
  // 开局送一件连弩：进攻装在车头，守城摆在第 1 座箭楼
  r.slots[0] = { id: 'nu', tier: 1 };
  // 开局先给两份金，第一件机关马上就能合
  if (lv.mode === 'defend') r.mats.jin += 2;
  if (b.gift) r.bench.push({ id: b.gift, tier: 1 });
  if (meta.shenji && meta.shenji.modou) {
    const pool = D.MACHINES.filter((m) => r.recipes.indexOf(m.id) >= 0);
    r.bench.push({ id: pool[Math.floor(R() * pool.length)].id, tier: 1 });
  }
  const st = stats(r);
  r.hpMax = Math.max(10, (lv.mode === 'defend' ? meta.wallHp : lv.car === 'dragon' ? 120 : 60) + st.hp);
  r.hp = r.hpMax;
  r.bondHp = r.curBondHp || 0;
  rollShop(r);
  return r;
}

// —— 属性：底子 + 机关师 + 道具 + 升级卡 + 羁绊 ——
function bondCount(r) {
  const c = { jin: 0, mu: 0, shui: 0, huo: 0, tu: 0 };
  for (const s of r.slots) {
    if (!s) continue;
    const els = new Set(D.M[s.id].els);
    els.forEach((e) => c[e]++);
  }
  return c;
}
function stats(r) {
  if (!r.dirty && r.stats) return r.stats;
  const st = {};
  Object.keys(D.STATS).forEach((k) => (st[k] = D.STAT_BASE[k] || 0));
  const add = (o) => o && Object.keys(o).forEach((k) => (st[k] += o[k]));
  add(r.builder.st);
  r.items.forEach((id) => add(D.IT[id].st));
  Object.keys(r.picks).forEach((k) => (st[k] += r.picks[k]));
  const bc = bondCount(r);
  const hp0 = st.hp;
  Object.keys(bc).forEach((e) => add(D.BONDS[e][Math.min(6, bc[e])]));
  // 羁绊给的生命：随场上机关变化，同步到城墙 / 车的上限
  const bondHp = st.hp - hp0;
  r.curBondHp = bondHp;
  if (r.hpMax && bondHp !== (r.bondHp || 0)) {
    const diff = bondHp - (r.bondHp || 0);
    r.hpMax = Math.max(10, r.hpMax + diff);
    r.hp = Math.min(r.hpMax, Math.max(1, r.hp + Math.max(0, diff)));
    r.bondHp = bondHp;
  }
  Object.keys(D.STAT_CAP).forEach((k) => (st[k] = Math.min(st[k], D.STAT_CAP[k])));
  r.stats = st;
  r.bonds = bc;
  r.dirty = false;
  return st;
}
const has = (r, rule) => r.items.some((id) => D.IT[id].rule === rule);

// 一件机关这一刻的伤害倍数
function dmgMul(r, m) {
  const st = stats(r);
  let k = 1 + st.dmg / 100;
  const ed = r.builder.elDmg || {};
  new Set(m.els).forEach((e) => (k += (ed[e] || 0) / 100));
  const lost = 1 - r.hp / r.hpMax;
  if (has(r, 'poqi')) k += Math.floor(lost * 10) * 0.03;
  if (has(r, 'nilin')) k += lost;
  if (has(r, 'yifu') && r.slots.filter((s) => s).length === 1) k *= 3; // 一夫当关：场上只有一件才算
  return Math.max(0.1, k);
}
function cdMul(r) {
  const st = stats(r);
  return 1 / (1 + (st.aspd + (has(r, 'yifu') && r.slots.filter((s) => s).length === 1 ? 100 : 0)) / 100);
}
// 暴击：返回 [伤害, 是否暴击]
function rollCrit(r, dmg, bonus) {
  const st = stats(r);
  if (r.R() * 100 < st.crit + (bonus || 0)) return [dmg * st.critDmg / 100, true];
  return [dmg, false];
}
function hurtSelf(r, n) {
  if (n <= 0) return 0;
  if (has(r, 'dun') && !r.dunUsed) {
    r.dunUsed = true;
    return 0;
  }
  const st = stats(r);
  const real = n * 15 / (15 + Math.max(0, st.armor));
  r.hp = Math.max(0, r.hp - real);
  r.dirty = true;
  return real;
}
function heal(r, n) {
  r.hp = Math.min(r.hpMax, r.hp + n);
}

// —— 掉落 ——
function gainKill(r, special) {
  r.log.kills++;
  r.coins += 1 + Math.floor(r.R() * 3);
  r.xp++;
  if (special || r.R() < (r.mode === 'attack' ? 0.4 : 0.3)) {
    const el = nextDrop(r);
    r.nextEl = rollEl(r);
    r.mats[el]++;
    return el;
  }
  return null;
}
// 下一份材料（照 Isle of Arrows 预告下一块）：先定好，机关台上显示「下一份：火」
function rollEl(r) {
  return r.lv.challenge === 'onlyFire' && r.R() < 0.6 ? 'huo' : D.ELS[Math.floor(r.R() * 5)];
}
// 保底：现在一件都合不了、手上又有落单的材料时，下一份必定凑成一对
function nextDrop(r) {
  if (!r.nextEl) r.nextEl = rollEl(r);
  if (makeable(r).length) return r.nextEl;
  const singles = D.ELS.filter((e) => r.mats[e] === 1 && makeable(Object.assign({}, r, { mats: Object.assign({}, r.mats, { [e]: 2 }) })).length);
  if (!singles.length || singles.indexOf(r.nextEl) >= 0) return r.nextEl;
  return singles[0];
}
const xpNeed = (lvl) => (lvl + 3) * (lvl + 3);
// 波末：升级、收获、利息
function waveEnd(r) {
  const st = stats(r);
  const out = { coins: 0, lvls: 0 };
  while (r.xp >= xpNeed(r.lvl)) {
    r.xp -= xpNeed(r.lvl);
    r.lvl++;
    r.cardsLeft++;
    out.lvls++;
  }
  let c = Math.floor(st.harvest);
  if (has(r, 'coinWave')) c += 5;
  if (has(r, 'interest')) c += Math.min(15, Math.floor(r.coins * 0.1));
  r.coins += c;
  out.coins = c;
  heal(r, st.regen);
  r.dunUsed = false;
  r.wave++;
  r.refreshN = 0;
  if (r.cardsLeft) r.cards = statCards(r);
  rollShop(r);
  return out;
}

// —— 升级属性卡：4 选 1 ——
function statCards(r) {
  // 进攻里缠绕、燃烧、击退没用，不发
  const keys = Object.keys(D.STATS).filter((k) => !(r.lv.mode === 'attack' && (k === 'slow' || k === 'burn' || k === 'knock')));
  const out = [];
  while (out.length < 4) {
    const k = keys[Math.floor(r.R() * keys.length)];
    if (out.some((c) => c.k === k)) continue;
    let tier = 0;
    const roll = r.R() + r.lvl * 0.03;
    if (roll > 0.95) tier = 3;
    else if (roll > 0.8) tier = 2;
    else if (roll > 0.5) tier = 1;
    out.push({ k, tier, v: D.STAT_CARD[k][tier] });
  }
  return out;
}
function pickCard(r, i) {
  if (!r.cards || !r.cards[i]) return;
  const c = r.cards[i];
  r.picks[c.k] = (r.picks[c.k] || 0) + c.v;
  if (c.k === 'hp') {
    r.hpMax += c.v;
    r.hp += c.v;
  }
  r.cardsLeft--;
  r.cards = r.cardsLeft > 0 ? statCards(r) : null;
  r.dirty = true;
}

// —— 机关台：材料 → 机关 ——
function preview(r, list) {
  if (list.length < 2) return { state: 'short' };
  const m = D.recipeOf(list);
  if (!m) return { state: 'none' };
  if (r.recipes.indexOf(m.id) < 0) return { state: 'locked', m };
  return { state: 'ok', m };
}
function combine(r, list) {
  const p = preview(r, list);
  if (p.state !== 'ok') return null;
  const need = {};
  list.forEach((e) => (need[e] = (need[e] || 0) + 1));
  for (const e in need) if (r.mats[e] < need[e]) return null;
  for (const e in need) r.mats[e] -= need[e];
  // 大成功：10% 直接高一阶；没出每次 +3%，连 6 次没出第 7 次必出（鲁班尺再 +10%）
  r.makeMiss = r.makeMiss || 0;
  const luck = !r.noLuck && (r.makeMiss >= 6 || r.R() < 0.1 + 0.03 * r.makeMiss + (has(r, 'luban') ? 0.1 : 0));
  r.makeMiss = luck ? 0 : r.makeMiss + 1;
  r.lastLucky = luck;
  const tier = luck ? 2 : 1;
  let mc = { id: p.m.id, tier };
  // 手上已经有同名的：自动叠起来（阶数相加，最高 4 阶）
  const same = r.bench.find((x) => x.id === mc.id && x.tier + mc.tier <= 4);
  if (same) {
    same.tier += mc.tier;
    mc = same;
    mc.stacked = true;
  } else r.bench.push(mc);
  r.log.made++;
  return mc;
}
// 从机关台拿一件放到点位上：空位就放；同名同阶就合一阶；不同就换回来
function place(r, bi, si) {
  const m = r.bench[bi];
  if (!m || si < 0 || si >= r.slots.length) return null;
  if (has(r, 'yifu')) {
    const filled = r.slots.findIndex((s) => s);
    if (filled >= 0 && filled !== si) return { blocked: true };
  }
  const cur = r.slots[si];
  r.bench.splice(bi, 1);
  let res = 'place';
  if (!cur) r.slots[si] = m;
  else if (cur.id === m.id && cur.tier + m.tier <= 4) {
    cur.tier += m.tier;
    res = 'merge';
  } else if (cur.id === m.id) {
    r.bench.splice(bi, 0, m); // 同名但叠不下：不动
    return { full: true };
  } else {
    r.slots[si] = m;
    r.bench.push(cur);
    res = 'swap';
  }
  r.dirty = true;
  return { res, slot: r.slots[si] };
}
// 场上的机关直接拖：拖到一样的上面合一阶，拖到空位挪过去，拖到别的上面换位置
function moveSlot(r, from, to) {
  if (from === to || !r.slots[from] || to < 0 || to >= r.slots.length) return null;
  const a = r.slots[from];
  const b = r.slots[to];
  let res;
  if (!b) {
    r.slots[to] = a;
    r.slots[from] = null;
    res = 'move';
  } else if (b.id === a.id && b.tier + a.tier <= 4) {
    b.tier += a.tier;
    r.slots[from] = null;
    res = 'merge';
  } else if (b.id === a.id) {
    return { full: true }; // 同名但叠不下：不对调
  } else {
    r.slots[to] = a;
    r.slots[from] = b;
    res = 'swap';
  }
  r.dirty = true;
  return { res, slot: r.slots[to] };
}
// 能合的：场上已有同名（合了能叠）的排最前，其次不同元素的，最后两个一样的
function makeable(r) {
  const key = (m) => (r.slots.some((x) => x && x.id === m.id && x.tier < 4) ? 0 : m.els[0] !== m.els[1] ? 1 : 2);
  return D.MACHINES.filter((m) => {
    if (r.recipes.indexOf(m.id) < 0) return false;
    if (r.lv.challenge === 'onlyFire' && m.els.indexOf('huo') < 0) return false;
    return m.els.every((e) => r.mats[e] >= m.els.filter((x) => x === e).length);
  })
    .map((m, i) => ({ m, i, k: key(m) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((o) => o.m);
}
function sell(r, bi) {
  const m = r.bench[bi];
  if (!m) return;
  r.bench.splice(bi, 1);
  // 拆回一半材料（至少 1 个）
  const els = D.M[m.id].els;
  for (let i = 0; i < Math.max(1, Math.floor(els.length * m.tier / 2)); i++) r.mats[els[i % els.length]]++;
}

// —— 小店 ——
function offer(r) {
  const w = r.wave;
  const x = r.R();
  if (x < 0.55) {
    const maxTier = w >= 2 ? 4 : w >= 1 ? 3 : 2;
    const pool = D.ITEMS.filter((it) => it.tier <= maxTier && (it.tier < 3 || r.R() < 0.35));
    const it = pool[Math.floor(r.R() * pool.length)];
    return { kind: 'item', id: it.id, price: it.price };
  }
  if (x < 0.8) {
    const pool = D.MACHINES.filter((m) => r.recipes.indexOf(m.id) >= 0 && (r.lv.challenge !== 'onlyFire' || m.els.indexOf('huo') >= 0));
    const m = pool[Math.floor(r.R() * pool.length)];
    return { kind: 'machine', id: m.id, price: 22 + m.dmg / 2 | 0 };
  }
  const el = r.lv.challenge === 'onlyFire' ? 'huo' : D.ELS[Math.floor(r.R() * 5)];
  return { kind: 'mat', id: el, n: 2, price: 12 };
}
function rollShop(r) {
  for (let i = 0; i < 4; i++) if (!r.locked[i] || !r.shop[i]) r.shop[i] = offer(r);
}
const refreshCost = (r) => 2 + r.wave + r.refreshN;
function refresh(r) {
  const c = refreshCost(r);
  if (r.coins < c) return false;
  r.coins -= c;
  r.refreshN++;
  rollShop(r);
  return true;
}
function buy(r, i) {
  const o = r.shop[i];
  if (!o || o.sold || r.coins < o.price) return false;
  r.coins -= o.price;
  o.sold = true;
  r.locked[i] = false;
  if (o.kind === 'item') {
    r.items.push(o.id);
    const it = D.IT[o.id];
    if (it.st && it.st.hp) {
      r.hpMax = Math.max(10, r.hpMax + it.st.hp);
      r.hp = Math.min(r.hpMax, Math.max(1, r.hp + it.st.hp));
    }
    if (it.rule === 'halfHp') {
      r.hpMax = Math.max(10, Math.floor(r.hpMax / 2));
      r.hp = Math.min(r.hp, r.hpMax);
    }
  } else if (o.kind === 'machine') {
    // 买来的也自动叠到手上同名的
    const same = r.bench.find((x) => x.id === o.id && x.tier + 1 <= 4);
    if (same) same.tier += 1;
    else r.bench.push({ id: o.id, tier: 1 });
  }
  else r.mats[o.id] += o.n;
  r.log.bought++;
  r.dirty = true;
  if (r.shop.every((s) => s.sold)) {
    r.refreshN = Math.max(0, r.refreshN - 1);
    rollShop(r);
  }
  return true;
}

module.exports = { nextDrop, makeable, moveSlot, newRun, stats, dmgMul, cdMul, rollCrit, hurtSelf, heal, gainKill, waveEnd, xpNeed, statCards, pickCard, preview, combine, place, sell, rollShop, refresh, refreshCost, buy, has, bondCount };
