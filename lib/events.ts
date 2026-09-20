/**
 * 事件池：由「四化落在哪个宫」决定该年会发生哪类事
 * ---------------------------------------------------------------
 * 这是让年度卡片真正与排盘同源的关键一层。
 *
 * 斗数的基本读法：星曜化禄/权/科/忌，落在哪个宫，那个宫代表的生活领域就被"引动"。
 *   宫位 → 生活领域：
 *     命宫   本人、整体状态
 *     财帛宫 收入、支出、资金
 *     官禄宫 工作、职位、事业
 *     夫妻宫 伴侣、婚姻
 *     父母宫 长辈、家庭资源
 *     疾厄宫 身体、压力
 *
 * 因此：**忌落财帛宫 → 这一年财务领域有压力；禄落官禄宫 → 事业上有机会。**
 * 事件就按这个逻辑生成，而不是从文案池里随机抽。
 *
 * 每种情况都写两套口气（由产品决定用哪套，界面上可切换）：
 *   soft   温和提醒 —— 符合行业习惯，容易被接受
 *   direct 直接事件 —— 更具体，但命中时更有冲击力
 */

import type { DimensionKey } from './types';

export type EventTone = 'soft' | 'direct';

/** 四化落在某宫时，该领域是"顺"还是"逆" */
export type Polarity = 'good' | 'bad';

export interface EventItem {
  text: string;
  /** 主次：1 为最主要 */
  priority: number;
  /** 来自哪个宫、哪个四化（便于界面标注依据） */
  source: { palace: string; mutagen: string };
}

/** 宫位 → 对应哪个维度 */
export const PALACE_DIMENSION: Record<string, DimensionKey> = {
  命宫: 'overall',
  财帛: 'wealth',
  官禄: 'career',
  夫妻: 'marriage',
  父母: 'parents',
  疾厄: 'health',
};

/** 维度 → 主宫位（用于"总览"时挑选） */
export const DIMENSION_PALACE: Record<DimensionKey, string> = {
  overall: '命宫',
  career: '官禄',
  wealth: '财帛',
  marriage: '夫妻',
  parents: '父母',
  health: '疾厄',
};

type EventText = { soft: string; direct: string };
type PalaceEvents = Record<Polarity, EventText[]>;

/**
 * 事件池：每个宫位 × 吉/凶 × 4 条，每条两套口气。
 * 共 6 宫 × 2 × 4 × 2 = 96 条文案。
 */
