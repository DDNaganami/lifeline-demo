/**
 * 验证界面上「主判断」确实由排盘生成（含依据可展开）
 * 用法：BASE_URL=http://112.111.47.239:25572 node scripts/verify-judgment-ui.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9733;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\jui-profile', 'about:blank',
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2600, deviceScaleFactor: 1, mobile: false });

await send('Page.navigate', { url: BASE + '/' });
await sleep(2000);
await ev(`localStorage.clear(); localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'浙江杭州',birthTimeConfidence:'exact'}))`);

/* ---------- 成年：2026 财富 ---------- */
console.log('=== 1. 2026 年 · 财富维度 ===');
await send('Page.navigate', { url: BASE + '/dashboard/?dim=wealth&year=2026' });
await sleep(6000);

const judgment = await ev(`
  (() => {
    const t = document.body.innerText;
    const i = t.indexOf('主判断');
    return i < 0 ? '' : t.slice(i, i + 160).replace(/\\s+/g, ' ').trim();
  })()
`);
console.log('  ' + judgment.slice(0, 180));

check('主判断标注了「由排盘生成」', judgment.includes('由排盘生成'));
check('出现了「这句话是怎么来的？」', judgment.includes('这句话是怎么来的'));

// 展开依据
await ev(`
  (() => {
    const d = [...document.querySelectorAll('details')].find(x => x.textContent.includes('这句话是怎么来的'));
    if (d) d.open = true;
    return !!d;
  })()
`);
await sleep(700);
const basis = await ev(`
  (() => {
    const d = [...document.querySelectorAll('details')].find(x => x.textContent.includes('这句话是怎么来的'));
    return d ? d.textContent.replace(/\\s+/g, ' ').trim() : '';
  })()
`);
console.log('  依据: ' + basis.slice(0, 220));
check('依据里含宫位与四化', /宫.*(引动|四化)/.test(basis) || basis.includes('宫'));
check('依据里含大限区间', /\d+-\d+ 岁/.test(basis));

/* ---------- 童年：1996 ---------- */
console.log('\n=== 2. 1996 年（3 岁）· 事业维度（应为童年措辞）===');
await send('Page.navigate', { url: BASE + '/dashboard/?dim=career&year=1996' });
await sleep(5500);
const early = await ev(`
  (() => {
    const t = document.body.innerText;
    const i = t.indexOf('主判断');
    return i < 0 ? '' : t.slice(i, i + 140).replace(/\\s+/g, ' ').trim();
  })()
`);
console.log('  ' + early.slice(0, 160));
const ADULT = ['职业决定', '升职', '跳槽', '创业', '伴侣'];
const hits = ADULT.filter((w) => early.includes(w));
check('3 岁的事业判断不含成人用词', hits.length === 0, hits.length ? `含 ${hits.join('/')}` : '');

/* ---------- 不同维度判断应不同 ---------- */
console.log('\n=== 3. 同一年不同维度的判断应不同 ===');
const texts = new Set();
for (const dim of ['overall', 'career', 'wealth', 'marriage', 'parents', 'health']) {
  await send('Page.navigate', { url: BASE + `/dashboard/?dim=${dim}&year=2026` });
  await sleep(4200);
  const t = await ev(`
    (() => {
      const el = [...document.querySelectorAll('p')].find(p => p.className.includes('text-lg') && p.className.includes('text-ink'));
      return el ? el.textContent.trim() : '';
    })()
  `);
  if (t) texts.add(t);
  console.log(`  ${dim.padEnd(9)} ${t.slice(0, 70)}`);
}
check('六个维度的主判断各不相同', texts.size === 6, `实际 ${texts.size} 种`);

await shot('judgment-ui');

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
