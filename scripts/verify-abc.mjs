/**
 * 验证三件事：事件由排盘生成（含口气切换）、填表阶段的真太阳时提醒
 * 用法：BASE_URL=http://127.0.0.1:8082 node scripts/verify-abc.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9644;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\abc-profile', 'about:blank',
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
const clickText = (t) => ev(`
  (() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(t)}); if (!b) return false; b.click(); return true; })()
`);

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2600, deviceScaleFactor: 1, mobile: false });

/* ---------- B：填表阶段的真太阳时提醒 ---------- */
console.log('=== B. 填表阶段就提醒时辰问题 ===');
await send('Page.navigate', { url: BASE + '/' });
await sleep(2500);
await setInput('#birthDate', '1993-06-18');
await setInput('#birthTime', '午时 11:00-13:00');
await setInput('#birthPlace', '乌鲁木齐');
await sleep(1200);
console.log('  填乌鲁木齐（跨时辰）:');
console.log('  ', await ev(`
    (() => {
      const t = document.body.innerText;
      const i = t.indexOf('真太阳时校正预览');
      return i < 0 ? '未出现预览' : t.slice(i, i + 220).replace(/\\s+/g,' ');
    })()
  `));

await setInput('#birthPlace', '杭州');
await sleep(1200);
console.log('\n  改成杭州（不跨时辰）:');
console.log('  ', await ev(`
    (() => {
      const t = document.body.innerText;
      const i = t.indexOf('真太阳时校正预览');
      return i < 0 ? '未出现预览' : t.slice(i, i + 200).replace(/\\s+/g,' ');
    })()
  `));

await setInput('#birthPlace', '某个不存在的地方');
await sleep(1200);
console.log('\n  填一个认不出的地名:');
console.log('  ', await ev(`
    (() => {
      const t = document.body.innerText;
      const i = t.indexOf('真太阳时校正预览');
      return i < 0 ? '未出现预览' : t.slice(i, i + 200).replace(/\\s+/g,' ');
    })()
  `));
await shot('abc-form-preview');

/* ---------- A：事件由排盘生成 + 口气切换 ---------- */
console.log('\n=== A. 事件由排盘生成、可切换口气 ===');
await ev(`localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'浙江杭州',birthTimeConfidence:'exact'}))`);
await send('Page.navigate', { url: BASE + '/dashboard/' });
await sleep(5500);

const readEvents = () => ev(`
  (() => {
    const ol = document.querySelector('section ol');
    if (!ol) return '未找到事件列表';
    return [...ol.querySelectorAll('li')].map(li => li.textContent.replace(/\\s+/g,' ').trim()).join(' ｜ ');
  })()
`);

console.log('  温和提醒:', (await readEvents()).slice(0, 200));
await clickText('直接事件');
await sleep(1200);
console.log('  直接事件:', (await readEvents()).slice(0, 200));
await clickText('温和提醒');
await sleep(1000);
console.log('  切回温和，与之前一致:', (await readEvents()).slice(0, 80));

console.log('\n  切到「财富」维度看事件是否相关:');
await ev(`(() => { const t = [...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('财富')); if(t) t.click(); return !!t; })()`);
await sleep(1500);
console.log('  ', (await readEvents()).slice(0, 220));

await shot('abc-dashboard');
console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
ws.close();
chrome.kill();
process.exit(0);
