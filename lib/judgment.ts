/**
 * 主判断：由真实排盘生成
 * ---------------------------------------------------------------
 * 这是产品逻辑自洽的最后一环。
 *
 * 在这之前：事件（由四化落宫生成）是真的、系统回应是真的、命理依据是真的，
 * 但**卡片最上面那句「主判断」还是按趋势从文案池里抽的**——
 * 于是同一张卡片上，判断是抽的、事件是算的，对不上。
 *
 * 现在的生成方式（每一句都能追到排盘上）：
 *   1. 看**这一维度对应的宫位**这一年被什么引动（禄权科 / 忌）
 *   2. 看**当事宫的星曜庙旺**（庙旺和落陷的意义完全不同）
 *   3. 按**人生阶段**决定措辞（童年说的是环境与家人，不是职业决策）
 *
 * ⚠️ 童年措辞是踩过的坑：曾经给 3 岁的孩子写「这一年的职业决定会决定后面五到十年」。
 *    孩子没有职业决策，判断必须写他能感受到的东西（家人、身体、环境变化）。
 */

import type { DimensionKey } from './types';
import type { YearSignals, PalaceImpact } from './signals';

/** 维度 → 主宫位 */
const DIMENSION_PALACE: Record<DimensionKey, string> = {
  overall: '命宫',
  career: '官禄',
  wealth: '财帛',
  marriage: '夫妻',
  parents: '父母',
  health: '疾厄',
};

const DIMENSION_LABEL: Record<DimensionKey, string> = {
  overall: '整体',
  career: '事业',
  wealth: '财富',
  marriage: '婚姻家庭',
  parents: '父母支持',
  health: '健康',
};

/** 吉方向的判断统一走 PalaceImpact.polarity（由四化性质推出），这里不重复实现 */

export interface JudgmentInput {
  dimension: DimensionKey;
  age: number;
  year: number;
  signals: YearSignals | undefined;
  /** 曲线给的相对趋势（上升/下降/震荡/转折），用作语气 */
  trend: string;
}

export interface JudgmentResult {
  /** 一句话主判断（← 取代原来的文案池抽取） */
  text: string;
  /** 这句话的依据（给界面展示"从哪来"） */
  basis: string[];
}

function isGood(im: PalaceImpact): boolean {
  return im.polarity === 'good';
}

function mutagenWord(m: string): string {
  if (m.includes('禄')) return '化禄';
  if (m.includes('权')) return '化权';
  if (m.includes('科')) return '化科';
  if (m.includes('忌')) return '化忌';
  return m;
}

/**
 * 找到「这一年对这个维度影响最大的那条依据」。
 * 总览是合起来看的，所以取全局影响最大的那条。
 */
function pickKeyImpact(dimension: DimensionKey, impacts: PalaceImpact[]): PalaceImpact | undefined {
  if (impacts.length === 0) return undefined;
  if (dimension === 'overall') return impacts[0];
  const mine = impacts.filter((i) => i.palace === DIMENSION_PALACE[dimension]);
  if (mine.length === 0) return undefined;
  return mine.sort((a, b) => b.weight - a.weight)[0];
}

/** 当事宫主星的庙旺描述 */
function brightnessPhrase(signals: YearSignals | undefined, palace: string): string {
  if (!signals) return '';
  const h = signals.detail.horoscope;
  const stars =
    h.decadalPalace === palace ? h.decadalStars : h.yearlyPalace === palace ? h.yearlyStars : [];
  if (stars.length === 0) return '';
  const strong = stars.filter((s) => ['庙', '旺', '得'].includes(s.brightness ?? ''));
  if (strong.length === 0) return '';
  return `${strong.map((s) => s.name).join('、')}庙旺`;
}

/* ------------------------- 童年：写他能感受到的 ------------------------- */

