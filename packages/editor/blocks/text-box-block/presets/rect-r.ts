import {
  registerTextBoxArtwork,
  textBoxArtworkRef as art,
} from './artwork'
import type {TextBoxPresetDefinition} from '../text-box.presets'

/**
 * Rectangle tab, reproduction set.
 *
 * Every entry here is a copy of one cell of a 4x3 reference sheet of decorated
 * rectangular text frames, read left-to-right, top-to-bottom. Each comment
 * names the cell it reproduces (r1c1 .. r4c3) and, where the frame could not be
 * matched, says which part was lost and why. Nothing was designed here — a
 * shape that is not in the reference sheet is not in this file.
 *
 * Mechanics, and the three limits they impose:
 *
 * - the outline is a real outline: `bw` in layout px, `borderColor` as its
 *   colour, so it stays editable and keeps a constant weight at any zoom. It is
 *   never painted into `bgi`. The reference draws every outline as a hairline
 *   at 0.57%-1.1% of the card width, which at the 300px default is `bw: 2`;
 * - `bgi` therefore carries decoration only, no frame and no ground. It is
 *   clipped to the shape, and the outline is stroked over it. Two consequences
 *   run through the whole file: **decoration cannot spill outside the frame**,
 *   and **decoration cannot interrupt the outline**. The reference leans on
 *   both — most of its ornaments sit astride the edge with the line broken
 *   behind them. Here they sit tight against the inside of the edge instead.
 *   Per-entry comments call out the cells where that costs the most;
 * - the canvas is 1000 wide with `preserveAspectRatio="none"` and
 *   `bgs: 'stretch'`. Its height matches the entry's own aspect so one canvas
 *   unit is the same length on both axes and circles stay round: 1000x600 for
 *   the eleven 300x180 entries, 1000x846 for r2c2, whose frame is 260x220. A
 *   drawing must be written against its own entry's canvas height; `uri()`
 *   takes it as a second argument. `bw: 2` is 6.7 canvas units wide,
 *   straddling the edge, so decoration keeps at least 5 units of inset or the
 *   outline paints over it.
 *
 * `fo: 1` throughout: the reference cards are white paper on a white page, and
 * a shape fill would be a second ground under `bgi`. `backColor` stays as the
 * inert fallback that zero hides.
 *
 * Two colour rules taken from measuring the sheet: outlines are always low
 * saturation (near-black, neutral grey, dusty pink, pale blue, pale
 * periwinkle) and saturated colour only ever appears in the ornament. Four
 * cells outline themselves with a two-stop gradient, which a single
 * `borderColor` cannot express; those four take the desaturated midpoint of
 * their gradient as the ring and keep the real gradient in the ornament, where
 * `<linearGradient>` can carry it.
 *
 *
 * `p.bottom` is the one side not read off the drawing's ornament. Because the
 * frame's reserve is real geometry (the viewport ends at it), an over-generous
 * bottom is a line of text thrown away, not just slack. Entries whose ornament
 * dips into the text column keep the clearance that ornament needs; entries
 * with nothing under the text share a flat 12px optical margin off the `bw`
 * line. Both were measured by rasterising each `bgi` at frame size and
 * scanning down from the text rectangle's own bottom edge for the first pixel
 * that is not paper.
 * Shape is a lever, not a constant: `bw` strokes whichever geometry `sh`
 * names, so a feature that belongs to the outline should be a shape rather
 * than a drawing. r2c2 takes `folded-corner` for exactly that reason — its cut
 * corner and crease are the real outline, which is the only place in this file
 * where the reference's broken-frame effect survives intact.
 *
 * Corners went the other way, and the numbers are worth recording so the call
 * can be rechecked rather than retaken. They were re-scanned once, for the
 * whole sheet at once, because an earlier pass left this header and the
 * per-entry notes quoting two different sets; the table below is now the only
 * one, and the per-entry notes point at it instead of repeating a number.
 *
 * Method: the sheet is 582x469, so a cell is 176px wide and one drawn frame is
 * 152-172px wide — a 2px radius is 2px on screen. Measuring the arc directly is
 * below the noise floor at that size, so each frame corner is measured as the
 * distance from the corner's mathematical intersection to the nearest inked
 * pixel, which is `r * (sqrt(2) - 1)` for a radius `r` and settles at 0.5-0.7px
 * for a square corner. Subtracting that floor and dividing by 0.414 gives the
 * radius, +/-0.6px, i.e. +/-0.4% of the frame width. Averaged over the corners
 * that no ornament touches:
 *
 * | cell | frame W | measured r | r / W  |
 * |------|---------|------------|--------|
 * | r1c2 |   152px |     4.8px  |  3.2%  |
 * | r1c3 |   154px |       0px  |    0%  |
 * | r2c1 |   159px |     2.9px  |  1.8%  |
 * | r2c2 |   159px |       0px  |    0%  |
 * | r2c3 |   158px |       0px  |    0%  |
 * | r3c1 |   172px |     3.8px  |  2.2%  |
 * | r3c2 |   153px |       0px  |    0%  |
 * | r3c3 |   157px |       0px  |    0%  |
 * | r4c1 |   157px |     2.0px  |  1.3%  |
 * | r4c2 |   153px |       0px  |    0%  |
 * | r4c3 |   159px |       0px  |    0%  |
 *
 * (r1c1 has no frame to measure.) So four cells round their frame — r1c2, r2c1,
 * r3c1, r4c1 — in a 1.3%-3.2% band, and the other seven are square. The catalog
 * rounds all four corners in exactly two places: `rounded-rectangle` at 12% and
 * `flow-alternate-process` at 10%. Both are four to nine times the measured
 * radius and read as a pill; worse, the clip then eats the corners off the
 * inset dotted frames that r3c1 and r4c1 are built from, so the dotted frame
 * stops closing. Square is off by at most 3.2 points where the closest rounded
 * option is off by 8.8, so all four stay `rectangle`. **There is no shape in
 * the catalog in the 1.3-3.2% band.** If one is ever added, these four should
 * take it.
 *
 * `fo: 1` is likewise deliberate rather than inherited: none of the twelve
 * cells has a tinted ground, they are white paper on a white page, and a fill
 * would only restate the page. The trade is that on a coloured page these
 * frames let the page through; if the catalog ever needs that guarantee, the
 * fix is `fo: 1` with `backColor: '#FFFFFF'` across all twelve at once, not on
 * single entries, or the set stops reading as one set.
 *
 * `wm` is omitted throughout: none of these ornaments has a reading direction.
 */