export const EVENT_POOL: Record<string, PalaceEvents> = {
  官禄: {
    good: [
      { soft: '工作上得到明确认可或资源倾斜', direct: '拿到升职、加薪，或一个重要项目的主导权' },
      { soft: '职责范围扩大，被交付更重要的任务', direct: '被提拔，或独立负责一条业务线' },
      { soft: '出现新的合作或机会，可以主动争取', direct: '收到挖角、内推，或跳槽的明确机会' },
      { soft: '专业能力被外界注意到，口碑上升', direct: '作品或成果被同行看到，带来新的机会' },
    ],
    bad: [
      { soft: '岗位内容有调整，需要重新适应职责边界', direct: '遇到组织调整、汇报关系变更，或岗位被合并' },
      { soft: '推进受阻，规则或审批变严，宜守不宜攻', direct: '项目被砍、预算收紧，或提案被否' },
      { soft: '与上级或合作方在方向上出现分歧', direct: '和上级或合伙人发生明确冲突' },
      { soft: '工作强度上升但回报不同步，注意性价比', direct: '工作量明显增加，但收入没有跟着涨' },
    ],
  },
  财帛: {
    good: [
      { soft: '收入结构有改善，进项比往年顺', direct: '收入出现台阶式增长，或拿到一笔额外进项' },
      { soft: '资金周转比往年宽松，适合做长期安排', direct: '手上现金变宽裕，能做一笔计划外的配置' },
      { soft: '有额外的进项来源出现', direct: '副业、投资或奖金带来一笔非工资收入' },
      { soft: '适合整理资产结构，把该固定的固定下来', direct: '完成一次重要的资产调整（置换、提前还贷）' },
    ],
    bad: [
      { soft: '支出结构偏紧，大额决策宜缓不宜急', direct: '遇到一笔计划外的大额支出' },
      { soft: '现金流需要留意，建议留出缓冲', direct: '出现一段现金流紧张、周转吃力的时期' },
      { soft: '投资或合作类事项不宜激进，避免加杠杆', direct: '一笔投资或借款出现亏损或回收困难' },
      { soft: '家庭固定开支上升，需要重新做预算', direct: '家庭开支上台阶（房贷、医疗、教育）' },
    ],
  },
  夫妻: {
    good: [
      { soft: '关系升温，适合把长期安排谈清楚', direct: '确定关系、结婚，或迎来新的家庭成员' },
      { soft: '伴侣在关键事情上给了实质支持', direct: '伴侣为你的决定提供了资源或托底' },
      { soft: '共同面对一件事之后，默契明显变好', direct: '一起处理完一件难事，关系反而更稳' },
      { soft: '适合安排两个人的时间，节奏可以慢一点', direct: '有了一段属于两个人的稳定期' },
    ],
    bad: [
      { soft: '关系里消耗多于滋养，需要主动留出沟通时间', direct: '出现持续的争吵或冷战，甚至考虑分开' },
      { soft: '容易因为琐事积累情绪，建议把分工讲明白', direct: '因为家务、金钱或育儿分工爆发矛盾' },
      { soft: '双方节奏不一致，各忙各的，需要刻意对齐', direct: '两人长期各过各的，关系变淡' },
      { soft: '外部压力容易带到关系里，注意别互相迁怒', direct: '因工作或家庭压力影响到伴侣关系' },
    ],
  },
  父母: {
    good: [
      { soft: '长辈这一年给到的支持比较实在', direct: '父母在资金、房产或照看孩子上给了实质帮助' },
      { soft: '和上一代的沟通变顺，容易被理解', direct: '和父母的关系明显缓和' },
      { soft: '家庭资源在这一年向你倾斜，可以借力', direct: '家里把一笔资源或决定权交给了你' },
      { soft: '适合把家里的旧事理顺，减少后续牵扯', direct: '完成一次家庭层面的重要安排（分家、置换、赡养约定）' },
    ],
    bad: [
      { soft: '父母这边需要你出力，建议提前安排时间和预算', direct: '父母健康或生活出现状况，需要你投入照顾' },
      { soft: '长辈的健康或情绪需要更多关注', direct: '父母住院、手术，或需要长期照护' },
      { soft: '和上一代的分歧这一年比较明显', direct: '因观念或安排与父母发生明确冲突' },
      { soft: '家里的责任开始压到你身上，需要提前规划', direct: '你成为家里做决定、出钱出力的那个人' },
    ],
  },
  疾厄: {
    good: [
      { soft: '身体状态支持你承担更重的任务', direct: '精力明显回升，能扛住高强度的一年' },
      { soft: '精力恢复得比前几年好，适合建立运动习惯', direct: '体检指标变好，或成功调整了作息' },
      { soft: '适合做一次完整体检，把底数摸清', direct: '通过体检发现并处理了一个早期问题' },
      { soft: '生活节奏可以适当加大，但别透支', direct: '身体状态好到可以同时推进多件事' },
    ],
    bad: [
      { soft: '身体在提醒你减速，睡眠和情绪要排在任务前面', direct: '出现持续疲劳、失眠或情绪低落，需要干预' },
      { soft: '疲劳容易积累成问题，建议安排一次完整体检', direct: '体检报告出现需要复查或长期跟踪的指标' },
      { soft: '压力高峰期，注意消化与颈肩腰的负担', direct: '因压力或姿势问题出现明确的疼痛或不适' },
      { soft: '小毛病会反复出现，别硬扛', direct: '需要住院、手术，或因健康被迫停下工作' },
    ],
  },
  命宫: {
    good: [
      { soft: '这一年整体状态向上，适合主动出手', direct: '整体环境配合，重要的事情能在这一年落定' },
      { soft: '个人状态和外部条件同时转好', direct: '个人形象、能力或位置有明显提升' },
      { soft: '适合把重要的事定下来，阻力比往年少', direct: '完成一次身份或角色的提升' },
      { soft: '个人节奏变顺，做事比往年省力', direct: '长期拖延的事在这一年推成了' },
    ],
    bad: [
      { soft: '这一年整体偏耗，重点不是扩张而是守住基本盘', direct: '整体不顺，多件事同时出问题' },
      { soft: '推进速度会慢于预期，把目标缩小反而更容易拿到结果', direct: '计划被打乱，重要的事被迫推迟' },
      { soft: '状态起伏与外部变化都比较大，宜先稳自己', direct: '个人状态低迷，影响判断和人际' },
      { soft: '适合做减法，把不必要的承诺清掉', direct: '因承担过多而疲于应付' },
    ],
  },
};

