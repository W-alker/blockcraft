import { ChangeDetectionStrategy, Component } from '@angular/core';
import { defineColorConfig } from './material-color.util';
import { DynamicMaterialConfigEntry } from '../dynamic-material-config';

/**
 * 边框的六档长相。**值就是 CSS `border` 的前两段**（`宽度 线型`），物料把它拆开落成
 * `--dc-bw` / `--dc-bs`，不需要再维护一张「档位 id → 像素 + 线型」的查表（两张表必然飘，
 * 同行内日期「格式串即 value」那条）。
 *
 * ## 为什么是一维六档，不是「粗细 × 线型」两个宫格
 *
 * 两者看着正交，**全组合里一半是废格**：`double` 在 1px 上只画得出一条线（总宽要三等分给
 * 线-空-线），`dotted` 到 3px 就成了一串珠子。4 粗细 × 4 线型 = 16 格，能用的不到一半，
 * 而作者要的从来就是「这圈框长什么样」一件事。所以每档自带一个**已经调好的粗细**：
 * 虚线/点线定在 2px（1px 的虚线在纸面上几乎看不出断口，3px 又太胖），双线定在 3px（1/1/1）。
 *
 * 与「样式 × 格式」那对不合并的两维不是一回事（见 material-styles.util 的 arByVariant 注释）：
 * 那两维**每个组合都成立**（每种长相 × 三种内容档都是有意义的卡），这里不是。
 * 所以每种线型只列**看得出差别的那一两个粗细**：实线三档（1/2/3px 在卡面上是三种分量），
 * 虚线与点线各两档（细的秀气、粗的醒目，再多一档在缩略图里就分不出了），双线只有一档。
 *
 * ## 试过但没进来的：只画一条边（底线 / 左竖条 / 上下线）
 *
 * 那是另一个维度，看着比再加线型漂亮得多，但**过不了「任意组合都得成立」这条**：
 * 卡片是圆角的，只留一条边时线会跟着圆角卷起来——方牌（10cqw 圆角）的底线成了个 U 形勾、
 * 左竖条成了 C 形（实测截图）。长卷、行签那种小圆角上倒是好看，可一档边框不能只在部分样式档上成立。
 * 真要做，得连圆角一起进档位（「直角卡 + 底线」是一档），那已经是样式档的活，不是边框的。
 *
 * 「无」写成 `0px solid` 而不是 `0`：有的档要拿宽度算内边距（`calc(var(--dc-bw) * 2)`），
 * 而 `calc(0 * 2)` 的结果是**数字不是长度**，喂给 padding 当场无效——0 后面那个单位不是可有可无的。
 */
export const BORDER_LOOKS = {
    None: '0px solid',
    Thin: '1px solid',
    Medium: '2px solid',
    Thick: '3px solid',
    DashedThin: '1px dashed',
    Dashed: '2px dashed',
    DottedThin: '1px dotted',
    Dotted: '2px dotted',
    Double: '3px double'
} as const;

/**
 * 档位值 → CSS 的两段。`'2px dashed'` → `{ bw: '2px', bs: 'dashed' }`。
 *
 * **老数据只存了粗细**（六档之前的取值是 `'0px' | '1px' | '2px' | '3px'`），拆出来线型为空、
 * 回落 `solid`——早先存过边框的卡片照旧是那么粗的一圈实线，不会因为改档位而变样。
 * 只是宫格里选不中任何一格（`'3px'` 与 `'3px solid'` 不是同一个串），作者下次点一下即归位。
 */
export function splitBorder(value?: string | null): { bw: string; bs: string } {
    const [bw, bs] = (value || BORDER_LOOKS.None).split(' ');
    return { bw: bw || '0px', bs: bs || 'solid' };
}

