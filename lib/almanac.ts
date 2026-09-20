/**
 * 黄历与「今日」内容 —— 屏幕模拟器专用的模拟数据
 * ---------------------------------------------------------------
 * 这个文件将来会被真实实现替换掉，替换点是 `buildAlmanac(date)`：
 *
 *   真实实现建议：用 `lunar-typescript`（无第三方依赖）在本地算，
 *   它自带「农历 / 干支 / 节气 / 彭祖百忌 / 每日宜忌 / 吉神方位 / 冲煞 / 星宿 / 建除十二神」等，
 *   也就是说黄历这一层不需要联网、不需要服务器。
 *
 *   本例只模拟「我们要显示的那 8 项」——不是完整黄历（完整的有 30 多项，480×480 放不下）。
 *
 * 屏幕约束（重要）：
 *   一屏 480×480，单屏不超过 80 字、不超过 7 行。内容超出就必须拆屏或砍掉。
 */

/** 某一天的黄历信息（只保留屏幕上真正要显示的部分） */
export interface Almanac {
  /** 公历 */
  solarDate: string; // '9月18日'
  weekday: string; // '星期五'
  /** 农历日，例如 '初七' */
  lunarDay: string;
  /** 农历月，例如 '七月'（用于小字） */
  lunarMonth: string;
  /** 年干支，例如 '乙巳年' */
  yearGanZhi: string;
  /** 日干支，例如 '甲午日' */
  dayGanZhi: string;
  /** 月干支（真实现由节气换月决定） */
  monthGanZhi: string;
  /** 当前节气与第几天，例如 '白露 · 第 12 天' */
  solarTerm: string;
  /** 宜，最多 3 条 */
  good: string[];
  /** 忌，最多 3 条 */
  bad: string[];
  /** 吉神方位 */
  directions: { label: string; value: string }[];
  /** 冲煞，一行 */
  clash: string;
}

/* ------------------------- 模拟词库 ------------------------- */

const GOOD_POOL = [
  ['祭祀', '会友', '出行'],
  ['祈福', '纳财', '签约'],
  ['嫁娶', '开市', '交易'],
  ['出行', '扫舍', '立券'],
  ['祭祀', '沐浴', '整手足甲'],
  ['会友', '纳畜', '安床'],
  ['祈福', '出行', '求医'],
  ['开市', '交易', '立券'],
];

const BAD_POOL = [
  ['动土', '开仓'],
  ['嫁娶', '安葬'],
  ['破土', '伐木'],
  ['词讼', '远行'],
  ['开市', '动土'],
  ['安葬', '破土'],
  ['嫁娶', '动土'],
  ['词讼', '开仓'],
];

const LUNAR_DAYS = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

const LUNAR_MONTHS = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];

const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

/** 节气表（真实现按天文算法，这里只取近似日期用于演示） */
const SOLAR_TERMS: [number, number, string][] = [
  [1, 5, '小寒'], [1, 20, '大寒'], [2, 4, '立春'], [2, 19, '雨水'],
  [3, 6, '惊蛰'], [3, 21, '春分'], [4, 5, '清明'], [4, 20, '谷雨'],
  [5, 6, '立夏'], [5, 21, '小满'], [6, 6, '芒种'], [6, 21, '夏至'],
  [7, 7, '小暑'], [7, 23, '大暑'], [8, 8, '立秋'], [8, 23, '处暑'],
  [9, 8, '白露'], [9, 23, '秋分'], [10, 8, '寒露'], [10, 24, '霜降'],
  [11, 7, '立冬'], [11, 22, '小雪'], [12, 7, '大雪'], [12, 22, '冬至'],
];

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** 稳定伪随机：同一天永远得到同一份内容 */
function seedOf(date: Date): number {
  return Math.floor(date.getTime() / 86400000);
}

/**
 * 日干支 —— 这一项用的是**正确算法**，不是模拟。
 * 干支日以 2000-01-01 = 戊午日 为锚点，按连续天数推算（60 天一循环）。
 * 也就是说：屏幕上显示的日干支从第一天起就是真的，将来接真库也不用改。
 */
const GANZHI_REF = Date.UTC(2000, 0, 1); // 戊午日
const REF_STEM = 4; // 戊
const REF_BRANCH = 6; // 午

function dayGanZhi(date: Date): { stem: string; branch: string } {
  const days = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - GANZHI_REF) / 86400000,
  );
  return {
    stem: HEAVENLY_STEMS[(((REF_STEM + days) % 10) + 10) % 10],
    branch: EARTHLY_BRANCHES[(((REF_BRANCH + days) % 12) + 12) % 12],
  };
}

const DIRECTIONS = ['正东', '东南', '正南', '西南', '正西', '西北', '正北', '东北'];

