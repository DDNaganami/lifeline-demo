/** 看真实的大限布局（性别会影响顺逆行） */
import { astro } from 'iztro';

const CASES = [
  { date: '1993-6-18', timeIndex: 6, gender: '男', label: '1993-06-18 午时 男' },
  { date: '1993-6-18', timeIndex: 6, gender: '女', label: '1993-06-18 午时 女' },
  { date: '1985-3-10', timeIndex: 2, gender: '男', label: '1985-03-10 寅时 男' },
  { date: '2000-11-5', timeIndex: 9, gender: '女', label: '2000-11-05 酉时 女' },
];

for (const c of CASES) {
  const chart = astro.bySolar(c.date, c.timeIndex, c.gender, true, 'zh-CN');
  console.log(`\n=== ${c.label} ===`);
  console.log(`  命宫: ${chart.earthlyBranchOfSoulPalace}宫 · 五行局: ${chart.fiveElementsClass}`);

  // 按大限起运年龄排序
  const byDecadal = chart.palaces
    .filter((p) => p.decadal && p.decadal.range)
    .map((p) => ({ name: p.name, range: p.decadal.range, stars: p.majorStars.map((s) => s.name).join('、') }))
    .sort((a, b) => a.range[0] - b.range[0]);

  for (const p of d3(byDecadal)) {
    console.log(`  ${String(p.range[0]).padStart(2)}-${String(p.range[1]).padStart(2)} 岁  ${p.name.padEnd(4)} ${p.stars}`);
  }
}

function d3<T>(arr: T[]): T[] {
  return arr;
}
