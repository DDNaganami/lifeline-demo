/** 验证：四化落宫 → 事件生成（两种口气） */
import { buildYearSignals } from '../lib/signals.ts';
import { buildPalaceEvents } from '../lib/events.ts';
import type { DimensionKey } from '../lib/types.ts';

const birth = {
  name: 't',
  gender: '男' as const,
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
  birthPlace: '浙江杭州',
};

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (ok) pass++;
  else fail++;
}

for (const y of [2026, 2028]) {
  console.log(`\n=== ${y} 年 · 四化落宫 ===`);
  const s = buildYearSignals(birth, y);
  for (const im of s.palaceImpacts.slice(0, 7)) {
    console.log(`  ${im.palace.padEnd(4)} ${im.mutagen.padEnd(8)} ${im.polarity.padEnd(5)} 权重 ${im.weight.toFixed(1)}`);
  }

  console.log('\n  【温和口气】分维度事件:');
  for (const dim of ['overall', 'career', 'wealth', 'marriage', 'parents', 'health'] as DimensionKey[]) {
    const evs = buildPalaceEvents(s.palaceImpacts, dim, 'soft', 4, `${y}|${dim}`);
    console.log(`    ${dim.padEnd(9)} ${evs.map((e) => e.text).join(' / ') || '（无）'}`);
  }

  console.log('\n  【直接口气】分维度事件:');
  for (const dim of ['career', 'wealth'] as DimensionKey[]) {
    const evs = buildPalaceEvents(s.palaceImpacts, dim, 'direct', 4, `${y}|${dim}`);
    console.log(`    ${dim.padEnd(9)} ${evs.map((e) => e.text).join(' / ') || '（无）'}`);
  }
}

console.log('\n=== 验证要点 ===');
const s2026 = buildYearSignals(birth, 2026);

// 1. 事件必须来自真实落宫
const careerEvents = buildPalaceEvents(s2026.palaceImpacts, 'career', 'soft', 4, '2026|career');
check('事件带来源标注（宫位 + 四化）', careerEvents.every((e) => e.source.palace && e.source.mutagen));

// 2. 两种口气必须不同
const soft = buildPalaceEvents(s2026.palaceImpacts, 'career', 'soft', 4, 'k').map((e) => e.text);
const direct = buildPalaceEvents(s2026.palaceImpacts, 'career', 'direct', 4, 'k').map((e) => e.text);
check('温和与直接两套文案不同', JSON.stringify(soft) !== JSON.stringify(direct));

// 3. 同一输入必须稳定
const again = buildPalaceEvents(s2026.palaceImpacts, 'career', 'soft', 4, 'k').map((e) => e.text);
check('同一输入结果一致（不是随机）', JSON.stringify(soft) === JSON.stringify(again));

// 4. 换个维度事件必须不同
const wealth = buildPalaceEvents(s2026.palaceImpacts, 'wealth', 'soft', 4, 'k').map((e) => e.text);
check('不同维度事件不同', JSON.stringify(soft) !== JSON.stringify(wealth));

// 5. 换个年份事件必须不同
const s2028 = buildYearSignals(birth, 2028);
const career2028 = buildPalaceEvents(s2028.palaceImpacts, 'career', 'soft', 4, 'k').map((e) => e.text);
check('不同年份事件不同', JSON.stringify(soft) !== JSON.stringify(career2028));

// 6. 条数在 3-6 之间
check('事件条数在 3-6 条', careerEvents.length >= 3 && careerEvents.length <= 6);

// 7. 优先级连续
check('优先级从 1 连续', careerEvents.every((e, i) => e.priority === i + 1));

// 8. 六维度都能生成事件
let allOk = true;
for (const dim of ['overall', 'career', 'wealth', 'marriage', 'parents', 'health'] as DimensionKey[]) {
  const evs = buildPalaceEvents(s2026.palaceImpacts, dim, 'soft', 4, `t|${dim}`);
  if (evs.length === 0) {
    allOk = false;
    console.log(`    ⚠️ 维度 ${dim} 没有生成事件`);
  }
}
check('六个维度都能生成事件', allOk);

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
