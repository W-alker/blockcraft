import { splitBorder } from '../kernel/material-border.util';
import { DEFAULT_MATERIAL_COLOR } from '../kernel/material-color.util';
import type { MaterialStyle } from '../kernel/material-styles.util';
import { DATE_FORMATS } from './date-card-format.util';
import { DATE_CARD_STYLES } from './date-card.styles';

/**
 * 日期卡「长什么样」的唯一形状：五条显示配置读出来的结果，两态组件共用的那**一个** signal。
 *
 * 与 `person-card-view.util.ts` 同位——**物料的数据面，不含任何组件**。
 * 单独成文件而不是留在 `date-card-render.component.ts` 里，有两个理由：
 * ① 那个文件 `import type … from '@ccc/blockcraft'`，纯逻辑单测一 import 就把整个框架的类型
 *    拖进模块图，框架版本一动测试就跑不起来（实测栽过：blockcraft 升级把 `BlockPositionState`
 *    改名，日期卡的单测当场加载失败，而失败点跟这份逻辑毫无关系）；
 * ② README 那条「本层被一堆纯逻辑单测直接 import」的边界，本来就该由这类文件承接。
 *
 * 装成一个对象而不是五个字段散在组件里：两态的这段接线一模一样，散开就要在两个 repaint 里
 * 各抄五行 set（正是当初把五个尺寸口提进 ObjectBlockComponent 的那个理由）。
 */
export interface DateCardLook {
    style: MaterialStyle;
    /** 格式档（哪几段出现），透传给样式组件的 `format` input。 */
    format: string;
    /**
     * 背景色 / 字体色，分别落成 `--dc-bg` / `--dc-fg`。
     *
     * **`null` 是有意义的值，不是「取不到」**：它表示作者没配过，此时模板不设那个 CSS 变量，
     * 于是各档 scss 里 `var(--dc-bg, …)` 的兜底生效（台历深底白字、长卷无底深字）。
     * 在这里塞一个具体色兜底，四档就只能共用一个默认色了——那正是拆背景/字色时最先撞上的墙。
     */
    bg: string | null;
    fg: string | null;
    /**
     * 边框色，落成 `--dc-bc`。**与 bg/fg 不同，它不走 null、恒有值**：
     * 没有哪个样式档自带「本档专属的边框默认色」（七档 scss 的兜底清一色 transparent），
     * 所以「跟随样式档」这层语义在它身上是空的；而 defineBorderConfigs 的口径是
     * 「默认近黑——作者选了线型就该看得见框，不该先去挑颜色」。缺席时若照 bg/fg 折成 null，
     * scss 兜底 transparent 生效，作者点了「细线」画布纹丝不动，看起来就是边框坏了。
     * 兜底值与面板里「边框颜色」显示的默认（defineColorConfig 的 DEFAULT_MATERIAL_COLOR）同源。
     */
    bc: string;
    /**
     * 边框的粗细与线型，分别落成 `--dc-bw` / `--dc-bs`。
     *
     * props 里存的是**一个**档位值（`'2px dashed'`，见 BORDER_LOOKS），到这一层才拆成两个
     * ——拆在这里是因为 `--dc-bw` 还要被 scss 拿去算内边距（`calc(var(--dc-bw) * 2)`），
     * 而 CSS 没法从 `border` 简写里把宽度再抠出来。缺省 `0px / solid` = 无边框。
     */
    bw: string;
    bs: string;
}

/**
 * 从 props 读出这些；缺席一律回落默认档 / 不设变量，不开天窗。两态共用。
 *
 * bg/fg 两色空串一律折成 `null`：Angular 的 `[style.--x]="null"` 会 removeProperty，
 * 而 `''` 在某些版本里是 setProperty 一个空值——两者在 CSS 里的差别正是「兜底生效」与「兜底不生效」。
 * 而空串正是取色器「清空」写回来的值（面板回落配置项的 default，bg/fg 的 default 就是空串），
 * 所以这条折算不是防御性代码，是主路径。折在这一处，两态组件与单测都只面对 `string | null` 一种形状。
 * bc 不折 null、缺席直接落近黑，理由见 DateCardLook.bc。
 */
export function readDateCardLook(
    props?: { style?: string; format?: string; bg?: string; fg?: string; bw?: string; bc?: string } | null
): DateCardLook {
    return {
        style: DATE_CARD_STYLES.resolve(props?.style),
        format: props?.format || DATE_FORMATS.Full,
        bg: props?.bg || null,
        fg: props?.fg || null,
        bc: props?.bc || DEFAULT_MATERIAL_COLOR,
        ...splitBorder(props?.bw)
    };
}

/**
 * 内壳 `.tpl-date-card` 的静态样式串。提成常量的理由同天气那批（weather-look.util）：
 * 编辑态与文档渲染态要画同一只壳，样式各抄一份就会漂。
 * 4px 内边距（乘 --u）的缘由见 date-card-render.component.ts 的 WATCHED_PROPS 注释。
 */
export const DATE_CARD_BOX_STYLE =
    'position:relative;display:inline-block;width:100%;height:100%;overflow:hidden;max-width:100%;vertical-align:middle;' +
    'box-sizing:border-box;padding:calc(4 * var(--u, 1px));';
