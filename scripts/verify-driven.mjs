/**
 * 验证「曲线由真实排盘驱动」+「两体系方向显示」
 * 用法：BASE_URL=http://127.0.0.1:8082 node scripts/verify-driven.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9633;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\driven-profile', 'about:blank',
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 3000, deviceScaleFactor: 1, mobile: false });

await send('Page.navigate', { url: BASE + '/' });
await sleep(2000);
await ev(`localStorage.clear(); localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示用户',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'浙江杭州'}))`);
await send('Page.navigate', { url: BASE + '/dashboard/' });

console.log('1) 刚打开时（排盘计算中）:');
await sleep(1500);
console.log('  状态:', await ev(`
  (() => {
    const p = [...document.querySelectorAll('p')].find(x => x.textContent.includes('正在按你的出生信息逐年排盘') || x.textContent.includes('已由'));
    return p ? p.textContent.replace(/\\s+/g,' ').trim().slice(0, 80) : '未找到状态提示';
  })()
`));

console.log('\n2) 等待排盘完成（3 秒后）:');
await sleep(3500);
const status = await ev(`
  (() => {
    const p = [...document.querySelectorAll('p')].find(x => x.textContent.includes('正在按你的出生信息逐年排盘') || x.textContent.includes('已由'));
    return p ? p.textContent.replace(/\\s+/g,' ').trim() : '未找到';
  })()
`);
console.log('  状态:', status.slice(0, 200));
console.log('  已由真实排盘驱动:', status.includes('已由'));

console.log('\n3) 年度卡片上方的两体系方向:');
console.log(await ev(`
  (() => {
    const spans = [...document.querySelectorAll('span')].filter(s => /紫微 · |八字 · |两体系/.test(s.textContent));
    return spans.map(s => s.textContent.trim()).join('  |  ') || '未找到';
  })()
`));

console.log('\n4) 年度卡片的命理依据（应含真八字）:');
await ev(`(() => { const d = document.querySelector('details'); if (d) d.open = true; return true; })()`);
await sleep(800);
const basis = await ev(`
  (() => {
    const d = document.querySelector('details');
    return d ? d.textContent.replace(/\\s+/g,' ').trim() : '未找到';
  })()
`);
console.log(' ', basis.slice(0, 400));
console.log('\n  含「流年...十神」:', /流年.{2}，天干对日主为/.test(basis));
console.log('  含「大运」:', /大运/.test(basis));
console.log('  不再含占位字样:', !basis.includes('占位内容'));

console.log('\n5) 曲线是否随排盘变化（对比两个不同出生地）:');
const before = await ev(`
  (() => { const p = document.querySelector('svg path[stroke="#a8531f"]'); return p ? p.getAttribute('d').slice(0, 100) : '未找到'; })()
`);
await ev(`localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示用户',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'乌鲁木齐'}))`);
await send('Page.navigate', { url: BASE + '/dashboard/' });
await sleep(5000);
const after = await ev(`
  (() => { const p = document.querySelector('svg path[stroke="#a8531f"]'); return p ? p.getAttribute('d').slice(0, 100) : '未找到'; })()
`);
console.log('  杭州曲线前段:', before.slice(0, 60));
console.log('  乌鲁木齐曲线前段:', after.slice(0, 60));
console.log('  两条曲线不同:', before !== after);

await shot('driven-dashboard');
console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
ws.close();
chrome.kill();
process.exit(0);