/**
 * Ink sampled off the reference sheet. Nothing is invented; where a swatch
 * carries two names (`ink` vs `inkSoft`) both were measured, on the ornament
 * and on the outline of the same cell.
 */
const C = {
  // r1c1 NOTES header
  notesBlue: '#4E8AE6',
  notesRule: '#BCD5F9',
  // r1c2 rainbow
  frameSky: '#A9D5F0',
  bowRed: '#EE9182',
  bowOrange: '#F5B877',
  bowYellow: '#F7E7A2',
  bowGreen: '#C3E5A6',
  bowCyan: '#96D9D3',
  bowBlue: '#9AA9DC',
  cloudEdge: '#DCDCE6',
  // r1c3 corner disc
  framePeri: '#B3C9F5',
  discCore: '#B6CBF2',
  discHalo: '#DCE6FB',
  // r2c1 window chrome
  frameAsh: '#DFDFDF',
  barFill: '#F7F8FA',
  barRule: '#DEDEE1',
  dotRed: '#D4796E',
  dotAmber: '#E6C56F',
  dotGreen: '#82C568',
  // r2c2 plus marks
  frameGrey: '#8B8B8B',
  plusGrey: '#9A9A9A',
  highlighter: '#F7F3CB',
  // r2c3 pressed edge
  frameSilver: '#C2C2C2',
  brown: '#926C4D',
  brownLight: '#A67F5C',
  // r3c1 dotted badge
  frameIndigo: '#99ACD0',
  dotIndigo: '#C6D3EC',
  badgeIndigo: '#7D92C2',
  markIndigo: '#A8BADB',
  // r3c2 geometric marks. Its ring is the lightest of the three neutral-grey
  // frames on the sheet, not the darkest: scanned as ink per drawn pixel it is
  // 97 against r2c2's 121 and r3c3's 119, a ratio of 0.81. Held against the
  // `frameSteel` this file already gives r3c3 that ratio lands on #ADADAD.
  frameSlate: '#ADADAD',
  patchBlue: '#CFE7F7',
  chipDark: '#4E4E4E',
  hairline: '#E2E2E2',
  // r3c3 stacked card
  frameSteel: '#9A9A9A',
  backPale: '#DCEDF1',
  backSteel: '#AFBBC1',
  arrowSteel: '#B7CFD8',
  // r4c1 star lace
  frameViolet: '#C2A3E8',
  laceViolet: '#A495FF',
  lacePink: '#E17EEC',
  // r4c2 marker flag
  framePeriDeep: '#8296E2',
  markerBlue: '#2959F9',
  markerMagenta: '#DC36B3',
  white: '#FFFFFF',
  // r4c3 bulb
  frameRose: '#E9AECB',
  bulbPink: '#E5459E',
  bulbBlue: '#7FB0EC',
} as const

