// 量三个数（总纲第六步）：一局平均几秒、输的局里「差一点」占多少；「死到再开局几秒」在 robot.js 里用真按钮量。
// 模拟一群玩家从第 1 关连玩 15 局：赢了进下一关，金币够就升弩机，过关解锁伙伴、自动带上。
// 用法：node test/measure.js [几个玩家，默认 100] [机器人：聪明 / 普通 / 发呆，默认 普通]
const C = require('../js/config.js');
const S = require('../js/sim.js');
const { BOTS } = require('./sim-balance.js');

// 调数值用：TUNE='{"rage":3,"hp":[100,200,...]}' node test/measure.js
if (process.env.TUNE) {
  const T = JSON.parse(process.env.TUNE);
  if (T.rage !== undefined) C.DRAGON.rage = T.rage;
  ['hp', 'v', 'n', 'growth'].forEach((k) => T[k] && T[k].forEach((v, i) => (C.LEVELS[i][k] = v)));
  if (T.upPct !== undefined) C.UPGRADE.pct = T.upPct;
}
const DT = 1 / 60;
const PICK_SEC = 1.5; // 真人选一张卡大约 1.5 秒
const players = +process.argv[2] || 100;
const botName = process.argv[3] || '普通';
const bot = BOTS[botName];

function aim(st, mem) {
  mem.cd -= DT;
  if (mem.cd > 0) return mem.x;
  mem.cd = bot.react || 0.1;
  if (bot.lazy >= 1 || st.rand() < bot.lazy) return (mem.x = 180 + 130 * Math.sin(st.t * 0.9 + mem.phase));
  const g = st.segs.find((s) => s.s >= 0);
  return (mem.x = g ? g.x + Math.cos(g.a) * 14 + (st.rand() - 0.5) * 2 * bot.noise : 180);
}

const runs = [];
for (let p = 0; p < players; p++) {
  const meta = { gold: 0, bowLv: 0, buddies: [], buddy: null, level: 0 };
  for (let r = 0; r < 15; r++) {
    const st = S.newRun(meta.level, meta, 7 + p * 1009 + r * 31);
    const mem = { cd: 0, x: 180, phase: p % 5 };
    const useAd = (p + r) % 2 === 0; // 一半的局会点「拉总闸」
    let cards = 0;
    while (st.mode === 'play' || st.mode === 'cards') {
      if (st.mode === 'cards') { S.pick(st, Math.floor(st.rand() * st.cards.length)); cards++; }
      S.step(st, DT, aim(st, mem));
      if (useAd && st.lever.offer > 0 && st.lever.offer < C.AD.leverWindow - 0.8) S.pullLever(st);
      st.events.length = 0;
    }
    const win = st.mode === 'win';
    runs.push({ p, r, level: st.level, win, sec: st.t + cards * PICK_SEC, near: !!st.nearMiss, left: st.segs.length, ad: st.adsUsed });
    meta.gold += st.gold;
    if (win) {
      const nb = C.BUDDIES.find((b) => b.unlockLevel === st.level && meta.buddies.indexOf(b.id) < 0);
      if (nb) { meta.buddies.push(nb.id); meta.buddy = nb.id; }
      meta.level++;
    }
    while (meta.gold >= C.UPGRADE.cost(meta.bowLv)) { meta.gold -= C.UPGRADE.cost(meta.bowLv); meta.bowLv++; }
  }
}

const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const loses = runs.filter((r) => !r.win);
console.log(`${players} 个「${botName}」玩家 × 15 局 = ${runs.length} 局`);
console.log(`一局平均 ${Math.round(avg(runs.map((r) => r.sec)))} 秒（含每次三选一约 ${PICK_SEC} 秒）；第 1 关 ${Math.round(avg(runs.filter((r) => r.level === 0).map((r) => r.sec)))} 秒，第 2 关起 ${Math.round(avg(runs.filter((r) => r.level > 0).map((r) => r.sec)))} 秒；最长 ${Math.round(Math.max(...runs.map((r) => r.sec)))} 秒`);
console.log(`输的局里「差一点」（龙只剩不到两成或不到 5 节）：${Math.round((100 * loses.filter((r) => r.near).length) / Math.max(1, loses.length))}%（${loses.length} 局输）`);
console.log(`点了拉总闸的输局里差一点：${Math.round((100 * loses.filter((r) => r.near && r.ad).length) / Math.max(1, loses.filter((r) => r.ad).length))}%；没点的：${Math.round((100 * loses.filter((r) => r.near && !r.ad).length) / Math.max(1, loses.filter((r) => !r.ad).length))}%`);
console.log(`第 1 局就过第 1 关：${Math.round((100 * runs.filter((r) => r.r === 0 && r.win).length) / players)}%`);
const reach = [1, 2, 3, 4, 5, 6].map((L) => `第${L}关 ${Math.round((100 * new Set(runs.filter((r) => r.level >= L - 1).map((r) => r.p)).size) / players)}%`);
console.log('15 局内打到：' + reach.join('，'));
const byRun = [];
for (let r = 0; r < 15; r++) byRun.push(Math.round((100 * runs.filter((x) => x.r === r && x.win).length) / players));
console.log('第几局赢的比例：' + byRun.map((v, i) => `${i + 1}:${v}%`).join(' '));
