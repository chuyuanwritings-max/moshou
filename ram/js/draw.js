// 《墨守》0.4「你当机关龙」· 画法（风格库 LDR-S1E08-a 祝有好收获：细褐线、平涂一层硬影、黄铜一道白高光）
const C = require('./config.js');
const PF = require('./platform.js');
const { roundRect, bigText, mix, clamp } = require('./util.js');

const LINE = '#1E1A16';
const BRASS = '#d9a441';
const BRASS_D = '#9a6a22';
const BRASS_L = '#f3d27a';
const RED = '#c8402c';
const HALF = C.BLOCK / 2;

// —— 地面：每个地方一块离屏贴图，往下滚着贴 ——
const groundCache = {};
function groundTile(ch) {
  if (groundCache[ch.id]) return groundCache[ch.id];
  const w = C.FIELD.w;
  const h = 288;
  const c = PF.createOffscreen(w, h);
  const g = c.getContext('2d');
  g.fillStyle = ch.ground;
  g.fillRect(0, 0, w, h);
  // 大块的深浅
  let s = 7;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = ch.ground2;
    g.globalAlpha = 0.5;
    g.beginPath();
    g.ellipse(R() * w, R() * h, 20 + R() * 40, 8 + R() * 16, R() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // 车辙：每条道两道浅沟
  g.strokeStyle = ch.crack;
  g.globalAlpha = 0.18;
  g.lineWidth = 2;
  for (let i = 1; i < C.LANES; i++) {
    g.beginPath();
    g.moveTo(C.CELL * i, 0);
    g.lineTo(C.CELL * i, h);
    g.stroke();
  }
  // 裂纹和碎石
  g.globalAlpha = 0.55;
  g.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    let x = R() * w;
    let y = R() * h;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (R() - 0.5) * 26;
      y += 6 + R() * 12;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 40; i++) {
    g.fillStyle = R() < 0.5 ? ch.crack : mix(ch.ground, '#ffffff', 0.25);
    g.fillRect(R() * w, R() * h, 2 + R() * 2, 2);
  }
  groundCache[ch.id] = c;
  return c;
}

function drawGround(ctx, ch, scroll) {
  const tile = groundTile(ch);
  const h = tile.height;
  const off = ((scroll % h) + h) % h;
  for (let y = off - h; y < C.FIELD.h; y += h) ctx.drawImage(tile, 0, y, C.FIELD.w, h);
}

// —— 木栅栏 ——
function drawFence(ctx, x, yTop, yBot) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x - 1, yTop + 4, 7, yBot - yTop);
  ctx.fillStyle = '#8a5a2b';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x - 4, yTop, 8, yBot - yTop, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#b07a3e';
  ctx.fillRect(x - 2, yTop + 3, 2, yBot - yTop - 6);
  // 绑绳
  ctx.strokeStyle = '#e2c48a';
  ctx.lineWidth = 2;
  for (let y = yTop + 10; y < yBot - 6; y += 22) {
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x + 5, y + 4);
    ctx.stroke();
  }
}

// —— 城砖 / 弩塔 / 城门 ——
function brickColor(ch, b) {
  const num = b.num || 5;
  if (b.n0 <= Math.floor(num / 2)) return ch.brick[0];
  if (b.n0 <= num) return ch.brick[1];
  return ch.brick[2];
}

