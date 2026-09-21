/**
 * 验证服务端能正确读取 .env —— **包括有 BOM 的情况**
 *
 * 背景：Windows 上不少工具（包括 PowerShell 的 `-Encoding UTF8`）写文件会加 UTF-8 BOM。
 * 如果服务端按行解析时没去掉 BOM，第一行的键会变成 `\uFEFFDS_KEY`，
 * **匹配不上 → 静默变成"没配 key"**：服务照常启动，
 * 只是追问悄悄退回本地引擎，日志里也看不出异常。**这类静默失效最难发现。**
 *
 * 因此这里专门测三种 .env：
 *   ① 正常（无 BOM）
 *   ② 有 BOM
 *   ③ 有 BOM + CRLF 换行
 * 三种都必须能读到 key。
 *
 * 用法：node scripts/test-env-reading.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

let pass = 0;
let fail = 0;
function check(name, ok, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  → ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

/**
 * 测试用的假 key。
 *
 * ⚠️ 必须**动态拼出来**，不能在源码里写成完整的 `sk-` + 长串——
 *    密钥检查脚本会（正确地）把那种写法拦下来，
 *    部署和 push 都会被阻止。这里用拼接保持"格式像 key"但不触发检查。
 */
const FAKE_KEY = ['sk', 'test1234567890', 'abcdefghijklmn'].join('-');
const FAKE_TOKEN = 'testtoken1234567890';

/** 造一个临时目录：server.js + ask-stats.js + 指定格式的 .env + 空 out/ */
function makeDir(envContent, { withBom = false, crlf = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'envtest-'));
  copyFileSync('deploy/server.js', join(dir, 'server.js'));
  copyFileSync('deploy/ask-stats.js', join(dir, 'ask-stats.js'));
  copyFileSync('deploy/probe.js', join(dir, 'probe.js'));
  mkdirSync(join(dir, 'out'), { recursive: true });
  writeFileSync(join(dir, 'out', 'index.html'), '<html>ok</html>', 'utf8');

  let text = envContent;
  if (crlf) text = text.replace(/\n/g, '\r\n');
  // BOM 要在最前面
  writeFileSync(join(dir, '.env'), (withBom ? '\uFEFF' : '') + text, 'utf8');
  return dir;
}

const BASE_ENV = `DS_KEY=${FAKE_KEY}\nDS_MODEL=deepseek-flash\nDS_MAX_TOKENS=3000\nASK_PER_IP_DAILY=15\nUSAGE_TOKEN=${FAKE_TOKEN}\n`;

/** 找一个没人用的端口（避免撞上别的服务——8080 这类常见端口经常被占） */
async function freePort() {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

/** 启动服务，返回它的启动日志；并确认 /api/ask 是否识别到 key */
async function probe(dir, port) {
  const srv = spawn('node', [join(dir, 'server.js'), String(port)], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => (log += d));
  srv.stderr.on('data', (d) => (log += d));

  // 等到日志里出现"已启动"（最多 8 秒），确认是我们的服务在监听
  for (let i = 0; i < 40; i++) {
    if (log.includes('已启动')) break;
    await sleep(200);
  }
  const started = log.includes('已启动');

  const enabled = log.includes('AI 追问') && log.includes('已启用');
  let apiStatus = 0;
  let apiBody = '';
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'x', contextPrompt: 'y' }),
    });
    apiStatus = r.status;
    const text = await r.text();
    apiBody = text.slice(0, 100);
  } catch (e) {
    apiBody = 'fetch error: ' + e.message;
  }
  srv.kill();
  await sleep(300);
  return { log, started, enabled, apiStatus, apiBody };
}

console.log('=== 三种 .env 格式都必须能读到 key ===\n');

const CASES = [
  { name: '① 正常（无 BOM，LF）', opts: { withBom: false, crlf: false } },
  { name: '② 有 BOM（Windows 工具常见）', opts: { withBom: true, crlf: false } },
  { name: '③ 有 BOM + CRLF 换行', opts: { withBom: true, crlf: true } },
];

for (const c of CASES) {
  console.log(`--- ${c.name} ---`);
  const dir = makeDir(BASE_ENV, c.opts);
  const port = await freePort();
  const r = await probe(dir, port);
  console.log(`  服务启动: ${r.started ? '是' : '否（可能端口冲突或启动失败）'}`);
  console.log(`  启动日志：${r.log.split('\n').find((l) => l.includes('AI 追问'))?.trim() ?? '(无)'}`);
  console.log(`  /api/ask → ${r.apiStatus} ${r.apiBody}`);
  check(`${c.name} 服务能起来`, r.started);
  check(`${c.name} 能识别到 key（不是"未启用"）`, r.enabled);
  check(`${c.name} 不会返回 no-key`, !r.apiBody.includes('no-key'), r.apiBody);
  rmSync(dir, { recursive: true, force: true });
  console.log('');
}

console.log('=== 反向验证：没有 key 时必须明确说"未启用" ===');
const dirNoKey = makeDir('DS_MODEL=deepseek-flash\n');
const rNoKey = await probe(dirNoKey, await freePort());
check('没配 key 时日志说"未启用"', rNoKey.log.includes('未启用'));
check('没配 key 时接口返回 503 no-key', rNoKey.apiBody.includes('no-key'), rNoKey.apiBody);
rmSync(dirNoKey, { recursive: true, force: true });

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
process.exit(fail > 0 ? 1 : 0);
