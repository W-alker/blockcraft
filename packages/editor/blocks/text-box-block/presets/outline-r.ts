import {
  registerTextBoxArtwork,
  textBoxArtworkRef as art,
} from './artwork'
import type {TextBoxPresetDefinition} from '../text-box.presets'

/**
 * 「线框」tab, reproduction set — traced from a 4x3 reference sheet rather
 * than designed. Every colour, stroke weight, slot and proportion below comes
 * from pixel measurement of that sheet; nothing here is invented. Entries are
 * ordered r1c1 → r4c3 so each one can be checked against its own cell.
 *
 * Three architectural decisions constrain every entry, all of them settled
 * before this file was written:
 *
 * 1. **The border is a real `bw` stroke**, never painted into `bgi`. It stays
 *    editable from the toolbar and stays a constant device pixel at any zoom.
 *    It strokes whichever `sh` the entry picks, so a non-rectangular outline
 *    is a border, not a drawing. Consequence: a border cannot be interrupted,
 *    and it cannot differ from side to side.
 * 2. **`bgi` carries decoration only** — never the frame. It is an `<img>`
 *    clipped by the shape's `clip-path`, so it is drawn under the border
 *    stroke and cannot leave the shape. A flat field behind the text is not
 *    decoration and belongs in `fo` + `backColor` instead (r2c3).
 * 3. **Nothing overflows.** The reference sheet shows an ornament straddling
 *    the frame line in 12 cells out of 12 — a paperclip half above the top
 *    edge, a ribbon running out past the right edge, a disc centred on a
 *    corner. Clipping makes that unreachable, so each ornament is pulled just
 *    inside the line instead. Per-entry notes below record where that costs
 *    the most.
 *
 * Shape choice draws on the whole `shape-definitions.ts` catalog, not just the
 * rectangles: r1c1 is `plaque` because the reference frame has exactly that
 * concave lobed corner, and r1c2 is `cloud` because the reference *is* a
 * cloud. Both then need `fo: 1` — a non-rectangular outline over a
 * transparent fill leaks the page through its concavities.
 *
 * Corner radius is the one place the catalog cannot follow. The reference's
 * soft cells measure r = 1.7%–2.8% of card width; the smallest rounded
 * rectangle on offer is `flow-alternate-process` at 10% per axis, then
 * `rounded-rectangle` at 12%. All three take `rectangle`, because a 2.8%
 * error reads as a crisp card while a 9% error reads as a pill. That also
 * matters mechanically: `_shapeInset` returns 0 only for `rectangle`, so every
 * other shape silently pushes the text in by its own `textInsets` on top of
 * `p`. Entries on `plaque` and `cloud` have `p` reverse-computed from those
 * insets rather than from the frame edge.
 *
 * Canvas convention, shared with the other decorated tabs: a fixed 1000x600
 * viewBox with `preserveAspectRatio="none"` plus `bgs: 'stretch'`, and every
 * `defaultWidth : defaultHeight` at exactly 5:3. At that ratio one canvas unit
 * is the same length on both axes, so circles stay circular and a measurement
 * quoted as "% of card width" is simply its canvas-unit value divided by ten.
 *
 * `wm` is omitted throughout: no ornament here has a fixed reading direction.
 *
 * `p.bottom` is the one side not read off the drawing's ornament. Because the
 * frame's reserve is real geometry (the viewport ends at it), an over-generous
 * bottom is a line of text thrown away, not just slack. Entries whose ornament
 * dips into the text column keep the clearance that ornament needs; entries
 * with nothing under the text share a flat 12px optical margin off the `bw`
 * line. Both were measured by rasterising each `bgi` at frame size and
 * scanning down from the text rectangle's own bottom edge for the first pixel
 * that is not paper.
 */

/**
 * Measured off the reference sheet. Border hues stay inside the five
 * low-saturation families the sheet uses — near-black, neutral grey, pink,
 * pale blue, pale green. Saturated colour appears on ornament only.
 */
