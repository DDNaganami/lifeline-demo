/**
 * 验证 480×480 屏幕模拟器：切换五个屏幕、截图、检查字数约束
 * 用法：node scripts/verify-ambient.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9600;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const OUT = '.shots';
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\ambient-profile', 'about:blank',
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
if (!wsUrl) { chrome.kill(); throw new Error('浏览器未就绪'); }

const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0;
const pending = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    errs.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  }
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

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1400, deviceScaleFactor: 2, mobile: false });

await send('Page.navigate', { url: BASE + '/ambient' });
await sleep(3500);

console.log('1) 页面是否挂载:', await ev(`document.querySelector('h1')?.textContent`));

// 屏幕本体尺寸必须是 480×480
console.log('2) 屏幕实际尺寸:', await ev(`
  (() => {
    const el = [...document.querySelectorAll('div')].find(d => d.style && d.style.width === '480px');
    if (!el) return '未找到屏幕容器';
    const r = el.getBoundingClientRect();
    return Math.round(r.width) + ' × ' + Math.round(r.height) + '（含缩放）';
  })()
`));

// 逐个屏幕切换 + 截图 + 字数
const screens = [
  ['① 待机 · 黄历', 'almanac'],
  ['② 今日 · 能量', 'today'],
  ['③ 未来 7 天', 'week'],
  ['④ 语音', 'voice'],
  ['⑤ 待机 · 极简', 'idle'],
];

for (const [label, key] of screens) {
  const clicked = await ev(`
    (() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(label)}));
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  await sleep(900);
  const info = await ev(`
    (() => {
      const el = [...document.querySelectorAll('div')].find(d => d.style && d.style.width === '480px');
      if (!el) return '未找到';
      const text = el.innerText.replace(/\\s+/g, ' ').trim();
      const count = text.replace(/[\\s·▮—]/g, '').length;
      return JSON.stringify({ 字数: count, 内容: text.slice(0, 100) });
    })()
  `);
  console.log(`  [${key}] 点击=${clicked} → ${info}`);
  await shot(`ambient-${key}`);

  // 回到列表页再切下一个（直接点按钮即可，无需回退）
}

console.log('\n3) 字数约束检查（每屏 ≤ 80 字）:');
console.log(await ev(`
  (() => {
    const out = [];
    for (const btn of document.querySelectorAll('button')) {
      if (!/^[①②③④⑤]/.test(btn.textContent)) continue;
      btn.click();
      out.push(btn.textContent.trim().slice(0, 8));
    }
    return '已遍历 ' + out.length + ' 屏';
  })()
`));
console.log(await ev(`
  (() => {
    const badges = [...document.querySelectorAll('span')].filter(s => /字 \\/ 上限 80/.test(s.textContent));
    return badges.map(b => b.textContent.trim()).join(' | ');
  })()
`));

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
ws.close();
chrome.kill();
process.exit(0);
