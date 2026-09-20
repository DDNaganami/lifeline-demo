/**
 * 追问回答层
 * ---------------------------------------------------------------
 * ⚠️ 当前**没有接模型**。这个模块用一个「答案引擎」把**真实排盘数据**
 *    组织成一段有针对性的回答——它读得懂问题在问哪个领域，
 *    也会引用这一年的宫位与四化。
 *
 * 为什么不直接写"示例回答"就交差：
 *   用户问的是具体的事，回一段通用话术等于没有回答。
 *   而且"系统回应"那一环已经是规则生成的了，追问没理由更差。
 *
 * 接真实模型时只需要改 `answerQuestion()` 里的一处：
 *   把 buildLocalAnswer() 换成一次模型调用，
 *   提示词直接用 `answerPrompt()` 生成（它已经把排盘上下文拼好了）。
 * 界面、配额、存储都不用动。
 */

import type { DimensionKey, FeedbackType } from './types';
import type { YearSignals } from './signals';

export interface AskContext {
  /** 当前锁定的年份 / 年龄 / 维度 */
  year: number;
  age: number;
  dimension: DimensionKey;
  signals?: YearSignals;
  /** 这一年的主判断 */
  mainJudgment: string;
  /** 用户在这一年给的反馈 */
  feedback?: FeedbackType;
  /** 用户亲笔写下的经历 */
  note?: string;
  /** 出生信息摘要（用于"时辰不确定"这类提醒） */
  birthTimeConfident: boolean;
}

export interface AskAnswer {
  /** 回答正文，分段 */
  paragraphs: string[];
  /** 这句话的依据（给界面折叠显示） */
  basis: string[];
  /** 回答来源：当前只有本地引擎；将来接模型后为 'model' */
  provider: 'local' | 'model';
}

/** 维度 → 关心的宫位 */
const DIMENSION_PALACES: Record<DimensionKey, string[]> = {
  overall: ['命宫', '福德', '迁移'],
  career: ['官禄', '命宫', '迁移'],
  wealth: ['财帛', '田宅', '官禄'],
  marriage: ['夫妻', '子女', '命宫'],
  parents: ['父母', '田宅', '兄弟'],
  health: ['疾厄', '福德', '命宫'],
};

const DIMENSION_LABEL: Record<DimensionKey, string> = {
  overall: '整体',
  career: '事业',
  wealth: '钱与资源',
  marriage: '感情与家庭',
  parents: '父母与长辈',
  health: '身体',
};

/** 问题里的关键词 → 维度（用于判断用户实际在问哪个领域） */
const KEYWORDS: [RegExp, DimensionKey][] = [
  [/工作|职业|事业|升职|跳槽|创业|老板|公司|岗位|转行|考试|读研|留学/, 'career'],
  [/钱|财|收入|工资|存钱|投资|买房|房贷|债|亏|赚|生意/, 'wealth'],
  [/感情|婚姻|结婚|离婚|对象|伴侣|恋爱|分手|相亲|正缘|喜欢|异地/, 'marriage'],
  [/父母|爸|妈|长辈|家里|家人|老人|养老|婆婆|岳母/, 'parents'],
  [/身体|健康|生病|睡|累|体检|医院|手术|怀|情绪|焦虑|抑郁/, 'health'],
];

/** 从问题里推断它在问哪个领域；问不出来就用当前维度 */
export function dimensionOfQuestion(question: string, fallback: DimensionKey): DimensionKey {
  for (const [re, dim] of KEYWORDS) {
    if (re.test(question)) return dim;
  }
  return fallback;
}

/** 这个问题是不是在问"什么时候" */
function isWhenQuestion(q: string): boolean {
  return /什么时候|多久|几年|哪一年|何时|还要等/.test(q);
}

/** 是不是在问"要不要做某个决定" */
function isShouldQuestion(q: string): boolean {
  return /要不要|该不该|能不能|可不可以|适合|应该/.test(q);
}

/** 是不是在问"为什么" */
function isWhyQuestion(q: string): boolean {
  return /为什么|怎么会|凭什么|怎么老/.test(q);
}

/** 该年的当事宫（从排盘结果里取最相关的一条） */
function keyImpactFor(ctx: AskContext, palaceNames: string[]) {
  const impacts = ctx.signals?.palaceImpacts ?? [];
  for (const name of palaceNames) {
    const hit = impacts.find((i) => i.palace === name);
    if (hit) return hit;
  }
  return impacts[0];
}

