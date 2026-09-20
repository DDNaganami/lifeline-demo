/**
 * 验证深色主题：抓主要页面的截图 + 检查有没有"深色底上的浅色文字"这类问题
 * 用法：BASE_URL=http://127.0.0.1:8082 node scripts/verify-theme.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9688;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\theme-profile', 'about:blank',
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

/** 对比度检查：找出"浅底浅字 / 深底深字"这类读不清的元素 */
const CONTRAST_CHECK = `
  (() => {
    const lum = (c) => {
      const m = c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
      if (!m) return null;
      const a = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (a < 0.1) return null; // 全透明，跳过
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const bgOf = (el) => {
      let n = el;
      while (n) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
          const l = lum(bg);
          if (l !== null) return l;
        }
        n = n.parentElement;
      }
      return 0;
    };
    const bad = [];
    for (const el of document.querySelectorAll('p, span, h1, h2, h3, dd, dt, li, button, a')) {
      const text = (el.textContent || '').trim();
      if (!text || text.length > 60) continue;
      if (el.children.length > 0 && el.childNodes.length !== 1) continue;
      const cs = getComputedStyle(el);
      const fg = lum(cs.color);
      if (fg === null) continue;
      const bg = bgOf(el);
      // 亮度差太小 → 读不清（阈值按经验取 60）
      const diff = Math.abs(fg - bg);
      if (diff < 60) {
        bad.push({ text: text.slice(0, 24), fg: Math.round(fg), bg: Math.round(bg), diff: Math.round(diff) });
      }
    }
    return JSON.stringify(bad.slice(0, 10));
  })()
`;

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false });

// 准备出生信息
await send('Page.navigate', { url: BASE + '/' });
await sleep(2000);
await ev(`localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'浙江杭州',birthTimeConfidence:'exact'}))`);

const PAGES = [
  { path: '/', name: '01-home' },
  { path: '/dashboard/', name: '02-dashboard', wait: 6000 },
  { path: '/ambient/', name: '03-ambient', wait: 3500 },
  { path: '/changelog/', name: '04-changelog', wait: 3000 },
];

for (const p of PAGES) {
  await send('Page.navigate', { url: BASE + p.path });
  await sleep(p.wait ?? 3000);
  const bodyBg = await ev(`getComputedStyle(document.body).backgroundColor`);
  console.log(`\n=== ${p.name} ===`);
  console.log('  页面底色:', bodyBg);
  const bad = await ev(CONTRAST_CHECK);
  const list = JSON.parse(typeof bad === 'string' && bad.startsWith('[') ? bad : '[]');
  console.log(`  对比度不足的元素: ${list.length} 个`);
  for (const b of list.slice(0, 4)) {
    console.log(`    ⚠️「${b.text}」前景 ${b.fg} / 背景 ${b.bg}（差 ${b.diff}）`);
  }
  await shot(p.name);
}

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
ws.close();
chrome.kill();
process.exit(0);
