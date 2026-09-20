'use client';

import { useMemo, useRef, useState } from 'react';
import { CITY_TABLE, resolvePlace, cityFromKeyword } from '@/lib/solar-time';
import { groupCities } from '@/lib/places';

interface Props {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}

/**
 * 出生地选择器
 * ---------------------------------------------------------------
 * 为什么不用下拉框 / datalist：
 *   1. 中文地址习惯是**从大到小**（省 → 市 → 县），一个扁平列表反直觉
 *   2. 原生 datalist 在移动端体验差、只能前缀匹配、样式不可控
 *   3. 用户知道的是"我出生在 XX 县"，而不一定知道那个县的经度
 *
 * 这里的做法：**搜索 + 按省份分组浏览**，并且在选中后
 * 明确显示"用哪个城市的经度、修正多少分钟"——让用户能当场验证。
 */
export default function PlacePicker({ value, onChange, id }: Props) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupCities(), []);

  /** 搜索结果：中文名、省份、拼音都能搜 */
  const results = useMemo(() => {
    const raw = keyword.trim();
    if (!raw) return null;
    const k = raw.toLowerCase();
    // 拼音/英文别名先解析成标准城市名（用与真正解析出生地时同一份别名表）
    const aliasTarget = cityFromKeyword(raw);
    return Object.keys(CITY_TABLE)
      .filter((city) => {
        const prov = groups.find((g) => g.cities.includes(city))?.province ?? '';
        return (
          city.includes(raw) ||
          prov.includes(raw) ||
          city.toLowerCase().includes(k) ||
          city === aliasTarget
        );
      })
      .slice(0, 40);
  }, [keyword, groups]);

  const resolved = resolvePlace(value);

  return (
    <div ref={wrapRef} className="relative">
      <div className="mt-2 flex gap-2">
        <input
          id={id}
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          placeholder="点右边选城市，或直接输入"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-2 transition hover:border-accent hover:text-accent"
        >
          {open ? '收起' : '选城市'}
        </button>
      </div>

      {/* 解析结果反馈：让用户当场看到"用哪个城市、修正多少" */}
      {value.trim() && (
        <p className="mt-1.5 text-xs leading-relaxed">
          {resolved.matched ? (
            <span className="text-ink-3">
              已按 <strong className="text-ink-2">{resolved.matched}</strong> 的经度计算
              （东经 {resolved.longitude}°）
            </span>
          ) : resolved.provinceLevel && resolved.province ? (
            <span className="text-amber-800">
              没找到这个城市，暂按 <strong>{resolved.province}</strong> 的中心经度
              （东经 {resolved.longitude}°）估算——建议从下面的列表里选一个城市更准
            </span>
          ) : (
            <span className="text-amber-800">
              认不出这个地名，暂时不做经度校正（相当于按东经 120° 算）。
              请从下面的列表里选一个城市。
            </span>
          )}
        </p>
      )}

      {open && (
        <div className="mt-2 rounded-xl border border-line bg-surface p-3">
          <input
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            placeholder="搜城市名 / 省份 / 拼音，如 昆山、浙江、hangzhou"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            autoComplete="off"
          />

          {results ? (
            <div className="mt-3">
              {results.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                  列表里没有「{keyword}」。
                  <br />
                  这不是你的问题——我们的城市表还不全。你可以：
                  <br />
                  ① 填一个最近的<b>大城市</b>（比如县填所属的地级市），经度误差通常在 1 度以内（约 4 分钟）
                  <br />
                  ② 或者直接告诉我们要补哪个城市
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {results.map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => {
                        onChange(city);
                        setOpen(false);
                        setKeyword('');
                      }}
                      className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs text-ink-2 transition hover:border-accent hover:text-accent"
                    >
                      {city}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="thin-scroll mt-3 max-h-64 space-y-3 overflow-y-auto">
              {groups.map((g) => (
                <div key={g.province}>
                  <p className="text-xs font-medium text-ink-3">{g.province}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {g.cities.map((city) => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => {
                          onChange(city);
                          setOpen(false);
                        }}
                        className={
                          'rounded-lg border px-2.5 py-1.5 text-xs transition ' +
                          (value === city
                            ? 'border-accent bg-accent-soft text-accent'
                            : 'border-line bg-paper text-ink-2 hover:border-accent hover:text-accent')
                        }
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 border-t border-line pt-2 text-xs leading-relaxed text-ink-3">
            经度决定真太阳时的修正量（每差 1 度约 4 分钟）。找不到自己出生的县，
            填最近的<b>地级市</b>即可，误差通常在几分钟内。
          </p>
        </div>
      )}
    </div>
  );
}