/** 转成人话的四化说明 */
function mutagenText(im: { palace: string; mutagen: string; polarity: string } | undefined): string {
  if (!im) return '';
  const kind =
    im.mutagen.includes('忌') ? '化忌'
      : im.mutagen.includes('禄') ? '化禄'
        : im.mutagen.includes('权') ? '化权'
          : im.mutagen.includes('科') ? '化科'
            : im.mutagen;
  return `${im.palace}宫被${im.mutagen === '大限' || im.mutagen === '流年' ? im.mutagen : kind}引动`;
}

/* ------------------------- 本地答案引擎 ------------------------- */

function buildLocalAnswer(question: string, ctx: AskContext): AskAnswer {
  const dim = dimensionOfQuestion(question, ctx.dimension);
  const label = DIMENSION_LABEL[dim];
  const palaces = DIMENSION_PALACES[dim];
  const key = keyImpactFor(ctx, palaces);
  const h = ctx.signals?.detail.horoscope;
  const bazi = ctx.signals?.detail.bazi;

  const paragraphs: string[] = [];
  const basis: string[] = [];

  /* ① 先接住问题：确认它在问什么 */
  const askKind = isWhenQuestion(question)
    ? 'when'
    : isShouldQuestion(question)
      ? 'should'
      : isWhyQuestion(question)
        ? 'why'
        : 'what';
  paragraphs.push(
    askKind === 'when'
      ? `你问的是「什么时候」。${label}这件事，我不给你一个月份——**给你一个位置**：${ctx.year} 年。`
      : askKind === 'should'
        ? `你问的是「该不该」。要回答这个，得先看这一年的盘面是什么结构。`
        : askKind === 'why'
          ? `你问的是「为什么」。这类问题通常不是运气问题，是结构问题。`
          : `你问的是${label}。先看这一年的盘面。`,
  );

  /* ② 盘面：当事宫被什么引动 */
  if (key) {
    const good = key.polarity === 'good';
    paragraphs.push(
      good
        ? `看盘：${mutagenText(key)}，方向偏顺。具体说，${key.palace}宫这一年是**有抓手**的——想动的事，阻力比往年少。`
        : `看盘：${mutagenText(key)}，方向偏紧。${key.palace}宫这一年不是"没机会"，而是**用力的地方容易错**——同样一份力气，用在别处收益更大。`,
    );
    basis.push(`${key.palace}宫 · ${key.mutagen} · 权重 ${key.weight.toFixed(1)}（${good ? '吉' : '凶'}）`);
  } else {
    paragraphs.push(
      `看盘：${ctx.year} 年${palaces[0]}宫没有被四化直接引动。这意味着${label}这一年**不是主线**——不是坏事，是不必在上面耗太多神。`,
    );
    basis.push(`${palaces[0]}宫未被四化引动`);
  }

  /* ③ 大限：十年尺度的位置 */
  if (h) {
    const stage = h.decadalPalaceNameInCycle || h.decadalPalace;
    paragraphs.push(
      `大限上看，你现在走在 ${h.decadalRange[0]}-${h.decadalRange[1]} 岁这一步（${h.decadalPalace}宫）。` +
        `十年的时间尺度上，${stage}是这一段的主场——所以${label}的答案，要放在这十年里看，不能只看今年。`,
    );
    basis.push(`大限 ${h.decadalRange[0]}-${h.decadalRange[1]} 岁 · ${h.decadalPalace}宫`);
  }

  /* ④ 按问题类型给可执行的下一步 */
  if (askKind === 'when') {
    paragraphs.push(
      `所以"什么时候"这个问题的答案不是某个月，而是：**等${palaces[0]}宫再被吉化的时候。** ` +
        `在那之前，你要做的不是等，是把现在这段的位置站稳——时机来的时候，得有个接得住的位置。`,
    );
  } else if (askKind === 'should') {
    paragraphs.push(
      key && key.polarity === 'good'
        ? `所以：可以做，但**别一下子全押**。盘面偏顺的意思不是"没有风险"，是"试错的代价比较低"。先小步动，看反应。`
        : `所以：**现在不是动的时候。** 不是这件事不对，是时机不对。盘面偏紧的年份里，同一个决定和三年后做，结果会差很远。`,
    );
  } else if (askKind === 'why') {
    paragraphs.push(
      `所以"为什么"的答案通常不是某一件具体的事，而是**结构**：` +
        `这一段的盘面本来就在这个方向上吃力。知道是结构问题，你就不用再怀疑是不是自己不够努力。`,
    );
  } else {
    paragraphs.push(
      `所以这一年${label}上的重点：**${key && key.polarity === 'good' ? '把机会落地，别只停在想法上' : '守住基本盘，别在压力下做决定'}**。`,
    );
  }

  /* ⑤ 时辰不确定时必须说清楚——这是最容易让整张盘偏掉的地方 */
  if (!ctx.birthTimeConfident) {
    paragraphs.push(
      `还有一件事我得先说：**你的出生时辰标为不确定**。时辰决定命宫，命宫错了，上面这些判断整张都会偏。` +
        `如果你能从出生证明或长辈那里问到准确时间，回来改一下，判断会准得多。`,
    );
    basis.push('⚠️ 出生时辰不确定，以上判断可能整体偏移');
  }

  /* ⑥ 引用用户自己的经历（如果有），这是产品最特别的地方 */
  if (ctx.note) {
    paragraphs.push(
      `你自己写过：「${ctx.note.length > 40 ? ctx.note.slice(0, 40) + '…' : ctx.note}」。` +
        `——这句话比我的判断更可信。后面再遇到同类年份，我会把它一起带进来看。`,
    );
    basis.push('引用了你自己写下的经历');
  }

  /* ⑦ 八字侧的一句补充 */
  if (bazi) {
    basis.push(`八字：${bazi.note}`);
    if (bazi.liuNianShiShen) {
      paragraphs.push(
        `八字这边，${bazi.liuNian}年天干对日主是「${bazi.liuNianShiShen}」` +
          `${ctx.signals?.consistency === '一致' ? '，与紫微方向一致——两个体系互相印证，这条判断比较稳。' : ctx.signals?.consistency === '冲突' ? '，与紫微方向**不一致**。这种情况我倾向于"两边各看一半"：不激进，也不保守。' : '，方向不算明显，所以这一年的自由度比较大。'}`,
      );
    }
  }

  return { paragraphs, basis, provider: 'local' };
}

