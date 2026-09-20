/**
 * 真太阳时接入排盘后的效果验证
 * 重点：不同出生地是否导致不同的命宫（这证明校正真的生效了）
 */
import { buildChart, buildYearHoroscope } from '../lib/chart.ts';

const base = {
  name: '测试',
  gender: '男' as const,
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
};

console.log('=== 同一出生时间、不同出生地 → 真太阳时不同 → 命盘可能不同 ===');
console.log('  城市      钟表时间  真太阳时  时辰   修正量     命宫     命主   跨时辰');
for (const city of ['杭州', '北京', '上海', '成都', '昆明', '乌鲁木齐', '拉萨']) {
  const c = buildChart({ ...base, birthPlace: city });
  const st = c.solarTime;
  console.log(
    '  ' +
      city.padEnd(8) +
      st.localTime.padEnd(10) +
      st.trueSolarTime.padEnd(10) +
      st.timeName.padEnd(7) +
      (st.totalOffsetMinutes + '分').padEnd(11) +
      c.summary.soulPalaceGanzhi.padEnd(8) +
      c.summary.soul.padEnd(7) +
      (st.crossedBoundary ? '⚠️ 是' : '否'),
  );
}

console.log('\n=== 结论检查：西部城市是否因经度西移而换了命宫 ===');
const hz = buildChart({ ...base, birthPlace: '杭州' });
const wlmq = buildChart({ ...base, birthPlace: '乌鲁木齐' });
console.log('  杭州命宫:', hz.summary.soulPalaceGanzhi, '（', hz.summary.soulPalaceGanzhi, '）命主', hz.summary.soul);
console.log('  乌鲁木齐命宫:', wlmq.summary.soulPalaceGanzhi, '命主', wlmq.summary.soul);
console.log('  命盘是否不同:', JSON.stringify(hz.palaces) !== JSON.stringify(wlmq.palaces));

console.log('\n=== 夏令时的影响（1988 年夏天出生）===');
for (const [date, label] of [['1988-07-01', '夏令时期间'], ['1988-12-01', '冬令时']]) {
  const c = buildChart({ ...base, birthDate: date, birthPlace: '上海' });
  console.log(
    `  ${label} ${date}：钟表 ${c.solarTime.localTime}（UTC偏移 ${c.solarTime.utcOffsetMinutes / 60}h，夏令时=${c.solarTime.dstApplied}）` +
      ` → 真太阳时 ${c.solarTime.trueSolarTime}（${c.solarTime.timeName}）命宫 ${c.summary.soulPalaceGanzhi}`,
  );
}

console.log('\n=== 逐年运限仍然正确（大限随年龄推进）===');
for (const year of [2005, 2015, 2026, 2035, 2045]) {
  const h = buildYearHoroscope({ ...base, birthPlace: '杭州' }, year);
  console.log(
    `  ${year}  ${h.age} 岁  大限 ${h.decadalRange.join('-')}  宫位 ${h.decadalPalace}  四化 ${h.decadalMutagens.map((m) => m.star + '化' + m.mutagen).join(' ')}`,
  );
}

console.log('\n=== 未匹配城市时的行为（必须给出提示，不能静默出错）===');
const unknown = buildChart({ ...base, birthPlace: '某个不存在的地方' });
console.log('  approximate 标记:', unknown.solarTime.place.approximate === true);
console.log('  未匹配但可用（按东经 120 兜底）:', unknown.solarTime.place.matched === null);
console.log('  兜底后经度修正:', unknown.solarTime.longitudeOffsetMinutes, '分（接近 0，说明按不修正处理）');
