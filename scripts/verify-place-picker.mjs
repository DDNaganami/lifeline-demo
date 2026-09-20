/**
 * 验证新的出生地选择器
 * 用法：BASE_URL=http://127.0.0.1:8082 node scripts/verify-place-picker.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9755;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\place-profile', 'about:blank',
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
const clickText = (t) => ev(`
  (() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(t)}); if (!b) return false; b.click(); return true; })()
`);

let pass = 0;
let fail = 0;
function check(name, ok, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1700, deviceScaleFactor: 1, mobile: false });

await send('Page.navigate', { url: BASE + '/birth/' });
await sleep(3000);

console.log('=== 1. 出生地不再是 datalist + 自由文本 ===');
check('页面没有 datalist 了', !(await ev(`!!document.querySelector('datalist')`)));
check('有「选城市」按钮', await ev(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === '选城市')`));

console.log('\n=== 2. 点开选择器：应按省份分组 ===');
await clickText('选城市');
await sleep(800);
const groups = await ev(`
  (() => {
    const box = [...document.querySelectorAll('div')].find(d => d.className.includes('max-h-64'));
    if (!box) return [];
    return [...box.querySelectorAll('p')].map(p => p.textContent.trim());
  })()
`);
console.log('  分组:', JSON.stringify(groups));
check('有多个省份分组', Array.isArray(groups) && groups.length >= 15, `实际 ${groups.length} 组`);
check('包含常见省份（浙江/广东/四川）', groups.includes('浙江') && groups.includes('广东') && groups.includes('四川'));

const cityCount = await ev(`
  (() => {
    const box = [...document.querySelectorAll('div')].find(d => d.className.includes('max-h-64'));
    return box ? box.querySelectorAll('button').length : 0;
  })()
`);
console.log('  可选城市数:', cityCount);
check('可选城市 >= 80 个', cityCount >= 80, `实际 ${cityCount}`);
await shot('place-picker-open');

console.log('\n=== 3. 搜索：中文 / 省份 / 拼音 ===');
/** 读搜索区里的候选按钮（关键字有值时显示的是结果，没有时显示分组） */
const resultButtons = () => ev(`
  (() => {
    const inp = document.querySelector('input[placeholder*="搜城市名"]');
    if (!inp) return { found: false, cities: [], notFound: false };
    // 搜索输入框所在的那个面板
    const panel = inp.closest('div').parentElement;
    const notFound = panel.textContent.includes('列表里没有');
    const cities = notFound ? [] : [...panel.querySelectorAll('button')].map(b => b.textContent.trim());
    return { found: true, cities, notFound };
  })()
`);

const setSearch = (kw) => ev(`
  (() => {
    const inp = document.querySelector('input[placeholder*="搜城市名"]');
    if (!inp) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, ${JSON.stringify(kw)});
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()
`);

for (const [kw, expect] of [['浙江', '杭州'], ['hangzhou', '杭州'], ['乌鲁木齐', '乌鲁木齐'], ['昆山', null]]) {
  await setSearch(kw);
  await sleep(800);
  const r = await resultButtons();
  const ok = expect === null ? r.notFound : r.cities.includes(expect);
  check(
    `搜「${kw}」→ ${expect ?? '明确提示找不到'}`,
    ok,
    ok ? '' : `实际候选: ${r.cities.slice(0, 8).join('、')}${r.notFound ? '（提示找不到）' : ''}`,
  );
}

console.log('\n=== 4. 用真实点击选中「西宁」 ===');
await setSearch('西宁');
await sleep(800);
const clicked = await ev(`
  (() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '西宁');
    if (!b) return false;
    b.click();
    return true;
  })()
`);
await sleep(1000);
check('点到了「西宁」按钮', clicked);

const inputVal = await ev(`document.querySelector('#birthPlace')?.value`);
console.log('  输入框现在的值:', inputVal);
check('输入框被填成「西宁」', inputVal === '西宁', `实际 ${inputVal}`);

const feedback = await ev(`
  (() => {
    const t = document.body.innerText;
    const i = t.indexOf('已按');
    return i < 0 ? '无反馈' : t.slice(i, i + 60).replace(/\\s+/g,' ');
  })()
`);
console.log('  反馈:', feedback);
check('显示了「已按 西宁 的经度计算」', feedback.includes('西宁'), feedback);

console.log('\n=== 5. 关键回归：西宁必须是 101.78°，修正约 -74 分（不是宁波的 +5 分）===');
// 补上日期与时辰，预览才会出现
await ev(`
  (() => {
    const set = (sel, val) => {
      const el = document.querySelector(sel);
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('#birthDate', '1993-06-18');
    set('#birthTime', '午时 11:00-13:00');
    return true;
  })()
`);
await sleep(1200);
const preview = await ev(`
  (() => {
    const t = document.body.innerText;
    const i = t.indexOf('真太阳时校正预览');
    return i < 0 ? '无预览' : t.slice(i, i + 150).replace(/\\s+/g,' ');
  })()
`);
console.log('  ' + preview);
// 城市名显示在输入框下方那行（"已按 西宁 的经度计算"），预览行只有修正量
const cityLine = await ev(`
  (() => {
    const t = document.body.innerText;
    const i = t.indexOf('已按');
    return i < 0 ? '' : t.slice(i, i + 40);
  })()
`);
check('说明了用的是西宁的经度', cityLine.includes('西宁'), cityLine);
check('修正量约 -74 分（西宁的真实值）', /修正 -7[0-9]/.test(preview), preview);
check('没有把西宁算成 +5 分（宁波的修正量）', !/修正 \+5/.test(preview));

console.log('\n=== 6. 认不出的城市要给明确出路，而不是静默降级 ===');
// 选中城市后选择器会自动收起，所以要重新打开
await clickText('选城市');
await sleep(600);
await setSearch('昆山');
await sleep(800);
const fallback = await ev(`
  (() => {
    const t = document.body.innerText;
    const i = t.indexOf('列表里没有');
    return i < 0 ? '无提示' : t.slice(i, i + 130).replace(/\\s+/g,' ');
  })()
`);
console.log('  ' + fallback);
check('告诉用户"这不是你的问题"并给出出路', fallback.includes('不是你的问题') && fallback.includes('地级市'));

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
