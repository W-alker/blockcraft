import { Component, HostBinding, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BaseBlockComponent } from '../../../framework';
import type { BlockObjectSizeProps, NativeBlockModel } from '../../../framework';
import { isBlockFloating, resizeMaxWidthContainer } from './object-size.util';
import { materialStyleFixedSize, migrateLegacyMaterialFixedSize } from './material-styles.util';
import type { MaterialFixedSize, MaterialStyle, MaterialStyleSet, SizedBlock } from './material-styles.util';
import type { FixedResizeCommit } from './fixed-resize.util';
import { DRAFT_PROP_META_PREFIX, hasDraftProps, projectDraftProps } from '../draft-props';

/** 空档占位组件：永远不会被 outlet 出去，理由见 BLANK_STYLE。 */
class BlankStyleComponent {}

/**
 * `styles` 缺席时 `styleDef` 的初值。**没有样式表的物料根本不读 styleDef**——天气两态的模板里
 * 压根没有 `*ngComponentOutlet`。它存在只为把信号类型保持成非空：放宽成 `MaterialStyle | null`，
 * 有样式表的物料就得在模板里写 `styleDef()!.component`，而模板里的非空断言运行期什么都不拦，
 * 等于把「档没查着」这件事从编译期挪到白屏时才发现。
 */
const BLANK_STYLE: MaterialStyle = { id: '', label: '', component: BlankStyleComponent, defaultWidth: 152, defaultAr: 4.47 };

const finitePositive = (value: unknown): number | null => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
};

/**
 * 块级「固定几何对象」物料的两态基类。需要独立宽高、缩放手柄与组合几何的物料，
 * 编辑态与渲染态都 extends 它（天气 ×2、日期卡 ×2、人员卡 ×2）；region 那种
 * 借框架 render-unit 当外壳、没有独立几何的块继续直接 extends BaseBlockComponent。
 * 因为它自己仍是个 `BaseBlockComponent<M>`，物料 schema 里 `IBlockComponents` 的声明一个字不用改。
 *
 * 装进来的是那几个组件文件里**逐字重复**的两段：
 *
 * ① **固定宽高与缩放口**。上限与浮动态判断转发给 `kernel/object-size.util`，其余几何口集中在本类；
 *    留在物料里的只剩模板接线，而每根漏接的后果都很隐蔽：
 *    漏 `resizeMaxWidth` = 浮动态只能缩不能放，漏 `isFloating` = 拖左手柄变成右边往外长，
 *    漏 `onScaled` 里那道只读闸 = 锁住的块还能被拖大。
 *
 * ② **样式表订阅**（目前只有日期卡有，人员卡是第二个）。所以它是**可选能力**：
 *    什么都不覆写就是「不订阅、不 applySize，只拿统一尺寸口」——对齐 README 四层分工那条推论
 *    「可选字段的默认要『什么都不写就是对的』」，别让天气去显式声明一堆空值来关掉它。
 *
 * 为什么这层能力破例进继承链（README 旧家规写着「能力不进继承链」）：框架自己就是这么给的——
 * `BaseEmbedBlockComponent` 下面的 Juejin / Figma 各自只覆写一个 `getValidUrl()`
 * （`@ccc/blockcraft/index.d.ts:932-975`）。判据是**一层、有名字、抽象成员声明清楚**；
 * 被点名当反面教材的 `PlaceableEditBase` 错在链子深、「这行为哪来的」查不动，不在于「有基类」。
 * 抽在 kernel 还留了退路：哪天框架自己提供了这层，把本类改成 extends 框架那个即可，物料侧零改动。
 *
 * 装饰器**必须是 `@Component`（空模板），不能是 `@Directive()`**。抽象基类挂无 selector 的
 * `@Directive()` 确实是 Angular 的常规写法（本仓 `sheet-ribbon.controller.ts:4` 等就是这么写的），
 * 但那条只适用于基类本身不是组件的场合：这里的父类 `BaseBlockComponent` 自己带 `@Component`
 * （selector `base-block`、空内联模板），而 Angular 明令禁止 directive 继承 component——
 * 打成 `@Directive()` 会在**加载 main bundle 时**直接抛 NG0903「Directives cannot inherit Components」，
 * 整个应用白屏起不来（不是某个物料坏掉，是 bootstrap 挂了）。
 * 框架自己的同位基类就是这个写法：`BaseEmbedBlockComponent` = `@Component({ selector: 'div.embed-block', template: '' })`。
 * 给 selector 不是因为它会被用到（这类永远不会被直接实例化），是为了别再多一个 `ng-component`
 * 去凑 NG0912 组件 ID 撞车的热闹。子类各自带 `@Component` 会整个覆盖掉这里的元数据。
 */
