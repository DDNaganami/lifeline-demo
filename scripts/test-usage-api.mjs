/**
 * 验证用量统计：token 保护、统计准确、不泄漏密钥
 * 用法：node scripts/test-usage-api.mjs
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8097;
const env = readFileSync('.env', 'utf8');
const token = (env.match(/USAGE_TOKEN=(.+)/)?.[1] ?? '').trim();
const key = (env.match(/DS_KEY=(.+)/)?.[1] ?? '').trim();

let pass = 0;
let fail = 0;
function check(name, ok, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  → ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

const srv = spawn('node', ['deploy/server.js', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
srv.stdout.on('data', (d) => (log += d));
srv.stderr.on('data', (d) => (log += d));
await sleep(2500);

const base = `http://127.0.0.1:${PORT}`;

console.log('=== 1. 启动日志 ===');
console.log(log.split('\n').filter((l) => l.includes('追问') || l.includes('用量')).map((l) => '  ' + l.trim()).join('\n'));
check('提示了用量入口', log.includes('/api/usage'));
check('日志不含 API key', !log.includes(key) || key === '');
check('日志不含用量 token', !log.includes(token) || token === '');

console.log('\n=== 2. token 保护 ===');
const noToken = await fetch(`${base}/api/usage`);
console.log(`  无 token → ${noToken.status} ${JSON.stringify(await noToken.json()).slice(0, 90)}`);
check('无 token 被拒', noToken.status === 401);

const wrong = await fetch(`${base}/api/usage?token=wrong`);
console.log(`  错 token → ${wrong.status}`);
check('错 token 被拒', wrong.status === 401);

const right = await fetch(`${base}/api/usage?token=${token}`);
const html = await right.text();
console.log(`  对 token → ${right.status}，${html.length} 字节`);
check('对 token 通过', right.status === 200);
check('是 HTML 页面', html.includes('<!doctype html'));
check('含四个统计卡片', ['今天', '近 7 天', '近 30 天', '累计'].every((t) => html.includes(t)));
check('含成本说明', html.includes('量级估算') || html.includes('粗算'));
check('说明了数据位置', html.includes('ask-stats.json'));
check('页面里不含 API key', !html.includes(key) || key === '');
check('页面里不含 token 本身', !html.includes(token) || token === '');

console.log('\n=== 3. 统计是否准确 ===');
const readToday = (h) => {
  const m = h.match(/今天<\/div><div class="v">(\d+)<\/div><div class="s">(\d+) token/);
  return m ? { asks: Number(m[1]), tokens: Number(m[2]) } : null;
};
const before = readToday(html);
console.log('  追问前：', JSON.stringify(before));

// 真实追问一次
const ask = await fetch(`${base}/api/ask`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: '我今年该不该换工作',
    contextPrompt: '盘面事实：\n- 年份/年龄：2026年/33岁\n- 大限：32-41岁·子女宫\n- 主判断：宜守不宜攻',
  }),
});
const askBody = await ask.json();
console.log(`  追问 → HTTP ${ask.status}，ok=${askBody.ok}，用量 ${JSON.stringify(askBody.usage?.total_tokens)}`);
await sleep(1200);

const after = readToday((await (await fetch(`${base}/api/usage?token=${token}`)).text()));
console.log('  追问后：', JSON.stringify(after));
check('次数 +1', after && before && after.asks === before.asks + 1, `${before?.asks} → ${after?.asks}`);
check('token 数增加', after && before && after.tokens > before.tokens, `${before?.tokens} → ${after?.tokens}`);
check(
  '统计的 token 与接口返回一致',
  after && askBody.usage ? after.tokens - before.tokens === askBody.usage.total_tokens : false,
  `差 ${after && before ? after.tokens - before.tokens : '?'} vs ${askBody.usage?.total_tokens}`,
);

console.log('\n=== 4. 日志只记数字不记内容（隐私）===');
check('日志不含用户问题原文', !log.includes('我今年该不该换工作'));
const usageLines = log.split('\n').filter((l) => l.includes('[用量]'));
console.log('  用量日志行：');
for (const l of usageLines) console.log('    ' + l.trim());
check('有用量日志行', usageLines.length > 0);
check('用量日志含今日次数与 token', usageLines.some((l) => /今日 \d+ 次 · \d+ token/.test(l)));

console.log('\n=== 5. 统计文件不落盘敏感信息 ===');
const statsFile = readFileSync('deploy/ask-stats.json', 'utf8');
console.log('  文件内容：', statsFile.replace(/\s+/g, ' ').slice(0, 160));
check('统计文件不含 key', !statsFile.includes(key) || key === '');
check('统计文件不含 token', !statsFile.includes(token) || token === '');
check('统计文件不含问题原文', !statsFile.includes('换工作'));
check('统计文件只有日期与计数', /"days"/.test(statsFile) && /"asks"/.test(statsFile));

srv.kill();
console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
process.exit(fail > 0 ? 1 : 0);
