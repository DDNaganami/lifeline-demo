/**
 * 主判断的验证
 * ---------------------------------------------------------------
 * 重点验证两件事：
 *   1. **判断方向和排盘一致**——不能出现"忌落财帛"却写"财务上很顺"
 *   2. **童年措辞不出现成人内容**（踩过的坑：给 3 岁孩子写"职业决策"）
 */
import { buildJudgment, judgmentDirection } from '../lib/judgment.ts';
import { buildYearSignals } from '../lib/signals.ts';
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
function check(name: string, ok: boolean, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

const DIMS: DimensionKey[] = ['overall', 'career', 'wealth', 'marriage', 'parents', 'health'];

/* ---------- 1. 判断方向必须与排盘一致 ---------- */
console.log('=== 1. 判断方向 vs 排盘方向（成年人）===');
let mismatches = 0;
let checked = 0;
for (const year of [2026, 2028, 2030, 2035, 2040]) {
  const signals = buildYearSignals(birth, year);
  for (const dim of DIMS) {
    const age = year - 1993;
    const j = buildJudgment({ dimension: dim, age, year, signals, trend: '震荡' });
    const dir = judgmentDirection({ dimension: dim, age, year, signals, trend: '震荡' });

    // 判断文案里的倾向词是否和排盘方向矛盾
    const textIsGood = /顺|机会|争取|宽|支持|借力|往上|抓手|落定|正面/.test(j.text);
    const textIsBad = /阻力|紧|守|减速|冲突|消耗|出问题|提醒|不宜/.test(j.text);

    const contradicts =
      (dir === 'bad' && textIsGood && !textIsBad) || (dir === 'good' && textIsBad && !textIsGood);

    checked++;
    if (contradicts) {
      mismatches++;
      if (mismatches <= 3) {
        console.log(`    ⚠️ ${year} ${dim}：排盘=${dir} 判断="${j.text}"`);
      }
    }
  }
}
check(`判断与排盘方向不矛盾的组合数 = ${checked}`, mismatches === 0, `矛盾 ${mismatches} 处`);

/* ---------- 2. 童年措辞 ---------- */
console.log('\n=== 2. 童年（≤12 岁）措辞不含成人内容 ===');
const ADULT_WORDS = ['职业决定', '升职', '跳槽', '投资', '加杠杆', '伴侣', '婚姻', '创业', '事业上'];
let earlyBad = 0;
const earlySamples: string[] = [];
for (const year of [1994, 1997, 2000, 2004]) {
  const signals = buildYearSignals(birth, year);
  for (const dim of DIMS) {
    const age = year - 1993;
    const j = buildJudgment({ dimension: dim, age, year, signals, trend: '震荡' });
    const hit = ADULT_WORDS.filter((w) => j.text.includes(w));
    if (hit.length > 0) {
      earlyBad++;
      if (earlyBad <= 3) console.log(`    ⚠️ ${year}（${age} 岁）${dim} 含成人词 ${hit.join('/')}：「${j.text}」`);
    }
    if (earlySamples.length < 6) earlySamples.push(`${year}(${age}岁) ${dim}：${j.text}`);
  }
}
check('童年年份不含成人用词', earlyBad === 0, `违规 ${earlyBad} 处`);
console.log('  童年样本:');
for (const s of earlySamples) console.log('    ' + s);

/* ---------- 3. 依据是否可追溯 ---------- */
console.log('\n=== 3. 每句判断都有可追溯的依据 ===');
let noBasis = 0;
for (const year of [2026, 2035]) {
  const signals = buildYearSignals(birth, year);
  for (const dim of DIMS) {
    const j = buildJudgment({ dimension: dim, age: year - 1993, year, signals, trend: '震荡' });
    if (j.basis.length === 0) noBasis++;
    // 依据里必须出现"宫"，否则说明没追到排盘
    if (!j.basis.some((b) => b.includes('宫'))) noBasis++;
  }
}
check('所有判断都有带宫位的依据', noBasis === 0, `缺失 ${noBasis} 处`);

/* ---------- 4. 具体案例：忌落财帛 → 财务偏紧 ---------- */
console.log('\n=== 4. 具体案例核对 ===');
for (const year of [2026, 2035]) {
  const signals = buildYearSignals(birth, year);
  const wealth = buildJudgment({ dimension: 'wealth', age: year - 1993, year, signals, trend: '震荡' });
  const impacts = signals.palaceImpacts.filter((i) => i.palace === '财帛');
  console.log(`  ${year} 年 · 财帛宫影响: ${impacts.map((i) => `${i.mutagen}(${i.polarity})`).join('、') || '无'}`);
  console.log(`         判断: ${wealth.text}`);
  console.log(`         依据: ${wealth.basis.join(' / ')}`);
}

/* ---------- 5. 确定性与维度差异 ---------- */
console.log('\n=== 5. 确定性与差异性 ===');
const s = buildYearSignals(birth, 2026);
const a = buildJudgment({ dimension: 'career', age: 33, year: 2026, signals: s, trend: '震荡' });
const b = buildJudgment({ dimension: 'career', age: 33, year: 2026, signals: s, trend: '震荡' });
check('同一输入结果一致', a.text === b.text);

const texts = new Set(
  DIMS.map((d) => buildJudgment({ dimension: d, age: 33, year: 2026, signals: s, trend: '震荡' }).text),
);
check('六个维度给出不同判断', texts.size === 6, `实际 ${texts.size} 种不同`);

const s2 = buildYearSignals(birth, 2028);
const c = buildJudgment({ dimension: 'career', age: 35, year: 2028, signals: s2, trend: '震荡' });
check('不同年份判断不同', a.text !== c.text);

console.log('\n=== 6. 成年人的判断样本（2026 年）===');
for (const dim of DIMS) {
  const j = buildJudgment({ dimension: dim, age: 33, year: 2026, signals: s, trend: '震荡' });
  console.log(`  ${dim.padEnd(9)} ${j.text}`);
}

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
