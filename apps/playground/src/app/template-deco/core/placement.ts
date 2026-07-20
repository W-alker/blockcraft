import { BlockCraftDoc, IBlockSnapshot } from '@ccc/blockcraft'
import type { ActiveDecoService } from './active-deco.service'

/**
 * 装饰的「排版域」：三态模式（独占 / 环绕 / 悬浮）的定义、坐标系、迁移编排，全模块唯一一份。
 *
 * 为什么在 core/ 而不是 decos/_shared/：这文件直接操作 doc.crud（transact/moveBlocks/insertBlocks）、
 * 懒建并查找 layout 容器，是**文档级编排**，和定义容器的 layout.block.ts 强耦合、又被 palette/surfaces
 * 跨目录消费——decos/_shared/ 只放"装饰组件自己的可复用行为"（free-drag / page-size / image-pick）。
 *
 * 数据编码：`float`（无=独占、left/right=环绕并定侧）+ `x/y`（有=悬浮，且此时块在 layout 容器里）。
 * 迁移 = move（跨 root↔layout）+ 改属性，**打进一个 Yjs 事务 = 一步撤销**。
 * layout 是钉在 root 末尾的零高度覆盖层（见 layout.block.ts）——坐标系与物料在 root 里时一致，迁移不改 x/y。
 * 数据不变量：**悬浮物料都住 layout children、layout 恒为 root 末子**——载入时快照级归位
 * （normalizeTemplateSnapshots 治旧 bug 持久化下来的坏数据）、批量删除时物料全部归位 layout 并再钉一次底
 * （guardDecoDeletion v4），稳态树 = 「正文…, layout[物料…]」，整文档操作只需过滤末尾一个 layout 节点。
 * 本模块只碰公开面（crud/getBlockById/updateProps/chain），不直接动 Yjs。
 */

export type PlacementMode = 'block' | 'float' | 'absolute'   // 独占 / 环绕 / 悬浮
export const LAYOUT_FLAVOUR = 'template-layout'

/**
 * 可排版装饰的排版属性契约（组件基类 PlaceableDecoBase 与各物料 Model 共同遵守）。
 * ⚠️ x 是「悬浮」的判别位（有 x ⇒ absolute），独占/环绕**不得**复用 x；
 * y 不参与判别，按模式换义：悬浮 = 离内容顶 px，独占 = 上边距 px（与上文的间距）。
 * z（层级/衬底）**只属于悬浮域**：独占/环绕在流内不与正文重叠，层级无意义、负 z 反而让全宽的
 * 段落盒盖住物料（看得见点不中）——所以渲染层流内不吃 z（PlaceableDecoBase.hostZ），回流时清除。
 * align 只在独占模式生效——独占的水平位置语义是「对齐」，要自由坐标就该切悬浮。
 * mb/ml/mr = 下/左/右边距（独占 + 环绕两模式共用）：**mb 是 px，ml/mr 是列宽百分比**——
 * 垂直间距是绝对量、水平间距随列宽缩放（页面宽度变了比例不变）。
 * 独占模式左右只在「对齐锚定的那一侧」生效（左对齐吃 ml、右对齐吃 mr、居中两侧都是 auto）——
 * 另一侧的 margin 是 auto 用来吃剩余空间，这是 CSS 块级盒对齐的物理约束，面板据此禁用不生效的输入框；
 * 环绕模式 float 盒不参与 auto 对齐，四向全生效（默认值 = 绕排预设，见 PlaceableDecoBase.hostMargin）。
 * ⚠️ 用 type 而非 interface：物料 Model 以 `PlaceableProps & { 自有字段 }` 交叉进 props，而框架
 * IBlockProps 带 `[key: string]` 索引签名——TS 只给**匿名对象类型**隐式索引签名，interface 参与的
 * 交叉会在赋给 IBlockProps 时报"缺 index signature"（改回 interface = 所有物料 Model 集体编译炸）。
 */
export type PlaceableProps = {
  width?: number
  x?: number
  y?: number
  z?: number
  /** 旋转角度°——**悬浮域专属**（同 z）：流内的绕排/推挤按未旋转盒计算，转了语义就破，回流一并清除。 */
  deg?: number
  float?: 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  mb?: number
  ml?: number
  mr?: number
}

