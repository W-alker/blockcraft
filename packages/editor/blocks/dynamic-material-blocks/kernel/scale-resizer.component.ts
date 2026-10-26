import {
    AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
    Input, NgZone, OnDestroy, Output, inject
} from '@angular/core';
import {
    calculateFixedResize,
    releaseFixedResizeWidthClamp,
    restoreFixedResizeWidthClamp
} from './fixed-resize.util';
import type { FixedResizeCommit } from './fixed-resize.util';

/**
 * 卡片物料的缩放手柄。**框架的 `<block-resizer>` 在这里用不了**，原因只有一条：
 * 它拖动中只直写 `container.style.width`、不发逐帧回调（`resizeCommit` 只在松手时发一次，
 * `@ccc/blockcraft/fesm2022/ccc-blockcraft.mjs:25597` 那个类）。卡片内部还需要同步更新 `--u`
 * 才能等比缩放，因此这里在同一次 pointermove 中预览固定宽高与内部尺度。
 *
 * 用 ResizeObserver 转译过——**慢整整一帧**：匀速拖拽（每帧 6px）实测手柄右缘恒落后光标
 * 6.04px，手速翻倍就是 12px；同一个 pointermove 里直写是 0.04px。RO 回调排在布局之后，
 * 追手势的间接链路永远慢一拍（同 2026-07-15 给拖拽预览加 rAF"合帧"那次的病因）。
 *
 * 与框架那份的关系：**除了"写什么"，行为逐条对齐**——hover 才显手柄、指针捕获、最小/最大夹取、
 * 浮动态钉右缘、Esc 与窗口失焦还原、拖动中不过变更检测。少任何一条都是能复现的退化
 * （漏最大值 = 浮动态只能缩不能放，漏钉右缘 = 拖左手柄变成右边往外长）。
 *
 * 刻意零业务依赖：不认 flavour、不 import 注册表，只吃一个 DOM 元素与两个数字。
 * 形态照 `plugins/object-drag.plugin.ts` —— 哪天框架给 `block-resizer` 补上逐帧回调
 * （或像 `ShapeResizerComponent` 认 `data-bc-scale-font-on-corner` 那样认一个缩放目标），
 * 本文件整个删掉、物料侧换一行模板即可。
 */
