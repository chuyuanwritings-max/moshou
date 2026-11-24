// 《墨守》0.6 不开画面跑守城：机器人每波把材料合成机关、摆上城墙，量过关率和一关多长。
const D = require('../js/mo/data.js');
const B = require('../js/mo/build.js');
const F = require('../js/mo/defend.js');
const A = require('../js/mo/attack.js');
const meta = { slots: 3, dragonLen: 4, cartSlots: 2, wallHp: 150, bench: 2, recipes: D.START_RECIPES.slice(), shenji: {} };

function botWorkshop(r, noBuy) {
  while (r.cards) B.pickCard(r, 0);
  // 能合就合：先试单一（两份一样），再试相生
  for (let guard = 0; guard < 20; guard++) {
    let made = false;
    for (const m of D.MACHINES) {
      if (r.recipes.indexOf(m.id) < 0) continue;
      const need = {};
      m.els.forEach((e) => (need[e] = (need[e] || 0) + 1));
      if (Object.keys(need).every((e) => r.mats[e] >= need[e])) {
        B.combine(r, m.els);
        made = true;
        break;
      }
    }
    if (!made) break;
  }
  // 摆上城墙：同名同阶合，空位放
  for (let bi = r.bench.length - 1; bi >= 0; bi--) {
    const mc = r.bench[bi];
    let si = r.slots.findIndex((s) => s && s.id === mc.id && s.tier === mc.tier && s.tier < 4);
    if (si < 0) si = r.slots.findIndex((s) => !s);
    if (si >= 0) B.place(r, bi, si);
  }
  if (noBuy) return;
  // 买得起就买第一件道具
  for (let i = 0; i < 4; i++) if (r.shop[i] && r.shop[i].kind !== 'mat' && r.coins >= r.shop[i].price + 10) B.buy(r, i);
}

// live = 守城边打边合（每秒合一次、摆一次，像真人在波中操作）
function run(li, seed, skill, live) {
  const lv = D.LEVELS[li];
  const r = B.newRun(meta, lv, 'azhu', seed);
  const S = lv.mode === 'defend' ? F : A;
  const st = lv.mode === 'defend' ? F.newDefend(r) : A.newAttack(r);
  let g = 0;
  while ((st.mode === 'play' || st.mode === 'shop') && g++ < 60 * 400) {
    if (st.mode === 'shop') {
      B.waveEnd(r);
      botWorkshop(r);
      S.nextWave(st);
      continue;
    }
    st.targetX = skill ? S.botX(st) : 180;
    if (live && lv.mode === 'defend' && g % 60 === 0) botWorkshop(r, true);
    S.step(st, 1 / 60);
    st.events.length = 0;
  }
  return { win: st.mode === 'win', t: st.t, hp: r.hp / r.hpMax, kills: r.log.kills, made: r.log.made, coins: r.coins };
}

const N = +process.argv[2] || 40;
const LIVE = process.argv[3] !== 'between';
console.log(LIVE ? '【边打边合】' : '【只在波间合】');
for (const li of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  let w = 0, t = 0, hp = 0, made = 0, kills = 0;
  for (let i = 0; i < N; i++) {
    const o = run(li, 1000 + i * 37, true, LIVE);
    w += o.win; t += o.t; hp += o.win ? o.hp : 0; made += o.made; kills += o.kills;
  }
  console.log(D.LEVELS[li].id, '过关', Math.round((w / N) * 100) + '%', '平均秒', (t / N).toFixed(0), '过关剩血', w ? Math.round((hp / w) * 100) + '%' : '-', '合机关', (made / N).toFixed(1), '碎节', (kills / N).toFixed(0));
}
