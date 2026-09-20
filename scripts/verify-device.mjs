/**
 * 验证设备模拟器显示的是真实数据
 * 用法：BASE_URL=http://112.111.47.239:25572 node scripts/verify-device.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9788;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8082';
mkdirSync('.shots', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '\\.shots\\dev-profile', 'about:blank',
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
/** 只取设备屏（480×480）里的文字 */
const screenText = () => ev(`
  (() => {
    const el = [...document.querySelectorAll('div')].find(d => d.style && d.style.width === '480px');
    return el ? el.innerText.replace(/\\s+/g,' ').trim() : '未找到屏幕';
  })()
`);
const clickScreen = (label) => ev(`
  (() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(label)}));
    if (!b) return false;
    b.click();
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
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1900, deviceScaleFactor: 1, mobile: false });

// 准备出生信息
await send('Page.navigate', { url: BASE + '/' });
await sleep(2000);
await ev(`localStorage.setItem('lifeline.birth', JSON.stringify({name:'演示',gender:'男',birthDate:'1993-06-18',birthTime:'午时 11:00-13:00',birthPlace:'杭州',birthTimeConfidence:'exact'}))`);

await send('Page.navigate', { url: BASE + '/ambient/' });
await sleep(3500);

console.log('=== 1. 黄历屏：真实黄历（与今日页同源）===');
const alm = await screenText();
console.log('  ' + alm.slice(0, 130));
check('显示宜', alm.includes('宜'));
check('显示忌', alm.includes('忌'));
check('显示干支（不重复）', !alm.includes('年年') && !alm.includes('日日') && /年/.test(alm) && /日/.test(alm));
// 冲煞：lunar-typescript 的 getDayChongDesc() 返回形如「(壬辰)龙」，本身不含「冲」字
check('显示冲煞（生肖 + 方位）', /煞[东南西北]/.test(alm) && /[鼠牛虎兔龙蛇马羊猴鸡狗猪]/.test(alm));
await shot('dev-1-almanac');

console.log('\n=== 2. 今日屏：真实排盘数据 ===');
await clickScreen('今日 · 能量');
await sleep(4000);
const today = await screenText();
console.log('  ' + today.slice(0, 140));
check('显示「今日能量」', today.includes('今日能量'));
check('显示能量等级', /高峰|顺畅|平稳|偏弱|低谷/.test(today));
check('显示今日关注（宫位）', today.includes('今日关注') || /命宫|财帛|官禄|夫妻|父母|疾厄|兄弟|子女|迁移|仆役|田宅|福德/.test(today));
check('不再显示模拟内容「你正处在」', !today.includes('你正处在'));
check('不再显示写死的句子「今年不宜盲目扩张」', !today.includes('今年不宜盲目扩张'));
await shot('dev-2-today');

console.log('\n=== 3. 7 天屏：真实数据 + 三档颜色 ===');
await clickScreen('未来 7 天');
await sleep(4000);
const week = await screenText();
console.log('  ' + week.slice(0, 140));
check('显示「未来 7 天」', week.includes('未来 7 天'));
check('显示「今天」', week.includes('今天'));
check('说明了刻度含义', week.includes('当月') || week.includes('相对高低'));
// 柱高各异 → 说明不是同一个数
const heights = await ev(`
  (() => {
    const el = [...document.querySelectorAll('div')].find(d => d.style && d.style.width === '480px');
    if (!el) return [];
    return [...el.querySelectorAll('div[style*="height"]')]
      .map(d => d.style.height)
      .filter(h => h && h.includes('px'));
  })()
`);
console.log('  柱高:', JSON.stringify(heights));
check('7 根柱', heights.length === 7, `${heights.length} 根`);
check('柱高各异（不是同一个数）', new Set(heights).size >= 3, `${new Set(heights).size} 种`);
await shot('dev-3-week');

console.log('\n=== 4. 说明区要如实标注哪些真实、哪些没做 ===');
const page = await ev(`document.body.innerText.replace(/\\s+/g,' ')`);
check('说明黄历是真实数据且离线可用', page.includes('真实数据') && page.includes('离线'));
check('说明今日/7 天是真实数据', page.includes('流日四化'));
check('如实标注语音未接', page.includes('未接'));
check('给固件同事指出接口文件', page.includes('device-feed'));

console.log('\n=== 5. 没有出生信息时的降级 ===');
await ev(`localStorage.clear()`);
await send('Page.navigate', { url: BASE + '/ambient/' });
await sleep(3500);
const noBirth = await screenText();
check('无出生信息时黄历仍正常', noBirth.includes('宜'));
const notice = await ev(`document.body.innerText.replace(/\\s+/g,' ')`);
check('提示用了示例出生信息', notice.includes('示例') || notice.includes('还没有填写'));
await shot('dev-5-no-birth');

console.log('\n页面异常:', errs.length ? errs.join(' | ') : '无');
console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
