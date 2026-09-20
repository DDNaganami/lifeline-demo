/**
 * 验证「系统回应」：四档反馈各给不同的回应，且都带真实依据
 * 用法：BASE_URL=http://127.0.0.1:8082 node scripts/verify-response.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9711;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\resp-profile', 'about:blank',
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

let pass = 0;
let fail = 0;
/** .mjs 不能写类型标注 */
function check(name, ok, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });

// 准备：干净出生信息（时辰确定）
await send('Page.navigate', { url: BASE + '/' });
await sleep(2000);
await ev(`localStorage.clear(); localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'浙江杭州',birthTimeConfidence:'exact'}))`);

const FEEDBACKS = ['非常符合', '部分符合', '没有印象', '完全不符合'];
const seen = new Map();

for (const fb of FEEDBACKS) {
  // 每年一个不同的年份：同一年同一维度已经反馈过就不会再弹（这是刻意的设计，避免打扰）
  const year = 2018 + FEEDBACKS.indexOf(fb);
  const q = encodeURIComponent(`测试问题 ${year}`);
  await send('Page.navigate', { url: BASE + `/dashboard/?q=${q}&dim=career&year=${year}` });
  await sleep(5000);

  // 点反馈按钮
  const clicked = await ev(`
    (() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(fb)});
      if (!b) return false;
      b.click();
      return true;
    })()
  `);
  await sleep(2000);

  const resp = await ev(`
    (() => {
      const t = document.body.innerText;
      const i = t.indexOf('系统回应');
      if (i < 0) return '';
      // 取到「本年排盘依据」或下一个板块之前
      const seg = t.slice(i, i + 500);
      const end = seg.indexOf('本年排盘依据');
      return (end > 0 ? seg.slice(0, end + 120) : seg).replace(/\\s+/g, ' ').trim();
    })()
  `);

  console.log(`\n=== ${fb} ===`);
  console.log('  ' + (resp || '（未出现系统回应）').slice(0, 300));

  check(`「${fb}」出现系统回应`, resp.length > 0 && clicked);
  check(`「${fb}」带真实排盘依据`, resp.includes('本年排盘依据'), '');
  check(`「${fb}」提到档案成长`, resp.includes('已沉淀'), '');
  seen.set(fb, resp.slice(0, 60));

  await ev(`document.querySelector('aside button')?.click()`); // 收起
  await sleep(500);
}

console.log('\n=== 四档回应是否各不相同 ===');
const uniq = new Set([...seen.values()]);
check('四档给出四种不同回应', uniq.size === 4, `实际 ${uniq.size} 种`);

console.log('\n=== 只带 dim / year（不带问题）也应生效 ===');
await send('Page.navigate', { url: BASE + '/dashboard/?dim=wealth&year=2030' });
await sleep(5000);
const dimOnly = await ev(`document.querySelector('[role=tab][aria-selected=true]')?.textContent`);
const dimOnlyYear = await ev(`document.querySelectorAll('h3')[0]?.textContent`);
check('只带 dim 也能切维度（财富）', dimOnly === '财富', `实际：${dimOnly}`);
check('只带 year 也能定位年份（2030）', dimOnlyYear === '2030', `实际：${dimOnlyYear}`);
check('横幅显示「已按链接定位」', await ev(`document.body.innerText.includes('已按链接定位')`));

console.log('\n=== 时辰不确定时，「完全不符合」应建议去核对时辰 ===');
await ev(`localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示',gender:'男',birthDate:'1993-06-18',birthTime:'不确定',birthPlace:'浙江杭州',birthTimeConfidence:'unknown'}))`);
await send('Page.navigate', { url: BASE + '/dashboard/?year=2013&dim=career' });
await sleep(5000);
await ev(`
  (() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '完全不符合');
    if (b) b.click();
    return !!b;
  })()
`);
await sleep(2000);
const t2 = await ev(`document.body.innerText.includes('时辰决定命宫') || document.body.innerText.includes('核对出生时辰')`);
check('时辰不确定时，回应指向"核对时辰"', t2);

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
