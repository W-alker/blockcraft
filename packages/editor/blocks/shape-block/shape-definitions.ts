import type {ShapeKind} from './shape.types'

export interface ShapeTextInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ShapeDefinition {
  type: ShapeKind
  label: string
  path: string
  /** Optional non-filled construction/detail strokes. */
  detailPath?: string
  textInsets: ShapeTextInsets
  /** Open geometries such as lines and connectors do not paint a fill. */
  fillable?: boolean
  /** Line-like geometries do not own a collaborative text frame. */
  supportsText?: boolean
  /** Compound paths use even-odd filling for holes. */
  fillRule?: 'evenodd'
}

export type ShapeCategoryId =
  | 'rectangles'
  | 'basic-shapes'
  | 'lines'
  | 'block-arrows'
  | 'equation-shapes'
  | 'flowchart'
  | 'stars-banners'
  | 'callouts'

export interface ShapeCategoryDefinition {
  id: ShapeCategoryId
  label: string
  definitions: readonly ShapeDefinition[]
}

const DEFAULT_INSETS: ShapeTextInsets = {
  top: 0.14,
  right: 0.14,
  bottom: 0.14,
  left: 0.14,
}

const NO_TEXT_INSETS: ShapeTextInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

const pointsPath = (
  points: ReadonlyArray<readonly [number, number]>,
): string => points
  .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`)
  .join('') + 'Z'

const regularPolygonPath = (
  sides: number,
  radius = 490,
  rotation = -90,
): string => pointsPath(Array.from({length: sides}, (_, index) => {
  const angle = (rotation + index * 360 / sides) * Math.PI / 180
  return [
    Math.round((500 + Math.cos(angle) * radius) * 100) / 100,
    Math.round((500 + Math.sin(angle) * radius) * 100) / 100,
  ] as const
}))

const starPath = (
  points: number,
  innerRadius = 220,
  outerRadius = 490,
): string => pointsPath(Array.from({length: points * 2}, (_, index) => {
  const radius = index % 2 === 0 ? outerRadius : innerRadius
  const angle = (-90 + index * 180 / points) * Math.PI / 180
  return [
    Math.round((500 + Math.cos(angle) * radius) * 100) / 100,
    Math.round((500 + Math.sin(angle) * radius) * 100) / 100,
  ] as const
}))

const define = (
  type: ShapeKind,
  label: string,
  path: string,
  textInsets: ShapeTextInsets = DEFAULT_INSETS,
  options: Pick<
    ShapeDefinition,
    'detailPath' | 'fillable' | 'supportsText' | 'fillRule'
  > = {},
): ShapeDefinition => ({type, label, path, textInsets, ...options})

const RECTANGLES: readonly ShapeDefinition[] = [
  define('rectangle', '矩形', 'M0 0H1000V1000H0Z'),
  define(
    'rounded-rectangle',
    '圆角矩形',
    'M120 0H880Q1000 0 1000 120V880Q1000 1000 880 1000H120Q0 1000 0 880V120Q0 0 120 0Z',
  ),
  define(
    'single-rounded-rectangle',
    '单圆角矩形',
    'M140 0H1000V1000H0V140Q0 0 140 0Z',
  ),
  define(
    'same-side-rounded-rectangle',
    '同侧圆角矩形',
    'M140 0H1000V1000H140Q0 1000 0 860V140Q0 0 140 0Z',
  ),
  define(
    'snipped-rectangle',
    '剪去单角矩形',
    'M140 0H1000V1000H0V140Z',
  ),
  define(
    'snipped-and-rounded-rectangle',
    '剪去并圆角矩形',
    'M140 0H880Q1000 0 1000 120V1000H0V140Z',
  ),
]

const BASIC_SHAPES: readonly ShapeDefinition[] = [
  define(
    'ellipse',
    '椭圆',
    'M500 0A500 500 0 1 1 499.9 0Z',
    {top: 0.2, right: 0.2, bottom: 0.2, left: 0.2},
  ),
  define(
    'triangle',
    '等腰三角形',
    'M500 0L1000 1000H0Z',
    {top: 0.36, right: 0.2, bottom: 0.12, left: 0.2},
  ),
  define(
    'right-triangle',
    '直角三角形',
    'M0 0V1000H1000Z',
    {top: 0.32, right: 0.18, bottom: 0.12, left: 0.12},
  ),
  define(
    'diamond',
    '菱形',
    'M500 0L1000 500L500 1000L0 500Z',
    {top: 0.25, right: 0.25, bottom: 0.25, left: 0.25},
  ),
  define(
    'parallelogram',
    '平行四边形',
    'M200 0H1000L800 1000H0Z',
    {top: 0.14, right: 0.22, bottom: 0.14, left: 0.22},
  ),
  define(
    'trapezoid',
    '梯形',
    'M200 0H800L1000 1000H0Z',
    {top: 0.14, right: 0.2, bottom: 0.14, left: 0.2},
  ),
  define(
    'hexagon',
    '六边形',
    regularPolygonPath(6),
    {top: 0.14, right: 0.24, bottom: 0.14, left: 0.24},
  ),
  define('heptagon', '七边形', regularPolygonPath(7)),
  define('octagon', '八边形', regularPolygonPath(8)),
  define('decagon', '十边形', regularPolygonPath(10)),
  define('dodecagon', '十二边形', regularPolygonPath(12)),
  define(
    'teardrop',
    '泪滴形',
    'M500 0C760 0 1000 240 1000 500C1000 780 780 1000 500 1000C220 1000 0 780 0 500C0 260 160 80 500 0Z',
    {top: 0.2, right: 0.2, bottom: 0.2, left: 0.2},
  ),
  define(
    'frame',
    '框架',
    'M0 0H1000V1000H0ZM160 160V840H840V160Z',
    {top: 0.22, right: 0.22, bottom: 0.22, left: 0.22},
    {fillRule: 'evenodd'},
  ),
  define(
    'half-frame',
    '半闭框',
    'M0 0H1000V180H180V1000H0ZM340 340V840H840V340Z',
    {top: 0.3, right: 0.22, bottom: 0.22, left: 0.3},
    {fillRule: 'evenodd'},
  ),
  define(
    'corner',
    'L 形',
    'M0 0H260V740H1000V1000H0Z',
    {top: 0.26, right: 0.12, bottom: 0.12, left: 0.26},
  ),
  define(
    'diagonal-stripe',
    '斜纹带',
    'M300 0H520L700 1000H480Z',
    {top: 0.14, right: 0.36, bottom: 0.14, left: 0.36},
  ),
  define(
    'plus',
    '十字形',
    'M340 0H660V340H1000V660H660V1000H340V660H0V340H340Z',
    {top: 0.34, right: 0.34, bottom: 0.34, left: 0.34},
  ),
  define(
    'plaque',
    '铭牌',
    'M120 0H880Q880 120 1000 120V880Q880 880 880 1000H120Q120 880 0 880V120Q120 120 120 0Z',
  ),
  define(
    'can',
    '圆柱体',
    'M0 120C0 40 220 0 500 0S1000 40 1000 120V880C1000 960 780 1000 500 1000S0 960 0 880Z',
    {top: 0.2, right: 0.12, bottom: 0.16, left: 0.12},
    {detailPath: 'M0 120C0 200 220 240 500 240S1000 200 1000 120'},
  ),
  define(
    'cube',
    '立方体',
    'M0 180L240 0H1000V820L760 1000H0Z',
    {top: 0.24, right: 0.26, bottom: 0.14, left: 0.12},
    {detailPath: 'M0 180H760L1000 0M760 180V1000'},
  ),
  define(
    'bevel',
    '棱台',
    'M180 0H820L1000 180V820L820 1000H180L0 820V180ZM180 180V820H820V180Z',
    {top: 0.22, right: 0.22, bottom: 0.22, left: 0.22},
    {fillRule: 'evenodd'},
  ),
  define(
    'donut',
    '圆环',
    'M500 0A500 500 0 1 1 499.9 0ZM500 260A240 240 0 1 0 500.1 260Z',
    {top: 0.3, right: 0.3, bottom: 0.3, left: 0.3},
    {fillRule: 'evenodd'},
  ),
  define(
    'no-symbol',
    '禁止符',
    'M500 0A500 500 0 1 1 499.9 0ZM500 160A340 340 0 0 0 258 739L739 258A338 338 0 0 0 500 160ZM742 261L261 742A340 340 0 0 0 742 261Z',
    {top: 0.3, right: 0.3, bottom: 0.3, left: 0.3},
    {fillRule: 'evenodd'},
  ),
  define(
    'pie',
    '饼形',
    'M500 500V0A500 500 0 1 1 0 500Z',
    {top: 0.2, right: 0.18, bottom: 0.2, left: 0.22},
  ),
  define(
    'folded-corner',
    '折角形',
    'M0 0H760L1000 240V1000H0Z',
    {top: 0.14, right: 0.2, bottom: 0.14, left: 0.14},
    {detailPath: 'M760 0V240H1000'},
  ),
  define(
    'smiley-face',
    '笑脸',
    'M500 0A500 500 0 1 1 499.9 0ZM280 330A55 75 0 1 1 279.9 330ZM720 330A55 75 0 1 1 719.9 330ZM230 600C300 880 700 880 770 600C630 720 370 720 230 600Z',
    {top: 0.26, right: 0.24, bottom: 0.3, left: 0.24},
    {fillRule: 'evenodd'},
  ),
  define(
    'heart',
    '心形',
    'M500 930L100 540C-30 410 10 100 270 80C390 70 470 140 500 230C530 140 610 70 730 80C990 100 1030 410 900 540Z',
    {top: 0.3, right: 0.22, bottom: 0.2, left: 0.22},
  ),
  define(
    'lightning-bolt',
    '闪电',
    'M570 0L150 560H430L330 1000L850 390H560Z',
    {top: 0.2, right: 0.3, bottom: 0.2, left: 0.3},
  ),
  define(
    'sun',
    '太阳',
    starPath(16, 350, 490),
    {top: 0.3, right: 0.3, bottom: 0.3, left: 0.3},
  ),
  define(
    'moon',
    '新月',
    'M690 0C330 80 180 500 360 790C480 980 720 1040 930 930C650 920 450 690 450 430C450 240 540 90 690 0Z',
    {top: 0.24, right: 0.18, bottom: 0.24, left: 0.34},
  ),
  define(
    'cloud',
    '云形',
    'M170 820C10 810-40 620 80 530C20 370 170 230 330 290C390 90 680 50 780 250C960 220 1070 410 970 550C1090 690 970 860 800 830C710 980 490 970 420 840C330 920 220 900 170 820Z',
    {top: 0.24, right: 0.2, bottom: 0.22, left: 0.2},
  ),
]

const LINE_OPTIONS = {fillable: false, supportsText: false} as const

const LINES: readonly ShapeDefinition[] = [
  define('line', '直线', 'M0 500H1000', NO_TEXT_INSETS, LINE_OPTIONS),
  define(
    'line-arrow',
    '箭头直线',
    'M0 500H1000M900 400L1000 500L900 600',
    NO_TEXT_INSETS,
    LINE_OPTIONS,
  ),
  define(
    'line-double-arrow',
    '双箭头直线',
    'M0 500H1000M100 400L0 500L100 600M900 400L1000 500L900 600',
    NO_TEXT_INSETS,
    LINE_OPTIONS,
  ),
  define(
    'elbow-connector',
    '肘形连接符',
    'M0 200H520V800H1000',
    NO_TEXT_INSETS,
    LINE_OPTIONS,
  ),
  define(
    'elbow-arrow-connector',
    '肘形箭头连接符',
    'M0 200H520V800H1000M900 700L1000 800L900 900',
    NO_TEXT_INSETS,
    LINE_OPTIONS,
  ),
  define(
    'curved-connector',
    '曲线连接符',
    'M0 800C260 800 260 200 520 200S740 800 1000 800',
    NO_TEXT_INSETS,
    LINE_OPTIONS,
  ),
  define(
    'curved-arrow-connector',
    '曲线箭头连接符',
    'M0 800C260 800 260 200 520 200S740 800 1000 800M900 700L1000 800L900 900',
    NO_TEXT_INSETS,
    LINE_OPTIONS,
  ),
  define(
    'scribble',
    '自由曲线',
    'M0 620C100 160 220 900 340 420S540 160 620 610S830 900 1000 300',
    NO_TEXT_INSETS,
    LINE_OPTIONS,
  ),
]

const BLOCK_ARROWS: readonly ShapeDefinition[] = [
  define(
    'right-arrow',
    '右箭头',
    'M0 250H620V0L1000 500L620 1000V750H0Z',
    {top: 0.28, right: 0.32, bottom: 0.28, left: 0.1},
  ),
  define(
    'left-arrow',
    '左箭头',
    'M1000 250H380V0L0 500L380 1000V750H1000Z',
    {top: 0.28, right: 0.1, bottom: 0.28, left: 0.32},
  ),
  define(
    'up-arrow',
    '上箭头',
    'M250 1000V380H0L500 0L1000 380H750V1000Z',
    {top: 0.32, right: 0.28, bottom: 0.1, left: 0.28},
  ),
  define(
    'down-arrow',
    '下箭头',
    'M250 0V620H0L500 1000L1000 620H750V0Z',
    {top: 0.1, right: 0.28, bottom: 0.32, left: 0.28},
  ),
  define(
    'left-right-arrow',
    '左右箭头',
    'M0 500L260 0V250H740V0L1000 500L740 1000V750H260V1000Z',
    {top: 0.3, right: 0.28, bottom: 0.3, left: 0.28},
  ),
  define(
    'up-down-arrow',
    '上下箭头',
    'M500 0L1000 260H750V740H1000L500 1000L0 740H250V260H0Z',
    {top: 0.28, right: 0.3, bottom: 0.28, left: 0.3},
  ),
  define(
    'quad-arrow',
    '十字箭头',
    'M500 0L720 220H620V380H780V280L1000 500L780 720V620H620V780H720L500 1000L280 780H380V620H220V720L0 500L220 280V380H380V220H280Z',
    {top: 0.38, right: 0.38, bottom: 0.38, left: 0.38},
  ),
  define(
    'left-right-up-arrow',
    '三向箭头',
    'M500 0L720 220H620V380H780V280L1000 500L780 720V620H220V720L0 500L220 280V380H380V220H280Z',
    {top: 0.38, right: 0.34, bottom: 0.2, left: 0.34},
  ),
  define(
    'bent-arrow',
    '直角箭头',
    'M0 1000V300H620V0L1000 380L620 760V500H250V1000Z',
    {top: 0.32, right: 0.34, bottom: 0.12, left: 0.12},
  ),
  define(
    'u-turn-arrow',
    'U 形箭头',
    'M0 1000V400C0 100 220 0 480 0C740 0 900 150 900 390V520H1000L760 800L520 520H650V400C650 280 580 220 470 220C350 220 250 280 250 410V1000Z',
    {top: 0.3, right: 0.28, bottom: 0.12, left: 0.16},
  ),
  define(
    'left-up-arrow',
    '左上箭头',
    'M0 300L300 0V180H750V620H1000L620 1000L240 620H500V430H300V600Z',
    {top: 0.32, right: 0.2, bottom: 0.34, left: 0.32},
  ),
  define(
    'bent-up-arrow',
    '上弯箭头',
    'M0 1000V650H520V380H300L650 0L1000 380H780V1000Z',
    {top: 0.32, right: 0.24, bottom: 0.14, left: 0.14},
  ),
  define(
    'striped-right-arrow',
    '条纹右箭头',
    'M0 250H100V750H0ZM160 250H280V750H160ZM340 250H620V0L1000 500L620 1000V750H340Z',
    {top: 0.28, right: 0.32, bottom: 0.28, left: 0.38},
  ),
  define(
    'notched-right-arrow',
    '燕尾箭头',
    'M0 0H680L1000 500L680 1000H0L220 500Z',
    {top: 0.14, right: 0.32, bottom: 0.14, left: 0.24},
  ),
  define(
    'chevron',
    'V 形箭头',
    'M0 0H620L1000 500L620 1000H0L380 500Z',
    {top: 0.18, right: 0.34, bottom: 0.18, left: 0.34},
  ),
  define(
    'pentagon-arrow',
    '五边形箭头',
    'M0 0H620L1000 500L620 1000H0Z',
    {top: 0.14, right: 0.32, bottom: 0.14, left: 0.12},
  ),
]

const EQUATION_SHAPES: readonly ShapeDefinition[] = [
  define(
    'math-plus',
    '加号',
    'M380 0H620V380H1000V620H620V1000H380V620H0V380H380Z',
    {top: 0.36, right: 0.36, bottom: 0.36, left: 0.36},
  ),
  define(
    'math-minus',
    '减号',
    'M0 380H1000V620H0Z',
    {top: 0.4, right: 0.12, bottom: 0.4, left: 0.12},
  ),
  define(
    'math-multiply',
    '乘号',
    'M120 0L500 380L880 0L1000 120L620 500L1000 880L880 1000L500 620L120 1000L0 880L380 500L0 120Z',
    {top: 0.34, right: 0.34, bottom: 0.34, left: 0.34},
  ),
  define(
    'math-divide',
    '除号',
    'M0 420H1000V580H0ZM500 80A110 110 0 1 1 499.9 80ZM500 700A110 110 0 1 1 499.9 700Z',
    {top: 0.36, right: 0.12, bottom: 0.36, left: 0.12},
  ),
  define(
    'math-equal',
    '等号',
    'M0 250H1000V410H0ZM0 590H1000V750H0Z',
    {top: 0.3, right: 0.12, bottom: 0.3, left: 0.12},
  ),
  define(
    'math-not-equal',
    '不等号',
    'M0 250H1000V410H0ZM0 590H1000V750H0ZM680 0H850L320 1000H150Z',
    {top: 0.3, right: 0.18, bottom: 0.3, left: 0.18},
  ),
]

const FLOWCHART: readonly ShapeDefinition[] = [
  define('flow-process', '流程：过程', 'M0 0H1000V1000H0Z'),
  define(
    'flow-alternate-process',
    '流程：可选过程',
    'M100 0H900Q1000 0 1000 100V900Q1000 1000 900 1000H100Q0 1000 0 900V100Q0 0 100 0Z',
  ),
  define(
    'flow-decision',
    '流程：决策',
    'M500 0L1000 500L500 1000L0 500Z',
    {top: 0.25, right: 0.25, bottom: 0.25, left: 0.25},
  ),
  define(
    'flow-data',
    '流程：数据',
    'M180 0H1000L820 1000H0Z',
    {top: 0.14, right: 0.22, bottom: 0.14, left: 0.22},
  ),
  define(
    'flow-predefined-process',
    '流程：预定义过程',
    'M0 0H1000V1000H0Z',
    {top: 0.14, right: 0.2, bottom: 0.14, left: 0.2},
    {detailPath: 'M150 0V1000M850 0V1000'},
  ),
  define(
    'flow-internal-storage',
    '流程：内部存储',
    'M0 0H1000V1000H0Z',
    {top: 0.24, right: 0.14, bottom: 0.14, left: 0.2},
    {detailPath: 'M150 0V1000M0 170H1000'},
  ),
  define(
    'flow-document',
    '流程：文档',
    'M0 0H1000V800C760 650 250 980 0 800Z',
    {top: 0.14, right: 0.14, bottom: 0.24, left: 0.14},
  ),
  define(
    'flow-multi-document',
    '流程：多文档',
    'M120 0H1000V720C760 570 380 850 120 720Z',
    {top: 0.18, right: 0.18, bottom: 0.3, left: 0.18},
    {
      detailPath:
        'M60 80V820C310 950 690 670 940 820M0 160V900C250 1030 630 750 880 900',
    },
  ),
  define(
    'flow-terminator',
    '流程：终止',
    'M250 0H750A500 500 0 0 1 750 1000H250A500 500 0 0 1 250 0Z',
    {top: 0.2, right: 0.24, bottom: 0.2, left: 0.24},
  ),
  define(
    'flow-preparation',
    '流程：准备',
    'M220 0H780L1000 500L780 1000H220L0 500Z',
    {top: 0.14, right: 0.24, bottom: 0.14, left: 0.24},
  ),
  define(
    'flow-manual-input',
    '流程：手动输入',
    'M0 180L1000 0V1000H0Z',
    {top: 0.22, right: 0.14, bottom: 0.14, left: 0.14},
  ),
  define(
    'flow-manual-operation',
    '流程：手动操作',
    'M0 0H1000L800 1000H200Z',
    {top: 0.14, right: 0.2, bottom: 0.18, left: 0.2},
  ),
  define(
    'flow-connector',
    '流程：连接符',
    'M500 0A500 500 0 1 1 499.9 0Z',
    {top: 0.22, right: 0.22, bottom: 0.22, left: 0.22},
  ),
  define(
    'flow-offpage-connector',
    '流程：离页连接符',
    'M0 0H1000V700L500 1000L0 700Z',
    {top: 0.14, right: 0.14, bottom: 0.28, left: 0.14},
  ),
  define(
    'flow-delay',
    '流程：延迟',
    'M0 0H500A500 500 0 0 1 500 1000H0Z',
    {top: 0.18, right: 0.26, bottom: 0.18, left: 0.14},
  ),
  define(
    'flow-display',
    '流程：显示',
    'M180 0H720Q1000 0 1000 500T720 1000H180L0 500Z',
    {top: 0.16, right: 0.24, bottom: 0.16, left: 0.22},
  ),
]

const STARS_AND_BANNERS: readonly ShapeDefinition[] = [
  define('star-4', '四角星', starPath(4, 150)),
  define(
    'star',
    '五角星',
    starPath(5, 210),
    {top: 0.3, right: 0.25, bottom: 0.28, left: 0.25},
  ),
  define('star-6', '六角星', starPath(6, 240)),
  define('star-7', '七角星', starPath(7, 245)),
  define('star-8', '八角星', starPath(8, 260)),
  define('star-10', '十角星', starPath(10, 290)),
  define('star-12', '十二角星', starPath(12, 310)),
  define('star-16', '十六角星', starPath(16, 330)),
  define('star-24', '二十四角星', starPath(24, 350)),
  define('explosion', '爆炸形', starPath(12, 210, 500)),
  define(
    'ribbon',
    '上凸弯带',
    'M0 180L220 250V80C400 0 600 0 780 80V250L1000 180L880 500L1000 820L780 750V920C600 1000 400 1000 220 920V750L0 820L120 500Z',
    {top: 0.24, right: 0.24, bottom: 0.24, left: 0.24},
  ),
  define(
    'ribbon-2',
    '下凸弯带',
    'M0 80L220 150V320C400 240 600 240 780 320V150L1000 80L880 400L1000 720L780 650V820C600 1000 400 1000 220 820V650L0 720L120 400Z',
    {top: 0.24, right: 0.24, bottom: 0.24, left: 0.24},
  ),
  define(
    'wave',
    '波形',
    'M0 180C250 0 750 360 1000 180V820C750 1000 250 640 0 820Z',
    {top: 0.24, right: 0.12, bottom: 0.24, left: 0.12},
  ),
  define(
    'double-wave',
    '双波形',
    'M0 160C250 0 750 320 1000 160V360C750 520 250 200 0 360ZM0 640C250 480 750 800 1000 640V840C750 1000 250 680 0 840Z',
    {top: 0.38, right: 0.12, bottom: 0.38, left: 0.12},
  ),
]

const CALLOUTS: readonly ShapeDefinition[] = [
  define(
    'speech-bubble',
    '矩形对话气泡',
    'M0 0H1000V760H360L130 1000L190 760H0Z',
    {top: 0.12, right: 0.14, bottom: 0.28, left: 0.14},
  ),
  define(
    'rounded-speech-bubble',
    '圆角对话气泡',
    'M120 0H880Q1000 0 1000 120V640Q1000 760 880 760H360L130 1000L190 760H120Q0 760 0 640V120Q0 0 120 0Z',
    {top: 0.14, right: 0.16, bottom: 0.3, left: 0.16},
  ),
  define(
    'cloud-callout',
    '云形标注',
    'M170 650C10 640-40 450 80 360C20 200 170 60 330 120C390-80 680-120 780 80C960 50 1070 240 970 380C1090 520 970 690 800 660C710 810 490 800 420 670C330 750 220 730 170 650ZM250 760A55 55 0 1 1 249.9 760ZM120 900A35 35 0 1 1 119.9 900Z',
    {top: 0.18, right: 0.2, bottom: 0.34, left: 0.2},
  ),
  define(
    'wedge-rect-callout',
    '楔形矩形标注',
    'M0 0H1000V760H430L160 1000L260 760H0Z',
    {top: 0.12, right: 0.14, bottom: 0.28, left: 0.14},
  ),
  define(
    'wedge-round-callout',
    '楔形圆角标注',
    'M120 0H880Q1000 0 1000 120V640Q1000 760 880 760H430L160 1000L260 760H120Q0 760 0 640V120Q0 0 120 0Z',
    {top: 0.14, right: 0.16, bottom: 0.3, left: 0.16},
  ),
  define(
    'wedge-ellipse-callout',
    '楔形椭圆标注',
    'M500 0C780 0 1000 170 1000 380S780 760 500 760C420 760 350 750 290 730L120 1000L220 690C80 620 0 510 0 380C0 170 220 0 500 0Z',
    {top: 0.2, right: 0.2, bottom: 0.32, left: 0.2},
  ),
]

export const SHAPE_CATEGORIES: readonly ShapeCategoryDefinition[] = [
  {id: 'rectangles', label: '矩形', definitions: RECTANGLES},
  {id: 'basic-shapes', label: '基本形状', definitions: BASIC_SHAPES},
  {id: 'lines', label: '线条', definitions: LINES},
  {id: 'block-arrows', label: '箭头总汇', definitions: BLOCK_ARROWS},
  {id: 'equation-shapes', label: '公式形状', definitions: EQUATION_SHAPES},
  {id: 'flowchart', label: '流程图', definitions: FLOWCHART},
  {id: 'stars-banners', label: '星与旗帜', definitions: STARS_AND_BANNERS},
  {id: 'callouts', label: '标注', definitions: CALLOUTS},
] as const

export const SHAPE_DEFINITIONS: readonly ShapeDefinition[] =
  SHAPE_CATEGORIES.flatMap(category => category.definitions)

const DEFINITIONS_BY_TYPE = new Map(
  SHAPE_DEFINITIONS.map(definition => [definition.type, definition]),
)

export function getShapeDefinition(type: ShapeKind): ShapeDefinition {
  return DEFINITIONS_BY_TYPE.get(type) ?? SHAPE_DEFINITIONS[0]
}