/**
 * 缩略图共用的模板与样式。提成常量而不是靠继承——`@Component` 的 template 元数据不随类继承传递
 * （同 DATE_CARD_TEMPLATE 那条）。六个类的差别只有一个 `b` 字段。
 *
 * 画的是一个**空框**而不是一张缩小的卡片：作者在这一格里挑的是「这圈线长什么样」，
 * 塞进真卡片的话，六格看上去就是六张一模一样的卡，那条线反而看不见了。
 *
 * 「无」那档画一道极淡的虚线：完全空白的格子点不出「这里能点」，也说不出与相邻格的关系。
 * 这道虚线是**格子内的示意**、不是这一档的取值（取值是 `0px solid`），所以它由
 * `BorderNoneThumb` 自己给一组「画得出来」的粗细/线型，颜色再由 `is-none` 那条规则压淡。
 *
 * **不能反过来让 CSS 去盖粗细**：粗细与线型是 `[style.border-*]` 绑上去的**行内样式**，
 * 组件样式表压不过它（除非 `!important`）——照那么写，「无」这一格是彻底空白的
 * （实测：`:host(.is-none)` 里那句 `border-width: 1px` 完全不生效）。CSS 只碰没被绑走的属性。
 */
const THUMB_TEMPLATE = `<span class="mtl-border-thumb" [style.border-width]="b.bw" [style.border-style]="b.bs"></span>`;
const THUMB_STYLES = [`
    :host { display: block; width: var(--mtl-w, 100%); }
    .mtl-border-thumb {
        display: block;
        box-sizing: border-box;
        width: 100%;
        aspect-ratio: 2;
        border-color: var(--cs-color-text, #1f2329);
        border-radius: 6px;
    }
    :host(.is-none) .mtl-border-thumb { border-color: var(--cs-color-border, #dee0e3); }
`];

@Component({ selector: 'mtl-bd-none', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'is-none' }, template: THUMB_TEMPLATE, styles: THUMB_STYLES })
export class BorderNoneThumb {
    /** 唯一一个不画自己取值的缩略图：`0px` 画出来就是一片空白（理由见 THUMB_STYLES 上方）。 */
    protected readonly b = { bw: '1px', bs: 'dashed' };
}

@Component({ selector: 'mtl-bd-thin', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
    template: THUMB_TEMPLATE, styles: THUMB_STYLES })
export class BorderThinThumb { protected readonly b = splitBorder(BORDER_LOOKS.Thin); }

@Component({ selector: 'mtl-bd-medium', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
    template: THUMB_TEMPLATE, styles: THUMB_STYLES })
export class BorderMediumThumb { protected readonly b = splitBorder(BORDER_LOOKS.Medium); }

@Component({ selector: 'mtl-bd-thick', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
    template: THUMB_TEMPLATE, styles: THUMB_STYLES })
export class BorderThickThumb { protected readonly b = splitBorder(BORDER_LOOKS.Thick); }

@Component({ selector: 'mtl-bd-dashed-thin', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
    template: THUMB_TEMPLATE, styles: THUMB_STYLES })
export class BorderDashedThinThumb { protected readonly b = splitBorder(BORDER_LOOKS.DashedThin); }

@Component({ selector: 'mtl-bd-dashed', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
    template: THUMB_TEMPLATE, styles: THUMB_STYLES })
export class BorderDashedThumb { protected readonly b = splitBorder(BORDER_LOOKS.Dashed); }

@Component({ selector: 'mtl-bd-dotted-thin', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
    template: THUMB_TEMPLATE, styles: THUMB_STYLES })
export class BorderDottedThinThumb { protected readonly b = splitBorder(BORDER_LOOKS.DottedThin); }

@Component({ selector: 'mtl-bd-dotted', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
    template: THUMB_TEMPLATE, styles: THUMB_STYLES })
export class BorderDottedThumb { protected readonly b = splitBorder(BORDER_LOOKS.Dotted); }

@Component({ selector: 'mtl-bd-double', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
    template: THUMB_TEMPLATE, styles: THUMB_STYLES })
export class BorderDoubleThumb { protected readonly b = splitBorder(BORDER_LOOKS.Double); }

