/**
 * 人生阶段：由真实大限生成
 * ---------------------------------------------------------------
 * 在这之前，阶段是写死的十个固定年龄段（1-6 家庭成长期、7-12 求学起步期…），
 * 对所有人一样。但真实的大限是**按人算的**：
 *
 *   大限从几岁起运，由**五行局**决定（水二局 2 岁、土五局 5 岁、火六局 6 岁…）
 *   每十年换一宫，顺序由**性别 + 命宫地支**决定（阳男阴女顺行，阴男阳女逆行）
 *
 * 所以同一份出生信息，男女的大限顺序完全不同；不同五行局的起运年龄也不同。
 * 这些都应该体现在阶段上，而不是所有人共用一张表。
 */

import { buildChart } from './chart';

/** 十二宫 → 该宫主导的人生主题（命理口径，不是文案） */
const PALACE_THEME: Record<string, string> = {
  命宫: '自我',
  兄弟: '同辈',
  夫妻: '伴侣',
  子女: '传承',
  财帛: '财务',
  疾厄: '身体',
  迁移: '外部',
  仆役: '人脉',
  官禄: '事业',
  田宅: '家业',
  福德: '内在',
  父母: '长辈',
};

/**
 * 宫位 + 年龄段 → 生活语言。
 *
 * 为什么不能直接按宫名给一个固定说法：
 *   官禄宫在 82-91 岁也出现（十二宫循环），但如果译成「事业确立期」就荒谬了。
 *   同一个宫在不同年龄段说的是不同的事——**必须先看年龄，再看宫位**。
 *
 * 分四段：童年(≤12) / 青年(≤32) / 中年(≤59) / 熟年(≥60)
 */
function phaseName(palace: string, age: number): string {
  const isChild = age <= 12;
  const isYoung = age <= 32;
  const isSenior = age >= 60;

  switch (palace) {
    case '命宫':
      if (isChild) return '被照顾期';
      if (isYoung) return '自我成形期';
      if (isSenior) return '身心安顿期';
      return '自我确立期';
    case '兄弟':
      if (isChild) return '同伴成长期';
      if (isYoung) return '同学朋友期';
      if (isSenior) return '老友往来期';
      return '同辈协作期';
    case '夫妻':
      if (isChild) return '家庭成长期';
      if (isYoung) return '感情成形期';
      if (isSenior) return '相守相伴期';
      return '成家立约期';
    case '子女':
      if (isChild) return '家庭扩展期';
      if (isYoung) return '开始带人期';
      if (isSenior) return '含饴弄孙期';
      return '养育传承期';
    case '财帛':
      if (isChild) return '保障成长期';
      if (isYoung) return '收入起步期';
      if (isSenior) return '积蓄守成期';
      return '财富积累期';
    case '疾厄':
      if (isChild) return '体质奠基期';
      if (isYoung) return '精力管理期';
      if (isSenior) return '养生调护期';
      return '健康管理期';
    case '迁移':
      if (isChild) return '环境适应期';
      if (isYoung) return '外出求学期';
      if (isSenior) return '行旅安顿期';
      return '变动开拓期';
    case '仆役':
      if (isChild) return '朋友圈期';
      if (isYoung) return '人脉建立期';
      if (isSenior) return '人情往来期';
      return '团队协作期';
    case '官禄':
      if (isChild) return '兴趣发掘期';
      if (isYoung) return '职业探索期';
      // 60 岁之后不再是"事业确立"，而是社会角色与经验的延续
      if (isSenior) return '余热传承期';
      return '事业确立期';
    case '田宅':
      if (isChild) return '家庭环境期';
      if (isYoung) return '安身期';
      if (isSenior) return '安居守成期';
      return '家业稳定期';
    case '福德':
      if (isChild) return '性情形成期';
      if (isYoung) return '内心探索期';
      if (isSenior) return '颐养心性期';
      return '内在整理期';
    case '父母':
      if (isChild) return '家庭依恋期';
      if (isYoung) return '独立过渡期';
      if (isSenior) return '代际传承期';
      return '反哺长辈期';
    default:
      return '进行期';
  }
}

export interface LifePhase {
  /** 起止年龄（含两端） */
  from: number;
  to: number;
  /** 生活语言的阶段名 */
  name: string;
  /** 命理口径的宫位（懂行的人看这个） */
  palace: string;
  /** 主题词，如「事业」 */
  theme: string;
  /** 这个阶段的主星（空宫留空） */
  stars: string[];
  /**
   * 是否换宫。
   * 大限换宫（财帛→疾厄 这种）比同宫内的年龄推进重要得多——
   * 它是"人生换了主题"，不是"又过了一年"。
   */
  isShift: boolean;
}

/**
 * 由真实排盘生成完整的人生阶段表。
 * 覆盖 1 岁到 90 岁（超出大限表范围的用最后一宫补齐）。
 */
export function buildLifePhases(birth: Parameters<typeof buildChart>[0]): LifePhase[] {
  const chart = buildChart(birth);

  const ranges = chart.palaces
    .filter((p) => (p.decadalRange?.[1] ?? 0) > 0)
    .map((p) => ({
      from: p.decadalRange![0],
      to: p.decadalRange![1],
      palace: p.name,
      stars: p.majorStars.map((s) => s.name),
    }))
    .sort((a, b) => a.from - b.from);

  if (ranges.length === 0) {
    return [{ from: 1, to: 90, name: '人生进程', palace: '命宫', theme: '自我', stars: [], isShift: false }];
  }

  const phases: LifePhase[] = [];

  // 第一个大限之前（比如 5 岁起运，那 1-4 岁要补一段）
  const first = ranges[0];
  if (first.from > 1) {
    phases.push({
      from: 1,
      to: first.from - 1,
      name: '幼年期',
      palace: '（未起运）',
      theme: '成长',
      stars: [],
      isShift: false,
    });
  }

  ranges.forEach((r) => {
    /**
     * 命名用**中位年龄**，不用起始年龄。
     *
     * 踩过的坑：原来传 r.from，于是「22-31 岁」这一大限整段按 22 岁的标准命名，
     * 结果一个 33 岁的人会看到阶段名「感情成形期」——
     * 因为那个大限是 22-31，起始 22 岁算"青年"。
     * 一个大限横跨 10 年，用户可能落在其中任何一年，所以取中位更合理。
     */
    const midAge = Math.round((r.from + r.to) / 2);
    phases.push({
      from: r.from,
      to: r.to,
      name: phaseName(r.palace, midAge),
      palace: r.palace,
      theme: PALACE_THEME[r.palace] ?? '进程',
      stars: r.stars,
      /**
       * 大限换宫 = 人生换主题，比"同宫内又过一年"重要得多。
       * 所以阶段边界处曲线应该有一个**台阶**，而不是平滑过渡。
       */
      isShift: true,
    });
  });

  return phases;
}

/** 取某个年龄落在哪个阶段 */
export function phaseAt(phases: LifePhase[], age: number): LifePhase {
  return (
    phases.find((p) => age >= p.from && age <= p.to) ??
    phases[phases.length - 1]
  );
}

/** 供界面显示：完整的大限说明，如「32-41 岁 · 子女宫大限」 */
export function decadalLabel(phase: LifePhase): string {
  return `${phase.from}-${phase.to} 岁 · ${phase.palace}大限`;
}
