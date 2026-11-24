// 《墨守》连点测试：同一帧里手上的东西刚变了（放走、叠掉、拆掉），手指又点到它原来的格子。
// 检验报告 A9 的卡死 bug：放下最后一件的同一帧再点原格子 → G.sel 指空 → 每帧循环报错 → 画面永久定住。
// 每种情况都查三样：没报错、对局时间还在走、选中的序号没指空。最后再查「任何一帧报错，游戏也不会定住」。
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = 'file://' + path.join(__dirname, '..', 'preview.html');
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.waitForTimeout(600);
  const check = (c, m) => { if (!c) throw new Error('没通过：' + m); console.log('  ✓ ' + m); };
  const g = (fn, a) => page.evaluate(fn, a);
  const MM = await g(() => ({ scale: __menu.scale, ox: __menu.ox, oy: __menu.oy, c: __menu.CARDS[0] }));
  await page.mouse.click(MM.ox + 180 * MM.scale, MM.oy + (MM.c.y + 60) * MM.scale);
  await page.waitForFunction(() => typeof __mo !== 'undefined');
  const M = await g(() => ({ scale: __mo.scale, ox: __mo.ox, oy: __mo.oy }));
  // 进 1-1，跳过运镜、教学和引导卡，让画面停在守城对局里
  await g(() => { __mo.press('pickGo'); __mo.press('node0'); __mo.press('go'); });
  await page.waitForTimeout(200);
  await g(() => {
    if (__mo.G.cs) __mo.G.cs.skip();
    __mo.G.tut = null;
    __mo.meta.tutDone = 1;
    const t = __mo.meta.tips || (__mo.meta.tips = {});
    ['combine2', 'recipes', 'merge', 'mergeShop', 'smash', 'install', 'buySpot', 'cards', 'shop', 'attack', 'station'].forEach((k) => (t[k] = 1));
    __mo.G.tip = null;
  });
  await page.waitForTimeout(200);
  const pos = async (id) => {
    const b = await g((i) => __mo.G.btns.find((x) => x.id === i), id);
    if (!b) throw new Error('画面上找不到按钮 ' + id);
    return [M.ox + (b.x + b.w / 2) * M.scale, M.oy + (b.y + b.h / 2) * M.scale];
  };
  // 一串指针事件在同一个 JS 任务里发完 = 同一帧里发生（中间不重画，按钮表还是旧的）
  const burst = (steps) => g((st) => {
    const cv = document.querySelector('canvas');
    st.forEach(([type, x, y, pid]) => cv.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: pid || 1, bubbles: true })));
  }, steps);
  const tap = (p, pid) => [['pointerdown', p[0], p[1], pid], ['pointerup', p[0], p[1], pid]];
  const drag = (a, b, pid) => [['pointerdown', a[0], a[1], pid], ['pointermove', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pid], ['pointermove', b[0], b[1], pid], ['pointerup', b[0], b[1], pid]];
  const reset = (bench) => g((bn) => {
    const r = __mo.G.r;
    r.slots = r.slots.map(() => null);
    r.bench = bn.map((m) => Object.assign({}, m));
    __mo.G.sel = -1;
    __mo.G.dragM = null;
    __mo.G.scr = 'play';
    __mo.G.st.waveT = 999; // 别让这一波在测试中途打完
  }, bench);
  const alive = async (name) => {
    await page.waitForTimeout(150);
    const t1 = await g(() => __mo.G.st.t);
    await page.waitForTimeout(400);
    const s = await g(() => ({ t: __mo.G.st.t, sel: __mo.G.sel, n: __mo.G.r.bench.length, d: __mo.G.dragM }));
    check(errors.length === 0, name + '：没报错' + (errors.length ? '：' + errors.slice(0, 2).join(' | ') : ''));
    check(s.t - t1 > 0.2, name + '：对局时间还在走（0.4 秒走了 ' + (s.t - t1).toFixed(2) + ' 秒）');
    check(s.sel < s.n && !(s.d && s.d.bi >= s.n), name + '：选中的没指空（sel ' + s.sel + '，手上 ' + s.n + ' 件）');
  };

  // 1. 报告里的原样：点选手上唯一一件 → 点点位放下 → 同一帧又点原来那格
  await reset([{ id: 'pi', tier: 1 }]);
  await page.waitForTimeout(100);
  let tray = await pos('tray0');
  let spot = await pos('spot1');
  await burst(tap(tray));
  await burst([...tap(spot), ...tap(tray)]);
  await alive('点放下最后一件、同一帧再点原格子');

  // 2. 拖下去：按住手上唯一一件拖到点位松手 → 同一帧又按住原格子拖
  await reset([{ id: 'nu', tier: 1 }]);
  await page.waitForTimeout(100);
  tray = await pos('tray0');
  spot = await pos('spot0');
  await burst([...drag(tray, spot), ...drag(tray, spot)]);
  await alive('拖放下最后一件、同一帧再拖原格子');

  // 3. 手上两件同名拖到一起叠阶（手上少一件）→ 同一帧点原来第 2 格
  await reset([{ id: 'nu', tier: 1 }, { id: 'nu', tier: 1 }]);
  await page.waitForTimeout(100);
  const t0 = await pos('tray0');
  const t1 = await pos('tray1');
  await burst([...drag(t0, t1), ...tap(t1), ...tap(spot)]);
  await alive('手上叠阶、同一帧再点消失的那格');

  // 4. 两根手指：一根按住手上那件，另一根同时点点位把它放走，再松开第一根
  await reset([{ id: 'teng', tier: 1 }]);
  await page.waitForTimeout(100);
  tray = await pos('tray0');
  spot = await pos('spot2');
  await burst(tap(tray));
  await burst([['pointerdown', tray[0], tray[1], 1], ['pointermove', tray[0] + 30, tray[1] - 40, 1], ...tap(spot, 2), ['pointermove', spot[0], spot[1], 1], ['pointerup', spot[0], spot[1], 1]]);
  await alive('两根手指：一根拖、一根点放');

  // 5. 小店里拆掉（手上少一件）→ 同一帧点原来那格、再点拆掉
  await reset([{ id: 'han', tier: 1 }]);
  await g(() => { __mo.G.scr = 'shop'; });
  await page.waitForTimeout(150);
  tray = await pos('tray0');
  await burst(tap(tray));
  await page.waitForTimeout(80);
  const sell = await pos('sell');
  await burst([...tap(sell), ...tap(tray), ...tap(sell)]);
  await page.waitForTimeout(100);
  check(errors.length === 0 && (await g(() => __mo.G.sel < __mo.G.r.bench.length)), '小店拆掉、同一帧再点原格子：没报错、没指空');
  await g(() => { __mo.press('nextWave'); });

  // 6. 来回乱点 200 下手上和点位（同一帧连发，手上东西一直在变）
  await reset([{ id: 'nu', tier: 1 }, { id: 'nu', tier: 1 }, { id: 'pi', tier: 1 }]);
  await page.waitForTimeout(100);
  const ids = ['tray0', 'tray1', 'tray2', 'spot0', 'spot1', 'spot2'];
  const P = {};
  for (const i of ids) P[i] = await pos(i);
  for (let k = 0; k < 40; k++) {
    const steps = [];
    for (let j = 0; j < 5; j++) {
      const a = P[ids[(k * 7 + j * 3) % ids.length]];
      const b = P[ids[(k * 5 + j) % ids.length]];
      steps.push(...(j % 2 ? drag(a, b) : tap(a)));
    }
    await burst(steps);
    if (k % 8 === 7) await g(() => { const r = __mo.G.r; if (r.bench.length < 2) r.bench.push({ id: 'nu', tier: 1 }, { id: 'pi', tier: 1 }); r.slots = r.slots.map(() => null); });
    await page.waitForTimeout(20);
  }
  await alive('同一帧连发乱点 200 下');

  // 7. 保险：故意让某一帧画图报错一次，游戏也要接着跑（外壳先排下一帧再画）
  await g(() => {
    const P2 = CanvasRenderingContext2D.prototype;
    const orig = P2.fillRect;
    let once = true;
    P2.fillRect = function () {
      if (once) { once = false; P2.fillRect = orig; throw new Error('测试用：这一帧故意报错'); }
      return orig.apply(this, arguments);
    };
  });
  const tA = await g(() => __mo.G.st.t);
  await page.waitForTimeout(500);
  const tB = await g(() => __mo.G.st.t);
  const caught = errors.filter((e) => e.indexOf('测试用') >= 0).length;
  check(caught === 1 && tB - tA > 0.2, '某一帧报错以后游戏接着跑（报错记下 ' + caught + ' 次，0.5 秒走了 ' + (tB - tA).toFixed(2) + ' 秒）');
  errors.splice(0);

  await browser.close();
  console.log('全部通过');
})().catch((e) => { console.error(e.message); process.exit(1); });
