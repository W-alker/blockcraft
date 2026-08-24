import { defineMaterialStyles } from '../kernel/material-styles.util';
import { DATE_FORMATS } from './date-card-format.util';
import { BannerCardComponent } from './styles/banner.card';
import { CalendarCardComponent } from './styles/calendar.card';
import { FlipCardComponent } from './styles/flip.card';
import { MinibarCardComponent } from './styles/minibar.card';
import { SquareCardComponent } from './styles/square.card';
import { StampCardComponent } from './styles/stamp.card';
import { TicketCardComponent } from './styles/ticket.card';

/**
 * 日期卡片的七种长相。**本文件只做声明**——派生面板选项、查表回落、换档重置尺寸
 * 全在 kernel 的 `defineMaterialStyles` 里（那是物料家族的公共能力，不该每个物料抄一遍）。
 *
 * 加一种长相 = 在 styles/ 下加一个组件 + 这个数组加一项。物料声明、两态组件、配置面板一个字不动。
 * **第一项即默认档。**
 *
 * 每档直接声明**设计内容宽 px**；kernel 再加公共外壳内边距，生成模型里的固定 `width/height`。
 *
 * `defaultAr` 是**实测值**（scratch 的 measure 脚本：真字体文件 + 12 月 × 5 日号 × 7 星期全矩阵，
 * 读 `getBoundingClientRect()`）。改过任何字号或间距都要重量——照设计稿估会同时坑到固定框
 * 与面板宫格，台历栽过一次（估 0.8、实际 1.12）。
 * 无底色的两档还要盯**最坏内容占比 ≤ 87%**：贴死成 100% 会被字体与数据的波动顶出去，
 * 而字体这条我连错两次（真字体是 src/styles.scss:599 的苹方，不是 :67 那个没人消费的 Arial）。
 *
 * ## arByVariant：为什么七档里只有三档有
 *
 * `defaultAr` 是**完整格式档**那一组数（`format` 的 default 就是 Full，两处必须对上）。
 * 格式档藏掉的段落改不改高度，各档答案不同——旧四档是 2026-08-17 实测，新三档是 2026-08-18 实测：
 *
 * | 样式 | 完整 | 不含星期 | 极简 | 为什么 |
 * |---|---|---|---|---|
 * | 台历 | 1.17 | 1.17 | **1.38** | 星期在副行**同一行**内，去掉只变短；年月是独立一行，去掉才变矮 |
 * | 方牌 | 1.00 | 1.00 | 1.00 | `aspect-ratio: 1` 钉死，三档同高 |
 * | 长卷 | 4.10 | 4.10 | 4.10 | 高度由 45px 的大数字定，右列两行加起来也没它高 |
 * | 行签 | 4.31 | **4.76** | 4.76 | 反过来：高度由右列两行定，星期一没就轮到大数字说了算 |
 * | 票根 | 2.96 | 2.96 | 2.96 | 同长卷：高度由 44px 的大数字定，右列两行没它高（2026-08-18 实测） |
 * | 邮戳 | 1.00 | 1.00 | 1.00 | 同方牌：`aspect-ratio: 1` 钉死的正圆，少一行只是更居中 |
 * | 翻页牌 | 1.26 | **1.61** | 1.61 | 星期是**独立一条带子**，整条消失就矮一截；年月那行两档都在，只改写法不改高 |
 *
 * 所以只有台历、行签、翻页牌需要列，且各自只列**与 defaultAr 不同的那几档**——
 * 把三档都写全的话，改 defaultAr 时会漏改这里、两处对不上还不报错。
 *
 * **`defaultAr` 允许两档相同**（方牌与邮戳都是 1.00）：一个方一个圆，长相不同、`defaultWidth` 也不同，
 * 撞的只是那个比例数。早先有条「各档 ar 互不相同」的断言，那是四档时的巧合，不是规矩。
 */
export const DATE_CARD_STYLES = defineMaterialStyles('style', '样式', [
    {
        id: 'calendar', label: '台历', component: CalendarCardComponent,
        defaultWidth: 160, defaultAr: 1.17,
        arByVariant: { [DATE_FORMATS.Min]: 1.38 }
    },
    { id: 'square', label: '方牌', component: SquareCardComponent, defaultWidth: 140, defaultAr: 1.00 },
    {
        id: 'banner', label: '长卷', component: BannerCardComponent,
        defaultWidth: 184, defaultAr: 4.10,
        // 固定尺寸首版误把组件实测的 184px 安全宽收成 152px；旧块按原缩放倍数自动扩回安全框。
        legacyFixedSizes: [
            { width: 160, height: 53.104 },
            { variant: DATE_FORMATS.Full, width: 160, height: 53.104 },
            { variant: DATE_FORMATS.NoWeek, width: 160, height: 53.104 },
            { variant: DATE_FORMATS.Min, width: 160, height: 53.104 }
        ]
    },
    {
        id: 'minibar', label: '行签', component: MinibarCardComponent,
        defaultWidth: 129, defaultAr: 4.31,
        arByVariant: { [DATE_FORMATS.NoWeek]: 4.76, [DATE_FORMATS.Min]: 4.76 },
        // 2026-08-22 的固定尺寸首版误把安全宽 129 收成 102；旧块按原缩放倍数自动扩回安全框。
        legacyFixedSizes: [
            { width: 110, height: 37.738 },
            { variant: DATE_FORMATS.Full, width: 110, height: 37.738 },
            { variant: DATE_FORMATS.NoWeek, width: 110, height: 29.429 },
            { variant: DATE_FORMATS.Min, width: 110, height: 29.429 }
        ]
    },
    { id: 'ticket', label: '票根', component: TicketCardComponent, defaultWidth: 190, defaultAr: 2.96 },
    { id: 'stamp', label: '邮戳', component: StampCardComponent, defaultWidth: 132, defaultAr: 1.00 },
    {
        id: 'flip', label: '翻页牌', component: FlipCardComponent,
        defaultWidth: 136, defaultAr: 1.25,
        arByVariant: { [DATE_FORMATS.NoWeek]: 1.61, [DATE_FORMATS.Min]: 1.61 }
    }
]);
