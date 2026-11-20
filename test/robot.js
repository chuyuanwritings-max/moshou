// 测试机器人：在手机大小的浏览器里，用鼠标当手指，把一局从开局走到结算、再来一局。
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
  await page.waitForTimeout(500);

  const ok = [];
  const check = (cond, msg) => { if (!cond) throw new Error('没通过：' + msg); ok.push(msg); console.log('  ✓ ' + msg); };
  const g = (fn, arg) => page.evaluate(fn, arg);
  const snap = (n) => page.screenshot({ path: path.join(shots, n + '.png') });
  const M = await g(() => ({ scale: __moshou.scale, ox: __moshou.ox, oy: __moshou.oy }));
  const scr = (fx, fy) => [M.ox + fx * M.scale, M.oy + fy * M.scale];
  const clickBtn = async (id) => {
    const b = await g((i) => __moshou.G.buttons.find((x) => x.id === i), id);
    if (!b) throw new Error('找不到按钮 ' + id);
    const [x, y] = scr(b.x + b.w / 2, b.y + b.h / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(80);
  };
  const waitFor = async (fn, ms, what) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await g(fn)) return;
      await page.waitForTimeout(50);
    }
    throw new Error('等太久：' + what);
  };
  // 页面里的「聪明」机器人：盯着龙头打
  const SMART = `st => { const g = st.segs.find(s => s.s >= 0); return g ? g.x + Math.cos(g.a) * 14 : 180; }`;
  const LAZY = `st => 180 + 140 * Math.sin(st.t * 0.9)`;
  const setBot = (src, speed, again) => g(([s, sp, a]) => { const G = __moshou.G; G.bot = s ? eval(s) : null; G.speed = sp; G.botAgain = a; }, [src, speed, again]);

  console.log('—— 开局 ——');
  check((await g(() => __moshou.G.mode)) === 'play', '一打开就直接开打（不藏在菜单后面）');
  check(await g(() => __moshou.G.hint), '第一关有手指左右滑的动画');
  await page.waitForTimeout(1200);
  await snap('01_开局');

  console.log('—— 手指左右滑 ——');
  const px0 = await g(() => __moshou.G.st.px);
  const [sx, sy] = scr(180, 690);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(sx - i * 8, sy); await page.waitForTimeout(16); }
  await page.waitForTimeout(200);
  const px1 = await g(() => __moshou.G.st.px);
  check(px1 < px0 - 50, '往左滑，阿铸往左走（' + Math.round(px0) + ' → ' + Math.round(px1) + '）');
  for (let i = 1; i <= 24; i++) { await page.mouse.move(sx - 96 + i * 10, sy); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(200);
  check((await g(() => __moshou.G.st.px)) > px1 + 100, '往右滑，阿铸往右走');
  check(!(await g(() => __moshou.G.hint)), '滑过以后手势动画消失');
  const firstHitAt = await g(() => __moshou.G.st.t);

  console.log('—— 第一个机关匣：三选一 ——');
  await setBot(SMART, 1, false);
  await g(() => { const G = __moshou.G; G._pickByBot = false; });
  // 机器人只管走位，不替人选卡：等卡出来
  await g(() => { const G = __moshou.G; const orig = G.bot; G.bot = orig; G.noBotPick = true; });
  await waitFor(() => __moshou.G.st.mode === 'cards' || __moshou.G.st.kills > 0, 20000, '打碎第一节');
  const firstKillT = await g(() => __moshou.G.st.t);
  check(firstKillT < 10, '开局 ' + firstKillT.toFixed(1) + ' 秒就打碎第一节（十秒内有爽反馈）');
  await setBot(null, 1, false);
  // 用作弊直接把第一个机关匣打掉，免得等
  await g(() => { const st = __moshou.G.st; const c = st.segs.find((s) => s.chest); c.hp = 1; });
  await setBot(SMART, 1, false);
  await waitFor(() => __moshou.G.st.mode === 'cards', 15000, '出三选一');
  await setBot(null, 1, false);
  await page.waitForTimeout(400);
  await snap('02_三选一');
  const before = await g(() => Object.values(__moshou.G.st.weapons).reduce((a, b) => a + b, 0));
  await clickBtn('card1');
  check((await g(() => Object.values(__moshou.G.st.weapons).reduce((a, b) => a + b, 0))) === before + 1, '点中间那张卡，拿到一件武器或升一级');
  check((await g(() => __moshou.G.st.mode)) === 'play', '选完马上接着打');

  console.log('—— 打完第一关 ——');
  await setBot(SMART, 6, false);
  await page.waitForTimeout(2500);
  await setBot(SMART, 1, false);
  await page.waitForTimeout(300);
  await snap('03_打到一半');
  await setBot(SMART, 8, false);
  await waitFor(() => __moshou.G.mode === 'result', 60000, '第一关结算');
  await setBot(null, 1, false);
  await page.waitForTimeout(700);
  await snap('04_守住了');
  const r1 = await g(() => ({ win: __moshou.G.result.win, nb: __moshou.G.result.newBuddy && __moshou.G.result.newBuddy.name, lv: __moshou.meta.level, gold: __moshou.meta.gold }));
  check(r1.win, '第一关守住了');
  check(r1.nb === '铜雀', '第一次过关掉第一只机关伙伴：铜雀');
  check(r1.lv === 1, '解锁第二关');
  const bow0 = await g(() => __moshou.meta.bowLv);
  await clickBtn('upgrade');
  check((await g(() => __moshou.meta.bowLv)) === bow0 + 1, '金币够，点一下弩机升一级');
  const g0 = await g(() => __moshou.meta.gold);
  await clickBtn('double');
  check((await g(() => __moshou.meta.gold)) > g0, '点「翻倍」（假广告）金币变多');

  console.log('—— 下一关 ——');
  await clickBtn('again');
  check((await g(() => __moshou.G.st.level)) === 1 && (await g(() => __moshou.G.mode)) === 'play', '点「下一关」直接进第二关');
  check(await g(() => !!__moshou.G.st.buddy && __moshou.G.st.buddy.id === 'que'), '铜雀跟着上城墙');

  console.log('—— 拉总闸（假广告）——');
  await g(() => { const st = __moshou.G.st; const L = st.path.len; const gap = __moshou.C.DRAGON.gap; st.rushed = true; st.segs.forEach((s, i) => (s.s = L - gap * 1.4 - i * gap)); });
  await waitFor(() => __moshou.G.st.lever.offer > 0, 5000, '拉总闸按钮亮起');
  await page.waitForTimeout(250);
  await snap('05_拉总闸');
  const f0 = await g(() => __moshou.G.st.segs[0].s);
  await clickBtn('lever');
  const f1 = await g(() => __moshou.G.st.segs[0].s);
  check(f0 - f1 > 280, '拉总闸：龙往回退 10 节');
  await page.waitForTimeout(300);
  await snap('06_拉完总闸');

  console.log('—— 输，然后再来 ——');
  await setBot(LAZY, 10, false);
  await waitFor(() => __moshou.G.mode === 'end' || __moshou.G.mode === 'result', 90000, '第二关输掉');
  await setBot(null, 1, false);
  const lose = await g(() => __moshou.G.st.mode);
  if (lose === 'lose') {
    await waitFor(() => __moshou.G.mode === 'result', 3000, '失败页');
    await page.waitForTimeout(350);
    await snap('07_还差几节');
    check((await g(() => __moshou.G.result.left)) > 0, '失败页写着还差几节');
    await clickBtn('again');
    const tm = await g(() => __moshou.G.timing);
    const sec = (tm.restartAt - tm.loseAt) / 1000;
    check(sec <= 3, '死到再开局 ' + sec.toFixed(2) + ' 秒（只点一下）');
    check((await g(() => __moshou.G.mode)) === 'play', '再来一局：马上开打');
  } else {
    console.log('  （发呆机器人居然赢了，跳过）');
  }

  console.log('—— 自动连打 12 局，看会不会出错 ——');
  await g(() => { __moshou.G.log.length = 0; });
  await setBot(SMART, 12, true);
  await waitFor(() => __moshou.G.log.length >= 12, 240000, '连打 12 局');
  await setBot(null, 1, false);
  const log = await g(() => __moshou.G.log);
  check(log.length >= 12, '连打 ' + log.length + ' 局没卡死：' + log.map((l) => (l.win ? '赢' : '输') + (l.level + 1)).join(' '));

  check(errors.length === 0, '整个过程没有报错' + (errors.length ? '：' + errors.join(' / ') : ''));
  console.log('\n通过 ' + ok.length + ' 项');
  await browser.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
