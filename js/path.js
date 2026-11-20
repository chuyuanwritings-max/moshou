// 龙走的弯路：从屏幕上方进来，一行一行往下绕，最后落到城门口。
// build() 返回 { len, at(s) }：at(s) 给出离起点 s 像素处的坐标。
const { FIELD } = require('./config.js');

const STEP = 2; // 每 2 像素存一个点

// 三种路（0.3）：snake = 边城，横着来回 → 城门；spiral = 古墓，方形回旋一圈圈往里 → 中间的墓室；
// columns = 兵马俑地宫，竖着上下穿俑坑 → 右下角的地宫闸门
function corners(kind, rows, startLeft) {
  const top = 96;
  const bottom = 524;
  const xl = 46;
  const xr = FIELD.w - 46;
  const pts = [];
  if (kind === 'spiral') {
    // 从左上进，顺着左边下来，绕一圈圈往里，最后停在墓室
    const d = 56;
    let L = xl, R = xr, T = top, B = bottom;
    pts.push([L, -60]);
    pts.push([L, B]);
    for (let k = 0; k < rows; k++) {
      pts.push([R, B]);
      pts.push([R, T]);
      L += d;
      pts.push([L, T]);
      B -= d;
      pts.push([L, B]);
      R -= d;
      T += d;
    }
    // 最后拐进墓室：走在最里一圈的两条边正中间，不贴着别的路
    const last = pts[pts.length - 1];
    const cx = (L + R + d) / 2;
    pts.push([cx, last[1]]);
    pts.push([cx, (T + B) / 2]);
    return { pts, rc: 24 };
  }
  if (kind === 'columns') {
    const cols = rows;
    const gx = (xr - xl) / (cols - 1);
    pts.push([xl, -60]);
    for (let i = 0; i < cols; i++) {
      const x = xl + gx * i;
      const down = i % 2 === 0;
      const last = i === cols - 1;
      pts.push([x, down ? top : bottom]);
      pts.push([x, down ? (last ? FIELD.gateY - 8 : bottom) : top]);
    }
    pts.splice(1, 1); // 第一列直接从上面进来
    return { pts, rc: Math.min(30, gx / 2 - 2) };
  }
  const gap = rows > 1 ? (bottom - top) / (rows - 1) : 0;
  let left = !!startLeft; // 第一行从哪边进来
  pts.push([left ? xl : xr, -60]);
  for (let i = 0; i < rows; i++) {
    const y = top + gap * i;
    const last = i === rows - 1;
    pts.push([left ? xl : xr, y]);
    pts.push([last ? FIELD.w / 2 : left ? xr : xl, y]);
    left = !left;
  }
  pts.push([FIELD.w / 2, FIELD.gateY - 8]);
  return { pts, rc: Math.min(30, gap / 2 - 2) };
}

function build(rows, startLeft, kind) {
  const cs = corners(kind || 'snake', rows, startLeft);
  const pts = cs.pts;
  // 拐角削成圆角（二次贝塞尔），然后每 STEP 像素取一个点
  const rc = cs.rc;
  const dense = [];
  const add = (x, y) => {
    const p = dense[dense.length - 1];
    if (p && Math.abs(p[0] - x) < 0.01 && Math.abs(p[1] - y) < 0.01) return;
    dense.push([x, y]);
  };
  const lineTo = (a, b) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(d));
    for (let k = 1; k <= n; k++) add(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
  };
  add(pts[0][0], pts[0][1]);
  let cur = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const a = pts[i - 1];
    const b = pts[i + 1];
    const da = Math.hypot(p[0] - a[0], p[1] - a[1]);
    const db = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const r = Math.min(rc, da / 2, db / 2);
    const p1 = [p[0] + ((a[0] - p[0]) * r) / da, p[1] + ((a[1] - p[1]) * r) / da];
    const p2 = [p[0] + ((b[0] - p[0]) * r) / db, p[1] + ((b[1] - p[1]) * r) / db];
    lineTo(cur, p1);
    for (let k = 1; k <= 24; k++) {
      const t = k / 24;
      const u = 1 - t;
      add(u * u * p1[0] + 2 * u * t * p[0] + t * t * p2[0], u * u * p1[1] + 2 * u * t * p[1] + t * t * p2[1]);
    }
    cur = p2;
  }
  lineTo(cur, pts[pts.length - 1]);

  // 按弧长重新等距取点
  const xs = [];
  const ys = [];
  let acc = 0;
  let next = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (next <= acc + d) {
      const t = d > 0 ? (next - acc) / d : 0;
      xs.push(a[0] + (b[0] - a[0]) * t);
      ys.push(a[1] + (b[1] - a[1]) * t);
      next += STEP;
    }
    acc += d;
  }
  const len = (xs.length - 1) * STEP;
  function at(s) {
    if (s <= 0) return { x: xs[0], y: ys[0] + s, a: Math.PI / 2 };
    const f = Math.min(s, len) / STEP;
    const i = Math.min(xs.length - 2, Math.floor(f));
    const t = f - i;
    const dx = xs[i + 1] - xs[i];
    const dy = ys[i + 1] - ys[i];
    return { x: xs[i] + dx * t, y: ys[i] + dy * t, a: Math.atan2(dy, dx) };
  }
  const end = { x: xs[xs.length - 1], y: ys[ys.length - 1] };
  return { len, at, corners: pts, rows, kind: kind || 'snake', goal: end };
}

module.exports = { build };
