import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { BaseBlockComponent, NoEditableBlockNative } from '../../../framework';
import type { SimpleBasicType } from '../../../global';
import type { BlockObjectSizeProps } from '../../../framework';
import { LIVE_ANCHOR, readFrozenWeather } from './weather-anchor.const';
import {
    DOC_WEATHER_SERVICE_TOKEN,
    type DocWeatherData,
    type DocWeatherQuery
} from '../../../framework';
import { wireWeatherChip } from './weather-chip.util';
import {readWeatherLook} from './weather-look.util';
import type {WeatherLook} from './weather-look.util';
import {WeatherCardComponent} from './weather-card.component';
import {WEATHER_STYLES} from './weather.styles';
import type {WeatherPresentationProps} from './weather-presentation';
import { ObjectBlockComponent } from '../kernel/object-block.component';
import { ScaleResizerComponent } from '../kernel/scale-resizer.component';

/**
 * 数据 props：date（时间锚真值：ISO 串=定格 / 'live'=活值）、frozen（定格天气，一层对象；地点在 frozen.location）。
 * 外观字段由 WeatherPresentationProps 定义，与取数配置分离。
 * 必须写成内联匿名对象类型、不许提成具名 interface——具名 interface 拿不到隐式索引签名，
 * 过不了框架 IBlockProps 的 `[key: string]: SimpleValue`（这坑只在 ng-packagr 工具链下才炸）。
 *
 * **浮于文字的持久位这里一个字都不声明**：blockcraft 0.5.0 起 `position`（`"x y"`）与
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
    props: BlockObjectSizeProps & WeatherPresentationProps & {
        /** @deprecated 仅用于打开旧模板时迁移；新数据以 `width/height` 为权威几何。 */
        u?: number;
        date?: string;
        frozen?: Record<string, SimpleBasicType>;
    };
}

/**
 * 触发重画的 props 键。**两态共用这一份**——漏一个键就是「改了配置画布不动」，
 * 几何字段 position / width / height 由对象基类处理；date/frozen 变化通过幂等 reload 更新天气。
 */
export const WEATHER_WATCHED_PROPS = ['style', 'palette', 'fg', 'accent', 'line', 'bg', 'bw', 'bc', 'iconMode', 'range', 'date', 'frozen'] as const;

/** 外壳保持选区与缩放契约；展示组件独立于取数。所有尺寸仍由固定框和 --u 等比绘制。 */
export const WEATHER_CHIP_TEMPLATE = `
    <span class="tpl-weather-chip" #boxEl contenteditable="false" data-bc-selection-interaction-frame
          [attr.data-style]="look().style" [style.--u]="scaleUnitCss"
          [style.--wt-fg]="look().fg" [style.--wt-accent]="look().accent" [style.--wt-line]="look().line"
          [style.--wt-bg]="look().bg" [style.color]="look().fg"
          [style.border-width]="look().bw" [style.border-style]="look().bs" [style.border-color]="look().bc"
          style="position:relative;display:block;width:100%;height:100%;box-sizing:border-box;padding:calc(4 * var(--u,1px));border-radius:calc(6 * var(--u,1px));max-width:100%;line-height:1.2;">
        <bc-weather-card [layout]="look().style" [weather]="chip.view()" [status]="chip.status()"
                         [showRange]="look().showRange" [iconMode]="look().iconMode" />
        @if (!isReadonly) {
            <mtl-scale-resizer [target]="boxEl" [maxWidthContainer]="resizeMaxWidth"
                               [geometryScale]="viewGeometryScale" [preserveRightEdge]="isFloating"
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
 * 渲染态（文档侧）：ISO 日期档首次挂载后经 DocWeatherService 查当天历史天气，成功后延迟写入
 * props.frozen；后续只读定格值。`props.date === 'live'` 始终请求实时天气且永不写 frozen。
 */
@Component({
    selector: 'div.weather-block',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [WeatherCardComponent, ScaleResizerComponent],
    template: WEATHER_CHIP_TEMPLATE
})
export class WeatherBlockComponent extends ObjectBlockComponent<WeatherModel> {
    protected readonly chip = wireWeatherChip({
        frozen: () => this.weatherRequest()?.date
            ? readFrozenWeather(this.presentationProps?.frozen)
            : null,
        enabled: () => !this.isDraftProjection,
        request: () => this.weatherRequest(),
        query: (request, signal) => this.doc.injector
            .get(DOC_WEATHER_SERVICE_TOKEN)
            .query(request, signal),
        freeze: (weather, request) => this.freezeWeather(weather, request)
    });

    // 初值只是占位：字段初始化那刻 this.props 还没就绪，真值在基类 ngOnInit 的首次 repaint 里补。
    protected readonly look = signal<WeatherLook>(readWeatherLook(null));

    /** 监听键与编辑态同源（见 WEATHER_WATCHED_PROPS）；订阅与按键过滤全在基类。 */
    protected override get styles() { return WEATHER_STYLES; }

    protected override get watchedProps(): readonly string[] { return WEATHER_WATCHED_PROPS; }

    /** 外观统一投影到 look；样式尺寸由对象基类管理。 */
    protected override repaint(): void {
        const look = readWeatherLook(this.presentationProps);
        this.styleDef.set(WEATHER_STYLES.resolve(look.style));
        this.look.set(look);
        this.chip.reload();
    }

    private weatherRequest(): DocWeatherQuery | undefined {
        const date = this.presentationProps?.date;
        return typeof date === 'string' && date !== LIVE_ANCHOR && /^\d{4}-\d{2}-\d{2}$/.test(date)
            ? { date }
            : undefined;
    }

    private freezeWeather(weather: DocWeatherData, request: DocWeatherQuery): void {
        if (!request.date || this._isGone() || this.doc.readonlyManager.isReadonly(this)) return;
        if (this.weatherRequest()?.date !== request.date || readFrozenWeather(this.presentationProps?.frozen)) return;
        this.setInitProps({ frozen: { ...weather } });
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
