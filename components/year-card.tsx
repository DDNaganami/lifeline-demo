'use client';

import FeedbackButtons from '@/components/feedback-buttons';
import {
  DIMENSION_LABEL,
  type DimensionKey,
  type FeedbackType,
  type Trend,
  type YearCardData,
} from '@/lib/types';
import type { ActionTip } from '@/lib/types';

interface Props {
  card: YearCardData;
  dimension: DimensionKey;
  feedback?: FeedbackType;
  /** 用户为这一年留下的核对档案原文 */
  note?: string;
  onFeedback: (v: FeedbackType) => void;
  onAskChen: () => void;
}

const TREND_STYLE: Record<Trend, { cls: string; icon: string }> = {
  上升: { cls: 'bg-teal-50 text-teal-800 border-teal-200', icon: '↗' },
  下降: { cls: 'bg-rose-50 text-rose-800 border-rose-200', icon: '↘' },
  震荡: { cls: 'bg-slate-100 text-slate-700 border-slate-200', icon: '↕' },
  转折: { cls: 'bg-amber-50 text-amber-800 border-amber-200', icon: '⇄' },
};

const TIP_STYLE: Record<ActionTip, { cls: string; icon: string; note: string }> = {
  推进: { cls: 'border-teal-200 bg-teal-50 text-teal-900', icon: '▶', note: '可以主动加码' },
  准备: { cls: 'border-slate-200 bg-slate-50 text-slate-800', icon: '◐', note: '先打基础，别急' },
  保守: { cls: 'border-rose-200 bg-rose-50 text-rose-900', icon: '⏸', note: '守住基本盘' },
  重点处理: { cls: 'border-amber-200 bg-amber-50 text-amber-900', icon: '★', note: '这件事别拖' },
};

const CONSISTENCY_STYLE: Record<YearCardData['consistency'], string> = {
  一致: 'bg-teal-50 text-teal-800 border-teal-200',
  单信号: 'bg-slate-100 text-slate-700 border-slate-200',
  冲突: 'bg-rose-50 text-rose-800 border-rose-200',
};

export default function YearCard({
  card,
  dimension,
  feedback,
  note,
  onFeedback,
  onAskChen,
}: Props) {
  const trend = TREND_STYLE[card.trend];
  const tip = TIP_STYLE[card.actionTip];
  const events = [...card.events].sort((a, b) => a.priority - b.priority);

  return (
    <section
      aria-label={`${card.year} 年年度卡片`}
      className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)] sm:p-6"
    >
      {/* 顶部：年份 / 年龄 / 大限 / 阶段 */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-2xl font-semibold text-ink">{card.year}</h3>
            <span className="text-sm text-ink-2">{card.age} 岁</span>
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2">
              {DIMENSION_LABEL[dimension]}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-ink-3">
            {card.daxian} · {card.phase}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={'rounded-full border px-3 py-1 text-xs font-medium ' + trend.cls}>
            {trend.icon} 相对前一年：{card.trend}
          </span>
          {feedback && (
            <span className="rounded-full border border-line px-3 py-1 text-xs text-ink-2">
              已反馈：{feedback}
            </span>
          )}
        </div>
      </header>

      {/* 主判断 */}
      <div className="mt-4">
        <p className="text-xs font-medium tracking-wide text-ink-3">主判断</p>
        <p className="mt-1.5 text-lg leading-relaxed text-ink">{card.mainJudgment}</p>
      </div>

      {/* 可验证事件 */}
      <div className="mt-5">
        <p className="text-xs font-medium tracking-wide text-ink-3">
          可验证事件 · {events.length} 条，按主次排列
        </p>
        <ol className="mt-2.5 space-y-2">
          {events.map((e) => (
            <li key={e.text} className="flex items-start gap-3">
              <span
                className={
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ' +
                  (e.priority === 1
                    ? 'bg-accent text-white'
                    : 'border border-line bg-paper text-ink-2')
                }
              >
                {e.priority}
              </span>
              <span className="text-[15px] leading-relaxed text-ink">{e.text}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-ink-3">
          请对着自己的记忆逐条核对，符合与不符合都要记下来。
        </p>
      </div>

      {/* 命理依据：默认收起 */}
      <details className="group mt-5 rounded-xl border border-line bg-paper">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-ink-2">
          <span>命理依据（点开查看）</span>
          <span className="text-ink-3 transition group-open:rotate-180">⌄</span>
        </summary>
        <div className="space-y-3 border-t border-line px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-3">两个信号是否互相印证</span>
            <span
              className={
                'rounded-full border px-2.5 py-0.5 text-xs font-medium ' +
                CONSISTENCY_STYLE[card.consistency]
              }
            >
              {card.consistency}
            </span>
          </div>
          <dl className="space-y-2.5 text-sm">
            <div>
              <dt className="text-xs text-ink-3">紫微信号</dt>
              <dd className="mt-0.5 leading-relaxed text-ink-2">{card.ziweiSignal}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">八字信号</dt>
              <dd className="mt-0.5 leading-relaxed text-ink-2">{card.baziSignal}</dd>
            </div>
          </dl>
          <p className="text-xs text-ink-3">
            原型阶段这些依据为演示文本，正式版会由排盘结果自动生成。
          </p>
        </div>
      </details>

      {/* 行动提示 */}
      <div className={'mt-5 rounded-xl border px-4 py-3 ' + tip.cls}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{tip.icon}</span>
          <span className="text-sm font-medium">行动提示：{card.actionTip}</span>
          <span className="text-xs opacity-80">{tip.note}</span>
        </div>
      </div>

      {/* 四档反馈 */}
      <div className="mt-5 border-t border-line pt-5">
        <FeedbackButtons value={feedback} onChange={onFeedback} />
        {feedback && (
          <p className="mt-3 text-xs leading-relaxed text-ink-2">
            已记下「{feedback}」。
            {note ? '你写的经历也在下面。' : '点下面的按钮，去追问为什么对得上或对不上。'}
          </p>
        )}
      </div>

      {/* 用户自己写的经历 */}
      {note && (
        <div className="mt-4 rounded-xl border border-line bg-paper px-4 py-3">
          <p className="text-xs font-medium text-ink-3">你为这一年留下的经历</p>
          <p className="mt-1 text-sm leading-relaxed text-ink">「{note}」</p>
        </div>
      )}

      {/* 追问入口 */}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button
          type="button"
          onClick={onAskChen}
          className="w-full rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 sm:w-auto"
        >
          问陈老师 · 这一年怎么看
        </button>
        <span className="text-xs text-ink-3">
          带着年份和你的反馈去追问，不用重新解释背景。
        </span>
      </div>
    </section>
  );
}
