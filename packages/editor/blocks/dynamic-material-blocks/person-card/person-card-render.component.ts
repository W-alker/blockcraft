import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { ScaleResizerComponent } from '../kernel/scale-resizer.component';
import type { BaseBlockComponent, BlockObjectSizeProps, NoEditableBlockNative } from '../../../framework';
import { splitBorder } from '../kernel/material-border.util';
import { DEFAULT_MATERIAL_COLOR } from '../kernel/material-color.util';
import { ObjectBlockComponent } from '../kernel/object-block.component';
import type { MaterialStyle, MaterialStyleSet } from '../kernel/material-styles.util';
import { readFrozenPersonCardData } from '../dynamic-material-data';
import { PERSON_CARD_BOX_STYLE, PLACEHOLDER_VIEW, avatarRadiusOf, avatarScaleOf, showsDept, viewOf } from './person-card-view.util';
import type { PersonCardView } from './person-card-view.util';
import { PERSON_CARD_STYLES } from './person-card.styles';

/**
 * 触发重画的 props 键。**两态共用这一份**——漏一个键就是「改了配置画布不动」，
 * 多一个（尤其 position / wr / ar）就是「拖拽或缩放途中整张卡反复重建」。
 * 列在这里，不在两个订阅回调里各写一遍。
 * `person` 对编辑态是死键（那边恒画占位），但多认一个键只会多一次幂等的 repaint，
 * 比两份清单各自漂移便宜得多（同日期卡的 `date`）。
 *
 * **外壳统一 4px 内边距（乘 --u）**：物料原本零内边距，贴合内容之后一切都压在字上——
 * 选中描边（2px + 1px offset）、边框配置那圈线、缩放手柄，三样各压一次。
 * 加在外壳而不是样式组件里：卡面档的底色画在内层 `.card` 上，这一圈留白就落在卡面**之外**，
 * 描边与卡面之间有气口，卡面本身的形状一点没变。
 */
export const PERSON_CARD_WATCHED_PROPS = ['style', 'avatar', 'avatarSize', 'dept', 'color', 'bw', 'bc', 'person'] as const;

/** 一次读出「长什么样」的这几件事。两态组件各自把它灌进自己的 signal。 */
export interface PersonCardLook {
    style: MaterialStyle;
    /** 主色，落成 `--pc-color`。**只吃字色**（姓名与拼音），人员卡没有底色要压。 */
    color: string;
    /** 头像圆角，落成 `--pc-avatar-radius`（圆形 50% / 方形圆角 22%）。 */
    avatarRadius: string;
    /** 头像大小倍率，落成 `--pc-avatar-scale`（小 0.75 / 中 1 / 大 1.25），乘在各格式档自己的基数上。 */
    avatarScale: string;
    /**
     * 边框的粗细/线型/颜色，分别落成 `--pc-bw` / `--pc-bs` / `--pc-bc`（配置项「边框」，
     * props 里存一个档位值 `'2px dashed'`，到这一层由 splitBorder 拆开）。
     * bc 缺席直接落近黑、不走 null——作者选了线型就该看得见框（defineBorderConfigs 的口径，
     * 同日期卡 DateCardLook.bc 那条）。
     */
    bw: string;
    bs: string;
    bc: string;
    /** 要画的那份人（含占位口径与部门开关的结果）。 */
    view: PersonCardView;
}

/**
 * 从 props 读出这四件事；缺席一律回落默认档 / 默认色 / 圆形头像，不开天窗。两态共用，与模板常量同处一室。
 *
 * **人从参数进、不从 props 里读**：这是两态之间**唯一**的差别——渲染态传
 * `readFrozenPerson(props.person)`，编辑态恒传 null（模板里 props.person 恒为空，
 * 定格是建档产物；而且模板里也不该出现上一个人的脸，同行内人员的 templateEdit）。
 * 把这个差别收成一个参数，两态的 repaint 就长得一模一样，不会各自漂。
 *
 * **不调 `onColorFor`**：日期卡有几档拿主色当底、需要压在上面的对比文字色，人员卡三档都没有底色，
 * 主色只当字色用，那套对比色在这里没有消费者。
 */
