/**
 * 验证追问界面：每日 3 次配额、回答读盘、上限文案
 * 用法：BASE_URL=http://112.111.47.239:25572 node scripts/verify-ask.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9799;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\ask-profile', 'about:blank',
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
  console.log('  📷', name);
};
/** 在追问面板的输入框里打字并发送 */
const ask = (text) => ev(`
  (() => {
    const ta = document.querySelector('aside textarea:not(#year-note)');
    if (!ta) return 'no-textarea';
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    // 触发 React 的 onChange 后再点发送
    const btn = [...document.querySelectorAll('aside button')].find(b => b.textContent.trim() === '发送');
    if (!btn) return 'no-button';
    setTimeout(() => btn.click(), 50);
    return 'ok';
  })()
`);
const panelText = () => ev(`
  (() => { const a = document.querySelector('aside'); return a ? a.innerText.replace(/\\s+/g,' ') : '未找到面板'; })()
`);
const quotaDots = () => ev(`
  (() => {
    const span = document.querySelector('aside span[aria-label*="每日"]');
    if (!span) return { label: '', filled: 0, total: 0 };
    const bars = [...span.querySelectorAll('span')];
    return {
      label: span.getAttribute('aria-label'),
      filled: bars.filter(b => b.className.includes('bg-accent')).length,
      total: bars.length,
    };
  })()
`);

let pass = 0;
let fail = 0;
function check(name, ok, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  → ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1400, deviceScaleFactor: 1, mobile: false });

// 准备：干净出生信息 + 清空配额
await send('Page.navigate', { url: BASE + '/' });
await sleep(2000);
await ev(`
  localStorage.clear();
  localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'杭州',birthTimeConfidence:'exact'}));
`);

await send('Page.navigate', { url: BASE + '/dashboard/?dim=career&year=2026' });
await sleep(7000);

console.log('=== 1. 打开追问面板：应显示配额 ===');
await ev(`
  (() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('问陈老师'));
    if (b) b.click();
    return !!b;
  })()
`);
await sleep(1500);
const q0 = await quotaDots();
console.log('  配额条:', JSON.stringify(q0));
check('显示 3 格配额', q0.total === 3, `${q0.total} 格`);
check('初始已用 0 格', q0.filled === 0, `${q0.filled} 格已用`);
const p0 = await panelText();
check('提示每日三问为限', p0.includes('每日三问为限') || p0.includes('今日还可问 3 次'));
await shot('ask-1-open');

console.log('\n=== 2. 第一次提问：应给出读盘的回答 ===');
await ask('我今年该不该换工作');
await sleep(3000);
const p1 = await panelText();
console.log('  ' + p1.slice(p1.indexOf('我今年该不该换工作'), p1.indexOf('我今年该不该换工作') + 300));
check('显示了用户的问题', p1.includes('我今年该不该换工作'));
check('回答了（不是占位内容）', !p1.includes('示例回答') && !p1.includes('占位回答'));
check('回答引用了宫位', /宫/.test(p1.slice(p1.indexOf('我今年该不该换工作'))));
check('标注了「读你的盘回答」', p1.includes('读你的盘回答'));
check('有可展开的依据', p1.includes('这段回答的依据'));
const q1 = await quotaDots();
console.log('  配额条:', JSON.stringify(q1));
check('用掉 1 次（显示 2 格）', q1.filled === 1, `${q1.filled} 格已用`);
await shot('ask-2-first');

console.log('\n=== 3. 第二、三次提问 ===');
await ask('我什么时候能升职');
await sleep(3000);
const q2 = await quotaDots();
check('用掉 2 次', q2.filled === 2, `${q2.filled} 格已用`);
const p2 = await panelText();
check('第二次回答与第一次不同', p2.includes('什么时候') && p2.includes('我不给你一个月份'));

await ask('我最近总是睡不好');
await sleep(3000);
// 用满 3 次后配额条会被上限文案取代，所以这里检查存储而不是圆点
const storedAfter3 = await ev(`localStorage.getItem('lifeline.ask')`);
console.log('  存储:', storedAfter3);
check('用满 3 次（存储记录 used=3）', typeof storedAfter3 === 'string' && storedAfter3.includes('"used":3'), storedAfter3);
const p3 = await panelText();
check('第三次回答了身体相关', p3.includes('疾厄') || p3.includes('身体'));
await shot('ask-3-three-used');

console.log('\n=== 4. 达到上限：应显示文案，不能再问 ===');
const p4 = await panelText();
console.log('  上限文案: ' + p4.slice(p4.indexOf('今日三问已尽'), p4.indexOf('今日三问已尽') + 120));
check('显示「今日三问已尽」', p4.includes('今日三问已尽'));
check('给出"少则重"的理由', p4.includes('天机不在多') || p4.includes('问得越少'));
check('不说"次数用完了"', !p4.includes('次数用完'));
check('输入框已消失（不能继续问）', (await ev(`!!document.querySelector('aside textarea:not(#year-note)')`)) === false);
await shot('ask-4-cap');

console.log('\n=== 5. 配额持久化：刷新后仍是 3 次已用 ===');
await send('Page.navigate', { url: BASE + '/dashboard/?dim=career&year=2026' });
await sleep(7000);
await ev(`
  (() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('问陈老师')); if (b) b.click(); return !!b; })()
`);
await sleep(1500);
const p5 = await panelText();
check('刷新后仍显示上限文案', p5.includes('今日三问已尽'));
const stored = await ev(`localStorage.getItem('lifeline.ask')`);
console.log('  存储:', stored);
check('配额存到了本地', typeof stored === 'string' && stored.includes('used'));

console.log('\n=== 6. 跨天应重置 ===');
await ev(`
  (() => {
    // 把日期改成昨天，模拟跨天
    const raw = JSON.parse(localStorage.getItem('lifeline.ask'));
    raw.date = '2020-01-01';
    localStorage.setItem('lifeline.ask', JSON.stringify(raw));
    return true;
  })()
`);
await send('Page.navigate', { url: BASE + '/dashboard/?dim=career&year=2026' });
await sleep(7000);
await ev(`
  (() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('问陈老师')); if (b) b.click(); return !!b; })()
`);
await sleep(1500);
const q6 = await quotaDots();
console.log('  配额条:', JSON.stringify(q6));
check('跨天后重置为 3 格可用', q6.filled === 0, `${q6.filled} 格已用`);
check('输入框恢复', (await ev(`!!document.querySelector('aside textarea:not(#year-note)')`)) === true);

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
