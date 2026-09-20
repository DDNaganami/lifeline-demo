/**
 * 验证真实排盘接入界面
 * 用法：BASE_URL=http://127.0.0.1:8082 node scripts/verify-chart.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9622;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\chart-profile', 'about:blank',
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2600, deviceScaleFactor: 1, mobile: false });

// 准备出生信息
await send('Page.navigate', { url: BASE + '/' });
await sleep(2000);
await ev(`localStorage.clear(); localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示用户',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'浙江杭州'}))`);
await send('Page.navigate', { url: BASE + '/dashboard/' });
await sleep(4500);

console.log('1) 页面挂载:', await ev(`document.querySelector('h1')?.textContent`));

console.log('\n2) 是否有「本命盘」区块:', await ev(`
  [...document.querySelectorAll('h2')].some(h => h.textContent.includes('本命盘'))
`));

console.log('\n3) 排盘摘要（从页面读取）:');
console.log(await ev(`
  (() => {
    const h = [...document.querySelectorAll('h2')].find(x=>x.textContent.includes('本命盘'));
    if (!h) return '未找到';
    const sec = h.closest('section');
    const dts = [...sec.querySelectorAll('dt')].map(d=>d.textContent.trim());
    const dds = [...sec.querySelectorAll('dd')].map(d=>d.textContent.trim());
    return dts.map((t,i)=>t+': '+(dds[i]||'')).join(' | ');
  })()
`));

console.log('\n4) 展开十二宫:');
await ev(`
  (() => {
    const b = [...document.querySelectorAll('button')].find(x=>x.textContent.includes('展开十二宫'));
    if (b) b.click();
    return !!b;
  })()
`);
await sleep(1200);
console.log('  十二宫格数:', await ev(`
  (() => {
    const h = [...document.querySelectorAll('h2')].find(x=>x.textContent.includes('本命盘'));
    const sec = h.closest('section');
    const cells = [...sec.querySelectorAll('div')].filter(d => /大限 \\d+-\\d+/.test(d.textContent) && d.textContent.length < 60);
    return cells.length;
  })()
`));
console.log('  命宫格内容:', await ev(`
  (() => {
    const h = [...document.querySelectorAll('h2')].find(x=>x.textContent.includes('本命盘'));
    const sec = h.closest('section');
    const soul = [...sec.querySelectorAll('div')].find(d => d.className.includes('accent') && d.textContent.includes('命宫'));
    return soul ? soul.textContent.replace(/\\s+/g,' ').trim() : '未找到命宫格';
  })()
`));
await shot('chart-natal');

console.log('\n5) 年度卡片的命理依据（应为真实排盘）:');
await ev(`
  (() => {
    const d = document.querySelector('details');
    if (d) d.open = true;
    return true;
  })()
`);
await sleep(900);
console.log(await ev(`
  (() => {
    const d = document.querySelector('details');
    if (!d) return '未找到命理依据区';
    const txt = d.textContent.replace(/\\s+/g,' ').trim();
    return txt.slice(0, 320);
  })()
`));
console.log('\n  是否含真实四化:', await ev(`
  (() => {
    const d = document.querySelector('details');
    return d ? /化[禄权科忌]/.test(d.textContent) : false;
  })()
`));
console.log('  是否含大限宫位与区间:', await ev(`
  (() => {
    const d = document.querySelector('details');
    return d ? /大限行至/.test(d.textContent) && /区间 \\d+-\\d+ 岁/.test(d.textContent) : false;
  })()
`));
await shot('chart-year-basis');

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
ws.close();
chrome.kill();
process.exit(0);
