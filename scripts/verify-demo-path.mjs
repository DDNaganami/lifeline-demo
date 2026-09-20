/**
 * 验证「演示脚本」里承诺的每一步都真的会发生
 * ---------------------------------------------------------------
 * 演示最怕的是"讲到这里本来应该出现 XX，但没有"。
 * 所以这份脚本先把演示路径从头走一遍，把每一步的**实际输出**打出来，
 * 确认与演示稿里写的一致之后，演示稿才算数。
 *
 * 用法：BASE_URL=http://112.111.47.239:25572 node scripts/verify-demo-path.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9777;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\demo-profile', 'about:blank',
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
const text = () => ev(`document.body.innerText.replace(/\\s+/g,' ')`);
const setVal = (sel, val) => ev(`
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

let pass = 0;
let fail = 0;
function check(name, ok, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  → ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 2000, deviceScaleFactor: 1, mobile: false });

/* ---------------- 第 1 步：首页 ---------------- */
console.log('\n【第 1 步】首页 —— 先问问题，不要生日');
await send('Page.navigate', { url: BASE + '/' });
await sleep(2500);
await ev(`localStorage.clear()`);
await send('Page.navigate', { url: BASE + '/' });
await sleep(2500);
const home = await text();
check('首屏是提问式', home.includes('今天，想问问什么？'));
const qCount = await ev(`[...document.querySelectorAll('a')].filter(a => a.getAttribute('href')?.startsWith('/birth/?')).length`);
check('有 6 个问题', qCount === 6, `${qCount} 个`);
check('没有要生日', !(await ev(`!!document.querySelector('#birthDate')`)));
await shot('demo-1-home');

/* ---------------- 第 2 步：点第一个问题 ---------------- */
console.log('\n【第 2 步】点「我今年的事业会不会有转机？」');
await ev(`
  (() => {
    const a = [...document.querySelectorAll('a')].find(x => x.textContent.includes('我今年的事业会不会有转机'));
    a.click(); return true;
  })()
`);
await sleep(2500);
const birth = await text();
check('问题被钉在出生信息页顶部', birth.includes('你想问的是') && birth.includes('我今年的事业会不会有转机'));
check('标题是「关于你。」', birth.includes('关于你。'));

/* ---------------- 第 3 步：填出生信息（看真太阳时预览） ---------------- */
console.log('\n【第 3 步】填写示例出生信息（杭州）');
await setVal('#birthDate', '1993-06-18');
await setVal('#birthTime', '午时 11:00-13:00');
await setVal('#birthPlace', '杭州');
await sleep(1200);
const pv = await ev(`
  (() => { const t = document.body.innerText; const i = t.indexOf('真太阳时校正预览'); return i < 0 ? '无' : t.slice(i, i + 90).replace(/\\s+/g,' '); })()
`);
console.log('  ' + pv);
check('杭州：真太阳时预览正常、不跨时辰', pv.includes('杭州') === false && pv.includes('12:00') && pv.includes('午时'));
await shot('demo-3-birth');

/* ---------------- 第 4 步：提交 → 落在问题上 ---------------- */
console.log('\n【第 4 步】提交 → 仪表盘直接落在「事业 · 2026」');
await ev(`document.querySelector('button[type=submit]').click()`);
await sleep(7000);
const dash = await text();
check('显示「你问的是」横幅', dash.includes('你问的是'));
check('定位到事业维度', dash.includes('已定位到') && dash.includes('事业'));
const banner = await ev(`
  (() => { const t = document.body.innerText; const i = t.indexOf('你问的是'); return i < 0 ? '' : t.slice(i, i + 110).replace(/\\s+/g,' '); })()
`);
console.log('  横幅内容: ' + banner);

/* ---------------- 第 5 步：展开主判断依据 ---------------- */
console.log('\n【第 5 步】展开「这句话是怎么来的？」');
const jBefore = await ev(`
  (() => { const t = document.body.innerText; const i = t.indexOf('主判断'); return i < 0 ? '' : t.slice(i, i + 60).replace(/\\s+/g,' '); })()
`);
check('主判断标注「由排盘生成」', jBefore.includes('由排盘生成'));
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
    return d ? d.textContent.replace(/\\s+/g,' ').trim() : '';
  })()
