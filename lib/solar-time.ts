/**
 * 真太阳时校正
 * ---------------------------------------------------------------
 * 为什么必须做：紫微斗数用**时辰**起命宫，而"北京时间 12:00"不等于
 * "出生地太阳在正上方"。两者差两类量：
 *
 *   1. 经度差 —— 北京时间以东经 120° 为标准；出生地经度每偏离 1 度差 4 分钟
 *      （乌鲁木齐约 87.6°E，与标准经线差 32.4°，即约 130 分钟）
 *   2. 均时差 —— 地球轨道是椭圆且黄赤交角不为零，真太阳日与平太阳日有差，
 *      一年内在 −14 到 +16 分钟之间摆动
 *
 *   **真太阳时 = 标准时 + 经度差修正 + 均时差**
 *
 * 三种时间要分清（很容易混）：
 *   - 平太阳时（钟表时间）：出生地当地的标准时间
 *   - 真太阳时：太阳实际过中天的时间  ← 排盘用这个
 *   - 北京时间：中国的法定时区时间（= 东八区平太阳时）
 *
 * 夏令时：**不用自己维护日期表**。用系统自带的 IANA 时区数据库
 * （通过 `Intl.DateTimeFormat` 的 `timeZoneName: 'shortOffset'` 取偏移量），
 * 它包含各国历史规则——中国 1986–1991 的夏令时、美国的历年规则都在里面，
 * 海外用户也能正确处理。
 */

import type { BirthInfo } from './types';

/* ------------------------- 地点 → 经度与时区 ------------------------- */

export interface PlaceInfo {
  /** 经度（东经为正） */
  longitude: number;
  /** IANA 时区 ID，如 Asia/Shanghai */
  timezone: string;
  /** 找不到时的标记 */
  approximate?: boolean;
}

/**
 * 城市经度表（常用城市，够原型用）。
 * 生产环境应换成完整的地理库（或让用户从地图选点），见文件末尾说明。
 */
