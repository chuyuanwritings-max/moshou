// 《墨守》0.4「你当机关龙」· 数值表
// 底子：《Snake VS Block》（5 条道、吃球变长、撞方块变短、栅栏挡路、方块排和空地轮流）。
// 我们加的：弩塔会射你、一关有城门终点、三个地方、局外升起步节数。

const FIELD = { w: 360, h: 720 };
const LANES = 5;
const CELL = 72; // 一条道宽 = 一格
const BLOCK = 66; // 方块画多大（留缝）
const HEAD_Y = 500; // 龙头在屏幕上的高度（世界往下滚）
const HEAD_R = 13;
const SEG = 17; // 车厢间距
const CHEW = 0.075; // 啃一口（掉一节、方块 -1）要多久
const STEER_MAX = 1100; // 龙头横移最快多少像素/秒

// 三个地方：染色、地面颜色、背景图
const CHAPTERS = [
  { id: 'city', name: '边城', ground: '#c79a5c', ground2: '#b4864a', crack: '#8d6634', brick: ['#e8cf9a', '#c99a5a', '#8e5f34'], img: 'bg_city' },
  { id: 'tomb', name: '古墓', ground: '#4f6f66', ground2: '#43615a', crack: '#2c443f', brick: ['#a9c7b8', '#6c9a8a', '#3d5f56'], img: 'bg_tomb' },
  { id: 'pit', name: '兵马俑地宫', ground: '#8a4a33', ground2: '#7a3f2b', crack: '#542a1c', brick: ['#e2a77f', '#b8714b', '#7d4128'], img: 'bg_pit' },
];

// 每关：多少排（方块排 + 空地算一排）、方块上限起点、速度、弩塔比例、城门厚度
// num：方块数字上限（原作 5 起，每 10 排 +1；我们每 8 排 +1）
const LEVELS = [
  { ch: 0, rows: 40, num: 5, v: 120, tower: 0.0, gate: 24, types: { powder: 0.08 }, foe: 0 },
  { ch: 0, rows: 44, num: 6, v: 128, tower: 0.1, gate: 62, types: { iron: 0.14, powder: 0.1 }, foe: 0.25, boss: 'ballista' },
  { ch: 1, rows: 46, num: 8, v: 134, tower: 0.12, gate: 56, types: { ghost: 0.18, rock: 0.5 }, foe: 0.3 },
  { ch: 1, rows: 48, num: 9, v: 140, tower: 0.14, gate: 66, types: { ghost: 0.18, rock: 0.6, iron: 0.08 }, foe: 0.35, boss: 'beast' },
  { ch: 2, rows: 50, num: 10, v: 146, tower: 0.15, gate: 74, types: { clay: 0.2, powder: 0.08 }, foe: 0.35 },
  { ch: 2, rows: 52, num: 11, v: 152, tower: 0.17, gate: 92, types: { clay: 0.22, iron: 0.1, ghost: 0.06 }, foe: 0.4, boss: 'general' },
];
// 敌人兵种：一眼认得出，各有克法（新兵种第一次出现时弹小卡教）
const TYPES = {
  powder: { name: '火药砖', tip: '一啃就炸，多掉 3 节 · 用弩车、喷火远远打碎' },
  iron: { name: '铁盾砖', tip: '火和箭都打不动 · 只能用嘴啃' },
  ghost: { name: '幽影砖', tip: '一会儿实一会儿虚 · 虚的时候直接穿过去' },
  rock: { name: '滚石', tip: '带着数字往下滚 · 躲开它，或者硬啃' },
  clay: { name: '陶俑砖', tip: '不啃它就自己回血 · 一口气啃完' },
  foe: { name: '墨家机关兵', tip: '横着巡逻，砍到龙身掉 3 节 · 用龙头撞它就吃掉' },
};
const BOSSES = {
  ballista: { name: '巨弩城楼', tip: '城楼上一排巨弩，一次射三条道 · 边躲边啃' },
  beast: { name: '镇墓兽', tip: '只有它的脸能啃，它会横着来回跑 · 追着它啃' },
  general: { name: '将军俑', tip: '不啃它就回血 · 攒够节数一口气撞开' },
};
const NUM_EVERY = 8; // 每 8 排上限 +1
const V_EVERY = 12; // 同时速度 +12
// 打完 6 关之后轮回：数字、城门 +30%
function level(i) {
  const base = LEVELS[i % LEVELS.length];
  const loop = Math.floor(i / LEVELS.length);
  if (!loop) return Object.assign({ idx: i }, base);
  const k = 1 + 0.3 * loop;
  // 精英：数字和城门更大、弩塔三连射、机关兵更多
  return Object.assign({}, base, { idx: i, elite: loop, num: Math.round(base.num * k), gate: Math.round(base.gate * k), v: base.v + 8 * loop, tower: Math.min(0.3, base.tower + 0.05 * loop), foe: Math.min(0.6, (base.foe || 0) + 0.1 * loop) });
}

