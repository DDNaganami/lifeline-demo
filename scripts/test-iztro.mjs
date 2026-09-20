/**
 * 验证 iztro 排盘：看它到底能算出什么、结构是什么样的
 * 用法：node scripts/test-iztro.mjs
 */
import { astro } from 'iztro';

// 用一份真实的出生信息试：1993-06-18 午时（11:00-13:00）男
const SOLAR_DATE = '1993-6-18';
const TIME_INDEX = 6; // 午时
const GENDER = '男';

console.log('=== 输入 ===');
console.log(`公历 ${SOLAR_DATE}  时辰序号 ${TIME_INDEX}（午时）  ${GENDER}`);

const chart = astro.bySolar(SOLAR_DATE, TIME_INDEX, GENDER, true, 'zh-CN');

console.log('\n=== 基本信息 ===');
console.log('阳历:', chart.solarDate);
console.log('阴历:', chart.lunarDate);
console.log('四柱:', chart.chineseDate);
console.log('时辰:', chart.time, '/', chart.timeRange);
console.log('生肖:', chart.zodiac, ' 星座:', chart.sign);
console.log('命主:', chart.soul, ' 身主:', chart.body);
console.log('五行局:', chart.fiveElementsClass);

console.log('\n=== 十二宫（每宫：宫名 / 主星 / 辅星）===');
for (const p of chart.palaces) {
  const majors = p.majorStars.map((s) => s.name + (s.brightness ? `(${s.brightness})` : '')).join(' ');
  const minors = p.minorStars.map((s) => s.name).join(' ');
  console.log(
    `  ${String(p.name).padEnd(4)} ${(p.heavenlyStem + p.earthlyBranch).padEnd(4)}` +
      ` 主星[${majors || '空'}]  辅星[${minors}]`,
  );
}

console.log('\n=== 宫位原始字段（看第一个宫有哪些属性）===');
console.log(JSON.stringify(chart.palaces[0], null, 1).slice(0, 1400));

console.log('\n=== 大限（decadal）===');
const withDecadal = chart.palaces.filter((p) => p.decadal);
console.log('有大限信息的宫位数:', withDecadal.length);
if (withDecadal[0]) {
  console.log('示例:', JSON.stringify(withDecadal[0].decadal));
}

console.log('\n=== 命宫在哪 ===');
const soul = chart.palaces.find((p) => p.name === '命宫');
console.log(soul ? `命宫: ${soul.heavenlyStem}${soul.earthlyBranch} 主星: ${soul.majorStars.map((s) => s.name).join('、') || '空宫'}` : '未找到命宫');

console.log('\n=== 运限（horoscope）能力探测 ===');
const fnNames = Object.keys(chart).filter((k) => typeof chart[k] === 'function');
console.log('chart 上可调用的方法:', fnNames.join(', ') || '（无）');
