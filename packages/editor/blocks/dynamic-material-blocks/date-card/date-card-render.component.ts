import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { BaseBlockComponent } from '../../../framework';
import { ScaleResizerComponent } from '../kernel/scale-resizer.component';
import type { BlockObjectSizeProps, NoEditableBlockNative } from '../../../framework';
import { ObjectBlockComponent } from '../kernel/object-block.component';
import { partsOf, todayParts } from './date-card-parts.util';
import type { DateParts } from './date-card-parts.util';
import { DATE_CARD_BOX_STYLE, readDateCardLook } from './date-card-look.util';
import type { DateCardLook } from './date-card-look.util';
import type { MaterialStyleSet } from '../kernel/material-styles.util';
import { DATE_CARD_STYLES } from './date-card.styles';

/**
 * 触发重画的 props 键。**两态共用这一份**——漏一个键就是「改了配置画布不动」，
 * 多一个（尤其 position / wr / ar）就是「拖拽或缩放途中整张卡反复重建」。
 * 列在这里，不在两个订阅回调里各写一遍。
 * date 对编辑态是死键（那边恒画当天），但多认一个键只会多一次幂等的 repaint，
 * 比两份清单各自漂移便宜得多。
 *
 * **外壳统一 4px 内边距（乘 --u）**：物料原本零内边距，贴合内容之后一切都压在字上——
 * 选中描边（2px + 1px offset）、边框配置那圈线、缩放手柄，三样各压一次。
 * 加在外壳而不是样式组件里：卡面档的底色画在内层 `.card` 上，这一圈留白就落在卡面**之外**，
 * 描边与卡面之间有气口，卡面本身的形状一点没变。
 */
export const DATE_CARD_WATCHED_PROPS = ['style', 'format', 'bg', 'fg', 'bw', 'bc', 'date'] as const;

/**
 * 「长什么样」的形状与读法住 `date-card-look.util`（不含组件、不 import 框架），这里只转发。
 * 为什么分家：纯逻辑单测要 import 它，而本文件带着 `@ccc/blockcraft` 的类型——
 * 框架版本一动（0.5.0 撤掉 `BlockPositionState` 那次）单测就在一个跟这份逻辑毫无关系的地方加载失败——
 * 那次三个物料的 import 一起挂，packages/docs 十几个套件连带整套 failed to run，正是这条分家的由来。
 */
export type { DateCardLook } from './date-card-look.util';
export { readDateCardLook } from './date-card-look.util';

/**
 * props：date（定格串）、style / color（显示配置）、wr / ar（缩放）。
 *
 * 必须写成内联匿名对象类型、不许提成具名 interface——具名 interface 拿不到隐式索引签名，
 * 过不了框架 IBlockProps 的 `[key: string]: SimpleValue`（这坑只在 ng-packagr 工具链下才炸）。
 *
 * **浮于文字的持久位这里一个字都不声明**：blockcraft 0.5.0 起 `position`（`{x,y}`）与
 * `placementLayer`（省略=over）已是框架 `IBlockProps` 的自有字段，`BlockObjectSizeProps`
 * 继承它、我们又 `&` 在它上面，数据位天生就有。排版态（relative/absolute）更是**彻底离开了 props**——
 * 由结构决定（父级是不是 placement-layout / object-group），要读就读 `placementPosition`
 * 或 `doc.placement.getState()`。能力声明（`metadata.placement.modes`）在 block-material.factory。
 * 缘由与那次编译事故见 weather-render.component.ts 同处注释。
 */
export interface DateCardModel extends NoEditableBlockNative {
    flavour: 'date-card';
    props: BlockObjectSizeProps & {
        /** 定格真值（configs 的 `date` 项 resolve 出来的）。模板态恒空，桥在建档一刻才写。 */
        date?: string;
        /** 样式档 id。**displayConfigs 的键**，住 props、桥不碰，作者随时换、老文档换档也不丢定格。 */
        style?: string;
        /**
         * 格式档 id（哪几段出现）。同为 displayConfigs 的键。
         * 它是唯一会改高度的显示配置，因而也是基类的 `variantKey`——换它要重写 `ar`。
         */
        format?: string;
        /**
         * 背景色 / 字体色 / 边框色 / 边框长相（`bw`，值形如 `2px dashed`），全是 displayConfigs 的键。
         * 三个颜色**缺席 = 跟随样式档**（各档 scss 自带兜底），不是「取不到」；缘由见 DateCardLook。
         * 早先那个 `color`（一个主色，四档各自决定它落在文字还是卡面）已被 bg/fg 取代——
         * 老文档里残留的 `color` 键读不到人，等同没配过，回落各档默认，不会开天窗。
         */
        bg?: string;
        fg?: string;
        bc?: string;
        bw?: string;
    };
}

