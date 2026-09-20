'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildChart, type Chart } from '@/lib/chart';
import type { BirthInfo } from '@/lib/types';

/**
 * 本命盘（紫微斗数十二宫）
 * ---------------------------------------------------------------
 * 数据来源：`lib/chart.ts` → iztro 真实排盘（**不是模拟数据**）。
 *
 * 排列规则：**按地支固定方位**，这是紫微斗数盘的标准排法——
 *   巳 午 未 申
 *   辰 [ 中间 ] 酉
 *   卯 [ 信息 ] 戌
 *   寅 丑 子 亥
 * 命宫落在哪个格，由它自己的地支决定。这样懂盘的人一眼能对上。
 */

/** 地支 → 网格位置。row 0 / 2 是满行，row 1 只有左右两侧 */
const LAYOUT: { row: number; col: number; branch: string }[] = [
  { row: 0, col: 0, branch: '巳' },
  { row: 0, col: 1, branch: '午' },
  { row: 0, col: 2, branch: '未' },
  { row: 0, col: 3, branch: '申' },
  { row: 1, col: 0, branch: '辰' },
  { row: 1, col: 3, branch: '酉' },
  { row: 2, col: 0, branch: '卯' },
  { row: 2, col: 1, branch: '寅' },
  { row: 2, col: 2, branch: '丑' },
  { row: 2, col: 3, branch: '子' },
  { row: 3, col: 0, branch: '戌' },
  { row: 3, col: 1, branch: '亥' },
];