/** 生成某一天的黄历（当前为模拟实现，将来整体替换） */
export function buildAlmanac(date: Date): Almanac {
  const seed = seedOf(date);
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // 干支：日干支用正确算法；年、月干支为演示近似（真实现由节气换月决定）
  const dayGz = dayGanZhi(date);
  const dayStem = dayGz.stem;
  const dayBranch = dayGz.branch;
  const yearStem = HEAVENLY_STEMS[((Math.floor((date.getFullYear() - 4) % 60) % 10) + 10) % 10];
  const yearBranch = EARTHLY_BRANCHES[((date.getFullYear() - 4) % 12 + 12) % 12];
  const monthStem = HEAVENLY_STEMS[((month + 1) % 10 + 10) % 10];
  const monthBranch = EARTHLY_BRANCHES[((month + 1) % 12 + 12) % 12];

  // 节气：找最近一个已过的节气，算第几天
  let termName = SOLAR_TERMS[0][2];
  let termDay = 1;
  let bestDiff = Infinity;
  for (const [m, d, name] of SOLAR_TERMS) {
    const termDate = new Date(date.getFullYear(), m - 1, d);
    const diff = Math.floor((date.getTime() - termDate.getTime()) / 86400000);
    if (diff >= 0 && diff < bestDiff) {
      bestDiff = diff;
      termName = name;
      termDay = diff + 1;
    }
  }

  const good = GOOD_POOL[seed % GOOD_POOL.length].slice(0, 3);
  const bad = BAD_POOL[seed % BAD_POOL.length].slice(0, 3);

  return {
    solarDate: `${month}月${day}日`,
    weekday: WEEKDAYS[date.getDay()],
    lunarDay: LUNAR_DAYS[(seed + 6) % 30],
    // 演示用：农历月取公历月附近。真实实现由 lunar-typescript 给出（含闰月）。
    lunarMonth: LUNAR_MONTHS[(month + 10) % 12],
    yearGanZhi: `${yearStem}${yearBranch}年`,
    monthGanZhi: `${monthStem}${monthBranch}月`,
    dayGanZhi: `${dayStem}${dayBranch}日`,
    solarTerm: `${termName} · 第 ${termDay} 天`,
    good,
    bad,
    directions: [
      { label: '喜神', value: DIRECTIONS[seed % 8] },
      { label: '财神', value: DIRECTIONS[(seed + 3) % 8] },
    ],
    // 冲煞：与日支对冲的生肖（地支相隔六位）
    clash: `冲${ZODIAC[(EARTHLY_BRANCHES.indexOf(dayBranch) + 6) % 12]}`,
  };
}

/* ------------------------- 今日内容（模拟） ------------------------- */

export interface DailyContent {
  /** 今日能量：一个词 */
  energyWord: string;
  /** 今日能量：一句话（14 字以内最好） */
  energyLine: string;
  /** 身体提醒 */
  bodyReminder: string;
  /** 有利方位 */
  favorableDirection: string;
  /** 幸运色 */
  luckyColor: string;
  /** 未来 7 天：能量档位（0-100） */
  week: { label: string; value: number; word: string }[];
  weekLine: string;
  /** 今日五行属性（长文，原型里的那段专业文字） */
  elementText: string;
}

const ENERGY_POOL: { word: string; line: string }[] = [
  { word: '平', line: '适合安静推进，不适合大动作。' },
  { word: '稳', line: '按计划走就好，不用抢时间。' },
  { word: '旺', line: '今天是开口说话的好日子。' },
  { word: '缓', line: '慢一点，事情反而更顺。' },
  { word: '收', line: '适合收尾，不适合开新事。' },
  { word: '进', line: '可以主动一点，机会在动。' },
];

const ELEMENT_TEXTS = [
  '今天是甲午日，天干甲木为你的喜神，能生助你偏弱的癸水日主，带来一点温和的支持感；但地支午火为忌，暗藏消耗。整体能量像清晨微雨后的阳光——有助力却不强，环境略显躁动，你容易感到思绪活跃但体力跟不上，适合轻推事情，不宜硬攻。',
  '今天是乙未日，乙木透出而地支未土偏燥，你的日主得一点帮扶但不厚。今天的节奏适合「先处理关系，再处理事情」——把该说的话说清楚，比埋头做事更有效。',
  '今天是丙申日，丙火当令而金气渐起，对你偏弱的日主来说是一次消耗。今天容易高估自己的精力，建议把重要决定往后放一天，今天只做整理类的事。',
];

const WEEK_WORDS = ['良', '良', '旺', '平', '低', '低', '平'];
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const WEEK_VALUES = [72, 78, 85, 68, 55, 45, 60];

export function buildDailyContent(date: Date): DailyContent {
  const seed = seedOf(date);
  const energy = ENERGY_POOL[seed % ENERGY_POOL.length];

  // 未来 7 天：按日期轮转，保证每天看都略有变化
  const week = WEEK_LABELS.map((label, i) => {
    const idx = (seed + i) % 7;
    return { label, value: WEEK_VALUES[idx], word: WEEK_WORDS[idx] };
  });
  const best = week.reduce((a, b) => (b.value > a.value ? b : a));
  const worst = week.reduce((a, b) => (b.value < a.value ? b : a));

  return {
    energyWord: energy.word,
    energyLine: energy.line,
    bodyReminder: '下午晚些时候能量容易走低。如果可以，3–4 点左右停下来休息十分钟。',
    favorableDirection: '东北 — 适合对话、计划、和安静的决定。',
    luckyColor: '深蓝',
    week,
    weekLine: `周${best.label}最旺，周${worst.label}留力。`,
    elementText: ELEMENT_TEXTS[seed % ELEMENT_TEXTS.length],
  };
}
