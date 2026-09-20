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
  /** 所属省份/地区（用于分组展示） */
  province?: string;
  /**
   * 省级中心点（不是具体城市）。
   * 用于「用户填的城市不在表里，但省份认得出来」的情况——
   * 给一个省级的粗略校正，远好于完全不做校正（乌鲁木齐与北京差 34 度）。
   */
  provinceLevel?: boolean;
  /** 找不到时的标记 */
  approximate?: boolean;
}

/**
 * 省级中心点（度）。
 * ⚠️ 这些是**省的中心**，不是任何具体城市——用户报的城市不在表里时用它兜底，
 *    并在界面上明确标注"按省份中心估算"。
 *    宁可用一个诚实的粗略值，也不要假装精确。
 */
export const PROVINCE_CENTER: Record<string, number> = {
  北京: 116.41, 天津: 117.19, 上海: 121.47, 重庆: 106.55,
  河北: 114.5, 山西: 112.55, 辽宁: 123.43, 吉林: 125.32, 黑龙江: 126.53,
  江苏: 118.8, 浙江: 120.15, 安徽: 117.28, 福建: 119.3, 江西: 115.89,
  山东: 117.12, 河南: 113.63, 湖北: 114.31, 湖南: 112.94, 广东: 113.26,
  广西: 108.37, 海南: 110.2, 四川: 104.07, 贵州: 106.63, 云南: 102.83,
  西藏: 91.11, 陕西: 108.94, 甘肃: 103.83, 青海: 101.78, 宁夏: 106.23,
  新疆: 87.62, 内蒙古: 111.75,
  香港: 114.17, 澳门: 113.55, 台湾: 121.56,
};

/** 省份的常见写法 → 标准简称 */
const PROVINCE_ALIAS: Record<string, string> = {
  北京市: '北京', 天津市: '天津', 上海市: '上海', 重庆市: '重庆',
  河北省: '河北', 山西省: '山西', 辽宁省: '辽宁', 吉林省: '吉林',
  黑龙江省: '黑龙江', 江苏省: '江苏', 浙江省: '浙江', 安徽省: '安徽',
  福建省: '福建', 江西省: '江西', 山东省: '山东', 河南省: '河南',
  湖北省: '湖北', 湖南省: '湖南', 广东省: '广东', 广西壮族自治区: '广西',
  广西省: '广西', 海南省: '海南', 四川省: '四川', 贵州省: '贵州',
  云南省: '云南', 西藏自治区: '西藏', 陕西省: '陕西', 甘肃省: '甘肃',
  青海省: '青海', 宁夏回族自治区: '宁夏', 新疆维吾尔自治区: '新疆',
  内蒙古自治区: '内蒙古', 香港特别行政区: '香港', 澳门特别行政区: '澳门',
};

/** 从文本里找出省份 */
function provinceOf(text: string): string | null {
  const names = Object.keys(PROVINCE_ALIAS).sort((a, b) => b.length - a.length);
  for (const n of names) {
    if (text.includes(n)) return PROVINCE_ALIAS[n];
  }
  for (const p of Object.keys(PROVINCE_CENTER).sort((a, b) => b.length - a.length)) {
    if (text.includes(p)) return p;
  }
  return null;
}

/**
 * 城市经度表
 * ---------------------------------------------------------------
 * ⚠️ 这是**人工整理的常用城市表**，不是完整地理库。
 *    经度数据必须准确——真太阳时全靠它，坐标错了时辰就错了，
 *    而时辰错 → 命宫错 → 整张盘错。
 *    所以：宁可不认识（并明确告诉用户），也不要猜一个坐标。
 *
 * 生产环境应换成完整地理库或让用户从地图选点，见文件末尾说明。
 */
