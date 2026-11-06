/**
 * 日期卡的「格式」档。**它控制卡上出现哪几段，不是行内日期那种格式串。**
 *
 * 与行内 `date` 的 FORMAT 刻意不同构：那边 option 的 value 就是 `YYYY年M月D日` 这样的
 * 替换模板，因为行内日期是**一行文字**，格式串直接就是结果。卡片不是——它的排版是设计死的
 * （大数字位、副行、年月行各在哪，是样式的一部分），能配的只有「哪几段出现」。
 * 硬把格式串搬过来，等于让作者去配一个卡片根本不会照着印的东西。
 *
 * 三档是**递减包含**关系（full ⊃ noWeek ⊃ min），不是三个正交开关：
 * 开关做法要 4 档样式 × 4 种组合 = 16 组宽高比实测，而每多一条开关就再翻一倍；
 * 递减档位只有 4 × 3 = 12 组，且「星期没了但年还在」这类中间态本来也没人要。
 * 判据同人员卡那条——**改高度的进档位，不改高度的才做开关**，而这里两段都可能改高度。
 */
export const DATE_FORMATS = { Full: 'full', NoWeek: 'noWeek', Min: 'min' } as const;

/** 认得的档位。脏值/老文档里已删的档一律回落默认档（同 defineMaterialStyles 的 resolve 口径，不开天窗）。 */
const KNOWN = new Set<string>(Object.values(DATE_FORMATS));
const normalize = (format?: string | null): string => (format && KNOWN.has(format) ? format : DATE_FORMATS.Full);

/** 画不画星期。只有完整档画——这正是用户口中「2026年8月17日 星期五」与「2026年8月17日」的那处差别。 */
export const showsWeek = (format?: string | null): boolean => normalize(format) === DATE_FORMATS.Full;

/**
 * 画不画年份。极简档不画。
 *
 * 月份**各档恒画**（台历的 `Aug`、方牌的 `2026-08`、长卷行签票根的 `AUG`、翻页牌的「8 月」），所以没有 showsMonth：
 * 只剩一个孤零零的日号，每张卡就都不成立了——不是配置项该表达的东西。
 */
export const showsYear = (format?: string | null): boolean => normalize(format) !== DATE_FORMATS.Min;