/** 是不是「可排版的装饰物料」（template-* 且不是 layout 容器本身）——面板选中过滤用。 */
export const isPlaceableDeco = (flavour?: string): boolean =>
  typeof flavour === 'string' && flavour.startsWith('template-') && flavour !== LAYOUT_FLAVOUR

// ───── 坐标系（悬浮定位的唯一定义；free-drag 与面板迁移共用，勿再各算各的） ─────

/**
 * 定位父盒：原点 = offsetParent 的 padding 盒左上（clientLeft/Top = 边框宽），宽 = client 宽（px→% 的分母）。
 * 故意**不含高**：悬浮的落点不做任何范围限制（悬浮 = 脱流自由摆放，见 free-drag.ts 文件头），
 * 盒子只回答「坐标怎么换算」，不回答「能放到哪」。
 */
export interface PlacementBox {
  cb: HTMLElement
  originX: number
  originY: number
  width: number
}

/** 解析元素的定位父盒。absolute 的 left/top/% 就以它为基准（CSS containing block 语义）。 */
export function resolvePlacementBox(el: HTMLElement): PlacementBox | null {
  const cb = (el.offsetParent as HTMLElement | null) ?? el.parentElement
  if (!cb) return null
  const r = cb.getBoundingClientRect()
  return { cb, originX: r.left + cb.clientLeft, originY: r.top + cb.clientTop, width: cb.clientWidth }
}

/** px → 占定位父宽的 %（1 位小数）。悬浮 x 专用——不 clamp（宽度的 [2,100] clamp 属于 page-size 域）。 */
export function pxToPlacementPct(px: number, baseWidth: number): number {
  return Math.round((px / (baseWidth || 1)) * 1000) / 10
}

/** 量元素当前视觉位置 → 定位父坐标系的 {x%, y px}。就地浮起（面板切悬浮）用。 */
export function measurePlacementXY(el: HTMLElement): { xPct: number; yPx: number } {
  const box = resolvePlacementBox(el)
  if (!box) return { xPct: 0, yPx: 0 }
  const r = el.getBoundingClientRect()
  return { xPct: pxToPlacementPct(r.left - box.originX, box.width), yPx: Math.round(r.top - box.originY) }
}

// ───── 迁移编排（root ↔ layout） ─────

/** placement 需要的最小块面（logo/weather 都满足；childrenIds 给 layout 容器、textLength 给空段落判断当查询面用）。 */
export interface PlaceableBlock {
  id: string
  flavour?: string
  parentId: string | null
  props?: PlaceableProps
  hostElement: HTMLElement
  getIndexOfParent(): number
  childrenLength: number
  childrenIds: string[]
  textLength?: number
  updateProps(p: { x?: number | null; y?: number | null; z?: number | null; deg?: number | null; float?: 'left' | 'right' | null }): void
}

const asBlock = (doc: BlockCraftDoc, id: string): PlaceableBlock | null => {
  try { return doc.getBlockById(id) as unknown as PlaceableBlock } catch { return null }
}

/** 纯函数：从 props 判当前模式（x 有=悬浮 > float 有=环绕 > 独占）。面板回显用。 */
export function placementModeFromProps(props?: { x?: number | null; float?: 'left' | 'right' | null }): PlacementMode {
  if (props?.x != null) return 'absolute'
  if (props?.float === 'left' || props?.float === 'right') return 'float'
  return 'block'
}

const isInLayout = (doc: BlockCraftDoc, block: PlaceableBlock): boolean =>
  !!block.parentId && asBlock(doc, block.parentId)?.flavour === LAYOUT_FLAVOUR

/** 找悬浮层容器 id（不建）。「layout 在哪」的唯一查询点——别再各处自己 find。 */
const findLayoutId = (doc: BlockCraftDoc): string | null =>
  doc.root.childrenIds.find(id => asBlock(doc, id)?.flavour === LAYOUT_FLAVOUR) ?? null

/**
 * 悬浮层内的全部物料（树序）。容器级功能（如衬底物料的边缘拾取）经此查询，
 * 不自己翻 layout 结构——「layout 长什么样、在哪」是排版域知识，只在本文件维护。
 */
