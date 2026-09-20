'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QrCode from '@/components/qr-code';
import { buildAlmanac, buildDailyContent } from '@/lib/almanac';
import { buildLifeLine, buildStageCard } from '@/lib/mock-data';
import { loadBirth } from '@/lib/storage';
import type { BirthInfo } from '@/lib/types';

/**
 * LifeLine 桌面设备模拟器
 * ---------------------------------------------------------------
 * 屏幕规格严格按硬件来：**480 × 480，方形，桌面可视距离**。
 * 这个页面有三个用途：
 *   1. 用平板全屏打开，当真实设备用一周，验证「每天会不会看」
 *   2. 它就是固件（ESP32-S3 + LVGL）的排版稿：字号、行数、字数都按屏幕算好了
 *   3. 它同时是接口契约：每个屏幕用到的字段，就是要从服务器/本地取的字段
 *
 * 排版硬规则（改内容时请遵守）：
 *   单屏 ≤ 80 字、≤ 7 行；正文 28px 起，关键信息 40px 起，大数字 96px
 */

export type ScreenKey = 'almanac' | 'today' | 'week' | 'voice' | 'idle' | 'qr';

/** 屏幕形状预览：矩形 / 圆形 / 圆形并显示安全区 */
export type ShapeMode = 'rect' | 'round' | 'roundSafe';

export const SCREENS: { key: ScreenKey; label: string; note: string }[] = [
  { key: 'almanac', label: '① 待机 · 黄历', note: '本地离线算，零成本，断网可用' },
  { key: 'today', label: '② 今日 · 能量', note: '每天拉一次，个性化内容' },
  { key: 'week', label: '③ 未来 7 天', note: '一句结论 + 极简柱状' },
  { key: 'voice', label: '④ 语音', note: '唤醒词本地识别，回答上云' },
  { key: 'qr', label: '⑤ 扫码看详情', note: '曲线/年度卡片/档案放不下，扫码去手机看' },
  { key: 'idle', label: '⑥ 待机 · 极简', note: '夜间或长时间无人时的画面' },
];

export const SHAPES: { key: ShapeMode; label: string; note: string }[] = [
  { key: 'rect', label: '矩形 480×480', note: '当前设计稿' },
  { key: 'round', label: '圆形（直径 480）', note: '看哪些内容会被切掉' },
  { key: 'roundSafe', label: '圆形 + 安全区', note: '安全区=直径 70%（336）' },
];

/** 单屏字数上限：矩形 80 字；圆形安全区变窄，容量约 7 成 */
export const CHAR_LIMIT: Record<ShapeMode, number> = {
  rect: 80,
  round: 80,
  roundSafe: 56,
};

/** 演示用的默认出生信息（没有填过时使用） */
const DEMO_BIRTH: BirthInfo = {
  name: '演示',
  gender: '男',
  birthDate: '1993-06-18',
  birthTime: '午时 11:00-13:00',
  birthPlace: '浙江杭州',
};

const STATUS_BAR = 'flex h-8 items-center justify-between px-6 text-[20px] text-[#8b8578]';