/**
 * 把上下文拼成提示词。
 * 将来接模型时直接用它——这也是**避免模型胡说**的关键：
 * 让模型只负责"把已算出的盘面讲成人话"，不允许它自己推命理。
 */
export function answerPrompt(question: string, ctx: AskContext): string {
  const h = ctx.signals?.detail.horoscope;
  const bazi = ctx.signals?.detail.bazi;
  return [
    '你是一位务实的命理顾问。用户已经排好盘，你只负责把下面的排盘结果讲成人话。',
    '',
    '**硬性要求**：',
    '1. 只能使用下面给出的盘面事实，不要自己推算、不要新增宫位或星曜',
    '2. 不要说"一定会""绝对"，用"这一年偏""倾向"这类程度词',
    '3. 不要许诺具体月份，给"位置"而不是"日期"',
    '4. 最后给一个可执行的下一步',
    '',
    `用户问题：${question}`,
    '',
    '盘面事实：',
    `- 年份 / 年龄：${ctx.year} 年 / ${ctx.age} 岁`,
    `- 维度：${DIMENSION_LABEL[dimensionOfQuestion(question, ctx.dimension)]}`,
    h ? `- 大限：${h.decadalRange[0]}-${h.decadalRange[1]} 岁 · ${h.decadalPalace}宫` : '',
    h ? `- 流年：${h.yearlyStem}${h.yearlyBranch}` : '',
    h ? `- 流年四化：${h.yearlyMutagens.map((m) => `${m.star}化${m.mutagen}`).join('、')}` : '',
    h ? `- 大限四化：${h.decadalMutagens.map((m) => `${m.star}化${m.mutagen}`).join('、')}` : '',
    bazi ? `- 八字：${bazi.note}` : '',
    `- 本年主判断：${ctx.mainJudgment}`,
    `- 两体系是否印证：${ctx.signals?.consistency ?? '未知'}`,
    ctx.feedback ? `- 用户对这一年的反馈：${ctx.feedback}` : '',
    ctx.note ? `- 用户亲笔写下的经历：${ctx.note}` : '',
    ctx.birthTimeConfident ? '' : '- ⚠️ 出生时辰不确定，必须提醒用户判断可能整体偏移',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 回答入口。
 *
 * **接真实模型时改这里**：把 buildLocalAnswer 换成模型调用，
 * 提示词用 answerPrompt()。其余代码不用动。
 */
export async function answerQuestion(question: string, ctx: AskContext): Promise<AskAnswer> {
  // 当前：本地引擎（不联网、不花钱、确定）
  return buildLocalAnswer(question, ctx);
}
