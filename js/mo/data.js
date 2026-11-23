// 《墨守》0.6 · 数据表（照 打龙塔防/墨守_全量设计_1.0.md）
// 第一版：边城 8 关 + 2 挑战、15 种机关（单一 5 + 二合 10）、15 属性、5 羁绊、3 个机关师、20 件道具。

const FIELD = { w: 360, h: 720, gateY: 606 };

// —— 五行 ——
const ELS = ['jin', 'mu', 'shui', 'huo', 'tu'];
const EL = {
  jin: { name: '金', col: '#f1ede2', dark: '#9c9a90' },
  mu: { name: '木', col: '#6fcf5a', dark: '#2f7a2a' },
  shui: { name: '水', col: '#5ab4ff', dark: '#1f5f9c' },
  huo: { name: '火', col: '#ff6a3a', dark: '#a02a10' },
  tu: { name: '土', col: '#e2b04a', dark: '#8a6218' },
};

// —— 15 个属性（五行 × 3）——
const STATS = {
  dmg: { name: '伤害', el: 'jin', unit: '%' },
  crit: { name: '暴击', el: 'jin', unit: '%' },
  pierce: { name: '穿透', el: 'jin', unit: '' },
  hp: { name: '生命', el: 'mu', unit: '' },
  regen: { name: '回复', el: 'mu', unit: '' },
  slow: { name: '缠绕', el: 'mu', unit: '%' },
  freeze: { name: '冰冻', el: 'shui', unit: '%' },
  aspd: { name: '攻速', el: 'shui', unit: '%' },
  range: { name: '射程', el: 'shui', unit: '' },
  aoe: { name: '爆炸范围', el: 'huo', unit: '%' },
  burn: { name: '燃烧', el: 'huo', unit: '' },
  critDmg: { name: '暴伤', el: 'huo', unit: '%' },
  armor: { name: '护甲', el: 'tu', unit: '' },
  knock: { name: '击退', el: 'tu', unit: '' },
  harvest: { name: '收获', el: 'tu', unit: '' },
};
const STAT_BASE = { crit: 5, critDmg: 150 };
const STAT_CAP = { crit: 60, pierce: 5, slow: 50, freeze: 40, aspd: 200, range: 150, aoe: 100 };
// 升级属性卡：每阶加多少（4 阶）
const STAT_CARD = {
  dmg: [5, 8, 12, 16], crit: [3, 5, 7, 9], pierce: [1, 1, 1, 2], hp: [10, 16, 24, 32], regen: [2, 3, 4, 6],
  slow: [4, 6, 9, 12], freeze: [2, 3, 5, 7], aspd: [5, 8, 12, 16], range: [15, 25, 40, 55], aoe: [8, 12, 18, 25],
  burn: [1, 2, 3, 4], critDmg: [10, 15, 22, 30], armor: [1, 2, 3, 4], knock: [1, 1, 2, 2], harvest: [3, 5, 8, 12],
};

