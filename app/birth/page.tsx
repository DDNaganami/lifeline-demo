'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BirthForm from '@/components/birth-form';

/**
 * 出生信息页（对应海外版的 "About you." 屏）
 *
 * 从首页点了某个问题进来时，地址栏会带上 `q` / `dim` / `year`。
 * 提交后原样带到仪表盘——这样用户落地就直接看到**他问的那件事**，
 * 而不是一个总览再自己找。
 *
 * 用 useSearchParams 需要 Suspense 包一层（Next 的静态导出要求）。
 */
function BirthScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [question, setQuestion] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 读取地址栏参数（静态导出无法在服务端读）
    setQuestion(params.get('q'));
  }, [params]);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-10 sm:px-8 sm:py-16">
      <button
        type="button"
        onClick={() => router.push('/')}
        className="mb-8 flex items-center gap-2 text-xs text-ink-3 transition hover:text-ink-2"
      >
        <span aria-hidden>←</span>
        <span>返回</span>
      </button>

      {/* 带着问题进来时，把问题钉在最上面 */}
      {question && (
        <div className="mb-8 rounded-2xl border border-accent/30 bg-accent-soft px-5 py-4">
          <p className="text-xs text-ink-3">你想问的是</p>
          <p className="mt-1 text-lg leading-relaxed text-ink">{question}</p>
        </div>
      )}

      <header>
        <h1 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">
          关于你。
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-2">
          需要你的出生信息才能排盘。
          <strong className="text-ink">信息只留在你自己的浏览器里。</strong>
        </p>
      </header>

      <div className="mt-8">
        <BirthForm />
      </div>
    </main>
  );
}

export default function BirthPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-xl flex-1 px-5 py-16">
          <p className="text-sm text-ink-3">正在读取…</p>
        </main>
      }
    >
      <BirthScreen />
    </Suspense>
  );
}
