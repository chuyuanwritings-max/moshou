// 不开画面，直接用规则跑很多局：每关多长、过关率、输的时候差几节。
// 机关龙（玩法 A）。用法：node test/ram-balance.js [每关局数]
const S = require('../js/ram/sim.js');
const C = require('../js/ram/config.js');

const N = Number(process.argv[2]) || 200;
const SKILLS = {
  新手: { look: 170, miss: 0.25, react: 0.35 },
  普通: { look: 240, miss: 0.12, react: 0.22 },
  高手: { look: 340, miss: 0.03, react: 0.12 },
};

function play(levelIdx, skill, seed, startLv) {
  const st = S.newRun(levelIdx, { startLv: startLv || 0 }, seed);
  const mem = {};
  let guard = 0;
  while ((st.mode === 'play' || st.mode === 'cards') && guard++ < 60 * 400) {
    if (st.mode === 'cards') S.botPick(st);
    st.targetX = S.botThink(st, skill, mem);
    S.step(st, 1 / 60);
    st.events.length = 0;
  }
  return st;
}

const out = [];
for (const [name, skill] of Object.entries(SKILLS)) {
  for (let L = 0; L < C.LEVELS.length; L++) {
    let win = 0;
    let t = 0;
    let tw = 0;
    const shorts = [];
    let maxLen = 0;
    let picks = 0;
    let hits = 0;
    let atGate = 0;
    let gateLen = 0;
    for (let i = 0; i < N; i++) {
      const st = play(L, skill, 1000 + i * 7919 + L, Math.min(L, 4));
      t += st.t;
      maxLen += st.maxLen;
      hits += st.boltHits;
      picks += st.picks;
      if (st.reachedGate) {
        atGate++;
        gateLen += st.reachedGate;
      }
      if (st.mode === 'win') {
        win++;
        tw += st.t;
      } else shorts.push(st.short);
    }
    const near = shorts.length ? shorts.filter((s) => s <= 5).length / shorts.length : 0;
    out.push({
      水平: name,
      关: L + 1,
      过关率: Math.round((win / N) * 100) + '%',
      平均秒: (t / N).toFixed(0),
      过关用秒: win ? (tw / win).toFixed(0) : '-',
      最长节: (maxLen / N).toFixed(0),
      中箭: (hits / N).toFixed(1),
      三选一: (picks / N).toFixed(1),
      到城门: Math.round((atGate / N) * 100) + '%',
      到门时节: atGate ? (gateLen / atGate).toFixed(0) : '-',
      门: C.level(L).gate,
      输时差5节内: Math.round(near * 100) + '%',
    });
  }
}
console.table(out);
