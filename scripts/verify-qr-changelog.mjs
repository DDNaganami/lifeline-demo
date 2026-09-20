/**
 * 验证：① 设备扫码页  ② 修改日志页
 * 用法：BASE_URL=http://112.111.47.239:25572 node scripts/verify-qr-changelog.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9655;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\qr-profile', 'about:blank',
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

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1500, deviceScaleFactor: 1, mobile: false });

/* ---------- 1. 设备扫码页 ---------- */
console.log('=== 1. 设备「扫码看详情」屏 ===');
await send('Page.navigate', { url: BASE + '/ambient/?screen=qr' });
await sleep(3500);

console.log('  屏幕尺寸:', await ev(`
  (() => { const el = [...document.querySelectorAll('div')].find(d => d.style && d.style.width === '480px'); return el ? Math.round(el.getBoundingClientRect().width) + '×' + Math.round(el.getBoundingClientRect().height) : '未找到'; })()
`));

console.log('  二维码 SVG 数量:', await ev(`document.querySelectorAll('svg[role=img]').length`));
const qrInfo = await ev(`
  (() => {
    const svg = document.querySelector('svg[role=img]');
    if (!svg) return '未找到二维码';
    const label = svg.getAttribute('aria-label') || '';
    const cells = svg.querySelectorAll('rect').length;
    return JSON.stringify({ 编码内容: label.replace('二维码：',''), 模块矩形数: cells });
  })()
`);
console.log('  二维码:', qrInfo);
console.log('  是否指向 /dashboard/:', String(qrInfo).includes('/dashboard/'));

console.log('  屏上文案:', await ev(`
  (() => {
    const el = [...document.querySelectorAll('div')].find(d => d.style && d.style.width === '480px');
    return el ? el.innerText.replace(/\\s+/g,' ').trim().slice(0, 80) : '未找到';
  })()
`));
await shot('qr-screen');

/* ---------- 2. 修改日志页 ---------- */
console.log('\n=== 2. 修改日志页 ===');
await send('Page.navigate', { url: BASE + '/changelog/' });
await sleep(3000);

console.log('  标题:', await ev(`document.querySelector('h1')?.textContent`));
console.log('  日志轮数:', await ev(`document.querySelectorAll('article').length`));
console.log('  是否含「目前哪些是真的」:', await ev(`document.body.innerText.includes('目前哪些是真的')`));
console.log('  是否含「真实计算」区块:', await ev(`document.body.innerText.includes('真实计算')`));
console.log('  是否含「仍是模拟」区块:', await ev(`document.body.innerText.includes('仍是模拟')`));
console.log('  修复类条目数:', await ev(`
  (() => {
    let n = 0;
    for (const s of document.querySelectorAll('span')) if (s.textContent.trim() === '修复') n++;
    return n;
  })()
`));
console.log('  「为什么」说明数:', await ev(`
  (() => { let n = 0; for (const s of document.querySelectorAll('span')) if (s.textContent.startsWith('为什么：')) n++; return n; })()
`));
console.log('  首页是否有入口:', await ev(`document.body.innerText.includes('去仪表盘')`));
await shot('changelog-page');

/* ---------- 3. 首页入口 ---------- */
console.log('\n=== 3. 首页入口 ===');
await send('Page.navigate', { url: BASE + '/' });
await sleep(2500);
console.log('  首页有「修改日志」链接:', await ev(`
  [...document.querySelectorAll('a')].some(a => a.textContent.includes('修改日志'))
`));
console.log('  首页有「桌面设备模拟器」链接:', await ev(`
  [...document.querySelectorAll('a')].some(a => a.textContent.includes('桌面设备模拟器'))
`));

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
ws.close();
chrome.kill();
process.exit(0);
