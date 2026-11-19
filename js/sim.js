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
  // 伙伴在场上的状态：home = 待在阿铸身边等冷却；其他状态见 stepBuddy
  st.pal = buddy ? { state: 'home', cd: buddy.cd * 0.5, x: st.px + 34, y: C.FIELD.playerY - 20, t: 0, n: 0, target: -1, fx: 0, fy: 0 } : null;
  st.shells = [];
  st.slowT = 0;
  st.mods = mods(st);
  placeSegs(st);
  return st;
}

function mods(st) {
  const k = st.skills;
  const base = C.BOW.dmg * (1 + C.UPGRADE.pct * st.bowLv);
  return {
    base, // 弩机一箭（只算升级）：伙伴的伤害按它的倍数算
    dmg: base * Math.pow(1.3, k.power),
    interval: C.BOW.interval * Math.pow(0.8, k.rate),
    n: 1 + k.multi,
    pierce: k.pierce,
    bounce: k.bounce,
    crit: 0.15 * k.crit,
    frost: Math.pow(0.85, k.frost),
    blast: k.blast,
    blastR: 34 + 12 * k.blast,
    // 武器有多「重」：升级和重弩都算，画面上箭的样子、打中的声音跟着变
    tier: st.bowLv + 2 * k.power,
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
  const steam = st.slowT > 0 && st.buddy ? st.buddy.slow : 1; // 蒸汽龟的蒸汽卡住齿轮
  return st.lv.v * (1 + st.lv.accel * st.t) * (1 + C.DRAGON.rage * gone * gone) * st.mods.frost * steam;
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
  st.events.push({ t: 'kill', x: g.x, y: g.y, chest: g.chest, front: i === 0, ram: g.ram, max: g.max, combo: st.comboTimes.length });
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
          const dmg = m.dmg * (crit ? 3 : 1);
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
          damage(st, g, m.base * b.peckDmg * (g.chest ? b.chestMul : 1), g.x, g.y - 6, false);
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
            damage(st, g, m.base * b.biteDmg, g.x, g.y, false);
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
      for (const o of near) damage(st, o, m.base * b.shellDmg, o.x, o.y, false);
    }
  }
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
