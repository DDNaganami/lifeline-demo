'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DIMENSION_LABEL,
  type DimensionKey,
  type FeedbackType,
  type YearCardData,
} from '@/lib/types';
import type { SystemResponse } from '@/lib/response';
import { answerQuestion, type AskContext } from '@/lib/ask-answer';
import {
  ASK_LIMIT,
  CAP_MESSAGE,
  LAST_ONE_MESSAGE,
  canAsk,
  consumeAsk,
  getAskQuota,
} from '@/lib/ask-quota';

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
  /**
   * 系统对这次反馈的回应（规则生成，不是 AI）。
   * 这是闭环里最关键的一环：**反馈必须被接住**。
   */
  systemResponse?: SystemResponse;
  /** 真实排盘的依据行（用于让回应显得"确实懂这年"） */
  basis?: string;
  /** 追问回答的上下文（盘面事实，交给 lib/ask-answer.ts） */
  askContext: AskContext;
  draft: string;
  onDraftChange: (text: string) => void;
  onSaveNote: (text: string, skipped: boolean) => void;
  onClose: () => void;
  /** 系统回应里的下一步动作 */
  onAction?: (action: 'note' | 'ask' | 'continue' | 'checkTime') => void;
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
  systemResponse,
  basis,
  askContext,
  draft,
  onDraftChange,
  onSaveNote,
  onClose,
  onAction,
}: Props) {
  const [messages, setMessages] = useState<
    { role: 'user' | 'chen'; text: string; basis?: string[]; provider?: 'local' | 'model' }[]
  >([]);
  const [noteText, setNoteText] = useState(savedNote ?? '');
  const [noteSaved, setNoteSaved] = useState(Boolean(savedNote));
  const [thinking, setThinking] = useState(false);
  /** 每日追问配额（3 次）。挂载后读，客户端才有 localStorage。 */
  const [quota, setQuota] = useState(() => ({ used: 0, limit: ASK_LIMIT, remaining: ASK_LIMIT, resetNote: '' }));
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 读取浏览器本地存储的配额
    setQuota(getAskQuota());
  }, [open]);

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

  /**
   * 发送提问。
   * 走真实回答引擎（lib/ask-answer.ts）——它会读问题在问哪个领域，
   * 再引用这一年的宫位与四化，而不是回一段通用话术。
   * 每次消耗一次配额；用完就显示上限文案，不再发送。
   */
  async function send() {
    const text = draft.trim();
    if (!text || thinking) return;

    if (!canAsk()) {
      setQuota(getAskQuota());
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', text }]);
    onDraftChange('');
    setThinking(true);

    try {
      const answer = await answerQuestion(text, askContext);
      consumeAsk();
      setQuota(getAskQuota());
      setMessages((prev) => [
        ...prev,
        {
          role: 'chen',
          text: answer.paragraphs.join('\n\n'),
          basis: answer.basis,
          provider: answer.provider,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'chen', text: '这次没答上来。换个说法再问一次试试。', basis: [] },
      ]);
    } finally {
      setThinking(false);
    }
  }

  /** 系统回应里的「下一步」按钮 */
  function handleAction(action: 'note' | 'ask' | 'continue' | 'checkTime') {
    if (action === 'note') {
      noteRef.current?.focus();
      noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onAction?.(action);
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
          {/* 系统回应：闭环里最关键的一环——反馈必须被接住 */}
          {systemResponse && (
            <div className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3">
              <p className="text-xs font-medium text-accent">系统回应</p>
              <p className="mt-1.5 text-[15px] font-medium leading-relaxed text-ink">
                {systemResponse.headline}
              </p>
              {systemResponse.detail.map((d) => (
                <p key={d} className="mt-1.5 text-sm leading-relaxed text-ink-2">
                  {d}
                </p>
              ))}

              {basis && (
                <p className="mt-2.5 border-t border-accent/20 pt-2 text-xs leading-relaxed text-ink-3">
                  本年排盘依据：{basis}
                </p>
              )}

              <p className="mt-2 text-xs leading-relaxed text-ink-3">
                {systemResponse.archiveGrowth}
              </p>

              {systemResponse.nextStep && (
                <button
                  type="button"
                  onClick={() => handleAction(systemResponse.nextStep!.action)}
                  className="mt-3 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-page transition hover:opacity-90"
                >
                  {systemResponse.nextStep.label} →
                </button>
              )}
            </div>
          )}

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
              <br />
              回答会读你的盘——包括这一年落哪个宫、被什么引动。每日三问为限。
            </p>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={
                'max-w-[92%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ' +
                (m.role === 'user'
                  ? 'ml-auto bg-accent text-page'
                  : 'border border-line bg-paper text-ink-2')
              }
            >
              {m.role === 'chen' && (
                <p className="mb-1 text-xs font-medium text-ink-3">
                  陈老师
                  <span className="ml-1.5 font-normal text-ink-3/70">
                    {m.provider === 'model'
                      ? '（由模型读你的盘生成，未自行推算）'
                      : '（本地引擎读你的盘生成）'}
                  </span>
                </p>
              )}
              {m.text}
              {/* 回答的依据：让用户看得出这段话是从盘上哪来的 */}
              {m.role === 'chen' && m.basis && m.basis.length > 0 && (
                <details className="mt-2 border-t border-line pt-2">
                  <summary className="cursor-pointer text-xs text-ink-3 transition hover:text-ink-2">
                    这段回答的依据⌄
                  </summary>
                  <ul className="mt-1.5 space-y-1">
                    {m.basis.map((b) => (
                      <li key={b} className="text-xs leading-relaxed text-ink-3">
                        · {b}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}

          {thinking && (
            <div className="max-w-[92%] rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink-3">
              正在看你的盘…
            </div>
          )}
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
                  ref={noteRef}
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
          {quota.remaining > 0 ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs text-ink-3">
                  {quota.remaining === 1 ? LAST_ONE_MESSAGE : `今日还可问 ${quota.remaining} 次`}
                </p>
                <span
                  className="flex gap-1"
                  role="img"
                  aria-label={`每日 ${quota.limit} 次，已用 ${quota.used} 次，剩 ${quota.remaining} 次`}
                >
                  {/* 点亮的格 = 已用掉。配合左边的"已用 N 次"文案，方向一致不会误读 */}
                  {Array.from({ length: quota.limit }).map((_, i) => (
                    <span
                      key={i}
                      className={
                        'h-1.5 w-4 rounded-full transition ' +
                        (i < quota.used ? 'bg-accent' : 'bg-line')
                      }
                    />
                  ))}
                </span>
              </div>
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
                  disabled={!draft.trim() || thinking}
                  className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-page transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {thinking ? '正在看盘…' : '发送'}
                </button>
              </div>
            </>
          ) : (
            /* 达到上限：不说"次数用完了"，说成"今天到此为止" */
            <div className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3.5">
              <p className="text-[15px] font-medium text-ink">{CAP_MESSAGE.headline}</p>
              {CAP_MESSAGE.lines.map((line) => (
                <p key={line} className="mt-1 text-xs leading-relaxed text-ink-2">
                  {line}
                </p>
              ))}
              <p className="mt-2 text-xs text-ink-3">{CAP_MESSAGE.footer}</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
