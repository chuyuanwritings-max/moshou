// 主页：两张大卡，A 机关龙 / B 守城打龙，点哪张进哪种。
const PF = require('./platform.js');
const SH = require('./shell.js');
const { clamp, easeOutBack, roundRect, bigText } = require('./util.js');
const RD = require('./ram/draw.js');

const F = { w: 360, h: 720 };
const { ctx, width: W, height: H, dpr } = SH.view;
const scale = Math.min(W / F.w, H / F.h);
const ox = (W - F.w * scale) / 2;
const oy = (H - F.h * scale) / 2;
const bg = PF.loadImage('素材/bg_city.jpg');

const CARDS = [
  { id: 'mo', key: '新', name: '一攻一守', line: '五行合机关 · 守城墙、开车攻城', save: 'moshou06_v1', col: '#7a2a1e', y: 300, h: 150 },
  { id: 'ram', key: 'A', name: '机关龙', line: '0.5 旧玩法', save: 'moshou_ram_v1', col: '#5a3a2a', y: 478, h: 84, small: true },
  { id: 'defend', key: 'B', name: '守城打龙', line: '0.5 旧玩法', save: 'moshou_v1', col: '#2f4a40', y: 576, h: 84, small: true },
];

const M = { t: 0, press: null, pressT: 0 };
let last = PF.now();

function enter() {
  last = PF.now();
  M.press = null;
}

function onTouch(type, id, px, py) {
  if (type !== 'down' || M.press) return;
  const fx = (px - ox) / scale;
  const fy = (py - oy) / scale;
  for (const c of CARDS) {
    if (fx >= 24 && fx <= F.w - 24 && fy >= c.y && fy <= c.y + c.h) pick(c.id);
  }
}

// 点下去：卡片压一下，0.15 秒后进玩法（第一次进才加载那个玩法的代码）
function pick(id) {
  M.press = id;
  M.pressT = 0;
  PF.sound('pick', 0.5);
  PF.save('moshou_menu', { last: id });
}
function launch(id) {
  if (id === 'ram') require('./ram/main.js');
  else if (id === 'mo') require('./mo/main.js');
  else require('./main.js');
  SH.go(id);
}

function frame() {
  const now = PF.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  M.t += dt;
  if (M.press) {
    M.pressT += dt;
    if (M.pressT > 0.15) {
      const id = M.press;
      M.press = null;
      launch(id);
      return;
    }
  }
  render();
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#120d0a';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, F.w, F.h);
  ctx.clip();
  if (bg.ok) {
    const sc = Math.max(F.w / bg.width, F.h / bg.height);
    ctx.drawImage(bg, (F.w - bg.width * sc) / 2, (F.h - bg.height * sc) / 2, bg.width * sc, bg.height * sc);
  } else {
    ctx.fillStyle = '#b4864a';
    ctx.fillRect(0, 0, F.w, F.h);
  }
  ctx.fillStyle = 'rgba(14,9,6,0.55)';
  ctx.fillRect(0, 0, F.w, F.h);
  // 标题
  const k = easeOutBack(clamp(M.t / 0.45, 0, 1));
  bigText(ctx, '墨 守', F.w / 2, 150, 74 * k, '#ffd65a', RD.LINE);
  bigText(ctx, '墨家与公输家的机关之战', F.w / 2, 214, 17, '#fff3d8', RD.LINE);
  bigText(ctx, '选一种玩法', F.w / 2, 282, 15, '#e8d7b8', RD.LINE);
  CARDS.forEach((c, i) => drawCard(c, i));
  bigText(ctx, '原型 0.6 · 一攻一守（新）；下面两张是 0.5 旧玩法', F.w / 2, 690, 11, '#bfae92', RD.LINE);
  ctx.restore();
}

