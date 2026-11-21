// 通用过场播放器 1.0（2026-11-21，拆《潜水员戴夫》过场后写）
// 只用 canvas 2D，不碰 DOM：微信小游戏 require 进来就能用，浏览器 <script> 也能用。
// 时间单位是「帧」（60fps 基准）；真机掉帧时按毫秒补帧，不拖慢。坐标全部 0～1 归一化，横竖屏通用。
// 用法：
//   const { createCutscene } = require('./cutscene.js');
//   const cs = createCutscene({ ctx, width: 375, height: 667, images, timeline, short: false,
//                               onEnd() {}, onSfx(name) {} });
//   每帧：cs.update(dtMs); cs.draw();   点屏幕：cs.skip();
// 时间线格式见 00_过场动画制作_技能_1.0.md 第 5 节。
(function (root) {
  'use strict';

  // ---------- 缓动 ----------
  const EASE = {
    linear: t => t,
    in: t => t * t,
    out: t => 1 - (1 - t) * (1 - t),
    inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    sine: t => 0.5 - 0.5 * Math.cos(Math.PI * t),
    step: t => (t < 1 ? 0 : 1),
    pop: t => { const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }, // 弹过头再回来
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  // 一些随机数要可重复（同一段过场每次播一样），用固定种子
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  // ---------- 粒子预设 ----------
  const PARTICLE = {
    spark:  { colors: ['#FFE07A', '#FFB030', '#FF7A1A'], speed: [3, 9], gravity: 0.25, life: [18, 36], size: [2, 3.5], shape: 'line' },
    debris: { colors: ['#9A9A9A', '#6E6E6E', '#C8C0B0'], speed: [3, 8], gravity: 0.35, life: [40, 70], size: [3, 6], shape: 'rect' },
    hearts: { colors: ['#FF5A7A', '#FFFFFF', '#E8204A'], speed: [0.4, 1.2], gravity: -0.02, life: [90, 150], size: [8, 16], shape: 'heart', area: true },
    bokeh:  { colors: ['#FFFFFF', '#FFE0F0', '#FFF4C0'], speed: [0.2, 0.6], gravity: -0.01, life: [80, 140], size: [6, 18], shape: 'dot', area: true, alpha: 0.5 },
    dust:   { colors: ['#FFFFFF'], speed: [0.2, 0.8], gravity: 0, life: [60, 120], size: [1.5, 3], shape: 'dot', area: true, alpha: 0.6 },
  };

  function createCutscene(opts) {
    const ctx = opts.ctx;
    const W = opts.width, H = opts.height;
    const tl = opts.timeline;
    const fps = tl.fps || 60;
    const images = opts.images || {};
    const onEnd = opts.onEnd || (() => {});
    const onSfx = opts.onSfx || (() => {});
    const rand = rng(tl.seed || 7);

    // 短版（第二次起播）：从 short.from 开始，去掉 short.drop 里的节拍，short.dur 里的节拍改时长
    const S = opts.short ? (tl.short || (tl.shortFrom ? { from: tl.shortFrom } : null)) : null;
    let defs = tl.beats, pre = [];
    if (S) {
      const i0 = Math.max(0, tl.beats.findIndex(b => b.id === S.from));
      pre = tl.beats.slice(0, i0);
      defs = tl.beats.slice(i0).filter(b => !(S.drop || []).includes(b.id))
        .map(b => (S.dur && S.dur[b.id] ? Object.assign({}, b, { dur: S.dur[b.id], repeat: 1 }) : b));
    }

    // 把 repeat 展开成平铺的节拍表，记下每个节拍的起始帧
    const beats = [];
    let total = 0;
    for (const b of defs) {
      const n = b.repeat || 1;
      for (let k = 0; k < n; k++) {
        beats.push({ def: b, start: total, k });
        total += b.dur;
      }
    }

    // 图层状态
    const layers = {};
    const base = {};
    for (const L of tl.layers) {
      const s = {
        id: L.id, img: L.img, z: L.z || 0, anchor: L.anchor || [0.5, 0.5], fit: L.fit || null,
        x: (L.pos || [0.5, 0.5])[0], y: (L.pos || [0.5, 0.5])[1], h: L.h || 0.5,
        scale: 1, sx: 1, sy: 1, alpha: L.alpha == null ? 1 : L.alpha, rot: 0,
        visible: L.visible !== false, flipX: false, smear: null,
      };
      layers[L.id] = s;
      base[L.id] = Object.assign({}, s);
    }

    let frame = 0;          // 当前帧
    let acc = 0;            // 毫秒累计
    let done = false;
    let beatIdx = -1;
    const active = [];      // 正在播的特效
    const tracks = [];      // 正在走的补间
    let cycle = null;       // 连打
    const cam = { scale: 1, fx: 0.5, fy: 0.5, anim: null };

    // ---------- 节拍进入：起补间、换图、开特效 ----------
    function enterBeat(i, silent) {
      const { def, start } = typeof i === 'number' ? beats[i] : i;
      if (def.reset) resetToBase(def.reset);
      for (const t of def.tracks || []) {
        const L = layers[t.layer];
        if (!L) continue;
        const from = t.from == null ? L[t.prop] : t.from;
        tracks.push({ L, prop: t.prop, from, to: t.to, start: start + (t.at || 0), dur: t.dur || def.dur,
                      ease: t.ease || 'linear', yoyo: t.ease === 'breathe' });
      }
      cycle = def.cycle ? Object.assign({ start, last: -1, order: [] }, def.cycle) : null;
      if (silent) {
        // 短版快进：只落最终状态，不放特效
        for (const f of def.frames || []) applyFrame(f);
        for (const t of tracks) if (t.prop !== 'scale' || !t.yoyo) t.L[t.prop] = t.yoyo ? t.from : t.to;
        tracks.length = 0;
        if (def.camera) cam.scale = def.camera.to || 1;
        return;
      }
    }

    function resetToBase(mode) {
      // 反差回落：所有特效同帧清零，回到第一张图
      active.length = 0;
      tracks.length = 0;
      cycle = null;
      cam.scale = 1; cam.anim = null; cam.fx = 0.5; cam.fy = 0.5;
      if (mode === 'all' || mode === true) {
        for (const id in layers) Object.assign(layers[id], base[id]);
      }
    }

    function applyFrame(f) {
      const L = layers[f.layer];
      if (!L) return;
      if (f.img) L.img = f.img;
      if (f.visible != null) L.visible = f.visible;
      if (f.flipX != null) L.flipX = f.flipX;
      if (f.pos) { L.x = f.pos[0]; L.y = f.pos[1]; }
      if (f.alpha != null) L.alpha = f.alpha;
      if (f.scale != null) L.scale = f.scale;
      L.smear = f.smear || null;
    }

    function startFx(spec, beatStart) {
      const fx = Object.assign({}, spec, { t0: beatStart + (spec.at || 0) });
      switch (fx.fx) {
        case 'particles': {
          const P = PARTICLE[fx.preset] || PARTICLE.spark;
          fx.parts = [];
          const n = fx.n || 20;
          const ox = (fx.origin || [0.5, 0.5])[0] * W, oy = (fx.origin || [0.5, 0.5])[1] * H;
          for (let k = 0; k < n; k++) {
            const a = fx.angle != null ? fx.angle + (rand() - 0.5) * (fx.spread || Math.PI * 2)
                                       : rand() * Math.PI * 2;
            const sp = lerp(P.speed[0], P.speed[1], rand());
            fx.parts.push({
              x: P.area ? rand() * W : ox, y: P.area ? rand() * H : oy,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (P.area ? 0 : 1.5),
              life: Math.round(lerp(P.life[0], P.life[1], rand())), size: lerp(P.size[0], P.size[1], rand()),
              color: P.colors[(rand() * P.colors.length) | 0], rot: rand() * 6.28, vr: (rand() - 0.5) * 0.4,
            });
          }
          fx.P = P;
          fx.dur = fx.dur || Math.max(...fx.parts.map(p => p.life));
          break;
        }
        case 'camera':
          cam.anim = { t0: fx.t0, steps: fx.steps, stepDur: fx.stepDur || 3, from: cam.scale, to: fx.to,
                       dur: fx.dur || 0, ease: fx.ease || (fx.steps ? 'step' : 'out') };
          if (fx.focus) { cam.fx = fx.focus[0]; cam.fy = fx.focus[1]; }
          return; // 不进 active
        case 'sfx':
          onSfx(fx.name);
          return;
      }
      if (fx.fx === 'speedlines' || fx.fx === 'rays') fx.seed = (rand() * 1e9) | 0;
      active.push(fx);
    }

    // ---------- 每帧推进 ----------
    function stepFrame() {
      // 进入新节拍
      while (beatIdx + 1 < beats.length && frame >= beats[beatIdx + 1].start) {
        beatIdx++;
        enterBeat(beatIdx, false);
      }
      const b = beats[beatIdx];
      if (b) {
        const local = frame - b.start;
        for (const f of b.def.frames || []) if (f.f === local) applyFrame(f);
        for (const s of b.def.fx || []) {
          if ((s.at || 0) === local) {
            if (s.sfx) onSfx(s.sfx);
            if (s.fx) startFx(s, b.start);
          }
        }
        if (cycle) stepCycle(local);
      }
      // 补间
      for (let i = tracks.length - 1; i >= 0; i--) {
        const t = tracks[i];
        const p = (frame - t.start) / t.dur;
        if (p < 0) continue;
        if (t.yoyo) { t.L[t.prop] = lerp(t.from, t.to, 0.5 - 0.5 * Math.cos(Math.PI * 2 * p)); if (p >= 1) t.L[t.prop] = t.from; }
        else t.L[t.prop] = lerp(t.from, t.to, (EASE[t.ease] || EASE.linear)(clamp(p, 0, 1)));
        if (p >= 1) tracks.splice(i, 1);
      }
      // 镜头
      if (cam.anim) {
        const a = cam.anim, lt = frame - a.t0;
        if (a.steps) {
          const k = Math.min(Math.floor(lt / a.stepDur), a.steps.length - 1);
          if (lt >= 0) cam.scale = a.steps[k];
          if (lt >= a.steps.length * a.stepDur) cam.anim = null;
        } else if (a.dur) {
          cam.scale = lerp(a.from, a.to, (EASE[a.ease] || EASE.out)(clamp(lt / a.dur, 0, 1)));
          if (lt >= a.dur) cam.anim = null;
        } else { cam.scale = a.to; cam.anim = null; }
      }
      // 粒子物理、过期特效
      for (let i = active.length - 1; i >= 0; i--) {
        const fx = active[i];
        const lt = frame - fx.t0;
        if (fx.parts) for (const p of fx.parts) { p.x += p.vx; p.y += p.vy; p.vy += fx.P.gravity; p.rot += p.vr; p.vx *= 0.985; }
        const life = fxLife(fx);
        if (life != null && lt > life) active.splice(i, 1);
      }
      frame++;
      if (frame >= total && !done) finish();
    }

    function fxLife(fx) {
      switch (fx.fx) {
        case 'flash': return (fx.hold || 0) + (fx.decay || 15);
        case 'shake': return fx.dur || 8;
        case 'star': return fx.dur || 14;
        case 'sweat': return fx.dur || 50;
        default: return fx.dur == null ? null : fx.dur;   // null = 一直到节拍被 reset 或过场结束
      }
    }

    function stepCycle(local) {
      const c = cycle;
      const slot = Math.floor(local / (c.every || 3));
      if (slot === c.last) return;
      c.last = slot;
      const L = layers[c.layer];
      if (!L) return;
      // 乱序但不连着两次同一张；镜像和小位移冒充更多张
      let k;
      do { k = (rand() * c.imgs.length) | 0; } while (c.imgs.length > 1 && c.imgs[k] === L.img);
      L.img = c.imgs[k];
      L.flipX = c.mirror ? rand() < 0.4 : false;
      const j = c.jitter || 0;
      L.x = (c.pos || base[c.layer].pos || [base[c.layer].x, base[c.layer].y])[0] + (rand() - 0.5) * j * 2;
      L.y = (c.pos || [base[c.layer].x, base[c.layer].y])[1] + (rand() - 0.5) * j;
    }

    function finish() {
      done = true;
      onEnd();
    }

    // ---------- 绘制 ----------
    function drawLayer(L) {
      if (!L.visible || L.alpha <= 0) return;
      const img = images[L.img];
      if (!img) return;
      ctx.save();
      ctx.globalAlpha = clamp(L.alpha, 0, 1);
      let dw, dh;
      if (L.fit === 'cover') {
        const s = Math.max(W / img.width, H / img.height) * L.scale;
        dw = img.width * s; dh = img.height * s;
      } else {
        dh = L.h * H * L.scale; dw = dh * img.width / img.height;
      }
      const px = L.x * W, py = L.y * H;
      ctx.translate(px, py);
      if (L.rot) ctx.rotate(L.rot);
      let sx = L.sx * (L.flipX ? -1 : 1), sy = L.sy;
      if (L.smear) {
        // 抹帧：拉伸 + 速度线，不用另外出图
        sx *= L.smear.sx || 2.4; sy *= L.smear.sy || 0.8;
        drawSmearLines(L, dw, dh);
      }
      ctx.scale(sx, sy);
      ctx.drawImage(img, -dw * L.anchor[0], -dh * L.anchor[1], dw, dh);
      ctx.restore();
    }

    function drawSmearLines(L, dw, dh) {
      const n = L.smear.lines || 8;
      const dir = L.smear.dir || 1;          // 1 = 从左往右冲，速度线留在左边
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = L.smear.color || '#FFFFFF';
      ctx.lineWidth = 2;
      const r = rng(frame * 31 + 5);
      for (let k = 0; k < n; k++) {
        const y = (r() - 0.5) * dh * 0.9 - dh * (L.anchor[1] - 0.5);
        const len = dw * (0.8 + r() * 1.4);
        ctx.beginPath();
        ctx.moveTo(-dir * dw * 0.4, y);
        ctx.lineTo(-dir * (dw * 0.4 + len), y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 世界里的特效（跟镜头一起缩放），按 z 插进图层之间
    function drawWorldFx(fx) {
      const lt = frame - fx.t0;
      const o = fx.origin || [0.5, 0.5];
      const ox = o[0] * W, oy = o[1] * H;
      ctx.save();
      switch (fx.fx) {
        case 'glow': {     // 聚能：光点由小变大
          const p = clamp(lt / (fx.grow || fx.dur || 40), 0, 1);
          const r = lerp(fx.r0 || 4, fx.r1 || 60, EASE.in(p)) * (1 + 0.08 * Math.sin(lt * 0.9));
          const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
          g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.3, fx.color || '#9FF4FF'); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, r, 0, 6.29); ctx.fill();
          break;
        }
        case 'rays': {     // 放射光柱，慢转
          const n = fx.n || 12, len = Math.max(W, H) * 1.2;
          const a0 = lt * (fx.spin == null ? 0.004 : fx.spin);
          const fade = fx.fadeIn ? clamp(lt / fx.fadeIn, 0, 1) : 1;
          ctx.globalAlpha = (fx.alpha || 0.35) * fade;
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = fx.color || '#FFD27A';
          for (let k = 0; k < n; k++) {
            const a = a0 + k * Math.PI * 2 / n, w = (fx.width || 0.09);
            ctx.beginPath(); ctx.moveTo(ox, oy);
            ctx.lineTo(ox + Math.cos(a - w) * len, oy + Math.sin(a - w) * len);
            ctx.lineTo(ox + Math.cos(a + w) * len, oy + Math.sin(a + w) * len);
            ctx.closePath(); ctx.fill();
          }
          break;
        }
        case 'speedlines': {   // 集中线：从四周指向中心，每 2 帧换一次
          const r = rng(fx.seed + Math.floor(lt / 2));
          const n = fx.n || 40, R = Math.hypot(W, H) * 0.6;
          ctx.strokeStyle = fx.color || '#FFFFFF';
          ctx.globalAlpha = fx.alpha || 0.8;
          for (let k = 0; k < n; k++) {
            const a = r() * Math.PI * 2, inner = R * (fx.inner || 0.45) * (0.8 + r() * 0.4);
            ctx.lineWidth = 1 + r() * 2.5;
            ctx.beginPath();
            ctx.moveTo(ox + Math.cos(a) * inner, oy + Math.sin(a) * inner);
            ctx.lineTo(ox + Math.cos(a) * R * 1.4, oy + Math.sin(a) * R * 1.4);
            ctx.stroke();
          }
          break;
        }
        case 'ring': {     // 光环：绕物体扫一圈；expand = 最后一圈扩出画面
          const dur = fx.dur || 30, p = clamp(lt / dur, 0, 1);
          let rx = (fx.rx || 0.42) * W, ry = (fx.ry || 0.09) * H;
          if (fx.expand) { const e = 1 + EASE.in(p) * 3.5; rx *= e; ry *= e; }
          const head = -Math.PI / 2 + p * Math.PI * 2 * (fx.expand ? 0.6 : 1);
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          for (let k = 0; k < 14; k++) {     // 一条带尾巴的弧
            const a1 = head - k * 0.12, a2 = head - (k + 1) * 0.12;
            ctx.globalAlpha = (1 - k / 14) * (fx.expand ? 1 - p * 0.6 : 1);
            ctx.strokeStyle = k < 2 ? '#FFFFFF' : (fx.color || '#5FD0FF');
            ctx.lineWidth = (fx.width || 6) * (1 - k / 20);
            ctx.beginPath(); ctx.ellipse(ox, oy, rx, ry, 0, a2, a1); ctx.stroke();
          }
          if (fx.expand) { ctx.globalAlpha = 0.5 * (1 - p); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(ox, oy, rx, ry, 0, 0, 6.29); ctx.stroke(); }
          break;
        }
        case 'star': {     // 命中星形：黄色尖角，0.6 → 1.1 后消失
          const dur = fx.dur || 14, p = clamp(lt / dur, 0, 1);
          const R = (fx.size || 0.08) * W * lerp(0.6, 1.1, EASE.out(p));
          ctx.globalAlpha = p > 0.7 ? (1 - p) / 0.3 : 1;
          ctx.fillStyle = fx.color || '#FFE24A'; ctx.strokeStyle = '#3A2A00'; ctx.lineWidth = 2;
          ctx.beginPath();
          const n = fx.points || 9;
          for (let k = 0; k < n * 2; k++) {
            const a = k * Math.PI / n + lt * 0.02, rr = k % 2 ? R * 0.42 : R * (0.85 + 0.3 * ((k * 37) % 5) / 5);
            ctx.lineTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr);
          }
          ctx.closePath(); ctx.fill(); ctx.stroke();
          break;
        }
        case 'sweat': {    // 汗滴：冒出来、往下滑一点、淡掉
          const dur = fx.dur || 50, p = clamp(lt / dur, 0, 1);
          const s = (fx.size || 0.025) * W;
          ctx.globalAlpha = p < 0.15 ? p / 0.15 : p > 0.75 ? (1 - p) / 0.25 : 1;
          const y = oy + p * s * 1.5;
          ctx.fillStyle = '#BFE8FF'; ctx.strokeStyle = '#2A4A66'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(ox, y - s * 1.3);
          ctx.quadraticCurveTo(ox + s, y, ox, y + s * 0.6); ctx.quadraticCurveTo(ox - s, y, ox, y - s * 1.3);
          ctx.fill(); ctx.stroke();
          break;
        }
        case 'particles': {
          const P = fx.P;
          for (const p of fx.parts) {
            if (lt > p.life) continue;
            ctx.globalAlpha = (P.alpha || 1) * (1 - lt / p.life);
            ctx.fillStyle = ctx.strokeStyle = p.color;
            if (P.shape === 'line') { ctx.lineWidth = p.size * 0.6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2); ctx.stroke(); }
            else if (P.shape === 'rect') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6); ctx.restore(); }
            else if (P.shape === 'heart') drawHeart(p.x, p.y, p.size);
            else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, 6.29); ctx.fill(); }
          }
          break;
        }
      }
      ctx.restore();
    }

    function drawHeart(x, y, s) {
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.35);
      ctx.bezierCurveTo(x - s * 0.6, y - s * 0.1, x - s * 0.3, y - s * 0.6, x, y - s * 0.25);
      ctx.bezierCurveTo(x + s * 0.3, y - s * 0.6, x + s * 0.6, y - s * 0.1, x, y + s * 0.35);
      ctx.fill();
    }

    // 屏幕特效（不跟镜头缩放）：渐晕、闪、频闪、文字
    function drawScreenFx(fx) {
      const lt = frame - fx.t0;
      ctx.save();
      switch (fx.fx) {
        case 'flash': {
          const hold = fx.hold || 0, decay = fx.decay || 15;
          const a = lt < hold ? 1 : 1 - (lt - hold) / decay;
          ctx.globalAlpha = clamp((fx.alpha == null ? 0.6 : fx.alpha) * a, 0, 1);
          ctx.fillStyle = fx.color || '#FFFFFF';
          ctx.fillRect(0, 0, W, H);
          break;
        }
        case 'strobe': {   // pattern = 每次亮/暗各停几帧；local = 只闪局部光点（防光敏）
          const pat = fx.pattern || [2, 6];
          const cyc = pat.reduce((s, v) => s + v, 0);
          let m = lt % cyc, k = 0;
          while (m >= pat[k]) { m -= pat[k]; k++; }
          const a = k % 2 === 0 ? (fx.max || 0.5) : (fx.min || 0.05);
          ctx.globalAlpha = a;
          if (fx.local) {
            const [lx, ly, lr] = fx.local;
            const g = ctx.createRadialGradient(lx * W, ly * H, 0, lx * W, ly * H, lr * W);
            g.addColorStop(0, fx.color || '#E8FFFF'); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          } else { ctx.fillStyle = fx.color || '#FFFFFF'; ctx.fillRect(0, 0, W, H); }
          break;
        }
        case 'fade': {     // 淡黑 / 淡白：from → to 透明度
          const p = clamp(lt / (fx.dur || 20), 0, 1);
          ctx.globalAlpha = lerp(fx.from == null ? 0 : fx.from, fx.to == null ? 1 : fx.to, p);
          ctx.fillStyle = fx.color || '#000000';
          ctx.fillRect(0, 0, W, H);
          break;
        }
        case 'text': {
          const inDur = fx.inDur || 10, p = clamp(lt / inDur, 0, 1);
          const s = fx.in === 'pop' ? EASE.pop(p) : 1;
          const pos = fx.pos || [0.5, 0.8];
          ctx.globalAlpha = fx.in === 'fade' ? p : clamp(p * 3, 0, 1);
          ctx.translate(pos[0] * W, pos[1] * H); ctx.scale(s, s);
          ctx.font = `bold ${fx.size || 28}px "PingFang SC","Hiragino Sans GB",sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = fx.strokeWidth || 6; ctx.strokeStyle = fx.stroke || '#1A1A1A'; ctx.lineJoin = 'round';
          ctx.strokeText(fx.str, 0, 0);
          ctx.fillStyle = fx.color || '#FFFFFF'; ctx.fillText(fx.str, 0, 0);
          break;
        }
      }
      ctx.restore();
    }

    function drawVignette() {
      const v = tl.vignette;
      if (!v) return;
      const g = ctx.createRadialGradient(W * 0.5, H * (v.cy || 0.45), Math.min(W, H) * (v.inner || 0.25),
                                         W * 0.5, H * (v.cy || 0.45), Math.hypot(W, H) * (v.outer || 0.6));
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${v.strength == null ? 0.75 : v.strength})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    const SCREEN_FX = { flash: 1, strobe: 1, fade: 1, text: 1 };

    function draw() {
      const f = frame - 1;   // 画的是刚推进完的那一帧
      ctx.save();
      ctx.fillStyle = tl.bg || '#111111';
      ctx.fillRect(0, 0, W, H);
      // 镜头 + 震屏
      let shx = 0, shy = 0;
      for (const fx of active) if (fx.fx === 'shake') {
        const lt = f - fx.t0, k = 1 - lt / (fx.dur || 8), r = rng(f * 13 + 1);
        shx += (r() - 0.5) * 2 * (fx.amp || 6) * k; shy += (r() - 0.5) * 2 * (fx.amp || 6) * k;
      }
      const cx = cam.fx * W, cy = cam.fy * H;
      ctx.translate(cx + shx, cy + shy); ctx.scale(cam.scale, cam.scale); ctx.translate(-cx, -cy);
      // 图层和世界特效按 z 排序
      const items = [];
      for (const id in layers) items.push({ z: layers[id].z, L: layers[id] });
      for (const fx of active) if (!SCREEN_FX[fx.fx] && fx.fx !== 'shake') items.push({ z: fx.z == null ? 50 : fx.z, fx });
      items.sort((a, b) => a.z - b.z);
      for (const it of items) it.L ? drawLayer(it.L) : drawWorldFx(it.fx);
      ctx.restore();
      drawVignette();
      for (const fx of active) if (SCREEN_FX[fx.fx]) drawScreenFx(fx);
      ctx.restore();
    }

    // ---------- 对外 ----------
    function update(dtMs) {
      if (done) return;
      acc += Math.min(dtMs, 250);
      const step = 1000 / fps;
      while (acc >= step && !done) { stepFrame(); acc -= step; }
    }

    function jumpTo(i) {
      // 静默快进到第 i 个节拍（短版用）
      while (beatIdx + 1 < i) { beatIdx++; enterBeat(beatIdx, true); }
      frame = beats[i] ? beats[i].start : total;
    }

    function skip() {
      if (done) return;
      // 落到最终状态：快进全部节拍，清掉特效，立即结束
      jumpTo(beats.length);
      active.length = 0; cam.scale = 1; cam.anim = null;
      frame = total;
      finish();
    }

    for (const def of pre) enterBeat({ def, start: 0 }, true);   // 短版：前面跳过的节拍只落状态
    stepFrame();

    return {
      update, draw, skip,
      get frame() { return frame; },
      get totalFrames() { return total; },
      get done() { return done; },
      get beatName() { const b = beats[beatIdx]; return b ? (b.def.id || b.def.type) : ''; },
    };
  }

  const api = { createCutscene, PARTICLE, EASE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cutscene = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
