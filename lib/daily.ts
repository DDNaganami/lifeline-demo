/**
 * 今日（流日）—— 由真实排盘生成
 * ---------------------------------------------------------------
 * 首页和年度曲线回答的是"这一年/这一生"，「今日」回答的是"今天"。
 * 这一层也必须是算出来的，不能是随机数——否则用户每天打开看到的东西
 * 和命盘无关，产品逻辑就塌了。
 *
 * 数据来源：
 *   流日四化（iztro 的 horoscope().daily）——最重要的当日依据
 *   流月四化（权重次之，定这个月的基调）
 *   流年四化（权重最低，是背景）
 *   当前大限宫主星的庙旺（十年尺度的底色）
 *   农历宜忌（lunar-typescript，本地可算，不需要网络）
 *
 * 输出：0-100 的能量值 + 一句人话结论 + 今日注意 + 未来 7 天
 */

import { astro } from 'iztro';
import { Solar } from 'lunar-typescript';
import type { BirthInfo } from './types';
import { buildChart, PALACE_ORDER } from './chart';
import { buildTrueSolarTime } from './solar-time';

/** 四化顺序：iztro 的 mutagen 数组固定是 [禄, 权, 科, 忌] */
const MUTAGEN_ORDER = ['禄', '权', '科', '忌'] as const;

/** 四化权重：禄权科为吉、忌为凶 */
const MUTAGEN_SCORE: Record<string, number> = { 禄: 1.0, 权: 0.7, 科: 0.5, 忌: -1.2 };

export interface DailyEnergy {
  label: string;
  /** 0-100 */
  value: number;
}

export interface DailyForecast {
  date: string;
  /** YYYY-MM-DD 里的星期几（0=周日） */
  weekday: number;
  dayGanZhi: string;
  value: number;
  label: string;
  isToday: boolean;
}

export interface DailyReading {
  date: string;
  /** 2026 年 9 月 20 日 星期日 */
  dateText: string;
  gregorian: string;
  /** 二〇二六年八月初十 */
  lunarText: string;
  /** 丙午年 · 丁酉月 · 丁酉日 */
  ganzhiText: string;
  /** 今日能量 */
  energy: DailyEnergy;
  /** 一句人话结论 */
  headline: string;
  /** 2-3 句解释 */
  detail: string[];
  /** 今日落在哪个宫 / 哪些四化 */
  focus: {
    palace: string;
    palaceTheme: string;
    mutagens: { star: string; mutagen: string; palace: string }[];
  };
  /** 今日提醒（来自疾厄宫方向） */
  healthNote: string;
  /** 吉神方位 */
  directions: { xi: string; cai: string; fu: string };
  /** 农历宜 / 忌 */
  yi: string[];
  ji: string[];
  /** 冲煞 */
  chong: string;
  sha: string;
  /** 未来 7 天（含今天） */
  week: DailyForecast[];
  /** 本周平均 */
  weekAverage: number;
}

/* ------------------------- 能量分级 ------------------------- */

function energyOf(value: number): DailyEnergy {
  if (value >= 72) return { label: '高峰', value };
  if (value >= 58) return { label: '顺畅', value };
  if (value >= 42) return { label: '平稳', value };
  if (value >= 28) return { label: '偏弱', value };
  return { label: '低谷', value };
}

/* ------------------------- 单日计算 ------------------------- */

/**
 * 算某一天的**原始分值**。
 *
 * ⚠️ 这里踩过一个坑，值得记下来：
 *   最初我把「四化本身的吉凶加权和」当作能量来源，结果发现
 *   **每天算出来都是同一个数**——因为四化永远是「一禄一权一科一忌」，
 *   加权和恒等于 1.0，完全不携带信息。
 *
 *   真正每天在变的是**流日命宫落在哪个宫**（12 天一个循环），
 *   以及**流日四化是否落到这个宫**。
 *   所以分值必须由「当事宫本身」和「四化对该宫的作用」决定。
 */
interface RawDay {
  value: number;
  dayGanZhi: string;
  daily: Record<string, unknown>;
  dayIndex: number;
}

const BRIGHTNESS: Record<string, number> = {
  庙: 1.0, 旺: 0.8, 得: 0.5, 利: 0.2, 平: 0, 不: -0.4, 陷: -0.8,
};

function palaceStarScore(stars: { brightness?: string }[]): number {
  if (stars.length === 0) return 0; // 空宫记中性（真实斗数要看对宫借星，这里简化）
  return stars.reduce((s, st) => s + (BRIGHTNESS[st.brightness ?? '平'] ?? 0), 0) / stars.length;
}

