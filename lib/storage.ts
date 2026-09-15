/**
 * 本地存储（localStorage）读写
 * 第一阶段不接数据库，所有用户数据都留在本人浏览器里。
 */

import type {
  BirthInfo,
  FeedbackMap,
  FeedbackRecord,
  FeedbackType,
  DimensionKey,
  YearNote,
  YearNoteMap,
} from './types';

export const STORAGE_KEYS = {
  birth: 'lifeline.birth',
  feedback: 'lifeline.feedback',
  draft: 'lifeline.draft',
  notes: 'lifeline.notes',
} as const;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/* --------------------------- 出生信息 --------------------------- */

function isValidBirth(v: unknown): v is BirthInfo {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.birthDate === 'string' &&
    o.birthDate.length >= 8 &&
    typeof o.gender === 'string' &&
    typeof o.birthTime === 'string' &&
    typeof o.birthPlace === 'string'
  );
}

export function loadBirth(): BirthInfo | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.birth);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidBirth(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveBirth(info: BirthInfo): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.birth, JSON.stringify(info));
  } catch {
    /* 存储不可用时静默跳过，原型不做提示 */
  }
}

export function clearBirth(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.birth);
  } catch {
    /* 忽略 */
  }
}

/* --------------------------- 反馈记录 --------------------------- */

export function feedbackKey(year: number, dimension: DimensionKey): string {
  return `${year}:${dimension}`;
}

export function loadFeedback(): FeedbackMap {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.feedback);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as FeedbackMap;
  } catch {
    return {};
  }
}

/** 返回写入后的完整反馈表 */
export function saveFeedback(
  year: number,
  dimension: DimensionKey,
  feedback: FeedbackType,
): FeedbackMap {
  const all = loadFeedback();
  const record: FeedbackRecord = { year, dimension, feedback, updatedAt: Date.now() };
  all[feedbackKey(year, dimension)] = record;
  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.feedback, JSON.stringify(all));
    } catch {
      /* 忽略 */
    }
  }
  return all;
}

export function clearFeedback(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.feedback);
    window.localStorage.removeItem(STORAGE_KEYS.notes);
  } catch {
    /* 忽略 */
  }
}

/* --------------------------- 核对档案（用户自己的话） --------------------------- */

export function loadNotes(): YearNoteMap {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.notes);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as YearNoteMap;
  } catch {
    return {};
  }
}

/** 返回写入后的完整档案 */
export function saveNote(
  year: number,
  dimension: DimensionKey,
  text: string,
  skipped = false,
): YearNoteMap {
  const all = loadNotes();
  const note: YearNote = { year, dimension, text, skipped, updatedAt: Date.now() };
  all[feedbackKey(year, dimension)] = note;
  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(all));
    } catch {
      /* 忽略 */
    }
  }
  return all;
}

/* --------------------------- 追问草稿 --------------------------- */

export function loadDraft(): string {
  if (!isBrowser()) return '';
  try {
    return window.localStorage.getItem(STORAGE_KEYS.draft) ?? '';
  } catch {
    return '';
  }
}

export function saveDraft(text: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.draft, text);
  } catch {
    /* 忽略 */
  }
}