/**
 * 由「四化落宫」生成该维度的事件。
 *
 * ⚠️ 关键规则（相关性优先）：
 *   每个维度的事件**必须优先来自它自己的宫位**：
 *     事业 ← 官禄宫、财富 ← 财帛宫、婚姻 ← 夫妻宫、
 *     父母 ← 父母宫、健康 ← 疾厄宫、总览 ← 命宫
 *   只有当本宫位事件不够时，才用**其他宫位中"同类领域"**的事件补充。
 *
 *   反例（曾经的 bug）：财富维度里出现"和上一代的沟通变顺"——
 *   原因是父母宫权重高就被优先选中了，但那条和财富毫无关系。
 *   用户会立刻觉得"内容在乱讲"。
 */
/**
 * 儿童（≤12 岁）的独立事件池
 * ---------------------------------------------------------------
 * 为什么不能只靠"替换成人词"：
 *   换掉"上级→老师"之后，剩下的句子仍然是「适合把重要的事定下来」
 *   「个人节奏变顺，做事比往年省力」——这些话对一个 3 岁的孩子毫无意义。
 *   **必须用一套真正属于童年的句子**。
 *
 * 孩子能对照的四类事：家里人、身体、学东西、同学关系。
 */
const CHILD_EVENT_POOL: Record<'family' | 'health' | 'learning', PalaceEvents> = {
  family: {
    good: [
      { soft: '家里这一年比较托着你，照顾你的人有余力', direct: '爸妈这一年有更多时间陪你' },
      { soft: '和家里人的关系比往年亲近', direct: '和爸妈的相处明显变好' },
      { soft: '家里添了让你高兴的变化', direct: '家里有了新的变化（搬家、添人、换环境）' },
      { soft: '长辈这一年对你格外有耐心', direct: '爷爷奶奶或外公外婆这一年带你的时间变多' },
    ],
    bad: [
      { soft: '家里的事比较占人手，你可能要被交给别人照看', direct: '爸妈这一年很忙，你被托给长辈或别人照看的时间变多' },
      { soft: '家里的气氛时紧时松，你会比较敏感', direct: '家里有过一段紧张的日子，你会感觉到' },
      { soft: '照顾你的方式有调整，需要一点时间适应', direct: '换了照顾你的人，或者换了住的地方' },
      { soft: '大人这一年比较累，陪你的时间会少一点', direct: '爸妈工作忙，陪你的时间明显减少' },
    ],
  },
  health: {
    good: [
      { soft: '这一年身体底子打得好，吃得下睡得香', direct: '这一年长得快、精神足，很少生病' },
      { soft: '精力比往年足，爱跑爱动', direct: '运动能力明显进步，精力旺盛' },
      { soft: '作息规律，身体状态稳定', direct: '这一年的作息很好，身体一直不错' },
      { soft: '个子或体力有明显的成长', direct: '这一年明显长高长壮了' },
    ],
    bad: [
      { soft: '这一年身体上要多留意，容易反复感冒或过敏', direct: '这一年生病次数比往年多' },
      { soft: '肠胃或睡眠容易出小状况', direct: '有小毛病反复（肠胃、过敏、睡眠）' },
      { soft: '换季时容易不舒服，注意保暖', direct: '换季那段时间容易生病' },
      { soft: '精力不足的时候比较多，别把日程排太满', direct: '有一段时间总是没精神' },
    ],
  },
  learning: {
    good: [
      { soft: '学东西比较顺，对某件事的兴趣会明显起来', direct: '这一年对某样东西特别着迷' },
      { soft: '这一年在新环境里适应得快', direct: '换了班级或学校，很快就交到朋友' },
      { soft: '有一件你能做好的事被大人注意到了', direct: '某方面的天赋被老师或家人发现' },
      { soft: '和同学相处得比往年顺', direct: '这一年交到了关系很好的朋友' },
    ],
    bad: [
      { soft: '专注力容易被分散，需要大人帮着定节奏', direct: '上课或做功课时容易走神' },
      { soft: '换环境时适应得慢一点，需要多些耐心', direct: '换了班级或学校，有一段时间不太适应' },
      { soft: '和同学之间会有些小摩擦', direct: '和同学闹过矛盾' },
      { soft: '被要求的事情变多，会有点吃力', direct: '功课或课外班变多，觉得累' },
    ],
  },
};