export function listLayoutDecos(doc: BlockCraftDoc): PlaceableBlock[] {
  const layoutId = findLayoutId(doc)
  const layout = layoutId ? asBlock(doc, layoutId) : null
  return layout ? layout.childrenIds.map(id => asBlock(doc, id)).filter((b): b is PlaceableBlock => !!b) : []
}

/** 找到或懒建悬浮层容器（钉为 root 末子），返回其 id。 */
function ensureLayout(doc: BlockCraftDoc): string {
  const existing = findLayoutId(doc)
  if (existing) return existing
  const snap = doc.schemas.createSnapshot(LAYOUT_FLAVOUR, [])
  doc.crud.insertBlocks(doc.rootId, doc.root.childrenLength, [snap])
  return snap.id
}

/**
 * 载入前的快照级数据自愈（纯数组/对象操作，不产生事务、不进撤销栈——比开 doc 后再搬块干净）。
 * 数据不变量：**悬浮物料（有 x）全部住 layout children；layout 恒为最后一个节点**。
 * 旧版本 bug 持久化下来的坏形态（段落排在 layout 之后、悬浮物料流浪在 root、无 x 的流内物料
 * 误存进 layout）每次刷新都会被 TemplateStore 原样灌回来——在这里一次性矫正。
 * 没有 layout 节点时原样返回（悬浮迁移路径必建 layout，无 layout 的文档不会有合法悬浮物料）。
 */
export function normalizeTemplateSnapshots(children: IBlockSnapshot[]): IBlockSnapshot[] {
  const layouts = children.filter(c => c.flavour === LAYOUT_FLAVOUR)
  if (!layouts.length) return children
  const isFloating = (c: IBlockSnapshot): boolean =>
    isPlaceableDeco(c.flavour) && (c.props as PlaceableProps | undefined)?.x != null
  const flow: IBlockSnapshot[] = []
  const floating: IBlockSnapshot[] = []
  for (const c of children) {
    if (c.flavour === LAYOUT_FLAVOUR) continue
    ;(isFloating(c) ? floating : flow).push(c)
  }
  // layout 是块容器，children 必为块快照数组——IBlockSnapshot 联合按 nodeType 判别，
  // 按 flavour 找出来的节点 TS 收窄不了，显式断言（运行时由 schema includeChildren 保证）
  for (const l of layouts) for (const c of (l.children ?? []) as IBlockSnapshot[]) (isFloating(c) ? floating : flow).push(c)
  return [...flow, { ...layouts[0], children: floating } as IBlockSnapshot]
}

/**
 * 用一份快照 children 整体替换 doc root 的内容（编辑「恢复」/ 使用页「载入」共用的同一条业务规则）：
 * 先过 normalizeTemplateSnapshots 做快照级自愈（悬浮物料归位 layout、layout 钉底），空则不动；
 * 否则清掉现有 root children 再整体插入。两处调用只差数据来源（store payload / @Input snapshot），不再各抄一遍。
 */
export function replaceRootChildren(doc: BlockCraftDoc, rawChildren: IBlockSnapshot['children'] | null | undefined): void {
  const children = normalizeTemplateSnapshots((rawChildren ?? []) as IBlockSnapshot[])
  if (!children.length) return
  const count = doc.root.childrenLength
  if (count > 0) doc.crud.deleteBlocks(doc.rootId, 0, count, true)
  doc.crud.insertBlocks(doc.rootId, 0, children)
}

