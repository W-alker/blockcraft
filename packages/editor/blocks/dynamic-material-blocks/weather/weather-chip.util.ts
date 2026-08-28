import { ChangeDetectorRef, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import type { DocWeatherData, DocWeatherQuery, DocWeatherTone } from '../../../framework';
import { FrozenWeather } from './weather-anchor.const';

/**
 * chip 的四种状态。**必须分开表达**——早先「加载中 / 取数失败 / 编辑态占位」三件事
 * 全渲染成同一个 `--°`，线上表现为「天气经常不显示」，而谁也看不出是还没回来、
 * 还是失败了、还是本就不该有值。对齐 kr-list 块的 `isLoading()/hasError()` 分支口径。
 */
export type WeatherChipStatus =
    /** 本就不取数（模板编辑态占位） */
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
    view: () => FrozenWeather | DocWeatherData | null;
    tone: () => DocWeatherTone;
    location: () => string;
    status: () => WeatherChipStatus;
    /**
     * 重新拉一次。挂给块的 `afterReattach()`——**这是「一次失败=永久失败」的解药**：
     * 早先只在 afterNextRender 拉一次，那一次撞上超时之后就再没有第二次机会。
     * 已有值时是空操作，不会重复打接口。
     */
    reload: () => void;
}

export interface WeatherChipSource {
    frozen: () => FrozenWeather | null;
    /** 编辑态返回 false；正常文档返回 true。 */
    enabled: () => boolean;
    /** undefined 表示实时天气；ISO 日期表示文档创建日天气。 */
    request: () => DocWeatherQuery | undefined;
    query: (request: DocWeatherQuery | undefined, signal: AbortSignal) => Promise<DocWeatherData>;
    /** 固定日期取数成功后的持久化钩子；实时档不会调用。 */
    freeze?: (weather: DocWeatherData, request: DocWeatherQuery) => void;
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
 * 必须在注入上下文调用（字段初始化器）。宿主查询由调用组件从 Doc injector 取服务后传入。
 */
export function wireWeatherChip(src: WeatherChipSource): WeatherChip {
    const resolved = signal<{ key: string; weather: DocWeatherData } | null>(null);
    const status = signal<{ key: string; value: WeatherChipStatus }>({ key: '', value: 'idle' });
    const cdr = inject(ChangeDetectorRef);
    const destroyRef = inject(DestroyRef);
    let pendingKey: string | null = null;
    let abort: AbortController | null = null;

    const requestState = (): { key: string; request?: DocWeatherQuery } => {
        const request = src.request();
        return request?.date ? { key: `date:${request.date}`, request } : { key: 'live' };
    };

    const load = (): void => {
        if (!src.enabled()) return;   // 编辑态：恒占位，一次网络都不发
        const state = requestState();
        if (src.frozen() || resolved()?.key === state.key || pendingKey === state.key) return;
        abort?.abort();
        const controller = new AbortController();
        abort = controller;
        pendingKey = state.key;
        status.set({ key: state.key, value: 'loading' });
        Promise.resolve().then(() => src.query(state.request, controller.signal)).then(weather => {
                if (requestState().key !== state.key || !src.enabled()) return;
                resolved.set({ key: state.key, weather });
                status.set({ key: state.key, value: 'ready' });
                if (state.request?.date) src.freeze?.(weather, state.request);
                cdr.markForCheck();
            })
            .catch(() => {
                if (requestState().key !== state.key || controller.signal.aborted) return;
                status.set({ key: state.key, value: 'error' });
                cdr.markForCheck();
            })
            .finally(() => {
                if (pendingKey === state.key) pendingKey = null;
                if (abort === controller) abort = null;
            });
    };

    destroyRef.onDestroy(() => abort?.abort());

    // 推到 afterNextRender：①字段初始化那刻 this.props 还没就绪，读不到定格值；
    // ②定格态本就一次网络都不该发——判定必须晚于 props 就绪。
    afterNextRender(() => load());

    const liveView = (): DocWeatherData | null => {
        const state = requestState();
        const value = resolved();
        return value?.key === state.key ? value.weather : null;
    };
    const view = (): FrozenWeather | DocWeatherData | null => src.frozen() ?? liveView();
    return {
        view,
        // 地名一律来自数据源：定格态读烤进去的 frozen.location，活值态读现拉到的定位
        // 无值时给「城市」这种形状占位，而不是「当前位置」——占位要看得出将来长什么样、占多宽
        location: () => view()?.location || '城市',
        tone: () => view()?.tone ?? 'sunny',
        // 定格态一挂载就有值、根本不进 load，status 信号还停在 idle——所以有值一律算 ready
        status: () => {
            if (view()) return 'ready';
            const state = status();
            return state.key === requestState().key ? state.value : 'idle';
        },
        reload: load
    };
}
