'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveBirth } from '@/lib/storage';
import type { BirthInfo } from '@/lib/types';

/** 十二时辰选项，最后一个允许不确定 */
export const TIME_OPTIONS: string[] = [
  '子时 23:00-01:00',
  '丑时 01:00-03:00',
  '寅时 03:00-05:00',
  '卯时 05:00-07:00',
  '辰时 07:00-09:00',
  '巳时 09:00-11:00',
  '午时 11:00-13:00',
  '未时 13:00-15:00',
  '申时 15:00-17:00',
  '酉时 17:00-19:00',
  '戌时 19:00-21:00',
  '亥时 21:00-23:00',
  '不确定',
];

const PLACE_SUGGESTIONS = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '成都',
  '杭州',
  '武汉',
  '西安',
  '南京',
  '重庆',
  '天津',
  '长沙',
];

const GENDERS: BirthInfo['gender'][] = ['男', '女', '其他'];

const labelClass = 'block text-sm font-medium text-ink-2';
const fieldClass =
  'mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

export default function BirthForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [gender, setGender] = useState<BirthInfo['gender']>('男');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: string[] = [];
    if (!birthDate) next.push('请选择出生日期');
    if (!birthTime) next.push('请选择出生时辰（不确定也可以选「不确定」）');
    if (!birthPlace.trim()) next.push('请填写出生地');
    setErrors(next);
    if (next.length > 0) return;

    saveBirth({
      name: name.trim() || undefined,
      gender,
      birthDate,
      birthTime,
      birthPlace: birthPlace.trim(),
    });
    router.push('/dashboard');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div>
        <label className={labelClass} htmlFor="name">
          姓名（可选）
        </label>
        <input
          id="name"
          className={fieldClass}
          placeholder="怎么称呼你"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <fieldset>
        <legend className={labelClass}>性别</legend>
        <div className="mt-2 flex gap-2">
          {GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              aria-pressed={gender === g}
              className={
                'flex-1 rounded-xl border px-4 py-3 text-base transition ' +
                (gender === g
                  ? 'border-accent bg-accent-soft font-medium text-accent'
                  : 'border-line bg-surface text-ink-2 hover:border-line-strong')
              }
            >
              {g}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label className={labelClass} htmlFor="birthDate">
          出生日期（公历）
        </label>
        <input
          id="birthDate"
          type="date"
          className={fieldClass}
          value={birthDate}
          min="1900-01-01"
          max="2025-12-31"
          onChange={(e) => setBirthDate(e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="birthTime">
          出生时辰
        </label>
        <select
          id="birthTime"
          className={fieldClass}
          value={birthTime}
          onChange={(e) => setBirthTime(e.target.value)}
        >
          <option value="">请选择</option>
          {TIME_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="birthPlace">
          出生地
        </label>
        <input
          id="birthPlace"
          className={fieldClass}
          placeholder="例如：浙江杭州"
          list="place-suggestions"
          value={birthPlace}
          onChange={(e) => setBirthPlace(e.target.value)}
        />
        <datalist id="place-suggestions">
          {PLACE_SUGGESTIONS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.map((msg) => (
            <li key={msg}>· {msg}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        className="w-full rounded-xl bg-accent px-6 py-4 text-base font-medium text-white transition hover:opacity-90 active:opacity-80"
      >
        生成我的人生战略曲线
      </button>

      <p className="text-center text-xs leading-relaxed text-ink-3">
        当前为第一阶段原型，使用模拟数据，不做真实排盘计算。
        <br />
        填写的信息只保存在你自己的浏览器里。
      </p>
    </form>
  );
}
