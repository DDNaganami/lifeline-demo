/**
 * 验证圆形屏遮罩：切换三种形状、检查遮挡检测报告
 * 用法：BASE_URL=http://127.0.0.1:8080 node scripts/verify-round.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9611;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const OUT = '.shots';
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\round-profile', 'about:blank',
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
  writeFileSync(`${OUT}\\${name}.png`, Buffer.from(res.result.data, 'base64'));
  console.log('  截图:', name);
};
const clickText = async (text) => ev(`
  (() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(${JSON.stringify(text)}));
    if (!b) return false;
    b.click();
    return true;
  })()
`);

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1500, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/ambient/' });
await sleep(3500);

console.log('1) 页面挂载:', await ev(`document.querySelector('h1')?.textContent`));

for (const [label, key] of [['① 待机 · 黄历', 'almanac'], ['② 今日 · 能量', 'today'], ['③ 未来 7 天', 'week'], ['④ 语音', 'voice']]) {
  await clickText(label);
  await sleep(700);
  console.log(`\n--- ${key} ---`);

  // 矩形
  await clickText('矩形 480×480');
  await sleep(700);
  console.log('  矩形模式 字数标签:', await ev(`
    (() => { const s=[...document.querySelectorAll('span')].find(x=>/字 \\/ 上限/.test(x.textContent)); return s?s.textContent.trim():'未找到'; })()
  `));

  // 圆形
  await clickText('圆形（直径 480）');
  await sleep(1000);
  console.log('  圆形模式 字数标签:', await ev(`
    (() => { const s=[...document.querySelectorAll('span')].find(x=>/字 \\/ 上限/.test(x.textContent)); return s?s.textContent.trim():'未找到'; })()
  `));
  const report = await ev(`
    (() => {
      const h = [...document.querySelectorAll('h2')].find(x=>x.textContent.includes('被切掉的内容'));
      if (!h) return '未找到报告区';
      const sec = h.closest('section');
      const items = [...sec.querySelectorAll('li')].map(li=>li.textContent.trim());
      const clean = sec.textContent.includes('没有被切掉');
      return JSON.stringify({ 被切条数: items.length, 内容: items.slice(0,6), 无遮挡: clean });
    })()
  `);
  console.log('  遮挡检测:', report);
  await shot(`round-${key}`);

  // 圆形 + 安全区
  await clickText('圆形 + 安全区');
  await sleep(800);
  console.log('  安全区模式 有虚线安全区:', await ev(`
    [...document.querySelectorAll('div')].some(d => d.className && String(d.className).includes('border-dashed'))
  `));
}

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
ws.close();
chrome.kill();
process.exit(0);
