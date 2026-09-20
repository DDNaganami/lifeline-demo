/** 验证「今日」页的能量确实由流日排盘决定 */
import { buildDailyReading, greetingOf } from '../lib/daily.ts';
import type { BirthInfo } from '../lib/types.ts';

const birth: BirthInfo = {
  name: '演示',
  gender: '男',
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
  birthPlace: '浙江杭州',
};

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

console.log('=== 1. 今日读数（2026-09-20）===');
const r = buildDailyReading(birth, '2026-09-20');
console.log('  公历:', r.dateText);
console.log('  农历:', r.lunarText);
console.log('  干支:', r.ganzhiText);
console.log('  能量:', r.energy.value, `（${r.energy.label}）`);
console.log('  结论:', r.headline);
for (const d of r.detail) console.log('    ·', d);
console.log('  流日命宫:', r.focus.palace, `（${r.focus.palaceTheme}）`);
console.log('  流日四化:', r.focus.mutagens.map((m) => `${m.star}化${m.mutagen}→${m.palace}`).join('、'));
console.log('  身体:', r.healthNote);
console.log('  宜:', r.yi.join(' '));
console.log('  忌:', r.ji.join(' '));
console.log('  方位 喜:', r.directions.xi, ' 财:', r.directions.cai, ' 福:', r.directions.fu);
console.log('  冲:', r.chong, ' 煞:', r.sha);

check('能量在 0-100', r.energy.value >= 0 && r.energy.value <= 100);
check('有农历日期', r.lunarText.length > 0);
check('有干支', r.ganzhiText.includes('日'));
check('四化有落到实处（能找到宫位）', r.focus.mutagens.every((m) => m.palace !== '—'));
check('有宜忌', r.yi.length > 0 && r.ji.length > 0);

console.log('\n=== 2. 确定性（同一天同一人结果固定）===');
const r2 = buildDailyReading(birth, '2026-09-20');
check('两次结果完全一致', JSON.stringify(r) === JSON.stringify(r2));

console.log('\n=== 3. 不同日期能量应不同（说明不是常数）===');
const values: number[] = [];
for (let i = 0; i < 14; i++) {
  const d = new Date(2026, 8, 1 + i);
  const iso = `2026-09-${String(d.getDate()).padStart(2, '0')}`;
  const rr = buildDailyReading(birth, iso);
  values.push(rr.energy.value);
  console.log(`  9/${String(d.getDate()).padStart(2, '0')} ${rr.week[0].dayGanZhi}日  ${String(rr.energy.value).padStart(3)}  ${rr.energy.label}`);
}
check('14 天里出现了多种能量值', new Set(values).size >= 5, `实际 ${new Set(values).size} 种`);
check('能量有高有低（不是一条直线）', Math.max(...values) - Math.min(...values) >= 15, `极差 ${Math.max(...values) - Math.min(...values)}`);

console.log('\n=== 4. 未来 7 天 ===');
console.log('  日期        干支   能量  等级');
for (const w of r.week) {
  console.log(`  ${w.date}  ${w.dayGanZhi}  ${String(w.value).padStart(3)}  ${w.label}${w.isToday ? '  ← 今天' : ''}`);
}
check('返回 7 天', r.week.length === 7);
check('第一天是今天', r.week[0].isToday && r.week[0].date === '2026-09-20');
check('7 天日期连续', r.week.every((w, i) => i === 0 || new Date(w.date).getTime() - new Date(r.week[i - 1].date).getTime() === 86400000));
check('周平均在 0-100', r.weekAverage >= 0 && r.weekAverage <= 100);
check('周平均等于 7 天均值', r.weekAverage === Math.round(r.week.reduce((s, w) => s + w.value, 0) / 7));

console.log('\n=== 5. 不同出生信息 → 不同读数 ===');
const other = buildDailyReading({ ...birth, birthDate: '1985-03-10', birthTime: '寅时 03:00-05:00' }, '2026-09-20');
console.log('  1993-06-18 →', r.energy.value, r.energy.label, '| 流日命宫', r.focus.palace);
console.log('  1985-03-10 →', other.energy.value, other.energy.label, '| 流日命宫', other.focus.palace);
check('不同命盘读数不同', r.energy.value !== other.energy.value || r.focus.palace !== other.focus.palace);

console.log('\n=== 6. 问候语随时段 ===');
for (const h of [7, 12, 15, 20, 2]) {
  console.log(`  ${String(h).padStart(2)} 点 → ${greetingOf(h, '演示')}`);
}
check('问候语有五种', new Set([7, 12, 15, 20, 2].map((h) => greetingOf(h))).size === 5);

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
