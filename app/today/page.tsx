'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loadBirth } from '@/lib/storage';
import { buildDailyReading, greetingOf } from '@/lib/daily';
import type { BirthInfo } from '@/lib/types';

/**
 * 今日
 * ---------------------------------------------------------------
 * 对应海外版设计稿的 Today 屏。这里的能量、结论、身体提醒、
 * 未来 7 天**全部由流日排盘生成**（见 lib/daily.ts），不是模拟数据。
 *
 * 与年度曲线的分工：
 *   曲线回答「这一生 / 这一年」
 *   今日回答「今天」——它是日活的来源，也是设备端每天出现的内容
 */
function TodayBody({ birth }: { birth: BirthInfo }) {
  const router = useRouter();
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 时段问候语需要在客户端读本地时间
    setHour(new Date().getHours());
  }, []);

  /**
   * 排盘比较重（要算一整个月的窗口做归一化，约 200ms），
   * 所以推迟到首屏渲染之后再算。
   */
  const [reading, setReading] = useState<ReturnType<typeof buildDailyReading> | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setReading(buildDailyReading(birth));
      } catch {
        setReading(null);
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [birth]);

  const maxWeek = useMemo(
    () => (reading ? Math.max(...reading.week.map((w) => w.value)) : 100),
    [reading],
  );

  if (!reading) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <p className="text-sm text-ink-3">正在按你的命盘算今天…</p>
      </main>
    );
  }

  const e = reading.energy;
  const barColor =
    e.value >= 58 ? 'bg-teal-500/70' : e.value >= 42 ? 'bg-accent/70' : 'bg-rose-500/60';

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 sm:px-8 sm:py-12">
      {/* 顶栏 */}
      <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em] text-ink transition hover:opacity-70"
          >
            <span aria-hidden>←</span>
            <span>LifeLine</span>
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/"
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition hover:border-line-strong"
          >
            人生曲线
          </Link>
          <Link
            href="/ambient/"
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition hover:border-line-strong"
          >
            设备
          </Link>
        </div>
      </nav>

      {/* 日期与问候 */}
      <header className="mt-8">
        <p className="text-sm text-ink-3">{reading.dateText}</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-ink sm:text-4xl">
          {hour === null ? '你好。' : greetingOf(hour, birth.name)}
        </h1>
        <p className="mt-2 text-xs text-ink-3">
          {reading.ganzhiText} · {reading.lunarText}
        </p>
      </header>

      {/* 今日能量 */}
      <section className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-xs font-medium tracking-wide text-ink-3">今日能量</p>
          <p className="text-xs text-ink-3">当月参照 · 越高越顺</p>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-4xl font-semibold text-accent">{e.label}</span>
          <span className="text-lg text-ink-2">{e.value}</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-paper">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${e.value}%` }} />
        </div>

        <p className="mt-4 text-lg leading-relaxed text-ink">{reading.headline}</p>
        <div className="mt-3 space-y-1.5">
          {reading.detail.map((d) => (
            <p key={d} className="text-sm leading-relaxed text-ink-2">
              · {d}
            </p>
          ))}
        </div>
      </section>

      {/* 今日关注 */}
      <section className="mt-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-medium tracking-wide text-ink-3">今日关注</p>
        <p className="mt-2 text-base leading-relaxed text-ink">
          落在「<strong className="text-accent">{reading.focus.palace}</strong>」——
          {reading.focus.palaceTheme}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {reading.focus.mutagens.map((m) => (
            <span
              key={`${m.star}${m.mutagen}`}
              className={
                'rounded-full border px-2.5 py-1 text-xs ' +
                (m.mutagen === '忌'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-teal-200 bg-teal-50 text-teal-800')
              }
            >
              {m.star}化{m.mutagen} · {m.palace}
            </span>
          ))}
        </div>

        <p className="mt-4 border-t border-line pt-3 text-sm leading-relaxed text-ink-2">
          <span className="font-medium text-ink">身体提醒：</span>
          {reading.healthNote}
        </p>
      </section>

      {/* 未来 7 天 */}
      <section className="mt-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-ink-3">未来 7 天</p>
          <p className="text-xs text-ink-3">
            本周平均 <strong className="text-ink-2">{reading.weekAverage}</strong>
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {reading.week.map((w) => {
            const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
            return (
              <div key={w.date} className="flex items-center gap-3">
                <span className={'w-14 shrink-0 text-xs ' + (w.isToday ? 'font-medium text-accent' : 'text-ink-3')}>
                  {w.isToday ? '今天' : `周${weekNames[w.weekday]}`}
                </span>
                <span className="w-12 shrink-0 text-xs text-ink-3">{w.dayGanZhi}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper">
                  <div
                    className={
                      'h-full rounded-full ' +
                      (w.value >= 58 ? 'bg-teal-500/70' : w.value >= 42 ? 'bg-accent/70' : 'bg-rose-500/60')
                    }
                    style={{ width: `${Math.round((w.value / maxWeek) * 100)}%` }}
                  />
                </div>
                <span className="w-11 shrink-0 text-right text-xs text-ink-2">{w.value}</span>
                <span className="hidden w-10 shrink-0 text-right text-xs text-ink-3 sm:inline">{w.label}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          柱高按「当月内的相对高低」画，所以每周的刻度不一样——它回答的是「这几天里哪天更顺」。
        </p>
      </section>

      {/* 黄历 */}
      <section className="mt-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-medium tracking-wide text-ink-3">黄历</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-teal-800">宜</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">{reading.yi.join(' · ')}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-rose-700">忌</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">{reading.ji.join(' · ')}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 border-t border-line pt-3 text-xs text-ink-3 sm:grid-cols-2">
          <p>
            喜神 {reading.directions.xi} · 财神 {reading.directions.cai} · 福神 {reading.directions.fu}
          </p>
          <p>
            冲 {reading.chong} · 煞{reading.sha}
          </p>
        </div>
      </section>

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-3">
        今日能量由<strong className="text-ink-2">流日四化</strong>与当事宫星曜庙旺计算
        （紫微真实排盘）；黄历由农历库本地计算。
        <br />
        黄历宜忌各家版本略有出入，仅作参考。
      </p>

      {/* 去曲线 */}
      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => router.push('/dashboard/')}
          className="rounded-2xl bg-accent px-6 py-3.5 text-base font-medium text-page transition hover:opacity-90"
        >
          看我的人生曲线 →
        </button>
      </div>
    </main>
  );
}

function TodayShell() {
  const router = useRouter();
  const [birth, setBirth] = useState<BirthInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const info = loadBirth();
    if (!info) {
      router.replace('/?need=birth');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 读取浏览器本地存储
    setBirth(info);
    setReady(true);
  }, [router]);

  if (!ready || !birth) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <p className="text-sm text-ink-3">正在读取你的出生信息…</p>
      </main>
    );
  }
  return <TodayBody key={birth.birthDate + birth.birthTime} birth={birth} />;
}

export default function TodayPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center px-6 py-20">
          <p className="text-sm text-ink-3">正在读取你的出生信息…</p>
        </main>
      }
    >
      <TodayShell />
    </Suspense>
  );
}
