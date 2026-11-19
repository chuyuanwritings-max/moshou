// 音效：全部用代码合成（不用音频文件），微信和浏览器都用 WebAudio 播放。
// make(name, sr) 返回一串 -1..1 的采样。大事件的声音比小事件的大、长。

function env(t, a, d) {
  return t < a ? t / a : Math.exp(-(t - a) / d);
}
function noise(seed) {
  let s = seed || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
}
const sq = (f, t) => Math.sign(Math.sin(2 * Math.PI * f * t));
const sin = (f, t) => Math.sin(2 * Math.PI * f * t);

const RECIPES = {
  // 放箭：很轻的「嗖」（一秒好几下，所以要小）
  shoot: { len: 0.05, f: (t, n) => n() * env(t, 0.001, 0.012) * 0.25 + sin(1800 - 9000 * t, t) * env(t, 0.001, 0.015) * 0.12 },
  // 打中：叮
  hit: { len: 0.06, f: (t) => sq(1250, t) * env(t, 0.001, 0.018) * 0.12 },
  // 会心：更亮的叮
  crit: { len: 0.14, f: (t) => (sin(2400, t) + sin(3600, t) * 0.5) * env(t, 0.001, 0.05) * 0.3 },
  // 打碎一节：咔嚓 + 一点铜的余音
  break: { len: 0.25, f: (t, n) => n() * env(t, 0.001, 0.04) * 0.55 + sin(520, t) * env(t, 0.002, 0.07) * 0.3 + sin(1310, t) * env(t, 0.002, 0.05) * 0.15 },
  // 炸开
  blast: { len: 0.35, f: (t, n) => n() * env(t, 0.002, 0.09) * 0.6 + sin(90 - 60 * t, t) * env(t, 0.002, 0.12) * 0.5 },
  // 开机关匣：齿轮上弦「咔咔咔」+ 叮
  chest: { len: 0.7, f: (t, n) => (t < 0.36 ? n() * env(t % 0.09, 0.001, 0.012) * 0.6 : 0) + (t > 0.36 ? (sin(1568, t) + sin(2093, t) * 0.6) * env(t - 0.36, 0.003, 0.12) * 0.35 : 0) },
  // 选卡：叮咚
  pick: { len: 0.25, f: (t) => sin(t < 0.08 ? 880 : 1320, t) * env(t < 0.08 ? t : t - 0.08, 0.002, 0.06) * 0.4 },
  // 连碎：一串往上的音
  combo: { len: 0.42, f: (t) => { const i = Math.min(4, Math.floor(t / 0.07)); return sq([660, 880, 1046, 1318, 1760][i], t) * env(t - i * 0.07, 0.002, 0.05) * 0.18; } },
  // 金币
  coin: { len: 0.2, f: (t) => sq(t < 0.06 ? 1320 : 1760, t) * env(t < 0.06 ? t : t - 0.06, 0.002, 0.05) * 0.18 },
  // 龙快到城门：咚咚心跳
  heart: { len: 0.4, f: (t) => { const k = t < 0.18 ? t : t - 0.18; return sin(55, k) * env(k, 0.01, 0.05) * (t < 0.18 ? 1 : 0.7); } },
  // 拉总闸亮起：两声警报
  alarm: { len: 0.5, f: (t) => sq(t % 0.25 < 0.12 ? 740 : 0.0001, t) * env(t % 0.25, 0.005, 0.1) * 0.25 },
  // 拉总闸：一排炮齐射
  salvo: { len: 1.1, f: (t, n) => { let v = 0; for (let k = 0; k < 5; k++) { const tt = t - k * 0.12; if (tt > 0) v += (n() * 0.6 + sin(70, tt)) * env(tt, 0.002, 0.12) * 0.45; } return v; } },
  // 赢：汽笛长鸣 + 大爆
  win: { len: 1.4, f: (t, n) => (sin(587, t) * 0.5 + sin(880, t) * 0.4 + sin(1174, t) * 0.2) * (t < 0.9 ? Math.min(1, t * 8) * 0.5 : env(t - 0.9, 0.001, 0.15) * 0.5) + (t > 0.9 ? n() * env(t - 0.9, 0.002, 0.18) * 0.7 : 0) },
  // 输：城门一声闷响 + 往下掉的音
  lose: { len: 0.9, f: (t, n) => n() * env(t, 0.002, 0.08) * 0.5 + sin(60, t) * env(t, 0.002, 0.25) * 0.7 + sin(330 - 200 * t, t) * env(t, 0.05, 0.3) * 0.25 },
  // 重箭打中：更闷更厚的「咚」（武器升级以后换这个）
  hitHeavy: { len: 0.09, f: (t, n) => sin(300 - 1500 * t, t) * env(t, 0.001, 0.03) * 0.35 + n() * env(t, 0.001, 0.008) * 0.25 },
  // 攻城槌碎了：大的「哐」
  ram: { len: 0.6, f: (t, n) => n() * env(t, 0.002, 0.1) * 0.7 + sin(70, t) * env(t, 0.002, 0.25) * 0.7 + sin(220, t) * env(t, 0.002, 0.15) * 0.3 },
  // 铜雀：出发「啾」、啄「笃笃」
  chirp: { len: 0.16, f: (t) => sin(2600 + 1800 * Math.sin(t * 60), t) * env(t, 0.005, 0.05) * 0.25 },
  peck: { len: 0.05, f: (t, n) => (sq(1900, t) * 0.5 + n() * 0.5) * env(t, 0.001, 0.012) * 0.3 },
  // 木犬：出发「汪」、咬「咔嚓」
  bark: { len: 0.16, f: (t) => sq(260 + 200 * Math.exp(-t * 30), t) * env(t, 0.004, 0.05) * 0.3 },
  bite: { len: 0.3, f: (t, n) => n() * env(t, 0.001, 0.03) * 0.6 + sin(140 - 120 * t, t) * env(t, 0.002, 0.1) * 0.6 },
  // 蒸汽龟：放炮「嘭」、落地大爆、蒸汽「嘶」
  mortar: { len: 0.25, f: (t, n) => sin(110 - 200 * t, t) * env(t, 0.002, 0.06) * 0.6 + n() * env(t, 0.001, 0.02) * 0.3 },
  boom: { len: 0.8, f: (t, n) => n() * env(t, 0.002, 0.14) * 0.75 + sin(55 - 30 * t, t) * env(t, 0.002, 0.3) * 0.8 + n() * env(Math.max(0, t - 0.25), 0.05, 0.25) * (t > 0.25 ? 0.15 : 0) },
  // 弩机升级（结算页）：上弦三下 + 一声亮的大「锵」
  upgradeBig: { len: 0.9, f: (t, n) => (t < 0.36 ? n() * env(t % 0.12, 0.001, 0.015) * 0.5 : 0) + (t > 0.36 ? (sin(784, t) + sin(1175, t) * 0.7 + sin(1568, t) * 0.5) * env(t - 0.36, 0.003, 0.18) * 0.32 : 0) },
  // 按钮
  tap: { len: 0.06, f: (t) => sq(980, t) * env(t, 0.001, 0.02) * 0.2 },
  // 升级弩机：上弦 + 叮
  upgrade: { len: 0.45, f: (t, n) => (t < 0.2 ? n() * env(t % 0.05, 0.001, 0.01) * 0.4 : 0) + sin(t < 0.3 ? 1046 : 1568, t) * env(Math.max(0, t - 0.2), 0.003, 0.08) * (t > 0.2 ? 0.35 : 0) },
};

function make(name, sr) {
  const r = RECIPES[name];
  if (!r) return null;
  const n = Math.floor(r.len * sr);
  const out = new Float32Array(n);
  const rnd = noise(name.length * 7919);
  for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, r.f(i / sr, rnd)));
  return out;
}

module.exports = { make, NAMES: Object.keys(RECIPES) };
