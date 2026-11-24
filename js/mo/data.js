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
  { id: 'nu', rng: 90, els: ['jin', 'jin'], name: '连弩', kind: 'bolt', atk: 'shoot', dmg: 8, cd: 0.6, tip: '射最近的一节 / 往前射砖', t4: '三排齐射' },
  { id: 'teng', rng: 100, els: ['mu', 'mu'], name: '藤网', kind: 'net', atk: 'netGuard', dmg: 0, cd: 4, tip: '网住一段路，龙变慢 / 网住飞来的箭', t4: '网里每秒掉血' },
  { id: 'han', rng: 65, els: ['shui', 'shui'], name: '寒气筒', kind: 'frost', atk: 'freezeTower', dmg: 3, cd: 3, tip: '冻住前面几节 / 冻住弩塔', t4: '冻住的节挨打 +50%' },
  { id: 'pi', rng: 105, els: ['huo', 'huo'], name: '霹雳罐', kind: 'lob', atk: 'lobAhead', dmg: 20, cd: 2.5, r: 32, tip: '抛到最密处炸开 / 往前炸一片砖', t4: '落地留一摊火' },
  { id: 'chui', rng: 70, els: ['tu', 'tu'], name: '千斤锤', kind: 'hammer', atk: 'chew', dmg: 35, cd: 2.2, tip: '砸最前面一节 / 啃砖快 30%', t4: '砸出震波打一排' },
  { id: 'huolong', rng: 75, els: ['mu', 'huo'], name: '火龙车', kind: 'fireWall', atk: 'fireRow', dmg: 6, cd: 3, tip: '一道火墙横着烧 / 车前喷火墙', t4: '火墙变两道', sheng: true },
  { id: 'rongyan', rng: 130, els: ['huo', 'tu'], name: '熔岩炮', kind: 'lob', atk: 'lobAhead', dmg: 15, cd: 2.5, r: 28, pool: 5, tip: '炸开留一摊岩浆 / 撞过的地方留岩浆', t4: '岩浆不熄', sheng: true },
  { id: 'tiejia', rng: 70, els: ['tu', 'jin'], name: '铁甲锤', kind: 'hammer', atk: 'chew', dmg: 25, cd: 2, rage: true, tip: '城墙越破砸得越狠 / 车越破越狠', t4: '被打就还手一锤', sheng: true },
  { id: 'leilian', rng: 95, els: ['jin', 'shui'], name: '雷链', kind: 'chain', atk: 'chainRow', dmg: 12, cd: 1.8, jumps: 4, tip: '沿龙身往后劈 4 节 / 劈一排砖', t4: '跳 10 节', sheng: true },
  { id: 'huichun', rng: 0, els: ['shui', 'mu'], name: '回春藤', kind: 'heal', atk: 'heal', dmg: 2, cd: 1, tip: '不打，每秒补城墙 / 补车', t4: '满血时补成护盾', sheng: true },
  { id: 'huixuan', rng: 110, els: ['jin', 'mu'], name: '回旋刃', kind: 'blade', atk: 'shoot2', dmg: 18, cd: 1.5, tip: '飞出去飞回来，一路穿透，不怕盾 / 打两排', t4: '三把一起', cost: '回来时割掉藤网' },
  { id: 'muren', rng: 90, els: ['mu', 'tu'], name: '机关木人', kind: 'golem', atk: 'golem', dmg: 0, cd: 6, tip: '木人拦住龙头几秒 / 替车挨打', t4: '一次两个', cost: '木人碎了不掉材料' },
  { id: 'nizhao', rng: 85, els: ['tu', 'shui'], name: '泥沼机', kind: 'mud', atk: 'mud', dmg: 0, cd: 5, tip: '一片泥潭，陷住 2 秒 / 弩塔陷住射不了', t4: '两片泥潭', cost: '自己的车开过也变慢' },
  { id: 'zhengqi', rng: 120, els: ['shui', 'huo'], name: '蒸汽炮', kind: 'lob', atk: 'lobAhead', dmg: 60, cd: 3, r: 45, selfHurt: 1, tip: '一炮炸开一大团 / 轰开一排砖', t4: '蒸汽留在原地', cost: '每发烫掉自己 1 血' },
  { id: 'huochong', rng: 170, els: ['huo', 'jin'], name: '火铳', kind: 'bolt', atk: 'shoot', dmg: 45, cd: 1.2, critBonus: 20, overheat: 5, tip: '一枪很疼，常暴击 / 一枪打穿一块砖', t4: '不会过热', cost: '连打 5 枪过热停 2 秒' },
];
const M = {};
MACHINES.forEach((m) => (M[m.id] = m));
// 由材料找机关（顺序无关）
function recipeOf(list) {
  const key = list.slice().sort().join('+');
  return MACHINES.find((m) => m.els.slice().sort().join('+') === key) || null;
}
const START_RECIPES = ['nu', 'teng', 'han', 'pi', 'chui', 'huolong', 'rongyan', 'tiejia', 'leilian', 'huichun']; // 单一 5 + 相生 5；相克 5 在工坊开

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
  { id: 'luban', name: '鲁班尺', tier: 2, price: 50, rule: 'luban', desc: '合机关「大成功」（直接高一阶）的机会 +10%' },
  { id: 'dun', name: '盾牌', tier: 2, price: 42, rule: 'dun', desc: '每波第一次挨打不掉血' },
  { id: 'liangcang', name: '粮仓', tier: 2, price: 50, rule: 'interest', desc: '每波结束按存着的铜钱给 10% 利息（最多 15）' },
  { id: 'pofu', name: '破釜沉舟', tier: 3, price: 80, st: { dmg: 40 }, rule: 'halfHp', desc: '生命减半，伤害 +40%', two: true },
  { id: 'nilin', name: '逆鳞', tier: 4, price: 120, rule: 'nilin', desc: '城墙 / 车每掉 1% 血，伤害 +1%' },
  { id: 'yifu', name: '一夫当关', tier: 4, price: 120, rule: 'yifu', desc: '只能放 1 件机关，它伤害 ×3、攻速 +100%' },
];
const IT = {};
ITEMS.forEach((i) => (IT[i.id] = i));

