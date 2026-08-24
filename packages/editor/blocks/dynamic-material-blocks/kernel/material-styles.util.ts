import { Type } from '@angular/core';
import { DynamicMaterialConfigEntry } from '../dynamic-material-config';

/**
 * 面板缩略图坑位的尺寸（与 `config-section.scss` 的 `--cfg-thumb-h` / 宫格列宽同源）。
 * **算尺度这件事从 CSS 挪进 TS 是刻意的**：在 CSS 里它要靠容器查询取坑位宽，而容器查询有
 * 「元素不是自己的查询容器」这类陷阱，同一条公式栽过三次（漏限宽 / cqw 没基准 / 绑定被丢弃）。
 * 挪到这里之后它是普通算术，看得见、测得着，出错当场能断言。
 */
const THUMB_SLOT_H = 88;   // 与 config-section.scss 的 --cfg-thumb-h 同源，改一处要改两处
/** 宫格最小列宽 128 减去格子左右内边距 6×2。 */
const THUMB_SLOT_W = 116;
/** 卡片外壳四边的设计内边距；与三类物料的 `calc(4 * var(--u))` 同源。 */
export const MATERIAL_FRAME_PADDING_PX = 4;

/**
 * 该档在缩略图坑位里该用多大尺度：**限高与限宽取小者**，两条各留一点余量
 * （高 80%、宽 96%），免得一排卡片顶着格子边、亚像素一取整就被 overflow 切掉。
 * 卡片在 `--u: 1px` 时的内容尺寸由 `defaultWidth` 与 `defaultAr` 给出。
 */
export const previewUnitOf = (designWidthPx: number, ar: number): number => {
    const h = designWidthPx / (ar || 1);
    return Math.round(Math.min(THUMB_SLOT_H * 0.8 / h, THUMB_SLOT_W * 0.96 / designWidthPx) * 1000) / 1000;
};

/**
 * 一种「长相」。物料声明它的若干档，交给 defineMaterialStyles 派生出面板配置项与查表。
 *
 * `defaultWidth` / `defaultAr` **必须是实测值，不许照设计稿估**——它俩同时被固定尺寸初始化
 * 和面板宫格消费，估错就是两处一起歪。
 * 量法：把样式组件按各自设计宽渲染出来读 `getBoundingClientRect()`，改过字号或间距后重量。
 * （日期卡栽过：按原型估了 0.8，字阶收小后实际 1.12，宫格里被当竖版卡限高、白缩一圈。）
 */
export interface MaterialStyle {
    id: string;
    label: string;
    /** 样式组件。`@Input()` 必须全部有默认值——面板画缩略图时把它当图标直接 outlet，一个都不传。 */
    component: Type<unknown>;
    /**
     * 该档的设计基准尺度（`--u` 的 px 值）：样式表里每个长度都是 `calc(设计px * var(--u))`，
     * 所以缺席回落 1 = 设计稿原尺寸。只有想让某档默认大一点/小一点时才给。
     */
    baseU?: number;
    /**
     * 缩略图尺度（面板那格里的 `--u`）。**缺省由 `previewUnitOf` 按坑位算**，
     * 只有个别档想手工调协调时才写死一个数。
     */
    thumbU?: number;
    /** `--u: 1px` 时样式组件内容区的设计宽度（不含公共外壳 4px 内边距）。 */
    defaultWidth: number;
    /** 宽 / 高。 */
    defaultAr: number;
    /**
     * 「内容档」各自的宽高比（可选）。**只列与 `defaultAr` 不同的那几档**，缺席即回落 `defaultAr`。
     *
     * 为什么需要它：显示配置里有一类会**改高度**（日期卡的「格式」档藏掉星期行/年月行就是），
     * 而 `defaultAr` 是「这个样式档一个数」。两者一冲突，卡片实际变矮了、props.ar 还是旧值——
     * resizer 按旧比例锁拖拽、框架按旧比例估块高，两处一起偏。
     *
     * 也可以反过来把「内容档」并进样式档（4 × 3 = 12 个样式档），但那样面板宫格会炸成 12 格、
     * 而且「台历」和「台历但没有星期」在缩略图上几乎看不出差别——那不是选长相，是选内容。
     * 判据仍是人员卡那条「改高度的进档位」，只是这里的档位分成了正交的两维。
     */
    arByVariant?: Readonly<Record<string, number>>;
    /**
     * 旧版本曾写入模型的错误固定框。命中同一宽高比时按原缩放倍数迁移到当前尺寸，
     * 只用于纠正已经发布过的尺寸声明，不参与新块创建与缩略图。
     */
    legacyFixedSizes?: readonly (MaterialFixedSize & { variant?: string | null })[];
}

/** 换档要写尺寸的宿主只需要这两样，收窄成结构类型好让纯逻辑单测能喂假对象。 */
export interface SizedBlock {
    props: Record<string, unknown>;
    updateProps: (props: Record<string, unknown>) => void;
}

export interface MaterialFixedSize {
    width: number;
    height: number;
}

/** 命中旧固定框比例时，保持作者原来的视觉缩放倍数迁移到当前样式尺寸。 */
export function migrateLegacyMaterialFixedSize(
    style: MaterialStyle,
    variant: string | null,
    current: MaterialFixedSize
): MaterialFixedSize | null {
    const legacy = style.legacyFixedSizes?.find(size => {
        if ((size.variant ?? null) !== variant) return false;
        const scale = current.width / size.width;
        return Math.abs(current.height - size.height * scale) <= 0.01;
    });
    if (!legacy) return null;
    return materialStyleFixedSize(style, variant, current.width / legacy.width);
}

