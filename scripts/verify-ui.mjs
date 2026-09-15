/**
 * 用浏览器调试协议（CDP）真实打开页面并截图 + 检查运行时错误。
 * 仅开发期使用：node scripts/verify-ui.mjs
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const OUT = '.shots';

mkdirSync(OUT, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + process.cwd() + '\\.shots\\cdp-profile',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(300);
  }
  throw new Error('浏览器调试端口没有就绪');
}

const wsUrl = await waitForTarget();
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let seq = 0;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    pageErrors.push(d.exception?.description ?? d.text);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
};

function send(method, params = {}, sessionId = undefined) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await send('Runtime.enable');
await send('Page.enable');

/** 设置视口尺寸 */
async function setViewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function goTo(url) {
  await send('Page.navigate', { url });
  await sleep(2500);
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? '页面脚本执行失败');
  }
  return result.result.value;
}

async function shot(name, fullPage = true) {
  const params = { format: 'png' };
  if (fullPage) params.captureBeyondViewport = true;
  const { data } = await send('Page.captureScreenshot', params);
  writeFileSync(`${OUT}\\${name}.png`, Buffer.from(data, 'base64'));
  console.log(`已保存截图: ${OUT}\\${name}.png`);
}

/* --------------------------- 场景 1：首页 --------------------------- */
await setViewport(1440, 1200);
await goTo(BASE + '/');
console.log('首页按钮文案:', await evaluate(`document.querySelector('button[type=submit]')?.textContent`));

/* --------------------------- 场景 2：填写表单并提交 --------------------------- */
await evaluate(`
  (() => {
    const set = (sel, val) => {
      const el = document.querySelector(sel);
      const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('#name', '演示用户');
    set('#birthDate', '1993-06-18');
    set('#birthTime', '午时 11:00-13:00');
    set('#birthPlace', '浙江杭州');
    return true;
  })()
`);
await evaluate(`document.querySelector('button[type=submit]').click()`);
await sleep(3000);
console.log('提交后地址:', await evaluate('location.pathname'));
console.log('本地是否已存出生信息:', await evaluate(`!!localStorage.getItem('lifeline.birth')`));

/* --------------------------- 场景 3：仪表盘 --------------------------- */
await setViewport(1440, 2400);
await sleep(1500);
console.log('当前阶段标题:', await evaluate(`document.querySelector('h1')?.textContent`));
console.log('曲线节点数量:', await evaluate(`document.querySelectorAll('svg [role=button]').length`));
console.log('年度卡片标题:', await evaluate(`document.querySelectorAll('h3')[0]?.textContent`));
console.log('事件条数:', await evaluate(`document.querySelectorAll('section ol li').length`));
console.log('命理依据默认是否收起:', await evaluate(`document.querySelector('details')?.open === false`));
await shot('01-dashboard');

/* --------------------------- 场景 4：切换维度 --------------------------- */
await evaluate(`
  (() => {
    const tabs = [...document.querySelectorAll('[role=tab]')];
    tabs.find((t) => t.textContent.includes('事业')).click();
    return true;
  })()
`);
await sleep(1200);
console.log('切换后当前维度:', await evaluate(`document.querySelector('[role=tab][aria-selected=true]')?.textContent`));
await shot('02-dimension-career');

/* --------------------------- 场景 5：点击曲线上的一年 --------------------------- */
await evaluate(`
  (() => {
    const nodes = [...document.querySelectorAll('svg [role=button]')];
    const target = nodes.find((n) => n.getAttribute('aria-label')?.startsWith('2012'));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return target.getAttribute('aria-label');
  })()
`);
await sleep(1200);
console.log('点击后年度卡片:', await evaluate(`document.querySelectorAll('h3')[0]?.textContent`));
console.log('点击后地址:', await evaluate(`location.pathname`));
await shot('03-year-2012');

/* --------------------------- 场景 6：四档反馈 → 自动追问 --------------------------- */
await evaluate(`
  (() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '部分符合');
    btn.click();
    return true;
  })()
`);
await sleep(1500);
console.log(
  '反馈已写入本地:',
  await evaluate(`localStorage.getItem('lifeline.feedback')`),
);
console.log('打反馈后是否自动弹出追问面板:', await evaluate(`!!document.querySelector('aside')`));
console.log('自动带出的建议追问:', await evaluate(`
  (() => {
    const box = [...document.querySelectorAll('aside div')].find((d) => d.textContent.startsWith('这一年我标注为') || d.textContent.startsWith('这一年我核对'));
    return box ? box.textContent.trim() : '未找到';
  })()
`));

