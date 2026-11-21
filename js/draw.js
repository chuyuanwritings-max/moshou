// 画面：全部用代码画（8 比特 + 赛璐璐：一档硬阴影、深色描边）。不用任何图片素材。
// 配色：夜里的机关城——深褐紫天、黄铜、朱漆、暖灯。
const C = require('./config.js');
const { clamp, roundRect, bigText, mix } = require('./util.js');

const P = {
  sky0: '#120c18', sky1: '#2b1a20', far: '#22162a', far2: '#2e1f30', win: '#ffb347',
  stone: '#4a3a34', stoneHi: '#64514a', stoneLo: '#2c221e', mortar: '#241a17',
  groove: '#1a110e', grooveIn: '#2a1c17', tie: '#3d2b22', rail: '#a8742c', railHi: '#e3ad4f',
  brass: '#c98a2b', brassHi: '#f6c75c', brassLo: '#80491a', line: '#1e1108',
  lac: '#b8302a', lacHi: '#e65a4b', lacLo: '#6e1814', gold: '#ffd65a',
  steam: '#efe6dc', red: '#ff3b2f', walk: '#3a2d28', walkLo: '#2a201c',
};

// —— 小工具 ——
function pix(ctx, rows, pal, x, y, u) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const col = pal[row[c]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + c * u, y + r * u, u + 0.05, u + 0.05);
    }
  }
}

// —— 阿铸（背影，扛着蒸汽连弩往上打）——
const AZHU = [
  '......LLLL......',
  '.....LKKKKL.....',
  '....LKKHKKKL....',
  '...LKKKKKKKKL...',
  '...LKKKKKKHKL...',
  '...LRRRRRRRRL...',
  '...LKKKKKKKKLRR.',
  '....LKKKKKKL..R.',
  '..LLLsSSSSsLLL..',
  '.LSSVVVSSVVVSSL.',
  'LSSSSVVVVVVSSSSL',
  'LSSsVvVVVVvVsSSL',
  'LSSsVVvVVvVVsSSL',
  'LSSLVVVvvVVVLSSL',
  '.LSLVVVVVVVVLSL.',
  '.LSLBBBbbBBBLSL.',
  '..L.LPPPPPPL.L..',
  '...LPPPpPPPPL...',
  '...LPPPLLPPPL...',
  '...LOOOL.LOOOL..',
  '...LLLL...LLLL..',
];
const AZHU_PAL = {
  L: P.line, K: '#1a1214', H: '#3d2e38', R: '#d0352b', S: '#d99a6c', s: '#a8683f',
  V: '#6b3f22', v: '#45280f', B: '#2a1a10', b: P.brassHi, P: '#3a3346', p: '#262033', O: '#1e1410',
};

function drawCrossbow(ctx, x, y, recoil, t, lv) {
  lv = lv || 0;
  // 弩身（竖着朝上）
  const yy = y - recoil * 4;
  const arm = 17 + Math.min(5, lv) * 1.2; // 升级：弓臂越来越长
  // 5 级以上：炉心发红光
  if (lv >= 5) {
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 8);
    ctx.fillStyle = lv >= 8 ? '#ff5a3a' : '#ffb347';
    ctx.beginPath();
    ctx.arc(x, yy - 16, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 3 级以上：两边多挂两个蒸汽罐
  if (lv >= 3) {
    for (const d of [-1, 1]) {
      ctx.fillStyle = P.line;
      roundRect(ctx, x + d * 11 - 4, yy - 14, 8, 11, 2);
      ctx.fill();
      ctx.fillStyle = lv >= 6 ? P.gold : P.brassLo;
      ctx.fillRect(x + d * 11 - 2.5, yy - 12.5, 5, 8);
    }
  }
  ctx.fillStyle = P.line;
  ctx.fillRect(x - 4, yy - 30, 8, 30);
  ctx.fillStyle = P.brass;
  ctx.fillRect(x - 2.5, yy - 29, 5, 28);
  ctx.fillStyle = P.brassHi;
  ctx.fillRect(x - 2.5, yy - 29, 2, 28);
  // 蒸汽罐
  ctx.fillStyle = P.line;
  roundRect(ctx, x - 7, yy - 18, 14, 12, 3);
  ctx.fill();
  ctx.fillStyle = P.lac;
  ctx.fillRect(x - 5.5, yy - 16.5, 11, 9);
  ctx.fillStyle = P.lacHi;
  ctx.fillRect(x - 5.5, yy - 16.5, 11, 2.5);
  ctx.fillStyle = P.gold;
  ctx.fillRect(x - 5.5, yy - 12.5, 11, 1.5);
  // 弓臂（弯）
  ctx.strokeStyle = P.line;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - arm, yy - 22);
  ctx.quadraticCurveTo(x, yy - 34 + recoil * 2, x + arm, yy - 22);
  ctx.stroke();
  ctx.strokeStyle = lv >= 6 ? '#fff2b0' : lv >= 1 ? P.gold : P.brassHi;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  // 弦
  ctx.strokeStyle = '#efe0c0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - arm + 1, yy - 22);
  ctx.lineTo(x, yy - 20 + recoil * 3);
  ctx.lineTo(x + arm - 1, yy - 22);
  ctx.stroke();
  // 箭头那点亮光
  ctx.fillStyle = '#fff2b0';
  ctx.fillRect(x - 1.5, yy - 34, 3, 4);
  // 刚放完箭：枪口一团火光
  if (recoil > 0.55) {
    const k = (recoil - 0.55) / 0.45;
    ctx.globalAlpha = k;
    ctx.fillStyle = '#fff2b0';
    star(ctx, x, yy - 36, 7 + lv * 0.6, 3, 6);
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(ctx, x, y, t, recoil, moving, lv) {
  const bob = moving ? Math.sin(t * 22) * 1.2 : Math.sin(t * 3) * 0.6;
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.save();
  ctx.translate(x, y + 26);
  ctx.scale(1, 0.28);
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const u = 3;
  pix(ctx, AZHU, AZHU_PAL, x - 8 * u, y - 30 + bob, u);
  drawCrossbow(ctx, x, y - 26 + bob, recoil, t, lv);
}

// —— 机关伙伴（8 比特小图，跟在阿铸身边；收藏要好看）——
const BUDDY_PIX = {
  que: [
    '.......LLL....',
    '......LhBBL...',
    '......LBEBYL..',
    '......LBBBYYL.',
    '.LL..LBBBBL...',
    'LhhLLBBBBBBL..',
    'LhhhhBBBBBBBL.',
    '.LhhhBBBBBBBL.',
    '..LLLdBBBBddL.',
    'LLdddLddddLL..',
    '..LLL.LL.LL...',
  ],
  quan: [
    '...........LL...',
    '..........LhwL..',
    '..L.......LwwwLL',
    '.LwL.....LwwEwwL',
    '.LwL.....LwwwwnL',
    '..LwLLLLLLwwwLL.',
    '...LwwwwwwwwwL..',
    '...LwhhhhhhwwL..',
    '...LwwwbwwwwwL..',
    '...LwL.LwL.LwL..',
    '...LLL.LLL.LLL..',
  ],
  gui: [
    '.....LL.........',
    '....LhcL........',
    '....LhcL........',
    '...LLccLLL......',
    '..LgGgGgGgL.....',
    '.LgGgggGgggL.LL.',
    'LggggggggggLLssL',
    'LddddddddddddsEL',
    '.LsLLLLLLLsL.LL.',
    '.LLL.....LLL....',
  ],
};
const BUDDY_PAL = {
  que: { L: P.line, B: P.brass, h: P.brassHi, d: P.brassLo, E: P.red, Y: P.gold },
  quan: { L: P.line, w: '#a0682f', h: '#d0955a', n: P.line, E: P.line, b: P.brassHi },
  gui: { L: P.line, g: '#5f8a4a', G: '#8cc06a', d: '#3e5e30', s: '#d9b28a', E: P.line, c: P.brass, h: P.brassHi },
};

function drawBuddy(ctx, id, x, y, t, s, flip) {
  const map = BUDDY_PIX[id];
  if (!map) return;
  const u = 2 * (s || 1);
  const w = map[0].length * u;
  const h = map.length * u;
  let bob = 0;
  if (id === 'que') bob = Math.sin(t * 9) * 2 * (s || 1);
  else if (id === 'quan') bob = Math.abs(Math.sin(t * 8)) * -1.5 * (s || 1);
  if (flip) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    pix(ctx, map, BUDDY_PAL[id], -w / 2, y - h / 2 + bob, u);
    ctx.restore();
  } else pix(ctx, map, BUDDY_PAL[id], x - w / 2, y - h / 2 + bob, u);
  if (id === 'gui' && Math.sin(t * 4) > 0.2) {
    ctx.fillStyle = 'rgba(239,230,220,0.75)';
    ctx.beginPath();
    ctx.arc(x - w / 2 + 5.5 * u, y - h / 2 - 2 * u - (t * 10) % 6, 2.2 * u, 0, Math.PI * 2);
    ctx.fill();
  }
}

// —— 技能图标（8 比特）——
function drawIcon(ctx, id, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  const L = P.line;
  const bolt = (dx, dy, ang, col) => {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(ang);
    ctx.fillStyle = L;
    ctx.fillRect(-2, -10, 4, 18);
    ctx.fillStyle = col || P.brassHi;
    ctx.fillRect(-1, -9, 2, 16);
    ctx.fillStyle = '#fff2b0';
    ctx.fillRect(-2, -12, 4, 4);
    ctx.restore();
  };
  if (id === 'multi') {
    bolt(-7, 0, -0.35);
    bolt(0, -2, 0);
    bolt(7, 0, 0.35);
  } else if (id === 'rate') {
    bolt(-4, 2, 0);
    bolt(4, -3, 0);
    ctx.fillStyle = '#ff8a3d';
    ctx.fillRect(-10, 8, 4, 2);
    ctx.fillRect(-2, 4, 4, 2);
    ctx.fillRect(6, 9, 4, 2);
  } else if (id === 'power') {
    ctx.fillStyle = L;
    ctx.fillRect(-4, -11, 8, 22);
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(-2.5, -9, 5, 18);
    ctx.fillStyle = '#fff2b0';
    ctx.fillRect(-4, -12, 8, 5);
  } else if (id === 'pierce') {
    ctx.fillStyle = L;
    ctx.fillRect(-10, -3, 20, 6);
    ctx.fillStyle = '#8fe3ff';
    ctx.fillRect(-9, -2, 18, 4);
    ctx.strokeStyle = L;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-3, 0, 6, 0, Math.PI * 2);
    ctx.arc(5, 0, 6, 0, Math.PI * 2);
    ctx.stroke();
  } else if (id === 'bounce') {
    ctx.strokeStyle = L;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-9, 10);
    ctx.lineTo(7, -8);
    ctx.lineTo(-2, -11);
    ctx.stroke();
    ctx.strokeStyle = '#7dff9a';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = L;
    ctx.fillRect(8, -12, 3, 24);
  } else if (id === 'blast') {
    ctx.fillStyle = L;
    star(ctx, 0, 0, 12, 6, 8);
    ctx.fillStyle = '#ffa0d8';
    star(ctx, 0, 0, 9, 4.5, 8);
    ctx.fillStyle = '#fff2b0';
    ctx.fillRect(-2, -2, 4, 4);
  } else if (id === 'frost') {
    ctx.strokeStyle = L;
    ctx.lineWidth = 5;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const a = (k * Math.PI) / 3;
      ctx.moveTo(Math.cos(a) * -10, Math.sin(a) * -10);
      ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
      ctx.stroke();
    }
    ctx.strokeStyle = '#b9c8ff';
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const a = (k * Math.PI) / 3;
      ctx.moveTo(Math.cos(a) * -9, Math.sin(a) * -9);
      ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
      ctx.stroke();
    }
  } else if (id === 'crit') {
    ctx.fillStyle = L;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff27a';
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = L;
    ctx.fillRect(-1.5, -8, 3, 16);
    ctx.fillRect(-8, -1.5, 16, 3);
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(-2.5, -2.5, 5, 5);
  }
  ctx.restore();
}

