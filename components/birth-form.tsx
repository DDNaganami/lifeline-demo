'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PlacePicker from '@/components/place-picker';
import { buildTrueSolarTime } from '@/lib/solar-time';
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

const GENDERS: BirthInfo['gender'][] = ['男', '女', '其他'];

/** 时辰是否确定——真太阳时校正需要它来标注可信度 */
const TIME_CONFIDENCE: { key: NonNullable<BirthInfo['birthTimeConfidence']>; label: string; note: string }[] = [
  { key: 'exact', label: '确定', note: '出生证明或长辈明确告知' },
  { key: 'approx', label: '大概是', note: '只知道上午 / 下午这种程度' },
  { key: 'unknown', label: '不知道', note: '按正午计算，结果仅供参考' },
];

const labelClass = 'block text-sm font-medium text-ink-2';
const fieldClass =
  'mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

export default function BirthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState('');
  const [gender, setGender] = useState<BirthInfo['gender']>('男');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [timeConfidence, setTimeConfidence] =
    useState<NonNullable<BirthInfo['birthTimeConfidence']>>('exact');
  const [errors, setErrors] = useState<string[]>([]);

  /**
   * 实时算一次真太阳时校正，用来**在填写阶段就提醒**：
   *   - 校正后跨了时辰边界 → 命宫会变，必须提醒
   *   - 校正后离边界很近（15 分钟内）→ 稍微不准就会换命宫
   *   - 城市认不出来 → 无法做经度校正
   *
   * 这一步用真实算法，不是估算——它影响的是整张命盘对不对。
   */
  const solarPreview = useMemo(() => {
    if (!birthDate || !birthTime || !birthPlace.trim()) return null;
    try {
      const st = buildTrueSolarTime({
        gender,
        birthDate,
        birthTime,
        birthPlace: birthPlace.trim(),
      });
      // 距离时辰边界还有多少分钟
      const [th, tm] = st.trueSolarTime.split(':').map(Number);
      const minutesIntoShichen = ((th + 1) % 2) * 60 + tm;
      const toBoundary = Math.min(minutesIntoShichen, 120 - minutesIntoShichen);
      return { ...st, toBoundary };
    } catch {
      return null;
    }
  }, [birthDate, birthTime, birthPlace, gender]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: string[] = [];
    if (!birthDate) next.push('请选择出生日期');
    if (!birthTime) next.push('请选择出生时辰（不确定也可以选「不确定」）');
    if (!birthPlace.trim()) next.push('请填写出生地（真太阳时校正需要它来定位经度）');
    setErrors(next);
    if (next.length > 0) return;

    saveBirth({
      name: name.trim() || undefined,
      gender,
      birthDate,
      // 时辰本身标为"不确定"时，可信度也自动降级
      birthTime,
      birthTimeConfidence: birthTime.includes('不确定') ? 'unknown' : timeConfidence,
      birthPlace: birthPlace.trim(),
    });

    /**
     * 从首页点问题进来的话，把问题带到仪表盘——
     * 用户落地就直接看到他问的那件事，不用再自己找维度。
     */
    const carried = new URLSearchParams();
    for (const key of ['q', 'dim', 'year'] as const) {
      const v = searchParams.get(key);
      if (v) carried.set(key, v);
    }
    const suffix = carried.toString() ? `?${carried.toString()}` : '';
    router.push(`/dashboard/${suffix}`);
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

        {/* 时辰可信度：真太阳时会改变时辰，所以必须知道输入本身有多可靠 */}
        <div className="mt-3">
          <p className="text-xs text-ink-3">
            这个时辰有多确定？真太阳时校正会按出生地重新定时辰，如果原本就不确定，我们会标注出来。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIME_CONFIDENCE.map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={birthTime.includes('不确定')}
                onClick={() => setTimeConfidence(c.key)}
                aria-pressed={timeConfidence === c.key}
                className={
                  'rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-40 ' +
                  (timeConfidence === c.key && !birthTime.includes('不确定')
                    ? 'border-accent bg-accent-soft font-medium text-accent'
                    : 'border-line bg-surface text-ink-2 hover:border-line-strong')
                }
              >
                {c.label}
              </button>
            ))}
          </div>
          {birthTime.includes('不确定') ? (
            <p className="mt-1.5 text-xs text-amber-700">
              已选「不确定」→ 将按正午（午时）计算，命盘结果会标注为仅供参考。
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-ink-3">
              {TIME_CONFIDENCE.find((c) => c.key === timeConfidence)?.note}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="birthPlace">
          出生地
        </label>
        <PlacePicker id="birthPlace" value={birthPlace} onChange={setBirthPlace} />
        <p className="mt-1.5 text-xs text-ink-3">
          精确到<strong className="text-ink-2">地级市</strong>就够了 ——
          真太阳时按经度校正，每差 1 度约 4 分钟。
        </p>

        {/* 真太阳时预览：填完就告诉你时辰会不会被改 */}
        {solarPreview && (
          <div
            className={
              'mt-3 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ' +
              (solarPreview.crossedBoundary || solarPreview.toBoundary <= 15
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-line bg-paper text-ink-2')
            }
          >
            <p>
              <strong>真太阳时校正预览：</strong>
              钟表 {solarPreview.localTime} → 真太阳时{' '}
              <strong>{solarPreview.trueSolarTime}</strong>（{solarPreview.timeName}）
              ，修正 {solarPreview.totalOffsetMinutes > 0 ? '+' : ''}
              {solarPreview.totalOffsetMinutes} 分
              {solarPreview.dstApplied && '，已扣除夏令时'}。
            </p>

            {solarPreview.crossedBoundary && (
              <p className="mt-1.5">
                ⚠️ <strong>校正后跨了时辰边界</strong>：按钟表时间算是别的时辰，
                按真太阳时落到 <strong>{solarPreview.timeName}</strong>。
                <strong>命宫会因此改变，整张盘都不同</strong>——建议再确认一下出生时间。
              </p>
            )}

            {!solarPreview.crossedBoundary && solarPreview.toBoundary <= 15 && (
              <p className="mt-1.5">
                ⚠️ 真太阳时离时辰边界只差 <strong>{Math.round(solarPreview.toBoundary)} 分钟</strong>
                ，出生时间稍微不准就会换一个时辰，命宫也会跟着变。建议核对更精确的时间。
              </p>
            )}

            {solarPreview.place.approximate && (
              <p className="mt-1.5">
                ⚠️ 没认出「{birthPlace.trim()}」这个出生地，暂时按东经 120° 粗略计算。
                建议从下面的候选里选一个城市。
              </p>
            )}

            {!solarPreview.crossedBoundary &&
              solarPreview.toBoundary > 15 &&
              !solarPreview.place.approximate && (
                <p className="mt-1.5 text-ink-3">
                  ✅ 离时辰边界还有 {Math.round(solarPreview.toBoundary)} 分钟，时辰比较稳。
                </p>
              )}
          </div>
        )}
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
        <strong className="text-ink-2">紫微与八字为真实排盘</strong>
        （含真太阳时校正），年度事件由四化落宫生成。
        <br />
        曲线的长期形状与「今日」内容仍是原型阶段的模拟数据。
        填写的信息只保存在你自己的浏览器里。
      </p>
    </form>
  );
}
