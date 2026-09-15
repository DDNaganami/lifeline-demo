'use client';

import { FEEDBACK_OPTIONS, type FeedbackType } from '@/lib/types';

interface Props {
  value?: FeedbackType;
  onChange: (v: FeedbackType) => void;
}

/** 哪些反馈算「对上了」，用于配色 */
const IS_PASS: Record<FeedbackType, boolean> = {
  非常符合: true,
  部分符合: true,
  没有印象: false,
  完全不符合: false,
};

export default function FeedbackButtons({ value, onChange }: Props) {
  return (
    <div>
      <p className="text-sm font-medium text-ink-2">这一年的描述，对得上吗？</p>
      <p className="mt-1 text-xs text-ink-3">
        反馈只存在你自己的浏览器里，用来校准后面每一年的判断。
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FEEDBACK_OPTIONS.map((opt) => {
          const selected = value === opt;
          const pass = IS_PASS[opt];
          const selectedClass = pass
            ? 'border-teal-600 bg-teal-50 text-teal-800'
            : 'border-rose-300 bg-rose-50 text-rose-800';
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(opt)}
              className={
                'rounded-xl border px-3 py-2.5 text-sm transition ' +
                (selected
                  ? selectedClass + ' font-medium'
                  : 'border-line bg-surface text-ink-2 hover:border-line-strong')
              }
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
