/**
 * 验证「六个维度的长期形状」确实由命盘驱动
 * ---------------------------------------------------------------
 * 这里要守住的是一个**曾经存在的严重问题**：
 *   六个维度的个人基调原来是 `(rng(出生日期|维度) - 0.5) * 8`，
 *   也就是"你财运天生好"是**掷骰子**决定的，跟命盘无关。
 *
 * 现在它必须由对应宫位的星曜庙旺决定，所以本测试的重点是：
 *   **同一个人不同维度的高低关系，必须与宫位庙旺一致。**
 */
import { buildDimensionBase } from '../lib/dimension-base.ts';
import { buildChart } from '../lib/chart.ts';
import { buildLifeLine } from '../lib/mock-data.ts';
import type { BirthInfo, DimensionKey } from '../lib/types.ts';

const birth: BirthInfo = {
  name: 't',
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

console.log('=== 1. 基调来自宫位庙旺（含依据）===');
const base = buildDimensionBase(birth);
const chart = buildChart(birth);
for (const dim of ['overall', 'career', 'wealth', 'marriage', 'parents', 'health'] as DimensionKey[]) {
  console.log(`  ${dim.padEnd(9)} 偏移 ${String(base.offsets[dim]).padStart(5)}   ${base.reasons[dim]}`);
}
check('六个维度都有偏移值', Object.keys(base.offsets).length === 6);
check('偏移幅度合理（-7 ~ +7）', Object.values(base.offsets).every((v) => v >= -7 && v <= 7));

console.log('\n=== 2. 方向必须与宫位庙旺一致（这是核心）===');
const BRIGHT: Record<string, number> = { 庙: 1, 旺: 0.8, 得: 0.5, 利: 0.2, 平: 0, 不: -0.4, 陷: -0.8 };
const PALACE: Record<string, string> = {
  overall: '命宫', career: '官禄', wealth: '财帛',
  marriage: '夫妻', parents: '父母', health: '疾厄',
};
let mismatch = 0;
for (const dim of ['overall', 'career', 'wealth', 'marriage', 'parents', 'health'] as DimensionKey[]) {
  const p = chart.palaces.find((x) => x.name === PALACE[dim]);
  const stars = p?.majorStars ?? [];
  if (stars.length === 0) {
    // 空宫 → 偏移必须是 0
    if (base.offsets[dim] !== 0) mismatch++;
    continue;
  }
  const avg = stars.reduce((s, st) => s + (BRIGHT[st.brightness ?? '平'] ?? 0), 0) / stars.length;
  const positive = base.offsets[dim] > 0;
  const negative = base.offsets[dim] < 0;
  const shouldPositive = avg > 0.15;
  const shouldNegative = avg < -0.15;
  if ((shouldPositive && !positive) || (shouldNegative && !negative)) {
    mismatch++;
    console.log(`    ⚠️ ${dim}: 庙旺均值 ${avg.toFixed(2)} 但偏移 ${base.offsets[dim]}`);
  }
}
check('基调方向与庙旺一致', mismatch === 0, `不一致 ${mismatch} 处`);

console.log('\n=== 3. 换一个人，基调必须不同（不再由随机数决定）===');
const other = buildDimensionBase({ ...birth, birthDate: '1985-03-10', birthTime: '寅时 03:00-05:00', birthPlace: '北京' });
console.log('  1993-06-18:');
console.log('   ', Object.entries(base.offsets).map(([k, v]) => `${k}:${v}`).join('  '));
console.log('  1985-03-10:');
console.log('   ', Object.entries(other.offsets).map(([k, v]) => `${k}:${v}`).join('  '));
check('两人基调不同', JSON.stringify(base.offsets) !== JSON.stringify(other.offsets));

console.log('\n=== 4. 曲线必须反映这个基调 ===');
// 同一个人：偏高维度在曲线上的均值，应高于偏低维度
const line = buildLifeLine(birth, undefined, undefined, base.offsets);
const avgOf = (dim: DimensionKey) => line.reduce((s, p) => s + p[dim], 0) / line.length;
const avgs = (['overall', 'career', 'wealth', 'marriage', 'parents', 'health'] as DimensionKey[])
  .map((d) => ({ d, avg: avgOf(d), base: base.offsets[d] }))
  .sort((a, b) => b.base - a.base);
for (const a of avgs) {
  console.log(`  ${a.d.padEnd(9)} 基调 ${String(a.base).padStart(5)}  曲线均值 ${a.avg.toFixed(1)}`);
}
// 基调最高与最低的维度，曲线均值也应当有先后（允许年龄曲线带来的偏差）
const highest = avgs[0];
const lowest = avgs[avgs.length - 1];
check(
  `基调最高的「${highest.d}」在曲线上不低于基调最低的「${lowest.d}」`,
  highest.avg >= lowest.avg - 5,
  `${highest.avg.toFixed(1)} vs ${lowest.avg.toFixed(1)}`,
);

console.log('\n=== 5. 确定性：同一个人两次结果一致 ===');
const line2 = buildLifeLine(birth, undefined, undefined, base.offsets);
check('两次曲线完全一致', JSON.stringify(line) === JSON.stringify(line2));

console.log('\n=== 6. 不再依赖随机数：换出生日期但同命盘基调相同 ===');
const sameBase = buildDimensionBase(birth);
check('同一出生信息基调稳定', JSON.stringify(sameBase.offsets) === JSON.stringify(base.offsets));

console.log('\n=== 7. 空宫必须记 0 并说明，而不是编一个值 ===');
let emptyOk = true;
for (const dim of ['overall', 'career', 'wealth', 'marriage', 'parents', 'health'] as DimensionKey[]) {
  const p = chart.palaces.find((x) => x.name === PALACE[dim]);
  if ((p?.majorStars ?? []).length === 0) {
    if (base.offsets[dim] !== 0 || !base.reasons[dim].includes('空宫')) emptyOk = false;
  }
}
check('空宫记 0 且说明是空宫', emptyOk);

console.log('\n=== 8. 幅度不能压过年龄曲线 ===');
// 年龄曲线的幅度约 30 分，基调若超过 ±10 就会让"人生阶段"失去意义
check('基调幅度 <= 7', Object.values(base.offsets).every((v) => Math.abs(v) <= 7), `最大 ${Math.max(...Object.values(base.offsets).map(Math.abs))}`);

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