/**
 * Encodes one drawing into a background data URI. Every entry goes through
 * here — a pre-encoded literal is unreviewable and drifts from its source.
 *
 * `height` is the canvas height in the same units as its fixed 1000 width, and
 * must be `1000 * defaultHeight / defaultWidth` or the entry's units stop being
 * square. It defaults to the 600 that the eleven 300x180 entries use.
 *
 * `url(#id)` references stay written with a bare `#`: `encodeURIComponent`
 * turns it into `%23`, whereas a hand-written `%23` would be encoded again into
 * `%2523` and break the reference. Gradient ids are unique across the file so a
 * future merge of two drawings cannot cross-tint them.
 */
const uri = (inner: string, height = 600): string =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ${height}" ` +
    `preserveAspectRatio="none">${inner}</svg>`,
  )

/**
 * A gradient laid over the whole canvas rather than over the element that
 * references it. The reference sheet runs its two-stop ramps across the card,
 * so a short stroke has to pick up the colour at its own x, not compress the
 * whole ramp into its own length.
 */
const ramp = (
  id: string,
  from: string,
  to: string,
  vertical = false,
): string =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
  `x1="0" y1="0" x2="${vertical ? 0 : 1000}" y2="${vertical ? 600 : 0}">` +
  `<stop offset="0" stop-color="${from}"/>` +
  `<stop offset="1" stop-color="${to}"/></linearGradient>`

/** Five-pointed star as a path `d`, so it can be filled or stroked. */
const starPath = (x: number, y: number, r: number): string => {
  let d = ''
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 5 * i - Math.PI / 2
    const radius = i % 2 ? r * 0.44 : r
    d += (i ? 'L' : 'M') +
      (x + Math.cos(angle) * radius).toFixed(1) + ' ' +
      (y + Math.sin(angle) * radius).toFixed(1)
  }
  return `${d}Z`
}

/** One semicircular rainbow band, drawn as a stroked arc of its mid radius. */
const arcBand = (
  cx: number,
  cy: number,
  radius: number,
  width: number,
  fill: string,
): string =>
  `<path d="M${cx - radius} ${cy}A${radius} ${radius} 0 0 1 ${cx + radius} ` +
  `${cy}" fill="none" stroke="${fill}" stroke-width="${width}"/>`

/**
 * One cloud, drawn as a single closed path so the white fill has no internal
 * seams where its lobes overlap. `x`/`y` is the bottom-left of the base line.
 */
const cloud = (x: number, y: number): string =>
  `<path d="M${x} ${y}a17 17 0 0 1 2-33a20 20 0 0 1 34-11a16 16 0 0 1 27 12` +
  `a15 15 0 0 1-3 32Z" fill="#FFFFFF" stroke="${C.cloudEdge}" ` +
  `stroke-width="4"/>`

/** A run of plus marks on one baseline — r2c2's only top-left ornament. */
const plusRun = (
  x: number,
  y: number,
  arm: number,
  gap: number,
  count: number,
): string => {
  let d = ''
  for (let i = 0; i < count; i++) {
    const cx = x + i * gap
    d += `M${cx - arm} ${y}h${arm * 2}M${cx} ${y - arm}v${arm * 2}`
  }
  return d
}

/**
 * 本页图案登记表。`bgi` 只存 `bc:<id>` 引用，图随包发布、不进文档。
 *
 * `textInsets` 是文字安全区占框的比例，跟着图走。以前记在 `p` 里是绝对像素，
 * 只在设计尺寸上对；`folded-corner` 那款已把形状自身的 textInsets 合并进来。
 */
