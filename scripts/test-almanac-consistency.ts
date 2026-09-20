/** 检查今日页与设备屏的黄历是否同源（同一产品不能有两个黄历） */
import { buildAlmanacScreen } from '../lib/device-feed.ts';
import { buildDailyReading } from '../lib/daily.ts';
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

console.log('=== 今日页 vs 设备屏：黄历必须同源 ===');
for (const date of ['2026-09-20', '2026-12-25', '2027-02-01']) {
  const dev = buildAlmanacScreen(date);
  const page = buildDailyReading(birth, date);
  const same =
    JSON.stringify(dev.yi) === JSON.stringify(page.yi.slice(0, 3)) &&
    JSON.stringify(dev.ji) === JSON.stringify(page.ji.slice(0, 3)) &&
    dev.chong === page.chong &&
    dev.sha === page.sha;
  console.log(`\n  ${date}`);
  console.log(`    设备屏 宜 ${dev.yi.join(' ')} / 忌 ${dev.ji.join(' ')} / 冲 ${dev.chong} / 煞 ${dev.sha}`);
  console.log(`    今日页 宜 ${page.yi.slice(0, 3).join(' ')} / 忌 ${page.ji.slice(0, 3).join(' ')} / 冲 ${page.chong} / 煞 ${page.sha}`);
  check(`${date} 两处黄历一致`, same);
}

console.log('\n=== 干支格式不能重复（曾经出现「丙午年年 丁酉日日」）===');
const dev = buildAlmanacScreen('2026-09-20');
console.log(`  ${dev.ganzhi}`);
check('没有「年年」', !dev.ganzhi.includes('年年'));
check('没有「日日」', !dev.ganzhi.includes('日日'));
check('格式正确', /^\S+年 \S+日$/.test(dev.ganzhi), dev.ganzhi);

console.log('\n=== 煞必须有值（曾经是「—」）===');
check('煞不是占位符', dev.sha !== '—' && dev.sha.length > 0, dev.sha);
check('煞是方位', ['东', '南', '西', '北'].some((d) => dev.sha.includes(d)), dev.sha);

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
