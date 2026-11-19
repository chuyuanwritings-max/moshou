// 不开浏览器，直接跑规则：三种机器人各打几百局，看每关胜率、一局几秒、「差一点」占多少。
// 用法：node test/sim-balance.js [每种几局，默认 200]
const C = require('../js/config.js');
const S = require('../js/sim.js');

const DT = 1 / 60;
// 三种玩家：聪明（盯着龙头打）、普通（反应慢半拍、手抖）、发呆（左右乱晃）
const BOTS = {
  聪明: { react: 0.12, noise: 6, lazy: 0 },
  普通: { react: 0.35, noise: 22, lazy: 0.25 },
  发呆: { react: 0, noise: 0, lazy: 1 },
};

function aim(st, bot, mem) {
  mem.cd -= DT;
  if (mem.cd > 0) return mem.x;
  mem.cd = bot.react || 0.1;
  if (bot.lazy >= 1 || st.rand() < bot.lazy) {
    mem.x = 180 + 130 * Math.sin(st.t * 0.9 + mem.phase);
    return mem.x;
  }
  // 打最靠前、而且箭从下面打得到的那节：龙头
  const vis = st.segs.filter((g) => g.s >= 0);
  const g = vis[0];
  mem.x = g ? g.x + (Math.cos(g.a) * 14) + (st.rand() - 0.5) * 2 * bot.noise : 180;
  return mem.x;
}

function play(level, botName, seed, meta, useLever) {
  const bot = BOTS[botName];
  const st = S.newRun(level, meta, seed);
  const mem = { cd: 0, x: 180, phase: seed % 7 };
  let guard = 0;
  while ((st.mode === 'play' || st.mode === 'cards') && guard++ < 60 * 900) {
    if (st.mode === 'cards') S.pick(st, Math.floor(st.rand() * st.cards.length));
    S.step(st, DT, aim(st, bot, mem));
    if (useLever && st.lever.offer > 0 && st.lever.offer < C.AD.leverWindow - 0.6) S.pullLever(st);
    st.events.length = 0;
  }
  return { win: st.mode === 'win', t: st.t, left: st.segs.length, near: !!st.nearMiss, kills: st.kills, gold: st.gold, skills: st.skills, adsUsed: st.adsUsed };
}

if (require.main === module) {
  const N = +process.argv[2] || 200;
  const levels = [0, 1, 2, 3, 4];
  const meta = { bowLv: 0 };
  for (const name of Object.keys(BOTS)) {
    const row = [];
    for (const L of levels) {
      let w = 0, t = 0, near = 0, loses = 0, tw = 0;
      for (let i = 0; i < N; i++) {
        const r = play(L, name, 1000 + i * 7 + L * 131, Object.assign({}, meta, { bowLv: L * 2 }), false);
        if (r.win) { w++; tw += r.t; } else { loses++; if (r.near) near++; }
        t += r.t;
      }
      row.push(`第${L + 1}关 胜${Math.round((100 * w) / N)}% 平均${Math.round(t / N)}秒 赢局${w ? Math.round(tw / w) : '-'}秒 差一点${loses ? Math.round((100 * near) / loses) : '-'}%`);
    }
    console.log(name + '：\n  ' + row.join('\n  '));
  }
}

module.exports = { play, BOTS };
