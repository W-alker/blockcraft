import {
  registerTextBoxArtwork,
  textBoxArtworkRef as art,
  type TextBoxArtwork,
} from './artwork'
import type {TextBoxPresetDefinition} from '../text-box.presets'

/**
 * Bubble tab, traced one-for-one from the twelve-cell reference sheet
 * (`气泡`, 4 rows x 3 columns). Every entry below names the cell it copies and
 * the parts of that cell it could not reach; nothing here is invented.
 *
 * Why this tab is built differently from the outline/rect tabs:
 *
 * A speech balloon *is* its silhouette. There is no rectangle with an ornament
 * hung off it to separate — the wobble, the lobes, the pixel staircase and the
 * tail are the design. A real `bw` outline can only trace the catalog shape's
 * own geometry, and none of these twelve silhouettes exist there, so every
 * entry sets `sh: 'rectangle'` with `bw: 0` and `fo: 0` and puts the whole
 * picture in `bgi`. `backColor` / `borderColor` remain as inert fallbacks the
 * two zeroes keep off screen. This is deliberate and is the opposite of the
 * choice made in the outline and rect tabs, where the frame really is a
 * rectangle and the border belongs on `bw`.
 *
 * Canvas and reserve:
 *
 * - Every drawing is authored in a 300x200 source canvas and painted through a
 *   tight per-entry viewport. The viewport removes transparent card reserve so
 *   the visible silhouette follows the text-box frame, while keeping a small
 *   anti-aliasing gutter around detached strokes and ornaments.
 * - Frames are 360x240; 420x280 for the one entry whose silhouette leaves the
 *   narrowest column; 280x240 for the two whose reference mass is a circle. A
 *   frame's own ratio decides how the 3:2 canvas is squashed. The comment on
 *   every entry quotes the safe reserve in *canvas* units, because that is the
 *   space the drawing was solved in; the artwork registry stores the result as
 *   four frame fractions so it follows any later resize.
 * - A 280x240 frame also squashes circles into upright ovals, so the round
 *   ornaments in those two entries ship as `<ellipse>` with `rx/ry = 1.286`
 *   (= 1.2/0.9333) and land on screen as circles.
 * - `bgs: 'stretch'` is mandatory. Any other fit letterboxes the drawing and
 *   the tail stops meeting the balloon.
 * - Every artwork owns `textInsets`, so the editable region follows the visible
 *   balloon rather than the fallback rectangle. Each reserve is solved against
 *   the *innermost* edge of the curve at the text rectangle's own corners, not
 *   against the silhouette's bounding box: on an oval whose box top is y=11,
 *   the boundary directly above the first character sits at y=29, and a reserve
 *   cut to the box runs the outline straight through that line. Three entries
 *   here have an inner ornament — a dotted ring, a dashed rule, a hatch band —
 *   that is closer in still, and those are measured against the ornament.
 * - Decorated entries keep `p` at zero. Otherwise the style-specific safe area
 *   and a second fixed-pixel reserve would stack and shrink the editor twice.
 *
 * Every entry pins `wm: ['h']`. Tails are baked into a drawing that stretches
 * but never rotates, so a tall frame would smear one into a spike pointing the
 * wrong way. Vertical bubbles are a product-level non-goal.
 */

/**
 * Only hues measured off the reference sheet. Names say where they came from,
 * because "ink" and "plum" are otherwise indistinguishable at review time.
 */
const C = {
  white: '#FFFFFF',
  ink: '#1C1C1C',
  plum: '#443B4E',
  crimson: '#7E1B26',
  slate: '#24242C',
  mint: '#4CC79A',
  indigo: '#4E5DD8',
  cloud: '#3C4149',
  violet: '#5F589B',
  matcha: '#CBEBA8',
  charcoal: '#2E2E33',
  steel: '#5C6478',
  haze: '#E1EAF7',
  navy: '#333F63',
  navyTint: '#C9D8EF',
  amber: '#EFA45C',
  leaf: '#A9D45E',
  gold: '#F6D95E',
  sun: '#F2C230',
  ash: '#C9CDD6',
  mist: '#DFE2E7',
  sky: '#6E9BE0',
  skyTint: '#CFDDF2',
} as const

/**
 * Encodes one drawing into a background data URI. Every entry goes through
 * here — a pre-encoded literal is unreviewable and rots the moment a colour
 * moves. `#` is written bare inside the markup so this call escapes it once;
 * writing `%23` by hand double-encodes into `%2523` and kills the reference.
 */
const SOURCE_WIDTH = 300
const SOURCE_HEIGHT = 200
type ArtworkViewport = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
]

/**
 * Tight paint bounds in source-canvas units. These include a three-unit optical
 * gutter beyond the measured alpha bounds, so strokes stay intact without the
 * old card-sized transparent reserve becoming part of the selected frame.
 */
const VIEWPORTS = {
  'bubble-r-ink-shout': [10, 3, 289, 171],
  'bubble-r-pixel-frame': [30, 20, 250, 165],
  'bubble-r-crimson-oval': [13, 8, 274, 171],
  'bubble-r-slant-banner': [31, 33, 250, 142],
  'bubble-r-blue-emboss': [19, 1, 276, 180],
  'bubble-r-cloud-spike': [16, 7, 271, 187],
  'bubble-r-sketch-violet': [19, 14, 262, 174],
  'bubble-r-solid-mint': [15, 5, 265, 184],
  'bubble-r-blob-halo': [9, 2, 284, 197],
  'bubble-r-dashed-note': [40, 20, 226, 176],
  'bubble-r-pixel-cloud': [11, 5, 282, 188],
  'bubble-r-solid-gold': [15, 7, 262, 188],
} as const satisfies Record<string, ArtworkViewport>