/**
 * 「物料保全卫兵」（双层）。威胁模型：**批量删除会连坐模板物料**——
 * 全选（Ctrl+A 上卷到 root）会把选区端点落在 root 最后一个子块上（正是钉底的 layout），随后的删除
 * 连坐整个悬浮层；即使端点被吸走、或文档里根本没有 layout，全选删除也会把流内的环绕/独占物料
 * 连同正文一起清掉。语义立场：物料是模板的骨架装饰，**批量删除 = 清正文**；
 * 物料的删除必须是点名操作（点选后用面板右上角的删除按钮，或单选该块后删除）。两层防线：
 *
 * ① 选区吸附（尽力而为）：端点落到 layout 就吸到它前面的最后一个内容块。管住视觉和大多数路径,
 *    但**不做安全承诺**——真实键盘流程里 DOM 选区归一化可能把端点弹回 layout（块间边界位置本就贴着
 *    layout 宿主），所以还需要第二层。回调整体 try/catch：订阅死了卫兵就没了，任何边界抛错都不许外泄。
 * ② 删除拦截（确定性保障）：容器捕获阶段监听 Backspace/Delete，两种情况接管：
 *    a. 选区任一端点在 layout 上（连坐悬浮层的直接威胁；layout 是 root 末子，任何包含它的范围必然
 *       以它为端点，所以只查端点就够）；
 *    b. 选区是**全选形状**——顶层跨度盖满全部非 layout 内容、两端都是极端点（起点在块首/终点在块尾
 *       或整块选中），且跨度里有 template-* 需要保（没有就放行框架，行为与原生一致）。
 *    接管（v4，对齐设计文档 §2/§6「物料与正文分家」）＝**物料归位，不是逐一跳过**：
 *    跨度内的流内物料就地量视觉坐标转悬浮、全部迁入 layout children（位置定格不动），
 *    正文块按 id 全删，同事务把 layout 钉回 root 末尾（老坏数据顺路自愈）、在 layout 前补一个
 *    空段落并落光标——一个事务 = 一步撤销。删除后的稳态树永远是「[空段落, layout[全部物料]]」，
 *    此后任何整文档操作只需过滤末尾的 layout 一个节点。跨度本身仍按选区两端算（不依赖钉底，
 *    坏数据下也漏不掉排在 layout 之后的段落）。stopPropagation/preventDefault 让框架的
 *    全选快速通道（input/index._deleteAllSelected）拿不到这次按键。
 *    正常编辑（单光标退格、段内/跨段局部选区）两个条件都不满足，直接放行框架。
 *    （编辑中的独占/环绕物料仍住正文流：float/块盒必须与文字同流才有绕排/推挤效果，这是 CSS 物理
 *    约束——Word 的环绕图同样锚在段落里；「分家」由 template-* 前缀 + 本卫兵 + 载入自愈共同保证。）
 *
 * 已知边界（威胁模型外，用户撞到再扩）：全选后**直接打字覆盖 / 剪切 / 粘贴替换**不走
 * Backspace/Delete keydown，仍会连坐；非全选形状的跨块拖选夹着的物料也随框架删除。
 *
 * 编辑 / 使用两个 surface 建 doc 后都挂 `guardDecoDeletion(doc, containerEl)`、destroy 时调返回的
 * unsubscribe（成对，监听 + 订阅一起摘）——使用页同样可编辑（用户填正文），物料保全契约一致。
 */
