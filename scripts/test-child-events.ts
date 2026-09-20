/** 验证儿童年份的事件列表（≤12 岁不应出现职业/收入/伴侣内容） */
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

const DIMS: DimensionKey[] = ['overall', 'career', 'wealth', 'marriage', 'parents', 'health'];
const ADULT_WORDS = ['升职', '跳槽', '创业', '加杠杆', '投资', '伴侣', '婚姻', '岗位', '上级', '合作方', '收入', '现金流', '资金'];

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

console.log('=== 童年（1996 年 · 3 岁）各维度事件 ===');
const signals = buildYearSignals(birth, 1996);
let violations = 0;
for (const dim of DIMS) {
  const evs = buildPalaceEvents(signals.palaceImpacts, dim, 'soft', 4, `1996|${dim}`, 3);
  const texts = evs.map((e) => e.text);
  const bad = texts.flatMap((t) => ADULT_WORDS.filter((w) => t.includes(w)));
  if (bad.length) violations += bad.length;
  console.log(`  ${dim.padEnd(9)} ${texts.join(' / ')}`);
  if (bad.length) console.log(`      ⚠️ 含成人词: ${[...new Set(bad)].join('/')}`);
}
check('3 岁的事件不含成人用词', violations === 0, `违规 ${violations} 处`);

console.log('\n=== 对照：成年（2026 年 · 33 岁）应保留职业内容 ===');
const s2 = buildYearSignals(birth, 2026);
const adultCareer = buildPalaceEvents(s2.palaceImpacts, 'career', 'soft', 4, 'k', 33);
console.log('  事业:', adultCareer.map((e) => e.text).join(' / '));
check('成年人事业事件仍是职业语境', adultCareer.length > 0);

console.log('\n=== 完整事件列表（含直接口气）3 岁 ===');
const direct = buildPalaceEvents(signals.palaceImpacts, 'career', 'direct', 4, 'k', 3);
console.log('  ' + direct.map((e) => e.text).join(' / '));
const badDirect = direct.flatMap((e) => ADULT_WORDS.filter((w) => e.text.includes(w)));
check('直接口气下 3 岁也无成人用词', badDirect.length === 0, badDirect.length ? badDirect.join('/') : '');

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
