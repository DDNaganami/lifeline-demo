/**
 * 系统回应
 * ---------------------------------------------------------------
 * 用户给出四档反馈后，**系统立刻回一句「我接住了」**——这是闭环里
 * 唯一不能缺、又不需要 AI 的一环。
 *
 * 为什么重要（来自同事的产品判断）：
 *   产品的价值不是"我信你（大师/AI）"，而是"**我信我自己确认过的你**"。
 *   而"确认"需要被回应——反馈了却没有任何回应，闭环就断了。
 *
 * 设计原则：
 *   1. **不用 AI**：用真实排盘结果 + 规则生成，所以是确定的、可解释的、不花钱的
 *   2. **每条回应都要带上具体的依据**（哪一年、哪个大限、哪条四化落哪个宫）
 *      —— 空泛的"感谢反馈"没有价值，用户要的是"你确实懂我在说什么"
 *   3. **不同反馈给不同的下一步**，而不是同一句客套话
 */

import type { FeedbackType } from './types';
import type { YearSignals } from './signals';

export interface SystemResponse {
  /** 一句主回应 */
  headline: string;
  /** 2-3 句解释：系统怎么看这条反馈 */
  detail: string[];
  /** 建议的下一步（可点，也可以忽略） */
  nextStep?: { label: string; action: 'note' | 'ask' | 'continue' | 'checkTime' };
  /** 这条反馈让档案长大了多少（用于强化"越反馈越懂你"） */
  archiveGrowth: string;
}

export interface ResponseContext {
  year: number;
  age: number;
  /** 维度中文名，如「事业」 */
  dimensionLabel: string;
  feedback: FeedbackType;
  signals: YearSignals | undefined;
  /** 已沉淀的材料数（反馈数 + 亲笔经历数） */
  materialCount: number;
  /** 时辰是否可信 */
  timeConfident: boolean;
  /** 这一年的主判断 */
  mainJudgment: string;
}

/** 该年大限落在哪个宫（用于回应的依据句） */
function decadalPhrase(signals?: YearSignals): string {
  if (!signals) return '';
  const h = signals.detail.horoscope;
  const stars = h.decadalStars.map((s) => s.name).join('、');
  const palace = stars ? `${h.decadalPalace}宫（${stars}）` : `${h.decadalPalace}宫`;
  return `大限行至${palace}`;
}

/** 该年最关键的落宫（用于「你这年该看哪里」） */
function keyImpactPhrase(signals?: YearSignals): string {
  if (!signals || signals.palaceImpacts.length === 0) return '';
  const top = signals.palaceImpacts[0];
  // 大限/流年命宫本身的影响，其 mutagen 就叫「大限」「流年」——
  // 直接拼会变成「夫妻宫大限，偏顺」（"大限"重复了一次），所以分开措辞
  if (top.mutagen === '大限' || top.mutagen === '流年') {
    return `${top.mutagen}落在${top.palace}宫，${top.polarity === 'good' ? '偏顺' : '偏紧'}`;
  }
  return `${top.palace}宫${top.mutagen}，${top.polarity === 'good' ? '偏顺' : '偏紧'}`;
}

export function buildSystemResponse(ctx: ResponseContext): SystemResponse {
  const { year, age, dimensionLabel, feedback, signals, materialCount, timeConfident, mainJudgment } = ctx;

  const decadal = decadalPhrase(signals);
  const impact = keyImpactPhrase(signals);
  const basis = [decadal, impact].filter(Boolean).join('，');
  /** 带上年份/年龄/维度，让回应看起来是"针对这一次"而不是通用话术 */
  const subject = `${year} 年（${age} 岁）的${dimensionLabel}`;

  const growth = (delta: number) =>
    `你已沉淀 ${materialCount + delta} 条材料（含反馈与你亲笔写的经历）——每一条都会让后面年份的判断更贴合你。`;

  switch (feedback) {
    case '非常符合':
      return {
        headline: `这条判断站得住，我记下了。`,
        detail: [
          basis
            ? `${subject}依据是：${basis}。你说符合，说明这条路读对了。`
            : `你说${subject}符合，说明这条路读对了。`,
          '后续年份遇到同类结构，我会按这个方向加重判断——你确认过的，比我自己推的更可信。',
        ],
        nextStep: materialCount < 3
          ? { label: '写下这一年实际发生了什么', action: 'note' }
          : { label: '继续核对下一年', action: 'continue' },
        archiveGrowth: growth(1),
      };

    case '部分符合':
      return {
        headline: '对上了一部分，偏差在哪更重要。',
        detail: [
          basis
            ? `${subject}依据是：${basis}。对上的大概是这块，没对上的可能是别处盖过了它。`
            : `对上的大概是这块，没对上的可能是别处盖过了它。`,
          `主判断写的是「${mainJudgment}」——你告诉我是哪一句不像，我就能知道该调哪一层。`,
        ],
        nextStep: { label: '说一下哪部分不像', action: 'note' },
        archiveGrowth: growth(1),
      };

    case '没有印象':
      return {
        headline: '「没有印象」本身就是有用的信息。',
        detail: [
          `它通常有两种来源：${year} 年确实平淡，或者这条${dimensionLabel}判断写得太笼统、无法核对。`,
          timeConfident
            ? '我会把这一年标为「待验证」——等后面遇到同类的事，再回来对照。'
            : '另外，你的出生时辰标注为不确定，这也可能让这一年的判断本来就不准。',
        ],
        nextStep: timeConfident
          ? { label: '写下你还记得的部分', action: 'note' }
          : { label: '去核对出生时辰', action: 'checkTime' },
        archiveGrowth: growth(1),
      };

    case '完全不符合':
      return {
        headline: '这条没对上，我需要排除三种可能。',
        detail: [
          '① 判断本身写错了；② 这一年被更外部的事情主导；③ 出生时辰不准，导致命盘本身就偏了。',
          timeConfident
            ? `你的时辰是确定的，所以前两种可能更大——${year} 年你实际记得的是什么？`
            : '你的时辰标注为不确定，第三种可能不小——时辰决定命宫，命宫错了整张盘都会不同。',
        ],
        nextStep: timeConfident
          ? { label: '写下那一年实际发生了什么', action: 'note' }
          : { label: '去核对出生时辰', action: 'checkTime' },
        archiveGrowth: growth(1),
      };

    default:
      return {
        headline: '已记下。',
        detail: ['我会把这条反馈带进后续的判断里。'],
        archiveGrowth: growth(1),
      };
  }
}

/** 回应里要显示的依据行（给界面用） */
export function responseBasis(signals?: YearSignals): string {
  if (!signals) return '';
  const h = signals.detail.horoscope;
  const parts = [
    `大限 ${h.decadalRange[0]}-${h.decadalRange[1]} 岁 · ${h.decadalPalace}宫`,
    `流年 ${h.yearlyStem}${h.yearlyBranch}`,
  ];
  const mut = h.yearlyMutagens.map((m) => `${m.star}化${m.mutagen}`).join('、');
  if (mut) parts.push(`流年四化：${mut}`);
  return parts.join('　·　');
}