const C = {
  // borders
  ink: '#2E2E2E',
  grey: '#8C8C8C',
  greyLt: '#C0C0C0',
  greyPale: '#E5E5E5',
  greyFaint: '#E0E0E0',
  pink: '#DE5A5A',
  pinkLt: '#E8A0A0',
  blue: '#93C8EA',
  bluePeri: '#A8C0EE',
  blueMist: '#B8CFEE',
  green: '#CFE3C8',
  // ornament
  inkWash: '#7C7A8C',
  inkWashLt: '#B9B7C6',
  clipBody: '#9BB6EA',
  clipHi: '#A9C8FC',
  clipSh: '#6F7989',
  ribbon: '#DB3333',
  ribbonFold: '#BF1316',
  star: '#FAB038',
  coral: '#E8756B',
  coralHalo: '#F7C9C4',
  disc: '#C6DAF6',
  wood: '#9C7150',
  rodBar: '#BEBEBE',
  cloudLine: '#C7C6D6',
} as const

/**
 * Encodes one drawing into a background data URI. Every entry goes through
 * here rather than storing a pre-encoded literal, which would be unreviewable.
 * `url(#id)` is written with a bare `#`; `encodeURIComponent` turns it into
 * `%23`, which is what an `<img src>` needs.
 */
const uri = (inner: string): string =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600" ` +
    `preserveAspectRatio="none">${inner}</svg>`,
  )

/**
 * One ink swallow, drawn as a filled silhouette in a 92x62 local box and placed
 * by transform. An earlier draft stroked a bare two-wing sweep with round caps;
 * at the size the reference uses — about 7% of card width, so roughly 23px on a
 * 320px frame — that reads as a grey tick, not a bird. The reference's swallows
 * are solid ink with a visible body, so the wings are closed shapes here: each
 * one runs out to a point at the tip and thickens toward the shoulder, and the
 * two meet over a spindle body that ends in a forked tail.
 */
const swallow = (x: number, y: number, s: number, r: number): string =>
  `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})" ` +
    `fill="${C.inkWash}">` +
  `<path d="M4 6C24 12 41 24 50 40C59 24 76 12 96 6C80 20 64 34 55 50` +
  `L58 66L50 56L42 68L45 50C36 34 20 20 4 6Z"/></g>`

/** Rounds to whole canvas units; fractional units only bloat the data URI. */
const r0 = (n: number): string => n.toFixed(0)

/**
 * Catmull-Rom through the given points, emitted as cubic segments. Used by
 * `band` so a ribbon can be specified as a centreline rather than as control
 * points nobody can verify by reading.
 */
const spline = (ps: readonly (readonly [number, number])[]): string => {
  let d = ''
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 2] ?? ps[i - 1]
    const b = ps[i - 1]
    const c = ps[i]
    const e = ps[i + 1] ?? ps[i]
    d += `C${r0(b[0] + (c[0] - a[0]) / 6)} ${r0(b[1] + (c[1] - a[1]) / 6)} ` +
      `${r0(c[0] - (e[0] - b[0]) / 6)} ${r0(c[1] - (e[1] - b[1]) / 6)} ` +
      `${r0(c[0])} ${r0(c[1])}`
  }
  return d
}

/**
 * A ribbon with a waist, from a centreline of `[x, y, width]` triples. The
 * reference's ribbon is emphatically not a hose: it starts at a point, swells
 * to roughly five times the width of its own tip, and closes to a rounded end.
 * Offsetting one centreline by ±w/2 keeps that taper legible in the source,
 * which hand-placed control points did not.
 */
const band = (pts: readonly (readonly [number, number, number])[]): string => {
  const up = pts.map(([x, y, w]) => [x, y - w / 2] as const)
  const dn = pts.map(([x, y, w]) => [x, y + w / 2] as const).reverse()
  return `M${r0(up[0][0])} ${r0(up[0][1])}${spline(up)}` +
    `L${r0(dn[0][0])} ${r0(dn[0][1])}${spline(dn)}Z`
}

/** The ribbon's fold: the same centreline pushed toward its lower edge. */
const fold = (pts: readonly (readonly [number, number, number])[]): string => {
  const ps = pts
    .filter(([, , w]) => w > 0)
    .map(([x, y, w]) => [x, y + w * 0.26] as const)
  return `M${r0(ps[0][0])} ${r0(ps[0][1])}${spline(ps)}`
}

