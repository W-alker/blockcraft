import type { FrozenPersonCardData } from '../dynamic-material-data';

const DEFAULT_AVATAR =
    'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2232%22 fill=%22%23f1f2f4%22/%3E%3Ccircle cx=%2232%22 cy=%2225%22 r=%2211%22 fill=%22%23c4c7ce%22/%3E%3Cpath d=%22M13 58c2-12 9-18 19-18s17 6 19 18%22 fill=%22%23c4c7ce%22/%3E%3C/svg%3E';

/**
 * 人员卡片「要画什么」的唯一形状：三档样式组件共用的那**一个** input。
 *
 * 为什么把「有没有人」压平成一个结构，而不是让样式组件收 `FrozenPerson | null` 自己判：
 * 占位与真值的差别（假名字、假拼音、假部门、虚线头像）只是**字段取值不同**，
 * 排版一模一样。让三个样式组件各写一遍 `person ? … : …`，就是三份会各自漂移的占位口径——
 * 行内人员的占位曾经就是这么散在 `paintPerson` 里的，那里只有一处才没出事。
 *
 * 与 `date-card-parts.util.ts` 的 `DateParts` 同位：物料的「数据面」，样式组件只管排版。
 */
/**
 * 内壳 `.tpl-person-card` 的静态样式串。提成常量的理由同天气/日期卡那批：
 * 编辑态与文档渲染态要画同一只壳，样式各抄一份就会漂。
 * 边框画在外壳、4px 内边距（乘 --u）当气口的缘由见 person-card-render.component.ts 的注释。
 */
export const PERSON_CARD_BOX_STYLE =
    'position:relative;display:inline-block;width:100%;height:100%;overflow:hidden;max-width:100%;vertical-align:middle;padding:calc(4 * var(--u, 1px));' +
    'box-sizing:border-box;border:var(--pc-bw, 0px) var(--pc-bs, solid) var(--pc-bc, transparent);border-radius:calc(6 * var(--u, 1px));';

export interface PersonCardView {
    /** 头像地址。真值态按 id 现算，占位态是官方默认头像。 */
    avatar: string;
    /** 姓名（占位态是标签 `文档创建人`，理由见下面占位口径那一段）。三档都画它。 */
    name: string;
    /** 空格分隔的大写拼音，只有 `rowPinyin` 档画。空串 = 这一行整行不出现。 */
    pinyin: string;
    /** 部门/职务。**「部门职务」开关关掉时恒为空串**——空串 = 整段不出现，不留空壳。 */
    desc: string;
    /** 是不是占位（尚未定格）。样式组件据此加虚线：**只改装饰、不改排版**，两态宽高必须一致。 */
    placeholder: boolean;
}

// ───── 三条正交显示配置的取值（配置项声明在 person-card.material.ts，取值住这里） ─────

/**
 * 头像形状的两档取值。**提成常量而不是在物料声明与组件里各写一次字面量**：
 * 这两个串要在「配置项 options」与「查表算圆角」两处对上，写错不报错、只是换档没反应。
 */
export const AVATAR_SHAPES = { Circle: 'circle', Rounded: 'rounded' } as const;

/**
 * 形状 → CSS 圆角值，落成 `--pc-avatar-radius`。
 *
 * 用**百分比**而不是 px：卡片内部一律 cqw 等比缩放，写死 px 的圆角在面板 72px 缩略图里
 * 会变成一个几乎方的角（真卡片 6px 圆角，缩略图上仍是 6px、却只有三分之一大的头像）。
 * 22% 是「方形圆角」——不是直角，原型那一档也是带弧的方头像。
 */
const AVATAR_RADIUS: Record<string, string> = {
    [AVATAR_SHAPES.Circle]: '50%',
    [AVATAR_SHAPES.Rounded]: '22%'
};

/** 查表 + 回落：没配过 / 老文档里存着已删档位，都给圆形（配置项的 default 也是它）。 */
export const avatarRadiusOf = (shape?: string | null): string =>
    AVATAR_RADIUS[shape ?? ''] ?? AVATAR_RADIUS[AVATAR_SHAPES.Circle];

/**
 * 头像大小的三档取值。**中 = 现状**：这一档不是「设计了三个尺寸」，而是把现有尺寸定为基准、
 * 向两边各让一档——所以落成**倍率**而不是三组 px：三个格式档的头像基数本就不同
 * （横排 32 / 横排拼音 40 / 竖排 56），写死 px 就得列一张 3×3 的表，还会随格式档增删漂移。
 */
export const AVATAR_SIZES = { Small: 'small', Medium: 'medium', Large: 'large' } as const;

/**
 * 档位 → 倍率，落成 `--pc-avatar-scale`（scss 里乘在各档自己的基数上：
 * `calc(基数px * var(--pc-avatar-scale, 1) * var(--u, 1px))`）。
 *
 * 0.75 / 1.25 不是随手拍的：横排基数 32 正好落成 24 / 32 / 40——「小」不低于文字行高
 * （15px × 1.4 ≈ 21，再小头像就撑不起这一行）、「大」恰好等于横排拼音档的基数，三档肉眼可分。
 *
 * 头像大小是固定框内的视觉倍率，仍是正交配置、不进样式档；样式档负责模型宽高，
 * 头像档只改变卡面内部的相对分量。拼音那档仍是样式档，因为它改变整体排版结构。
 */
const AVATAR_SCALE: Record<string, string> = {
    [AVATAR_SIZES.Small]: '0.75',
    [AVATAR_SIZES.Medium]: '1',
    [AVATAR_SIZES.Large]: '1.25'
};

