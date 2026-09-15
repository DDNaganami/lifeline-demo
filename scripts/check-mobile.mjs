/** 手机尺寸下的布局检查（临时脚本） */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9444;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\mobile-profile', 'about:blank',
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
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
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
const viewport = (width, height) =>
  send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
const shot = async (name) => {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(`.shots\\${name}.png`, Buffer.from(res.result.data, 'base64'));
  console.log('已保存:', name);
};

await send('Runtime.enable');
await send('Page.enable');

await viewport(390, 844);
await send('Page.navigate', { url: BASE + '/' });
await sleep(2500);
await shot('m1-home');

await ev(`localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示用户',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'浙江杭州'}))`);
await send('Page.navigate', { url: BASE + '/dashboard' });
await sleep(4000);
console.log('阶段标题:', await ev(`document.querySelector('h1')?.textContent`));
console.log('曲线是否可横向滚动:', await ev(`
  (() => {
    const box = document.querySelector('svg')?.parentElement;
    return box ? box.scrollWidth > box.clientWidth : '未找到';
  })()
`));
console.log('页面是否横向溢出:', await ev(`document.documentElement.scrollWidth > window.innerWidth`));
await shot('m2-dashboard');

// 四档反馈 → 面板自动弹出（手机尺寸）
await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '部分符合')?.click()`);
await sleep(1500);
console.log('面板是否弹出:', await ev(`!!document.querySelector('aside')`));
console.log('面板是否占满宽度:', await ev(`
  (() => {
    const a = document.querySelector('aside');
    return a ? Math.round(a.getBoundingClientRect().width) + '/' + window.innerWidth : '未找到';
  })()
`));
await shot('m3-panel');

ws.close();
chrome.kill();
process.exit(0);
