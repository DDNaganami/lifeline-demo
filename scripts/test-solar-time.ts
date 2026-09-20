/**
 * 真太阳时校正的验证
 * 每一项都和已知数值/权威来源对照，不是"看起来对"就算过。
 * 用法：node --experimental-strip-types scripts/test-solar-time.ts
 */
import {
  buildTrueSolarTime,
  equationOfTime,
  resolvePlace,
  utcOffsetMinutes,
  isDST,
  timeIndexOf,
} from '../lib/solar-time.ts';

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown, tol = 0) {
  let ok: boolean;
  if (typeof actual === 'number' && typeof expected === 'number') {
    ok = Math.abs(actual - expected) <= tol;
  } else {
    ok = JSON.stringify(actual) === JSON.stringify(expected);
  }
  console.log(`  ${ok ? '✅' : '❌'} ${name}: ${JSON.stringify(actual)}${ok ? '' : ` （期望 ${JSON.stringify(expected)}${tol ? ` ±${tol}` : ''}）`}`);
  if (ok) pass++;
  else fail++;
}

console.log('=== 1. 均时差（对照天文常识值）===');
// 已知：2 月中旬约 −14 分钟（最小）；11 月初约 +16 分钟（最大）；
// 4 月中旬、6 月中旬、9 月初、12 月下旬接近 0
check('2月11日 应约 -14.2 分', equationOfTime(new Date(2026, 1, 11)), -14.2, 1.0);
check('5月14日 应约 +3.7 分', equationOfTime(new Date(2026, 4, 14)), 3.7, 1.0);
check('7月26日 应约 -6.5 分', equationOfTime(new Date(2026, 6, 26)), -6.5, 1.0);
check('11月3日 应约 +16.4 分', equationOfTime(new Date(2026, 10, 3)), 16.4, 1.0);
check('4月15日 应约 0 分', equationOfTime(new Date(2026, 3, 15)), 0, 1.5);

console.log('\n=== 2. 时区偏移（对照中国夏令时权威起止）===');
// 来自 IANA 时区数据库：中国 1986-1991 年实行夏令时
check('1986-07-01 中国应为 +9 小时（夏令时）', utcOffsetMinutes(new Date(Date.UTC(1986, 6, 1, 4)), 'Asia/Shanghai') / 60, 9);
check('1986-01-15 中国应为 +8 小时', utcOffsetMinutes(new Date(Date.UTC(1986, 0, 15, 4)), 'Asia/Shanghai') / 60, 8);
check('1985-07-01 中国应为 +8（未实行）', utcOffsetMinutes(new Date(Date.UTC(1985, 6, 1, 4)), 'Asia/Shanghai') / 60, 8);
check('1992-07-01 中国应为 +8（已废止）', utcOffsetMinutes(new Date(Date.UTC(1992, 6, 1, 4)), 'Asia/Shanghai') / 60, 8);
check('2026-07-01 中国应为 +8', utcOffsetMinutes(new Date(Date.UTC(2026, 6, 1, 4)), 'Asia/Shanghai') / 60, 8);
// 海外夏令时（证明不是只对中国写死）
check('2026-07-01 纽约应为 -4（夏令时）', utcOffsetMinutes(new Date(Date.UTC(2026, 6, 1, 16)), 'America/New_York') / 60, -4);
check('2026-01-15 纽约应为 -5', utcOffsetMinutes(new Date(Date.UTC(2026, 0, 15, 16)), 'America/New_York') / 60, -5);
check('2026-01-15 伦敦应为 0', utcOffsetMinutes(new Date(Date.UTC(2026, 0, 15, 12)), 'Europe/London') / 60, 0);
check('2026-07-01 伦敦应为 +1（夏令时）', utcOffsetMinutes(new Date(Date.UTC(2026, 6, 1, 12)), 'Europe/London') / 60, 1);

console.log('\n=== 3. 夏令时判定 ===');
check('1988-07-01 中国 在夏令时内', isDST(new Date(Date.UTC(1988, 6, 1, 4)), 'Asia/Shanghai'), true);
check('1988-01-15 中国 不在夏令时内', isDST(new Date(Date.UTC(1988, 0, 15, 4)), 'Asia/Shanghai'), false);

console.log('\n=== 4. 地点解析 ===');
check('"浙江杭州" → 杭州', resolvePlace('浙江杭州').matched, '杭州');
check('"Hangzhou" 大小写 → 匹配', resolvePlace('hangzhou').matched !== null, true);
check('"乌鲁木齐" → 经度 87.62', resolvePlace('乌鲁木齐').longitude, 87.62);
check('"纽约" → 时区 America/New_York', resolvePlace('纽约').timezone, 'America/New_York');
check('无法识别 → 标记 approximate', resolvePlace('某个不存在的地方').approximate, true);

