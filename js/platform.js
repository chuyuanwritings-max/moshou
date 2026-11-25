// 平台层：只有这个文件知道自己跑在微信里还是浏览器里。
// 微信小游戏：wx.createCanvas / wx.onTouchStart / wx.createRewardedVideoAd
// 浏览器预览：一张 <canvas id="game">，用 pointer 事件（只用一种事件，免得一次点击被算两次）
const isWx = typeof wx !== 'undefined' && wx && typeof wx.createCanvas === 'function';

function setup(onTouch) {
  let canvas, width, height, dpr;
  if (isWx) {
    canvas = wx.createCanvas();
    const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
    width = info.windowWidth;
    height = info.windowHeight;
    dpr = info.pixelRatio || 2;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const send = (type) => (e) => {
      const list = e.changedTouches || [];
      for (let i = 0; i < list.length; i++) {
        onTouch(type, list[i].identifier, list[i].clientX, list[i].clientY);
      }
    };
    wx.onTouchStart((e) => {
      unlockAudio();
      send('down')(e);
    });
    wx.onTouchMove(send('move'));
    wx.onTouchEnd(send('up'));
    wx.onTouchCancel(send('up'));
  } else {
    canvas = document.getElementById('game');
    // 电脑上预览时装成一部手机大小；手机浏览器里就占满屏
    // 窗口还没显示出来时宽高是 0：先当成一部手机，免得画布变成 0×0
    const iw = window.innerWidth || 390;
    const ih = window.innerHeight || 844;
    const phone = iw > 520;
    width = phone ? 390 : iw;
    height = phone ? Math.max(480, Math.min(844, ih - 20)) : ih;
    dpr = window.devicePixelRatio || 2;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      unlockAudio();
      try {
        canvas.setPointerCapture(e.pointerId); // 指针已经抬起时会抛错；抛了也照样处理这次按下
      } catch (err) {}
      const p = pos(e);
      onTouch('down', e.pointerId, p[0], p[1]);
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e);
      onTouch('move', e.pointerId, p[0], p[1]);
    });
    const up = (e) => {
      const p = pos(e);
      onTouch('up', e.pointerId, p[0], p[1]);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }
  return { canvas, ctx: canvas.getContext('2d'), width, height, dpr };
}

function now() {
  return Date.now();
}

function nextFrame(fn) {
  return requestAnimationFrame(fn);
}

