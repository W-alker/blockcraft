import { defineMaterialStyles } from '../kernel/material-styles.util';
import { ColumnCardComponent } from './styles/column.card';
import { RowCardComponent } from './styles/row.card';
import { RowPinyinCardComponent } from './styles/row-pinyin.card';

/**
 * 人员卡片的三种格式。**本文件只做声明**——派生面板选项、查表回落、换档重置尺寸
 * 全在 kernel 的 `defineMaterialStyles` 里（那是物料家族的公共能力，不该每个物料抄一遍）。
 *
 * 加一种长相 = 在 styles/ 下加一个组件 + 这个数组加一项。物料声明、两态组件、配置面板一个字不动。
 * **第一项即默认档**（row 横排）。
 *
 * 为什么只有这三档、而头像形状与部门职务是正交配置：判据只有一条——**改宽高比的才进格式档**。
 * `applySize` 只在换格式档时重置固定 `width/height`，所以：拼音多占一行 → 改高度 → 必须进档；
 * 部门跟在姓名后 → 同行变长、不改高度 → 做开关；头像形状 / 字色 → 不改比例 → 做配置。
 * 同一条规则判出三个不同答案，不是逐个拍脑袋。
 *
 * 每档直接声明**设计内容宽 px**；kernel 再加公共外壳内边距，生成模型里的固定 `width/height`。
 *
 * 下面六个数是 **2026-08-17 实测值**（PingFang SC 真字体、shadow DOM 里按各档设计宽渲染后读
 * `getBoundingClientRect()`）。**改过任何字号、间距或设计宽都要重量**——日期卡台历照设计稿估了 0.8、
 * 实测 1.12，固定框与面板宫格两处一起歪。
 *
 * **设计宽按「部门职务开关打开 + 长部门样本」定**（3 字姓名 + `信息技术中心/高级工程师`）：
 * 实测这套字号下要 214 / 211 / 159px，各留约 5% 余量得 225 / 222 / 168。
 *
 * **为什么必须在这里定死、不能指望作者拖宽**：卡片内部尺寸一律 `cqw`（占卡宽的百分比），
 * 所以拖宽等于**整体放大**——字跟着一起变大，能显示的字数一个都不多。
 * 实测把卡片从 160px 拖到 480px，部门的显示比例恒为 60.8%，一个字都没多出来。
 * 截断点是比例不变的，**只有设计宽和字号能改变它**。
 *
 * 代价（已知、已接受）：占多数的「开关关」状态下内容只占框宽的三分之一左右，两侧留白。
 * 因为卡片没有底色，这段留白是看不见的，只是这个块在正文里会占掉那么宽的位置。
 *
 * 高度只由头像与行高决定、与姓名长短无关（32 / 40 / 83.7px），所以 `ar` 在同一档里是稳定的。
 */
// 标题是「样式」不是「格式」：**`style` 这一维是长相档**（三个不同的组件），
// 而「格式」这个词在日期卡那边指的是**内容多少**（完整/不含星期/极简）。
// 同一个词在相邻两个物料的面板里指两件事，作者切过去会以为是同一个东西。
//
// 只改这个中文标题、**绝不改第一个参数**：那是 `props` 里的字段名，作者已存的文档就靠它记住选了哪档，
// 改键 = 所有存过的人员卡长相回落默认档（横排），而且一声不吭。键是数据，标题只是 UI 文案。
export const PERSON_CARD_STYLES = defineMaterialStyles('style', '样式', [
    { id: 'row', label: '横排', component: RowCardComponent, defaultWidth: 175, defaultAr: 5.48 },
    { id: 'rowPinyin', label: '横排拼音', component: RowPinyinCardComponent, defaultWidth: 230, defaultAr: 5.75 },
    { id: 'column', label: '竖排', component: ColumnCardComponent, defaultWidth: 70, defaultAr: 0.84 }
]);
