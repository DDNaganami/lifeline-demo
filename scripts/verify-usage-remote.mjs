/**
 * 外网验证用量接口 + 追问接口（不打印任何密钥）
 * 用法：node scripts/verify-usage-remote.mjs
 */
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://112.111.47.239:25572';
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

console.log('=== 1. /api/ask 已接通 ===');
const ask = await fetch(`${BASE}/api/ask`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: '我今年该不该换工作',
    contextPrompt: '盘面事实：\n- 年份/年龄：2026年/33岁\n- 大限：32-41岁·子女宫\n- 主判断：宜守不宜攻',
  }),
});
const askBody = await ask.json();
console.log(`  HTTP ${ask.status}  ok=${askBody.ok}  用量=${JSON.stringify(askBody.usage?.total_tokens)} token`);
check('追问成功', askBody.ok === true);
check('返回里有回答', typeof askBody.answer === 'string' && askBody.answer.length > 50);
check('响应不含 key', !JSON.stringify(askBody).includes(key) || key === '');

console.log('\n=== 2. /api/usage 的 token 保护 ===');
const noToken = await fetch(`${BASE}/api/usage`);
check('无 token 被拒（401）', noToken.status === 401, `实际 ${noToken.status}`);
const wrongToken = await fetch(`${BASE}/api/usage?token=wrong`);
check('错 token 被拒（401）', wrongToken.status === 401, `实际 ${wrongToken.status}`);
const okRes = await fetch(`${BASE}/api/usage?token=${token}`);
const html = await okRes.text();
check('对 token 通过（200）', okRes.status === 200, `实际 ${okRes.status}`);
check('是 HTML 页面', html.includes('<!doctype html'));
check('页面不含 API key', !html.includes(key) || key === '');
check('页面不含 token 本身', !html.includes(token) || token === '');

console.log('\n=== 3. 统计是否记上了刚才那次追问 ===');
const grab = (label, h) => {
  // 普通卡片：<div class="s">N token · ¥X</div>
  const normal = new RegExp(
    `${label}</div><div class="v">(\\d+)</div><div class="s">(\\d+) token · (¥[\\d.]+)`,
  );
  const m1 = h.match(normal);
  if (m1) return { asks: Number(m1[1]), tokens: Number(m1[2]), cost: m1[3] };
  // 累计卡片多了"天数"：<div class="s">N 天 · M token · ¥X</div>
  const cum = new RegExp(
    `${label}</div><div class="v">(\\d+)</div><div class="s">\\d+ 天 · (\\d+) token · (¥[\\d.]+)`,
  );
  const m2 = h.match(cum);
  return m2 ? { asks: Number(m2[1]), tokens: Number(m2[2]), cost: m2[3] } : null;
};
const today = grab('今天', html);
const week = grab('近 7 天', html);
const month = grab('近 30 天', html);
const all = grab('累计', html);
console.log('  今天：', JSON.stringify(today));
console.log('  近 7 天：', JSON.stringify(week));
console.log('  近 30 天：', JSON.stringify(month));
console.log('  累计：', JSON.stringify(all));
check('今天至少 1 次', (today?.asks ?? 0) >= 1);
check('今天 token 数与刚才一致或更大', (today?.tokens ?? 0) >= (askBody.usage?.total_tokens ?? 0));
check('近 7 天 >= 今天', (week?.asks ?? 0) >= (today?.asks ?? 0));
check('累计 >= 近 30 天 >= 近 7 天', (all?.asks ?? 0) >= (month?.asks ?? 0) && (month?.asks ?? 0) >= (week?.asks ?? 0));
check('显示了成本估算', typeof today?.cost === 'string' && today.cost.startsWith('¥'));

console.log('\n=== 4. 页面说明了估算口径（不能让人当成账单）===');
check('说明了是量级估算', html.includes('量级估算') || html.includes('粗算'));
check('提示以 DeepSeek 后台为准', html.includes('DeepSeek 后台') || html.includes('后台为准'));
check('说明了数据位置', html.includes('ask-stats.json'));
check('说明了保留天数', html.includes('60 天'));

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
process.exit(fail > 0 ? 1 : 0);