@Component({ selector: 'object-block', standalone: true, template: '' })
export abstract class ObjectBlockComponent<M extends NativeBlockModel = NativeBlockModel> extends BaseBlockComponent<M> {
    private projectedProps: M['props'] | null = null;

    /** Template-authoring values are projected from namespaced meta without mutating real props. */
    protected get presentationProps(): M['props'] {
        return this.projectedProps ?? this.props;
    }

    protected get isDraftProjection(): boolean {
        return hasDraftProps(this.meta as Record<string, unknown>);
    }
    // ───── 宿主盒子（决定「光标能停在卡片后面」这件事） ─────

    /**
     * 宿主收缩到卡片宽。**这不是排版偏好，是光标落点的前置条件。**
     *
     * 框架给每个非 leaf 的 void 块在宿主里前后各塞一个零宽 gap 填充 span，光标落进去就是
     * 「停在这个块的前面/后面」（附件、图片都靠它；`@ccc/blockcraft/themes/base.scss` 里
     * `[data-block-gap-side="after"]` 是 `position:absolute; right:-2px; bottom:0`，**相对宿主**）。
     * 而流内态框架**不给宿主绑 width**（只绑 position/left/top/z-index/margin），宿主恒是整栏宽，
     * 于是「后面」那个光标落在纸面最右下角、离 160px 的卡片十万八千里——实测 650 宽宿主里 x=651。
     * 附件看着正常纯粹因为它的卡本身占满整栏，最右下角正好紧挨着它。
     *
     * 收缩之后实测 x=161，正好贴卡片右缘，且「点卡片右边的空白」也会被
     * BlockGapCreatorPlugin 的 gutter 分支判成 `after`（它按宿主 rect 判左右）。
     *
     * ⚠️ 这一行**必须**和 `object-size.util.resizeMaxWidthContainer` 改成恒参照 root 内容元素
     * 成对存在：`mtl-scale-resizer` 的缩放上限取 `maxWidthContainer.clientWidth`，
     * 宿主一收缩、上限就恒等于当前宽，缩放变成只降不升的棘轮（那个 bug 浮动态踩过一次，
     * 记在 object-size.util 的长注释里）。
     */
    @HostBinding('style.width.px') protected get hostWidth(): number { return this.renderedWidth; }
    @HostBinding('style.height.px') protected get hostHeight(): number { return this.renderedHeight; }
    /** 卡片自己也带 `max-width:100%`，这里是宿主侧的同一道闸：拖再大也不许越过正文列。 */
    @HostBinding('style.maxWidth') protected readonly hostMaxWidth = '100%';

    // ───── 固定几何口（全家同一个答案，物料侧一行都不用再写） ─────

    /**
     * 当前样式/内容档的默认固定框。新块直接从 `defaultProps` 取宽高；这里同时给旧文档迁移、
     * 快照缺省与渲染尺度提供同一份兜底。
     */
    protected get fallbackSize(): MaterialFixedSize {
        const styles = this.styles;
        if (!styles) return { width: 160, height: 42 };
        return materialStyleFixedSize(this.styleDef(), this.currentVariant);
    }

