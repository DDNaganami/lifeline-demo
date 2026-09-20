/**
 * 追问用量统计
 * ---------------------------------------------------------------
 * 为什么要单独做：追问是**唯一有变动成本**的功能（每次调用模型花钱），
 * 而 key 是活的——网址被传播出去，成本就会涨。
 * **看不见花销就没法做决定**，所以这一层是必须的。
 *
 * 设计要点：
 *   1. **只累计数字，不记录内容**（不存问题、不存回答、不存 key、不存原始 IP）
 *   2. 落盘成一个 JSON 文件，服务重启后仍能看到历史
 *   3. 保留最近 N 天，自动裁剪（避免文件无限长）
 *   4. 控制台每次追问打一行简短用量，方便随手看一眼
 *
 * 正式版应放到数据库并接入账单口径，见 docs/开发交接文档.md。
 */

const fs = require('fs');
const path = require('path');

/** 保留天数 */
const KEEP_DAYS = 60;
/** 控制台提醒阈值：当日调用次数超过这个数就打醒目提示 */
const WARN_ASKS = 100;

const FILE = process.env.ASK_STATS_FILE || path.join(__dirname, 'ask-stats.json');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readAll() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : { days: {} };
  } catch {
    return { days: {} };
  }
}

function writeAll(data) {
  try {
    // 只保留最近 KEEP_DAYS 天
    const dates = Object.keys(data.days).sort();
    for (const d of dates.slice(0, Math.max(0, dates.length - KEEP_DAYS))) {
      delete data.days[d];
    }
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    // 统计失败不能影响追问本身
    console.error('[stats] 写入失败：' + err.message);
  }
}

/**
 * 记一次调用。
 * @param {{prompt_tokens?:number, completion_tokens?:number, reasoning_tokens?:number}} usage
 * @param {{ok:boolean, ms:number, reason?:string}} meta
 */
function record(usage, meta) {
  const data = readAll();
  const d = today();
  if (!data.days[d]) {
    data.days[d] = { asks: 0, ok: 0, failed: 0, tokens: 0, promptTokens: 0, completionTokens: 0, reasonTokens: 0, ms: 0 };
  }
  const row = data.days[d];
  row.asks += 1;
  if (meta.ok) row.ok += 1;
  else row.failed += 1;
  row.ms += Math.max(0, Math.round(meta.ms || 0));

  const p = Number(usage?.prompt_tokens) || 0;
  const c = Number(usage?.completion_tokens) || 0;
  const r = Number(usage?.completion_tokens_details?.reasoning_tokens) || 0;
  row.promptTokens += p;
  row.completionTokens += c;
  row.reasonTokens += r;
  row.tokens += p + c;

  writeAll(data);
  return row;
}

/**
 * 取汇总。返回今天 / 近 7 天 / 近 30 天 / 全部。
 * **估算金额是粗算**，只用于判断量级，不能当账单。
 */
function summary() {
  const data = readAll();
  const dates = Object.keys(data.days).sort();
  const now = today();

  const lastN = (n) => {
    const cut = new Date(Date.now() - (n - 1) * 86400000).toISOString().slice(0, 10);
    return dates.filter((d) => d >= cut);
  };
  const sum = (list) =>
    list.reduce(
      (acc, d) => {
        const r = data.days[d];
        acc.asks += r.asks;
        acc.ok += r.ok;
        acc.failed += r.failed;
        acc.tokens += r.tokens;
        acc.promptTokens += r.promptTokens;
        acc.completionTokens += r.completionTokens;
        acc.reasonTokens += r.reasonTokens;
        acc.ms += r.ms;
        return acc;
      },
      { asks: 0, ok: 0, failed: 0, tokens: 0, promptTokens: 0, completionTokens: 0, reasonTokens: 0, ms: 0 },
    );

  /**
   * 金额粗算。
   * ⚠️ 单价会变，这里是**量级估算**，请以 DeepSeek 后台的账单为准。
   *    按输入 ¥1/百万 token、输出 ¥2/百万 token 估。
   */
  const cost = (s) => ({
    input: (s.promptTokens / 1e6) * 1,
    output: (s.completionTokens / 1e6) * 2,
    total: (s.promptTokens / 1e6) * 1 + (s.completionTokens / 1e6) * 2,
  });

  const sToday = sum([now].filter((d) => data.days[d]));
  const s7 = sum(lastN(7));
  const s30 = sum(lastN(30));
  const sAll = sum(dates);

  return {
    today: { date: now, ...sToday, cost: cost(sToday) },
    last7: { ...s7, cost: cost(s7) },
    last30: { ...s30, cost: cost(s30) },
    all: { days: dates.length, from: dates[0] ?? null, ...sAll, cost: cost(sAll) },
    // 明细：最近 14 天逐日
    daily: dates.slice(-14).map((d) => ({ date: d, ...data.days[d] })),
  };
}

/** 控制台一行简讯（每次追问后打） */
function logLine(row) {
  const msg =
    `[用量] 今日 ${row.asks} 次 · ${row.tokens} token ` +
    `(入 ${row.promptTokens} / 出 ${row.completionTokens}，其中思维链 ${row.reasonTokens})`;
  if (row.asks >= WARN_ASKS) {
    console.warn(`${msg}  ⚠️ 已超过 ${WARN_ASKS} 次，留意账单`);
  } else {
    console.log(msg);
  }
}

module.exports = { record, summary, logLine, FILE, WARN_ASKS };