export const CITY_TABLE: Record<string, PlaceInfo> = {
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

/**
 * 常见别称与拼音 → 标准中文名（键统一按小写比较）
 *
 * ⚠️ 这里踩过一个严重的坑，必须记下来：
 *   曾经有一条别名 `宁: '南京'`。匹配用的是"包含"，
 *   于是 **"西宁" 里含 "宁" → 被解析成南京 → 又因"宁波"在表里靠前 → 最后返回宁波的经度**。
 *   结果："西宁" 和 "南宁" 都拿到了宁波的 118.8°，
 *   而西宁实际是 101.78° —— **差 17 度 = 68 分钟**，
 *   足以跨一个时辰，**命宫会算错，整张盘都错**。
 *
 *   教训有两条：
 *   1. **不要收单字简称**（"宁""汉""津"这类会误伤别的城市名）
 *   2. 匹配必须**精确优先、最长优先**，不能"谁先命中算谁"
 */
const ALIASES: Record<string, string> = {
  // 拼音（国内城市）—— 只收完整拼音，不用简称
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
 * 全部地级行政区 → 省份
 * ---------------------------------------------------------------
 * 这一批只有**名称与归属**（这些是确定的），**没有经度**。
 * 解析时取所在省的中心经度，并把结果标记为 provinceLevel——
 * 界面会明确显示"按 XX 省中心估算"。
 *
 * 为什么不填经度：经度错了真太阳时就错，进而时辰错、命宫错。
 * 同省内城市一般相差不到 4 分钟，用省中心是**诚实的近似**；
 * 凭印象填一个具体坐标则是**看起来精确的错误**——后者更危险。
 *
 * 覆盖：大陆全部地级市 / 自治州 / 盟（约 330 个）。
 */
export const PREFECTURE_BY_PROVINCE: Record<string, string[]> = {
  河北: ['廊坊', '秦皇岛', '张家口', '承德', '沧州', '邢台', '邯郸', '衡水', '辛集', '定州'],
  山西: ['大同', '阳泉', '长治', '晋城', '朔州', '晋中', '运城', '忻州', '临汾', '吕梁'],
  内蒙古: ['乌海', '赤峰', '通辽', '鄂尔多斯', '呼伦贝尔', '巴彦淖尔', '乌兰察布', '兴安盟', '锡林郭勒盟', '阿拉善盟'],
  辽宁: ['鞍山', '抚顺', '本溪', '丹东', '锦州', '营口', '阜新', '辽阳', '盘锦', '铁岭', '朝阳', '葫芦岛'],
  吉林: ['吉林', '四平', '辽源', '通化', '白山', '松原', '白城', '延边', '梅河口'],
  黑龙江: ['齐齐哈尔', '鸡西', '鹤岗', '双鸭山', '大庆', '伊春', '佳木斯', '七台河', '牡丹江', '黑河', '绥化', '大兴安岭'],
  江苏: ['连云港', '淮安', '盐城', '扬州', '镇江', '泰州', '宿迁'],
  浙江: ['嘉兴', '绍兴', '金华', '衢州', '舟山', '台州', '丽水'],
  安徽: ['芜湖', '蚌埠', '淮南', '马鞍山', '淮北', '铜陵', '安庆', '黄山', '滁州', '阜阳', '宿州', '六安', '亳州', '池州', '宣城'],
  福建: ['莆田', '三明', '漳州', '南平', '龙岩', '宁德'],
  江西: ['景德镇', '萍乡', '九江', '新余', '鹰潭', '赣州', '吉安', '宜春', '抚州', '上饶'],
  山东: ['淄博', '枣庄', '东营', '潍坊', '济宁', '泰安', '威海', '日照', '临沂', '德州', '聊城', '滨州', '菏泽'],
  河南: ['平顶山', '安阳', '鹤壁', '新乡', '焦作', '濮阳', '许昌', '漯河', '三门峡', '南阳', '商丘', '信阳', '周口', '驻马店', '济源'],
  湖北: ['黄石', '十堰', '宜昌', '襄阳', '鄂州', '荆门', '孝感', '荆州', '黄冈', '咸宁', '随州', '恩施', '仙桃', '潜江', '天门'],
  湖南: ['株洲', '湘潭', '衡阳', '邵阳', '岳阳', '常德', '张家界', '益阳', '郴州', '永州', '怀化', '娄底', '湘西'],
  广东: ['韶关', '江门', '湛江', '茂名', '肇庆', '惠州', '梅州', '汕尾', '河源', '阳江', '清远', '中山', '潮州', '揭阳', '云浮'],
  广西: ['柳州', '梧州', '北海', '防城港', '钦州', '贵港', '玉林', '百色', '贺州', '河池', '来宾', '崇左'],
  海南: ['儋州', '五指山', '琼海', '文昌', '万宁', '东方', '三沙'],
  四川: ['自贡', '攀枝花', '泸州', '德阳', '绵阳', '广元', '遂宁', '内江', '乐山', '南充', '眉山', '宜宾', '广安', '达州', '雅安', '巴中', '资阳', '阿坝', '甘孜', '凉山'],
  贵州: ['六盘水', '遵义', '安顺', '毕节', '铜仁', '黔西南', '黔东南', '黔南'],
  云南: ['曲靖', '玉溪', '保山', '昭通', '普洱', '临沧', '楚雄', '红河', '文山', '西双版纳', '德宏', '怒江', '迪庆'],
  西藏: ['日喀则', '昌都', '林芝', '山南', '那曲', '阿里'],
  陕西: ['铜川', '宝鸡', '咸阳', '渭南', '延安', '汉中', '榆林', '安康', '商洛'],
  甘肃: ['嘉峪关', '金昌', '白银', '天水', '武威', '张掖', '平凉', '酒泉', '庆阳', '定西', '陇南', '临夏', '甘南'],
  青海: ['海东', '海北', '黄南', '果洛', '玉树', '海西'],
  宁夏: ['石嘴山', '吴忠', '固原', '中卫'],
  新疆: ['克拉玛依', '吐鲁番', '哈密', '昌吉', '博尔塔拉', '巴音郭楞', '阿克苏', '克孜勒苏', '喀什', '和田', '伊犁', '塔城', '阿勒泰', '石河子', '阿拉尔', '图木舒克', '五家渠', '北屯', '铁门关', '双河', '可克达拉', '昆玉', '胡杨河', '新星'],
};

/** 反向索引：地级市 → 省份 */
const PREFECTURE_INDEX: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [prov, cities] of Object.entries(PREFECTURE_BY_PROVINCE)) {
    for (const c of cities) out[c] = prov;
  }
  return out;
})();