/**
 * 卡片模板：编辑态与渲染态共用一份（编辑态 import 本常量）。
 * 必须提成常量而不是靠继承——@Component 的 template 元数据不随类继承传递。
 *
 * **画的是内壳 `.tpl-date-card`，绝不画 hostElement**：host 上已经挂着框架的块类、
 * `data-block-id`/`data-node-type`、`data-bc-readonly`（只读视觉）、以及 placement 的
 * position/left/top/z-index 行内样式。往 host 上写 class 或尺寸就等于把锁定视觉和浮动定位一起覆盖掉。
 *
 * **尺寸模型：模型固定 `width/height`，渲染内部用 `--u` 等比绘制。**
 * ① 基类把固定宽高绑到宿主，按当前宽度相对样式默认宽度推导 `[style.--u]`；内壳是手柄 target；
 * ② 样式组件内部每个长度都是 `calc(设计px * var(--u, 1px))`——数字直接就是设计稿上的值；
 * ③ 盒子占满固定框，选中、组合、对齐和虚拟估算都读取同一组模型宽高；
 * ④ 拖动中手柄在 pointermove 里同步直写宽高与 `--u`，松手只提交 `width/height`。
 *
 * 模板认的那些口，**分两半来源**：
 * ① 基类 `ObjectBlockComponent` 给的固定几何、`resizeMaxWidth` / `isFloating` / `onScaled()`，
 *    外加 `styleDef()`（换档时基类自己也要读它）。
 *    两态组件一行都不写，删了它们正是提基类的目的。
 * ② 两态各自提供的两个——`parts()` 与 `look()`。只有 `parts()` 的取法两态不同
 *    （渲染态读定格串、编辑态恒当天）；五条显示配置两态同源，一起装在 `look()` 那一个对象里。
 *
 * 四个颜色/边框变量绑的是 `string | null`：**null 时 Angular 会 removeProperty**，
 * 于是样式组件里 `var(--dc-bg, 深色)` 的兜底生效——「作者没配过」与「配成透明」
 * 在这套里是两件事，靠的就是这个 null（见 readDateCardLook）。
 *
 * 这几个都是 **signal** 而不是 getter：getter 每轮变更检测都会重造对象，
 * `ComponentRef.setInput` 按 `Object.is` 比对，新引用等于每轮往样式组件回灌一次 input，OnPush 白省；
 * signal 被模板读到就自动注册消费者，值一变框架自己标脏，不用手写 markForCheck。
 */
export const DATE_CARD_TEMPLATE = `
    <div class="tpl-date-card" #boxEl contenteditable="false"
         [attr.data-style]="styleDef().id"
         [style.--dc-bg]="look().bg" [style.--dc-fg]="look().fg"
         [style.--dc-bw]="look().bw" [style.--dc-bs]="look().bs" [style.--dc-bc]="look().bc"
         [style.--u]="scaleUnitCss"
         style="${DATE_CARD_BOX_STYLE}">
        <ng-container *ngComponentOutlet="styleDef().component; inputs: { parts: parts(), format: look().format }"></ng-container>
        @if (!isReadonly) {
            <mtl-scale-resizer [target]="boxEl" [maxWidthContainer]="resizeMaxWidth"
                               [geometryScale]="viewGeometryScale"
                               [preserveRightEdge]="isFloating"
                               (scaleCommit)="onScaled($event)"></mtl-scale-resizer>
        }
    </div>
`;

declare global {
    namespace BlockCraft {
        interface IBlockComponents { 'date-card': BaseBlockComponent<DateCardModel> }
        interface IBlockCreateParameters { 'date-card': [] }
    }
}

/**
 * 渲染态（文档侧）：定格类物料——建档一刻把「文档创建时间」烤进 props.date，此后永不变。
 * 半年后再打开，画的还是建档那天；建档时降级留下空 date 时由 partsOf 回落当天，不开天窗。
 *
 * 一次网络都不发、也没有任何数据源依赖：日期是纯函数算出来的，与天气那种要查数据源的定格不同。
 */
@Component({
    selector: 'div.date-card-block',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet, ScaleResizerComponent],
    template: DATE_CARD_TEMPLATE
})
export class DateCardRenderComponent extends ObjectBlockComponent<DateCardModel> {
    // 初值只是占位：字段初始化那刻 this.props 还没就绪（_props 要到 ngOnInit → _init 才建代理），
    // 真值在基类 ngOnInit 的首次 repaint 里补。给的初值就是「默认色 + 当天」，与最终回落口径一致
    //（styleDef 的同款占位在基类里，初值同样是默认档）。
    protected readonly parts = signal<DateParts>(todayParts());
    protected readonly look = signal<DateCardLook>(readDateCardLook(null));

    /** 基类的样式表口。必须是 getter：写成字段的话基类初始化 styleDef 那刻读到 undefined。 */
    protected override get styles(): MaterialStyleSet { return DATE_CARD_STYLES; }
    /** 监听键与编辑态同源（见 WATCHED_PROPS）；订阅、按键过滤、换档重尺寸全在基类。 */
    protected override get watchedProps(): readonly string[] { return DATE_CARD_WATCHED_PROPS; }
    /** 格式档会改高度，所以要认作内容档——基类据此在换它时只重写 `ar`。两态同源。 */
    protected override get variantKey(): string { return 'format'; }

    /**
     * 从 props 重取所有口。**parts 按 props.date 重算**——这是与编辑态那份（恒当天）唯一的差别。
     *
     * 五个显示配置装在**一个** `look` signal 里而不是五个：两态的这段接线一模一样，
     * 拆五个就要在两个 repaint 里各抄五行 set（正是当初把五个尺寸口提进基类的那个理由）。
     * 装成一个对象后两态各自只剩两行，且加第六条配置时两处都不用改。
     * 代价是每次 repaint 都换一个新对象引用——无所谓：repaint 只在监听键真变了才跑，
     * 而模板绑出去的都是对象里的字符串字段，`setInput` 仍按值比对。
     */
    protected override repaint(): void {
        const props = this.presentationProps;
        const look = readDateCardLook(props);
        this.styleDef.set(look.style);   // 基类换档时要读它，所以它单独存在、不能只住 look 里
        this.look.set(look);
        this.parts.set(partsOf(props?.date));
    }
}
