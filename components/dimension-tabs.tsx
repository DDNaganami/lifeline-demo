'use client';

import { DIMENSIONS, type DimensionKey } from '@/lib/types';

interface Props {
  value: DimensionKey;
  onChange: (key: DimensionKey) => void;
}

export default function DimensionTabs({ value, onChange }: Props) {
  const active = DIMENSIONS.find((d) => d.key === value);

  return (
    <div>
      <div
        role="tablist"
        aria-label="选择查看维度"
        className="thin-scroll flex gap-1.5 overflow-x-auto rounded-xl border border-line bg-surface p-1.5"
      >
        {DIMENSIONS.map((d) => {
          const selected = d.key === value;
          return (
            <button
              key={d.key}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => onChange(d.key)}
              className={
                'shrink-0 rounded-lg px-4 py-2 text-sm whitespace-nowrap transition ' +
                (selected
                  ? 'bg-accent text-white font-medium'
                  : 'text-ink-2 hover:bg-accent-soft hover:text-accent')
              }
            >
              {d.label}
            </button>
          );
        })}
      </div>
      {active && <p className="mt-2 text-xs text-ink-3">{active.hint}</p>}
    </div>
  );
}
