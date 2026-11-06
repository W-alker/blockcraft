import { isoDateTime, parseIso } from '../kernel/iso-date.util';

/**
 * 卡片能用的日期字段（`parseIso` 的产物）：`YYYY MM DD HH mm M D H dddd ddd MMM EEE`。
 *
 * 卡片**按字段取**（大数字位要 `D`、副行要 `MMM`），而不是按格式串整串替换——
 * 因为卡片的排版是设计死的，"哪个字段放在哪个位置"是样式的一部分，不是作者能配的东西。
 */
export type DateParts = Record<string, string>;

/**
 * 当天的字段。**两处都用它兜底，是同一条回落：**
 * ① 模板态——定格发生在建档那一刻，模板里 `props.date` 恒为空，但大数字位总得画点什么。
 *    印 `YYYY` 这种 token 在 46cqw 的大数字位上看起来是坏的、不是占位，
 *    所以这里选画当天：形状对、宽度对，作者一眼知道将来长什么样。
 * ② 渲染态降级——建档时 instantiate 超时/抛错会留下空 `props.date`，此时同样回落当天，
 *    而不是画半截数据或空白。
 */
export function todayParts(): DateParts {
    // 非空断言安全：isoDateTime 的产物必然匹配 parseIso 的正则（同一个模块族的约定）
    return parseIso(isoDateTime(new Date()))!;
}

/** 定格串 → 字段；空串 / 解析失败一律回落当天（坏数据不该让整张卡片开天窗）。 */
export function partsOf(iso?: string | null): DateParts {
    return (iso && parseIso(iso)) || todayParts();
}