type BubbleArtworkId = keyof typeof VIEWPORTS
type ArtworkInsets = TextBoxArtwork['textInsets']

const fittedInsets = (
  insets: ArtworkInsets,
  [x, y, width, height]: ArtworkViewport,
): ArtworkInsets => ({
  top: (insets.top * SOURCE_HEIGHT - y) / height,
  right: (x + width - (1 - insets.right) * SOURCE_WIDTH) / width,
  bottom: (y + height - (1 - insets.bottom) * SOURCE_HEIGHT) / height,
  left: (insets.left * SOURCE_WIDTH - x) / width,
})

const uri = (inner: string, [x, y, width, height]: ArtworkViewport): string => {
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" ` +
        `preserveAspectRatio="none">${inner}</svg>`,
    )
  )
}

const viewportFor = (id: BubbleArtworkId): ArtworkViewport => VIEWPORTS[id]

/**
 * The 8-bit four-petal sparkle used by the two pixel entries: a 5x5 cell
 * diamond with its corners knocked out, written as one relative path so the
 * staircase cannot drift the way sixteen separate `<rect>`s would. `(x, y)` is
 * the top-left corner of the crown cell; the figure spans `[x-2u, x+3u]` by
 * `[y, y+5u]` and its centre cell is `[x, x+u]` by `[y+2u, y+3u]`.
 */
const spark = (x: number, y: number, u: number): string =>
  `<path d="M${x} ${y}h${u}v${u}h${u}v${u}h${u}v${u}h-${u}v${u}h-${u}v${u}` +
  `h-${u}v-${u}h-${u}v-${u}h-${u}v-${u}h${u}v-${u}h${u}z"/>`

/** The lighter core cell of a `spark`, drawn in the second colour pass. */
const sparkCore = (x: number, y: number, u: number): string =>
  `<rect x="${x}" y="${y + u * 2}" width="${u}" height="${u}"/>`

/**
 * r2c2 and r4c1 both paint their silhouette twice — once displaced as a flat
 * colour shadow, once as the body — so the outline lives in one constant
 * instead of two strings that can drift apart. Same reason for the four below.
 */
const EMBOSS = 'M47 32H263V143H233L231 171 211 143H47Z'
const NOTE =
  'M66 24H234A22 22 0 0 1 256 46V120A22 22 0 0 1 234 142H198L186 186 170 142' +
  'H66A22 22 0 0 1 44 120V46A22 22 0 0 1 66 24Z'

/** r3c2: the mass and its displaced outline trace the same balloon. */
const MINT =
  'M18 85A127 72 0 1 1 218 144Q206 170 182 186Q168 172 150 158A127 72 0 0 1 ' +
  '18 85Z'

/** r3c3: fill, pale halo and hairline all ride this one contour. */
const BLOB =
  'M30 96C38 58 82 26 142 19 210 18 278 40 282 104 292 156 240 184 168 181 ' +
  '132 182 108 166 92 158L80 193 74 150C45 139 29 124 30 96Z'

/**
 * r4c2: body, offset shadow and the dotted inner ring share this staircase.
 * Three top lobes and three bottom ones, every corner on a 10-unit cell, so
 * the silhouette reads as a cloud and not as a lumpy
 * hexagon — an earlier pass ran one long diagonal staircase up each shoulder
 * and lost the lobes entirely at picker size.
 *
 * The `H130V180H110` step near the end is the tail: a 20x20 notch hanging off
 * the floor at x=110..130, which is 37%..43% of the canvas and matches where
 * the reference drops its own stepped tail. It goes here rather than in the
 * entry because the ring is a scaled copy of this same string and has to
 * follow the tail down; the dash phase is unaffected because the path starts
 * at the top left and reaches the tail last.
 */
const PIXEL_CLOUD =
  'M50 90V80H60V70H70V60H100V70H110V50H120V30H140V20H190V30H200V50H210V60H230' +
  'V50H250V60H260V70H270V130H260V140H250V150H220V160H190V170H170V180H150V170' +
  'H140V160H130V180H110V150H80V140H60V130H50V110H40V90Z'

/** r3c1: three speed capsules, stroked twice to read as outlines not bars. */
const SPEED = 'M28 24 62 40M26 56H62M28 88 62 72'

/**
 * The tab's drawings. Registered here rather than inlined into each preset's
 * `bgi`: a reference costs 25 bytes in the document, the drawing itself costs
 * up to 1.6 KB and would ride along in every Yjs sync, undo entry and export.
 *
 * `textInsets` moves here with the drawing because the text-safe frame belongs
 * to it and is a proportion of the frame. Held as fixed px in `p` it was only
 * correct at the size each entry was drawn for — every other frame ran its text
 * through the balloon. The values below are that same measurement expressed as
 * fractions, so they now survive any resize.
 */
