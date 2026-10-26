const pad2 = (n: number): string => String(n).padStart(2, '0');

const WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;
/**
 * 英文月/星期缩写：写死两张定长表，不引依赖。
 * 用 `toLocaleDateString('en')` 的话结果随运行环境的 ICU 数据与 locale 变
 * （同一份文档在不同机器上导出可能是 `Aug` / `août`），而卡片上这几个字母是**设计的一部分**，不是本地化内容。
 */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const WEEK_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * 定格真值的规范形（本地时区）：`YYYY-MM-DDTHH:mm`。
 *
 * 存到分钟而不是只到日——日期格式清单里有「…HH时mm分」这档，只存日就永远填不出时分；
 * 只显示日期的格式忽略后半截即可，多存不亏。
 * 不用 `toISOString()`：那会转 UTC，跨时区打开差几小时，而「文档创建时间」要的是作者当时当地的钟点。
 *
 * 提到 materials/ 层而不是留在某个物料目录里：日期卡与天气物料的时间锚都要把「文档创建时间」
 * 定格成同一种串，两处各写一份迟早飘（单一真源）。
 */
export const isoDateTime = (d: Date): string =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** 只到日的规范形（天气时间锚用：天气按天定格，不需要时分）。 */
export const isoDate = (d: Date): string => isoDateTime(d).slice(0, 10);

/**
 * `isoDateTime` 的反向：定格串 → 各字段 `YYYY MM DD HH mm M D H dddd ddd MMM EEE`。
 * 日期部分必填，时间部分可缺（老数据只有日期）。解析不出给 null，调用方各自降级。
 *
 * 与 `isoDateTime` 同住 kernel 是有意的：正反两向必须是同一套规范形，
 * 分家的第一天不会出事，改格式的那天就会。
 */
export function parseIso(iso: string): Record<string, string> | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(iso);
    if (!m) return null;
    const [, y, mo, d, h = '00', mi = '00'] = m;
    // 星期从日期算出来，不额外存——所以它是「格式」而不是另一个数据位，更不该是独立物料。
    const date = new Date(Number(y), Number(mo) - 1, Number(d));
    // 正则只管形状，不管范围：`2026-13-99` 能过。而 Date 会把越界值**静默滚到别的月份**，
    // 于是坏数据被渲染成一个看着完全像真的日期——这正是最不可见的坏法，与本文件
    // 「坏数据可见优于静默吞」的口径相反。回填比对（月/日能原样读回来）把这种串挡在门外，
    // 交给调用方走各自的降级（日期卡回落当天）。闰年 2 月 29 也由它自动放行。
    if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null;
    const day = date.getDay();
    const week = WEEK_NAMES[day];
    return {
        YYYY: y, MM: mo, DD: d, HH: h, mm: mi,
        M: String(Number(mo)), D: String(Number(d)), H: String(Number(h)),
        dddd: `星期${week}`, ddd: `周${week}`,
        MMM: MONTH_ABBR[Number(mo) - 1], EEE: WEEK_ABBR[day]
    };
}