function judgmentEarly(input: JudgmentInput, im: PalaceImpact | undefined): string {
  const { dimension, year } = input;
  const good = im ? isGood(im) : undefined;

  if (dimension === 'parents' || dimension === 'overall') {
    if (good === true) return `${year} 年家里是托着你的一年，照顾你的人有余力，你被照看得比较稳`;
    if (good === false) return `${year} 年家里的事比较占人手，你可能会被交给别人照看，需要多点耐心`;
    return `${year} 年家里的节奏比较平稳，没什么大事，是安稳长大的一年`;
  }
  if (dimension === 'health') {
    if (good === false) return `${year} 年身体上要多留意，容易反复感冒、过敏或肠胃不适`;
    if (good === true) return `${year} 年身体底子打得好，精力足，吃得下睡得香`;
    return `${year} 年身体状态平稳，作息规律就没什么问题`;
  }
  if (dimension === 'career' || dimension === 'wealth') {
    // 孩子没有职业与收入，写"学业与兴趣"才是他能对照的
    if (good === true) return `${year} 年学东西比较顺，对某件事的兴趣会明显起来`;
    if (good === false) return `${year} 年专注力容易被分散，需要大人帮着把节奏定下来`;
    return `${year} 年学习和兴趣都平平，是打基础的一年`;
  }
  if (dimension === 'marriage') {
    return `${year} 年你和家里人相处的时间最多，安全感主要来自家里`;
  }
  return `${year} 年是平稳长大的一年`;
}

/* ------------------------- 青年：学业与起步 ------------------------- */

function judgmentYoung(input: JudgmentInput, im: PalaceImpact | undefined, bright: string): string {
  const { dimension, year } = input;
  const good = im ? isGood(im) : undefined;

  if (dimension === 'career') {
    if (good === true) return `${year} 年${bright ? bright + '，' : ''}机会比往年少见的清楚，适合主动争取`;
    if (good === false) return `${year} 年方向上的阻力偏大，先把基本功练扎实比急着换路更划算`;
    return `${year} 年事业上以积累为主，暂时看不到明显回报是正常的`;
  }
  if (dimension === 'wealth') {
    if (good === true) return `${year} 年进项比往年顺，适合养成存钱的习惯`;
    if (good === false) return `${year} 年手里留不住钱，先把支出结构理清楚`;
    return `${year} 年收支大致平衡，不必强求`;
  }
  if (dimension === 'marriage') {
    if (good === true) return `${year} 年感情上容易遇到愿意认真相处的人`;
    if (good === false) return `${year} 年感情里消耗多于滋养，别急着确定关系`;
    return `${year} 年感情上比较平淡，重心还是在自己身上`;
  }
  if (dimension === 'parents') {
    if (good === true) return `${year} 年家里给的支持比较实在，可以借力`;
    if (good === false) return `${year} 年家里的期待和自己的打算容易冲突，需要好好沟通`;
    return `${year} 年和家里的相处比较平稳`;
  }
  if (dimension === 'health') {
    if (good === false) return `${year} 年作息和情绪容易出问题，别用熬夜换进度`;
    return `${year} 年精力够用，趁这个阶段把运动习惯立起来`;
  }
  if (good === true) return `${year} 年整体往上走，是适合主动出手的一年`;
  if (good === false) return `${year} 年整体偏耗，把目标缩小反而更容易拿到结果`;
  return `${year} 年整体平稳，按自己的节奏走就行`;
}

/* ------------------------- 成年：工作与责任 ------------------------- */

