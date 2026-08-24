import { WeatherTone } from '../dynamic-material-data';

/**
 * 六种天气基调的图标素材。**唯一消费方是 `weather-mark.component`**，它按 `tone` 查这张表拿一段 SVG 塞进 DOM。
 *
 * ## 为什么是「代码里的常量表」而不是「数据库里的配置表」
 *
 * 快照（`IBlockSnapshot[]`）里存的一直只有 `props.frozen.tone` 这个字符串，本文件一个字节都不进快照。
 * 换句话说 `tone` 是**枚举**不是**外键**：查表同步完成、永不 miss，
 * 且 `readFrozenWeather` 已经兜住了脏值（不在枚举内一律回落 sunny）。
 *
 * 反面：把 SVG 存进数据库、快照存图标 id 指向记录，会同时坏三件事——
 * 每个天气块渲染多一次查询；老文档指向的记录可能已被删；导出/离线场景直接空白。
 *
 * ## 为什么不引图标库
 *
 * ① 就 6 个，库的收益是零；② docs 是可发布包，走 `assets/` 意味着宿主必须拷资源，
 * 破坏物料家族「自带样式、零装配」的口径（宿主的 `MatIconRegistry` 在 src/app，packages 够不着，
 * 依赖只能 `src → packages` 单向走）；③ `@cses/ui` 那 1723 个图标里天气相关的只有一个「太阳」
 * （主题切换用的）和三个云存储隐喻的「云」，雨雪雷雾一个都没有。
 *
 * ## 为什么固定配色而不是 currentColor
 *
 * 天气是**外部客观事实**的展示，不是文档的装饰元素——正文改成红色时太阳跟着变红是错的。
 * 且颜色是这里最强的区分信号：32px 下雨/雪/雷雨都是「同一朵云 + 底下几个小东西」，
 * 靠形状分不开，靠蓝雨滴 / 浅蓝雪点 / 黄闪电一眼就分得开。
 * 所以样式档的调色只绑文字（温度 + 地点副行），图标不动。
 *
 * 深色底样式档也不用另备一套：图标是自封闭的形状，底板由外层 chip 提供。
 *
 * ## 维护须知
 *
 * - **cloudy / rainy / snowy / stormy / foggy 五个共用一条一模一样的云 path**
 *   （`M6.2 16.5a3.6 3.6 0 0 1-.3-7.2 …`，实测 bbox 五个都是 x=2.447 y=5.814 w=18.09 h=10.733）。
 *   这是切换天气时图标不跳的**唯一**原因，改云的形状必须五个一起改。
 *   ⚠️ 别拿「各图标 bbox 中心对齐到 viewBox 正中」去做居中修正——那会按各自的附加元素
 *   （cloudy 的太阳在上、其余的降水在下）把云推到不同高度，恰好破坏上面这条对齐。
 * - 各 `<defs>` 里的渐变 id 是固定串，同一文档多个天气块会产生重复 id。
 *   已实测无害：每段 SVG 自带一份完全相同的 defs，删掉先出现的那个，后面的照常渲染。
 *   （所以也**不要**为了消重复 id 去压平渐变——chip 可被拖大，大尺寸下渐变是看得出的。）
 */