/** Five-pointed star; the 0.42 inner ratio keeps the points legible small. */
const star = (x: number, y: number, r: number): string => {
  let p = ''
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 5 * i - Math.PI / 2
    const rr = i % 2 ? r * 0.42 : r
    p += (i ? 'L' : 'M') +
      (x + Math.cos(a) * rr).toFixed(0) + ' ' +
      (y + Math.sin(a) * rr).toFixed(0)
  }
  return `<path d="${p}Z" fill="${C.star}"/>`
}

/**
 * A lobed cloud sitting at a rainbow's foot, drawn around its own centre.
 * Four arc lobes over a flat base: the reference's clouds are visibly bumpy,
 * and a two-lobe version read as a pill.
 */
const cloud = (x: number, y: number, s: number): string =>
  `<path transform="translate(${x} ${y}) scale(${s})" ` +
    `d="M-58 22A18 18 0 0 1-50-6A22 22 0 0 1-12-18A20 20 0 0 1 24-12` +
    `A18 18 0 0 1 56 12A8 8 0 0 1 50 22Z" fill="#FFFFFF" ` +
    `stroke="${C.cloudLine}" stroke-width="3"/>`

/**
 * A rainbow as concentric stroked half-circles. The reference shows six to
 * seven bands meeting seamlessly, so these are stroked arcs at one band pitch
 * with no gap — drawing them as separate filled rings would leave hairlines
 * between the bands at fractional zoom.
 */
const rainbow = (cx: number, cy: number, r0: number, w: number): string => {
  const cs = [
    '#E8837E', '#F2A47E', '#F8C48F', '#F7E9B2',
    '#D6EFB8', '#B8E4D2', '#8FA6DA',
  ]
  return `<g fill="none" stroke-width="${w}">` + cs
    .map((c, i) => {
      const r = r0 - w / 2 - i * w
      return `<path d="M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}" ` +
        `stroke="${c}"/>`
    })
    .join('') + `</g>`
}

/** A registration cross, the corner mark on the reference's photo frame. */
const cross = (x: number, y: number, a: number): string =>
  `<path d="M${x - a} ${y}h${a * 2}M${x} ${y - a}v${a * 2}"/>`

/**
 * `cloud`'s own outline from `shape-definitions.ts`, duplicated here for the
 * inner dotted rule of r1c2. It is written in the shape catalog's 1000x1000
 * space; `INNER_CLOUD` maps it into this file's 1000x600 decoration canvas and
 * shrinks it toward the centre, so the dotted line tracks the real border
 * instead of approximating it with a hand-drawn scallop that would drift.
 */
const CLOUD_PATH =
  'M170 820C10 810-40 620 80 530C20 370 170 230 330 290C390 90 680 50 780 250' +
  'C960 220 1070 410 970 550C1090 690 970 860 800 830C710 980 490 970 420 840' +
  'C330 920 220 900 170 820Z'

/**
 * The catalog cloud, mapped y*0.6 into this canvas then scaled k about
 * (500, 300) — in path form `translate(500(1-k) 300(1-k)) scale(k .6k)`. The
 * stroke inherits the anisotropy, which at a 3-unit dotted line is below one
 * device pixel of difference and is the cheaper trade against re-emitting the
 * path by hand.
 *
 * k = .955, not the .88 an earlier draft used. Scaling about the centre insets
 * by `(1-k)` of the distance to the centre, so the widest part of the cloud —
 * the shoulders, 540 units from the middle — moved in by 65 units at .88. That
 * is 6.5% of card width against the reference's 2.4%, and it read as a second
 * cloud floating inside the first rather than as a rule tracking the border.
 * .955 puts that same shoulder inset at 24 units.
 */
const INNER_CLOUD = `<path d="${CLOUD_PATH}" ` +
  `transform="translate(22.5 13.5) scale(.955 .573)" fill="none" ` +
  `stroke="${C.ink}" stroke-width="5" stroke-dasharray="3 15" ` +
  `stroke-linecap="round"/>`

