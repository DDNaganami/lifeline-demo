/**
 * 验证追问接口（/api/ask）
 * ---------------------------------------------------------------
 * 重点验证**安全设计**：
 *   1. 没配 key 时明确告知（不是崩溃、不是假装成功）
 *   2. key 不出现在任何响应里
 *   3. 通过接口能真的拿到模型回答
 *   4. 服务端限流生效
 *
 * 用法：
 *   node scripts/test-ask-api.mjs                # 不配 key
 *   DS_KEY=xxx node scripts/test-ask-api.mjs     # 配 key
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8099;
const KEY = process.env.DS_KEY;

let pass = 0;
let fail = 0;
function check(name, ok, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  → ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

// 关键：把 key 通过环境变量传给子进程，而不是写进命令参数（参数会进进程列表）
const env = { ...process.env };
const srv = spawn('node', ['deploy/server.js', String(PORT)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env,
});
let log = '';
srv.stdout.on('data', (d) => (log += d));
srv.stderr.on('data', (d) => (log += d));
await sleep(2500);

console.log('=== 1. 启动日志 ===');
console.log(log.split('\n').map((l) => '  ' + l).join('\n'));

console.log('\n=== 2. key 绝不能出现在日志里（仓库是公开的）===');
if (KEY) {
  check('启动日志不含 key', !log.includes(KEY));
  check('启动日志只说"已启用"', log.includes('AI 追问') && log.includes('已启用'));
} else {
  check('没配 key 时提示如何启用', log.includes('未启用'));
  check('提示了 .env.example', log.includes('.env.example'));
}

console.log('\n=== 3. 方法限制 ===');
const getRes = await fetch(`http://127.0.0.1:${PORT}/api/ask`);
const getBody = await getRes.json();
console.log(`  GET → ${getRes.status} ${JSON.stringify(getBody)}`);
check('GET 返回 405', getRes.status === 405);

console.log('\n=== 4. 请求体校验 ===');
const empty = await fetch(`http://127.0.0.1:${PORT}/api/ask`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: '' }),
});
console.log(`  空问题 → ${empty.status} ${JSON.stringify(await empty.json())}`);
check('空问题被拒绝', empty.status === 400);

const badJson = await fetch(`http://127.0.0.1:${PORT}/api/ask`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: 'not json',
});
console.log(`  坏 JSON → ${badJson.status}`);
check('坏请求体被拒绝', badJson.status === 400);

console.log('\n=== 5. 真实追问 ===');
const question = '我今年该不该换工作';
const contextPrompt = [
  '盘面事实：',
  '- 年份 / 年龄：2026 年 / 33 岁',
  '- 维度：事业',
  '- 大限：32-41 岁 · 子女宫',
  '- 流年：丙午',
  '- 流年四化：天同化禄、天机化权、文昌化科、廉贞化忌',
  '- 本年主判断：2026 年事业上的阻力偏实在，宜守不宜攻',
].join('\n');

const t0 = Date.now();
const res = await fetch(`http://127.0.0.1:${PORT}/api/ask`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question, contextPrompt }),
});
const ms = Date.now() - t0;
const body = await res.json();
console.log(`  HTTP ${res.status}  ${ms}ms`);

if (KEY) {
  console.log('  ── 回答 ──');
  console.log((body.answer ?? '(无)').split('\n').map((l) => '  ' + l).join('\n'));
  console.log(`  用量: ${JSON.stringify(body.usage)}`);
  check('返回成功', body.ok === true, JSON.stringify(body).slice(0, 120));
  check('有回答内容', typeof body.answer === 'string' && body.answer.length > 50, `${body.answer?.length ?? 0} 字`);
  check('响应里不含 key', !JSON.stringify(body).includes(KEY));
  check('耗时在可接受范围（< 30 秒）', ms < 30000, `${ms}ms`);

  console.log('\n=== 6. 回答是否遵守约束 ===');
  const a = body.answer ?? '';
  check('没有绝对措辞', !/一定会|绝对会|必然/.test(a));
  check('没有许诺具体月份', !/\d+月份/.test(a));
  check('给了可执行的下一步', /下一步|建议|可以先|不妨/.test(a));
  check('长度适中（<= 500 字）', a.length <= 500, `${a.length} 字`);

  console.log('\n=== 7. 响应里不能有思维链（reasoning 不该外泄）===');
  check('响应体不含 reasoning_content', !('reasoning_content' in body));
} else {
  check('未配 key 时返回 503（前端会退回本地引擎）', res.status === 503, `${res.status}`);
  check('明确说明原因', body.error === 'no-key' || body.hint !== undefined, JSON.stringify(body));
}

console.log('\n=== 8. 服务端限流 ===');
// 连续打满，看是否出现 429
const codes = [];
for (let i = 0; i < 20; i++) {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'q' + i, contextPrompt: 'x' }),
  });
  codes.push(r.status);
  if (r.status === 429) break;
}
const has429 = codes.includes(429);
console.log(`  状态序列: ${codes.join(', ')}`);
if (KEY) {
  check('触发服务端限流（返回 429）', has429, `第 ${codes.indexOf(429) + 1} 次`);
} else {
  // 没配 key 时，503 会先于限流返回（因为 key 检查在限流之前）
  check('未配 key 时每次都返回 503（不进入限流）', codes.every((c) => c === 503));
}

console.log('\n=== 9. 日志里不含用户问题原文（隐私）===');
console.log(log.split('\n').filter((l) => l.includes('/api/ask')).map((l) => '  ' + l).join('\n') || '  （无接口日志）');
check('日志只记长度不记原文', !log.includes('我今年该不该换工作'));

srv.kill();
console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
process.exit(fail > 0 ? 1 : 0);