@Component({
    selector: 'mtl-scale-resizer',
    standalone: true,
    // **必须打这个标**：ObjectDragPlugin 在 document 捕获阶段监听 pointerdown，比本组件的处理器先跑，
    // 所以手柄里的 stopPropagation 拦不住它——按住手柄会同时开始"拖动整块"。
    // 它的放行口是 `closest('block-resizer, [data-bc-nodrag]')`（object-drag.plugin.ts:58），
    // 框架自家的 resizer 靠元素名被认出来，我们这个只能靠属性。
    host: {
        'data-bc-nodrag': '',
        'data-bc-selection-interaction-ignore': '',
        'data-bc-placement-pick-ignore': ''
    },
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mtl-scale__bar mtl-scale__bar--left" (pointerdown)="onDown($event, 'left')"><i></i></div>
        <div class="mtl-scale__bar mtl-scale__bar--right" (pointerdown)="onDown($event, 'right')"><i></i></div>
    `,
    styles: [`
        :host { display:block; position:absolute; inset:0; pointer-events:none }
        .mtl-scale__bar {
            position:absolute; top:0; width:20px; height:100%;
            display:flex; align-items:center; justify-content:center;
            pointer-events:auto; cursor:col-resize; touch-action:none; z-index:10;
            opacity:0; transition:opacity .2s ease;
        }
        :host(.visible) > .mtl-scale__bar { opacity:1 }
        .mtl-scale__bar--left { left:-10px }
        .mtl-scale__bar--right { right:-10px }
        .mtl-scale__bar > i {
            display:block; width:6px; height:48px; max-height:60%; min-height:24px;
            border-radius:3px; background:var(--bc-active-color, #4857E2); opacity:.75;
            box-shadow:0 1px 4px #00000040;
            transition:opacity .15s ease, transform .15s ease;
        }
        .mtl-scale__bar:hover > i, .mtl-scale__bar:active > i { opacity:1; transform:scaleY(1.15) }
    `]
})
export class ScaleResizerComponent implements AfterViewInit, OnDestroy {
    /**
     * 被缩放的元素。卡片内部每个长度都写成
     * `calc(设计px * var(--u))`，所以 `--u: 1px` 就是设计稿原尺寸，翻倍即整卡翻倍。
     * 拖动中同步直写行内宽高与该变量，松手才通过 `scaleCommit` 提交固定像素框。
     *
     * 为什么不是 `font-size` + em（先做过一版）：日期卡有几处在同一个元素上既设字号又设内边距，
     * em 的基准是**该元素自己的字号**，一复合就错；px 变量在任何层级都是同一个值。
     */
    @Input({ required: true }) target!: HTMLElement;

    /**
     * 缩放上限的参照物。**不传就是「只能缩不能放」那个 bug**：不传时上限取宿主，
     * 而宿主宽度就是当前固定卡片宽，上限恒等于当前宽，往大拖一次夹一次。
     * 浮动态要传 root 内容元素（同框架图片块的 `resizeMaxWidthContainer` 口径）。
     */
    @Input() maxWidthContainer?: HTMLElement;

    /** 尺度下限（`--u` 的 px 值）。比这个再小卡片就糊了，也防手滑拖到 0。 */
    @Input() minUnit = 0.45;

    /** 浮动态钉住右边缘：左边缘被 placement 的 left 钉死，不补这个拖左手柄会变成右边往外长。 */
    @Input() preserveRightEdge = false;

    /** BlockCraft 文档布局像素到屏幕视觉像素的比例；拖拽位移必须先除以它再写入模型。 */
    @Input() geometryScale = 1;

    /** 松手才发固定像素框；`--u` 只是拖动预览，不再持久化。 */
    @Output() scaleCommit = new EventEmitter<FixedResizeCommit>();

    private readonly zone = inject(NgZone);
    private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

    private gesture: {
        pointerId: number; bar: HTMLElement; side: 'left' | 'right';
        startX: number; startU: number; startWidth: number; startHeight: number;
        minU: number; maxU: number;
        geometryScale: number;
        originalUnit: string; originalWidth: string; originalHeight: string; originalMaxWidth: string; originalTransform: string;
        u: number; width: number; height: number; positionDeltaX: number;
    } | null = null;

    private hoverHost: HTMLElement | null = null;
    private readonly onEnter = (): void => this.host.classList.add('visible');
    private readonly onLeave = (): void => { if (!this.gesture) this.host.classList.remove('visible'); };

    ngAfterViewInit(): void {
        // hover 判定挂在卡片自己身上（框架那份挂 container.parentElement，因为它的 container 是内壳；
        // 我们的 target 就是卡片本体）。不挂的话两根蓝条会常驻在卡片旁边。
        this.hoverHost = this.target;
        this.zone.runOutsideAngular(() => {
            this.hoverHost?.addEventListener('mouseenter', this.onEnter);
            this.hoverHost?.addEventListener('mouseleave', this.onLeave);
        });
    }

    /** 监听分散在 target / document / window 三处，销毁必须一处不漏（同 object-drag.plugin 的纪律）。 */
    ngOnDestroy(): void {
        this.finish(false);
        this.hoverHost?.removeEventListener('mouseenter', this.onEnter);
        this.hoverHost?.removeEventListener('mouseleave', this.onLeave);
    }

    onDown(event: PointerEvent, side: 'left' | 'right'): void {
        if (!event.isPrimary || event.button !== 0 || this.gesture) return;
        // 手柄自己吃掉这一下：不 stop 的话 ObjectDragPlugin 的 document 捕获会把它当成"拖动整块"。
        event.preventDefault();
        event.stopPropagation();

        const rect = this.target.getBoundingClientRect();
        const geometryScale = Number.isFinite(this.geometryScale) && this.geometryScale > 0
            ? this.geometryScale
            : 1;
        const startWidth = rect.width / geometryScale;
        const startHeight = rect.height / geometryScale;
        if (startWidth <= 0 || startHeight <= 0) return;
        const startU = Number.parseFloat(getComputedStyle(this.target).getPropertyValue('--u')) || 1;

        // 上限换算成尺度：墨迹宽与 --u 成正比（内部长度全是它的倍数），所以最大 --u = 起手值 × 可用宽/起手宽。
        const maxWidth = this.maxWidthContainer?.clientWidth ?? Number.POSITIVE_INFINITY;
        const maxU = Number.isFinite(maxWidth) ? Math.max(this.minUnit, startU * (maxWidth / startWidth)) : Number.POSITIVE_INFINITY;

        const bar = event.currentTarget as HTMLElement;
        bar.setPointerCapture?.(event.pointerId);
        this.gesture = {
            pointerId: event.pointerId, bar, side,
            startX: event.clientX, startU, startWidth, startHeight,
            minU: this.minUnit, maxU, geometryScale,
            originalUnit: this.target.style.getPropertyValue('--u'),
            originalWidth: this.target.style.width,
            originalHeight: this.target.style.height,
            // 卡片常态有 max-width:100%，而父级宿主要到松手提交后才变宽；不临时解除的话
            // pointermove 写入更大的 width 会被旧宿主夹住，只剩 height 在实时变化。
            originalMaxWidth: releaseFixedResizeWidthClamp(this.target.style),
            originalTransform: this.target.style.transform,
            u: startU,
            width: startWidth,
            height: startHeight,
            positionDeltaX: 0
        };

        // 拖动全程在 zone 外：每帧一次 DOM 直写，走变更检测就是白掉帧。
        this.zone.runOutsideAngular(() => {
            document.addEventListener('pointermove', this.onMove);
            document.addEventListener('pointerup', this.onUp);
            document.addEventListener('pointercancel', this.onCancel);
            document.addEventListener('keydown', this.onKey, true);
            window.addEventListener('blur', this.onBlur);
        });
        this.host.classList.add('visible');
    }

    /** 逐帧：算尺度 → 直写。**不读布局、不包 rAF**——浏览器本就按帧对齐 pointermove，包一层反而排到别的 rAF 之后。 */
    private readonly onMove = (event: PointerEvent): void => {
        const g = this.gesture;
        if (!g || event.pointerId !== g.pointerId) return;
        const preview = calculateFixedResize({
            side: g.side,
            startClientX: g.startX,
            clientX: event.clientX,
            startUnit: g.startU,
            startWidth: g.startWidth,
            startHeight: g.startHeight,
            minUnit: g.minU,
            maxUnit: g.maxU,
            geometryScale: g.geometryScale,
            preserveRightEdge: this.preserveRightEdge
        });
        g.u = preview.unit;
        g.width = preview.width;
        g.height = preview.height;
        g.positionDeltaX = preview.positionDeltaX;
        this.target.style.setProperty('--u', `${g.u}px`);
        this.target.style.width = `${g.width}px`;
        this.target.style.height = `${g.height}px`;
        // 钉右缘：宽度与 --u 等比，所以位移可以算出来，不用读 getBoundingClientRect（读一次就是一次强制布局）。
        this.target.style.transform = g.positionDeltaX !== 0
            ? `translateX(${g.positionDeltaX}px)` : g.originalTransform;
    };

    private readonly onUp = (event: PointerEvent): void => {
        if (event.pointerId === this.gesture?.pointerId) this.finish(true);
    };
    private readonly onCancel = (): void => this.finish(false);
    private readonly onBlur = (): void => this.finish(false);
    /** Esc 取消：还原起手时的行内样式。捕获阶段监听，别让编辑器先把 Esc 消费掉。 */
    private readonly onKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && this.gesture) { event.preventDefault(); this.finish(false); }
    };

    /**
     * 收尾。`commit=false` 时把行内样式还原成起手前的值——**这就是 Esc/失焦能反悔的全部实现**，
     * 少了它拖到一半切个窗口，尺寸就地定死还不进 undo。
     */
    private finish(commit: boolean): void {
        const g = this.gesture;
        if (!g) return;
        this.gesture = null;

        document.removeEventListener('pointermove', this.onMove);
        document.removeEventListener('pointerup', this.onUp);
        document.removeEventListener('pointercancel', this.onCancel);
        document.removeEventListener('keydown', this.onKey, true);
        window.removeEventListener('blur', this.onBlur);
        g.bar.releasePointerCapture?.(g.pointerId);
        this.host.classList.remove('visible');

        // 行内样式一律清掉：提交后由 props → 模板绑定接管，不清的话行内值会盖住后续的 props 变化。
        if (g.originalUnit) this.target.style.setProperty('--u', g.originalUnit);
        else this.target.style.removeProperty('--u');
        this.target.style.width = g.originalWidth;
        this.target.style.height = g.originalHeight;
        restoreFixedResizeWidthClamp(this.target.style, g.originalMaxWidth);
        this.target.style.transform = g.originalTransform;
        if (!commit || g.u === g.startU) return;
        this.zone.run(() => this.scaleCommit.emit({
            width: Math.round(g.width * 1000) / 1000,
            height: Math.round(g.height * 1000) / 1000,
            positionDeltaX: Math.round(g.positionDeltaX * 1000) / 1000
        }));
    }
}
