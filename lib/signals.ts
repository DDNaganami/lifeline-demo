/**
 * 命理信号汇总层
 * ---------------------------------------------------------------
 * 把紫微（lib/chart.ts）和八字（lib/bazi.ts）两个体系的结果合到一起，
 * 输出年度卡片需要的三项：ziweiSignal / baziSignal / consistency。
 *
 * 这一层是「产品的判断」所在的地方——两个体系各自给出方向，
 * 再由这里判断它们是否互相印证。
 *
 * ⚠️ 当前的一致性判断是**一条明确的简化规则**（见 judgeConsistency），
 *    不是从业者的实战口径。上线前必须由懂命理的人校准。
 */

import { astro } from 'iztro';
import { Solar } from 'lunar-typescript';
import type { BirthInfo } from './types';
import { buildChart, buildYearHoroscope, type YearHoroscope } from './chart';
import { buildBazi, buildYearBazi, type YearBazi, shiShenOf } from './bazi';
import { buildTrueSolarTime } from './solar-time';

/** 四化的顺序：iztro 的 mutagen 数组固定是 [禄, 权, 科, 忌] */
const MUTAGEN_ORDER = ['禄', '权', '科', '忌'] as const;

export interface YearSignals {
  /** 紫微信号（真实排盘） */
  ziweiSignal: string;
  /** 八字信号（真实排盘） */
  baziSignal: string;
  /** 两个体系是否互相印证 */
  consistency: '一致' | '单信号' | '冲突';
  /** 紫微方向：+1 偏顺 / 0 中性 / -1 偏逆 */
  ziweiDirection: number;
  /** 八字方向 */
  baziDirection: number;
  /**
   * 四化落在哪些宫、影响多大。
   * 这是「事件列表由排盘生成」的依据——见 lib/events.ts。
   */
  palaceImpacts: PalaceImpact[];
  /** 结构化明细，给界面展开看 */
  detail: {
    horoscope: YearHoroscope;
    bazi: YearBazi;
  };
}

export interface PalaceImpact {
  /** 宫名（命宫/财帛/官禄/夫妻/父母/疾厄） */
  palace: string;
  /** 哪个四化落在这里 */
  mutagen: string;
  /** 该领域是顺还是逆 */
  polarity: 'good' | 'bad';
  /** 影响权重 */
  weight: number;
}

/** 四化的吉凶方向：禄权科为吉，忌为凶 */
function mutagenDirection(mutagens: { star: string; mutagen: string }[]): number {
  let score = 0;
  for (const m of mutagens) {
    if (m.mutagen === '禄') score += 1.0;
    else if (m.mutagen === '权') score += 0.6;
    else if (m.mutagen === '科') score += 0.4;
    else if (m.mutagen === '忌') score -= 1.2;
  }
  return score;
}

/**
 * 星曜庙旺利陷的分值。
 * 这是斗数看盘最基本的权重——同样是紫微，庙旺和落陷意义完全不同。
 * 曲线要真正反映命盘，就必须把庙旺算进去。
 */
const BRIGHTNESS_SCORE: Record<string, number> = {
  庙: 1.0, 旺: 0.8, 得: 0.5, 利: 0.2, 平: 0, 不: -0.4, 陷: -0.8,
};

/** 某宫主星的庙旺平均分（空宫记 0） */
function palaceStarScore(stars: { name: string; brightness?: string }[]): number {
  if (stars.length === 0) return 0;
  const sum = stars.reduce((s, st) => s + (BRIGHTNESS_SCORE[st.brightness ?? '平'] ?? 0), 0);
  return sum / stars.length;
}

/** 四化落到某宫时的加权（落本宫才算"落到实处"） */
function mutagenImpactOn(
  mutagens: { star: string; mutagen: string }[],
  palaceStars: { name: string }[],
): number {
  const names = new Set(palaceStars.map((s) => s.name));
  let score = 0;
  for (const m of mutagens) {
    if (!names.has(m.star)) continue;
    if (m.mutagen === '禄') score += 1.2;
    else if (m.mutagen === '权') score += 0.8;
    else if (m.mutagen === '科') score += 0.6;
    else if (m.mutagen === '忌') score -= 1.5;
  }
  return score;
}

