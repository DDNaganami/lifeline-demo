'use client';

interface Props {
  /** 下一个还没核对过的年份；全部核对完则为 undefined */
  nextYear?: number;
  nextAge?: number;
  /** 已经核对过几年（按年份算，不按维度） */
  reviewedYears: number;
  /** 总共可以核对的年份数 */
  reviewableYears: number;
  onContinue: () => void;
  onOpenArchive: () => void;
}

/**
 * 继续核对
 * 用户一坐下就知道该点哪一年：永远指向最近一个还没核对过的年份。
 */
export default function ContinueReview({
  nextYear,
  nextAge,
  reviewedYears,
  reviewableYears,
  onContinue,
  onOpenArchive,
}: Props) {
  const percent =
    reviewableYears > 0
      ? Math.min(100, Math.round((reviewedYears / reviewableYears) * 100))
      : 0;
  const done = nextYear === undefined;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[240px] flex-1">
          <h2 className="text-lg font-medium text-ink">
            {done ? '过去这些年，你已经核对完了' : '继续核对'}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            {done ? (
              <>已经核对的年份都记在档案里了。接下来可以去看还没发生的年份，提前做准备。</>
            ) : (
              <>
                下一个还没核对的是{' '}
                <span className="font-medium text-ink">
                  {nextAge} 岁 · {nextYear} 年
                </span>
                ，从这里往回一年一年走最省力。
              </>
            )}
          </p>

          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="shrink-0 text-xs text-ink-3">
              已核对 {reviewedYears}/{reviewableYears} 年 · {percent}%
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!done && (
            <button
              type="button"
              onClick={onContinue}
              className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              就核对 {nextYear} 年
            </button>
          )}
          <button
            type="button"
            onClick={onOpenArchive}
            className="rounded-xl border border-line bg-surface px-5 py-3 text-sm text-ink-2 transition hover:border-line-strong"
          >
            看我的档案
          </button>
        </div>
      </div>
    </section>
  );
}