// —— 15 种机关（单一 5 + 相生 5 + 相克 5）——
// els：组成它的材料（单一的写两份）；kind：守城时怎么打；atk：进攻时怎么打
// dmg / cd 是 1 阶的；阶数：伤害 × TIER_DMG，冷却 × TIER_CD
const TIER_DMG = [1, 1.8, 3.2, 5.5];
const TIER_CD = [1, 0.9, 0.8, 0.7];
const MACHINES = [
  { id: 'nu', els: ['jin', 'jin'], name: '连弩', kind: 'bolt', atk: 'shoot', dmg: 8, cd: 0.6, tip: '射最近的一节 / 往前射砖', t4: '三排齐射' },
  { id: 'teng', els: ['mu', 'mu'], name: '藤网', kind: 'net', atk: 'netGuard', dmg: 0, cd: 4, tip: '网住一段路，龙变慢 / 网住飞来的箭', t4: '网里每秒掉血' },
  { id: 'han', els: ['shui', 'shui'], name: '寒气筒', kind: 'frost', atk: 'freezeTower', dmg: 3, cd: 3, tip: '冻住前面几节 / 冻住弩塔', t4: '冻住的节挨打 +50%' },
  { id: 'pi', els: ['huo', 'huo'], name: '霹雳罐', kind: 'lob', atk: 'lobAhead', dmg: 20, cd: 2.5, r: 40, tip: '抛到最密处炸开 / 往前炸一片砖', t4: '落地留一摊火' },
  { id: 'chui', els: ['tu', 'tu'], name: '千斤锤', kind: 'hammer', atk: 'chew', dmg: 35, cd: 2.2, tip: '砸最前面一节 / 啃砖快 30%', t4: '砸出震波打一排' },
  { id: 'huolong', els: ['mu', 'huo'], name: '火龙车', kind: 'fireWall', atk: 'fireRow', dmg: 6, cd: 3, tip: '一道火墙横着烧 / 车前喷火墙', t4: '火墙变两道', sheng: true },
  { id: 'rongyan', els: ['huo', 'tu'], name: '熔岩炮', kind: 'lob', atk: 'lobAhead', dmg: 15, cd: 2.5, r: 34, pool: 5, tip: '炸开留一摊岩浆 / 撞过的地方留岩浆', t4: '岩浆不熄', sheng: true },
  { id: 'tiejia', els: ['tu', 'jin'], name: '铁甲锤', kind: 'hammer', atk: 'chew', dmg: 25, cd: 2, rage: true, tip: '城墙越破砸得越狠 / 车越破越狠', t4: '被打就还手一锤', sheng: true },
  { id: 'leilian', els: ['jin', 'shui'], name: '雷链', kind: 'chain', atk: 'chainRow', dmg: 12, cd: 1.8, jumps: 4, tip: '沿龙身往后劈 4 节 / 劈一排砖', t4: '跳 10 节', sheng: true },
  { id: 'huichun', els: ['shui', 'mu'], name: '回春藤', kind: 'heal', atk: 'heal', dmg: 2, cd: 1, tip: '不打，每秒补城墙 / 补车', t4: '满血时补成护盾', sheng: true },
  { id: 'huixuan', els: ['jin', 'mu'], name: '回旋刃', kind: 'blade', atk: 'shoot2', dmg: 18, cd: 1.5, tip: '飞出去飞回来，一路穿透，不怕盾 / 打两排', t4: '三把一起', cost: '回来时割掉藤网' },
  { id: 'muren', els: ['mu', 'tu'], name: '机关木人', kind: 'golem', atk: 'golem', dmg: 0, cd: 6, tip: '木人拦住龙头几秒 / 替车挨打', t4: '一次两个', cost: '木人碎了不掉材料' },
  { id: 'nizhao', els: ['tu', 'shui'], name: '泥沼机', kind: 'mud', atk: 'mud', dmg: 0, cd: 5, tip: '一片泥潭，陷住 2 秒 / 弩塔陷住射不了', t4: '两片泥潭', cost: '自己的车开过也变慢' },
  { id: 'zhengqi', els: ['shui', 'huo'], name: '蒸汽炮', kind: 'lob', atk: 'lobAhead', dmg: 60, cd: 3, r: 50, selfHurt: 1, tip: '一炮炸开一大团 / 轰开一排砖', t4: '蒸汽留在原地', cost: '每发烫掉自己 1 血' },
  { id: 'huochong', els: ['huo', 'jin'], name: '火铳', kind: 'bolt', atk: 'shoot', dmg: 45, cd: 1.2, critBonus: 20, overheat: 5, tip: '一枪很疼，常暴击 / 一枪打穿一块砖', t4: '不会过热', cost: '连打 5 枪过热停 2 秒' },
];
const M = {};
MACHINES.forEach((m) => (M[m.id] = m));
// 由材料找机关（顺序无关）
function recipeOf(list) {
  const key = list.slice().sort().join('+');
  return MACHINES.find((m) => m.els.slice().sort().join('+') === key) || null;
}
const START_RECIPES = ['nu', 'teng', 'han', 'pi', 'chui', 'huolong', 'leilian'];