/**
 * 紫微在该年的强弱。
 *
 * ⚠️ 关键：这个值**会随时辰变化**（因为时辰决定命宫，进而决定十二宫位置）。
 *    只用四化是不够的——四化只由流年天干决定，换个出生地结果一样，
 *    用户会觉得"真太阳时没生效"。加入星曜庙旺后，曲线才真正反映命盘。
 */
function ziweiScoreOfYear(h: YearHoroscope): number {
  const decadalBase = palaceStarScore(h.decadalStars);
  const yearlyBase = palaceStarScore(h.yearlyStars);
  const decadalHit =
    mutagenImpactOn(h.decadalMutagens, h.decadalStars) +
    mutagenImpactOn(h.decadalMutagens, h.yearlyStars) * 0.5;
  const yearlyHit = mutagenImpactOn(h.yearlyMutagens, h.yearlyStars);
  // 大限命宫（当事宫名 = 命宫）分量更重
  const benefitBonus = h.decadalPalaceNameInCycle === '命宫' ? 0.5 : 0;
  return decadalBase + yearlyBase * 0.6 + decadalHit + yearlyHit + benefitBonus;
}

/** 十神的吉凶方向（按常见的顺逆分类） */
const SHISHEN_DIRECTION: Record<string, number> = {
  正财: 1, 偏财: 1, 正印: 0.8, 偏印: 0.3,
  食神: 0.8, 正官: 0.7, 七杀: -0.8, 伤官: -0.6,
  比肩: 0, 劫财: -0.5,
};

function shiShenDirection(shiShen: string): number {
  return SHISHEN_DIRECTION[shiShen] ?? 0;
}

/**
 * 判断两个体系是否互相印证。
 *
 * **这是当前的简化规则**（阈值 ±0.8）：
 *   两个方向同为正或同为负 → 一致
 *   一个明显、一个中性     → 单信号
 *   一正一负               → 冲突
 *
 * 待校准：真实从业者会看更复杂的关系（星曜组合、格局、用神是否得力等），
 * 这里只做"方向是否同向"这个最粗的判断，够原型用，但必须标注。
 */
export function judgeConsistency(ziweiDirection: number, baziDirection: number): '一致' | '单信号' | '冲突' {
  const TH = 0.8;
  const z = Math.abs(ziweiDirection) >= TH ? Math.sign(ziweiDirection) : 0;
  const b = Math.abs(baziDirection) >= TH ? Math.sign(baziDirection) : 0;

  if (z === 0 && b === 0) return '单信号'; // 两边都不明显 → 信息不足
  if (z === 0 || b === 0) return '单信号'; // 只有一边明显
  return z === b ? '一致' : '冲突';
}

function describeZiwei(h: YearHoroscope): string {
  const stars = h.decadalStars.map((s) => s.name).join('、');
  const palace = stars ? `${h.decadalPalace}宫（${stars}）` : `${h.decadalPalace}宫（空宫）`;
  const decadalMut = h.decadalMutagens.map((m) => `${m.star}化${m.mutagen}`).join('、');
  const yearlyMut = h.yearlyMutagens.map((m) => `${m.star}化${m.mutagen}`).join('、');
  return (
    `大限行至${palace}，区间 ${h.decadalRange[0]}-${h.decadalRange[1]} 岁。` +
    `大限四化：${decadalMut || '无'}。` +
    `流年${h.yearlyStem}${h.yearlyBranch}，四化：${yearlyMut || '无'}。`
  );
}

function describeBazi(y: YearBazi): string {
  const parts: string[] = [];
  parts.push(`流年${y.liuNian}，天干对日主为「${y.liuNianShiShen}」`);
  if (y.daYun) parts.push(`现行大运${y.daYun.ganzhi}（${y.daYun.startAge}-${y.daYun.endAge} 岁），十神为「${y.daYunShiShen}」`);
  const isFav = ['正财', '偏财', '正印', '偏印', '食神', '正官'].includes(y.liuNianShiShen);
  parts.push(isFav ? '整体偏顺' : '整体偏逆，宜守不宜攻');
  return parts.join('；') + '。';
}