function drawCard(c, i) {
  const pressed = M.press === c.id;
  const appear = easeOutBack(clamp((M.t - 0.15 - i * 0.1) / 0.35, 0, 1));
  const s = pressed ? 0.95 : appear;
  const x = 24;
  const w = F.w - 48;
  const h = c.h;
  const y = c.y;
  ctx.save();
  ctx.translate(F.w / 2, y + h / 2);
  ctx.scale(s, s);
  ctx.translate(-F.w / 2, -(y + h / 2));
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, x + 4, y + 6, w, h, 18);
  ctx.fill();
  ctx.fillStyle = c.col;
  ctx.strokeStyle = RD.LINE;
  ctx.lineWidth = 3;
  roundRect(ctx, x, y, w, h, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, x + 6, y + 6, w - 12, 40, 12);
  ctx.fill();
  // 图标
  const sm = c.small;
  const ix = x + (sm ? 46 : 66);
  const iy = y + h / 2 + (sm ? 0 : 4);
  const ir = sm ? 30 : 46;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(ix, iy, ir, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(ix, iy);
  ctx.scale(sm ? 0.62 : 1, sm ? 0.62 : 1);
  ctx.translate(-ix, -iy);
  if (c.id === 'ram' || c.id === 'mo') {
    for (let k = 2; k >= 1; k--) RD.drawCar(ctx, ix + Math.sin(M.t * 3 + k) * 3, iy + 10 + k * 15, 0, k, M.t, 0);
    ctx.save();
    ctx.translate(ix, iy - 8);
    ctx.scale(1.5, 1.5);
    RD.drawHead(ctx, 0, 0, 0, Math.sin(M.t * 2) > 0.6 ? 1 : 0, M.t, 0);
    ctx.restore();
  } else {
    drawCrossbowIcon(ix, iy, M.t);
  }
  ctx.restore();
  // 字
  const tx = x + (sm ? 92 : 136);
  bigText(ctx, c.key, tx, y + (sm ? 30 : 38), sm ? 16 : 22, '#ffd65a', RD.LINE, 'left');
  bigText(ctx, c.name, tx + (sm ? 24 : 28), y + (sm ? 31 : 40), sm ? 20 : 30, '#fff8e6', RD.LINE, 'left');
  bigText(ctx, c.line, tx, y + (sm ? 60 : 84), sm ? 11 : 13, '#ffe9c4', RD.LINE, 'left');
  if (!sm) {
    const sv = PF.load(c.save);
    const done = sv && sv.cleared ? Object.keys(sv.cleared).length : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, tx, y + 104, 110, 26, 13);
    ctx.fill();
    bigText(ctx, '边城 ' + done + ' / 10 关', tx + 55, y + 117, 12, '#fff8e6', RD.LINE);
  }
  ctx.restore();
}

// B 的图标：一张朝上的连弩
function drawCrossbowIcon(x, y, t) {
  ctx.save();
  ctx.translate(x, y + 6);
  ctx.strokeStyle = RD.LINE;
  ctx.lineWidth = 2;
  ctx.fillStyle = '#6b4424';
  roundRect(ctx, -9, -22, 18, 54, 5);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-38, -4);
  ctx.quadraticCurveTo(0, -30, 38, -4);
  ctx.stroke();
  ctx.strokeStyle = RD.BRASS;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = '#e8d9b0';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-38, -4);
  ctx.lineTo(0, 10);
  ctx.lineTo(38, -4);
  ctx.stroke();
  // 箭
  const k = (t * 1.2) % 1;
  ctx.strokeStyle = RD.LINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 8 - k * 40);
  ctx.lineTo(0, -26 - k * 40);
  ctx.stroke();
  ctx.fillStyle = '#cfd6dd';
  ctx.beginPath();
  ctx.moveTo(-4, -26 - k * 40);
  ctx.lineTo(0, -36 - k * 40);
  ctx.lineTo(4, -26 - k * 40);
  ctx.fill();
  ctx.restore();
}

SH.register('menu', { onTouch, frame, enter });
SH.go('menu');
PF.exposeForTest('__menu', { pick, launch, scale, ox, oy, CARDS });