export function readPersonCardLook(
    props?: { style?: string; avatar?: string; avatarSize?: string; dept?: string; color?: string; bw?: string; bc?: string } | null,
    person: ReturnType<typeof readFrozenPersonCardData> = null
): PersonCardLook {
    return {
        style: PERSON_CARD_STYLES.resolve(props?.style),
        color: props?.color || DEFAULT_MATERIAL_COLOR,
        avatarRadius: avatarRadiusOf(props?.avatar),
        avatarScale: avatarScaleOf(props?.avatarSize),
        bc: props?.bc || DEFAULT_MATERIAL_COLOR,
        ...splitBorder(props?.bw),
        view: viewOf(person, showsDept(props?.dept))
    };
}

/**
 * props：person（定格串）、source（configs 的意向落点）、style / avatar / dept / color（显示配置）、
 * wr / ar（缩放）。
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
export interface PersonCardModel extends NoEditableBlockNative {
    flavour: 'person-card';
    props: BlockObjectSizeProps & {
        /**
         * 定格真值：与行内人员同款的 JSON 串（共用 `freezePerson` / `readFrozenPerson`）。
         * 模板态恒空，桥在建档一刻由 `instantiate` 钩子写入。空串 = 未定格 → 画占位。
         */
        person?: string;
        /** 人员来源意向的落点（configs 的 `source`，resolve 恒给空串）。真值在上面的 person。 */
        source?: string;
        /** 格式档 id。**displayConfigs 的键**，住 props、桥不碰，作者随时换、老文档换档也不丢定格。 */
        style?: string;
        /** 头像形状（circle / rounded）。同为 displayConfigs 的键，落成 `--pc-avatar-radius`。 */
        avatar?: string;
        /** 头像大小（small / medium / large）。同为 displayConfigs 的键，落成倍率 `--pc-avatar-scale`。 */
        avatarSize?: string;
        /** 部门职务开关（off / on）。同为 displayConfigs 的键，开时部门跟在姓名后、同一行。 */
        dept?: string;
        /** 主色（CSS 颜色串）。同为 displayConfigs 的键，三档都只把它当字色用。 */
        color?: string;
        /** 边框长相（值形如 `2px dashed`）与边框色。同为 displayConfigs 的键，读法见 readPersonCardLook。 */
        bw?: string;
        bc?: string;
    };
}

/**
 * 卡片模板：编辑态与渲染态共用一份（编辑态 import 本常量）。
 * 必须提成常量而不是靠继承——@Component 的 template 元数据不随类继承传递。
 *
 * **画的是内壳 `.tpl-person-card`，绝不画 hostElement**：host 上已经挂着框架的块类、
 * `data-block-id`/`data-node-type`、`data-bc-readonly`（只读视觉）、以及 placement 的
 * position/left/top/z-index 行内样式。往 host 上写 class 或尺寸就等于把锁定视觉和浮动定位一起覆盖掉。
 *
 * **尺寸模型：模型固定 `width/height`，渲染内部用 `--u` 等比绘制。**
 * ① 基类把固定宽高绑到宿主，按当前宽度相对样式默认宽度推导 `[style.--u]`；内壳是手柄 target；
 * ② 样式组件内部每个长度都是 `calc(设计px * var(--u, 1px))`——数字直接就是设计稿上的值；
 * ③ 盒子占满固定框，选中、组合、对齐和虚拟估算都读取同一组模型宽高；
 * ④ 拖动中手柄在 pointermove 里同步直写宽高与 `--u`，松手只提交 `width/height`。
 *
 * 两态各自要提供的口（模板只认这份契约）：`styleDef()` / `view()` / `color()` / `avatarRadius()`
 * / `border()`——后四个来自本文件的 `PersonCardLook`；固定几何、`resizeMaxWidth`
 * / `isFloating` / `onScaled()` 全在 `ObjectBlockComponent` 基类里，
 * 两态一行都不用写。这几个都是 **signal** 而不是 getter：getter 每轮变更检测都会重造对象，
 * `ComponentRef.setInput` 按 `Object.is` 比对，新引用等于每轮往样式组件回灌一次 input，OnPush 白省。
 *
 * 边框画在外壳上（三档都没有卡面，外壳就是唯一的盒），4px 内边距正好是框与墨迹之间的气口。
 * **粗细恒绝对 px、不乘 --u**（边框是「一条线」，跟着卡片放大会变成黑杠，全家族同一条规矩）；
 * 圆角乘 --u（那是形状，该跟着缩）。box-sizing 必须显式写：div 默认 content-box，
 * 边框会加在 max-width:100% 之外、贴右缘时溢出正文列。
 */