function judgmentAdult(input: JudgmentInput, im: PalaceImpact | undefined, bright: string): string {
  const { dimension, year } = input;
  const good = im ? isGood(im) : undefined;

  if (dimension === 'career') {
    if (good === true)
      return `${year} 年${bright ? bright + '，' : ''}事业上是有抓手的一年，值得主动争取`;
    if (good === false) return `${year} 年事业上的阻力偏实在，宜守不宜攻，别在压力下做大决定`;
    return `${year} 年事业上没有明显推动，把手上确定的事做扎实就好`;
  }
  if (dimension === 'wealth') {
    if (good === true) return `${year} 年资金周转比往年宽松，适合做长期安排`;
    if (good === false) return `${year} 年支出结构偏紧，大额决策宜缓不宜急`;
    return `${year} 年财务上大致持平，重点是别做超出承受能力的决定`;
  }
  if (dimension === 'marriage') {
    if (good === true) return `${year} 年关系里有明确的正面变化，适合把长期安排谈清楚`;
    if (good === false) return `${year} 年关系里积累的情绪比往年少见的明显，需要主动留出沟通时间`;
    return `${year} 年关系里两个人各忙各的，需要有意识地留出共同时间`;
  }
  if (dimension === 'parents') {
    if (good === true) return `${year} 年长辈这边给的支持比较实在，可以借力`;
    if (good === false) return `${year} 年父母这边需要你出力，建议提前安排时间和预算`;
    return `${year} 年和上一代的相处比较平稳，保持固定联系最有效`;
  }
  if (dimension === 'health') {
    if (good === false) return `${year} 年身体在提醒你减速，睡眠和情绪要排在任务前面`;
    return `${year} 年身体状态支持你承担更重的任务，趁这一年打基础`;
  }
  if (good === true) return `${year} 年整体条件配合，重要的事适合在这一年落定`;
  if (good === false) return `${year} 年整体偏耗，重点不是扩张而是守住基本盘`;
  return `${year} 年整体平稳，适合把长线的事往前推一点`;
}

/**
 * 生成主判断。
 * 每一步都能追溯到排盘：宫位 → 四化 → 庙旺 → 措辞。
 */
export function buildJudgment(input: JudgmentInput): JudgmentResult {
  const { dimension, age, signals } = input;
  const impacts = signals?.palaceImpacts ?? [];
  const key = pickKeyImpact(dimension, impacts);
  const palace = DIMENSION_PALACE[dimension];

  const bright = key ? brightnessPhrase(signals, key.palace) : '';

  let text: string;
  if (age <= 12) text = judgmentEarly(input, key);
  else if (age <= 32) text = judgmentYoung(input, key, bright);
  else text = judgmentAdult(input, key, bright);

  /* 依据：让用户/懂行的人都看得出这句话从哪来 */
  const basis: string[] = [];
  if (key) {
    const mut = mutagenWord(key.mutagen);
    // 「大限」「流年」这两个 mutagen 本身已经说明来源，不用再加"化"
    const mutDesc = key.mutagen === '大限' || key.mutagen === '流年' ? key.mutagen : `流年/大限${mut}`;
    basis.push(`${key.palace}宫被${mutDesc}引动（${key.polarity === 'good' ? '吉' : '凶'}，权重 ${key.weight.toFixed(1)}）`);
  } else {
    basis.push(`${DIMENSION_LABEL[dimension]}对应的${palace}宫这一年没有被四化直接引动，所以判断以平稳为主`);
  }
  if (bright) basis.push(`当事宫主星${bright}`);

  const h = signals?.detail.horoscope;
  if (h) {
    basis.push(`大限 ${h.decadalRange[0]}-${h.decadalRange[1]} 岁 · ${h.decadalPalace}宫 · 流年 ${h.yearlyStem}${h.yearlyBranch}`);
  }

  return { text, basis };
}

/**
 * 一致性自检：主判断的吉凶方向应当与当事宫的四化方向一致。
 * 用于测试——如果这两者矛盾，说明判断和排盘脱节了。
 */
export function judgmentDirection(input: JudgmentInput): 'good' | 'bad' | 'neutral' {
  const impacts = input.signals?.palaceImpacts ?? [];
  const key = pickKeyImpact(input.dimension, impacts);
  if (!key) return 'neutral';
  return isGood(key) ? 'good' : 'bad';
}