export function guardDecoDeletion(doc: BlockCraftDoc, containerEl: HTMLElement, activeDeco?: ActiveDecoService): { unsubscribe(): void } {
  type SelPoint = { blockId?: string; type?: string; offset?: number }
  const selectionJson = (): { anchor?: SelPoint; head?: SelPoint } | null => {
    const sel = doc.selection.value as { toJSON(): unknown } | null
    return sel ? sel.toJSON() as { anchor?: SelPoint; head?: SelPoint } : null
  }
  const onLayout = (layoutId: string, p?: { blockId?: string }): boolean => !!p && p.blockId === layoutId
  /** 块 id → 它所在顶层块在 root 里的下标（选区端点可能落在嵌套子块上，一路爬到 root 直子级）。 */
  const topIndexOf = (blockId?: string): number => {
    if (!blockId) return -1
    let b = asBlock(doc, blockId)
    while (b && b.parentId && b.parentId !== doc.rootId) b = asBlock(doc, b.parentId)
    return b ? doc.root.childrenIds.indexOf(b.id) : -1
  }

  // ── ① 选区吸附 ──
  const sub = doc.selection.changeObserve().subscribe((sel: { toJSON(): unknown } | null) => {
    try {
      if (!sel) return
      const layoutId = findLayoutId(doc)
      if (!layoutId) return
      const j = sel.toJSON() as { anchor?: { blockId?: string }; head?: { blockId?: string } } | null
      if (!onLayout(layoutId, j?.anchor) && !onLayout(layoutId, j?.head)) return
      const ids = doc.root.childrenIds
      const idx = ids.indexOf(layoutId)
      const prev = idx > 0 ? asBlock(doc, ids[idx - 1]) : null
      if (!prev) return                                  // 只剩 layout 没有正文：没得吸附，保持原状
      const prevPoint = doc.isEditable(doc.getBlockById(prev.id))
        ? { blockId: prev.id, type: 'text', offset: prev.textLength ?? 0 }   // 可编辑 → 文本末尾点
        : { blockId: prev.id, type: 'selected' }                              // void 物料 → 整块选中点
      doc.selection.setSelection(
        (onLayout(layoutId, j?.anchor) ? prevPoint : j!.anchor) as never,
        (onLayout(layoutId, j?.head) ? prevPoint : j!.head) as never,
      )
    } catch { /* 吸附是尽力而为；抛错不许杀死订阅（第二层还在兜底） */ }
  })

  // ── ② 删除拦截 ──
  /** 保留判定：物料 + layout 一把过滤（用户契约：批量删除永远不碰 template-*，不管它们排在文档哪里）。 */
  const isSpared = (f?: string): boolean => isPlaceableDeco(f) || f === LAYOUT_FLAVOUR
  const onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Backspace' && ev.key !== 'Delete') return
    if (doc.isReadonly) return
    const j = selectionJson()
    // 单独选中的悬浮物料 → 键盘删除（面板删除按钮的键盘等价入口）。悬浮物料绕开框架选区，
    // 选中时框架 selection 为空（PlaceableEditBase 选中时已 blur）——正是靠「选区空 + 有 activeDeco」
    // 与全选删除天然互斥：全选一定造出非空 selection，永远落不进这里，物料保护分毫不动。
    // 只认悬浮（有 x）：独占/环绕仍住正文流、框架 BlockSelection 本就能键盘删（见下方单块整选放行）。
    if (!j) {
      const activeId = activeDeco?.active$.value ?? null
      const active = activeId ? asBlock(doc, activeId) : null
      if (active && isPlaceableDeco(active.flavour) && active.props?.x != null) {
        ev.preventDefault()
        ev.stopPropagation()
        doc.crud.deleteBlockById(active.id)
        activeDeco?.set(null)
      }
      return
    }
    const ids = doc.root.childrenIds
    const layoutId = findLayoutId(doc)
    const aTop = topIndexOf(j.anchor?.blockId)
    const hTop = topIndexOf(j.head?.blockId)
    // 清除跨度 [lo, hi] = 选区两端点所在顶层块——跨度不依赖 layout 钉底：老坏数据里内容可能
    // 排在 layout 之后（旧版本 bug 经 TemplateStore 持久化），按选区算就漏不掉末尾段落
    let lo: number
    let hi: number
    if (!!layoutId && (onLayout(layoutId, j.anchor) || onLayout(layoutId, j.head))) {
      // a. 端点在 layout（吸附被 DOM 归一化弹回时的兜底）：另一端缺失/解析不到就取文档头
      const at = aTop >= 0 ? aTop : 0
      const ht = hTop >= 0 ? hTop : 0
      lo = Math.min(at, ht)
      hi = Math.max(at, ht)
    } else {
      // b. 全选形状才接管：顶层跨度盖满全部非 layout 内容 + 两端都是极端点 + 跨度里有 template-* 要保；
      //    有一条不满足就放行框架——单光标退格、局部选区等正常编辑绝不能被这堵墙误伤。
      if (aTop < 0 || hTop < 0) return
      // 单块整选（type:'selected' 且两端同块）= 点名删除，放行框架——即使全文档只有这一个物料
      if (aTop === hTop && j.anchor?.type === 'selected' && j.head?.type === 'selected') return
      lo = Math.min(aTop, hTop)
      hi = Math.max(aTop, hTop)
      const flavourAt = (i: number): string | undefined => asBlock(doc, ids[i])?.flavour
      let firstContent = 0
      while (firstContent < ids.length && flavourAt(firstContent) === LAYOUT_FLAVOUR) firstContent++
      let lastContent = ids.length - 1
      while (lastContent >= 0 && flavourAt(lastContent) === LAYOUT_FLAVOUR) lastContent--
      if (lastContent < 0 || lo > firstContent || hi < lastContent) return
      const startP = aTop <= hTop ? j.anchor : j.head           // 文档序上靠前的端点须在块首、靠后的须在块尾
      const endP = aTop <= hTop ? j.head : j.anchor
      if (startP?.type === 'text' && (startP.offset ?? 0) > 0) return
      const endBlock = endP?.blockId ? asBlock(doc, endP.blockId) : null
      if (endP?.type === 'text' && endBlock && (endP.offset ?? 0) < (endBlock.textLength ?? 0)) return
      if (!ids.slice(lo, hi + 1).some(id => isSpared(asBlock(doc, id)?.flavour))) return
    }
    ev.preventDefault()
    ev.stopPropagation()
    // 先清选区再动树（对齐框架 _deleteAllSelected 的顺序）：否则框架延迟的选区重算(setTimer)
    // 会拿着已删块的旧引用去 getBlockById → "Block not found" 噪音
    try { (doc.selection as unknown as { blur?: () => void }).blur?.() } catch { /* 清不掉也不阻塞删除 */ }
    // 跨度快照与流内物料的视觉坐标都在动树**之前**取：迁移/删除会引发重排，事后再量就飘了
    // （与 applyPlacement 切悬浮"就地量、再迁移"同一时序纪律）
    const span = ids.slice(lo, hi + 1).map(id => ({ id, block: asBlock(doc, id) }))
    const toLayout = span
      .filter(s => s.block && isPlaceableDeco(s.block.flavour))
      .map(s => ({ block: s.block!, pos: measurePlacementXY(s.block!.hostElement) }))
    // layout 事务外找齐/懒建：其组件在建它的事务结束时才创建，move 的目标必须已就绪（同 commitAbsolute；
    // 懒建与下面的主事务落在 undo 的 captureTimeout 合并窗内，仍是一步撤销）
    const homeId = layoutId ?? ensureLayout(doc)
    const p = doc.schemas.createSnapshot('paragraph', [''])
    doc.crud.transact(() => {
      // ① 物料归位：流内物料全部迁入 layout、按刚量好的坐标转悬浮（位置定格）——不是"逐一跳过留在原地"
      for (const { block, pos } of toLayout) {
        moveInto(doc, block, homeId)
        block.updateProps({ x: pos.xPct, y: pos.yPx, float: null })
      }
      // ② 清正文：跨度内除 layout / 已归位物料外全删（按 id 删，无下标失效问题）
      for (const s of span) {
        const f = s.block?.flavour
        if (!s.block || f === LAYOUT_FLAVOUR || isPlaceableDeco(f)) continue
        doc.crud.deleteBlockById(s.id)
      }
      // ③ 钉底自愈：layout 恒为 root 末子（同父 move 先删后插，目标下标取删除后的 length-1）
      const rest = doc.root.childrenIds
      const lIdx = rest.indexOf(homeId)
      if (lIdx >= 0 && lIdx !== rest.length - 1) doc.crud.moveBlocks(doc.rootId, lIdx, 1, doc.rootId, rest.length - 1)
      // ④ 在 layout 之前补空段落：光标落点，正文从这里重新长
      const insertAt = Math.min(lo, Math.max(0, doc.root.childrenIds.indexOf(homeId)))
      doc.crud.insertBlocks(doc.rootId, insertAt, [p])
    })
    try { doc.selection.setCursorAtBlock(doc.getBlockById(p.id), true) } catch { /* 渲染时序边界：不落光标也不炸 */ }
  }
  containerEl.addEventListener('keydown', onKeydown, true)   // 捕获：先于框架 UIEventDispatcher

  return {
    unsubscribe(): void {
      sub.unsubscribe()
      containerEl.removeEventListener('keydown', onKeydown, true)
    },
  }
}

