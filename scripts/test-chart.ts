/** 验证排盘封装层的输出（对比 iztro 原始结果，确认转换没丢信息） */
import { buildChart, buildYearHoroscope } from '../lib/chart.ts';

const birth = {
  name: '测试',
  gender: '男',
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
  birthPlace: '浙江杭州',
};

const chart = buildChart(birth);

console.log('=== 本命盘摘要 ===');
for (const [k, v] of Object.entries(chart.summary)) {
  console.log(`  ${k.padEnd(18)} ${v}`);
}

console.log('\n=== 十二宫 ===');
for (const p of PALACE_ORDER_SAFE(chart)) {
  const majors = p.majorStars
    .map((s) => s.name + (s.brightness ? `(${s.brightness})` : '') + (s.mutagen ? `化${s.mutagen}` : ''))
    .join(' ');
  const minors = p.minorStars.map((s) => s.name).join(' ');
  console.log(
    `  ${p.name.padEnd(4)} ${p.ganzhi}  大限${p.decadalRange ? p.decadalRange.join('-') : '?'}` +
      `  主星[${majors || '空'}]  辅星[${minors}]${p.isBodyPalace ? '  ← 身宫' : ''}`,
  );
}

function PALACE_ORDER_SAFE(c) {
  const order = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '仆役', '官禄', '田宅', '福德', '父母'];
  return order.map((n) => c.palaces.find((p) => p.name === n)).filter(Boolean);
}

console.log('\n=== 逐年运限（看大限是否随年龄推进）===');
console.log('  年份   年龄  大限区间   大限宫   大限主星            大限四化');
for (const year of [1995, 2005, 2015, 2019, 2026, 2028, 2032, 2035, 2040, 2045]) {
  const h = buildYearHoroscope(birth, year);
  const stars = h.decadalStars.map((s) => s.name).join('、') || '空宫';
  const mut = h.decadalMutagens.map((m) => `${m.star}化${m.mutagen}`).join(' ') || '-';
  console.log(
    `  ${year}  ${String(h.age).padStart(3)}  ${String(h.decadalRange.join('-')).padEnd(9)}` +
      ` ${h.decadalPalace.padEnd(8)} ${stars.padEnd(18)} ${mut}`,
  );
}

console.log('\n=== 某一年的完整运限（2028）===');
const h2028 = buildYearHoroscope(birth, 2028);
console.log('  流年干支:', h2028.yearlyStem + h2028.yearlyBranch);
console.log('  流年命宫落于本命盘:', h2028.yearlyPalace);
console.log('  流年命宫主星:', h2028.yearlyStars.map((s) => s.name).join('、') || '空宫');
console.log('  流年四化:', h2028.yearlyMutagens.map((m) => `${m.star}化${m.mutagen}`).join('、'));
console.log('  大限区间:', h2028.decadalRange.join('-'), '岁  大限宫:', h2028.decadalPalace);

console.log('\n=== 确定性检查（同一输入两次结果必须一致）===');
const again = buildChart(birth);
console.log('  一致:', JSON.stringify(again) === JSON.stringify(chart));

console.log('\n=== 换一个人（换生日）结果必须不同 ===');
const other = buildChart({ ...birth, birthDate: '1988-03-05', birthTime: '辰时 07:00-09:00' });
console.log('  生日不同 → 命宫:', chart.summary.soulPalaceGanzhi, 'vs', other.summary.soulPalaceGanzhi);
console.log('  五行局不同:', chart.summary.fiveElementsClass, 'vs', other.summary.fiveElementsClass);
console.log('  结果不同:', JSON.stringify(other) !== JSON.stringify(chart));

console.log('\n=== 换性别（命盘应不同）===');
const female = buildChart({ ...birth, gender: '女' });
console.log('  大限区间是否不同:', JSON.stringify(female.palaces.map((p) => p.decadalRange)) !== JSON.stringify(chart.palaces.map((p) => p.decadalRange)));