/**
 * 「边框」两个配置项（长相 + 颜色）的公共实现。与 defineMaterialStyles / defineColorConfig 同理——
 * **边框是物料家族的能力，不属于任何一个物料**；物料只需要把返回的两项摊进 `displayConfigs`，
 * 再在自己的 scss 里认 `--dc-bw / --dc-bs / --dc-bc` 三个变量（拆值用 `splitBorder`）。
 * 日期卡是第一个用户。
 *
 * 长相用 `control: 'thumb'` 而不是文字下拉，判据就是 material.types 里那条
 * **「选的是取值还是视觉」**——「1px dashed」是取值的写法，作者真正在挑的是那圈线的长相，
 * 「虚线 / 点线 / 双线」列成文字他只能一个个试。
 *
 * 颜色声明 `attachTo` 跟着长相走：面板把 thumb 项统一沉到最后（sinkThumbsLast），
 * 不声明跟随的话，宫格沉到底、颜色被留在上面那组行里，**一个「边框」被排序机制切成两段**
 * ——作者调完粗细还得滚回上面去找颜色。跟随之后两项恒相邻、整体沉底。
 *
 * **粗细一律是绝对 px、不跟卡片等比缩放**：边框在视觉上是「一条线」，
 * 跟着卡片放大会变成一道黑杠。这与「卡片内部尺寸一律 cqw」不矛盾，那条管的是排版尺寸。
 *
 * @param lookKey  长相的键名（缺省 'bw'），也是它在 props 里的字段名。**沿用旧名不改**——
 *                 改名等于把作者已存的边框全丢了（props 里的旧键没人读，卡片当场变成无框）。
 * @param colorKey 颜色的键名（缺省 'bc'）
 */
export function defineBorderConfigs(lookKey = 'bw', colorKey = 'bc'): DynamicMaterialConfigEntry[] {
    return [
        {
            key: lookKey,
            label: '边框',
            default: BORDER_LOOKS.None,
            control: 'thumb',
            // previewAspect 与缩略图组件里的 aspect-ratio: 2 是同一个数。面板拿它限高反算宽度，
            // 组件拿它定自己的形状——两处都得知道，且必须一致，改一个要改两个。
            // 顺序按「线型家族」排，不是按粗细排：面板是两列宫格，同族两档正好并排一行
            // （细线|中线、粗线|细虚线… 会把家族切开，作者要在格子间来回找同一种线的另一个粗细）。
            options: [
                { value: BORDER_LOOKS.None, label: '无', preview: BorderNoneThumb, previewAspect: 2 },
                { value: BORDER_LOOKS.Thin, label: '细线', preview: BorderThinThumb, previewAspect: 2 },
                { value: BORDER_LOOKS.Medium, label: '中线', preview: BorderMediumThumb, previewAspect: 2 },
                { value: BORDER_LOOKS.Thick, label: '粗线', preview: BorderThickThumb, previewAspect: 2 },
                { value: BORDER_LOOKS.DashedThin, label: '细虚线', preview: BorderDashedThinThumb, previewAspect: 2 },
                { value: BORDER_LOOKS.Dashed, label: '虚线', preview: BorderDashedThumb, previewAspect: 2 },
                { value: BORDER_LOOKS.DottedThin, label: '细点线', preview: BorderDottedThinThumb, previewAspect: 2 },
                { value: BORDER_LOOKS.Dotted, label: '点线', preview: BorderDottedThumb, previewAspect: 2 },
                { value: BORDER_LOOKS.Double, label: '双线', preview: BorderDoubleThumb, previewAspect: 2 }
            ]
        },
        // 颜色复用取色器那套（自带弹层、透明度、最近使用）。默认近黑：作者打开边框时
        // 期望的是一圈中性的框，而不是先去挑个颜色才看得见东西。
        // attachTo 让它贴在长相宫格后面（理由见上方注释），defineColorConfig 本身不必知道这回事。
        { ...defineColorConfig(colorKey, '边框颜色'), attachTo: lookKey }
    ];
}
