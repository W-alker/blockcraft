import { ChangeDetectionStrategy, Component, HostBinding, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import {ShapeResizerComponent, type ShapeResizeCommit} from '../../shape-block/shape-resizer.component';
import {storeBlockPosition} from '../../../framework/modules/object/block-placement/state';
import {calculatePersonCardResize, isPersonCardCorner, personCardContentScale, personCardFonts, type PersonCardTypographyProps} from './person-card-layout';
import type { BaseBlockComponent, BlockObjectSizeProps, NoEditableBlockNative } from '../../../framework';
import { splitBorder } from '../kernel/material-border.util';
import { DEFAULT_MATERIAL_COLOR } from '../kernel/material-color.util';
import { ObjectBlockComponent } from '../kernel/object-block.component';
import type { MaterialStyle, MaterialStyleSet } from '../kernel/material-styles.util';
import { readFrozenPersonCardData } from '../dynamic-material-data';
import { PERSON_CARD_BOX_STYLE, PLACEHOLDER_VIEW, avatarRadiusOf, avatarScaleOf, viewOf } from './person-card-view.util';
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
export const PERSON_CARD_WATCHED_PROPS = ['style', 'avatar', 'avatarSize', 'dept', 'color', 'bw', 'bc', 'person', 'sc', 'fsr', 'fsp', 'fsc'] as const;

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
     * 边框的粗细/线型/颜色，分别落成 `--pc-border-size` / `--pc-bs` / `--pc-bc`（配置项「边框」，
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
        view: viewOf(person, props?.dept, props?.style)
    };
}

/**
 * props：person（定格串）、source（configs 的意向落点）、style / avatar / dept / color（显示配置）、
 * width / height（外框）、sc（内容倍率）与 fsr / fsp / fsc（字号）。
 *
 * 必须写成内联匿名对象类型、不许提成具名 interface——具名 interface 拿不到隐式索引签名，
 * 过不了框架 IBlockProps 的 `[key: string]: SimpleValue`（这坑只在 ng-packagr 工具链下才炸）。
 *
 * **浮于文字的持久位这里一个字都不声明**：blockcraft 0.5.0 起 `position`（`"x y"`）与
 * `placementLayer`（省略=over）已是框架 `IBlockProps` 的自有字段，`BlockObjectSizeProps`
 * 继承它、我们又 `&` 在它上面，数据位天生就有。排版态（relative/absolute）更是**彻底离开了 props**——
 * 由结构决定（父级是不是 placement-layout / object-group），要读就读 `placementPosition`
 * 或 `doc.placement.getState()`。能力声明（`metadata.placement.modes`）在 block-material.factory。
 * 缘由与那次编译事故见 weather-render.component.ts 同处注释。
 */
export interface PersonCardModel extends NoEditableBlockNative {
    flavour: 'person-card';
    props: BlockObjectSizeProps & PersonCardTypographyProps & {
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
        /** 部门职务：off 关闭，on 跟随样式（横排右侧、竖排下方），below/right/above 明确位置；缺省关闭。 */
        dept?: string;
        /** 主色（CSS 颜色串）。同为 displayConfigs 的键，三档都只把它当字色用。 */
        color?: string;
        /** 边框长相（值形如 `2px dashed`）与边框色。同为 displayConfigs 的键，读法见 readPersonCardLook。 */
        bw?: string;
        bc?: string;
    };
}

/** 外框负责几何与手柄，内层负责裁剪；内容尺度与外框宽高独立。 */
export const PERSON_CARD_TEMPLATE = `
    <div class="tpl-person-card" contenteditable="false" data-bc-selection-interaction-frame
         [attr.data-style]="styleDef().id"
         [style.--pc-color]="color()" [style.--pc-avatar-radius]="avatarRadius()" [style.--pc-avatar-scale]="avatarScale()"
         [style.--pc-border-size]="borderSize()" [style.--pc-bs]="border().bs" [style.--pc-bc]="border().bc"
         [style.--pc-name-size]="fontSizes().name" [style.--pc-pinyin-size]="fontSizes().pinyin"
         [style.--pc-desc-size]="fontSizes().desc" style="${PERSON_CARD_BOX_STYLE}">
        <div class="person-card__viewport">
            <ng-container *ngComponentOutlet="styleDef().component; inputs: { view: view() }"></ng-container>
        </div>
        @if (!isReadonly) {
            <shape-resizer data-bc-selection-interaction-ignore data-bc-print-exclude="true"
                [target]="hostElement" [maxWidthContainer]="resizeMaxWidth" [maxWidthResolver]="personMaxWidthResolver"
                [resizeCalculator]="resizeCalculator" scaleVariable="--pc-scale"
                (resizeCommit)="onPersonResize($event)"></shape-resizer>
        }
    </div>
`;

declare global {
    namespace BlockCraft {
        interface IBlockComponents { 'person-card': BaseBlockComponent<PersonCardModel> }
        interface IBlockCreateParameters { 'person-card': [] }
    }
}

/** 人员内容来自文档定格数据；字号、排版和手势在人员块领域内处理。 */
@Component({
    selector: 'div.person-card-block',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet, ShapeResizerComponent],
    template: PERSON_CARD_TEMPLATE
})
export class PersonCardRenderComponent extends ObjectBlockComponent<PersonCardModel> {
    protected readonly fontSizes = signal({name: 15, pinyin: 9.5, desc: 12});
    protected readonly resizeCalculator = calculatePersonCardResize;
    protected readonly personMaxWidthResolver = () => this.isFloating ? null : this.resizeMaxWidth.clientWidth;

    @HostBinding('style.--pc-scale')
    get contentScale(): number {
        return personCardContentScale(this.props ?? {}, super.scaleUnit);
    }

    @HostBinding('attr.data-bc-resize-preview-anchor')
    protected get resizeAnchor(): string | null { return this.isFloating ? null : 'layout'; }

    protected onPersonResize(event: ShapeResizeCommit): void {
        if (this.isReadonly) return;
        const scale = this.contentScale * (isPersonCardCorner(event.handle) ? event.width / this.renderedWidth : 1);
        const patch: Partial<PersonCardModel['props']> = {
            width: Math.round(event.width),
            height: Math.round(event.height),
            sc: Math.round(scale * 100) / 100,
            u: null, wr: null, ar: null,
        };
        const placement = this.doc.placement.getState(this.id);
        if (placement.mode === 'absolute') {
            patch['position'] = storeBlockPosition({x: placement.x + event.offsetX, y: placement.y + event.offsetY});
        }
        this.doc.crud.undoManager.stopCapturing();
        this.doc.crud.transact(() => this.doc.placement.updateObjectGeometry(this.id, patch));
        this.doc.crud.undoManager.stopCapturing();
    }

    // 初值只是占位：字段初始化那刻 this.props 还没就绪（_props 要到 ngOnInit → _init 才建代理），
    // 真值在基类 ngOnInit 的首次 repaint() 里补。给的初值就是「默认色 + 圆形 + 无框 + 占位人」，与最终回落口径一致。
    protected readonly borderSize = signal(0);
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
        this.borderSize.set(Number.parseFloat(look.bw) || 0);
        this.border.set({ bw: look.bw, bs: look.bs, bc: look.bc });
        this.view.set(look.view);
        const sizes = {name: 15, pinyin: 9.5, desc: 12};
        for (const font of personCardFonts(look.style.id, props)) sizes[font.role] = font.size;
        this.fontSizes.set(sizes);
    }
}
