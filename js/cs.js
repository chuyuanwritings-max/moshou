// 过场动画（照《潜水员戴夫》逐帧拆出来的节拍：长停、极短爆发；播放器和模板在 js/cutscene/，原件在 00_过场动画技能/）
// 两种玩法共用。图都用代码画在离屏画布上（等 MJ / Gemini 出了立绘再换成真图）。
// 第一次看完整版，第二次起自动短版；点一下跳过；奖励在过场前就已经给了。
const PF = require('./platform.js');
const { createCutscene } = require('./cutscene/cutscene.js');
const T = require('./cutscene/templates.js');
const { roundRect, bigText } = require('./util.js');

const W = 360;
const H = 720;
const LINE = '#1E1A16';
const SEEN_KEY = 'moshou_cs';
const seen = PF.load(SEEN_KEY) || {};
const SFX = { charge: 'chest', clang: 'clang', whoosh: 'whoosh', success: 'evolve', sting: 'alarm', ding: 'tap', bonk: 'thud', clatter: 'break' };

const clone = (o) => JSON.parse(JSON.stringify(o));
function canvas(w, h, fn) {
  const c = PF.createOffscreen(w, h);
  const g = c.getContext('2d');
  fn(g, w, h);
  return c;
}

// —— 通用底图 ——
let _bgDark = null;
function bgDark() {
  if (_bgDark) return _bgDark;
  _bgDark = canvas(W, H, (g) => {
    const gr = g.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H * 0.45, H * 0.7);
    gr.addColorStop(0, '#3a2a1c');
    gr.addColorStop(1, '#0a0705');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  });
  return _bgDark;
}
// 比喻底图：火焰爆炸（狠角色配火焰）
let _bgFire = null;
function bgFire() {
  if (_bgFire) return _bgFire;
  _bgFire = canvas(W, H, (g) => {
    g.fillStyle = '#5a0f06';
    g.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * 0.5;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      g.fillStyle = i % 2 ? '#ff7a1a' : '#ffcf3a';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a - 0.09) * 900, cy + Math.sin(a - 0.09) * 900);
      g.lineTo(cx + Math.cos(a + 0.09) * 900, cy + Math.sin(a + 0.09) * 900);
      g.closePath();
      g.fill();
    }
    const gr = g.createRadialGradient(cx, cy, 10, cx, cy, 260);
    gr.addColorStop(0, '#fff6c0');
    gr.addColorStop(0.5, 'rgba(255,170,40,0.7)');
    gr.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  });
  return _bgFire;
}

// 锤子 + 胳膊（举起 / 落下），给「升级/强化」用。物件在屏幕 74% 高处，胳膊从屏幕底下伸上来
function hammerArm(down) {
  return canvas(360, 440, (g) => {
    const len = down ? 150 : 250; // 落下时胳膊看起来短（往前砸），锤头正好落在物件上
    g.translate(180, 440);
    g.rotate(down ? 0.12 : -0.18);
    g.strokeStyle = LINE;
    g.lineWidth = 5;
    g.fillStyle = '#c98a5c';
    roundRect(g, -34, -len, 68, len, 30);
    g.fill();
    g.stroke();
    g.fillStyle = '#a86e46';
    g.fillRect(8, -len + 10, 20, len - 20);
    g.fillStyle = '#c8402c';
    g.fillRect(-36, -len - 18, 72, 30);
    g.strokeRect(-36, -len - 18, 72, 30);
    g.fillStyle = '#c98a5c';
    roundRect(g, -40, -len - 70, 80, 56, 22);
    g.fill();
    g.stroke();
    // 锤柄横着，锤头在拳头左边（砸下去时朝下）
    g.save();
    g.translate(0, -len - 44);
    g.rotate(down ? -1.45 : -0.35);
    g.fillStyle = '#6b4424';
    g.fillRect(-10, -120, 20, 120);
    g.strokeRect(-10, -120, 20, 120);
    g.fillStyle = '#d9a441';
    roundRect(g, -64, -170, 128, 56, 10);
    g.fill();
    g.stroke();
    g.fillStyle = '#9a6a22';
    g.fillRect(-60, -128, 120, 12);
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(-48, -158);
    g.lineTo(-12, -158);
    g.stroke();
    g.restore();
  });
}
let _hammer = null;
function hammers() {
  if (!_hammer) _hammer = { up: hammerArm(false), down: hammerArm(true) };
  return _hammer;
}

// 用某个画图函数画一张方图（物件、龙首）
function iconCanvas(size, fn) {
  return canvas(size, size, (g) => fn(g, size / 2, size / 2));
}

// —— 管理：开播、每帧、跳过 ——
// createCutscene 在开播时就要 ctx：包一层，画的时候才给
function start(ctx, timeline, images, onEnd, sfx) {
  const key = timeline.id + (timeline.key || '');
  const short = !!seen[key];
  seen[key] = 1;
  PF.save(SEEN_KEY, seen);
  return createCutscene({
    ctx,
    width: W,
    height: H,
    images: Object.assign({ bgDark: bgDark() }, images),
    timeline,
    short,
    onSfx: (n) => sfx && sfx(SFX[n] || n),
    onEnd,
  });
}

