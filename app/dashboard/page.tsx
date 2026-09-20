import { Suspense } from 'react';
import type { Metadata } from 'next';
import DashboardClient from '@/components/dashboard-client';

export const metadata: Metadata = {
  title: '我的人生战略曲线 · LifeLine',
};

/**
 * 仪表盘
 *
 * 用 Suspense 包一层：内部的 DashboardClient 会读地址栏参数
 * （从首页点问题进来时带的 `q` / `dim` / `year`），
 * 而静态导出时 useSearchParams 必须在 Suspense 边界内。
 */
export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center px-6 py-20">
          <p className="text-sm text-ink-3">正在读取你填写的出生信息…</p>
        </main>
      }
    >
      <DashboardClient />
    </Suspense>
  );
}