/** 生成某一年的完整信号 */
export function buildYearSignals(birth: BirthInfo, year: number): YearSignals {
  const horoscope = buildYearHoroscope(birth, year);
  const bazi = buildYearBazi(birth, year);

  const ziweiDirection =
    mutagenDirection(horoscope.decadalMutagens) * 0.6 +
    mutagenDirection(horoscope.yearlyMutagens) * 0.4;
  const baziDirection = shiShenDirection(bazi.liuNianShiShen) + (bazi.daYunShiShen ? shiShenDirection(bazi.daYunShiShen) * 0.5 : 0);

  return {
    ziweiSignal: describeZiwei(horoscope),
    baziSignal: describeBazi(bazi),
    consistency: judgeConsistency(ziweiDirection, baziDirection),
    ziweiDirection,
    baziDirection,
    palaceImpacts: buildPalaceImpacts(horoscope),
    detail: { horoscope, bazi },
  };
}

/**
 * 从运限结果里算出「四化落在哪些宫」。
 *
 * 依据：
 *   1. 大限/流年四化的四颗星，在本命盘里落在哪个宫 → 那个领域被引动
 *   2. 大限命宫、流年命宫本身的宫位 → 也是一条主要影响
 *   3. 本命盘该宫自带的四化（生年四化）→ 是底色，权重略低
 *
 * 权重（决定事件的主次顺序）：
 *   大限命宫 > 流年命宫 > 大限四化落宫 > 流年四化落宫 > 生年四化落宫
 */
function buildPalaceImpacts(h: YearHoroscope): PalaceImpact[] {
  const impacts: PalaceImpact[] = [];
  // 需要参与事件生成的宫位（其余宫位不对应六个维度，先不纳入）
  const KEY_PALACES = new Set(['命宫', '财帛', '官禄', '夫妻', '父母', '疾厄']);

  const push = (palace: string, mutagen: string, polarity: 'good' | 'bad', weight: number) => {
    if (!KEY_PALACES.has(palace)) return;
    impacts.push({ palace, mutagen, polarity, weight });
  };

  // 1) 大限命宫 / 流年命宫本身
  push(h.decadalPalace, '大限', 'good', 3.0);
  push(h.yearlyPalace, '流年', 'good', 2.0);

  // 2) 大限四化落宫
  for (const m of h.decadalMutagens) {
    const palace = h.starHomePalace?.[m.star];
    if (!palace) continue;
    const isBad = m.mutagen === '忌';
    push(palace, `大限${m.mutagen}`, isBad ? 'bad' : 'good', isBad ? 2.6 : 2.2);
  }

  // 3) 流年四化落宫
  for (const m of h.yearlyMutagens) {
    const palace = h.starHomePalace?.[m.star];
    if (!palace) continue;
    const isBad = m.mutagen === '忌';
    push(palace, `流年${m.mutagen}`, isBad ? 'bad' : 'good', isBad ? 1.8 : 1.5);
  }

  // 4) 生年四化（底色）
  for (const [star, mutagen] of Object.entries(h.natalMutagens ?? {})) {
    const palace = h.starHomePalace?.[star];
    if (!palace) continue;
    const isBad = mutagen === '忌';
    push(palace, `生年${mutagen}`, isBad ? 'bad' : 'good', 0.8);
  }

  // 同一宫同一极性只保留权重最高的一条
  const best = new Map<string, PalaceImpact>();
  for (const im of impacts) {
    const key = `${im.palace}|${im.polarity}`;
    const prev = best.get(key);
    if (!prev || im.weight > prev.weight) best.set(key, im);
  }
  return [...best.values()].sort((a, b) => b.weight - a.weight);
}

/**
 * 供曲线使用的「年度强弱偏移」。
 *
 * 组成（全部来自真实排盘）：
 *   1. **大限台阶**：当事宫主星的庙旺利陷 → 十年一个平台
 *      这是"人生换了主题"的体现，也是曲线看起来是台阶状而非波浪的原因
 *   2. 流年四化是否落到当事宫 → 年内的起伏
 *   3. 四化方向本身（禄权科为吉、忌为凶）
 *   4. 八字流年十神 + 现行大运十神
 *
 * ⚠️ 性能要点：本命盘与八字本盘**只算一次**，循环里只做运限计算。
 *   朴素写法（每年都重排一次本命盘）88 年要 ~3.4 秒，优化后约 1.1 秒。
 */