// —— 机关师：24 个（全量设计第 9 节）；这一版能玩前 3 个，其余显示出来、标怎么解锁 ——
// plus / minus：给玩家看的加减；st / elDmg / gift：程序真正用的
const BUILDERS = [
  { id: 'azhu', name: '阿铸', line: '什么都会一点', good: '新手', plus: '—', minus: '—', st: {}, unlock: '默认' },
  { id: 'achui', name: '铁匠阿锤', line: '偏土、偏锤', good: '土系机关、千斤锤', plus: '含土的机关伤害 +20%；开局送一件千斤锤', minus: '含水的机关伤害 −10%', elDmg: { tu: 20, shui: -10 }, gift: 'chui', unlock: '默认' },
  { id: 'huotou', name: '火头军', line: '偏火', good: '火系机关、燃烧', plus: '含火的机关伤害 +20%；燃烧 +2', minus: '生命 −10', elDmg: { huo: 20 }, st: { burn: 2, hp: -10 }, unlock: '默认' },
  { id: 'xiaomo', name: '箭手小墨', line: '偏金、远程', good: '连弩、火铳', plus: '含金的机关伤害 +20%；射程 +30', minus: '护甲 −2', elDmg: { jin: 20 }, st: { range: 30, armor: -2 }, locked: true, unlockIf: '1-4', unlock: '通关边城 1-4' },
  { id: 'yaotong', name: '药童', line: '慢慢磨', good: '回春藤、回复', plus: '回复 +5；开局送一件回春藤', minus: '伤害 −10%', st: { regen: 5, dmg: -10 }, gift: 'huichun', locked: true, unlockIf: '1-8', unlock: '通关边城 1-8' },
  { id: 'bingniang', name: '冰娘', line: '冻住再打', good: '寒气筒、冰冻', plus: '冰冻 +10%；冻住的敌人挨打 +20%', minus: '燃烧 −50%', locked: true, unlock: '通关古墓 2-4' },
  { id: 'mogong', name: '墨工', line: '不打了，布阵', good: '换打法：布阵', plus: '阿铸不射箭；每打碎 5 节，城墙 / 车上多一座小连弩（最多 6 座）', minus: '机关台少 1 格', locked: true, change: true, unlock: '通关古墓 2-8' },
  { id: 'tiebi', name: '铁壁', line: '挨打就是输出', good: '换打法：挨打反击', plus: '生命 +50；城墙 / 车每掉 10% 血，所有机关齐射一轮', minus: '伤害 −30%', locked: true, change: true, unlock: '通关地宫 3-4' },
  { id: 'huanbing', name: '缓兵', line: '别打，拖时间', good: '换打法：拖时间', plus: '龙走到门口不扣血、只偷材料；每波结束每活着一节给 3 铜钱', minus: '机关伤害 −100%', locked: true, change: true, unlock: '通关地宫 3-8' },
  { id: 'gunu', name: '孤弩', line: '押宝一件', good: '换打法：只带一件', plus: '只能放 1 件机关，这件伤害 +100%、攻速 +200%', minus: '只能放 1 件', locked: true, change: true, unlock: '通关水寨 4-4' },
  { id: 'zajia', name: '杂家', line: '越多越好', good: '换打法：堆数量', plus: '能放的机关数 × 2', minus: '每件伤害 −40%', locked: true, change: true, unlock: '通关水寨 4-8' },
  { id: 'shangren', name: '商人', line: '会赚钱', good: '小店', plus: '商店便宜 30%、多 1 格', minus: '收获 −5', locked: true, unlock: '通关机关城 5-4' },
  { id: 'dutu', name: '赌徒', line: '每波碰运气', good: '换打法：赌', plus: '每波开打时，随机一件机关升一阶', minus: '也可能降一阶（各一半）', locked: true, change: true, unlock: '通关机关城 5-8' },
  { id: 'mujiang', name: '木匠', line: '多了要护着的东西', good: '换打法：护树', plus: '城墙边长 4 棵树，树活着每波给材料、补血', minus: '龙会先去啃树', locked: true, change: true, unlock: '通关公输城 6-4' },
  { id: 'leigong', name: '雷公', line: '什么都带电', good: '雷链、连锁', plus: '所有伤害 20% 机会变成一道雷链', minus: '不能合含木的机关', locked: true, change: true, unlock: '打败公输盘' },
  { id: 'paoshou', name: '炮手', line: '炸得开', good: '霹雳罐、爆炸', plus: '爆炸范围 +40%；霹雳类冷却 −20%', minus: '攻速 −15%', locked: true, unlock: '围城 1 档通关任一地方' },
  { id: 'taotie', name: '饕餮', line: '捡东西就是输出', good: '换打法：捡材料炸', plus: '捡材料时 30% 机会在原地炸开', minus: '收获 −30%', locked: true, change: true, unlock: '围城 1 档通关 3 个地方' },
  { id: 'shoucai', name: '守财奴', line: '存钱就是输出', good: '换打法：存钱', plus: '身上每存 50 铜钱，伤害 +5%', minus: '商店贵 20%', locked: true, change: true, unlock: '围城 2 档通关任一地方' },
  { id: 'fengzi', name: '疯子', line: '拼命', good: '暴击', plus: '暴击 +20%、暴伤 +50%', minus: '每次暴击扣自己 1 血', locked: true, change: true, unlock: '围城 2 档通关 3 个地方' },
  { id: 'laobing', name: '老兵', line: '越打越强', good: '换打法：长局', plus: '每过一波，所有属性 +2%', minus: '第一波伤害 −30%', locked: true, change: true, unlock: '围城 3 档通关任一地方' },
  { id: 'qiaoshou', name: '巧手', line: '合得多', good: '机关台', plus: '合机关时 20% 机会多合出一件', minus: '生命 −15', locked: true, unlock: '围城 3 档通关 3 个地方' },
  { id: 'pantu', name: '公输叛徒', line: '用敌人的东西', good: '换打法：万能材料', plus: '敌人掉的「公输零件」能当万能材料用', minus: '生命 −30%', locked: true, change: true, unlock: '围城 4 档通关任一地方' },
  { id: 'mozi', name: '墨子', line: '五行大师', good: '羁绊', plus: '五行羁绊从 1 件起算（门槛全降 1）', minus: '机关台少 1 格', locked: true, change: true, unlock: '围城 5 档打败公输盘' },
  { id: 'gongshu', name: '公输盘', line: '对手也能玩', good: '进攻', plus: '进攻：车格 × 2；守城：敌人走得慢 20%', minus: '守城时城墙点位少 2 个', locked: true, change: true, unlock: '围城 6 档打败公输盘' },
];

