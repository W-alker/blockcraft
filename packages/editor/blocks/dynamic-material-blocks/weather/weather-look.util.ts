import { splitBorder } from '../kernel/material-border.util';
import { DEFAULT_MATERIAL_COLOR } from '../kernel/material-color.util';

/**
 * 天气 chip「长什么样」的唯一形状：三条显示配置读出来的结果，两态组件共用的那**一个** signal。
 *
 * 与 `date-card-look.util.ts` 同位——**物料的数据面，不含任何组件**。单独成文件的理由同那边：
 * 组件文件 `import type … from '@ccc/blockcraft'`，纯逻辑单测一 import 就把框架类型拖进模块图，
 * 框架版本一动测试就在无关处加载失败（0.5.0 撤 `BlockPositionState` 那次实测栽过）。
 *
 * 没有 bg/fg 那套 `null` = 「跟随样式档」的语义：天气只有一种长相、没有样式档可跟随，
 * 三个口全部**恒有值**、缺席直接落默认（同人员卡 `color` 的口径）——
 * 面板里显示的默认色与画布上实际的颜色因此天然一致，不会出现「卡片有色、面板显示空」的错位。
 */
export interface WeatherLook {
    /** 文字颜色，落成 `--wt-fg`。温度吃原色，地点行由模板兑半透明（层级靠 alpha，不靠第二个色）。 */
    fg: string;
    /**
     * 边框的粗细与线型，分别落成 `--wt-bw` / `--wt-bs`。
     * props 里存的是**一个**档位值（`'2px dashed'`，见 BORDER_LOOKS），到这一层才拆成两个。
     */
    bw: string;
    bs: string;
    /** 边框色，落成 `--wt-bc`。缺席落近黑——作者选了线型就该看得见框（defineBorderConfigs 的口径）。 */
    bc: string;
}

/** 从 props 读出这些；缺席一律回落默认，不开天窗。两态共用。 */
export function readWeatherLook(
    props?: { fg?: string; bw?: string; bc?: string } | null
): WeatherLook {
    return {
        fg: props?.fg || DEFAULT_MATERIAL_COLOR,
        bc: props?.bc || DEFAULT_MATERIAL_COLOR,
        ...splitBorder(props?.bw)
    };
}

// ───── chip 的静态样式串（编辑态 / 文档渲染态同源） ─────
// 提成常量的理由与 WEATHER_CHIP_TEMPLATE 提成常量相同：两态必须共用同一份盒模型样式，
// 要画同一只 chip，样式各抄一份就会漂——设计值只许在这里出现一次。
// 尺寸模型（--u + 全 calc）与各数值的缘由见 weather-render.component.ts 的模板注释。

/** chip 外壳：布局、4px 内边距（乘 --u）、边框三变量、圆角。 */
export const WEATHER_CHIP_BOX_STYLE =
    'position:relative;display:inline-flex;width:100%;height:100%;overflow:hidden;align-items:center;gap:calc(8 * var(--u, 1px));padding:calc(4 * var(--u, 1px));' +
    'box-sizing:border-box;border:var(--wt-bw, 0px) var(--wt-bs, solid) var(--wt-bc, transparent);border-radius:calc(6 * var(--u, 1px));' +
    'line-height:1.2;max-width:100%;vertical-align:middle;';
/** 天气图标（weather-mark 宿主）：1em = 图标边长，设计稿 33.6px。 */
export const WEATHER_CHIP_MARK_STYLE = 'font-size:calc(33.6 * var(--u, 1px));';
/** 温度与地点的竖排列。 */
export const WEATHER_CHIP_COL_STYLE = 'display:flex;flex-direction:column;min-width:0;';
/** 温度行：吃 --wt-fg 原色。 */
export const WEATHER_CHIP_TEMP_STYLE =
    'font-size:calc(16 * var(--u, 1px));font-weight:600;color:var(--wt-fg, #1f2329);';
/** 地点行：--wt-fg 兑 52% 透明（层级靠 alpha，不靠第二个色）。 */
export const WEATHER_CHIP_SUB_STYLE =
    'font-size:calc(11.04 * var(--u, 1px));color:color-mix(in srgb, var(--wt-fg, #1f2329) 52%, transparent);' +
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