    /**
     * 固定宽度（绑宿主 `width.px`）。`props.width` 是权威值；后面的 `u/wr/ar` 分支只用于
     * 打开旧模板时计算一次迁移结果，不再作为新数据写回。
     */
    protected get renderedWidth(): number {
        const fixed = finitePositive(this.props?.['width']);
        const fixedHeight = finitePositive(this.props?.['height']);
        if (fixed !== null && fixedHeight !== null) {
            return this.migratedFixedSize(fixed, fixedHeight)?.width ?? fixed;
        }
        if (fixed !== null) return fixed;
        const legacyUnit = finitePositive(this.props?.['u']);
        if (legacyUnit !== null) return this.fallbackSize.width * legacyUnit / this.baseUnit;
        const legacyWr = finitePositive(this.props?.['wr']);
        const rootWidth = this.doc?.objectSizing?.rootContentWidth ?? 0;
        if (legacyWr !== null && rootWidth > 0) return rootWidth * legacyWr / 100;
        return this.fallbackSize.width;
    }

    protected get renderedHeight(): number {
        const fixed = finitePositive(this.props?.['height']);
        const fixedWidth = finitePositive(this.props?.['width']);
        if (fixed !== null && fixedWidth !== null) {
            return this.migratedFixedSize(fixedWidth, fixed)?.height ?? fixed;
        }
        if (fixed !== null) return fixed;
        const legacyUnit = finitePositive(this.props?.['u']);
        if (legacyUnit !== null) return this.fallbackSize.height * legacyUnit / this.baseUnit;
        const legacyAr = finitePositive(this.props?.['ar']);
        if (legacyAr !== null) return this.renderedWidth / legacyAr;
        return this.fallbackSize.height * this.renderedWidth / this.fallbackSize.width;
    }

    /** 缩放上限的参照物（绑 `[maxWidthContainer]`）。浮动态漏传它 = 只能缩不能放，缘由见 `object-size.util` 那一份的长注释。 */
    protected get resizeMaxWidth(): HTMLElement { return resizeMaxWidthContainer(this); }

    /** 浮动态钉住右边缘（绑 `[preserveRightEdge]`）：左边缘被 placement 的 `left` 钉死，不补这个拖左手柄会变成右边往外长。 */
    protected get isFloating(): boolean { return isBlockFloating(this); }

    /** 视图可能以 50%–200% 显示；缩放手柄把视觉指针位移换回模型像素时使用这一比例。 */
    protected get viewGeometryScale(): number { return this.doc.viewScale.geometryScale; }

    // ───── 尺度口（一个 px 变量 `--u` 驱动整卡，物料侧一行都不用再写） ─────

    /**
     * 该档的**设计基准尺度**：卡片内部每个长度都写成 `calc(设计px * var(--u))`，
     * 所以 `--u: 1px` = 设计稿原尺寸。默认 1，个别档想默认大/小一点才覆写。
     */
    protected get baseUnit(): number { return this.styleDef().baseU || 1; }

    /**
     * 当前渲染尺度（绑 `[style.--u]`）。它由固定宽度相对该档默认宽度推导，
     * 只负责驱动卡片内部的等比 `calc()`，不再持久化进模型。
     *
     * **为什么不是 `font-size` + em**：日期卡有几处在同一个元素上既设字号又设内边距，
     * em 的基准是该元素自己的字号，一复合就错；px 变量在任何嵌套层级都是同一个值。
     */
    protected get scaleUnit(): number {
        return this.baseUnit * this.renderedWidth / this.fallbackSize.width;
    }

    /**
     * 绑给模板的 `[style.--u]`。**必须在这里拼成串，不能写 `[style.--u.px]`**——
     * Angular 的单位后缀只对标准样式属性生效，自定义属性会静默不生效（样式不报错、卡片直接没尺寸）。
     */
    protected get scaleUnitCss(): string { return `${this.scaleUnit}px`; }

