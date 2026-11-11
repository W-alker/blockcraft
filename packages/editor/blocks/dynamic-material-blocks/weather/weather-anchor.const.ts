import type { DocWeatherData, DocWeatherTone } from '../../../framework';

/**
 * 时间锚「始终显示当天」的真值哨兵。props.date 取此值 = 活值态；取 ISO 日期串 = 「文档创建时间」档，
 * 记的是建档那天的日期（同步段本地算，零网络，一直都写成功）。
 *
 * 正常文档挂载后按此键分流：live 只读实时值且不持久化；ISO 日期交给宿主查询对应日期，
 * 成功后由天气块通过无 Undo 的 Yjs 初始化事务写入 props.frozen。
 */
export const LIVE_ANCHOR = 'live';

/**
 * 定格下来的天气。故意收成 props 里的**一层**对象而不是摊平成六个平行 prop：
 * 框架 SimpleValue 允许 `Record<string, SimpleBasicType>`（恰好一层，再套就非法），
 * 收成一层以后往里加字段（湿度、风力…）不用再改 props 形状。
 */
export type FrozenWeather = Pick<DocWeatherData, 'tone' | 'temp' | 'condition' | 'location' | 'high' | 'low'>;

const TONES: readonly DocWeatherTone[] = ['sunny', 'cloudy', 'rainy', 'snowy', 'stormy', 'foggy'];

/**
 * props.frozen → 定格值；形状不符一律返回 null 交调用方回落现拉。
 * 必须防着：老文档没有这个键、降级建档只写了 city/date、以及人手改坏的快照。
 *
 * 写入侧在 WeatherBlockComponent：只有 ISO 日期档、块仍存在且当前可写时才延迟定格；
 * live 档永远不写 frozen。老文档里已经烤进去的定格值仍然优先生效。
 */
export function readFrozenWeather(raw: unknown): FrozenWeather | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const temp = o['temp'];
    const condition = o['condition'];
    if (typeof temp !== 'number' || typeof condition !== 'string') return null;
    return {
        tone: TONES.includes(o['tone'] as DocWeatherTone) ? o['tone'] as DocWeatherTone : 'sunny',
        temp,
        condition,
        location: typeof o['location'] === 'string' ? o['location'] : '',
        high: typeof o['high'] === 'number' ? o['high'] : temp,
        low: typeof o['low'] === 'number' ? o['low'] : temp
    };
}
