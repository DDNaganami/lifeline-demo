'use client';

import { useEffect, useRef } from 'react';
import { DIMENSION_LABEL, type DimensionKey, type LifeLinePoint } from '@/lib/types';

/**
 * LifeLine 总曲线
 * ---------------------------------------------------------------
 * 纯 SVG 手写，不依赖图表库：
 *  - 横轴：年龄 + 公历年份
 *  - 纵轴：只分「高位 / 中上 / 中位 / 低位」四档，不出现「78 分」这类伪精确数字
 *  - 过去的年份画实线，未来的年份画虚线
 *  - 当前年龄用一条醒目竖线标出
 *  - 点任意一年的节点 → 打开该年年度卡片
 */

const W = 1136;
const H = 420;
const PAD = { left: 56, right: 36, top: 40, bottom: 76 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const BAND_LINES = [
  { value: 72, label: '高位' },
  { value: 58, label: '中上' },
  { value: 42, label: '中位' },
  { value: 22, label: '低位' },
];

/**
 * 曲线的颜色（深色主题，与设备模拟器、海外版设计稿一致）
 * 这些是 SVG 内部字面量——CSS 变量在 SVG 属性里可用，但为了可读性
 * 集中放在这里，改主题时一处生效。
 */
const COLOR_LINE = '#d9a441'; // 金：主曲线
const COLOR_AREA_FROM = 'rgba(217, 164, 65, 0.20)';
const COLOR_AREA_TO = 'rgba(217, 164, 65, 0.01)';
const COLOR_GRID = '#2b2926'; // 深色底上的参考线
const COLOR_TEXT = '#7d776c'; // 轴标签
const COLOR_AXIS = '#3d3a35'; // 轴线
const COLOR_SELECTED = '#7fd1bf'; // 选中年的高亮竖线（青，与金区分）
const COLOR_TOOLTIP_BG = '#f5f2ec'; // 悬浮提示底（浅底反色）
const COLOR_TOOLTIP_TEXT = '#17150f';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** 平滑曲线：Catmull-Rom 转三次贝塞尔，并限制不画出画布外 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const top = PAD.top - 8;
  const bottom = PAD.top + PLOT_H + 8;
  const clampY = (y: number) => clamp(y, top, bottom);
  let d = `M ${pts[0].x} ${clampY(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${clampY(p2.y)}`;
  }
  return d;
}

interface Props {
  points: LifeLinePoint[];
  dimension: DimensionKey;
  currentAge: number;
  selectedYear: number;
  onSelectYear: (year: number) => void;
}

