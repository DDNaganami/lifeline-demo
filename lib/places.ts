/**
 * 出生地选择器的展示分组
 * ---------------------------------------------------------------
 * 数据都在 lib/solar-time.ts（城市名、经度、省份、地级市归属），
 * 这个文件只负责**界面上的分组与排序**——改展示不会碰到经度数据。
 *
 * 用途：
 *   1. 出生地选择器按省份分组（符合中文地址从大到小的习惯）
 *   2. 标记哪些城市经度精确、哪些是省中心估算
 */

import { CITY_TABLE, PREFECTURE_BY_PROVINCE } from './solar-time';

export interface CityGroup {
  /** 省份 / 地区名 */
  province: string;
  /** 该省的城市：前面是经度精确的，后面是省中心估算的 */
  cities: string[];
  /** 该组里经度精确的城市数（界面用来提示） */
  preciseCount: number;
}

/**
 * 城市 → 省份。
 * 只为**经度精确的那 89 个城市**标注（产地级市由 solar-time 的索引负责）。
 */
const CITY_TO_PROVINCE: Record<string, string> = {
  北京: '北京', 天津: '天津',
  石家庄: '河北', 唐山: '河北', 保定: '河北',
  太原: '山西',
  呼和浩特: '内蒙古', 包头: '内蒙古',
  沈阳: '辽宁', 大连: '辽宁',
  长春: '吉林',
  哈尔滨: '黑龙江',
  上海: '上海',
  南京: '江苏', 苏州: '江苏', 无锡: '江苏', 常州: '江苏', 徐州: '江苏', 南通: '江苏',
  杭州: '浙江', 宁波: '浙江', 温州: '浙江',
  合肥: '安徽',
  福州: '福建', 厦门: '福建', 泉州: '福建',
  南昌: '江西',
  济南: '山东', 青岛: '山东', 烟台: '山东',
  郑州: '河南', 洛阳: '河南',
  武汉: '湖北',
  长沙: '湖南',
  广州: '广东', 深圳: '广东', 佛山: '广东', 东莞: '广东', 珠海: '广东', 汕头: '广东',
  南宁: '广西', 桂林: '广西',
  海口: '海南', 三亚: '海南',
  重庆: '重庆',
  成都: '四川',
  贵阳: '贵州',
  昆明: '云南', 大理: '云南', 丽江: '云南',
  拉萨: '西藏',
  西安: '陕西',
  兰州: '甘肃',
  西宁: '青海',
  银川: '宁夏',
  乌鲁木齐: '新疆',
  香港: '香港', 澳门: '澳门', 台北: '台湾',
  东京: '日本', 大阪: '日本',
  首尔: '韩国',
  新加坡: '新加坡',
  曼谷: '泰国',
  吉隆坡: '马来西亚',
  雅加达: '印度尼西亚',
  马尼拉: '菲律宾',
  河内: '越南', 胡志明市: '越南',
  迪拜: '阿联酋',
  悉尼: '澳大利亚', 墨尔本: '澳大利亚',
  奥克兰: '新西兰',
  伦敦: '英国', 巴黎: '法国', 柏林: '德国', 阿姆斯特丹: '荷兰',
  罗马: '意大利', 马德里: '西班牙', 莫斯科: '俄罗斯',
  纽约: '美国', 洛杉矶: '美国', 旧金山: '美国', 西雅图: '美国',
  芝加哥: '美国', 波士顿: '美国', 休斯顿: '美国',
  多伦多: '加拿大', 温哥华: '加拿大',
};

/**
 * 展示顺序：**国内在前、按大区聚拢**，然后港澳台，再海外。
 * 用户找家乡靠的是地理位置记忆，不是拼音顺序。
 */
const GROUP_ORDER = [
  '北京', '天津', '河北', '山西', '内蒙古',
  '辽宁', '吉林', '黑龙江',
  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南',
  '广东', '广西', '海南',
  '重庆', '四川', '贵州', '云南', '西藏',
  '陕西', '甘肃', '青海', '宁夏', '新疆',
  '香港', '澳门', '台湾',
  '日本', '韩国', '新加坡', '泰国', '马来西亚', '印度尼西亚', '菲律宾', '越南', '阿联酋',
  '澳大利亚', '新西兰',
  '英国', '法国', '德国', '荷兰', '意大利', '西班牙', '俄罗斯',
  '美国', '加拿大',
];

export function groupCities(): CityGroup[] {
  const map = new Map<string, { cities: string[]; preciseCount: number }>();
  const push = (prov: string, city: string, precise: boolean) => {
    if (!map.has(prov)) map.set(prov, { cities: [], preciseCount: 0 });
    const g = map.get(prov)!;
    if (g.cities.includes(city)) return;
    g.cities.push(city);
    if (precise) g.preciseCount++;
  };

  // 先放经度精确的城市（它们在每组里排前面）
  for (const [city, prov] of Object.entries(CITY_TO_PROVINCE)) push(prov, city, true);
  // 再补该省的地级市（省中心估算）
  for (const [prov, cities] of Object.entries(PREFECTURE_BY_PROVINCE)) {
    for (const c of cities) push(prov, c, false);
  }

  const groups: CityGroup[] = [];
  for (const prov of GROUP_ORDER) {
    const g = map.get(prov);
    if (g) {
      groups.push({ province: prov, ...g });
      map.delete(prov);
    }
  }
  for (const [prov, g] of map) groups.push({ province: prov, ...g });
  return groups;
}

/** 这个城市的经度是否精确（否则是按省中心估算的） */
export function hasPreciseLongitude(city: string): boolean {
  return Boolean(CITY_TABLE[city]);
}

export function provinceOfCity(city: string): string | undefined {
  return CITY_TO_PROVINCE[city];
}
