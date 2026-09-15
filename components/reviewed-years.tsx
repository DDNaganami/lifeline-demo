'use client';

import { DIMENSION_LABEL, DIMENSIONS, type DimensionKey, type FeedbackType } from '@/lib/types';

/** 某一年在一个维度上的核对结果 */
export interface ReviewedDimension {
  dimension: DimensionKey;
  feedback: FeedbackType;
  note?: string;
}

/** 某一年已核对的情况 */
export interface ReviewedYear {
  year: number;
  age: number;
  entries: ReviewedDimension[];
}

interface Props {
  rows: ReviewedYear[];
  /** 可以核对的年份总数 */
  reviewableYears: number;
  /** 当前正在看的年份 */
  activeYear: number;
  /** 当前正在看的维度 */
  activeDimension: DimensionKey;
  onPick: (year: number, dimension: DimensionKey) => void;
  /** 还没核对完时，给出下一年 */
  nextYear?: number;
  nextAge?: number;
  onContinue: () => void;
}

function feedbackClass(feedback: FeedbackType): string {
  if (feedback === '非常符合') return 'border-teal-300 bg-teal-50 text-teal-800';
  if (feedback === '部分符合') return 'border-teal-200 bg-teal-50/60 text-teal-700';
  if (feedback === '没有印象') return 'border-slate-200 bg-slate-100 text-slate-600';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

/**
 * 我核对过的年份
 * 按「年份」归并（一年有六个维度，否则清单会变成流水账）。
 * 每一年直接显示六个维度的核对状态，点某个维度就回到那一年那一个维度。
 */
export default function ReviewedYears({
  rows,
  reviewableYears,
  activeYear,
  activeDimension,
  onPick,
  nextYear,
  nextAge,
  onContinue,
}: Props) {
  const doneCount = rows.length;
  const notedCount = rows.reduce(
    (n, r) => n + r.entries.filter((e) => e.note && e.note.length > 0).length,
    0,
  );

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)] sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-medium text-ink">我核对过的年份</h2>
        <p className="text-sm text-ink-3">
          已核对 <span className="font-medium text-ink">{doneCount}</span>/{reviewableYears} 年
          {notedCount > 0 ? ` · 其中 ${notedCount} 个维度留下了你自己的经历` : ''}
        </p>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-ink-3">
        一年有六个维度，可以分开核对。点某个维度就能回到那一年继续看。
      </p>

      {doneCount === 0 ? (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm text-ink-2">
            还没有核对记录。从最近的年份往回走最容易想起来。
          </p>
          {nextYear !== undefined && (
            <button
              type="button"
              onClick={onContinue}
              className="mt-3 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              从 {nextAge} 岁 · {nextYear} 年开始
            </button>
          )}
        </div>
      ) : (
        <ul className="mt-4 space-y-2 border-t border-line pt-4">
          {rows.map((row) => {
            const isActiveYear = row.year === activeYear;
            return (
              <li
                key={row.year}
                className={
                  'rounded-xl border px-3 py-3 transition ' +
                  (isActiveYear ? 'border-accent bg-accent-soft/40' : 'border-line bg-paper')
                }
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-ink">{row.year} 年</span>
                  <span className="text-xs text-ink-3">{row.age} 岁</span>
                  <span className="text-xs text-ink-3">
                    已核对 {row.entries.length}/6 个维度
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DIMENSIONS.map((d) => {
                    const entry = row.entries.find((e) => e.dimension === d.key);
                    if (!entry) {
                      return (
                        <span
                          key={d.key}
                          className="rounded-lg border border-dashed border-line px-2.5 py-1 text-xs text-ink-3"
                        >
                          {d.label} · 待核对
                        </span>
                      );
                    }
                    const isActive =
                      isActiveYear && d.key === activeDimension;
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => onPick(row.year, d.key)}
                        className={
                          'rounded-lg border px-2.5 py-1 text-xs transition hover:opacity-80 ' +
                          feedbackClass(entry.feedback) +
                          (isActive ? ' ring-2 ring-accent/40' : '')
                        }
                        title={`${row.year} 年 · ${d.label} · ${entry.feedback}`}
                      >
                        {d.label} · {entry.feedback}
                        {entry.note ? ' ✎' : ''}
                      </button>
                    );
                  })}
                </div>

                {row.entries
                  .filter((e) => e.note)
                  .map((e) => (
                    <p
                      key={`${e.dimension}-note`}
                      className="mt-2 text-xs leading-relaxed text-ink-2"
                    >
                      <span className="text-ink-3">{DIMENSION_LABEL[e.dimension]}：</span>
                      「{e.note}」
                    </p>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
