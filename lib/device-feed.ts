/**
 * 设备数据源（模拟服务端下发）
 * ---------------------------------------------------------------
 * 设备端（ESP32-S3 + 480×480）不该自己排盘——算力与固件复杂度都不划算。
 * 真实架构是：**设备每天向服务器要一次内容，拿到 JSON 后渲染**。
 * 所以这个模块的作用是：
 *
 *   1. 让桌面模拟器显示**真实数据**（而不是画稿），给硬件同事看时更有说服力
 *   2. **顺便把接口定下来**——这就是固件要实现的契约
 *
 * 与 docs/ESP32固件开发规格.md 里写的 JSON 契约保持一致；
 * 改这里就等于改接口，固件同事应当同步。
 *
 * 离线降级：黄历（screen 1）是纯本地计算，**断网也能显示**——
 * 这是"服务期结束后设备不会变砖"的基础，见规格文档的降级策略。
 */

import { Solar } from 'lunar-typescript';
import { buildAlmanac } from './almanac';
import { buildDailyReading, type DailyReading } from './daily';
import type { BirthInfo } from './types';

/** 设备一屏能放的字数上限（480×480、正文 28px） */
export const SCREEN_CHAR_LIMIT = 80;

/** 设备首页要的画布内容 */
export interface DeviceScreenAlmanac {
  /** 屏幕标识，固件按它选模板 */
  screen: 'almanac';
  /** 是否需要联网（黄历 false → 断网可用） */
  needsNetwork: boolean;
  date: string;
  weekday: string;
  lunar: string;
  ganzhi: string;
  yi: string[];
  ji: string[];
  chong: string;
  sha: string;
  /** 大字显示的农历日（设备上最大的那个字） */
  bigLunarDay: string;
}

export interface DeviceScreenToday {
  screen: 'today';
  needsNetwork: boolean;
  /** 能量等级，设备上大字显示 */
  energyLabel: string;
  energyValue: number;
  /** 一句结论，设备上控制在一行内 */
  headline: string;
  /** 当日关注（一个词，如「父母」） */
  focusPalace: string;
  focusTheme: string;
  /** 身体提醒，设备上最多两行 */
  healthNote: string;
}

export interface DeviceScreenWeek {
  screen: 'week';
  needsNetwork: boolean;
  days: { label: string; value: number; level: 'high' | 'mid' | 'low' }[];
  average: number;
}

export interface DeviceScreenQr {
  screen: 'qr';
  needsNetwork: boolean;
  /** 扫码后打开的地址（由服务端下发，设备只负责渲染） */
  url: string;
  title: string;
  subtitle: string;
}

export type DeviceScreen =
  | DeviceScreenAlmanac
  | DeviceScreenToday
  | DeviceScreenWeek
  | DeviceScreenQr;

/** 能量值 → 设备上的三档（设备只有三档颜色，不用连续值） */
function levelOf(v: number): 'high' | 'mid' | 'low' {
  if (v >= 58) return 'high';
  if (v >= 42) return 'mid';
  return 'low';
}

/** 把长句截到设备能放下的长度（超出部分用省略号，不硬塞） */
export function fitToScreen(text: string, limit = 26): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1) + '…';
}

/**
 * 生成设备首屏（黄历）——**不需要出生信息，也不需要联网**
 *
 * 这是设备的"保底可玩"内容：即使服务过期、断网，它也是一台好用的黄历。
 *
 * ⚠️ 数据来源：`lib/almanac.ts` 的宜忌是**从池子里按日期取的模拟内容**，
 *    而今日页用的是 lunar-typescript 的真实黄历。同一台设备上两处黄历不一致会很怪，
 *    所以这里**用 lunar-typescript 的真实数据**（和今日页同源），
 *    almanac.ts 只提供农历月日与节气这类它算得对的部分。
 */
export function buildAlmanacScreen(date?: string): DeviceScreenAlmanac {
  const d = date ? new Date(date) : new Date();
  const almanac = buildAlmanac(d);

  // 真实黄历：与今日页同源
  const solar = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const lunar = solar.getLunar();

  return {
    screen: 'almanac',
    needsNetwork: false,
    date: almanac.solarDate,
    weekday: almanac.weekday,
    lunar: `${almanac.lunarMonth}${almanac.lunarDay}`,
    ganzhi: `${lunar.getYearInGanZhi()}年 ${lunar.getDayInGanZhi()}日`,
    // 设备屏小，宜忌各只显示 3 条（规格文档里定的）
    yi: lunar.getDayYi().slice(0, 3),
    ji: lunar.getDayJi().slice(0, 3),
    chong: lunar.getDayChongDesc(),
    // 黄历的"煞"是方位（东/南/西/北），由 lunar-typescript 的 getDaySha() 给
    sha: lunar.getDaySha(),
    bigLunarDay: almanac.lunarDay,
  };
}

/** 生成「今日」屏 —— 需要出生信息（个性化），也需要联网 */
export function buildTodayScreen(birth: BirthInfo, date?: string): DeviceScreenToday {
  const r: DailyReading = buildDailyReading(birth, date);
  return {
    screen: 'today',
    needsNetwork: true,
    energyLabel: r.energy.label,
    energyValue: r.energy.value,
    // 设备上一行只能放约 13 个字，所以结论要重写得短
    headline: fitToScreen(r.headline, 18),
    focusPalace: r.focus.palace,
    focusTheme: fitToScreen(r.focus.palaceTheme, 8),
    healthNote: fitToScreen(r.healthNote, 24),
  };
}

/** 生成「未来 7 天」屏 */
export function buildWeekScreen(birth: BirthInfo, date?: string): DeviceScreenWeek {
  const r = buildDailyReading(birth, date);
  const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
  return {
    screen: 'week',
    needsNetwork: true,
    days: r.week.map((w, i) => ({
      label: i === 0 ? '今天' : `周${weekNames[w.weekday]}`,
      value: w.value,
      level: levelOf(w.value),
    })),
    average: r.weekAverage,
  };
}

/** 生成扫码屏 —— 地址由服务端下发 */
export function buildQrScreen(baseUrl: string): DeviceScreenQr {
  return {
    screen: 'qr',
    needsNetwork: true,
    url: `${baseUrl.replace(/\/$/, '')}/dashboard/`,
    title: '想看完整曲线？',
    subtitle: '用手机扫码 · 看曲线 / 年度卡片 / 我的档案',
  };
}

/**
 * 设备每天要拉的整包内容。
 * 真实部署时这就是 `GET /api/device/daily?deviceId=xxx` 的返回体。
 */
export interface DeviceDailyFeed {
  /** 固件版本要求（设备端可比对） */
  apiVersion: 1;
  date: string;
  screens: DeviceScreen[];
  /** 离线降级：断网时设备该显示哪一屏 */
  offlineFallback: 'almanac';
}

export function buildDeviceFeed(birth: BirthInfo | null, baseUrl: string, date?: string): DeviceDailyFeed {
  const screens: DeviceScreen[] = [buildAlmanacScreen(date)];
  if (birth) {
    screens.push(buildTodayScreen(birth, date));
    screens.push(buildWeekScreen(birth, date));
  }
  screens.push(buildQrScreen(baseUrl));

  return {
    apiVersion: 1,
    date: (date ?? new Date().toISOString()).slice(0, 10),
    screens,
    offlineFallback: 'almanac',
  };
}
