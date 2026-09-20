/**
 * 首页的「提问」列表
 * ---------------------------------------------------------------
 * 结构对齐海外版设计稿（主导人）：首屏不是一张出生信息表，
 * 而是「今天，想问问什么？」+ 几个可以直接点的问题。
 *
 * 为什么这样更好（这是海外版最聪明的一处）：
 *   **用户根本不知道自己该问什么。** 给具体问题比给空表单强得多。
 *
 * 每个问题都映射到我们已有的一个维度或年份，
 * 这样点进去之后，仪表盘会**直接落在对应的维度/年份上**，
 * 而不是让用户再找一遍。
 */

import type { DimensionKey } from './types';

export interface HomeQuestion {
  /** 展示文案 */
  text: string;
  /** 指向哪个维度（点击后仪表盘会切到这个维度） */
  dimension: DimensionKey;
  /** 相对当前年份的偏移（可选，用于"未来某年"这类问题） */
  yearOffset?: number;
  /** 归属哪个时间区（仅用于界面分组，可选） */
  zone?: '过去' | '现在' | '未来';
}

export const HOME_QUESTIONS: HomeQuestion[] = [
  { text: '我今年的事业会不会有转机？', dimension: 'career', yearOffset: 0, zone: '现在' },
  { text: '我的正缘大概什么时候出现？', dimension: 'marriage', yearOffset: 3, zone: '未来' },
  { text: '我现在适合换工作吗？', dimension: 'career', yearOffset: 0, zone: '现在' },
  { text: '我这两年为什么总是存不下钱？', dimension: 'wealth', yearOffset: -1, zone: '过去' },
  { text: '父母的身体我需要特别留意什么吗？', dimension: 'parents', yearOffset: 1, zone: '未来' },
  { text: '我下一段人生转折会在什么时候？', dimension: 'overall', yearOffset: 5, zone: '未来' },
];

/** 把问题编码进地址栏（点进去之后仪表盘会读它） */
export function questionToParams(q: HomeQuestion, currentYear: number): string {
  const params = new URLSearchParams();
  params.set('q', q.text);
  params.set('dim', q.dimension);
  if (q.yearOffset !== undefined) {
    params.set('year', String(currentYear + q.yearOffset));
  }
  return params.toString();
}