// —— 边城 8 关 + 2 挑战 ——
// mode：defend / attack；car：small / dragon；waves：几波；boss：铁头龙 / 巨弩城楼
const LEVELS = [
  { id: '1-1', story: '公输家的机关长龙来攻边城', mode: 'defend', waves: 5, hp: 1, len: 14, teach: '龙掉的材料飞进下面；能合的点一下就合，再拖到路边亮着的点位' },
  { id: '1-2', story: '长龙退了，城外留下一串车辙', mode: 'defend', waves: 5, hp: 1.4, len: 16, teach: '两件一样的机关叠在一起，升一阶' },
  { id: '1-3', story: '顺着车辙找到公输家的前哨', mode: 'attack', car: 'small', waves: 4, num: 5, teach: '车自己往上冲；砖掉的材料在下面合，合好拖到车上的格子' },
  { id: '1-4', story: '公输家推来铁头龙撞城门', mode: 'defend', waves: 6, hp: 2.0, len: 18, boss: 'tietou', types: { shield: 0.12, powder: 0.08 } },
  { id: '1-5', story: '修城墙时，第二批长龙杀到', mode: 'defend', waves: 6, hp: 3.0, len: 20, types: { shield: 0.15, powder: 0.1 } },
  { id: '1-6', story: '斥候发现城外十里的工坊', mode: 'attack', car: 'small', waves: 4, num: 5, types: { powder: 0.1, iron: 0.12 } },
  { id: '1-7', story: '工坊的援兵来夺城', mode: 'defend', waves: 7, hp: 4.2, len: 22, types: { shield: 0.18, powder: 0.12 } },
  { id: '1-8', story: '开机关龙反攻工坊', mode: 'attack', car: 'dragon', waves: 5, num: 7, boss: 'ballista', types: { powder: 0.1, iron: 0.14 } },
  { id: '1-c1', story: '挑战「只准用火」：机关台只能放火材料', mode: 'defend', waves: 6, hp: 3.6, len: 22, challenge: 'onlyFire', types: { shield: 0.15, powder: 0.1 } },
  { id: '1-c2', story: '挑战「急行军」：车快一倍，砖也多一倍', mode: 'attack', car: 'small', waves: 4, num: 7, challenge: 'rush', types: { powder: 0.1, iron: 0.12 } },
];
const WAVE_SEC = [32, 36, 40, 45, 45, 45, 45, 45];

// —— 局外 ——
const META = {
  slots: { name: '守城点位', base: 3, max: 8, cost: [150, 400, 800, 1400, 2200] },
  bench: { name: '机关台格数', base: 2, max: 3, cost: [800] }, // 第一版只到 3 格（还没有三合机关）
  wallHp: { name: '城墙血', base: 150, step: 15, max: 10, cost: (lv) => 60 + lv * 60 },
  cartSlots: { name: '小工程车格子', base: 2, max: 5, cost: [300, 1200, 4000] },
  dragonLen: { name: '机关龙节数', base: 4, max: 12, cost: (lv) => 400 + lv * 400 },
};
const SHENJI = [{ id: 'modou', name: '墨斗', chars: ['墨', '斗'], need: 5, desc: '开局送一件随机 1 阶机关' }];

module.exports = {
  FIELD, ELS, EL, STATS, STAT_BASE, STAT_CAP, STAT_CARD, TIER_DMG, TIER_CD, MACHINES, M, recipeOf, START_RECIPES,
  BONDS, ITEMS, IT, BUILDERS, LEVELS, WAVE_SEC, META, SHENJI,
};