export function buildYearOffsets(birth: BirthInfo, fromYear: number, toYear: number): Map<number, number> {
  const map = new Map<number, number>();

  // 只算一次的基础数据
  const natal = buildChart(birth);
  const baziBase = buildBazi(birth);
  const [by, bm, bd] = birth.birthDate.split('-').map((v) => Number(v));
  const timeIndex = buildTrueSolarTime(birth).timeIndex;
  const gender = birth.gender === '女' ? '女' : '男';
  const raw = astro.bySolar(`${by}-${bm}-${bd}`, timeIndex, gender, true, 'zh-CN');

  // 星曜 → 本命盘宫位（四化落宫判断的依据）
  const starHomePalace: Record<string, string> = {};
  const natalMutagens: Record<string, string> = {};
  for (const p of natal.palaces) {
    for (const s of [...p.majorStars, ...p.minorStars]) {
      starHomePalace[s.name] = p.name;
      if (s.mutagen) natalMutagens[s.name] = s.mutagen;
    }
  }

  for (let year = fromYear; year <= toYear; year++) {
    try {
      const h = raw.horoscope(`${year}-6-1`, timeIndex);
      const decadalIndex = typeof h.decadal?.index === 'number' ? h.decadal.index : 0;
      const yearlyIndex = typeof h.yearly?.index === 'number' ? h.yearly.index : 0;

      const natalStars = (idx: number) => natal.palaces[idx]?.majorStars ?? [];
      const decadalStars = natalStars(decadalIndex);
      const yearlyStars = natalStars(yearlyIndex);

      const map2 = (arr: string[] | undefined) =>
        (arr ?? []).map((star, i) => ({ star, mutagen: MUTAGEN_ORDER[i] ?? '' })).filter((x) => x.star);

      const horoscopeLike: YearHoroscope = {
        year,
        age: year - by,
        decadalRange: natal.palaces[decadalIndex]?.decadalRange ?? [0, 0],
        decadalPalace: natal.palaces[decadalIndex]?.name ?? '',
        decadalStars,
        decadalMutagens: map2(h.decadal?.mutagen),
        yearlyStem: h.yearly?.heavenlyStem ?? '',
        yearlyBranch: h.yearly?.earthlyBranch ?? '',
        yearlyPalace: natal.palaces[yearlyIndex]?.name ?? '',
        yearlyStars,
        yearlyMutagens: map2(h.yearly?.mutagen),
        decadalPalaceNameInCycle: h.decadal?.palaceNames?.[decadalIndex] ?? '',
        yearlyPalaceNameInCycle: h.yearly?.palaceNames?.[yearlyIndex] ?? '',
        starHomePalace,
        natalMutagens,
      };

      // ① 大限台阶（十年一个平台）+ ② 流年四化 + ③ 四化方向
      const ziweiDir = ziweiScoreOfYear(horoscopeLike);

      // ④ 八字：流年十神 + 现行大运十神
      const liuNianObj = Solar.fromYmdHms(year, 6, 1, 12, 0, 0).getLunar();
      const liuNianShiShen = shiShenOf(baziBase.dayMaster, liuNianObj.getYearGan());
      const daYun = baziBase.daYun.find((d) => year >= d.startYear && year <= d.endYear);
      const baziDir =
        shiShenDirection(liuNianShiShen) +
        (daYun ? shiShenDirection(shiShenOf(baziBase.dayMaster, daYun.ganzhi[0])) * 0.5 : 0);

      const combined = ziweiDir * 0.6 + baziDir * 0.4;
      map.set(year, Math.max(-20, Math.min(20, combined * 6)));
    } catch {
      map.set(year, 0);
    }
  }
  return map;
}

/** 供界面显示：把方向值说成人话 */
export function directionLabel(v: number): string {
  if (v >= 1.5) return '明显偏顺';
  if (v >= 0.8) return '偏顺';
  if (v > -0.8) return '中性';
  if (v > -1.5) return '偏逆';
  return '明显偏逆';
}

export { shiShenOf };