function star(ctx, x, y, ro, ri, n) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = (Math.PI * i) / n - Math.PI / 2;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

// —— 背景 + 路 + 城墙（每关画一次，存进离屏画布）——
function drawBackground(ctx, path, levelIndex) {
  const F = C.FIELD;
  const g = ctx.createLinearGradient(0, 0, 0, F.h);
  g.addColorStop(0, P.sky0);
  g.addColorStop(1, P.sky1);
  ctx.fillStyle = g;
  ctx.fillRect(-200, -200, F.w + 400, F.h + 400);

  // 远处的机关城：塔楼剪影 + 暖色窗 + 大齿轮
  let seed = 7 + levelIndex * 13;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = P.far;
  for (let k = 0; k < 7; k++) {
    const x = k * 58 - 10 + r() * 20;
    const h = 120 + r() * 220;
    const w = 34 + r() * 18;
    const top = F.h - 140 - h;
    ctx.fillRect(x, top, w, h + 200);
    // 飞檐（几层）
    for (let lv = 0; lv < 4; lv++) {
      const yy = top + lv * 34;
      ctx.beginPath();
      ctx.moveTo(x - 10, yy + 6);
      ctx.lineTo(x + w / 2, yy - 8);
      ctx.lineTo(x + w + 10, yy + 6);
      ctx.lineTo(x + w + 4, yy + 9);
      ctx.lineTo(x - 4, yy + 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = P.far;
  }
  // 大齿轮（很暗）
  ctx.strokeStyle = P.far2;
  ctx.lineWidth = 6;
  for (const [gx, gy, gr] of [[300, 120, 60], [40, 330, 44], [320, 470, 36]]) {
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      ctx.save();
      ctx.translate(gx + Math.cos(a) * gr, gy + Math.sin(a) * gr);
      ctx.rotate(a);
      ctx.fillStyle = P.far2;
      ctx.fillRect(-4, -5, 10, 10);
      ctx.restore();
    }
  }

  // 路：深槽 + 枕木 + 两条铜轨
  const len = path.len;
  const strokePath = (w, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let s = 0; s <= len; s += 4) {
      const p = path.at(s);
      if (s === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  };
  strokePath(42, P.line);
  strokePath(37, P.groove);
  strokePath(30, P.grooveIn);
  for (let s = 0; s <= len; s += 14) {
    const p = path.at(s);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.fillStyle = P.tie;
    ctx.fillRect(-2.5, -14, 5, 28);
    ctx.restore();
  }
  for (const off of [-11, 11]) {
    ctx.fillStyle = P.rail;
    for (let s = 0; s <= len; s += 2) {
      const p = path.at(s);
      const nx = -Math.sin(p.a) * off;
      const ny = Math.cos(p.a) * off;
      ctx.fillRect(p.x + nx - 1.2, p.y + ny - 1.2, 2.4, 2.4);
    }
  }
  // 路上每隔一段一颗铜钉（像刻度，看得出离城门还有多远）
  for (let s = len - C.DRAGON.gap * 4; s > 0; s -= C.DRAGON.gap * 5) {
    const p = path.at(s);
    ctx.fillStyle = P.line;
    ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    ctx.fillStyle = P.railHi;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  // 最后四节：路面发红（危险区）
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#7a1a14';
  ctx.lineWidth = 30;
  ctx.beginPath();
  for (let s = len - C.DRAGON.gap * 4; s <= len; s += 4) {
    const p = path.at(s);
    if (s === len - C.DRAGON.gap * 4) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 城墙
  const wy = F.gateY - 10;
  ctx.fillStyle = P.line;
  ctx.fillRect(0, wy - 2, F.w, 52);
  ctx.fillStyle = P.stone;
  ctx.fillRect(0, wy, F.w, 48);
  ctx.fillStyle = P.stoneHi;
  ctx.fillRect(0, wy, F.w, 4);
  ctx.fillStyle = P.mortar;
  for (let row = 0; row < 4; row++) {
    const yy = wy + 8 + row * 10;
    ctx.fillRect(0, yy, F.w, 1.5);
    for (let x = (row % 2) * 12; x < F.w; x += 24) ctx.fillRect(x, yy - 10, 1.5, 10);
  }
  // 垛口
  for (let x = 4; x < F.w; x += 30) {
    if (Math.abs(x + 9 - F.w / 2) < 40) continue;
    ctx.fillStyle = P.line;
    ctx.fillRect(x - 1, wy - 15, 20, 15);
    ctx.fillStyle = P.stone;
    ctx.fillRect(x, wy - 14, 18, 14);
    ctx.fillStyle = P.stoneHi;
    ctx.fillRect(x, wy - 14, 18, 3);
  }
  // 城门
  const gx = F.w / 2;
  ctx.fillStyle = P.line;
  roundRect(ctx, gx - 30, wy - 26, 60, 76, 26);
  ctx.fill();
  ctx.fillStyle = P.brassLo;
  roundRect(ctx, gx - 27, wy - 23, 54, 73, 23);
  ctx.fill();
  ctx.fillStyle = '#0c0706';
  roundRect(ctx, gx - 20, wy - 16, 40, 66, 18);
  ctx.fill();
  ctx.fillStyle = P.brassHi;
  for (let k = 0; k < 5; k++) ctx.fillRect(gx - 25, wy - 10 + k * 12, 3, 3), ctx.fillRect(gx + 22, wy - 10 + k * 12, 3, 3);
  // 城门上的灯
  for (const lx of [gx - 44, gx + 44]) {
    ctx.fillStyle = P.line;
    ctx.fillRect(lx - 6, wy - 34, 12, 16);
    ctx.fillStyle = '#ff9a3c';
    ctx.fillRect(lx - 4, wy - 32, 8, 12);
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(lx - 2, wy - 30, 4, 5);
  }

  // 城墙后的走道（阿铸在这儿左右走）
  ctx.fillStyle = P.walk;
  ctx.fillRect(0, wy + 48, F.w, F.h - wy);
  ctx.fillStyle = P.walkLo;
  for (let x = 0; x < F.w; x += 40) ctx.fillRect(x, wy + 48, 1.5, F.h);
  ctx.fillRect(0, wy + 80, F.w, 1.5);
  ctx.fillRect(0, wy + 112, F.w, 1.5);
}

// —— 龙 ——
function fmtHp(v) {
  v = Math.ceil(v);
  if (v >= 10000) return Math.round(v / 1000) + 'k';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
  return '' + v;
}

function drawSeg(ctx, g, t, isTail) {
  const R = C.DRAGON.r;
  const wob = Math.sin(t * 6 + g.id * 0.9) * 0.8;
  const pop = 1 + Math.max(0, g.flash) * 2.2; // 打中那一下鼓一下
  ctx.save();
  ctx.translate(g.x, g.y + wob);
  ctx.scale(pop, pop);
  if (g.chest) {
    // 机关匣：朱漆方匣 + 金箍 + 齿轮
    ctx.rotate(g.a || 0);
    ctx.fillStyle = P.line;
    roundRect(ctx, -R - 2, -R - 2, 2 * R + 4, 2 * R + 4, 6);
    ctx.fill();
    ctx.fillStyle = P.lac;
    roundRect(ctx, -R, -R, 2 * R, 2 * R, 5);
    ctx.fill();
    ctx.fillStyle = P.lacLo;
    ctx.fillRect(-R, R - 7, 2 * R, 7);
    ctx.fillStyle = P.lacHi;
    ctx.fillRect(-R + 3, -R + 2, 2 * R - 6, 3);
    ctx.fillStyle = P.gold;
    ctx.fillRect(-R, -2, 2 * R, 4);
    ctx.fillRect(-2, -R, 4, 2 * R);
    const glow = 0.5 + 0.5 * Math.sin(t * 8 + g.id);
    ctx.fillStyle = mix('#ffd65a', '#fff7d0', glow);
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (g.ram) {
    // 攻城槌（龙尾最后一节，三倍血）：铁色、更大、往后一根尖刺
    ctx.rotate((g.a || 0) + Math.PI);
    ctx.fillStyle = P.line;
    ctx.beginPath();
    ctx.moveTo(R + 1, -9);
    ctx.lineTo(R + 20, 0);
    ctx.lineTo(R + 1, 9);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, R + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b7080';
    ctx.beginPath();
    ctx.arc(0, 0, R + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3c3f4a';
    ctx.beginPath();
    ctx.arc(-4, 5, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b7080';
    ctx.beginPath();
    ctx.arc(1, -1, R - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a9afbf';
    ctx.fillRect(-7, -R + 3, 9, 3);
    ctx.fillStyle = '#9aa0b0';
    ctx.beginPath();
    ctx.moveTo(R + 2, -5);
    ctx.lineTo(R + 15, 0);
    ctx.lineTo(R + 2, 5);
    ctx.fill();
    ctx.fillStyle = P.red;
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  } else {
    ctx.fillStyle = P.line;
    ctx.beginPath();
    ctx.arc(0, 0, R + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.brass;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    // 硬阴影（右下）
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = P.brassLo;
    ctx.beginPath();
    ctx.arc(5, 6, R, 0, Math.PI * 2);
    ctx.rect(-40, -40, 80, 80);
    ctx.fill('evenodd');
    ctx.restore();
    ctx.fillStyle = P.brassHi;
    ctx.fillRect(-R + 5, -R + 5, 7, 3);
    ctx.fillRect(-R + 4, -R + 8, 3, 4);
    // 铆钉，跟着走的方向转
    ctx.fillStyle = P.line;
    for (let k = 0; k < 4; k++) {
      const a = (g.a || 0) + (k * Math.PI) / 2 + Math.PI / 4;
      ctx.fillRect(Math.cos(a) * (R - 3) - 1.5, Math.sin(a) * (R - 3) - 1.5, 3, 3);
    }
    if (isTail) {
      ctx.rotate((g.a || 0) + Math.PI);
      ctx.fillStyle = P.line;
      ctx.beginPath();
      ctx.moveTo(R - 2, -7);
      ctx.lineTo(R + 13, 0);
      ctx.lineTo(R - 2, 7);
      ctx.fill();
      ctx.fillStyle = P.brassLo;
      ctx.beginPath();
      ctx.moveTo(R - 1, -4);
      ctx.lineTo(R + 9, 0);
      ctx.lineTo(R - 1, 4);
      ctx.fill();
    }
    ctx.restore();
  }
  if (g.flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(g.x, g.y + wob, R + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  // 血（数字）
  ctx.save();
  ctx.font = '900 11px "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = P.line;
  const txt = fmtHp(g.hp);
  ctx.strokeText(txt, g.x, g.y + wob + 0.5);
  ctx.fillStyle = '#fffaf0';
  ctx.fillText(txt, g.x, g.y + wob + 0.5);
  ctx.restore();
}

function drawHead(ctx, g, t, danger) {
  // 龙头：在最前面那节前方，朝走的方向
  const a = g.a || 0;
  const R = C.DRAGON.r;
  const hx = g.x + Math.cos(a) * (R + 9);
  const hy = g.y + Math.sin(a) * (R + 9);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(a);
  const flip = Math.cos(a) < -0.1 ? -1 : 1;
  ctx.scale(1, flip);
  const jaw = Math.sin(t * 7) > 0.6 ? 3 : 0;
  ctx.fillStyle = P.line;
  ctx.fillRect(-12, -12, 26, 20);
  ctx.fillRect(10, -8, 10, 12 + jaw);
  ctx.fillRect(-14, -18, 6, 8);
  ctx.fillRect(-6, -20, 6, 9);
  ctx.fillStyle = P.brass;
  ctx.fillRect(-10, -10, 22, 16);
  ctx.fillRect(10, -6, 8, 6);
  ctx.fillStyle = P.brassLo;
  ctx.fillRect(-10, 2, 22, 4);
  ctx.fillRect(10, 2 + jaw, 8, 3);
  ctx.fillStyle = P.brassHi;
  ctx.fillRect(-8, -10, 14, 3);
  ctx.fillStyle = P.brassLo;
  ctx.fillRect(-13, -17, 4, 6);
  ctx.fillRect(-5, -19, 4, 7);
  // 眼睛
  ctx.fillStyle = danger > 0 ? '#ffffff' : P.red;
  ctx.fillRect(2, -7, 5, 4);
  ctx.fillStyle = '#ffd0a0';
  ctx.fillRect(4, -7, 2, 2);
  // 牙
  ctx.fillStyle = '#f4ead8';
  ctx.fillRect(12, 0, 2, 3);
  ctx.fillRect(16, 0, 2, 3);
  ctx.restore();
}

function drawDragon(ctx, st, t) {
  const segs = st.segs;
  for (let i = segs.length - 1; i >= 0; i--) {
    const g = segs[i];
    if (g.y < -30) continue;
    drawSeg(ctx, g, t, i === segs.length - 1 && segs.length > 1);
  }
  if (segs.length && segs[0].y > -30) drawHead(ctx, segs[0], t, st.danger);
}

// 箭的样子跟着武器「多重」变：黄铜 → 银蓝 → 金光 → 红热带火尾
const BOLT = [
  { core: P.brassHi, tip: '#fff6c8', len: 12, w: 2.4, trail: 0 },
  { core: '#cfe6ff', tip: '#ffffff', len: 14, w: 2.8, trail: 18, tc: '120,190,255' },
  { core: P.gold, tip: '#fffbe0', len: 16, w: 3.2, trail: 26, tc: '255,214,90', glow: 'rgba(255,214,90,0.35)' },
  { core: '#ff7a3a', tip: '#fff0b0', len: 18, w: 3.6, trail: 34, tc: '255,110,50', glow: 'rgba(255,100,40,0.4)' },
];
function boltTier(tier) {
  return BOLT[tier >= 7 ? 3 : tier >= 4 ? 2 : tier >= 2 ? 1 : 0];
}
function drawBullets(ctx, st) {
  const B = boltTier(st.mods.tier || 0);
  for (const u of st.bullets) {
    const a = Math.atan2(u.vy, u.vx);
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.rotate(a);
    if (B.trail) {
      ctx.fillStyle = 'rgba(' + B.tc + ',0.35)';
      ctx.fillRect(-B.len - B.trail, -B.w / 2, B.trail, B.w);
    }
    if (B.glow) {
      ctx.fillStyle = B.glow;
      ctx.fillRect(-B.len, -B.w * 1.5, B.len + 8, B.w * 3);
    }
    ctx.fillStyle = P.line;
    ctx.fillRect(-B.len + 3, -B.w / 2 - 1.2, B.len + 3, B.w + 2.4);
    ctx.fillStyle = u.bounced ? '#7dff9a' : B.core;
    ctx.fillRect(-B.len + 4, -B.w / 2, B.len, B.w);
    ctx.fillStyle = B.tip;
    ctx.fillRect(3, -B.w / 2 - 0.6, 4, B.w + 1.2);
    ctx.restore();
  }
}

// 伙伴在场上：跟着 st.pal 的位置和状态画
function drawPal(ctx, st, t) {
  const p = st.pal;
  if (!p) return;
  const b = st.buddy;
  // 冷却圈：待命时脚下一圈慢慢填满，满了就出手
  if (p.state === 'home' && b.cd) {
    const k = clamp(1 - p.cd / b.cd, 0, 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y + 14, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = k >= 1 ? '#ffffff' : P.gold;
    ctx.beginPath();
    ctx.arc(p.x, p.y + 14, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    ctx.stroke();
  }
  if (b.id === 'que') {
    const flying = p.state !== 'home';
    if (flying) {
      // 金色尾迹
      ctx.fillStyle = 'rgba(255,214,90,0.35)';
      ctx.beginPath();
      ctx.arc(p.x - (p.fx || 0) * 10, p.y + 4, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    const dip = p.state === 'peck' ? (p.t > 0.04 ? 4 : 0) : 0;
    if (flying) {
      ctx.fillStyle = 'rgba(255,240,190,0.35)';
      ctx.beginPath();
      ctx.arc(p.x, p.y + dip, 17, 0, Math.PI * 2);
      ctx.fill();
    }
    drawBuddy(ctx, 'que', p.x, p.y + dip, t * (flying ? 2.5 : 1), flying ? 1.8 : 1.4, (p.fx || 0) < 0);
  } else if (b.id === 'quan') {
    const air = p.state !== 'home';
    ctx.save();
    ctx.translate(p.x, p.y);
    if (air) ctx.rotate((p.fx || 1) * (p.state === 'leap' ? -0.5 : 0.4));
    drawBuddy(ctx, 'quan', 0, 0, air ? 0 : t, 1.4, (p.fx || 1) < 0);
    ctx.restore();
  } else if (b.id === 'gui') {
    const r = Math.max(0, p.recoil || 0) / 0.25;
    ctx.save();
    ctx.translate(p.x, p.y + r * 3);
    ctx.scale(1 + r * 0.15, 1 - r * 0.15);
    drawBuddy(ctx, 'gui', 0, 0, t, 1.4, true);
    ctx.restore();
  }
}

// 蒸汽龟的炮弹：高高的抛物线，落点先亮一个红圈（看得见要炸哪）
function drawShells(ctx, st) {
  for (const sh of st.shells) {
    const u = sh.t / sh.T;
    const R = st.buddy ? st.buddy.shellR : 60;
    ctx.globalAlpha = 0.3 + 0.4 * u;
    ctx.strokeStyle = P.red;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(sh.tx, sh.ty, R * (1.25 - 0.25 * u), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const x = sh.x0 + (sh.tx - sh.x0) * u;
    const y = sh.y0 + (sh.ty - sh.y0) * u - Math.sin(u * Math.PI) * 160;
    ctx.fillStyle = P.line;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a4f5c';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff9a3c';
    ctx.fillRect(x - 1.5, y - 9, 3, 3 + Math.sin(sh.t * 40) * 1.5);
  }
}

// ================= 0.3：照风格库 LDR-S1E08-a 祝有好收获（细褐线、平涂一层硬影、黄铜一道白高光、一地一色）=================
const LINE = '#1E1A16';
const IMG = {}; // 生图到了以后 main.js 往这里放（读不到就用代码画）
function imgOk(k) {
  const im = IMG[k];
  return im && im.ok;
}
// 平涂圆 + 右下一块硬阴影 + 细线
function disc(ctx, x, y, r, base, shade, lw) {
  ctx.fillStyle = LINE;
  ctx.beginPath();
  ctx.arc(x, y, r + (lw || 1.4), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.rect(x - r - 2, y - r - 2, 2 * r + 4, 2 * r + 4);
  ctx.arc(x - r * 0.28, y - r * 0.34, r, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.restore();
}
function streak(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.save();
  ctx.translate(x - r * 0.42, y - r * 0.42);
  ctx.rotate(-0.8);
  ctx.fillRect(-r * 0.32, -1.2, r * 0.64, 2.4);
  ctx.restore();
}

const FAM = {
  dragon: { base: '#9C7F42', shade: '#7F602C', hi: '#EFBE63' },
  centi: { base: '#4a5560', shade: '#30373f', hi: '#a9bccb' },
  terra: { base: '#a8693f', shade: '#7d4a2b', hi: '#d39a6a' },
};

// 0.5：边城的机关长龙一节节是蒸汽车厢（和玩法 A 的龙同一套样子）
function drawCarSeg(ctx, g, t, c) {
  const R = g.r;
  const a = (g.a || 0) + Math.PI / 2;
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(a);
  const s = R * 0.92;
  ctx.fillStyle = 'rgba(20,12,6,0.32)';
  roundRect(ctx, -s + 3, -s + 4, s * 2, s * 2, 5);
  ctx.fill();
  // 轮子
  ctx.fillStyle = LINE;
  for (const sx of [-s - 3, s]) {
    ctx.fillRect(sx, -s * 0.6, 3, s * 0.45);
    ctx.fillRect(sx, s * 0.2, 3, s * 0.45);
  }
  ctx.fillStyle = '#c9933a';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.8;
  roundRect(ctx, -s, -s, s * 2, s * 2, 5);
  ctx.fill();
  ctx.fillStyle = '#946224';
  ctx.fillRect(-s + 2, s - 6, s * 2 - 4, 4);
  ctx.stroke();
  ctx.fillStyle = '#6b4518';
  for (const [px, py] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.45], [0.55, 0.45]]) {
    ctx.beginPath();
    ctx.arc(px * s, py * s, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  if (g.id % 3 === 1) {
    ctx.fillStyle = '#4a3220';
    ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.strokeRect(-3.5, -3.5, 7, 7);
    const k = (t * 1.6 + g.id * 0.37) % 1;
    ctx.fillStyle = 'rgba(240,236,228,' + (0.5 * (1 - k)) + ')';
    ctx.beginPath();
    ctx.arc(0, -4 - k * 10, 3 + k * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-s * 0.62, -s * 0.7);
  ctx.lineTo(-s * 0.62, 0);
  ctx.stroke();
  ctx.restore();
}

// 0.5：拆来的零件拼到城墙上——每件武器在城墙上立一座看得见的机关台；零件攒多了城墙包铜甲
const WALL_SLOTS = [44, 110, 250, 316];
function drawWallMachines(ctx, st, t, parts) {
  const F = C.FIELD;
  const wy = F.gateY - 10;
  // 铜甲：每 6 个零件包一块，最多 12 块
  const plates = Math.min(12, Math.floor(parts / 6));
  for (let i = 0; i < plates; i++) {
    const side = i % 2 ? 1 : -1;
    const k = Math.floor(i / 2);
    const x = side < 0 ? 4 + k * 22 : F.w - 26 - k * 22;
    ctx.fillStyle = LINE;
    ctx.fillRect(x - 1, wy + 9, 22, 30);
    ctx.fillStyle = '#c9933a';
    ctx.fillRect(x, wy + 10, 20, 28);
    ctx.fillStyle = '#946224';
    ctx.fillRect(x, wy + 32, 20, 6);
    ctx.fillStyle = '#6b4518';
    ctx.fillRect(x + 3, wy + 13, 2, 2);
    ctx.fillRect(x + 15, wy + 13, 2, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 3, wy + 17, 2, 10);
  }
  const ids = Object.keys(st.weapons).filter((id) => id !== 'bow');
  ids.forEach((id, i) => {
    if (i >= WALL_SLOTS.length) return;
    drawMachine(ctx, id, WALL_SLOTS[i], wy - 14, st.weapons[id], t);
  });
}

function drawMachine(ctx, id, x, y, lv, t) {
  const k = 1.05 + lv * 0.1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  if (lv >= 5) {
    ctx.fillStyle = 'rgba(255,214,90,' + (0.25 + 0.15 * Math.sin(t * 6)) + ')';
    ctx.beginPath();
    ctx.arc(0, -10, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.8;
  // 底座
  ctx.fillStyle = '#5a3d22';
  roundRect(ctx, -14, -4, 28, 10, 3);
  ctx.fill();
  ctx.stroke();
  if (id === 'blade') {
    // 铜轮机：一只转着的齿轮刃
    ctx.save();
    ctx.translate(0, -14);
    ctx.rotate(t * 6);
    ctx.fillStyle = '#d9a441';
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = i % 2 ? 11 : 7;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else if (id === 'pot') {
    // 投石机：一根摆臂 + 罐
    const sw = Math.sin(t * 3) * 0.3;
    ctx.save();
    ctx.translate(0, -6);
    ctx.rotate(-0.6 + sw);
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(-2, -24, 4, 26);
    ctx.strokeRect(-2, -24, 4, 26);
    ctx.fillStyle = '#3a2a1c';
    ctx.beginPath();
    ctx.arc(0, -26, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (id === 'chain') {
    // 铜雷柱：柱子顶上一团电
    ctx.fillStyle = '#b07a3e';
    ctx.fillRect(-4, -28, 8, 26);
    ctx.strokeRect(-4, -28, 8, 26);
    ctx.strokeStyle = '#9fe8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = t * 9 + i * 2.1;
      ctx.moveTo(0, -30);
      ctx.lineTo(Math.cos(a) * 9, -30 + Math.sin(a) * 7);
    }
    ctx.stroke();
  } else if (id === 'frost') {
    // 喷汽口：一根弯管冒白汽
    ctx.fillStyle = '#7c8791';
    ctx.fillRect(-4, -22, 8, 20);
    ctx.strokeRect(-4, -22, 8, 20);
    ctx.fillRect(-4, -26, 14, 6);
    ctx.strokeRect(-4, -26, 14, 6);
    const p = (t * 1.5) % 1;
    ctx.fillStyle = 'rgba(220,240,255,' + (0.7 * (1 - p)) + ')';
    ctx.beginPath();
    ctx.arc(12 + p * 6, -26 - p * 12, 4 + p * 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === 'hammer') {
    // 大锤架
    const lift = Math.abs(Math.sin(t * 2.5)) * 6;
    ctx.fillStyle = '#6b4424';
    ctx.fillRect(-10, -26, 3, 24);
    ctx.fillRect(7, -26, 3, 24);
    ctx.fillRect(-10, -28, 20, 3);
    ctx.fillStyle = '#7c8791';
    roundRect(ctx, -7, -20 - lift, 14, 10, 2);
    ctx.fill();
    ctx.stroke();
  } else if (id === 'lamp') {
    // 灯塔：顶上一盏照妖灯
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(-4, -24, 8, 22);
    ctx.strokeRect(-4, -24, 8, 22);
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(0, -28, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,170,0.25)';
    ctx.beginPath();
    ctx.moveTo(-5, -30);
    ctx.lineTo(-18, -70);
    ctx.lineTo(18, -70);
    ctx.lineTo(5, -30);
    ctx.fill();
  }
  ctx.restore();
}

function drawSegBody(ctx, g, t, fam) {
  const R = g.r;
  const c = FAM[fam];
  if (fam === 'centi') {
    // 两对小腿，跟着走的方向一摆一摆
    const a = g.a || 0;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const tx = Math.cos(a);
    const ty = Math.sin(a);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (const k of [-0.45, 0.45]) {
        const w = Math.sin(t * 14 + g.id + k * 3) * 3;
        const bx = g.x + tx * R * k;
        const by = g.y + ty * R * k;
        ctx.beginPath();
        ctx.moveTo(bx + nx * side * R * 0.8, by + ny * side * R * 0.8);
        ctx.lineTo(bx + nx * side * (R + 6) + tx * w, by + ny * side * (R + 6) + ty * w);
        ctx.lineTo(bx + nx * side * (R + 9) + tx * (w - 3), by + ny * side * (R + 9) + ty * (w - 3));
        ctx.stroke();
      }
    }
  }
  if (fam === 'dragon') return drawCarSeg(ctx, g, t, c);
  disc(ctx, g.x, g.y, R, c.base, c.shade);
  if (fam === 'dragon') {
    // 齿轮边 + 四颗铆钉
    ctx.fillStyle = LINE;
    for (let k = 0; k < 4; k++) {
      const a = (g.a || 0) + (k * Math.PI) / 2 + Math.PI / 4;
      ctx.fillRect(g.x + Math.cos(a) * (R - 4) - 1.3, g.y + Math.sin(a) * (R - 4) - 1.3, 2.6, 2.6);
    }
    ctx.strokeStyle = c.shade;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(g.x, g.y, R * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  } else if (fam === 'centi') {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.x - Math.sin(g.a) * R, g.y + Math.cos(g.a) * R);
    ctx.lineTo(g.x + Math.sin(g.a) * R, g.y - Math.cos(g.a) * R);
    ctx.stroke();
  } else if (fam === 'terra') {
    // 陶俑从上往下看：肩甲两片 + 发髻
    ctx.fillStyle = c.shade;
    ctx.fillRect(g.x - R * 0.7, g.y - 1, R * 1.4, 2);
    disc(ctx, g.x, g.y, R * 0.45, '#b98258', '#8a5a38', 1);
    ctx.fillStyle = '#2b1d16';
    ctx.beginPath();
    ctx.arc(g.x + 1, g.y - 1, R * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  streak(ctx, g.x, g.y, R);
}

function drawSegType(ctx, st, g, t, fam) {
  const R = g.r;
  const type = g.type;
  if (type === 'shield') {
    // 朝下（朝阿铸）一块弧形铁盾
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(g.x, g.y, R + 1, Math.PI * 0.12, Math.PI * 0.88);
    ctx.stroke();
    ctx.strokeStyle = '#7d8696';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = '#d7e0ea';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(g.x, g.y, R + 2.4, Math.PI * 0.3, Math.PI * 0.55);
    ctx.stroke();
    ctx.fillStyle = '#c9a24a';
    for (const k of [0.25, 0.5, 0.75]) {
      const a = Math.PI * (0.12 + 0.76 * k);
      ctx.fillRect(g.x + Math.cos(a) * (R + 1) - 1.2, g.y + Math.sin(a) * (R + 1) - 1.2, 2.4, 2.4);
    }
  } else if (type === 'core') {
    const p = 0.5 + 0.5 * Math.sin(t * 6 + g.id);
    ctx.fillStyle = 'rgba(110,255,150,' + (0.25 + 0.25 * p).toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(g.x, g.y, R * 0.75, 0, Math.PI * 2);
    ctx.fill();
    disc(ctx, g.x, g.y, R * 0.38, '#6dff9a', '#2fb45c', 1);
  }
}

// 不走家族画法的兵种：火药桶、幽影、分裂、重甲俑
function drawSpecial(ctx, st, g, t) {
  const R = g.r;
  if (g.type === 'powder') {
    disc(ctx, g.x, g.y, R, '#8a5a30', '#663f1e');
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2.2;
    for (const k of [-0.45, 0.45]) {
      ctx.beginPath();
      ctx.arc(g.x, g.y, R * (1 - Math.abs(k) * 0.4), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#c0352b';
    ctx.fillRect(g.x - 4, g.y - 4, 8, 8);
    // 引线冒火星
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(g.x + 3, g.y - R + 2);
    ctx.quadraticCurveTo(g.x + 9, g.y - R - 6, g.x + 6, g.y - R - 10);
    ctx.stroke();
    const sp = 0.6 + 0.4 * Math.sin(t * 30 + g.id);
    ctx.fillStyle = '#ffd65a';
    star(ctx, g.x + 6, g.y - R - 10, 4 * sp + 2, 1.5, 6);
    return true;
  }
  if (g.type === 'ghost') {
    const ph = st.phasedOf ? st.phasedOf(g) : false;
    const bob = Math.sin(t * 2.6 + g.id) * 2;
    ctx.globalAlpha = ph ? 0.22 : 0.92;
    ctx.fillStyle = '#d9ecf5';
    ctx.beginPath();
    ctx.arc(g.x, g.y + bob, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#72AFC8';
    ctx.lineWidth = 2.4;
    if (ph) ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#2a4376';
    ctx.fillRect(g.x - 6, g.y + bob - 3, 3, 4);
    ctx.fillRect(g.x + 3, g.y + bob - 3, 3, 4);
    ctx.globalAlpha = 1;
    return true;
  }
  if (g.type === 'split') {
    disc(ctx, g.x, g.y, R, '#5f9e74', '#3f7553');
    ctx.strokeStyle = '#b8ffcf';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(g.x - 2, g.y - R + 2);
    ctx.lineTo(g.x + 3, g.y - 3);
    ctx.lineTo(g.x - 3, g.y + 4);
    ctx.lineTo(g.x + 1, g.y + R - 2);
    ctx.stroke();
    streak(ctx, g.x, g.y, R);
    return true;
  }
  if (g.type === 'clay') {
    disc(ctx, g.x, g.y, R + 2, '#7c4a32', '#5a3322');
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(g.x - R * 0.8, g.y + k * 6);
      ctx.lineTo(g.x + R * 0.8, g.y + k * 6);
      ctx.stroke();
    }
    disc(ctx, g.x, g.y - 1, R * 0.4, '#9a6646', '#6e452e', 1);
    return true;
  }
  return false;
}

function drawChest(ctx, g, t) {
  const R = g.r;
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(g.a || 0);
  ctx.fillStyle = LINE;
  roundRect(ctx, -R - 1.5, -R - 1.5, 2 * R + 3, 2 * R + 3, 5);
  ctx.fill();
  ctx.fillStyle = P.lac;
  roundRect(ctx, -R, -R, 2 * R, 2 * R, 4);
  ctx.fill();
  ctx.fillStyle = P.lacLo;
  ctx.fillRect(-R, R * 0.3, 2 * R, R * 0.7);
  ctx.fillStyle = P.gold;
  ctx.fillRect(-R, -2, 2 * R, 4);
  ctx.fillRect(-2, -R, 4, 2 * R);
  const glow = 0.5 + 0.5 * Math.sin(t * 8 + g.id);
  ctx.fillStyle = mix('#ffd65a', '#fff7d0', glow);
  ctx.beginPath();
  ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(-R + 3, -R + 3, R * 0.7, 2);
  ctx.restore();
}
function drawRam(ctx, g) {
  const R = g.r;
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate((g.a || 0) + Math.PI);
  ctx.fillStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(R, -9);
  ctx.lineTo(R + 20, 0);
  ctx.lineTo(R, 9);
  ctx.fill();
  ctx.fillStyle = '#9aa0b0';
  ctx.beginPath();
  ctx.moveTo(R + 1, -5.5);
  ctx.lineTo(R + 15, 0);
  ctx.lineTo(R + 1, 5.5);
  ctx.fill();
  ctx.restore();
  disc(ctx, g.x, g.y, R + 3, '#5e6474', '#3c404c');
  ctx.fillStyle = '#c94a3a';
  ctx.fillRect(g.x - 2, g.y - 2, 4, 4);
  streak(ctx, g.x, g.y, R + 3);
}

function drawSegAll(ctx, st, g, t, isTail) {
  const fam = st.ch.enemy;
  const wob = Math.sin(t * 6 + g.id * 0.9) * 0.6;
  const pop = 1 + Math.max(0, g.flash) * 2.2;
  ctx.save();
  ctx.translate(g.x, g.y + wob);
  ctx.scale(pop, pop);
  ctx.translate(-g.x, -g.y);
  if (g.chest) drawChest(ctx, g, t);
  else if (g.ram) drawRam(ctx, g);
  else if (!drawSpecial(ctx, st, g, t)) {
    drawSegBody(ctx, g, t, fam);
    drawSegType(ctx, st, g, t, fam);
  }
  if (g.frozT > 0) {
    ctx.globalAlpha = Math.min(1, g.frozT * 2) * 0.55;
    ctx.fillStyle = '#d8ecff';
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(g.x - 6, g.y - 6);
    ctx.lineTo(g.x + 6, g.y + 6);
    ctx.moveTo(g.x + 6, g.y - 6);
    ctx.lineTo(g.x - 6, g.y + 6);
    ctx.stroke();
  }
  if (g.flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.r + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 血（数字）
  ctx.save();
  ctx.font = '900 ' + (g.type === 'mini' ? 9 : 11) + 'px "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = LINE;
  const txt = fmtHp(g.hp);
  const ty = g.y + wob + 0.5;
  ctx.strokeText(txt, g.x, ty);
  ctx.fillStyle = g.type === 'core' && g.hp < g.max && g.noRegen <= 0 ? '#9dffb8' : '#fffaf0';
  ctx.fillText(txt, g.x, ty);
  ctx.restore();
}

function drawHeadAll(ctx, st, g, t) {
  const fam = st.ch.enemy;
  if (fam === 'dragon') return drawHead(ctx, g, t, st.danger);
  const a = g.a || 0;
  const R = C.DRAGON.r;
  const hx = g.x + Math.cos(a) * (R + 8);
  const hy = g.y + Math.sin(a) * (R + 8);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(a);
  if (fam === 'centi') {
    // 铁蜈蚣：一对大钳子一开一合
    const open = 0.35 + Math.abs(Math.sin(t * 5)) * 0.35;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.rotate(s * open);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(4, s * 4);
      ctx.quadraticCurveTo(16, s * 9, 20, s * 1);
      ctx.stroke();
      ctx.strokeStyle = '#a9bccb';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    disc(ctx, 0, 0, 10, '#4a5560', '#30373f');
    ctx.fillStyle = st.danger > 0 ? '#ffffff' : '#7dff9a';
    ctx.fillRect(3, -6, 3, 3);
    ctx.fillRect(3, 3, 3, 3);
  } else {
    // 陶俑将军：高冠、脸朝前
    ctx.fillStyle = LINE;
    ctx.fillRect(-14, -6, 10, 12);
    ctx.fillStyle = '#5a2d1e';
    ctx.fillRect(-13, -5, 8, 10);
    disc(ctx, 0, 0, 10, '#c48a5c', '#94603c');
    ctx.fillStyle = '#c0352b';
    ctx.fillRect(-4, -11, 8, 4);
    ctx.fillStyle = st.danger > 0 ? '#ff3b2f' : LINE;
    ctx.fillRect(4, -4, 2.5, 2.5);
    ctx.fillRect(4, 2, 2.5, 2.5);
  }
  ctx.restore();
}

function drawDragonAll(ctx, st, t) {
  const segs = st.segs;
  for (let i = segs.length - 1; i >= 0; i--) {
    const g = segs[i];
    if (g.y < -30) continue;
    drawSegAll(ctx, st, g, t, i === segs.length - 1 && segs.length > 1);
  }
  if (segs.length && segs[0].y > -30) drawHeadAll(ctx, st, segs[0], t);
}

// —— 阿铸（细线赛璐璐，背影）——
function drawHero(ctx, x, y, t, recoil, moving, lv) {
  const bob = moving ? Math.abs(Math.sin(t * 11)) * -1.5 : Math.sin(t * 3) * 0.6;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.save();
  ctx.translate(x, y + 27);
  ctx.scale(1, 0.28);
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const yy = y + bob;
  // 生图到了：用 Midjourney 画的阿铸（只画到腰，下半身被墙挡住）
  if (imgOk('hero')) {
    const im = IMG.hero;
    const hgt = 104;
    const wid = (im.width / im.height) * hgt;
    if (lv >= 5) {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 8);
      ctx.fillStyle = lv >= 8 ? '#ff5a3a' : '#ffb347';
      ctx.beginPath();
      ctx.arc(x, yy - 40, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const top = yy - 74 + recoil * 3;
    ctx.drawImage(im, x - wid / 2, top, wid, hgt);
    if (recoil > 0.55) {
      ctx.globalAlpha = (recoil - 0.55) / 0.45;
      ctx.fillStyle = '#fff2b0';
      star(ctx, x - wid * 0.12, top + 2, 7 + lv * 0.6, 3, 6);
      ctx.globalAlpha = 1;
    }
    return;
  }
  const ol = (fn) => {
    ctx.fillStyle = LINE;
    fn(1.4);
  };
  // 腿
  const step = moving ? Math.sin(t * 22) * 3 : 0;
  for (const s of [-1, 1]) {
    ctx.fillStyle = LINE;
    roundRect(ctx, x + s * 7 - 5.5, yy + 6 + (s > 0 ? step : -step) * 0.3, 11, 20, 3);
    ctx.fill();
    ctx.fillStyle = '#3a2f3a';
    roundRect(ctx, x + s * 7 - 4.3, yy + 7 + (s > 0 ? step : -step) * 0.3, 8.6, 17.6, 2.5);
    ctx.fill();
  }
  // 手臂（举着弩，往上）
  for (const s of [-1, 1]) {
    ctx.fillStyle = LINE;
    roundRect(ctx, x + s * 15 - 5, yy - 26, 10, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#d9a777';
    roundRect(ctx, x + s * 15 - 3.8, yy - 24.8, 7.6, 19.6, 3);
    ctx.fill();
    ctx.fillStyle = '#b57f52';
    ctx.fillRect(x + s * 15 + (s > 0 ? 0 : -3.8), yy - 24.8, 3.8, 19.6);
  }
  // 背（宽肩倒梯形）+ 背心 + 围裙带
  ctx.fillStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(x - 17, yy - 16);
  ctx.lineTo(x + 17, yy - 16);
  ctx.lineTo(x + 11, yy + 10);
  ctx.lineTo(x - 11, yy + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6b4a30';
  ctx.beginPath();
  ctx.moveTo(x - 15.5, yy - 14.8);
  ctx.lineTo(x + 15.5, yy - 14.8);
  ctx.lineTo(x + 10, yy + 8.8);
  ctx.lineTo(x - 10, yy + 8.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4e3421';
  ctx.beginPath();
  ctx.moveTo(x + 2, yy - 14.8);
  ctx.lineTo(x + 15.5, yy - 14.8);
  ctx.lineTo(x + 10, yy + 8.8);
  ctx.lineTo(x + 2, yy + 8.8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2d1f14';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 12, yy - 14);
  ctx.lineTo(x + 8, yy + 7);
  ctx.moveTo(x + 12, yy - 14);
  ctx.lineTo(x - 8, yy + 7);
  ctx.stroke();
  // 头（后脑勺）+ 红头巾，两条带子飘
  ctx.fillStyle = '#b8302a';
  const fl = Math.sin(t * 8) * 3;
  ctx.beginPath();
  ctx.moveTo(x + 4, yy - 24);
  ctx.lineTo(x + 14 + fl, yy - 14);
  ctx.lineTo(x + 10 + fl, yy - 12);
  ctx.closePath();
  ctx.fill();
  disc(ctx, x, yy - 25, 9, '#26201c', '#15110e');
  ctx.fillStyle = LINE;
  ctx.fillRect(x - 9.5, yy - 28, 19, 5.5);
  ctx.fillStyle = '#d4483e';
  ctx.fillRect(x - 9, yy - 27.4, 18, 4.2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x - 4, yy - 31, 5, 1.6);
  drawCrossbow(ctx, x, yy - 30, recoil, t, lv);
}

// —— 七件武器的画法 ——
function drawWeapons(ctx, st, t) {
  const F = C.FIELD;
  // 地上的火
  for (const f of st.fires) {
    const k = f.t / f.max;
    ctx.globalAlpha = Math.min(1, k * 3) * 0.35;
    ctx.fillStyle = '#ff6a2a';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, k * 3);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + i;
      const rr = f.r * (0.3 + 0.55 * ((i * 37) % 10) / 10);
      const fx = f.x + Math.cos(a) * rr;
      const fy = f.y + Math.sin(a) * rr * 0.8;
      const h = 8 + 5 * Math.sin(t * 14 + i * 2);
      ctx.fillStyle = LINE;
      ctx.beginPath();
      ctx.moveTo(fx - 5, fy + 2);
      ctx.quadraticCurveTo(fx - 3, fy - h * 0.6, fx, fy - h - 1);
      ctx.quadraticCurveTo(fx + 3, fy - h * 0.6, fx + 5, fy + 2);
      ctx.fill();
      ctx.fillStyle = i % 2 ? '#ffb347' : '#ff6a2a';
      ctx.beginPath();
      ctx.moveTo(fx - 3.6, fy + 1);
      ctx.quadraticCurveTo(fx - 2, fy - h * 0.5, fx, fy - h);
      ctx.quadraticCurveTo(fx + 2, fy - h * 0.5, fx + 3.6, fy + 1);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // 照妖灯光柱
  if (st.beam) {
    const b = st.beam;
    const flick = 0.85 + 0.15 * Math.sin(t * 30);
    ctx.globalAlpha = 0.22 * flick;
    ctx.fillStyle = '#fff27a';
    ctx.fillRect(b.x - b.w, 0, b.w * 2, F.playerY - 40);
    ctx.globalAlpha = 0.6 * flick;
    ctx.fillRect(b.x - b.w / 2, 0, b.w, F.playerY - 40);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#fffbe0';
    ctx.fillRect(b.x - b.w / 6, 0, b.w / 3, F.playerY - 40);
    ctx.globalAlpha = 1;
  }
  // 千斤锤：先落个影子，再砸下来
  for (const h of st.hammers) {
    if (h.t < 0) continue;
    const u = h.t / h.T;
    ctx.globalAlpha = 0.25 + 0.4 * u;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(h.x, h.y, 20 * (0.6 + 0.4 * u), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    const hy = h.y - 120 * (1 - u * u);
    ctx.save();
    ctx.translate(h.x, hy);
    ctx.rotate(-0.6 * (1 - u));
    ctx.fillStyle = LINE;
    ctx.fillRect(-3.5, -40, 7, 34);
    ctx.fillStyle = '#7a5530';
    ctx.fillRect(-2.2, -39, 4.4, 32);
    ctx.fillStyle = LINE;
    roundRect(ctx, -18, -10, 36, 22, 3);
    ctx.fill();
    ctx.fillStyle = '#9C7F42';
    roundRect(ctx, -16.6, -8.6, 33.2, 19.2, 2.5);
    ctx.fill();
    ctx.fillStyle = '#7F602C';
    ctx.fillRect(-16.6, 2, 33.2, 8.6);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-13, -6, 14, 2.4);
    ctx.restore();
  }
  // 霹雳罐：抛物线 + 落点红圈
  for (const p of st.pots) {
    if (p.t < 0) continue;
    const u = Math.min(1, p.t / p.T);
    ctx.globalAlpha = 0.3 + 0.4 * u;
    ctx.strokeStyle = '#ff6a2a';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(p.tx, p.ty, p.R * (1.2 - 0.2 * u), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const x = p.x0 + (p.tx - p.x0) * u;
    const y = p.y0 + (p.ty - p.y0) * u - Math.sin(u * Math.PI) * 140;
    disc(ctx, x, y, 7, '#a0663f', '#7a4a2c', 1.2);
    ctx.fillStyle = '#ffb347';
    star(ctx, x, y - 8, 4 + Math.sin(t * 40) * 1.5, 1.6, 6);
  }
  // 回旋刃：四片弯刃转着飞
  for (const b of st.blades) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    const r = b.r;
    for (let k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = LINE;
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.quadraticCurveTo(r * 0.9, -r * 0.6, r + 2, 2);
      ctx.lineTo(0, 4);
      ctx.fill();
      ctx.fillStyle = '#cfe6f5';
      ctx.beginPath();
      ctx.moveTo(1, -1.6);
      ctx.quadraticCurveTo(r * 0.85, -r * 0.5, r, 1);
      ctx.lineTo(1, 2.4);
      ctx.fill();
    }
    disc(ctx, 0, 0, 4, '#9C7F42', '#7F602C', 1.2);
    ctx.restore();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#9fe8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// —— 图标：七件武器 + 六个兵种（卡片、HUD 用）——
function drawWeaponIcon(ctx, id, x, y, s) {
  const k = s / 40;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  if (id === 'bow') {
    ctx.rotate(-0.5);
    drawCrossbow(ctx, 0, 18, 0, 0, 0);
  } else if (id === 'blade') {
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = LINE;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.quadraticCurveTo(16, -12, 19, 3);
      ctx.lineTo(0, 6);
      ctx.fill();
      ctx.fillStyle = '#cfe6f5';
      ctx.beginPath();
      ctx.moveTo(1, -3);
      ctx.quadraticCurveTo(15, -10, 17, 2);
      ctx.lineTo(1, 4);
      ctx.fill();
    }
    disc(ctx, 0, 0, 6, '#9C7F42', '#7F602C');
  } else if (id === 'pot') {
    disc(ctx, 0, 4, 13, '#a0663f', '#7a4a2c');
    ctx.fillStyle = LINE;
    ctx.fillRect(-6, -12, 12, 6);
    ctx.fillStyle = '#ff6a2a';
    star(ctx, 0, -14, 10, 4, 7);
    ctx.fillStyle = '#ffd65a';
    star(ctx, 0, -13, 5, 2, 6);
  } else if (id === 'chain') {
    ctx.fillStyle = LINE;
    ctx.fillRect(-7, -2, 14, 20);
    ctx.fillStyle = '#9C7F42';
    ctx.fillRect(-5.5, -0.5, 11, 17);
    disc(ctx, 0, -8, 7, '#c9a24a', '#9C7F42');
    ctx.strokeStyle = '#b9d8ff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-4, -12);
    ctx.lineTo(-12, -16);
    ctx.lineTo(-9, -20);
    ctx.lineTo(-18, -22);
    ctx.moveTo(4, -12);
    ctx.lineTo(13, -15);
    ctx.lineTo(10, -19);
    ctx.lineTo(18, -21);
    ctx.stroke();
  } else if (id === 'frost') {
    ctx.fillStyle = LINE;
    roundRect(ctx, -8, -6, 16, 24, 4);
    ctx.fill();
    ctx.fillStyle = '#9C7F42';
    roundRect(ctx, -6.5, -4.5, 13, 21, 3);
    ctx.fill();
    ctx.strokeStyle = '#cfe6ff';
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 10, -14 + Math.sin(a) * 10);
      ctx.lineTo(-Math.cos(a) * 10, -14 - Math.sin(a) * 10);
      ctx.stroke();
    }
  } else if (id === 'hammer') {
    ctx.rotate(-0.6);
    ctx.fillStyle = LINE;
    ctx.fillRect(-3, -6, 6, 26);
    ctx.fillStyle = '#7a5530';
    ctx.fillRect(-1.8, -5, 3.6, 24);
    ctx.fillStyle = LINE;
    roundRect(ctx, -15, -18, 30, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#9C7F42';
    roundRect(ctx, -13.6, -16.6, 27.2, 13.2, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-11, -14.6, 10, 2);
  } else if (id === 'lamp') {
    ctx.fillStyle = 'rgba(255,242,122,0.5)';
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(-14, -22);
    ctx.lineTo(14, -22);
    ctx.lineTo(6, -6);
    ctx.fill();
    ctx.fillStyle = LINE;
    roundRect(ctx, -9, -8, 18, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#9C7F42';
    roundRect(ctx, -7.6, -6.6, 15.2, 19.2, 3);
    ctx.fill();
    ctx.fillStyle = '#fff27a';
    ctx.fillRect(-4.5, -3, 9, 10);
  }
  ctx.restore();
}
function drawTypeIcon(ctx, type, x, y, s, st) {
  const g = { id: 1, x, y, r: s / 2, a: -Math.PI / 2, type, hp: 1, max: 1, frozT: 0, flash: 0, litT: 1 };
  const fake = st || { ch: C.CHAPTERS[0], phasedOf: () => false };
  if (!drawSpecial(ctx, fake, g, 0)) {
    drawSegBody(ctx, g, 0, type === 'core' ? 'terra' : 'dragon');
    drawSegType(ctx, fake, g, 0, 'dragon');
  }
}

// —— 三个地方的背景（一地一色）——
function drawScene(ctx, st) {
  const F = C.FIELD;
  const ch = st.ch;
  const path = st.path;
  const T = ch.tint;
  const g = ctx.createLinearGradient(0, 0, 0, F.h);
  g.addColorStop(0, T[0]);
  g.addColorStop(0.5, T[1]);
  g.addColorStop(1, T[0]);
  ctx.fillStyle = g;
  ctx.fillRect(-200, -200, F.w + 400, F.h + 400);
  let seed = 11 + st.level * 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bgImg = imgOk('bg_' + ch.id);
  if (bgImg) {
    const im = IMG['bg_' + ch.id];
    const sc = Math.max(F.w / im.width, F.h / im.height);
    ctx.drawImage(im, (F.w - im.width * sc) / 2, (F.h - im.height * sc) / 2, im.width * sc, im.height * sc);
    // 压一层暗色：背景退后，龙和路跳出来（地宫那张细节多，压得重一点）
    ctx.fillStyle = 'rgba(0,0,0,' + (ch.id === 'pit' ? 0.4 : 0.28) + ')';
    ctx.fillRect(0, 0, F.w, F.h);
  } else if (ch.id === 'city') {
    // 远处城楼、宝塔、蒸汽烟囱（剪影两层，远浅近深）
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer ? T[1] : mix(T[2], T[1], 0.5);
      for (let k = 0; k < 6; k++) {
        const x = k * 66 - 20 + r() * 30;
        const h = 40 + r() * 60 + layer * 20;
        const w = 30 + r() * 20;
        const base = 92;
        ctx.fillRect(x, base - h, w, h + 10);
        for (let lv = 0; lv < 3; lv++) {
          const yy = base - h + lv * 18;
          ctx.beginPath();
          ctx.moveTo(x - 9, yy + 5);
          ctx.quadraticCurveTo(x + w / 2, yy - 10, x + w + 9, yy + 5);
          ctx.lineTo(x + w + 4, yy + 8);
          ctx.lineTo(x - 4, yy + 8);
          ctx.fill();
        }
      }
    }
    ctx.fillStyle = ch.accent;
    for (let k = 0; k < 9; k++) ctx.fillRect(r() * F.w, 50 + r() * 40, 2.5, 3.5);
  } else if (ch.id === 'tomb') {
    // 墓顶的梁、两排石柱、挂灯
    ctx.fillStyle = T[0];
    ctx.fillRect(0, 0, F.w, 70);
    ctx.fillStyle = mix(T[1], T[0], 0.4);
    for (let k = 0; k < 4; k++) ctx.fillRect(0, 12 + k * 15, F.w, 5);
    for (let k = 0; k < 5; k++) {
      const x = 20 + k * 80;
      ctx.fillStyle = mix(T[1], T[0], 0.3);
      ctx.fillRect(x - 8, 0, 16, 92);
      ctx.fillStyle = T[0];
      ctx.fillRect(x + 2, 0, 6, 92);
    }
    for (const lx of [60, 180, 300]) {
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, 44);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,179,71,0.18)';
      ctx.beginPath();
      ctx.arc(lx, 52, 26, 0, Math.PI * 2);
      ctx.fill();
      disc(ctx, lx, 52, 6, '#9C7F42', '#7F602C', 1);
      ctx.fillStyle = '#ffd08a';
      ctx.fillRect(lx - 2, 50, 4, 5);
    }
  } else {
    // 远处一排排站着的陶俑剪影 + 木脚手架 + 蒸汽灯
    for (let row = 0; row < 3; row++) {
      ctx.fillStyle = row === 0 ? mix(T[2], T[1], 0.6) : row === 1 ? T[1] : mix(T[1], T[0], 0.5);
      const y = 40 + row * 18;
      for (let x = (row % 2) * 9; x < F.w; x += 18) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - 5, y + 3, 10, 14);
      }
    }
    ctx.strokeStyle = '#5a3a24';
    ctx.lineWidth = 3;
    for (const sx of [30, 330]) {
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, 92);
      ctx.moveTo(sx - 20, 20);
      ctx.lineTo(sx + 20, 20);
      ctx.moveTo(sx - 20, 60);
      ctx.lineTo(sx + 20, 60);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,122,42,0.2)';
    ctx.beginPath();
    ctx.arc(180, 30, 40, 0, Math.PI * 2);
    ctx.fill();
  }
  // 地面（玩法区）：干净，只有很淡的地砖
  if (!bgImg) {
    ctx.fillStyle = ch.ground;
    ctx.fillRect(0, 88, F.w, F.gateY - 88);
    ctx.fillStyle = LINE;
    ctx.fillRect(0, 86, F.w, 2.5);
    ctx.strokeStyle = ch.groundHi;
    ctx.lineWidth = 1;
    const tile = ch.id === 'tomb' ? 48 : ch.id === 'pit' ? 0 : 36;
    if (tile) {
      for (let y = 88 + tile; y < F.gateY; y += tile) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(F.w, y);
        ctx.stroke();
        for (let x = ((y / tile) % 2) * (tile / 2); x < F.w; x += tile) {
          ctx.beginPath();
          ctx.moveTo(x, y - tile);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }
    } else {
      for (let k = 0; k < 120; k++) ctx.fillRect(r() * F.w, 90 + r() * (F.gateY - 90), 2, 1);
    }
  }

  // 路：三种地方三种做法
  const len = path.len;
  const strokePath = (w, col, from, to) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let s = from || 0; s <= (to || len); s += 4) {
      const p = path.at(s);
      if (s === (from || 0)) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  };
  if (ch.id === 'city') {
    strokePath(40, LINE);
    strokePath(37, '#2a1f12');
    strokePath(30, '#3a2c18');
    for (let s = 0; s <= len; s += 14) {
      const p = path.at(s);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = '#4e3a22';
      ctx.fillRect(-2.5, -14, 5, 28);
      ctx.restore();
    }
    for (const off of [-11, 11]) {
      for (let s = 0; s <= len; s += 2) {
        const p = path.at(s);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(p.x - Math.sin(p.a) * off - 1.1, p.y + Math.cos(p.a) * off - 1.1, 2.2, 2.2);
      }
    }
  } else if (ch.id === 'tomb') {
    // 石刻水槽：两条亮边
    strokePath(40, LINE);
    strokePath(37, '#5B7A78');
    strokePath(31, '#152429');
    strokePath(24, '#1b2e33');
  } else {
    // 俑坑：土沟 + 两边木板
    strokePath(42, LINE);
    strokePath(39, '#6b4a2c');
    strokePath(32, '#24100c');
    for (let s = 0; s <= len; s += 22) {
      const p = path.at(s);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = '#8a6a44';
      ctx.fillRect(-1.5, -19, 3, 4);
      ctx.fillRect(-1.5, 15, 3, 4);
      ctx.restore();
    }
  }
  // 刻度钉
  for (let s = len - C.DRAGON.gap * 4; s > 0; s -= C.DRAGON.gap * 5) {
    const p = path.at(s);
    ctx.fillStyle = LINE;
    ctx.fillRect(p.x - 2.8, p.y - 2.8, 5.6, 5.6);
    ctx.fillStyle = ch.accent;
    ctx.fillRect(p.x - 1.8, p.y - 1.8, 3.6, 3.6);
  }
  // 最后四节：发红
  ctx.globalAlpha = 0.4;
  strokePath(28, '#8a1a14', len - C.DRAGON.gap * 4, len);
  ctx.globalAlpha = 1;

  // 下面阿铸站的那道墙 / 台
  const wy = F.gateY - 10;
  const wallC = ch.id === 'city' ? ['#5c5248', '#71665a', '#3e362f'] : ch.id === 'tomb' ? ['#2f4a50', '#3f6066', '#1d2f33'] : ['#5a3a24', '#74502f', '#3a2416'];
  ctx.fillStyle = LINE;
  ctx.fillRect(0, wy - 2, F.w, 52);
  ctx.fillStyle = wallC[0];
  ctx.fillRect(0, wy, F.w, 48);
  ctx.fillStyle = wallC[1];
  ctx.fillRect(0, wy, F.w, 4);
  ctx.fillStyle = wallC[2];
  if (ch.id === 'pit') {
    for (let x = 0; x < F.w; x += 16) ctx.fillRect(x, wy, 1.5, 48); // 木栅
    ctx.fillStyle = '#9C7F42';
    ctx.fillRect(0, wy + 14, F.w, 3);
    ctx.fillRect(0, wy + 32, F.w, 3);
  } else {
    for (let row = 0; row < 4; row++) {
      const yy = wy + 8 + row * 10;
      ctx.fillRect(0, yy, F.w, 1.5);
      for (let x = (row % 2) * 12; x < F.w; x += 24) ctx.fillRect(x, yy - 10, 1.5, 10);
    }
  }
  const goal = path.goal;
  const gateOnWall = goal.y > wy - 30;
  // 垛口 / 栏杆
  for (let x = 4; x < F.w; x += 30) {
    if (gateOnWall && Math.abs(x + 9 - goal.x) < 40) continue;
    ctx.fillStyle = LINE;
    ctx.fillRect(x - 1, wy - (ch.id === 'tomb' ? 9 : 15), 20, ch.id === 'tomb' ? 9 : 15);
    ctx.fillStyle = wallC[0];
    ctx.fillRect(x, wy - (ch.id === 'tomb' ? 8 : 14), 18, ch.id === 'tomb' ? 8 : 14);
    ctx.fillStyle = wallC[1];
    ctx.fillRect(x, wy - (ch.id === 'tomb' ? 8 : 14), 18, 2.5);
  }
  // 终点：城门 / 墓室石门 / 地宫闸门
  if (gateOnWall) {
    const gx = goal.x;
    ctx.fillStyle = LINE;
    roundRect(ctx, gx - 30, wy - 26, 60, 76, ch.id === 'pit' ? 4 : 26);
    ctx.fill();
    ctx.fillStyle = ch.id === 'pit' ? '#7F602C' : '#6b4a30';
    roundRect(ctx, gx - 27, wy - 23, 54, 73, ch.id === 'pit' ? 3 : 23);
    ctx.fill();
    ctx.fillStyle = '#0c0706';
    roundRect(ctx, gx - 20, wy - 16, 40, 66, ch.id === 'pit' ? 2 : 18);
    ctx.fill();
    if (ch.id === 'pit') {
      ctx.fillStyle = '#9C7F42';
      for (let k = 0; k < 4; k++) ctx.fillRect(gx - 20, wy - 10 + k * 14, 40, 3);
    }
    for (const lx of [gx - 44, gx + 44]) {
      if (lx < 10 || lx > F.w - 10) continue;
      ctx.fillStyle = 'rgba(255,154,60,0.25)';
      ctx.beginPath();
      ctx.arc(lx, wy - 26, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = LINE;
      ctx.fillRect(lx - 5.5, wy - 34, 11, 16);
      ctx.fillStyle = ch.accent;
      ctx.fillRect(lx - 4, wy - 32.5, 8, 13);
    }
  } else {
    // 墓室：一扇圆石门在路的尽头
    const gx = goal.x;
    const gy = goal.y;
    ctx.fillStyle = 'rgba(255,179,71,0.12)';
    ctx.beginPath();
    ctx.arc(gx, gy, 46, 0, Math.PI * 2);
    ctx.fill();
    disc(ctx, gx, gy, 24, '#6f8a88', '#4c6563', 1.6);
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(gx, gy, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#c9a24a';
    star(ctx, gx, gy, 8, 4, 8);
    for (const [dx, dy] of [[-32, -10], [32, -10]]) {
      ctx.fillStyle = LINE;
      ctx.fillRect(gx + dx - 2, gy + dy, 4, 16);
      ctx.fillStyle = '#ffb347';
      star(ctx, gx + dx, gy + dy - 2, 5, 2, 6);
    }
  }
  // 墙后的走道
  ctx.fillStyle = mix(wallC[2], '#000000', 0.25);
  ctx.fillRect(0, wy + 48, F.w, F.h - wy);
  ctx.fillStyle = mix(wallC[2], '#000000', 0.45);
  for (let x = 0; x < F.w; x += 40) ctx.fillRect(x, wy + 48, 1.5, F.h);
  ctx.fillRect(0, wy + 80, F.w, 1.5);
  ctx.fillRect(0, wy + 112, F.w, 1.5);
}

module.exports = { drawWallMachines, WALL_SLOTS, drawSegBody, drawHeadAll, IMG, LINE, disc, drawScene, drawDragonAll, drawHero, drawWeapons, drawWeaponIcon, drawTypeIcon, P, pix, drawPlayer, drawCrossbow, drawBuddy, drawPal, drawShells, boltTier, drawIcon, drawBackground, drawDragon, drawBullets, star, fmtHp, bigText, clamp };
