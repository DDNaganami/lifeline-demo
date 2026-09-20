/**
 * LifeLine 人生战略曲线 —— 第一阶段原型数据类型
 * 说明：本文件只定义「数据长什么样」，不含任何计算逻辑。
 */

/* ------------------------- 用户信息 ------------------------- */

/** 四档反馈 */
export type FeedbackType = '非常符合' | '部分符合' | '没有印象' | '完全不符合';

export const FEEDBACK_OPTIONS: FeedbackType[] = [
  '非常符合',
  '部分符合',
  '没有印象',
  '完全不符合',
];

/** 出生信息（首页表单填写） */
export interface BirthInfo {
  name?: string;
  gender: '男' | '女' | '其他';
  /** YYYY-MM-DD */
  birthDate: string;
  /** 时辰，例如 "午时 11:00-13:00"，也允许 "不确定" */
  birthTime: string;
  birthPlace: string;
  /**
   * 时辰可信度（可选，兼容旧数据）：
   *   exact   确定 —— 出生证明或长辈明确告知
   *   approx  大概是 —— 只知道上午 / 下午
   *   unknown 不知道 —— 按正午计算
   *
   * 真太阳时校正会改变时辰，进而改变命宫；时辰本身不可靠时，
   * 排出来的盘必须标注不确定，否则用户会误以为结论是确定的。
   */
  birthTimeConfidence?: 'exact' | 'approx' | 'unknown';
}

/* ------------------------- 曲线数据 ------------------------- */

/** 趋势方向 */
export type Trend = '上升' | '下降' | '震荡' | '转折';

/** 行动提示 */
export type ActionTip = '推进' | '准备' | '保守' | '重点处理';

/** 六个核心维度 */
export type DimensionKey =
  | 'overall'
  | 'career'
  | 'wealth'
  | 'marriage'
  | 'parents'
  | 'health';

/** 曲线上的一个点（一年一个点） */
export interface LifeLinePoint {
  age: number;
  year: number;
  overall: number;
  career: number;
  wealth: number;
  marriage: number;
  parents: number;
  health: number;
  phase: string;
  trend: Trend;
}

/** 同一年、六个维度的取值（画图与卡片都用它） */
export type DimensionScores = Record<DimensionKey, number>;

/* ------------------------- 年度卡片 ------------------------- */

/** 命理依据：紫微与八字是否互相印证 */
export type Consistency = '一致' | '单信号' | '冲突';

export interface YearCardData {
  year: number;
  age: number;
  /** 所属大限，例如 "24-33 岁 · 事业宫大限" */
  daxian: string;
  phase: string;
  trend: Trend;
  /** 一句主判断，现实语言（**由真实排盘生成**，见 lib/judgment.ts） */
  mainJudgment: string;
  /**
   * 主判断的依据（每一条都能追到排盘上）。
   * 有了它，用户和懂行的人都能看出这句话是从哪来的——
   * 而不是"感觉像抽了一句文案"。
   */
  judgmentBasis?: string[];
  /** 3-6 个按主次排列的可验证事件 */
  events: { text: string; priority: number }[];
  /** 折叠区里的紫微信号 */
  ziweiSignal: string;
  /** 折叠区里的八字信号 */
  baziSignal: string;
  consistency: Consistency;
  actionTip: ActionTip;
}

/* ------------------------- 反馈记录 ------------------------- */

/** 一条反馈：某年 · 某维度 */
export interface FeedbackRecord {
  year: number;
  dimension: DimensionKey;
  feedback: FeedbackType;
  /** 记录时间戳，用于「最近反馈」提示 */
  updatedAt: number;
}

/** 本地存储里的全部反馈，key 形如 "2028:career" */
export type FeedbackMap = Record<string, FeedbackRecord>;

/**
 * 核对档案：用户用自己的话写下「这一年实际发生了什么」。
 * 这是产品最核心的资产——判断可以重算，用户自己的经历不能。
 */
export interface YearNote {
  year: number;
  dimension: DimensionKey;
  text: string;
  /** true 表示用户明确选择「先不写」 */
  skipped: boolean;
  updatedAt: number;
}

/** key 形如 "2028:career" */
export type YearNoteMap = Record<string, YearNote>;

/* ------------------------- 展示用常量 ------------------------- */

export interface DimensionMeta {
  key: DimensionKey;
  label: string;
  /** 该维度的一句话解释，鼠标悬停时显示 */
  hint: string;
}

export const DIMENSIONS: DimensionMeta[] = [
  { key: 'overall', label: '总览', hint: '综合趋势，把六个维度合在一起看' },
  { key: 'career', label: '事业', hint: '工作方向、职位变化、专业积累' },
  { key: 'wealth', label: '财富', hint: '收入结构、现金流、大额支出' },
  { key: 'marriage', label: '婚姻家庭', hint: '伴侣关系、家庭分工、子女议题' },
  { key: 'parents', label: '父母支持', hint: '父母健康、家庭资源、长辈助力' },
  { key: 'health', label: '健康风险', hint: '身体节律、压力水平、需要提前注意的地方' },
];

export const DIMENSION_LABEL: Record<DimensionKey, string> = {
  overall: '总览',
  career: '事业',
  wealth: '财富',
  marriage: '婚姻家庭',
  parents: '父母支持',
  health: '健康风险',
};

/** 当前阶段卡的临时结论文案 */
export interface StageCard {
  age: number;
  year: number;
  daxian: string;
  phase: string;
  trend: Trend;
  summary: string;
}
