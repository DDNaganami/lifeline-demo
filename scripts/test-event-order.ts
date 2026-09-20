/** 验证事件排序：本宫事件必须排在补充事件之前 */
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

const s = buildYearSignals(birth, 2026);
console.log('=== 2026 四化落宫（已知）===');
for (const im of s.palaceImpacts) {
  console.log(`  ${im.palace.padEnd(4)} ${im.mutagen.padEnd(8)} ${im.polarity.padEnd(5)} 权重 ${im.weight}`);
}

const PRIMARY: Record<string, string> = {
  overall: '命宫', career: '官禄', wealth: '财帛',
  marriage: '夫妻', parents: '父母', health: '疾厄',
};

console.log('\n=== 事件来源顺序检查（本宫必须排最前）===');
let wrong = 0;
for (const dim of ['overall', 'career', 'wealth', 'marriage', 'parents', 'health'] as DimensionKey[]) {
  const evs = buildPalaceEvents(s.palaceImpacts, dim, 'soft', 5, `2026|${dim}`);
  const primary = PRIMARY[dim];
  const firstIsMine = evs.length > 0 && evs[0].source.palace === primary;
  // 本宫相关的（含同类）应排在其他之前
  console.log(`\n  【${dim}】主宫位 = ${primary}  首条来自本宫: ${firstIsMine ? '✅' : '❌'}`);
  for (const e of evs) {
    const tag = e.source.palace === primary ? '★本宫' : ` 补充(${e.source.palace})`;
    console.log(`    ${e.priority}. ${tag} ${e.text}`);
  }
  if (!firstIsMine) wrong++;
}
console.log(`\n  首条不是本宫事件的维度数: ${wrong}（应为 0）`);