// 一排方块有几格（原作 [4,5,3,2,4,5] 轮着来）
const BLOCK_COUNTS = [4, 5, 3, 2, 4, 5];
// 空地有几格高（原作 2–4）、放几根栅栏（原作 [1,2,3,1,2]）
const GAP_ROWS = [3, 2, 3, 4, 2];
const FENCES = [1, 2, 3, 1, 2];

// 道具：每 15 秒（按路程算）出一个，三样轮着来
const POWER_EVERY = 15;
const POWERS = ['shield', 'bomb', 'magnet'];
const POWER_TIME = { shield: 5, magnet: 6 };

// 弩塔
const TOWER = { cd: 1.7, first: 0.6, boltV: 210, range: 430, drop: 3 };

const START_LEN = 6;
// 局外升级（铜钱）
const UPGRADES = {
  startLen: { name: '起步 +1 节', max: 10, cost: (lv) => 30 + lv * 25 },
  startCard: { name: '开局送一次三选一', max: 1, cost: () => 160 },
  partLuck: { name: '零件多 1 节的机会 +10%', max: 5, cost: (lv) => 60 + lv * 45 },
};

// 特殊车厢（三选一的卡）：拿到就挂在龙身上，看得见；再拿升级，3 级进化
const CARS = [
  { id: 'fire', name: '喷火龙首', evo: '烈焰龙首', lv: ['龙首往前喷火，烧前面的砖 3 点', '喷得更勤，烧 5 点', '进化：火更长，连烧两排、8 点'] },
  { id: 'bow', name: '连弩车', evo: '三连弩车', lv: ['背上一张弩，往前射箭打砖', '射得更快', '进化：一次三箭'] },
  { id: 'tooth', name: '铜牙', evo: '钻头龙首', lv: ['啃砖快 30%，每 3 口有 1 口不掉节', '再快一点', '进化：每 2 口有 1 口不掉节'] },
  { id: 'armor', name: '铜甲车', evo: '铁壁车', lv: ['挡 2 支弩箭，挡完 5 秒长回来', '挡 3 支', '进化：挡 5 支，3 秒就长回'] },
  { id: 'magnet', name: '磁石车', evo: '大磁石车', lv: ['零件自己往龙身上飞', '吸得更远', '进化：整屏的零件都吸过来'] },
  { id: 'forge', name: '锻炉车', evo: '熔金炉车', lv: ['每个零件多 +1 节', '每个零件多 +2 节', '进化：每个零件多 +3 节'] },
  { id: 'powder', name: '火药车', evo: '霹雳车', lv: ['碎一块砖，左右两块各掉 3 点', '各掉 4 点', '进化：各掉 6 点，还会连环炸'] },
];
const MAX_CARS = 4;
const CHEST_EVERY = 3; // 每 3 段空地放一个机关匣

const ASSETS = [];

module.exports = {
  FIELD, LANES, CELL, BLOCK, HEAD_Y, HEAD_R, SEG, CHEW, STEER_MAX,
  CHAPTERS, LEVELS, level, NUM_EVERY, V_EVERY, BLOCK_COUNTS, GAP_ROWS, FENCES,
  POWER_EVERY, POWERS, POWER_TIME, TOWER, TYPES, BOSSES, START_LEN, UPGRADES, ASSETS, CARS, MAX_CARS, CHEST_EVERY,
};
