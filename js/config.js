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

// 三个地方（0.3，Cc：「守各种城池，以及古墓，甚至地下的兵马俑」）。一个地方 2 关，之后轮回、更难。
// tint = 风格库 LDR-S1E08-a「一幕一种染色」的色板；path = 路的形状；enemy = 敌人长什么样
const CHAPTERS = [
  { id: 'city', name: '边城', goal: '城门', path: 'snake', enemy: 'dragon', foe: '公输家的机关长龙',
    tint: ['#2a2412', '#59512E', '#7D6C2C', '#888459'], accent: '#ff9a3c', ground: '#4a3f22', groundHi: '#5d5029' },
  { id: 'tomb', name: '古墓', goal: '墓室', path: 'spiral', enemy: 'centi', foe: '盗墓的铁蜈蚣',
    tint: ['#0f1c20', '#23383F', '#3D6170', '#5B7A78'], accent: '#ffb347', ground: '#1f3136', groundHi: '#294046' },
  { id: 'pit', name: '兵马俑地宫', goal: '地宫闸门', path: 'columns', enemy: 'terra', foe: '被唤醒的陶俑方阵',
    tint: ['#1c0b09', '#3A1A14', '#571F1D', '#8F493B'], accent: '#ff7a2a', ground: '#3d1d16', groundHi: '#4c261c' },
];

// 关卡：rows = 弯路有几行（回旋 / 竖列也用它）；n = 龙有几节；hp = 龙头那节的血，越往尾巴越硬（growth）；
// chests = 几个机关匣；v = 慢下来以后爬多快；accel = 每秒再快多少；types = 各兵种占几成
const LEVELS = [
  // 数值由 test/measure.js 模拟玩家连玩 15 局调出来（2026-11-20，0.3）。古墓、地宫的路长，所以爬得快
  { ch: 0, rows: 4, n: 30, hp: 90, growth: 1.2, chests: 5, v: 6.8, accel: 0.004, types: { powder: 0.12 } },
  { ch: 0, rows: 5, n: 40, hp: 335, growth: 4.0, chests: 6, v: 7.7, accel: 0.004, types: { shield: 0.2, powder: 0.08 } },
  { ch: 1, rows: 2, n: 44, hp: 350, growth: 4.5, chests: 7, v: 12, accel: 0.0045, types: { ghost: 0.16, split: 0.12 } },
  { ch: 1, rows: 2, n: 50, hp: 370, growth: 5.0, chests: 7, v: 12.5, accel: 0.005, types: { ghost: 0.18, split: 0.14, shield: 0.08 } },
  { ch: 2, rows: 5, n: 52, hp: 290, growth: 5.0, chests: 7, v: 11.5, accel: 0.005, types: { clay: 0.2, core: 0.12 } },
  { ch: 2, rows: 5, n: 58, hp: 320, growth: 5.5, chests: 8, v: 12, accel: 0.005, types: { clay: 0.22, core: 0.14, ghost: 0.06 } },
];
// 第 7 关以后：三个地方轮回，每轮再硬 30%，兵种混着来
function level(i) {
  if (i < LEVELS.length) return Object.assign({ index: i }, LEVELS[i]);
  const k = i - LEVELS.length;
  const round = Math.floor(k / LEVELS.length) + 1;
  const base = LEVELS[k % LEVELS.length];
  const types = Object.assign({}, base.types);
  const extra = ['shield', 'ghost', 'clay', 'core', 'split'][k % 5];
  types[extra] = (types[extra] || 0) + 0.08;
  return Object.assign({ index: i }, base, { hp: Math.round(base.hp * Math.pow(1.3, round)), n: base.n + 4 * round, v: base.v + 0.6 * round, types });
}
const chapterOf = (i) => CHAPTERS[level(i).ch];

// 兵种（照《王国保卫战》：每种只怕一两样东西）。hpMul = 血量倍数；fear = 克它的武器（卡上写「克 盾」）
const TYPES = {
  shield: { name: '铜盾节', tag: '盾', hpMul: 1, fear: ['blade', 'chain', 'hammer', 'pot'], tip: '箭打不动' },
  powder: { name: '火药节', tag: '药', hpMul: 0.6, fear: [], tip: '打碎会炸，炸伤一片' },
  ghost: { name: '幽影节', tag: '魂', hpMul: 0.9, fear: ['lamp', 'chain'], tip: '变虚时什么都打不到' },
  split: { name: '分裂节', tag: '裂', hpMul: 0.9, fear: ['pot', 'chain'], tip: '打碎变成两小节' },
  clay: { name: '重甲俑', tag: '甲', hpMul: 1.5, fear: ['hammer', 'pot'], tip: '普通伤害只打一半' },
  core: { name: '墨核节', tag: '核', hpMul: 1, fear: ['pot', 'frost'], tip: '会自己回血' },
};
const TYPE_RULE = {
  shieldBow: 0.2, // 铜盾：连弩的箭只打 2 成
  powderR: 72, powderMul: 1.6, // 火药：炸半径、炸伤 = 自己满血 × 1.6
  ghostSolid: 2.0, ghostPhase: 1.5, // 幽影：实 2 秒、虚 1.5 秒
  splitHp: 0.35, // 分裂：两小节各 35% 血
  clay: { hammer: 3, pot: 2, fire: 2, blast: 2, other: 0.5 }, // 重甲俑
  coreRegen: 0.05, coreStop: 1.5, // 墨核：每秒回 5% 满血；被烧 / 冻以后 1.5 秒不回
};

