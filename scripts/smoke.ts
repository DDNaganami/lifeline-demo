/**
 * 数据冒烟测试（仅开发期使用，可随时删除）
 * 运行：node --experimental-strip-types scripts/smoke.ts
 */

import {
  BANDS,
  buildLifeLine,
  buildStageCard,
  buildYearCard,
  CURRENT_YEAR,
  daxianOf,
  levelOf,
  MAX_AGE,
  MIN_AGE,
} from '../lib/mock-data.ts';
import { DIMENSIONS, type BirthInfo } from '../lib/types.ts';

const birth: BirthInfo = {
  name: '测试',
  gender: '男',
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
  birthPlace: '浙江杭州',
};

const points = buildLifeLine(birth);
const birthYear = Number(birth.birthDate.slice(0, 4));
console.log('当前年份:', CURRENT_YEAR);
console.log('曲线点数:', points.length, `（${MIN_AGE}-${MAX_AGE} 岁）`);

const stage = buildStageCard(points, birth);
console.log('当前阶段卡:', JSON.stringify(stage));

let min = Infinity;
let max = -Infinity;
for (const p of points) {
  for (const d of DIMENSIONS) {
    const v = p[d.key];
    if (v < min) min = v;
    if (v > max) max = v;
  }
}
console.log('取值范围:', min, '-', max);
console.log('年份唯一:', new Set(points.map((p) => p.year)).size === points.length);

const sampleYears = [
  birthYear + 3,
  birthYear + 8,
  birthYear + 16,
  birthYear + 22,
  stage.year,
  stage.year - 3,
  stage.year + 8,
];
for (const y of sampleYears) {
  const index = points.findIndex((q) => q.year === y);
  if (index < 0) continue;
  const p = points[index];
  console.log(`\n--- ${y} 年 / ${p.age} 岁 / ${p.phase} / ${daxianOf(p.age).label} ---`);
  console.log('  档位:', DIMENSIONS.map((d) => `${d.label}=${levelOf(p[d.key]).label}`).join(' '));
  for (const d of DIMENSIONS) {
    const card = buildYearCard(points, index, d.key, birth);
    console.log(
      `  [${d.label}] ${card.trend} / ${card.actionTip} / 一致性=${card.consistency} / 事件${card.events.length}条`,
    );
    console.log(`    判断: ${card.mainJudgment}`);
    console.log(`    事件: ${card.events.map((e) => `${e.priority}.${e.text}`).join(' | ')}`);
    console.log(`    紫微: ${card.ziweiSignal}`);
    console.log(`    八字: ${card.baziSignal}`);
  }
}

// 统计趋势分布，确认「转折」不再占满所有年份
const trendCount: Record<string, number> = {};
const overallTrendCount: Record<string, number> = {};
for (const p of points) {
  overallTrendCount[p.trend] = (overallTrendCount[p.trend] ?? 0) + 1;
  for (const d of DIMENSIONS) {
    const index = p.age - MIN_AGE;
    const card = buildYearCard(points, index, d.key, birth);
    trendCount[card.trend] = (trendCount[card.trend] ?? 0) + 1;
  }
}
console.log('\n总览趋势分布:', JSON.stringify(overallTrendCount));
console.log('六维度趋势分布:', JSON.stringify(trendCount));

// 主判断必须有实际内容，且不能出现明显的年龄错配用词
const ADULT_WORDS = ['职场', '职业角色', '工作', '收入或资产', '负债', '置业', '婚姻'];
let ageMismatch = 0;
for (const p of points) {
  if (p.age > 18) continue;
  for (const d of DIMENSIONS) {
    const card = buildYearCard(points, p.age - MIN_AGE, d.key, birth);
    const hit = ADULT_WORDS.filter((w) => card.mainJudgment.includes(w));
    if (hit.length > 0) {
      ageMismatch++;
      if (ageMismatch <= 5) {
        console.log(`年龄错配: ${p.year}(${p.age}岁) ${d.label} → ${card.mainJudgment} [${hit.join(',')}]`);
      }
    }
  }
}
console.log('童年年份出现成人用词的组合数（应为 0）:', ageMismatch);

// 事件条数检查：童年 3-4 条，其余年份 4-6 条
let outOfRange = 0;
let missing = 0;
const sizeCount: Record<string, number> = {};
for (const p of points) {
  for (const d of DIMENSIONS) {
    const card = buildYearCard(points, p.age - MIN_AGE, d.key, birth);
    const n = card.events.length;
    sizeCount[n] = (sizeCount[n] ?? 0) + 1;
    const low = p.age <= 12 ? 3 : 4;
    if (n < low || n > 6) {
      outOfRange++;
      if (outOfRange <= 5) console.log('事件条数异常:', p.year, p.age + '岁', d.label, n);
    }
    if (!card.mainJudgment || !card.ziweiSignal || !card.baziSignal) missing++;
  }
}
console.log('事件条数分布:', JSON.stringify(sizeCount));
console.log('事件条数越界的组合数（应为 0）:', outOfRange);
console.log('文案缺失的组合数（应为 0）:', missing);

// 稳定性检查：同一份输入两次生成必须完全一致
const again = buildLifeLine(birth);
const stable = JSON.stringify(again) === JSON.stringify(points);
console.log('两次生成结果一致（应为 true）:', stable);

// 阶段带覆盖
let gap = 0;
for (let age = MIN_AGE; age <= MAX_AGE; age++) {
  if (!BANDS.find((b) => age >= b.from && age <= b.to)) gap++;
}
console.log('阶段带缺口数（应为 0）:', gap);

// 大限覆盖：任意年龄都要有宫位
console.log('大限抽样:', [3, 11, 19, 25, 33, 41, 55, 70, 85].map((a) => `${a}岁=${daxianOf(a).label}`).join(' / '));
