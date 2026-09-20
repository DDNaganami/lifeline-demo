import Link from 'next/link';
import type { Metadata } from 'next';
import {
  CHANGELOG,
  CHANGE_KIND_LABEL,
  CHANGE_KIND_STYLE,
  type ChangeKind,
} from '@/lib/changelog';

export const metadata: Metadata = {
  title: '修改日志 · LifeLine',
  description: 'LifeLine 演示项目的修改记录：每次改了什么、解决了什么问题、目前哪些是真的',
};

const KIND_ORDER: ChangeKind[] = ['new', 'fix', 'improve', 'data'];

export default function ChangelogPage() {
  const latest = CHANGELOG[0];

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em] text-ink transition hover:opacity-70"
          >
            <span aria-hidden>←</span>
            <span>LIFELINE</span>
          </Link>
          <span className="text-xs text-ink-3">修改日志</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/"
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition hover:border-line-strong"
          >
            去做排盘
          </Link>
          <Link
            href="/ambient/"
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition hover:border-line-strong"
          >
            设备模拟器
          </Link>
        </div>
      </div>

      <header className="mt-8">
        <h1 className="text-2xl font-semibold text-ink sm:text-3xl">修改日志</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-2">
          这里记录每次改了什么、<strong className="text-ink">解决了什么问题</strong>。
          写法刻意避开技术术语——不需要懂代码也能看懂。
        </p>
        {latest && (
          <p className="mt-2 text-sm text-ink-3">
            最近更新：{latest.date} · 共 {CHANGELOG.length} 轮改动
          </p>
        )}
      </header>

      {/* 目前哪些是真的 */}
      {latest?.status && (
        <section className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-medium text-ink">目前哪些是真的、哪些还是模拟</h2>
          <p className="mt-1 text-sm text-ink-3">
            这一点容易被误解，所以单独列出来——避免「看起来全是真的」造成误判。
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
              <p className="text-sm font-medium text-teal-900">✅ 真实计算</p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-teal-800">
                {latest.status.real.map((t) => (
                  <li key={t}>· {t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">⏳ 仍是模拟</p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-amber-800">
                {latest.status.mock.map((t) => (
                  <li key={t}>· {t}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* 日志列表 */}
      <div className="mt-10 space-y-8">
        {CHANGELOG.map((entry) => (
          <article
            key={entry.date + entry.title}
            className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)] sm:p-6"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs text-ink-3">
                {entry.date}
              </span>
              <h2 className="text-lg font-medium text-ink">{entry.title}</h2>
            </div>

            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{entry.summary}</p>

            {/* 按类型分组，读起来更有条理 */}
            <div className="mt-5 space-y-4">
              {KIND_ORDER.map((kind) => {
                const items = entry.items.filter((i) => i.kind === kind);
                if (items.length === 0) return null;
                return (
                  <div key={kind}>
                    <span
                      className={
                        'inline-block rounded-md border px-2 py-0.5 text-xs font-medium ' +
                        CHANGE_KIND_STYLE[kind]
                      }
                    >
                      {CHANGE_KIND_LABEL[kind]}
                    </span>
                    <ul className="mt-2 space-y-2">
                      {items.map((item) => (
                        <li key={item.what} className="text-sm leading-relaxed">
                          <span className="text-ink">{item.what}</span>
                          {item.why && (
                            <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">
                              为什么：{item.why}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      <p className="mt-10 text-center text-xs leading-relaxed text-ink-3">
        每一条都是实际验证过的——命理计算的改动都有自动化测试对照已知正确值。
        <br />
        发现哪里写得看不懂，或者想确认某个改动，直接说。
      </p>
    </main>
  );
}
