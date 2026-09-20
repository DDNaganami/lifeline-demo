'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadBirth } from '@/lib/storage';

/**
 * 首页的「今日」入口
 *
 * 只有已经填过出生信息的人才显示——它是**每天回来的理由**：
 * 首页的主要作用是拉新（先问问题），但老用户第二次来，
 * 想要的是"今天怎么样"，而不是再看一遍问题列表。
 */
export default function TodayShortcut() {
  const [hasBirth, setHasBirth] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 读取浏览器本地存储
    setHasBirth(Boolean(loadBirth()));
  }, []);

  if (!hasBirth) return null;

  return (
    <Link
      href="/today/"
      className="group mb-1 flex w-full items-center justify-between gap-4 rounded-2xl border border-accent/40 bg-accent-soft px-5 py-4 text-left transition hover:border-accent"
    >
      <span>
        <span className="block text-[15px] font-medium leading-relaxed text-ink">
          看今天的能量
        </span>
        <span className="mt-0.5 block text-xs text-ink-3">
          按你的命盘算的流日，每天都不一样
        </span>
      </span>
      <span className="shrink-0 text-accent transition group-hover:translate-x-0.5">→</span>
    </Link>
  );
}