export const BUBBLE_R_TEXT_BOX_ARTWORK = registerTextBoxArtwork([
  {
    id: 'bubble-r-ink-shout',
    src: uri(
      `<path d="M15 79C15 39 77 11 141 11 190 11 232 24 252 46 261 56 262 68 ` +
        `260 80 257 112 208 141 145 146L105 146 56 168 81 144C39 139 15 115 15 ` +
        `79Z" fill="${C.white}" stroke="${C.ink}" stroke-width="2.6" ` +
        `stroke-linejoin="round"/>` +
        `<g fill="none" stroke="${C.ink}" stroke-linecap="round">` +
        `<path d="M246 107Q226 124 197 136" stroke-width="3.8"/>` +
        `<path d="M250 30 276 8M262 48 290 38M268 66 294 60" ` +
        `stroke-width="2.4"/>` +
        `<path d="M28 84Q34 58 52 42M226 106Q216 122 198 129" ` +
        `stroke-width="1.4"/></g>`,
      viewportFor('bubble-r-ink-shout'),
    ),
    textInsets: fittedInsets(
      {top: 0.145833, right: 0.283333, bottom: 0.358333, left: 0.2},
      viewportFor('bubble-r-ink-shout'),
    ),
  },
  {
    id: 'bubble-r-pixel-frame',
    src: uri(
      `<path d="M45 25H255V35H265V45H275V125H265V135H255V145H215V180H205V170` +
        `H195V160H185V150H175V145H45V135H35V45H45Z" fill="${C.white}" ` +
        `stroke="${C.plum}" stroke-width="4"/>` +
        `<g fill="${C.amber}">` +
        spark(250, 44, 5.5) +
        spark(56, 98, 4) +
        spark(246, 114, 2.5) +
        spark(62, 36, 3) +
        `</g><g fill="${C.gold}">` +
        sparkCore(250, 44, 5.5) +
        sparkCore(56, 98, 4) +
        `</g>`,
      viewportFor('bubble-r-pixel-frame'),
    ),
    textInsets: fittedInsets(
      {top: 0.170833, right: 0.216667, bottom: 0.308333, left: 0.247222},
      viewportFor('bubble-r-pixel-frame'),
    ),
  },
  {
    id: 'bubble-r-crimson-oval',
    src: uri(
      `<path d="M18 82C18 42 82 13 152 13 222 13 282 44 282 84 282 121 231 ` +
        `148 160 150L138 151Q131 162 126 172Q121 160 112 149C56 144 18 118 18` +
        ` 82Z" fill="${C.white}" stroke="${C.crimson}" stroke-width="3.4"/>`,
      viewportFor('bubble-r-crimson-oval'),
    ),
    textInsets: fittedInsets(
      {top: 0.154167, right: 0.233333, bottom: 0.345833, left: 0.233333},
      viewportFor('bubble-r-crimson-oval'),
    ),
  },
  {
    id: 'bubble-r-slant-banner',
    src: uri(
      `<defs><linearGradient id="v" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="#6D28D9"/>` +
        `<stop offset="1" stop-color="#A855F7"/></linearGradient></defs>` +
        `<path d="M46 128H130L118 168H34Z" fill="url(#v)"/>` +
        `<path d="M100 36H260L256 52H96Z" fill="${C.mint}"/>` +
        `<path d="M72 50H277L253 143H233L213 170 210 143H48Z" ` +
        `fill="${C.white}" stroke="${C.slate}" stroke-width="1.4"/>` +
        `<path d="M48 143H210L213 170 233 143H253" fill="none" ` +
        `stroke="${C.slate}" stroke-width="3.2" stroke-linejoin="round"/>`,
      viewportFor('bubble-r-slant-banner'),
    ),
    textInsets: fittedInsets(
      {top: 0.270833, right: 0.166667, bottom: 0.304167, left: 0.247222},
      viewportFor('bubble-r-slant-banner'),
    ),
  },
  {
    id: 'bubble-r-blue-emboss',
    src: uri(
      `<circle cx="40" cy="50" r="16" fill="${C.mist}"/>` +
        `<g fill="none" stroke="${C.ash}" stroke-width="2.4" ` +
        `stroke-linecap="round" stroke-dasharray="0 7">` +
        `<path d="M24 128h122M24 138h122M24 148h122M24 158h122"/>` +
        `<path d="M170 14h116M170 24h116M170 34h116"/></g>` +
        `<path d="${EMBOSS}" fill="${C.indigo}" transform="translate(7,7)"/>` +
        `<path d="${EMBOSS}" fill="${C.white}" stroke="${C.slate}" ` +
        `stroke-width="1.4"/>` +
        `<g fill="none" stroke-width="1.6" stroke-linecap="round">` +
        `<path d="M86 8 91 15 86 22 81 15Z" stroke="${C.sun}"/>` +
        `<path d="M58 6 63 15 53 15Z" stroke="${C.indigo}"/>` +
        `<path d="M282 61 287 70 277 70Z" stroke="${C.sun}"/>` +
        `<path d="M281 112 285 117 281 122 277 117Z" stroke="${C.indigo}"/>` +
        `<path d="M276 146 288 139" stroke="${C.indigo}" ` +
        `stroke-width="7"/></g>`,
      viewportFor('bubble-r-blue-emboss'),
    ),
    textInsets: fittedInsets(
      {top: 0.2, right: 0.161111, bottom: 0.316667, left: 0.194444},
      viewportFor('bubble-r-blue-emboss'),
    ),
  },
  {
    id: 'bubble-r-cloud-spike',
    src: uri(
      `<g fill="none" stroke="${C.cloud}" stroke-linecap="round">` +
        `<path d="M147 34A44 44 0 0 1 218 50L252 24 243 70A14 14 0 0 1 257 ` +
        `96A30 30 0 0 1 220 140A44 44 0 0 1 147 158A44 44 0 0 1 74 140A30 30 ` +
        `0 0 1 43 96A30 30 0 0 1 74 52A44 44 0 0 1 147 34Z" ` +
        `fill="${C.white}" stroke-width="2.4"/>` +
        `<path d="M22 88A34 34 0 0 1 52 44M92 22A58 58 0 0 1 150 16M74 180A56 ` +
        `56 0 0 1 136 190M228 166A38 38 0 0 0 262 128M272 44A34 34 0 0 1 282 ` +
        `74" stroke-width="1.8"/></g>`,
      viewportFor('bubble-r-cloud-spike'),
    ),
    textInsets: fittedInsets(
      {top: 0.279167, right: 0.205556, bottom: 0.320833, left: 0.230556},
      viewportFor('bubble-r-cloud-spike'),
    ),
  },
  {
    id: 'bubble-r-sketch-violet',
    src: uri(
      `<g fill="none" stroke="${C.violet}" stroke-linecap="round">` +
        `<path d="M103 18H264A13 13 0 0 1 277 31V117A13 13 0 0 1 264 130H240Q` +
        `244 155 250 183Q214 157 192 130H103A13 13 0 0 1 90 117V31A13 13 0 0 ` +
        `1 103 18Z" fill="${C.white}" stroke-width="1.6"/>` +
        `<g stroke-width="1"><path d="M267 34V112A10 10 0 0 1 257 122H240M190 ` +
        `122H107"/>` +
        `<path d="M275 34l-8 7M275 42l-8 7M275 50l-8 7M275 58l-8 7M275 66l-8 ` +
        `7M275 74l-8 7M275 82l-8 7M275 90l-8 7M275 98l-8 7M275 106l-8 7M275 ` +
        `114l-8 7M106 129l7-8M118 129l7-8M130 129l7-8M142 129l7-8M154 129l7-8` +
        `M166 129l7-8M178 129l7-8M188 129l6-7M242 129l7-8M252 129l7-8M226 ` +
        `138l9 4M230 150l9 4M234 162l9 4M238 174l7 4"/></g>` +
        `<path d="${SPEED}" stroke-width="7"/>` +
        `<path d="${SPEED}" stroke="${C.white}" stroke-width="4.4"/></g>`,
      viewportFor('bubble-r-sketch-violet'),
    ),
    textInsets: fittedInsets(
      {top: 0.141667, right: 0.127778, bottom: 0.408333, left: 0.333333},
      viewportFor('bubble-r-sketch-violet'),
    ),
  },
  {
    id: 'bubble-r-solid-mint',
    src: uri(
      `<path d="${MINT}" fill="${C.matcha}"/>` +
        `<path d="${MINT}" fill="none" stroke="${C.charcoal}" ` +
        `stroke-width="1.8" transform="translate(4,-4)"/>`,
      viewportFor('bubble-r-solid-mint'),
    ),
    textInsets: fittedInsets(
      {top: 0.179167, right: 0.228571, bottom: 0.345833, left: 0.207143},
      viewportFor('bubble-r-solid-mint'),
    ),
  },
  {
    id: 'bubble-r-blob-halo',
    src: uri(
      `<path d="${BLOB}" fill="${C.haze}"/>` +
        `<path d="${BLOB}" fill="${C.white}" ` +
        `transform="translate(153 98)scale(.95)translate(-153 -98)"/>` +
        `<g fill="none" stroke="${C.steel}" stroke-width="1.6" ` +
        `stroke-linecap="round"><path d="${BLOB}"/>` +
        `<path d="M20 66Q32 36 60 18M182 6Q222 12 250 30M288 116Q292 140 278 ` +
        `158M108 190Q146 200 184 188M14 118Q10 138 20 156"/></g>`,
      viewportFor('bubble-r-blob-halo'),
    ),
    textInsets: fittedInsets(
      {top: 0.229167, right: 0.213889, bottom: 0.2375, left: 0.286111},
      viewportFor('bubble-r-blob-halo'),
    ),
  },
  {
    id: 'bubble-r-dashed-note',
    src: uri(
      `<path d="${NOTE}" fill="${C.skyTint}" transform="translate(7,7)"/>` +
        `<path d="${NOTE}" fill="${C.white}" stroke="${C.slate}" ` +
        `stroke-width="1.4"/>` +
        `<rect x="53" y="33" width="194" height="100" rx="14" fill="none" ` +
        `stroke="${C.sky}" stroke-width="1.3" stroke-dasharray="6 5"/>`,
      viewportFor('bubble-r-dashed-note'),
    ),
    textInsets: fittedInsets(
      {top: 0.208333, right: 0.205556, bottom: 0.370833, left: 0.205556},
      viewportFor('bubble-r-dashed-note'),
    ),
  },
  {
    id: 'bubble-r-pixel-cloud',
    src: uri(
      `<g stroke-width="4"><path d="${PIXEL_CLOUD}" fill="${C.navyTint}" ` +
        `stroke="${C.navyTint}" transform="translate(8,8)"/>` +
        `<path d="${PIXEL_CLOUD}" fill="${C.white}" stroke="${C.navy}"/></g>` +
        `<path d="${PIXEL_CLOUD}" fill="none" stroke="${C.amber}" ` +
        `stroke-width="3" stroke-dasharray="0 9" stroke-linecap="round" ` +
        `transform="translate(155 100)scale(.93)translate(-155 -100)"/>` +
        `<g fill="${C.leaf}"><path d="M248 14q16-12 20 4-14 14-20-4z"/>` +
        `<path d="M14 152q14-12 18 4-13 13-18-4z"/></g>` +
        `<g fill="${C.amber}"><circle cx="286" cy="58" r="4"/>` +
        `<circle cx="48" cy="176" r="4"/></g>`,
      viewportFor('bubble-r-pixel-cloud'),
    ),
    textInsets: fittedInsets(
      {top: 0.35, right: 0.207143, bottom: 0.289286, left: 0.3},
      viewportFor('bubble-r-pixel-cloud'),
    ),
  },
  {
    id: 'bubble-r-solid-gold',
    src: uri(
      `<g fill="${C.gold}"><ellipse cx="146" cy="92" rx="128" ry="82"/>` +
        `<ellipse cx="245" cy="174" rx="23" ry="18"/></g>` +
        `<path d="M226 40Q246 52 252 72" fill="none" stroke="${C.white}" ` +
        `stroke-width="8" stroke-linecap="round"/>` +
        `<ellipse cx="258" cy="92" rx="7" ry="5.5" fill="${C.white}"/>`,
      viewportFor('bubble-r-solid-gold'),
    ),
    textInsets: fittedInsets(
      {top: 0.170833, right: 0.3, bottom: 0.270833, left: 0.185714},
      viewportFor('bubble-r-solid-gold'),
    ),
  },
])

