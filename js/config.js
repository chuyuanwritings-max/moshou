// 数值都在这里：关卡、技能、机关伙伴、弩机升级。调手感只改这个文件。

// 逻辑画布：360 宽 × 720 高，按屏幕等比缩放（见 main.js）
const FIELD = { w: 360, h: 720, playerY: 664, gateY: 606 };

// 龙
const DRAGON = {
  r: 15, // 每节半径
  gap: 31, // 两节中心的距离
  rush: 230, // 刚进场时冲得很快（像素/秒）
  rushUntil: 0.5, // 冲到整条龙都进了屏幕才慢下来；龙太长时最多冲到路的一半
  catchUp: 90, // 中间被打掉一节，后半截追上来的速度
  curve: 2.5, // 血量往尾巴越来越硬，而且是弯着长（前七成打得爽，卡在最后几节 = 差一点）
  tailMul: 3, // 最后一节是「攻城槌」：3 倍血
  rage: 1.6, // 龙越短越急：只剩最后几节时最多快 (1 + rage) 倍，输多半输在「差一点」
};

// 连弩（阿铸）
const BOW = {
  dmg: 6,
  interval: 0.12, // 每 0.12 秒一箭（密一点才爽；伤害跟着调小，总输出不变）
  speed: 760,
  r: 4,
  spreadDeg: 7,
};

// 关卡：rows = 弯路有几行；n = 龙有几节；hp = 龙头那节的血，越往尾巴越硬（growth）；
// chests = 几个机关匣；v = 慢下来以后爬多快；accel = 每秒再快多少（一直有压力）
const LEVELS = [
  // 数值由 test/measure.js 模拟玩家连玩 15 局调出来（2026-11-19）：第 1 关发呆也能过；第 2 关第一次普通玩家赢四成
  { rows: 4, n: 24, hp: 70, growth: 1.2, chests: 5, v: 6.8, accel: 0.004 },
  { rows: 5, n: 40, hp: 265, growth: 4.0, chests: 6, v: 7.7, accel: 0.004 },
  { rows: 5, n: 46, hp: 240, growth: 4.5, chests: 7, v: 8.2, accel: 0.0045 },
  { rows: 5, n: 52, hp: 245, growth: 5.0, chests: 7, v: 8.7, accel: 0.005 },
  { rows: 6, n: 58, hp: 295, growth: 5.5, chests: 8, v: 8.7, accel: 0.005 },
];
// 第 6 关以后：照最后一关，每关再硬 25%
function level(i) {
  if (i < LEVELS.length) return Object.assign({ index: i }, LEVELS[i]);
  const last = LEVELS[LEVELS.length - 1];
  const k = i - LEVELS.length + 1;
  return Object.assign({ index: i }, last, { hp: Math.round(last.hp * Math.pow(1.25, k)), n: last.n + 2 * k, v: last.v + 0.5 * k });
}

// 三选一的技能。icon 是 draw.js 里画的 8 比特小图标
const SKILLS = [
  { id: 'multi', name: '多发', max: 5, color: '#ffcf4a' },
  { id: 'rate', name: '连射', max: 5, color: '#ff8a3d' },
  { id: 'power', name: '重弩', max: 5, color: '#ff5a4a' },
  { id: 'pierce', name: '穿透', max: 3, color: '#8fe3ff' },
  { id: 'bounce', name: '弹墙', max: 3, color: '#7dff9a' },
  { id: 'blast', name: '炸开', max: 3, color: '#ffa0d8' },
  { id: 'frost', name: '冻住', max: 3, color: '#b9c8ff' },
  { id: 'crit', name: '会心', max: 3, color: '#fff27a' },
];

// 机关伙伴：带一只上城墙。prefer = 这只让哪个技能出得更勤（权重 ×4），而且这个技能变得更强
const BUDDIES = [
  { id: 'que', name: '铜雀', prefer: 'multi', unlockLevel: 0, note: '多发每级多两箭' },
  { id: 'quan', name: '木犬', prefer: 'bounce', unlockLevel: 1, note: '弹过墙的箭伤害翻倍' },
  { id: 'gui', name: '蒸汽龟', prefer: 'blast', unlockLevel: 3, note: '一开局就会炸开，炸得更大' },
];

// 弩机升级（金币买）：每级伤害 +12%
const UPGRADE = { pct: 0.12, cost: (lv) => Math.round(12 * Math.pow(1.55, lv)) };

// 金币：每打碎一节 1 个；赢了另给
const GOLD = { perKill: 1, winBase: 15, winPerLevel: 10 };

// 广告（假按钮）
const AD = {
  leverPush: 10, // 拉总闸：龙往回退 10 节
  leverWindow: 2.6, // 按钮亮几秒
  leverSlow: 0.18, // 按钮亮着时时间放慢到几成
  maxPerRun: 3,
};

// 「差一点」：输的那一刻龙只剩不到两成、或不到 5 节
function isNearMiss(left, total) {
  return left <= Math.max(5, Math.floor(total * 0.2));
}

module.exports = { FIELD, DRAGON, BOW, LEVELS, level, SKILLS, BUDDIES, UPGRADE, GOLD, AD, isNearMiss };