/** 查表 + 回落：没配过 / 脏值一律按「中」（= 现状尺寸，配置项的 default 也是它）。 */
export const avatarScaleOf = (size?: string | null): string =>
    AVATAR_SCALE[size ?? ''] ?? AVATAR_SCALE[AVATAR_SIZES.Medium];

/**
 * 「部门职务」开关的两档取值。**默认是不显示**——多数场景只要一张脸加一个名字，
 * 部门那截是最长也最容易顶破版的一段（见下面 desc 的注释）。
 */
export const DEPT_DISPLAY = { Off: 'off', On: 'on' } as const;

/** 只有显式配成 `on` 才画部门：缺席（没配过）与任何脏值一律按不显示处理。 */
export const showsDept = (value?: string | null): boolean => value === DEPT_DISPLAY.On;

// ───── 占位口径 ─────

/**
 * 占位文案。**块级卡片走标签式，与行内人员的「姓名形状假名」（`XXX`）刻意分道**——
 * 不是抄漏了，判据是「占位得替代掉什么」：
 *
 * - **行内**：embed 的宽度**就是内容宽度**，占位太宽太窄会直接误导作者对版面的判断，
 *   所以那边必须给形状（`XXX` 三个字符正好是个短姓名的宽度）。
 * - **块级**：卡片宽度由模型 `width/height` 定死，占位写多长都不改变
 *   卡片占多宽。形状那条理由在这边不成立，就该让位给「说明这里将来是谁」——
 *   作者看着 `XXX` 根本不知道这块要长出什么。
 *
 * 为什么不用假名（`张三`）：模板里出现一个真人名会被当成模板的一部分
 * （「这张模板是不是指定了张三」），同天气物料模板态坚决不画「北京 晴」是同一条口径。
 * 人名比城市更容易被误读成真数据。
 *
 * 措辞与配置面板的「人员来源 = 文档创建人」**逐字相同**：画布与面板说同一个词，
 * 作者不用猜两处指的是不是一回事。不用「当前用户名」——模板作者会读成「我自己」，
 * 而真正定格的是将来拿这张模板建档的**别人**。
 *
 * 三个槽位**统一成标签式**，不许一半标签一半假数据（那样作者更糊涂）。
 *
 * **故意各存一份、不 import `embed/person/`**：占位长什么样是每个物料自己视觉的一部分
 * （README 原话），而且反过来 import 会让行内物料变成块级卡片的依赖上游——
 * 以后动行内会绊住卡片，正是 `data/person.util` 下沉要躲开的那件事。
 * 现在两边措辞已经不同，这条分家更是必须的。
 */
const PLACEHOLDER_NAME = '文档创建人';
/** 拼音位。不是 `displayPinyin(PLACEHOLDER_NAME)`（会出「WEN DANG CHUANG JIAN REN」，比真拼音长一倍）。 */
const PLACEHOLDER_PINYIN = '拼音';
const PLACEHOLDER_DEPT = '部门/职务';

/**
 * 定格人员（或 null=未定格）→ 要画的一份视图。
 *
 * `withDept` 为假时 desc 恒空，**不是在样式组件里 `@if` 判开关**：开关是显示配置、
 * 与「这个人有没有部门」是两件事，压在同一个空串上之后样式组件只剩一句「空就不画」。
 *
 * 占位态照样吃 `withDept`：作者在模板里把开关打开却什么都不变，配置就形同虚设
 * （行内人员的 `paintPerson` 同一条口径，那边有断言盯着）。
 */
export function viewOf(person: FrozenPersonCardData | null, withDept: boolean): PersonCardView {
    if (!person) {
        return {
            avatar: DEFAULT_AVATAR,
            name: PLACEHOLDER_NAME,
            pinyin: PLACEHOLDER_PINYIN,
            desc: withDept ? PLACEHOLDER_DEPT : '',
            placeholder: true
        };
    }
    return {
        avatar: person.avatar || DEFAULT_AVATAR,
        name: person.name,
        // 拼音只有 rowPinyin 档画，但**在这里一次算好**：三档共用同一个 view，
        // 样式组件不该认识 displayPinyin（那样换档就得换数据形状，outlet 的 input 就不通用了）。
        pinyin: person.pinyin || '',
        // 没部门的人：descOf 给空串 → 整段不出现（与 dl-user-profile 同口径），不画个空壳
        desc: withDept ? person.description || '' : '',
        placeholder: false
    };
}

/**
 * 样式组件 `@Input()` 的缺省值。
 * **面板画缩略图时把样式组件当图标直接 outlet、一个 input 都不传**（`MaterialConfigEntry.options.preview`
 * 的契约），没有它三格缩略图全是空的。取占位视图而不是编一个真人，缩略图里作者看到的
 * 就是他插进模板后会看到的那张卡。
 */
export const PLACEHOLDER_VIEW: PersonCardView = viewOf(null, false);

/**
 * 头像 404 → 回落官方默认头像（离职、没传过头像的人不该显示成裂图，同行内 `avatarImg`）。
 *
 * 提成共用函数、三个样式组件各挂一行：写成组件方法要抄三份，而这段有一个必须记得的细节——
 * **回落之后要能不再触发**：默认头像自己再 404 的话，`src` 反复写回同一个值会变成死循环。
 */
export function fallbackAvatar(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.src === DEFAULT_AVATAR) return;
    img.src = DEFAULT_AVATAR;
}
