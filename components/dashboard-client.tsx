'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ChenTeacherPanel from '@/components/chen-teacher-panel';
import ContinueReview from '@/components/continue-review';
import DimensionTabs from '@/components/dimension-tabs';
import LifeArchive, { type ArchiveEntry } from '@/components/life-archive';
import LifeCurve from '@/components/life-curve';
import ReviewedYears, { type ReviewedYear } from '@/components/reviewed-years';
import YearCard from '@/components/year-card';
import {
  buildLifeLine,
  buildStageCard,
  buildYearCard,
  levelOf,
  MIN_AGE,
  nextUnreviewedYear,
} from '@/lib/mock-data';
import { buildSuggestion } from '@/lib/notes';
import {
  clearBirth,
  clearFeedback,
  loadBirth,
  loadDraft,
  loadFeedback,
  loadNotes,
  saveDraft,
  saveFeedback,
  saveNote,
} from '@/lib/storage';
import {
  DIMENSION_LABEL,
  DIMENSIONS,
  FEEDBACK_OPTIONS,
  type BirthInfo,
  type DimensionKey,
  type FeedbackMap,
  type FeedbackType,
  type YearNoteMap,
} from '@/lib/types';

const TREND_CLS: Record<string, string> = {
  上升: 'bg-teal-50 text-teal-800 border-teal-200',
  下降: 'bg-rose-50 text-rose-800 border-rose-200',
  震荡: 'bg-slate-100 text-slate-700 border-slate-200',
  转折: 'bg-amber-50 text-amber-800 border-amber-200',
};

const CARD_CLS =
  'rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)] sm:p-6';

function formatBirth(info: BirthInfo): string {
  const y = info.birthDate.slice(0, 4);
  const m = info.birthDate.slice(5, 7);
  const d = info.birthDate.slice(8, 10);
  const date = y && m && d ? `${y} 年 ${Number(m)} 月 ${Number(d)} 日` : info.birthDate;
  return `${date} · ${info.birthTime} · ${info.birthPlace}`;
}

export default function DashboardClient() {
  const router = useRouter();
  const [birth, setBirth] = useState<BirthInfo | null>(null);
  const [ready, setReady] = useState(false);

  // 出生信息只存在浏览器本地，只能在客户端挂载后读取一次
  useEffect(() => {
    const info = loadBirth();
    if (!info) {
      router.replace('/?need=birth');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 读取浏览器本地存储，只能在挂载后同步一次
    setBirth(info);
    setReady(true);
  }, [router]);

  if (!ready || !birth) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <p className="text-sm text-ink-3">正在读取你填写的出生信息…</p>
      </main>
    );
  }

  // key 保证换人填写时内部状态全部重置
  return <DashboardBody key={birth.birthDate + birth.birthTime} birth={birth} />;
}