function formatClock(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/* ============================ 屏幕 1：黄历 ============================ */

function AlmanacScreen({ date }: { date: Date }) {
  const a = useMemo(() => buildAlmanac(date), [date]);
  return (
    <div className="flex h-full flex-col">
      <div className={STATUS_BAR}>
        <span>{formatClock(date)}</span>
        <span className="tracking-widest">▮▮▮</span>
      </div>

      <div className="px-8 pt-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[28px] text-[#e8e3d9]">{a.solarDate}</span>
          <span className="text-[24px] text-[#8b8578]">{a.weekday}</span>
        </div>
      </div>

      <div className="px-8 pt-2">
        <div className="text-[96px] leading-[1.05] text-[#d9a441]">{a.lunarDay}</div>
        <div className="mt-3 text-[26px] text-[#c9c2b4]">
          {a.yearGanZhi} {a.dayGanZhi}
        </div>
        <div className="mt-1 text-[22px] text-[#8b8578]">
          {a.lunarMonth} · {a.solarTerm}
        </div>
      </div>

      <div className="mx-8 mt-4 h-px bg-[#2e2b26]" />

      <div className="px-8 pt-4">
        <div className="flex items-center gap-4">
          <span className="w-[46px] shrink-0 text-[30px] text-[#6fae7f]">宜</span>
          <span className="text-[28px] text-[#e8e3d9]">{a.good.join(' · ')}</span>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <span className="w-[46px] shrink-0 text-[30px] text-[#c4705f]">忌</span>
          <span className="text-[28px] text-[#e8e3d9]">{a.bad.join(' · ')}</span>
        </div>
      </div>

      <div className="mt-auto px-8 pb-7">
        <div className="flex items-center justify-between text-[22px] text-[#8b8578]">
          <span>
            {a.directions.map((d) => `${d.label} ${d.value}`).join('　')}
          </span>
          <span>{a.clash}煞北</span>
        </div>
      </div>
    </div>
  );
}

/* ============================ 屏幕 2：今日 ============================ */

function TodayScreen({ date, birth }: { date: Date; birth: BirthInfo }) {
  const daily = useMemo(() => buildDailyContent(date), [date]);
  const stage = useMemo(() => {
    const points = buildLifeLine(birth);
    return buildStageCard(points, birth);
  }, [birth]);

  const birthYear = Number(birth.birthDate.slice(0, 4));
  const chapterYear = stage.age - (new Date().getFullYear() - birthYear) + 1;

  return (
    <div className="flex h-full flex-col">
      <div className={STATUS_BAR}>
        <span>{formatClock(date)}</span>
        <span className="tracking-widest">▮▮▮</span>
      </div>

      <div className="px-8 pt-1 text-[20px] text-[#8b8578]">今日能量</div>

      <div className="px-8 pt-1">
        <div className="text-[56px] leading-[1.1] text-[#d9a441]">{daily.energyWord}</div>
        <div className="mt-3 text-[30px] leading-[1.35] text-[#e8e3d9]">{daily.energyLine}</div>
      </div>

      <div className="mx-8 mt-5 h-px bg-[#2e2b26]" />

      <div className="px-8 pt-5">
        <div className="text-[20px] text-[#8b8578]">你正处在</div>
        <div className="mt-1 text-[40px] leading-[1.15] text-[#e8e3d9]">{stage.phase}</div>
        <div className="mt-2 text-[22px] text-[#8b8578]">
          {stage.daxian.split(' · ')[0]} · 第 {chapterYear} 年
        </div>
      </div>

      <div className="mt-auto px-8 pb-7 text-[26px] leading-[1.4] text-[#c9c2b4]">
        今年不宜盲目扩张，
        <br />
        先处理健康和家庭责任。
      </div>
    </div>
  );
}

/* ============================ 屏幕 3：未来 7 天 ============================ */

function WeekScreen({ date }: { date: Date }) {
  const daily = useMemo(() => buildDailyContent(date), [date]);
  const todayIndex = (date.getDay() + 6) % 7; // 周一为 0

  return (
    <div className="flex h-full flex-col">
      <div className={STATUS_BAR}>
        <span>{formatClock(date)}</span>
        <span className="tracking-widest">▮▮▮</span>
      </div>

      <div className="px-8 pt-2 text-[28px] text-[#e8e3d9]">未来 7 天</div>

      <div className="mt-6 flex items-end justify-between px-8">
        {daily.week.map((w, i) => {
          const isToday = i === todayIndex;
          return (
            <div key={w.label} className="flex w-[46px] flex-col items-center">
              <span className={'text-[22px] ' + (isToday ? 'text-[#d9a441]' : 'text-[#8b8578]')}>
                {w.label}
              </span>
              <div
                className={
                  'mt-2 w-[34px] rounded-t ' +
                  (isToday ? 'bg-[#d9a441]' : 'bg-[#3a3630]')
                }
                style={{ height: `${Math.round((w.value / 100) * 150)}px` }}
              />
              <span
                className={
                  'mt-2 text-[24px] ' + (isToday ? 'text-[#d9a441]' : 'text-[#c9c2b4]')
                }
              >
                {w.word}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mx-8 mt-6 h-px bg-[#2e2b26]" />

      <div className="px-8 pt-5 text-[30px] leading-[1.4] text-[#e8e3d9]">
        {daily.weekLine}
      </div>

      <div className="mt-auto px-8 pb-7 text-[22px] text-[#8b8578]">
        数值为相对高低，不显示具体分数
      </div>
    </div>
  );
}

/* ============================ 屏幕 4：语音 ============================ */

function VoiceScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="relative flex h-[140px] w-[140px] items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#d9a441]/20" />
        <span className="absolute inset-6 rounded-full bg-[#d9a441]/30" />
        <span className="relative text-[44px] text-[#d9a441]">◉</span>
      </div>

      <div className="mt-6 text-[40px] text-[#e8e3d9]">我在听</div>

      <div className="mt-6 h-[36px] text-[24px] text-[#8b8578]">
        2028 年我该换工作吗
      </div>

      <div className="mt-4 flex items-end gap-1.5">
        {[10, 22, 34, 46, 34, 22, 10].map((h, i) => (
          <span
            key={i}
            className="w-[6px] rounded-full bg-[#6b6459]"
            style={{ height: `${h}px` }}
          />
        ))}
      </div>

      <div className="mt-10 text-[20px] text-[#6b6459]">说出你的问题，或按一下结束</div>
    </div>
  );
}

/* ============================ 屏幕 5：扫码看详情 ============================ */

/**
 * 为什么需要这一屏：
 *   曲线、年度卡片、核对档案这些核心资产在 480×480（甚至圆形安全区 336）上放不下。
 *   与其在小屏上勉强塞一个残缺版，不如让设备**把手机变成大屏**——
 *   扫码直接打开手机上的排盘页，承载全部内容。
 *
 * 二维码内容来自服务端下发的 `chartUrl`（固件向服务器要，见 ESP32 规格 §3.4），
 * 模拟器里用当前站点的地址代替。
 */
function QrScreen({ size = 480 }: { size?: number }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    // 客户端取真实地址：本地是 localhost，部署后就是公网地址
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 需要读 window.location
    setUrl(`${window.location.origin}/dashboard/`);
  }, []);

  const qrSize = Math.round(size * 0.52); // 约 250px，留出边距与文案空间

  return (
    <div className="flex h-full flex-col items-center justify-center px-8">
      <div className="text-[26px] text-[#c9c2b4]">想看完整曲线？</div>

      <div className="mt-4 rounded-lg bg-white p-2">
        {url ? (
          <QrCode value={url} size={qrSize} color="#1a1917" background="#ffffff" />
        ) : (
          <div style={{ width: qrSize, height: qrSize }} className="bg-white" />
        )}
      </div>

      <div className="mt-4 text-center text-[24px] leading-[1.4] text-[#e8e3d9]">
        用手机扫码
        <br />
        <span className="text-[20px] text-[#8b8578]">看曲线 · 年度卡片 · 我的档案</span>
      </div>
    </div>
  );
}

/* ============================ 屏幕 6：极简待机 ============================ */

function IdleScreen({ date }: { date: Date }) {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#d9a441] text-[36px] font-semibold text-[#1a1917]">
        L
      </div>
      <div className="mt-8 text-[32px] tracking-[0.3em] text-[#c9c2b4]">LIFELINE</div>
      <div className="mt-3 text-[22px] text-[#6b6459]">
        {date.getMonth() + 1} 月 {date.getDate()} 日
      </div>
    </div>
  );
}

/* ============================ 模拟器外壳 ============================ */

export default function AmbientSimulator({
  initialScreen,
  initialShape = 'rect',
}: {
  initialScreen: ScreenKey;
  initialShape?: ShapeMode;
}) {
  const [screen, setScreen] = useState<ScreenKey>(initialScreen);
  const [shape, setShape] = useState<ShapeMode>(initialShape);
  const [birth, setBirth] = useState<BirthInfo>(DEMO_BIRTH);
  const [usingDemo, setUsingDemo] = useState(true);
  const [now, setNow] = useState<Date | null>(null);
  const [clippedText, setClippedText] = useState<string[]>([]);
  const [roundCapacity, setRoundCapacity] = useState(0);
  const [roundRows, setRoundRows] = useState(0);
  const screenRef = useRef<HTMLDivElement>(null);

  // 时间与出生信息只在客户端取，避免服务端渲染不一致
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载后读取浏览器时间与本地存储
    setNow(new Date());
    const stored = loadBirth();
    if (stored) {
      setBirth(stored);
      setUsingDemo(false);
    }
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // 固定一个演示时刻用于服务端渲染，挂载后再切换到真实时间
  const date = useMemo(
    () => now ?? new Date(2026, 8, 18, 20, 30),
    [now],
  );

  const charLimit = CHAR_LIMIT[shape];

  /**
   * 圆形屏检测（在 effect 里测量，不能在渲染期间读 ref）：
   *   1) 容量 —— 按 28px 字号逐行累加该高度的弦长可用字数
   *   2) 遮挡 —— 哪些文字超出了它那一行所在高度的可用宽度
   *
   * 关键点：圆形屏对不同高度的行，可用宽度不同——越靠上下边缘越窄。
   *   弦长 = 2 × √(r² − dy²)      dy = 该行中心到圆心的垂直距离
   */
  useEffect(() => {
    if (shape === 'rect') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 切回矩形时清空上一次的检测结果
      setClippedText([]);
      return;
    }
    const el = screenRef.current;
    if (!el) return;

    const box = el.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const r = Math.min(box.width, box.height) / 2;
    // 圆形屏不能贴边，留一点内缩
    const safeFactor = shape === 'roundSafe' ? 0.7 : 0.94;

    /* ---- 1) 容量：按 28px 字号逐行累加可用字数（弦长） ---- */
    const fontSize = 28;
    const lineHeight = fontSize * 1.4;
    let capacity = 0;
    let rows = 0;
    for (let y = cy - r; y <= cy + r; y += lineHeight) {
      const dy = Math.abs(y - cy);
      const half = Math.sqrt(Math.max(0, r * r - dy * dy)) * safeFactor;
      const chars = Math.floor((half * 2) / fontSize);
      if (chars > 0) {
        capacity += chars;
        rows += 1;
      }
    }
    setRoundCapacity(capacity);
    setRoundRows(rows);

    /* ---- 2) 遮挡：哪些文字超出了它那一行所在高度的可用宽度 ---- */
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const clipped: string[] = [];
    const seen = new Set<string>();
    let node: Node | null;

    while ((node = walker.nextNode())) {
      const text = (node.textContent ?? '').trim();
      if (!text || !node.parentElement) continue;
      if (node.parentElement.closest('[data-overlay]')) continue;

      const range = document.createRange();
      range.selectNodeContents(node);

      let hit = false;
      for (const rc of Array.from(range.getClientRects())) {
        const rowCenterY = rc.top + rc.height / 2;
        const dy = Math.abs(rowCenterY - cy);

        // 该行所在高度的可用半宽（弦长的一半），并乘安全系数
        const halfChord = Math.sqrt(Math.max(0, r * r - dy * dy)) * safeFactor;
        const usableLeft = cx - halfChord;
        const usableRight = cx + halfChord;

        const textWidth = rc.width;
        // 该行文字在屏上的左边界（getClientRects 给的是实际渲染位置）
        const textLeft = rc.left;
        const textRight = textLeft + textWidth;

        // 两端任一超出可用范围，或整行宽度超过可用宽度 → 会被切
        if (textLeft < usableLeft - 1 || textRight > usableRight + 1) {
          hit = true;
          break;
        }
      }

      if (hit && !seen.has(text)) {
        seen.add(text);
        clipped.push(text.length > 30 ? text.slice(0, 30) + '…' : text);
      }
    }

    setClippedText(clipped.slice(0, 8));
  }, [shape, screen, date]);

  const charCount: Record<ScreenKey, number> = useMemo(() => {
    const a = buildAlmanac(date);
    const d = buildDailyContent(date);
    return {
      almanac:
        (a.solarDate + a.weekday + a.lunarDay + a.yearGanZhi + a.dayGanZhi + a.lunarMonth + a.solarTerm + a.good.join('') + a.bad.join('') + a.directions.map((x) => x.label + x.value).join('') + a.clash).length,
      today:
        (d.energyWord + d.energyLine + '今日能量你正处在今年不宜盲目扩张先处理健康和家庭责任').length,
      week: (d.weekLine + '未来7天' + d.week.map((w) => w.label + w.word).join('')).length,
      voice: '我在听2028年我该换工作吗说出你的问题或按一下结束'.length,
      qr: '想看完整曲线？用手机扫码看曲线年度卡片我的档案'.length,
      idle: 'LIFELINE'.length + 6,
    };
  }, [date]);

  const notes: Record<ScreenKey, string> = {
    almanac: '数据来源：本地算。断网也有内容，是设备「永远不空」的底。',
    today: '数据来源：服务器每天拉一次（几百字节）。断网时用缓存。',
    week: '数据来源：同今日，一次拉取即可覆盖 7 天。',
    voice: '唤醒词在本地识别（免费、即时）；真正的问答上云，按次计费。',
    qr: '曲线、年度卡片、核对档案在 480×480 上放不下——与其塞一个残缺版，不如让设备把手机变成大屏。二维码地址由服务端下发（见 ESP32 规格）。',
    idle: '长时间无人或夜间显示，避免烧屏、也更省电。',
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <p className="text-sm tracking-[0.2em] text-ink-3">LIFELINE · 桌面设备</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">480×480 屏幕模拟器</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          这台设备在桌上、50–80cm 外被看一眼。
          所以每屏只讲一件事，正文 28px 起，<strong className="text-ink">单屏不超过 80 字</strong>。
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[480px_1fr] lg:items-start">
        {/* 设备：小屏时整体等比缩小，保持真实像素比例 */}
        <div className="[zoom:calc(100vw/560)] lg:[zoom:1]">
          <div className="rounded-[28px] border border-[#3a3630] bg-[#26241f] p-4 shadow-[0_18px_40px_rgba(23,21,15,0.28)]">
            <div
              ref={screenRef}
              style={{ width: 480, height: 480, borderRadius: shape === 'rect' ? 14 : 240 }}
              className="relative overflow-hidden bg-[#1a1917] select-none"
            >
              {screen === 'almanac' && <AlmanacScreen date={date} />}
              {screen === 'today' && <TodayScreen date={date} birth={birth} />}
              {screen === 'week' && <WeekScreen date={date} />}
              {screen === 'voice' && <VoiceScreen />}
              {screen === 'idle' && <IdleScreen date={date} />}
              {screen === 'qr' && <QrScreen />}

              {/* 圆形遮罩：把圆外的内容压暗，模拟真实圆屏被切掉的效果 */}
              {shape !== 'rect' && (
                <div data-overlay className="pointer-events-none absolute inset-0">
                  {/* 用 radial-gradient 做圆形挖空：圆外压暗，模拟真实圆屏被切掉的部分 */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 50%, transparent 0, transparent 239px, rgba(13,12,11,0.82) 240px)',
                    }}
                  />
                  {shape === 'roundSafe' && (
                    <div
                      className="absolute rounded-full border border-dashed border-[#d9a441]/60"
                      style={{
                        width: 336,
                        height: 336,
                        left: (480 - 336) / 2,
                        top: (480 - 336) / 2,
                      }}
                    />
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between px-1 text-[11px] text-[#8b8578]">
              <span>ESP32-S3 · 480×480 · LVGL</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#6fae7f]" />
            </div>
          </div>

          <p className="mt-3 text-center text-xs text-ink-3">
            时间显示为当前时间：{formatClock(date)}
          </p>
        </div>

        {/* 控制区 */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)]">
            <h2 className="text-sm font-medium text-ink-2">切换屏幕</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {SCREENS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setScreen(s.key)}
                  className={
                    'rounded-xl border px-3 py-2.5 text-left text-sm transition ' +
                    (screen === s.key
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-surface text-ink-2 hover:border-line-strong')
                  }
                >
                  <span className="block font-medium">{s.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-3">{s.note}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)]">
            <h2 className="text-sm font-medium text-ink-2">切换屏幕形状</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">
              换圆形屏不用重做项目，但排版要重做。切到圆形，看现在的设计会被切掉什么。
            </p>
            <div className="mt-3 grid gap-2">
              {SHAPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setShape(s.key)}
                  className={
                    'rounded-xl border px-3 py-2.5 text-left text-sm transition ' +
                    (shape === s.key
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-surface text-ink-2 hover:border-line-strong')
                  }
                >
                  <span className="block font-medium">{s.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-3">{s.note}</span>
                </button>
              ))}
            </div>
          </section>

          {shape !== 'rect' && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-sm font-medium text-amber-900">圆形屏实测：被切掉的内容</h2>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                按圆方程逐字检测的结果（落在圆外 = 真实圆屏上会被切掉）。
              </p>
              {clippedText.length === 0 ? (
                <p className="mt-3 text-sm text-amber-900">这一屏没有被切掉的内容 ✓</p>
              ) : (
                <ul className="mt-3 space-y-1.5 text-sm text-amber-900">
                  {clippedText.map((t) => (
                    <li key={t}>· 「{t}」</li>
                  ))}
                </ul>
              )}
              <div className="mt-4 border-t border-amber-200 pt-3 text-xs leading-relaxed text-amber-800">
                <p>
                  字号不变（28px）的情况下：矩形一行 17 字；圆形安全区一行只有{' '}
                  <strong>12 字</strong>。
                </p>
                <p className="mt-1">
                  按弦长逐行累加，圆形安全区这一屏实际能放约{' '}
                  <strong>{roundCapacity} 字 / {roundRows} 行</strong>
                  （矩形是 80 字 / 7 行）。当前这一屏有 {charCount[screen]} 字。
                </p>
                <p className="mt-1">
                  所以圆形屏要重排的不只是边距——黄历那种「宜 / 忌」多行清单基本放不下。
                </p>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)]">
            <h2 className="text-sm font-medium text-ink-2">这一屏的说明</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{notes[screen]}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-xs">
              <span className="text-ink-3">字数统计</span>
              <span
                className={
                  'rounded-full border px-2.5 py-1 ' +
                  (charCount[screen] <= charLimit
                    ? 'border-teal-200 bg-teal-50 text-teal-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700')
                }
              >
                {charCount[screen]} 字 / 上限 {charLimit}
                {shape !== 'rect' && '（圆形）'}
              </span>
              <span className="text-ink-3">
                {charCount[screen] <= charLimit ? '符合屏幕约束' : '超出，需要删减或拆屏'}
              </span>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)]">
            <h2 className="text-sm font-medium text-ink-2">排版规格（固件照着这个做）</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">屏幕</dt>
                <dd className="text-ink">480 × 480，方形，桌面可视距离</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">状态行</dt>
                <dd className="text-ink">高 32px，20px 字</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">正文</dt>
                <dd className="text-ink">28–30px</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">关键信息</dt>
                <dd className="text-ink">40–56px</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">大数字（农历日）</dt>
                <dd className="text-ink">96px</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">左右边距</dt>
                <dd className="text-ink">32px</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">配色</dt>
                <dd className="text-ink">底 #1a1917 · 主色 #d9a441 · 正文 #e8e3d9</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,21,15,0.04)]">
            <h2 className="text-sm font-medium text-ink-2">当前数据来源</h2>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-2">
              <li>
                · 黄历：<span className="text-ink">本地离线算（模拟实现）</span>，
                将来换成 <code className="rounded bg-paper px-1">lunar-typescript</code> 只改一个文件
              </li>
              <li>· 今日能量 / 7 天：模拟内容，将来由服务器每日推送</li>
              <li>· 人生章节：{usingDemo ? '示例出生信息（1993-06-18）' : '你填写的出生信息'}</li>
              <li>· 语音：界面演示，未接唤醒与识别</li>
            </ul>
            {usingDemo && (
              <p className="mt-3 text-xs text-ink-3">
                还没有填写出生信息，所以章节部分用示例数据演示。回到首页填写后，这一屏会跟着变。
              </p>
            )}
          </section>

          <p className="text-xs leading-relaxed text-ink-3">
            要把它当真实设备试用：用平板或手机浏览器打开这个地址，把屏幕常亮、全屏，
            放在你平时会经过的位置，看一周自己会不会真的去看它。
          </p>
        </div>
      </div>
    </div>
  );
}