function drawBlock(ctx, ch, b, y, t, shake) {
  if (b.kind === 'gate') return drawGate(ctx, b, y, t, shake);
  const x = b.x + (shake ? (Math.random() - 0.5) * shake : 0);
  const s = C.BLOCK;
  const col = brickColor(ch, b);
  // 硬影
  ctx.fillStyle = 'rgba(20,12,6,0.35)';
  roundRect(ctx, x - HALF + 4, y - HALF + 5, s, s, 6);
  ctx.fill();
  ctx.fillStyle = col;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  roundRect(ctx, x - HALF, y - HALF, s, s, 6);
  ctx.fill();
  // 下半一层硬影
  ctx.fillStyle = mix(col, '#000000', 0.22);
  ctx.fillRect(x - HALF + 2, y + HALF - 14, s - 4, 12);
  ctx.stroke();
  // 砖缝
  ctx.strokeStyle = mix(col, '#000000', 0.35);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - HALF + 4, y - 8);
  ctx.lineTo(x + HALF - 4, y - 8);
  ctx.moveTo(x - 6, y - HALF + 3);
  ctx.lineTo(x - 6, y - 8);
  ctx.moveTo(x + 12, y - 8);
  ctx.lineTo(x + 12, y + HALF - 14);
  ctx.stroke();
  // 被啃掉的裂口
  const dmg = 1 - b.n / b.n0;
  if (dmg > 0) {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 8, y + HALF);
    ctx.lineTo(x - 2, y + HALF - 14 * dmg - 4);
    ctx.lineTo(x + 6, y + HALF - 22 * dmg - 4);
    ctx.lineTo(x + 2, y + HALF - 32 * dmg);
    ctx.stroke();
  }
  if (b.kind === 'tower') drawTowerTop(ctx, x, y, t, b);
  bigText(ctx, String(b.n), x, b.kind === 'tower' ? y + 12 : y + 2, b.n >= 100 ? 22 : 28, '#fff8e6', LINE);
}

// 弩塔：砖上架一张朝下的连弩 + 小红旗
function drawTowerTop(ctx, x, y, t, b) {
  // 旗
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 22, y - HALF + 2);
  ctx.lineTo(x + 22, y - HALF - 16);
  ctx.stroke();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(x + 22, y - HALF - 16);
  ctx.lineTo(x + 34 + Math.sin(t * 6) * 2, y - HALF - 12);
  ctx.lineTo(x + 22, y - HALF - 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 弩（朝下射）：横臂 + 箭槽
  const pull = b.cd < 0.3 ? (0.3 - b.cd) * 10 : 0;
  ctx.fillStyle = '#6b4424';
  roundRect(ctx, x - 6, y - 20, 12, 26, 3);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 22, y - 10 - pull);
  ctx.quadraticCurveTo(x, y - 2, x + 22, y - 10 - pull);
  ctx.stroke();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = BRASS_L;
  ctx.fillRect(x - 1, y - 18, 2, 12);
}

function drawGate(ctx, b, y, t, shake) {
  const w = C.FIELD.w;
  const h = 92;
  const top = y - h / 2 - 34;
  const dx = shake ? (Math.random() - 0.5) * shake : 0;
  ctx.save();
  ctx.translate(dx, 0);
  // 城墙
  ctx.fillStyle = '#7d6a55';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.fillRect(0, top - 40, w, h + 74);
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? '#8d7962' : '#6f5d4a';
    ctx.fillRect(i * 36, top - 58, 24, 20);
    ctx.strokeRect(i * 36, top - 58, 24, 20);
  }
  ctx.strokeRect(0, top - 40, w, h + 74);
  ctx.strokeStyle = 'rgba(30,26,22,0.4)';
  ctx.lineWidth = 1;
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 10; c++) ctx.strokeRect(c * 40 + (r % 2) * 20 - 20, top - 40 + r * 20, 40, 20);
  }
  // 门洞 + 两扇红门
  const gx = w / 2;
  const gw = 220;
  ctx.fillStyle = '#2a1a10';
  ctx.beginPath();
  ctx.moveTo(gx - gw / 2, y + h / 2);
  ctx.lineTo(gx - gw / 2, top + 24);
  ctx.quadraticCurveTo(gx, top - 22, gx + gw / 2, top + 24);
  ctx.lineTo(gx + gw / 2, y + h / 2);
  ctx.closePath();
  ctx.fill();
  const dmg = 1 - b.n / b.n0;
  ctx.fillStyle = mix('#b8342a', '#5a1a12', dmg * 0.6);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    const x0 = gx + side * 2;
    const x1 = gx + side * (gw / 2 - 6);
    ctx.moveTo(x0, y + h / 2);
    ctx.lineTo(x0, top + 6);
    ctx.lineTo(x1, top + 26);
    ctx.lineTo(x1, y + h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 铜钉
    ctx.fillStyle = BRASS;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const px = gx + side * (18 + c * 24);
        const py = top + 36 + r * 22;
        ctx.beginPath();
        ctx.arc(px, py, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.fillStyle = mix('#b8342a', '#5a1a12', dmg * 0.6);
  }
  // 裂缝随伤害变多
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  for (let k = 0; k < Math.floor(dmg * 7); k++) {
    const sx = gx + ((k * 53) % 180) - 90;
    ctx.beginPath();
    ctx.moveTo(sx, y + h / 2);
    ctx.lineTo(sx + 8, y + h / 2 - 20 - k * 4);
    ctx.lineTo(sx - 4, y + h / 2 - 34 - k * 5);
    ctx.stroke();
  }
  // 门匾数字
  ctx.fillStyle = '#2b1c12';
  roundRect(ctx, gx - 46, top - 34, 92, 40, 6);
  ctx.fill();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 2;
  ctx.stroke();
  bigText(ctx, String(b.n), gx, top - 13, 30, '#ffd65a', LINE);
  ctx.restore();
}

