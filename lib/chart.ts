/**
 * 紫微斗数排盘封装
 * ---------------------------------------------------------------
 * 这一层的作用：把第三方排盘库（iztro）的输出，转成我们自己的数据结构。
 *
 * 为什么要封装：
 *   1. 上层（曲线、年度卡片、设备屏幕）只依赖我们自己的字段，不依赖某个库的 API
 *   2. 将来换库、或加真太阳时校正、或改用服务端排盘，只改这一个文件
 *   3. 库返回的对象带很多方法（不是纯数据），不能直接塞给 React 组件
 *
 * 当前是**本命盘 + 大限 + 流年**的真实计算结果，不是模拟数据。
 *
 * ⚠️ 已知口径问题（待业务方确认，见开发交接文档 §8.5）：
 *   - 时辰目前只按"北京时间 + 时辰序号"，**尚未接入真太阳时校正**
 *   - 子时归属、庚干四化等分歧点采用 iztro 默认口径
 */

import { astro } from 'iztro';
import type { BirthInfo } from './types';
import { buildTrueSolarTime, type TrueSolarTime } from './solar-time';

/* ------------------------- 我们自己的数据结构 ------------------------- */

export interface Star {
  name: string;
  /** 庙旺利陷：庙 / 旺 / 得 / 利 / 平 / 不 / 陷（可能为空） */
  brightness?: string;
  /** 四化：禄 / 权 / 科 / 忌（可能为空） */
  mutagen?: string;
}

export interface Palace {
  /** 宫名：命宫 / 兄弟 / 夫妻 / 子女 / 财帛 / 疾厄 / 迁移 / 仆役 / 官禄 / 田宅 / 福德 / 父母 */
  name: string;
  /** 宫位干支，如 癸亥 */
  ganzhi: string;
  /** 主星 */
  majorStars: Star[];
  /** 辅星（左辅右弼、文昌文曲、禄存天马、四煞等） */
  minorStars: Star[];
  /** 是否是身宫 */
  isBodyPalace: boolean;
  /** 大限区间，如 [2, 11] */
  decadalRange?: [number, number];
}

export interface ChartSummary {
  /** 阳历，如 1993-6-18 */
  solarDate: string;
  /** 农历，如 一九九三年四月廿九 */
  lunarDate: string;
  /** 四柱，如 癸酉 丁巳 庚午 壬午 */
  chineseDate: string;
  /** 时辰，如 午时 */
  timeName: string;
  zodiac: string;
  sign: string;
  /** 命主 / 身主 */
  soul: string;
  body: string;
  /** 五行局，如 水二局 */
  fiveElementsClass: string;
  /** 命宫所在的干支 */
  soulPalaceGanzhi: string;
  /** 身宫所在宫名 */
  bodyPalaceName: string;
}

export interface Chart {
  summary: ChartSummary;
  /** 十二宫 */
  palaces: Palace[];
  /**
   * 真太阳时校正详情。
   * 时辰是命宫的依据，所以这一项直接影响整张盘，必须让用户看得到。
   */
  solarTime: TrueSolarTime;
}

/** 某一年的运限（大限 + 流年） */
export interface YearHoroscope {
  year: number;
  age: number;
  /** 该年所处的大限区间，如 [32, 41] */
  decadalRange: [number, number];
  /** 该年大限命宫落在本命盘的哪个宫，如 子女 */
  decadalPalace: string;
  /** 该大限宫位的主星 */
  decadalStars: Star[];
  /** 大限四化（禄权科忌各对应一颗星） */
  decadalMutagens: { star: string; mutagen: string }[];
  /** 流年干支，如 戊申 */
  yearlyStem: string;
  yearlyBranch: string;
  /** 流年命宫落在本命盘的哪个宫 */
  yearlyPalace: string;
  /** 流年命宫的主星 */
  yearlyStars: Star[];
  /** 流年四化 */
  yearlyMutagens: { star: string; mutagen: string }[];
  /** 该年大限宫位所属的宫名（大限十二宫里的名字，如 命宫/兄弟/夫妻…） */
  decadalPalaceNameInCycle: string;
  /** 该年流年宫位所属的宫名（流年十二宫里的名字） */
  yearlyPalaceNameInCycle: string;
  /**
   * 「星曜 → 它在本命盘里落在哪个宫」的映射。
   * 用途：四化是「某颗星化禄/化忌」，要判断影响哪个生活领域，
   * 就得知道这颗星在本命盘里的位置。见 lib/signals.ts 的 buildPalaceImpacts。
   */
  starHomePalace: Record<string, string>;
  /** 生年四化：本命盘里哪颗星带四化（底色） */
  natalMutagens: Record<string, string>;
}

/* ------------------------- 时辰换算 ------------------------- */

/** 把「午时 11:00-13:00」这类文本，转成 iztro 需要的时辰序号 0-12 */
export function timeNameToIndex(birthTime: string): number {
  const names = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const hit = names.findIndex((n) => birthTime.includes(n));
  if (hit >= 0) return hit;
  // 「不确定」时退化为午时（正午），并在上层提示
  return 6;
}

