/** 检查阶段名是否与年龄相符（修掉"33 岁叫感情成形期"这类问题） */
import { buildLifePhases, phaseAt } from '../lib/phases.ts';
import type { BirthInfo } from '../lib/types.ts';

const birth: BirthInfo = {
  name: 't',
  gender: '男',
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
  birthPlace: '杭州',
};

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (ok) pass++;
  else fail++;
}

console.log('=== 阶段表 ===');
const phases = buildLifePhases(birth);
for (const p of phases.slice(0, 9)) {
  console.log(
    `  ${String(p.from).padStart(3)}-${String(p.to).padStart(3)} 岁  ${p.name.padEnd(7)} ${p.palace.padEnd(4)} ${p.stars.join('、')}`,
  );
}

console.log('\n=== 年龄相符性检查（这是刚才的 bug）===');
/** 每个阶段名隐含的年龄段，用于检查是否与阶段实际年龄冲突 */
const NAME_AGE_RANGE: Record<string, [number, number]> = {
  被照顾期: [0, 13], 同伴成长期: [0, 13], 家庭成长期: [0, 13], 家庭扩展期: [0, 13],
  体质奠基期: [0, 13], 环境适应期: [0, 13], 朋友圈期: [0, 13], 兴趣发掘期: [0, 13],
  家庭环境期: [0, 13], 性情形成期: [0, 13], 家庭依恋期: [0, 13], 保障成长期: [0, 13],
  自我成形期: [13, 34], 同学朋友期: [13, 34], 感情成形期: [13, 34], 开始带人期: [13, 34],
  收入起步期: [13, 34], 精力管理期: [13, 34], 外出求学期: [13, 34], 人脉建立期: [13, 34],
  职业探索期: [13, 34], 安身期: [13, 34], 内心探索期: [13, 34], 独立过渡期: [13, 34],
  自我确立期: [28, 62], 同辈协作期: [28, 62], 成家立约期: [25, 62], 养育传承期: [25, 62],
  财富积累期: [25, 62], 健康管理期: [28, 62], 变动开拓期: [28, 62], 团队协作期: [28, 62],
  事业确立期: [28, 62], 家业稳定期: [25, 62], 内在整理期: [28, 62], 反哺长辈期: [25, 62],
  身心安顿期: [55, 200], 老友往来期: [55, 200], 相守相伴期: [55, 200], 含饴弄孙期: [55, 200],
  积蓄守成期: [55, 200], 养生调护期: [55, 200], 行旅安顿期: [55, 200], 人情往来期: [55, 200],
  余热传承期: [55, 200], 安居守成期: [55, 200], 颐养心性期: [55, 200], 代际传承期: [55, 200],
  幼年期: [0, 8],
};

const conflicts: string[] = [];
for (const p of phases) {
  const range = NAME_AGE_RANGE[p.name];
  if (!range) continue;
  // 阶段的**中位年龄**必须落在名字允许的区间内
  const mid = Math.round((p.from + p.to) / 2);
  if (mid < range[0] || mid > range[1]) {
    conflicts.push(`${p.from}-${p.to}（中位 ${mid}）叫「${p.name}」，但该名字只适用于 ${range[0]}-${range[1]} 岁`);
  }
}
check('没有"年龄与阶段名不符"的组合', conflicts.length === 0, conflicts.join('；'));

console.log('\n=== 具体回归：33 岁不能再叫「感情成形期」===');
// 1993 年生，2026 年 33 岁
const at33 = phaseAt(phases, 33);
console.log(`  33 岁 → ${at33.name}（${at33.palace}宫，大限 ${at33.from}-${at33.to}）`);
check('33 岁的阶段名不是「感情成形期」', at33.name !== '感情成形期', at33.name);
check('33 岁的阶段名是成年用语', ['自我确立期', '同辈协作期', '成家立约期', '养育传承期', '财富积累期', '健康管理期', '变动开拓期', '团队协作期', '事业确立期', '家业稳定期', '内在整理期', '反哺长辈期'].includes(at33.name), at33.name);

console.log('\n=== 全年龄扫描：不能出现年龄与名字明显冲突 ===');
let bad = 0;
const samples: string[] = [];
for (let age = 1; age <= 88; age++) {
  const p = phaseAt(phases, age);
  const range = NAME_AGE_RANGE[p.name];
  if (!range) continue;
  if (age < range[0] - 6 || age > range[1] + 6) {
    bad++;
    if (samples.length < 5) samples.push(`${age} 岁 → ${p.name}`);
  }
}
check('全年龄无明显冲突', bad === 0, samples.length ? samples.join('；') : '');

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
