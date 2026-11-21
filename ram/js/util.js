// 小工具：可复现的随机数、数学、画图助手。

// 同一个 seed 永远出同一串随机数：机器人复跑、以后好友挑战同一局都靠它。
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
// 贴纸「啪」地弹出：0.8 → 1.08 → 1
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// 粗描边大字（数字、按钮字）
function bigText(ctx, text, x, y, size, fill, stroke, align) {
  ctx.save();
  ctx.font = '900 ' + size + 'px "PingFang SC", "Heiti SC", sans-serif';
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = stroke || '#1a0e06';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill || '#ffd65a';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function mix(c1, c2, t) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1);
  const b = p(c2);
  const h = (v) => ('0' + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2);
  return '#' + h(lerp(a[0], b[0], t)) + h(lerp(a[1], b[1], t)) + h(lerp(a[2], b[2], t));
}

module.exports = { rng, clamp, lerp, easeOut, easeOutBack, roundRect, bigText, mix };
