import type {DeltaInsert, IBlockProps, IBlockSnapshot, ShapeKind, TextBoxBlockProps} from '@ccc/blockcraft'

/** Native, editable sample. Root positions are normalized into the placement plane. */
export function createFloatingLayoutExample(doc: BlockCraft.Doc, rootId: string): IBlockSnapshot {
  const ink = '#233E3A', accent = '#B8563C', sage = '#DCE6DA', paper = '#F4F0E5'
  const asset = new URL('assets/debug/urban-renewal.svg', document.baseURI).href
  const p = (text: string | DeltaInsert[], props: IBlockProps = {}) =>
    doc.schemas.createSnapshot('paragraph', [text, {psa: 10, ...props}])
  const rich = (text: string, size: number, color = ink, bold = false): DeltaInsert[] =>
    [{insert: text, attributes: {'t:px': size, 's:color': color, ...(bold ? {'a:bold': true} : {})}}]
  const box = (text: string | DeltaInsert[], x: number, y: number, width: number, height: number, props: Partial<TextBoxBlockProps> = {}) =>
    doc.schemas.createSnapshot('text-box', [text, {width, height, position: `${x} ${y}`, fill: 'none', outline: 'none', textPadding: '10', ...props}])
  const shape = (kind: ShapeKind, x: number, y: number, width: number, height: number, fill: string, extra: IBlockProps = {}) => {
    const block = doc.schemas.createSnapshot('shape', [kind])
    block.props = {...block.props, width, height, position: `${x} ${y}`, fill, outline: 'none', ...extra}
    return block
  }
  const cover = doc.schemas.createSnapshot('text-box', ['', {width: 330, height: 505, fill: 'none', outline: 'none', textPadding: '34 24'}])
  cover.children = [
    p(rich('FIELD STUDY     /     2026.11', 11, accent, true), {psa: 32}),
    p(rich('让城市', 44, ink, true), {psa: 0}),
    p(rich('重新生长', 44, ink, true), {psa: 24}),
    p(rich('河岸旧厂区 · 公共空间更新提案', 16, ink, true), {psa: 18}),
    p(rich('保留场所的记忆，\n为新的日常留出空间。', 15), {lh: 1.8, psa: 35}),
    p(rich('城市观察工作室\n概念方案  /  第 01 版', 12, '#60746B')),
  ]
  const image = doc.schemas.createSnapshot('image', [{src: asset, wr: 46, ar: 840 / 640, rotation: 357}])
  image.props = {...image.props, position: '350 105'}
  const note = box(rich('保留，而非重建。\n旧墙、新树与慢下来的生活。', 15, ink, true), 495, 345, 220, 110,
    {fill: '#F2D89A', rotation: 5, textPadding: '18', shadow: '90deg 4px 12px #233E3A / 0.12'})
  const stamp = doc.schemas.createSnapshot('object-group', [{width: 150, height: 48}, [
    shape('ellipse', 0, 2, 40, 40, accent),
    box(rich('URBAN\nCOMMONS', 11, ink, true), 47, 0, 100, 48, {textPadding: '2'}),
  ]])
  stamp.props['position'] = '365 440'
  const wordArt = doc.schemas.createSnapshot('word-art', ['RE:COMMONS', {width: 330, height: 50, textFont: '32px 700', textFill: ink, textShadow: 'none', textOutline: 'none'}])
  wordArt.props['position'] = '350 12'
  const floats = [
    shape('rectangle', 0, 0, 760, 500, paper, {placementLayer: 'under'}),
    shape('ellipse', 345, 68, 350, 350, sage, {placementLayer: 'under'}),
    image, wordArt,
    box(rich('01', 28, '#FFFFFF', true), 312, 64, 64, 64, {shape: 'ellipse', fill: accent, textAlignment: 'center middle', textPadding: '0'}),
    note, stamp,
    box(rich('RIVERFRONT  /  RESEARCH & DESIGN', 10, accent, true), 718, 100, 28, 270, {textDirection: 'vertical-rl', textPadding: '4'}),
  ]
  const columns = doc.schemas.createSnapshot('columns', [2])
  columns.props['columnWidths'] = [58, 42]
  ;(columns.children[0] as IBlockSnapshot).children = [
    p(rich('01  从穿行，变为停留', 21, ink, true)),
    p('沿河的旧厂房曾经只承担通行功能。我们希望打开封闭边界，让散步、阅读和邻里活动在同一片树荫下发生。', {lh: 1.8}),
    p('保留原有砖墙和钢架，以轻量的木平台连接高差；可移动的座椅与微型花园让场地随季节、活动和使用者改变。', {lh: 1.8}),
  ]
  ;(columns.children[1] as IBlockSnapshot).children = [
    doc.schemas.createSnapshot('text-box', [rich('3 条更新原则\n\n保留工业记忆\n增加公共停留\n低干预、可持续', 16, ink), {width: 280, height: 215, fill: sage, outline: 'none', textPadding: '22'}]),
  ]
  const section = (text: string) => p(rich(text, 23, ink, true), {psb: 26, psa: 14})
  const diagram = doc.schemas.createSnapshot('object-group', [{width: 720, height: 125}, [
    shape('rectangle', 95, 48, 525, 3, '#B8C8BA', {placementLayer: 'under'}),
    ...['观察场地', '小规模试点', '共同营造'].flatMap((label, index) => [
      shape('ellipse', 65 + index * 250, 24, 48, 48, index === 1 ? accent : ink),
      box(rich(`0${index + 1}`, 18, '#FFFFFF', true), 65 + index * 250, 25, 48, 46, {textAlignment: 'center middle', textPadding: '0'}),
      box(rich(label, 15, ink, true), 25 + index * 250, 78, 130, 40, {textAlignment: 'center top', textPadding: '0'}),
    ]),
  ]])
  const table = doc.schemas.createSnapshot('table', [4, 4, [
    ['阶段', '空间行动', '参与方式', '预期成果'],
    ['01 · 观察', '步行与行为地图', '居民访谈 / 场地记录', '明确公共需求'],
    ['02 · 试点', '临时花园与座椅', '周末共建 / 使用反馈', '验证小尺度改造'],
    ['03 · 生长', '开放庭院与慢行连接', '社区维护 / 季节活动', '形成长期运营'],
  ]])
  table.props['columnSizing'] = 'auto'
  const wrap = p([
    {insert: {image: asset}, attributes: {width: 175, height: 133, wrap: true, side: 'right', x: 0, gap: 18}},
    ...rich('让日常成为设计的尺度。', 17, ink, true),
    {insert: ' 从晨间的一杯咖啡，到傍晚孩子们的游戏，一处好用的公共空间首先应该容纳平凡生活。场地不必一次完成，而是在使用中持续调整。'},
    {insert: ' 本阶段重点记录人们愿意停下的位置、树荫覆盖的时段，以及街区与河岸之间尚未打通的路径。每一个小小的观察，都将成为下一步设计的依据。'},
  ], {lh: 1.8, psa: 24})
  const field = p('', {lh: 1.8, psa: 0})
  field.meta = {...field.meta, plh: '在这里记录你的观察或建议…', plhMode: 'always'}
  const region = doc.schemas.createSnapshot('render-unit', [{}, {
    p: [20, 24], backColor: paper, backOpacity: 1,
  }])
  Object.assign(region.meta, {tplRegion: true})
  region.children = [
    p(rich('我的现场观察', 16, ink, true)),
    p('最想保留的是沿河的老树与砖墙；希望增加能坐下来阅读、聊天的树荫空间。', {lh: 1.8}),
    field,
  ]
  return doc.schemas.createSnapshot('root', [rootId, [
    cover, columns, section('02  一条逐步生长的路径'), diagram, table,
    section('03  现场札记'), wrap,
    section('04  共创记录 · 填写区'), region,
    p(rich('URBAN COMMONS     /     城市观察工作室                              概念提案 · 示例数据', 11, '#60746B'), {psb: 24}),
    doc.schemas.createSnapshot('placement-layout', [floats]),
  ]])
}
