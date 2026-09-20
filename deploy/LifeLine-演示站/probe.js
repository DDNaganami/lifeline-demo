/**
 * 服务端依赖自检
 * ---------------------------------------------------------------
 * 部署前后都能跑。检查 `server.js`：
 *   1. 语法能不能解析
 *   2. 它 require 的模块**是否都存在**（相对路径的同目录文件最容易漏）
 *
 * 为什么需要它：
 *   server.js 引入了新的依赖文件（如 ask-stats.js），
 *   而部署脚本只复制 out/ 和 server.js ——
 *   结果服务器启动就报 `Cannot find module './ask-stats'`，服务起不来。
 *   这类问题在本地看不出来（本地文件都在），只会在服务器上炸。
 *
 * 用法：
 *   node deploy/probe.js            # 检查当前目录
 *   node deploy/probe.js <目录>      # 检查指定目录
 * 退出码非 0 表示有问题。
 */

const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || __dirname;
const serverPath = path.join(dir, 'server.js');

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

let src;
try {
  src = fs.readFileSync(serverPath, 'utf8');
} catch {
  fail(`找不到 ${serverPath}`);
}

// 1) 语法检查（只解析，不执行）
try {
  new Function(src);
} catch (e) {
  fail(`server.js 语法错误：${e.message}`);
}
console.log('✅ 语法解析通过');

// 2) 依赖检查：把 src 转成模块源码后再匹配，避免在这里转义引号
const asModule = src.replace(/\brequire\s*\(/g, '__REQ__(');
const specs = [];
for (const m of asModule.matchAll(/__REQ__\(\s*['"]([^'"]+)['"]\s*\)/g)) {
  specs.push(m[1]);
}
const unique = [...new Set(specs)];

const missing = [];
for (const spec of unique) {
  // 只检查相对路径（Node 内置模块与第三方包交给运行时）
  if (!spec.startsWith('.')) continue;
  const target = path.resolve(dir, spec);
  const candidates = [target, `${target}.js`, path.join(target, 'index.js')];
  if (!candidates.some((c) => fs.existsSync(c))) missing.push(spec);
}

if (missing.length > 0) {
  console.error(`❌ 缺少 ${missing.length} 个被 require 的文件：`);
  for (const m of missing) console.error(`   ${m}  →  期望在 ${path.resolve(dir, m)}`);
  console.error('\n   处理：把缺的文件一起放进部署包（deploy/ 下的 .js 都应同步）');
  process.exit(1);
}

// 3) 服务端配套文件是否齐全（deploy/ 下的 .js 都该在）
const jsFiles = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.js'));
console.log(`✅ 依赖齐全（检查了 ${unique.filter((s) => s.startsWith('.')).length} 个相对依赖）`);
console.log(`   目录内的服务端文件：${jsFiles.join('、')}`);
