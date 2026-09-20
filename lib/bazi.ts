/**
 * 八字排盘
 * ---------------------------------------------------------------
 * 为什么不用 iztro 的八字：**实测发现它有错**（已交叉验证）。
 *
 * 用同一份出生信息对比两个库：
 *   lunar-typescript（按节气换月，正确）：癸酉 戊午 庚午 壬午
 *   iztro（按农历月换月，错误）          ：癸酉 丁巳 庚午 壬午
 *
 * 独立验算依据：「五虎遁」——戊癸之年，寅月为甲寅，顺推至午月应为戊午。
 * iztro 按农历四月取巳月，所以月柱错一位。
 * 另外晚子时（23:00-24:00）iztro 会把日柱推进到次日，属流派差异。
 *
 * **重要结论：紫微用 iztro（时柱经 13 个时辰逐一验证完全正确），八字用 lunar-typescript。**
 *
 * 本层输出用于：
 *   1. 年度卡片里的「八字信号」
 *   2. 与紫微信号交叉判断「是否一致」
 */

import { Solar } from 'lunar-typescript';
import type { BirthInfo } from './types';
import { buildTrueSolarTime } from './solar-time';

export type WuXing = '木' | '火' | '土' | '金' | '水';

export interface Pillar {
  /** 天干 */
  gan: string;
  /** 地支 */
  zhi: string;
  /** 干支合写，如 戊午 */
  ganzhi: string;
  /** 天干的十神（日柱为「日主」） */
  shiShen: string;
  /** 地支藏干对应的十神 */
  zhiShiShen: string[];
  /** 纳音 */
  naYin: string;
  /** 十二长生（日主在该支的状态） */
  diShi?: string;
}

export interface DaYun {
  startYear: number;
  endYear: number;
  startAge: number;
  endAge: number;
  ganzhi: string;
}

export interface BaziChart {
  /** 四柱 */
  year: Pillar;
  month: Pillar;
  day: Pillar;
  time: Pillar;
  /** 日主（日元）与它的五行 */
  dayMaster: string;
  dayMasterWuXing: WuXing;
  /** 五行统计（按天干 + 地支藏干计权） */
  wuXingCount: Record<WuXing, number>;
  /** 偏弱/偏旺的五行（用于取喜忌的雏形） */
  weakest: WuXing;
  strongest: WuXing;
  /** 胎元 / 命宫 / 身宫 */
  taiYuan: string;
  mingGong: string;
  shenGong: string;
  /** 大运（十年一运） */
  daYun: DaYun[];
  /** 起运描述 */
  startLuck: string;
  /** 真太阳时的钟点（八字也按真太阳时定） */
  trueSolarTime: string;
}

/** 天干五行 */
const GAN_WUXING: Record<string, WuXing> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};

/** 地支藏干（本气、中气、余气） */
const ZHI_HIDE_GAN: Record<string, string[]> = {
  子: ['癸'], 丑: ['己', '癸', '辛'], 寅: ['甲', '丙', '戊'], 卯: ['乙'],
  辰: ['戊', '乙', '癸'], 巳: ['丙', '戊', '庚'], 午: ['丁', '己'],
  未: ['己', '丁', '乙'], 申: ['庚', '壬', '戊'], 酉: ['辛'],
  戌: ['戊', '辛', '丁'], 亥: ['壬', '甲'],
};

/**
 * 十神：以日主为我，判断另一天干与我的关系。
 * 规则（同五行／生我／我生／克我／我克，再分阴阳同异）：
 *   同我：比肩(同性) / 劫财(异性)
 *   生我：偏印(同性) / 正印(异性)
 *   我生：食神(同性) / 伤官(异性)
 *   我克：偏财(同性) / 正财(异性)
 *   克我：七杀(同性) / 正官(异性)
 */
const SHENG: Record<WuXing, WuXing> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE: Record<WuXing, WuXing> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

export function shiShenOf(dayMaster: string, other: string): string {
  const me = GAN_WUXING[dayMaster];
  const it = GAN_WUXING[other];
  if (!me || !it) return '';
  const sameYinYang = isYang(dayMaster) === isYang(other);

  if (me === it) return sameYinYang ? '比肩' : '劫财';
  if (SHENG[it] === me) return sameYinYang ? '偏印' : '正印';
  if (SHENG[me] === it) return sameYinYang ? '食神' : '伤官';
  if (KE[me] === it) return sameYinYang ? '偏财' : '正财';
  if (KE[it] === me) return sameYinYang ? '七杀' : '正官';
  return '';
}

function isYang(gan: string): boolean {
  // 甲丙戊庚壬 为阳
  return ['甲', '丙', '戊', '庚', '壬'].includes(gan);
}

/** 统计五行：天干各计 1，地支藏干按本气 1 / 中气 0.5 / 余气 0.3 计 */
function countWuXing(pillars: Pillar[]): Record<WuXing, number> {
  const count: Record<WuXing, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const weights = [1, 0.5, 0.3];
  for (const p of pillars) {
    count[GAN_WUXING[p.gan]] += 1;
    const hides = ZHI_HIDE_GAN[p.zhi] ?? [];
    hides.forEach((g, i) => {
      count[GAN_WUXING[g]] += weights[i] ?? 0.3;
    });
  }
  // 保留一位小数
  for (const k of Object.keys(count) as WuXing[]) {
    count[k] = Math.round(count[k] * 10) / 10;
  }
  return count;
}