console.log('\n=== 5. 时辰序号（iztro 口径：23 点为晚子时）===');
check('0:30 → 0（早子时）', timeIndexOf(0, 30), 0);
check('1:30 → 1（丑时）', timeIndexOf(1, 30), 1);
check('11:30 → 6（午时）', timeIndexOf(11, 30), 6);
check('12:30 → 6（午时）', timeIndexOf(12, 30), 6);
check('22:30 → 11（亥时）', timeIndexOf(22, 30), 11);
check('23:30 → 12（晚子时）', timeIndexOf(23, 30), 12);

console.log('\n=== 6. 真太阳时修正量（核心：经度差 + 均时差）===');
const base = {
  name: '测试',
  gender: '男' as const,
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
};

// 杭州 120.15°E，标准经线 120° → 经度差约 +0.6 分钟；6 月均时差约 -0.5 分
const hz = buildTrueSolarTime({ ...base, birthPlace: '浙江杭州' });
console.log(`  杭州：${hz.localTime} → 真太阳时 ${hz.trueSolarTime}（修正 ${hz.totalOffsetMinutes} 分 = 经度 ${hz.longitudeOffsetMinutes} + 均时差 ${hz.equationOfTimeMinutes}）`);
check('杭州经度修正应接近 0（东经 120 附近）', Math.abs(hz.longitudeOffsetMinutes) < 2, true);

// 乌鲁木齐 87.62°E：与标准经线差 -32.38° → -129.5 分钟（提前 2 小时以上）
const wlmq = buildTrueSolarTime({ ...base, birthPlace: '乌鲁木齐' });
console.log(`  乌鲁木齐：${wlmq.localTime} → 真太阳时 ${wlmq.trueSolarTime}（修正 ${wlmq.totalOffsetMinutes} 分）`);
check('乌鲁木齐经度修正应约 -129.5 分', wlmq.longitudeOffsetMinutes, -129.5, 0.5);
check('乌鲁木齐 12:00 → 真太阳时应在 10 点前', Number(wlmq.trueSolarTime.slice(0, 2)) < 10, true);

// 北京 116.41°E → 约 -14.4 分
const bj = buildTrueSolarTime({ ...base, birthPlace: '北京' });
check('北京经度修正应约 -14.4 分', bj.longitudeOffsetMinutes, -14.4, 0.3);

console.log('\n=== 7. 时辰是否被改变（最关键的业务影响）===');
// 乌鲁木齐的经度差 -129 分钟 ≈ 2 小时 10 分，足以跨 1-2 个时辰
check('乌鲁木齐 午时(12:00) 修正后应跨时辰', wlmq.crossedBoundary, true);
check('乌鲁木齐修正后时辰应为巳时', wlmq.timeName, '巳时');
check('杭州 午时 修正后应仍是午时', hz.timeName, '午时');

// 边界测试：正好在时辰分界上
const boundary = buildTrueSolarTime({
  ...base,
  birthTime: '午时 13:00-15:00', // 取中点 14:00，乌鲁木齐修正后约 11:50 → 午时
  birthPlace: '乌鲁木齐',
});
console.log(`  乌鲁木齐 14:00 → 真太阳时 ${boundary.trueSolarTime} → ${boundary.timeName}（跨边界=${boundary.crossedBoundary}）`);
check('乌鲁木齐 14:00 修正后应跨到午时', boundary.timeName, '午时');

console.log('\n=== 8. 夏令时对真太阳时的影响 ===');
// 1988 年 7 月（夏令时期间）出生，钟表时间比标准时快 1 小时
const dst1998 = buildTrueSolarTime({
  ...base,
  birthDate: '1988-07-01',
  birthPlace: '上海',
});
console.log(`  1988-07-01 上海：本地 ${dst1998.localTime}（夏令时=${dst1998.dstApplied}，UTC 偏移 ${dst1998.utcOffsetMinutes / 60}h）→ 真太阳时 ${dst1998.trueSolarTime}`);
check('1988-07-01 上海应识别为夏令时', dst1998.dstApplied, true);
check('1988-07-01 上海 UTC 偏移应为 +9', dst1998.utcOffsetMinutes / 60, 9);
check('上海经度修正应约 +5.9 分', dst1998.longitudeOffsetMinutes, 5.9, 0.3);

console.log('\n=== 9. 确定性（同一输入两次结果必须一致）===');
const a = buildTrueSolarTime({ ...base, birthPlace: '乌鲁木齐' });
const b = buildTrueSolarTime({ ...base, birthPlace: '乌鲁木齐' });
check('两次结果一致', JSON.stringify(a) === JSON.stringify(b), true);

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
