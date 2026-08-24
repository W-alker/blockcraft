import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { BaseBlockComponent, NoEditableBlockNative } from '../../../framework';
import type { SimpleBasicType } from '../../../global';
import type { BlockObjectSizeProps } from '../../../framework';
import { WeatherMarkComponent } from './weather-mark.component';
import { readFrozenWeather } from './weather-anchor.const';
import { wireWeatherChip } from './weather-chip.util';
import {
    WEATHER_CHIP_BOX_STYLE,
    WEATHER_CHIP_COL_STYLE,
    WEATHER_CHIP_MARK_STYLE,
    WEATHER_CHIP_SUB_STYLE,
    WEATHER_CHIP_TEMP_STYLE,
    readWeatherLook
} from './weather-look.util';
import type { WeatherLook } from './weather-look.util';
import { ObjectBlockComponent } from '../kernel/object-block.component';
import { ScaleResizerComponent } from '../kernel/scale-resizer.component';

/**
 * props 两键：date（时间锚真值：ISO 串=定格 / 'live'=活值）、frozen（定格天气，一层对象；地点在 frozen.location）。
 * 必须写成内联匿名对象类型、不许提成具名 interface——具名 interface 拿不到隐式索引签名，
 * 过不了框架 IBlockProps 的 `[key: string]: SimpleValue`（这坑只在 ng-packagr 工具链下才炸）。
 *
 * **浮于文字的持久位这里一个字都不声明**：blockcraft 0.5.0 起 `position`（`{x,y}`）与
 * `placementLayer`（省略=over）已是框架 `IBlockProps` 的自有字段，`BlockObjectSizeProps`
 * 继承它、我们又 `&` 在它上面，数据位天生就有。排版态（relative/absolute）更是**彻底离开了 props**——
 * 由结构决定（父级是不是 placement-layout / object-group），要读就读 `placementPosition`
 * 或 `doc.placement.getState()`。能力声明（`metadata.placement.modes`）在 block-material.factory。
 *
 * 0.4.4 时代这里确实得自补一个 `placement?: BlockPositionState`——那个类型 0.5.0 已不再导出，
 * 三个物料一起编译不过（TS2724），连带 packages/docs 十几个测试套件整套加载失败。
 * 别再把框架自有的字段在物料侧抄一遍：抄一次就多一处会随框架版本烂掉的声明。
 */
export interface WeatherModel extends NoEditableBlockNative {
    flavour: 'weather';
    props: BlockObjectSizeProps & {
        /** @deprecated 仅用于打开旧模板时迁移；新数据以 `width/height` 为权威几何。 */
        u?: number;
        date?: string;
        frozen?: Record<string, SimpleBasicType>;
        /**
         * 文字颜色 / 边框长相（值形如 `2px dashed`）/ 边框色，全是 displayConfigs 的键。
         * 桥不碰、缺席回落默认（近黑字、无框），读法收在 `readWeatherLook` 一处。
         */
        fg?: string;
        bw?: string;
        bc?: string;
    };
}

/**
 * 触发重画的 props 键。**两态共用这一份**——漏一个键就是「改了配置画布不动」，
 * 多一个（尤其 position / width / height）就是「拖拽或缩放途中反复重建」。三条显示配置两态同源，
 * date/frozen 不进来：它们由 wireWeatherChip 的闭包现读，不走 repaint 这条线。
 */
export const WEATHER_WATCHED_PROPS = ['fg', 'bw', 'bc', 'date', 'frozen'] as const;

/**
 * chip 模板：编辑态与渲染态共用一份（编辑态 import 本常量）。
 * 必须提成常量而不是靠继承——@Component 的 template 元数据不随类继承传递。
 *
 * **尺寸模型：模型固定 `width/height`，渲染内部用 `--u` 等比绘制。**
 * ① `.tpl-weather-chip` 是唯一带 `--u` 的元素；基类按固定宽度相对默认 160px 推导它，
 *    resizer 拖动时同步预览宽高与 `--u`，松手只提交固定像素框；
 * ② 内部长度一律 `calc(设计px * var(--u, 1px))`：图标 33.6、间距 8、温度 16、地点 11.04，
 *    数字直接就是设计稿（设计宽 160）上的值，不用换算；
 * ③ 盒子占满固定框，选中、组合、对齐和虚拟估算都读取同一组模型宽高。
 *
 * 为什么不是 cqw（换掉的原因）：`container-type: inline-size` 的定义是「算自己宽度时当我没有内容」，
 * 所以带容器查询的盒子**永远贴不住内容**（实测 fit-content/auto 直接塌成 0×0，min-width 也撑不开）。
 * 墨迹恒为框宽的一个固定比例（天气实测 62%），差值就是选中时看到的那片空白，且与缩放无关。
 *
 * 为什么不是 CSS `zoom`：拖动中框架的 `block-resizer` 不发逐帧回调，内部绘制会慢一拍。
 * 本模型由手柄在同一次 pointermove 里直写宽高与 `--u`
 * （实测跟手 0.04px；换成 ResizeObserver 转译是 6.04px，慢整整一帧）。
 *
 * 为什么不用 em：日期卡有几处在同一个元素上既设字号又设内边距，em 的基准是该元素自己的字号，
 * 一复合就错；px 变量在任何嵌套层级都是同一个值。
 *
 * **外壳统一 4px 内边距（乘 --u）**：物料原本零内边距，贴合内容之后一切都压在字上——
 * 选中描边（2px + 1px offset）、边框配置那圈线、缩放手柄，三样各压一次。
 *
 * 三条显示配置的落法（读法收在 readWeatherLook，两态共用）：
 * - 文字颜色 `--wt-fg`：温度吃原色；地点行不再写死 #8a919f，改从 fg 兑 52% 透明——
 *   52% 正是让默认近黑兑出来 ≈ 原来那个灰（实测 #8a8c8f vs #8a919f，肉眼无差），
 *   而作者换任何颜色层级都自动成立（同台历第三行「压 alpha 不换灰色」的口径）。
 * - 边框 `--wt-bw/--wt-bs/--wt-bc`：**粗细恒绝对 px、不乘 --u**（边框是「一条线」，
 *   跟着 chip 放大会变成黑杠，全家族同一条规矩）；圆角乘 --u（那是形状，该跟着缩）。
 *   画在外壳上而不是另包一层：外壳那 4px 内边距正好是框与墨迹之间的气口。
 */
