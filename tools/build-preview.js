// 把微信小游戏的代码（game.js + js/*.js，CommonJS）打包成一个能直接双击打开的 preview.html。
// 用法：node tools/build-preview.js
// 游戏代码本身一行不改，微信里跑的和浏览器里看的是同一份。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
// js/ 下面连子文件夹（js/ram/ 机关龙玩法）一起打包
function walk(dir) {
  return fs.readdirSync(path.join(root, dir)).flatMap((f) => {
    const p = dir + '/' + f;
    if (fs.statSync(path.join(root, p)).isDirectory()) return walk(p);
    return f.endsWith('.js') ? [p] : [];
  });
}
const files = ['game.js'].concat(walk('js'));

const defs = files
  .map((f) => {
    const code = fs.readFileSync(path.join(root, f), 'utf8');
    return '__def(' + JSON.stringify(f) + ', function (module, exports, require) {\n' + code + '\n});';
  })
  .join('\n');

const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>墨守</title>
<style>
  html, body { margin: 0; height: 100%; background: #120d0a; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  canvas { display: block; touch-action: none; border-radius: 18px; box-shadow: 0 0 0 1px #2b2438; }
  @media (max-width: 520px) { canvas { border-radius: 0; box-shadow: none; } }
</style>
</head>
<body>
<canvas id="game"></canvas>
<script>
// 极简 CommonJS：模拟微信小游戏的 require
var __m = {}, __c = {};
function __def(name, fn) { __m[name] = fn; }
function __resolve(from, p) {
  var parts = (from.indexOf('/') >= 0 ? from.slice(0, from.lastIndexOf('/')) : '').split('/').filter(Boolean);
  p.split('/').forEach(function (s) { if (s === '..') parts.pop(); else if (s && s !== '.') parts.push(s); });
  var k = parts.join('/');
  return __m[k] ? k : k + '.js';
}
function __require(from) {
  return function (p) {
    var k = __resolve(from, p);
    if (__c[k]) return __c[k].exports;
    if (!__m[k]) throw new Error('找不到模块 ' + k);
    var module = { exports: {} };
    __c[k] = module;
    __m[k](module, module.exports, __require(k));
    return module.exports;
  };
}
${defs}
__require('')('./game.js');
</script>
</body>
</html>
`;

// preview.html 给本地双击；index.html 给 GitHub Pages 当首页（内容一样）
fs.writeFileSync(path.join(root, 'preview.html'), html);
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('写好了 preview.html 和 index.html（' + files.length + ' 个文件）');

// 包体检查：按 project.config.json 的打包忽略表，算微信真会打进主包的文件有多大。
// 微信上限 4 MB，我们自己留余量到 3.5 MB；超了就报错（退出码 1），不让超重的版本推上线。
const LIMIT_MB = 3.5;
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
const ign = (cfg.packOptions && cfg.packOptions.ignore) || [];
const skip = (rel, isDir) => rel.split('/').some((s) => s.startsWith('.')) || ign.some((r) => r.value === rel && (r.type === 'folder') === isDir);
let bytes = 0;
const big = [];
(function size(dir) {
  for (const f of fs.readdirSync(path.join(root, dir))) {
    const rel = dir ? dir + '/' + f : f;
    const st = fs.statSync(path.join(root, rel));
    if (skip(rel, st.isDirectory())) continue;
    if (st.isDirectory()) size(rel);
    else {
      bytes += st.size;
      big.push([rel, st.size]);
    }
  }
})('');
const mb = bytes / 1024 / 1024;
if (mb > LIMIT_MB) {
  big.sort((a, b) => b[1] - a[1]);
  console.error('✗ 包体 ' + mb.toFixed(2) + ' MB，超过 ' + LIMIT_MB + ' MB。最大的几个：\n' + big.slice(0, 8).map(([f, s]) => '  ' + (s / 1024).toFixed(0) + ' KB  ' + f).join('\n'));
  process.exitCode = 1;
} else console.log('包体 ' + mb.toFixed(2) + ' MB（上限 ' + LIMIT_MB + ' MB）');