const CITY_TABLE: Record<string, PlaceInfo> = {
  // —— 中国主要城市（时区统一 Asia/Shanghai）——
  北京: { longitude: 116.41, timezone: 'Asia/Shanghai' },
  上海: { longitude: 121.47, timezone: 'Asia/Shanghai' },
  广州: { longitude: 113.26, timezone: 'Asia/Shanghai' },
  深圳: { longitude: 114.06, timezone: 'Asia/Shanghai' },
  成都: { longitude: 104.07, timezone: 'Asia/Shanghai' },
  杭州: { longitude: 120.15, timezone: 'Asia/Shanghai' },
  武汉: { longitude: 114.31, timezone: 'Asia/Shanghai' },
  西安: { longitude: 108.94, timezone: 'Asia/Shanghai' },
  南京: { longitude: 118.8, timezone: 'Asia/Shanghai' },
  重庆: { longitude: 106.55, timezone: 'Asia/Shanghai' },
  天津: { longitude: 117.19, timezone: 'Asia/Shanghai' },
  长沙: { longitude: 112.94, timezone: 'Asia/Shanghai' },
  沈阳: { longitude: 123.43, timezone: 'Asia/Shanghai' },
  哈尔滨: { longitude: 126.53, timezone: 'Asia/Shanghai' },
  青岛: { longitude: 120.38, timezone: 'Asia/Shanghai' },
  郑州: { longitude: 113.63, timezone: 'Asia/Shanghai' },
  昆明: { longitude: 102.83, timezone: 'Asia/Shanghai' },
  福州: { longitude: 119.3, timezone: 'Asia/Shanghai' },
  厦门: { longitude: 118.09, timezone: 'Asia/Shanghai' },
  合肥: { longitude: 117.28, timezone: 'Asia/Shanghai' },
  南昌: { longitude: 115.89, timezone: 'Asia/Shanghai' },
  贵阳: { longitude: 106.63, timezone: 'Asia/Shanghai' },
  南宁: { longitude: 108.37, timezone: 'Asia/Shanghai' },
  兰州: { longitude: 103.83, timezone: 'Asia/Shanghai' },
  太原: { longitude: 112.55, timezone: 'Asia/Shanghai' },
  石家庄: { longitude: 114.51, timezone: 'Asia/Shanghai' },
  济南: { longitude: 117.12, timezone: 'Asia/Shanghai' },
  长春: { longitude: 125.32, timezone: 'Asia/Shanghai' },
  大连: { longitude: 121.62, timezone: 'Asia/Shanghai' },
  苏州: { longitude: 120.62, timezone: 'Asia/Shanghai' },
  无锡: { longitude: 120.3, timezone: 'Asia/Shanghai' },
  宁波: { longitude: 121.55, timezone: 'Asia/Shanghai' },
  温州: { longitude: 120.7, timezone: 'Asia/Shanghai' },
  佛山: { longitude: 113.12, timezone: 'Asia/Shanghai' },
  东莞: { longitude: 113.75, timezone: 'Asia/Shanghai' },
  珠海: { longitude: 113.58, timezone: 'Asia/Shanghai' },
  汕头: { longitude: 116.68, timezone: 'Asia/Shanghai' },
  洛阳: { longitude: 112.45, timezone: 'Asia/Shanghai' },
  徐州: { longitude: 117.28, timezone: 'Asia/Shanghai' },
  常州: { longitude: 119.97, timezone: 'Asia/Shanghai' },
  南通: { longitude: 120.89, timezone: 'Asia/Shanghai' },
  泉州: { longitude: 118.68, timezone: 'Asia/Shanghai' },
  烟台: { longitude: 121.45, timezone: 'Asia/Shanghai' },
  唐山: { longitude: 118.18, timezone: 'Asia/Shanghai' },
  保定: { longitude: 115.46, timezone: 'Asia/Shanghai' },
  包头: { longitude: 109.84, timezone: 'Asia/Shanghai' },
  呼和浩特: { longitude: 111.75, timezone: 'Asia/Shanghai' },
  银川: { longitude: 106.23, timezone: 'Asia/Shanghai' },
  西宁: { longitude: 101.78, timezone: 'Asia/Shanghai' },
  乌鲁木齐: { longitude: 87.62, timezone: 'Asia/Shanghai' },
  拉萨: { longitude: 91.11, timezone: 'Asia/Shanghai' },
  海口: { longitude: 110.2, timezone: 'Asia/Shanghai' },
  三亚: { longitude: 109.51, timezone: 'Asia/Shanghai' },
  桂林: { longitude: 110.29, timezone: 'Asia/Shanghai' },
  大理: { longitude: 100.23, timezone: 'Asia/Shanghai' },
  丽江: { longitude: 100.23, timezone: 'Asia/Shanghai' },

  // —— 海外（时区各自不同，夏令时由系统数据库处理）——
  香港: { longitude: 114.17, timezone: 'Asia/Hong_Kong' },
  澳门: { longitude: 113.55, timezone: 'Asia/Macau' },
  台北: { longitude: 121.56, timezone: 'Asia/Taipei' },
  东京: { longitude: 139.69, timezone: 'Asia/Tokyo' },
  大阪: { longitude: 135.5, timezone: 'Asia/Tokyo' },
  首尔: { longitude: 126.98, timezone: 'Asia/Seoul' },
  新加坡: { longitude: 103.82, timezone: 'Asia/Singapore' },
  曼谷: { longitude: 100.5, timezone: 'Asia/Bangkok' },
  吉隆坡: { longitude: 101.69, timezone: 'Asia/Kuala_Lumpur' },
  雅加达: { longitude: 106.85, timezone: 'Asia/Jakarta' },
  马尼拉: { longitude: 120.98, timezone: 'Asia/Manila' },
  河内: { longitude: 105.83, timezone: 'Asia/Ho_Chi_Minh' },
  胡志明市: { longitude: 106.63, timezone: 'Asia/Ho_Chi_Minh' },
  迪拜: { longitude: 55.27, timezone: 'Asia/Dubai' },
  悉尼: { longitude: 151.21, timezone: 'Australia/Sydney' },
  墨尔本: { longitude: 144.96, timezone: 'Australia/Melbourne' },
  奥克兰: { longitude: 174.76, timezone: 'Pacific/Auckland' },
  伦敦: { longitude: -0.13, timezone: 'Europe/London' },
  巴黎: { longitude: 2.35, timezone: 'Europe/Paris' },
  柏林: { longitude: 13.4, timezone: 'Europe/Berlin' },
  阿姆斯特丹: { longitude: 4.9, timezone: 'Europe/Amsterdam' },
  罗马: { longitude: 12.5, timezone: 'Europe/Rome' },
  马德里: { longitude: -3.7, timezone: 'Europe/Madrid' },
  莫斯科: { longitude: 37.62, timezone: 'Europe/Moscow' },
  纽约: { longitude: -74.01, timezone: 'America/New_York' },
  洛杉矶: { longitude: -118.24, timezone: 'America/Los_Angeles' },
  旧金山: { longitude: -122.42, timezone: 'America/Los_Angeles' },
  西雅图: { longitude: -122.33, timezone: 'America/Los_Angeles' },
  芝加哥: { longitude: -87.63, timezone: 'America/Chicago' },
  波士顿: { longitude: -71.06, timezone: 'America/New_York' },
  休斯顿: { longitude: -95.37, timezone: 'America/Chicago' },
  多伦多: { longitude: -79.38, timezone: 'America/Toronto' },
  温哥华: { longitude: -123.12, timezone: 'America/Vancouver' },
};

