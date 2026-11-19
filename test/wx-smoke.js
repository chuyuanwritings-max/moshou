// 假装成微信小游戏环境跑 game.js：没有 document、没有 window，只有 wx。
// 能跑完 = 代码里没偷偷用网页才有的东西。用法：node test/wx-smoke.js
const path = require('path');
const calls = new Set();
const ctx = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    return (...a) => { calls.add(k); };
  },
  set(t, k, v) { t[k] = v; return true; },
});
const handlers = {};
const frames = [];
let clock = 0;
global.wx = {
  createCanvas: () => ({ width: 0, height: 0, getContext: () => ctx }),
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3 }),
  onTouchStart: (f) => (handlers.down = f),
  onTouchMove: (f) => (handlers.move = f),
  onTouchEnd: (f) => (handlers.up = f),
  onTouchCancel: () => {},
  vibrateShort: () => {},
  getStorageSync: () => '',
  setStorageSync: () => {},
};
global.requestAnimationFrame = (f) => frames.push(f);
const realNow = Date.now;
Date.now = () => (clock += 16);
if (typeof global.document !== 'undefined' || typeof global.window !== 'undefined') throw new Error('环境不干净');

require(path.join(__dirname, '..', 'game.js'));
const run = (n) => { for (let i = 0; i < n; i++) { const f = frames.shift(); if (f) f(); } };
run(5);
const touch = (type, x, y) => handlers[type]({ changedTouches: [{ identifier: 1, clientX: x, clientY: y }] });
// 按住左右滑一会儿，再点几下屏幕中间（三选一卡片的位置）
touch('down', 195, 760);
for (let i = 0; i < 600; i++) { touch('move', 195 + Math.sin(i / 20) * 150, 760); run(1); }
touch('up', 195, 760);
for (let k = 0; k < 20; k++) { touch('down', 195, 420); touch('up', 195, 420); run(30); }
run(300);
Date.now = realNow;
console.log('微信环境跑通：' + frames.length + ' 帧排队中，画图调用 ' + calls.size + ' 种');
if (!handlers.down || !calls.has('fillRect') || !calls.has('drawImage')) throw new Error('没画出东西或没注册触摸');