// —— 零件和道具 ——
function drawGear(ctx, x, y, r, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 1.5);
  ctx.fillStyle = BRASS;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? r : r * 0.74;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = BRASS_D;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, -2.4, -1.6);
  ctx.stroke();
}

function drawItem(ctx, it, y, t) {
  const bob = Math.sin(t * 4 + it.x) * 2;
  if (it.kind === 'part') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(it.x + 2, y + 13, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    drawGear(ctx, it.x, y + bob, 11, t);
    bigText(ctx, String(it.n), it.x, y - 19 + bob, 15, '#fff8e6', LINE);
    return;
  }
  const blink = 0.75 + Math.sin(t * 10) * 0.25;
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.fillStyle = 'rgba(255,240,180,0.35)';
  ctx.beginPath();
  ctx.arc(it.x, y + bob, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawPowerIcon(ctx, it.kind, it.x, y + bob, 1);
}

function drawPowerIcon(ctx, kind, x, y, k) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.8;
  if (kind === 'shield') {
    ctx.fillStyle = BRASS;
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(13, -9);
    ctx.lineTo(10, 7);
    ctx.lineTo(0, 15);
    ctx.lineTo(-10, 7);
    ctx.lineTo(-13, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(0, -1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-8, -7);
    ctx.lineTo(-6, 3);
    ctx.stroke();
  } else if (kind === 'bomb') {
    ctx.fillStyle = '#8a4f24';
    roundRect(ctx, -11, -11, 22, 24, 5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-11, -4);
    ctx.lineTo(11, -4);
    ctx.moveTo(-11, 6);
    ctx.lineTo(11, 6);
    ctx.stroke();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.quadraticCurveTo(6, -18, 4, -22);
    ctx.stroke();
    ctx.fillStyle = '#ffcf4a';
    ctx.beginPath();
    ctx.arc(4, -23, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 磁石：红色马蹄
    ctx.lineWidth = 8;
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    ctx.arc(0, 0, 10, Math.PI, 0, true);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = RED;
    ctx.stroke();
    ctx.fillStyle = '#dfe3e8';
    ctx.fillRect(-14, -2, 8, 7);
    ctx.fillRect(6, -2, 8, 7);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = LINE;
    ctx.strokeRect(-14, -2, 8, 7);
    ctx.strokeRect(6, -2, 8, 7);
  }
  ctx.restore();
}

// —— 弩箭（朝下飞）——
function drawBolt(ctx, x, y) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x, y + 6);
  ctx.stroke();
  ctx.strokeStyle = '#e8d9b0';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#cfd6dd';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 4);
  ctx.lineTo(x, y + 13);
  ctx.lineTo(x + 4, y + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x - 5, y - 22);
  ctx.lineTo(x, y - 12);
  ctx.lineTo(x + 5, y - 22);
  ctx.closePath();
  ctx.fill();
}

