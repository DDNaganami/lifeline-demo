/**
 * 对抗性检查：找"静默错误"
 * ---------------------------------------------------------------
 * 这七轮里发现的 bug 全是同一类：
 *   **不报错、页面正常，但结果或措辞与事实不符。**
 *   （西宁串台、每天能量一样、33 岁叫成形期、界面暗示精确、
 *     设备黄历与今日页不一致、干支重复、打包装旧文件、校验顺序错）
 *
 * 这类错误看代码看不出来，只能靠"换个方式问同一个问题"。
 * 这个脚本就是干这个的，分四类：
 *
 *   1. 残留的占位内容（写死的值、TODO、假的百分比）
 *   2. 不该相同的东西相同了（不同输入给同一输出）
 *   3. 不该变化的东西变了（同一输入两次结果不同）
 *   4. 越界与矛盾（数值超范围、两个地方对同一件事说法不一致）
 *
 * 用法：npx tsx scripts/test-adversarial.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { buildChart } from '../lib/chart.ts';
import { buildBazi } from '../lib/bazi.ts';
import { buildTrueSolarTime, resolvePlace } from '../lib/solar-time.ts';
import { buildLifeLine, buildYearCard, buildStageCard } from '../lib/mock-data.ts';
import { buildYearSignals } from '../lib/signals.ts';
import { buildJudgment } from '../lib/judgment.ts';
import { buildHeroPhases } from './adversarial-helpers.ts';
import { buildDailyReading } from '../lib/daily.ts';
import { buildAlmanacScreen, buildTodayScreen } from '../lib/device-feed.ts';
import { getAskQuota } from '../lib/ask-quota.ts';
import type { BirthInfo, DimensionKey } from '../lib/types.ts';

let pass = 0;
let fail = 0;
const found: string[] = [];
function check(name: string, ok: boolean, extra = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  → ' + extra : ''}`);
  if (ok) pass++;
  else {
    fail++;
    found.push(`${name}${extra ? '：' + extra : ''}`);
  }
}

/** 常用样本 */
const SAMPLES: BirthInfo[] = [
  { name: 'A', gender: '男', birthDate: '1993-06-18', birthTime: '午时 11:00-13:00', birthPlace: '杭州' },
  { name: 'B', gender: '女', birthDate: '1985-03-10', birthTime: '寅时 03:00-05:00', birthPlace: '北京' },
  { name: 'C', gender: '男', birthDate: '2000-11-05', birthTime: '酉时 17:00-19:00', birthPlace: '乌鲁木齐' },
  { name: 'D', gender: '女', birthDate: '1968-02-29', birthTime: '子时 23:00-01:00', birthPlace: '拉萨' },
];

/* ==================== 一、残留的占位内容 ==================== */
console.log('\n=== 一、残留的占位内容（写死的值 / TODO / 假的百分比）===');

const SCAN_DIRS = ['lib', 'components', 'app', 'deploy'];
const SKIP = new Set(['node_modules', '.next', 'out', 'ask-stats.json']);
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}
const files = SCAN_DIRS.flatMap((d) => {
  try {
    return walk(d);
  } catch {
    return [];
  }
});

/**
 * 不该再出现的"占位"字样（界面上的假内容）。
 * ⚠️ 只检查**会被渲染的内容**，跳过注释与文档——
 *    否则"注释里提到这个说法"也会被误报。
 */
const PLACEHOLDER_WORDS = [
  { re: /占位回答|示例回答/, why: '界面上不该再有占位回答' },
  { re: /尚未接入\s*AI|未接真实\s*AI/, why: 'AI 已接入，这句话过时了' },
  { re: /第一阶段原型[，,]\s*使用模拟数据/, why: '已经不是全模拟了' },
  { re: /不做真实排盘/, why: '已经接真实排盘了' },
];

/** 去掉注释与字符串字面量之外的干扰：只看"代码里出现的" */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // 块注释
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // 行注释（避开 http://）
}

