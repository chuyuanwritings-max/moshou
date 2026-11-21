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
  { ch: 0, rows: 40, num: 5, v: 120, tower: 0.0, gate: 24 },
  { ch: 0, rows: 44, num: 6, v: 128, tower: 0.1, gate: 34 },
  { ch: 1, rows: 46, num: 7, v: 134, tower: 0.12, gate: 38 },
  { ch: 1, rows: 48, num: 8, v: 140, tower: 0.15, gate: 38 },
  { ch: 2, rows: 50, num: 9, v: 146, tower: 0.17, gate: 42 },
  { ch: 2, rows: 52, num: 10, v: 152, tower: 0.2, gate: 46 },
];
const NUM_EVERY = 8; // 每 8 排上限 +1
const V_EVERY = 12; // 同时速度 +12
// 打完 6 关之后轮回：数字、城门 +30%
function level(i) {
  const base = LEVELS[i % LEVELS.length];
  const loop = Math.floor(i / LEVELS.length);
  if (!loop) return Object.assign({ idx: i }, base);
  const k = 1 + 0.3 * loop;
  return Object.assign({}, base, { idx: i, num: Math.round(base.num * k), gate: Math.round(base.gate * k), v: base.v + 8 * loop, tower: Math.min(0.3, base.tower + 0.05 * loop) });
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
const UPGRADES = { startLen: { max: 10, cost: (lv) => 30 + lv * 25 } };

const ASSETS = [];

module.exports = {
  FIELD, LANES, CELL, BLOCK, HEAD_Y, HEAD_R, SEG, CHEW, STEER_MAX,
  CHAPTERS, LEVELS, level, NUM_EVERY, V_EVERY, BLOCK_COUNTS, GAP_ROWS, FENCES,
  POWER_EVERY, POWERS, POWER_TIME, TOWER, START_LEN, UPGRADES, ASSETS,
};
