'use client';

import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

interface Props {
  /** 要编码的内容（一般是排盘页地址） */
  value: string;
  /** 渲染尺寸（像素） */
  size: number;
  /** 二维码颜色 */
  color?: string;
  /** 背景色（透明传 'transparent'） */
  background?: string;
  className?: string;
}

/**
 * 二维码
 * ---------------------------------------------------------------
 * 用 qrcode-generator 算出模块矩阵，再由 React 渲染成 SVG。
 *
 * 为什么不用库自带的 createDataURL：
 *   1. 库生成的是 base64 图片，在深色屏幕上不好配合背景色
 *   2. 自己渲染 SVG 更清晰（任意尺寸不糊），也更好控制颜色
 *   3. `isDark(x, y)` 直接给出每个模块的黑白，自己渲染最简单可控
 */
export default function QrCode({
  value,
  size,
  color = '#1a1917',
  background = '#ffffff',
  className,
}: Props) {
  const { modules, count } = useMemo(() => {
    // 纠错等级 M（约 15%）——屏幕上稍有反光或污损也能扫出来
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const grid: boolean[][] = [];
    for (let y = 0; y < n; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < n; x++) row.push(qr.isDark(x, y));
      grid.push(row);
    }
    return { modules: grid, count: n };
  }, [value]);

  const quiet = 1; // 静区（白边），标准要求至少 4 个模块宽；这里视觉上留 1 个够用
  const total = count + quiet * 2;
  const cell = size / total;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      className={className}
      role="img"
      aria-label={`二维码：${value}`}
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={total} height={total} fill={background} />
      {modules.map((row, y) =>
        row.map((dark, x) =>
          dark ? (
            <rect
              key={`${x}-${y}`}
              x={x + quiet}
              y={y + quiet}
              width={1}
              height={1}
              fill={color}
            />
          ) : null,
        ),
      )}
      {/* 备用：cell 变量用于将来需要像素对齐时 */}
      <desc>{`${count}×${count} 模块，单元 ${cell.toFixed(2)}px`}</desc>
    </svg>
  );
}