/**
 * 把搜索关键字解析成标准城市名（给界面的搜索框用）。
 *
 * 为什么单独导出：搜索框需要"输入 hangzhou 也能找到杭州"，
 * 但匹配逻辑必须和真正解析出生地时**用同一份别名表**——
 * 否则会出现"搜得到但填进去解析不了"这种更糟的情况。
 */
export function cityFromKeyword(keyword: string): string | null {
  const k = keyword.trim().toLowerCase();
  if (!k) return null;
  const raw = keyword.trim();
  if (CITY_TABLE[raw]) return raw;
  if (PREFECTURE_INDEX[raw]) return raw;
  const alias = Object.keys(ALIASES).find((a) => a.toLowerCase() === k);
  if (alias) return ALIASES[alias];
  return null;
}

/**
 * 从出生地文本里解析出经度与时区。
 *
 * 匹配顺序（**顺序本身就是正确性的一部分**）：
 *   1. 整串精确等于某个城市名           —— 「杭州」
 *   2. 整串精确等于某个别名/拼音        —— 「Hangzhou」
 *   3. 城市名出现在文本里，**取最长的那个** —— 「浙江杭州」→ 杭州
 *      （取最长是为了让「内蒙古呼和浩特」命中呼和浩特而不是别的）
 *   4. 别名/拼音出现在文本里            —— 「zhejiang hangzhou」
 *   5. 只认得出省份 → 用省级中心点粗校正
 *   6. 都认不出 → 退化成东经 120° 并标记 approximate，**上层必须提示用户**
 *
 * 全程不做「城市名包含输入」的反向匹配 —— 那正是"西宁→宁波"事故的来源。
 */
export function resolvePlace(birthPlace: string): PlaceInfo & { matched: string | null } {
  const raw = (birthPlace || '').trim();
  if (!raw) {
    return { longitude: 120, timezone: 'Asia/Shanghai', approximate: true, matched: null };
  }
  const lower = raw.toLowerCase();

  // 1) 精确等于城市名（有精确经度）
  if (CITY_TABLE[raw]) return { ...CITY_TABLE[raw], matched: raw };

  // 1b) 精确等于某个地级市（只有名称与归属 → 用省中心估算）
  const asPrefecture = PREFECTURE_INDEX[raw];
  if (asPrefecture && PROVINCE_CENTER[asPrefecture] !== undefined) {
    return {
      longitude: PROVINCE_CENTER[asPrefecture],
      timezone: CITY_TABLE[asPrefecture]?.timezone ?? 'Asia/Shanghai',
      province: asPrefecture,
      provinceLevel: true,
      approximate: true,
      matched: raw,
    };
  }

  // 2) 精确等于别名 / 拼音
  const exactAlias = Object.keys(ALIASES).find((k) => k.toLowerCase() === lower);
  if (exactAlias) {
    const target = ALIASES[exactAlias];
    if (CITY_TABLE[target]) return { ...CITY_TABLE[target], matched: target };
  }

  // 3) 城市名出现在文本里 → 取**最长**的匹配（避免短名吃掉长名）
  const contained = Object.keys(CITY_TABLE)
    .filter((city) => raw.includes(city))
    .sort((a, b) => b.length - a.length);
  if (contained.length > 0) {
    const hit = contained[0];
    return { ...CITY_TABLE[hit], matched: hit };
  }

  // 3b) 地级市出现在文本里（如「江西赣州」）→ 同样取最长
  const prefectureHits = Object.keys(PREFECTURE_INDEX)
    .filter((city) => raw.includes(city))
    .sort((a, b) => b.length - a.length);
  if (prefectureHits.length > 0) {
    const hit = prefectureHits[0];
    const prov = PREFECTURE_INDEX[hit];
    if (PROVINCE_CENTER[prov] !== undefined) {
      return {
        longitude: PROVINCE_CENTER[prov],
        timezone: CITY_TABLE[prov]?.timezone ?? 'Asia/Shanghai',
        province: prov,
        provinceLevel: true,
        approximate: true,
        matched: hit,
      };
    }
  }

  // 4) 别名 / 拼音出现在文本里 → 同样取最长的
  const aliasHits = Object.keys(ALIASES)
    .filter((k) => lower.includes(k.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  for (const k of aliasHits) {
    const target = ALIASES[k];
    if (CITY_TABLE[target]) return { ...CITY_TABLE[target], matched: target };
  }

  // 5) 只认得出省份 → 用省级中心点粗校正
  //    这比退化成东经 120° 好得多（乌鲁木齐与北京差 34 度），但必须标注清楚
  const prov = provinceOf(raw);
  if (prov && PROVINCE_CENTER[prov] !== undefined) {
    const lon = PROVINCE_CENTER[prov];
    const tz = CITY_TABLE[prov]?.timezone ?? 'Asia/Shanghai';
    return {
      longitude: lon,
      timezone: tz,
      province: prov,
      provinceLevel: true,
      approximate: true,
      matched: null,
    };
  }

  // 6) 兜底：东八区、东经 120°（即不做经度修正）
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