export const WEATHER_ICONS: Record<WeatherTone, string> = {
    sunny: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="4.2" fill="#f5a524"/>
  <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" fill="none" stroke="#f5a524" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

    cloudy: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cloudy-cloud" x1="12" y1="5" x2="12" y2="17" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".72" stop-color="#f7f7f8"/>
      <stop offset="1" stop-color="#e5e6ea"/>
    </linearGradient>
  </defs>
  <circle cx="16.4" cy="7.2" r="3.4" fill="#f5a524"/>
  <path d="M16.4 1v1.5M21.2 7.2h1.5M20.5 3.1l1.1-1.1M20.5 11.3l1.1 1.1" fill="none" stroke="#f5a524" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M6.2 16.5a3.6 3.6 0 0 1-.3-7.2 5.2 5.2 0 0 1 10.1 1.4 3.1 3.1 0 1 1 .9 5.8Z" fill="url(#cloudy-cloud)" stroke="#707b9e" stroke-opacity=".1" stroke-width=".4" stroke-linejoin="round"/>
</svg>`,

    rainy: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rainy-cloud" x1="12" y1="5" x2="12" y2="17" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".72" stop-color="#f7f7f8"/>
      <stop offset="1" stop-color="#e5e6ea"/>
    </linearGradient>
    <linearGradient id="rainy-drops" x1="12" y1="18" x2="12" y2="23" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#bcd8ff"/>
      <stop offset="1" stop-color="#6aa3ff"/>
    </linearGradient>
  </defs>
  <path d="M6.2 16.5a3.6 3.6 0 0 1-.3-7.2 5.2 5.2 0 0 1 10.1 1.4 3.1 3.1 0 1 1 .9 5.8Z" fill="url(#rainy-cloud)" stroke="#707b9e" stroke-opacity=".1" stroke-width=".4" stroke-linejoin="round"/>
  <path d="M8 18C8 18 6.9 19.6 6.9 20.4a1.1 1.1 0 0 0 2.2 0C9.1 19.6 8 18 8 18ZM12 18.8s-1.1 1.6-1.1 2.4a1.1 1.1 0 0 0 2.2 0c0-.8-1.1-2.4-1.1-2.4ZM16 18s-1.1 1.6-1.1 2.4a1.1 1.1 0 0 0 2.2 0C17.1 19.6 16 18 16 18Z" fill="url(#rainy-drops)"/>
</svg>`,

    snowy: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="snowy-cloud" x1="12" y1="5" x2="12" y2="17" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".72" stop-color="#f7f7f8"/>
      <stop offset="1" stop-color="#e5e6ea"/>
    </linearGradient>
    <linearGradient id="snowy-snow" x1="12" y1="18" x2="12" y2="23" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#bcd8ff"/>
      <stop offset="1" stop-color="#6aa3ff"/>
    </linearGradient>
  </defs>
  <path d="M6.2 16.5a3.6 3.6 0 0 1-.3-7.2 5.2 5.2 0 0 1 10.1 1.4 3.1 3.1 0 1 1 .9 5.8Z" fill="url(#snowy-cloud)" stroke="#707b9e" stroke-opacity=".1" stroke-width=".4" stroke-linejoin="round"/>
  <path d="M8 18.1v3M6.7 18.85l2.6 1.5M6.7 20.35l2.6-1.5M12 19.7v3M10.7 20.45l2.6 1.5M10.7 21.95l2.6-1.5M16 18.1v3M14.7 18.85l2.6 1.5M14.7 20.35l2.6-1.5" fill="none" stroke="url(#snowy-snow)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

    stormy: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="stormy-cloud" x1="12" y1="5" x2="12" y2="17" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".72" stop-color="#f7f7f8"/>
      <stop offset="1" stop-color="#e5e6ea"/>
    </linearGradient>
    <linearGradient id="stormy-drops" x1="12" y1="18" x2="12" y2="23" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#bcd8ff"/>
      <stop offset="1" stop-color="#6aa3ff"/>
    </linearGradient>
  </defs>
  <path d="M6.2 16.5a3.6 3.6 0 0 1-.3-7.2 5.2 5.2 0 0 1 10.1 1.4 3.1 3.1 0 1 1 .9 5.8Z" fill="url(#stormy-cloud)" stroke="#707b9e" stroke-opacity=".1" stroke-width=".4" stroke-linejoin="round"/>
  <path d="M11.8 17.3 9.6 21.1H12l-.7 2.9 3.8-4.7h-2.5l1.4-2Z" fill="#f5a524"/>
  <path d="M7.3 18.3s-.9 1.3-.9 1.9a.9.9 0 0 0 1.8 0c0-.6-.9-1.9-.9-1.9ZM17 18.3s-.9 1.3-.9 1.9a.9.9 0 0 0 1.8 0c0-.6-.9-1.9-.9-1.9Z" fill="url(#stormy-drops)"/>
</svg>`,

    foggy: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="foggy-cloud" x1="12" y1="5" x2="12" y2="17" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".72" stop-color="#f7f7f8"/>
      <stop offset="1" stop-color="#e5e6ea"/>
    </linearGradient>
  </defs>
  <path d="M6.2 16.5a3.6 3.6 0 0 1-.3-7.2 5.2 5.2 0 0 1 10.1 1.4 3.1 3.1 0 1 1 .9 5.8Z" fill="url(#foggy-cloud)" stroke="#707b9e" stroke-opacity=".1" stroke-width=".4" stroke-linejoin="round"/>
  <path d="M4.5 18.5h11M8 20.8h11.5M5 23h11" fill="none" stroke="#8f97ad" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
};

/** 兜底基调。`tone` 理论上已被 `readFrozenWeather` 收敛过，这里再兜一层防着直接构造的调用方。 */
export const FALLBACK_TONE: WeatherTone = 'sunny';
