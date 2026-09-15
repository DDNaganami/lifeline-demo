'use client';

import { useMemo, useState } from 'react';
import { DIMENSION_LABEL, type FeedbackType } from '@/lib/types';

/** 档案里的一条：某一年、某维度，用户自己写下的经历 */
export interface ArchiveEntry {
  year: number;
  age: number;
  dimension: keyof typeof DIMENSION_LABEL;
  feedback: FeedbackType;
  text: string;
}

interface Props {
  entries: ArchiveEntry[];
  /** 已核对过的年份数（含只给反馈没写经历的） */
  reviewedYears: number;
  /** 可以核对的年份总数 */
  reviewableYears: number;
}

/**
 * 我的人生档案
 * 把用户写过的经历按年份连起来读——这是产品最值钱的东西：
 * 判断可以重算，用户自己的经历不能。
 */
export default function LifeArchive({ entries, reviewedYears, reviewableYears }: Props) {
  // 有 3 条以上经历时默认展开：这是用户最想看的东西，别让人多点一次
  const [open, setOpen] = useState(entries.length >= 3);
  const [copied, setCopied] = useState(false);

  const sorted = useMemo(() => [...entries].sort((a, b) => a.year - b.year), [entries]);
  const coveredYears = useMemo(() => new Set(sorted.map((e) => e.year)).size, [sorted]);

  function buildPlainText(): string {
    const head = [
      `我的人生档案（截至 ${new Date().getFullYear()} 年）`,
      `已核对 ${reviewedYears}/${reviewableYears} 年，其中 ${sorted.length} 条写下了具体经历。`,
      '',
    ];
    const body = sorted.map((e) =>
      [
        `${e.year} 年 · ${e.age} 岁 · ${DIMENSION_LABEL[e.dimension]}`,
        `判断核对：${e.feedback}`,
        `实际发生：${e.text}`,
        '',
      ].join('\n'),
    );
    return [...head, ...body].join('\n');
  }

  async function handleCopy() {
    const text = buildPlainText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">我的人生档案</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-3">
            你写下的经历共 {sorted.length} 条，覆盖 {coveredYears} 个年份。
            {sorted.length > 0 ? '这条线读下来，就是你自己的一段人生。' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sorted.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-2 transition hover:border-line-strong"
              >
                {copied ? '已复制' : '复制全文'}
              </button>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="rounded-lg bg-ink px-4 py-2 text-xs font-medium text-white transition hover:opacity-90"
              >
                {open ? '收起档案' : '展开档案'}
              </button>
            </>
          )}
        </div>
      </div>

      {sorted.length === 0 && (
        <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-ink-2">
          还没有内容。给某一年反馈后，在追问面板里写下「这一年实际发生了什么」，
          它就会出现在这里，按年份连成一条线。
        </p>
      )}

      {open && sorted.length > 0 && (
        <ol className="mt-4 space-y-3 border-t border-line pt-4">
          {sorted.map((e) => (
            <li
              key={`${e.year}:${e.dimension}`}
              className="rounded-xl border border-line bg-paper px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                <span className="text-sm font-medium text-ink">{e.year} 年</span>
                <span>{e.age} 岁</span>
                <span className="rounded-full border border-line px-2 py-0.5">
                  {DIMENSION_LABEL[e.dimension]}
                </span>
                <span>判断核对：{e.feedback}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">「{e.text}」</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