/**
 * Centreline of the r2c1 ribbon: a point at the tip, a 50-unit belly (5.0% of
 * card width against the reference's measured 5.7%), two undulations, and a
 * rounded exit that lifts toward the top-right. Measured from the sheet.
 */
const RIBBON = [
  [452, 526, 0],
  [520, 516, 24],
  [590, 552, 42],
  [664, 562, 50],
  [736, 548, 50],
  [800, 516, 46],
  [860, 522, 42],
  [912, 500, 34],
  [952, 470, 20],
  [972, 454, 0],
] as const

/**
 * 本页图案登记表。`bgi` 里只存 `bc:<id>` 引用，图不进文档——否则每个文本框都要
 * 把 0.3~1.6KB 的 SVG 带进 Yjs、undo 历史和导出。
 *
 * `textInsets` 跟着图走：文字安全区是图的属性，而且是**框的比例**。原先以像素
 * 记在 `p` 里，只在各自设计尺寸上成立，框一拉就压字。三款非矩形（`plaque`/
 * `cloud`/`folded-corner`）的值里已经把形状自身的 textInsets 合并进来了，因为
 * 图案登记优先于形状登记。
 */
export const OUTLINE_R_TEXT_BOX_ARTWORK = registerTextBoxArtwork([
  {
    id: 'outline-r-ink-swallow',
    src: uri(
      // 次要：右下角极淡墨晕，参考里是一尾几乎化开的墨鱼。压到 .42 不透明度
      // 才不至于读成一块灰色实体。
      `<g fill="${C.inkWashLt}" opacity=".45">` +
      `<path d="M744 486C756 458 794 442 832 450C862 456 878 476 872 498` +
        `C866 520 836 532 806 526C774 520 738 510 744 486Z"/>` +
      `<path d="M872 490C890 476 910 472 926 478C908 482 892 490 880 502Z"/>` +
      `</g>` +
      `<path d="M770 480C798 466 828 464 852 472" fill="none" ` +
        `stroke="${C.inkWashLt}" stroke-width="3" stroke-linecap="round" ` +
        `opacity=".55"/>` +
      // 主装饰：左上两只墨燕，一大一小，头朝右。起点右移到 x≥150，
      // 避开 plaque 左上花瓣角凹进去的那块（那里在 clip 之外）。
      // 0.74 / 0.54 让两只分别占 6.8% / 5.0% 卡宽，对上参考实测的 7.2% /
      // 5.8%；填充剪影比之前的描边窄，所以比例数字比描边版本大一点。
      swallow(152, 60, 0.74, -15) +
      swallow(272, 88, 0.54, 8),
    ),
    textInsets: {top: 0.223333, right: 0.165, bottom: 0.192083, left: 0.165},
  },
  {
    id: 'outline-r-sketch-note',
    src: uri(
      INNER_CLOUD +
      // 顶部三枚环扣。取样点是 cloud 顶那段三次曲线 t=.25/.5/.75 的位置
      // （起点 330,174、控制点 390,54 与 680,30、终点 780,150，y 已按 0.6
      // 映射到本画布），即 412,103 / 540,72 / 676,86。但圆心放在轮廓上时
      // 外半圈落在 clip 之外，渲染出来是三个朝内的半圆凹口——参考画的是三
      // 枚完整的环。所以每枚沿该点的内法线再移 18 单位（半径 13 + 环线半宽
      // 2 + 让开边框内半宽的 3），环整个落进云里、上沿与轮廓相切。
      // 法线由同一条曲线的导数得出，y 分量同样乘 0.6 后再单位化：
      // t=.25 (.421,.907)、t=.5 (.065,.998)、t=.75 (-.289,.957)。
      // 环是白色填充且画在 INNER_CLOUD 之后，所以点线穿过环时被环盖住，
      // 和参考一样只在环两侧露出。
      `<g fill="#FFFFFF" stroke="${C.ink}" stroke-width="4">` +
      `<circle cx="420" cy="119" r="13"/>` +
      `<circle cx="541" cy="90" r="13"/>` +
      `<circle cx="671" cy="103" r="13"/></g>`,
    ),
    textInsets: {top: 0.298333, right: 0.215, bottom: 0.245, left: 0.215},
  },
  {
    id: 'outline-r-paperclip',
    src: uri(
      `<g fill="none" stroke-linecap="round">` +
      `<path d="M487 163V60A13 13 0 0 1 513 60V140A20 20 0 0 0 473 140` +
        `V40A27 27 0 0 1 527 40V117" stroke="${C.clipBody}" ` +
        `stroke-width="11"/>` +
      `<path d="M473 134V40A27 27 0 0 1 527 40" stroke="${C.clipHi}" ` +
        `stroke-width="6"/>` +
      `<path d="M513 129V140A20 20 0 0 1 493 160" stroke="${C.clipSh}" ` +
        `stroke-width="6"/></g>`,
    ),
    textInsets: {top: 0.311111, right: 0.08, bottom: 0.066667, left: 0.08},
  },
  {
    id: 'outline-r-ribbon-star',
    src: uri(
      `<path d="${band(RIBBON)}" fill="${C.ribbon}"/>` +
      `<path d="${fold(RIBBON)}" fill="none" stroke="${C.ribbonFold}" ` +
        `stroke-width="7" stroke-linecap="round"/>` +
      star(446, 524, 19),
    ),
    textInsets: {top: 0.125, right: 0.06875, bottom: 0.28125, left: 0.06875},
  },
  {
    id: 'outline-r-rainbow',
    src: uri(
      rainbow(838, 566, 118, 11) +
      cloud(738, 558, 0.95) +
      cloud(938, 560, 0.8),
    ),
    textInsets: {top: 0.125, right: 0.075, bottom: 0.291667, left: 0.075},
  },
  {
    id: 'outline-r-pin-board',
    src: uri(
      `<rect x="34" y="30" width="932" height="540" rx="10" ` +
        `fill="#FFFFFF"/>` +
      `<g fill="${C.coralHalo}">` +
      `<rect x="160" y="8" width="20" height="88" rx="10"/>` +
      `<rect x="820" y="8" width="20" height="88" rx="10"/></g>` +
      `<g fill="${C.coral}">` +
      `<rect x="164" y="12" width="12" height="76" rx="6"/>` +
      `<rect x="824" y="12" width="12" height="76" rx="6"/></g>`,
    ),
    textInsets: {top: 0.177083, right: 0.08125, bottom: 0.0625, left: 0.08125},
  },
  {
    id: 'outline-r-sunrise-bar',
    src: uri(
      `<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="#C92700"/>` +
      `<stop offset=".57" stop-color="#F26F00"/>` +
      `<stop offset="1" stop-color="#F26F00"/></linearGradient></defs>` +
      `<rect x="0" y="0" width="1000" height="28" fill="url(#a)"/>`,
    ),
    textInsets: {top: 0.166667, right: 0.086667, bottom: 0.066667, left: 0.086667},
  },
  {
    id: 'outline-r-corner-dot',
    src: uri(`<circle cx="46" cy="78" r="56" fill="${C.disc}"/>`),
    textInsets: {top: 0.233333, right: 0.08, bottom: 0.066667, left: 0.08},
  },
  {
    id: 'outline-r-bookmark-page',
    src: uri(
      `<path d="M0 12H14V590H1000V600H0Z" fill="${C.wood}"/>` +
      `<path d="M142 0h22v52h-22z" fill="${C.wood}"/>` +
      `<path d="M164 2 214 52" fill="none" stroke="${C.greyLt}" ` +
        `stroke-width="4"/>`,
    ),
    textInsets: {top: 0.155556, right: 0.08, bottom: 0.066667, left: 0.086667},
  },
  {
    id: 'outline-r-photo-marks',
    src: uri(
      `<g fill="none" stroke="${C.green}" stroke-linecap="round">` +
      `<rect x="18" y="18" width="964" height="564" stroke-width="4" ` +
        `stroke-dasharray="3 7"/>` +
      `<g stroke-width="4">` +
      cross(54, 54, 18) + cross(946, 54, 18) +
      cross(54, 546, 18) + cross(946, 546, 18) +
      `</g></g>`,
    ),
    textInsets: {top: 0.144444, right: 0.08, bottom: 0.066667, left: 0.08},
  },
  {
    id: 'outline-r-rod-note',
    src: uri(
      `<rect x="0" y="3" width="1000" height="9" fill="${C.rodBar}"/>` +
      `<g fill="${C.ink}">` +
      `<rect x="5" y="1" width="14" height="14"/>` +
      `<rect x="981" y="1" width="14" height="14"/></g>`,
    ),
    textInsets: {top: 0.155556, right: 0.08, bottom: 0.066667, left: 0.08},
  },
  {
    id: 'outline-r-window',
    src: uri(
      `<rect x="0" y="0" width="1000" height="58" fill="#FAFAFC"/>` +
      `<rect x="0" y="56" width="1000" height="3" fill="#E4E4E6"/>` +
      // 三点：直径 24 单位 = 2.4% 卡宽，间距 39 = 3.9%。参考里这三点很小，
      // 早先的 r15/间距 52（3.0% / 5.2%）把标题条压成了播放器控制条。
      // 实测方法：三点是图里唯一的饱和色块，按 |px - #FAFAFC| 求色量再除以
      // 满色差（红 321、黄 267、绿 373），得等效面积 11.2/10.3/10.6 px²，
      // 即直径 3.69px；同图窗框宽 159px（x 7→166），3.69/159 = 2.32%。
      // 圆心间距 6.17px = 3.88%，首点圆心距左框 7.4px = 4.65%。
      `<circle cx="46" cy="30" r="12" fill="#E8695E"/>` +
      `<circle cx="85" cy="30" r="12" fill="#F0B93C"/>` +
      `<circle cx="124" cy="30" r="12" fill="#62C554"/>`,
    ),
    textInsets: {top: 0.166667, right: 0.075, bottom: 0.0625, left: 0.075},
  },
])

