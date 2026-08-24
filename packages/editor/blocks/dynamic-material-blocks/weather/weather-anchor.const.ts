import { WeatherData, WeatherTone } from '../dynamic-material-data';

/**
 * 时间锚「始终显示当天」的真值哨兵。props.date 取此值 = 活值态；取 ISO 日期串 = 「文档创建时间」档，
 * 记的是建档那天的日期（同步段本地算，零网络，一直都写成功）。
 *
 * ⚠️ 现状：**这两档目前渲染出来是一样的**，都显示当天天气。
 * 因为建档不再烤定格值（见 weather.material.ts 抬头），而渲染侧还没有按 `props.date` 去查那天的
 * 历史天气——`wireWeatherChip` 收的是 `live: true` 写死，压根不读这个键。
 * 要让「文档创建时间」真正兑现，得让渲染侧按 date 分流走 archive 接口（已验证可行，尚未实现）。
 */
export const LIVE_ANCHOR = 'live';

/**
 * 定格下来的天气。故意收成 props 里的**一层**对象而不是摊平成六个平行 prop：
 * 框架 SimpleValue 允许 `Record<string, SimpleBasicType>`（恰好一层，再套就非法），
 * 收成一层以后往里加字段（湿度、风力…）不用再改 props 形状。
 */
export type FrozenWeather = Pick<WeatherData, 'tone' | 'temp' | 'condition' | 'location' | 'high' | 'low'>;

const TONES: readonly WeatherTone[] = ['sunny', 'cloudy', 'rainy', 'snowy', 'stormy', 'foggy'];

/**
 * props.frozen → 定格值；形状不符一律返回 null 交调用方回落现拉。
 * 必须防着：老文档没有这个键、降级建档只写了 city/date、以及人手改坏的快照。
 *
 * **本模块只有读、没有写。** 写入侧（`freezeWeather`：Weather → 可进 props 的扁平记录）
 * 随建档 instantiate 钩子一起删了——现在没有任何代码往 props.frozen 里写。
 * 这个函数留着是为了**读存量文档**：老文档里已经烤进去的定格值仍然优先生效。
 * 哪天要做「渲染期拿到历史天气后写回 props.frozen」（延迟定格），再把写入侧加回来。
 */
export function readFrozenWeather(raw: unknown): FrozenWeather | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const temp = o['temp'];
    const condition = o['condition'];
    if (typeof temp !== 'number' || typeof condition !== 'string') return null;
    return {
        tone: TONES.includes(o['tone'] as WeatherTone) ? o['tone'] as WeatherTone : 'sunny',
        temp,
        condition,
        location: typeof o['location'] === 'string' ? o['location'] : '',
        high: typeof o['high'] === 'number' ? o['high'] : temp,
        low: typeof o['low'] === 'number' ? o['low'] : temp
    };
}
