/**
 * 验证「继续核对 → 写经历 → 人生档案」这条新链路
 * 用法：BASE_URL=http://127.0.0.1:3100 node scripts/verify-review-loop.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9466;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const OUT = '.shots';
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\loop-profile', 'about:blank',
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
const setInput = (sel, val) => ev(`
  (() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false;
    Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, ${JSON.stringify(val)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()
`);
const clickByText = (text, scope = 'document') => ev(`
  (() => {
    const root = ${scope === 'aside' ? "document.querySelector('aside')" : 'document'};
    if (!root) return false;
    const btn = [...root.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}));
    if (!btn) return false;
    btn.click();
    return true;
  })()
`);
const shot = async (name) => {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(`${OUT}\\${name}.png`, Buffer.from(res.result.data, 'base64'));
  console.log('已保存截图:', name);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false });

/* 准备数据：直接写入出生信息，避免走表单 */
await send('Page.navigate', { url: BASE + '/' });
await sleep(2000);
await ev(`localStorage.clear(); localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示用户',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'浙江杭州'}))`);
await send('Page.navigate', { url: BASE + '/dashboard' });
await sleep(4000);

console.log('1) 页面是否挂载:', await ev(`document.querySelector('h1')?.textContent`));

/* 继续核对 */
console.log('2) 是否有「继续核对」区块:', await ev(`
  [...document.querySelectorAll('h2')].some((h) => h.textContent.includes('继续核对'))
`));
console.log('3) 提示的待核对年份:', await ev(`
  (() => {
    const p = [...document.querySelectorAll('p')].find((p) => p.textContent.includes('下一个还没核对的是'));
    return p ? p.textContent.replace(/\\s+/g, ' ').trim() : '未找到';
  })()
`));
console.log('4) 进度文案:', await ev(`
  (() => {
    const s = [...document.querySelectorAll('span')].find((s) => s.textContent.includes('已核对'));
    return s ? s.textContent.trim() : '未找到';
  })()
`));
await shot('r1-continue');

/* 点「就核对 XXXX 年」→ 应跳到那一年 */
await clickByText('就核对');
await sleep(1500);
console.log('5) 跳转后的年度卡片:', await ev(`document.querySelectorAll('h3')[0]?.textContent`));
console.log('6) 当前维度:', await ev(`document.querySelector('[role=tab][aria-selected=true]')?.textContent`));

/* 给反馈 → 面板自动弹出 → 写经历 */
await clickByText('非常符合');
await sleep(1500);
console.log('7) 面板自动弹出:', await ev(`!!document.querySelector('aside')`));
console.log('8) 建议追问:', await ev(`
  (() => {
    const box = [...document.querySelectorAll('aside div')].find((d) => d.textContent.startsWith('这一年我核对') || d.textContent.startsWith('这一年我标注'));
    return box ? box.textContent.trim() : '未找到';
  })()
`));
await setInput('#year-note', '这一年第一次独立负责一个项目，虽然没涨薪，但被信任了');
await sleep(500);
await clickByText('存进我的核对档案', 'aside');
await sleep(1000);
console.log('9) 档案已写入:', await ev(`localStorage.getItem('lifeline.notes')`));
await clickByText('收起', 'aside');
await sleep(800);

/* 继续核对应指向下一个年份 */
console.log('10) 下一轮提示:', await ev(`
  (() => {
    const p = [...document.querySelectorAll('p')].find((p) => p.textContent.includes('下一个还没核对的是'));
    return p ? p.textContent.replace(/\\s+/g, ' ').trim() : '（已全部核对完）';
  })()
`));

/* 人生档案 */
console.log('11) 档案摘要:', await ev(`
  (() => {
    const h = [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('我的人生档案'));
    return h ? h.parentElement.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80) : '未找到';
  })()
`));
await clickByText('展开档案');
await sleep(800);
console.log('12) 档案条目数:', await ev(`
  document.querySelectorAll('ol li').length
`));
console.log('13) 档案内容:', await ev(`
  (() => {
    const li = [...document.querySelectorAll('ol li')].find((l) => l.textContent.includes('第一次独立负责'));
    return li ? li.textContent.replace(/\\s+/g, ' ').trim() : '未找到条目';
  })()
`));
console.log('14) 复制全文按钮存在:', await ev(`
  [...document.querySelectorAll('button')].some((b) => b.textContent.includes('复制全文'))
`));
await shot('r2-archive');

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');

ws.close();
chrome.kill();
process.exit(0);