/** 时辰是否可信（用户填了"不确定"就不可信） */
export function isTimeReliable(birthTime: string): boolean {
  return !birthTime.includes('不确定');
}

/* ------------------------- 缓存 ------------------------- */

/**
 * 排盘结果缓存。
 * 本命盘由「出生信息」决定——**必须包含出生地**，
 * 因为真太阳时的经度修正会影响时辰，进而改变命宫。
 * （一次疏忽漏掉出生地，导致不同城市返回同一张盘，见 git 历史）
 */
const chartCache = new Map<string, Chart>();

function cacheKey(birth: BirthInfo): string {
  return [birth.birthDate, birth.birthTime, birth.gender, birth.birthPlace].join('|');
}

/* ------------------------- 主入口 ------------------------- */

/**
 * 排本命盘
 * @param birth 出生信息
 */
export function buildChart(birth: BirthInfo): Chart {
  const key = cacheKey(birth);
  const cached = chartCache.get(key);
  if (cached) return cached;

  const [y, m, d] = birth.birthDate.split('-').map((v) => Number(v));

  /**
   * **用真太阳时定时辰**——这一步决定命宫，命宫错则十二宫全错。
   * 校正内容：出生地经度差 + 均时差 + 夏令时（由系统时区库处理）。
   */
  const solarTime = buildTrueSolarTime(birth);
  const timeIndex = solarTime.timeIndex;

  // iztro 的日期格式是 1993-6-18（月份不补零）
  const solarDate = `${y}-${m}-${d}`;
  // 性别只认 '男' / '女'，'其他' 暂时按男处理并在上层提示
  const gender = birth.gender === '女' ? '女' : '男';

  const chart = astro.bySolar(solarDate, timeIndex, gender, true, 'zh-CN');

  const palaces: Palace[] = chart.palaces.map((p) => ({
    name: String(p.name),
    ganzhi: `${p.heavenlyStem}${p.earthlyBranch}`,
    majorStars: (p.majorStars ?? []).map((s) => ({
      name: s.name,
      brightness: s.brightness || undefined,
      mutagen: s.mutagen || undefined,
    })),
    minorStars: (p.minorStars ?? []).map((s) => ({
      name: s.name,
      brightness: s.brightness || undefined,
      mutagen: s.mutagen || undefined,
    })),
    isBodyPalace: Boolean(p.isBodyPalace),
    decadalRange: p.decadal?.range
      ? ([p.decadal.range[0], p.decadal.range[1]] as [number, number])
      : undefined,
  }));

  const soulPalace = chart.palaces.find((p) => String(p.name) === '命宫');
  const bodyPalace = chart.palaces.find((p) => p.isBodyPalace);

  const result: Chart = {
    summary: {
      solarDate: chart.solarDate,
      lunarDate: chart.lunarDate,
      chineseDate: chart.chineseDate,
      timeName: chart.time,
      zodiac: chart.zodiac,
      sign: chart.sign,
      soul: chart.soul,
      body: chart.body,
      fiveElementsClass: chart.fiveElementsClass,
      soulPalaceGanzhi: soulPalace
        ? `${soulPalace.heavenlyStem}${soulPalace.earthlyBranch}`
        : '',
      bodyPalaceName: bodyPalace ? String(bodyPalace.name) : '',
    },
    palaces,
    solarTime,
  };

  chartCache.set(key, result);
  return result;
}

/** 四化的顺序：iztro 的 mutagen 数组固定是 [禄, 权, 科, 忌] */
const MUTAGEN_ORDER = ['禄', '权', '科', '忌'] as const;

/**
 * 算某一年的运限（大限 + 流年）
 * 这是「年度卡片」的真实依据来源。
 *
 * iztro 的返回结构（已实测确认）：
 *   h.decadal = { index, heavenlyStem, earthlyBranch, palaceNames[], mutagen[4], stars[] }
 *     - index 指向本命盘的第几个宫（大限命宫落在这里）
 *     - mutagen 固定是 [禄, 权, 科, 忌] 四颗星的名字
 *     - **没有 range**，年龄区间要从本命盘该宫的 decadal.range 取
 */
