'use client';

import { useState } from 'react';
import {
  DIMENSION_LABEL,
  type DimensionKey,
  type FeedbackType,
  type YearCardData,
} from '@/lib/types';

interface Props {
  open: boolean;
  year: number;
  dimension: DimensionKey;
  card: YearCardData;
  feedback?: FeedbackType;
  /** 历史反馈年表：年份 → 反馈 */
  history: { year: number; dimension: DimensionKey; feedback: FeedbackType }[];
  /** 建议追问语（打完反馈后自动带出） */
  suggestion?: string;
  /** 已有的核对档案原文 */
  savedNote?: string;
  draft: string;
  onDraftChange: (text: string) => void;
  onSaveNote: (text: string, skipped: boolean) => void;
  onClose: () => void;
}

/** 未接真实 AI 前，先给一段占位回答 */
function placeholderAnswer(year: number, feedback?: FeedbackType): string {
  const lines = ['（示例回答，第一阶段原型尚未接入 AI）', ''];
  if (feedback === '没有印象') {
    lines.push(
      `「没有印象」本身就是有用的信息。它通常有两种来源：一是这一年确实平淡，二是这条判断写得不够具体、无法核对。`,
      '',
      `处理 ${year} 年的正确做法，不是硬找一个印象，而是把它标注为「待验证」，等后面某一年的同类事情发生时再回来对照。`,
    );
  } else if (feedback === '完全不符合') {
    lines.push(
      `你说 ${year} 完全不符合，我需要先排除三种可能：这条判断本身写错了；这一年确实被更外部的事情主导；或者你把年份记岔了。`,
      '',
      '请把你记得的那一年实际发生的事写下来——有了它，我才能分辨是判断的问题还是记忆的问题。',
    );
  } else {
    lines.push(
      `关于 ${year} 年，我会先确认三件事：这一年你最在意的结果是哪一个；上面列的事件里你实际经历过哪几条；你现在的资源（时间、钱、能帮你的人）还剩多少。`,
      '',
      '这三件事决定了同一年份应该给出完全不同的建议。等你正式接入对话后，我会基于紫微与八字的排盘结果，逐年回答你的追问。',
    );
  }
  return lines.join('\n');
}

