import { DynamicMaterialConfigEntry } from '../dynamic-material-config';

/**
 * 默认主色（近黑）。两态组件在 props 缺席时拿它兜底，也是配置项的 `default`。
 *
 * 是个字面量而不是"调色板第一项"：**物料不再自带调色板**（见 defineColorConfig），
 * 没有那份清单可指了。四档样式的 scss 里各自的 `var(--dc-color, #1f2329)` 回落值与它同值——
 * 那是 CSS 侧够不着 TS 常量的无奈重复，改这里记得一起改。
 */
export const DEFAULT_MATERIAL_COLOR = '#1f2329';

/**
 * 「主色」配置项的公共实现。与 defineMaterialStyles 同理——**颜色是物料家族的能力，
 * 不属于任何一个物料**；物料只需要把它放进 `displayConfigs`，控件形态全家一致。
 *
 * `options` 恒为空，**是刻意的**：颜色不设推荐集，直接用 cses-ui 取色器自带的那套
 * （主题色 46 + 标准色 10 + 最近使用 + 更多颜色 + 十六进制 + 透明度）。
 * 早先自带过一份 6 色"推荐色"，代价是 `csPresets` 在 cses-ui 里是**替换不是追加**
 * （`const source = custom ?? CS_DEFAULT_COLOR_PRESETS`），递进去就把默认那套整个顶掉了，
 * 作者反而只剩 6 个色可选——比不配还差。空 options 由面板翻译成 `csPresets = null` 走默认分支，
 * 顺带拿到中文分组标题（本地化只在 custom === null 时生效，自己递数组会露出英文 "Theme colors"）。
 *
 * 由此而来的一条：作者能取到 `#FFFFFF` 这种极亮色，而 banner / minibar 两档把主色**当白纸上的文字色**用，
 * 选白就看不见。这是"自由取色"换来的既定代价（更多颜色与十六进制输入本来也堵不住），
 * 不靠预设清单去挡；真要护栏得在渲染侧给"主色当文字"的档位加亮度下限，与本配置项无关。
 *
 * @param key      配置项键名，也是它在 props 里的字段名（缺省 'color'）
 * @param label    面板上的标题（缺省 '颜色'）
 * @param fallback 默认值（缺省近黑）。**传空串 = 「跟随样式档」**：面板不写任何值进 props，
 *                 于是各档 scss 里 `var(--dc-bg, …)` 的兜底生效，一个配置项能在四种长相下
 *                 各有各的默认色。日期卡的背景/字体色都走这条——台历要深底白字、
 *                 长卷要无底深字，而配置项只有一个 `default` 位，塞哪个都会坑到另外两档。
 *                 取色器的「清空」也回落到这里（见面板的 onColorChange）。
 */
export function defineColorConfig(key = 'color', label = '颜色', fallback = DEFAULT_MATERIAL_COLOR): DynamicMaterialConfigEntry {
    return {
        key,
        label,
        default: fallback,
        // 选的是视觉不是取值：面板画取色器（自带弹层、透明度、最近使用），不是文字下拉
        control: 'color',
        options: []
    };
}

/** 解析出 `[r, g, b, a]`（0–255 / 0–1）。认 #rgb / #rrggbb / #rrggbbaa 与 rgb()/rgba()；认不出返回 null。 */
function parseColor(color: string): [number, number, number, number] | null {
    const s = color.trim();
    const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (hex) {
        const h = hex[1];
        // #rgb 展开成 #rrggbb；#rrggbbaa 的末两位是 alpha
        const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        if (full.length !== 6 && full.length !== 8) return null;
        const n = parseInt(full.slice(0, 6), 16);
        const a = full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1;
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
    }
    const fn = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (!fn) return null;
    const p = fn[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.slice(0, 3).some(Number.isNaN)) return null;
    return [p[0], p[1], p[2], p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1];
}

/**
 * 压在主色上该用什么文字色。
 *
 * 作者能自由取色、还能拉透明度，所以「文字恒白」这条不成立：挑个浅黄，白字直接消失。
 * 按 WCAG 的相对亮度算一次，亮底给深字、暗底给白字，任何颜色都不会出现看不见的组合。
 *
 * **必须先把 alpha 合成到白底上再算**：30% 的黑看着是浅灰，直接拿原色算会判成深色、给出白字，
 * 而那正是最看不见的组合。合成基准取白色是因为文档纸面就是白的（本版不做深色主题）。
 *
 * 阈值 0.179 = 白字与深字对比度相等的那个交点（由 WCAG 对比度公式解出，两侧都约 4.5:1）。
 * 一开始按「中间调压白字更好看」拍了 0.45，是错的：那会让 #b3b3b3 这种中灰也判成深色，
 * 白字压上去只有 2.1:1，而深字有 7.3:1——单测就是照着这个反例写的。凭手感拍阈值别再犯。
 *
 * 认不出的颜色串（颜色名、hsl()、color-mix()）回落白字——深色居多的一侧，错也错得轻。
 */
export function onColorFor(color: string): string {
    const rgba = parseColor(color);
    if (!rgba) return '#fff';
    const [r, g, b, a] = rgba;
    const lin = [r, g, b].map(v => {
        const over = (v * a + 255 * (1 - a)) / 255;   // 先合成到白底
        return over <= 0.03928 ? over / 12.92 : ((over + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    return luminance > 0.179 ? '#1f2329' : '#fff';
}