/** 儿童维度 → 用哪一类童年事件 */
const CHILD_DIMENSION_POOL: Record<DimensionKey, 'family' | 'health' | 'learning'> = {
  overall: 'family',
  career: 'learning', // 孩子没有职业，对应的是"学东西"
  wealth: 'learning', // 也没有收入，同样归到成长
  marriage: 'family', // 没有伴侣，对应的是"和家里人"
  parents: 'family',
  health: 'health',
};

/** 儿童事件池的"主宫位"命名（用于来源标注） */
const CHILD_POOL_SOURCE: Record<'family' | 'health' | 'learning', string> = {
  family: '家庭',
  health: '身体',
  learning: '成长',
};

/**
 * 措辞兜底：万一个别句子漏了成人词，这里再换一次。
 * （正常路径不会用到——儿童走的是独立事件池，这里只是保险）
 */
const CHILD_REWRITE: [RegExp, string][] = [
  [/上级|合作方|合伙人/g, '老师'],
  [/岗位|职位/g, '日常安排'],
  [/加班|工作量/g, '功课'],
  [/收入|进项|资金|现金流|加杠杆|投资/g, '零花钱'],
  [/伴侣|另一半|两个人/g, '家里人'],
];

/**
 * 儿童（≤12 岁）没有职业、收入、伴侣。
 * 当某一维度落在这个年龄段的空缺领域时，改用**童年事件池**——
 * 说的都是孩子能对照的事（家里人、身体、学东西、同学）。
 *
 * ⚠️ 这是踩过两次的坑：
 *   第一次是主判断（给 3 岁写职业决策），第二次是事件列表
 *   （给 3 岁写「与上级或合作方在方向上出现分歧」）。两处都必须做年龄适配。
 */
const CHILD_EMPTY_DIMENSIONS: DimensionKey[] = ['career', 'wealth', 'marriage'];