    /**
     * 缩放提交（绑 `(scaleCommit)`）：手柄松手时才来一次。
     * 只读闸在这里而不是在手柄里——所有走缩放的物料都需要它，漏一个就是「锁住的块还能被拖大」。
     */
    protected onScaled(size: FixedResizeCommit): void {
        if (this.isReadonly) return;
        const position = this.props?.position;
        const patch: Partial<BlockObjectSizeProps> = {
            width: size.width,
            height: size.height,
            u: null,
            wr: null,
            ar: null
        };
        if (
            this.isFloating && size.positionDeltaX !== 0 &&
            position && Number.isFinite(position.x) && Number.isFinite(position.y)
        ) {
            patch['position'] = {
                x: Math.round((position.x + size.positionDeltaX) * 1000) / 1000,
                y: position.y
            };
        }
        this.doc.placement.updateObjectGeometry(this.id, patch);
    }

    // ───── 样式表订阅（可选能力：不覆写下面三个口，这一整段就不生效） ─────

    /**
     * 这个物料的样式表（`defineMaterialStyles` 的产物）。没有「N 种长相」的物料不覆写它。
     *
     * **必须声明成 getter，绝不能写成 `protected readonly styles = XXX_STYLES` 字段。**
     * 子类的字段初始化器在基类之后跑，写成字段的话，基类初始化 `styleDef` 那一刻读到的是 undefined，
     * 默认档悄悄退成 BLANK_STYLE——首帧画个空壳、控制台一声不吭。
     * getter 挂在原型上、类定义那刻就存在，没有这个先后问题。
     *
     * 好消息是这条**不用靠自觉**：TypeScript 会当场报 `TS2610`（"defined as an accessor in class …,
     * but is overridden here as an instance property"），写错了根本编译不过。实测过。
     */
    protected get styles(): MaterialStyleSet | null { return null; }

    /**
     * 「内容档」配置项的 props 键（如日期卡的 `'format'`）。**不是所有物料都有**——
     * 它指的是那种会改变卡片高度、因而要换一组宽高比的显示配置。
     *
     * 缺省 null = 没有这一维，下面那段 applyVariantSize 一次都不跑（天气、人员卡都走这条）。
     * 覆写它的物料还要在自己的样式表里给 `arByVariant`，否则查表恒回落 `defaultAr`、等于没写。
     */
    protected get variantKey(): string | null { return null; }

    private get currentVariant(): string | null {
        return this.variantKey ? (this.presentationProps?.[this.variantKey] as string | undefined) ?? null : null;
    }

    /**
     * 触发重画的 props 键。物料侧提成一个常量、两态各 return 它，**别在两个订阅回调里各写一遍**。
     * 漏一个键 = 作者改了配置画布不动；多一个（尤其 `position` / `width` / `height`）= 拖拽或缩放手势途中
     * 整张卡片反复重建。空清单 = 这个物料的长相不随 props 变，下面连订阅都不建。
     */
    protected get watchedProps(): readonly string[] { return []; }

    /**
     * 把 props 重新读进各个 signal（日期卡就是 `readDateCardLook` + `partsOf` 那四行）。
     * 默认空实现——没有 signal 要刷的物料什么都不用写。
     * 子类实现里一律走 `signal.set`：signal 自带 `Object.is` 去重，值没真变时不会触发重画。
     */
    protected repaint(): void {}

    /**
     * 当前生效的样式档，模板拿它 outlet 出样式组件（`styleDef().component`）与打 `data-style`。
     * 初值是占位：字段初始化那刻 `this.props` 还没就绪（`_props` 要到 ngOnInit → `_init` 才建 Yjs 代理），
     * 所以先给默认档（`resolve()` 无参即默认档），真值在 ngOnInit 的首次 `repaint()` 里补上。
     */
    protected readonly styleDef = signal<MaterialStyle>(this.styles?.resolve() ?? BLANK_STYLE);