/** 把块移进layout children 末尾容器末尾（跨父）。 */
function moveInto(doc: BlockCraftDoc, block: PlaceableBlock, targetId: string): void {
  const target = asBlock(doc, targetId)
  if (!target) return
  doc.crud.moveBlocks(block.parentId!, block.getIndexOfParent(), 1, targetId, target.childrenLength)
}

/** 空段落（回车留下的待输入行）。物料回流落点要跳过它们，见 moveToRootBeforeLayout。 */
const isEmptyParagraph = (doc: BlockCraftDoc, id: string): boolean => {
  const b = asBlock(doc, id)
  return b?.flavour === 'paragraph' && b.textLength === 0
}

/**
 * 把块从 layout 移回 root 内容区（layout 之前），保持 layout 钉底。
 * 落点跳过尾部的空段落：文档尾常年挂着回车留下的空行，物料"回到正文末尾"应落在**内容**末尾、
 * 空行之上——否则视觉上像"切独占凭空多了一个空行在物料上方"（空行其实一直在，只是被压到了物料前面）。
 */
function moveToRootBeforeLayout(doc: BlockCraftDoc, block: PlaceableBlock): void {
  const ids = doc.root.childrenIds
  const layoutIdx = ids.findIndex(id => asBlock(doc, id)?.flavour === LAYOUT_FLAVOUR)
  let toIndex = layoutIdx >= 0 ? layoutIdx : doc.root.childrenLength
  while (toIndex > 0 && isEmptyParagraph(doc, ids[toIndex - 1])) toIndex--
  doc.crud.moveBlocks(block.parentId!, block.getIndexOfParent(), 1, doc.rootId, toIndex)
}