/** 常见别称与拼音 → 标准中文名（键统一按小写比较） */
const ALIASES: Record<string, string> = {
  // 简称
  京: '北京', 沪: '上海', 穗: '广州', 深: '深圳', 蓉: '成都',
  渝: '重庆', 津: '天津', 汉: '武汉', 宁: '南京', 杭: '杭州',
  // 拼音（国内城市）
  beijing: '北京', shanghai: '上海', shenzhen: '深圳', guangzhou: '广州',
  hangzhou: '杭州', chengdu: '成都', wuhan: '武汉', xian: '西安',
  nanjing: '南京', chongqing: '重庆', tianjin: '天津', changsha: '长沙',
  shenyang: '沈阳', harbin: '哈尔滨', qingdao: '青岛', zhengzhou: '郑州',
  kunming: '昆明', fuzhou: '福州', xiamen: '厦门', hefei: '合肥',
  nanchang: '南昌', guiyang: '贵阳', nanning: '南宁', lanzhou: '兰州',
  taiyuan: '太原', shijiazhuang: '石家庄', jinan: '济南', changchun: '长春',
  dalian: '大连', suzhou: '苏州', wuxi: '无锡', ningbo: '宁波',
  wenzhou: '温州', foshan: '佛山', dongguan: '东莞', zhuhai: '珠海',
  shantou: '汕头', luoyang: '洛阳', xuzhou: '徐州', changzhou: '常州',
  nantong: '南通', quanzhou: '泉州', yantai: '烟台', tangshan: '唐山',
  baoding: '保定', baotou: '包头', huhehaote: '呼和浩特', yinchuan: '银川',
  xining: '西宁', wulumuqi: '乌鲁木齐', urumqi: '乌鲁木齐', lasa: '拉萨',
  lhasa: '拉萨', haikou: '海口', sanya: '三亚', guilin: '桂林',
  dali: '大理', lijiang: '丽江',
  // 海外
  tokyo: '东京', osaka: '大阪', seoul: '首尔', singapore: '新加坡',
  bangkok: '曼谷', 'kuala lumpur': '吉隆坡', jakarta: '雅加达',
  manila: '马尼拉', hanoi: '河内', saigon: '胡志明市', dubai: '迪拜',
  sydney: '悉尼', melbourne: '墨尔本', auckland: '奥克兰',
  london: '伦敦', paris: '巴黎', berlin: '柏林', amsterdam: '阿姆斯特丹',
  rome: '罗马', madrid: '马德里', moscow: '莫斯科',
  'new york': '纽约', 'los angeles': '洛杉矶', 'san francisco': '旧金山',
  seattle: '西雅图', chicago: '芝加哥', boston: '波士顿', houston: '休斯顿',
  toronto: '多伦多', vancouver: '温哥华',
  'hong kong': '香港', macau: '澳门', taipei: '台北',
};

/**
 * 从出生地文本里解析出经度与时区。
 * 支持"浙江杭州""杭州""Hangzhou"这类写法（做包含匹配）。
 * 找不到时返回默认值并标记 approximate，上层必须提示用户。
 */