// 七件武器（照《吸血鬼幸存者》：形状各不一样，5 级进化）。连弩开局就有；最多带 4 件。
// dmg 都是「弩机一箭」的倍数；lvDesc = 升到这一级时卡上写什么
const WEAPONS = [
  { id: 'bow', name: '连弩', evo: '万箭弩', color: '#ffcf4a',
    lvDesc: ['开局就有', '多一箭', '射得更快', '再多一箭', '进化：五箭齐发、箭会穿透'] },
  { id: 'blade', name: '回旋刃', evo: '八方轮', color: '#9fe8ff',
    cd: 2.2, dmg: 4, lvDesc: ['飞出去再飞回来，不怕盾', '更大', '更快', '更狠', '进化：三把一起飞'] },
  { id: 'pot', name: '霹雳罐', evo: '火龙雨', color: '#ff7a3a',
    cd: 3.2, dmg: 6, burn: 3, lvDesc: ['抛到龙最密处，炸开留火', '炸得更大', '火烧更久', '更狠', '进化：一次三罐'] },
  { id: 'chain', name: '雷链', evo: '雷公阵', color: '#b9d8ff',
    cd: 1.5, dmg: 2.4, lvDesc: ['劈最前面一节，往后跳 4 节', '多跳 2 节', '更快', '多跳 2 节', '进化：整条龙都劈'] },
  { id: 'frost', name: '寒气筒', evo: '冰封', color: '#cfe6ff',
    cd: 4.2, dmg: 2, lvDesc: ['冻住前几节，龙变慢', '冻得更久', '冻得更多', '更慢', '进化：整条龙冻住'] },
  { id: 'hammer', name: '千斤锤', evo: '泰山压', color: '#e0b070',
    cd: 3.0, dmg: 14, lvDesc: ['大锤砸最前面那节', '更重', '更快', '更重', '进化：连砸三节、震退'] },
  { id: 'lamp', name: '照妖灯', evo: '日轮', color: '#fff27a',
    dmg: 7, lvDesc: ['头顶一道光柱一直烧', '更宽', '更烫', '更宽', '进化：光柱变粗、左右扫'] },
];
const MAX_WEAPONS = 4;

// 机关伙伴：带一只上城墙，三只的打法完全不一样（2026-11-19 0.2：Cc 说看不出区别，改成各自动手）
// 三只强度调到差不多（test/measure.js + 分关对比），区别在打法不在强弱。伤害都按「弩机一箭」的倍数算，所以升级弩机伙伴也跟着变强。prefer = 三选一里这张卡出得更勤
const BUDDIES = [
  // 铜雀：飞出去啄，专挑机关匣（没有匣子就啄最硬的那节）→ 匣子开得快，技能来得多
  { id: 'que', name: '铜雀', prefer: 'blade', unlockLevel: 0, note: '飞去啄机关匣，技能来得快',
    cd: 2.0, pecks: 5, peckDmg: 3.0, chestMul: 1.3, fly: 520 },
  // 木犬：扑上龙头咬一大口，整条龙往后退 → 救急
  { id: 'quan', name: '木犬', prefer: 'hammer', unlockLevel: 1, note: '扑咬龙头，整条龙往后退',
    cd: 3.2, biteDmg: 34, push: 0.45 },
  // 蒸汽龟：往龙最密的地方抛炮弹，炸一大片，留一团蒸汽让龙变慢 → 清场
  { id: 'gui', name: '蒸汽龟', prefer: 'pot', unlockLevel: 3, note: '抛炮弹炸一片，蒸汽让龙变慢',
    cd: 3.5, shellDmg: 4.4, shellR: 62, flight: 0.7, slow: 0.75, slowSec: 1.2 },
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

// 生图（原型/素材/ 里的文件）：有了就加进来，没有的不要写（读不到会报错）
const ASSETS = [];

module.exports = { ASSETS, FIELD, DRAGON, BOW, CHAPTERS, LEVELS, level, chapterOf, TYPES, TYPE_RULE, WEAPONS, MAX_WEAPONS, BUDDIES, UPGRADE, GOLD, AD, isNearMiss };