/**
 * 落光标的前置：物料后面紧跟段落 → 返回它；物料是最后一个内容块（后面只剩 layout/什么都没有）→
 * 补一个空段返回；后面是**非段落的实体内容**（分栏/表格等）→ 返回 null——别为了落光标硬塞空段把人家内容拆开。
 */
function ensureParagraphAfter(doc: BlockCraftDoc, blockId: string): string | null {
  const ids = doc.root.childrenIds
  const idx = ids.indexOf(blockId)
  if (idx < 0) return null
  const next = idx + 1 < ids.length ? asBlock(doc, ids[idx + 1]) : null
  if (next?.flavour === 'paragraph') return next.id
  if (next && next.flavour !== LAYOUT_FLAVOUR) return null
  const p = doc.schemas.createSnapshot('paragraph', [''])
  doc.crud.insertBlocks(doc.rootId, idx + 1, [p])
  return p.id
}

/**
 * 悬浮回流的锚点：按物料当前视觉 top（视口坐标），在 root 顶层块里找「第一个垂直中点在它之下」的块，
 * 返回插入下标；找不到（物料悬在全部内容之下）返回 -1，调用方走"末尾"回退。
 * 中点规则：y 越过了某块的下半场就锚给下一块——对高块（分栏/表格）尤其直觉：**不进入,只挨着放**
 * （进分栏是二期：宽度参照系 + 悬浮坐标参照系两笔债没还，见团队讨论）。只扫到 layout 为止（它钉底）。
 */
function anchorIndexByY(doc: BlockCraftDoc, topY: number): number {
  const ids = doc.root.childrenIds
  for (let i = 0; i < ids.length; i++) {
    const b = asBlock(doc, ids[i])
    if (!b || b.flavour === LAYOUT_FLAVOUR) break
    const r = b.hostElement.getBoundingClientRect()
    if (topY < r.top + r.height / 2) return i
  }
  return -1
}

/** 从悬浮的当前位置推环绕侧：物料水平中心（x、width 都是列宽%）落在右半 → 右浮。拖到哪边就绕哪边。 */
const sideFromPosition = (block: PlaceableBlock): 'left' | 'right' =>
  (block.props?.x ?? 0) + (block.props?.width ?? 0) / 2 > 50 ? 'right' : 'left'

/**
 * 切换物料排版模式（面板调）：
 * - block(独占)/float(环绕)：回流进 root——**从悬浮回来时按当前视觉位置锚定**（拖到哪就回到哪：
 *   顶边 y 找锚点块插它前面，见 anchorIndexByY；环绕侧没显式指定就按 x 选边，见 sideFromPosition；
 *   物料悬在全部内容之下则退化为"末尾、尾随空行之上"）。独占↔环绕互切（本就在流内）不挪位置。
 * - absolute(悬浮)：就地量 x/y、移进 layout、写 x/y、清 float。
 * 回流后把光标落到物料**下一段的开头**：环绕的文字从那里开始绕、独占的续写也在那里——
 * 不落的话选区还停在切换前的旧位置，用户接着输入 / 唤起「/」命令会写到物料上方去。
 */