export function resolvePlace(birthPlace: string): PlaceInfo & { matched: string | null } {
  const raw = (birthPlace || '').trim();
  const lower = raw.toLowerCase();

  // 先查别称（键统一按小写比较，兼容 Hangzhou / hangzhou 这类写法）
  const aliasKey = Object.keys(ALIASES).find((k) => {
    const lk = k.toLowerCase();
    return lk === lower || lower.includes(lk);
  });
  const normalized = aliasKey ? ALIASES[aliasKey] : raw;

  // 再查城市表：优先精确，其次包含（英文名统一按小写比较）
  const lowerNormalized = normalized.toLowerCase();
  if (CITY_TABLE[normalized]) {
    return { ...CITY_TABLE[normalized], matched: normalized };
  }
  const hit = Object.keys(CITY_TABLE).find(
    (city) =>
      normalized.includes(city) ||
      city.includes(normalized) ||
      lowerNormalized.includes(city.toLowerCase()) ||
      city.toLowerCase().includes(lowerNormalized),
  );
  if (hit) return { ...CITY_TABLE[hit], matched: hit };

  // 兜底：按东八区、东经 120°（即不做经度修正），标记为不精确
  return { longitude: 120, timezone: 'Asia/Shanghai', approximate: true, matched: null };
}

/* ------------------------- 时区偏移与夏令时 ------------------------- */

/**
 * 取某地在**某个历史时刻**的 UTC 偏移（分钟）。
 * 直接问系统自带的 IANA 数据库，因此自动包含夏令时与历史时区变更。
 * 例如中国 1986-1991 年夏天会返回 540（+9），其余时间返回 480（+8）。
 */
