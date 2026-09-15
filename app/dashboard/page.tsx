import type { Metadata } from 'next';
import DashboardClient from '@/components/dashboard-client';

export const metadata: Metadata = {
  title: '我的人生战略曲线 · LifeLine',
};

export default function DashboardPage() {
  return <DashboardClient />;
}