export const WEATHER_CHIP_TEMPLATE = `
    <span class="tpl-weather-chip" #boxEl contenteditable="false"
          [style.--u]="scaleUnitCss"
          [style.--wt-fg]="look().fg" [style.--wt-bw]="look().bw"
          [style.--wt-bs]="look().bs" [style.--wt-bc]="look().bc"
          style="${WEATHER_CHIP_BOX_STYLE}">
        <weather-mark [tone]="chip.tone()" style="${WEATHER_CHIP_MARK_STYLE}"></weather-mark>
        <span style="${WEATHER_CHIP_COL_STYLE}">
            <span style="${WEATHER_CHIP_TEMP_STYLE}">{{ chip.view()?.temp ?? '--' }}°</span>
            <span style="${WEATHER_CHIP_SUB_STYLE}">@switch (chip.status()) {
                @case ('loading') { 获取天气中… }
                @case ('error') { 天气获取失败 }
                @default { {{ chip.location() }} · {{ chip.view()?.condition ?? '天气' }} }
            }</span>
        </span>
        @if (!isReadonly) {
            <mtl-scale-resizer [target]="boxEl" [maxWidthContainer]="resizeMaxWidth"
                               [geometryScale]="viewGeometryScale"
                               [preserveRightEdge]="isFloating"
                               (scaleCommit)="onScaled($event)"></mtl-scale-resizer>
        }
    </span>
`;

declare global {
    namespace BlockCraft {
        interface IBlockComponents { weather: BaseBlockComponent<WeatherModel> }
        interface IBlockCreateParameters { weather: [] }
    }
}

/**
 * 渲染态（文档侧）：定格类物料——建档一刻把当时的天气烤进 props.frozen，此后零网络、永不变。
 * 只有时间锚配成「始终显示当天」（props.date === 'live'）或建档时降级没拿到值，才回落现拉。
 */
@Component({
    selector: 'div.weather-block',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [WeatherMarkComponent, ScaleResizerComponent],
    template: WEATHER_CHIP_TEMPLATE
})
export class WeatherBlockComponent extends ObjectBlockComponent<WeatherModel> {
    // live: true —— 文档态没有定格值就该现拉（时间锚配了「始终显示当天」，或建档没写定格值）
    protected readonly chip = wireWeatherChip({
        frozen: () => readFrozenWeather(this.presentationProps?.frozen),
        live: () => !this.isDraftProjection
    });

    // 初值只是占位：字段初始化那刻 this.props 还没就绪，真值在基类 ngOnInit 的首次 repaint 里补。
    protected readonly look = signal<WeatherLook>(readWeatherLook(null));

    /** 监听键与编辑态同源（见 WEATHER_WATCHED_PROPS）；订阅与按键过滤全在基类。 */
    protected override get watchedProps(): readonly string[] { return WEATHER_WATCHED_PROPS; }

    /** 三条显示配置装在一个 look signal 里（同日期卡的理由：两态接线一模一样，加配置两处都不用改）。 */
    protected override repaint(): void {
        this.look.set(readWeatherLook(this.presentationProps));
    }

    /**
     * 块重新挂载时重拉一次。**这是「一次失败=永久失败」的解药**——
     * 早先取数只有 afterNextRender 那一次机会，撞上超时就永远显示占位：
     * 缓存只在成功时写，失败什么都不留，也没有任何人再去问第二次。
     *
     * 对齐 kr-list / meeting-card / todo / task-card 四个块的既有做法（它们全都覆写了这个钩子）。
     * `chip.reload` 自带幂等闸（已有值直接返回），反复挂载不会反复打接口。
     */
    protected override afterReattach(): void {
        super.afterReattach();
        this.chip.reload();
    }
}
