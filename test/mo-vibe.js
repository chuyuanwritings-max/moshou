// 《墨守》震动打桩测试（照 00_震动手感规矩_1.0 第 6 条）：
// 每个有效操作都震了、档位对；没成的点击不震；同一帧只震一下；两次之间都隔够 40 毫秒；开关关了就不震。
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
  const W = (ms) => page.waitForTimeout(ms);
  const MM = await g(() => ({ scale: __menu.scale, ox: __menu.ox, oy: __menu.oy, c: __menu.CARDS[0] }));
  await page.mouse.click(MM.ox + 180 * MM.scale, MM.oy + (MM.c.y + 60) * MM.scale);
  await page.waitForFunction(() => typeof __mo !== 'undefined');
  await page.waitForFunction(() => __mo.G.btns && __mo.G.btns.some((b) => b.id === 'pickGo'));
  const M = await g(() => ({ scale: __mo.scale, ox: __mo.ox, oy: __mo.oy }));
  const P = (fx, fy) => [M.ox + fx * M.scale, M.oy + fy * M.scale];
  const pos = async (id) => {
    const b = await g((i) => __mo.G.btns.find((x) => x.id === i), id);
    if (!b) throw new Error('画面上找不到按钮 ' + id);
    return P(b.x + b.w / 2, b.y + b.h / 2);
  };
  const log = () => g(() => __mo.vibeLog.map((v) => v.type));
  const clear = () => g(() => { __mo.vibeLog.length = 0; });
  // 做一件事，等两帧多，返回这期间震了什么
  const did = async (fn) => {
    await clear();
    await fn();
    await W(120);
    return log();
  };
  const tap = async (id) => page.mouse.click(...(await pos(id)));

  // —— 选人、地图上的按钮 ——
  let v = await did(() => tap('pickGo'));
  check(v.join() === 'light', '点「开始」：轻震一下（' + v.join() + '）');
  v = await did(() => tap('node9'));
  check(v.length === 0, '点没解锁的关：不震（' + (v.join() || '无') + '）');

  // —— 震动开关 ——
  v = await did(() => tap('vibe'));
  check(v.length === 0 && (await g(() => __mo.meta.vibe === false)), '点「震动」关掉：关了以后这一下也不震，存进存档');
  v = await did(() => tap('meta'));
  check(v.length === 0, '震动关着：点按钮不震');
  await tap('toMap').catch(() => g(() => { __mo.G.scr = 'map'; }));
  await W(100);
  if (await g(() => __mo.G.scr !== 'map')) await g(() => { __mo.G.scr = 'map'; });
  await W(100);
  v = await did(() => tap('vibe'));
  check(v.join() === 'light' && (await g(() => __mo.meta.vibe === true)), '再点一下打开：马上轻震一下（' + v.join() + '）');

  // —— 守城 1-1：跳过运镜、教学、引导卡 ——
  await g(() => { __mo.press('node0'); __mo.press('go'); });
  await W(200);
  await g(() => {
    if (__mo.G.cs) __mo.G.cs.skip();
    __mo.G.tut = null;
    __mo.meta.tutDone = 1;
    const t = __mo.meta.tips || (__mo.meta.tips = {});
    ['combine2', 'recipes', 'merge', 'mergeShop', 'smash', 'install', 'buySpot', 'cards', 'shop', 'attack', 'station'].forEach((k) => (t[k] = 1));
    __mo.G.tip = null;
    const r = __mo.G.r;
    r.mats.jin = 2;
    r.noLuck = true; // 不出「大成功」（那一下是重震），好测普通合成
    r.coins = 0;
    r.charge = 0;
    __mo.G.st.waveT = 999;
  });
  await W(300);
  v = await did(() => tap('make_nu'));
  check(v.join() === 'medium', '合成一件：中震（' + v.join() + '）');
  await W(400); // 等阿铸抡完锤
  const tr0 = await pos('tray0');
  v = await did(() => page.mouse.click(...tr0));
  check(v.join() === 'light', '点手上的机关（拿起）：轻震（' + v.join() + '）');
  const tray = await pos('tray0');
  const spot = await pos('spot1');
  v = await did(async () => {
    await page.mouse.move(...tray);
    await page.mouse.down();
    await page.mouse.move((tray[0] + spot[0]) / 2, (tray[1] + spot[1]) / 2, { steps: 4 });
    await page.mouse.move(...spot, { steps: 4 });
    await page.mouse.up();
  });
  check(await g(() => __mo.G.r.slots[1] && __mo.G.r.slots[1].id === 'nu'), '拖到点位放下');
  check(v.length >= 1 && v.every((x) => x === 'light'), '拿起 + 放下：都是轻震（' + v.join() + '）');

  // —— 没成的点击不震 ——
  v = await did(() => page.mouse.click(...P(60, 300)));
  check(v.length === 0, '点到空地：不震');
  v = await did(() => tap('smash'));
  check(v.length === 0, '锤还没攒满就点：不震');
  v = await did(() => tap('buySpot'));
  check(v.length === 0, '铜钱不够点「修」：不震');
  await g(() => { __mo.G.r.bench.push({ id: 'teng', tier: 1 }); });
  await W(100);
  const t2 = await pos('tray0');
  v = await did(async () => {
    await page.mouse.move(...t2);
    await page.mouse.down();
    await page.mouse.move(...P(340, 330), { steps: 6 }); // 离哪个点位都远
    await page.mouse.up();
  });
  check(v.join() === 'light' && (await g(() => __mo.G.r.bench.length === 1)), '拿起再丢到空地：只有拿起那一下，没放成不震（' + v.join() + '）');

  // —— 叠阶 = 中 ——
  await g(() => { __mo.G.r.bench.length = 0; __mo.G.r.bench.push({ id: 'nu', tier: 1 }); });
  await W(100);
  const t3 = await pos('tray0');
  v = await did(async () => {
    await page.mouse.move(...t3);
    await page.mouse.down();
    await page.mouse.move(...spot, { steps: 6 });
    await page.mouse.up();
  });
  check(v.indexOf('medium') >= 0 && (await g(() => __mo.G.r.slots[1].tier === 2)), '拖到同名机关上叠阶：中震（' + v.join() + '）');

  // —— 锤 = 重 ——
  await g(() => { __mo.G.r.charge = 8; });
  await W(800);
  v = await did(() => tap('smash'));
  check(v.indexOf('heavy') >= 0, '锤攒满点下去：重震（' + v.join() + '）');

  // —— 同一帧只震一下 ——
  await g(() => { __mo.G.r.bench.push({ id: 'teng', tier: 1 }, { id: 'han', tier: 1 }); });
  await W(100);
  const a = await pos('tray0');
  const b = await pos('tray1');
  v = await did(() => g(([a, b]) => {
    const cv = document.querySelector('canvas');
    const ev = (t, p) => cv.dispatchEvent(new PointerEvent(t, { clientX: p[0], clientY: p[1], pointerId: 1, bubbles: true }));
    for (let k = 0; k < 3; k++) { ev('pointerdown', a); ev('pointerup', a); ev('pointerdown', b); ev('pointerup', b); }
  }, [a, b]));
  check(v.length === 1, '同一帧里连点 6 下：只震一下（' + v.join() + '）');

  // —— 连着快点（每 15 毫秒一下，跨好几帧）：一下一下分开，间隔都 ≥ 40 毫秒 ——
  await clear();
  await g(([a, b]) => new Promise((res) => {
    const cv = document.querySelector('canvas');
    const ev = (t, p) => cv.dispatchEvent(new PointerEvent(t, { clientX: p[0], clientY: p[1], pointerId: 1, bubbles: true }));
    let k = 0;
    const id = setInterval(() => { const p = k % 2 ? b : a; ev('pointerdown', p); ev('pointerup', p); if (++k >= 8) { clearInterval(id); setTimeout(res, 200); } }, 15);
  }), [a, b]);
  const fast = await g(() => __mo.vibeLog.slice());
  const fg = fast.slice(1).map((x, i) => x.t - fast[i].t);
  check(fast.length >= 2 && fast.length < 8 && fg.every((d) => d >= 40), '每 15 毫秒点一下、连点 8 下：震了 ' + fast.length + ' 下，间隔 ' + fg.join('、') + ' 毫秒（都 ≥ 40）');

  // —— 一路打完：每两次之间都隔够 40 毫秒；城门挨打 / 过关是重 ——
  await clear();
  await g(() => {
    const r = __mo.G.r;
    r.slots = r.slots.map(() => null);
    __mo.G.st.waveT = 6;
    __mo.G.bot = true;
    __mo.G.speed = 6;
  });
  await page.waitForFunction(() => __mo.G.scr === 'result', null, { timeout: 120000 });
  await W(200);
  const all = await g(() => __mo.vibeLog.slice());
  const gaps = all.slice(1).map((x, i) => x.t - all[i].t);
  const minGap = gaps.length ? Math.min(...gaps) : 999;
  const kinds = [...new Set(all.map((x) => x.type))];
  check(all.length >= 5, '自动打完一关：一共震了 ' + all.length + ' 次，档位有 ' + kinds.join('、'));
  check(minGap >= 40, '任何两次震动之间都隔够 40 毫秒（最短 ' + minGap + ' 毫秒）');
  check(all[all.length - 1].type === 'heavy', '结算那一下是重震');

  check(errors.length === 0, '没有报错' + (errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log('全部通过');
})().catch((e) => { console.error(e.message); process.exit(1); });
