import { splitBorder } from '../kernel/material-border.util';
import { DEFAULT_MATERIAL_COLOR } from '../kernel/material-color.util';

import {WEATHER_PALETTES, resolveWeatherLayout, type WeatherLayout, type WeatherPresentationProps} from './weather-presentation';

/** 同一投影供画布、面板和只读渲染使用；显式颜色覆盖预设，透明不等于未设置。 */
export interface WeatherLook {
    style: WeatherLayout;
    fg: string;
    accent: string;
    line: string;
    bg: string;
    bw: string;
    bs: string;
    bc: string;
    iconMode: 'original' | 'mono';
    showRange: boolean;
}

export function readWeatherLook(props?: WeatherPresentationProps | null): WeatherLook {
    const style = resolveWeatherLayout(props?.style).id;
    const palette = WEATHER_PALETTES.find(p => p.id === props?.palette) ?? WEATHER_PALETTES[0];
    // 没有新增配置的旧文档仍使用原来的近黑色；新布局默认跟随文档。
    const legacy = style === 'classic' && !props?.palette;
    const fg = props?.fg || (legacy ? DEFAULT_MATERIAL_COLOR : palette.fg);
    return {
        style, fg,
        accent: props?.accent || palette.accent,
        line: props?.line || palette.line,
        bg: props?.bg || palette.bg,
        bc: props?.bc || (legacy ? DEFAULT_MATERIAL_COLOR : 'currentColor'),
        ...splitBorder(props?.bw),
        iconMode: props?.iconMode === 'mono' ? 'mono' : 'original',
        showRange: props?.range !== 'off',
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
/** 温度与地点的竖排列：占满图标后的剩余宽度，地点只在整列用满后省略。 */
export const WEATHER_CHIP_COL_STYLE = 'display:flex;flex:1;flex-direction:column;min-width:0;';
/** 温度行：吃 --wt-fg 原色。 */
export const WEATHER_CHIP_TEMP_STYLE =
    'font-size:calc(16 * var(--u, 1px));font-weight:600;color:var(--wt-fg, #1f2329);';
/** 地点行：--wt-fg 兑 52% 透明（层级靠 alpha，不靠第二个色）。 */
export const WEATHER_CHIP_SUB_STYLE =
    'font-size:calc(11.04 * var(--u, 1px));color:color-mix(in srgb, var(--wt-fg, #1f2329) 52%, transparent);' +
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