// A 升级/强化 → 进化：举锤、落锤 2 帧、白闪推镜、三圈光环、亮相
function evolve(ctx, o) {
  const tl = clone(T.upgrade);
  tl.key = '_evo';
  const pose = tl.beats.find((b) => b.id === 'pose');
  pose.fx.forEach((f) => {
    if (f.fx === 'text') {
      f.str = '进化！' + o.name;
      f.size = 30;
    }
    if (f.fx === 'rays') f.color = '#FFD65A';
  });
  const hm = hammers();
  const images = {
    heroRaise: hm.up,
    heroStrike: hm.down,
    item: iconCanvas(340, (g, x, y) => o.drawOld(g, x, y)),
    itemNew: iconCanvas(340, (g, x, y) => o.drawNew(g, x, y)),
  };
  return start(ctx, tl, images, o.onEnd, o.sfx);
}

// C 成功反应 → 撞开城门：龙首平静 → 张嘴吼（硬切 + 闪）→ 火焰爆炸底 → 红眼亮相 → 回落
function victory(ctx, o) {
  const tl = clone(T.taste);
  tl.key = '_win';
  tl.layers.forEach((L) => {
    if (L.img === 'bgHearts') L.img = 'bgFire';
    if (L.id === 'hero') {
      L.pos = [0.5, 0.62];
      L.anchor = [0.5, 0.5];
      L.h = 0.42;
    }
  });
  tl.beats.forEach((b) => {
    (b.fx || []).forEach((f) => {
      if (f.fx === 'text' && f.str) f.str = o.title || '城门破了！';
      if (f.fx === 'particles' && f.preset === 'hearts') f.preset = 'spark';
    });
  });
  const images = {
    heroTaste: iconCanvas(260, (g, x, y) => o.drawHead(g, x, y, 0)),
    heroShock: iconCanvas(260, (g, x, y) => o.drawHead(g, x, y, 1)),
    heroBliss: iconCanvas(260, (g, x, y) => o.drawHead(g, x, y, 2)),
    bgFire: bgFire(),
  };
  return start(ctx, tl, images, o.onEnd, o.sfx);
}

// E 章节转场 → 换地方：黑 → 地名 → 背景图慢推 → 白闪
function chapter(ctx, o) {
  const tl = clone(T.chapter);
  tl.key = '_' + o.id;
  tl.beats.forEach((b) => {
    (b.fx || []).forEach((f) => {
      if (f.fx === 'text' && f.str && f.size >= 24) f.str = o.title;
      else if (f.fx === 'text' && f.str) f.str = o.line;
    });
  });
  const images = { keyArt: o.img && o.img.ok ? o.img : bgDark() };
  return start(ctx, tl, images, o.onEnd, o.sfx);
}

// F 运镜大图 → 每关开局：镜头从城楼摇过边城全景，停一下，「啪」地硬切推到这一关的敌人（Boss 关推到 Boss），出字
// 全景用 MJ 出的横幅 pano_city.jpg（1536×660，2.33:1）；没加载到时退回把竖图 bg_city 横着裁一条。敌人用 o.drawFocus 画在全景上。
// 镜头的单位是屏宽 / 屏高（360×720）。全景铺满屏高 → 宽 1676，左右能摇 ±1.83 屏宽。
const PANO_H = 720;
const PAN_FROM = [-1.6, 0]; // 开头停在左边的城楼
const PAN_SWEEP = [0.75, 0]; // 慢摇到土路尽头
const FOCUS = [1.21, 0.22]; // 硬切停在龙身上：全景左起 76%、上起 72%（地平线 64% 下面的荒地上，不飘在天上）
function panoW(o) {
  return o.pano && o.pano.ok ? Math.round((PANO_H * o.pano.width) / o.pano.height) : 1296;
}
function panorama(o) {
  const PW = panoW(o);
  return canvas(PW, PANO_H, (g) => {
    if (o.pano && o.pano.ok) {
      g.drawImage(o.pano, 0, 0, PW, PANO_H); // 整张铺满
    } else if (o.img && o.img.ok) {
      // 退路：竖图横着裁一条（城墙、楼阁那一带）
      const img = o.img;
      const sc = PW / img.width;
      const cy = img.height * sc * 0.55;
      g.drawImage(img, 0, (cy - PANO_H / 2) / sc, img.width, PANO_H / sc, 0, 0, PW, PANO_H);
    } else {
      const gr = g.createLinearGradient(0, 0, 0, PANO_H);
      gr.addColorStop(0, '#5a3a1e');
      gr.addColorStop(1, '#1a120c');
      g.fillStyle = gr;
      g.fillRect(0, 0, PW, PANO_H);
    }
    // 敌人画在镜头最后硬切停住的地方
    const fx = PW / 2 + FOCUS[0] * W;
    const fy = PANO_H / 2 + FOCUS[1] * H;
    if (o.drawFocus) o.drawFocus(g, fx, fy);
  });
}
function levelPan(ctx, o) {
  const tl = clone(T.pan);
  tl.key = '_lv' + o.id;
  // 退路全景只有 1296 宽，起点不能摇出边
  const lim = (panoW(o) / 2 - W / 2) / W - 0.05;
  tl.beats.forEach((b) => {
    (b.fx || []).forEach((f) => {
      if (f.fx === 'camera' && f.pan) {
        if (b.id === 'black') f.pan = [Math.max(-lim, PAN_FROM[0]), PAN_FROM[1]];
        else if (b.id === 'sweep') f.pan = PAN_SWEEP.slice();
        else if (b.id === 'punch') f.pan = FOCUS.slice();
      }
      if (f.fx === 'text' && f.size >= 30) f.str = o.title;
      else if (f.fx === 'text' && f.str) {
        f.str = o.place;
        f.size = 17;
      }
    });
  });
  return start(ctx, tl, { panorama: panorama(o) }, o.onEnd, o.sfx);
}

module.exports = { evolve, victory, chapter, levelPan, W, H, seen };