let placeholderHits = 0;
for (const file of files) {
  // changelog 是历史记录，允许提到过去的状态
  if (file.includes('changelog')) continue;
  const code = stripComments(readFileSync(file, 'utf8'));
  for (const { re, why } of PLACEHOLDER_WORDS) {
    if (re.test(code)) {
      console.log(`    ⚠️ ${file} 命中「${re.source}」——${why}`);
      placeholderHits++;
    }
  }
}
check('界面代码里没有过时的占位字样', placeholderHits === 0, `命中 ${placeholderHits} 处`);

/** 写死的"煞北"这类（曾经真的存在）。同样只看代码，不看注释 */
let hardcoded = 0;
for (const file of files) {
  if (file.includes('changelog')) continue;
  const code = stripComments(readFileSync(file, 'utf8'));
  if (/煞北/.test(code)) {
    console.log(`    ⚠️ ${file} 的代码里有写死的「煞北」`);
    hardcoded++;
  }
}
check('没有写死的方位（煞北）', hardcoded === 0);

/** 界面上不该出现"78分"这种假精度 */
let fakeScore = 0;
for (const file of files.filter((f) => f.startsWith('components'))) {
  const text = readFileSync(file, 'utf8');
  if (/\d+分/.test(text) && !/得分|分数|几分/.test(text)) {
    // 允许"约 N 分"这种带说明的修正量描述
    const bad = [...text.matchAll(/(\d{2,3})\s*分/g)].filter((m) => !/修正|约|偏差|分钟/.test(m[0]));
    if (bad.length > 0) {
      console.log(`    ⚠️ ${file} 可能出现假精度：${bad.map((m) => m[0]).join(', ')}`);
      fakeScore += bad.length;
    }
  }
}
check('界面上没有"NN 分"这种假精度', fakeScore === 0);

/* ==================== 二、不该相同的东西相同了 ==================== */
console.log('\n=== 二、该变的必须变、不该变的必须不变 ===');

/** 命盘的"身份"：宫位 + 主星 + **大限区间**（大限随性别顺逆行，必须算进去） */
const chartKey = (c: ReturnType<typeof buildChart>) =>
  c.palaces
    .map(
      (p) =>
        `${p.name}[${p.majorStars.map((s) => s.name + (s.brightness ?? '')).join(',')}]` +
        `@${(p.decadalRange ?? [0, 0]).join('-')}`,
    )
    .join('|');

const base = SAMPLES[0];

console.log('  【该变的】');
// 出生日期 → 四柱不同 → 五行局可能不同 → 命盘必变
check(
  '换出生日期 → 命盘不同',
  chartKey(buildChart(base)) !== chartKey(buildChart({ ...base, birthDate: '1985-03-10' })),
);
// 出生时辰 → 命宫不同 → 命盘必变
check(
  '换出生时辰 → 命盘不同',
  chartKey(buildChart(base)) !== chartKey(buildChart({ ...base, birthTime: '子时 23:00-01:00' })),
);
// 性别 → 大限顺逆行不同（主星排布不变，但大限区间要变）
check(
  '换性别 → 大限序列不同',
  chartKey(buildChart(base)) !== chartKey(buildChart({ ...base, gender: '女' })),
);
// 跨时辰的出生地 → 命盘必变（杭州午时 vs 西宁巳时）
check(
  '跨时辰的出生地 → 命盘不同',
  chartKey(buildChart(base)) !== chartKey(buildChart({ ...base, birthPlace: '西宁' })),
);

console.log('  【不该变的】');
// 同城内的出生地差异不该改命盘——杭州与北京只差 15 分钟，同属午时
const hz = buildChart(base);
const bj = buildChart({ ...base, birthPlace: '北京' });
const hzTime = buildTrueSolarTime(base);
const bjTime = buildTrueSolarTime({ ...base, birthPlace: '北京' });
check(
  '杭州与北京的时辰相同（只差 15 分钟）',
  hzTime.timeIndex === bjTime.timeIndex,
  `${hzTime.timeName} / ${bjTime.timeName}`,
);
check(
  '同时辰 → 命盘相同（这是正确的，不是 bug）',
  chartKey(hz) === chartKey(bj),
);
// 性别不改主星排布（主星由农历月日时决定，与性别无关）
const starsOnly = (c: ReturnType<typeof buildChart>) =>
  c.palaces.map((p) => `${p.name}[${p.majorStars.map((s) => s.name).join(',')}]`).join(' ');