export const RECT_R_TEXT_BOX_ARTWORK = registerTextBoxArtwork([
  {
    id: 'rect-r-notes-rule',
    src: uri(
      `<path d="M46 90V50L74 90V50M132 50h28M146 50v40M203 50h-28v40h28` +
      `M175 70h22M250 50H222v20h28v20H222" ` +
      `fill="none" stroke="${C.notesBlue}" stroke-width="9" ` +
      `stroke-linejoin="round"/>` +
      `<rect x="89" y="50" width="28" height="40" rx="14" fill="none" ` +
      `stroke="${C.notesBlue}" stroke-width="9"/>` +
      `<path d="M278 70H955" stroke="${C.notesRule}" stroke-width="6" ` +
      `stroke-linecap="round"/>` +
      `<path d="M45 525H950" stroke="${C.notesRule}" stroke-width="6" ` +
      `stroke-linecap="round"/>`,
    ),
    textInsets: {top: 0.211111, right: 0.1, bottom: 0.166667, left: 0.126667},
  },
  {
    id: 'rect-r-rainbow-cloud',
    src: uri(
      arcBand(840, 562, 111, 10, C.bowRed) +
      arcBand(840, 562, 101, 10, C.bowOrange) +
      arcBand(840, 562, 91, 10, C.bowYellow) +
      arcBand(840, 562, 81, 10, C.bowGreen) +
      arcBand(840, 562, 71, 10, C.bowCyan) +
      arcBand(840, 562, 61, 10, C.bowBlue) +
      cloud(700, 578) +
      cloud(918, 578),
    ),
    textInsets: {top: 0.1, right: 0.066667, bottom: 0.266667, left: 0.066667},
  },
  {
    id: 'rect-r-corner-disc',
    src: uri(
      `<circle cx="58" cy="58" r="50" fill="${C.discHalo}"/>` +
      `<circle cx="58" cy="58" r="34" fill="${C.discCore}"/>` +
      `<rect x="20" y="20" width="960" height="560" fill="none" ` +
      `stroke="${C.framePeri}" stroke-width="5" stroke-dasharray="2 11" ` +
      `stroke-linecap="round"/>`,
    ),
    textInsets: {top: 0.144444, right: 0.08, bottom: 0.066667, left: 0.1},
  },
  {
    id: 'rect-r-window-bar',
    src: uri(
      `<path d="M0 0h1000v88H0Z" fill="${C.barFill}"/>` +
      `<path d="M0 88h1000" stroke="${C.barRule}" stroke-width="5"/>` +
      `<circle cx="89" cy="44" r="13" fill="${C.dotRed}"/>` +
      `<circle cx="124" cy="44" r="13" fill="${C.dotAmber}"/>` +
      `<circle cx="161" cy="44" r="13" fill="${C.dotGreen}"/>`,
    ),
    textInsets: {top: 0.222222, right: 0.086667, bottom: 0.066667, left: 0.086667},
  },
  {
    id: 'rect-r-plus-marker',
    src: uri(
      `<path d="${plusRun(75, 107, 17, 52, 4)}" stroke="${C.plusGrey}" ` +
      `stroke-width="7"/>` +
      `<rect x="102" y="204" width="578" height="20" rx="3" ` +
      `fill="${C.highlighter}"/>`,
      846,
    ),
    textInsets: {top: 0.294545, right: 0.2, bottom: 0.14, left: 0.14},
  },
  {
    id: 'rect-r-brown-press',
    src: uri(
      `<path d="M986 20V574H20" fill="none" stroke="${C.frameSilver}" ` +
      `stroke-width="5" stroke-dasharray="7 7"/>` +
      `<path d="M13 10V587H990" fill="none" stroke="${C.brown}" ` +
      `stroke-width="9"/>` +
      `<path d="M201 10l52 42" fill="none" stroke="${C.frameSilver}" ` +
      `stroke-width="5"/>` +
      `<path d="M201 10v42" stroke="${C.brownLight}" stroke-width="7"/>`,
    ),
    textInsets: {top: 0.144444, right: 0.086667, bottom: 0.072222, left: 0.106667},
  },
  {
    id: 'rect-r-dotted-badge',
    src: uri(
      `<rect x="16" y="16" width="968" height="568" fill="none" ` +
      `stroke="${C.dotIndigo}" stroke-width="5" stroke-dasharray="2 10" ` +
      `stroke-linecap="round"/>` +
      `<circle cx="56" cy="60" r="10" fill="${C.markIndigo}"/>` +
      `<circle cx="38" cy="84" r="5" fill="${C.dotIndigo}"/>` +
      `<circle cx="914" cy="548" r="26" fill="#FFFFFF" ` +
      `stroke="${C.badgeIndigo}" stroke-width="5"/>` +
      `<path d="M904 558v-12M914 558v-20M924 558v-8" ` +
      `stroke="${C.badgeIndigo}" stroke-width="5"/>` +
      `<circle cx="962" cy="520" r="5" fill="${C.markIndigo}"/>`,
    ),
    textInsets: {top: 0.166667, right: 0.093333, bottom: 0.166667, left: 0.1},
  },
  {
    id: 'rect-r-geo-marks',
    src: uri(
      `<path d="M748 8h244v74H748Z" fill="${C.patchBlue}"/>` +
      `<path d="M52 440v130h48Z" fill="${C.patchBlue}"/>` +
      `<circle cx="952" cy="546" r="34" fill="${C.patchBlue}"/>` +
      `<path d="M60 116H900M110 508H880M118 170V446M898 170V446" ` +
      `stroke="${C.hairline}" stroke-width="4"/>` +
      `<rect x="8" y="118" width="46" height="32" rx="4" ` +
      `fill="${C.chipDark}"/>` +
      `<rect x="932" y="118" width="22" height="62" rx="4" ` +
      `fill="${C.chipDark}"/>` +
      `<rect x="748" y="554" width="82" height="30" rx="4" ` +
      `fill="${C.chipDark}"/>`,
    ),
    textInsets: {top: 0.222222, right: 0.113333, bottom: 0.105556, left: 0.113333},
  },
  {
    id: 'rect-r-stacked-card',
    src: uri(
      `<path d="M12 588H988V12" fill="none" stroke="${C.backPale}" ` +
      `stroke-width="11"/>` +
      `<path d="M26 574H974V26" fill="none" stroke="${C.backSteel}" ` +
      `stroke-width="4"/>` +
      `<path d="M66 96L92 82v28ZM126 96L100 82v28Z" ` +
      `fill="${C.arrowSteel}"/>` +
      `<path d="M876 96L902 82v28ZM936 96L910 82v28Z" ` +
      `fill="${C.arrowSteel}"/>`,
    ),
    textInsets: {top: 0.188889, right: 0.133333, bottom: 0.077778, left: 0.113333},
  },
  {
    id: 'rect-r-star-lace',
    src: uri(
      `<defs>${ramp('bcRectRLace', C.laceViolet, C.lacePink)}</defs>` +
      `<rect x="15" y="15" width="970" height="570" fill="none" ` +
      `stroke="url(#bcRectRLace)" stroke-width="5" stroke-dasharray="2 11" ` +
      `stroke-linecap="round"/>` +
      `<path d="M74 44H352" stroke="url(#bcRectRLace)" stroke-width="5"/>` +
      `<g fill="none" stroke="url(#bcRectRLace)" stroke-width="5">` +
      `<circle cx="132" cy="44" r="9"/><circle cx="172" cy="44" r="9"/>` +
      `<circle cx="252" cy="44" r="9"/><circle cx="292" cy="44" r="9"/>` +
      `<path d="${starPath(212, 44, 15)}"/></g>`,
    ),
    textInsets: {top: 0.222222, right: 0.1, bottom: 0.066667, left: 0.1},
  },
  {
    id: 'rect-r-marker-flag',
    src: uri(
      `<defs>` +
      `${ramp('bcRectRMark', C.markerBlue, C.markerMagenta, true)}</defs>` +
      `<path d="M60 5v32" stroke="${C.markerBlue}" stroke-width="4"/>` +
      `<rect x="69" y="6" width="96" height="31" rx="4" ` +
      `fill="${C.markerBlue}"/>` +
      `<path d="M78 21h80" stroke="${C.white}" stroke-width="4"/>` +
      `<path d="M165 6L195 21L165 36Z" fill="${C.markerBlue}"/>` +
      `<rect x="8" y="232" width="34" height="140" rx="17" ` +
      `fill="url(#bcRectRMark)"/>` +
      `<rect x="958" y="232" width="34" height="140" rx="17" ` +
      `fill="url(#bcRectRMark)"/>` +
      `<circle cx="36" cy="566" r="12" fill="none" ` +
      `stroke="${C.markerMagenta}" stroke-width="5"/>`,
    ),
    textInsets: {top: 0.166667, right: 0.113333, bottom: 0.066667, left: 0.113333},
  },
  {
    id: 'rect-r-bulb-quote',
    src: uri(
      `<defs>${ramp('bcRectRBulb', C.bulbPink, C.bulbBlue)}</defs>` +
      `<circle cx="34" cy="78" r="13" fill="${C.bulbPink}"/>` +
      `<path d="M50 78H92M192 78H292" stroke="${C.bulbPink}" ` +
      `stroke-width="6"/>` +
      `<circle cx="310" cy="78" r="13" fill="none" ` +
      `stroke="${C.bulbPink}" stroke-width="6"/>` +
      `<path d="M326 78H972" stroke="url(#bcRectRBulb)" ` +
      `stroke-width="6"/>` +
      `<path d="M142 34a24 24 0 0 1 13 44l-3 10h-20l-3-10` +
      `a24 24 0 0 1 13-44Z" fill="none" stroke="url(#bcRectRBulb)" ` +
      `stroke-width="5"/>` +
      `<path d="M133 92h19l-3 10h-13Z" fill="${C.bulbPink}"/>` +
      `<path d="M142 23V10M122 28l-5-11M162 28l5-11M109 40l-11-6` +
      `M175 40l11-6" stroke="${C.bulbBlue}" stroke-width="4" ` +
      `stroke-linecap="round"/>`,
    ),
    textInsets: {top: 0.244444, right: 0.1, bottom: 0.066667, left: 0.106667},
  },
])