export default function NatalChartPanel({ birth }: { birth: BirthInfo }) {
  const [open, setOpen] = useState(false);
  const [chart, setChart] = useState<Chart | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 排盘在客户端挂载后算（iztro 是普通 JS 库，避免服务端渲染差异）
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载后计算排盘结果
      setChart(buildChart(birth));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [birth]);

  /** 地支 → 宫位 */
  const byBranch = useMemo(() => {
    const map = new Map<string, Chart['palaces'][number]>();
    if (chart) {
      for (const p of chart.palaces) map.set(p.ganzhi.slice(-1), p);
    }
    return map;
  }, [chart]);

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
        <h2 className="text-sm font-medium text-rose-900">排盘出错</h2>
        <p className="mt-2 text-xs text-rose-800">{error}</p>
      </section>
    );
  }

  if (!chart) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-ink-3">正在排盘…</p>
      </section>
    );
  }

  const { summary } = chart;
  const soulPalace = chart.palaces.find((p) => p.name === '命宫');
  const soulStars = soulPalace?.majorStars.map((s) => s.name).join('、') || '空宫';

  function renderCell(branch: string) {
    const p = byBranch.get(branch);
    if (!p) {
      return (
        <div key={branch} className="rounded-lg border border-line bg-surface p-2 text-xs text-ink-3">
          {branch}
        </div>
      );
    }
    const isSoul = p.name === '命宫';
    return (
      <div
        key={branch}
        className={
          'rounded-lg border px-2 py-2 text-xs leading-relaxed ' +
          (isSoul
            ? 'border-accent bg-accent-soft'
            : p.isBodyPalace
              ? 'border-ink/30 bg-paper'
              : 'border-line bg-surface')
        }
      >
        <div className="flex items-baseline justify-between gap-1">
          <span className={isSoul ? 'font-medium text-accent' : 'text-ink-2'}>
            {p.name}
            {p.isBodyPalace && <span className="ml-1 text-[10px] text-ink-3">身</span>}
          </span>
          <span className="text-[10px] text-ink-3">{p.ganzhi}</span>
        </div>
        <div className="mt-1 space-y-0.5">
          {p.majorStars.length === 0 && <span className="text-ink-3">空宫</span>}
          {p.majorStars.map((s) => (
            <div key={s.name} className="text-ink">
              {s.name}
              {s.mutagen && <span className="ml-0.5 text-accent">化{s.mutagen}</span>}
              {s.brightness && <span className="ml-0.5 text-ink-3">{s.brightness}</span>}
            </div>
          ))}
          {p.minorStars.length > 0 && (
            <div className="text-ink-3">{p.minorStars.map((s) => s.name).join(' ')}</div>
          )}
        </div>
        {p.decadalRange && (
          <div className="mt-1 text-[10px] text-ink-3">
            大限 {p.decadalRange[0]}-{p.decadalRange[1]}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">本命盘</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-3">
            **真实排盘结果**（紫微斗数十二宫）——整条曲线与每年的判断，依据都来自这里。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-ink px-4 py-2 text-xs font-medium text-white transition hover:opacity-90"
        >
          {open ? '收起命盘' : '展开十二宫'}
        </button>
      </div>

      {/* 摘要 */}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-ink-3">农历</dt>
          <dd className="text-ink">{summary.lunarDate}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">四柱</dt>
          <dd className="text-ink">{summary.chineseDate}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">五行局</dt>
          <dd className="text-ink">{summary.fiveElementsClass}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">命主 / 身主</dt>
          <dd className="text-ink">
            {summary.soul} / {summary.body}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">命宫</dt>
          <dd className="text-ink">
            {summary.soulPalaceGanzhi} · {soulStars}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">身宫</dt>
          <dd className="text-ink">{summary.bodyPalaceName}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">生肖 / 星座</dt>
          <dd className="text-ink">
            {summary.zodiac} / {summary.sign}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">出生时辰</dt>
          <dd className="text-ink">{summary.timeName}</dd>
        </div>
      </dl>

      {/* 真太阳时校正——时辰是命宫的依据，必须让用户看到 */}
      <div
        className={
          'mt-4 rounded-xl border px-4 py-3 text-sm ' +
          (chart.solarTime.place.approximate ||
          chart.solarTime.crossedBoundary ||
          (birth.birthTimeConfidence && birth.birthTimeConfidence !== 'exact')
            ? 'border-amber-200 bg-amber-50'
            : 'border-line bg-paper')
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs font-medium text-ink-2">真太阳时校正</span>
          <span className="text-ink">
            {chart.solarTime.localTime} → <strong>{chart.solarTime.trueSolarTime}</strong>
          </span>
          <span className="text-xs text-ink-3">
            （经度 {chart.solarTime.longitudeOffsetMinutes > 0 ? '+' : ''}
            {chart.solarTime.longitudeOffsetMinutes} 分
            {chart.solarTime.dstApplied && '，已扣除夏令时'}
            {Math.abs(chart.solarTime.equationOfTimeMinutes) > 0.5 &&
              `，均时差 ${chart.solarTime.equationOfTimeMinutes > 0 ? '+' : ''}${chart.solarTime.equationOfTimeMinutes} 分`}
            ）
          </span>
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
          出生地
          {chart.solarTime.place.matched ? `「${chart.solarTime.place.matched}」` : '未能识别'}
          （东经 {chart.solarTime.place.longitude}°），
          钟表时间换算成当地真太阳时后为 <strong>{chart.solarTime.trueSolarTime}</strong>，
          对应 <strong>{chart.solarTime.timeName}</strong>。
        </p>

        {chart.solarTime.place.approximate && (
          <p className="mt-1.5 text-xs leading-relaxed text-amber-800">
            ⚠️ 没有识别出这个出生地，暂按东经 120° 计算（相当于不做经度修正）。
            建议填写城市名（如「浙江杭州」「乌鲁木齐」），校正结果才准确。
          </p>
        )}

        {birth.birthTimeConfidence && birth.birthTimeConfidence !== 'exact' && (
          <p className="mt-1.5 text-xs leading-relaxed text-amber-800">
            ⚠️ 你标注的出生时辰是「
            {birth.birthTimeConfidence === 'approx' ? '大概是' : '不知道'}
            」。
            <strong>时辰决定命宫，命宫错了整张盘都会不同</strong>——
            所以下面这些判断请只当作参考，不要当成确定结论。
            如果以后从出生证明或长辈那里问到准确时辰，回来改一下即可，档案不会丢。
          </p>
        )}

        {chart.solarTime.crossedBoundary && (
          <p className="mt-1.5 text-xs leading-relaxed text-amber-800">
            ⚠️ 这次校正<strong>跨过了时辰边界</strong>：按钟表时间算是
            {chart.solarTime.localTime} 所在的时辰，换算真太阳时后落到了
            <strong>{chart.solarTime.timeName}</strong>。
            <strong>命宫会因此改变，整张盘都不同</strong>——
            这也是为什么必须做真太阳时校正。
          </p>
        )}
      </div>

      {open && (
        <div className="mt-5 border-t border-line pt-5">
          {/* 第一行：巳 午 未 申 */}
          <div className="grid grid-cols-4 gap-1.5">
            {LAYOUT.filter((l) => l.row === 0).map((l) => renderCell(l.branch))}
          </div>

          {/* 第二行：辰 [中间信息] 酉 */}
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {renderCell('辰')}
            <div className="col-span-2 flex flex-col items-center justify-center rounded-lg border border-line bg-paper px-3 py-4 text-center">
              <span className="text-xs text-ink-3">命主 / 身主</span>
              <span className="mt-1 text-base text-ink">
                {summary.soul} / {summary.body}
              </span>
              <span className="mt-2 text-xs text-ink-3">{summary.fiveElementsClass}</span>
            </div>
            {renderCell('酉')}
          </div>

          {/* 第三行：卯 [中间信息] 戌 */}
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {renderCell('卯')}
            <div className="col-span-2 flex flex-col items-center justify-center rounded-lg border border-line bg-paper px-3 py-4 text-center">
              <span className="text-xs text-ink-3">四柱</span>
              <span className="mt-1 text-sm text-ink">{summary.chineseDate}</span>
              <span className="mt-2 text-xs text-ink-3">{summary.lunarDate}</span>
            </div>
            {renderCell('戌')}
          </div>

          {/* 第四行：寅 丑 子 亥 */}
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {LAYOUT.filter((l) => l.row === 2).map((l) => renderCell(l.branch))}
            {LAYOUT.filter((l) => l.row === 3).map((l) => renderCell(l.branch))}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            盘面按地支固定方位排布（巳午未申在上、寅丑子亥在下），与常见紫微斗数盘一致。
            高亮格为命宫，带「身」字为身宫；每格底部是 10 年一运的大限区间。
          </p>
          <p className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-relaxed text-teal-800">
            ✅ 本盘已按<strong>真太阳时</strong>定时辰（含出生地经度差、均时差、夏令时）。
            八字部分用 lunar-typescript 独立排盘——因为实测发现紫微库自带的八字
            <strong>月柱按农历月换月（错），应按节气换月</strong>，两者在跨节气时会不一致。
          </p>
        </div>
      )}
    </section>
  );
}