/** 排八字 */
export function buildBazi(birth: BirthInfo): BaziChart {
  // 八字同样用真太阳时定时辰
  const solar = buildTrueSolarTime(birth);
  const [h, mi] = solar.trueSolarTime.split(':').map((v) => Number(v));
  const [y, m, d] = birth.birthDate.split('-').map((v) => Number(v));

  const solarObj = Solar.fromYmdHms(y, m, d, h, mi, 0);
  const ba = solarObj.getLunar().getEightChar();

  const dayMaster = ba.getDayGan();
  const makePillar = (
    gan: string,
    zhi: string,
    shiShenGan: string,
    shiShenZhi: string[],
    naYin: string,
    diShi?: string,
  ): Pillar => ({
    gan,
    zhi,
    ganzhi: gan + zhi,
    shiShen: shiShenGan,
    zhiShiShen: shiShenZhi,
    naYin,
    diShi,
  });

  const yearP = makePillar(
    ba.getYearGan(), ba.getYearZhi(), ba.getYearShiShenGan(),
    ba.getYearShiShenZhi(), ba.getYearNaYin(), ba.getYearDiShi(),
  );
  const monthP = makePillar(
    ba.getMonthGan(), ba.getMonthZhi(), ba.getMonthShiShenGan(),
    ba.getMonthShiShenZhi(), ba.getMonthNaYin(), ba.getMonthDiShi(),
  );
  const dayP = makePillar(
    ba.getDayGan(), ba.getDayZhi(), '日主',
    ba.getDayShiShenZhi(), ba.getDayNaYin(), ba.getDayDiShi(),
  );
  const timeP = makePillar(
    ba.getTimeGan(), ba.getTimeZhi(), ba.getTimeShiShenGan(),
    ba.getTimeShiShenZhi(), ba.getTimeNaYin(), ba.getTimeDiShi(),
  );

  const pillars = [yearP, monthP, dayP, timeP];
  const wuXingCount = countWuXing(pillars);
  const sorted = (Object.entries(wuXingCount) as [WuXing, number][]).sort((a, b) => a[1] - b[1]);

  // 大运：1 = 男，0 = 女
  const genderFlag = birth.gender === '女' ? 0 : 1;
  const yun = ba.getYun(genderFlag);
  const daYun: DaYun[] = yun
    .getDaYun()
    .filter((d) => d.getGanZhi())
    .map((d) => ({
      startYear: d.getStartYear(),
      endYear: d.getEndYear(),
      startAge: d.getStartAge(),
      endAge: d.getEndAge(),
      ganzhi: d.getGanZhi(),
    }));

  return {
    year: yearP,
    month: monthP,
    day: dayP,
    time: timeP,
    dayMaster,
    dayMasterWuXing: GAN_WUXING[dayMaster],
    wuXingCount,
    weakest: sorted[0][0],
    strongest: sorted[sorted.length - 1][0],
    taiYuan: ba.getTaiYuan(),
    mingGong: ba.getMingGong(),
    shenGong: ba.getShenGong(),
    daYun,
    startLuck: `${yun.getStartYear()} 年 ${yun.getStartMonth()} 个月后起运`,
    trueSolarTime: solar.trueSolarTime,
  };
}

/* ------------------------- 某一年的八字信号 ------------------------- */

export interface YearBazi {
  year: number;
  age: number;
  /** 流年干支 */
  liuNian: string;
  /** 流年天干对日主的十神 */
  liuNianShiShen: string;
  /** 该年所处的大运 */
  daYun?: DaYun;
  /** 该年大运天干对日主的十神 */
  daYunShiShen?: string;
  /** 流年五行与日主的关系短语 */
  note: string;
}

/** 取某一年的八字运限（流年 + 大运） */
export function buildYearBazi(birth: BirthInfo, year: number): YearBazi {
  const bazi = buildBazi(birth);
  const birthYear = Number(birth.birthDate.slice(0, 4));
  const age = year - birthYear;

  // 流年干支：以该年立春为界，这里按该年年中取，避免年初年末边界
  const liuNianObj = Solar.fromYmdHms(year, 6, 1, 12, 0, 0).getLunar();
  const liuNian = liuNianObj.getYearInGanZhi();
  const liuNianGan = liuNianObj.getYearGan();
  const liuNianShiShen = shiShenOf(bazi.dayMaster, liuNianGan);

  const currentDaYun = bazi.daYun.find((d) => year >= d.startYear && year <= d.endYear);
  const daYunShiShen = currentDaYun
    ? shiShenOf(bazi.dayMaster, currentDaYun.ganzhi[0])
    : undefined;

  // 一句可读的说明
  const parts: string[] = [];
  parts.push(`流年${liuNian}（${liuNianShiShen}）`);
  if (currentDaYun) parts.push(`大运${currentDaYun.ganzhi}（${daYunShiShen}）`);

  const isFavorable = ['正财', '偏财', '正印', '偏印', '食神', '正官'].includes(liuNianShiShen);
  parts.push(isFavorable ? '流年十神偏顺' : '流年十神偏逆，宜守');

  return {
    year,
    age,
    liuNian,
    liuNianShiShen,
    daYun: currentDaYun,
    daYunShiShen,
    note: parts.join('，'),
  };
}