export function utcOffsetMinutes(date: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  // 形如 GMT+8 / GMT+5:30 / GMT-4 / GMT
  const m = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** 该时刻是否处于夏令时（偏移比该地冬季偏移多出的部分） */
export function isDST(date: Date, timezone: string): boolean {
  const jan = utcOffsetMinutes(new Date(Date.UTC(date.getUTCFullYear(), 0, 15, 12)), timezone);
  const jul = utcOffsetMinutes(new Date(Date.UTC(date.getUTCFullYear(), 6, 15, 12)), timezone);
  const standard = Math.min(jan, jul);
  return utcOffsetMinutes(date, timezone) > standard;
}

/* ------------------------- 均时差 ------------------------- */

/**
 * 均时差（分钟）：真太阳时 − 平太阳时。
 * 用通用近似式，一年内误差约 ±30 秒，对"是否跨时辰"的判断足够：
 *
 *   B = 360° / 365 × (N − 81)
 *   EoT = 9.87·sin(2B) − 7.53·cos(B) − 1.5·sin(B)
 */
export function equationOfTime(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const n = Math.floor((date.getTime() - start) / 86400000);
  const b = ((360 / 365) * (n - 81) * Math.PI) / 180;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/* ------------------------- 主入口 ------------------------- */

export interface TrueSolarTime {
  /** 当地时间（按标准时间读出来的，可能是夏令时） */
  localTime: string;
  /** 真太阳时，格式 HH:mm，可能跨天 */
  trueSolarTime: string;
  /** 这个真太阳时对应的时辰序号 0-12（0=早子时，与 iztro 的 timeIndex 一致） */
  timeIndex: number;
  /** 该真太阳时对应的时辰名，如 午时 */
  timeName: string;
  /** 总修正量（分钟），正数表示时钟时间比真太阳时慢 */
  totalOffsetMinutes: number;
  /** 其中：经度造成的修正（分钟） */
  longitudeOffsetMinutes: number;
  /** 其中：均时差（分钟） */
  equationOfTimeMinutes: number;
  /** 是否因夏令时调整过 */
  dstApplied: boolean;
  /** 采用的 UTC 偏移（分钟） */
  utcOffsetMinutes: number;
  /** 地点解析结果 */
  place: PlaceInfo & { matched: string | null };
  /** 是否跨过了时辰边界（这是最需要提醒用户的情况） */
  crossedBoundary: boolean;
  /** 是否跨天 */
  crossedDay: boolean;
}

const SHICHEN_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/**
 * 时辰序号（iztro 口径）：0 = 早子时（00:00-00:59），1 = 丑时 … 12 = 晚子时（23:00-23:59）
 * 也就是说：23:00 之后算当天的"晚子时"。
 */
export function timeIndexOf(hour: number, minute: number): number {
  void minute;
  if (hour === 23) return 12;
  if (hour === 0) return 0;
  return Math.floor((hour + 1) / 2);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 计算真太阳时
 * @param birth 出生信息（用 birthDate + birthTime 里的钟点，和 birthPlace）
 */
export function buildTrueSolarTime(birth: BirthInfo): TrueSolarTime {
  const place = resolvePlace(birth.birthPlace);
  const [y, m, d] = birth.birthDate.split('-').map((v) => Number(v));

  // birthTime 形如 "午时 11:00-13:00"；取区间起点再加重置到区间中点更合理
  const rangeMatch = birth.birthTime.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  let hour = 12;
  let minute = 0;
  if (rangeMatch) {
    const h1 = Number(rangeMatch[1]);
    const m1 = Number(rangeMatch[2]);
    const h2 = Number(rangeMatch[3]);
    const m2 = Number(rangeMatch[4]);
    // 取区间中点（例如 11:00-13:00 → 12:00），比取起点更接近实际出生时间
    const startMin = h1 * 60 + m1;
    const endMin = h2 * 60 + m2;
    const mid = Math.round((startMin + (endMin > startMin ? endMin : endMin + 1440)) / 2) % 1440;
    hour = Math.floor(mid / 60);
    minute = mid % 60;
  }

  // 把"当地时间"当作 UTC，再减去该地当时的偏移，得到真实 UTC
  const localAsUTC = Date.UTC(y, m - 1, d, hour, minute);
  const offset = utcOffsetMinutes(new Date(localAsUTC), place.timezone);
  const utc = new Date(localAsUTC - offset * 60000);

  const dst = isDST(new Date(localAsUTC), place.timezone);

  /**
   * 经度修正的关键：标准经线由**法定标准时区**决定，不是夏令时偏移。
   * 夏令时只是把钟拨快 1 小时，并不会改变"这个时区的标准经线"。
   * 例如上海夏令时期间 offset = +9（540 分），但标准时区仍是 +8 → 标准经线 120°。
   * 若直接用 540/4 = 135° 会多算 15°（= 60 分钟），结果全错。
   */
  const dstMinutes = dst ? 60 : 0;
  const standardOffset = offset - dstMinutes;
  const standardMeridian = standardOffset / 4;
  const longitudeOffset = (place.longitude - standardMeridian) * 4;
  const eot = equationOfTime(utc);
  const totalOffset = longitudeOffset + eot;

  // 真太阳时 = 当地钟表时间 + 修正（先取整到分钟，再处理进位）
  const trueMinutesRaw = hour * 60 + minute + totalOffset;
  const trueMinutesRounded = Math.round(trueMinutesRaw);
  const dayShift = Math.floor(trueMinutesRounded / 1440);
  const trueMinutes = ((trueMinutesRounded % 1440) + 1440) % 1440;
  const trueHour = Math.floor(trueMinutes / 60);
  const trueMinute = trueMinutes % 60;

  const timeIndex = timeIndexOf(trueHour, trueMinute);
  const originalTimeIndex = timeIndexOf(hour, minute);

  return {
    localTime: `${pad(hour)}:${pad(minute)}`,
    trueSolarTime: `${pad(trueHour)}:${pad(trueMinute)}`,
    timeIndex,
    timeName: `${SHICHEN_NAMES[timeIndex % 12]}时`,
    totalOffsetMinutes: Math.round(totalOffset * 10) / 10,
    longitudeOffsetMinutes: Math.round(longitudeOffset * 10) / 10,
    equationOfTimeMinutes: Math.round(eot * 10) / 10,
    dstApplied: dst,
    utcOffsetMinutes: offset,
    place,
    crossedBoundary: timeIndex !== originalTimeIndex,
    crossedDay: dayShift !== 0,
  };
}

/**
 * 生产环境要做的事（当前为原型的限制）：
 *   1. CITY_TABLE 只覆盖常用城市 → 应换成完整地理库，或让用户在地图上选点
 *   2. 海外时区没有考虑"当地时区在历史上变更过"的极端情况（Intl 已处理大部分）
 *   3. 出生时间如果用户只知道"上午"，建议让用户填更宽的区间，由系统取中点并标注不确定
 */
