/**
 * 验证设备上的二维码「真的能被扫出来」
 * ---------------------------------------------------------------
 * 只验证"有方块"是不够的——二维码可能因为尺寸、纠错等级、
 * 静区不足、颜色对比度等原因扫不出来。
 *
 * 做法：
 *   1. 用与组件相同的逻辑生成模块矩阵（qrcode-generator，纠错 M）
 *   2. 还原成像素位图（模拟屏幕上的实际观感）
 *   3. 用 jsQR 解码，看解出来的内容是否等于预期地址
 *
 * 这样才能说"手机扫得出来"，而不是"画出来了"。
 */
import { createRequire } from 'node:module';
import jsQR from 'jsqr';

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-generator');

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

/** 与组件相同的生成逻辑 */
function buildMatrix(value: string, ecc: 'L' | 'M' | 'Q' | 'H' = 'M') {
  const qr = qrcode(0, ecc);
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const grid: boolean[][] = [];
  for (let y = 0; y < n; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < n; x++) row.push(qr.isDark(x, y));
    grid.push(row);
  }
  return { grid, count: n };
}

/** 模块矩阵 → RGBA 位图（模拟屏幕像素） */
function renderToPixels(
  grid: boolean[][],
  cellPx: number,
  quiet: number,
  dark = '#1a1917',
  light = '#ffffff',
) {
  const n = grid.length;
  const total = (n + quiet * 2) * cellPx;
  const data = new Uint8ClampedArray(total * total * 4);

  const hex = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [dr, dg, db] = hex(dark);
  const [lr, lg, lb] = hex(light);

  for (let py = 0; py < total; py++) {
    for (let px = 0; px < total; px++) {
      const mx = Math.floor(px / cellPx) - quiet;
      const my = Math.floor(py / cellPx) - quiet;
      const isDark = mx >= 0 && my >= 0 && mx < n && my < n && grid[my][mx];
      const i = (py * total + px) * 4;
      data[i] = isDark ? dr : lr;
      data[i + 1] = isDark ? dg : lg;
      data[i + 2] = isDark ? db : lb;
      data[i + 3] = 255;
    }
  }
  return { data, width: total, height: total };
}

const DEPLOY_URL = 'http://112.111.47.239:25572/dashboard/';
const { grid, count } = buildMatrix(DEPLOY_URL);

console.log('=== 1. 真实部署地址能否被解码 ===');
console.log(`  模块矩阵: ${count}×${count}`);
for (const cellPx of [8, 6, 5]) {
  const { data, width, height } = renderToPixels(grid, cellPx, 1);
  const decoded = jsQR(data, width, height);
  check(
    `每个模块 ${cellPx}px（图像 ${width}×${height}）可解码`,
    decoded?.data === DEPLOY_URL,
    decoded ? '' : '→ 解不出',
  );
}

console.log('\n=== 2. 静区（白边）是否足够 ===');
for (const quiet of [0, 1, 4]) {
  const { data, width, height } = renderToPixels(grid, 8, quiet);
  const decoded = jsQR(data, width, height);
  console.log(`  静区 ${quiet} 个模块：${decoded ? '可解码' : '解不出'}`);
}

console.log('\n=== 3. 深色屏幕上的配色选择 ===');
/**
 * 设备是深色底。二维码有两种画法：
 *   白底黑码（组件采用）—— 所有扫码器都支持
 *   黑底白码（反相）    —— 部分扫码器不识别，不能依赖
 * jsQR 两种都能解，所以这里记录事实即可，结论是坚持白底黑码。
 */
const inverted = (() => {
  const { data, width, height } = renderToPixels(grid, 8, 1, '#ffffff', '#1a1917');
  return jsQR(data, width, height);
})();
console.log(
  `  反相（黑底白码）：${inverted ? '本解码器能解，但部分手机扫码器不支持，不采用' : '解不出'}`,
);
const normal = (() => {
  const { data, width, height } = renderToPixels(grid, 8, 1, '#1a1917', '#ffffff');
  return jsQR(data, width, height);
})();
check('采用白底黑码（兼容所有扫码器）', normal?.data === DEPLOY_URL);

console.log('\n=== 4. 不同地址都能解码 ===');
for (const u of [
  'http://112.111.47.239:25572/dashboard/',
  'https://example.com/dashboard/',
  'http://192.168.1.75:18080/',
]) {
  const m = buildMatrix(u);
  const { data, width, height } = renderToPixels(m.grid, 8, 1);
  const d = jsQR(data, width, height);
  check(`解码「${u}」`, d?.data === u);
}

console.log('\n=== 5. 纠错能力（屏幕有污损或反光时）===');
const m = buildMatrix(DEPLOY_URL);
const damaged = m.grid.map((row) => [...row]);
const dmgCount = Math.floor(m.count * m.count * 0.08);
let dmg = 0;
for (let y = 0; y < m.count && dmg < dmgCount; y++) {
  for (let x = 0; x < m.count && dmg < dmgCount; x++) {
    if (x > 8 && y > 8 && x < m.count - 9 && y < m.count - 9) {
      damaged[y][x] = false;
      dmg++;
    }
  }
}
const dmgRender = renderToPixels(damaged, 8, 1);
const dd = jsQR(dmgRender.data, dmgRender.width, dmgRender.height);
check(
  `遮挡 ${Math.round((dmg / (m.count * m.count)) * 100)}% 后仍可解码`,
  dd?.data === DEPLOY_URL,
  dd ? '' : '→ 遮太多了',
);

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