// —— 五行羁绊（含某一行的机关凑 2→6 件）——
const BONDS = {
  jin: [{}, {}, { dmg: 5 }, { dmg: 10, crit: 3 }, { dmg: 15, crit: 6 }, { dmg: 20, crit: 6, pierce: 1 }, { dmg: 30, crit: 10, pierce: 1 }],
  mu: [{}, {}, { hp: 10 }, { hp: 20, regen: 2 }, { hp: 30, regen: 4 }, { hp: 40, regen: 4, slow: 10 }, { hp: 60, regen: 4, slow: 20 }],
  shui: [{}, {}, { aspd: 5 }, { aspd: 10, freeze: 3 }, { aspd: 15, freeze: 6 }, { aspd: 20, freeze: 6, range: 30 }, { aspd: 30, freeze: 12, range: 30 }],
  huo: [{}, {}, { burn: 1 }, { burn: 2, aoe: 10 }, { burn: 3, aoe: 20 }, { burn: 4, aoe: 20, critDmg: 20 }, { burn: 6, aoe: 20, critDmg: 40 }],
  tu: [{}, {}, { armor: 2 }, { armor: 4, knock: 1 }, { armor: 6, knock: 2 }, { armor: 8, knock: 2, harvest: 5 }, { armor: 12, knock: 2, harvest: 10 }],
};

// —— 第一批 20 件道具（全量设计第 8 节里挑的）——
const ITEMS = [
  { id: 'mo', name: '磨刀石', tier: 1, price: 20, st: { dmg: 5 } },
  { id: 'jian', name: '铜箭头', tier: 1, price: 18, st: { crit: 3 } },
  { id: 'sheng', name: '麻绳', tier: 1, price: 15, st: { slow: 5 } },
  { id: 'huozhe', name: '火折子', tier: 1, price: 18, st: { burn: 1 } },
  { id: 'hang', name: '夯土', tier: 1, price: 20, st: { armor: 2 } },
  { id: 'kuang', name: '竹筐', tier: 1, price: 22, st: { harvest: 3 } },
  { id: 'deng', name: '灯油', tier: 1, price: 15, st: { aoe: 8, hp: -5 }, two: true },
  { id: 'xie', name: '草鞋', tier: 1, price: 20, st: { aspd: 5 } },
  { id: 'buding', name: '补丁', tier: 1, price: 18, st: { hp: 10 } },
  { id: 'shengtie', name: '生铁', tier: 1, price: 18, st: { dmg: 8, aspd: -3 }, two: true },
  { id: 'suanpan', name: '算盘', tier: 1, price: 25, rule: 'coinWave', desc: '每波结束多给 5 铜钱' },
  { id: 'poqi', name: '破旗', tier: 1, price: 25, rule: 'poqi', desc: '城墙 / 车每少 10% 血，伤害 +3%' },
  { id: 'gang', name: '精钢刀片', tier: 2, price: 40, st: { dmg: 12 } },
  { id: 'jiu', name: '酒葫芦', tier: 2, price: 38, st: { crit: 8, hp: -10 }, two: true },
  { id: 'luban', name: '鲁班尺', tier: 2, price: 50, rule: 'luban', desc: '合机关时 10% 机会直接高一阶' },
  { id: 'dun', name: '盾牌', tier: 2, price: 42, rule: 'dun', desc: '每波第一次挨打不掉血' },
  { id: 'liangcang', name: '粮仓', tier: 2, price: 50, rule: 'interest', desc: '每波结束按存着的铜钱给 10% 利息（最多 15）' },
  { id: 'pofu', name: '破釜沉舟', tier: 3, price: 80, st: { dmg: 40 }, rule: 'halfHp', desc: '生命减半，伤害 +40%', two: true },
  { id: 'nilin', name: '逆鳞', tier: 4, price: 120, rule: 'nilin', desc: '城墙 / 车每掉 1% 血，伤害 +1%' },
  { id: 'yifu', name: '一夫当关', tier: 4, price: 120, rule: 'yifu', desc: '只能放 1 件机关，它伤害 ×3、攻速 +100%' },
];
const IT = {};
ITEMS.forEach((i) => (IT[i.id] = i));