/* --------------------------- 场景 6b：写下经历并存进核对档案 --------------------------- */
await evaluate(`
  (() => {
    const ta = document.querySelector('#year-note');
    Object.getOwnPropertyDescriptor(ta.constructor.prototype, 'value').set.call(ta, '这年换了工作，收入降了一点，但方向对了');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()
`);
await sleep(600);
await evaluate(`
  (() => {
    const btn = [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('存进我的核对档案'));
    btn.click();
    return true;
  })()
`);
await sleep(1000);
console.log('核对档案已写入本地:', await evaluate(`localStorage.getItem('lifeline.notes')`));
console.log('面板内确认文案:', await evaluate(`
  [...document.querySelectorAll('aside p')].some((p) => p.textContent.includes('已存进你的核对档案'))
`));
await shot('05-note-saved', false);

/* --------------------------- 场景 7：手动打开面板 --------------------------- */
await evaluate(`
  (() => {
    const btn = [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim() === '收起');
    btn.click();
    return true;
  })()
`);
await sleep(800);
await evaluate(`
  (() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('问陈老师'));
    btn.click();
    return true;
  })()
`);
await sleep(1200);
console.log('面板上下文:', await evaluate(`
  (() => {
    const dl = document.querySelector('aside dl');
    return dl ? dl.textContent.replace(/\\s+/g, ' ').trim() : '未找到面板';
  })()
`));
console.log('卡片上是否回显我写的经历:', await evaluate(`
  [...document.querySelectorAll('section div')].some((d) => d.textContent.includes('你为这一年留下的经历'))
`));
console.log('核对清单是否按年份归并:', await evaluate(`
  (() => {
    const h = [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('我核对过的年份'));
    if (!h) return '未找到区块';
    const sec = h.closest('section');
    const years = [...sec.querySelectorAll('li')].map((li) => li.querySelector('span')?.textContent);
    return years.join(',') + ' → 唯一=' + (new Set(years).size === years.length);
  })()
`));
console.log('核对清单是否回显原文:', await evaluate(`
  (() => {
    const h = [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('我核对过的年份'));
    return h ? h.closest('section').textContent.includes('这年换了工作') : false;
  })()
`));
console.log('维度按钮是否带「已写经历」标记:', await evaluate(`
  [...document.querySelectorAll('button')].some((b) => b.textContent.includes('事业 · 部分符合 ✎'))
`));

// 手动打开时输入框草稿应为空
console.log('输入框草稿（手动打开应为空）:', JSON.stringify(await evaluate(`document.querySelector('aside textarea')?.value`)));

await evaluate(`
  (() => {
    const ta = document.querySelector('aside textarea');
    Object.getOwnPropertyDescriptor(ta.constructor.prototype, 'value').set.call(ta, '如果这一年我打算换工作，应该先准备什么？');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()
`);
await sleep(600);
console.log('草稿已写入本地:', await evaluate(`localStorage.getItem('lifeline.draft')`));
await evaluate(`
  (() => {
    const btn = [...document.querySelectorAll('aside button')].find((b) => b.textContent.trim() === '发送');
    btn.click();
    return true;
  })()
`);
await sleep(1000);
console.log('占位回答是否出现:', await evaluate(`
  [...document.querySelectorAll('aside div')].some((d) => d.textContent.includes('示例回答'))
`));
await setViewport(1440, 1000);
await sleep(800);
await shot('04-chen-panel', false);

/* --------------------------- 场景 8：没有出生信息时应回到首页 --------------------------- */
await evaluate(`localStorage.clear()`);
await goTo(BASE + '/dashboard');
console.log('无出生信息访问仪表盘 → 地址:', await evaluate('location.pathname + location.search'));

/* --------------------------- 结果 --------------------------- */
console.log('\n页面运行时异常:', pageErrors.length === 0 ? '无' : pageErrors.join(' | '));
console.log('控制台错误:', consoleErrors.length === 0 ? '无' : consoleErrors.join(' | '));

ws.close();
chrome.kill();
process.exit(0);
