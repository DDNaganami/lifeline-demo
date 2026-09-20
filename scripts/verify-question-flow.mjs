/**
 * 验证「提问 → 出生信息 → 仪表盘落在问题上」这条新结构
 * 用法：BASE_URL=http://127.0.0.1:8082 node scripts/verify-question-flow.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9699;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\qflow-profile', 'about:blank',
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
const setInput = (sel, val) => ev(`
  (() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false;
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(val)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()
`);

let pass = 0;
let fail = 0;
/** 注意：这是 .mjs（不是 TS），不能写类型标注 */
function check(name, ok, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1400, deviceScaleFactor: 1, mobile: false });

/* ---------- 1. 首页：提问优先 === ---------- */
console.log('=== 1. 首页结构（提问优先）===');
await send('Page.navigate', { url: BASE + '/' });
await sleep(3000);
await ev(`localStorage.clear()`);

const h1 = await ev(`document.querySelector('h1')?.textContent`);
check('首屏标题是提问式', h1 === '今天，想问问什么？', `实际：${h1}`);

const questionCount = await ev(`
  (() => [...document.querySelectorAll('a')].filter(a => a.getAttribute('href')?.startsWith('/birth/?')).length)()
`);
check('有 6 个可直接点的问题', questionCount === 6, `实际 ${questionCount} 个`);

const hasDirectLink = await ev(`
  [...document.querySelectorAll('a')].some(a => a.getAttribute('href') === '/birth/')
`);
check('也保留「直接开始」入口', hasDirectLink);

check(
  '首屏不再是一张出生信息表',
  !(await ev(`!!document.querySelector('#birthDate')`)),
);
await shot('qflow-1-home');

/* ---------- 2. 点问题 → 出生信息页 === ---------- */
console.log('\n=== 2. 点第一个问题 ===');
await ev(`
  (() => {
    const a = [...document.querySelectorAll('a')].find(x => x.getAttribute('href')?.startsWith('/birth/?'));
    a.click();
    return true;
  })()
`);
await sleep(2500);
const url2 = await ev(`location.pathname + location.search`);
check('跳到出生信息页并带上问题', url2.startsWith('/birth/?q='), url2);

const askedShown = await ev(`document.body.innerText.includes('你想问的是')`);
check('出生信息页顶部钉住了问题', askedShown);
check('页面有「关于你。」标题', await ev(`document.body.innerText.includes('关于你。')`));

// 填表
await setInput('#birthDate', '1993-06-18');
await setInput('#birthTime', '午时 11:00-13:00');
await setInput('#birthPlace', '浙江杭州');
await sleep(800);
await shot('qflow-2-birth');

/* ---------- 3. 提交 → 仪表盘落在那个问题上 === ---------- */
console.log('\n=== 3. 提交后仪表盘是否落在问题上 ===');
await ev(`document.querySelector('button[type=submit]').click()`);
await sleep(6000);

const url3 = await ev(`location.pathname + location.search`);
check('仪表盘地址带上了问题', url3.includes('q=') && url3.includes('dim='), url3);

const banner = await ev(`
  (() => {
    const t = document.body.innerText;
    return t.includes('你问的是') ? t.slice(t.indexOf('你问的是'), t.indexOf('你问的是') + 120).replace(/\\s+/g,' ') : '未找到';
  })()
`);
console.log('  横幅内容:', banner);
check('仪表盘显示了「你问的是」横幅', banner !== '未找到');

// 维度是否跟着切
const activeTab = await ev(`document.querySelector('[role=tab][aria-selected=true]')?.textContent`);
check('维度切到了问题对应的维度（事业）', activeTab === '事业', `实际：${activeTab}`);

// 年份是否跟着定位（问题是「我今年的事业会不会有转机」→ 今年）
const yearCard = await ev(`document.querySelectorAll('h3')[0]?.textContent`);
console.log('  落地年份卡片:', yearCard);
check('落在问题对应的年份', typeof yearCard === 'string' && yearCard.startsWith('2026'), `实际：${yearCard}`);

await shot('qflow-3-dashboard');

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