export const BUBBLE_R_TEXT_BOX_PRESETS = [
  {
    // r1c1 — hand-drawn shout balloon. One closed run whose four walls never
    // line up, tail struck off to the lower left as three straight strokes
    // rather than a curve, three impact strokes fanned off the upper right,
    // two hairline shine arcs inside.
    //
    // Every weight here is the reference's halved. Tracing the cell literally
    // put the rim at 5.2 units (2.1% of the 245-wide balloon) and the heaviest
    // impact stroke at 7.6, which lands at 6.2 and 9.1 real px on the default
    // frame — three to four times the `bw: 2` the outline and rect tabs use,
    // and unlike those this tab's ink is inside `bgi`, so nothing in the
    // toolbar can bring it down afterwards. The four widths keep their ratios
    // so the marker taper survives; only the floor moved, to 1.4, which is the
    // thinnest line that still holds together at the 62px picker size.
    //
    // Two details keep it from reading as one smooth ellipse, which is what an
    // earlier three-segment version did. The rim is cut into four cubics with a
    // deliberately tight shoulder at (252,46)-(260,80), so the upper right
    // kinks the way a marker does when the hand changes direction. And a short
    // 3.8-wide arc is restruck along the lower right *on* the rim (its ends and
    // midpoint sit on the 2.6 contour at t=0.3/0.5/0.7, so it thickens the line
    // instead of bulging outside it) — the cell's own pressure swell. The
    // lower-right shine arc moved 8 units inward to clear it.
    //
    // The tail tip is at (56,168), 22 units below the mouth. The reference's
    // hangs 8 card px (16 canvas units) below its rim; the first pass put the
    // tip at (44,185), 39 units down and past the balloon's own left wall,
    // which read as a lightning bolt rather than a speech tail.
    //
    // Canvas reserve [29, 85, 72, 60]: the column spans x=60..215 and on an
    // oval of rx=122.5 / ry=67.5 about (137.5, 78.5) the rim above its corners
    // is at y=26.2 — not at the box top of y=11 — plus half the stroke.
    //
    // Not reachable: the reference lets the impact strokes float outside the
    // balloon's card. `bgi` is clipped to the frame, so the balloon is pulled
    // in from the right and the strokes sit in the corner it vacates.
    id: 'bubble-r-ink-shout',
    label: '手绘吼泡',
    cat: 'bubble',
    wm: ['h'],
    defaultWidth: 360,
    defaultHeight: 240,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 0,
      backColor: '#FFFFFF',
      borderColor: '#000000',
      bgi: art('bubble-r-ink-shout'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r1c2 — 8-bit frame. The whole outline is one stepped polyline whose every
    // corner is a square staircase rather than a rounded join; the tail is that
    // staircase walked downward on its left flank against a flat right wall,
    // right of centre as in the cell.
    //
    // The stroke is 4 units, not the 10 that would match the staircase's own
    // cell. One full cell renders at 12 real px — six times the `bw: 2` the
    // other tabs use, and this tab's ink lives in `bgi` where the toolbar
    // cannot reach it. The staircase is geometry, so the frame still reads as
    // 8-bit at 4; it just stops being the heaviest object on the canvas.
    // Four orange four-petal sparkles, 5.5 / 4 / 3 / 2.5 cells and the two
    // largest with lighter cores, sit in the wall strips the way the sheet
    // scatters them — one per corner. The 3-cell one at the top left is the
    // reference's smallest cluster; without it three corners carried a sparkle
    // and the fourth read as an accidental gap.
    //
    // Canvas reserve [34, 65, 62, 74]: inner walls are x=50 at the corner
    // steps, y=30 at the ceiling and y=140 at the floor, but the binding edges
    // are the sparkles — x=239 on the right, x=68 on the left. Parking them
    // over the wall instead, as a first pass did, makes the frame look chewed.
    //
    // Not reachable: the reference's sparkles cross the frame and spill
    // outside it. Clipping keeps them inside, so they read as inset ornaments.
    id: 'bubble-r-pixel-frame',
    label: '像素方框泡',
    cat: 'bubble',
    wm: ['h'],
    defaultWidth: 360,
    defaultHeight: 240,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 0,
      backColor: '#FFFFFF',
      borderColor: '#000000',
      bgi: art('bubble-r-pixel-frame'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r1c3 — dark red oval and nothing else: the cell carries no ornament at
    // all, only the rim and a narrow curved tail hanging just left of centre
    // with a kink on its way back up. Adding an accent here would be inventing.
    //
    // Weight is the whole entry, and it is bracketed from both sides. Matching
    // the reference's measured ink coverage (2.3% of an 97-wide balloon) means
    // 6 units here, which renders at 7.2 real px — far past the `bw: 2` the
    // other tabs use, and unadjustable because this tab draws into `bgi`. But
    // 2.4 units, the first pass, is a third of a pixel at the 62px picker size
    // and dissolves into pale pink, and the rim is the only thing this cell
    // has. 3.4 is the compromise: 4.1 real px, still the visible subject in the
    // thumbnail, no longer a band.
    //
    // The tail tip is at (126,172), 22 units below the rim. The reference's
    // drops 8 card px (16 units) — a blunt hook, not the 40-unit spike the
    // first pass hung off (124,190).
    //
    // Canvas reserve [31, 70, 69, 70]: oval rx=132 / ry=69 about (150, 81); at
    // the column's x=70 and x=230 the rim is at y=27 and y=135, plus half of
    // the now much wider stroke.
    id: 'bubble-r-crimson-oval',
    label: '暗红椭圆泡',
    cat: 'bubble',
    wm: ['h'],
    defaultWidth: 360,
    defaultHeight: 240,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 0,
      backColor: '#FFFFFF',
      borderColor: '#000000',
      bgi: art('bubble-r-crimson-oval'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r2c1 — slanted banner. Hairline black parallelogram leaning right, a
    // mint bar riding above its top edge and offset right, a violet block
    // tucked behind the lower-left corner, and a narrow flag tail dropped off
    // the floor near the right. The floor is restruck at more than twice the
    // weight, which is what gives the cell its ground.
    //
    // The mint bar is a parallelogram, not a rectangle: both ends are cut at
    // the walls' own -0.258 per unit, so it reads as part of the same sheared
    // object. It runs x=100..260 on top and 96..256 underneath — 78% of the
    // 205-wide banner top, ending at 92% of it, which is where the reference
    // stops (79% wide, ending at 89%). A first pass ran it to x=292, past the
    // banner's own top-right corner at 277 and out of the frame, so the bar
    // looked like a separate green stripe laid over the card.
    //
    // Canvas reserve [54, 50, 61, 74]: both walls slope -0.258 per unit down,
    // so the left reserve is taken at the column's *top* (the wall is at x=71
    // there) and the right at its *bottom* (x=254). A reserve averaged over
    // the wall puts the first and last characters through the slope.
    id: 'bubble-r-slant-banner',
    label: '斜切横幅泡',
    cat: 'bubble',
    wm: ['h'],
    defaultWidth: 360,
    defaultHeight: 240,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 0,
      backColor: '#FFFFFF',
      borderColor: '#000000',
      bgi: art('bubble-r-slant-banner'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r2c2 — indigo embossed rectangle. The silhouette is painted twice: once
    // displaced 7 units down-right in flat indigo, once in white over it, so
    // the extrusion shows only on the right and bottom the way the cell does,
    // and the tail gets its extrusion for free.
    //
    // The tail hangs off the floor with its slanted edge on the *left* and its
    // near-vertical one on the right, tip at (231,171) near the base's right
    // end — the reference's tip sits at 81% across its own base. Mirroring it
    // (tip at 213, the first pass) also mirrors where `translate(7,7)` puts the
    // extrusion, and the emboss ends up under the tail instead of beside it.
    //
    // Confetti copies the sheet's own vocabulary — a grey disc slipped behind
    // the left wall, outlined yellow and indigo triangles and diamonds, an
    // indigo capsule, and *two* dot grids produced by a zero-length dash
    // pattern rather than four dozen `<circle>` elements. Two is what the sheet
    // has, and they are its loudest element: one wraps the bottom-left corner,
    // one the top-right. Both are painted before the body, so the frame crops
    // them the way the reference's are cropped; painting them after leaves a
    // dotted rule lying across the balloon's own edge.
    //
    // Every piece is drawn at about 3% of the card width, which is the size the
    // reference uses. At 6% — the first pass — four ornaments read as a second
    // subject competing with the balloon.
    //
    // Canvas reserve [40, 48, 63, 58]: interior x=47..263 / y=32..143, and the
    // tail hangs from y=143 at x=211..233, below the column.
    //
    // Not reachable: the reference scatters confetti across its whole card and
    // over the frame edge. Clipping means each piece is parked in the strip
    // between body and frame instead.
    id: 'bubble-r-blue-emboss',
    label: '蓝影立体泡',
    cat: 'bubble',
    wm: ['h'],
    defaultWidth: 360,
    defaultHeight: 240,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 0,
      backColor: '#FFFFFF',
      borderColor: '#000000',
      bgi: art('bubble-r-blue-emboss'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r2c3 — white cloud with a spike. Eight lobes written as outward-bulging
    // arcs between eight valley points on an ellipse, and the arc that would
    // have closed the upper right replaced by the sheet's sharp flame spike.
    // Radii are 44 (long chords) and 30 (short ones), a bulge of 21 and 17: a
    // first pass used 56/32, and the shallower lobes read as a soft blob
    // instead of a cloud once the drawing was 62px wide.
    //
    // The spike runs valley (218,50) → apex (252,24) → notch (243,70). Its 34
    // units of horizontal reach are 14% of the 245-wide cloud, which is what
    // the reference measures; a first pass threw the apex out to (285,14), 28%
    // of the cloud and hard into the frame's top-right corner, where it stopped
    // reading as a cloud's corner and started reading as an arrow.
    //
    // Five detached arcs echo the rim from outside, which is the only accent
    // the cell carries.
    //
    // Canvas reserve [56, 62, 64, 69]: measured against the *valley* ellipse
    // (rx=104 / ry=62 about (147, 96)), never the lobe crowns. A crown's box
    // says y=13 while the seam beside it dips to y=52; a reserve cut to the
    // box is exactly how the first line ends up crossed by the outline. The
    // right reserve was 75 only because the old oversized spike swept through
    // that corner; with the spike at reference scale the valley ellipse is the
    // binding edge again.
    id: 'bubble-r-cloud-spike',
    label: '尖角云朵泡',
    cat: 'bubble',
    wm: ['h'],
    defaultWidth: 360,
    defaultHeight: 240,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 0,
      backColor: '#FFFFFF',
      borderColor: '#000000',
      bgi: art('bubble-r-cloud-spike'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r3c1 — violet sketch balloon. Rounded rectangle at hairline weight with
    // a second contour drawn 10 units inside the right wall and floor, and the
    // band between the two filled with engraving hatch; that band, not the
    // ticks on their own, is what the cell actually shows. A first pass had
    // fourteen widely spaced ticks and no inner contour, and they read as
    // scratches. The long curved tail sweeps off the lower right and carries
    // its own hatch.
    //
    // The floor comes in two runs — x=103..192 left of the tail mouth and the
    // x=240..264 stub right of it — and both are hatched, eight ticks then two,
    // with the inner contour widened to 107..190 and 240..257 to receive them.
    // Hatching only the middle of the long run (the first pass covered 112..191
    // and left the stub bare) makes the band look like it ran out of ink at the
    // corners. Nothing is drawn across x=192..240: that is the tail's opening,
    // not floor, and ticks there would hang in the mouth.
    //
    // Three speed capsules to the left, each stroked twice (violet, then white
    // at a narrower width) so they read as outlined capsules rather than solid
    // bars, which is how the sheet draws them.
    //
    // Canvas reserve [28, 38, 82, 100]: the left reserve is set by the
    // capsules (they end at x=66), the bottom by the floor hatch (its ticks
    // rise to y=121 across the column), the right by the wall hatch at x=267 —
    // in all three cases by the ornament, not by the wall.
    id: 'bubble-r-sketch-violet',
    label: '紫调速写泡',
    cat: 'bubble',
    wm: ['h'],
    defaultWidth: 360,
    defaultHeight: 240,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 0,
      backColor: '#FFFFFF',
      borderColor: '#000000',
      bgi: art('bubble-r-sketch-violet'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r3c2 — solid matcha balloon with a hooked tail off the lower right. No
    // rim on the mass itself: the dark hairline is the *same* contour drawn
    // again 4 units up and right, so it shows outside the colour along the top
    // and right and vanishes under it along the bottom and left. That
    // misregistration is the cell's whole trick.
    //
    // The tail is a hook, not a skirt: it leaves the mass at (218,144), reaches
    // (182,186) and returns at (150,158), so its mouth is 68 units — 27% of the
    // 254-wide mass, against the reference's 28% — and its tip lands at 72% of
    // the mass width. The first pass ran the mouth to x=123 (37%) and put the
    // tip at x=218, the mass's own right edge, which hung the tail off the side
    // like a flap instead of dropping it from the underside.
    //
    // The frame is 280x240, not 360x240. The reference mass is a circle; on the
    // 3:2 frame the ellipse arrived at 1.56:1 and read as a lozenge. Narrowing
    // the frame squashes the same canvas to 1.15:1 without touching the path,
    // which is the cheaper half of the trade: the drawing stays as traced and
    // only `defaultWidth` moves.
    //
    // Canvas reserve [36, 68, 69, 62]: the displaced outline, not the mass, is
    // the inner boundary on the left and bottom, so those two sides carry the
    // extra 4 units. `p` is [36*1.2, 68*0.9333, 69*1.2, 62*0.9333] — the
    // narrow frame gives the horizontal sides a different multiplier.
    id: 'bubble-r-solid-mint',
    label: '抹茶实心泡',
    cat: 'bubble',
    wm: ['h'],
    defaultWidth: 280,
    defaultHeight: 240,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 0,
      backColor: '#FFFFFF',
      borderColor: '#000000',
      bgi: art('bubble-r-solid-mint'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r3c3 — organic blob with a pale blue rim and a sharp tail struck down to
    // the lower left. One contour carries all three passes, so the rim can
    // never separate from the body: a haze fill, the same contour again in
    // white at 0.95 about (153,98), then the slate hairline. In the reference
    // the pale blue is a band lying *inside* the dark line and nothing bleeds
    // past it; a centred halo stroke — the first pass — puts half its width
    // outside the hairline and turns the whole silhouette fuzzy. Five detached
    // arcs echo it from outside, the same accent the neighbouring cloud uses.
    //
    // The contour is deliberately off-balance the way the cell is: the first
    // cubic is pulled toward its chord so the upper left arrives nearly flat,
    // and the right shoulder is carried down to (282,104) before the bulge, so
    // the widest point sits at y=123 — below the blob's own mid-height of 106.
    // Symmetrised (the first pass had it at y=112) the shape reads as an oval
    // with a spike, which is the one thing this cell is not.
    //
    // Canvas reserve [46, 64, 47, 86]: the inset white leaves the haze about 6
    // units wide across the sides and 4 across the top and bottom, and the tail
    // root at x=74..92 is what pushes the left reserve past the curve's own 79.
    //
    // The bottom is the one side not set by the curve beside the text, but by
    // where the contour actually crosses the text column — y=157 in canvas
    // units, the lowest of the whole tab because this blob's floor sags. An
    // earlier 62 was cut to the silhouette's box instead and threw away a whole
    // line for nothing; this tab's other eleven entries sit within 3 units of
    // their ink, and this one was the outlier.
    id: 'bubble-r-blob-halo',
    label: '蓝晕水滴泡',
    cat: 'bubble',
    wm: ['h'],
    defaultWidth: 360,
    defaultHeight: 240,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 0,
      backColor: '#FFFFFF',
      borderColor: '#000000',
      bgi: art('bubble-r-blob-halo'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r4c1 — dashed note. White rounded rectangle at hairline weight with a
    // blue dashed rule inset 9 units, a flat pale-blue shadow displaced 7 down
    // and right, and a narrow triangular tail dropped from the floor at two
    // thirds across, where the cell puts it. The shadow is the same
    // silhouette, so it echoes the tail too.
    //
    // Canvas reserve [42, 62, 74, 62]: the dashed rule, not the wall, is the
    // inner boundary; the bottom reserve also clears the tail root at y=142.
    id: 'bubble-r-dashed-note',
    label: '虚线便签泡',
    cat: 'bubble',
    wm: ['h'],
    defaultWidth: 360,
    defaultHeight: 240,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 0,
      backColor: '#FFFFFF',
      borderColor: '#000000',
      bgi: art('bubble-r-dashed-note'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r4c2 — 8-bit cloud. One stepped navy contour painted three times: a pale
    // navy copy displaced 8 down-right for the pixel shadow, the navy body,
    // and the same contour again scaled to
    // 0.93 about the centre and stroked with a zero-length dash pattern, which
    // is what produces the sheet's orange dotted ring for the price of one
    // path. Two green leaves and two orange dots sit in the outer corners.
    //
    // Canvas reserve [70, 62, 58, 90]: solved against the dotted *ring*, not
    // the navy wall — the ring is the innermost ink and is 7% closer to the
    // centre everywhere. The left reserve is set by the ring's lower-left
    // staircase, which cuts in to x=85 at the column's bottom corner.
    //
    // This is the only 420x280 frame in the tab. The cloud plus its inset ring
    // leaves the narrowest column here, and at 360x240 a normal sentence
    // needed a fifth line that landed on the floor of the balloon.
    //
    // This entry is also the byte ceiling of the tab: `PIXEL_CLOUD` is written
    // out three times, so every character added to that constant costs three,
    // and the data URI sits at 1578 of the 1600 budget. Anything further has to
    // come out of the leaves and dots, not the staircase.
    id: 'bubble-r-pixel-cloud',
    label: '像素云朵泡',
    cat: 'bubble',
    wm: ['h'],
    defaultWidth: 420,
    defaultHeight: 280,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 0,
      backColor: '#FFFFFF',
      borderColor: '#000000',
      bgi: art('bubble-r-pixel-cloud'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
  {
    // r4c3 — solid gold balloon. No rim at all, the flattest cell on the
    // sheet: one mass, a white gloss arc with its trailing dot on the upper
    // right shoulder, and a single small disc detached off the lower right as
    // the tail.
    //
    // The frame is 280x240, not 360x240, for the same reason as r3c2: the
    // reference mass measures 1.20:1 and the ellipse arrived at 1.56:1 on a 3:2
    // frame. Narrowing the frame lands it at 1.21:1 with the path untouched.
    // The two round ornaments become `<ellipse>` at rx/ry = 1.286 so the squash
    // cancels and they still print as circles.
    //
    // The trailing disc sits at (245,174) with rx=23 — 77% of the mass's own rx
    // out and a full ry down, its radius 18% of rx, both read off the sheet.
    // What matters is the gap: after the frame squash the nearest approach is
    // about 6px, or 2.6% of the mass width, which is the reference's separation
    // to within a tenth of a percent. A disc at (245,176) with r=21 — the first
    // pass — closes that to a hairline and the pair renders as one swollen
    // lump at picker size.
    //
    // Canvas reserve [34, 90, 54, 56]: the right reserve is set by the gloss
    // (it starts at x=216), not by the mass, which would have allowed 236.
    // `p` is [34*1.2, 90*0.9333, 54*1.2, 56*0.9333].
    //
    // Not reachable: the reference disc is cropped by its own card, so its
    // trailing disc is half off-frame. Here it sits whole inside the frame; a
    // clipped copy would just look like a rendering fault.
    id: 'bubble-r-solid-gold',
    label: '暖黄圆泡',
    cat: 'bubble',
    wm: ['h'],
    defaultWidth: 280,
    defaultHeight: 240,
    props: {
      sh: 'rectangle',
      bw: 0,
      fo: 0,
      backColor: '#FFFFFF',
      borderColor: '#000000',
      bgi: art('bubble-r-solid-gold'),
      bgs: 'stretch',
      bgo: 1,
      p: [0, 0, 0, 0],
      wa: null,
    },
  },
] as const satisfies readonly TextBoxPresetDefinition[]