export default function ChenTeacherPanel({
  open,
  year,
  dimension,
  card,
  feedback,
  history,
  suggestion,
  savedNote,
  draft,
  onDraftChange,
  onSaveNote,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<{ role: 'user' | 'chen'; text: string }[]>([]);
  const [noteText, setNoteText] = useState(savedNote ?? '');
  const [noteSaved, setNoteSaved] = useState(Boolean(savedNote));

  if (!open) return null;

  /** 收起面板时清空临时对话（核对档案会保留） */
  function handleClose() {
    setMessages([]);
    onClose();
  }

  const otherFeedback = history
    .filter((h) => h.year !== year)
    .sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year))
    .slice(0, 3);

  function send() {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { role: 'user', text },
      { role: 'chen', text: placeholderAnswer(year, feedback) },
    ]);
    onDraftChange('');
  }

  function handleSaveNote(skipped: boolean) {
    const text = skipped ? '' : noteText.trim();
    onSaveNote(text, skipped);
    setNoteSaved(true);
    if (!skipped && text) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', text },
        {
          role: 'chen',
          text: `已记下 ${year} 年你亲历的这段。\n\n有了这几行，我对这一年就不再只有一张盘，还有你自己的经历。以后每年核对时，它会一起被带进来看。`,
        },
      ]);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="关闭面板"
        onClick={handleClose}
        className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[1px]"
      />

      <aside className="relative flex h-full w-full flex-col border-l border-line bg-surface anim-slide-in sm:max-w-[480px]">
        {/* 钉住的上下文 */}
        <header className="border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-wide text-ink-3">追问上下文（已自动带上）</p>
              <h2 className="mt-1 text-lg font-medium text-ink">问陈老师</h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-2 transition hover:border-line-strong"
            >
              收起
            </button>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-line bg-paper px-4 py-3 text-sm">
            <div>
              <dt className="text-xs text-ink-3">年份</dt>
              <dd className="text-ink">
                {year} 年 · {card.age} 岁
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">维度</dt>
              <dd className="text-ink">{DIMENSION_LABEL[dimension]}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">大限</dt>
              <dd className="text-ink">{card.daxian}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">阶段</dt>
              <dd className="text-ink">{card.phase}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-ink-3">你的反馈</dt>
              <dd className="text-ink">
                {feedback ? `本年 · ${DIMENSION_LABEL[dimension]}：${feedback}` : '本年还没有反馈'}
              </dd>
            </div>
            {otherFeedback.length > 0 && (
              <div className="col-span-2">
                <dt className="text-xs text-ink-3">历史反馈</dt>
                <dd className="text-ink-2">
                  {otherFeedback
                    .map((h) => `${h.year} · ${DIMENSION_LABEL[h.dimension]} ${h.feedback}`)
                    .join('；')}
                </dd>
              </div>
            )}
          </dl>
        </header>

        {/* 对话区 */}
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {suggestion && !noteSaved && (
            <p className="rounded-lg border border-accent/25 bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent">
              刚记下你的反馈，所以自动把这个问题带过来了。可以直接用，也可以改；不写的话点下面「这一年先不写」。
            </p>
          )}

          <div className="rounded-xl border border-line bg-paper px-4 py-3 text-sm leading-relaxed text-ink-2">
            <p className="font-medium text-ink">这一年 · 主判断</p>
            <p className="mt-1">{card.mainJudgment}</p>
          </div>

          {messages.length === 0 && !suggestion && (
            <p className="text-xs leading-relaxed text-ink-3">
              可以直接问，例如：「这一年我该换工作吗」「如果反馈没有印象，说明什么」「这一年最该防的是什么」。
            </p>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={
                'max-w-[92%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ' +
                (m.role === 'user'
                  ? 'ml-auto bg-accent text-white'
                  : 'border border-line bg-paper text-ink-2')
              }
            >
              {m.role === 'chen' && (
                <p className="mb-1 text-xs font-medium text-ink-3">陈老师（占位回答）</p>
              )}
              {m.text}
            </div>
          ))}
        </div>

        {/* 建议追问 + 核对档案 */}
        {(suggestion || noteSaved) && (
          <div className="border-t border-line bg-paper px-5 py-4">
            {!noteSaved ? (
              <>
                <p className="text-xs font-medium text-ink-2">
                  建议这样问 · 刚刚给你的反馈配的问题
                </p>
                <div className="mt-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink">
                  {suggestion}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onDraftChange(suggestion ?? '')}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                  >
                    用这句去问
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDraftChange('');
                      handleSaveNote(true);
                    }}
                    className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition hover:border-line-strong"
                  >
                    这一年先不写
                  </button>
                </div>

                <label className="mt-4 block text-xs font-medium text-ink-2" htmlFor="year-note">
                  这一年实际发生了什么？（写一句就够）
                </label>
                <textarea
                  id="year-note"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  placeholder="例如：这年换了工作，收入反而降了一点，但方向对了"
                  className="mt-2 w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-ink-3">写下的内容只存在你自己的浏览器里。</p>
                  <button
                    type="button"
                    onClick={() => handleSaveNote(false)}
                    disabled={!noteText.trim()}
                    className="rounded-xl bg-ink px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    存进我的核对档案
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-ink-2">
                已存进你的核对档案。后面每年的判断都会把它带进来看。
              </p>
            )}
          </div>
        )}

        {/* 输入区 */}
        <div className="border-t border-line px-5 py-4">
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            placeholder="把你的问题写在这里，回车发送（Shift + 回车换行）"
            className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-3">草稿会自动保留，切换年份也不会丢。</p>
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              发送
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