function computeRawDay(
  rawChart: ReturnType<typeof astro.bySolar>,
  palaces: { name: string; majorStars: { name: string; brightness?: string }[] }[],
  starHome: Record<string, string>,
  date: string,
  timeIndex: number,
): RawDay {
  const h = rawChart.horoscope(date, timeIndex);

  const daily = h.daily as unknown as { index?: number; mutagen?: string[] };
  const dayIndex = typeof daily?.index === 'number' ? daily.index : 0;
  const dayPalaceName = palaces[dayIndex]?.name ?? '';

  /** ① 流日当事宫的星曜庙旺 —— 这是每日差异的主来源 */
  const dayPalaceScore = palaceStarScore(palaces[dayIndex]?.majorStars ?? []);

  /** ② 流日四化落到当事宫 → 吉凶落到实处，作用最强 */
  let landOnDayPalace = 0;
  (daily?.mutagen ?? []).forEach((star, i) => {
    const mutagen = MUTAGEN_ORDER[i];
    if (!mutagen) return;
    if (starHome[star] === dayPalaceName) landOnDayPalace += MUTAGEN_SCORE[mutagen] ?? 0;
  });

  /** ③ 流日四化的整体倾向（当四化落在不同宫时，仍有一个总的方向） */
  const overall = (daily?.mutagen ?? []).reduce(
    (s, _star, i) => s + (MUTAGEN_SCORE[MUTAGEN_ORDER[i] ?? ''] ?? 0),
    0,
  );

  /** ④ 大限底色：十年尺度的平台（同一个人一段时间内不变） */
  const decadal = h.decadal as unknown as { index?: number };
  const decadalIndex = typeof decadal?.index === 'number' ? decadal.index : 0;
  const decadalScore = palaceStarScore(palaces[decadalIndex]?.majorStars ?? []);

  const raw =
    dayPalaceScore * 1.4 + // 主角
    landOnDayPalace * 1.2 + // 四化落实到本宫
    overall * 0.12 + // 很弱的总倾向
    decadalScore * 0.5; // 十年底色

  const lunar = Solar.fromYmd(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)),
    Number(date.slice(8, 10)),
  ).getLunar();

  return {
    value: raw,
    dayGanZhi: lunar.getDayInGanZhi(),
    daily: daily as unknown as Record<string, unknown>,
    dayIndex,
  };
}

/** 把原始分值按「当月窗口」归一化到 0-100，并分级 */
function normalize(rawValues: number[], raw: number): number {
  const min = Math.min(...rawValues);
  const max = Math.max(...rawValues);
  if (max - min < 0.01) return 50; // 全月一样（少见），给中间值
  const t = (raw - min) / (max - min);
  // 映射到 18-88：留出上下余量，避免"每天都是满分/零分"
  return Math.round(18 + t * 70);
}

/* ------------------------- 主函数 ------------------------- */

/** 宫位 → 生活领域（用于"今天该关注什么"） */
const PALACE_THEME: Record<string, string> = {
  命宫: '你自己',
  兄弟: '同辈与朋友',
  夫妻: '伴侣关系',
  子女: '晚辈与创作',
  财帛: '钱与资源',
  疾厄: '身体与情绪',
  迁移: '外出与环境',
  仆役: '合作与人脉',
  官禄: '工作与事业',
  田宅: '家庭与居住',
  福德: '内心与休息',
  父母: '长辈与上级',
};

