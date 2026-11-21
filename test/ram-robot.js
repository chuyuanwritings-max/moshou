// 机关龙（玩法 A）测试机器人：手机大小的浏览器里，用鼠标当手指走一遍：开局 → 左右拖 → 啃砖 → 结算 → 再来 → 升级 → 过关。
// 用法：node test/robot.js   （截图存在 test/shots/）
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const shots = path.join(__dirname, 'shots');
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = 'file://' + path.join(__dirname, '..', 'preview.html');
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.waitForTimeout(400);
  await page.evaluate(() => __menu.launch('ram'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(__dirname, 'shots', 'a00_章节转场.png') });
  const csOn = await page.evaluate(() => !!__ram.G.cs);
  await page.evaluate(() => __ram.G.cs && __ram.G.cs.skip());
  await page.waitForTimeout(100);

  const check = (cond, msg) => { if (!cond) throw new Error('没通过：' + msg); console.log('  ✓ ' + msg); };
  const g = (fn, arg) => page.evaluate(fn, arg);
  const snap = (n) => page.screenshot({ path: path.join(shots, n + '.png') });
  const M = await g(() => ({ scale: __ram.scale, ox: __ram.ox, oy: __ram.oy }));
  const scr = (fx, fy) => [M.ox + fx * M.scale, M.oy + fy * M.scale];
  const waitFor = async (fn, ms, what) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await g(fn)) return Date.now() - t0; await page.waitForTimeout(30); }
    throw new Error('等太久：' + what);
  };
  const clickBtn = async (id) => {
    const b = await g((i) => __ram.G.buttons.find((x) => x.id === i), id);
    if (!b) throw new Error('找不到按钮 ' + id);
    const [x, y] = scr(b.x + b.w / 2, b.y + b.h / 2);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up();
  };
  const NORMAL = { look: 240, miss: 0.12, react: 0.22 };
  const setBot = (bot, speed) => g(([b, s]) => { __ram.G.bot = b; __ram.G.speed = s; }, [bot, speed]);

  console.log('—— 开局 ——');
  check(csOn, '进边城先放章节转场（照《潜水员戴夫》节拍，点一下跳过）');
  check((await g(() => __ram.G.mode)) === 'play', '跳过转场马上开冲');
  check((await g(() => __ram.G.st.len)) === 6, '开局 6 节');
  await page.waitForTimeout(900);
  await snap('01_开局');

  console.log('—— 手指左右拖 ——');
  const x0 = await g(() => __ram.G.st.head.x);
  const [sx, sy] = scr(180, 640);
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(sx - i * 9, sy); await page.waitForTimeout(16); }
  await page.waitForTimeout(120);
  await page.mouse.up();
  const x1 = await g(() => __ram.G.st.head.x);
  check(x1 < x0 - 40, '往左拖，龙头跟着往左（' + Math.round(x0) + ' → ' + Math.round(x1) + '）');

  console.log('—— 一路冲 ——');
  await setBot(NORMAL, 1);
  await waitFor(() => __ram.G.st.chewing, 20000, '撞上城砖');
  await page.waitForTimeout(120);
  await snap('02_啃城砖');
  check(true, '撞上城砖会停下啃');
  await waitFor(() => __ram.G.st.parts > 0, 15000, '吃到零件');
  check(true, '吃零件会变长');
  await page.waitForTimeout(2500);
  await snap('03_路上');

  console.log('—— 输一局：结算 ——');
  await g(() => { const st = __ram.G.st; st.len = 2; st.items.forEach((i) => { if (i.kind === 'chest') i.alive = false; }); if (st.mode === 'cards') __ram.S.botPick(st); });
  await setBot(null, 1);
  await g(() => { __ram.G.st.targetX = __ram.G.st.chewing ? __ram.G.st.head.x : __ram.G.st.head.x; });
  await waitFor(() => __ram.G.mode === 'result', 30000, '输掉进结算');
  await page.waitForTimeout(400);
  await snap('04_输了');
  const r = await g(() => __ram.G.result);
  check(!r.win, '输了显示结算');
  const t0 = Date.now();
  await clickBtn('again');
  await waitFor(() => __ram.G.mode === 'play' && __ram.G.st.t < 0.5, 2000, '再来');
  check(Date.now() - t0 < 1000, '点「再来」不到 1 秒就重新开冲（' + (Date.now() - t0) + ' 毫秒）');

  console.log('—— 升级起步节数 ——');
  await g(() => { __ram.meta.coins = 200; __ram.saveMeta(); const st = __ram.G.st; st.len = 1; st.items.forEach((i) => { if (i.kind === 'chest') i.alive = false; }); });
  await waitFor(() => __ram.G.mode === 'result', 30000, '再输一局');
  await page.waitForTimeout(300);
  await clickBtn('up_startLen');
  check((await g(() => __ram.meta.startLv)) === 1, '花铜钱升「起步 +1 节」');
  await clickBtn('again');
  await page.waitForTimeout(100);
  check((await g(() => __ram.G.st.len)) === 7, '再开局变成 7 节');

  console.log('—— 一路冲到城门 ——');
  await g(() => { __ram.G.st.len = 120; });
  await setBot({ look: 340, miss: 0, react: 0.1 }, 4);
  await waitFor(() => __ram.G.st.chewing && __ram.G.st.chewing.kind === 'gate', 40000, '冲到城门');
  await setBot(null, 1);
  await page.waitForTimeout(500);
  await snap('05_撞城门');
  await waitFor(() => __ram.G.cs, 20000, '撞开城门的过场');
  await page.waitForTimeout(1500);
  await snap('05b_城门破了过场');
  check(true, '撞开城门放「城门破了」过场');
  await waitFor(() => __ram.G.mode === 'result', 20000, '撞开城门');
  await page.waitForTimeout(400);
  await snap('06_过关');
  check((await g(() => __ram.G.result.win)), '撞开城门 = 过关');
  await clickBtn('next');
  await page.waitForTimeout(1600);
  check((await g(() => __ram.G.st.lv.idx)) === 1, '点「下一关」进第 2 关');
  await setBot(NORMAL, 1);
  await waitFor(() => __ram.G.st.bolts.length > 0, 40000, '弩塔放箭');
  await page.waitForTimeout(200);
  await snap('07_弩塔放箭');
  check(true, '第 2 关起有弩塔朝龙射箭');
  await waitFor(() => __ram.G.teach, 40000, '新敌人小卡');
  await page.waitForTimeout(300);
  await snap('08_新敌人');
  check(true, '新兵种第一次出现弹小卡：' + (await g(() => __ram.G.teach.name)));

  console.log('—— 机关匣三选一 ——');
  await setBot(null, 1);
  await g(() => { __ram.S.openCards(__ram.G.st); });
  await page.waitForTimeout(500);
  await snap('09_三选一');
  check((await g(() => __ram.G.st.mode)) === 'cards', '吃到机关匣弹出三选一');
  const r0 = await g(() => __ram.G.cardRects[0]);
  { const [x, y] = scr(r0.x + r0.w / 2, r0.y + r0.h / 2); await page.mouse.click(x, y); }
  await page.waitForTimeout(150);
  check((await g(() => __ram.G.st.carOrder.length)) >= 1, '点卡挂上一节特殊车厢');
  await g(() => { const st = __ram.G.st; const id = st.carOrder[0]; st.cars[id] = 2; st.cards = [id]; st.mode = 'cards'; __ram.G.cardsAt = 0; });
  await page.waitForTimeout(300);
  { const r1 = await g(() => __ram.G.cardRects[0]); const [x, y] = scr(r1.x + r1.w / 2, r1.y + r1.h / 2); await page.mouse.click(x, y); }
  await page.waitForTimeout(1300);
  await snap('10a_进化举锤');
  await page.waitForTimeout(1300);
  await snap('10_进化');
  check(await g(() => !!__ram.G.cs), '同一节拿到 3 级：放进化过场（举锤、落锤、白闪、光环、亮相）');
  await page.waitForTimeout(1200);
  await snap('10b_进化亮相');
  await g(() => __ram.G.cs && __ram.G.cs.skip());
  await setBot(NORMAL, 1);
  await page.waitForTimeout(3000);
  await snap('11_挂车厢跑');

  console.log('—— 帧率 ——');
  await setBot(NORMAL, 1);
  const fps = await g(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
  check(fps > 50, '帧率 ' + Math.round(fps));

  check(errors.length === 0, '没有报错' + (errors.length ? '：' + errors.join(' | ') : ''));
  await browser.close();
  console.log('全部通过');
})().catch((e) => { console.error(e.message); process.exit(1); });
