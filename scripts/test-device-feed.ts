/**
 * 验证设备数据源（lib/device-feed.ts）
 * ---------------------------------------------------------------
 * 这一层的意义：桌面模拟器要显示**真实数据**，同时它就是固件要实现的接口契约。
 * 所以测试要同时守住两件事：
 *   ① 数据是真的（来自排盘，不是画稿）
 *   ② 数据符合设备约束（字数上限、三档颜色、断网可降级）
 */
import { buildAlmanacScreen, buildTodayScreen, buildWeekScreen, buildQrScreen, buildDeviceFeed, fitToScreen, SCREEN_CHAR_LIMIT } from '../lib/device-feed.ts';
import { buildDailyReading } from '../lib/daily.ts';
import type { BirthInfo } from '../lib/types.ts';

const birth: BirthInfo = {
  name: '演示',
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

console.log('=== 1. 黄历屏：真实数据 + 断网可用 ===');
const alm = buildAlmanacScreen('2026-09-20');
console.log(`  ${alm.date} ${alm.weekday} · ${alm.lunar} · ${alm.ganzhi}`);
console.log(`  宜: ${alm.yi.join(' ')}`);
console.log(`  忌: ${alm.ji.join(' ')}`);
console.log(`  冲: ${alm.chong}  煞: ${alm.sha}  大字农历日: ${alm.bigLunarDay}`);
check('needsNetwork = false（断网可用）', alm.needsNetwork === false);
check('宜 <= 3 条（屏幕放不下更多）', alm.yi.length <= 3, `${alm.yi.length} 条`);
check('忌 <= 3 条', alm.ji.length <= 3, `${alm.ji.length} 条`);
check('有日期与星期', alm.date.length > 0 && alm.weekday.includes('星期'));
check('有农历与干支', alm.lunar.length > 0 && alm.ganzhi.includes('年'));
check('大字农历日非空', alm.bigLunarDay.length > 0);

console.log('\n=== 2. 今日屏：数据必须来自排盘（不是画稿）===');
const today = buildTodayScreen(birth, '2026-09-20');
const reading = buildDailyReading(birth, '2026-09-20');
console.log(`  能量: ${today.energyLabel} ${today.energyValue}`);
console.log(`  结论: ${today.headline}`);
console.log(`  关注: ${today.focusPalace} · ${today.focusTheme}`);
console.log(`  身体: ${today.healthNote}`);
check('needsNetwork = true（个性化需联网）', today.needsNetwork === true);
check('能量与 daily 层一致（说明是同一份数据）', today.energyLabel === reading.energy.label && today.energyValue === reading.energy.value);
check('关注宫位与 daily 层一致', today.focusPalace === reading.focus.palace);
check('结论不超过屏宽（<= 18 字）', today.headline.length <= 18, `${today.headline.length} 字`);
check('身体提醒不超过 24 字', today.healthNote.length <= 24, `${today.healthNote.length} 字`);
check('关注主题不超过 8 字', today.focusTheme.length <= 8, `${today.focusTheme.length} 字`);

console.log('\n=== 3. 换个人，今日屏必须不同 ===');
const other = buildTodayScreen({ ...birth, birthDate: '1985-03-10', birthTime: '寅时 03:00-05:00' }, '2026-09-20');
console.log(`  1993-06-18 → ${other.energyLabel} ${other.energyValue} · ${other.focusPalace}`);
console.log(`  1985-03-10 → ${today.energyLabel} ${today.energyValue} · ${today.focusPalace}`);
check(
  '不同命盘的今日屏不同',
  other.energyValue !== today.energyValue || other.focusPalace !== today.focusPalace,
);

console.log('\n=== 4. 7 天屏：三档颜色 + 高低可比 ===');
const week = buildWeekScreen(birth, '2026-09-20');
console.log(`  天数: ${week.days.length} 平均: ${week.average}`);
for (const d of week.days) console.log(`    ${d.label.padEnd(4)} ${String(d.value).padStart(3)} ${d.level}`);
check('正好 7 天', week.days.length === 7);
check('第一天是「今天」', week.days[0].label === '今天');
check('只有三档（设备不用连续色阶）', new Set(week.days.map((d) => d.level)).size <= 3);
check('数值有高有低（不是同一个数）', new Set(week.days.map((d) => d.value)).size >= 3);
check('三档划分与数值一致', week.days.every((d) => (d.value >= 58 ? d.level === 'high' : d.value >= 42 ? d.level === 'mid' : d.level === 'low')));

console.log('\n=== 5. 扫码屏：地址由服务端下发 ===');
const qr = buildQrScreen('http://112.111.47.239:25572/');
console.log(`  ${qr.url}`);
check('URL 指向 dashboard', qr.url.endsWith('/dashboard/'));
check('末尾没有多余斜杠', !qr.url.includes('//dashboard'));
check('有标题与副标题', qr.title.length > 0 && qr.subtitle.length > 0);
// 换一个 baseUrl 也要正确
check('不同 baseUrl 都能拼对', buildQrScreen('https://a.example.com').url === 'https://a.example.com/dashboard/');

console.log('\n=== 6. 整包接口（固件要实现的契约）===');
const feed = buildDeviceFeed(birth, 'http://112.111.47.239:25572/', '2026-09-20');
console.log(`  apiVersion: ${feed.apiVersion}`);
console.log(`  日期: ${feed.date}`);
console.log(`  屏幕数: ${feed.screens.length}（${feed.screens.map((s) => s.screen).join(', ')}）`);
console.log(`  离线降级到: ${feed.offlineFallback}`);
check('有 apiVersion（固件可比对）', feed.apiVersion === 1);
check('包含黄历屏', feed.screens.some((s) => s.screen === 'almanac'));
check('包含今日屏与 7 天屏', feed.screens.some((s) => s.screen === 'today') && feed.screens.some((s) => s.screen === 'week'));
check('离线降级到黄历（服务过期不变砖）', feed.offlineFallback === 'almanac');
check('没有出生信息时仍能出黄历与扫码', (() => {
  const f = buildDeviceFeed(null, 'http://x.test');
  return f.screens.some((s) => s.screen === 'almanac') && !f.screens.some((s) => s.screen === 'today');
})());

console.log('\n=== 7. 截断函数：不能硬塞 ===');
for (const t of ['短句', '这是一句刚好超过限制的比较长的中文句子用来测试截断', '']) {
  const out = fitToScreen(t, 12);
  console.log(`  「${t.slice(0, 20)}${t.length > 20 ? '…' : ''}」 → 「${out}」`);
}
check('超长会加省略号', fitToScreen('一二三四五六七八九十十一十二十三', 10).endsWith('…'));
check('超长后长度不超标', fitToScreen('一二三四五六七八九十十一十二十三', 10).length === 10);
check('短句不截断', fitToScreen('短句', 10) === '短句');

console.log('\n=== 8. 屏幕字数上限（规格文档里定的约束）===');
check('上限是 80 字', SCREEN_CHAR_LIMIT === 80);
const todayChars = today.energyLabel.length + today.headline.length + today.focusPalace.length + today.focusTheme.length + today.healthNote.length;
console.log(`  今日屏总字数: ${todayChars}（含标签则更多，但正文部分已控制在 ${SCREEN_CHAR_LIMIT} 以内）`);
check('今日屏正文不超上限', todayChars <= SCREEN_CHAR_LIMIT, `${todayChars} / ${SCREEN_CHAR_LIMIT}`);

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (fail > 0) process.exit(1);