function DashboardBody({ birth }: { birth: BirthInfo }) {
  const router = useRouter();
  const [dimension, setDimension] = useState<DimensionKey>('overall');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<FeedbackMap>(() => loadFeedback());
  const [notes, setNotes] = useState<YearNoteMap>(() => loadNotes());
  const [panelOpen, setPanelOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState(() => loadDraft());

  const yearCardRef = useRef<HTMLDivElement>(null);
  const lastScrolledYear = useRef<number | null>(null);

  // 从「继续核对」或清单跳到某一年时，把年度卡片滚进视野
  useEffect(() => {
    if (selectedYear === null) return;
    if (lastScrolledYear.current === null || lastScrolledYear.current === selectedYear) {
      lastScrolledYear.current = selectedYear;
      return;
    }
    lastScrolledYear.current = selectedYear;
    yearCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedYear]);

  const derived = useMemo(() => {
    const points = buildLifeLine(birth);
    const stage = buildStageCard(points, birth);
    const wanted = points.findIndex((p) => p.year === selectedYear);
    const index =
      wanted >= 0 ? wanted : Math.max(0, points.findIndex((p) => p.year === stage.year));
    return { points, stage, index, point: points[index] };
  }, [birth, selectedYear]);

  const { points, stage, point, index } = derived;

  // 当前年份（今年）单独一档：还没过完，不适合当作已验证的过去
  const isCurrentYear = point.year === stage.year;
  const isFuture = point.age > stage.age;
  const zone = isCurrentYear ? '当前位置' : isFuture ? '未来策略区' : '过去验证区';

  const dimensionScore = point[dimension];
  const level = levelOf(dimensionScore);
  const card = buildYearCard(points, index, dimension, birth);

  const key = `${point.year}:${dimension}`;
  const currentFeedback: FeedbackType | undefined = feedbackMap[key]?.feedback;
  const currentNote = notes[key];
  const currentNoteText = currentNote && !currentNote.skipped ? currentNote.text : '';

  const historyList = Object.values(feedbackMap).sort((a, b) => b.updatedAt - a.updatedAt);
  const counts = FEEDBACK_OPTIONS.map((opt) => ({
    opt,
    n: historyList.filter((h) => h.feedback === opt).length,
  }));

  const birthYear = point.year - point.age;
  // 可以核对的年份：从 1 岁到去年（今年还没过完，不下结论）
  const reviewableCount = Math.max(1, stage.age - 1);

  // 已核对过的「年份」去重（一个年份可能在多个维度上被核对过）
  const reviewedYears = Array.from(new Set(historyList.map((h) => h.year)));
  const nextYear = nextUnreviewedYear(stage.year - 1, MIN_AGE, reviewedYears);
  const nextAge = nextYear !== undefined ? nextYear - birthYear : undefined;

  // 按年份归并的核对记录（最近的年份在前）
  const reviewedRows: ReviewedYear[] = Array.from(new Set(historyList.map((h) => h.year)))
    .sort((a, b) => b - a)
    .map((year) => ({
      year,
      age: year - birthYear,
      entries: historyList
        .filter((h) => h.year === year)
        .map((h) => {
          const n = notes[`${h.year}:${h.dimension}`];
          return {
            dimension: h.dimension,
            feedback: h.feedback,
            note: n && !n.skipped && n.text ? n.text : undefined,
          };
        }),
    }));

  // 用户亲手写下的经历，按年份排好，用于「我的人生档案」
  const archiveEntries: ArchiveEntry[] = historyList
    .map((h) => {
      const n = notes[`${h.year}:${h.dimension}`];
      if (!n || n.skipped || !n.text) return null;
      return {
        year: h.year,
        age: h.year - birthYear,
        dimension: h.dimension,
        feedback: h.feedback,
        text: n.text,
      } satisfies ArchiveEntry;
    })
    .filter((e): e is ArchiveEntry => e !== null);

  const quickJumps: { label: string; year: number }[] = [
    { label: '7 岁', year: birthYear + 7 },
    { label: '13 岁', year: birthYear + 13 },
    { label: '19 岁', year: birthYear + 19 },
    { label: '现在', year: stage.year },
    { label: '+5 年', year: stage.year + 5 },
    { label: '+10 年', year: stage.year + 10 },
    { label: '+20 年', year: stage.year + 20 },
  ];

  function handleFeedback(v: FeedbackType) {
    const alreadyRecorded = Boolean(feedbackMap[key]);
    setFeedbackMap(saveFeedback(point.year, dimension, v));
    // 第一次给出这年的反馈时，自动带着「为什么对得上 / 对不上」去追问
    if (!alreadyRecorded) {
      setSuggestion(
        buildSuggestion(point.year, point.age, v, card.trend, DIMENSION_LABEL[dimension]),
      );
      setPanelOpen(true);
    }
  }

  function handleOpenPanel() {
    setSuggestion(undefined);
    setPanelOpen(true);
  }

  function handleSaveNote(text: string, skipped: boolean) {
    setNotes(saveNote(point.year, dimension, text, skipped));
  }

  /** 跳到某一年；默认优先落在还没核对过的维度上 */
  function goToYear(year: number, keepDimension = false) {
    if (!keepDimension) {
      const fresh = DIMENSIONS.map((d) => d.key).find((k) => !feedbackMap[`${year}:${k}`]);
      if (fresh) setDimension(fresh);
    }
    setSelectedYear(year);
    setPanelOpen(false);
    setSuggestion(undefined);
  }

  function handleContinue() {
    if (nextYear !== undefined) goToYear(nextYear);
  }

  function handleReset() {
    clearBirth();
    clearFeedback();
    router.push('/');
  }

  return (
    <div className="min-h-full pb-16">
      {/* 顶栏 */}
      <div className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-[0.14em] text-ink">LIFELINE</span>
            <span className="hidden text-xs text-ink-3 sm:inline">人生战略曲线 · 原型</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[320px] truncate text-xs text-ink-3 md:inline">
              {birth.name ? `${birth.name} · ` : ''}
              {formatBirth(birth)}
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition hover:border-line-strong"
            >
              重新填写
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-5 py-6 sm:px-8 sm:py-8">
        {/* 当前阶段卡 */}
        <section className={CARD_CLS}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs tracking-wide text-ink-3">你现在的位置</p>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-2xl font-semibold text-ink">{stage.phase}</h1>
                <span
                  className={
                    'rounded-full border px-3 py-1 text-xs font-medium ' +
                    (TREND_CLS[stage.trend] ?? '')
                  }
                >
                  本阶段：{stage.trend}
                </span>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-ink-3">年龄</dt>
                <dd className="text-ink">{stage.age} 岁</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">公历年份</dt>
                <dd className="text-ink">{stage.year} 年</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">所属大限</dt>
                <dd className="text-ink">{stage.daxian}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">当前维度</dt>
                <dd className="text-ink">{DIMENSION_LABEL[dimension]}</dd>
              </div>
            </dl>
          </div>
          <p className="mt-4 border-t border-line pt-4 text-[15px] leading-relaxed text-ink-2">
            {stage.summary}
          </p>
        </section>

        {/* 继续核对 */}
        <ContinueReview
          nextYear={nextYear}
          nextAge={nextAge}
          reviewedYears={reviewedYears.length}
          reviewableYears={reviewableCount}
          onContinue={handleContinue}
          onOpenArchive={() => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          }}
        />

        {/* 维度切换 + 曲线 */}
        <section className={CARD_CLS}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-ink">人生总曲线</h2>
              <p className="mt-1 text-sm text-ink-3">
                横轴是年龄与公历年份，纵轴只分四档高低，不显示具体分数。
              </p>
            </div>
            <p className="text-sm text-ink-2">
              当前查看：
              <span className="font-medium text-ink">
                {point.year} 年 · {point.age} 岁
              </span>
              <span className="ml-2 rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2">
                {DIMENSION_LABEL[dimension]}：{level.label}
              </span>
            </p>
          </div>

          <div className="mt-4">
            <DimensionTabs value={dimension} onChange={setDimension} />
          </div>

          <div className="mt-4">
            <LifeCurve
              points={points}
              dimension={dimension}
              currentAge={stage.age}
              selectedYear={point.year}
              onSelectYear={setSelectedYear}
            />
          </div>

          {/* 图例 + 快速跳转 */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-xs text-ink-3">
            <span className="flex items-center gap-1.5">
              <svg width="26" height="8" aria-hidden>
                <line x1="0" y1="4" x2="26" y2="4" stroke="#a8531f" strokeWidth="2.4" />
              </svg>
              已经发生的年份（实线）
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="26" height="8" aria-hidden>
                <line
                  x1="0"
                  y1="4"
                  x2="26"
                  y2="4"
                  stroke="#a8531f"
                  strokeWidth="2.4"
                  strokeDasharray="6 4"
                />
              </svg>
              还没发生的年份（虚线，预测）
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="8" height="12" aria-hidden>
                <line x1="4" y1="0" x2="4" y2="12" stroke="#a8531f" strokeWidth="2" />
              </svg>
              现在
            </span>
            <span className="text-ink-3">点曲线上任意一年 → 查看年度卡片</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-3">快速跳转：</span>
            {quickJumps.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => goToYear(q.year, true)}
                className={
                  'rounded-lg border px-2.5 py-1 text-xs transition ' +
                  (q.year === point.year
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface text-ink-2 hover:border-line-strong')
                }
              >
                {q.label}
              </button>
            ))}
          </div>
        </section>

        {/* 年度卡片 */}
        <div ref={yearCardRef} className="scroll-mt-20">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium text-ink">
              {point.year} 年年度卡片
              <span className="ml-2 text-sm font-normal text-ink-3">
                {DIMENSION_LABEL[dimension]} · {zone}
              </span>
            </h2>
            {isCurrentYear ? (
              <span className="rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs text-accent">
                这一年还没过完：先看趋势和要提前准备的事
              </span>
            ) : isFuture ? (
              <span className="rounded-full border border-line px-3 py-1 text-xs text-ink-3">
                这一年还没发生：先看事件，提前准备
              </span>
            ) : (
              <span className="rounded-full border border-line px-3 py-1 text-xs text-ink-3">
                这一年已经过去：请逐条核对再给反馈
              </span>
            )}
          </div>
          <YearCard
            card={card}
            dimension={dimension}
            feedback={currentFeedback}
            note={currentNoteText}
            onFeedback={handleFeedback}
            onAskChen={handleOpenPanel}
          />
        </div>

        {/* 我的人生档案（只有写下经历后才出现） */}
        {archiveEntries.length > 0 && (
          <LifeArchive
            entries={archiveEntries}
            reviewedYears={reviewedYears.length}
            reviewableYears={reviewableCount}
          />
        )}

        {/* 我核对过的年份 */}
        <ReviewedYears
          rows={reviewedRows}
          reviewableYears={reviewableCount}
          activeYear={point.year}
          activeDimension={dimension}
          onPick={(year, dim) => {
            setDimension(dim);
            goToYear(year, true);
          }}
          nextYear={nextYear}
          nextAge={nextAge}
          onContinue={handleContinue}
        />

        {/* 各档反馈的分布，供产品自己看 */}
        {historyList.length > 0 && (
          <section className={CARD_CLS}>
            <h2 className="text-sm font-medium text-ink-2">反馈分布</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {counts.map((c) => (
                <span
                  key={c.opt}
                  className="rounded-full border border-line px-3 py-1 text-xs text-ink-2"
                >
                  {c.opt}：{c.n} 条
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              这是给你自己看的统计。等接入真实排盘后，这些反馈会用来校准后面每一年的判断。
            </p>
          </section>
        )}

        <p className="pt-2 text-center text-xs leading-relaxed text-ink-3">
          第一阶段原型：曲线与文案均为模拟数据，用于验证「回看 — 核对 — 追问」这条路径是否成立。
        </p>
      </main>

      <ChenTeacherPanel
        key={`${point.year}:${dimension}`}
        open={panelOpen}
        year={point.year}
        dimension={dimension}
        card={card}
        feedback={currentFeedback}
        history={historyList}
        suggestion={suggestion}
        savedNote={currentNoteText}
        draft={draft}
        onDraftChange={(t) => {
          setDraft(t);
          saveDraft(t);
        }}
        onSaveNote={handleSaveNote}
        onClose={() => {
          setPanelOpen(false);
          setSuggestion(undefined);
        }}
      />
    </div>
  );
}