// —— 机关师（第一版：默认 3 个）——
const BUILDERS = [
  { id: 'azhu', name: '阿铸', line: '什么都会一点', st: {} },
  { id: 'achui', name: '铁匠阿锤', line: '偏土、偏锤：含土的机关伤害 +20%，开局送一件千斤锤', elDmg: { tu: 20, shui: -10 }, gift: 'chui' },
  { id: 'huotou', name: '火头军', line: '偏火：含火的机关伤害 +20%，燃烧 +2，生命 −10', elDmg: { huo: 20 }, st: { burn: 2, hp: -10 } },
];

// —— 边城 8 关 + 2 挑战 ——
// mode：defend / attack；car：small / dragon；waves：几波；boss：铁头龙 / 巨弩城楼
const LEVELS = [
  { id: '1-1', story: '公输家的机关长龙来攻边城', mode: 'defend', waves: 3, hp: 1, len: 14, teach: '左右拖，阿铸射箭；波末用材料合机关，摆上城墙' },
  { id: '1-2', story: '长龙退了，城外留下一串车辙', mode: 'defend', waves: 3, hp: 1.2, len: 16, teach: '两件一样的机关叠在一起，升一阶' },
  { id: '1-3', story: '顺着车辙找到公输家的前哨', mode: 'attack', car: 'small', waves: 3, num: 5, teach: '开小工程车往上冲，车上的机关自动打砖' },
  { id: '1-4', story: '公输家推来铁头龙撞城门', mode: 'defend', waves: 3, hp: 1.5, len: 18, boss: 'tietou', types: { shield: 0.12, powder: 0.08 } },
  { id: '1-5', story: '修城墙时，第二批长龙杀到', mode: 'defend', waves: 3, hp: 1.8, len: 20, types: { shield: 0.15, powder: 0.1 } },
  { id: '1-6', story: '斥候发现城外十里的工坊', mode: 'attack', car: 'small', waves: 3, num: 6, types: { powder: 0.1, iron: 0.12 } },
  { id: '1-7', story: '工坊的援兵来夺城', mode: 'defend', waves: 3, hp: 2.2, len: 22, types: { shield: 0.18, powder: 0.12 } },
  { id: '1-8', story: '开机关龙反攻工坊', mode: 'attack', car: 'dragon', waves: 3, num: 7, boss: 'ballista', types: { powder: 0.1, iron: 0.14 } },
  { id: '1-c1', story: '挑战「只准用火」：机关台只能放火材料', mode: 'defend', waves: 3, hp: 2, len: 22, challenge: 'onlyFire', types: { shield: 0.15, powder: 0.1 } },
  { id: '1-c2', story: '挑战「急行军」：车快一倍，砖也多一倍', mode: 'attack', car: 'small', waves: 3, num: 7, challenge: 'rush', types: { powder: 0.1, iron: 0.12 } },
];
const WAVE_SEC = [20, 25, 30, 35, 40];

// —— 局外 ——
const META = {
  slots: { name: '城墙点位', base: 2, max: 8, cost: [100, 250, 500, 900, 1500, 2500] },
  bench: { name: '机关台格数', base: 2, max: 3, cost: [800] }, // 第一版只到 3 格（还没有三合机关）
  wallHp: { name: '城墙血', base: 100, step: 10, max: 10, cost: (lv) => 60 + lv * 60 },
  cartSlots: { name: '小工程车格子', base: 2, max: 5, cost: [300, 1200, 4000] },
  dragonLen: { name: '机关龙节数', base: 4, max: 12, cost: (lv) => 400 + lv * 400 },
};
const SHENJI = [{ id: 'modou', name: '墨斗', chars: ['墨', '斗'], need: 5, desc: '开局送一件随机 1 阶机关' }];

module.exports = {
  FIELD, ELS, EL, STATS, STAT_BASE, STAT_CAP, STAT_CARD, TIER_DMG, TIER_CD, MACHINES, M, recipeOf, START_RECIPES,
  BONDS, ITEMS, IT, BUILDERS, LEVELS, WAVE_SEC, META, SHENJI,
};
