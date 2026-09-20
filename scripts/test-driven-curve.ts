/** 验证排盘偏移是否真的作用到了曲线上 */
import { buildYearOffsets } from '../lib/signals.ts';
import { buildLifeLine } from '../lib/mock-data.ts';

const base = {
  name: 't',
  gender: '男' as const,
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
};

console.log('=== 偏移量本身 ===');
const offHZ = buildYearOffsets({ ...base, birthPlace: '杭州' }, 1994, 2081);
const offWLMQ = buildYearOffsets({ ...base, birthPlace: '乌鲁木齐' }, 1994, 2081);
console.log('  杭州样本:', [...offHZ.entries()].slice(0, 6).map(([y, v]) => `${y}:${v.toFixed(1)}`).join('  '));
console.log('  乌市样本:', [...offWLMQ.entries()].slice(0, 6).map(([y, v]) => `${y}:${v.toFixed(1)}`).join('  '));
console.log('  乌鲁木齐有无非零偏移:', [...offWLMQ.values()].some((v) => Math.abs(v) > 0.01));

console.log('\n=== 曲线（含偏移）===');
const lineHZ = buildLifeLine({ ...base, birthPlace: '杭州' }, offHZ);
const lineWLMQ = buildLifeLine({ ...base, birthPlace: '乌鲁木齐' }, offWLMQ);
const lineNone = buildLifeLine({ ...base, birthPlace: '杭州' });

console.log('  杭州（含偏移）前 8 年:', lineHZ.slice(0, 8).map((p) => p.overall).join(', '));
console.log('  乌市（含偏移）前 8 年:', lineWLMQ.slice(0, 8).map((p) => p.overall).join(', '));
console.log('  无偏移          前 8 年:', lineNone.slice(0, 8).map((p) => p.overall).join(', '));

const seq = (l: typeof lineHZ) => JSON.stringify(l.map((p) => p.overall));
console.log('\n  有偏移 vs 无偏移 是否不同:', seq(lineHZ) !== seq(lineNone));
console.log('  杭州 vs 乌市 是否不同:', seq(lineHZ) !== seq(lineWLMQ));

const avg = (l: typeof lineHZ) => l.reduce((s, p) => s + p.overall, 0) / l.length;
console.log('  杭州均值:', avg(lineHZ).toFixed(2), ' 乌市均值:', avg(lineWLMQ).toFixed(2), ' 无偏移均值:', avg(lineNone).toFixed(2));

console.log('\n=== 出生年本身有没有偏移（应无：1 岁那年）===');
console.log('  杭州 1993 年:', offHZ.get(1994) === undefined ? '未计算（正常）' : offHZ.get(1994));
console.log('  曲线年份范围:', lineHZ[0].year, '-', lineHZ[lineHZ.length - 1].year);
console.log('  偏移年份范围:', Math.min(...offHZ.keys()), '-', Math.max(...offHZ.keys()));
