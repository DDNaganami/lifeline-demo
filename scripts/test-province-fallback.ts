/** 验证：直接输入的识别效果（省级兜底 + 无兜底的真实差距） */
import { resolvePlace } from '../lib/solar-time.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

console.log('=== 1. 只认得出省份时，用省级中心兜底 ===');
for (const input of ['青海', '广西', '新疆', '内蒙古', '浙江', '江苏']) {
  const r = resolvePlace(input);
  console.log(
    `  ${input.padEnd(5)} → ${r.longitude}°  provinceLevel=${r.provinceLevel}  approximate=${r.approximate}  matched=${r.matched}`,
  );
}
check('省份名能给出省级经度', resolvePlace('青海').longitude === 101.78);
check('省级兜底标记为 provinceLevel', resolvePlace('青海').provinceLevel === true);
check('省级兜底仍标记 approximate', resolvePlace('青海').approximate === true);

console.log('\n=== 2. 「省 + 未收录城市」也应该用省级兜底（关键）===');
// 这是最常见的输入方式：用户写「江西赣州」，赣州不在表里
for (const input of ['江西赣州', '江西 赣州', '江西省赣州市', '河北邯郸', '山东潍坊', '江苏盐城']) {
  const r = resolvePlace(input);
  const hasProvince = r.provinceLevel === true;
  console.log(
    `  ${input.padEnd(12)} → 经度 ${String(r.longitude).padStart(7)}°  ${hasProvince ? `按${r.province}估算` : '未识别省份'}  ${r.approximate ? '(粗略)' : '(精确)'}`,
  );
}
check('「江西赣州」走了省级兜底', resolvePlace('江西赣州').provinceLevel === true);
check('「河北邯郸」走了省级兜底', resolvePlace('河北邯郸').provinceLevel === true);

console.log('\n=== 3. 省级兜底 vs 完全不校正：差多少 ===');
const CASES: [string, number][] = [
  ['新疆阿克苏', 87.62],   // 新疆中心
  ['青海玉树', 101.78],    // 青海中心
  ['黑龙江漠河', 126.53],  // 黑龙江中心
];
for (const [input] of CASES) {
  const r = resolvePlace(input);
  const diff = Math.abs(r.longitude - 120);
  console.log(
    `  ${input.padEnd(10)} 兜底经度 ${r.longitude}° → 修正 ${Math.round((r.longitude - 120) * 4)} 分` +
      `（若完全不校正则为 0 分，差 ${Math.round(diff * 4)} 分钟）`,
  );
}
const xinjiang = resolvePlace('新疆阿克苏');
check(
  '新疆走省级兜底比不校正准得多（差 > 100 分钟）',
  Math.abs(xinjiang.longitude - 120) * 4 > 100,
  `差 ${Math.round(Math.abs(xinjiang.longitude - 120) * 4)} 分钟`,
);

console.log('\n=== 4. 城市名优先于省份名（不能被省份兜底抢走）===');
// 「浙江杭州」里同时有省份和城市，必须命中城市
check('浙江杭州 → 杭州（121.15 不是浙江中心 120.15）', resolvePlace('浙江杭州').longitude === 120.15, `${resolvePlace('浙江杭州').longitude}`);
check('青海西宁 → 西宁（101.78）', resolvePlace('青海西宁').longitude === 101.78);
check('内蒙古呼和浩特 → 呼和浩特', resolvePlace('内蒙古呼和浩特').longitude === 111.75);

console.log('\n=== 5. 完全认不出时仍是明确失败（不猜）===');
for (const bad of ['某不存在的地方', 'qwerty', '12345']) {
  const r = resolvePlace(bad);
  console.log(`  ${bad.padEnd(12)} → 经度 ${r.longitude}  approximate=${r.approximate}`);
}
check('完全认不出 → 东经 120 且标记 approximate', resolvePlace('qwerty').approximate === true && resolvePlace('qwerty').longitude === 120);

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