export function buildDailyReading(birth: BirthInfo, dateISO?: string): DailyReading {
  const chart = buildChart(birth);
  const solar = buildTrueSolarTime(birth);

  const [by, bm, bd] = birth.birthDate.split('-').map((v) => Number(v));
  const gender = birth.gender === '女' ? '女' : '男';
  const raw = astro.bySolar(`${by}-${bm}-${bd}`, solar.timeIndex, gender, true, 'zh-CN');

  const today = dateISO ?? new Date().toISOString().slice(0, 10);
  const palaces = chart.palaces.map((p) => ({ name: p.name, majorStars: p.majorStars }));

  // 星曜 → 本命盘宫位
  const starHome: Record<string, string> = {};
  for (const p of chart.palaces) {
    for (const s of [...p.majorStars, ...p.minorStars]) starHome[s.name] = p.name;
  }

  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const d = Number(today.slice(8, 10));

  /**
   * 归一化窗口：算「当月 1 号到月末」的原始分值，用这个区间把今天映射到 0-100。
   * 这样"今天偏高/偏低"有当月做参照，而不是凭空一个绝对值。
   * 同时这个窗口也能直接给出未来 7 天的相对高低。
   */
  const daysInMonth = new Date(y, m, 0).getDate();
  const windowRaw: { iso: string; raw: number; dayGanZhi: string; dayIndex: number }[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const rd = computeRawDay(raw, palaces, starHome, iso, solar.timeIndex);
    windowRaw.push({ iso, raw: rd.value, dayGanZhi: rd.dayGanZhi, dayIndex: rd.dayIndex });
  }
  const rawValues = windowRaw.map((w) => w.raw);

  const todayRaw = windowRaw.find((w) => w.iso === today) ?? windowRaw[0];
  const day = {
    value: normalize(rawValues, todayRaw.raw),
    dayGanZhi: todayRaw.dayGanZhi,
    daily: {} as Record<string, unknown>,
    dayIndex: todayRaw.dayIndex,
  };
  // 补齐当日四化明细（归一化窗口里没有存这部分）
  const todayH = raw.horoscope(today, solar.timeIndex);
  day.daily = todayH.daily as unknown as Record<string, unknown>;

  /* 当日四化落宫明细 */
  const dailyMutagens = ((day.daily.mutagen as string[]) ?? [])
    .map((star, i) => ({ star, mutagen: MUTAGEN_ORDER[i] ?? '', palace: starHome[star] ?? '—' }))
    .filter((m) => m.mutagen);
  const dayPalaceName = PALACE_ORDER[day.dayIndex] ?? '命宫';
  const dayPalace = chart.palaces.find((p) => p.name === dayPalaceName);

  /* 农历与宜忌 */
  const solarObj = Solar.fromYmd(y, m, d);
  const lunar = solarObj.getLunar();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = new Date(y, m - 1, d).getDay();

  /* 能量与结论 */
  const energy = energyOf(day.value);

  /** 找出今天最需要注意的一颗化忌 */
  const worst = dailyMutagens.find((m) => m.mutagen === '忌');
  const best = dailyMutagens.find((m) => m.mutagen === '禄');

  const headline =
    energy.value >= 72
      ? '今天适合推进要紧的事，阻力比平时小。'
      : energy.value >= 58
        ? '今天整体顺，按计划走就行。'
        : energy.value >= 42
          ? '今天平稳，适合把手上确定的事做完，不必开新局。'
          : energy.value >= 28
            ? '今天偏耗，节奏放慢一点，别硬推。'
            : '今天是低谷，重要决定留到别的日子。';

  const detail: string[] = [];
  detail.push(
    `今日流日命宫落在${dayPalaceName}（${PALACE_THEME[dayPalaceName] ?? '日常'}）` +
      (dayPalace && dayPalace.majorStars.length > 0
        ? `，主星${dayPalace.majorStars.map((s) => `${s.name}${s.brightness ?? ''}`).join('、')}`
        : '，空宫'),
  );
  if (best) detail.push(`流日${best.star}化禄落在${best.palace}宫——这一块今天相对顺`);
  if (worst) detail.push(`流日${worst.star}化忌落在${worst.palace}宫——这一块今天容易出状况，多留个心`);

  /* 身体提醒：看疾厄宫这一天的状态 */
  const healthMut = dailyMutagens.find((m2) => m2.palace === '疾厄');
  const healthNote = healthMut
    ? healthMut.mutagen === '忌'
      ? '今天身体容易觉得累，别熬夜、别硬撑，早点休息收益最大。'
      : `今天${healthMut.star}化${healthMut.mutagen}照到疾厄宫，适合做点对身体有益的安排。`
    : '今天身体状态平稳，规律作息就好。';

  /* 未来 7 天 */
  const week: DailyForecast[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(y, m - 1, d + i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    // 未来 7 天用同一个「当月窗口」归一化，所以它们的高低与今天可比
    const w =
      windowRaw.find((x) => x.iso === iso) ??
      (() => {
        const rd = computeRawDay(raw, palaces, starHome, iso, solar.timeIndex);
        return { iso, raw: rd.value, dayGanZhi: rd.dayGanZhi, dayIndex: rd.dayIndex };
      })();
    const v = normalize(rawValues, w.raw);
    week.push({
      date: iso,
      weekday: dt.getDay(),
      dayGanZhi: w.dayGanZhi,
      value: v,
      label: energyOf(v).label,
      isToday: i === 0,
    });
  }
  const weekAverage = Math.round(week.reduce((s, w) => s + w.value, 0) / week.length);

  return {
    date: today,
    dateText: `${y} 年 ${m} 月 ${d} 日 ${weekdays[weekday]}`,
    gregorian: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    lunarText: lunar.toString(),
    ganzhiText: `${lunar.getYearInGanZhi()}年 · ${lunar.getMonthInGanZhi()}月 · ${lunar.getDayInGanZhi()}日`,
    energy,
    headline,
    detail,
    focus: {
      palace: dayPalaceName,
      palaceTheme: PALACE_THEME[dayPalaceName] ?? '日常',
      mutagens: dailyMutagens,
    },
    healthNote,
    directions: {
      xi: lunar.getDayPositionXiDesc(),
      cai: lunar.getDayPositionCaiDesc(),
      fu: lunar.getDayPositionFuDesc(),
    },
    yi: lunar.getDayYi().slice(0, 6),
    ji: lunar.getDayJi().slice(0, 6),
    chong: lunar.getDayChongDesc(),
    sha: lunar.getDaySha(),
    week,
    weekAverage,
  };
}

/** 按时段给问候语 */
export function greetingOf(hour: number, name?: string): string {
  const who = name ? `${name}，` : '';
  if (hour >= 5 && hour < 11) return `${who}早上好。`;
  if (hour >= 11 && hour < 14) return `${who}中午好。`;
  if (hour >= 14 && hour < 18) return `${who}下午好。`;
  if (hour >= 18 && hour < 23) return `${who}晚上好。`;
  return `${who}夜深了。`;
}