`);
console.log('  依据: ' + basis.slice(0, 150));
check('依据里含具体宫位与四化', /宫/.test(basis) && /(化忌|化禄|化权|化科|引动)/.test(basis));
await shot('demo-5-judgment');

/* ---------------- 第 6 步：换成西宁（最抓人的一步） ---------------- */
console.log('\n【第 6 步】把出生地换成「西宁」——同样的钟表时间，命盘完全不同');
// 用 URL 参数直接换成西宁，比走表单快，演示时也可以用「重新填写」
await ev(`localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'西宁',birthTimeConfidence:'exact'}))`);
await send('Page.navigate', { url: BASE + '/dashboard/?dim=career&year=2026' });
await sleep(7000);
const xining = await text();
const xiningSolar = await ev(`
  (() => { const t = document.body.innerText; const i = t.indexOf('真太阳时校正'); return i < 0 ? '' : t.slice(i, i + 130).replace(/\\s+/g,' '); })()
`);
console.log('  ' + xiningSolar);
check('西宁显示校正到巳时', xiningSolar.includes('巳时') || xiningSolar.includes('10:46'));
check('出现「跨了时辰边界」警告', xining.includes('跨') && xining.includes('命宫'));
check('显示修正量约 -74 分', /-7[0-9]/.test(xiningSolar));

const palaceXining = await ev(`
  (() => {
    const t = document.body.innerText;
    const i = t.indexOf('命宫');
    return i < 0 ? '' : t.slice(i, i + 40).replace(/\\s+/g,' ');
  })()
`);
console.log('  本命盘命宫: ' + palaceXining);
await shot('demo-6-xining');

/* ---------------- 第 7 步：切回杭州对比 ---------------- */
console.log('\n【第 7 步】切回杭州 —— 对比命宫不同');
await ev(`localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'杭州',birthTimeConfidence:'exact'}))`);
await send('Page.navigate', { url: BASE + '/dashboard/?dim=career&year=2026' });
await sleep(7000);
const palaceHZ = await ev(`
  (() => {
    const t = document.body.innerText;
    const i = t.indexOf('命宫');
    return i < 0 ? '' : t.slice(i, i + 40).replace(/\\s+/g,' ');
  })()
`);
console.log('  本命盘命宫: ' + palaceHZ);
check('杭州与西宁的命宫不同（真太阳时的效果）', palaceHZ !== palaceXining, `杭州「${palaceHZ.slice(0, 20)}」vs 西宁「${palaceXining.slice(0, 20)}」`);
await shot('demo-7-hangzhou');

/* ---------------- 第 8 步：今日页 ---------------- */
console.log('\n【第 8 步】今日页 —— 今天的能量也是算出来的');
await send('Page.navigate', { url: BASE + '/today/' });
await sleep(6000);
const today = await text();
check('有今日能量', today.includes('今日能量'));
check('有未来 7 天', today.includes('未来 7 天'));
const weekVals = await ev(`
  (() => {
    const section = [...document.querySelectorAll('section')].find(s => s.textContent.includes('未来 7 天'));
    if (!section) return [];
    return [...section.querySelectorAll('div.flex.items-center')].map(r => r.lastElementChild?.textContent?.trim()).filter(Boolean);
  })()
`);
console.log('  7 天能量: ' + JSON.stringify(weekVals));
check('7 天数值各不相同（说明不是同一个数）', new Set(weekVals).size >= 3, `${new Set(weekVals).size} 种`);
const todayDetail = await ev(`
  (() => { const t = document.body.innerText; const i = t.indexOf('今日流日命宫'); return i < 0 ? '' : t.slice(i, i + 130).replace(/\\s+/g,' '); })()
`);
console.log('  ' + todayDetail);
check('说明了今日命宫落在哪一宫', todayDetail.includes('流日命宫'));
await shot('demo-8-today');

/* ---------------- 第 9 步：反馈闭环 ---------------- */
console.log('\n【第 9 步】打一条反馈，看系统回应（闭环）');
await send('Page.navigate', { url: BASE + '/dashboard/?dim=career&year=2026' });
await sleep(7000);
await ev(`
  (() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '部分符合'); if (b) b.click(); return !!b; })()
`);
await sleep(2500);
const resp = await ev(`
  (() => { const t = document.body.innerText; const i = t.indexOf('系统回应'); return i < 0 ? '' : t.slice(i, i + 300).replace(/\\s+/g,' '); })()
`);
console.log('  ' + resp.slice(0, 220));
check('出现「系统回应」', resp.length > 0);
check('回应里带了本年排盘依据', resp.includes('本年排盘依据'));
check('回应里提到档案成长', resp.includes('已沉淀'));
await shot('demo-9-feedback');

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
console.log(`\n=== 演示路径验证：通过 ${pass} 项，失败 ${fail} 项 ===`);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
