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

function drawCrossbow(ctx, x, y, recoil, t) {
  // 弩身（竖着朝上）
  const yy = y - recoil * 4;
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
  ctx.moveTo(x - 17, yy - 22);
  ctx.quadraticCurveTo(x, yy - 34 + recoil * 2, x + 17, yy - 22);
  ctx.stroke();
  ctx.strokeStyle = P.brassHi;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  // 弦
  ctx.strokeStyle = '#efe0c0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 16, yy - 22);
  ctx.lineTo(x, yy - 20 + recoil * 3);
  ctx.lineTo(x + 16, yy - 22);
  ctx.stroke();
  // 箭头那点亮光
  ctx.fillStyle = '#fff2b0';
  ctx.fillRect(x - 1.5, yy - 34, 3, 4);
}

function drawPlayer(ctx, x, y, t, recoil, moving) {
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
  drawCrossbow(ctx, x, y - 26 + bob, recoil, t);
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

function drawBuddy(ctx, id, x, y, t, s) {
  const map = BUDDY_PIX[id];
  if (!map) return;
  const u = 2 * (s || 1);
  const w = map[0].length * u;
  const h = map.length * u;
  let bob = 0;
  if (id === 'que') bob = Math.sin(t * 9) * 2 * (s || 1);
  else if (id === 'quan') bob = Math.abs(Math.sin(t * 8)) * -1.5 * (s || 1);
  pix(ctx, map, BUDDY_PAL[id], x - w / 2, y - h / 2 + bob, u);
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
  ctx.save();
  ctx.translate(g.x, g.y + wob);
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

function drawBullets(ctx, st) {
  for (const u of st.bullets) {
    const a = Math.atan2(u.vy, u.vx);
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.rotate(a);
    ctx.fillStyle = P.line;
    ctx.fillRect(-9, -2.5, 15, 5);
    ctx.fillStyle = u.bounced ? '#7dff9a' : P.brassHi;
    ctx.fillRect(-8, -1.2, 12, 2.4);
    ctx.fillStyle = '#fff6c8';
    ctx.fillRect(3, -2, 4, 4);
    ctx.restore();
  }
}

module.exports = { P, pix, drawPlayer, drawBuddy, drawIcon, drawBackground, drawDragon, drawBullets, star, fmtHp, bigText, clamp };
