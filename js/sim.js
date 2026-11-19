// 一局的全部规则（不画图、不出声）：龙怎么爬、箭怎么飞、打碎、三选一、拉总闸、输赢。
// 画面和声音从 st.events 里取（main.js 每帧清空）。测试机器人在 node 里直接跑这个文件。
const C = require('./config.js');
const { rng, clamp } = require('./util.js');
const { build } = require('./path.js');

const SK = {};
C.SKILLS.forEach((s) => (SK[s.id] = s));

function newRun(levelIndex, meta, seed) {
  const lv = C.level(levelIndex);
  const rand = rng(seed || 1);
  const path = build(lv.rows, levelIndex % 2 === 1);
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
    let hp = lv.hp * (1 + lv.growth * Math.pow(i / Math.max(1, lv.n - 1), C.DRAGON.curve)) * (0.85 + 0.3 * rand());
    if (i === lv.n - 1) hp *= C.DRAGON.tailMul;
    if (chest) hp *= 1.5;
    hp = Math.max(5, Math.round(hp / 5) * 5);
    segs.push({ id: i, s: -i * C.DRAGON.gap - 20, hp, max: hp, chest, ram: i === lv.n - 1, flash: 0, x: 0, y: -99 });
  }
  const st = {
    level: levelIndex,
    lv,
    path,
    rand,
    buddy,
    bowLv: (meta && meta.bowLv) || 0,
    t: 0,
    segs,
    total: lv.n,
    bullets: [],
    px: C.FIELD.w / 2,
    fireCd: 0.3,
    skills: {},
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
  };
  C.SKILLS.forEach((s) => (st.skills[s.id] = 0));
  if (buddy && buddy.id === 'gui') st.skills.blast = 1;
  st.mods = mods(st);
  placeSegs(st);
  return st;
}

function mods(st) {
  const k = st.skills;
  const que = st.buddy && st.buddy.id === 'que';
  return {
    dmg: C.BOW.dmg * (1 + C.UPGRADE.pct * st.bowLv) * Math.pow(1.3, k.power),
    interval: C.BOW.interval * Math.pow(0.8, k.rate),
    n: 1 + k.multi * (que ? 2 : 1),
    pierce: k.pierce,
    bounce: k.bounce,
    crit: 0.15 * k.crit,
    frost: Math.pow(0.85, k.frost),
    blast: k.blast,
    blastR: (34 + 12 * k.blast) * (st.buddy && st.buddy.id === 'gui' ? 1.5 : 1),
    bounceMul: st.buddy && st.buddy.id === 'quan' ? 2 : 1,
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
  const gone = 1 - st.segs.length / st.total;
  return st.lv.v * (1 + st.lv.accel * st.t) * (1 + C.DRAGON.rage * gone * gone) * st.mods.frost;
}

function fire(st) {
  const m = st.mods;
  const n = m.n;
  const step = n > 1 ? Math.min(C.BOW.spreadDeg, 70 / (n - 1)) : 0;
  for (let i = 0; i < n; i++) {
    const deg = (i - (n - 1) / 2) * step;
    const a = (-90 + deg) * (Math.PI / 180);
    st.bullets.push({
      id: st.nextBulletId++,
      x: st.px + Math.cos(a) * 10,
      y: C.FIELD.playerY - 26,
      vx: Math.cos(a) * C.BOW.speed,
      vy: Math.sin(a) * C.BOW.speed,
      pierce: m.pierce,
      bounce: m.bounce,
      bounced: false,
      last: -1,
    });
  }
  st.events.push({ t: 'shoot' });
}

function damage(st, g, dmg, x, y, crit) {
  if (g.hp <= 0) return;
  g.hp -= dmg;
  g.flash = 0.08;
  st.events.push({ t: 'hit', x, y, dmg: Math.round(dmg), crit });
  if (g.hp <= 0) kill(st, g);
}

function kill(st, g) {
  const i = st.segs.indexOf(g);
  if (i < 0) return;
  st.segs.splice(i, 1);
  st.kills++;
  st.gold += C.GOLD.perKill;
  st.comboTimes.push(st.t);
  st.events.push({ t: 'kill', x: g.x, y: g.y, chest: g.chest, front: i === 0 });
  if (g.chest) {
    st.pendingCards++;
    st.events.push({ t: 'chest', x: g.x, y: g.y });
  }
  if (st.mods.blast > 0) {
    const R = st.mods.blastR;
    const dmg = g.max * (0.25 + 0.15 * st.mods.blast);
    st.events.push({ t: 'blast', x: g.x, y: g.y, r: R });
    const near = st.segs.filter((o) => o.s >= 0 && Math.hypot(o.x - g.x, o.y - g.y) < R);
    for (const o of near) damage(st, o, dmg, o.x, o.y, false);
  }
}

function step(st, dtReal, targetX) {
  st.events.length = st.events.length; // 由 main 清空
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
  }
  placeSegs(st);

  // 箭
  const R = C.DRAGON.r + C.BOW.r;
  for (let b = st.bullets.length - 1; b >= 0; b--) {
    const u = st.bullets[b];
    u.x += u.vx * dt;
    u.y += u.vy * dt;
    let dead = false;
    if (u.x < 4 || u.x > F.w - 4) {
      if (u.bounce > 0) {
        u.bounce--;
        u.bounced = true;
        u.vx = -u.vx;
        u.x = clamp(u.x, 4, F.w - 4);
        u.last = -1;
      } else dead = true;
    }
    if (u.y < 0) {
      if (u.bounce > 0) {
        u.bounce--;
        u.bounced = true;
        u.vy = -u.vy;
        u.y = 0;
        u.last = -1;
      } else dead = true;
    }
    if (u.y > F.h) dead = true;
    if (!dead) {
      for (let k = 0; k < st.segs.length; k++) {
        const g = st.segs[k];
        if (g.s < 0 || g.id === u.last) continue;
        const dx = g.x - u.x;
        const dy = g.y - u.y;
        if (dx * dx + dy * dy < R * R) {
          const crit = st.rand() < m.crit;
          const dmg = m.dmg * (crit ? 3 : 1) * (u.bounced ? m.bounceMul : 1);
          damage(st, g, dmg, u.x, u.y, crit);
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

  // 拉总闸：龙头离城门只剩一节时亮一次
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

function openCards(st) {
  const pool = C.SKILLS.filter((s) => st.skills[s.id] < s.max);
  if (!pool.length) {
    st.pendingCards = 0;
    return;
  }
  const prefer = st.buddy && st.buddy.prefer;
  const picks = [];
  if (st.firstCards && prefer && st.skills[prefer] < SK[prefer].max) picks.push(prefer);
  st.firstCards = false;
  while (picks.length < Math.min(3, pool.length)) {
    const left = pool.filter((s) => picks.indexOf(s.id) < 0);
    const w = left.map((s) => (s.id === prefer ? 4 : 1));
    let r = st.rand() * w.reduce((a, b) => a + b, 0);
    let k = 0;
    while (r > w[k]) r -= w[k++];
    picks.push(left[k].id);
  }
  // 打乱一下，伙伴偏好的那张不总在第一个
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
  st.skills[id]++;
  st.mods = mods(st);
  st.pendingCards--;
  st.cards = null;
  st.mode = 'play';
  st.events.push({ t: 'pick', id });
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

module.exports = { newRun, step, pick, pullLever, mods, SK };