// 震动三档（照 00_震动手感规矩_1.0）：light 每一次有效的点、拿、放；成功用三下波浪 vibrateWave；heavy 一下 = 犯错、挨打。
// 同一帧里只震最重的那一下；两次至少隔 40 毫秒（没到就留到下一帧，和后面来的合成一下）。
// 旧写法 vibrate(true / false) 照旧能用：true = heavy，false = light。
const VIBE_RANK = { light: 1, medium: 2, heavy: 3 };
const VIBE_NAME = ['', 'light', 'medium', 'heavy'];
const VIBE_GAP = 40;
const WAVE_GAP = 80; // 波浪每下隔约 80 毫秒（规矩第三节第 3 条，Cc 11-25「嘣嘣嘣」）
let vibeOn = true;
let vibePending = 0;
let vibeLast = -1e9;
let wavePend = null; // 这一帧里叫的波浪（好几串只留最重的一串）
let waveCur = null; // 正在震的那串：{ lv: [3 档], i: 下一下是第几下, due: 什么时候能震 }
const vibeLog = []; // 测试打桩用：每次真震了记一笔 { t, type, w }（w = 波浪第几下，单下 = -1）
function vibrate(level) {
  const type = level === true ? 'heavy' : level === false || level === undefined ? 'light' : level;
  const k = VIBE_RANK[type] || 1;
  if (k > vibePending) vibePending = k;
}
// 成功的那一刻：三下，一下比一下轻。不叠串：新来的一串把还没震完的那串顶掉。
const WAVES = {
  small: ['medium', 'medium', 'light'], // 合成一件、叠阶、击杀
  combo: ['heavy', 'medium', 'medium'], // 连着击杀、整条龙碎光
  big: ['heavy', 'heavy', 'medium'], // 阿铸一锤、过关
};
const waveWeight = (lv) => lv.reduce((a, x) => a * 4 + (VIBE_RANK[x] || 1), 0);
function vibrateWave(kind) {
  const lv = WAVES[kind] || kind;
  if (!wavePend || waveWeight(lv) > waveWeight(wavePend)) wavePend = lv;
}
function flushVibrate() {
  if (!vibeOn) { vibePending = 0; wavePend = null; waveCur = null; return; }
  if (wavePend) { waveCur = { lv: wavePend, i: 0, due: 0 }; wavePend = null; }
  const t = Date.now();
  let want = vibePending;
  const waveDue = waveCur && t >= waveCur.due;
  if (waveDue) want = Math.max(want, VIBE_RANK[waveCur.lv[waveCur.i]] || 1);
  if (!want) return;
  if (t - vibeLast < VIBE_GAP) return; // 没隔够：下一帧再来
  const type = VIBE_NAME[want];
  vibePending = 0;
  let w = -1;
  if (waveDue) {
    w = waveCur.i++;
    waveCur.due = t + WAVE_GAP;
    if (waveCur.i >= waveCur.lv.length) waveCur = null;
  }
  vibeLast = t;
  vibeLog.push({ t, type, w });
  if (vibeLog.length > 500) vibeLog.shift();
  try {
    if (isWx && wx.vibrateShort) wx.vibrateShort({ type, fail() {} });
    else if (touched && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate({ light: 10, medium: 18, heavy: 32 }[type]);
  } catch (e) {} // 震不了就安静
}
function setVibrate(on) {
  vibeOn = !!on;
  vibePending = 0;
  wavePend = null;
  waveCur = null;
}

// 激励视频。填了广告位 id 且在微信里才放真广告，返回 true；
// 否则返回 false，由游戏自己放「广告占位」倒计时。
let rewardedAd = null;
function showRewardedAd(adUnitId, onReward, onSkip) {
  if (!isWx || !adUnitId || !wx.createRewardedVideoAd) return false;
  if (!rewardedAd) rewardedAd = wx.createRewardedVideoAd({ adUnitId });
  rewardedAd.offClose();
  rewardedAd.onClose((res) => {
    // 旧版基础库 res 为 undefined，算看完
    if (!res || res.isEnded) onReward();
    else onSkip();
  });
  rewardedAd.show().catch(() => {
    rewardedAd.load().then(() => rewardedAd.show()).catch(() => onReward());
  });
  return true;
}

// 音效：WebAudio（微信 wx.createWebAudioContext，浏览器 AudioContext）。放不出来就安静，不报错
const sfx = require('./sfx.js');
let audio = null;
const buffers = {};
let muted = false;
function audioCtx() {
  if (audio !== null) return audio;
  try {
    if (isWx && wx.createWebAudioContext) audio = wx.createWebAudioContext();
    else if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) audio = new (window.AudioContext || window.webkitAudioContext)();
    else audio = false;
  } catch (e) {
    audio = false;
  }
  return audio;
}
// 浏览器要在手指点下去的那一刻打开声音
let touched = false; // 浏览器要手指点过才准震动
function unlockAudio() {
  touched = true;
  const a = audioCtx();
  if (a && a.state === 'suspended' && a.resume) a.resume();
}
function sound(name, volume, rate) {
  if (muted) return;
  const a = audioCtx();
  if (!a) return;
  try {
    if (!buffers[name]) {
      const sr = 22050;
      const data = sfx.make(name, sr);
      if (!data) return;
      const buf = a.createBuffer(1, data.length, sr);
      buf.getChannelData(0).set(data);
      buffers[name] = buf;
    }
    const src = a.createBufferSource();
    src.buffer = buffers[name];
    if (rate && src.playbackRate) src.playbackRate.value = rate; // 连碎时音越来越高
    const g = a.createGain();
    g.gain.value = volume === undefined ? 0.6 : volume;
    src.connect(g);
    g.connect(a.destination);
    src.start(0);
  } catch (e) {
    // 放不出声音就算了
  }
}
function setMuted(v) {
  muted = !!v;
}

// 存档：微信用 wx.setStorageSync，浏览器用 localStorage
function load(key) {
  try {
    const raw = isWx ? wx.getStorageSync(key) : window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function save(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (isWx) wx.setStorageSync(key, raw);
    else window.localStorage.setItem(key, raw);
  } catch (e) {
    // 存不了就算了：原型里不影响玩
  }
}

// 离屏画布：背景、路这种不变的东西先画好，每帧贴上去
function createOffscreen(w, h) {
  let c;
  if (isWx) c = wx.createCanvas();
  else c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// 读一张图：读到了 im.ok = true；读不到就一直是 false（画面用代码画的顶上）
function loadImage(src) {
  let im;
  try {
    im = isWx ? wx.createImage() : typeof Image !== 'undefined' ? new Image() : null;
  } catch (e) {
    im = null;
  }
  if (!im) return { ok: false };
  im.ok = false;
  im.onload = () => (im.ok = true);
  im.onerror = () => (im.ok = false);
  im.src = src;
  return im;
}

function exposeForTest(name, value) {
  if (!isWx && typeof window !== 'undefined') window[name] = value;
}

module.exports = { isWx, setup, createOffscreen, loadImage, now, nextFrame, vibrate, vibrateWave, flushVibrate, setVibrate, vibeOn: () => vibeOn, vibeLog, showRewardedAd, load, save, exposeForTest, sound, unlockAudio, setMuted };
