/**
 * 八字层的验证
 * 重点验证「十神」规则——这是八字判断的核心，算错就全错。
 */
import { buildBazi, buildYearBazi, shiShenOf } from '../lib/bazi.ts';

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? '✅' : '❌'} ${name}: ${JSON.stringify(actual)}${ok ? '' : ` （期望 ${JSON.stringify(expected)}）`}`);
  if (ok) pass++;
  else fail++;
}

console.log('=== 1. 十神规则（对每个日主逐条验证）===');
// 以庚金日主为例（我们的测试盘）
check('庚见庚 = 比肩', shiShenOf('庚', '庚'), '比肩');
check('庚见辛 = 劫财（同金异性）', shiShenOf('庚', '辛'), '劫财');
check('庚见戊 = 偏印（土生金，同性）', shiShenOf('庚', '戊'), '偏印');
check('庚见己 = 正印（土生金，异性）', shiShenOf('庚', '己'), '正印');
check('庚见壬 = 食神（金生水，同性）', shiShenOf('庚', '壬'), '食神');
check('庚见癸 = 伤官（金生水，异性）', shiShenOf('庚', '癸'), '伤官');
check('庚见甲 = 偏财（金克木，同性）', shiShenOf('庚', '甲'), '偏财');
check('庚见乙 = 正财（金克木，异性）', shiShenOf('庚', '乙'), '正财');
check('庚见丙 = 七杀（火克金，同性）', shiShenOf('庚', '丙'), '七杀');
check('庚见丁 = 正官（火克金，异性）', shiShenOf('庚', '丁'), '正官');
// 换一个日主，确认不是硬编码
check('甲见庚 = 七杀（金克木，同性）', shiShenOf('甲', '庚'), '七杀');
check('甲见辛 = 正官（异性）', shiShenOf('甲', '辛'), '正官');

console.log('\n=== 2. 四柱（对照五虎遁独立验算）===');
const birth = {
  name: '测试',
  gender: '男' as const,
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
  birthPlace: '浙江杭州',
};
const bazi = buildBazi(birth);
console.log('  真太阳时:', bazi.trueSolarTime);
check('年柱', bazi.year.ganzhi, '癸酉');
// 五虎遁：戊癸之年甲寅起 → 午月应为戊午
check('月柱（按节气，五虎遁推出戊午）', bazi.month.ganzhi, '戊午');
check('日柱', bazi.day.ganzhi, '庚午');
check('时柱（午时）', bazi.time.ganzhi, '壬午');
check('日主', bazi.dayMaster, '庚');
check('日主五行', bazi.dayMasterWuXing, '金');

console.log('\n=== 3. 十神（与库输出对照）===');
check('年干十神（癸对庚 = 伤官）', bazi.year.shiShen, '伤官');
check('月干十神（戊对庚 = 偏印）', bazi.month.shiShen, '偏印');
check('日柱十神应为「日主」', bazi.day.shiShen, '日主');
check('时干十神（壬对庚 = 食神）', bazi.time.shiShen, '食神');

console.log('\n=== 4. 五行统计（应总和合理）===');
console.log('  五行分布:', JSON.stringify(bazi.wuXingCount));
const total = Object.values(bazi.wuXingCount).reduce((a, b) => a + b, 0);
// 天干各 1（共 4）+ 地支藏干按 1/0.5/0.3 加权（约 4-6）→ 合理区间约 7-11
console.log('  合计:', total, '（天干 4 + 地支藏干加权，合理区间 7-11）');
check('合计在合理范围', total >= 7 && total <= 11, true);
check('最弱五行存在', typeof bazi.weakest === 'string' && bazi.weakest.length === 1, true);
check('最强五行存在', typeof bazi.strongest === 'string' && bazi.strongest.length === 1, true);
// 本盘：庚午日、午月、午时 → 火最旺；木最少
check('本盘火最旺', bazi.strongest, '火');
check('本盘木最弱', bazi.weakest, '木');

console.log('\n=== 5. 大运（十年一运，应连续且随年龄推进）===');
console.log('  起运:', bazi.startLuck);
console.log('  大运前 6 步:');
for (const d of bazi.daYun.slice(0, 6)) {
  console.log(`    ${d.startYear}-${d.endYear}  ${d.startAge}-${d.endAge} 岁  ${d.ganzhi}`);
}
check('大运数量 >= 8', bazi.daYun.length >= 8, true);
let continuous = true;
for (let i = 1; i < bazi.daYun.length; i++) {
  if (bazi.daYun[i].startYear !== bazi.daYun[i - 1].endYear + 1) continuous = false;
}
check('大运年份连续', continuous, true);

console.log('\n=== 6. 逐年运限（流年十神应随年份变化）===');
console.log('  年份  年龄  流年   流年十神   大运   大运十神');
const seen = new Set<string>();
for (const year of [2000, 2010, 2020, 2026, 2030, 2040]) {
  const yb = buildYearBazi(birth, year);
  seen.add(yb.liuNian + yb.liuNianShiShen);
  console.log(
    `  ${year}  ${String(yb.age).padStart(3)}   ${yb.liuNian}  ${yb.liuNianShiShen.padEnd(6)}  ` +
      `${(yb.daYun?.ganzhi ?? '-').padEnd(5)}  ${yb.daYunShiShen ?? '-'}`,
  );
}
check('流年十神并非固定值（有变化）', seen.size >= 4, true);

console.log('\n=== 7. 换个出生日期，结果必须不同 ===');
const other = buildBazi({ ...birth, birthDate: '1988-03-05', birthTime: '辰时 07:00-09:00', birthPlace: '北京' });
console.log('  1993-06-18 →', bazi.year.ganzhi, bazi.month.ganzhi, bazi.day.ganzhi, bazi.time.ganzhi);
console.log('  1988-03-05 →', other.year.ganzhi, other.month.ganzhi, other.day.ganzhi, other.time.ganzhi);
check('两个日期四柱不同', JSON.stringify(bazi) !== JSON.stringify(other), true);

console.log('\n=== 8. 确定性 ===');
check('两次结果一致', JSON.stringify(buildBazi(birth)) === JSON.stringify(bazi), true);

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
