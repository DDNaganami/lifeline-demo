/**
 * 每个维度的「命盘基调」
 * ---------------------------------------------------------------
 * 在这之前，六个维度的长期高低是由**出生日期哈希出的随机数**决定的：
 *
 *     const offset = (rng(`${personSeed}|${birthYear}|${dim}`) - 0.5) * 8;
 *
 * 也就是说「你财运天生好」这件事是**掷骰子**决定的，和命盘没有任何关系。
 * 这跟"事件由四化落宫生成、主判断由宫位+庙旺生成"是矛盾的——
 * 同一个产品里，有的地方真算、有的地方掷骰子，用户对比两年就会发现。
 *
 * 现在改成由**对应宫位的星曜庙旺**驱动：
 *   事业 ← 官禄宫    财富 ← 财帛宫    婚姻 ← 夫妻宫
 *   父母 ← 父母宫    健康 ← 疾厄宫    总览 ← 命宫
 *
 * 这是斗数里最基本的读法：某个宫位的星曜庙旺，代表这个领域天生的底子。
 * 庙旺 → 这个领域起手就顺；落陷 → 同样的年纪要费更多力气。
 *
 * ⚠️ 保留年龄曲线：**"健康随年龄下行""事业在中年达峰"是人生规律，与命盘无关**，
 *    所以那部分不动，本模块只负责在年龄曲线上叠加"这个人的底子"。
 */

import { buildChart } from './chart';
import type { BirthInfo, DimensionKey } from './types';

/** 星曜庙旺的分值 */
const BRIGHTNESS: Record<string, number> = {
  庙: 1.0, 旺: 0.8, 得: 0.5, 利: 0.2, 平: 0, 不: -0.4, 陷: -0.8,
};

/** 维度 → 决定它底子的宫位 */
export const DIMENSION_PALACE: Record<DimensionKey, string> = {
  overall: '命宫',
  career: '官禄',
  wealth: '财帛',
  marriage: '夫妻',
  parents: '父母',
  health: '疾厄',
};

/** 某个宫位的主星平均庙旺分（空宫记 0） */
function palaceBrightness(stars: { brightness?: string }[]): number {
  if (stars.length === 0) return 0;
  return stars.reduce((s, st) => s + (BRIGHTNESS[st.brightness ?? '平'] ?? 0), 0) / stars.length;
}

export interface DimensionBase {
  /** 维度 → 基调偏移（约 -6 ~ +6，叠加到年龄曲线上） */
  offsets: Record<DimensionKey, number>;
  /** 维度 → 说明这句话的依据（给界面/日志用） */
  reasons: Record<DimensionKey, string>;
}

/**
 * 算出六个维度的基调偏移。
 *
 * 映射幅度（×6）是保守的：
 *   庙旺满分 +1.0 → +6；落陷 -0.8 → -4.8。
 *   比原来随机数的 ±4 略大，但不会压过年龄曲线本身（幅度约 30 分）。
 */
export function buildDimensionBase(birth: BirthInfo): DimensionBase {
  const chart = buildChart(birth);
  const offsets = {} as Record<DimensionKey, number>;
  const reasons = {} as Record<DimensionKey, string>;

  for (const [dim, palaceName] of Object.entries(DIMENSION_PALACE) as [DimensionKey, string][]) {
    const palace = chart.palaces.find((p) => p.name === palaceName);
    const stars = palace?.majorStars ?? [];
    const score = palaceBrightness(stars);
    offsets[dim] = Math.round(score * 6 * 10) / 10;

    if (stars.length === 0) {
      // 空宫在斗数里要看对宫借星，这里明确说明是简化处理，不假装精确
      reasons[dim] = `${palaceName}宫无主星（空宫），按中性处理`;
    } else {
      const desc = stars.map((s) => `${s.name}${s.brightness ?? '平'}`).join('、');
      const tone = score >= 0.6 ? '底子偏厚' : score <= -0.3 ? '底子偏薄' : '底子中等';
      reasons[dim] = `${palaceName}宫主星${desc}——${tone}`;
    }
  }

  return { offsets, reasons };
}
