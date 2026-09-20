/**
 * 验证「全部地级市」都能被识别并定位到省
 * ---------------------------------------------------------------
 * 这是 B 方案的核心承诺：
 *   **每个地级市都能被识别，并定位到所在省，误差 ≤ 同省内距离（一般 < 4 分钟）**
 */
import { resolvePlace, PREFECTURE_BY_PROVINCE, PROVINCE_CENTER } from '../lib/solar-time.ts';
import { groupCities } from '../lib/places.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

console.log('=== 1. 覆盖量 ===');
const allPrefectures = Object.values(PREFECTURE_BY_PROVINCE).flat();
console.log(`  省级单位: ${Object.keys(PREFECTURE_BY_PROVINCE).length}`);
console.log(`  地级市/自治州/盟: ${allPrefectures.length}`);
const groups = groupCities();
const totalCities = groups.reduce((s, g) => s + g.cities.length, 0);
const precise = groups.reduce((s, g) => s + g.preciseCount, 0);
console.log(`  选择器里的城市总数: ${totalCities}（精确经度 ${precise} 个）`);
check('地级市数量 >= 300', allPrefectures.length >= 300, `实际 ${allPrefectures.length}`);
check('选择器城市数 >= 380', totalCities >= 380, `实际 ${totalCities}`);

console.log('\n=== 2. 每一个地级市都必须能被识别，并定位到省（核心）===');
const failures: string[] = [];
for (const [prov, cities] of Object.entries(PREFECTURE_BY_PROVINCE)) {
  for (const city of cities) {
    const r = resolvePlace(city);
    // 必须：认出来了（matched 有值）且拿到该省中心的经度
    if (!r.matched || r.longitude !== PROVINCE_CENTER[prov]) {
      failures.push(`${city}（应为${prov} ${PROVINCE_CENTER[prov]}°，实际 ${r.matched} ${r.longitude}°）`);
    }
  }
}
check(
  `${allPrefectures.length} 个地级市全部识别到正确省份`,
  failures.length === 0,
  failures.length ? `失败 ${failures.length} 个：${failures.slice(0, 5).join('；')}` : '',
);

console.log('\n=== 3. 直接输入地级市名（不带省份）也要能定位 ===');
for (const [city, expectProv] of [
  ['赣州', '江西'], ['邯郸', '河北'], ['潍坊', '山东'], ['盐城', '江苏'],
  ['阿克苏', '新疆'], ['赤峰', '内蒙古'], ['柳州', '广西'], ['遵义', '贵州'],
] as [string, string][]) {
  const r = resolvePlace(city);
  const ok = r.matched === city && r.province === expectProv;
  console.log(
    `  ${ok ? '✅' : '❌'} ${city.padEnd(5)} → ${r.longitude}°  按${r.province}估算  ${r.provinceLevel ? '(估算)' : '(精确)'}`,
  );
  if (!ok) fail++;
  else pass++;
}

console.log('\n=== 4. 【关键】精确城市不能被省中心覆盖 ===');
// 之前的事故就是"西宁被宁波覆盖"，这次要确保新加的地级市不会反过来覆盖精确城市
const MUST_STAY_PRECISE: [string, number][] = [
  ['西宁', 101.78], ['南宁', 108.37], ['杭州', 120.15], ['北京', 116.41],
  ['乌鲁木齐', 87.62], ['拉萨', 91.11], ['广州', 113.26], ['上海', 121.47],
];
let overwritten = 0;
for (const [city, lon] of MUST_STAY_PRECISE) {
  const r = resolvePlace(city);
  const ok = r.longitude === lon && !r.provinceLevel;
  if (!ok) {
    overwritten++;
    console.log(`    ⚠️ ${city} → ${r.longitude}° provinceLevel=${r.provinceLevel}`);
  }
}
check('精确城市没有被省中心覆盖', overwritten === 0, `被覆盖 ${overwritten} 个`);

console.log('\n=== 5. 同名冲突检查：地级市名不能与精确城市名重复 ===');
import { CITY_TABLE } from '../lib/solar-time.ts';
const dup = allPrefectures.filter((c) => CITY_TABLE[c]);
console.log('  与精确城市同名的地级市:', dup.length ? dup.join('、') : '无');
check('没有同名冲突（否则会覆盖精确经度）', dup.length === 0, dup.join('、'));

console.log('\n=== 6. 每个省的估算经度必须互不相同 ===');
// 如果两个省的中心经度一样，说明数据抄错了
const centerValues = Object.entries(PROVINCE_CENTER);
const dupCenters = centerValues.filter(([p, v]) =>
  centerValues.some(([p2, v2]) => p2 !== p && v2 === v),
);
console.log('  经度重复的省份:', dupCenters.length ? dupCenters.map(([p]) => p).join('、') : '无');
check('省中心经度无重复', dupCenters.length === 0);

console.log('\n=== 7. 分组展示的完整性 ===');
const noProvince = groups.filter((g) => g.cities.length === 0);
console.log('  组数:', groups.length, ' 空组:', noProvince.length);
check('没有空分组', noProvince.length === 0);
check('每组至少 1 个城市', groups.every((g) => g.cities.length >= 1));

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