export const PERSON_CARD_TEMPLATE = `
    <div class="tpl-person-card" #boxEl contenteditable="false"
         [attr.data-style]="styleDef().id"
         [style.--pc-color]="color()" [style.--pc-avatar-radius]="avatarRadius()" [style.--pc-avatar-scale]="avatarScale()"
         [style.--pc-bw]="border().bw" [style.--pc-bs]="border().bs" [style.--pc-bc]="border().bc"
         [style.--u]="scaleUnitCss"
         style="${PERSON_CARD_BOX_STYLE}">
        <ng-container *ngComponentOutlet="styleDef().component; inputs: { view: view() }"></ng-container>
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
        interface IBlockComponents { 'person-card': BaseBlockComponent<PersonCardModel> }
        interface IBlockCreateParameters { 'person-card': [] }
    }
}

/**
 * 渲染态（文档侧）：定格类物料——建档一刻把「文档创建人」烤进 props.person，此后永不变。
 * 半年后再打开，画的还是建档那天的那个人；本人调岗、改名、离职都不影响这份文档。
 *
 * 一次网络都不发（头像那个 `<img>` 除外）：人从定格串里读，不查任何数据源。
 * 建档时降级留下空 person（没登录上下文 / 超时）时回落画占位，而不是画个没有名字的空头像。
 *
 * `extends ObjectBlockComponent`：固定几何、缩放提交与样式表订阅全在基类，
 * 本类只覆写 `styles` / `watchedProps` / `repaint` 三个口。
 */
@Component({
    selector: 'div.person-card-block',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet, ScaleResizerComponent],
    template: PERSON_CARD_TEMPLATE
})
export class PersonCardRenderComponent extends ObjectBlockComponent<PersonCardModel> {
    // 初值只是占位：字段初始化那刻 this.props 还没就绪（_props 要到 ngOnInit → _init 才建代理），
    // 真值在基类 ngOnInit 的首次 repaint() 里补。给的初值就是「默认色 + 圆形 + 无框 + 占位人」，与最终回落口径一致。
    protected readonly color = signal<string>(DEFAULT_MATERIAL_COLOR);
    protected readonly avatarRadius = signal<string>(avatarRadiusOf());
    protected readonly avatarScale = signal<string>(avatarScaleOf());
    protected readonly border = signal<Pick<PersonCardLook, 'bw' | 'bs' | 'bc'>>({ ...splitBorder(null), bc: DEFAULT_MATERIAL_COLOR });
    protected readonly view = signal<PersonCardView>(PLACEHOLDER_VIEW);

    /**
     * **必须是 getter，不能写成 `readonly styles = PERSON_CARD_STYLES` 字段**：
     * 子类字段初始化器在基类之后跑，写成字段的话基类初始化 styleDef 那刻读到 undefined，
     * 默认档悄悄变成空壳、控制台一声不吭。基类注释里点名的就是这一条。
     */
    protected override get styles(): MaterialStyleSet { return PERSON_CARD_STYLES; }
    protected override get watchedProps(): readonly string[] { return PERSON_CARD_WATCHED_PROPS; }

    /** 从 props 重取各个口。signal 自带 Object.is 去重，值没变时 set 回同一个引用不会触发重画。 */
    protected override repaint(): void {
        const props = this.presentationProps;
        const look = readPersonCardLook(props, readFrozenPersonCardData(props?.person));
        this.styleDef.set(look.style);
        this.color.set(look.color);
        this.avatarRadius.set(look.avatarRadius);
        this.avatarScale.set(look.avatarScale);
        this.border.set({ bw: look.bw, bs: look.bs, bc: look.bc });
        this.view.set(look.view);
    }
}