/** 一套长相。物料把它整个存成常量，声明、两态组件、面板各取所需。 */
export interface MaterialStyleSet {
    /** 全部档位，顺序即面板宫格里的顺序。 */
    readonly all: readonly MaterialStyle[];
    /** 面板配置项（`control: 'thumb'`）。物料把它放进 `displayConfigs`。 */
    readonly config: DynamicMaterialConfigEntry;
    /** 默认档的固定像素尺寸，物料直接放进 `defaultProps`。 */
    readonly defaultSize: MaterialFixedSize;
    /** 查表 + 回落合成一处：空（没配过）或已删除的旧 id 都给默认档，不开天窗。 */
    resolve(id?: string | null): MaterialStyle;
    /**
     * 换**样式档**时把该档的固定 `width/height` 写回 props。
     * `variant` 是当前「内容档」（如日期卡的格式），用来在 `arByVariant` 里挑比例；
     * 不传 / 表里没有 = 用 `defaultAr`，没有内容档的物料一个字都不用改。
     */
    applySize(block: SizedBlock, style: MaterialStyle, variant?: string | null): void;
    /** 换**内容档**时保留作者拖出的宽度，只按新比例重算固定高度。 */
    applyVariantSize(block: SizedBlock, style: MaterialStyle, variant?: string | null): void;
}

/** 某个样式档在某个内容档下的宽高比。两个 apply* 共用这一处查表回落，别各写一遍。 */
const arOf = (style: MaterialStyle, variant?: string | null): number =>
    (variant && style.arByVariant?.[variant]) || style.defaultAr;

const roundSize = (value: number): number => Math.round(value * 1000) / 1000;

/** 样式声明 → 含公共外壳内边距的固定像素框。 */
export function materialStyleFixedSize(
    style: MaterialStyle,
    variant?: string | null,
    scale = style.baseU || 1
): MaterialFixedSize {
    const padding = MATERIAL_FRAME_PADDING_PX * 2;
    return {
        width: roundSize((style.defaultWidth + padding) * scale),
        height: roundSize((style.defaultWidth / arOf(style, variant) + padding) * scale)
    };
}

/**
 * 「一个物料，N 种长相」的公共实现。
 *
 * 这是**物料家族的能力，不属于任何一个物料**——日期卡是第一个用户，但天气想有第二种 chip、
 * 以后的贴纸想有几套皮，走的都该是这一份。物料侧只剩「声明有哪几档」，
 * 派生 options、查表回落、换档重尺寸这三件事一行都不用再写。
 *
 * 对应 README 四层分工的第二层：**值因物料而异（有哪几档）、机制对全家同一个答案（怎么选、怎么落）**。
 *
 * @param key    配置项键名，也是它在 props 里的字段名（如 'style'）
 * @param label  面板上这组的标题（如 '样式'）
 * @param styles 档位清单，**第一项即默认档**——不另写默认值字面量，删档时不会指向不存在的 id
 */
export function defineMaterialStyles(key: string, label: string, styles: readonly MaterialStyle[]): MaterialStyleSet {
    const dict = new Map(styles.map(s => [s.id, s]));
    const fallback = styles[0];
    const resolve = (id?: string | null): MaterialStyle => (id && dict.get(id)) || fallback;

    return {
        all: styles,
        config: {
            key,
            label,
            default: fallback.id,
            // 选的是长相不是取值：文字下拉里挑视觉，作者只能靠一个个试出来
            control: 'thumb',
            // 逐条派生，不许在物料侧再手写一份平行清单（同 registry.ts 的口径）。
            // previewAspect 复用该档的 defaultAr——缩略图与真卡片本就是同一个比例，不另存一份数。
            options: styles.map(s => ({
                value: s.id, label: s.label, preview: s.component,
                previewAspect: s.defaultAr,
                previewWidth: s.defaultWidth,
                // 缩略图尺度：档位自己写死的优先，否则按坑位算。面板直接把它绑成 --u，不再做任何计算。
                previewUnit: s.thumbU ?? previewUnitOf(s.defaultWidth, s.defaultAr)
            }))
        },
        defaultSize: materialStyleFixedSize(fallback),
        resolve,
        /**
         * **换了形状就该换尺寸**：档位之间宽高比能差好几倍，沿用上一档的 `width/height` 会让新档一进来就变形。
         * 作者手动拖过的尺寸也一并重置——不同长相之间没有「等价的大小」可言。
         *
         * 幂等：值没变就不写。这同时切断了递归——调用方在 onPropsChange 里调它，而它自己也写 props；
         * 只要 `width/height` 不在调用方的监听键里，第二轮事件就被键过滤挡掉，加上这道相等判断双保险。
         */
        applySize(block, style, variant) {
            const size = materialStyleFixedSize(style, variant);
            if (block.props['width'] === size.width && block.props['height'] === size.height) return;
            block.updateProps({ ...size, u: null, wr: null, ar: null });
        },

        /**
         * 换**内容档**时只重算 `height`，**不碰 `width`**——这是它与 applySize 的全部差别。
         *
         * 藏掉星期那一行改的是高度，宽度该多宽还多宽。顺手把 `width` 一起重置的话，
         * 作者「切个格式看看」就会把自己拖好的宽度弄没，而那跟他刚才点的那一下毫无关系。
         *
         * 同样幂等（值没变不写），递归由调用方的键过滤 + 这道相等判断双保险挡掉。
         */
        applyVariantSize(block, style, variant) {
            const base = materialStyleFixedSize(style);
            const currentWidth = Number(block.props['width']);
            const scale = Number.isFinite(currentWidth) && currentWidth > 0 ? currentWidth / base.width : 1;
            const height = materialStyleFixedSize(style, variant, scale).height;
            if (block.props['height'] === height) return;
            block.updateProps({ height, u: null, wr: null, ar: null });
        }
    };
}
