/**
 * 验证「按年份归并」与「点维度跳回」：用预设数据直接渲染
 * 用法：BASE_URL=http://127.0.0.1:3100 node scripts/verify-grouping.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9477;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\group-profile', 'about:blank',
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
  console.log('已保存截图:', name);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2884, deviceScaleFactor: 1, mobile: false });

/* 预设数据：2025 年核对 3 个维度（2 条写了经历），2024 年核对 2 个维度，2021 年 1 个维度 */
await send('Page.navigate', { url: BASE + '/' });
await sleep(2000);
await ev(`
  (() => {
    const now = Date.now();
    localStorage.setItem('lifeline.birth', JSON.stringify({
      name: '演示用户', gender: '男', birthDate: '1993-06-18',
      birthTime: '午时 11:00-13:00', birthPlace: '浙江杭州',
    }));
    localStorage.setItem('lifeline.feedback', JSON.stringify({
      '2025:overall':  { year: 2025, dimension: 'overall',  feedback: '非常符合', updatedAt: now - 5000 },
      '2025:career':   { year: 2025, dimension: 'career',   feedback: '部分符合', updatedAt: now - 4000 },
      '2025:health':   { year: 2025, dimension: 'health',   feedback: '没有印象', updatedAt: now - 3000 },
      '2024:wealth':   { year: 2024, dimension: 'wealth',   feedback: '完全不符合', updatedAt: now - 2000 },
      '2024:marriage': { year: 2024, dimension: 'marriage', feedback: '部分符合', updatedAt: now - 1500 },
      '2021:career':   { year: 2021, dimension: 'career',   feedback: '非常符合', updatedAt: now - 1000 },
    }));
    localStorage.setItem('lifeline.notes', JSON.stringify({
      '2025:overall': { year: 2025, dimension: 'overall', text: '第一次独立负责一个项目，没涨薪但被信任', skipped: false, updatedAt: now },
      '2025:career':  { year: 2025, dimension: 'career',  text: '换了方向，收入平着走', skipped: false, updatedAt: now },
      '2021:career':  { year: 2021, dimension: 'career',  text: '转岗到一个全新的领域，从零开始', skipped: false, updatedAt: now },
    }));
    localStorage.removeItem('lifeline.draft');
    return true;
  })()
`);
await send('Page.navigate', { url: BASE + '/dashboard' });
await sleep(4000);

console.log('1) 页面挂载:', await ev(`document.querySelector('h1')?.textContent`));
console.log('2) 进度:', await ev(`
  (() => {
    const s = [...document.querySelectorAll('span')].find((s) => s.textContent.includes('已核对'));
    return s ? s.textContent.trim() : '未找到';
  })()
`));
console.log('3) 继续核对指向:', await ev(`
  (() => {
    const p = [...document.querySelectorAll('p')].find((p) => p.textContent.includes('下一个还没核对的是'));
    return p ? p.textContent.replace(/\\s+/g, ' ').trim() : '（已核对完）';
  })()
`));

/* 核对清单的年份分组 */
console.log('4) 核对清单里的年份块:', await ev(`
  (() => {
    const h = [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('我核对过的年份'));
    const sec = h.closest('section');
    return [...sec.querySelectorAll('li')].map((li) => {
      const year = li.querySelector('span')?.textContent;
      const chips = [...li.querySelectorAll('button, span')]
        .map((el) => el.textContent.trim())
        .filter((t) => /^(总览|事业|财富|婚姻家庭|父母支持|健康风险) · /.test(t));
      return year + ' → ' + chips.length + ' 个维度项';
    }).join(' | ');
  })()
`));
console.log('5) 是否出现重复的年份块（应各一次）:', await ev(`
  (() => {
    const h = [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('我核对过的年份'));
    const sec = h.closest('section');
    const years = [...sec.querySelectorAll('li')].map((li) => li.querySelector('span')?.textContent);
    return years.join(',') + ' → 唯一=' + (new Set(years).size === years.length);
  })()
`));

/* 点某一年的某个维度，应回到那一年 + 那个维度 */
await ev(`
  (() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('财富 · 完全不符合'));
    btn.click();
    return true;
  })()
`);
await sleep(1800);
console.log('6) 点击后年度卡片:', await ev(`document.querySelectorAll('h3')[0]?.textContent`));
console.log('7) 点击后维度:', await ev(`document.querySelector('[role=tab][aria-selected=true]')?.textContent`));

/* 档案区 */
await ev(`
  (() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('展开档案'));
    if (btn) btn.click();
    return true;
  })()
`);
await sleep(900);
console.log('8) 档案条数:', await ev(`
  (() => {
    const h = [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('我的人生档案'));
    return h ? h.closest('section').querySelectorAll('ol li').length : '未找到';
  })()
`));
console.log('9) 档案是否按年份从早到晚:', await ev(`
  (() => {
    const h = [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('我的人生档案'));
    const items = [...h.closest('section').querySelectorAll('ol li')].map((li) => li.textContent.match(/\\d{4}/)?.[0]);
    return items.join(' → ');
  })()
`));
console.log('10) 档案里是否有原文:', await ev(`
  (() => {
    const h = [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('我的人生档案'));
    const t = h.closest('section').textContent;
    return ['第一次独立负责', '换了方向', '转岗到'].map((k) => k + '=' + t.includes(k)).join(', ');
  })()
`));
await shot('g1-grouped');

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
ws.close();
chrome.kill();
process.exit(0);
