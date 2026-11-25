// 实验（不碰游戏代码）：同一个机器人只改一个选法，比「永远选甲 / 永远选乙」差多少
// 用法：node exp.js 关号 世界(now|fix) 选法维度 N 龙血倍数
const D = require('./js/mo/data.js');
const B = require('./js/mo/build.js');
const F = require('./js/mo/defend.js');
const [li, world, dim, N0, hpk] = process.argv.slice(2);
const N = +N0 || 100;
if (world === 'fix') { global.RANGE_K = 0.6; global.CLEAR = 1; }
if (world === 'clear') { global.CLEAR = 1; }
if (world === 'range') { global.RANGE_K = 0.6; }
const SP0 = F.SPOTS.slice();
const meta = { slots: 3, dragonLen: 4, cartSlots: 2, wallHp: 150, bench: 2, recipes: D.START_RECIPES.slice(), shenji: {} };
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function run(seed, opt) {
  const R = mulberry(seed * 7 + 3);
  // 点位开的顺序：按设计 / 随机（把 SPOTS 原地重排；风水位跟着点位走）
  const order = SP0.slice();
  if (opt.spots === 'random') for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  if (opt.spots === 'reverse') order.reverse();
  F.SPOTS.splice(0, F.SPOTS.length, ...order);
  const lv = Object.assign({}, D.LEVELS[+li]);
  lv.hp *= +hpk || 1;
  const r = B.newRun(meta, lv, 'azhu', seed);
  const st = F.newDefend(r);
  const pick = (list) => (opt.combine === 'random' ? list[Math.floor(R() * list.length)] : opt.combine === 'last' ? list[list.length - 1] : list[0]);
  const work = () => {
    for (let k = 0; k < 20; k++) { const mk = B.makeable(r); if (!mk.length) break; B.combine(r, pick(mk).els); }
    while (F.buySpot(r)) {}
    for (let bi = r.bench.length - 1; bi >= 0; bi--) {
      const mc = r.bench[bi];
      let si = r.slots.findIndex((s) => s && s.id === mc.id && s.tier + mc.tier <= 4);
      if (si < 0) {
        const empty = r.slots.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
        if (!empty.length) continue;
        si = opt.assign === 'random' ? empty[Math.floor(R() * empty.length)] : empty[0];
      }
      B.place(r, bi, si);
    }
  };
  let g = 0;
  while ((st.mode === 'play' || st.mode === 'shop') && g++ < 60 * 600) {
    if (st.mode === 'shop') { B.waveEnd(r); while (r.cards) B.pickCard(r, opt.card === 'random' ? Math.floor(R() * r.cards.length) : 0); work(); F.nextWave(st); continue; }
    if (g % 60 === 0) work();
    F.step(st, 1 / 60);
    st.events.length = 0;
  }
  return { win: st.mode === 'win', hp: r.hp / r.hpMax, leaked: st.leaked || 0 };
}
const variants = { spots: ['design', 'random', 'reverse'], assign: ['first', 'random'], combine: ['first', 'random', 'last'], card: ['first', 'random'] }[dim];
const res = variants.map((v) => {
  let w = 0, hp = 0, lk = 0;
  for (let i = 0; i < N; i++) { const o = run(5000 + i * 31, { [dim]: v }); w += o.win; hp += o.win ? o.hp : 0; lk += o.leaked; }
  return v + ' ' + Math.round((w / N) * 100) + '%(剩血' + (w ? Math.round((hp / w) * 100) : '-') + '%,漏' + (lk / N).toFixed(0) + '节)';
});
console.log(D.LEVELS[+li].id, world, 'hp×' + (hpk || 1), dim + ':', res.join('  |  '));
