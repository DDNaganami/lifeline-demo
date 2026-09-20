/**
 * 验证出生地选择器的最终形态（390 个城市、分组、精确/估算区分）
 * 用法：BASE_URL=http://112.111.47.239:25572 node scripts/verify-place-final.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9766;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\pf-profile', 'about:blank',
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
const setSearch = (kw) => ev(`
  (() => {
    const inp = document.querySelector('input[placeholder*="搜城市名"]');
    if (!inp) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, ${JSON.stringify(kw)});
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()
`);
const pickFromSearch = (city) => ev(`
  (() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(city)});
    if (!b) return false;
    b.click();
    return true;
  })()
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
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1800, deviceScaleFactor: 1, mobile: false });

await send('Page.navigate', { url: BASE + '/birth/' });
await sleep(3000);
await clickText('选城市');
await sleep(900);

console.log('=== 1. 覆盖量与分组 ===');
const cityCount = await ev(`
  (() => {
    const box = [...document.querySelectorAll('div')].find(d => d.className.includes('max-h-72'));
    return box ? box.querySelectorAll('button').length : 0;
  })()
`);
console.log('  可选城市:', cityCount);
check('城市总数 >= 380', cityCount >= 380, `实际 ${cityCount}`);

const groups = await ev(`
  (() => {
    const box = [...document.querySelectorAll('div')].find(d => d.className.includes('max-h-72'));
    return box ? [...box.querySelectorAll('p')].map(p => p.textContent.trim().slice(0, 20)) : [];
  })()
`);
check('按省份分组（>= 50 组）', groups.length >= 50, `实际 ${groups.length} 组`);

console.log('\n=== 2. 精确/估算要能区分（视觉上）===');
const dashed = await ev(`
  (() => {
    const box = [...document.querySelectorAll('div')].find(d => d.className.includes('max-h-72'));
    if (!box) return { solid: 0, dashed: 0 };
    const btns = [...box.querySelectorAll('button')];
    return {
      solid: btns.filter(b => !b.className.includes('border-dashed')).length,
      dashed: btns.filter(b => b.className.includes('border-dashed')).length,
    };
  })()
`);
console.log('  实线（精确）:', dashed.solid, ' 虚线（省中心估算）:', dashed.dashed);
check('有实线城市（精确经度）', dashed.solid >= 80, `实际 ${dashed.solid}`);
check('有虚线城市（省中心估算）', dashed.dashed >= 200, `实际 ${dashed.dashed}`);

console.log('\n=== 3. 选地级市（赣州）→ 必须说明按江西估算，不能暗示精确 ===');
await setSearch('赣州');
await sleep(900);
const ganzhouFound = await pickFromSearch('赣州');
console.log('  搜索能找到地级市「赣州」:', ganzhouFound);
check('搜索能找到地级市「赣州」', ganzhouFound === true);
await sleep(1000);
const feedback = await ev(`
  (() => {
    const t = document.body.innerText;
    const i = t.indexOf('赣州');
    return i < 0 ? '无反馈' : t.slice(Math.max(0, i - 22), i + 95).replace(/\\s+/g,' ');
  })()
`);
console.log('  ' + feedback);
check('说明了按江西估算', feedback.includes('江西'), feedback);
check('说明了能补掉约 99% 的修正量', feedback.includes('99%'));
// 最关键：不能出现「已按 赣州 的经度计算」这种暗示精确的说法
check(
  '没有暗示"赣州的经度是精确的"',
  !/已按\s*赣州\s*的经度计算/.test(feedback),
  feedback,
);

console.log('\n=== 4. 选一个精确城市（西宁）→ 应显示精确经度 ===');
await clickText('选城市');
await sleep(600);
await setSearch('西宁');
await sleep(800);
await pickFromSearch('西宁');
await sleep(1000);
const precise = await ev(`
  (() => {
    const t = document.body.innerText;
    const i = t.indexOf('已按');
    return i < 0 ? '无反馈' : t.slice(i, i + 50).replace(/\\s+/g,' ');
  })()
`);
console.log('  ' + precise);
check('西宁显示为精确经度 101.78', precise.includes('101.78'), precise);

console.log('\n=== 5. 搜「江苏」应列出江苏的城市（含地级市）===');
await clickText('选城市');
await sleep(600);
await setSearch('江苏');
await sleep(800);
const jsCities = await ev(`
  (() => {
    const inp = document.querySelector('input[placeholder*="搜城市名"]');
    const panel = inp.closest('div').parentElement;
    return [...panel.querySelectorAll('button')].map(b => b.textContent.trim());
  })()
`);
console.log('  江苏的城市:', jsCities.join('、'));
check('包含南京', jsCities.includes('南京'));
check('包含地级市（扬州/盐城/连云港）', jsCities.includes('扬州') && jsCities.includes('盐城') && jsCities.includes('连云港'));

await shot('place-final');
console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