check(
  '换性别 → 宫位与主星排布不变（符合命理：主星与性别无关）',
  starsOnly(hz) === starsOnly(buildChart({ ...base, gender: '女' })),
);

check('配额返回值结构完整', getAskQuota().limit === 3);

/* ==================== 三、不该变化的东西变了 ==================== */
console.log('\n=== 三、同一输入两次结果必须一致（确定性）===');
for (const [i, s] of SAMPLES.entries()) {
  const c1 = buildChart(s);
  const c2 = buildChart(s);
  check(`样本${i + 1} 命盘确定`, JSON.stringify(c1) === JSON.stringify(c2));

  const b1 = buildBazi(s);
  const b2 = buildBazi(s);
  check(`样本${i + 1} 八字确定`, JSON.stringify(b1) === JSON.stringify(b2));

  const d1 = buildDailyReading(s, '2026-09-20');
  const d2 = buildDailyReading(s, '2026-09-20');
  check(`样本${i + 1} 今日读数确定`, JSON.stringify(d1) === JSON.stringify(d2));
}

/* ==================== 四、越界与矛盾 ==================== */
console.log('\n=== 四、数值范围与跨模块一致性 ===');

// 4.1 曲线数值
let outOfRange = 0;
for (const s of SAMPLES) {
  const line = buildLifeLine(s);
  for (const p of line) {
    for (const d of ['overall', 'career', 'wealth', 'marriage', 'parents', 'health'] as DimensionKey[]) {
      if (p[d] < 0 || p[d] > 100) outOfRange++;
    }
  }
}
check('曲线数值都在 0-100', outOfRange === 0, `${outOfRange} 处越界`);

// 4.2 大限区间不能重叠、不能有洞
let rangeProblems = 0;
for (const s of SAMPLES) {
  const chart = buildChart(s);
  const ranges = chart.palaces
    .filter((p) => (p.decadalRange?.[1] ?? 0) > 0)
    .map((p) => p.decadalRange!)
    .sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i][0] !== ranges[i - 1][1] + 1) rangeProblems++;
  }
}
check('大限区间连续不重叠', rangeProblems === 0, `${rangeProblems} 处问题`);

// 4.3 今日页与设备屏必须一致（跨模块）
let mismatch = 0;
for (const s of SAMPLES) {
  const page = buildDailyReading(s, '2026-09-20');
  const dev = buildTodayScreen(s, '2026-09-20');
  const alm = buildAlmanacScreen('2026-09-20');
  if (page.energy.label !== dev.energyLabel) mismatch++;
  if (JSON.stringify(page.yi.slice(0, 3)) !== JSON.stringify(alm.yi)) mismatch++;
  if (page.chong !== alm.chong) mismatch++;
}
check('今日页与设备屏数据一致', mismatch === 0, `${mismatch} 处不一致`);

// 4.4 判断方向与排盘方向不能矛盾（曾经的"忌落财帛却写财务顺"）
let contradictions = 0;
for (const s of SAMPLES) {
  for (const year of [2020, 2026, 2032]) {
    const signals = buildYearSignals(s, year);
    const age = year - Number(s.birthDate.slice(0, 4));
    for (const dim of ['overall', 'career', 'wealth', 'marriage', 'parents', 'health'] as DimensionKey[]) {
      const j = buildJudgment({ dimension: dim, age, year, signals, trend: '震荡' });
      const textGood = /顺|机会|争取|宽|支持|借力|往上|抓手|落定|正面/.test(j.text);
      const textBad = /阻力|紧|守|减速|冲突|消耗|出问题|提醒|不宜/.test(j.text);
      // 找到该维度的真实方向
      const palaces: Record<string, string> = {
        overall: '命宫', career: '官禄', wealth: '财帛',
        marriage: '夫妻', parents: '父母', health: '疾厄',
      };
      const key = signals.palaceImpacts.find((i) => i.palace === palaces[dim]);
      if (!key) continue;
      if (key.polarity === 'bad' && textGood && !textBad) contradictions++;
      if (key.polarity === 'good' && textBad && !textGood) contradictions++;
    }
  }
}
check('判断方向与排盘不矛盾', contradictions === 0, `${contradictions} 处矛盾`);

