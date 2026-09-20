/**
 * 验证：人生阶段由真实大限生成（而不是所有人共用一张固定表）
 */
import { buildLifePhases, phaseAt } from '../lib/phases.ts';
import { buildLifeLine } from '../lib/mock-data.ts';
import type { BirthInfo } from '../lib/types.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

const base: BirthInfo = {
  name: 't',
  gender: '男',
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
  birthPlace: '浙江杭州',
};

console.log('=== 1. 阶段表由命盘生成 ===');
const phases = buildLifePhases(base);
for (const p of phases.slice(0, 12)) {
  console.log(
    `  ${String(p.from).padStart(3)}-${String(p.to).padStart(3)} 岁  ${p.name.padEnd(6)} ` +
      `${p.palace.padEnd(4)} 主题=${p.theme.padEnd(3)} ${p.stars.join('、')}`,
  );
}
check('阶段数量 >= 10', phases.length >= 10, `实际 ${phases.length}`);
check('阶段年龄连续不重叠', phases.every((p, i) => i === 0 || p.from === phases[i - 1].to + 1));

console.log('\n=== 2. 性别不同 → 大限顺序不同（这是真实排盘的性质）===');
const male = buildLifePhases({ ...base, gender: '男' });
const female = buildLifePhases({ ...base, gender: '女' });
const maleSeq = male.map((p) => p.palace).join('→');
const femaleSeq = female.map((p) => p.palace).join('→');
console.log('  男:', maleSeq.slice(0, 60));
console.log('  女:', femaleSeq.slice(0, 60));
check('男女的大限顺序不同', maleSeq !== femaleSeq);

// 注意：第一个大限都是命宫，**第二个**才分叉（男顺行到兄弟，女逆行到父母）
const maleReal = male.filter((p) => p.palace !== '（未起运）');
const femaleReal = female.filter((p) => p.palace !== '（未起运）');
const maleSecond = maleReal[1];
const femaleSecond = femaleReal[1];
console.log(`  第二个大限：男=${maleSecond?.palace}  女=${femaleSecond?.palace}`);
check(
  '第二个大限宫位不同（男→兄弟，女→父母）',
  maleSecond?.palace === '兄弟' && femaleSecond?.palace === '父母',
  `男 ${maleSecond?.palace} / 女 ${femaleSecond?.palace}`,
);
check('第一个大限都是命宫（起运相同）', maleReal[0]?.palace === '命宫' && femaleReal[0]?.palace === '命宫');

console.log('\n=== 3. 五行局不同 → 起运年龄不同 ===');
const cases: BirthInfo[] = [
  { ...base, birthDate: '1993-06-18', birthTime: '午时 11:00-13:00' }, // 水二局 → 2 岁
  { ...base, birthDate: '1985-03-10', birthTime: '寅时 03:00-05:00' }, // 火六局 → 6 岁
  { ...base, birthDate: '2000-11-05', birthTime: '酉时 17:00-19:00' }, // 土五局 → 5 岁
];
for (const c of cases) {
  const ph = buildLifePhases(c);
  const firstDecadal = ph.find((p) => p.palace !== '（未起运）');
  console.log(`  ${c.birthDate} ${c.birthTime}  → 起运 ${firstDecadal?.from} 岁（${firstDecadal?.palace}宫）`);
}
const starts = cases.map((c) => buildLifePhases(c).find((p) => p.palace !== '（未起运）')?.from);
check('不同五行局的起运年龄不同', new Set(starts).size > 1, `实际 ${starts.join('/')}`);

console.log('\n=== 4. 阶段名是生活语言，不是「命宫/兄弟」这种术语 ===');
const TERMS = ['宫', '大限'];
const badNames = phases.filter((p) => TERMS.some((t) => p.name.includes(t)));
check('阶段名不含命理术语', badNames.length === 0, badNames.map((p) => p.name).join('/'));
console.log('  阶段名样本:', phases.slice(0, 6).map((p) => p.name).join(' → '));

console.log('\n=== 5. 同一宫在不同年龄段说不同的事 ===');
// 命宫在童年叫「被照顾期」，成年叫「自我确立期」
const childPhase = phases.find((p) => p.palace === '命宫' && p.from <= 12);
const adultPhase = phases.find((p) => p.palace === '命宫' && p.from > 25);
console.log('  命宫（童年）:', childPhase?.name, ' 命宫（成年）:', adultPhase?.name);
check(
  '命宫在童年与成年用不同措辞',
  !childPhase || !adultPhase || childPhase.name !== adultPhase.name,
);

console.log('\n=== 6. phaseAt 覆盖全年龄 ===');
let gaps = 0;
for (let age = 1; age <= 88; age++) {
  const p = phaseAt(phases, age);
  if (!p || age < p.from || age > p.to) gaps++;
}
check('1-88 岁全部能取到阶段', gaps === 0, `缺口 ${gaps}`);

console.log('\n=== 7. 曲线里的阶段名来自真实阶段 ===');
const line = buildLifeLine(base, undefined, phases);
const linePhases = new Set(line.map((p) => p.phase));
const weird = [...linePhases].filter((n) => TERMS.some((t) => n.includes(t)));
console.log('  曲线里出现的阶段名:', [...linePhases].join(' / '));
check('曲线阶段名不含术语', weird.length === 0);

console.log('\n=== 8. 换个人，阶段名集合应该不同 ===');
const other = buildLifeLine(
  { ...base, gender: '女' },
  undefined,
  buildLifePhases({ ...base, gender: '女' }),
);
const otherPhases = new Set(other.map((p) => p.phase));
console.log('  男:', [...linePhases].join(' / '));
console.log('  女:', [...otherPhases].join(' / '));
check('男女的阶段序列不同', JSON.stringify([...linePhases]) !== JSON.stringify([...otherPhases]));

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
