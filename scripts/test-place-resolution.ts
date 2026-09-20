/**
 * 出生地解析的回归测试
 * ---------------------------------------------------------------
 * 这个测试是为了守住一次**严重事故**：
 *   别名里有一条"宁 → 南京"，而匹配用"包含"，
 *   于是「西宁」含「宁」→ 解析成南京 → 又因宁波在表里靠前 → 返回宁波的经度。
 *   西宁实际 101.78°，拿到 118.8°，**差 68 分钟，足以跨时辰、命宫全错**。
 *
 * 所以这里逐条对照**已知正确的经度**，不只看"能不能认出来"。
 */

import { resolvePlace, CITY_TABLE } from '../lib/solar-time.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

/**
 * 关键城市的经度对照表（人工核对过的公开数据）。
 * 用途：确保解析结果**不仅认得出来，而且经度对**。
 */
const EXPECTED: Record<string, { lon: number; maxErr: number }> = {
  北京: { lon: 116.41, maxErr: 0.01 },
  上海: { lon: 121.47, maxErr: 0.01 },
  广州: { lon: 113.26, maxErr: 0.01 },
  成都: { lon: 104.07, maxErr: 0.01 },
  杭州: { lon: 120.15, maxErr: 0.01 },
  南京: { lon: 118.8, maxErr: 0.01 },
  宁波: { lon: 121.55, maxErr: 0.01 },
  南宁: { lon: 108.37, maxErr: 0.01 },
  西宁: { lon: 101.78, maxErr: 0.01 },
  拉萨: { lon: 91.11, maxErr: 0.01 },
  乌鲁木齐: { lon: 87.62, maxErr: 0.01 },
  哈尔滨: { lon: 126.53, maxErr: 0.01 },
  昆明: { lon: 102.83, maxErr: 0.01 },
  海口: { lon: 110.2, maxErr: 0.01 },
  香港: { lon: 114.17, maxErr: 0.01 },
  东京: { lon: 139.69, maxErr: 0.01 },
  纽约: { lon: -74.01, maxErr: 0.01 },
  伦敦: { lon: -0.13, maxErr: 0.01 },
};

console.log('=== 1. 关键城市必须解析到「自己的」经度（这是事故的核心）===');
for (const [city, exp] of Object.entries(EXPECTED)) {
  const r = resolvePlace(city);
  const err = Math.abs(r.longitude - exp.lon);
  check(
    `${city} → ${r.longitude}°（期望 ${exp.lon}°）`,
    err <= exp.maxErr,
    err <= exp.maxErr ? '' : `误差 ${err.toFixed(2)}° = ${Math.round(err * 4)} 分钟`,
  );
}

console.log('\n=== 2. 曾经出事故的两个城市，单独立案 ===');
const xining = resolvePlace('西宁');
const nanning = resolvePlace('南宁');
console.log(`  西宁 → ${xining.matched} / ${xining.longitude}°`);
console.log(`  南宁 → ${nanning.matched} / ${nanning.longitude}°`);
check('西宁不能再被解析成别的城市', xining.matched === '西宁', `实际 ${xining.matched}`);
check('南宁不能再被解析成别的城市', nanning.matched === '南宁', `实际 ${nanning.matched}`);
check(
  '西宁与宁波的经度必须差得远（否则说明又串了）',
  Math.abs(xining.longitude - resolvePlace('宁波').longitude) > 15,
);

console.log('\n=== 3. 含歧义短字的城市都要正确 ===');
const TRICKY = ['南京', '南宁', '宁波', '西宁', '天津', '武汉', '杭州', '深圳', '成都', '重庆', '广州', '上海', '北京'];
let wrong = 0;
for (const t of TRICKY) {
  const r = resolvePlace(t);
  if (r.matched !== t) {
    wrong++;
    console.log(`    ⚠️ ${t} → ${r.matched}`);
  }
}
check(`${TRICKY.length} 个易混城市全部正确`, wrong === 0, `错 ${wrong} 个`);

console.log('\n=== 4. 常见写法都要认对 ===');
const FORMATS: [string, string][] = [
  ['浙江杭州', '杭州'],
  ['浙江省杭州市', '杭州'],
  ['杭州市', '杭州'],
  ['内蒙古呼和浩特', '呼和浩特'],
  ['广西南宁', '南宁'],
  ['青海西宁', '西宁'],
  ['新疆乌鲁木齐', '乌鲁木齐'],
  ['西藏拉萨', '拉萨'],
  ['Hangzhou', '杭州'],
  ['hangzhou', '杭州'],
  ['Beijing', '北京'],
  ['New York', '纽约'],
  ['new york', '纽约'],
  ['香港', '香港'],
];
let fmtWrong = 0;
for (const [input, expect] of FORMATS) {
  const r = resolvePlace(input);
  const ok = r.matched === expect;
  if (!ok) fmtWrong++;
  console.log(`  ${ok ? '✅' : '❌'} ${input.padEnd(16)} → ${r.matched}`);
}
check('各种写法都能认对', fmtWrong === 0, `错 ${fmtWrong} 个`);

console.log('\n=== 5. 认不出来时必须是明确失败，而不是猜一个 ===');
for (const bad of ['某个不存在的地方', '昆山', '义乌', '']) {
  const r = resolvePlace(bad);
  console.log(`  ${bad || '(空)'} → approximate=${r.approximate} 经度=${r.longitude}`);
  check(`「${bad || '(空)'}」标记为 approximate`, r.approximate === true);
}
check('兜底经度是 120°（等于不做经度修正，误差最小化的选择）', resolvePlace('不存在').longitude === 120);

console.log('\n=== 6. 表里每个城市都必须能解析回自己（自洽性）===');
let selfFail = 0;
for (const city of Object.keys(CITY_TABLE)) {
  const r = resolvePlace(city);
  if (r.matched !== city) {
    selfFail++;
    if (selfFail <= 5) console.log(`    ⚠️ ${city} → ${r.matched}`);
  }
}
check(`${Object.keys(CITY_TABLE).length} 个城市自洽`, selfFail === 0, `错 ${selfFail} 个`);

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