// —— 机关龙：车厢 + 龙首 ——
function drawCar(ctx, x, y, a, i, t, hurt) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  const s = 11;
  ctx.fillStyle = 'rgba(20,12,6,0.32)';
  roundRect(ctx, -s + 3, -s + 4, s * 2, s * 2, 5);
  ctx.fill();
  const base = hurt > 0 ? mix(BRASS, '#ff4a2a', hurt) : i % 3 === 0 ? '#c98f35' : BRASS;
  ctx.fillStyle = base;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.6;
  roundRect(ctx, -s, -s, s * 2, s * 2, 5);
  ctx.fill();
  ctx.fillStyle = mix(base, '#000000', 0.25);
  ctx.fillRect(-s + 2, s - 6, s * 2 - 4, 4);
  ctx.stroke();
  // 轮子
  ctx.fillStyle = '#3a2a1c';
  for (const sx of [-s - 2, s - 1]) {
    ctx.fillRect(sx, -6, 3, 4);
    ctx.fillRect(sx, 3, 3, 4);
  }
  // 铆钉
  ctx.fillStyle = BRASS_D;
  for (const [px, py] of [[-6, -6], [6, -6], [-6, 4], [6, 4]]) {
    ctx.beginPath();
    ctx.arc(px, py, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // 高光
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-7, -8);
  ctx.lineTo(-7, 0);
  ctx.stroke();
  // 每三节一根小烟囱
  if (i % 3 === 1) {
    ctx.fillStyle = '#5a3d22';
    ctx.fillRect(-3, -3, 6, 6);
    ctx.strokeStyle = LINE;
    ctx.strokeRect(-3, -3, 6, 6);
  }
  ctx.restore();
}

function drawHead(ctx, x, y, a, chew, t, shield) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  const open = chew > 0 ? Math.abs(Math.sin(t * 28)) * 7 : 1.5;
  // 影
  ctx.fillStyle = 'rgba(20,12,6,0.32)';
  ctx.beginPath();
  ctx.ellipse(3, 5, 16, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.8;
  // 角
  ctx.fillStyle = BRASS_L;
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sd * 8, 4);
    ctx.quadraticCurveTo(sd * 20, 10, sd * 18, 22);
    ctx.lineTo(sd * 12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // 上颚 / 下颚（朝上张）
  ctx.fillStyle = '#7a1e14';
  ctx.beginPath();
  ctx.ellipse(0, -12, 9, 6 + open * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BRASS;
  ctx.beginPath();
  ctx.moveTo(-14, 4);
  ctx.lineTo(-11, -14 - open);
  ctx.quadraticCurveTo(0, -24 - open, 11, -14 - open);
  ctx.lineTo(14, 4);
  ctx.quadraticCurveTo(0, 18, -14, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 牙
  ctx.fillStyle = '#fff8e6';
  for (const px of [-7, -2, 3, 8]) {
    ctx.beginPath();
    ctx.moveTo(px - 2, -13 - open);
    ctx.lineTo(px, -8 - open * 0.4);
    ctx.lineTo(px + 2, -13 - open);
    ctx.fill();
  }
  // 鼻梁硬影 + 高光
  ctx.fillStyle = BRASS_D;
  ctx.beginPath();
  ctx.moveTo(4, -12);
  ctx.lineTo(12, 2);
  ctx.lineTo(4, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-6, -10);
  ctx.lineTo(-8, 0);
  ctx.stroke();
  // 红灯眼
  ctx.fillStyle = '#ff3b1f';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.2;
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sd * 7, -2, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,90,40,0.35)';
  ctx.beginPath();
  ctx.arc(-7, -2, 7, 0, Math.PI * 2);
  ctx.arc(7, -2, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (shield > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 12);
    ctx.strokeStyle = BRASS_L;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

module.exports = { LINE, BRASS, BRASS_L, BRASS_D, RED, drawGround, drawFence, drawBlock, drawItem, drawPowerIcon, drawBolt, drawCar, drawHead, drawGear, clamp };
