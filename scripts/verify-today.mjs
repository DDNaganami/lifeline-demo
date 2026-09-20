/**
 * 验证「今日」页：内容由流日排盘生成，且每日不同
 * 用法：BASE_URL=http://127.0.0.1:8082 node scripts/verify-today.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9744;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\today-profile', 'about:blank',
], { stdio: 'ignore' });

let wsUrl;
for (let i = 0; i < 60; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (p) { wsUrl = p.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(300);
}
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0;
const pending = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
};
const send = (method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => pending.set(id, r));
};
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return '异常: ' + r.result.exceptionDetails.exception?.description;
  return r.result?.result?.value;
};
const shot = async (name) => {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(`.shots\\${name}.png`, Buffer.from(res.result.data, 'base64'));
  console.log('  截图:', name);
};

let pass = 0;
let fail = 0;
function check(name, ok, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1900, deviceScaleFactor: 1, mobile: false });

/* 无出生信息时应跳回首页 */
console.log('=== 1. 没有出生信息时 ===');
await send('Page.navigate', { url: BASE + '/' });
await sleep(2000);
await ev(`localStorage.clear()`);
await send('Page.navigate', { url: BASE + '/today/' });
await sleep(2500);
const redirected = await ev(`location.pathname + location.search`);
check('无出生信息时跳回首页', redirected.includes('need=birth'), redirected);

/* 有出生信息 */
await ev(`localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'浙江杭州',birthTimeConfidence:'exact'}))`);
console.log('\n=== 2. 有出生信息时的今日页 ===');
await send('Page.navigate', { url: BASE + '/today/' });
await sleep(5000);

const body = await ev(`document.body.innerText.replace(/\\s+/g,' ')`);
console.log('  ' + body.slice(0, 420));

check('有日期', /\d{4} 年 \d+ 月 \d+ 日 星期/.test(body));
check('有农历', body.includes('二〇二') || body.includes('年八') || body.includes('农历') || body.includes('月'));
check('有干支', /\S+年 · \S+月 · \S+日/.test(body));
check('有今日能量', body.includes('今日能量'));
check('有能量等级', /高峰|顺畅|平稳|偏弱|低谷/.test(body));
check('有今日关注', body.includes('今日关注'));
check('有身体提醒', body.includes('身体提醒'));
check('有未来 7 天', body.includes('未来 7 天'));
check('有黄历宜忌', body.includes('黄历') && body.includes('宜') && body.includes('忌'));
check('说明了数据来源', body.includes('流日四化'));

/* 7 天条数 */
// 注意 CSS 选择器里 . 是特殊字符，class 名含 h-2.5 必须转义（\\.[0-9]）
const bars = await ev(`
  (() => {
    const section = [...document.querySelectorAll('section')].find(s => s.textContent.includes('未来 7 天'));
    return section ? section.querySelectorAll('[class*="h-2"]').length : -1;
  })()
`);
check('未来 7 天有 7 根柱', bars === 7, `实际 ${bars}`);

/* 数值应各不相同 —— 关键验证 */
const values = await ev(`
  (() => {
    const section = [...document.querySelectorAll('section')].find(s => s.textContent.includes('未来 7 天'));
    if (!section) return [];
    const rows = [...section.querySelectorAll('div.flex.items-center')];
    return rows.map(r => r.lastElementChild?.textContent?.trim()).filter(Boolean);
  })()
`);
console.log('  7 天数值:', JSON.stringify(values));
check('7 天数值不是同一个数', new Set(values).size >= 3, `实际 ${new Set(values).size} 种`);

await shot('today-page');

/* 换个人，读数应不同 */
console.log('\n=== 3. 换一份出生信息，读数应不同 ===');
const before = body.slice(0, 300);
await ev(`localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示',gender:'女',birthDate:'1985-03-10',birthTime:'寅时 03:00-05:00',birthPlace:'北京',birthTimeConfidence:'exact'}))`);
await send('Page.navigate', { url: BASE + '/today/' });
await sleep(5000);
const body2 = await ev(`document.body.innerText.replace(/\\s+/g,' ')`);
console.log('  ' + body2.slice(0, 260));
check('不同命盘的今日读数不同', before !== body2.slice(0, 300));

/* 首页入口 */
console.log('\n=== 4. 首页的「今日」入口 ===');
await send('Page.navigate', { url: BASE + '/' });
await sleep(3000);
check('已填过信息 → 首页出现今日入口', await ev(`document.body.innerText.includes('看今天的能量')`));
const link = await ev(`[...document.querySelectorAll('a')].some(a => a.getAttribute('href') === '/today/')`);
check('今日入口是可点的链接', link);

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
