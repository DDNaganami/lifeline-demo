import Link from 'next/link';
import { HOME_QUESTIONS, questionToParams } from '@/lib/home-questions';
import { CURRENT_YEAR } from '@/lib/mock-data';

/**
 * 首页
 * ---------------------------------------------------------------
 * 结构对齐海外版设计稿：**先问问题，再要生日**。
 *
 *   1. 首屏是「今天，想问问什么？」+ 可以直接点的问题
 *   2. 点任意问题 → 去填出生信息（问题会带过去，仪表盘直接落在对应维度）
 *   3. 也可以直接填出生信息（给已经知道自己要什么的用户）
 *
 * 为什么不做登录：海外版有「Sign in」，但我们这一阶段没有账号体系，
 * 加了会变成假按钮。等有账号体系再补。
 */
export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:px-8 sm:py-16">
      {/* 顶栏 */}
      <nav className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-semibold text-page">
            L
          </span>
          <span className="text-sm font-semibold tracking-[0.14em] text-ink">LifeLine</span>
        </div>
        <div className="flex gap-2">
          <Link
            href="/ambient/"
            className="rounded-lg px-3 py-1.5 text-xs text-ink-3 transition hover:text-ink-2"
          >
            设备
          </Link>
          <Link
            href="/changelog/"
            className="rounded-lg px-3 py-1.5 text-xs text-ink-3 transition hover:text-ink-2"
          >
            修改日志
          </Link>
        </div>
      </nav>

      {/* 提问区：海外版的首屏结构 */}
      <header className="mt-14 sm:mt-20">
        <h1 className="text-[34px] font-semibold leading-tight text-ink sm:text-5xl">
          今天，想问问什么？
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-2">
          大事小事，都可以在这里找到答案。
        </p>
      </header>

      <div className="mt-10 space-y-2.5">
        {HOME_QUESTIONS.map((q) => (
          <Link
            key={q.text}
            href={`/birth/?${questionToParams(q, CURRENT_YEAR)}`}
            className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4 text-left transition hover:border-accent/50 hover:bg-paper"
          >
            <span className="text-[15px] leading-relaxed text-ink">{q.text}</span>
            <span className="shrink-0 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-accent">
              →
            </span>
          </Link>
        ))}
      </div>

      {/* 给已经知道自己要什么的用户 */}
      <div className="mt-10 flex flex-col items-center gap-3 border-t border-line pt-8">
        <Link
          href="/birth/"
          className="w-full rounded-2xl bg-accent px-6 py-4 text-center text-base font-medium text-page transition hover:opacity-90 sm:w-auto sm:px-8"
        >
          直接开始 · 填写出生信息
        </Link>
        <p className="text-center text-xs leading-relaxed text-ink-3">
          紫微与八字为<strong className="text-ink-2">真实排盘</strong>
          （含真太阳时校正），年度事件由四化落宫生成。
          <br />
          填写的信息只保存在你自己的浏览器里。
        </p>
      </div>
    </main>
  );
}
