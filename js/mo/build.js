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
  Object.keys(bc).forEach((e) => add(D.BONDS[e][Math.min(6, bc[e])]));
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
  if (has(r, 'yifu')) k *= 3;
  return Math.max(0.1, k);
}
function cdMul(r) {
  const st = stats(r);
  return 1 / (1 + (st.aspd + (has(r, 'yifu') ? 100 : 0)) / 100);
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
  if (special || r.R() < (r.mode === 'attack' ? 0.4 : 0.45)) {
    const el = r.lv.challenge === 'onlyFire' && r.R() < 0.6 ? 'huo' : D.ELS[Math.floor(r.R() * 5)];
    r.mats[el]++;
    return el;
  }
  return null;
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
  const keys = Object.keys(D.STATS);
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
  const tier = has(r, 'luban') && r.R() < 0.1 ? 2 : 1;
  const mc = { id: p.m.id, tier };
  r.bench.push(mc);
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
  else if (cur.id === m.id && cur.tier === m.tier && cur.tier < 4) {
    cur.tier++;
    res = 'merge';
  } else {
    r.slots[si] = m;
    r.bench.push(cur);
    res = 'swap';
  }
  r.dirty = true;
  return { res, slot: r.slots[si] };
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
  } else if (o.kind === 'machine') r.bench.push({ id: o.id, tier: 1 });
  else r.mats[o.id] += o.n;
  r.log.bought++;
  r.dirty = true;
  if (r.shop.every((s) => s.sold)) {
    r.refreshN = Math.max(0, r.refreshN - 1);
    rollShop(r);
  }
  return true;
}

module.exports = { newRun, stats, dmgMul, cdMul, rollCrit, hurtSelf, heal, gainKill, waveEnd, xpNeed, statCards, pickCard, preview, combine, place, sell, rollShop, refresh, refreshCost, buy, has, bondCount };