export default function LifeCurve({
  points,
  dimension,
  currentAge,
  selectedYear,
  onSelectYear,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const minAge = points[0]?.age ?? 1;
  const maxAge = points[points.length - 1]?.age ?? 1;
  const span = maxAge - minAge || 1;

  // 手机上曲线比屏幕宽很多：默认滚到「现在」附近，别让人从 1 岁开始拖
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ratio = (currentAge - minAge) / span;
    const target = ratio * el.scrollWidth - el.clientWidth / 2;
    el.scrollLeft = Math.max(0, target);
  }, [currentAge, minAge, span]);

  if (points.length === 0) return null;

  const xOf = (age: number) => PAD.left + ((age - minAge) / span) * PLOT_W;
  const yOf = (value: number) => PAD.top + ((97 - clamp(value, 5, 97)) / 92) * PLOT_H;

  const coords = points.map((p) => ({
    age: p.age,
    year: p.year,
    value: p[dimension],
    x: xOf(p.age),
    y: yOf(p[dimension]),
  }));

  const splitIndex = clamp(currentAge - minAge, 0, coords.length - 1);
  const past = coords.slice(0, splitIndex + 1);
  const future = coords.slice(splitIndex);

  const pastPath = smoothPath(past);
  const futurePath = smoothPath(future);
  const areaPath =
    past.length > 1
      ? `${pastPath} L ${past[past.length - 1].x} ${PAD.top + PLOT_H} L ${past[0].x} ${
          PAD.top + PLOT_H
        } Z`
      : '';

  const currentX = xOf(currentAge);
  const selected = coords.find((c) => c.year === selectedYear) ?? coords[splitIndex];
  const birthYear = points[0].year - points[0].age;

  const ticks: number[] = [];
  for (let age = Math.ceil(minAge / 10) * 10; age <= maxAge; age += 10) ticks.push(age);
  if (!ticks.some((t) => Math.abs(t - currentAge) < 4)) ticks.push(currentAge);
  ticks.sort((a, b) => a - b);

  const label = DIMENSION_LABEL[dimension];
  const hitR = Math.max(3.4, PLOT_W / span / 2.1);

  return (
    <div ref={scrollRef} className="thin-scroll overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[880px] select-none"
        role="img"
        aria-label={`${label}维度人生曲线，从 ${points[0].age} 岁到 ${maxAge} 岁，你现在 ${currentAge} 岁，点击年份查看年度卡片`}
      >
        <defs>
          <linearGradient id="ll-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR_AREA_FROM} />
            <stop offset="100%" stopColor={COLOR_AREA_TO} />
          </linearGradient>
        </defs>

        {/* 四档横向参考线 */}
        {BAND_LINES.map((b) => {
          const y = yOf(b.value);
          return (
            <g key={b.label}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                stroke={COLOR_GRID}
                strokeWidth={1}
                strokeDasharray="2 6"
              />
              <text x={PAD.left - 12} y={y + 4} textAnchor="end" fontSize={12} fill={COLOR_TEXT}>
                {b.label}
              </text>
            </g>
          );
        })}

        {/* 底部年龄轴 */}
        <line
          x1={PAD.left}
          y1={PAD.top + PLOT_H}
          x2={W - PAD.right}
          y2={PAD.top + PLOT_H}
          stroke={COLOR_AXIS}
          strokeWidth={1}
        />
        {ticks.map((age) => {
          const x = xOf(age);
          const isCurrent = age === currentAge;
          return (
            <g key={age}>
              <line
                x1={x}
                y1={PAD.top + PLOT_H}
                x2={x}
                y2={PAD.top + PLOT_H + 5}
                stroke={COLOR_AXIS}
                strokeWidth={1}
              />
              <text
                x={x}
                y={PAD.top + PLOT_H + 22}
                textAnchor="middle"
                fontSize={12}
                fontWeight={isCurrent ? 600 : 400}
                fill={isCurrent ? COLOR_LINE : COLOR_TEXT}
              >
                {age} 岁
              </text>
              <text
                x={x}
                y={PAD.top + PLOT_H + 40}
                textAnchor="middle"
                fontSize={11}
                fill={isCurrent ? COLOR_LINE : COLOR_TEXT}
              >
                {birthYear + age}
              </text>
            </g>
          );
        })}

        {/* 过去：实线 + 面积 */}
        {areaPath && <path d={areaPath} fill="url(#ll-area)" />}
        <path d={pastPath} fill="none" stroke={COLOR_LINE} strokeWidth={2.6} strokeLinecap="round" />

        {/* 未来：虚线 */}
        <path
          d={futurePath}
          fill="none"
          stroke={COLOR_LINE}
          strokeWidth={2.4}
          strokeDasharray="7 6"
          strokeLinecap="round"
          opacity={0.75}
        />

        {/* 当前年龄竖线 */}
        <line
          x1={currentX}
          y1={PAD.top - 14}
          x2={currentX}
          y2={PAD.top + PLOT_H}
          stroke={COLOR_LINE}
          strokeWidth={1.6}
        />
        <rect
          x={currentX - 26}
          y={PAD.top - 32}
          width={52}
          height={20}
          rx={10}
          fill={COLOR_LINE}
        />
        <text
          x={currentX}
          y={PAD.top - 18}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill={COLOR_TOOLTIP_TEXT}
        >
          现在
        </text>

        {/* 选中年的高亮竖线 */}
        {selected && (
          <line
            x1={selected.x}
            y1={PAD.top}
            x2={selected.x}
            y2={PAD.top + PLOT_H}
            stroke={COLOR_SELECTED}
            strokeWidth={1.4}
            strokeDasharray="3 3"
          />
        )}

        {/* 可点击的年份节点 */}
        {coords.map((c) => {
          const isSelected = selected ? c.year === selected.year : false;
          const isCurrent = c.age === currentAge;
          return (
            <g
              key={c.year}
              className={
                'cursor-pointer ' +
                (isSelected ? 'node-selected' : isCurrent ? 'node-current' : 'node')
              }
              onClick={() => onSelectYear(c.year)}
            >
              <circle
                cx={c.x}
                cy={c.y}
                r={hitR}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${c.year} 年，${c.age} 岁`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectYear(c.year);
                  }
                }}
              />
              <circle
                cx={c.x}
                cy={c.y}
                r={isSelected ? 6 : isCurrent ? 5 : 2.6}
                fill={isSelected || isCurrent ? COLOR_LINE : COLOR_GRID}
                stroke={COLOR_LINE}
                strokeWidth={isSelected || isCurrent ? 2.4 : 1.6}
                pointerEvents="none"
              />
            </g>
          );
        })}

        {/* 悬浮提示：深色底上用浅底反色，保证在任何位置都能读清 */}
        {selected && (
          <g pointerEvents="none">
            <rect
              x={clamp(selected.x - 62, PAD.left - 20, W - PAD.right - 104)}
              y={clamp(selected.y - 46, 6, PAD.top + PLOT_H - 40)}
              width={124}
              height={34}
              rx={9}
              fill={COLOR_TOOLTIP_BG}
              opacity={0.95}
            />
            <text
              x={clamp(selected.x - 62, PAD.left - 20, W - PAD.right - 104) + 62}
              y={clamp(selected.y - 46, 6, PAD.top + PLOT_H - 40) + 22}
              textAnchor="middle"
              fontSize={12.5}
              fontWeight={500}
              fill={COLOR_TOOLTIP_TEXT}
            >
              {selected.year} 年 · {selected.age} 岁
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