    override ngOnInit(): void {
        super.ngOnInit();   // 这一步（_init）之后 this.props 才是 Yjs 代理，之前读到的是 undefined
        this.refreshProjectedProps();
        this.repaint();     // 必须赶在首帧之前：晚一帧的话 outlet 会先建默认档组件、再换成真档，白重建一次 DOM
        this.ensureFixedSize();

        // 没声明监听键 = 没有随 props 变的长相，订了也会被下面的过滤器全挡掉。
        // 直接不订：天气两态原本连 ngOnInit 都没覆写，这样它们的行为与提基类之前一字不差。
        if (!this.watchedProps.length) return;

        this.onPropsChange
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(changes => this.onPresentationChange(
                new Set(Array.from(changes.keys(), key => String(key)))
            ));

        this.doc.onMetaUpdate$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(event => {
                const transaction = event.transactions.find(item => item.blockId === this.id);
                if (!transaction) return;
                const keys = new Set<string>();
                for (const key of transaction.changes.keys()) {
                    if (key.startsWith(DRAFT_PROP_META_PREFIX)) {
                        keys.add(key.slice(DRAFT_PROP_META_PREFIX.length));
                    }
                }
                this.onPresentationChange(keys);
            });
    }

    private onPresentationChange(changes: ReadonlySet<string>): void {
                // **按键过滤，不是图省事**：浮于文字的卡片每拖一次都提交 position，缩放每次提交 width/height。
                if (!this.watchedProps.some(k => changes.has(k))) return;
                this.refreshProjectedProps();
                // 换档判据读 `styles.config.key`，不写死 'style'——键名是物料在 defineMaterialStyles
                // 第一个参数里定的，硬编码的话哪天有物料把它叫别的名字，换档就悄悄不重置尺寸了。
                const styles = this.styles;
                const changedStyle = !!styles && changes.has(styles.config.key);
                const variantKey = this.variantKey;
                const changedVariant = !!variantKey && changes.has(variantKey);
                this.repaint();
                // 换了形状就换尺寸（日期卡台历 1.17、长卷 4.10，沿用上一档会变形）。放在 repaint 之后：
                // applySize 会再写一次 props，而 width/height 不在 watchedProps 里，第二轮事件被键过滤挡掉，不递归。
                //
                // 内容档保留作者拖出的宽度，只按新比例重算固定高度——缘由见 applyVariantSize。
                // 两者同时变（作者一次点击不会做到，但换档回调理论上可以）时以样式档为准：
                // applySize 已经带上了新内容档的比例，再跑一次 applyVariantSize 是同值幂等。
                const variant = variantKey ? (this.presentationProps?.[variantKey] as string | undefined) : null;
                const sizedBlock = this as unknown as SizedBlock;
                if (changedStyle) styles.applySize(sizedBlock, this.styleDef(), variant);
                else if (changedVariant && styles) styles.applyVariantSize(sizedBlock, this.styleDef(), variant);
    }

    private refreshProjectedProps(): void {
        this.projectedProps = projectDraftProps(
            this.props as Record<string, unknown>,
            this.meta as Record<string, unknown>,
            this.watchedProps
        ) as M['props'];
    }

    /** 旧文档的 `u/wr/ar` 在首次挂载时无 Undo 收敛成固定像素几何。 */
    private ensureFixedSize(): void {
        if (this.isReadonly) return;
        const width = finitePositive(this.props?.['width']);
        const height = finitePositive(this.props?.['height']);
        const hasWidth = width !== null;
        const hasHeight = height !== null;
        const hasLegacy = ['u', 'wr', 'ar'].some(key => this.props?.[key] != null);
        const migrated = width !== null && height !== null ? this.migratedFixedSize(width, height) : null;
        if (hasWidth && hasHeight && !hasLegacy && !migrated) return;
        this.setInitProps({
            width: migrated?.width ?? this.renderedWidth,
            height: migrated?.height ?? this.renderedHeight,
            u: null,
            wr: null,
            ar: null
        });
    }

    /** 读写两态共用：只读预览不能写模型，也必须把已知错误旧框投影成当前安全尺寸。 */
    private migratedFixedSize(width: number, height: number): MaterialFixedSize | null {
        return migrateLegacyMaterialFixedSize(this.styleDef(), this.currentVariant, { width, height });
    }
}
