/**
 * 信号层验证：紫微 + 八字 两个体系是否都产出真数据，以及曲线偏移量
 */
import { buildYearSignals, buildYearOffsets, directionLabel } from '../lib/signals.ts';

const birth = {
  name: '测试',
  gender: '男' as const,
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
  birthPlace: '浙江杭州',
};

console.log('=== 两手体系是否都出真数据 ===');
for (const y of [2019, 2026, 2028, 2035]) {
  const s = buildYearSignals(birth, y);
  console.log(
    `  ${y}  紫微 ${s.ziweiDirection.toFixed(2)}（${directionLabel(s.ziweiDirection)}）` +
      `  八字 ${s.baziDirection.toFixed(2)}（${directionLabel(s.baziDirection)}）` +
      `  → ${s.consistency}`,
  );
  console.log(`     紫微：${s.ziweiSignal}`);
  console.log(`     八字：${s.baziSignal}`);
  console.log('');
}

console.log('=== 一致性判定是否三种情况都出现过 ===');
const counts: Record<string, number> = { 一致: 0, 单信号: 0, 冲突: 0 };
for (let y = 1994; y <= 2040; y++) {
  const s = buildYearSignals(birth, y);
  counts[s.consistency]++;
}
console.log('  1994-2040 年的判定分布:', JSON.stringify(counts));

console.log('\n=== 曲线偏移量（由真实排盘驱动）===');
const t0 = Date.now();
const offs = buildYearOffsets(birth, 1994, 2026);
const elapsed = Date.now() - t0;
console.log(`  计算 33 年耗时: ${elapsed}ms  （每年约 ${Math.round(elapsed / 33)}ms）`);
const vals = [...offs.entries()];
const numbers = vals.map((v) => v[1]);
console.log(`  偏移范围: ${Math.min(...numbers).toFixed(1)} ~ ${Math.max(...numbers).toFixed(1)}`);
console.log('  逐年抽样:');
console.log('   ', vals.filter((_, i) => i % 4 === 0).map(([y, v]) => `${y}:${v >= 0 ? '+' : ''}${v.toFixed(1)}`).join('  '));

console.log('\n=== 性能提示 ===');
console.log(`  88 年全量约需 ${Math.round((elapsed / 33) * 88)}ms —— 首次加载可接受，但必须缓存`);