export function applyPlacement(doc: BlockCraftDoc, blockId: string, mode: PlacementMode, side?: 'left' | 'right'): void {
  const block = asBlock(doc, blockId)
  if (!block) return
  const inLayout = isInLayout(doc, block)

  if (mode === 'absolute') {
    if (inLayout) return                                // 已悬浮，无需迁移
    const pos = measurePlacementXY(block.hostElement)   // 就地量当前视觉 x/y（趁还在流里）
    const layoutId = ensureLayout(doc)                  //  必须在迁移事务外先建 layout：其组件在本事务结束时同步创建，
    doc.crud.transact(() => {                           //    否则 move 目标 vm.get 找不到 → 静默不动
      moveInto(doc, block, layoutId)
      block.updateProps({ x: pos.xPct, y: pos.yPx, float: null })
    })
    return                                              // 悬浮脱流，不动光标（选区留在原正文位置是合理的）
  }

  // 环绕侧优先级：面板显式点的 > 从悬浮位置推的（拖到右半绕右侧）> 原侧 > 左
  const nextFloat = mode === 'float' ? (side ?? (inLayout ? sideFromPosition(block) : undefined) ?? currentSide(block) ?? 'left') : null
  // 锚点在迁移前量（此刻还悬浮着，rect 就是用户拖放的位置）；-1 = 无锚，走末尾回退
  const anchorIdx = inLayout ? anchorIndexByY(doc, block.hostElement.getBoundingClientRect().top) : -1
  let cursorTo: string | null = null
  doc.crud.transact(() => {
    if (inLayout) {
      if (anchorIdx >= 0) doc.crud.moveBlocks(block.parentId!, block.getIndexOfParent(), 1, doc.rootId, anchorIdx)
      else moveToRootBeforeLayout(doc, block)
    }
    block.updateProps({ float: nextFloat, x: null, y: null, z: null, deg: null })   // 回流内：清悬浮域属性 x/y/z/deg；float 决定独占/环绕
    cursorTo = ensureParagraphAfter(doc, blockId)                        // 补段与迁移同事务 = 一步撤销
  })
  if (cursorTo) {
    try { doc.selection.setCursorAtBlock(doc.getBlockById(cursorTo), true) } catch { /* 组件未渲染等边界：不落光标也不炸 */ }
  }
}

/** free-drag 落点提交：给定拖出来的 x/y，移进 layout（若不在）+ 写 x/y+清 float，一步撤销。 */
export function commitAbsolute(doc: BlockCraftDoc, blockId: string, xPct: number, yPx: number): void {
  const block = asBlock(doc, blockId)
  if (!block) return
  const layoutId = isInLayout(doc, block) ? null : ensureLayout(doc)     // 建 layout 放事务外（同上：保证目标组件已就绪）
  doc.crud.transact(() => {
    if (layoutId) moveInto(doc, block, layoutId)
    block.updateProps({ x: xPct, y: yPx, float: null })
  })
}

const currentSide = (block: PlaceableBlock): 'left' | 'right' | undefined =>
  block.props?.float === 'right' ? 'right' : block.props?.float === 'left' ? 'left' : undefined

// ───── 页面空白点击（两个 surface 共用；layout 钉底是排版域知识，收在这） ─────

/**
 * 点编辑器空白处 → 光标落到「最后一段正文」（layout 之前）；没有就在 layout 之前补一个空段落并落光标。
 * 新段落必须插在 layout **之前**：layout 钉底才能保证无 z 悬浮物默认画在正文之上（同层 z-auto 按树序绘制）。
 */
export function handleContainerBlankMousedown(doc: BlockCraftDoc, evt: MouseEvent): void {
  if (evt.target !== evt.currentTarget) return
  evt.preventDefault()
  const ids = doc.root.childrenIds
  const layoutIdx = ids.findIndex(id => doc.getBlockById(id).flavour === LAYOUT_FLAVOUR)
  const insertAt = layoutIdx >= 0 ? layoutIdx : ids.length
  const lastContent = insertAt > 0 ? doc.getBlockById(ids[insertAt - 1]) : null
  if (lastContent?.flavour === 'paragraph') {
    doc.selection.setCursorAtBlock(lastContent, false)
    return
  }
  const p = doc.schemas.createSnapshot('paragraph', [''])
  void doc.chain()
    .insertSnapshots(doc.rootId, insertAt, [p])
    .setCursorAtBlock(p.id, true)
    .run()
}