export function buildYearHoroscope(birth: BirthInfo, year: number): YearHoroscope {
  const [y, m, d] = birth.birthDate.split('-').map((v) => Number(v));
  // 与 buildChart 保持一致：时辰用真太阳时
  const timeIndex = buildTrueSolarTime(birth).timeIndex;
  const gender = birth.gender === '女' ? '女' : '男';

  // 本命盘走缓存（只与出生信息有关）
  const natal = buildChart(birth);
  // 运限需要 iztro 的原始对象来调用 horoscope()
  const raw = astro.bySolar(`${y}-${m}-${d}`, timeIndex, gender, true, 'zh-CN');
  // 取该年年中（6 月 1 日）做运限，避免年初年末的边界问题
  const h = raw.horoscope(`${year}-6-1`, timeIndex);

  const age = year - y;

  // 大限命宫落在本命盘的第 index 宫
  const decadalIndex = typeof h.decadal?.index === 'number' ? h.decadal.index : 0;
  const decadalNatal = natal.palaces[decadalIndex];
  const decadalRange: [number, number] = decadalNatal?.decadalRange ?? [0, 0];

  // 大限四化：数组按 [禄, 权, 科, 忌] 对应四颗星
  const decadalMutagens = (h.decadal?.mutagen ?? []).map((star, i) => ({
    star,
    mutagen: MUTAGEN_ORDER[i] ?? '',
  })).filter((x) => x.star);

  // 流年四化：同上
  const yearlyMutagens = (h.yearly?.mutagen ?? []).map((star, i) => ({
    star,
    mutagen: MUTAGEN_ORDER[i] ?? '',
  })).filter((x) => x.star);

  // 流年命宫落在本命盘的哪个宫（流年文昌/命宫的定位）
  const yearlyIndex = typeof h.yearly?.index === 'number' ? h.yearly.index : 0;

  const palaceNameOf = (idx: number) => {
    const p = natal.palaces[idx];
    return p ? String(p.name) : '';
  };
  const starsOf = (idx: number): Star[] => {
    const p = natal.palaces[idx];
    if (!p) return [];
    return (p.majorStars ?? []).map((s) => ({
      name: s.name,
      brightness: s.brightness || undefined,
      mutagen: s.mutagen || undefined,
    }));
  };

  // 星曜 → 本命盘宫位（四化落宫判断的依据）
  const starHomePalace: Record<string, string> = {};
  const natalMutagens: Record<string, string> = {};
  for (const p of natal.palaces) {
    for (const s of [...p.majorStars, ...p.minorStars]) {
      starHomePalace[s.name] = p.name;
      if (s.mutagen) natalMutagens[s.name] = s.mutagen;
    }
  }

  return {
    year,
    age,
    decadalRange,
    decadalPalace: palaceNameOf(decadalIndex),
    decadalStars: starsOf(decadalIndex),
    decadalMutagens,
    yearlyBranch: h.yearly?.earthlyBranch ?? '',
    yearlyStem: h.yearly?.heavenlyStem ?? '',
    yearlyPalace: palaceNameOf(yearlyIndex),
    yearlyStars: starsOf(yearlyIndex),
    yearlyMutagens,
    // 大限/流年各自的十二宫名（用于判断"当事宫"是哪个）
    decadalPalaceNameInCycle: h.decadal?.palaceNames?.[decadalIndex] ?? '',
    yearlyPalaceNameInCycle: h.yearly?.palaceNames?.[yearlyIndex] ?? '',
    starHomePalace,
    natalMutagens,
  };
}

/** 十二宫的固定排列顺序（用于界面显示） */
export const PALACE_ORDER = [
  '命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄',
  '迁移', '仆役', '官禄', '田宅', '福德', '父母',
] as const;

/* ------------------------- 把运限转成界面上的一句话 ------------------------- */

/**
 * 生成「命理依据」里的紫微信号（真实排盘结果，不是随机文案）。
 *
 * 依据三件事：
 *   1. 当前大限落在哪个宫、那颗宫的主星
 *   2. 大限四化（哪些星化禄权科忌）
 *   3. 流年干支与流年命宫
 */
export function describeDecadal(h: YearHoroscope): string {
  const stars = h.decadalStars.map((s) => s.name).join('、');
  const palacePart = stars ? `大限行至${h.decadalPalace}宫（${stars}）` : `大限行至${h.decadalPalace}宫（空宫）`;
  return `${palacePart}，区间 ${h.decadalRange[0]}-${h.decadalRange[1]} 岁`;
}

export function describeMutagens(mutagens: { star: string; mutagen: string }[]): string {
  if (mutagens.length === 0) return '本年四化未取到';
  return mutagens.map((m) => `${m.star}化${m.mutagen}`).join('、');
}

/**
 * 合成给年度卡片用的命理依据
 * 返回的三项对应 YearCardData 的 ziweiSignal / baziSignal / consistency
 */
export function buildSignals(h: YearHoroscope): {
  ziweiSignal: string;
  baziSignal: string;
  consistency: '一致' | '单信号' | '冲突';
} {
  const decadal = describeDecadal(h);
  const annual = describeMutagens(h.yearlyMutagens);
  const decadalMut = describeMutagens(h.decadalMutagens);

  // 流年四化里「禄/权/科」是顺的，「忌」是逆的
  const good = h.yearlyMutagens.filter((m) => m.mutagen !== '忌').length;
  const hasJi = h.yearlyMutagens.some((m) => m.mutagen === '忌');

  return {
    ziweiSignal: `${decadal}。流年${h.yearlyStem}${h.yearlyBranch}，${annual}；大限四化：${decadalMut}。`,
    // 八字部分仍是占位——我们还没接八字排盘库
    baziSignal: `（八字信号为占位内容，尚未接入八字排盘。）流年${h.yearlyStem}${h.yearlyBranch}，可参考流年干支与原局的生克关系。`,
    consistency: hasJi && good >= 3 ? '单信号' : good >= 2 ? '一致' : '单信号',
  };
}