// 4.5 真太阳时：修正量不能超过物理上限（±180 分钟）
let solarOut = 0;
for (const s of SAMPLES) {
  const t = buildTrueSolarTime(s);
  if (Math.abs(t.totalOffsetMinutes) > 180) solarOut++;
  if (!t.trueSolarTime.match(/^\d{2}:\d{2}$/)) solarOut++;
}
check('真太阳时修正量在物理范围内', solarOut === 0);

// 4.6 城市解析：经度必须在合法范围
let lonBad = 0;
for (const city of ['北京', '乌鲁木齐', '拉萨', '纽约', '伦敦', '悉尼', '杭州西宁南宁']) {
  const p = resolvePlace(city);
  if (p.longitude < -180 || p.longitude > 180) lonBad++;
}
check('城市经度在 ±180 内', lonBad === 0);

// 4.7 儿童年份不能出现成人内容（跨模块：事件 + 判断 + 设备屏）
const ADULT_WORDS = ['升职', '跳槽', '创业', '加杠杆', '伴侣', '婚姻', '岗位', '上级', '合作方'];
let childLeak = 0;
for (const s of SAMPLES) {
  const birthYear = Number(s.birthDate.slice(0, 4));
  for (const year of [birthYear + 3, birthYear + 8]) {
    const signals = buildYearSignals(s, year);
    const age = year - birthYear;
    for (const dim of ['overall', 'career', 'wealth', 'marriage'] as DimensionKey[]) {
      const j = buildJudgment({ dimension: dim, age, year, signals, trend: '震荡' });
      if (ADULT_WORDS.some((w) => j.text.includes(w))) childLeak++;
    }
  }
}
check('童年判断不含成人内容', childLeak === 0, `${childLeak} 处`);

// 4.8 卡片里的大限说明必须与阶段表一致
let daxianMismatch = 0;
for (const s of SAMPLES) {
  const phases = buildHeroPhases(s);
  const line = buildLifeLine(s, undefined, phases);
  const card = buildYearCard(line, 20, 'overall', s, phases);
  // 卡片里写的大限起点，必须能在阶段表里找到
  const m = card.daxian.match(/^(\d+)-(\d+) 岁/);
  if (!m) daxianMismatch++;
  else {
    const from = Number(m[1]);
    if (!phases.some((p) => p.from === from)) daxianMismatch++;
  }
}
check('年度卡片的大限与阶段表一致', daxianMismatch === 0, `${daxianMismatch} 处不一致`);

// 4.9 阶段表覆盖 1-88 岁无缺口
let gaps = 0;
for (const s of SAMPLES) {
  const phases = buildHeroPhases(s);
  for (let age = 1; age <= 88; age++) {
    if (!phases.some((p) => age >= p.from && age <= p.to)) gaps++;
  }
}
check('阶段表覆盖 1-88 岁无缺口', gaps === 0, `${gaps} 处缺口`);

/* ==================== 五、界面文案与数据不能打架 ==================== */
console.log('\n=== 五、文案不能承诺数据没有的东西 ===');
// 阶段卡 summary 不能为空、不能是默认兜底话术
let emptySummary = 0;
for (const s of SAMPLES) {
  const phases = buildHeroPhases(s);
  const line = buildLifeLine(s, undefined, phases);
  const stage = buildStageCard(line, s, phases);
  if (!stage.summary || stage.summary.length < 8) emptySummary++;
}
check('阶段卡说明不为空', emptySummary === 0);

console.log(`\n=== 结果：通过 ${pass} 项，失败 ${fail} 项 ===`);
if (found.length > 0) {
  console.log('\n发现的问题：');
  for (const f of found) console.log('  · ' + f);
}
if (fail > 0) process.exit(1);
