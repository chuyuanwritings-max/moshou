// 5 个过场模板（2026-11-21）。帧数按 60fps；坐标 0～1；竖屏 375×667 调的，横屏也能播。
// 图片名是占位：真做时按「出图清单」出图，名字对上就行。
// 每个模板的节拍顺序、时长理由见 00_过场动画制作_技能_1.0.md。
(function (root) {
  const DARK = { cy: 0.45, inner: 0.22, outer: 0.62, strength: 0.8 };

  const T = {};

  // A 升级 / 强化：暗入 → 蓄力停 → 聚能 → 出手 2 帧 → 命中闪 + 三段推镜 → 光环 ×3 → 光环扩出 → 亮相 → 白闪收
  T.upgrade = {
    id: 'upgrade', name: 'A 升级/强化', fps: 60, bg: '#0A0A0A', vignette: DARK, short: { from: 'strike', drop: ['ring'], dur: { pose: 36 } },
    layers: [
      { id: 'bg', img: 'bgDark', fit: 'cover', z: 0 },
      { id: 'hero', img: 'heroRaise', z: 1, pos: [0.5, 1.0], anchor: [0.5, 1], h: 0.62, alpha: 0 },
      { id: 'item', img: 'item', z: 2, pos: [0.5, 0.74], anchor: [0.5, 0.5], h: 0.12 },
    ],
    beats: [
      { id: 'dark-in', type: 'darkIn', dur: 30,
        tracks: [{ layer: 'hero', prop: 'alpha', from: 0, to: 1, dur: 24, ease: 'out' }],
        fx: [{ at: 0, fx: 'fade', from: 1, to: 0, dur: 24 }] },
      { id: 'hold', type: 'hold', dur: 45,
        tracks: [{ layer: 'hero', prop: 'scale', from: 1, to: 1.02, ease: 'breathe' }],
        fx: [{ at: 0, fx: 'glow', origin: [0.5, 0.74], r0: 14, r1: 18, dur: 45, color: '#FF9A3A', z: 1.5 }] },
      { id: 'charge', type: 'charge', dur: 50,
        fx: [{ at: 0, fx: 'glow', origin: [0.5, 0.74], r0: 8, r1: 70, grow: 50, dur: 50, color: '#9FF4FF', z: 3 },
             { at: 0, fx: 'strobe', pattern: [2, 6, 1, 8], min: 0, max: 0.7, local: [0.5, 0.74, 0.35], dur: 50 },
             { at: 0, sfx: 'charge' }] },
      { id: 'strike', type: 'strike', dur: 3,
        frames: [{ f: 0, layer: 'hero', img: 'heroStrike', smear: { sx: 1.15, sy: 0.92, lines: 6 } },
                 { f: 2, layer: 'hero', img: 'heroStrike' }] },
      { id: 'impact', type: 'impact', dur: 18,
        fx: [{ at: 0, fx: 'flash', color: '#EEEEEE', alpha: 0.7, decay: 15 },
             { at: 0, fx: 'shake', amp: 6, dur: 8 },
             { at: 0, fx: 'particles', preset: 'spark', n: 28, origin: [0.5, 0.72], z: 3 },
             { at: 0, fx: 'star', origin: [0.5, 0.72], size: 0.12, z: 3 },
             { at: 0, fx: 'camera', steps: [1.08, 1.18, 1.3], stepDur: 3, focus: [0.5, 0.72] },
             { at: 0, sfx: 'clang' }] },
      { id: 'swap', type: 'swap', dur: 2,
        frames: [{ f: 0, layer: 'hero', visible: false }, { f: 0, layer: 'item', img: 'itemNew', pos: [0.5, 0.5], scale: 2.2 }],
        fx: [{ at: 0, fx: 'camera', to: 1, dur: 0, focus: [0.5, 0.5] }] },
      { id: 'ring', type: 'ring', dur: 30, repeat: 3,
        fx: [{ at: 0, fx: 'flash', color: '#DDE6EE', alpha: 0.35, decay: 4 },
             { at: 0, fx: 'ring', origin: [0.5, 0.52], rx: 0.4, ry: 0.07, dur: 30, z: 3 },
             { at: 0, sfx: 'whoosh' }] },
      { id: 'ring-out', type: 'ring', dur: 30,
        fx: [{ at: 0, fx: 'ring', origin: [0.5, 0.52], rx: 0.4, ry: 0.07, dur: 30, expand: true, z: 3 },
             { at: 6, fx: 'flash', color: '#EEF4F8', alpha: 0.55, decay: 22 }] },
      { id: 'pose', type: 'pose', dur: 70,
        tracks: [{ layer: 'item', prop: 'scale', from: 2.2, to: 2.35, ease: 'out' }],
        fx: [{ at: 0, fx: 'rays', origin: [0.5, 0.5], z: 1, fadeIn: 10, alpha: 0.28, color: '#9FE8FF', dur: 70 },
             { at: 0, fx: 'particles', preset: 'dust', n: 24, z: 4, dur: 70 },
             { at: 8, fx: 'text', str: '强化成功', in: 'pop', pos: [0.5, 0.78], size: 34, color: '#FFE24A', dur: 62 },
             { at: 8, sfx: 'success' }] },
      { id: 'out', type: 'out', dur: 8,
        fx: [{ at: 0, fx: 'flash', alpha: 1, hold: 3, decay: 5 }] },
    ],
  };

  // B 角色登场：黑 → 全白闪 → 剪影 6 帧 → 上色亮相（推镜 + 集中线 + 光柱 + 名字卡）→ 停 → 淡黑
  T.intro = {
    id: 'intro', name: 'B 角色登场', fps: 60, bg: '#0A0A0A', vignette: DARK, short: { from: 'reveal', dur: { hold: 20 } },
    layers: [
      { id: 'bg', img: 'bgDark', fit: 'cover', z: 0 },
      { id: 'hero', img: 'heroSil', z: 1, pos: [0.5, 1.0], anchor: [0.5, 1], h: 0.7, alpha: 0 },
    ],
    beats: [
      { id: 'black', type: 'darkIn', dur: 6, fx: [{ at: 0, fx: 'fade', from: 1, to: 1, dur: 6 }] },
      { id: 'flash', type: 'impact', dur: 12,
        frames: [{ f: 0, layer: 'hero', alpha: 1 }],
        fx: [{ at: 0, fx: 'flash', alpha: 1, hold: 2, decay: 12 }, { at: 0, sfx: 'whoosh' }] },
      { id: 'silhouette', type: 'hold', dur: 6 },
      { id: 'reveal', type: 'pose', dur: 50,
        frames: [{ f: 0, layer: 'hero', img: 'heroPose', alpha: 1 }],
        fx: [{ at: 0, fx: 'flash', alpha: 0.5, decay: 8 },
             { at: 0, fx: 'speedlines', origin: [0.5, 0.45], dur: 12, z: 0.6 },
             { at: 0, fx: 'rays', origin: [0.5, 0.42], z: 0.5, fadeIn: 8, alpha: 0.22, color: '#FFE6A0', dur: 110 },
             { at: 0, fx: 'camera', to: 1.08, dur: 50, ease: 'out', focus: [0.5, 0.45] },
             { at: 8, fx: 'text', str: '大厨 · 老铁', in: 'pop', pos: [0.5, 0.82], size: 34, dur: 102 },
             { at: 16, fx: 'text', str: '一刀一个准', in: 'fade', pos: [0.5, 0.875], size: 16, color: '#CFCFCF', strokeWidth: 4, dur: 94 },
             { at: 0, sfx: 'sting' }] },
      { id: 'hold', type: 'hold', dur: 60,
        tracks: [{ layer: 'hero', prop: 'scale', from: 1, to: 1.015, ease: 'breathe' }] },
      { id: 'out', type: 'out', dur: 16, fx: [{ at: 0, fx: 'fade', from: 0, to: 1, dur: 16 }] },
    ],
  };

  // C 美味 / 成功反应：试吃停 → 表情硬切 + 闪 → 比喻换底（爱心飘）→ 陶醉亮相 → 反差回落（同帧清零 + 汗）→ 淡黑
  T.taste = {
    id: 'taste', name: 'C 美味/成功反应', fps: 60, bg: '#0A0A0A', vignette: DARK, short: { from: 'trigger', dur: { meta: 40, pose: 20, drop: 24 } },
    layers: [
      { id: 'bg', img: 'bgDark', fit: 'cover', z: 0 },
      { id: 'meta', img: 'bgHearts', fit: 'cover', z: 0.5, alpha: 0 },
      { id: 'hero', img: 'heroTaste', z: 1, pos: [0.5, 1.0], anchor: [0.5, 1], h: 0.62 },
    ],
    beats: [
      { id: 'taste', type: 'hold', dur: 30,
        tracks: [{ layer: 'hero', prop: 'scale', from: 1, to: 1.015, ease: 'breathe' }] },
      { id: 'trigger', type: 'impact', dur: 2,
        frames: [{ f: 0, layer: 'hero', img: 'heroShock' }],
        fx: [{ at: 0, fx: 'flash', alpha: 0.8, decay: 10 },
             { at: 0, fx: 'speedlines', origin: [0.5, 0.45], dur: 12, z: 2 },
             { at: 0, sfx: 'ding' }] },
      { id: 'meta', type: 'metaphor', dur: 66,
        frames: [{ f: 0, layer: 'meta', alpha: 1 }],
        tracks: [{ layer: 'meta', prop: 'scale', from: 1, to: 1.08, ease: 'linear' },
                 { layer: 'hero', prop: 'scale', from: 1, to: 1.04, ease: 'out' }],
        fx: [{ at: 0, fx: 'particles', preset: 'hearts', n: 26, z: 0.7, dur: 106 },
             { at: 10, fx: 'text', str: '好吃！', in: 'pop', pos: [0.5, 0.17], size: 44, color: '#FFE24A', dur: 96 }] },
      { id: 'pose', type: 'pose', dur: 40,
        frames: [{ f: 0, layer: 'hero', img: 'heroBliss' }],
        fx: [{ at: 0, fx: 'rays', origin: [0.5, 0.4], z: 0.6, alpha: 0.3, fadeIn: 6, color: '#FFFFFF', dur: 40 }] },
      { id: 'drop', type: 'drop', dur: 36, reset: 'all',
        fx: [{ at: 20, fx: 'sweat', origin: [0.64, 0.5], size: 0.03, z: 2 }] },
      { id: 'out', type: 'out', dur: 12, fx: [{ at: 0, fx: 'fade', from: 0, to: 1, dur: 12 }] },
    ],
  };

  // D 搞笑 / 疯狂干活：站着停 → 抹帧 2 帧冲过去 → 命中星 + 震 → 停 + 汗 → 连打（每 3 帧换图，碎屑）→ 大笑亮相 → 突然回原样 → 淡黑
  T.frantic = {
    id: 'frantic', name: 'D 搞笑/连打', fps: 60, bg: '#151515', vignette: { cy: 0.55, inner: 0.25, outer: 0.65, strength: 0.7 },
    short: { from: 'work', dur: { work: 36, laugh: 30, drop: 24 } },
    layers: [
      { id: 'bg', img: 'bgDark', fit: 'cover', z: 0 },
      { id: 'hero', img: 'heroStand', z: 3, pos: [0.24, 0.96], anchor: [0.5, 1], h: 0.3 },
      { id: 'big', img: 'bigBack', z: 2, pos: [0.8, 1.04], anchor: [0.5, 1], h: 0.56 },
    ],
    beats: [
      { id: 'hold', type: 'hold', dur: 40,
        tracks: [{ layer: 'hero', prop: 'scale', from: 1, to: 1.02, ease: 'breathe' }] },
      { id: 'dash', type: 'strike', dur: 3,
        frames: [{ f: 0, layer: 'hero', img: 'heroDash', pos: [0.42, 0.95], smear: { sx: 2.4, sy: 0.8, lines: 9, dir: 1 } },
                 { f: 2, layer: 'hero', img: 'heroGrab', pos: [0.52, 0.94] }] },
      { id: 'hit', type: 'impact', dur: 14,
        fx: [{ at: 0, fx: 'star', origin: [0.72, 0.52], size: 0.1, z: 3 },
             { at: 0, fx: 'shake', amp: 5, dur: 8 }, { at: 0, sfx: 'bonk' }] },
      { id: 'after', type: 'hold', dur: 36,
        fx: [{ at: 22, fx: 'sweat', origin: [0.86, 0.5], z: 3 }] },
      { id: 'work', type: 'cycle', dur: 72,
        cycle: { layer: 'hero', imgs: ['heroWork1', 'heroWork2', 'heroWork3', 'heroWork4'], every: 3, mirror: true, jitter: 0.04, pos: [0.5, 0.97] },
        fx: [{ at: 0, fx: 'particles', preset: 'debris', n: 18, origin: [0.62, 0.7], angle: -1.57, spread: 2.6, z: 3 },
             { at: 24, fx: 'particles', preset: 'debris', n: 18, origin: [0.6, 0.72], angle: -1.57, spread: 2.6, z: 3 },
             { at: 48, fx: 'particles', preset: 'debris', n: 18, origin: [0.64, 0.7], angle: -1.57, spread: 2.6, z: 3 },
             { at: 0, sfx: 'clatter' }] },
      { id: 'laugh', type: 'pose', dur: 50,
        frames: [{ f: 0, layer: 'hero', img: 'heroLaugh', pos: [0.42, 0.96], flipX: false }],
        fx: [{ at: 0, fx: 'flash', alpha: 0.4, decay: 8 },
             { at: 0, fx: 'rays', origin: [0.42, 0.62], z: 0.5, color: '#FFC94A', alpha: 0.35, fadeIn: 6, dur: 50 },
             { at: 0, fx: 'camera', to: 1.12, dur: 50, ease: 'out', focus: [0.42, 0.65] }] },
      { id: 'drop', type: 'drop', dur: 40, reset: 'all',
        fx: [{ at: 18, fx: 'sweat', origin: [0.33, 0.62], z: 3 }] },
      { id: 'out', type: 'out', dur: 12, fx: [{ at: 0, fx: 'fade', from: 0, to: 1, dur: 12 }] },
    ],
  };

  // E 章节转场：黑 → 章节字淡入 → 主视觉淡出黑、慢推 → 白闪进游戏
  T.chapter = {
    id: 'chapter', name: 'E 章节转场', fps: 60, bg: '#000000', short: { from: 'art', dur: { art: 50 } },
    layers: [{ id: 'art', img: 'keyArt', fit: 'cover', z: 0 }],
    beats: [
      { id: 'black', type: 'darkIn', dur: 12, fx: [{ at: 0, fx: 'fade', from: 1, to: 1, dur: 12 }] },
      { id: 'title', type: 'hold', dur: 40,
        fx: [{ at: 0, fx: 'fade', from: 1, to: 1, dur: 40 },
             { at: 0, fx: 'text', str: '第二章 · 夜市', in: 'fade', inDur: 18, pos: [0.5, 0.46], size: 30, dur: 40 }] },
      { id: 'art', type: 'pose', dur: 90,
        tracks: [{ layer: 'art', prop: 'scale', from: 1, to: 1.06, ease: 'linear' }],
        fx: [{ at: 0, fx: 'fade', from: 1, to: 0, dur: 20 },
             { at: 12, fx: 'text', str: '灯一亮，客人就来了', in: 'fade', inDur: 16, pos: [0.5, 0.86], size: 16, strokeWidth: 4, dur: 78 }] },
      { id: 'out', type: 'out', dur: 8, fx: [{ at: 0, fx: 'flash', alpha: 1, hold: 3, decay: 5 }] },
    ],
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = T;
  else root.CUTSCENE_TEMPLATES = T;
})(typeof globalThis !== 'undefined' ? globalThis : this);
