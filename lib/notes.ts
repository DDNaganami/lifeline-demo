/**
 * 追问文案生成
 * ---------------------------------------------------------------
 * 用户给某一年打完四档反馈后，自动带着这个问题去找「陈老师」：
 * 为什么对得上、为什么对不上、为什么没有印象。
 * 问题会随反馈档位与当年趋势变化，避免每次都是同一句话。
 */

import type { FeedbackType, Trend } from './types';

/** 从哪几个角度追问，由「趋势」决定 */
const TREND_ANGLE: Record<Trend, string> = {
  上升: '这一年是往上走的年份',
  下降: '这一年是偏耗、偏吃力的年份',
  震荡: '这一年是好坏交替、时好时坏的年份',
  转折: '这一年是分界点，前后会明显不一样',
};

const OPENERS: Record<FeedbackType, string[]> = {
  非常符合: [
    '这一年我标注为「非常符合」。为什么它会对得上？',
    '这一年我核对下来是「非常符合」。判断准在哪里？',
  ],
  部分符合: [
    '这一年我标注为「部分符合」。对上的部分是哪一块，没对上的又是哪一块？',
    '这一年我核对为「部分符合」。主要偏差出在哪里？',
  ],
  没有印象: [
    '这一年我「没有印象」。是我记不清，还是这一年的判断本来就不明显？',
    '这一年我标注为「没有印象」。这种平淡年份在整体曲线里该怎么看？',
  ],
  完全不符合: [
    '这一年我核对下来是「完全不符合」。是判断本身错了，还是我把这一年记错了？',
    '这一年我标注为「完全不符合」。这条判断在什么条件下才会成立？',
  ],
};

/**
 * 生成建议追问语。同一份输入结果稳定。
 * @param year 年份
 * @param age 当年年龄
 * @param feedback 用户给的反馈
 * @param trend 该年该维度的趋势
 * @param dimensionLabel 维度中文名
 */
export function buildSuggestion(
  year: number,
  age: number,
  feedback: FeedbackType,
  trend: Trend,
  dimensionLabel: string,
): string {
  const openers = OPENERS[feedback];
  // 用年份和反馈档位做一个稳定选择，避免每次刷新都变
  const index = (year + feedback.length) % openers.length;
  return `${openers[index]}（${year} 年 · ${age} 岁 · ${dimensionLabel} · ${TREND_ANGLE[trend]}）`;
}

/** 用户跳过时的默认说明，用于档案里留痕 */
export const SKIPPED_NOTE = '（这一年先不写）';
