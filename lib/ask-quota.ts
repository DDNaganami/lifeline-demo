/**
 * 追问配额（每日 3 次）
 * ---------------------------------------------------------------
 * 为什么要有上限：追问是**唯一有变动成本**的部分（每次调用模型花钱）。
 * 免费不限量在这种功能上会直接变成成本漏洞。
 *
 * 顺带把上限说成一个"设计"而不是"限制"：
 *   一日三问为限。天机不在多，在准——问得越少，答得越重。
 * 这个理由和产品主张是一致的：用户应该拿自己确认过的答案，
 * 而不是无限次地向外要答案。
 *
 * 计数存在浏览器本地（与出生信息、反馈同一套存储方式）。
 * 正式版应放到服务端按账号计，见 docs/开发交接文档.md。
 */

export const ASK_LIMIT = 3;

const STORAGE_KEY = 'lifeline.ask';

interface AskUsage {
  /** 计数所属的日期（YYYY-MM-DD），跨天自动重置 */
  date: string;
  used: number;
}

/** 本地"今天"（用本地日期，不用 UTC——用户感知的是本地的一天） */
export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function read(): AskUsage {
  if (typeof window === 'undefined') return { date: todayKey(), used: 0 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: todayKey(), used: 0 };
    const parsed = JSON.parse(raw) as Partial<AskUsage>;
    // 跨天重置
    if (parsed.date !== todayKey()) return { date: todayKey(), used: 0 };
    return { date: todayKey(), used: Math.max(0, Number(parsed.used) || 0) };
  } catch {
    // 数据坏了就当没用过，不要因为存储问题挡住用户
    return { date: todayKey(), used: 0 };
  }
}

function write(usage: AskUsage): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // 存不进去就算了，不打断使用
  }
}

export interface AskQuota {
  used: number;
  limit: number;
  remaining: number;
  /** 距离重置还有多久的说明（给界面用） */
  resetNote: string;
}

export function getAskQuota(): AskQuota {
  const usage = read();
  const remaining = Math.max(0, ASK_LIMIT - usage.used);
  return {
    used: usage.used,
    limit: ASK_LIMIT,
    remaining,
    resetNote: remaining === 0 ? '明日再问' : `今日还可问 ${remaining} 次`,
  };
}

export function canAsk(): boolean {
  return getAskQuota().remaining > 0;
}

/** 消耗一次。超限时不消耗，返回 false。 */
export function consumeAsk(): boolean {
  const usage = read();
  if (usage.used >= ASK_LIMIT) return false;
  write({ date: usage.date, used: usage.used + 1 });
  return true;
}

/** 仅供测试与调试：清空计数 */
export function resetAskQuota(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略 */
  }
}

/* ------------------------- 上限文案 ------------------------- */

/**
 * 达到上限时说的话。
 *
 * 刻意不说"次数用完了"——那是功能语气，会把用户的注意力引到"限制"上。
 * 说成"今天到此为止"，并把重点放回用户自己身上：这是产品的核心主张。
 */
export const CAP_MESSAGE = {
  headline: '今日三问已尽。',
  lines: [
    '天机不在多，在准。问得越少，答得越重。',
    '今天剩下的时间，不妨把已经拿到的答案放在心里过一遍——',
    '有些事，你其实已经有答案了，只是还没承认。',
  ],
  /** 明天重置的说明 */
  footer: '明日可再问三问。',
};

/** 还剩 1 次时的提醒（比"还剩 1 次"更像人话） */
export const LAST_ONE_MESSAGE = '今日最后一问，想清楚再问。';
