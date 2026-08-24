import { ChangeDetectorRef, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DYNAMIC_MATERIAL_DATA, WeatherData, WeatherTone } from '../dynamic-material-data';
import { FrozenWeather } from './weather-anchor.const';

/**
 * chip 的四种状态。**必须分开表达**——早先「加载中 / 取数失败 / 编辑态占位」三件事
 * 全渲染成同一个 `--°`，线上表现为「天气经常不显示」，而谁也看不出是还没回来、
 * 还是失败了、还是本就不该有值。对齐 kr-list 块的 `isLoading()/hasError()` 分支口径。
 */
export type WeatherChipStatus =
    /** 本就不取数（编辑态占位、未 provide TEMPLATE_DATA） */
    | 'idle'
    /** 正在拉 */
    | 'loading'
    /** 有值可画（定格值或现拉值） */
    | 'ready'
    /** 拉过且失败，等 afterReattach 重试 */
    | 'error';

/** chip 模板要用的读取口。两态组件各接一行，模板只认这一份契约。 */
export interface WeatherChip {
    /** 生效天气：定格值优先，没有才用现拉值；都没有为 null（模板画占位）。 */
    view: () => FrozenWeather | WeatherData | null;
    tone: () => WeatherTone;
    location: () => string;
    status: () => WeatherChipStatus;
    /**
     * 重新拉一次。挂给块的 `afterReattach()`——**这是「一次失败=永久失败」的解药**：
     * 早先只在 afterNextRender 拉一次，那一次撞上超时之后就再没有第二次机会。
     * 已有值时是空操作，不会重复打接口。
     */
    reload: () => void;
}

/**
 * 天气 chip 的数据接线。**只管数据，尺寸一概不管**——
 * 缩放全部交给 CSS：外层 box 是容器查询上下文（`container-type: inline-size`），
 * chip 内部尺寸一律 `cqw`，box 一变宽内部自动等比跟随。
 *
 * 为什么不能用「定死 px + zoom」：zoom 得用 JS 算，而 resizer 拖动中**直接写 container 的行内宽度、
 * 不发逐帧回调**（`widthChange` 只在松手时发一次，见 resize-container.ts:277/320）。
 * 于是 JS 永远慢一拍，表现为「拖动时外框在变、里面纹丝不动」。图片块就是纯 CSS（`width:100%`）才天生跟手。
 *
 * 必须在注入上下文调用（字段初始化器）。TEMPLATE_DATA 可选注入：
 * 导出/版本回放等未 provide 的 surface 里 chip 画占位而非炸。
 */
export function wireWeatherChip(src: {
    frozen: () => FrozenWeather | null;
    /**
     * 要不要现拉实时天气。**必须与 frozen 分开表达**——两者不是一回事：
     * 渲染态没有定格值时该现拉（活值档/建档降级），编辑态没有定格值时**不该**现拉。
     * 早先用「frozen 为空」一个条件兼表两意，导致模板里直接画出作者当地的真实天气
     * （同「模板态即使已带真值也不画真人」那条口径，模板里也不该出现某地的天气）。
     */
    live: () => boolean;
}): WeatherChip {
    const live = signal<WeatherData | null>(null);
    const status = signal<WeatherChipStatus>('idle');
    const data = inject(DYNAMIC_MATERIAL_DATA, { optional: true });
    const cdr = inject(ChangeDetectorRef);
    const destroyRef = inject(DestroyRef);

    const load = (): void => {
        if (!data || !src.live()) return;       // 编辑态 / 未 provide：恒占位，一次网络都不发
        if (src.frozen() || live()) return;   // 已有值：不重复打接口（reload 的幂等闸）
        status.set('loading');
        let got = false;
        data.weather.get().pipe(takeUntilDestroyed(destroyRef)).subscribe({
            // OnPush 下这些回调在变更检测之外落地，不 markForCheck 就渲染不出来
            next: w => { got = true; live.set(w); status.set('ready'); cdr.markForCheck(); },
            /**
             * 失败**不走 error 回调**：取数出错在 `CsesTemplateData.weather.get` 那层
             * 已被 catchError 吞成 EMPTY（口径是「不发值」而不是「编个晴天」）。
             * 所以失败的唯一信号是「流正常结束了，却一个值都没来过」。
             */
            complete: () => { if (!got) { status.set('error'); cdr.markForCheck(); } }
        });
    };

    // 推到 afterNextRender：①字段初始化那刻 this.props 还没就绪，读不到定格值；
    // ②定格态本就一次网络都不该发——判定必须晚于 props 就绪。
    afterNextRender(() => load());

    const view = (): FrozenWeather | WeatherData | null => src.frozen() ?? live();
    return {
        view,
        // 地名一律来自数据源：定格态读烤进去的 frozen.location，活值态读现拉到的定位
        // 无值时给「城市」这种形状占位，而不是「当前位置」——占位要看得出将来长什么样、占多宽
        location: () => view()?.location || '城市',
        tone: () => view()?.tone ?? 'sunny',
        // 定格态一挂载就有值、根本不进 load，status 信号还停在 idle——所以有值一律算 ready
        status: () => (view() ? 'ready' : status()),
        reload: load
    };
}
