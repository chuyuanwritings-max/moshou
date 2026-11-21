// 外壳：只开一次画布和手指，主页 / 机关龙 / 守城打龙 三个画面轮流接手。
// 每个画面 register(名字, { onTouch, frame, enter })；go(名字) 切过去。
const PF = require('./platform.js');

const modes = {};
let active = null;
let handler = null;
const view = PF.setup((type, id, x, y) => {
  if (handler) handler(type, id, x, y);
});

function register(name, m) {
  modes[name] = m;
}
function go(name) {
  active = name;
  handler = modes[name].onTouch;
  if (modes[name].enter) modes[name].enter();
}
function loop() {
  if (active && modes[active]) modes[active].frame();
  PF.nextFrame(loop);
}
PF.nextFrame(loop);

module.exports = { view, register, go, current: () => active };