export const RECT_R_TEXT_BOX_PRESETS = [
  {
    // r1c1 — no outline at all in the reference: a blue NOTES wordmark top
    // left, a rule leaving its right side and running to the edge, and a
    // second rule across the foot. `bw: 0` is the honest reading; giving it a
    // ring would add a line the cell does not have.
    //
    // The wordmark is stroked letterforms rather than <text>, so it renders
    // identically wherever the data URI is decoded. It spans 20.6% of the card
    // width against the reference's 19.3%.
    //
    // Reference-only: the foot rule is a fifth slot the frame vocabulary does
    // not otherwise use. It is kept because it is half of this cell's design.
    // It sits at 87.5% of the card height, not on the floor: on the sheet the
    // two rules land at y=14.5 and y=88.5 of a 101px cell, so the foot rule
    // leaves 12.4% of the card below it. `p`'s bottom is 30 rather than 20 so
    // the last text line clears the rule it now sits above.
    id: 'rect-r-notes-rule',
    label: 'NOTES 题头',
    cat: 'rect',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: '#E5E5E5',
      bgi: art('rect-r-notes-rule'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r1c2 — pale blue frame, rainbow over two clouds at the bottom right.
    // Measured off the sheet against the drawn frame, not the white card: the
    // arch-plus-clouds group spans x 123-167 of a frame running 8-160, i.e.
    // 29.6% of the frame width; the arch alone is 23.3% of it, sits at 90%
    // across rather than centred, and is six bands meeting edge to edge at
    // ~1.1% of the frame width each, not three bands with white seams. This
    // reproduction is 29.1% for the group and 23.2% for the arch.
    //
    // Lost: in the reference the group runs from 75.7% to 104.6% across, so
    // the right-hand cloud and the arch's right foot hang outside the frame
    // with the rule broken behind them. `bgi` is clipped, so the whole group is
    // shifted left to end at 98.6% and the outline stays continuous. That
    // shift, not a size change, is the remaining difference.
    id: 'rect-r-rainbow-cloud',
    label: '彩虹云脚',
    cat: 'rect',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.frameSky,
      bgi: art('rect-r-rainbow-cloud'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r1c3 — a periwinkle disc on the top-left corner over a doubled frame:
    // one solid line, one dotted line offset from it. Disc is 8.5% of the card
    // width in the reference and 8.8% here.
    //
    // Lost: the reference disc is centred on the corner itself, half of it
    // outside the frame, and the two lines are offset copies of the whole
    // frame. Here the disc is tangent to the two inside edges and the dotted
    // copy became an inset frame, so the doubling reads inward rather than as
    // two stacked sheets.
    id: 'rect-r-corner-disc',
    label: '圆点起手',
    cat: 'rect',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.framePeri,
      bgi: art('rect-r-corner-disc'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r2c1 — a window chrome: near-white title band across the top edge, a
    // separator under it, three traffic lights at 8.5%/12%/15.3% across. Band
    // height is 14.7% of the card against the reference's 15%. Its fill is a
    // tint rather than ink, so the ornament's real ink is the separator plus
    // the three discs, about 0.9% of the card area.
    //
    // Lost: the reference rounds its corners — 1.8% of the frame width, see
    // the radius table in the file header. The catalog's rounded rectangle is
    // 12%, so this stays square.
    id: 'rect-r-window-bar',
    label: '窗口便签',
    cat: 'rect',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.frameAsh,
      bgi: art('rect-r-window-bar'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r2c2 — mid-grey frame with its top-right corner folded back, a run of
    // four grey plus marks at the top left and a pale yellow highlighter
    // stripe under them. Plus run spans 19.0% of the frame width (sheet:
    // 18.9%), each mark 3.5% (3.8%), plus centres at 12.6% of the frame height
    // (12.7%), stripe from 10.2% to 68% at 2.4% of the frame height thick.
    // That last number is the one that moved: the stripe was 5% of the height,
    // and integrating its ink across the sheet gives 2.3px on an 83px-tall
    // frame, i.e. 2.7%.
    //
    // The fold is the shape, not the drawing: `folded-corner` cuts the corner
    // out of the outline itself and carries the crease on its `detailPath`,
    // which the block strokes with the same `borderColor` and `bw`. So the
    // fold stays editable, keeps a constant weight at any zoom, and the
    // outline genuinely stops at the cut — the one place in this file where
    // the reference's broken-line effect is reproduced rather than
    // approximated. Drawing it into `bgi` could not have done any of that.
    //
    // Geometry note, and the reason this is the one entry that is not 300x180.
    // The catalog cuts at x=760/y=240 of the shape's own 1000x1000 box, so the
    // notch is always 24% of the frame width by 24% of its height and its
    // crease angle is exactly `atan(H/W)` — the frame's aspect *is* the fold's
    // angle, and no drawing can change it. The sheet's fold is 24.6x25.5px on
    // a 159x83 frame: a 46-degree dog ear. At 300x180 the same shape produced
    // a 31-degree wedge, 1.2 times the reference's area once both are put on
    // the same frame, and visibly the loudest thing on the card. 260x220
    // brings the crease to 40.2 degrees. The notch stays 24% of the width
    // against the sheet's 15.5%: that fraction is fixed by the catalog, and
    // only a new shape can close it.
    //
    // The same change buys back the text. `p` is measured against this shape's
    // `textInsets` rather than the frame: {top .14, right .2, bottom .14,
    // left .14} places the text box at 30.8/52/30.8/36.4 px on 260x220, and
    // `p` adds to that. Only the top needs anything — the stripe ends at
    // canvas y=224 of 846, i.e. 58.2px down, so the padding is
    // 58.2 - 30.8 + 6 of air = 34px, leaving 124px of the 158px content box
    // for text. At 300x180 the thicker stripe forced `p` to 49 and left 80.6px,
    // which is three lines: the fourth line of a four-line body was cut off.
    // The left inset is still the shape's 14% where the sheet indents 7.2%;
    // padding cannot be negative, so the text sits 6.8 points further in.
    id: 'rect-r-plus-marker',
    label: '加号荧光',
    cat: 'rect',
    defaultWidth: 260,
    defaultHeight: 220,
    props: {
      sh: 'folded-corner',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.frameGrey,
      bgi: art('rect-r-plus-marker'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r2c3 — three stacked edges, not two. Rescanning the cell column by
    // column: a solid grey line on the top and left, a *dashed* grey line down
    // the right at x=167 alternating 176/212 luminance the whole height, and a
    // warm brown bar down the left and along the foot offset a further 2px out
    // and down. Plus a small pennant on the top edge at 20% across. The brown
    // samples #926C4D and runs 2.3px, 1.4% of the frame width.
    //
    // The dashed offset frame was missing here and unrecorded; it is now drawn
    // as a dashed right-and-foot rule just inside the outline.
    //
    // Lost: the reference offsets both the brown and the dashed line outside
    // the solid frame, as a second and third sheet showing past its edge, and
    // hangs the pennant above the top edge. All three are pulled inside, so
    // the brown and the dashes read as inner rules rather than as depth, and
    // the pennant hangs down from the edge instead of standing on it. The
    // reference also dashes the right edge *instead of* stroking it solid;
    // `bw` stroke the whole outline, so this cell shows a solid right edge with
    // the dashed one just inside it.
    id: 'rect-r-brown-press',
    label: '褐边压印',
    cat: 'rect',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.frameSilver,
      bgi: art('rect-r-brown-press'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r3c1 — soft indigo frame with a dotted line just inside it, a pair of
    // small discs at the top left and a bar-chart badge at the bottom right.
    // Badge is 5.2% of the card width against the reference's 4%.
    //
    // Lost: the reference rounds its corners — 2.2% of the frame width, the
    // widest radius on the sheet after r1c2; see the radius table in the file
    // header. It also hangs the badge astride the bottom rule with the rule
    // broken behind it. Square corners, and the badge sits fully inside.
    id: 'rect-r-dotted-badge',
    label: '双线徽章',
    cat: 'rect',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.frameIndigo,
      bgi: art('rect-r-dotted-badge'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r3c2 — the technical one: a grey frame, a pale blue patch under the top
    // right, charcoal chips on three edges, hairline rules inset from top and
    // foot, a pale blue triangle low on the left and a pale blue disc at the
    // bottom right. Four corners are occupied; dropping any of them leaves a
    // plain grey box, so all four are kept even though two of them sit outside
    // the ornament slots the rest of the file uses.
    //
    // Two corrections from a rescan. The ring is the *lightest* neutral grey
    // on the sheet, not the darkest — see `frameSlate`. And the right-hand
    // chip sits at 93.2%-95.8% of the frame width, not 85.6%-87.8%: at the
    // old x it landed 9px inside the text box's right edge and 317px of it
    // overlapped the body text. At the measured x it clears the text by 14px.
    //
    // Lost: every chip in the reference straddles its edge with the frame
    // broken behind it, and the top-right patch bleeds past the corner. Here
    // the frame runs unbroken over all of them.
    id: 'rect-r-geo-marks',
    label: '几何标记',
    cat: 'rect',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.frameSlate,
      bgi: art('rect-r-geo-marks'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r3c3 — a grey card with a second card showing behind it at the right and
    // foot, and two small steel-blue double arrowheads at the top corners.
    // Arrowheads are 6% of the card width, matching the sheet.
    //
    // Lost: the second card is behind and outside the first in the reference.
    // Clipped to the shape it can only be drawn inside, so the pale band and
    // its steel edge read as an inner double rule and the depth is inverted.
    // The right-hand arrowhead also sits in the top-right corner, which is not
    // one of the ornament slots used elsewhere here; it is kept because the
    // pair is symmetric in the reference.
    id: 'rect-r-stacked-card',
    label: '叠层卡片',
    cat: 'rect',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.frameSteel,
      bgi: art('rect-r-stacked-card'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r4c1 — violet-to-pink frame with a dotted copy inside it, and a lace of
    // two rings, a star and two more rings riding the top edge left of centre,
    // spanning 13%-28% across as measured.
    //
    // Lost: the reference outlines with the gradient itself, which one
    // `borderColor` cannot hold; the ring takes the desaturated midpoint of
    // that ramp and the real ramp stays on the dotted copy and the lace. The
    // lace also rises above the top edge in the reference, on a line that
    // steps up out of the frame; here it rides the inside of the edge. Corners
    // are square where the reference rounds them at 1.3% of the frame width,
    // the tightest radius on the sheet; see the table in the file header.
    id: 'rect-r-star-lace',
    label: '星点花边',
    cat: 'rect',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.frameViolet,
      bgi: art('rect-r-star-lace'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r4c2 — blue-to-magenta frame with a highlighter marker laid on the top
    // edge at the left (tick, striped barrel, solid nib), purple tabs on the
    // left and right edges at mid height, and a small ring near the foot.
    // Rescanned: the marker spans x 17.9-37.1 of a frame running 11-164, i.e.
    // 4.5%-17.0% across and 12.5% of the frame width, where this was 7.8%-28.8%
    // and 21% wide. Tabs are 3.4% wide and 23% tall.
    //
    // The marker's vertical centre is 19.85px against a top rule at 20px: it is
    // centred on the edge, not hung below it. It cannot be, because `bgi` is
    // clipped, so it now sits with its top 1.5px inside the outline — touching
    // the edge instead of floating 12.9px under it.
    //
    // Lost: the same gradient-outline problem as r4c1 — the ring is the
    // desaturated periwinkle midpoint and the ramp stays on the tabs. The
    // marker and the tabs straddle their edges in the reference with the frame
    // broken behind them; here they are tucked inside. The foot ring sits at
    // the bottom left, which is not a slot used elsewhere in this file, but it
    // is a 2.4%-wide mark and it is in the cell.
    id: 'rect-r-marker-flag',
    label: '标记旗帜',
    cat: 'rect',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.framePeriDeep,
      bgi: art('rect-r-marker-flag'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r4c3 — a pink-to-blue frame whose top rule carries a filled node, a
    // rayed light bulb at 13% across, an open ring, and then the rest of the
    // rule running out to the right edge in the gradient.
    //
    // Two rescans. The bulb and its rays span x 22-37 of a frame running
    // 7.5-166.5, i.e. 8.8% of the frame width, where this drew 12.4%; the
    // group is now 8.8%. And the sheet has exactly one horizontal line here —
    // the frame's own top edge is the rule, with the bulb sitting on it. An
    // outline cannot carry ornament, so the rule has to be a second line
    // inside the frame, and the two read as a ladder if they are far apart.
    // Narrowing the bulb shortens what has to fit above the rule, which is
    // what lets the rule move from 19.7% of the frame height to 13%: the rays
    // now tuck 3px under the top edge and the gap between the two lines drops
    // from 33.5px to 21.5px. `p`'s top follows it up, 56 to 44, so the body
    // keeps the same 20.6px of air under the rule.
    //
    // Lost: the gradient outline again — pink at the left, blue at the right
    // in the reference, a soft rose ring here, with the ramp kept on the rule
    // and the bulb. The reference also lifts the bulb and its rays above the
    // top edge, entirely outside the frame; `bgi` is clipped, so the ornament
    // is inside and the rule cannot merge with the edge.
    id: 'rect-r-bulb-quote',
    label: '灯泡引言',
    cat: 'rect',
    defaultWidth: 300,
    defaultHeight: 180,
    props: {
      sh: 'rectangle',
      bw: 2,
      fo: 1,
      backColor: '#FFFFFF',
      borderColor: C.frameRose,
      bgi: art('rect-r-bulb-quote'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
] as const satisfies readonly TextBoxPresetDefinition[]