export function buildPalaceEvents(
  palaceImpacts: { palace: string; mutagen: string; polarity: Polarity; weight: number }[],
  dimension: DimensionKey,
  tone: EventTone,
  maxCount: number,
  seed: string,
  /** 年龄：≤12 岁时改用儿童事件池 */
  age?: number,
): EventItem[] {
  const isChild = typeof age === 'number' && age <= 12;
  const effectiveDimension: DimensionKey =
    isChild && CHILD_EMPTY_DIMENSIONS.includes(dimension) ? 'overall' : dimension;
  const primaryPalace = DIMENSION_PALACE[effectiveDimension];
  const out: EventItem[] = [];
  const used = new Set<string>();

  /** 儿童语境下再做一次措辞兜底 */
  const localize = (text: string) => {
    if (!isChild) return text;
    let t = text;
    for (const [re, rep] of CHILD_REWRITE) t = t.replace(re, rep);
    return t;
  };

  /**
   * 儿童走独立的池子：**不掺任何成人句子**。
   * 方向仍由真实排盘决定（四化落宫算出的吉凶），只是换了一套说法。
   */
  if (isChild) {
    const bucket = CHILD_DIMENSION_POOL[dimension];
    // 用该维度对应的真实影响定方向；取不到就用整体影响
    const relevant = palaceImpacts.filter((i) => i.palace === primaryPalace);
    const list = relevant.length > 0 ? relevant : palaceImpacts;
    const good = list.filter((i) => i.polarity === 'good').reduce((s, i) => s + i.weight, 0);
    const bad = list.filter((i) => i.polarity === 'bad').reduce((s, i) => s + i.weight, 0);
    const polarity: Polarity = good >= bad ? 'good' : 'bad';
    const pool = CHILD_EVENT_POOL[bucket][polarity];

    for (let i = 0; i < pool.length && out.length < maxCount; i++) {
      const idx = stableIndex(`${seed}|child|${bucket}|${polarity}|${i}`, pool.length);
      const item = pool[idx];
      if (!item) continue;
      const text = tone === 'soft' ? item.soft : item.direct;
      if (used.has(text)) continue;
      used.add(text);
      out.push({
        text,
        priority: out.length + 1,
        source: { palace: CHILD_POOL_SOURCE[bucket], mutagen: polarity === 'good' ? '吉' : '凶' },
      });
    }
    return out;
  }

  const addFrom = (palace: string, polarity: Polarity, mutagen: string): boolean => {
    const pool = EVENT_POOL[palace]?.[polarity];
    if (!pool) return false;
    for (let k = 0; k < pool.length; k++) {
      const idx = stableIndex(`${seed}|${palace}|${mutagen}|${k}`, pool.length);
      const item = pool[idx];
      if (!item) continue;
      const text = localize(tone === 'soft' ? item.soft : item.direct);
      if (used.has(text)) continue;
      used.add(text);
      out.push({
        text,
        priority: out.length + 1,
        source: { palace, mutagen },
      });
      return true;
    }
    return false;
  };

  /**
   * 顺序很重要（曾经出过 bug：婚姻维度第一条来自命宫）：
   *   1. 本宫位的影响（按净方向，吉凶只出一边）
   *   2. 本宫位兜底事件（当本宫没有四化时，用通用但同领域的事件）
   *   3. 最后才是相关宫位的补充
   * 这样「本维度自己的事」永远排在最前面。
   *
   * ⚠️ 同一宫吉凶只出一边（曾经出过 bug：总览第一条说"适合把重要的事定下来"，
   *   第二条说"这一年整体偏耗"，同一年自相矛盾）。
   *   四化常常吉凶并见，必须按权重汇总出净方向，再只取一边。
   */
  const mineImpacts = palaceImpacts.filter((i) => i.palace === primaryPalace);
  const mineGood = mineImpacts
    .filter((i) => i.polarity === 'good')
    .reduce((s, i) => s + i.weight, 0);
  const mineBad = mineImpacts
    .filter((i) => i.polarity === 'bad')
    .reduce((s, i) => s + i.weight, 0);
  const minePolarity: Polarity = mineGood >= mineBad ? 'good' : 'bad';

  if (mineImpacts.length > 0) {
    const strongest = mineImpacts
      .filter((i) => i.polarity === minePolarity)
      .sort((a, b) => b.weight - a.weight)[0];
    addFrom(primaryPalace, minePolarity, strongest?.mutagen ?? '本宫');
  }

  // 本宫兜底：本宫没有四化（或不够）时，用同领域的通用事件补上
  if (out.length < Math.min(3, maxCount)) {
    const others = EVENT_POOL[primaryPalace]?.[minePolarity] ?? [];
    for (let i = 0; i < others.length && out.length < Math.min(3, maxCount); i++) {
      const idx = stableIndex(`${seed}|fallback|${primaryPalace}|${i}`, others.length);
      const item = others[idx];
      if (!item) continue;
      const text = tone === 'soft' ? item.soft : item.direct;
      if (used.has(text)) continue;
      used.add(text);
      out.push({
        text,
        priority: out.length + 1,
        source: { palace: primaryPalace, mutagen: '本宫' },
      });
    }
  }

  // 相关宫位补充（放在最后，且同样只按净方向取一边）
  const relatedPalaces = [...new Set(
    palaceImpacts
      .filter((i) => i.palace !== primaryPalace && PALACE_IS_RELEVANT(effectiveDimension, i.palace))
      .map((i) => i.palace),
  )];
  for (const palace of relatedPalaces) {
    if (out.length >= maxCount) break;
    const list = palaceImpacts.filter((i) => i.palace === palace);
    const good = list.filter((i) => i.polarity === 'good').reduce((s, i) => s + i.weight, 0);
    const bad = list.filter((i) => i.polarity === 'bad').reduce((s, i) => s + i.weight, 0);
    addFrom(palace, good >= bad ? 'good' : 'bad', '补充');
  }

  return out;
}

/**
 * 判断「非本宫」的影响是否与本维度相关。
 *
 * 规则故意收得很紧——**宁可事件少，也不要答非所问**。
 * 「命宫」是所有维度都安全的补充（它讲的是本人整体状态）；
 * 「父母宫」只归父母支持维度，因为它的文案都是家庭/长辈语境，
 * 放进事业或财富里会显得在乱讲（曾经出现过"财富维度里说和上一代沟通变顺"）。
 */
function PALACE_IS_RELEVANT(dimension: DimensionKey, palace: string): boolean {
  const RELATED: Record<DimensionKey, string[]> = {
    overall: ['命宫', '财帛', '官禄', '夫妻', '父母', '疾厄'],
    career: ['官禄', '命宫'],
    wealth: ['财帛', '官禄', '命宫'],
    marriage: ['夫妻', '命宫'],
    parents: ['父母', '命宫'],
    health: ['疾厄', '命宫'],
  };
  return RELATED[dimension].includes(palace);
}

/** 稳定哈希 → 数组下标（同一输入永远同一结果） */
function stableIndex(seed: string, len: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % Math.max(1, len);
}