export const OUTLINE_R_TEXT_BOX_PRESETS = [
  {
    // r1c1 — 白底 + 淡蓝灰细线框 + 左上两只水墨飞燕 + 右下极淡墨晕。
    // 参考的框是四角内凹的花瓣角异形描边，正是目录里的 `plaque`（铭牌），
    // 花瓣角因此完整还原。`fo: 1` 让白底成为真正的形状填充而不是靠页面底色
    // 假装——换非矩形轮廓后这一条是必要的，否则凹角处会漏出页面背景。
    // 仅剩的差距：燕子在参考里骑在框线上，这里内收到线内（clip 限制）。
    id: 'outline-r-ink-swallow',
    label: '水墨飞燕',
    cat: 'outline',
    defaultWidth: 320,
    defaultHeight: 192,
    props: {
      sh: 'plaque',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.blueMist,
      bgi: art('outline-r-ink-swallow'),
      bgs: 'stretch',
      bgo: 1,
      // plaque 的 textInsets 是四边 0.14，已经把正文推进 44.8/26.9px；`p` 只
      // 再补避让燕子所需的那一点，不重复计一遍边距。
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r1c2 — 近黑云朵轮廓 + 内侧点线 + 顶部三枚环扣。
    // 外轮廓用目录里的 `cloud`，参考的云朵剪影完整还原（真 `bw` 描的是所选
    // 形状的轮廓，不是只能描矩形）。`fo: 1` 提供白色云体，否则凹陷处漏底。
    // 内侧点线是同一条 cloud 路径缩到 .955 画的，永远跟边框同形。
    // 参考里四角还有向外炸开的放射短笔。`bgi` 出不了 clip，短笔只能画在云
    // 里面，那样它们和内侧点线交叠成一圈杂乱刻度，语义正好和参考相反，所以
    // 整组删掉——缺一个元素比留一个方向错的元素更接近参考。
    // 尺寸：`cloud` 的 textInsets 是 [.24 .20 .22 .20]，300x180 上正文盒只剩
    // 180x97.2px，扣掉 `p` 后 168x77.2px，示例文案 16px/1.5 的第 4 行会被切一
    // 半。400x240 把正文盒抬到 240x129.6px（扣 `p` 后 228x109.6px），4 行 96px
    // 有富余，5:3 也没破。
    id: 'outline-r-sketch-note',
    label: '手绘云笺',
    cat: 'outline',
    defaultWidth: 400,
    defaultHeight: 240,
    props: {
      sh: 'cloud',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.ink,
      bgi: art('outline-r-sketch-note'),
      bgs: 'stretch',
      bgo: 1,
      // cloud 的 textInsets 是 [.24 .20 .22 .20]，400x240 上已让出
      // 57.6/80/52.8/80px；但云的左右肩在正文盒上沿以上就收窄了，首行会压线，
      // 所以 `p` 的上边再压 14px，把首行推进云腹最宽的那一段。
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r1c3 — 白底 + 近黑直角细框 + 顶边中点一枚矢车菊蓝回形针。
    // 针在参考里量得 9x20px（框 140x73px），即 6.4% 卡宽 x 27.4% 卡高，含描边
    // 后这里是 65 x 161 单位 = 6.5% x 26.8%。早先画成 46 x 113 单位（4.6% x
    // 18.8%），小了约 1.4 倍。
    // 参考里针的上半截露在框外，`bgi` 出不了 clip，这里整枚挂在上框线内侧：
    // 针尾到 168.5 单位 = 50.5px，所以 `p.top` 同步抬到 56px（参考的正文首行
    // 也正好落在框高 30% 处，和这个值吻合）。
    id: 'outline-r-paperclip',
    label: '回形针便条',
    cat: 'outline',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.ink,
      bgi: art('outline-r-paperclip'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r2c1 — 白底 + 粉红细框 + 右下红缎带 + 缎带起点一枚黄星。
    // 缎带有腰身：左端 10 单位（1.0% 卡宽）起笔，腹部涨到约 48（4.8% 卡宽），
    // 右端收成 34 的圆头；实心 #DB3333 上压暗折痕 #BF1316（不是浅色亮芯）。
    // 参考里缎带从右框线穿出去，这里止在框内。
    id: 'outline-r-ribbon-star',
    label: '红缎带星',
    cat: 'outline',
    defaultWidth: 320,
    defaultHeight: 192,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.pink,
      bgi: art('outline-r-ribbon-star'),
      bgs: 'stretch',
      bgo: 1,
      // 缎带最高点在 454 单位 = 145.3px（192px 高的卡上）。`p.bottom` 原本是
      // 46，正文盒下沿落在 146px，只比缎带顶高 0.7px：多打一行就压在缎带上。
      // 54 让出 8px 净空。
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r2c2 — 白底 + 淡蓝圆角细框 + 右下彩虹。
    // 彩虹 7 道无缝相接，单道 11 单位（1.1% 卡宽），整拱 236 ≈ 23.6% 卡宽，
    // 两脚各压一朵白云、极细灰紫描边——全部照参考实测，不是 3 道带白缝。
    // 圆角：参考实测 r ≈ 2.8% 卡宽，目录里最小的圆角矩形是 `flow-alternate-
    // process` 的 10%、其次 `rounded-rectangle` 的 12%，都比参考圆四五倍，
    // 取直角（误差 2.8%）比取 12%（误差 9%）近。改直角还顺带让出了右下角，
    // 彩虹得以贴着右框线放，比之前更接近参考。
    id: 'outline-r-rainbow',
    label: '彩虹云角',
    cat: 'outline',
    defaultWidth: 320,
    defaultHeight: 192,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.blue,
      bgi: art('outline-r-rainbow'),
      bgs: 'stretch',
      bgo: 1,
      // 同 r2c1：拱顶在 566-118 = 448 单位 = 143.4px，`p.bottom` 原本 48 让正文
      // 盒下沿落在 144px，只差 0.6px。56 让出 8px 净空。
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r2c3 — 淡粉底板 + 粉色虚线框 + 顶边两枚珊瑚色磁扣（约 17% / 83% 处）。
    // 底板用 `fo: 1` + 极浅的 `backColor` 做出来（正文压在饱和色上不可读，
    // 所以只能用这种淡到接近白的粉），`bgi` 再盖一块白色书写面板，于是参考
    // 的「粉底 → 内嵌白面板」层次回来了。
    // 与参考剩下的差别：参考的虚线在粉底之内，我们的真 `bw` 只能画在形状轮廓
    // 上，所以顺序变成「虚线 → 粉边 → 白面板」——粉底和虚线互换了位置。
    // 另外参考的虚线是极细密点线，`bs: 'dashed'` 的 `10 8` 节奏是框架写死的。
    // 圆角：参考实测 r ≈ 2.8% 卡宽，目录里最小的圆角矩形是 10%（见文件头），
    // 取直角比取 12% 更接近。
    id: 'outline-r-pin-board',
    label: '粉色钉板',
    cat: 'outline',
    defaultWidth: 320,
    defaultHeight: 192,
    props: {
      sh: 'rectangle',
      bw: 2,
      bs: 'dashed',
      fo: 1,
      backColor: '#FDEFF0',
      borderColor: C.pinkLt,
      bgi: art('outline-r-pin-board'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r3c1 — 白底 + 中性浅灰细框（四边全封闭、直角）+ 顶边通栏红→橙渐变粗条。
    // 渐变实测 #C92700 起，约 57% 处到 #F26F00 后保持；条厚 28 单位 ≈ 2.8% 卡宽。
    // 边框刻意留在中性灰而不是跟着染橙——参考就是靠灰框衬托橙条。
    // 参考里粗条本身就是上框线，我们的灰上框线会在条子上方多出一道。
    id: 'outline-r-sunrise-bar',
    label: '日出顶条',
    cat: 'outline',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.greyPale,
      bgi: art('outline-r-sunrise-bar'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r3c2 — 白底 + 长春花蓝直角细框 + 左上角淡蓝圆点（r 56 ≈ 5.6% 卡宽）。
    // 两处差距：参考的圆点正骑在左上角上、一多半落在框外，这里只能贴着角内侧；
    // 参考的下框线在约 72% 处断开留白、右下另起一小段，真 `bw` 无法断线。
    id: 'outline-r-corner-dot',
    label: '蓝框圆点',
    cat: 'outline',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.bluePeri,
      bgi: art('outline-r-corner-dot'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r3c3 — 白底 + 浅灰细框 + 左侧与底边一条棕色书脊（L 形）+ 顶边约 16% 处
    // 一枚棕色小书签。参考的右框线是虚线、上框线是实线、左右不同色，真 `bw`
    // 全框同色同线型，只能取浅灰实线；书签在参考里翘出框外，这里向内挂。
    id: 'outline-r-bookmark-page',
    label: '书签折页',
    cat: 'outline',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.greyLt,
      bgi: art('outline-r-bookmark-page'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r4c1 — 白底 + 淡绿实线细框 + 内侧一圈淡绿点线 + 四角淡绿十字标记。
    // 参考的点线内收约 1.6% 卡宽、十字在 5% 处，照抄。此款没有溢出成分，
    // 是 12 款里还原度最高的一个。
    id: 'outline-r-photo-marks',
    label: '绿点相框',
    cat: 'outline',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.green,
      bgi: art('outline-r-photo-marks'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r4c2 — 白底 + 中灰直角细框 + 顶边通栏浅灰挂杆 + 两端近黑方头。
    // 参考里挂杆本身就是上框线（比左右框线更浅），方头压在两个上角上；
    // 真 `bw` 四边同色，所以挂杆只能画在上框线内侧，顶部会多出一道灰线。
    id: 'outline-r-rod-note',
    label: '挂杆便签',
    cat: 'outline',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.grey,
      bgi: art('outline-r-rod-note'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r4c3 — 白底 + 极浅灰圆角细框 + 顶边通栏标题条（近白 #FAFAFC 色块 +
    // 一道 #E4E4E6 分隔线）+ 左侧红黄绿三点。标题条是亮度色块不是墨迹，
    // 真正的墨迹只有分隔线和三点，约 0.85% 卡面积。
    // 圆角：参考实测 r ≈ 1.7% 卡宽（三款圆角里最方的一款），目录里没有这么
    // 小的圆角矩形，取直角比取 12% 近得多。
    id: 'outline-r-window',
    label: '窗口卡片',
    cat: 'outline',
    defaultWidth: 320,
    defaultHeight: 192,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.greyFaint,
      bgi: art('outline-r-window'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
] as const satisfies readonly TextBoxPresetDefinition[]
