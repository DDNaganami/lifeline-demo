/**
 * 验证导航：每个页面都有回主页的入口（曾经漏掉过）
 * 用法：BASE_URL=http://112.111.47.239:25572 node scripts/verify-nav.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9677;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\nav-profile', 'about:blank',
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

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

/** 每个页面应有：① 回首页的链接 ② 关键的去处 */
const PAGES = [
  { path: '/', name: '首页', need: ['/ambient/', '/changelog/'] },
  { path: '/dashboard/', name: '仪表盘', need: ['/', '/ambient/', '/changelog/'] },
  { path: '/ambient/', name: '设备模拟器', need: ['/', '/dashboard/', '/changelog/'] },
  { path: '/changelog/', name: '修改日志', need: ['/', '/dashboard/', '/ambient/'] },
];

// 仪表盘需要先有出生信息，否则会跳回首页
await send('Page.navigate', { url: BASE + '/' });
await sleep(2000);
await ev(`localStorage.setItem('lifeline.birth', JSON.stringify({name:'导航测试',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'浙江杭州',birthTimeConfidence:'exact'}))`);

let pass = 0;
let fail = 0;

for (const page of PAGES) {
  await send('Page.navigate', { url: BASE + page.path });
  await sleep(3000);

  const links = await ev(`
    (() => [...document.querySelectorAll('a')].map(a => a.getAttribute('href')))()
  `);
  const list = Array.isArray(links) ? links : [];
  const missing = page.need.filter((h) => !list.includes(h));

  // 仪表盘是客户端渲染，要等它挂载完
  const rendered = await ev(`document.body.innerText.length > 200`);

  const ok = missing.length === 0 && rendered;
  console.log(
    `  ${ok ? '✅' : '❌'} ${page.name.padEnd(6)} 链接 ${list.length} 个` +
      (missing.length ? `  缺少: ${missing.join(', ')}` : '') +
      (rendered ? '' : '  页面未渲染完成'),
  );
  if (ok) pass++;
  else fail++;
}

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
